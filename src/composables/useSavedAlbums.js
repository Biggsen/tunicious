import { ref } from 'vue';
import { useCurrentUser } from 'vuefire';
import { hasSavedAlbumScopes } from '@/constants';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { useLibraryCatalogue } from './useLibraryCatalogue';
import { logAlbum } from '@utils/logger';
import { decideLibrarySync, slimSavedAlbum } from '@utils/librarySnapshot';
import {
  clearLibrarySnapshots,
  readLibrarySnapshot,
  writeLibrarySnapshot
} from '@utils/librarySnapshotStore';

const PAGE_SIZE = 50;
const REMOVAL_BATCH = 40;

const albums = ref([]);
const loading = ref(false);
const loadingMore = ref(false);
const refreshing = ref(false);
const error = ref(null);
const needsReconnect = ref(false);
const complete = ref(false);
const total = ref(0);

let loadPromise = null;
let loadGeneration = 0;
let loadedForUid = null;
let librarySynced = false;

function slimUnique(list) {
  const slim = [];
  const seen = new Set();
  for (const album of list || []) {
    const next = slimSavedAlbum(album);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    slim.push(next);
  }
  return slim;
}

function orderNewest(list) {
  return [...list].sort((a, b) => (Date.parse(b?.addedAt) || 0) - (Date.parse(a?.addedAt) || 0));
}

export function mapSavedAlbumItem(item) {
  const album = item?.album || {};
  return {
    ...album,
    id: album.id,
    addedAt: item?.added_at || null
  };
}

export function filterAndSortSavedAlbums(list, { query = '', sort = 'recent' } = {}) {
  const q = query.trim().toLowerCase();
  let filtered = list;
  if (q) {
    filtered = list.filter((album) => {
      const title = (album.name || '').toLowerCase();
      const artist = (album.artists || []).map((entry) => entry.name || '').join(' ').toLowerCase();
      return title.includes(q) || artist.includes(q);
    });
  }

  const sorted = [...filtered];
  if (sort === 'title') {
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  } else if (sort === 'artist') {
    sorted.sort((a, b) => {
      const artistCompare = (a.artists?.[0]?.name || '').localeCompare(
        b.artists?.[0]?.name || '',
        undefined,
        { sensitivity: 'base' }
      );
      if (artistCompare !== 0) return artistCompare;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  } else {
    sorted.sort((a, b) => {
      const aTime = a.addedAt ? Date.parse(a.addedAt) : 0;
      const bTime = b.addedAt ? Date.parse(b.addedAt) : 0;
      return bTime - aTime;
    });
  }
  return sorted;
}

function isLibraryReconnectError(err) {
  const message = err?.message || '';
  return Boolean(
    err?.needsReconnect
    || message.includes('reconnect')
    || message.includes('403')
    || message.includes('access denied')
    || message.includes('Forbidden')
  );
}

function resetLibraryMemory() {
  albums.value = [];
  total.value = 0;
  complete.value = false;
  loadedForUid = null;
  librarySynced = false;
}

export async function clearSavedAlbumsCache() {
  loadGeneration += 1;
  loadPromise = null;
  loading.value = false;
  loadingMore.value = false;
  refreshing.value = false;
  error.value = null;
  resetLibraryMemory();
  try {
    await clearLibrarySnapshots();
  } catch (err) {
    logAlbum('Library snapshot clear failed', err?.message || err);
  }
}

export function useSavedAlbums() {
  const user = useCurrentUser();
  const {
    getSavedAlbums,
    checkAlbumsInLibrary,
    saveAlbumsToLibrary,
    removeAlbumsFromLibrary,
    getUserTokens
  } = useUserSpotifyApi();
  const { recordLibrarySave, recordLibraryRemoval, reconcileSavedAlbums, closeLibraryRemovals } = useLibraryCatalogue();

  async function ensureLibraryScopes() {
    const tokens = await getUserTokens();
    if (!hasSavedAlbumScopes(tokens?.scope)) {
      needsReconnect.value = true;
      const err = new Error('Spotify library access needs a reconnect.');
      err.needsReconnect = true;
      throw err;
    }
    needsReconnect.value = false;
  }

  async function persistLibrarySnapshot(uid) {
    if (!uid || !librarySynced) return;
    const slim = slimUnique(albums.value);
    try {
      await writeLibrarySnapshot(uid, {
        total: total.value,
        newestAddedAt: slim[0]?.addedAt || null,
        albums: slim
      });
      loadedForUid = uid;
    } catch (err) {
      logAlbum('Library snapshot write failed', err?.message || err);
    }
  }

  async function hydrateLibrary(uid) {
    if (!uid) return false;
    try {
      const stored = await readLibrarySnapshot(uid);
      if (!stored || !Array.isArray(stored.albums)) return false;
      albums.value = orderNewest(slimUnique(stored.albums));
      total.value = typeof stored.total === 'number' ? stored.total : albums.value.length;
      loadedForUid = uid;
      librarySynced = true;
      return true;
    } catch (err) {
      logAlbum('Library snapshot read failed', err?.message || err);
      return false;
    }
  }

  function reconcileFresh(items, baselineIds, reconciled) {
    const pending = items.filter((album) => album?.id && !baselineIds.has(album.id) && !reconciled.has(album.id));
    pending.forEach((album) => reconciled.add(album.id));
    if (!pending.length) return;
    reconcileSavedAlbums(pending).catch((err) => {
      logAlbum('Library catalogue reconcile failed', err?.message || err);
    });
  }

  function albumsSavedDuringSync(baselineIds, excludeIds) {
    return slimUnique(albums.value).filter((album) => !baselineIds.has(album.id) && !excludeIds.has(album.id));
  }

  function applyIncremental(snapshot, baseline, decision, pages) {
    const freshSlim = slimUnique(decision.fresh);
    const freshIds = new Set(freshSlim.map((album) => album.id));
    const baselineIds = new Set(baseline.map((album) => album.id));
    const extras = albumsSavedDuringSync(baselineIds, freshIds);
    if (!snapshot) {
      const pending = decision.done
        ? []
        : baseline.filter((album) => !freshIds.has(album.id));
      albums.value = orderNewest(freshSlim.concat(extras, pending));
      return;
    }

    const updates = new Map();
    for (const page of pages) {
      for (const album of page || []) {
        if (album?.id) updates.set(album.id, album.addedAt || null);
      }
    }

    let changedAddedAt = false;
    const rest = baseline
      .filter((album) => !freshIds.has(album.id))
      .map((album) => {
        const addedAt = updates.get(album.id);
        if (!addedAt || addedAt === album.addedAt) return album;
        changedAddedAt = true;
        return { ...album, addedAt };
      });

    if (freshSlim.length || changedAddedAt || extras.length) {
      albums.value = orderNewest(freshSlim.concat(extras, rest));
    }
  }

  async function dropAlbumsMissingFromSpotify(ids, generation) {
    const removed = [];
    for (let i = 0; i < ids.length; i += REMOVAL_BATCH) {
      if (generation !== loadGeneration) return;
      const batch = ids.slice(i, i + REMOVAL_BATCH);
      let flags = [];
      try {
        flags = await checkAlbumsInLibrary(batch);
      } catch (err) {
        logAlbum('Skipping library removal check after Spotify contains failed', err?.message || err);
        continue;
      }
      if (!Array.isArray(flags)) continue;
      for (let j = 0; j < batch.length; j += 1) {
        if (flags[j] !== false) continue;
        removed.push(batch[j]);
      }
    }

    if (generation !== loadGeneration || !removed.length) return;
    const gone = new Set(removed);
    albums.value = albums.value.filter((album) => !gone.has(album.id));
    for (const albumId of removed) {
      try {
        await recordLibraryRemoval(albumId);
      } catch (err) {
        logAlbum('Failed to close library period', { albumId, error: err?.message || err });
      }
    }
  }

  async function walkEntireLibrary({ generation, baselineIds, uid, fetchStartedAt }) {
    const hadAlbums = albums.value.length > 0;
    const walked = [];
    const seen = new Set();
    const reconciled = new Set();
    let duplicate = false;
    let offset = 0;
    let spotifyTotal = 0;

    loading.value = !hadAlbums;
    loadingMore.value = false;

    while (generation === loadGeneration) {
      const page = await getSavedAlbums(PAGE_SIZE, offset);
      if (generation !== loadGeneration) return;

      const items = (page?.items || []).map(mapSavedAlbumItem).filter((album) => album.id);
      const pageLength = (page?.items || []).length;
      spotifyTotal = typeof page?.total === 'number' ? page.total : offset + pageLength;

      for (const album of items) {
        if (seen.has(album.id)) duplicate = true;
        seen.add(album.id);
        walked.push(album);
      }
      reconcileFresh(items, baselineIds, reconciled);

      offset += pageLength;
      const done = pageLength === 0 || pageLength < PAGE_SIZE || offset >= spotifyTotal;
      const walkedSlim = slimUnique(walked);
      const walkedIds = new Set(walkedSlim.map((album) => album.id));
      const kept = albumsSavedDuringSync(baselineIds, walkedIds);
      if (!hadAlbums) {
        albums.value = orderNewest(kept.concat(walkedSlim));
        total.value = spotifyTotal;
      }

      if (done) {
        albums.value = orderNewest(kept.concat(walkedSlim));
        total.value = spotifyTotal;
        complete.value = true;
        librarySynced = true;
        loadedForUid = uid;
        if (!duplicate && seen.size === spotifyTotal) {
          closeLibraryRemovals(seen, checkAlbumsInLibrary, fetchStartedAt).catch((err) => {
            logAlbum('Library removal reconcile failed', err?.message || err);
          });
        } else {
          logAlbum('Skipping library removal pass', {
            snapshotDuplicate: duplicate,
            snapshotReceived: seen.size,
            total: spotifyTotal
          });
        }
        await persistLibrarySnapshot(uid);
        return;
      }

      loading.value = false;
      loadingMore.value = !hadAlbums;
    }
  }

  async function syncLibraryChanges({ generation, uid }) {
    const baseline = slimUnique(albums.value);
    const baselineIds = new Set(baseline.map((album) => album.id));
    const hasBaseline = librarySynced && loadedForUid === uid;
    const snapshot = hasBaseline ? { total: total.value, albums: baseline } : null;
    const pages = [];
    const reconciled = new Set();
    let offset = 0;

    loading.value = baseline.length === 0;
    loadingMore.value = false;

    while (generation === loadGeneration) {
      const page = await getSavedAlbums(PAGE_SIZE, offset);
      if (generation !== loadGeneration) return;

      const items = (page?.items || []).map(mapSavedAlbumItem).filter((album) => album.id);
      const pageLength = (page?.items || []).length;
      const spotifyTotal = typeof page?.total === 'number' ? page.total : offset + pageLength;
      pages.push(items);

      const decision = decideLibrarySync({
        snapshot,
        pages,
        spotifyTotal,
        pageSize: PAGE_SIZE,
        lastPageLength: pageLength,
        received: offset + pageLength
      });

      if (!decision.unchanged) {
        applyIncremental(snapshot, baseline, decision, pages);
        total.value = spotifyTotal;
        reconcileFresh(decision.fresh, baselineIds, reconciled);
      }

      offset += pageLength;
      if (decision.done) {
        if (generation !== loadGeneration) return;
        if (!decision.unchanged && decision.checkRemovalIds.length) {
          await dropAlbumsMissingFromSpotify(decision.checkRemovalIds, generation);
          if (generation !== loadGeneration) return;
        }
        complete.value = true;
        librarySynced = true;
        loadedForUid = uid;
        if (!decision.unchanged) {
          await persistLibrarySnapshot(uid);
        }
        return;
      }

      loading.value = false;
      loadingMore.value = !snapshot;
    }
  }

  async function loadSavedAlbums({ force = false } = {}) {
    if (!force && loadPromise) return loadPromise;

    const generation = ++loadGeneration;
    loadPromise = (async () => {
      error.value = null;
      needsReconnect.value = false;
      if (force) refreshing.value = true;

      try {
        const uid = user.value?.uid || null;
        if (loadedForUid && uid && loadedForUid !== uid) {
          resetLibraryMemory();
        }
        if (!librarySynced || loadedForUid !== uid) {
          await hydrateLibrary(uid);
          if (generation !== loadGeneration) return;
        }

        loading.value = albums.value.length === 0;
        await ensureLibraryScopes();
        if (generation !== loadGeneration) return;

        const activeUid = user.value?.uid || uid;
        if (loadedForUid && activeUid && loadedForUid !== activeUid) {
          resetLibraryMemory();
          await hydrateLibrary(activeUid);
          if (generation !== loadGeneration) return;
        }

        if (force) {
          const baselineIds = new Set(albums.value.map((album) => album.id));
          await walkEntireLibrary({
            generation,
            baselineIds,
            uid: activeUid,
            fetchStartedAt: Date.now()
          });
        } else {
          await syncLibraryChanges({ generation, uid: activeUid });
        }
      } catch (err) {
        if (generation !== loadGeneration) return;
        if (isLibraryReconnectError(err)) {
          needsReconnect.value = true;
        }
        error.value = err?.message || 'Could not load saved albums';
        complete.value = false;
      } finally {
        if (generation === loadGeneration) {
          loading.value = false;
          loadingMore.value = false;
          refreshing.value = false;
          loadPromise = null;
        }
      }
    })();

    return loadPromise;
  }

  async function isAlbumSaved(albumId) {
    if (!albumId) return false;
    await ensureLibraryScopes();
    const result = await checkAlbumsInLibrary([albumId]);
    return Array.isArray(result) ? Boolean(result[0]) : false;
  }

  async function saveAlbum(album) {
    const albumId = album?.id;
    if (!albumId) {
      throw new Error('Missing Spotify album id');
    }

    await ensureLibraryScopes();

    const previous = albums.value.slice();
    const previousTotal = total.value;
    const alreadyListed = previous.some((entry) => entry.id === albumId);
    if (!alreadyListed) {
      const listed = slimSavedAlbum({
        ...album,
        id: albumId,
        addedAt: new Date().toISOString()
      });
      albums.value = [listed, ...previous];
      total.value = previousTotal + 1;
    }

    try {
      await saveAlbumsToLibrary([albumId]);
      try {
        await recordLibrarySave({
          ...album,
          id: albumId
        }, new Date());
      } catch (catalogueErr) {
        logAlbum('Spotify save succeeded but catalogue update failed', catalogueErr?.message || catalogueErr);
      }
      await persistLibrarySnapshot(user.value?.uid);
    } catch (err) {
      albums.value = previous;
      total.value = previousTotal;
      if (isLibraryReconnectError(err)) {
        needsReconnect.value = true;
        err.needsReconnect = true;
      }
      throw err;
    }
  }

  async function removeAlbum(albumId) {
    if (!albumId) {
      throw new Error('Missing Spotify album id');
    }

    await ensureLibraryScopes();

    const previous = albums.value.slice();
    const previousTotal = total.value;
    const next = previous.filter((album) => album.id !== albumId);
    albums.value = next;
    if (next.length !== previous.length) {
      total.value = Math.max(0, previousTotal - 1);
    }

    try {
      await removeAlbumsFromLibrary([albumId]);
      try {
        await recordLibraryRemoval(albumId);
      } catch (catalogueErr) {
        logAlbum('Spotify remove succeeded but catalogue update failed', catalogueErr?.message || catalogueErr);
      }
      await persistLibrarySnapshot(user.value?.uid);
    } catch (err) {
      albums.value = previous;
      total.value = previousTotal;
      if (isLibraryReconnectError(err)) {
        needsReconnect.value = true;
        err.needsReconnect = true;
      }
      throw err;
    }
  }

  return {
    albums,
    loading,
    loadingMore,
    refreshing,
    error,
    needsReconnect,
    complete,
    total,
    loadSavedAlbums,
    isAlbumSaved,
    saveAlbum,
    removeAlbum
  };
}
