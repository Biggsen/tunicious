import { ref } from 'vue';
import { setCache, getCache, clearCache } from '../utils/cache';
import { logCache } from '@utils/logger';

export function useCache(cacheKey) {
  const cacheCleared = ref(false);
  const loading = ref(false);
  const error = ref(null);

  const loadFromCache = async (fetchFn) => {
    loading.value = true;
    error.value = null;
    cacheCleared.value = false;

    try {
      const cachedData = await getCache(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      return await fetchFn();
    } catch (e) {
      logCache("Error loading from cache:", e);
      error.value = e.message || "Failed to load data. Please try again.";
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const saveToCache = async (data) => {
    try {
      await setCache(cacheKey, data);
    } catch (e) {
      logCache("Error saving to cache:", e);
      error.value = e.message || "Failed to save data to cache.";
      throw e;
    }
  };

  const clearCacheData = async (fetchFn) => {
    try {
      await clearCache(cacheKey);
      cacheCleared.value = true;
      return await fetchFn();
    } catch (e) {
      logCache("Error clearing cache:", e);
      error.value = e.message || "Failed to clear cache.";
      throw e;
    }
  };

  return {
    cacheCleared,
    loading,
    error,
    loadFromCache,
    saveToCache,
    clearCacheData
  };
} 