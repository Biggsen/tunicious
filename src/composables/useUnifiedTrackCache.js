import { ref, computed, onMounted, watch } from 'vue';
import { 
  loadUnifiedTrackCache,
  getAlbumTracks,
  getPlaylistTracks,
  getPlaylistAlbumTracks,
  isTrackLoved,
  getTrackPlaycount,
  updateTrackLoved,
  updateTrackPlaycount,
  addAlbumTracks,
  addPlaylistTracks,
  buildPlaylistCache,
  refreshLovedTracks,
  refreshPlaycounts,
  calculateAlbumLovedPercentage,
  getCacheStats,
  clearUnifiedTrackCache,
  getTracklistPreference,
  setTracklistPreference,
  retryFailedSyncs,
  getUnsyncedChangesCount
} from '../utils/unifiedTrackCache';
import { useUserData } from './useUserData';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { useLastFmApi } from './useLastFmApi';
import { logCache } from '../utils/logger';

/**
 * Composable for using the unified track cache in Vue components
 */
export function useUnifiedTrackCache() {
  const { user, userData } = useUserData();
  const { 
    getAllPlaylistTracks: getAllPlaylistTracksFn,
    getPlaylist: getPlaylistFn,
    getAlbumTracks: getAlbumTracksFn
  } = useUserSpotifyApi();
  const { 
    getUserLovedTracks: getUserLovedTracksFn,
    getTrackInfo: getTrackInfoFn,
    loveTrack: loveTrackFn,
    unloveTrack: unloveTrackFn
  } = useLastFmApi();

  const cacheLoaded = ref(false);
  const loading = ref(false);
  const error = ref(null);
  const buildProgress = ref(null);

  /**
   * Initialize cache for current user
   */
  const initializeCache = async () => {
    if (!user.value || !userData.value) {
      return;
    }

    try {
      loading.value = true;
      error.value = null;
      
      await loadUnifiedTrackCache(
        user.value.uid,
        userData.value.lastFmUserName || ''
      );
      
      cacheLoaded.value = true;
    } catch (err) {
      logCache('Error initializing unified track cache:', err);
      error.value = err.message || 'Failed to initialize cache';
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get tracks for an album
   */
  const getAlbumTracksForAlbum = async (albumId) => {
    if (!user.value) return [];
    try {
      return await getAlbumTracks(albumId, user.value.uid);
    } catch (err) {
      logCache(`Error getting album tracks for ${albumId}:`, err);
      return [];
    }
  };

  /**
   * Get tracks for an album within a playlist
   */
  const getAlbumTracksForPlaylist = async (playlistId, albumId) => {
    if (!user.value) return [];
    try {
      return await getPlaylistAlbumTracks(playlistId, albumId, user.value.uid);
    } catch (err) {
      logCache(`Error getting playlist album tracks:`, err);
      return [];
    }
  };

  /**
   * Get all tracks for a playlist
   */
  const getTracksForPlaylist = async (playlistId) => {
    if (!user.value) return [];
    try {
      return await getPlaylistTracks(playlistId, user.value.uid);
    } catch (err) {
      logCache(`Error getting playlist tracks:`, err);
      return [];
    }
  };

  /**
   * Check if track is loved
   */
  const checkTrackLoved = (trackId) => {
    if (!user.value) return false;
    try {
      return isTrackLoved(trackId, user.value.uid);
    } catch (err) {
      return false;
    }
  };

  /**
   * Get track playcount
   */
  const getPlaycountForTrack = (trackId) => {
    if (!user.value) return 0;
    try {
      return getTrackPlaycount(trackId, user.value.uid);
    } catch (err) {
      return 0;
    }
  };

  /**
   * Update track playcount in unified cache
   * Returns the updated playcount for UI updates
   */
  const updatePlaycountForTrack = async (trackId, playcount) => {
    if (!user.value) return;
    try {
      await updateTrackPlaycount(trackId, playcount, user.value.uid);
      return playcount;
    } catch (err) {
      logCache(`Error updating playcount for track ${trackId}:`, err);
      throw err;
    }
  };

  /**
   * Update track loved status
   */
  const updateLovedStatus = async (trackId, loved) => {
    if (!user.value || !userData.value) return;
    
    try {
      await updateTrackLoved(
        trackId,
        loved,
        user.value.uid,
        userData.value.lastFmUserName || '',
        userData.value.lastFmSessionKey || '',
        loveTrackFn,
        unloveTrackFn
      );
    } catch (err) {
      logCache(`Error updating loved status for track ${trackId}:`, err);
      throw err;
    }
  };

  /**
   * Build cache for a playlist (lazy loading when tracklist enabled)
   */
  const buildCacheForPlaylist = async (playlistId, progressCallback) => {
    if (!user.value || !userData.value) {
      throw new Error('User not authenticated');
    }

    try {
      loading.value = true;
      error.value = null;

      const progressHandler = (progress) => {
        buildProgress.value = progress;
        if (progressCallback) {
          progressCallback(progress);
        }
      };

      await buildPlaylistCache(
        playlistId,
        user.value.uid,
        userData.value.lastFmUserName || '',
        progressHandler,
        getAllPlaylistTracksFn,
        getPlaylistFn,
        getUserLovedTracksFn,
        getTrackInfoFn
      );
    } catch (err) {
      logCache(`Error building cache for playlist ${playlistId}:`, err);
      error.value = err.message || 'Failed to build cache';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Refresh loved tracks
   */
  const refreshLovedTracksForUser = async (progressCallback) => {
    if (!user.value || !userData.value?.lastFmUserName) {
      throw new Error('User or Last.fm username not available');
    }

    try {
      loading.value = true;
      return await refreshLovedTracks(
        userData.value.lastFmUserName,
        user.value.uid,
        progressCallback,
        getUserLovedTracksFn
      );
    } catch (err) {
      logCache('Error refreshing loved tracks:', err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Refresh playcounts for tracks
   * @param {Boolean} forceRefresh - If true, ignore threshold and always fetch fresh data (default: true for explicit user actions)
   */
  const refreshPlaycountsForTracks = async (trackIds, progressCallback, forceRefresh = true) => {
    if (!user.value || !userData.value?.lastFmUserName) {
      throw new Error('User or Last.fm username not available');
    }

    try {
      return await refreshPlaycounts(
        trackIds,
        userData.value.lastFmUserName,
        user.value.uid,
        progressCallback,
        getTrackInfoFn,
        forceRefresh
      );
    } catch (err) {
      logCache('Error refreshing playcounts:', err);
      throw err;
    }
  };

  /**
   * Calculate loved track percentage for an album
   */
  const getAlbumLovedPercentage = async (albumId) => {
    if (!user.value) {
      return { lovedCount: 0, totalCount: 0, percentage: 0 };
    }

    try {
      return await calculateAlbumLovedPercentage(albumId, user.value.uid);
    } catch (err) {
      logCache(`Error calculating loved percentage for album ${albumId}:`, err);
      return { lovedCount: 0, totalCount: 0, percentage: 0 };
    }
  };

  /**
   * Get cache statistics
   */
  const stats = computed(() => {
    if (!user.value) return null;
    try {
      return getCacheStats(user.value.uid);
    } catch (err) {
      return null;
    }
  });

  /**
   * Get unsynced changes count
   */
  const unsyncedCount = computed(() => {
    if (!user.value) return 0;
    try {
      return getUnsyncedChangesCount(user.value.uid);
    } catch (err) {
      return 0;
    }
  });

  /**
   * Retry failed syncs
   */
  const retrySyncs = async () => {
    if (!user.value || !userData.value) {
      return { retried: 0, succeeded: 0, failed: 0 };
    }

    try {
      return await retryFailedSyncs(
        user.value.uid,
        userData.value.lastFmUserName || '',
        userData.value.lastFmSessionKey || '',
        loveTrackFn,
        unloveTrackFn
      );
    } catch (err) {
      logCache('Error retrying syncs:', err);
      return { retried: 0, succeeded: 0, failed: 0 };
    }
  };

  /**
   * Clear cache
   */
  const clearCache = async () => {
    if (!user.value) return;
    try {
      await clearUnifiedTrackCache(user.value.uid);
      cacheLoaded.value = false;
    } catch (err) {
      logCache('Error clearing cache:', err);
      throw err;
    }
  };

  /**
   * Get tracklist preference for a playlist
   */
  const getPlaylistTracklistPreference = (playlistId) => {
    return getTracklistPreference(playlistId);
  };

  /**
   * Set tracklist preference for a playlist
   */
  const setPlaylistTracklistPreference = (playlistId, enabled) => {
    setTracklistPreference(playlistId, enabled);
  };

  // Initialize cache when user is available
  watch([user, userData], ([newUser, newUserData]) => {
    if (newUser && newUserData && !cacheLoaded.value) {
      initializeCache();
    }
  }, { immediate: true });

  onMounted(() => {
    if (user.value && userData.value && !cacheLoaded.value) {
      initializeCache();
    }
  });

  /**
   * Add album tracks to cache
   */
  const addAlbumTracksToCache = async (albumId, tracks, albumData) => {
    if (!user.value) return;
    try {
      await addAlbumTracks(albumId, tracks, albumData, user.value.uid);
    } catch (err) {
      logCache(`Error adding album tracks to cache for ${albumId}:`, err);
      throw err;
    }
  };

  return {
    // State
    cacheLoaded,
    loading,
    error,
    buildProgress,
    stats,
    unsyncedCount,

    // Methods
    initializeCache,
    getAlbumTracksForAlbum,
    getAlbumTracksForPlaylist,
    getTracksForPlaylist,
    checkTrackLoved,
    getPlaycountForTrack,
    updatePlaycountForTrack,
    updateLovedStatus,
    buildCacheForPlaylist,
    refreshLovedTracksForUser,
    refreshPlaycountsForTracks,
    getAlbumLovedPercentage,
    addAlbumTracksToCache,
    retrySyncs,
    clearCache,
    getPlaylistTracklistPreference,
    setPlaylistTracklistPreference
  };
}

