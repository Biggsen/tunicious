import { ref } from 'vue';
import { useLastFmApi } from './useLastFmApi';
import { logLastFm } from '@utils/logger';

// Singleton state - shared across all component instances
const currentPlayingTrack = ref(null);
const loading = ref(false);
const error = ref(null);
const refreshInterval = ref(null);
let activeLastFmUserName = null;
let pollingIntervalMs = 30000;

/**
 * Fetch the currently playing track from Last.fm
 */
const fetchCurrentPlayingTrack = async () => {
  if (!activeLastFmUserName) return;

  const { getUserRecentTracks } = useLastFmApi();

  try {
    loading.value = true;
    error.value = null;

    // Get recent tracks (limit to 1 to get the most recent)
    const response = await getUserRecentTracks(activeLastFmUserName, 1);
    const tracks = response.recenttracks?.track || [];

    if (Array.isArray(tracks) && tracks.length > 0) {
      const mostRecentTrack = tracks[0];
      // Check if this track is currently playing
      if (mostRecentTrack['@attr']?.nowplaying) {
        currentPlayingTrack.value = {
          name: mostRecentTrack.name,
          artist: mostRecentTrack.artist['#text'],
          album: mostRecentTrack.album?.['#text'] || '',
          image: mostRecentTrack.image?.[0]?.['#text'] || ''
        };
      } else {
        // No track is currently playing
        currentPlayingTrack.value = null;
      }
    } else if (tracks && !Array.isArray(tracks)) {
      // Handle single track response
      const track = tracks;
      if (track['@attr']?.nowplaying) {
        currentPlayingTrack.value = {
          name: track.name,
          artist: track.artist['#text'],
          album: track.album?.['#text'] || '',
          image: track.image?.[0]?.['#text'] || ''
        };
      } else {
        currentPlayingTrack.value = null;
      }
    } else {
      currentPlayingTrack.value = null;
    }
  } catch (err) {
    logLastFm('Error fetching current playing track:', err);
    error.value = err.message;
    currentPlayingTrack.value = null;
  } finally {
    loading.value = false;
  }
};

/**
 * Start polling for current playing track updates (singleton - only one interval runs)
 * @param {string} lastFmUserName - The Last.fm username to poll for
 * @param {number} intervalMs - Polling interval in milliseconds (default: 30 seconds)
 */
const startPolling = (lastFmUserName, intervalMs = 30000) => {
  if (!lastFmUserName) return;

  // Update the active username and interval
  activeLastFmUserName = lastFmUserName;
  pollingIntervalMs = intervalMs;

  // If polling is already running, just update the username
  if (refreshInterval.value) {
    // Fetch immediately with new username
    fetchCurrentPlayingTrack();
    return;
  }

  // Fetch immediately
  fetchCurrentPlayingTrack();
  
  // Set up interval for regular updates
  refreshInterval.value = setInterval(() => {
    fetchCurrentPlayingTrack();
  }, pollingIntervalMs);
};

/**
 * Stop polling for current playing track updates
 * Note: This stops the singleton polling, so only call when no components need it
 */
const stopPolling = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value);
    refreshInterval.value = null;
  }
  activeLastFmUserName = null;
};

/**
 * Check if a specific track matches the currently playing track
 * @param {string} trackName - The track name to check
 * @param {string} artistName - The artist name to check
 * @returns {boolean} - Whether this track is currently playing
 */
const isTrackCurrentlyPlaying = (trackName, artistName) => {
  if (!currentPlayingTrack.value) return false;
  
  return (
    currentPlayingTrack.value.name?.toLowerCase() === trackName?.toLowerCase() &&
    currentPlayingTrack.value.artist?.toLowerCase() === artistName?.toLowerCase()
  );
};

/**
 * Composable for accessing current playing track state
 * This is a read-only interface - polling is managed separately
 */
export function useCurrentPlayingTrack() {
  return {
    currentPlayingTrack,
    loading,
    error,
    fetchCurrentPlayingTrack,
    startPolling,
    stopPolling,
    isTrackCurrentlyPlaying
  };
}


