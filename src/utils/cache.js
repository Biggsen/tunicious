import { logCache } from './logger';

const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_CACHE_ENTRIES = 100; // Maximum number of cache entries to keep

export function setCache(key, data) {
  const cacheData = {
    data,
    timestamp: Date.now()
  };
  
  try {
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      logCache('localStorage quota exceeded, attempting cleanup...');
      
      // Try to clean up old cache entries
      cleanupOldCache();
      
      try {
        // Try again after cleanup
        localStorage.setItem(key, JSON.stringify(cacheData));
        logCache('Successfully cached after cleanup');
      } catch (secondError) {
        // If still failing, try more aggressive cleanup
        logCache('Still failing after cleanup, trying aggressive cleanup...');
        aggressiveCleanup();
        
        try {
          localStorage.setItem(key, JSON.stringify(cacheData));
          logCache('Successfully cached after aggressive cleanup');
        } catch (finalError) {
          logCache('Failed to cache even after aggressive cleanup:', finalError);
          // Don't throw - let the app continue without caching
        }
      }
    } else {
      logCache('Unexpected localStorage error:', error);
    }
  }
}

export function getCache(key) {
  try {
    const cachedData = localStorage.getItem(key);
    if (!cachedData) return null;

    const { data, timestamp } = JSON.parse(cachedData);
    if (Date.now() - timestamp > CACHE_EXPIRATION) {
      localStorage.removeItem(key);
      return null;
    }

    return data;
  } catch (error) {
    logCache('Error reading from cache:', error);
    // Try to remove corrupted cache entry
    try {
      localStorage.removeItem(key);
    } catch (removeError) {
      logCache('Error removing corrupted cache entry:', removeError);
    }
    return null;
  }
}

export function clearCache(key) {
  try {
    if (key) {
      localStorage.removeItem(key);
    } else {
      localStorage.clear();
    }
  } catch (error) {
    logCache('Error clearing cache:', error);
  }
}

/**
 * Clean up expired cache entries
 */
function cleanupOldCache() {
  const keysToRemove = [];
  const now = Date.now();
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      try {
        const item = localStorage.getItem(key);
        if (!item) continue;
        
        const parsed = JSON.parse(item);
        if (parsed.timestamp && (now - parsed.timestamp > CACHE_EXPIRATION)) {
          keysToRemove.push(key);
        }
      } catch (parseError) {
        // If we can't parse it, it might be corrupted, remove it
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        logCache(`Error removing cache key ${key}:`, error);
      }
    });
    
    logCache(`Cleaned up ${keysToRemove.length} expired cache entries`);
  } catch (error) {
    logCache('Error during cache cleanup:', error);
  }
}

/**
 * More aggressive cleanup - removes oldest entries if we still have too many
 */
function aggressiveCleanup() {
  const cacheEntries = [];
  
  try {
    // Collect all cache entries with timestamps
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      try {
        const item = localStorage.getItem(key);
        if (!item) continue;
        
        const parsed = JSON.parse(item);
        if (parsed.timestamp) {
          cacheEntries.push({
            key,
            timestamp: parsed.timestamp,
            size: item.length // Approximate size
          });
        }
      } catch (parseError) {
        // Remove unparseable entries
        try {
          localStorage.removeItem(key);
        } catch (removeError) {
          logCache(`Error removing unparseable key ${key}:`, removeError);
        }
      }
    }
    
    // Sort by timestamp (oldest first) and size (largest first for same timestamp)
    cacheEntries.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return b.size - a.size;
    });
    
    // Remove oldest entries if we have too many
    const entriesToRemove = cacheEntries.length > MAX_CACHE_ENTRIES ? 
      cacheEntries.slice(0, cacheEntries.length - MAX_CACHE_ENTRIES) :
      cacheEntries.slice(0, Math.floor(cacheEntries.length * 0.3)); // Remove 30% of entries
    
    entriesToRemove.forEach(entry => {
      try {
        localStorage.removeItem(entry.key);
      } catch (error) {
        logCache(`Error removing cache key ${entry.key}:`, error);
      }
    });
    
    logCache(`Aggressively cleaned up ${entriesToRemove.length} cache entries`);
  } catch (error) {
    logCache('Error during aggressive cleanup:', error);
  }
}

/**
 * Get information about current cache usage
 */
export function getCacheInfo() {
  let totalEntries = 0;
  let totalSize = 0;
  let expiredEntries = 0;
  const now = Date.now();
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      const item = localStorage.getItem(key);
      if (!item) continue;
      
      totalSize += item.length;
      
      try {
        const parsed = JSON.parse(item);
        if (parsed.timestamp) {
          totalEntries++;
          if (now - parsed.timestamp > CACHE_EXPIRATION) {
            expiredEntries++;
          }
        }
      } catch (parseError) {
        // Count unparseable entries as expired
        expiredEntries++;
      }
    }
  } catch (error) {
    logCache('Error getting cache info:', error);
  }
  
  return {
    totalEntries,
    totalSize,
    expiredEntries,
    totalSizeKB: Math.round(totalSize / 1024),
    totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
  };
}