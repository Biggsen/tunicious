import { ref } from "vue";
import { useSpotifyApi } from "../composables/useSpotifyApi";

export function useToken() {
  const tokenRef = ref(localStorage.getItem("token"));
  const loading = ref(false);
  const error = ref(null);
  const spotifyApi = useSpotifyApi();

  async function initializeToken() {
    loading.value = true;
    error.value = null;
    try {
      // Clear existing token first to force a new one
      clearToken();

      const token = await spotifyApi.refreshToken();
      tokenRef.value = token;
      localStorage.setItem("token", token);
      return { access_token: token };
    } catch (e) {
      console.error("Error initializing token:", e);
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function clearToken() {
    tokenRef.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("tokenExpiryDate");
  }

  async function getValidToken() {
    const currentToken = localStorage.getItem("token");
    const tokenExpiryDate = localStorage.getItem("tokenExpiryDate");

    if (currentToken && tokenExpiryDate && !isTokenExpired(tokenExpiryDate)) {
      return currentToken;
    }

    // If no token or expired, get a new one
    try {
      const newToken = await spotifyApi.refreshToken();
      const expiryDate = Date.now() + 3600000; // Current time + 1 hour
      localStorage.setItem("token", newToken);
      localStorage.setItem("tokenExpiryDate", expiryDate.toString());
      return newToken;
    } catch (error) {
      console.error("Error getting token:", error);
      throw error;
    }
  }

  function isTokenExpired(expiryDate) {
    return Date.now() > parseInt(expiryDate);
  }

  return {
    token: tokenRef,
    loading,
    error,
    initializeToken,
    clearToken,
    getValidToken
  };
}
