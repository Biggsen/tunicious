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
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      error.value = err.message;
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
