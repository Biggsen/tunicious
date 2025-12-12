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
  const docRef = admin.firestore().collection("rateLimits").doc(identifier);
  
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
    logger.error("Rate limiting error", {
      error: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      identifier,
      limit,
      windowMs,
    });
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

/**
 * Track API usage without enforcing limits (for data collection)
 * @param {Object} req - Express request object
 * @param {string} identifier - Unique identifier (user ID or IP)
 * @param {string} method - API method being called
 * @param {Object} authResult - Authentication result (optional)
 * @returns {Promise<void>}
 */
async function trackUsage(req, identifier, method, authResult = null) {
  const now = Date.now();
  const timestamp = admin.firestore.Timestamp.fromMillis(now);
  
  try {
    // Store detailed usage record
    const usageData = {
      identifier,
      method,
      timestamp,
      userId: authResult?.uid || null,
      userEmail: authResult?.email || null,
      hour: Math.floor(now / (1000 * 60 * 60)), // Hour bucket for aggregation
      day: Math.floor(now / (1000 * 60 * 60 * 24)), // Day bucket for aggregation
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // Store individual usage record
    await admin.firestore()
      .collection("lastfmUsage")
      .add(usageData);
    
    // Also update hourly counter for quick queries
    const hourDocRef = admin.firestore()
      .collection("lastfmUsageHourly")
      .doc(`${identifier}_${usageData.hour}`);
    
    await hourDocRef.set({
      identifier,
      hour: usageData.hour,
      count: admin.firestore.FieldValue.increment(1),
      methods: admin.firestore.FieldValue.arrayUnion(method),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    // Update daily counter
    const dayDocRef = admin.firestore()
      .collection("lastfmUsageDaily")
      .doc(`${identifier}_${usageData.day}`);
    
    await dayDocRef.set({
      identifier,
      day: usageData.day,
      count: admin.firestore.FieldValue.increment(1),
      methods: admin.firestore.FieldValue.arrayUnion(method),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    // Log but don't fail the request
    logger.error("Usage tracking error", {
      error: error.message,
      identifier,
      method,
    });
  }
}

/**
 * Track Spotify API usage without enforcing limits (for data collection)
 * @param {Object} req - Express request object
 * @param {string} identifier - Unique identifier (user ID or IP)
 * @param {string} method - API method/endpoint being called
 * @param {Object} authResult - Authentication result (optional)
 * @returns {Promise<void>}
 */
async function trackSpotifyUsage(req, identifier, method, authResult = null) {
  const now = Date.now();
  const timestamp = admin.firestore.Timestamp.fromMillis(now);
  
  try {
    // Store detailed usage record
    const usageData = {
      identifier,
      method,
      timestamp,
      userId: authResult?.uid || null,
      userEmail: authResult?.email || null,
      hour: Math.floor(now / (1000 * 60 * 60)), // Hour bucket for aggregation
      day: Math.floor(now / (1000 * 60 * 60 * 24)), // Day bucket for aggregation
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // Store individual usage record
    await admin.firestore()
      .collection("spotifyUsage")
      .add(usageData);
    
    // Also update hourly counter for quick queries
    const hourDocRef = admin.firestore()
      .collection("spotifyUsageHourly")
      .doc(`${identifier}_${usageData.hour}`);
    
    await hourDocRef.set({
      identifier,
      hour: usageData.hour,
      count: admin.firestore.FieldValue.increment(1),
      methods: admin.firestore.FieldValue.arrayUnion(method),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    // Update daily counter
    const dayDocRef = admin.firestore()
      .collection("spotifyUsageDaily")
      .doc(`${identifier}_${usageData.day}`);
    
    await dayDocRef.set({
      identifier,
      day: usageData.day,
      count: admin.firestore.FieldValue.increment(1),
      methods: admin.firestore.FieldValue.arrayUnion(method),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    // Log but don't fail the request
    logger.error("Spotify usage tracking error", {
      error: error.message,
      identifier,
      method,
    });
  }
}

module.exports = {
  rateLimit,
  getRateLimitIdentifier,
  createRateLimiter,
  trackUsage,
  trackSpotifyUsage,
};

