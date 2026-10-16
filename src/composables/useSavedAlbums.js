import { ref } from 'vue';
import { hasSavedAlbumScopes } from '@/constants';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { useLibraryCatalogue } from './useLibraryCatalogue';
import { logAlbum } from '@utils/logger';

const PAGE_SIZE = 50;

const albums = ref([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref(null);
const needsReconnect = ref(false);
const complete = ref(false);
const total = ref(0);

let loadPromise = null;
let loadGeneration = 0;
let fetchedOffset = 0;

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

export function useSavedAlbums() {
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

  async function loadSavedAlbums({ force = false } = {}) {
    if (!force && complete.value) return;
    if (!force && loadPromise) return loadPromise;

    const generation = ++loadGeneration;
    const resumeOffset = force ? 0 : fetchedOffset;

    loadPromise = (async () => {
      error.value = null;
      needsReconnect.value = false;
      if (force) {
        albums.value = [];
        complete.value = false;
        total.value = 0;
        fetchedOffset = 0;
      }

      loading.value = albums.value.length === 0;
      loadingMore.value = albums.value.length > 0;

      try {
        await ensureLibraryScopes();
        if (generation !== loadGeneration) return;

        let offset = resumeOffset;
        const startedAtZero = resumeOffset === 0;
        const snapshotIds = new Set();
        let snapshotReceived = 0;
        let snapshotDuplicate = false;
        while (generation === loadGeneration) {
          const page = await getSavedAlbums(PAGE_SIZE, offset);
          if (generation !== loadGeneration) return;

          const items = (page?.items || []).map(mapSavedAlbumItem).filter((album) => album.id);
          total.value = typeof page?.total === 'number' ? page.total : offset + items.length;

          const seen = new Set(albums.value.map((album) => album.id));
          const fresh = items.filter((album) => !seen.has(album.id));
          if (fresh.length) {
            albums.value = albums.value.concat(fresh);
          }

          if (startedAtZero) {
            for (const album of items) {
              snapshotReceived += 1;
              if (snapshotIds.has(album.id)) snapshotDuplicate = true;
              snapshotIds.add(album.id);
            }
          }
          reconcileSavedAlbums(items).catch((err) => {
            logAlbum('Library catalogue reconcile failed', err?.message || err);
          });

          const pageLength = (page?.items || []).length;
          offset += pageLength;
          fetchedOffset = offset;
          const done = pageLength === 0 || pageLength < PAGE_SIZE || offset >= total.value;
          if (done) {
            complete.value = true;
            if (startedAtZero && !snapshotDuplicate && snapshotReceived === total.value) {
              closeLibraryRemovals(snapshotIds, checkAlbumsInLibrary).catch((err) => {
                logAlbum('Library removal reconcile failed', err?.message || err);
              });
            } else if (startedAtZero) {
              logAlbum('Skipping library removal pass', {
                snapshotDuplicate,
                snapshotReceived,
                total: total.value
              });
            }
            break;
          }

          loading.value = false;
          loadingMore.value = true;
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
      albums.value = [{
        ...album,
        id: albumId,
        addedAt: new Date().toISOString()
      }, ...previous];
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
