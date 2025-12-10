const admin = require("firebase-admin");
const {getAuth} = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Verify Firebase ID token from request
 * @param {Object} req - Express request object
 * @returns {Promise<{uid: string, decodedToken: Object}>} User ID and decoded token
 * @throws {Error} If authentication fails
 */
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("Missing or invalid Authorization header");
    throw new Error("Unauthorized: Missing or invalid authorization token");
  }
  
  const idToken = authHeader.split("Bearer ")[1];
  
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return {
      uid: decodedToken.uid,
      decodedToken: decodedToken,
    };
  } catch (error) {
    logger.warn("Token verification failed", {error: error.message});
    throw new Error("Unauthorized: Invalid or expired token");
  }
}

/**
 * Middleware function to verify authentication
 * Returns a function that can be used in route handlers
 */
function requireAuth(handler) {
  return async (req, res) => {
    try {
      const authResult = await verifyAuthToken(req);
      // Attach auth info to request for use in handler
      req.auth = authResult;
      return handler(req, res);
    } catch (error) {
      logger.error("Authentication error", {error: error.message});
      res.status(401).json({error: error.message});
      return;
    }
  };
}

module.exports = {
  verifyAuthToken,
  requireAuth,
};

