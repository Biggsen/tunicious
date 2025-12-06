import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { logPlayer } from '@utils/logger';

// Singleton state - shared across all component instances
const player = ref(null);
const deviceId = ref(null);
const isReady = ref(false);
const isPlaying = ref(false);
const currentTrack = ref(null);
const playingFrom = ref(null);
const position = ref(0);
const duration = ref(0);
const loading = ref(false);
const error = ref(null);
let initializationPromise = null;
let isInitializing = false;
let componentCount = 0;

export function useSpotifyPlayer() {
  componentCount++;

  const user = useCurrentUser();
  const { getUserTokens } = useUserSpotifyApi();

  /**
   * Initialize the Spotify Web Playback SDK (singleton - only initializes once)
   */
  const initializePlayer = async () => {
    logPlayer('===== initializePlayer CALLED =====');
    logPlayer('player.value exists:', !!player.value);
    logPlayer('initializationPromise exists:', !!initializationPromise);
    logPlayer('isInitializing:', isInitializing);
    logPlayer('window.Spotify:', typeof window.Spotify);
    logPlayer('window.Spotify?.Player:', typeof window.Spotify?.Player);
    
    // If already initialized or initializing, return the existing promise
    if (player.value) {
      logPlayer('Player already initialized, returning');
      return Promise.resolve();
    }

    if (initializationPromise) {
      logPlayer('Initialization already in progress, returning promise');
      return initializationPromise;
    }

    if (isInitializing) {
      logPlayer('Waiting for ongoing initialization...');
      // Wait for ongoing initialization
      while (isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    isInitializing = true;
    logPlayer('Starting new initialization...');
    initializationPromise = (async () => {
      logPlayer('Inside initialization promise');
      logPlayer('typeof window:', typeof window);
      logPlayer('window.Spotify:', typeof window.Spotify);
      
      if (typeof window === 'undefined' || !window.Spotify) {
        logPlayer('SDK not available! window:', typeof window, 'Spotify:', typeof window?.Spotify);
        error.value = 'Spotify Web Playback SDK not loaded';
        isInitializing = false;
        return;
      }

      try {
        loading.value = true;
        error.value = null;

        logPlayer('Initializing Spotify player...');

        // Check if user has Spotify tokens before attempting to initialize
        let tokens;
        try {
          tokens = await getUserTokens();
          logPlayer('Got Spotify tokens, proceeding with player initialization');
        } catch (authErr) {
          // Only skip initialization for specific authentication errors
          const errorMsg = authErr.message || '';
          if (errorMsg.includes('not authenticated') || 
              errorMsg.includes('not connected') || 
              errorMsg.includes('missing refresh token') ||
              errorMsg.includes('User not authenticated')) {
            // User not authenticated with Spotify - this is expected for users without Spotify connected
            logPlayer('Spotify player initialization skipped - user not authenticated with Spotify');
            isInitializing = false;
            loading.value = false;
            initializationPromise = null;
            return;
          }
          // For other errors, log and rethrow so they're handled by the outer catch
          logPlayer('Error getting Spotify tokens:', authErr);
          throw authErr;
        }

        const accessToken = tokens.accessToken;

        // Only create player if it doesn't exist
        if (!player.value) {
          player.value = new window.Spotify.Player({
            name: 'AudioFoodie Web Player',
            getOAuthToken: async (cb) => {
              // Refresh token if needed
              try {
                const freshTokens = await getUserTokens();
                cb(freshTokens.accessToken);
              } catch (err) {
                logPlayer('Error getting OAuth token:', err);
                error.value = 'Failed to authenticate with Spotify';
                cb(null);
              }
            },
            volume: 0.5
          });
        }

        // Set up event listeners only once
        if (!player.value._listenersSet) {
          player.value.addListener('ready', ({ device_id }) => {
            logPlayer('Spotify player ready with device ID:', device_id);
            deviceId.value = device_id;
            isReady.value = true;
            error.value = null;
          });

          player.value.addListener('not_ready', ({ device_id }) => {
            logPlayer('Device ID has gone offline', device_id);
            isReady.value = false;
            deviceId.value = null;
          });

          player.value.addListener('player_state_changed', (state) => {
            if (!state) {
              isPlaying.value = false;
              currentTrack.value = null;
              playingFrom.value = null;
              return;
            }

            isPlaying.value = !state.paused;
            position.value = state.position;
            duration.value = state.duration;

            if (state.track_window?.current_track) {
              currentTrack.value = {
                id: state.track_window.current_track.id,
                name: state.track_window.current_track.name,
                artists: state.track_window.current_track.artists.map(a => a.name),
                album: state.track_window.current_track.album?.name || '',
                image: state.track_window.current_track.album?.images?.[0]?.url || '',
                uri: state.track_window.current_track.uri
              };
            }
          });

          player.value.addListener('authentication_error', ({ message }) => {
            logPlayer('Authentication error:', message);
            error.value = 'Spotify authentication failed';
            isReady.value = false;
          });

          player.value.addListener('playback_error', ({ message }) => {
            logPlayer('Playback error:', message);
            error.value = `Playback error: ${message}`;
          });

          player.value._listenersSet = true;
        }

        // Connect to the player (idempotent - safe to call multiple times)
        if (!player.value._connected) {
          const connected = await player.value.connect();
          if (!connected) {
            error.value = 'Failed to connect to Spotify player';
          } else {
            player.value._connected = true;
          }
        }
      } catch (err) {
        // Only log errors that aren't authentication-related
        if (!err.message?.includes('not authenticated') && !err.message?.includes('not connected')) {
          logPlayer('Error initializing Spotify player:', err);
          error.value = err.message || 'Failed to initialize Spotify player';
        } else {
          // User not authenticated with Spotify - this is expected
          logPlayer('Spotify player initialization skipped - user not authenticated with Spotify');
        }
      } finally {
        loading.value = false;
        isInitializing = false;
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  };

  /**
   * Play a track by URI
   */
  const playTrack = async (trackUri, context = null) => {
    if (!player.value || !isReady.value || !deviceId.value) {
      error.value = 'Player not ready. Please ensure Spotify is open and you have Premium.';
      return;
    }

    try {
      const tokens = await getUserTokens();
      const accessToken = tokens.accessToken;

      // If playing from a context (playlist or album), use context_uri for continuous playback after queue ends
      let requestBody;
      if (context && context.type && context.id) {
        if (context.type === 'playlist') {
          requestBody = {
            context_uri: `spotify:playlist:${context.id}`,
            offset: { uri: trackUri }
          };
        } else if (context.type === 'album') {
          requestBody = {
            context_uri: `spotify:album:${context.id}`,
            offset: { uri: trackUri }
          };
        } else {
          // Unknown context type, fall back to single track
          requestBody = { uris: [trackUri] };
        }
      } else {
        // No context - single track playback
        requestBody = { uris: [trackUri] };
      }

      let response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId.value}`, {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      // If context_uri fails with 403/404, try without device_id (uses active device)
      if (!response.ok && requestBody.context_uri) {
        const errorData = await response.json().catch(() => ({}));
        logPlayer('Context playback with device_id failed, trying without device_id:', errorData);
        
        // Try without device_id - uses currently active device
        response = await fetch(`https://api.spotify.com/v1/me/player/play`, {
          method: 'PUT',
          body: JSON.stringify(requestBody),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        // If that also fails, fall back to single track playback
        if (!response.ok) {
          logPlayer('Context playback failed, falling back to single track:', await response.json().catch(() => ({})));
          
          // Fall back to single track playback
          response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId.value}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [trackUri] }),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (!response.ok) {
            const fallbackErrorData = await response.json().catch(() => ({}));
            const errorMessage = fallbackErrorData.error?.message || `Failed to play track: ${response.status}`;
            
            // Provide more specific error messages
            if (response.status === 403) {
              throw new Error('Device not found or not active. Please ensure Spotify is open and the web player is ready.');
            } else if (response.status === 404) {
              throw new Error('Device not found. Please refresh the page and try again.');
            }
            
            throw new Error(errorMessage);
          }
          
          // Single track playback succeeded, but context was not set
          logPlayer('Playback succeeded with single track (context unavailable)');
          playingFrom.value = null;
          return;
        }
        
        // Context playback succeeded without device_id
        logPlayer('Context playback succeeded without device_id parameter');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Failed to play track: ${response.status}`;
        
        // Provide more specific error messages
        if (response.status === 403) {
          throw new Error('Device not found or not active. Please ensure Spotify is open and the web player is ready.');
        } else if (response.status === 404) {
          throw new Error('Device not found. Please refresh the page and try again.');
        }
        
        throw new Error(errorMessage);
      }

      // Store the context after successful play
      playingFrom.value = context;
    } catch (err) {
      logPlayer('Error playing track:', err);
      error.value = err.message || 'Failed to play track';
      throw err;
    }
  };

  /**
   * Play an album by URI
   */
  const playAlbum = async (albumUri, offset = 0, context = null) => {
    if (!player.value || !isReady.value || !deviceId.value) {
      error.value = 'Player not ready. Please ensure Spotify is open and you have Premium.';
      return;
    }

    try {
      const tokens = await getUserTokens();
      const accessToken = tokens.accessToken;

      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId.value}`, {
        method: 'PUT',
        body: JSON.stringify({ 
          context_uri: albumUri,
          offset: { position: offset }
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to play album: ${response.status}`);
      }

      // Store the context after successful play
      playingFrom.value = context;
    } catch (err) {
      logPlayer('Error playing album:', err);
      error.value = err.message || 'Failed to play album';
      throw err;
    }
  };

  /**
   * Toggle play/pause
   */
  const togglePlayback = async () => {
    if (!player.value || !isReady.value) {
      error.value = 'Player not ready';
      return;
    }

    try {
      await player.value.togglePlay();
    } catch (err) {
      logPlayer('Error toggling playback:', err);
      error.value = err.message || 'Failed to toggle playback';
    }
  };

  /**
   * Pause playback
   */
  const pause = async () => {
    if (!player.value || !isReady.value) {
      return;
    }

    try {
      await player.value.pause();
    } catch (err) {
      logPlayer('Error pausing:', err);
      error.value = err.message || 'Failed to pause';
    }
  };

  /**
   * Resume playback
   */
  const resume = async () => {
    if (!player.value || !isReady.value) {
      return;
    }

    try {
      await player.value.resume();
    } catch (err) {
      logPlayer('Error resuming:', err);
      error.value = err.message || 'Failed to resume';
    }
  };

  /**
   * Seek to position
   */
  const seek = async (positionMs) => {
    if (!player.value || !isReady.value) {
      return;
    }

    try {
      await player.value.seek(positionMs);
    } catch (err) {
      logPlayer('Error seeking:', err);
      error.value = err.message || 'Failed to seek';
    }
  };

  /**
   * Set volume (0-1)
   */
  const setVolume = async (volume) => {
    if (!player.value || !isReady.value) {
      return;
    }

    try {
      await player.value.setVolume(volume);
    } catch (err) {
      logPlayer('Error setting volume:', err);
      error.value = err.message || 'Failed to set volume';
    }
  };

  /**
   * Add a track to the queue
   */
  const addToQueue = async (trackUri) => {
    if (!player.value || !isReady.value || !deviceId.value) {
      error.value = 'Player not ready. Please ensure Spotify is open and you have Premium.';
      return;
    }

    try {
      const tokens = await getUserTokens();
      const accessToken = tokens.accessToken;

      const response = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}&device_id=${deviceId.value}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to add track to queue: ${response.status}`);
      }
    } catch (err) {
      logPlayer('Error adding track to queue:', err);
      error.value = err.message || 'Failed to add track to queue';
      throw err;
    }
  };

  /**
   * Check if a specific track is currently playing
   */
  const isTrackPlaying = (trackUri) => {
    return currentTrack.value?.uri === trackUri && isPlaying.value;
  };

  /**
   * Disconnect the player (only when last component unmounts)
   * Note: App.vue and SpotifyPlayerBar are always mounted, so we should
   * never disconnect during normal navigation - only decrement the count.
   */
  const disconnect = async () => {
    // Decrement count first
    componentCount--;
    
    // Only disconnect if we're truly the last component (shouldn't happen during navigation)
    // App.vue and SpotifyPlayerBar should always keep count >= 2
    if (componentCount <= 0 && player.value) {
      logPlayer('Disconnecting player - componentCount reached 0');
      try {
        await player.value.disconnect();
      } catch (err) {
        logPlayer('Error disconnecting player:', err);
      }
      // Reset state but keep the player instance reference
      // We'll let the next component reinitialize if needed
      deviceId.value = null;
      isReady.value = false;
      isPlaying.value = false;
      currentTrack.value = null;
      player.value._connected = false;
      componentCount = 0;
    } else {
      logPlayer(`Component unmounting, componentCount now: ${componentCount} (player stays connected)`);
    }
  };

  // Periodic check to retry initialization when both SDK and user are ready
  let retryCheckInterval = null;
  
  const checkAndRetryInitialization = async () => {
    // Only retry if player is not already initialized
    if (player.value || isInitializing) {
      return;
    }

    // Check if SDK is available
    if (!window.Spotify) {
      return;
    }

    // Check if user is authenticated and has Spotify connected
    if (!user.value) {
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', user.value.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.spotifyConnected && userData.spotifyTokens) {
          logPlayer('Both SDK and Spotify connection ready, retrying player initialization...');
          initializePlayer().catch(err => {
            logPlayer('Failed to initialize player on retry:', err);
          });
        }
      }
    } catch (err) {
      logPlayer('Error in retry check:', err);
    }
  };

  // Watch for user authentication and Spotify connection changes
  watch([user, () => user.value?.uid], async ([newUser, newUid], [oldUser, oldUid]) => {
    // If user just logged in or changed, check for Spotify connection
    if (newUser && newUid && (!oldUser || oldUid !== newUid)) {
      // Start periodic retry check
      if (retryCheckInterval) {
        clearInterval(retryCheckInterval);
      }
      retryCheckInterval = setInterval(checkAndRetryInitialization, 2000); // Check every 2 seconds
      
      // Also do an immediate check
      setTimeout(checkAndRetryInitialization, 1000);
    }
  }, { immediate: false });

  onMounted(() => {
    // Start periodic retry check if user is already authenticated
    if (user.value) {
      retryCheckInterval = setInterval(checkAndRetryInitialization, 2000);
      // Do an immediate check
      setTimeout(checkAndRetryInitialization, 1000);
    }
    
    // Wait for Spotify SDK to load
    if (typeof window !== 'undefined') {
      const tryInitialize = () => {
        logPlayer('tryInitialize called');
        logPlayer('window.Spotify:', typeof window.Spotify);
        logPlayer('window.Spotify?.Player:', typeof window.Spotify?.Player);
        logPlayer('player.value:', !!player.value);
        logPlayer('isInitializing:', isInitializing);
        logPlayer('user.value:', !!user.value);
        
        if (window.Spotify) {
          logPlayer('Spotify SDK available, initializing player...');
          initializePlayer().catch(err => {
            logPlayer('Failed to initialize player:', err);
          });
        } else {
          logPlayer('Spotify SDK not yet available');
          logPlayer('window object keys:', Object.keys(window).filter(k => k.toLowerCase().includes('spotify')));
        }
      };

      if (window.Spotify) {
        logPlayer('Spotify SDK already loaded');
        tryInitialize();
      } else {
        logPlayer('Waiting for Spotify SDK to load...');
        // Wait for SDK to load via polling - keep trying indefinitely
        let checkInterval = setInterval(async () => {
          logPlayer('Polling check - window.Spotify:', typeof window.Spotify);
          
          if (window.Spotify) {
            clearInterval(checkInterval);
            checkInterval = null;
            logPlayer('Spotify SDK detected via polling');
            // Also check if user has Spotify connected before trying
            if (user.value) {
              try {
                const userDoc = await getDoc(doc(db, 'users', user.value.uid));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  logPlayer('Polling - User has Spotify:', {
                    spotifyConnected: userData.spotifyConnected,
                    hasTokens: !!userData.spotifyTokens
                  });
                  
                  if (userData.spotifyConnected && userData.spotifyTokens) {
                    tryInitialize();
                  } else {
                    logPlayer('Polling - User does not have Spotify connected yet');
                  }
                }
              } catch (err) {
                logPlayer('Polling - Error checking user data:', err);
                // Try anyway - might work
                tryInitialize();
              }
            } else {
              logPlayer('Polling - No user, trying anyway...');
              tryInitialize();
            }
          }
        }, 500); // Check every 500ms

        // Also listen for the SDK ready event
        const sdkReadyHandler = async () => {
          logPlayer('===== SDK READY EVENT HANDLER =====');
          logPlayer('Event received at:', new Date().toISOString());
          logPlayer('window.Spotify BEFORE check:', typeof window.Spotify);
          logPlayer('window.Spotify value:', window.Spotify);
          
          if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
            logPlayer('Cleared check interval');
          }
          
          // Add a small delay to ensure window.Spotify is set
          await new Promise(resolve => setTimeout(resolve, 100));
          
          logPlayer('window.Spotify AFTER delay:', typeof window.Spotify);
          logPlayer('window.Spotify?.Player:', typeof window.Spotify?.Player);
          
          if (!window.Spotify) {
            logPlayer('ERROR: window.Spotify not set despite ready event!');
            logPlayer('Will continue polling...');
            return;
          }
          
          logPlayer('window.Spotify is valid, checking user...');
          // Check if user has Spotify connected before trying
          if (user.value) {
            logPlayer('User exists, checking Firestore...');
            try {
              const userDoc = await getDoc(doc(db, 'users', user.value.uid));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                logPlayer('User data:', {
                  spotifyConnected: userData.spotifyConnected,
                  hasTokens: !!userData.spotifyTokens,
                  tokenExpiresAt: userData.spotifyTokens?.expiresAt
                });
                
                if (userData.spotifyConnected && userData.spotifyTokens) {
                  logPlayer('User has Spotify, calling tryInitialize...');
                  tryInitialize();
                } else {
                  logPlayer('User does not have Spotify connected yet');
                }
              } else {
                logPlayer('User document does not exist');
              }
            } catch (err) {
              logPlayer('Error checking user data:', err);
              // Try anyway - might work
              logPlayer('Attempting initialization anyway...');
              tryInitialize();
            }
          } else {
            logPlayer('No user, attempting initialization anyway...');
            tryInitialize();
          }
        };
        window.addEventListener('spotify-sdk-ready', sdkReadyHandler);

        // Store interval and handler for cleanup (use a unique key per component instance)
        const instanceKey = `spotifySDK_${componentCount}`;
        window[`${instanceKey}_interval`] = checkInterval;
        window[`${instanceKey}_handler`] = sdkReadyHandler;
      }
    }
  });

  onUnmounted(() => {
    // Clean up retry check interval
    if (retryCheckInterval) {
      clearInterval(retryCheckInterval);
      retryCheckInterval = null;
    }
    
    // Clean up SDK waiting interval if it exists
    const instanceKey = `spotifySDK_${componentCount}`;
    if (window[`${instanceKey}_interval`]) {
      clearInterval(window[`${instanceKey}_interval`]);
      window[`${instanceKey}_interval`] = null;
    }
    if (window[`${instanceKey}_handler`]) {
      window.removeEventListener('spotify-sdk-ready', window[`${instanceKey}_handler`]);
      window[`${instanceKey}_handler`] = null;
    }
    disconnect();
  });

  return {
    player,
    deviceId,
    isReady,
    isPlaying,
    currentTrack,
    playingFrom,
    position,
    duration,
    loading,
    error,
    initializePlayer,
    playTrack,
    playAlbum,
    togglePlayback,
    pause,
    resume,
    seek,
    setVolume,
    addToQueue,
    isTrackPlaying,
    disconnect
  };
}
