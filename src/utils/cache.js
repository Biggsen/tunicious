const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export function setCache(key, data) {
  const cacheData = {
    data,
    timestamp: Date.now()
  };
  localStorage.setItem(key, JSON.stringify(cacheData));
}

export function getCache(key) {
  const cachedData = localStorage.getItem(key);
  if (!cachedData) return null;

  const { data, timestamp } = JSON.parse(cachedData);
  if (Date.now() - timestamp > CACHE_EXPIRATION) {
    localStorage.removeItem(key);
    return null;
  }

  return data;
}

export function clearCache(key) {
  if (key) {
    localStorage.removeItem(key);
  } else {
    localStorage.clear();
  }
}