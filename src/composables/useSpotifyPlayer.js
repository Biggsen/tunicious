import { ref, onMounted, onUnmounted } from 'vue';
import { useUserSpotifyApi } from './useUserSpotifyApi';

// Singleton state - shared across all component instances
const player = ref(null);
const deviceId = ref(null);
const isReady = ref(false);
const isPlaying = ref(false);
const currentTrack = ref(null);
const position = ref(0);
const duration = ref(0);
const loading = ref(false);
const error = ref(null);
let initializationPromise = null;
let isInitializing = false;
let componentCount = 0;

export function useSpotifyPlayer() {
  componentCount++;

  const { getUserTokens } = useUserSpotifyApi();

  /**
   * Initialize the Spotify Web Playback SDK (singleton - only initializes once)
   */
  const initializePlayer = async () => {
    // If already initialized or initializing, return the existing promise
    if (player.value) {
      return Promise.resolve();
    }

    if (initializationPromise) {
      return initializationPromise;
    }

    if (isInitializing) {
      // Wait for ongoing initialization
      while (isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    isInitializing = true;
    initializationPromise = (async () => {
      if (typeof window === 'undefined' || !window.Spotify) {
        error.value = 'Spotify Web Playback SDK not loaded';
        isInitializing = false;
        return;
      }

      try {
        loading.value = true;
        error.value = null;

        const tokens = await getUserTokens();
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
                console.error('Error getting OAuth token:', err);
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
            console.log('Spotify player ready with device ID:', device_id);
            deviceId.value = device_id;
            isReady.value = true;
            error.value = null;
          });

          player.value.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
            isReady.value = false;
            deviceId.value = null;
          });

          player.value.addListener('player_state_changed', (state) => {
            if (!state) {
              isPlaying.value = false;
              currentTrack.value = null;
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
            console.error('Authentication error:', message);
            error.value = 'Spotify authentication failed';
            isReady.value = false;
          });

          player.value.addListener('playback_error', ({ message }) => {
            console.error('Playback error:', message);
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
        console.error('Error initializing Spotify player:', err);
        error.value = err.message || 'Failed to initialize Spotify player';
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
  const playTrack = async (trackUri) => {
    if (!player.value || !isReady.value || !deviceId.value) {
      error.value = 'Player not ready. Please ensure Spotify is open and you have Premium.';
      return;
    }

    try {
      const tokens = await getUserTokens();
      const accessToken = tokens.accessToken;

      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId.value}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [trackUri] }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to play track: ${response.status}`);
      }
    } catch (err) {
      console.error('Error playing track:', err);
      error.value = err.message || 'Failed to play track';
      throw err;
    }
  };

  /**
   * Play an album by URI
   */
  const playAlbum = async (albumUri, offset = 0) => {
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
    } catch (err) {
      console.error('Error playing album:', err);
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
      console.error('Error toggling playback:', err);
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
      console.error('Error pausing:', err);
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
      console.error('Error resuming:', err);
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
      console.error('Error seeking:', err);
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
      console.error('Error setting volume:', err);
      error.value = err.message || 'Failed to set volume';
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
   */
  const disconnect = async () => {
    componentCount--;
    
    // Only disconnect when the last component using the player unmounts
    if (componentCount <= 0 && player.value) {
      try {
        await player.value.disconnect();
      } catch (err) {
        console.error('Error disconnecting player:', err);
      }
      // Reset state but keep the player instance reference
      // We'll let the next component reinitialize if needed
      deviceId.value = null;
      isReady.value = false;
      isPlaying.value = false;
      currentTrack.value = null;
      player.value._connected = false;
      componentCount = 0;
    }
  };

  onMounted(() => {
    // Wait for Spotify SDK to load
    if (typeof window !== 'undefined') {
      if (window.Spotify) {
        initializePlayer();
      } else {
        // Wait for SDK to load
        const checkInterval = setInterval(() => {
          if (window.Spotify) {
            clearInterval(checkInterval);
            initializePlayer();
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!window.Spotify) {
            error.value = 'Spotify Web Playback SDK failed to load';
          }
        }, 10000);
      }
    }
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    player,
    deviceId,
    isReady,
    isPlaying,
    currentTrack,
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
    isTrackPlaying,
    disconnect
  };
}
