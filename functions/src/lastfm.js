const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {verifyAuthToken} = require("./auth");
const {corsConfig} = require("./cors");
const {getRateLimitIdentifier, rateLimit} = require("./rateLimit");

// Rate limit: 1000 requests per hour per user for Last.fm
const LASTFM_RATE_LIMIT = 1000;
const LASTFM_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const {
  validateRequestSize,
  validateLastFmApiProxy,
} = require("./validate");
const {handleError} = require("./errorHandler");

// Last.fm API configuration
const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";

// One set of secret names per project; dev and prod projects each set their own values
const lastfmApiKey = defineSecret("LASTFM_API_KEY");
const lastfmApiSecret = defineSecret("LASTFM_API_SECRET");

/**
 * Proxy for Last.fm API calls
 */
exports.apiProxy = onRequest({
  cors: corsConfig,
  secrets: [lastfmApiKey, lastfmApiSecret],
}, async (req, res) => {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(req);
    
    // Apply rate limiting
    const identifier = `lastfm:${getRateLimitIdentifier(req, authResult)}`;
    const rateLimitResult = await rateLimit(req, identifier, LASTFM_RATE_LIMIT, LASTFM_RATE_WINDOW_MS);
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter,
        resetAt: new Date(rateLimitResult.resetAt).toISOString(),
      });
      return;
    }
    
    // Validate request size
    const sizeError = validateRequestSize(req);
    if (sizeError) {
      res.status(sizeError.status).json({error: sizeError.error});
      return;
    }
    
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    // Validate and sanitize input
    const validationResult = validateLastFmApiProxy(req.body);
    if (validationResult.error) {
      res.status(validationResult.status).json({error: validationResult.error});
      return;
    }
    
    const {method, params} = validationResult.sanitized;

    const apiKey = lastfmApiKey.value();
    const apiSecret = lastfmApiSecret.value();

    logger.info("Last.fm API call", {
      method,
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "none",
      hasApiSecret: !!apiSecret,
      paramsKeys: Object.keys(params),
    });

    if (!apiKey) {
      logger.error("Missing Last.fm API key");
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
        logger.error("Missing Last.fm API secret for authenticated method");
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
    handleError(res, error, "lastfmApiProxy");
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
