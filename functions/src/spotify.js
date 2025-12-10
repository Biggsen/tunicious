const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {verifyAuthToken} = require("./auth");
const {corsConfig} = require("./cors");
const {isEndpointAllowed} = require("./spotifyEndpoints");
const {rateLimit, getRateLimitIdentifier} = require("./rateLimit");

// Define secrets
const spotifyClientId = defineSecret("SPOTIFY_CLIENT_ID");
const spotifyClientSecret = defineSecret("SPOTIFY_CLIENT_SECRET");

// Spotify API endpoints
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/**
 * Exchange authorization code for access token
 */
exports.tokenExchange = onRequest({
  cors: corsConfig,
  secrets: [spotifyClientId, spotifyClientSecret],
}, async (req, res) => {
  try {
    // Verify authentication
    await verifyAuthToken(req);
    
    // Rate limiting: 10 requests/hour per IP
    const identifier = getRateLimitIdentifier(req);
    const rateLimitResult = await rateLimit(req, identifier, 10, 3600000); // 10/hour
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: retryAfter,
        resetAt: new Date(rateLimitResult.resetAt).toISOString(),
      });
      return;
    }
    
    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {code, redirectUri} = req.body;

    if (!code || !redirectUri) {
      res.status(400).json({error: "Missing required parameters"});
      return;
    }

    // Get credentials from secrets
    const clientId = spotifyClientId.value();
    const clientSecret = spotifyClientSecret.value();

    if (!clientId || !clientSecret) {
      logger.error("Missing Spotify credentials in environment");
      res.status(500).json({error: "Server configuration error"});
      return;
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      logger.error("Spotify token exchange failed", {status: tokenResponse.status, error: errorData});
      res.status(400).json({error: "Failed to exchange code for tokens"});
      return;
    }

    const tokenData = await tokenResponse.json();
    
    // Return only the necessary data (no client secret exposure)
    res.json({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
    });
  } catch (error) {
    // If it's an authentication error, return 401
    if (error.message && (error.message.includes("Unauthorized") || error.message.includes("authentication"))) {
      logger.warn("Token exchange authentication error", {error: error.message});
      res.status(401).json({error: error.message});
      return;
    }
    logger.error("Token exchange error", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Refresh access token using refresh token
 */
exports.refreshToken = onRequest({
  cors: corsConfig,
  secrets: [spotifyClientId, spotifyClientSecret],
}, async (req, res) => {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(req);
    
    // Rate limiting: 100 requests/hour per user
    const identifier = getRateLimitIdentifier(req, authResult);
    const rateLimitResult = await rateLimit(req, identifier, 100, 3600000); // 100/hour
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: retryAfter,
        resetAt: new Date(rateLimitResult.resetAt).toISOString(),
      });
      return;
    }
    
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {refreshToken} = req.body;

    if (!refreshToken) {
      res.status(400).json({error: "Missing refresh token"});
      return;
    }

    const clientId = spotifyClientId.value();
    const clientSecret = spotifyClientSecret.value();

    if (!clientId || !clientSecret) {
      logger.error("Missing Spotify credentials in environment");
      res.status(500).json({error: "Server configuration error"});
      return;
    }

    // Log request details for debugging (without exposing secrets)
    logger.info("Refreshing token", {
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken ? refreshToken.length : 0,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });

    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      logger.error("Spotify token refresh failed", {status: tokenResponse.status, error: errorData});
      
      // Provide more specific error messages based on the response
      let errorMessage = "Failed to refresh token";
      if (tokenResponse.status === 400) {
        errorMessage = "Refresh token expired or invalid - please reconnect your Spotify account";
      } else if (tokenResponse.status === 401) {
        errorMessage = "Invalid client credentials";
      }
      
      res.status(400).json({error: errorMessage});
      return;
    }

    const tokenData = await tokenResponse.json();
    
    res.json({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token, // Spotify may optionally return a new refresh token
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
    });
  } catch (error) {
    // If it's an authentication error, return 401
    if (error.message && (error.message.includes("Unauthorized") || error.message.includes("authentication"))) {
      logger.warn("Token refresh authentication error", {error: error.message});
      res.status(401).json({error: error.message});
      return;
    }
    logger.error("Token refresh error", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Proxy for Spotify API calls
 */
exports.apiProxy = onRequest({cors: corsConfig}, async (req, res) => {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(req);
    
    // Rate limiting: 1000 requests/hour per user
    const identifier = getRateLimitIdentifier(req, authResult);
    const rateLimitResult = await rateLimit(req, identifier, 1000, 3600000); // 1000/hour
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: retryAfter,
        resetAt: new Date(rateLimitResult.resetAt).toISOString(),
      });
      return;
    }
    
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {endpoint, method = "GET", data, accessToken} = req.body;

    if (!endpoint || !accessToken) {
      res.status(400).json({error: "Missing required parameters"});
      return;
    }

    // Validate endpoint format
    if (!endpoint.startsWith("/")) {
      res.status(400).json({error: "Invalid endpoint format"});
      return;
    }

    // Validate endpoint against whitelist to prevent abuse
    if (!isEndpointAllowed(endpoint)) {
      logger.warn("Blocked unauthorized endpoint", {endpoint, method});
      res.status(403).json({error: "Endpoint not allowed"});
      return;
    }

    const url = `${SPOTIFY_API_BASE}${endpoint}`;
    
    const response = await fetch(url, {
      method: method,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const responseData = await response.json();

    if (!response.ok) {
      logger.error("Spotify API call failed", {status: response.status, endpoint, error: responseData});
      res.status(response.status).json(responseData);
      return;
    }

    res.json(responseData);
  } catch (error) {
    // If it's an authentication error, return 401
    if (error.message && (error.message.includes("Unauthorized") || error.message.includes("authentication"))) {
      logger.warn("Spotify API proxy authentication error", {error: error.message});
      res.status(401).json({error: error.message});
      return;
    }
    logger.error("Spotify API proxy error", error);
    res.status(500).json({error: "Internal server error"});
  }
});
