import { getCache } from './cache';
import { loadUnifiedTrackCache } from './unifiedTrackCache';
import { logPlaylist } from './logger';

// In-memory cache for resolved playlist names during the session
const sessionCache = new Map();

/**
 * Get playlist name from unified track cache
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Playlist name or null if not found
 */
async function getPlaylistNameFromUnifiedCache(playlistId, userId) {
  try {
    const cache = await loadUnifiedTrackCache(userId, '');
    const playlist = cache?.playlists?.[playlistId];
    return playlist?.playlistName || null;
  } catch (error) {
    logPlaylist('Error loading unified cache for playlist name:', error);
    return null;
  }
}

/**
 * Get playlist name from playlist summaries cache
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Playlist name or null if not found
 */
async function getPlaylistNameFromSummariesCache(playlistId, userId) {
  try {
    const cacheKey = `playlist_summaries_${userId}`;
    const cachedData = await getCache(cacheKey);
    
    if (!cachedData) return null;
    
    // Search through all groups to find the playlist
    for (const group of Object.keys(cachedData)) {
      const groupPlaylists = cachedData[group] || [];
      const playlist = groupPlaylists.find(p => p.id === playlistId);
      if (playlist?.name) {
        return playlist.name;
      }
    }
    
    return null;
  } catch (error) {
    logPlaylist('Error loading summaries cache for playlist name:', error);
    return null;
  }
}

/**
 * Get playlist name from Spotify API
 * @param {string} playlistId - Spotify playlist ID
 * @param {Function} getPlaylistFn - Function to get playlist from Spotify API
 * @returns {Promise<string|null>} Playlist name or null if not found
 */
async function getPlaylistNameFromApi(playlistId, getPlaylistFn) {
  try {
    const playlist = await getPlaylistFn(playlistId);
    return playlist?.name || null;
  } catch (error) {
    logPlaylist(`Error fetching playlist name from API for ${playlistId}:`, error);
    return null;
  }
}

/**
 * Resolve a single playlist name from cache or API
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} userId - User ID
 * @param {Function} getPlaylistFn - Function to get playlist from Spotify API (optional)
 * @returns {Promise<string>} Playlist name or 'Unknown Playlist' if not found
 */
export async function resolvePlaylistName(playlistId, userId, getPlaylistFn = null) {
  if (!playlistId || !userId) {
    return 'Unknown Playlist';
  }

  // Check session cache first
  const sessionKey = `${userId}:${playlistId}`;
  if (sessionCache.has(sessionKey)) {
    return sessionCache.get(sessionKey);
  }

  // Try unified track cache
  let name = await getPlaylistNameFromUnifiedCache(playlistId, userId);
  if (name) {
    sessionCache.set(sessionKey, name);
    return name;
  }

  // Try playlist summaries cache
  name = await getPlaylistNameFromSummariesCache(playlistId, userId);
  if (name) {
    sessionCache.set(sessionKey, name);
    return name;
  }

  // Fall back to API if function provided
  if (getPlaylistFn) {
    name = await getPlaylistNameFromApi(playlistId, getPlaylistFn);
    if (name) {
      sessionCache.set(sessionKey, name);
      return name;
    }
  }

  // Return fallback if nothing found
  const fallback = 'Unknown Playlist';
  sessionCache.set(sessionKey, fallback);
  return fallback;
}

/**
 * Batch resolve multiple playlist names
 * @param {string[]} playlistIds - Array of Spotify playlist IDs
 * @param {string} userId - User ID
 * @param {Function} getPlaylistFn - Function to get playlist from Spotify API (optional)
 * @returns {Promise<Object>} Object mapping playlistId to name
 */
export async function resolvePlaylistNames(playlistIds, userId, getPlaylistFn = null) {
  if (!playlistIds || playlistIds.length === 0 || !userId) {
    return {};
  }

  const uniqueIds = [...new Set(playlistIds.filter(id => id))];
  const result = {};
  
  // Load caches once for all playlists
  let unifiedCache = null;
  let summariesCache = null;
  
  try {
    unifiedCache = await loadUnifiedTrackCache(userId, '');
  } catch (error) {
    logPlaylist('Error loading unified cache for batch resolution:', error);
  }
  
  try {
    const cacheKey = `playlist_summaries_${userId}`;
    summariesCache = await getCache(cacheKey);
  } catch (error) {
    logPlaylist('Error loading summaries cache for batch resolution:', error);
  }

  // Resolve from caches first
  const missingIds = [];
  
  for (const playlistId of uniqueIds) {
    const sessionKey = `${userId}:${playlistId}`;
    
    // Check session cache
    if (sessionCache.has(sessionKey)) {
      result[playlistId] = sessionCache.get(sessionKey);
      continue;
    }
    
    // Check unified cache
    if (unifiedCache?.playlists?.[playlistId]?.playlistName) {
      const name = unifiedCache.playlists[playlistId].playlistName;
      result[playlistId] = name;
      sessionCache.set(sessionKey, name);
      continue;
    }
    
    // Check summaries cache
    if (summariesCache) {
      let found = false;
      for (const group of Object.keys(summariesCache)) {
        const groupPlaylists = summariesCache[group] || [];
        const playlist = groupPlaylists.find(p => p.id === playlistId);
        if (playlist?.name) {
          result[playlistId] = playlist.name;
          sessionCache.set(sessionKey, playlist.name);
          found = true;
          break;
        }
      }
      if (found) continue;
    }
    
    // Mark as missing if not found in caches
    missingIds.push(playlistId);
  }

  // Fetch missing names from API if function provided
  if (missingIds.length > 0 && getPlaylistFn) {
    // Batch fetch from API (with error handling for individual failures)
    const apiPromises = missingIds.map(async (playlistId) => {
      try {
        const name = await getPlaylistNameFromApi(playlistId, getPlaylistFn);
        if (name) {
          result[playlistId] = name;
          const sessionKey = `${userId}:${playlistId}`;
          sessionCache.set(sessionKey, name);
        } else {
          result[playlistId] = 'Unknown Playlist';
        }
      } catch (error) {
        logPlaylist(`Error fetching playlist name for ${playlistId}:`, error);
        result[playlistId] = 'Unknown Playlist';
      }
    });
    
    await Promise.all(apiPromises);
  } else {
    // Set fallback for missing IDs
    for (const playlistId of missingIds) {
      result[playlistId] = 'Unknown Playlist';
    }
  }

  return result;
}

/**
 * Get playlist name from cache only (no API calls)
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Playlist name or null if not in cache
 */
export async function getPlaylistNameFromCache(playlistId, userId) {
  if (!playlistId || !userId) {
    return null;
  }

  // Check session cache
  const sessionKey = `${userId}:${playlistId}`;
  if (sessionCache.has(sessionKey)) {
    return sessionCache.get(sessionKey);
  }

  // Try unified cache
  const unifiedName = await getPlaylistNameFromUnifiedCache(playlistId, userId);
  if (unifiedName) {
    sessionCache.set(sessionKey, unifiedName);
    return unifiedName;
  }

  // Try summaries cache
  const summariesName = await getPlaylistNameFromSummariesCache(playlistId, userId);
  if (summariesName) {
    sessionCache.set(sessionKey, summariesName);
    return summariesName;
  }

  return null;
}

/**
 * Clear session cache (useful for testing or when cache should be refreshed)
 */
export function clearPlaylistNameSessionCache() {
  sessionCache.clear();
}

