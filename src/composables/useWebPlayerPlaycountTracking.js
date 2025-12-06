import { ref, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { logPlayer } from '../utils/logger';

// Global Set to track playcount increments (prevent duplicates)
// Key format: trackId_timestamp
const trackedPlaycountSessions = new Set();

/**
 * Composable to track playcount increments based on Spotify web player
 * Detects when tracks finish and increments playcount in cache
 */
export function useWebPlayerPlaycountTracking(onPlaycountUpdate) {
  const { currentTrack, position, duration, isPlaying } = useSpotifyPlayer();
  const { getPlaycountForTrack, updatePlaycountForTrack } = useUnifiedTrackCache();
  
  // Track the current track being monitored
  const trackedTrack = ref(null);
  const trackedTrackStartTime = ref(null);
  const trackedTrackDuration = ref(0);
  const playcountIncremented = ref(false);
  
  /**
   * Increment playcount for a finished track
   * @param {Object} track - Track info { id, name, artists }
   * @param {number} startTime - Track start timestamp
   */
  const incrementPlaycount = async (track, startTime) => {
    if (!track || !track.id || !track.name) {
      return;
    }
    
    // Create unique key for deduplication
    const trackKey = `${track.id}_${startTime}`;
    
    // Only increment if we haven't already for this track session
    if (trackedPlaycountSessions.has(trackKey)) {
      logPlayer(`[PLAYCOUNT] Already incremented for track session: ${track.name}`);
      return;
    }
    
    // Mark as incremented immediately (synchronously) to prevent double-counting
    trackedPlaycountSessions.add(trackKey);
    
    try {
      // Get current playcount from cache
      const currentPlaycount = getPlaycountForTrack(track.id) || 0;
      
      // Increment playcount
      const newPlaycount = currentPlaycount + 1;
      
      // Update cache
      await updatePlaycountForTrack(track.id, newPlaycount);
      
      logPlayer(`[PLAYCOUNT] Incremented playcount for "${track.name}" from ${currentPlaycount} to ${newPlaycount}`);
      
      // Notify listener for UI updates
      if (onPlaycountUpdate) {
        onPlaycountUpdate(track.id, newPlaycount);
      }
    } catch (error) {
      logPlayer(`[PLAYCOUNT] Error incrementing playcount for "${track.name}":`, error);
      // Remove from set on error so it can be retried
      trackedPlaycountSessions.delete(trackKey);
    }
  };
  
  /**
   * Handle when a track finishes
   * @param {Object} trackInfo - Optional track info to use (captured before track changes)
   * @param {number} startTime - Optional track start time (captured before track changes)
   */
  const handleTrackFinished = async (trackInfo = null, startTime = null) => {
    // Use provided track info, or fall back to trackedTrack
    const trackToProcess = trackInfo || trackedTrack.value;
    const trackStartTime = startTime !== null ? startTime : trackedTrackStartTime.value;
    
    if (!trackToProcess || !trackStartTime) {
      return;
    }
    
    // Check if we've already incremented this session using the Set
    const trackKey = `${trackToProcess.id}_${trackStartTime}`;
    if (trackedPlaycountSessions.has(trackKey)) {
      logPlayer(`[PLAYCOUNT] Already incremented for track session: ${trackToProcess.name}`);
      return;
    }
    
    // Only increment if we haven't already for this instance
    if (!playcountIncremented.value || trackInfo) {
      await incrementPlaycount(trackToProcess, trackStartTime);
      playcountIncremented.value = true;
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
    trackedTrackDuration.value = duration.value || 0;
    playcountIncremented.value = false;
    
    logPlayer(`[PLAYCOUNT] Started tracking: ${trackedTrack.value.name}`);
  };
  
  /**
   * Check if track has finished (position reached duration)
   * Only detects position-based finishes - track changes are handled by the watch
   */
  const checkTrackFinished = () => {
    if (!trackedTrack.value || !isPlaying.value || playcountIncremented.value) {
      return;
    }
    
    // Make sure we're still tracking the current track (if not, let the watch handle it)
    if (trackedTrack.value.id !== currentTrack.value?.id) {
      // Track changed - let the watch handle it, don't do anything here
      return;
    }
    
    // Update duration if it changed
    if (duration.value > 0 && duration.value !== trackedTrackDuration.value) {
      trackedTrackDuration.value = duration.value;
    }
    
    // Check if track has finished (position reached duration within 500ms tolerance)
    if (trackedTrackDuration.value > 0 && position.value > 0) {
      const remainingTime = trackedTrackDuration.value - position.value;
      if (remainingTime <= 500) {
        // Track finished - capture current track info before any potential change
        const currentTrackInfo = trackedTrack.value ? { ...trackedTrack.value } : null;
        const currentStartTime = trackedTrackStartTime.value;
        handleTrackFinished(currentTrackInfo, currentStartTime);
      }
    }
  };
  
  // Watch for track changes
  watch(() => currentTrack.value?.id, (newTrackId, oldTrackId) => {
    if (oldTrackId && newTrackId !== oldTrackId) {
      // Track changed - capture old track info BEFORE overwriting
      const oldTrackInfo = trackedTrack.value ? { ...trackedTrack.value } : null;
      const oldStartTime = trackedTrackStartTime.value;
      
      // Handle previous track first with captured info
      handleTrackFinished(oldTrackInfo, oldStartTime);
      // Then initialize tracking for new track
      initializeTrackTracking();
    } else if (newTrackId && !oldTrackId) {
      // New track started (first track)
      initializeTrackTracking();
    } else if (!newTrackId && oldTrackId) {
      // Track stopped/cleared - capture info before clearing
      const oldTrackInfo = trackedTrack.value ? { ...trackedTrack.value } : null;
      const oldStartTime = trackedTrackStartTime.value;
      
      handleTrackFinished(oldTrackInfo, oldStartTime);
      trackedTrack.value = null;
    }
  });
  
  // Watch position and duration to detect track finish
  watch([position, duration, isPlaying], () => {
    if (currentTrack.value && isPlaying.value) {
      checkTrackFinished();
    }
  });
  
  return {
    // Expose for debugging/testing
    trackedTrack,
    playcountIncremented
  };
}

