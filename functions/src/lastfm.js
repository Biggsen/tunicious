const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {verifyAuthToken} = require("./auth");
const {corsConfig} = require("./cors");

// Last.fm API configuration
const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";

// Define secrets for Last.fm API (both DEV and PROD)
const lastfmApiKeyProd = defineSecret("LASTFM_API_KEY_PROD");
const lastfmApiSecretProd = defineSecret("LASTFM_API_SECRET_PROD");
const lastfmApiKeyDev = defineSecret("LASTFM_API_KEY_DEV");
const lastfmApiSecretDev = defineSecret("LASTFM_API_SECRET_DEV");

/**
 * Determine if request is from development environment
 */
function isDevelopmentRequest(req) {
  const origin = req.headers.origin || req.headers.referer || "";
  return origin.includes("localhost") || origin.includes("127.0.0.1");
}

/**
 * Proxy for Last.fm API calls
 */
exports.apiProxy = onRequest({
  cors: corsConfig,
  secrets: [lastfmApiKeyProd, lastfmApiSecretProd, lastfmApiKeyDev, lastfmApiSecretDev],
}, async (req, res) => {
  try {
    // Verify authentication
    await verifyAuthToken(req);
    
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {method, params = {}} = req.body;

    if (!method) {
      res.status(400).json({error: "Missing method parameter"});
      return;
    }

    // Determine environment and get appropriate credentials
    const isDev = isDevelopmentRequest(req);
    const apiKey = isDev ? lastfmApiKeyDev.value() : lastfmApiKeyProd.value();
    const apiSecret = isDev ? lastfmApiSecretDev.value() : lastfmApiSecretProd.value();
    
    logger.info("Last.fm API call", {
      method,
      environment: isDev ? "DEV" : "PROD",
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "none",
      hasApiSecret: !!apiSecret,
      paramsKeys: Object.keys(params),
    });

    if (!apiKey) {
      logger.error(`Missing Last.fm API key in ${isDev ? "DEV" : "PROD"} environment`);
      res.status(500).json({error: "Server configuration error"});
      return;
    }

    // Determine if this is an authenticated method that requires POST
    const authenticatedMethods = ["track.love", "track.unlove", "track.scrobble", "auth.getSession"];
    const isAuthenticatedMethod = authenticatedMethods.includes(method);

    let responseData;

    if (isAuthenticatedMethod) {
      // For authenticated methods, use POST with form data
      if (!apiSecret) {
        logger.error(`Missing Last.fm API secret for authenticated method in ${isDev ? "DEV" : "PROD"} environment`);
        res.status(500).json({error: "Server configuration error"});
        return;
      }

      // Special handling for auth.getSession - it uses 'token' parameter, not 'session_key'
      if (method !== "auth.getSession") {
        if (!params.session_key) {
          res.status(400).json({error: "Session key required for authenticated methods"});
          return;
        }
      } else {
        // For auth.getSession, token parameter is required
        if (!params.token) {
          res.status(400).json({error: "Token required for auth.getSession"});
          return;
        }
      }

      // Convert session_key to sk for signature generation (but keep token as-is for auth.getSession)
      const signatureParams = { api_key: apiKey, ...params };
      if (method === "auth.getSession") {
        // For auth.getSession, token stays as 'token' in the signature
        // No conversion needed
      } else if (signatureParams.session_key) {
        signatureParams.sk = signatureParams.session_key;
        delete signatureParams.session_key;
      }

      // Build form data for POST request using the converted parameters
      const formData = new URLSearchParams({
        method: method,
        api_key: apiKey,
        format: "json",
        ...signatureParams,
      });

      // Add signature for authenticated methods
      // Note: format and api_sig should NOT be included in signature generation
      // But api_key SHOULD be included in signature generation
      const signature = generateLastFmSignature(method, signatureParams, apiSecret);
      formData.append("api_sig", signature);

      // Log debugging info for track.love
      if (method === "track.love") {
        logger.info("Track.love request", {
          method: method,
          params: params,
          url: LASTFM_API_URL,
          formData: formData.toString(),
        });
      }

      const response = await fetch(LASTFM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AudioFoodie/1.0",
        },
        body: formData.toString(),
      });

      responseData = await response.json();
      
      // Log debugging info for track.love
      if (method === "track.love") {
        logger.info("Track.love response", {
          status: response.status,
          data: responseData,
        });
      }
      
      // Log debugging info for auth.getSession
      if (method === "auth.getSession") {
        logger.info("Auth.getSession request", {
          method: method,
          params: params,
          formData: formData.toString(),
        });
        logger.info("Auth.getSession response", {
          status: response.status,
          data: responseData,
        });
      }
    } else {
      // For read-only methods, use GET with query parameters
      const queryParams = new URLSearchParams({
        method: method,
        api_key: apiKey,
        format: "json",
        ...params,
      });

      const url = `${LASTFM_API_URL}?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "AudioFoodie/1.0",
        },
      });

      responseData = await response.json();
    }

    // Check for Last.fm API errors
    if (responseData.error) {
      logger.error("Last.fm API error", {method, error: responseData});
      res.status(400).json(responseData);
      return;
    }

    res.json(responseData);
  } catch (error) {
    // If it's an authentication error, return 401
    if (error.message && (error.message.includes("Unauthorized") || error.message.includes("authentication"))) {
      logger.warn("Last.fm API proxy authentication error", {error: error.message});
      res.status(401).json({error: error.message});
      return;
    }
    logger.error("Last.fm API proxy error", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Generate Last.fm API signature for authenticated requests
 */
function generateLastFmSignature(method, params, secret) {
  const crypto = require("crypto");
  
  // Create signature string - include method and all params
  const signatureParams = {
    method: method,
    ...params,
  };
  
  // Sort parameters alphabetically and concatenate
  const sortedParams = Object.keys(signatureParams)
    .sort()
    .map(key => `${key}${signatureParams[key]}`)
    .join("");
  
  // Append secret and generate MD5 hash
  const signatureString = sortedParams + secret;
  
  // Log the signature string for debugging (without secret)
  console.log("Signature string (without secret):", sortedParams);
  console.log("Full signature string length:", signatureString.length);
  
  const signature = crypto.createHash("md5").update(signatureString).digest("hex");
  console.log("Generated signature:", signature);
  
  return signature;
}
