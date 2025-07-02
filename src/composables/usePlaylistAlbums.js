import { ref, computed } from 'vue';
import { setCache, getCache, clearCache } from '@/utils/cache';
import { useSpotifyApi } from './useSpotifyApi';
import { useAlbumsData } from './useAlbumsData';
import { usePlaylistMovement } from './usePlaylistMovement';
import { useUserData } from './useUserData';

export function usePlaylistAlbums(playlistIdRef, itemsPerPage = 20) {
  const { user } = useUserData();
  const { getPlaylist, getPlaylistAlbumsWithDates, loadAlbumsBatched } = useSpotifyApi();
  const { fetchAlbumsData, getAlbumDetails, updateAlbumDetails } = useAlbumsData();
  const { updateAlbumPlaylist, error: moveError } = usePlaylistMovement();

  const loading = ref(false);
  const error = ref(null);
  const cacheCleared = ref(false);

  const albumData = ref([]);
  const playlistName = ref('');
  const albumsWithDates = ref([]);
  const sortedAlbumIds = ref([]);
  const albumDbDataMap = ref({});
  const albumRootDataMap = ref({});
  const inCollectionMap = ref({});
  const needsUpdateMap = ref({});

  const sortDirection = ref('asc');
  const currentPage = ref(1);
  const itemsPerPageRef = ref(itemsPerPage);

  const albumIdListCacheKey = computed(() => `playlist_${playlistIdRef.value}_albumsWithDates`);
  const pageCacheKey = (page) => `playlist_${playlistIdRef.value}_page_${page}_${sortDirection.value}`;

  const totalAlbums = computed(() => sortedAlbumIds.value.length);
  const totalPages = computed(() => Math.ceil(totalAlbums.value / itemsPerPageRef.value));
  const showPagination = computed(() => totalAlbums.value > itemsPerPageRef.value);
  const sortDirectionLabel = computed(() => sortDirection.value === 'desc' ? 'Newest First' : 'Oldest First');

  const toggleSort = async () => {
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc';
    await applySortingAndReload();
  };

  const applySortingAndReload = async () => {
    if (albumsWithDates.value.length === 0) return;
    const sorted = [...albumsWithDates.value].sort((a, b) => {
      const dateA = new Date(a.addedAt);
      const dateB = new Date(b.addedAt);
      return sortDirection.value === 'desc' ? dateB - dateA : dateA - dateB;
    });
    sortedAlbumIds.value = sorted.map(a => a.id);
    currentPage.value = 1;
    await loadCurrentPage();
  };

  async function getCachedAlbumDetails(albumId) {
    const cacheKey = `albumRootData_${albumId}`;
    let cached = await getCache(cacheKey);
    if (cached) return cached;
    const details = await getAlbumDetails(albumId);
    if (details) await setCache(cacheKey, details);
    return details;
  }

  async function fetchAlbumIdList() {
    let albumsWithDatesData = await getCache(albumIdListCacheKey.value);
    if (!albumsWithDatesData) {
      albumsWithDatesData = await getPlaylistAlbumsWithDates(playlistIdRef.value);
      await setCache(albumIdListCacheKey.value, albumsWithDatesData);
    }
    albumsWithDates.value = albumsWithDatesData;
    await applySortingAndReload();
    return sortedAlbumIds.value;
  }

  async function fetchAlbumsForPage(albumIds, page) {
    const start = (page - 1) * itemsPerPageRef.value;
    const end = start + itemsPerPageRef.value;
    const pageAlbumIds = albumIds.slice(start, end);
    let pageAlbums = await getCache(pageCacheKey(page));
    if (!pageAlbums) {
      pageAlbums = await loadAlbumsBatched(pageAlbumIds);
      await setCache(pageCacheKey(page), pageAlbums);
    }
    return pageAlbums;
  }

  async function loadCurrentPage() {
    if (sortedAlbumIds.value.length === 0) return;
    albumData.value = await fetchAlbumsForPage(sortedAlbumIds.value, currentPage.value);
    albumDbDataMap.value = await fetchAlbumsData(albumData.value.map(a => a.id));
    const rootDetailsArr = await Promise.all(albumData.value.map(a => getCachedAlbumDetails(a.id)));
    albumRootDataMap.value = Object.fromEntries(albumData.value.map((a, i) => [a.id, rootDetailsArr[i]]));
    inCollectionMap.value = albumDbDataMap.value;
    albumData.value.forEach(album => {
      const userData = albumDbDataMap.value[album.id];
      if (userData && userData.playlistHistory) {
        const currentEntry = userData.playlistHistory.find(entry => !entry.removedAt);
        album.ratingData = currentEntry ? {
          priority: currentEntry.priority,
          category: currentEntry.category,
          type: currentEntry.type,
          playlistId: currentEntry.playlistId
        } : null;
      } else {
        album.ratingData = null;
      }
    });
    await updateNeedsUpdateMap();
    await checkAlbumMovements();
  }

  const nextPage = async () => {
    if (currentPage.value < totalPages.value) {
      currentPage.value++;
      await loadCurrentPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const previousPage = async () => {
    if (currentPage.value > 1) {
      currentPage.value--;
      await loadCurrentPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  async function updateNeedsUpdateMap() {
    const entries = await Promise.all(
      albumData.value.map(async (album) => {
        const inCollection = !!inCollectionMap.value[album.id];
        if (!inCollection) return [album.id, false];
        const details = albumRootDataMap.value[album.id];
        const needsUpdate = !details?.albumCover || !details?.artistId || !details?.releaseYear;
        return [album.id, needsUpdate];
      })
    );
    needsUpdateMap.value = Object.fromEntries(entries);
  }

  async function checkAlbumMovements() {
    for (const album of albumData.value) {
      try {
        const userData = albumDbDataMap.value[album.id];
        if (userData && userData.playlistHistory) {
          const currentEntry = userData.playlistHistory.find(entry => !entry.removedAt);
          if (currentEntry && currentEntry.playlistId !== playlistIdRef.value) {
            album.hasMoved = true;
          } else {
            album.hasMoved = false;
          }
        } else {
          album.hasMoved = false;
        }
      } catch (err) {
        album.hasMoved = false;
      }
    }
  }

  async function handleUpdatePlaylist(album) {
    try {
      error.value = null;
      const playlistData = { playlistId: playlistIdRef.value, name: playlistName.value };
      const success = await updateAlbumPlaylist(album.id, playlistData, album.addedAt);
      if (success) {
        album.hasMoved = false;
        if (user.value) {
          await clearCache(`albumDbData_${album.id}_${user.value.uid}`);
        }
      }
    } catch (err) {
      console.error('Error updating playlist:', err);
      error.value = moveError.value || 'Failed to update playlist location';
    }
  }

  const refreshInCollectionForAlbum = async (albumId) => {
    const result = await fetchAlbumsData([albumId]);
    inCollectionMap.value = { ...inCollectionMap.value, ...result };
    const cacheKey = `albumRootData_${albumId}`;
    await clearCache(cacheKey);
    const details = await getAlbumDetails(albumId);
    if (details) {
      albumRootDataMap.value = { ...albumRootDataMap.value, [albumId]: details };
      await setCache(cacheKey, details);
    }
    await updateNeedsUpdateMap();
  };

  async function handleUpdateAlbumDetails(album) {
    try {
      error.value = null;
      const details = {
        albumCover: album.images?.[1]?.url || album.images?.[0]?.url || '',
        artistId: album.artists?.[0]?.id || '',
        releaseYear: album.release_date ? album.release_date.substring(0, 4) : '',
      };
      await updateAlbumDetails(album.id, details);
      await updateNeedsUpdateMap();
    } catch (err) {
      console.error('Error updating album details:', err);
      error.value = err.message || 'Failed to update album details';
    }
  }

  async function handleClearCache() {
    await clearCache(albumIdListCacheKey.value);
    const totalPagesToClear = totalPages.value || 50;
    for (let page = 1; page <= totalPagesToClear; page++) {
      await clearCache(`playlist_${playlistIdRef.value}_page_${page}_asc`);
      await clearCache(`playlist_${playlistIdRef.value}_page_${page}_desc`);
    }
    if (user.value && albumData.value && albumData.value.length) {
      for (const album of albumData.value) {
        await clearCache(`albumDbData_${album.id}_${user.value.uid}`);
        await clearCache(`albumRootData_${album.id}`);
      }
    }
    cacheCleared.value = true;
    albumData.value = [];
    albumsWithDates.value = [];
    sortedAlbumIds.value = [];
    playlistName.value = '';
    await loadPlaylistPage();
  }

  async function loadPlaylistPage() {
    loading.value = true;
    error.value = null;
    cacheCleared.value = false;
    try {
      await fetchAlbumIdList();
      if (!playlistName.value) {
        const playlistResponse = await getPlaylist(playlistIdRef.value);
        playlistName.value = playlistResponse.name;
      }
      await loadCurrentPage();
    } catch (e) {
      console.error('Error loading playlist page:', e);
      if (e.name === 'QuotaExceededError' || e.message?.includes('quota')) {
        error.value = 'Browser storage is full. Please go to Account > Cache Management to clear some cache data, then try again.';
      } else {
        error.value = e.message || 'Failed to load playlist data. Please try again.';
      }
    } finally {
      loading.value = false;
    }
  }

  return {
    albumData,
    playlistName,
    cacheCleared,
    inCollectionMap,
    needsUpdateMap,
    loading,
    error,
    currentPage,
    totalPages,
    showPagination,
    sortDirection,
    sortDirectionLabel,
    toggleSort,
    nextPage,
    previousPage,
    loadPlaylistPage,
    handleClearCache,
    handleUpdatePlaylist,
    refreshInCollectionForAlbum,
    handleUpdateAlbumDetails,
    itemsPerPage: itemsPerPageRef,
    totalAlbums
  };
}
