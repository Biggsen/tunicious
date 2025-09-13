/**
 * AudioFoodie Firebase Functions
 * Secure backend API for Spotify and Last.fm integration
 */

const {setGlobalOptions} = require("firebase-functions");
const logger = require("firebase-functions/logger");

// Import our API modules
const spotifyFunctions = require("./src/spotify");
const lastfmFunctions = require("./src/lastfm");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Spotify API Functions
exports.spotifyTokenExchange = spotifyFunctions.tokenExchange;
exports.spotifyRefreshToken = spotifyFunctions.refreshToken;
exports.spotifyApiProxy = spotifyFunctions.apiProxy;

// Last.fm API Functions
exports.lastfmApiProxy = lastfmFunctions.apiProxy;

// Health check endpoint
exports.healthCheck = require("firebase-functions/v2/https").onRequest((req, res) => {
  logger.info("Health check requested");
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "AudioFoodie API",
  });
});
