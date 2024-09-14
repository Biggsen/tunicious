import { ref } from "vue";
import { getToken } from "./api";

const tokenRef = ref(localStorage.getItem('token'));

export function useToken() {
  const loading = ref(false);
  const error = ref(null);

  async function initializeToken() {
    loading.value = true;
    error.value = null;
    try {
      const token = await getValidToken();
      tokenRef.value = token;
      localStorage.setItem('token', token);
    } catch (e) {
      console.error('Error initializing token:', e);
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  function clearToken() {
    tokenRef.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiryDate');
  }

  return {
    token: tokenRef,
    loading,
    error,
    initializeToken,
    clearToken
  };
}

async function getValidToken() {
  const currentToken = localStorage.getItem('token');
  const tokenExpiryDate = localStorage.getItem('tokenExpiryDate');

  if (currentToken && tokenExpiryDate && !isTokenExpired(tokenExpiryDate)) {
    return currentToken;
  }

  // If no token or expired, get a new one
  try {
    const response = await getToken();
    const newToken = response.access_token;
    const expiryDate = Date.now() + 3600000; // Current time + 1 hour
    localStorage.setItem('token', newToken);
    localStorage.setItem('tokenExpiryDate', expiryDate.toString());
    return newToken;
  } catch (error) {
    console.error('Error getting token:', error);
    throw error;
  }
}

function isTokenExpired(expiryDate) {
  return Date.now() > parseInt(expiryDate);
}
