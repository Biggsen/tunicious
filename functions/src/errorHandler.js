const logger = require("firebase-functions/logger");

/**
 * Determine if running in production environment
 */
function isProduction() {
  return (
    process.env.FUNCTIONS_EMULATOR !== "true" &&
    process.env.NODE_ENV !== "development" &&
    (!process.env.GCLOUD_PROJECT || !process.env.GCLOUD_PROJECT.includes("dev"))
  );
}

/**
 * Sanitize error message for client response
 * In production, returns generic messages to prevent information leakage
 * In development, returns more detailed messages for debugging
 * 
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred (e.g., "tokenExchange", "apiProxy")
 * @returns {string} Sanitized error message
 */
function sanitizeErrorMessage(error, context = "unknown") {
  const isProd = isProduction();
  
  // Always log full error details server-side
  logger.error(`Error in ${context}`, {
    error: error.message,
    errorStack: error.stack,
    errorCode: error.code,
    errorName: error.name,
    context,
  });
  
  // In production, return generic messages
  if (isProd) {
    // Check for authentication errors
    if (
      error.message &&
      (error.message.includes("Unauthorized") ||
        error.message.includes("authentication") ||
        error.message.includes("Invalid token") ||
        error.message.includes("expired token"))
    ) {
      return "Authentication required - please log in again";
    }
    
    // Check for validation errors (these are safe to return)
    if (error.message && error.message.includes("Invalid") || error.message.includes("Missing")) {
      return error.message; // Validation errors are safe
    }
    
    // Generic error for everything else
    return "An error occurred processing your request";
  }
  
  // In development, return more detailed messages
  return error.message || "Unknown error";
}

/**
 * Handle error and send appropriate response
 * 
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @param {number} defaultStatus - Default HTTP status code (default: 500)
 */
function handleError(res, error, context = "unknown", defaultStatus = 500) {
  // Determine status code
  let status = defaultStatus;
  
  if (error.message) {
    if (
      error.message.includes("Unauthorized") ||
      error.message.includes("authentication") ||
      error.message.includes("Invalid token") ||
      error.message.includes("expired token")
    ) {
      status = 401;
    } else if (error.message.includes("Forbidden") || error.message.includes("not allowed")) {
      status = 403;
    } else if (error.message.includes("Not found")) {
      status = 404;
    } else if (error.message.includes("Invalid") || error.message.includes("Missing")) {
      status = 400;
    }
  }
  
  // Get sanitized error message
  const message = sanitizeErrorMessage(error, context);
  
  // Send response
  res.status(status).json({error: message});
}

module.exports = {
  sanitizeErrorMessage,
  handleError,
  isProduction,
};

