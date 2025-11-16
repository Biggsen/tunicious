const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

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
  cors: true,
  secrets: [spotifyClientId, spotifyClientSecret],
}, async (req, res) => {
  try {
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
    logger.error("Token exchange error", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Refresh access token using refresh token
 */
exports.refreshToken = onRequest({
  cors: true,
  secrets: [spotifyClientId, spotifyClientSecret],
}, async (req, res) => {
  try {
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

    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
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
    logger.error("Token refresh error", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Proxy for Spotify API calls
 */
exports.apiProxy = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {endpoint, method = "GET", data, accessToken} = req.body;

    if (!endpoint || !accessToken) {
      res.status(400).json({error: "Missing required parameters"});
      return;
    }

    // Validate endpoint to prevent abuse
    if (!endpoint.startsWith("/")) {
      res.status(400).json({error: "Invalid endpoint format"});
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
    logger.error("Spotify API proxy error", error);
    res.status(500).json({error: "Internal server error"});
  }
});
