/**
 * Extracts Spotify album ID from a Spotify album URI (e.g. spotify:album:123).
 *
 * @param {string} [albumUri]
 * @returns {string|null}
 */
export function albumIdFromUri(albumUri) {
  if (!albumUri || typeof albumUri !== 'string') return null;
  const parts = albumUri.split(':');
  return parts.length >= 3 ? parts[2] : null;
}

/**
 * Extracts Spotify track ID from a track URI (e.g. spotify:track:123).
 *
 * @param {string} [trackUri]
 * @returns {string|null}
 */
export function trackIdFromUri(trackUri) {
  if (!trackUri || typeof trackUri !== 'string') return null;
  const parts = trackUri.split(':');
  return parts.length >= 3 ? parts[2] : null;
}
