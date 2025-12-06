import { ref, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { logPlayer } from '../utils/logger';

// Global simulation state for POC (shared across all instances)
// Array of results: { trackId, trackName, artist, timestamp }
const simulatedIncrements = ref([]);

// Global Set to track simulated track sessions (prevent duplicates)
// Key format: trackId_timestamp
const simulatedTrackSessions = new Set();

/**
 * Composable to simulate playcount increments based on Spotify web player
 * Detects when tracks finish and simulates increment (POC - no cache updates)
 */
export function useWebPlayerPlaycountSimulation() {
  const { currentTrack, position, duration, isPlaying } = useSpotifyPlayer();
  
  // Track the current track being monitored
  const trackedTrack = ref(null);
  const trackedTrackStartTime = ref(null);
  const trackedTrackDuration = ref(0);
  const hasSimulated = ref(false);
  
  /**
   * Simulate playcount increment for a finished track
   * @param {Object} track - Track info { id, name, artists }
   * @param {number} startTime - Track start timestamp
   */
  const simulatePlaycountIncrement = (track, startTime) => {
    if (!track || !track.id || !track.name) {
      return;
    }
    
    // Create unique key for deduplication
    const trackKey = `${track.id}_${startTime}`;
    
    // Only simulate if we haven't already for this track session
    if (simulatedTrackSessions.has(trackKey)) {
      logPlayer(`[SIMULATION] Already simulated for track session: ${track.name}`);
      return;
    }
    
    // Mark as simulated immediately (synchronously)
    simulatedTrackSessions.add(trackKey);
    
    const result = {
      trackId: track.id,
      trackName: track.name,
      artist: track.artists?.[0] || 'Unknown Artist',
      timestamp: Date.now()
    };
    
    simulatedIncrements.value.push(result);
    logPlayer(`[SIMULATION] Playcount would increment for: ${track.name} by ${result.artist}`);
  };
  
  /**
   * Handle when a track finishes
   * @param {Object} trackInfo - Optional track info to use (captured before track changes)
   * @param {number} startTime - Optional track start time (captured before track changes)
   */
  const handleTrackFinished = (trackInfo = null, startTime = null) => {
    // Use provided track info, or fall back to trackedTrack
    const trackToProcess = trackInfo || trackedTrack.value;
    const trackStartTime = startTime !== null ? startTime : trackedTrackStartTime.value;
    
    if (!trackToProcess || !trackStartTime) {
      return;
    }
    
    // Check if we've already simulated this session using the Set
    const trackKey = `${trackToProcess.id}_${trackStartTime}`;
    if (simulatedTrackSessions.has(trackKey)) {
      logPlayer(`[SIMULATION] Already simulated for track session: ${trackToProcess.name}`);
      return;
    }
    
    // Only simulate if we haven't already for this instance
    if (!hasSimulated.value || trackInfo) {
      simulatePlaycountIncrement(trackToProcess, trackStartTime);
      hasSimulated.value = true;
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
    hasSimulated.value = false;
    
    logPlayer(`[SIMULATION] Started tracking: ${trackedTrack.value.name}`);
  };
  
  /**
   * Check if track has finished (position reached duration)
   * Only detects position-based finishes - track changes are handled by the watch
   */
  const checkTrackFinished = () => {
    if (!trackedTrack.value || !isPlaying.value || hasSimulated.value) {
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
    simulatedIncrements
  };
}

