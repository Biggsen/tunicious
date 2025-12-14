import { ref, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { useUserData } from './useUserData';
import { logPlayer } from '../utils/logger';

// Global Set to track playcount increments (prevent duplicates)
// Key format: trackId_timestamp
const trackedPlaycountSessions = new Set();

/**
 * Composable to track playcount increments based on Spotify web player
 * Detects when tracks finish and increments playcount in cache
 */
export function useWebPlayerPlaycountTracking(onPlaycountUpdate) {
  logPlayer('[PLAYCOUNT] Initializing playcount tracking composable');
  
  const { currentTrack, position, duration, isPlaying, playingFrom } = useSpotifyPlayer();
  const { getPlaycountForTrack, updatePlaycountForTrack, updateLastPlayedFromPlaylist } = useUnifiedTrackCache();
  const { user } = useUserData();
  
  // Track the current track being monitored
  const trackedTrack = ref(null);
  const trackedTrackStartTime = ref(null);
  const trackedTrackDuration = ref(0);
  const trackedPosition = ref(0); // Track position when track changes
  const trackedPlaylistContext = ref(null); // Store playlist context when track starts
  const playcountIncremented = ref(false);

  // Threshold constants (similar to Last.fm scrobbling)
  const MIN_PLAY_TIME_MS = 4 * 60 * 1000; // 4 minutes
  const MIN_PLAY_PERCENTAGE = 0.5; // 50%

  /**
   * Check if track was played long enough to count as a play
   * @param {number} playDuration - How long track was played (ms)
   * @param {number} trackDuration - Total track duration (ms)
   * @returns {boolean}
   */
  const wasPlayedLongEnough = (playDuration, trackDuration) => {
    if (!trackDuration || trackDuration === 0) {
      // If we don't know duration, require minimum time
      return playDuration >= MIN_PLAY_TIME_MS;
    }
    
    // Check if played for at least 50% of duration
    const minPlayTime = Math.min(MIN_PLAY_TIME_MS, trackDuration * MIN_PLAY_PERCENTAGE);
    return playDuration >= minPlayTime;
  };
  
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
      if (!user.value?.uid) {
        logPlayer(`[PLAYCOUNT] User not available, cannot increment playcount`);
        return;
      }
      
      // Get artist name for fallback lookup
      const artistName = track.artists?.[0]?.name || (Array.isArray(track.artists) ? track.artists[0] : '') || '';
      
      // Get current playcount from cache (try by ID first)
      let currentPlaycount = getPlaycountForTrack(track.id) || 0;
      
      // Try to find track by name + artist if we need to (updateTrackPlaycount will also do this, but we want the current playcount)
      let actualTrackId = track.id;
      if (track.name && artistName) {
        const { findTrackIdByNameAndArtist } = await import('../utils/unifiedTrackCache');
        const foundTrackId = findTrackIdByNameAndArtist(track.name, artistName, user.value.uid);
        if (foundTrackId && foundTrackId !== track.id) {
          // Found a different track ID - use its playcount
          const foundPlaycount = getPlaycountForTrack(foundTrackId) || 0;
          currentPlaycount = foundPlaycount;
          actualTrackId = foundTrackId;
          logPlayer(`[PLAYCOUNT] Found track by name+artist: ${foundTrackId} (player ID: ${track.id}, current playcount: ${foundPlaycount})`);
        }
      }
      
      // Increment playcount
      const newPlaycount = currentPlaycount + 1;
      
      // Update cache (with fallback to name+artist lookup)
      const updatedTrackId = await updatePlaycountForTrack(track.id, newPlaycount, track.name, artistName);
      
      // Use the returned track ID if different from player ID
      const finalTrackId = updatedTrackId || actualTrackId || track.id;
      
      logPlayer(`[PLAYCOUNT] Incremented playcount for "${track.name}" from ${currentPlaycount} to ${newPlaycount} (track ID: ${finalTrackId})`);
      
      // Update last played playlist if we have playlist context
      const playlistContext = track.playlistContext;
      logPlayer(`[PLAYCOUNT] Checking playlist context for last played update: ${playlistContext ? `${playlistContext.type}:${playlistContext.id} (${playlistContext.name})` : 'none'}`);
      
      if (playlistContext && playlistContext.type === 'playlist' && playlistContext.id) {
        try {
          await updateLastPlayedFromPlaylist(
            finalTrackId,
            playlistContext.id,
            playlistContext.name || 'Unknown Playlist',
            track.name,
            artistName
          );
          logPlayer(`[PLAYCOUNT] Updated last played playlist for "${track.name}": ${playlistContext.name}`);
          
          // Emit global event to notify Last Played panel to refresh
          logPlayer(`[PLAYCOUNT] Emitting last-played-updated event`);
          window.dispatchEvent(new CustomEvent('last-played-updated'));
        } catch (error) {
          logPlayer(`[PLAYCOUNT] Error updating last played playlist for "${track.name}":`, error);
        }
      } else {
        logPlayer(`[PLAYCOUNT] Skipping last played update - no valid playlist context (context: ${JSON.stringify(playlistContext)})`);
      }
      
      // Notify listener for UI updates (use actual track ID if found)
      if (onPlaycountUpdate) {
        onPlaycountUpdate(finalTrackId, newPlaycount);
      }
      
      // Emit global event for components that want to update UI
      window.dispatchEvent(new CustomEvent('track-playcount-updated', {
        detail: { trackId: finalTrackId, playcount: newPlaycount }
      }));
    } catch (error) {
      logPlayer(`[PLAYCOUNT] Error incrementing playcount for "${track.name}":`, error);
      // Remove from set on error so it can be retried
      trackedPlaycountSessions.delete(trackKey);
    }
  };
  
  /**
   * Handle when a track finishes or changes
   * @param {Object} trackInfo - Optional track info to use (captured before track changes)
   * @param {number} startTime - Optional track start time (captured before track changes)
   * @param {number} currentPosition - Current playback position (ms)
   * @param {boolean} isNaturalFinish - Whether track finished naturally (reached end)
   * @param {Object} playlistContext - Optional playlist context (captured when track started)
   */
  const handleTrackFinished = async (trackInfo = null, startTime = null, currentPosition = 0, isNaturalFinish = false, playlistContext = null) => {
    // Use provided track info, or fall back to trackedTrack
    const trackToProcess = trackInfo || trackedTrack.value;
    const trackStartTime = startTime !== null ? startTime : trackedTrackStartTime.value;
    const trackDuration = trackedTrackDuration.value || 0;
    const contextToUse = playlistContext || trackedPlaylistContext.value;
    
    logPlayer(`[PLAYCOUNT] Track finished: "${trackToProcess?.name}" - isNaturalFinish: ${isNaturalFinish}, playlistContext: ${contextToUse ? `${contextToUse.type}:${contextToUse.id} (${contextToUse.name})` : 'none'}`);
    
    if (!trackToProcess || !trackStartTime) {
      logPlayer(`[PLAYCOUNT] Missing track info or start time, skipping`);
      return;
    }

    // Check if we've already incremented this session using the Set
    const trackKey = `${trackToProcess.id}_${trackStartTime}`;
    if (trackedPlaycountSessions.has(trackKey)) {
      logPlayer(`[PLAYCOUNT] Already incremented for track session: ${trackToProcess.name}`);
      return;
    }

    // Calculate how long the track was played
    const playDuration = Date.now() - trackStartTime;
    
    // For natural finishes (reached end), always count
    // For track changes (skips), only count if played long enough
    if (!isNaturalFinish) {
      const playedEnough = wasPlayedLongEnough(playDuration, trackDuration);
      if (!playedEnough) {
        logPlayer(`[PLAYCOUNT] Track "${trackToProcess.name}" skipped too early (${Math.round(playDuration / 1000)}s / ${Math.round(trackDuration / 1000)}s), not incrementing`);
        return;
      }
    }

    // Only increment if we haven't already for this instance
    if (!playcountIncremented.value || trackInfo) {
      // Attach playlist context to track info
      const trackWithContext = {
        ...trackToProcess,
        playlistContext: contextToUse
      };
      await incrementPlaycount(trackWithContext, trackStartTime);
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
    trackedPosition.value = 0;
    // Capture playlist context when track starts
    trackedPlaylistContext.value = playingFrom.value ? { ...playingFrom.value } : null;
    playcountIncremented.value = false;
    
    logPlayer(`[PLAYCOUNT] Started tracking: ${trackedTrack.value.name}${trackedPlaylistContext.value ? ` from playlist: ${trackedPlaylistContext.value.name} (type: ${trackedPlaylistContext.value.type}, id: ${trackedPlaylistContext.value.id})` : ' (no playlist context)'}`);
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
    
    // Update tracked position
    trackedPosition.value = position.value;
    
    // Check if track has finished (position reached duration within 500ms tolerance)
    if (trackedTrackDuration.value > 0 && position.value > 0) {
      const remainingTime = trackedTrackDuration.value - position.value;
      if (remainingTime <= 500) {
        // Track finished naturally - capture current track info before any potential change
        const currentTrackInfo = trackedTrack.value ? { ...trackedTrack.value } : null;
        const currentStartTime = trackedTrackStartTime.value;
        const currentPlaylistContext = trackedPlaylistContext.value;
        handleTrackFinished(currentTrackInfo, currentStartTime, position.value, true, currentPlaylistContext);
      }
    }
  };
  
  // Watch for track changes
  logPlayer('[PLAYCOUNT] Setting up watcher for track changes');
  watch(() => currentTrack.value?.id, (newTrackId, oldTrackId) => {
    logPlayer(`[PLAYCOUNT] Track ID changed: ${oldTrackId} -> ${newTrackId}`);
    if (oldTrackId && newTrackId !== oldTrackId) {
      // Track changed - capture old track info BEFORE overwriting
      const oldTrackInfo = trackedTrack.value ? { ...trackedTrack.value } : null;
      const oldStartTime = trackedTrackStartTime.value;
      const oldPosition = trackedPosition.value;
      const oldPlaylistContext = trackedPlaylistContext.value;
      
      // Handle previous track (not a natural finish, so will check threshold)
      handleTrackFinished(oldTrackInfo, oldStartTime, oldPosition, false, oldPlaylistContext);
      // Then initialize tracking for new track
      initializeTrackTracking();
    } else if (newTrackId && !oldTrackId) {
      // New track started (first track)
      initializeTrackTracking();
    } else if (!newTrackId && oldTrackId) {
      // Track stopped/cleared - capture info before clearing
      const oldTrackInfo = trackedTrack.value ? { ...trackedTrack.value } : null;
      const oldStartTime = trackedTrackStartTime.value;
      const oldPosition = trackedPosition.value;
      const oldPlaylistContext = trackedPlaylistContext.value;
      
      // Treat as natural finish if position was near end, otherwise check threshold
      const wasNearEnd = trackedTrackDuration.value > 0 && oldPosition > 0 && 
                         (trackedTrackDuration.value - oldPosition) <= 500;
      handleTrackFinished(oldTrackInfo, oldStartTime, oldPosition, wasNearEnd, oldPlaylistContext);
      trackedTrack.value = null;
      trackedPlaylistContext.value = null;
    }
  });
  
  // Watch position and duration to detect track finish
  logPlayer('[PLAYCOUNT] Setting up watcher for position/duration/isPlaying');
  watch([position, duration, isPlaying], () => {
    if (currentTrack.value && isPlaying.value) {
      checkTrackFinished();
    }
  });
  
  // Watch for playback start (when isPlaying becomes true)
  logPlayer('[PLAYCOUNT] Setting up watcher for playback state changes');
  watch(isPlaying, (newIsPlaying, oldIsPlaying) => {
    logPlayer(`[PLAYCOUNT] Playback state changed: ${oldIsPlaying} -> ${newIsPlaying}, currentTrack: ${currentTrack.value?.name || 'none'}`);
    
    // If playback just started and we have a track but haven't started tracking it yet
    if (newIsPlaying && !oldIsPlaying && currentTrack.value && !trackedTrack.value) {
      logPlayer(`[PLAYCOUNT] Playback started on existing track, initializing tracking`);
      initializeTrackTracking();
    }
  });
  
  logPlayer('[PLAYCOUNT] Playcount tracking composable initialized successfully');
  
  return {
    // Expose for debugging/testing
    trackedTrack,
    playcountIncremented
  };
}

