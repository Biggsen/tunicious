import { ref } from 'vue';
import { getAuth } from 'firebase/auth';

// Backend API base URL
const BACKEND_BASE_URL = 'https://us-central1-audiofoodie-d5b2c.cloudfunctions.net';

export function useBackendApi() {
  const loading = ref(false);
  const error = ref(null);

  /**
   * Get Firebase ID token for authentication
   */
  const getIdToken = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  };

  /**
   * Make a request to our backend API
   */
  const makeRequest = async (endpoint, options = {}) => {
    try {
      loading.value = true;
      error.value = null;

      // Get authentication token
      const idToken = await getIdToken();

      const url = `${BACKEND_BASE_URL}/${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          ...options.headers,
        },
        body: JSON.stringify(options.body || {}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Check if this is a Last.fm API error (has both error code and message)
        const isLastFmError = typeof errorData.error === 'number' && errorData.message;
        
        let errorMessage;
        if (isLastFmError) {
          // Last.fm errors: include both code and message for better debugging
          // Error code 9 = Invalid session key
          const errorCode = errorData.error;
          const errorMsg = errorData.message || 'Unknown Last.fm error';
          
          if (errorCode === 9) {
            errorMessage = `Last.fm session expired (error ${errorCode}): ${errorMsg}`;
          } else {
            errorMessage = `Last.fm API error ${errorCode}: ${errorMsg}`;
          }
        } else {
          // Other errors (Spotify, etc.)
          errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
          
          // Ensure errorMessage is a string before calling string methods
          if (typeof errorMessage !== 'string') {
            errorMessage = JSON.stringify(errorMessage);
          }
        }
        
        // Handle specific HTTP status codes for non-Last.fm errors
        if (!isLastFmError) {
          if (response.status === 400) {
            if (errorMessage.includes('refresh token')) {
              errorMessage = 'Spotify refresh token expired - please reconnect your account';
            }
          } else if (response.status === 401) {
            // Check if it's an authentication error from our backend
            if (errorMessage.includes('Unauthorized') || errorMessage.includes('Invalid token') || errorMessage.includes('not authenticated')) {
              errorMessage = 'Authentication required - please log in again';
            } else {
              errorMessage = 'Spotify authentication failed - please reconnect your account';
            }
          } else if (response.status === 403) {
            errorMessage = 'Spotify access denied - please reconnect your account';
          } else if (response.status === 429) {
            errorMessage = 'Spotify rate limit exceeded - please try again in a moment';
          } else if (response.status >= 500) {
            errorMessage = 'Spotify service temporarily unavailable - please try again later';
          }
        }
        
        // Attach error code and Last.fm flag to error for better detection
        const error = new Error(errorMessage);
        if (isLastFmError) {
          error.lastFmErrorCode = errorData.error;
          error.lastFmMessage = errorData.message;
        }
        throw error;
      }

      return await response.json();
    } catch (err) {
      error.value = err.message;
      
      // Handle authentication errors
      if (err.message && err.message.includes('User not authenticated')) {
        throw new Error('Authentication required - please log in to continue');
      }
      
      // Distinguish between network errors and API errors
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Network error - please check your internet connection and try again');
      }
      
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Exchange Spotify authorization code for tokens
   */
  const exchangeSpotifyCode = async (code, redirectUri) => {
    return makeRequest('spotifyTokenExchange', {
      body: { code, redirectUri },
    });
  };

  /**
   * Refresh Spotify access token
   */
  const refreshSpotifyToken = async (refreshToken) => {
    return makeRequest('spotifyRefreshToken', {
      body: { refreshToken },
    });
  };

  /**
   * Make Spotify API call through our proxy
   */
  const spotifyApiCall = async (endpoint, method = 'GET', data = null, accessToken) => {
    return makeRequest('spotifyApiProxy', {
      body: { endpoint, method, data, accessToken },
    });
  };

  /**
   * Make Last.fm API call through our proxy
   */
  const lastfmApiCall = async (method, params = {}) => {
    return makeRequest('lastfmApiProxy', {
      body: { method, params },
    });
  };

  return {
    loading,
    error,
    exchangeSpotifyCode,
    refreshSpotifyToken,
    spotifyApiCall,
    lastfmApiCall,
  };
}
