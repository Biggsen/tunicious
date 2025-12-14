import debug from 'debug';

// Disable debug logs by default
// Clear localStorage.debug to ensure logs are off (debug package checks this automatically)
if (typeof window !== 'undefined' && window.localStorage) {
  localStorage.removeItem('debug');
}
debug.disable();

// Create namespaced loggers for different parts of the app
export const logSpotify = debug('app:spotify');
export const logFirebase = debug('app:firebase');
export const logCache = debug('app:cache');
export const logAuth = debug('app:auth');
export const logPlaylist = debug('app:playlist');
export const logAlbum = debug('app:album');
export const logLastFm = debug('app:lastfm');
export const logUser = debug('app:user');
export const logApi = debug('app:api');
export const logPlayer = debug('app:player');

// General debug logger
export const logDebug = debug('app:debug');

// Helper to enable/disable all debug logs
export function enableDebug(namespace = 'app:*') {
  // Don't enable debug logs in production
  if (import.meta.env.PROD) {
    return;
  }
  // Set both localStorage and enable directly (debug package checks localStorage)
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('debug', namespace);
  }
  debug.enable(namespace);
}

export function disableDebug() {
  debug.disable();
}

// Check if debug is enabled (useful for conditional logic)
export function isDebugEnabled(namespace = 'app:*') {
  return debug.enabled(namespace);
}

