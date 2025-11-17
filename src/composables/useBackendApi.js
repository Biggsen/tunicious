import { ref } from 'vue';

// Backend API base URL
const BACKEND_BASE_URL = 'https://us-central1-audiofoodie-d5b2c.cloudfunctions.net';

export function useBackendApi() {
  const loading = ref(false);
  const error = ref(null);

  /**
   * Make a request to our backend API
   */
  const makeRequest = async (endpoint, options = {}) => {
    try {
      loading.value = true;
      error.value = null;

      const url = `${BACKEND_BASE_URL}/${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify(options.body || {}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Provide more specific error messages based on the response
        let errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        
        // Ensure errorMessage is a string before calling string methods
        if (typeof errorMessage !== 'string') {
          errorMessage = JSON.stringify(errorMessage);
        }
        
        // Handle specific HTTP status codes
        if (response.status === 400) {
          if (errorMessage.includes('refresh token')) {
            errorMessage = 'Spotify refresh token expired - please reconnect your account';
          }
        } else if (response.status === 401) {
          errorMessage = 'Spotify authentication failed - please reconnect your account';
        } else if (response.status === 403) {
          errorMessage = 'Spotify access denied - please reconnect your account';
        } else if (response.status === 429) {
          errorMessage = 'Spotify rate limit exceeded - please try again in a moment';
        } else if (response.status >= 500) {
          errorMessage = 'Spotify service temporarily unavailable - please try again later';
        }
        
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (err) {
      error.value = err.message;
      
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
