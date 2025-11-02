<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setCache, getCache, clearCache } from "@utils/cache";
import AlbumItem from "@components/AlbumItem.vue";
import { useUserData } from "@composables/useUserData";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import BackButton from '@components/common/BackButton.vue';

import { useAlbumsData } from "@composables/useAlbumsData";
import { useAlbumMappings } from "@composables/useAlbumMappings";
import { ArrowPathIcon, PencilIcon, BarsArrowUpIcon, BarsArrowDownIcon } from '@heroicons/vue/24/solid'
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ProgressModal from '@components/common/ProgressModal.vue';
import { getCachedLovedTracks, calculateLovedTrackPercentage } from '@utils/lastFmUtils';
import { albumTitleSimilarity } from '@utils/fuzzyMatch';
import AlbumSearch from '@components/AlbumSearch.vue';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useCurrentPlayingTrack } from '@composables/useCurrentPlayingTrack';

const route = useRoute();
const { user, userData } = useUserData();
const { getPlaylist, getPlaylistAlbumsWithDates, loadAlbumsBatched, addAlbumToPlaylist, removeAlbumFromPlaylist: removeFromSpotify, loading: spotifyLoading, error: spotifyError, getAlbumTracks, getAllArtistAlbums } = useUserSpotifyApi();

const { getCurrentPlaylistInfo, fetchAlbumsData, getAlbumDetails, getAlbumsDetailsBatch, updateAlbumDetails, getAlbumRatingData, addAlbumToCollection, removeAlbumFromPlaylist, searchAlbumsByTitleAndArtist } = useAlbumsData();
const { getPrimaryId, isAlternateId, createMapping } = useAlbumMappings();
const { loveTrack, unloveTrack } = useLastFmApi();

// Initialize current playing track tracking
const { startPolling: startCurrentTrackPolling, stopPolling: stopCurrentTrackPolling } = useCurrentPlayingTrack(userData.value?.lastFmUserName);

// Processing state
const processingAlbum = ref(null);

const id = computed(() => route.params.id);
const loading = ref(false);
const error = ref(null);
const cacheCleared = ref(false);
const updating = ref(false);

const albumData = ref([]);
const playlistName = ref('');
const playlistDoc = ref(null);
const totalTracks = ref(0);

// Store the full album data with dates and sorted album IDs
const albumsWithDates = ref([]);
const sortedAlbumIds = ref([]);

// Manual sorting state instead of useSorting composable
const sortDirection = ref('asc'); // Default to oldest first

const sortDirectionLabel = computed(() => {
  return sortDirection.value === 'desc' ? 'Newest First' : 'Oldest First';
});

// Tracklist display state - initialize from localStorage
const TRACKLIST_STORAGE_KEY = 'audiofoodie_showTracklists';
const showTracklists = ref(localStorage.getItem(TRACKLIST_STORAGE_KEY) === 'true');
const albumTracks = ref({}); // Store tracks for each album
const tracksLoading = ref(false);

const toggleSort = async () => {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc';
  await applySortingAndReload();
};

// Fetch tracks for all albums when tracklists are enabled
const fetchAlbumTracks = async () => {
  if (!showTracklists.value || !albumData.value.length) return;
  
  tracksLoading.value = true;
  try {
    const trackPromises = albumData.value.map(async (album) => {
      if (!albumTracks.value[album.id]) {
        try {
          const response = await getAlbumTracks(album.id);
          albumTracks.value[album.id] = response.items || [];
        } catch (error) {
          console.error(`Failed to fetch tracks for album ${album.id}:`, error);
          albumTracks.value[album.id] = [];
        }
      }
    });
    
    await Promise.all(trackPromises);
  } finally {
    tracksLoading.value = false;
  }
};

// Watch for showTracklists changes - fetch tracks and persist to localStorage
watch(showTracklists, (newValue) => {
  // Save to localStorage
  localStorage.setItem(TRACKLIST_STORAGE_KEY, String(newValue));
  
  // Fetch tracks if enabled
  if (newValue) {
    fetchAlbumTracks();
  }
});

// Handle track loving/unloving with optimistic cache updates
const handleTrackLoved = async ({ album, track }) => {
  if (!userData.value?.lastFmSessionKey || !userData.value?.lastFmUserName) return;
  
  try {
    // Optimistically add track to loved tracks
    const lovedTrack = {
      name: track.name,
      artist: { name: track.artists[0].name },
      date: { uts: Math.floor(Date.now() / 1000).toString() }
    };
    lovedTracks.value = [...lovedTracks.value, lovedTrack];
    
    // Update cache with new loved tracks
    const cacheKey = `lovedTracks_${userData.value.lastFmUserName}`;
    await setCache(cacheKey, lovedTracks.value);
    
    // Make API call
    await loveTrack(track.name, track.artists[0].name, userData.value.lastFmSessionKey);
    
    // Recalculate loved track percentage for this album
    if (albumLovedData.value[album.id]) {
      const result = await calculateLovedTrackPercentage(album, lovedTracks.value, albumTracks.value[album.id]);
      albumLovedData.value[album.id] = {
        ...result,
        isLoading: false
      };
    }
    
  } catch (error) {
    console.error('Error loving track:', error);
    
    // On error, refetch from Last.fm to get accurate state
    if (userData.value?.lastFmUserName) {
      await clearCache(`lovedTracks_${userData.value.lastFmUserName}`);
      lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
      
      // Recalculate percentages after refetch
      if (albumLovedData.value[album.id]) {
        const result = await calculateLovedTrackPercentage(album, lovedTracks.value, albumTracks.value[album.id]);
        albumLovedData.value[album.id] = {
          ...result,
          isLoading: false
        };
      }
    }
  }
};

const handleTrackUnloved = async ({ album, track }) => {
  if (!userData.value?.lastFmSessionKey || !userData.value?.lastFmUserName) return;
  
  try {
    // Optimistically remove track from loved tracks
    lovedTracks.value = lovedTracks.value.filter(lovedTrack => {
      const trackNameMatch = lovedTrack.name?.toLowerCase() === track.name.toLowerCase();
      const artistMatch = lovedTrack.artist?.name?.toLowerCase() === track.artists[0].name.toLowerCase();
      return !(trackNameMatch && artistMatch);
    });
    
    // Update cache with new loved tracks
    const cacheKey = `lovedTracks_${userData.value.lastFmUserName}`;
    await setCache(cacheKey, lovedTracks.value);
    
    // Make API call
    await unloveTrack(track.name, track.artists[0].name, userData.value.lastFmSessionKey);
    
    // Recalculate loved track percentage for this album
    if (albumLovedData.value[album.id]) {
      const result = await calculateLovedTrackPercentage(album, lovedTracks.value, albumTracks.value[album.id]);
      albumLovedData.value[album.id] = {
        ...result,
        isLoading: false
      };
    }
    
  } catch (error) {
    console.error('Error unloving track:', error);
    
    // On error, refetch from Last.fm to get accurate state
    if (userData.value?.lastFmUserName) {
      await clearCache(`lovedTracks_${userData.value.lastFmUserName}`);
      lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
      
      // Recalculate percentages after refetch
      if (albumLovedData.value[album.id]) {
        const result = await calculateLovedTrackPercentage(album, lovedTracks.value, albumTracks.value[album.id]);
        albumLovedData.value[album.id] = {
          ...result,
          isLoading: false
        };
      }
    }
  }
};

// Manual refresh of loved tracks and playcounts from Last.fm
const refreshingLovedTracks = ref(false);
const refreshLovedTracks = async () => {
  if (!userData.value?.lastFmUserName) return;
  
  try {
    refreshingLovedTracks.value = true;
    
    // Clear cache and refetch loved tracks from Last.fm
    await clearCache(`lovedTracks_${userData.value.lastFmUserName}`);
    lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
    
    // Recalculate all loved track percentages
    for (const album of albumData.value) {
      if (albumLovedData.value[album.id] && albumTracks.value[album.id]) {
        const result = await calculateLovedTrackPercentage(album, lovedTracks.value, albumTracks.value[album.id]);
        albumLovedData.value[album.id] = {
          ...result,
          isLoading: false
        };
      }
    }
    
    // If tracklists are shown, also refresh playcounts for all visible albums
    if (showTracklists.value && albumData.value.length > 0) {
      // Trigger playcount refresh for all albums by re-fetching their tracks
      // This will cause TrackList components to refetch playcounts
      const albumIds = albumData.value.map(album => album.id);
      
      // Clear any cached track data to force fresh playcount fetches
      for (const albumId of albumIds) {
        await clearCache(`albumTracks_${albumId}`);
      }
      
      // Re-fetch tracks for all albums to trigger playcount refresh
      await fetchAlbumTracks();
    }
  } catch (error) {
    console.error('Error refreshing loved tracks and playcounts:', error);
  } finally {
    refreshingLovedTracks.value = false;
  }
};

// Apply sorting to the full album list
const applySortingAndReload = async () => {
  if (albumsWithDates.value.length === 0) return;
  
  // Sort the full albums with dates list
  const sorted = [...albumsWithDates.value].sort((a, b) => {
    const dateA = new Date(a.addedAt);
    const dateB = new Date(b.addedAt);
    return sortDirection.value === 'desc' 
      ? dateB - dateA 
      : dateA - dateB;
  });
  
  // Update the sorted album IDs for pagination
  sortedAlbumIds.value = sorted.map(a => a.id);
  
  // Reset to first page and reload current page
  currentPage.value = 1;
  await loadCurrentPage();
};

const currentPage = ref(1);
const itemsPerPage = ref(20);

// Update paginatedAlbums to use albumData (current page albums)
const paginatedAlbums = computed(() => {
  return albumData.value;
});

// Update totalAlbums to use sortedAlbumIds
const totalAlbums = computed(() => sortedAlbumIds.value.length);

// Compute missing albums count
const missingAlbumsCount = computed(() => {
  if (totalAlbums.value === 0) return 0;
  const missing = totalAlbums.value - albumsInDbCount.value;
  return missing > 0 ? missing : 0;
});

// Update totalPages calculation
const totalPages = computed(() => Math.ceil(sortedAlbumIds.value.length / itemsPerPage.value));

const showPagination = computed(() => totalAlbums.value > itemsPerPage.value);

// Update cache keys
const albumIdListCacheKey = computed(() => `playlist_${id.value}_albumsWithDates`);
const pageCacheKey = (page) => `playlist_${id.value}_page_${page}_${sortDirection.value}`;

const inCollectionMap = ref({});
const needsUpdateMap = ref({});

const albumDbDataMap = ref({});
const albumRootDataMap = ref({});

// Count of albums in database
const albumsInDbCount = ref(0);

// Batch processing state
const batchProcessingAlbums = ref(false);
const albumsToProcess = ref(0);
const albumsProcessed = ref(0);
const currentlyProcessingAlbum = ref(null);
const batchProcessingStartTime = ref(null);
const showProgressModal = ref(false);

// ID mismatch checking state
const checkingMismatches = ref(false);
const mismatchReport = ref([]);
const showMismatchReport = ref(false);
const mismatchCheckStartTime = ref(null);
const mismatchCheckProgress = ref({ current: 0, total: 0, currentArtist: null });

// Last.fm loved tracks data
const lovedTracks = ref([]);
const lovedTracksLoadingStarted = ref(false);
const albumLovedData = ref({}); // Map of albumId -> { lovedCount, totalCount, percentage, isLoading }

// Add a cache utility for album root details
async function getCachedAlbumDetails(albumId) {
  const cacheKey = `albumRootData_${albumId}`;
  let cached = await getCache(cacheKey);
  if (cached) return cached;
  const details = await getAlbumDetails(albumId);
  if (details) await setCache(cacheKey, details);
  return details;
}

// Progressive loading of loved track percentages
async function loadLovedTrackPercentages() {
  if (!userData.value?.lastFmUserName || lovedTracksLoadingStarted.value) {
    return;
  }
  
  try {
    lovedTracksLoadingStarted.value = true;
    
    // Set loading state for all current albums
    albumData.value.forEach(album => {
      albumLovedData.value[album.id] = {
        lovedCount: 0,
        totalCount: 0,
        percentage: 0,
        isLoading: true
      };
    });
    
    // Fetch loved tracks once (cached for 24 hours)
    lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
    
    if (!lovedTracks.value.length) {
      // No loved tracks, clear loading states
      albumData.value.forEach(album => {
        albumLovedData.value[album.id] = {
          lovedCount: 0,
          totalCount: 0,
          percentage: 0,
          isLoading: false
        };
      });
      return;
    }
    
    // Calculate percentages progressively for each album
    for (const album of albumData.value) {
      try {
        const result = await calculateLovedTrackPercentage(album, lovedTracks.value);
        albumLovedData.value[album.id] = {
          ...result,
          isLoading: false
        };
      } catch (err) {
        console.error(`Error calculating loved track percentage for album ${album.id}:`, err);
        albumLovedData.value[album.id] = {
          lovedCount: 0,
          totalCount: 0,
          percentage: 0,
          isLoading: false
        };
      }
      
      // Small delay to prevent overwhelming the UI with updates
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
  } catch (err) {
    console.error('Error loading loved track percentages:', err);
    // Clear loading states on error
    albumData.value.forEach(album => {
      albumLovedData.value[album.id] = {
        lovedCount: 0,
        totalCount: 0,
        percentage: 0,
        isLoading: false
      };
    });
  }
}

// Function to load loved track data for newly added albums (when pagination changes)
async function loadLovedTrackPercentagesForNewAlbums() {
  if (!userData.value?.lastFmUserName || !lovedTracks.value.length) {
    return;
  }
  
  // Find albums that don't have loved track data yet
  const newAlbums = albumData.value.filter(album => !albumLovedData.value[album.id]);
  
  if (!newAlbums.length) return;
  
  // Set loading state for new albums
  newAlbums.forEach(album => {
    albumLovedData.value[album.id] = {
      lovedCount: 0,
      totalCount: 0,
      percentage: 0,
      isLoading: true
    };
  });
  
  // Calculate percentages for new albums
  for (const album of newAlbums) {
    try {
      const result = await calculateLovedTrackPercentage(album, lovedTracks.value);
      albumLovedData.value[album.id] = {
        ...result,
        isLoading: false
      };
    } catch (err) {
      console.error(`Error calculating loved track percentage for album ${album.id}:`, err);
      albumLovedData.value[album.id] = {
        lovedCount: 0,
        totalCount: 0,
        percentage: 0,
        isLoading: false
      };
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function countAlbumsInDatabase() {
  if (!sortedAlbumIds.value.length || !user.value) {
    albumsInDbCount.value = 0;
    return;
  }
  
  // Batch check all albums from the playlist
  const allAlbumIds = sortedAlbumIds.value;
  albumsInDbCount.value = 0;
  
  // Process in batches to avoid overwhelming the database
  const batchSize = 50;
  for (let i = 0; i < allAlbumIds.length; i += batchSize) {
    const batch = allAlbumIds.slice(i, i + batchSize);
    const batchData = await fetchAlbumsData(batch);
    const count = Object.values(batchData).filter(data => data !== null).length;
    albumsInDbCount.value += count;
  }
}

async function fetchAlbumIdList(playlistId) {
  let albumsWithDatesData = await getCache(albumIdListCacheKey.value);
  if (!albumsWithDatesData) {
    albumsWithDatesData = await getPlaylistAlbumsWithDates(playlistId);
    await setCache(albumIdListCacheKey.value, albumsWithDatesData);
  }
  albumsWithDates.value = albumsWithDatesData;
  
  // Apply initial sorting
  await applySortingAndReload();
  
  // Count albums in database after loading all albums
  await countAlbumsInDatabase();
  
  return sortedAlbumIds.value;
}

async function fetchAlbumsForPage(albumIds, page) {
  const start = (page - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  const pageAlbumIds = albumIds.slice(start, end);
  
  // Check cache first
  let pageAlbums = await getCache(pageCacheKey(page));
  if (pageAlbums) {
    return pageAlbums;
  }
  
  // Strategy: Check DB first, then Spotify API for missing albums
  // 1. Get album details from DB (batched for efficiency)
  const dbAlbumsMap = await getAlbumsDetailsBatch(pageAlbumIds);
  
  // 2. Identify which albums need to be fetched from Spotify
  const missingFromDb = pageAlbumIds.filter(id => !dbAlbumsMap[id]);
  
  // 3. Fetch missing albums from Spotify API (only if needed)
  let spotifyAlbums = [];
  if (missingFromDb.length > 0) {
    spotifyAlbums = await loadAlbumsBatched(missingFromDb);
  }
  
  // 4. Combine DB albums and Spotify albums, maintaining order
  pageAlbums = pageAlbumIds.map(id => {
    // Prefer DB album if available, otherwise use Spotify album
    return dbAlbumsMap[id] || spotifyAlbums.find(album => album.id === id) || null;
  }).filter(album => album !== null); // Remove any null entries
  
  // Cache the combined result
  await setCache(pageCacheKey(page), pageAlbums);
  
  return pageAlbums;
}

// Add a separate function to load the current page
async function loadCurrentPage() {
  if (sortedAlbumIds.value.length === 0) return;
  
  albumData.value = await fetchAlbumsForPage(sortedAlbumIds.value, currentPage.value);
  
  // Batch fetch user album data and root details
  albumDbDataMap.value = await fetchAlbumsData(albumData.value.map(a => a.id));
  const rootDetailsArr = await Promise.all(albumData.value.map(a => getCachedAlbumDetails(a.id)));
  albumRootDataMap.value = Object.fromEntries(albumData.value.map((a, i) => [a.id, rootDetailsArr[i]]));
  // Use the batch data for inCollectionMap
  inCollectionMap.value = albumDbDataMap.value;
  // Use the batch data for ratingData
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
  
  // Load loved track percentages progressively
  if (userData.value?.lastFmUserName) {
    if (!lovedTracksLoadingStarted.value) {
      // First time loading - start progressive loading
      loadLovedTrackPercentages();
    } else {
      // Subsequent page loads - only load data for new albums
      loadLovedTrackPercentagesForNewAlbums();
    }
  }
}

async function handleClearCache() {
  // Clear all related cache keys for this playlist
  await clearCache(albumIdListCacheKey.value);
  
  // Clear page caches for both sort directions
  const totalPagesToClear = totalPages.value || 50; // Fallback number
  for (let page = 1; page <= totalPagesToClear; page++) {
    await clearCache(`playlist_${id.value}_page_${page}_asc`);
    await clearCache(`playlist_${id.value}_page_${page}_desc`);
  }
  
  // Also clear albumDbData cache for all albums on the current page
  if (user.value && albumData.value && albumData.value.length) {
    for (const album of albumData.value) {
      await clearCache(`albumDbData_${album.id}_${user.value.uid}`);
      // Clear album root data cache as well
      await clearCache(`albumRootData_${album.id}`);
    }
  }
  
  cacheCleared.value = true;
  albumData.value = [];
  albumsWithDates.value = [];
  sortedAlbumIds.value = [];
  playlistName.value = '';
  albumsInDbCount.value = 0;
  
  // Clear loved tracks data
  lovedTracks.value = [];
  lovedTracksLoadingStarted.value = false;
  albumLovedData.value = {};
  
  // Clear loved tracks cache if exists
  if (userData.value?.lastFmUserName) {
    await clearCache(`lovedTracks_${userData.value.lastFmUserName}`);
  }
  
  await loadPlaylistPage();
}

async function getPlaylistDocument() {
  if (!user.value) return null;
  
  const playlistsRef = collection(db, 'playlists');
  const q = query(playlistsRef, where('playlistId', '==', id.value));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    console.warn('Playlist document not found');
    return null;
  }
  
  return querySnapshot.docs[0];
}

async function updatePlaylistName() {
  if (!user.value || !playlistName.value) return;
  
  try {
    updating.value = true;
    error.value = null;
    
    // Get the playlist document if we don't have it
    if (!playlistDoc.value) {
      playlistDoc.value = await getPlaylistDocument();
    }
    
    if (!playlistDoc.value) {
      throw new Error('Playlist document not found');
    }
    
    // Update the playlist document with the name
    await updateDoc(doc(db, 'playlists', playlistDoc.value.id), {
      name: playlistName.value,
      updatedAt: serverTimestamp()
    });
    
    // Update the local document data to reflect the change
    playlistDoc.value = await getPlaylistDocument();
    
  } catch (err) {
    console.error('Error updating playlist:', err);
    error.value = err.message || 'Failed to update playlist';
  } finally {
    updating.value = false;
  }
}

// Update pagination logic to load data per page
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





const refreshInCollectionForAlbum = async (albumId) => {
  // Refresh both collection status AND root details for the album
  const result = await fetchAlbumsData([albumId]);
  inCollectionMap.value = { ...inCollectionMap.value, ...result };
  
  // Clear the cache for this album to ensure fresh data
  const cacheKey = `albumRootData_${albumId}`;
  await clearCache(cacheKey);
  
  // Fetch fresh album details
  const details = await getAlbumDetails(albumId);
  if (details) {
    albumRootDataMap.value = { ...albumRootDataMap.value, [albumId]: details };
    await setCache(cacheKey, details);
  }
  
  // Manually trigger needsUpdate recalculation after updating albumRootDataMap
  await updateNeedsUpdateMap();
};

async function updateNeedsUpdateMap() {
  const entries = await Promise.all(
    albumData.value.map(async (album) => {
      const inCollection = !!inCollectionMap.value[album.id];
      if (!inCollection) return [album.id, false];
      const details = albumRootDataMap.value[album.id];
      const needsUpdate = !details?.albumCover || !details?.artistId || !details?.releaseYear;
      console.log('updateNeedsUpdateMap:', { albumId: album.id, details, needsUpdate });
      return [album.id, needsUpdate];
    })
  );
  needsUpdateMap.value = Object.fromEntries(entries);
}

watch([albumData, inCollectionMap], () => {
  updateNeedsUpdateMap();
});

async function handleUpdateAlbumDetails(album) {
  try {
    error.value = null;
    // Prepare details from the Spotify album prop (only use Spotify fields)
    const details = {
      albumCover: album.images?.[1]?.url || album.images?.[0]?.url || '',
      artistId: album.artists?.[0]?.id || '',
      releaseYear: album.release_date ? album.release_date.substring(0, 4) : '',
    };
    await updateAlbumDetails(album.id, details);
    // Optionally refresh needsUpdateMap for this album
    await updateNeedsUpdateMap();
  } catch (err) {
    console.error('Error updating album details:', err);
    error.value = err.message || 'Failed to update album details';
  }
}

async function loadPlaylistPage() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;
  try {
    await fetchAlbumIdList(id.value);
    if (!playlistName.value) {
      const playlistResponse = await getPlaylist(id.value);
      playlistName.value = playlistResponse.name;
      totalTracks.value = playlistResponse.tracks?.total || 0;
    }
    
    // The album data is already loaded by applySortingAndReload in fetchAlbumIdList
    // loadCurrentPage is called within applySortingAndReload
    playlistDoc.value = await getPlaylistDocument();
  } catch (e) {
    console.error("Error loading playlist page:", e);
    if (e.name === 'QuotaExceededError' || e.message?.includes('quota') || e.message?.includes('QuotaExceededError')) {
      error.value = "Browser storage is full. Please go to Account > Cache Management to clear some cache data, then try again.";
    } else {
      error.value = e.message || "Failed to load playlist data. Please try again.";
    }
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    await loadPlaylistPage();
    
    // Load loved tracks from cache if user has Last.fm connected
    if (userData.value?.lastFmUserName) {
      lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
    }
    
    // Start polling for current playing track if user has Last.fm connected
    if (userData.value?.lastFmUserName) {
      startCurrentTrackPolling();
    }
    
    // If tracklists were shown on last visit, fetch them
    if (showTracklists.value && albumData.value.length > 0) {
      fetchAlbumTracks();
    }
  } catch (e) {
    console.error("Error in PlaylistSingle:", e);
    error.value = e.message || "An unexpected error occurred. Please try again.";
  }
});

onUnmounted(() => {
  // Stop polling for current playing track when component is unmounted
  stopCurrentTrackPolling();
});

// Add album to playlist state
const selectedAlbum = ref(null);
const successMessage = ref('');

const handleAddAlbum = async () => {
  try {
    spotifyError.value = null;
    successMessage.value = '';
    
    if (!selectedAlbum.value) {
      throw new Error('Please select an album first');
    }
    
    // Add album to Spotify playlist
    await addAlbumToPlaylist(id.value, selectedAlbum.value.id);
    
    // Add album to Firebase collection
    await addAlbumToCollection({
      album: selectedAlbum.value,
      playlistId: id.value,
      playlistData: playlistDoc.value?.data(),
      spotifyAddedAt: new Date()
    });
    
    successMessage.value = `"${selectedAlbum.value.name}" added to playlist and collection successfully!`;
    
    // Reset form
    selectedAlbum.value = null;
    
    // Clear cache and reload the playlist to show the new album
    await handleClearCache();
    
    // Update count of albums in database
    await countAlbumsInDatabase();
    
    // Also clear the PlaylistView cache to update track counts
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      await clearCache(playlistViewCacheKey);
    }
    
  } catch (err) {
    console.error('Error adding album:', err);
    spotifyError.value = err.message || 'Failed to add album to playlist';
  }
};

const handleRemoveAlbum = async (album) => {
  if (!confirm(`Are you sure you want to remove "${album.name}" from this playlist?`)) {
    return;
  }
  
  try {
    spotifyError.value = null;
    successMessage.value = '';
    
    // Remove from Spotify playlist
    await removeFromSpotify(id.value, album);
    
    // Remove from Firebase collection
    await removeAlbumFromPlaylist(album.id, id.value);
    
    successMessage.value = `"${album.name}" removed from playlist and collection successfully!`;
    
    // Clear cache and reload the playlist to reflect the removal
    await handleClearCache();
    
    // Update count of albums in database
    await countAlbumsInDatabase();
    
    // Also clear the PlaylistView cache to update track counts
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      await clearCache(playlistViewCacheKey);
    }
    
  } catch (err) {
    console.error('Error removing album:', err);
    spotifyError.value = err.message || 'Failed to remove album from playlist';
  }
};

const handleProcessAlbum = async ({ album, action }) => {
  if (action !== 'yes' && action !== 'no') return;
  
  try {
    spotifyError.value = null;
    successMessage.value = '';
    processingAlbum.value = album.id;
    
    // Get the current playlist data
    const currentPlaylistData = playlistDoc.value?.data();
    
    let targetPlaylistId, targetPlaylistData, targetSpotifyPlaylistId;
    
    if (action === 'yes') {
      if (!currentPlaylistData?.nextStagePlaylistId) {
        throw new Error('No next stage playlist configured for this source playlist');
      }
      
      // Fetch the target playlist document
      const targetPlaylistDoc = await getDoc(doc(db, 'playlists', currentPlaylistData.nextStagePlaylistId));
      if (!targetPlaylistDoc.exists()) {
        throw new Error('Target playlist not found');
      }
      
      targetPlaylistData = targetPlaylistDoc.data();
      targetSpotifyPlaylistId = targetPlaylistData.playlistId;
      
    } else if (action === 'no') {
      if (!currentPlaylistData?.terminationPlaylistId) {
        throw new Error('No termination playlist configured for this source playlist');
      }
      
      // Fetch the termination playlist document
      const terminationPlaylistDoc = await getDoc(doc(db, 'playlists', currentPlaylistData.terminationPlaylistId));
      if (!terminationPlaylistDoc.exists()) {
        throw new Error('Termination playlist not found');
      }
      
      targetPlaylistData = terminationPlaylistDoc.data();
      targetSpotifyPlaylistId = targetPlaylistData.playlistId;
    }
    
    // 1. Remove album from current playlist
    await removeFromSpotify(id.value, album);
    await removeAlbumFromPlaylist(album.id, id.value);
    
    // 2. Add album to target Spotify playlist
    await addAlbumToPlaylist(targetSpotifyPlaylistId, album.id);
    
    // 3. Add album to target playlist in Firebase collection
    await addAlbumToCollection({
      album: album,
      playlistId: targetSpotifyPlaylistId,
      playlistData: targetPlaylistData,
      spotifyAddedAt: new Date()
    });
    
    const actionText = action === 'yes' ? 'moved to next stage' : 'terminated';
    successMessage.value = `"${album.name}" processed and ${actionText} successfully!`;
    
    // Clear cache and reload the playlist to reflect the changes
    await handleClearCache();
    
    // Update count of albums in database
    await countAlbumsInDatabase();
    
    // Also clear the PlaylistView cache to update track counts
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      await clearCache(playlistViewCacheKey);
    }
    
  } catch (err) {
    console.error('Error processing album:', err);
    spotifyError.value = err.message || 'Failed to process album';
  } finally {
    processingAlbum.value = null;
  }
};

const batchAddAlbumsToDatabase = async () => {
  if (!sortedAlbumIds.value.length || !user.value || !playlistDoc.value) {
    return;
  }

  batchProcessingAlbums.value = true;
  albumsProcessed.value = 0;
  albumsToProcess.value = 0;
  currentlyProcessingAlbum.value = null;
  batchProcessingStartTime.value = Date.now();
  showProgressModal.value = true;
  
  try {
    spotifyError.value = null;
    successMessage.value = '';
    
    // Step 1: Find which albums are NOT in the database
    const allAlbumIds = sortedAlbumIds.value;
    const missingAlbums = [];
    
    currentlyProcessingAlbum.value = 'Checking which albums need to be added...';
    
    const batchSize = 50;
    for (let i = 0; i < allAlbumIds.length; i += batchSize) {
      const batch = allAlbumIds.slice(i, i + batchSize);
      const batchData = await fetchAlbumsData(batch);
      
      // Find albums that are NOT in the database (null means not found)
      batch.forEach(albumId => {
        if (!batchData[albumId]) {
          missingAlbums.push(albumId);
        }
      });
    }
    
    if (missingAlbums.length === 0) {
      successMessage.value = 'All albums are already in the database!';
      showProgressModal.value = false;
      return;
    }
    
    albumsToProcess.value = missingAlbums.length;
    
    // Step 2: Fetch full album details from Spotify
    currentlyProcessingAlbum.value = 'Fetching album details from Spotify...';
    const fullAlbums = await loadAlbumsBatched(missingAlbums);
    
    // Step 3: Get playlist data once
    const playlistData = playlistDoc.value.data();
    
    // Step 4: Get albums with dates to preserve the added_at timestamps
    const albumsWithDatesMap = new Map();
    albumsWithDates.value.forEach(a => albumsWithDatesMap.set(a.id, a));
    
    // Step 5: Batch add all albums to database
    for (let i = 0; i < fullAlbums.length; i++) {
      const album = fullAlbums[i];
      
      try {
        currentlyProcessingAlbum.value = `${album.name} - ${album.artists[0]?.name || 'Unknown Artist'}`;
        
        const albumWithDate = albumsWithDatesMap.get(album.id);
        const spotifyAddedAt = albumWithDate?.addedAt 
          ? new Date(albumWithDate.addedAt) 
          : new Date();
        
        await addAlbumToCollection({
          album: album,
          playlistId: id.value,
          playlistData: playlistData,
          spotifyAddedAt: spotifyAddedAt
        });
        
        albumsProcessed.value++;
        
        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        console.error(`Error adding album ${album.id}:`, err);
        albumsProcessed.value++; // Still increment on error to keep progress accurate
      }
    }
    
    successMessage.value = `Successfully added ${albumsProcessed.value} of ${albumsToProcess.value} albums to the database!`;
    
    // Keep modal open briefly to show completion, then auto-dismiss
    setTimeout(() => {
      showProgressModal.value = false;
      handleClearCache();
    }, 2000);
    
  } catch (err) {
    console.error('Error batch processing albums:', err);
    error.value = err.message || 'Failed to batch process albums';
    showProgressModal.value = false;
  } finally {
    batchProcessingAlbums.value = false;
    currentlyProcessingAlbum.value = null;
  }
};

const cancelBatchProcessing = () => {
  batchProcessingAlbums.value = false;
  showProgressModal.value = false;
  successMessage.value = 'Batch processing cancelled';
};

async function checkForIdMismatches() {
  if (!sortedAlbumIds.value.length || !user.value) {
    return;
  }

  checkingMismatches.value = true;
  mismatchReport.value = [];
  showMismatchReport.value = false;
  showProgressModal.value = true;
  error.value = null;
  successMessage.value = '';
  mismatchCheckStartTime.value = Date.now();
  mismatchCheckProgress.value = { current: 0, total: 0, currentArtist: null };

  try {
    // Step 1: Load all albums from the playlist
    currentlyProcessingAlbum.value = 'Loading playlist albums...';
    const allAlbumsFromPlaylist = await loadAlbumsBatched(sortedAlbumIds.value);
    
    // Step 2: Identify which albums exist in the database
    currentlyProcessingAlbum.value = 'Checking which albums are in database...';
    const albumsInDb = [];
    const albumIdToPlaylistAlbum = new Map();
    
    for (const playlistAlbum of allAlbumsFromPlaylist) {
      albumIdToPlaylistAlbum.set(playlistAlbum.id, playlistAlbum);
      const dbAlbumData = await fetchAlbumsData([playlistAlbum.id]);
      
      if (dbAlbumData[playlistAlbum.id] !== null) {
        // Album exists in DB - this is what we want to check
        albumsInDb.push(playlistAlbum);
      }
    }
    
    if (albumsInDb.length === 0) {
      successMessage.value = 'No albums in playlist are in the database yet.';
      showProgressModal.value = false;
      return;
    }
    
    // Step 3: Group albums by artist to minimize API calls
    const artistMap = new Map(); // artistId -> { albums: [], artistName: string }
    
    for (const album of albumsInDb) {
      const artistId = album.artists[0]?.id;
      const artistName = album.artists[0]?.name || 'Unknown Artist';
      
      if (artistId) {
        if (!artistMap.has(artistId)) {
          artistMap.set(artistId, {
            artistId,
            artistName,
            albums: []
          });
        }
        artistMap.get(artistId).albums.push(album);
      }
    }
    
    const uniqueArtists = Array.from(artistMap.values());
    mismatchCheckProgress.value.total = uniqueArtists.length;
    
    // Step 4: For each artist, fetch their full discography from Spotify
    for (let i = 0; i < uniqueArtists.length; i++) {
      const artist = uniqueArtists[i];
      mismatchCheckProgress.value.current = i + 1;
      currentlyProcessingAlbum.value = `Checking ${artist.artistName}... (${i + 1}/${uniqueArtists.length})`;
      
      try {
        // Fetch all albums from this artist
        const spotifyAlbums = await getAllArtistAlbums(artist.artistId);
        
        // Create a map of album title -> album for quick lookup
        // Use normalized title for fuzzy matching
        const spotifyAlbumMap = new Map();
        for (const spotifyAlbum of spotifyAlbums) {
          const normalizedTitle = spotifyAlbum.name.toLowerCase().trim();
          // Store multiple albums with same title (can happen with reissues)
          if (!spotifyAlbumMap.has(normalizedTitle)) {
            spotifyAlbumMap.set(normalizedTitle, []);
          }
          spotifyAlbumMap.get(normalizedTitle).push(spotifyAlbum);
        }
        
        // Step 5: For each album in DB from this artist, check for ID mismatch
        for (const dbAlbum of artist.albums) {
          const playlistAlbum = dbAlbum;
          const playlistAlbumId = playlistAlbum.id;
          const playlistAlbumTitle = playlistAlbum.name.toLowerCase().trim();
          
          // Check if this album exists in Spotify's artist catalog with different ID
          const spotifyMatches = spotifyAlbumMap.get(playlistAlbumTitle) || [];
          
          for (const spotifyAlbum of spotifyMatches) {
            if (spotifyAlbum.id !== playlistAlbumId) {
              // Found a potential mismatch! Same title, different ID
              
              // Check if already mapped
              const primaryId = await getPrimaryId(playlistAlbumId);
              const isMapped = primaryId === spotifyAlbum.id || primaryId !== null;
              
              // Also check reverse mapping
              const reversePrimaryId = await getPrimaryId(spotifyAlbum.id);
              const isReverseMapped = reversePrimaryId === playlistAlbumId || reversePrimaryId !== null;
              
              // Only report if not already mapped in either direction
              if (!isMapped && !isReverseMapped) {
                // Get DB album details for comparison
                const dbAlbumDetails = await getAlbumDetails(playlistAlbumId);
                const dbTitle = dbAlbumDetails?.albumTitle || playlistAlbum.name;
                const spotifyTitle = spotifyAlbum.name;
                
                // Calculate similarity between album titles
                const similarity = albumTitleSimilarity(dbTitle, spotifyTitle);
                
                // Get years for comparison
                const dbYear = dbAlbumDetails?.releaseYear || (playlistAlbum.release_date ? playlistAlbum.release_date.substring(0, 4) : '');
                const spotifyYear = spotifyAlbum.release_date ? spotifyAlbum.release_date.substring(0, 4) : '';
                
                // Calculate year difference if both years are available
                let yearDifference = null;
                if (dbYear && spotifyYear) {
                  const dbYearNum = parseInt(dbYear);
                  const spotifyYearNum = parseInt(spotifyYear);
                  if (!isNaN(dbYearNum) && !isNaN(spotifyYearNum)) {
                    yearDifference = Math.abs(dbYearNum - spotifyYearNum);
                  }
                }
                
                mismatchReport.value.push({
                  dbAlbum: {
                    id: playlistAlbumId,
                    title: dbTitle,
                    artist: dbAlbumDetails?.artistName || artist.artistName,
                    year: dbYear,
                    cover: dbAlbumDetails?.albumCover || playlistAlbum.images?.[1]?.url || playlistAlbum.images?.[0]?.url || ''
                  },
                  spotifyAlbum: {
                    id: spotifyAlbum.id,
                    title: spotifyTitle,
                    artist: artist.artistName,
                    year: spotifyYear,
                    cover: spotifyAlbum.images?.[1]?.url || spotifyAlbum.images?.[0]?.url || ''
                  },
                  similarity: Math.round(similarity * 100),
                  yearDifference: yearDifference
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching albums for artist ${artist.artistName}:`, err);
        // Continue with next artist even if this one fails
      }
    }

    showMismatchReport.value = true;
    showProgressModal.value = false;
    
    if (mismatchReport.value.length === 0) {
      successMessage.value = 'No ID mismatches found! All albums appear to have matching IDs.';
    } else {
      successMessage.value = `Found ${mismatchReport.value.length} potential ID mismatch(es). See report below.`;
    }
  } catch (err) {
    console.error('Error checking for ID mismatches:', err);
    error.value = err.message || 'Failed to check for ID mismatches';
    showProgressModal.value = false;
  } finally {
    checkingMismatches.value = false;
    mismatchCheckProgress.value = { current: 0, total: 0, currentArtist: null };
    currentlyProcessingAlbum.value = null;
  }
}

const handleCreateMapping = async (mismatch) => {
  try {
    error.value = null;
    successMessage.value = '';
    
    // Create mapping: Spotify catalog ID (alternate) -> DB album ID (primary)
    // The Spotify catalog ID is the alternateId, and DB album ID is the primaryId
    // (The DB album has the playlist data, so it's the primary)
    const success = await createMapping(mismatch.spotifyAlbum.id, mismatch.dbAlbum.id);
    
    if (success) {
      // Remove this mismatch from the report since it's now mapped
      mismatchReport.value = mismatchReport.value.filter(m => 
        m.dbAlbum.id !== mismatch.dbAlbum.id || m.spotifyAlbum.id !== mismatch.spotifyAlbum.id
      );
      
      successMessage.value = `Mapping created successfully for "${mismatch.dbAlbum.title}"!`;
      
      // Clear success message after a few seconds
      setTimeout(() => {
        if (successMessage.value.includes('Mapping created')) {
          successMessage.value = '';
        }
      }, 3000);
    } else {
      error.value = 'Failed to create mapping';
    }
  } catch (err) {
    console.error('Error creating mapping:', err);
    error.value = err.message || 'Failed to create mapping';
  }
};

const handleUpdateYear = async (mismatch) => {
  try {
    error.value = null;
    successMessage.value = '';
    
    if (!mismatch.spotifyAlbum.year) {
      error.value = 'No year available in Spotify catalog';
      return;
    }
    
    // Update the album's releaseYear to match Spotify catalog
    await updateAlbumDetails(mismatch.dbAlbum.id, {
      releaseYear: parseInt(mismatch.spotifyAlbum.year)
    });
    
    // Update the mismatch object to reflect the change
    mismatch.yearDifference = null;
    mismatch.dbAlbum.year = mismatch.spotifyAlbum.year;
    
    successMessage.value = `Year updated to ${mismatch.spotifyAlbum.year} for "${mismatch.dbAlbum.title}"!`;
    
    // Clear success message after a few seconds
    setTimeout(() => {
      if (successMessage.value.includes('Year updated')) {
        successMessage.value = '';
      }
    }, 3000);
  } catch (err) {
    console.error('Error updating year:', err);
    error.value = err.message || 'Failed to update year';
  }
};
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <BackButton to="/playlists" text="Back to Playlists" />
    </div>

    <h1 class="h2 pb-4">{{ playlistName }}</h1>
    <div class="mb-4 flex gap-4">
      <BaseButton @click.prevent="handleClearCache">
        <template #icon-left><ArrowPathIcon class="h-5 w-5" /></template>
        Reload
      </BaseButton>
      <BaseButton v-if="playlistDoc && !playlistDoc.data().name"
        @click="updatePlaylistName"
        :disabled="updating"
      >
        <template #icon-left><PencilIcon class="h-5 w-5" /></template>
        {{ updating ? 'Updating...' : 'Update Playlist Name' }}
      </BaseButton>
      <BaseButton @click="toggleSort">
        <template #icon-left>
          <BarsArrowUpIcon v-if="sortDirection === 'asc'" class="h-5 w-5" />
          <BarsArrowDownIcon v-else class="h-5 w-5" />
        </template>
        Sort: {{ sortDirectionLabel }}
      </BaseButton>
      <BaseButton @click="showTracklists = !showTracklists" :class="{ 'bg-mint text-delft-blue': showTracklists }">
        <template #icon-left>
          <svg v-if="showTracklists" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
          </svg>
          <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
          </svg>
        </template>
        {{ showTracklists ? 'Hide Tracklists' : 'Show Tracklists' }}
      </BaseButton>
      <BaseButton 
        v-if="userData?.lastFmUserName && showTracklists"
        @click="refreshLovedTracks"
        :disabled="refreshingLovedTracks"
        title="Refresh loved tracks and playcounts with Last.fm"
      >
        <template #icon-left>
          <svg class="h-5 w-5" :class="{ 'animate-spin': refreshingLovedTracks }" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
          </svg>
        </template>
        {{ refreshingLovedTracks ? 'Refreshing...' : 'Refresh Tracks' }}
      </BaseButton>
      <BaseButton 
        v-if="missingAlbumsCount > 0 && userData?.spotifyConnected"
        @click="batchAddAlbumsToDatabase"
        :disabled="batchProcessingAlbums || loading"
        customClass="bg-mint text-delft-blue hover:bg-celadon"
      >
        <template #icon-left>
          <ArrowPathIcon v-if="batchProcessingAlbums" class="h-5 w-5 animate-spin" />
        </template>
        {{ batchProcessingAlbums 
          ? 'Processing...' 
          : `Add ${missingAlbumsCount} Missing Albums to DB` 
        }}
      </BaseButton>
      <BaseButton 
        @click="checkForIdMismatches"
        :disabled="checkingMismatches || loading || batchProcessingAlbums"
        customClass="bg-delft-blue text-white hover:bg-blue-700"
      >
        <template #icon-left>
          <ArrowPathIcon v-if="checkingMismatches" class="h-5 w-5 animate-spin" />
        </template>
        {{ checkingMismatches ? 'Checking...' : 'Check for ID Mismatches' }}
      </BaseButton>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading playlist...
    </p>

    <p class="text-lg mb-2">Total unique albums: {{ totalAlbums }}</p>
    <p class="text-lg mb-2">Albums in database: {{ albumsInDbCount }}</p>
    <p class="text-lg mb-6">Total tracks: {{ totalTracks }}</p>

    <!-- ID Mismatch Report -->
    <div v-if="showMismatchReport && mismatchReport.length > 0" class="mb-6 bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4 text-yellow-800">
        ID Mismatch Report ({{ mismatchReport.length }} found)
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div 
          v-for="(mismatch, index) in mismatchReport" 
          :key="index"
          class="bg-white rounded-lg p-4 border border-yellow-300"
        >
          <div class="mb-3 text-center">
            <h3 class="font-semibold text-sm text-gray-800 mb-1">
              {{ mismatch.dbAlbum.artist }}
            </h3>
            <div class="flex flex-col items-center gap-2">
              <div class="flex items-center justify-center gap-2">
                <span class="text-xs font-medium text-gray-500">Title Similarity:</span>
                <span 
                  class="text-sm font-semibold px-2 py-0.5 rounded"
                  :class="{
                    'bg-green-100 text-green-700': mismatch.similarity >= 90,
                    'bg-yellow-100 text-yellow-700': mismatch.similarity >= 70 && mismatch.similarity < 90,
                    'bg-orange-100 text-orange-700': mismatch.similarity >= 50 && mismatch.similarity < 70,
                    'bg-red-100 text-red-700': mismatch.similarity < 50
                  }"
                >
                  {{ mismatch.similarity }}%
                </span>
              </div>
              <div 
                v-if="mismatch.yearDifference !== null && mismatch.yearDifference > 0" 
                class="flex items-center justify-center gap-2"
              >
                <span class="text-xs font-medium text-orange-600">⚠️ Year Difference:</span>
                <span class="text-xs font-semibold px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                  {{ mismatch.yearDifference }} years
                </span>
              </div>
            </div>
          </div>
          
          <!-- Side by side comparison -->
          <div class="grid grid-cols-2 gap-3">
            <!-- Database Album (Left) -->
            <div class="border-r border-gray-200 pr-3">
              <div class="mb-2">
                <p class="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Database</p>
                <img 
                  v-if="mismatch.dbAlbum.cover" 
                  :src="mismatch.dbAlbum.cover" 
                  :alt="mismatch.dbAlbum.title"
                  class="w-24 h-24 rounded object-cover mb-2 shadow-sm"
                />
                <div v-else class="w-24 h-24 bg-gray-200 rounded flex items-center justify-center mb-2">
                  <span class="text-gray-400 text-xs">No Cover</span>
                </div>
              </div>
              
              <div class="space-y-1.5">
                <div>
                  <p class="text-xs font-medium text-gray-500 mb-0.5">Title</p>
                  <p class="text-sm font-semibold text-gray-900 leading-tight">{{ mismatch.dbAlbum.title }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium text-gray-500 mb-0.5">Year</p>
                  <p class="text-sm text-gray-700">{{ mismatch.dbAlbum.year || 'N/A' }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium text-gray-500 mb-0.5">ID</p>
                  <p class="text-xs font-mono text-gray-600 break-all leading-tight">{{ mismatch.dbAlbum.id }}</p>
                </div>
              </div>
            </div>
            
            <!-- Spotify Album (Right) -->
            <div class="pl-3">
              <div class="mb-2">
                <p class="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Spotify</p>
                <img 
                  v-if="mismatch.spotifyAlbum.cover" 
                  :src="mismatch.spotifyAlbum.cover" 
                  :alt="mismatch.spotifyAlbum.title"
                  class="w-24 h-24 rounded object-cover mb-2 shadow-sm"
                />
                <div v-else class="w-24 h-24 bg-gray-200 rounded flex items-center justify-center mb-2">
                  <span class="text-gray-400 text-xs">No Cover</span>
                </div>
              </div>
              
              <div class="space-y-1.5">
                <div>
                  <p class="text-xs font-medium text-gray-500 mb-0.5">Title</p>
                  <p class="text-sm font-semibold text-gray-900 leading-tight">{{ mismatch.spotifyAlbum.title }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium text-gray-500 mb-0.5">Year</p>
                  <p class="text-sm text-gray-700">{{ mismatch.spotifyAlbum.year || 'N/A' }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium text-gray-500 mb-0.5">ID</p>
                  <p class="text-xs font-mono text-gray-600 break-all leading-tight">{{ mismatch.spotifyAlbum.id }}</p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Update Year Button (only if year differs) -->
          <div 
            v-if="mismatch.yearDifference !== null && mismatch.yearDifference > 0" 
            class="mt-3 pt-3 border-t border-gray-200"
          >
            <BaseButton 
              @click="handleUpdateYear(mismatch)"
              customClass="w-full bg-yellow-500 text-white hover:bg-yellow-600 text-sm py-2 mb-2"
            >
              Update Year to {{ mismatch.spotifyAlbum.year }} (from Spotify)
            </BaseButton>
          </div>
          
          <!-- Map Button -->
          <div class="mt-3 pt-3 border-t border-gray-200">
            <BaseButton 
              @click="handleCreateMapping(mismatch)"
              customClass="w-full bg-mint text-delft-blue hover:bg-celadon text-sm py-2"
            >
              Map These Albums
            </BaseButton>
          </div>
        </div>
      </div>
      <p class="mt-4 text-sm text-yellow-700">
        These albums have the same title and artist but different Spotify IDs. 
        You may want to create album mappings to link them together.
      </p>
    </div>
    <div v-if="tracksLoading" class="mb-4 text-center">
      <p class="text-delft-blue">Loading tracklists...</p>
    </div>
    <LoadingMessage v-if="loading" />
    <ErrorMessage v-else-if="error" :message="error" />
    <template v-else-if="albumData.length">
      <ul class="album-grid">
        <AlbumItem 
          v-for="album in paginatedAlbums" 
          :key="album.id" 
          :album="album" 
          :lastFmUserName="userData?.lastFmUserName"
          :currentPlaylist="playlistDoc?.data() || { playlistId: id }"
          :ratingData="album.ratingData"
          :isMappedAlbum="false"
          :inCollection="!!inCollectionMap[album.id]"
          :needsUpdate="needsUpdateMap[album.id]"
          :lovedTrackData="albumLovedData[album.id]"
          :showRemoveButton="userData?.spotifyConnected"
          :showProcessingButtons="userData?.spotifyConnected && !!playlistDoc?.data()?.nextStagePlaylistId"
          :isSourcePlaylist="!!playlistDoc?.data()?.nextStagePlaylistId"
          :hasTerminationPlaylist="!!playlistDoc?.data()?.terminationPlaylistId"
          :isProcessing="processingAlbum === album.id"
          :tracks="albumTracks[album.id] || []"
          :lovedTracks="lovedTracks"
          :showTracklist="showTracklists"
          :lastFmSessionKey="userData?.lastFmSessionKey || ''"
          :allowTrackLoving="userData?.lastFmAuthenticated || false"
          @added-to-collection="refreshInCollectionForAlbum"
          @update-album="handleUpdateAlbumDetails"
          @remove-album="handleRemoveAlbum"
          @process-album="handleProcessAlbum"
          @track-loved="handleTrackLoved"
          @track-unloved="handleTrackUnloved"
        />
      </ul>

      <div v-if="showPagination" class="pagination-controls">
        <BaseButton v-if="showPagination" @click="previousPage" :disabled="currentPage === 1" customClass="pagination-button">
          Previous
        </BaseButton>
        
        <span class="pagination-info">
          Page {{ currentPage }} of {{ totalPages }}
          ({{ (currentPage - 1) * itemsPerPage + 1 }}-{{ Math.min(currentPage * itemsPerPage, totalAlbums) }} 
          of {{ totalAlbums }} albums)
        </span>
        
        <BaseButton v-if="showPagination" @click="nextPage" :disabled="currentPage === totalPages" customClass="pagination-button">
          Next
        </BaseButton>
      </div>
    </template>
    <p v-else class="no-data-message">No albums found in this playlist.</p>

    <!-- Add Album to Playlist Section -->
    <div v-if="userData?.spotifyConnected" class="mt-8 bg-white shadow rounded-lg p-6">
      <h2 class="text-lg font-semibold mb-4">Add Album to Playlist</h2>
      
      <form @submit.prevent="handleAddAlbum" class="space-y-4">
        <div class="form-group">
          <AlbumSearch v-model="selectedAlbum" />
        </div>
        
        <div class="flex gap-4">
          <BaseButton 
            type="submit" 
            :disabled="spotifyLoading || !selectedAlbum"
            customClass="btn-primary"
          >
            {{ spotifyLoading ? 'Adding...' : 'Add Album to Playlist' }}
          </BaseButton>
        </div>
      </form>

      <!-- Error Messages -->
      <ErrorMessage v-if="spotifyError" :message="spotifyError" class="mt-4" />
      
      <!-- Success Messages -->
      <div v-if="successMessage" class="mt-4 p-4 bg-green-50 text-green-700 rounded-md">
        {{ successMessage }}
      </div>
    </div>

    <!-- Spotify Connection Required Message -->
    <div v-else class="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p class="text-yellow-800">
        <strong>Spotify Connection Required:</strong> Please connect your Spotify account in your 
        <router-link to="/account" class="text-yellow-900 underline">Account Settings</router-link> 
        to add albums to playlists.
      </p>
    </div>

    <!-- Progress Modal for Batch Processing -->
    <ProgressModal
      v-if="batchProcessingAlbums"
      :visible="showProgressModal && batchProcessingAlbums"
      title="Adding Albums to Database"
      :current="albumsProcessed"
      :total="albumsToProcess"
      :currentItem="currentlyProcessingAlbum"
      :allowCancel="false"
      :startTime="batchProcessingStartTime"
      @dismiss="showProgressModal = false"
    />
    
    <!-- Progress Modal for ID Mismatch Check -->
    <ProgressModal
      v-if="checkingMismatches"
      :visible="showProgressModal && checkingMismatches"
      title="Checking for ID Mismatches"
      :current="mismatchCheckProgress.current"
      :total="mismatchCheckProgress.total"
      :currentItem="currentlyProcessingAlbum"
      :allowCancel="false"
      :startTime="mismatchCheckStartTime"
      @dismiss="showProgressModal = false"
    />
  </main>
</template>

<style scoped>
.album-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 304px));
  gap: 1rem;
  justify-content: center;
}

@media (max-width: 639px) {
  .album-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 304px));
  }
}

.pagination-controls {
  @apply flex justify-center items-center gap-4 mt-6 mb-8;
}

.pagination-button {
  @apply px-4 py-2 bg-blue-500 text-white rounded 
         hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
         transition-colors duration-200;
}

.pagination-info {
  @apply text-gray-700 text-sm;
}

.form-group {
  @apply space-y-2;
}

.btn-primary {
  @apply px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
