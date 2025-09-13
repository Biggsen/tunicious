const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// Define environment-specific secrets
const lastfmApiKeyDev = defineSecret("LASTFM_API_KEY_DEV");
const lastfmApiKeyProd = defineSecret("LASTFM_API_KEY_PROD");
const lastfmApiSecretDev = defineSecret("LASTFM_API_SECRET_DEV");
const lastfmApiSecretProd = defineSecret("LASTFM_API_SECRET_PROD");

// Last.fm API configuration
const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";

/**
 * Proxy for Last.fm API calls
 */
exports.apiProxy = onRequest({
  cors: true,
  secrets: [lastfmApiKeyDev, lastfmApiKeyProd, lastfmApiSecretDev, lastfmApiSecretProd],
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {method, params = {}} = req.body;

    if (!method) {
      res.status(400).json({error: "Missing method parameter"});
      return;
    }

    // Use environment-specific secrets
    const isProd = process.env.NODE_ENV === "production";
    const apiKey = isProd ? lastfmApiKeyProd.value() : lastfmApiKeyDev.value();
    const apiSecret = isProd ? lastfmApiSecretProd.value() : lastfmApiSecretDev.value();

    if (!apiKey) {
      logger.error("Missing Last.fm API key in environment");
      res.status(500).json({error: "Server configuration error"});
      return;
    }

    // Build query parameters
    const queryParams = new URLSearchParams({
      method: method,
      api_key: apiKey,
      format: "json",
      ...params,
    });

    // Add signature for authenticated methods if secret is available
    if (apiSecret && params.session_key) {
      const signature = generateLastFmSignature(method, params, apiSecret);
      queryParams.append("api_sig", signature);
    }

    const url = `${LASTFM_API_URL}?${queryParams.toString()}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "AudioFoodie/1.0",
      },
    });

    const responseData = await response.json();

    if (!response.ok) {
      logger.error("Last.fm API call failed", {status: response.status, method, error: responseData});
      res.status(response.status).json(responseData);
      return;
    }

    // Check for Last.fm API errors
    if (responseData.error) {
      logger.error("Last.fm API error", {method, error: responseData});
      res.status(400).json(responseData);
      return;
    }

    res.json(responseData);
  } catch (error) {
    logger.error("Last.fm API proxy error", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Generate Last.fm API signature for authenticated requests
 */
function generateLastFmSignature(method, params, secret) {
  const crypto = require("crypto");
  
  // Create signature string
  const signatureParams = {
    method: method,
    ...params,
  };
  
  // Sort parameters alphabetically
  const sortedParams = Object.keys(signatureParams)
    .sort()
    .map(key => `${key}${signatureParams[key]}`)
    .join("");
  
  const signatureString = sortedParams + secret;
  
  // Generate MD5 hash
  return crypto.createHash("md5").update(signatureString).digest("hex");
}
