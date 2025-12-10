const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Rate limiting middleware
 * Tracks requests in Firestore and enforces limits
 * @param {Object} req - Express request object
 * @param {string} identifier - Unique identifier (IP address or user ID)
 * @param {number} limit - Maximum number of requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
 */
async function rateLimit(req, identifier, limit, windowMs) {
  const now = Date.now();
  const key = `ratelimit:${identifier}`;
  
  const docRef = admin.firestore().doc(key);
  
  try {
    const doc = await docRef.get();
    
    if (!doc.exists) {
      // First request in window
      await docRef.set({
        count: 1,
        resetAt: now + windowMs,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: now + windowMs,
      };
    }
    
    const data = doc.data();
    
    // Check if window has expired
    if (data.resetAt < now) {
      // Window expired, reset
      await docRef.set({
        count: 1,
        resetAt: now + windowMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: now + windowMs,
      };
    }
    
    // Check if limit exceeded
    if (data.count >= limit) {
      logger.warn("Rate limit exceeded", {
        identifier,
        limit,
        count: data.count,
        resetAt: data.resetAt,
      });
      return {
        allowed: false,
        remaining: 0,
        resetAt: data.resetAt,
      };
    }
    
    // Increment count
    await docRef.update({
      count: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return {
      allowed: true,
      remaining: limit - data.count - 1,
      resetAt: data.resetAt,
    };
  } catch (error) {
    // If rate limiting fails, log but allow the request (fail open)
    logger.error("Rate limiting error", {error: error.message, identifier});
    return {
      allowed: true,
      remaining: limit,
      resetAt: now + windowMs,
    };
  }
}

/**
 * Get identifier for rate limiting (IP address or user ID)
 * @param {Object} req - Express request object
 * @param {Object} authResult - Authentication result (optional)
 * @returns {string} Identifier for rate limiting
 */
function getRateLimitIdentifier(req, authResult = null) {
  // Prefer user ID if authenticated, otherwise use IP address
  if (authResult && authResult.uid) {
    return `user:${authResult.uid}`;
  }
  
  // Get IP address from request
  let ip = req.ip;
  if (!ip && req.headers["x-forwarded-for"]) {
    ip = req.headers["x-forwarded-for"].split(",")[0].trim();
  }
  if (!ip && req.headers["x-real-ip"]) {
    ip = req.headers["x-real-ip"];
  }
  if (!ip) {
    ip = "unknown";
  }
  
  return `ip:${ip}`;
}

/**
 * Rate limit middleware factory
 * Returns a middleware function that applies rate limiting
 * @param {number} limit - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @param {boolean} useUserId - If true, use user ID instead of IP (requires auth)
 * @returns {Function} Middleware function
 */
function createRateLimiter(limit, windowMs, useUserId = false) {
  return async (req, res, next) => {
    try {
      // Get auth result if available (from previous middleware)
      const authResult = req.auth || null;
      
      // Get identifier
      const identifier = (useUserId && authResult) ?
        getRateLimitIdentifier(req, authResult) :
        getRateLimitIdentifier(req);
      
      // Apply rate limit
      const result = await rateLimit(req, identifier, limit, windowMs);
      
      if (!result.allowed) {
        const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
        res.status(429).json({
          error: "Rate limit exceeded",
          retryAfter: retryAfter,
          resetAt: new Date(result.resetAt).toISOString(),
        });
        return;
      }
      
      // Add rate limit headers
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", new Date(result.resetAt).toISOString());
      
      // Continue to next middleware
      if (next) {
        next();
      }
    } catch (error) {
      logger.error("Rate limiter middleware error", {error: error.message});
      // Fail open - allow request if rate limiting fails
      if (next) {
        next();
      }
    }
  };
}

module.exports = {
  rateLimit,
  getRateLimitIdentifier,
  createRateLimiter,
};

