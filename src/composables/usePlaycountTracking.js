import { ref, watch, onUnmounted } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { useUserData } from './useUserData';
import { logPlayer } from '../utils/logger';

// Global event emitter for playcount updates
const playcountUpdateListeners = new Set();

// Scrobbling threshold constants
const SCROBBLE_THRESHOLD_PERCENTAGE = 0.5; // 50% of track duration
const SCROBBLE_THRESHOLD_TIME = 4 * 60 * 1000; // 4 minutes in milliseconds

/**
 * Composable to track playcounts based on Spotify playback
 * Monitors playback and increments playcount in unified cache when tracks meet scrobbling threshold
 */
export function usePlaycountTracking() {
  const { currentTrack, position, duration, isPlaying } = useSpotifyPlayer();
  const { updatePlaycountForTrack, getPlaycountForTrack } = useUnifiedTrackCache();
  const { user } = useUserData();

  // Track the current track being monitored
  const trackedTrack = ref(null);
  const trackedTrackStartTime = ref(null);
  const trackedTrackMaxPosition = ref(0);
  const trackedTrackDuration = ref(0);
  const thresholdMet = ref(false);
  const playcountIncremented = ref(false);

  // Track which tracks have had playcount incremented in this session (to avoid double-counting)
  // Key format: trackId_timestamp to handle same track played multiple times
  const incrementedTracks = ref(new Set());

  /**
   * Check if playback position meets scrobbling threshold
   */
  const checkScrobblingThreshold = (currentPosition, trackDuration) => {
    if (!trackDuration || trackDuration === 0) return false;

    // Check if 50% of duration has been played
    const percentageThreshold = trackDuration * SCROBBLE_THRESHOLD_PERCENTAGE;
    
    // Check if 4 minutes has been played
    const timeThreshold = SCROBBLE_THRESHOLD_TIME;

    // Threshold is the shorter of the two
    const threshold = Math.min(percentageThreshold, timeThreshold);

    return currentPosition >= threshold;
  };

  /**
   * Increment playcount for a track that met the threshold
   */
  const incrementPlaycountForTrack = async (trackId, trackName) => {
    if (!trackId || !user.value) {
      return;
    }

    // Check if we've already incremented this track in this session
    const trackKey = `${trackId}_${trackedTrackStartTime.value}`;
    if (incrementedTracks.value.has(trackKey)) {
      logPlayer('Playcount already incremented for this track play session');
      return;
    }

    try {
      // Get current playcount from cache
      const currentPlaycount = getPlaycountForTrack(trackId);
      
      // Increment playcount
      const newPlaycount = currentPlaycount + 1;
      
      // Update in unified cache
      await updatePlaycountForTrack(trackId, newPlaycount);
      
      // Notify listeners about playcount update
      playcountUpdateListeners.forEach(listener => {
        try {
          listener(trackId, newPlaycount);
        } catch (error) {
          logPlayer('Error in playcount update listener:', error);
        }
      });
      
      // Mark as incremented for this session
      incrementedTracks.value.add(trackKey);
      
      logPlayer(`Incremented playcount for track ${trackId} (${trackName}): ${currentPlaycount} -> ${newPlaycount}`);
      playcountIncremented.value = true;
    } catch (error) {
      logPlayer('Error incrementing playcount:', error);
    }
  };

  /**
   * Handle when a track finishes or changes
   */
  const handleTrackFinished = async () => {
    // If we had a tracked track and it met the threshold, increment playcount
    if (trackedTrack.value && thresholdMet.value && !playcountIncremented.value) {
      await incrementPlaycountForTrack(trackedTrack.value.id, trackedTrack.value.name);
    }
  };

  /**
   * Initialize tracking for a new track
   */
  const initializeTrackTracking = () => {
    if (!currentTrack.value) {
      return;
    }

    trackedTrack.value = { ...currentTrack.value };
    trackedTrackStartTime.value = Date.now();
    trackedTrackMaxPosition.value = 0;
    trackedTrackDuration.value = duration.value || 0;
    thresholdMet.value = false;
    playcountIncremented.value = false;
    
    logPlayer(`Started tracking playcount for track ${trackedTrack.value.id} (${trackedTrack.value.name})`);
  };

  /**
   * Monitor playback position to detect when threshold is met
   */
  const monitorPlayback = () => {
    if (!currentTrack.value || !isPlaying.value || !trackedTrack.value) {
      return;
    }

    // Make sure we're tracking the current track
    if (trackedTrack.value.id !== currentTrack.value.id) {
      // Track changed without being detected - handle previous track first
      handleTrackFinished();
      initializeTrackTracking();
      return;
    }

    // Update max position reached for this track
    if (position.value > trackedTrackMaxPosition.value) {
      trackedTrackMaxPosition.value = position.value;
    }

    // Update duration if it changed (shouldn't happen, but just in case)
    if (duration.value > 0 && duration.value !== trackedTrackDuration.value) {
      trackedTrackDuration.value = duration.value;
    }

    // Check if threshold is met
    if (!thresholdMet.value && trackedTrackDuration.value > 0) {
      const met = checkScrobblingThreshold(trackedTrackMaxPosition.value, trackedTrackDuration.value);
      if (met) {
        thresholdMet.value = true;
        logPlayer(`Scrobbling threshold met for track ${trackedTrack.value.id} (${trackedTrack.value.name}) - position: ${trackedTrackMaxPosition.value}ms, duration: ${trackedTrackDuration.value}ms`);
      }
    }
  };

  // Watch for track changes
  watch(() => currentTrack.value?.id, (newTrackId, oldTrackId) => {
    if (oldTrackId && newTrackId !== oldTrackId) {
      // Track changed - handle previous track first
      handleTrackFinished();
      // Then initialize tracking for new track
      initializeTrackTracking();
    } else if (newTrackId && !oldTrackId) {
      // New track started (first track)
      initializeTrackTracking();
    } else if (!newTrackId && oldTrackId) {
      // Track stopped/cleared
      handleTrackFinished();
      trackedTrack.value = null;
    }
  });

  // Watch position and duration to monitor playback progress
  watch([position, duration, isPlaying], () => {
    if (currentTrack.value && isPlaying.value) {
      monitorPlayback();
    }
  });

  // Also check when playback stops (track finished or paused)
  watch(isPlaying, (newIsPlaying, oldIsPlaying) => {
    if (oldIsPlaying && !newIsPlaying && trackedTrack.value) {
      // Playback stopped - check if we should increment playcount
      // Only increment if threshold was met
      if (thresholdMet.value && !playcountIncremented.value) {
        handleTrackFinished();
      }
    }
  });

  // Cleanup: handle any track that was playing when component unmounts
  onUnmounted(() => {
    if (trackedTrack.value && thresholdMet.value && !playcountIncremented.value) {
      handleTrackFinished();
    }
  });

  /**
   * Register a listener for playcount updates
   * Listener receives (trackId, newPlaycount)
   */
  const onPlaycountUpdate = (listener) => {
    playcountUpdateListeners.add(listener);
    return () => {
      playcountUpdateListeners.delete(listener);
    };
  };

  return {
    thresholdMet,
    trackedTrackMaxPosition,
    trackedTrackDuration,
    onPlaycountUpdate
  };
}

