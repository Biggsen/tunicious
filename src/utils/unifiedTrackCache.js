import { getCache, setCache, clearCache } from './cache';
import { logCache } from './logger';
import { isSimilar } from './fuzzyMatch';

// Cache schema version (increment for migrations)
const CACHE_VERSION = 1;

// Cache key prefix
const CACHE_KEY_PREFIX = 'user_tracks_';

// Tracklist preference key prefix
const TRACKLIST_PREFERENCE_PREFIX = 'audiofoodie_showTracklists_';

// Refresh thresholds
const PLAYCOUNT_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
const LOVED_REFRESH_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days

// Debounce delay for cache saves
const SAVE_DEBOUNCE_DELAY = 500;

// In-memory cache storage (per user)
const inMemoryCache = new Map();

// Debounce timers (per user)
const saveTimers = new Map();

/**
 * Normalize track name for indexing
 */
function normalizeTrackName(name) {
  return name?.toLowerCase() || '';
}

/**
 * Normalize artist name for indexing
 */
function normalizeArtistName(name) {
  return name?.toLowerCase() || '';
}

/**
 * Create empty cache structure
 */
function createEmptyCache(userId, lastFmUserName) {
  return {
    metadata: {
      lastUpdated: Date.now(),
      lastFmUserName,
      userId,
      version: CACHE_VERSION,
      totalTracks: 0,
      totalAlbums: 0,
      totalPlaylists: 0,
      unsyncedLovedTracks: []
    },
    tracks: {},
    albums: {},
    playlists: {},
    indexes: {
      byTrackName: {},
      byArtist: {},
      lovedTrackIds: [],
      albumsByArtist: {}
    }
  };
}

/**
 * Validate cache structure
 */
function validateCache(cache) {
  if (!cache || typeof cache !== 'object') return false;
  if (!cache.metadata || !cache.tracks || !cache.albums || !cache.playlists || !cache.indexes) return false;
  if (cache.metadata.version !== CACHE_VERSION) return false;
  return true;
}

/**
 * Initialize or load the unified track cache
 */
export async function loadUnifiedTrackCache(userId, lastFmUserName) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Check in-memory cache first
  if (inMemoryCache.has(userId)) {
    const cache = inMemoryCache.get(userId);
    // Update lastFmUserName if it changed
    if (lastFmUserName && cache.metadata.lastFmUserName !== lastFmUserName) {
      cache.metadata.lastFmUserName = lastFmUserName;
      await saveUnifiedTrackCache(userId, true);
    }
    return cache;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  
  try {
    const cachedData = getCache(cacheKey);
    
    if (cachedData && validateCache(cachedData)) {
      // Update lastFmUserName if it changed
      if (lastFmUserName && cachedData.metadata.lastFmUserName !== lastFmUserName) {
        cachedData.metadata.lastFmUserName = lastFmUserName;
      }
      
      // Load into memory
      inMemoryCache.set(userId, cachedData);
      logCache(`Loaded unified track cache for user ${userId}: ${cachedData.metadata.totalTracks} tracks`);
      return cachedData;
    } else {
      // Create new cache
      const newCache = createEmptyCache(userId, lastFmUserName);
      inMemoryCache.set(userId, newCache);
      await saveUnifiedTrackCache(userId, true);
      logCache(`Created new unified track cache for user ${userId}`);
      return newCache;
    }
  } catch (error) {
    logCache('Error loading unified track cache:', error);
    // Create new cache on error
    const newCache = createEmptyCache(userId, lastFmUserName);
    inMemoryCache.set(userId, newCache);
    return newCache;
  }
}

/**
 * Save unified track cache to localStorage (debounced)
 */
export async function saveUnifiedTrackCache(userId, immediate = false) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const cache = inMemoryCache.get(userId);
  if (!cache) {
    logCache(`No in-memory cache found for user ${userId}, skipping save`);
    return;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;

  const performSave = async () => {
    try {
      // Update metadata
      cache.metadata.lastUpdated = Date.now();
      cache.metadata.totalTracks = Object.keys(cache.tracks).length;
      cache.metadata.totalAlbums = Object.keys(cache.albums).length;
      cache.metadata.totalPlaylists = Object.keys(cache.playlists).length;

      setCache(cacheKey, cache);
      logCache(`Saved unified track cache for user ${userId}`);
    } catch (error) {
      if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        logCache('Storage quota exceeded, attempting LRU eviction...');
        await evictLRUTracks(userId);
        // Retry save after eviction
        try {
          setCache(cacheKey, cache);
          logCache('Successfully saved cache after eviction');
        } catch (retryError) {
          logCache('Failed to save cache even after eviction:', retryError);
          // Continue with in-memory cache
        }
      } else {
        logCache('Error saving unified track cache:', error);
      }
    }
  };

  if (immediate) {
    // Clear any pending debounced save
    if (saveTimers.has(userId)) {
      clearTimeout(saveTimers.get(userId));
      saveTimers.delete(userId);
    }
    await performSave();
  } else {
    // Debounce save
    if (saveTimers.has(userId)) {
      clearTimeout(saveTimers.get(userId));
    }
    
    const timer = setTimeout(async () => {
      await performSave();
      saveTimers.delete(userId);
    }, SAVE_DEBOUNCE_DELAY);
    
    saveTimers.set(userId, timer);
  }
}

/**
 * Get in-memory cache (for internal use)
 */
function getInMemoryCache(userId) {
  const cache = inMemoryCache.get(userId);
  if (!cache) {
    throw new Error(`Cache not loaded for user ${userId}. Call loadUnifiedTrackCache first.`);
  }
  return cache;
}

/**
 * Update track's lastAccessed timestamp
 */
function updateTrackAccess(cache, trackId) {
  if (cache.tracks[trackId]) {
    cache.tracks[trackId].lastAccessed = Date.now();
  }
}

/**
 * Create a track object for the cache
 */
function createTrackObject(track, trackId, now, albumId = null, albumData = null) {
  return {
    id: trackId,
    name: track.name,
    artists: track.artists || [],
    album: track.album || (albumId ? { id: albumId, name: albumData?.name || '' } : {}),
    duration_ms: track.duration_ms || 0,
    track_number: track.track_number || 0,
    uri: track.uri || `spotify:track:${trackId}`,
    external_urls: track.external_urls || {},
    loved: false,
    playcount: 0,
    lastPlaycountUpdate: null,
    lastLovedUpdate: null,
    lastAccessed: now,
    albumIds: [],
    playlistIds: []
  };
}

/**
 * Check if a track is loved in the cache
 */
function isTrackLovedInCache(cache, track) {
  return track.loved === true || 
    (track.loved === undefined && cache.indexes.lovedTrackIds.includes(track.id));
}

/**
 * Check if a track ID is in the loved tracks index
 */
function isTrackLovedInIndex(cache, trackId) {
  return cache.indexes.lovedTrackIds.includes(trackId);
}

/**
 * Add a track to the loved tracks index (if not already present)
 */
function addTrackToLovedIndex(cache, trackId) {
  if (!cache.indexes.lovedTrackIds.includes(trackId)) {
    cache.indexes.lovedTrackIds.push(trackId);
  }
}

/**
 * Remove a track from the loved tracks index
 */
function removeTrackFromLovedIndex(cache, trackId) {
  const index = cache.indexes.lovedTrackIds.indexOf(trackId);
  if (index !== -1) {
    cache.indexes.lovedTrackIds.splice(index, 1);
  }
}

/**
 * Transform track IDs to track objects with user-specific data
 */
function transformTracksForReturn(cache, trackIds) {
  return trackIds
    .map(trackId => cache.tracks[trackId])
    .filter(track => track !== undefined)
    .map(track => {
      updateTrackAccess(cache, track.id);
      const isLoved = isTrackLovedInCache(cache, track);
      return {
        ...track,
        loved: isLoved,
        playcount: track.playcount || 0
      };
    });
}

/**
 * Add track to indexes
 */
function addTrackToIndexes(cache, track) {
  const trackId = track.id;
  
  // Add to byTrackName index
  const normalizedTrackName = normalizeTrackName(track.name);
  if (!cache.indexes.byTrackName[normalizedTrackName]) {
    cache.indexes.byTrackName[normalizedTrackName] = {};
  }
  
  // Add to byArtist index
  if (track.artists && track.artists.length > 0) {
    track.artists.forEach(artist => {
      if (!cache.indexes.byArtist[artist.id]) {
        cache.indexes.byArtist[artist.id] = [];
      }
      if (!cache.indexes.byArtist[artist.id].includes(trackId)) {
        cache.indexes.byArtist[artist.id].push(trackId);
      }
      
      // Add to byTrackName[trackName][artistName] index
      const normalizedArtistName = normalizeArtistName(artist.name);
      if (!cache.indexes.byTrackName[normalizedTrackName][normalizedArtistName]) {
        cache.indexes.byTrackName[normalizedTrackName][normalizedArtistName] = [];
      }
      if (!cache.indexes.byTrackName[normalizedTrackName][normalizedArtistName].includes(trackId)) {
        cache.indexes.byTrackName[normalizedTrackName][normalizedArtistName].push(trackId);
      }
    });
  }
  
  // Add to albumsByArtist index
  if (track.album && track.album.id) {
    const albumId = track.album.id;
    if (track.artists && track.artists.length > 0) {
      track.artists.forEach(artist => {
        if (!cache.indexes.albumsByArtist[artist.id]) {
          cache.indexes.albumsByArtist[artist.id] = [];
        }
        if (!cache.indexes.albumsByArtist[artist.id].includes(albumId)) {
          cache.indexes.albumsByArtist[artist.id].push(albumId);
        }
      });
    }
  }
  
  // Add to lovedTrackIds if loved
  if (track.loved) {
    addTrackToLovedIndex(cache, trackId);
  }
}

/**
 * Remove track from indexes
 */
function removeTrackFromIndexes(cache, trackId, track) {
  // Remove from lovedTrackIds
  removeTrackFromLovedIndex(cache, trackId);
  
  // Note: We don't remove from other indexes on eviction to avoid complexity
  // Indexes will be rebuilt if needed or cleaned up during cache rebuild
}

/**
 * Get tracks for an album
 */
export async function getAlbumTracks(albumId, userId) {
  const cache = getInMemoryCache(userId);
  
  if (!cache.albums[albumId]) {
    return [];
  }
  
  const trackIds = cache.albums[albumId].trackIds || [];
  return transformTracksForReturn(cache, trackIds);
}

/**
 * Get tracks for an album within a playlist context
 */
export async function getPlaylistAlbumTracks(playlistId, albumId, userId) {
  const cache = getInMemoryCache(userId);
  
  if (!cache.playlists[playlistId] || !cache.playlists[playlistId].albums[albumId]) {
    return [];
  }
  
  const trackIds = cache.playlists[playlistId].albums[albumId].trackIds || [];
  return transformTracksForReturn(cache, trackIds);
}

/**
 * Get all tracks for a playlist
 */
export async function getPlaylistTracks(playlistId, userId) {
  const cache = getInMemoryCache(userId);
  
  if (!cache.playlists[playlistId]) {
    return [];
  }
  
  const allTrackIds = new Set();
  
  // Collect all track IDs from all albums in playlist
  Object.values(cache.playlists[playlistId].albums).forEach(albumData => {
    if (albumData.trackIds) {
      albumData.trackIds.forEach(trackId => allTrackIds.add(trackId));
    }
  });
  
  return transformTracksForReturn(cache, Array.from(allTrackIds));
}

/**
 * Check if a track is loved
 */
export function isTrackLoved(trackId, userId) {
  const cache = getInMemoryCache(userId);
  return cache.tracks[trackId]?.loved || false;
}

/**
 * Get track playcount
 */
export function getTrackPlaycount(trackId, userId) {
  const cache = getInMemoryCache(userId);
  return cache.tracks[trackId]?.playcount || 0;
}

/**
 * Find track ID by name and artist (fallback when track ID doesn't match)
 */
export function findTrackIdByNameAndArtist(trackName, artistName, userId) {
  const cache = getInMemoryCache(userId);
  const normalizedTrackName = normalizeTrackName(trackName);
  const normalizedArtistName = normalizeArtistName(artistName);
  
  // Use the byTrackName index to find matching tracks
  if (cache.indexes.byTrackName[normalizedTrackName]) {
    const artistTracks = cache.indexes.byTrackName[normalizedTrackName][normalizedArtistName];
    if (artistTracks && artistTracks.length > 0) {
      // Return the first matching track ID
      return artistTracks[0];
    }
  }
  
  return null;
}

/**
 * Update track loved status (cache-first, syncs to Last.fm in background)
 * @param {Function} loveTrackFn - Function to love a track
 * @param {Function} unloveTrackFn - Function to unlove a track
 */
export async function updateTrackLoved(trackId, loved, userId, lastFmUserName, sessionKey, loveTrackFn, unloveTrackFn) {
  const cache = getInMemoryCache(userId);
  
  if (!cache.tracks[trackId]) {
    logCache(`Track ${trackId} not found in cache, cannot update loved status`);
    return;
  }
  
  const track = cache.tracks[trackId];
  
  // Update cache immediately (optimistic update)
  track.loved = loved;
  track.lastLovedUpdate = Date.now();
  updateTrackAccess(cache, trackId);
  
  // Update lovedTrackIds index
  if (loved) {
    addTrackToLovedIndex(cache, trackId);
  } else {
    removeTrackFromLovedIndex(cache, trackId);
  }
  
  // Save cache immediately (critical operation)
  await saveUnifiedTrackCache(userId, true);
  
  // Sync to Last.fm API in background (non-blocking)
  if (lastFmUserName && sessionKey && track.name && track.artists && track.artists.length > 0 && loveTrackFn && unloveTrackFn) {
    const artistName = track.artists[0].name;
    syncLovedStatusToLastFm(track.name, artistName, loved, sessionKey, userId, trackId, loveTrackFn, unloveTrackFn).catch(error => {
      logCache('Background sync of loved status failed:', error);
    });
  }
}

/**
 * Sync loved status to Last.fm API (background)
 * @param {Function} loveTrackFn - Function to love a track
 * @param {Function} unloveTrackFn - Function to unlove a track
 */
async function syncLovedStatusToLastFm(trackName, artistName, loved, sessionKey, userId, trackId, loveTrackFn, unloveTrackFn) {
  const cache = getInMemoryCache(userId);
  
  try {
    if (loved) {
      await loveTrackFn(trackName, artistName, sessionKey);
    } else {
      await unloveTrackFn(trackName, artistName, sessionKey);
    }
    
    // Remove from unsynced list if present
    cache.metadata.unsyncedLovedTracks = cache.metadata.unsyncedLovedTracks.filter(
      item => item.trackId !== trackId
    );
    
    logCache(`Successfully synced loved status for track ${trackId} to Last.fm`);
  } catch (error) {
    logCache(`Failed to sync loved status for track ${trackId}:`, error);
    
    // Revert the optimistic update
    if (cache.tracks[trackId]) {
      cache.tracks[trackId].loved = !loved; // Revert to original state
      cache.tracks[trackId].lastLovedUpdate = Date.now();
      
      // Update lovedTrackIds index
      if (!loved) {
        // Was trying to unlove, but failed - add back to loved list
        addTrackToLovedIndex(cache, trackId);
      } else {
        // Was trying to love, but failed - remove from loved list
        removeTrackFromLovedIndex(cache, trackId);
      }
      
      await saveUnifiedTrackCache(userId, true);
    }
    
    // Add to unsynced list
    const existingIndex = cache.metadata.unsyncedLovedTracks.findIndex(item => item.trackId === trackId);
    
    if (existingIndex !== -1) {
      cache.metadata.unsyncedLovedTracks[existingIndex].retryCount++;
    } else {
      cache.metadata.unsyncedLovedTracks.push({
        trackId,
        loved,
        timestamp: Date.now(),
        retryCount: 0
      });
    }
    
    await saveUnifiedTrackCache(userId);
    
    // Emit window event for toast notification
    const errorMessage = error.message || error.toString();
    
    // Check for session errors: Last.fm error code 9, HTTP 403, or error messages
    const isSessionError = error.lastFmErrorCode === 9 ||
                          errorMessage.includes('403') || 
                          errorMessage.includes('Session key is no longer valid') ||
                          errorMessage.includes('Invalid session key') ||
                          errorMessage.includes('session expired') ||
                          errorMessage.includes('Last.fm session expired') ||
                          (errorMessage.includes('session') && errorMessage.includes('Last.fm'));
    
    // Build user-friendly error message
    let userMessage;
    if (isSessionError) {
      // Use Last.fm message if available, otherwise use default
      if (error.lastFmMessage) {
        userMessage = `Last.fm session expired: ${error.lastFmMessage}`;
      } else {
        userMessage = 'Last.fm session expired. Please reconnect your account.';
      }
    } else {
      // For non-session errors, include the Last.fm message if available
      if (error.lastFmMessage) {
        userMessage = `Failed to ${loved ? 'love' : 'unlove'} track: ${error.lastFmMessage}`;
      } else {
        userMessage = `Failed to ${loved ? 'love' : 'unlove'} track: ${errorMessage}`;
      }
    }
    
    window.dispatchEvent(new CustomEvent('lastfm-sync-error', {
      detail: {
        trackId,
        trackName,
        artistName,
        attemptedLoved: loved, // What we tried to set it to (before revert)
        error: errorMessage,
        isSessionError,
        message: userMessage
      }
    }));
    
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Update track playcount (cache-first)
 * Now supports fallback lookup by name + artist if track ID doesn't match
 */
export async function updateTrackPlaycount(trackId, playcount, userId, trackName = null, artistName = null) {
  const cache = getInMemoryCache(userId);
  
  let actualTrackId = trackId;
  
  // If track not found by ID, try to find by name + artist
  if (!cache.tracks[trackId] && trackName && artistName) {
    const foundTrackId = findTrackIdByNameAndArtist(trackName, artistName, userId);
    if (foundTrackId) {
      logCache(`Track ${trackId} not found by ID, but found by name+artist as ${foundTrackId}`);
      actualTrackId = foundTrackId;
    }
  }
  
  if (!cache.tracks[actualTrackId]) {
    logCache(`Track ${trackId} not found in cache, cannot update playcount`);
    return null;
  }
  
  cache.tracks[actualTrackId].playcount = playcount;
  cache.tracks[actualTrackId].lastPlaycountUpdate = Date.now();
  updateTrackAccess(cache, actualTrackId);
  
  await saveUnifiedTrackCache(userId);
  
  // Return the actual track ID that was updated (for UI updates)
  return actualTrackId;
}

/**
 * Add tracks from an album to cache
 */
export async function addAlbumTracks(albumId, tracks, albumData, userId) {
  const cache = getInMemoryCache(userId);
  const now = Date.now();
  
  // Initialize album if not exists
  if (!cache.albums[albumId]) {
    cache.albums[albumId] = {
      trackIds: [],
      lastUpdated: now,
      albumTitle: albumData?.name || '',
      artistName: albumData?.artists?.[0]?.name || ''
    };
  }
  
  const album = cache.albums[albumId];
  album.lastUpdated = now;
  album.trackIds = [];
  
  // Process each track
  for (const track of tracks) {
    const trackId = track.id;
    
    // Add or update track in cache
    if (!cache.tracks[trackId]) {
      cache.tracks[trackId] = createTrackObject(track, trackId, now, albumId, albumData);
    }
    
    // Update relationships
    if (!cache.tracks[trackId].albumIds.includes(albumId)) {
      cache.tracks[trackId].albumIds.push(albumId);
    }
    
    // Add to album's track list
    if (!album.trackIds.includes(trackId)) {
      album.trackIds.push(trackId);
    }
    
    // Update indexes
    addTrackToIndexes(cache, cache.tracks[trackId]);
  }
  
  await saveUnifiedTrackCache(userId);
}

/**
 * Add tracks from a playlist to cache
 */
export async function addPlaylistTracks(playlistId, playlistTracks, playlistName, userId) {
  const cache = getInMemoryCache(userId);
  const now = Date.now();
  
  // Initialize playlist if not exists
  if (!cache.playlists[playlistId]) {
    cache.playlists[playlistId] = {
      albums: {},
      lastUpdated: now,
      playlistName: playlistName || ''
    };
  }
  
  const playlist = cache.playlists[playlistId];
  playlist.lastUpdated = now;
  playlist.playlistName = playlistName || playlist.playlistName;
  
  // Group tracks by album
  const albumMap = new Map();
  
  for (const playlistTrack of playlistTracks) {
    const track = playlistTrack.track;
    if (!track || !track.album) continue;
    
    const albumId = track.album.id;
    const trackId = track.id;
    
    // Initialize album in playlist if not exists
    if (!playlist.albums[albumId]) {
      playlist.albums[albumId] = {
        trackIds: [],
        addedAt: playlistTrack.added_at || new Date().toISOString()
      };
    }
    
    // Add track ID to playlist album
    if (!playlist.albums[albumId].trackIds.includes(trackId)) {
      playlist.albums[albumId].trackIds.push(trackId);
    }
    
    // Add track to cache if not exists
    if (!cache.tracks[trackId]) {
      cache.tracks[trackId] = createTrackObject(track, trackId, now, albumId);
    }
    
    // Update relationships
    if (!cache.tracks[trackId].albumIds.includes(albumId)) {
      cache.tracks[trackId].albumIds.push(albumId);
    }
    if (!cache.tracks[trackId].playlistIds.includes(playlistId)) {
      cache.tracks[trackId].playlistIds.push(playlistId);
    }
    
    // Update indexes
    addTrackToIndexes(cache, cache.tracks[trackId]);
    
    // Track album for later album metadata update
    if (!albumMap.has(albumId)) {
      albumMap.set(albumId, {
        id: albumId,
        name: track.album.name,
        artistName: track.artists?.[0]?.name || ''
      });
    }
  }
  
  // Update album metadata in cache.albums
  for (const [albumId, albumData] of albumMap) {
    if (!cache.albums[albumId]) {
      cache.albums[albumId] = {
        trackIds: [],
        lastUpdated: now,
        albumTitle: albumData.name,
        artistName: albumData.artistName
      };
    }
  }
  
  await saveUnifiedTrackCache(userId);
}

/**
 * Move an album from one playlist to another in the unified cache
 * @param {string} sourcePlaylistId - Source playlist ID
 * @param {string} targetPlaylistId - Target playlist ID
 * @param {string} albumId - Album ID to move
 * @param {string} userId - User ID
 * @param {string} addedAt - When album was added to target playlist (ISO string)
 */
export async function moveAlbumBetweenPlaylists(sourcePlaylistId, targetPlaylistId, albumId, userId, addedAt) {
  const cache = getInMemoryCache(userId);
  const now = Date.now();
  
  // Ensure cache is loaded
  if (!cache) {
    throw new Error(`Cache not loaded for user ${userId}`);
  }
  
  // Get the album entry from source playlist
  if (!cache.playlists[sourcePlaylistId] || !cache.playlists[sourcePlaylistId].albums[albumId]) {
    logCache(`Album ${albumId} not found in source playlist ${sourcePlaylistId}, cannot move`);
    return;
  }
  
  const albumEntry = cache.playlists[sourcePlaylistId].albums[albumId];
  const trackIds = albumEntry.trackIds || [];
  
  // Initialize target playlist if it doesn't exist
  if (!cache.playlists[targetPlaylistId]) {
    cache.playlists[targetPlaylistId] = {
      albums: {},
      lastUpdated: now,
      playlistName: ''
    };
  }
  
  const targetPlaylist = cache.playlists[targetPlaylistId];
  targetPlaylist.lastUpdated = now;
  
  // Move album entry to target playlist
  targetPlaylist.albums[albumId] = {
    trackIds: [...trackIds], // Copy trackIds array
    addedAt: addedAt || new Date().toISOString()
  };
  
  // Remove album from source playlist
  delete cache.playlists[sourcePlaylistId].albums[albumId];
  
  // Update track playlist relationships
  for (const trackId of trackIds) {
    if (!cache.tracks[trackId]) {
      // Track doesn't exist in cache - this shouldn't happen but handle gracefully
      logCache(`Warning: Track ${trackId} not found in cache when moving album ${albumId}`);
      continue;
    }
    
    const track = cache.tracks[trackId];
    
    // Remove source playlist from track's playlistIds
    if (track.playlistIds) {
      track.playlistIds = track.playlistIds.filter(pid => pid !== sourcePlaylistId);
    } else {
      track.playlistIds = [];
    }
    
    // Add target playlist to track's playlistIds (if not already present)
    if (!track.playlistIds.includes(targetPlaylistId)) {
      track.playlistIds.push(targetPlaylistId);
    }
    
    // Update track access time
    track.lastAccessed = now;
  }
  
  // Save the cache
  await saveUnifiedTrackCache(userId);
  
  logCache(`Moved album ${albumId} from playlist ${sourcePlaylistId} to ${targetPlaylistId}`);
}

/**
 * Match loved tracks to cached tracks
 */
async function matchLovedTracks(cache, lovedTracks, progressCallback) {
  let matchedCount = 0;
  const totalTracks = Object.keys(cache.tracks).length;
  
  for (const lovedTrack of lovedTracks) {
    const lovedTrackName = normalizeTrackName(lovedTrack.name);
    const lovedArtistName = normalizeArtistName(lovedTrack.artist?.name || '');
    
    // Try exact match first
    let matched = false;
    
    if (cache.indexes.byTrackName[lovedTrackName]) {
      // Check all artists for this track name
      for (const [artistName, trackIds] of Object.entries(cache.indexes.byTrackName[lovedTrackName])) {
        if (artistName === lovedArtistName) {
          // Exact match found
          for (const trackId of trackIds) {
            if (cache.tracks[trackId] && !cache.tracks[trackId].loved) {
              cache.tracks[trackId].loved = true;
              cache.tracks[trackId].lastLovedUpdate = Date.now();
              addTrackToLovedIndex(cache, trackId);
              matched = true;
              matchedCount++;
            }
          }
          break;
        }
      }
    }
    
    // Try fuzzy match if no exact match
    if (!matched) {
      for (const trackId in cache.tracks) {
        const track = cache.tracks[trackId];
        if (track.loved) continue; // Already matched
        
        const trackName = normalizeTrackName(track.name);
        const trackArtists = track.artists || [];
        
        // Check if track name is similar
        if (isSimilar(trackName, lovedTrackName, 0.85)) {
          // Check if any artist matches
          const artistMatch = trackArtists.some(artist => {
            const artistName = normalizeArtistName(artist.name);
            return artistName === lovedArtistName || isSimilar(artistName, lovedArtistName, 0.85);
          });
          
          if (artistMatch) {
            track.loved = true;
            track.lastLovedUpdate = Date.now();
            addTrackToLovedIndex(cache, trackId);
            matched = true;
            matchedCount++;
            break;
          }
        }
      }
    }
    
    // Progress callback
    if (progressCallback && matchedCount % 10 === 0) {
      progressCallback({
        phase: 'matching',
        current: matchedCount,
        total: lovedTracks.length,
        message: `Matching loved tracks (${matchedCount} of ${lovedTracks.length})...`
      });
    }
  }
  
  return matchedCount;
}

/**
 * Refresh playcounts for tracks (from Last.fm API)
 * @param {Function} getTrackInfoFn - Function to get track info from Last.fm
 * @param {Boolean} forceRefresh - If true, ignore threshold and always fetch fresh data
 */
export async function refreshPlaycounts(trackIds, lastFmUserName, userId, progressCallback, getTrackInfoFn, forceRefresh = false) {
  const cache = getInMemoryCache(userId);
  
  const now = Date.now();
  let updatedCount = 0;
  
  // Batch process tracks (50 at a time to avoid rate limits)
  const batchSize = 50;
  for (let i = 0; i < trackIds.length; i += batchSize) {
    const batch = trackIds.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (trackId) => {
      const track = cache.tracks[trackId];
      if (!track) return;
      
      // Skip if recently updated (unless force refresh is requested)
      if (!forceRefresh && track.lastPlaycountUpdate && (now - track.lastPlaycountUpdate) < PLAYCOUNT_REFRESH_THRESHOLD) {
        return;
      }
      
      try {
        const artistName = track.artists?.[0]?.name;
        if (!artistName || !getTrackInfoFn) return;
        
        const trackInfo = await getTrackInfoFn(track.name, artistName, lastFmUserName);
        const playcount = parseInt(trackInfo.track?.userplaycount || '0', 10);
        
        track.playcount = playcount;
        track.lastPlaycountUpdate = now;
        updateTrackAccess(cache, trackId);
        updatedCount++;
      } catch (error) {
        logCache(`Failed to fetch playcount for track ${trackId}:`, error);
        // Mark as needing refresh but continue
        track.lastPlaycountUpdate = null;
      }
    }));
    
    // Small delay between batches
    if (i + batchSize < trackIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Progress callback
    if (progressCallback) {
      progressCallback({
        phase: 'playcounts',
        current: Math.min(i + batchSize, trackIds.length),
        total: trackIds.length,
        message: `Fetching playcounts...`
      });
    }
  }
  
  await saveUnifiedTrackCache(userId);
  return updatedCount;
}

/**
 * Refresh loved tracks (from Last.fm API)
 * @param {Function} getUserLovedTracksFn - Function to get user's loved tracks from Last.fm
 */
export async function refreshLovedTracks(lastFmUserName, userId, progressCallback, getUserLovedTracksFn) {
  const cache = getInMemoryCache(userId);
  
  if (!getUserLovedTracksFn) {
    throw new Error('getUserLovedTracks function is required');
  }
  
  try {
    // First, clear all existing loved status to ensure fresh state
    // This handles cases where tracks were unloved on Last.fm
    for (const trackId in cache.tracks) {
      if (cache.tracks[trackId].loved) {
        cache.tracks[trackId].loved = false;
      }
    }
    // Clear lovedTrackIds index
    cache.indexes.lovedTrackIds = [];
    
    // Fetch all loved tracks (paginated)
    let allLovedTracks = [];
    let page = 1;
    const limit = 1000; // Max per page
    
    while (true) {
      const response = await getUserLovedTracksFn(lastFmUserName, limit, page);
      const lovedTracks = response.lovedtracks?.track || [];
      
      if (!lovedTracks.length) break;
      
      allLovedTracks = allLovedTracks.concat(lovedTracks);
      
      // Check if there are more pages
      const totalPages = Math.ceil((response.lovedtracks?.['@attr']?.total || 0) / limit);
      if (page >= totalPages) break;
      
      page++;
    }
    
    // Match loved tracks to cached tracks
    const matchedCount = await matchLovedTracks(cache, allLovedTracks, progressCallback);
    
    // Update metadata
    cache.metadata.lastLovedUpdate = Date.now();
    
    await saveUnifiedTrackCache(userId);
    
    return {
      totalLovedTracks: allLovedTracks.length,
      matchedCount
    };
  } catch (error) {
    logCache('Error refreshing loved tracks:', error);
    throw error;
  }
}

/**
 * Build cache for a specific playlist when tracklist is enabled
 * @param {Function} getAllPlaylistTracksFn - Function to get all playlist tracks from Spotify
 * @param {Function} getPlaylistFn - Function to get playlist info from Spotify
 * @param {Function} getUserLovedTracksFn - Function to get user's loved tracks from Last.fm
 * @param {Function} getTrackInfoFn - Function to get track info from Last.fm
 */
export async function buildPlaylistCache(
  playlistId, 
  userId, 
  lastFmUserName, 
  progressCallback,
  getAllPlaylistTracksFn,
  getPlaylistFn,
  getUserLovedTracksFn,
  getTrackInfoFn
) {
  const cache = await loadUnifiedTrackCache(userId, lastFmUserName);
  
  if (!getAllPlaylistTracksFn || !getPlaylistFn) {
    throw new Error('Spotify API functions are required');
  }
  
  // Check if playlist is already cached
  if (isPlaylistCached(playlistId, userId)) {
    const existingPlaylist = cache.playlists[playlistId];
    const albumKeys = Object.keys(existingPlaylist.albums);
    logCache(`Playlist ${playlistId} already cached with ${albumKeys.length} album(s), skipping rebuild`);
    if (progressCallback) {
      progressCallback({
        phase: 'complete',
        message: `Cache already exists`
      });
    }
    return; // Skip rebuild if cache exists
  }
  
  try {
    // Phase 1: Fetch playlist tracks
    if (progressCallback) {
      progressCallback({
        phase: 'loading',
        message: `Loading tracks for playlist...`
      });
    }
    
    const playlistTracks = await getAllPlaylistTracksFn(playlistId);
    const playlist = await getPlaylistFn(playlistId);
    
    await addPlaylistTracks(playlistId, playlistTracks, playlist.name, userId);
    
    if (progressCallback) {
      progressCallback({
        phase: 'loaded',
        message: `Loaded ${playlistTracks.length} tracks`
      });
    }
    
    // Phase 2: Match loved tracks
    if (lastFmUserName && getUserLovedTracksFn) {
      if (progressCallback) {
        progressCallback({
          phase: 'matching',
          message: `Matching loved tracks...`
        });
      }
      
      await refreshLovedTracks(lastFmUserName, userId, progressCallback, getUserLovedTracksFn);
    }
    
    // Phase 3: Fetch playcounts
    const trackIds = Object.keys(cache.tracks).filter(trackId => {
      const track = cache.tracks[trackId];
      return track.playlistIds.includes(playlistId);
    });
    
    if (lastFmUserName && trackIds.length > 0 && getTrackInfoFn) {
      if (progressCallback) {
        progressCallback({
          phase: 'playcounts',
          message: `Fetching playcounts from Last.fm...`
        });
      }
      
      // Await playcount refresh during initial cache build and force refresh to get fresh data
      await refreshPlaycounts(trackIds, lastFmUserName, userId, progressCallback, getTrackInfoFn, true);
    }
    
    if (progressCallback) {
      progressCallback({
        phase: 'complete',
        message: `Cache build complete`
      });
    }
  } catch (error) {
    logCache('Error building playlist cache:', error);
    throw error;
  }
}

/**
 * Retry failed sync operations (loved/unloved tracks)
 * @param {Function} loveTrackFn - Function to love a track
 * @param {Function} unloveTrackFn - Function to unlove a track
 */
export async function retryFailedSyncs(userId, lastFmUserName, sessionKey, loveTrackFn, unloveTrackFn) {
  const cache = getInMemoryCache(userId);
  
  if (!cache.metadata.unsyncedLovedTracks.length) {
    return { retried: 0, succeeded: 0, failed: 0 };
  }
  
  if (!loveTrackFn || !unloveTrackFn) {
    logCache('Love/unlove functions not provided, skipping retry');
    return { retried: 0, succeeded: 0, failed: 0 };
  }
  
  const unsynced = cache.metadata.unsyncedLovedTracks.filter(item => item.retryCount < 10);
  let succeeded = 0;
  let failed = 0;
  
  for (const item of unsynced) {
    const track = cache.tracks[item.trackId];
    if (!track) continue;
    
    try {
      await syncLovedStatusToLastFm(
        track.name,
        track.artists?.[0]?.name || '',
        item.loved,
        sessionKey,
        userId,
        item.trackId,
        loveTrackFn,
        unloveTrackFn
      );
      succeeded++;
    } catch (error) {
      failed++;
      logCache(`Retry failed for track ${item.trackId}:`, error);
    }
  }
  
  return {
    retried: unsynced.length,
    succeeded,
    failed
  };
}

/**
 * Get count of unsynced changes
 */
export function getUnsyncedChangesCount(userId) {
  try {
    const cache = getInMemoryCache(userId);
    return cache.metadata.unsyncedLovedTracks.length;
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate loved track percentage for an album
 */
export async function calculateAlbumLovedPercentage(albumId, userId) {
  const cache = getInMemoryCache(userId);
  
  if (!cache.albums[albumId]) {
    return { lovedCount: 0, totalCount: 0, percentage: 0 };
  }
  
  const trackIds = cache.albums[albumId].trackIds || [];
  let lovedCount = 0;
  
  for (const trackId of trackIds) {
    if (cache.tracks[trackId]?.loved) {
      lovedCount++;
    }
  }
  
  const totalCount = trackIds.length;
  const percentage = totalCount > 0 ? Math.round((lovedCount / totalCount) * 100) : 0;
  
  return { lovedCount, totalCount, percentage };
}

/**
 * Get cache statistics
 */
export function getCacheStats(userId) {
  try {
    const cache = getInMemoryCache(userId);
    return {
      totalTracks: cache.metadata.totalTracks,
      totalAlbums: cache.metadata.totalAlbums,
      totalPlaylists: cache.metadata.totalPlaylists,
      lovedTracks: cache.indexes.lovedTrackIds.length,
      unsyncedChanges: cache.metadata.unsyncedLovedTracks.length,
      lastUpdated: cache.metadata.lastUpdated
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get all track IDs from cache
 */
export function getAllTrackIds(userId) {
  try {
    const cache = getInMemoryCache(userId);
    return Object.keys(cache.tracks);
  } catch (error) {
    return [];
  }
}

/**
 * Check if a playlist is already cached (has tracks)
 */
export function isPlaylistCached(playlistId, userId) {
  try {
    const cache = getInMemoryCache(userId);
    const existingPlaylist = cache?.playlists[playlistId];
    if (!existingPlaylist || !existingPlaylist.albums) {
      return false;
    }
    const albumKeys = Object.keys(existingPlaylist.albums);
    return albumKeys.some(albumId => {
      const album = existingPlaylist.albums[albumId];
      return album && album.trackIds && album.trackIds.length > 0;
    });
  } catch (error) {
    return false;
  }
}

/**
 * Clear the unified track cache
 */
export async function clearUnifiedTrackCache(userId) {
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  clearCache(cacheKey);
  inMemoryCache.delete(userId);
  if (saveTimers.has(userId)) {
    clearTimeout(saveTimers.get(userId));
    saveTimers.delete(userId);
  }
  logCache(`Cleared unified track cache for user ${userId}`);
}

/**
 * LRU Eviction: Evict orphaned tracks when storage quota is exceeded
 */
async function evictLRUTracks(userId) {
  const cache = getInMemoryCache(userId);
  
  // Find orphaned tracks (not in any playlist)
  const orphanedTracks = Object.keys(cache.tracks).filter(trackId => {
    const track = cache.tracks[trackId];
    return track.playlistIds.length === 0;
  });
  
  // Sort by lastAccessed (oldest first)
  orphanedTracks.sort((a, b) => {
    const trackA = cache.tracks[a];
    const trackB = cache.tracks[b];
    const accessA = trackA.lastAccessed || 0;
    const accessB = trackB.lastAccessed || 0;
    return accessA - accessB;
  });
  
  // Evict orphaned tracks (oldest first)
  let evictedCount = 0;
  for (const trackId of orphanedTracks) {
    const track = cache.tracks[trackId];
    
    // Never evict loved tracks
    if (track.loved) continue;
    
    // Remove track
    removeTrackFromIndexes(cache, trackId, track);
    delete cache.tracks[trackId];
    evictedCount++;
    
    // Try saving after each eviction to see if we have enough space
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
      setCache(cacheKey, cache);
      logCache(`Evicted ${evictedCount} tracks, save succeeded`);
      break; // Success, stop evicting
    } catch (error) {
      // Continue evicting
      if (evictedCount % 100 === 0) {
        logCache(`Evicted ${evictedCount} tracks, still need more space...`);
      }
    }
  }
  
  // If still not enough space, evict non-loved tracks by lastAccessed
  if (evictedCount === 0 || orphanedTracks.length === 0) {
    const allTracks = Object.keys(cache.tracks)
      .map(trackId => ({ trackId, track: cache.tracks[trackId] }))
      .filter(({ track }) => !track.loved && track.playlistIds.length > 0) // Non-loved tracks in playlists
      .sort((a, b) => {
        const accessA = a.track.lastAccessed || 0;
        const accessB = b.track.lastAccessed || 0;
        return accessA - accessB;
      });
    
    for (const { trackId, track } of allTracks) {
      removeTrackFromIndexes(cache, trackId, track);
      delete cache.tracks[trackId];
      evictedCount++;
      
      try {
        const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
        setCache(cacheKey, cache);
        logCache(`Evicted ${evictedCount} tracks (including playlist tracks), save succeeded`);
        break;
      } catch (error) {
        // Continue evicting
      }
    }
  }
  
  logCache(`LRU eviction complete: evicted ${evictedCount} tracks`);
  return evictedCount;
}

/**
 * Get per-playlist tracklist preference
 */
export function getTracklistPreference(playlistId) {
  const key = `${TRACKLIST_PREFERENCE_PREFIX}${playlistId}`;
  const value = localStorage.getItem(key);
  return value === 'true';
}

/**
 * Set per-playlist tracklist preference
 */
export function setTracklistPreference(playlistId, enabled) {
  const key = `${TRACKLIST_PREFERENCE_PREFIX}${playlistId}`;
  localStorage.setItem(key, enabled ? 'true' : 'false');
}

