function timeMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function toLibraryDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function withLibrarySave(history, spotifyAlbumId, savedAt) {
  const list = Array.isArray(history) ? history : [];
  const open = list.some((entry) => entry.spotifyAlbumId === spotifyAlbumId && !entry.removedDetectedAt);
  if (open) return { history: list, changed: false };
  return {
    changed: true,
    history: [
      ...list,
      {
        spotifyAlbumId,
        savedAt: toLibraryDate(savedAt),
        removedDetectedAt: null
      }
    ]
  };
}

export function withLibraryRemoval(history, spotifyAlbumId, detectedAt = new Date()) {
  const list = Array.isArray(history) ? history : [];
  let changed = false;
  const next = list.map((entry) => {
    if (entry.spotifyAlbumId !== spotifyAlbumId || entry.removedDetectedAt) return entry;
    changed = true;
    return { ...entry, removedDetectedAt: toLibraryDate(detectedAt) };
  });
  return { history: next, changed };
}

/**
 * Keep every closed period. Each Spotify release keeps one open period, the earlier savedAt.
 */
export function mergeLibraryHistories(primaryHistory, duplicateHistory) {
  const closed = [];
  const openByRelease = new Map();

  for (const entry of [...(primaryHistory || []), ...(duplicateHistory || [])]) {
    if (!entry?.spotifyAlbumId) continue;
    if (entry.removedDetectedAt) {
      closed.push(entry);
      continue;
    }
    const current = openByRelease.get(entry.spotifyAlbumId);
    if (!current || timeMillis(entry.savedAt) < timeMillis(current.savedAt)) {
      openByRelease.set(entry.spotifyAlbumId, entry);
    }
  }

  return [...closed, ...openByRelease.values()];
}
