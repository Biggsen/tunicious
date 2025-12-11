const logger = require("firebase-functions/logger");

/**
 * Maximum request body size (1MB)
 */
const MAX_REQUEST_SIZE = 1024 * 1024;

/**
 * Maximum string length for various fields
 */
const MAX_LENGTHS = {
  endpoint: 500,
  method: 20,
  code: 500,
  redirectUri: 500,
  refreshToken: 500,
  accessToken: 500,
  lastFmMethod: 100,
  lastFmSessionKey: 500,
  lastFmToken: 500,
};

/**
 * Validate request size
 * @param {Object} req - Express request object
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
function validateRequestSize(req) {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  
  if (contentLength > MAX_REQUEST_SIZE) {
    return {
      status: 413,
      error: "Request too large",
    };
  }
  
  return null;
}

/**
 * Sanitize string input
 * @param {string} input - Input string to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeString(input, maxLength) {
  if (typeof input !== "string") {
    return "";
  }
  
  // Trim whitespace
  let sanitized = input.trim();
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");
  
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Validate endpoint format
 * @param {string} endpoint - Endpoint to validate
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
function validateEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "string") {
    return {
      status: 400,
      error: "Invalid endpoint: must be a non-empty string",
    };
  }
  
  const sanitized = sanitizeString(endpoint, MAX_LENGTHS.endpoint);
  
  if (sanitized !== endpoint) {
    logger.warn("Endpoint sanitized", {original: endpoint, sanitized});
  }
  
  if (!sanitized.startsWith("/")) {
    return {
      status: 400,
      error: "Invalid endpoint format: must start with /",
    };
  }
  
  // Check for path traversal attempts
  if (sanitized.includes("..") || sanitized.includes("//")) {
    return {
      status: 400,
      error: "Invalid endpoint format",
    };
  }
  
  return null;
}

/**
 * Validate HTTP method
 * @param {string} method - HTTP method to validate
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
function validateMethod(method) {
  const allowedMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
  
  if (!method || typeof method !== "string") {
    return {
      status: 400,
      error: "Invalid method: must be a non-empty string",
    };
  }
  
  const sanitized = sanitizeString(method.toUpperCase(), MAX_LENGTHS.method);
  
  if (!allowedMethods.includes(sanitized)) {
    return {
      status: 400,
      error: `Invalid method: must be one of ${allowedMethods.join(", ")}`,
    };
  }
  
  return null;
}

/**
 * Validate Spotify token exchange request
 * @param {Object} body - Request body
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
function validateTokenExchange(body) {
  if (!body || typeof body !== "object") {
    return {
      status: 400,
      error: "Invalid request body",
    };
  }
  
  const {code, redirectUri} = body;
  
  if (!code || typeof code !== "string") {
    return {
      status: 400,
      error: "Missing or invalid code parameter",
    };
  }
  
  if (!redirectUri || typeof redirectUri !== "string") {
    return {
      status: 400,
      error: "Missing or invalid redirectUri parameter",
    };
  }
  
  const sanitizedCode = sanitizeString(code, MAX_LENGTHS.code);
  const sanitizedRedirectUri = sanitizeString(redirectUri, MAX_LENGTHS.redirectUri);
  
  // Validate redirectUri is a valid URL
  try {
    const url = new URL(sanitizedRedirectUri);
    if (!["http:", "https:"].includes(url.protocol)) {
      return {
        status: 400,
        error: "Invalid redirectUri: must use http or https",
      };
    }
  } catch (error) {
    return {
      status: 400,
      error: "Invalid redirectUri format",
    };
  }
  
  // Return sanitized values
  return {
    sanitized: {
      code: sanitizedCode,
      redirectUri: sanitizedRedirectUri,
    },
  };
}

/**
 * Validate Spotify token refresh request
 * @param {Object} body - Request body
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
function validateTokenRefresh(body) {
  if (!body || typeof body !== "object") {
    return {
      status: 400,
      error: "Invalid request body",
    };
  }
  
  const {refreshToken} = body;
  
  if (!refreshToken || typeof refreshToken !== "string") {
    return {
      status: 400,
      error: "Missing or invalid refreshToken parameter",
    };
  }
  
  const sanitized = sanitizeString(refreshToken, MAX_LENGTHS.refreshToken);
  
  return {
    sanitized: {
      refreshToken: sanitized,
    },
  };
}

/**
 * Validate Spotify API proxy request
 * @param {Object} body - Request body
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
function validateSpotifyApiProxy(body) {
  if (!body || typeof body !== "object") {
    return {
      status: 400,
      error: "Invalid request body",
    };
  }
  
  const {endpoint, method = "GET", accessToken} = body;
  
  // Validate endpoint
  const endpointError = validateEndpoint(endpoint);
  if (endpointError) {
    return endpointError;
  }
  
  // Validate method
  const methodError = validateMethod(method);
  if (methodError) {
    return methodError;
  }
  
  // Validate accessToken
  if (!accessToken || typeof accessToken !== "string") {
    return {
      status: 400,
      error: "Missing or invalid accessToken parameter",
    };
  }
  
  const sanitizedEndpoint = sanitizeString(endpoint, MAX_LENGTHS.endpoint);
  const sanitizedMethod = sanitizeString(method.toUpperCase(), MAX_LENGTHS.method);
  const sanitizedAccessToken = sanitizeString(accessToken, MAX_LENGTHS.accessToken);
  
  // Validate data if present (must be valid JSON)
  let sanitizedData = null;
  if (body.data !== undefined) {
    if (typeof body.data === "string") {
      try {
        sanitizedData = JSON.parse(body.data);
      } catch (error) {
        return {
          status: 400,
          error: "Invalid data parameter: must be valid JSON",
        };
      }
    } else if (typeof body.data === "object") {
      sanitizedData = body.data;
    } else {
      return {
        status: 400,
        error: "Invalid data parameter: must be object or JSON string",
      };
    }
  }
  
  return {
    sanitized: {
      endpoint: sanitizedEndpoint,
      method: sanitizedMethod,
      accessToken: sanitizedAccessToken,
      data: sanitizedData,
    },
  };
}

/**
 * Validate Last.fm API proxy request
 * @param {Object} body - Request body
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
function validateLastFmApiProxy(body) {
  if (!body || typeof body !== "object") {
    return {
      status: 400,
      error: "Invalid request body",
    };
  }
  
  const {method, params = {}} = body;
  
  if (!method || typeof method !== "string") {
    return {
      status: 400,
      error: "Missing or invalid method parameter",
    };
  }
  
  const sanitizedMethod = sanitizeString(method, MAX_LENGTHS.lastFmMethod);
  
  // Validate params is an object
  if (params !== null && typeof params !== "object") {
    return {
      status: 400,
      error: "Invalid params parameter: must be an object",
    };
  }
  
  // Sanitize params values (keys are typically Last.fm API parameter names)
  const sanitizedParams = {};
  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        // Special handling for session_key and token
        if (key === "session_key") {
          sanitizedParams[key] = sanitizeString(value, MAX_LENGTHS.lastFmSessionKey);
        } else if (key === "token") {
          sanitizedParams[key] = sanitizeString(value, MAX_LENGTHS.lastFmToken);
        } else {
          // Generic string sanitization (max 200 chars for other params)
          sanitizedParams[key] = sanitizeString(value, 200);
        }
      } else if (typeof value === "number" || typeof value === "boolean") {
        sanitizedParams[key] = value;
      } else {
        // Skip non-primitive values
        logger.warn("Skipping non-primitive param value", {key, valueType: typeof value});
      }
    }
  }
  
  return {
    sanitized: {
      method: sanitizedMethod,
      params: sanitizedParams,
    },
  };
}

module.exports = {
  validateRequestSize,
  validateTokenExchange,
  validateTokenRefresh,
  validateSpotifyApiProxy,
  validateLastFmApiProxy,
  MAX_REQUEST_SIZE,
};

