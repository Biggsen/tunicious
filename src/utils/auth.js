import { ref } from "vue";
import { useSpotifyApi } from "../composables/useSpotifyApi";

const globalLoading = ref(false);
const globalError = ref(null);

export function useToken() {
  const tokenRef = ref(localStorage.getItem("token"));
  const spotifyApi = useSpotifyApi();

  async function getValidToken() {
    globalLoading.value = true;
    globalError.value = null;
    
    try {
      const currentToken = localStorage.getItem("token");
      const tokenExpiryDate = localStorage.getItem("tokenExpiryDate");

      if (currentToken && tokenExpiryDate && !isTokenExpired(tokenExpiryDate)) {
        return currentToken;
      }

      // If no token or expired, get a new one
      const newToken = await spotifyApi.refreshToken();
      const expiryDate = Date.now() + 3600000; // Current time + 1 hour
      localStorage.setItem("token", newToken);
      localStorage.setItem("tokenExpiryDate", expiryDate.toString());
      tokenRef.value = newToken;
      return newToken;
    } catch (error) {
      globalError.value = error;
      throw error;
    } finally {
      globalLoading.value = false;
    }
  }

  function clearToken() {
    tokenRef.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("tokenExpiryDate");
  }

  function isTokenExpired(expiryDate) {
    return Date.now() > parseInt(expiryDate);
  }

  // Keep initializeToken for backward compatibility
  async function initializeToken() {
    return getValidToken();
  }

  return {
    token: tokenRef,
    loading: globalLoading,
    error: globalError,
    getValidToken,
    clearToken,
    initializeToken
  };
}
