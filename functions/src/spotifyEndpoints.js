/**
 * Spotify API endpoint validation
 * Whitelist of allowed endpoints for security
 */

/**
 * Allowed Spotify API endpoints
 * Supports pattern matching for dynamic IDs (e.g., {playlistId}, {albumId}, {artistId}, {userId})
 */
const ALLOWED_ENDPOINTS = [
  // User endpoints
  "/me",
  "/me/playlists",
  
  // User playlists (POST to create)
  "/users/{userId}/playlists",
  
  // Playlist endpoints
  "/playlists/{playlistId}",
  "/playlists/{playlistId}/tracks",
  "/playlists/{playlistId}/followers",
  
  // Album endpoints
  "/albums",
  "/albums/{albumId}",
  "/albums/{albumId}/tracks",
  
  // Artist endpoints
  "/artists/{artistId}",
  "/artists/{artistId}/albums",
  
  // Search endpoint
  "/search",
];

/**
 * Validates if an endpoint is allowed
 * @param {string} endpoint - The endpoint path (may include query parameters)
 * @returns {boolean} - True if endpoint is allowed, false otherwise
 */
function isEndpointAllowed(endpoint) {
  if (!endpoint || typeof endpoint !== "string") {
    return false;
  }
  
  // Remove query parameters for validation
  const pathOnly = endpoint.split("?")[0];
  
  // Remove leading/trailing slashes for consistent matching
  const normalizedPath = pathOnly.replace(/^\/+|\/+$/g, "");
  
  // Check exact matches first
  if (ALLOWED_ENDPOINTS.includes(`/${normalizedPath}`)) {
    return true;
  }
  
  // Check pattern matches (e.g., /playlists/{id})
  return ALLOWED_ENDPOINTS.some((allowed) => {
    // Convert pattern to regex
    // Replace {paramName} with [^/]+ (one or more non-slash characters)
    const pattern = allowed
      .replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes
      .replace(/\{[^}]+\}/g, "[^/]+");
    
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(normalizedPath);
  });
}

module.exports = {
  isEndpointAllowed,
  ALLOWED_ENDPOINTS,
};

