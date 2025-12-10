/**
 * CORS configuration for Firebase Functions
 * Whitelist of allowed origins for security
 */

const allowedOrigins = [
  "https://audiofoodie-d5b2c.web.app",
  "https://audiofoodie-d5b2c.firebaseapp.com",
  "http://localhost:5173", // Development only
];

/**
 * CORS configuration object for Firebase Functions
 * Validates origin against whitelist
 */
const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    // But only if they have valid authentication
    if (!origin) {
      callback(null, true);
      return;
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

module.exports = {
  corsConfig,
  allowedOrigins,
};

