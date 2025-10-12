import { ref, onMounted, onUnmounted } from 'vue';
import { useLastFmApi } from './useLastFmApi';

export function useCurrentPlayingTrack(lastFmUserName) {
  const currentPlayingTrack = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const refreshInterval = ref(null);

  const { getUserRecentTracks } = useLastFmApi();

  /**
   * Fetch the currently playing track from Last.fm
   */
  const fetchCurrentPlayingTrack = async () => {
    if (!lastFmUserName) return;

    try {
      loading.value = true;
      error.value = null;

      // Get recent tracks (limit to 1 to get the most recent)
      const response = await getUserRecentTracks(lastFmUserName, 1);
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
      console.error('Error fetching current playing track:', err);
      error.value = err.message;
      currentPlayingTrack.value = null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Start polling for current playing track updates
   * @param {number} intervalMs - Polling interval in milliseconds (default: 30 seconds)
   */
  const startPolling = (intervalMs = 30000) => {
    // Fetch immediately
    fetchCurrentPlayingTrack();
    
    // Set up interval for regular updates
    refreshInterval.value = setInterval(() => {
      fetchCurrentPlayingTrack();
    }, intervalMs);
  };

  /**
   * Stop polling for current playing track updates
   */
  const stopPolling = () => {
    if (refreshInterval.value) {
      clearInterval(refreshInterval.value);
      refreshInterval.value = null;
    }
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

  onMounted(() => {
    if (lastFmUserName) {
      startPolling();
    }
  });

  onUnmounted(() => {
    stopPolling();
  });

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


