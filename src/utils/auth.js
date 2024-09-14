import { ref } from "vue";
import { getToken } from "./api";

const tokenRef = ref(localStorage.getItem('token'));

export function useToken() {
  const loading = ref(false);
  const error = ref(null);

  async function initializeToken() {
    if (!tokenRef.value) {
      loading.value = true;
      error.value = null;
      try {
        const newToken = await getAuth();
        if (newToken) {
          tokenRef.value = newToken;
          localStorage.setItem('token', newToken);
        } else {
          throw new Error('Failed to obtain token');
        }
      } catch (e) {
        console.error('Error initializing token:', e);
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    }
  }

  function clearToken() {
    tokenRef.value = null;
    localStorage.removeItem('token');
  }

  return {
    token: tokenRef,
    loading,
    error,
    initializeToken,
    clearToken
  };
}

async function getAuth() {
  // Check if token in localStorage is expired
  const tokenExpiryDate = localStorage.getItem('tokenExpiryDate');
  if (tokenExpiryDate && !isTokenExpired(tokenExpiryDate)) {
    return localStorage.getItem('token');
  }

  // If no token or expired, get a new one
  try {
    const response = await getToken();
    const newToken = response.access_token;
    const expiryDate = Date.now() + 3600000; // Current time + 1 hour
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
