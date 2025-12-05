<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setCache, getCache, clearCache } from "@utils/cache";
import AlbumItem from "@components/AlbumItem.vue";
import { useUserData } from "@composables/useUserData";
import { usePlaylistUpdates } from "@composables/usePlaylistUpdates";
import { usePlaylistData } from "@composables/usePlaylistData";
import { useAdmin } from "@composables/useAdmin";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import BackButton from '@components/common/BackButton.vue';
import DropdownMenu from '@components/common/DropdownMenu.vue';

import { useAlbumsData } from "@composables/useAlbumsData";
import { useAlbumMappings } from "@composables/useAlbumMappings";
import { ArrowPathIcon, PencilIcon, BarsArrowUpIcon, BarsArrowDownIcon, ChevronDownIcon, ArrowUpIcon, ArrowDownIcon, HeartIcon } from '@heroicons/vue/24/solid'
import { MusicalNoteIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@components/common/BaseButton.vue';
import ToggleSwitch from '@components/common/ToggleSwitch.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ProgressModal from '@components/common/ProgressModal.vue';
import { albumTitleSimilarity } from '@utils/fuzzyMatch';
import AlbumSearch from '@components/AlbumSearch.vue';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useCurrentPlayingTrack } from '@composables/useCurrentPlayingTrack';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { usePlaycountTracking } from '@composables/usePlaycountTracking';
import { loadUnifiedTrackCache, moveAlbumBetweenPlaylists, saveUnifiedTrackCache } from '@utils/unifiedTrackCache';
import { logPlaylist, logCache, enableDebug } from '@utils/logger';

const route = useRoute();
const { user, userData } = useUserData();
const { refreshSpecificPlaylists } = usePlaylistUpdates();
const { playlists: userPlaylists, fetchUserPlaylists } = usePlaylistData();
const { isAdmin } = useAdmin();
const { getPlaylist, getPlaylistAlbumsWithDates, loadAlbumsBatched, addAlbumToPlaylist, removeAlbumFromPlaylist: removeFromSpotify, loading: spotifyLoading, error: spotifyError, getAlbumTracks, getAllArtistAlbums, getAllPlaylistTracks } = useUserSpotifyApi();

const { getCurrentPlaylistInfo, fetchAlbumsData, getAlbumDetails, getAlbumsDetailsBatch, updateAlbumDetails, getAlbumRatingData, addAlbumToCollection, removeAlbumFromPlaylist, searchAlbumsByTitleAndArtist } = useAlbumsData();
const { getPrimaryId, isAlternateId, createMapping } = useAlbumMappings();
const { loveTrack, unloveTrack } = useLastFmApi();
const { 
  getAlbumTracksForPlaylist, 
  getAlbumLovedPercentage, 
  updateLovedStatus,
  buildCacheForPlaylist,
  refreshLovedTracksForUser,
  refreshPlaycountsForTracks,
  getPlaylistTracklistPreference,
  setPlaylistTracklistPreference,
  loading: cacheLoading,
  buildProgress: cacheBuildProgress
} = useUnifiedTrackCache();

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
const sortDirection = ref('asc'); // 'asc' or 'desc'
const sortMode = ref('date'); // 'date', 'year', 'name', 'artist', 'loved'
const sortDropdownOpen = ref(false);
const sortDropdownRef = ref(null);

const handleSortDropdownClickOutside = (event) => {
  if (sortDropdownRef.value && !sortDropdownRef.value.contains(event.target)) {
    sortDropdownOpen.value = false;
  }
};


const sortModeLabels = {
  date: 'Date added',
  year: 'Release year',
  name: 'Album name',
  artist: 'Artist name',
  loved: 'Loved'
};

const currentSortLabel = computed(() => {
  return sortModeLabels[sortMode.value] || 'Date added';
});

// Tracklist display state - initialize from per-playlist preference
const showTracklists = ref(false);
const tracksLoading = ref(false);
const cacheBuilding = ref(false);

// Computed property to get tracks for each album from unified cache
const albumTracks = computed(() => {
  if (!showTracklists.value || !id.value) return {};
  
  const tracksMap = {};
  for (const album of albumData.value) {
    // This will be populated asynchronously, but we'll use a reactive approach
    // For now, return empty - tracks will be loaded via buildCacheForPlaylist
  }
  return tracksMap;
});

// Reactive tracks storage (populated from cache)
const albumTracksData = ref({});

// Set up playcount tracking listener to update UI reactively
const { onPlaycountUpdate } = usePlaycountTracking();

// Update track playcount in albumTracksData when playcount changes
const updateTrackPlaycountInUI = (trackId, newPlaycount) => {
  // Find and update the track in all albums
  Object.keys(albumTracksData.value).forEach(albumId => {
    const tracks = albumTracksData.value[albumId];
    if (Array.isArray(tracks)) {
      const trackIndex = tracks.findIndex(t => t.id === trackId);
      if (trackIndex !== -1) {
        // Create new array to ensure Vue reactivity
        albumTracksData.value[albumId] = [
          ...tracks.slice(0, trackIndex),
          {
            ...tracks[trackIndex],
            playcount: newPlaycount
          },
          ...tracks.slice(trackIndex + 1)
        ];
        logPlaylist(`Updated playcount in UI for track ${trackId} in album ${albumId}: ${newPlaycount}`);
      }
    }
  });
};

// Register playcount update listener
let playcountUnsubscribe = null;
onMounted(() => {
  playcountUnsubscribe = onPlaycountUpdate(updateTrackPlaycountInUI);
});

onUnmounted(() => {
  if (playcountUnsubscribe) {
    playcountUnsubscribe();
  }
});

const setSortMode = async (mode) => {
  // New mode, default to ascending
  sortMode.value = mode;
  sortDirection.value = 'asc';
  sortDropdownOpen.value = false;
  await applySortingAndReload();
};

const toggleSortDirection = async () => {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc';
  await applySortingAndReload();
};

// Fetch tracks for all albums when tracklists are enabled (using unified cache)
const fetchAlbumTracks = async () => {
  if (!showTracklists.value || !id.value || !albumData.value.length) {
    logPlaylist('Skipping fetchAlbumTracks:', { 
      showTracklists: showTracklists.value, 
      playlistId: id.value, 
      albumCount: albumData.value.length 
    });
    return;
  }
  
  logPlaylist('Fetching album tracks:', { 
    playlistId: id.value, 
    albumCount: albumData.value.length 
  });
  
  tracksLoading.value = true;
  cacheBuilding.value = true;
  
  try {
    // Check if playlist is already cached before building
    let needsBuild = true;
    if (user.value) {
      try {
        const cache = await loadUnifiedTrackCache(user.value.uid, userData.value?.lastFmUserName || '');
        const existingPlaylist = cache?.playlists[id.value];
        if (existingPlaylist && existingPlaylist.albums) {
          const albumKeys = Object.keys(existingPlaylist.albums);
          // Check if we have albums and at least one has tracks
          const hasTracks = albumKeys.some(albumId => {
            const album = existingPlaylist.albums[albumId];
            return album && album.trackIds && album.trackIds.length > 0;
          });
          
          if (hasTracks) {
            logCache(`Playlist ${id.value} already cached, skipping cache build`);
            needsBuild = false;
          }
        }
      } catch (error) {
        logCache('Error checking cache for playlist:', error);
      }
    }
    
    // Only build cache if it doesn't exist
    if (needsBuild) {
      logCache('Building cache for playlist:', id.value);
      await buildCacheForPlaylist(id.value, (progress) => {
        logPlaylist('Cache build progress:', progress);
      });
      logCache('Cache build complete for playlist:', id.value);
    }
    
    // Load tracks from unified cache for each album
    logPlaylist('Loading tracks for albums from cache');
    const trackPromises = albumData.value.map(async (album) => {
      try {
        logCache('Fetching tracks for album:', { playlistId: id.value, albumId: album.id, albumName: album.name });
        const tracks = await getAlbumTracksForPlaylist(id.value, album.id);
        albumTracksData.value[album.id] = tracks;
        logCache('Loaded tracks for album:', { albumId: album.id, trackCount: tracks.length });
      } catch (error) {
        logPlaylist(`Failed to get tracks for album ${album.id}:`, error);
        albumTracksData.value[album.id] = [];
      }
    });
    
    await Promise.all(trackPromises);
    logPlaylist('All album tracks fetched successfully');
  } catch (error) {
    logPlaylist('Error building cache or fetching tracks:', error);
  } finally {
    tracksLoading.value = false;
    cacheBuilding.value = false;
  }
};

// Watch for showTracklists changes - fetch tracks and persist per-playlist preference
watch(showTracklists, (newValue) => {
  if (id.value) {
    // Save per-playlist preference
    setPlaylistTracklistPreference(id.value, newValue);
  }
  
  // Fetch tracks if enabled
  if (newValue) {
    fetchAlbumTracks();
  } else {
    // Clear tracks data when disabled
    albumTracksData.value = {};
  }
});

// Initialize tracklist preference from per-playlist setting
watch(id, (newId) => {
  if (newId) {
    showTracklists.value = getPlaylistTracklistPreference(newId);
    if (showTracklists.value && albumData.value.length > 0) {
      fetchAlbumTracks();
    }
  }
}, { immediate: true });

// Handle track loving/unloving with unified cache
const handleTrackLoved = async ({ album, track }) => {
  if (!userData.value?.lastFmSessionKey || !userData.value?.lastFmUserName || !track.id) return;
  
  try {
    // Optimistic UI update: update track in albumTracksData immediately
    if (albumTracksData.value[album.id]) {
      const trackIndex = albumTracksData.value[album.id].findIndex(t => t.id === track.id);
      if (trackIndex !== -1) {
        // Create new array to ensure Vue reactivity
        albumTracksData.value[album.id] = [
          ...albumTracksData.value[album.id].slice(0, trackIndex),
          {
            ...albumTracksData.value[album.id][trackIndex],
            loved: true
          },
          ...albumTracksData.value[album.id].slice(trackIndex + 1)
        ];
      }
    }
    
    // Update loved status in unified cache (optimistic update with background sync)
    await updateLovedStatus(track.id, true);
    
    // Recalculate loved track percentage for this album
    if (albumLovedData.value[album.id]) {
      const result = await getAlbumLovedPercentage(album.id);
      albumLovedData.value[album.id] = {
        ...result,
        isLoading: false
      };
    }
    
  } catch (error) {
    logPlaylist('Error loving track:', error);
    
    // Revert optimistic update on error
    if (albumTracksData.value[album.id]) {
      const trackIndex = albumTracksData.value[album.id].findIndex(t => t.id === track.id);
      if (trackIndex !== -1) {
        // Create new array to ensure Vue reactivity
        albumTracksData.value[album.id] = [
          ...albumTracksData.value[album.id].slice(0, trackIndex),
          {
            ...albumTracksData.value[album.id][trackIndex],
            loved: false
          },
          ...albumTracksData.value[album.id].slice(trackIndex + 1)
        ];
      }
    }
    
    // On error, refresh loved tracks from Last.fm
    if (userData.value?.lastFmUserName) {
      try {
        await refreshLovedTracksForUser();
        
        // Recalculate percentages after refresh
        if (albumLovedData.value[album.id]) {
          const result = await getAlbumLovedPercentage(album.id);
          albumLovedData.value[album.id] = {
            ...result,
            isLoading: false
          };
        }
      } catch (refreshError) {
        logPlaylist('Error refreshing loved tracks:', refreshError);
      }
    }
  }
};

const handleTrackUnloved = async ({ album, track }) => {
  if (!userData.value?.lastFmSessionKey || !userData.value?.lastFmUserName || !track.id) return;
  
  try {
    // Optimistic UI update: update track in albumTracksData immediately
    if (albumTracksData.value[album.id]) {
      const trackIndex = albumTracksData.value[album.id].findIndex(t => t.id === track.id);
      if (trackIndex !== -1) {
        // Create new array to ensure Vue reactivity
        albumTracksData.value[album.id] = [
          ...albumTracksData.value[album.id].slice(0, trackIndex),
          {
            ...albumTracksData.value[album.id][trackIndex],
            loved: false
          },
          ...albumTracksData.value[album.id].slice(trackIndex + 1)
        ];
      }
    }
    
    // Update loved status in unified cache (optimistic update with background sync)
    await updateLovedStatus(track.id, false);
    
    // Recalculate loved track percentage for this album
    if (albumLovedData.value[album.id]) {
      const result = await getAlbumLovedPercentage(album.id);
      albumLovedData.value[album.id] = {
        ...result,
        isLoading: false
      };
    }
    
  } catch (error) {
    logPlaylist('Error unloving track:', error);
    
    // Revert optimistic update on error
    if (albumTracksData.value[album.id]) {
      const trackIndex = albumTracksData.value[album.id].findIndex(t => t.id === track.id);
      if (trackIndex !== -1) {
        // Create new array to ensure Vue reactivity
        albumTracksData.value[album.id] = [
          ...albumTracksData.value[album.id].slice(0, trackIndex),
          {
            ...albumTracksData.value[album.id][trackIndex],
            loved: true
          },
          ...albumTracksData.value[album.id].slice(trackIndex + 1)
        ];
      }
    }
    
    // On error, refresh loved tracks from Last.fm
    if (userData.value?.lastFmUserName) {
      try {
        await refreshLovedTracksForUser();
        
        // Recalculate percentages after refresh
        if (albumLovedData.value[album.id]) {
          const result = await getAlbumLovedPercentage(album.id);
          albumLovedData.value[album.id] = {
            ...result,
            isLoading: false
          };
        }
      } catch (refreshError) {
        logPlaylist('Error refreshing loved tracks:', refreshError);
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
    
    // Refresh loved tracks from Last.fm using unified cache
    await refreshLovedTracksForUser();
    
    // Reload tracks from cache to reflect updated loved status
    if (showTracklists.value && id.value && albumData.value.length > 0) {
      // Reload tracks for all albums to get fresh loved status from cache
      const trackPromises = albumData.value.map(async (album) => {
        try {
          const tracks = await getAlbumTracksForPlaylist(id.value, album.id);
          albumTracksData.value[album.id] = tracks;
        } catch (error) {
          logPlaylist(`Failed to reload tracks for album ${album.id}:`, error);
        }
      });
      
      await Promise.all(trackPromises);
    }
    
    // Recalculate all loved track percentages using unified cache
    for (const album of albumData.value) {
      if (albumLovedData.value[album.id]) {
        const result = await getAlbumLovedPercentage(album.id);
        albumLovedData.value[album.id] = {
          ...result,
          isLoading: false
        };
      }
    }
    
    // If tracklists are shown, also refresh playcounts (force refresh since user explicitly clicked refresh)
    if (showTracklists.value && id.value && albumData.value.length > 0) {
      const trackIds = Object.values(albumTracksData.value)
        .flat()
        .map(track => track.id)
        .filter(Boolean);
      
      if (trackIds.length > 0) {
        try {
          // Force refresh to get latest data from Last.fm (ignores threshold)
          await refreshPlaycountsForTracks(trackIds);
          
          // Reload tracks from cache to reflect updated playcounts
          const trackPromises = albumData.value.map(async (album) => {
            try {
              const tracks = await getAlbumTracksForPlaylist(id.value, album.id);
              albumTracksData.value[album.id] = tracks;
            } catch (error) {
              logPlaylist(`Failed to reload tracks for album ${album.id}:`, error);
            }
          });
          
          await Promise.all(trackPromises);
        } catch (error) {
          logPlaylist('Error refreshing playcounts:', error);
        }
      }
    }
  } catch (error) {
    logPlaylist('Error refreshing loved tracks and playcounts:', error);
  } finally {
    refreshingLovedTracks.value = false;
  }
};

// Apply sorting to the full album list
const applySortingAndReload = async () => {
  if (albumsWithDates.value.length === 0) return;
  
  let sorted;
  
  if (sortMode.value === 'year') {
    // For year sorting, we need to fetch releaseYear for all albums
    const allAlbumIds = albumsWithDates.value.map(a => a.id);
    const albumDetailsMap = {};
    
    // Batch fetch album details to get releaseYear
    const batchSize = 50;
    for (let i = 0; i < allAlbumIds.length; i += batchSize) {
      const batch = allAlbumIds.slice(i, i + batchSize);
      const detailsArr = await Promise.all(batch.map(id => getCachedAlbumDetails(id)));
      batch.forEach((id, idx) => {
        albumDetailsMap[id] = detailsArr[idx];
      });
    }
    
    // Sort by releaseYear
    sorted = [...albumsWithDates.value].sort((a, b) => {
      const yearA = albumDetailsMap[a.id]?.releaseYear || 0;
      const yearB = albumDetailsMap[b.id]?.releaseYear || 0;
      
      // Albums without year go to the end (or beginning if descending)
      if (yearA === 0 && yearB === 0) return 0;
      if (yearA === 0) return sortDirection.value === 'desc' ? -1 : 1;
      if (yearB === 0) return sortDirection.value === 'desc' ? 1 : -1;
      
      return sortDirection.value === 'desc' 
        ? yearB - yearA 
        : yearA - yearB;
    });
  } else if (sortMode.value === 'name' || sortMode.value === 'artist') {
    // For name and artist sorting, we need to fetch album details for all albums
    const allAlbumIds = albumsWithDates.value.map(a => a.id);
    const albumDetailsMap = {};
    
    // Batch fetch album details
    const batchSize = 50;
    for (let i = 0; i < allAlbumIds.length; i += batchSize) {
      const batch = allAlbumIds.slice(i, i + batchSize);
      const detailsArr = await Promise.all(batch.map(id => getCachedAlbumDetails(id)));
      batch.forEach((id, idx) => {
        albumDetailsMap[id] = detailsArr[idx];
      });
    }
    
    if (sortMode.value === 'name') {
      // Sort by album name
      sorted = [...albumsWithDates.value].sort((a, b) => {
        const nameA = albumDetailsMap[a.id]?.albumTitle || '';
        const nameB = albumDetailsMap[b.id]?.albumTitle || '';
        
        const comparison = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        return sortDirection.value === 'desc' ? -comparison : comparison;
      });
    } else {
      // Sort by artist name
      sorted = [...albumsWithDates.value].sort((a, b) => {
        const artistA = albumDetailsMap[a.id]?.artistName || '';
        const artistB = albumDetailsMap[b.id]?.artistName || '';
        
        const comparison = artistA.localeCompare(artistB, undefined, { sensitivity: 'base' });
        return sortDirection.value === 'desc' ? -comparison : comparison;
      });
    }
  } else if (sortMode.value === 'loved') {
    // For loved sorting, we need to calculate percentages for all albums
    if (!userData.value?.lastFmUserName) {
      // No Last.fm user, can't sort by loved
      sorted = [...albumsWithDates.value];
    } else {
      // Calculate loved track percentages for all albums using unified cache
      const lovedDataMap = {};
      for (const album of albumsWithDates.value) {
        if (album && album.id) {
          try {
            const result = await getAlbumLovedPercentage(album.id);
            lovedDataMap[album.id] = result.percentage;
          } catch (err) {
            logPlaylist(`Error calculating loved track percentage for album ${album.id}:`, err);
            lovedDataMap[album.id] = 0;
          }
        }
      }
      
      // Sort by loved track percentage
      sorted = [...albumsWithDates.value].sort((a, b) => {
        const lovedA = lovedDataMap[a.id] || 0;
        const lovedB = lovedDataMap[b.id] || 0;
        
        return sortDirection.value === 'desc' 
          ? lovedB - lovedA 
          : lovedA - lovedB;
      });
    }
  } else {
    // Sort by date (addedAt) - default
    sorted = [...albumsWithDates.value].sort((a, b) => {
      const dateA = new Date(a.addedAt);
      const dateB = new Date(b.addedAt);
      return sortDirection.value === 'desc' 
        ? dateB - dateA 
        : dateA - dateB;
    });
  }
  
  // Update the sorted album IDs for pagination
  sortedAlbumIds.value = sorted.map(a => a.id);
  
  // Store tracklist preference before reloading
  const wasTracklistEnabled = showTracklists.value;
  
  // Reset to first page and reload current page
  currentPage.value = 1;
  await loadCurrentPage();
  
  // Restore tracklist if it was enabled before reloading
  if (wasTracklistEnabled && showTracklists.value && albumData.value.length > 0) {
    await fetchAlbumTracks();
  }
};

const currentPage = ref(1);
const itemsPerPage = ref(20);

// Update paginatedAlbums to use albumData (current page albums)
const paginatedAlbums = computed(() => {
  return albumData.value;
});

// Update totalAlbums to use sortedAlbumIds
const totalAlbums = computed(() => sortedAlbumIds.value.length);

// Get current playlist's position data from userPlaylists
const currentPlaylistPosition = computed(() => {
  if (!playlistDoc.value?.id || !userPlaylists.value) return null;
  
  const firebaseId = playlistDoc.value.id;
  const group = playlistDoc.value.data()?.group;
  
  if (!group || !userPlaylists.value[group]) return null;
  
  const playlist = userPlaylists.value[group].find(p => p.firebaseId === firebaseId);
  return playlist ? {
    pipelinePosition: playlist.pipelinePosition,
    totalPositions: playlist.totalPositions
  } : null;
});

// Compute missing albums count
const missingAlbumsCount = computed(() => {
  if (totalAlbums.value === 0) return 0;
  const missing = totalAlbums.value - albumsInDbCount.value;
  return missing > 0 ? missing : 0;
});

// Update totalPages calculation
const totalPages = computed(() => Math.ceil(sortedAlbumIds.value.length / itemsPerPage.value));

const showPagination = computed(() => totalAlbums.value > itemsPerPage.value);

// Compute full sorted album list for queue functionality
const sortedAlbumsList = computed(() => {
  // Sort albumsWithDates based on current sort mode and direction
  let sorted;
  
  if (sortMode.value === 'year') {
    // For year sorting in computed, we use available data from albumRootDataMap
    sorted = [...albumsWithDates.value].sort((a, b) => {
      const rootA = albumRootDataMap.value[a.id];
      const rootB = albumRootDataMap.value[b.id];
      const yearA = rootA?.releaseYear || 0;
      const yearB = rootB?.releaseYear || 0;
      
      if (yearA === 0 && yearB === 0) return 0;
      if (yearA === 0) return sortDirection.value === 'desc' ? -1 : 1;
      if (yearB === 0) return sortDirection.value === 'desc' ? 1 : -1;
      
      return sortDirection.value === 'desc' 
        ? yearB - yearA 
        : yearA - yearB;
    });
  } else if (sortMode.value === 'name') {
    sorted = [...albumsWithDates.value].sort((a, b) => {
      const rootA = albumRootDataMap.value[a.id];
      const rootB = albumRootDataMap.value[b.id];
      const nameA = rootA?.albumTitle || '';
      const nameB = rootB?.albumTitle || '';
      const comparison = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      return sortDirection.value === 'desc' ? -comparison : comparison;
    });
  } else if (sortMode.value === 'artist') {
    sorted = [...albumsWithDates.value].sort((a, b) => {
      const rootA = albumRootDataMap.value[a.id];
      const rootB = albumRootDataMap.value[b.id];
      const artistA = rootA?.artistName || '';
      const artistB = rootB?.artistName || '';
      const comparison = artistA.localeCompare(artistB, undefined, { sensitivity: 'base' });
      return sortDirection.value === 'desc' ? -comparison : comparison;
    });
  } else if (sortMode.value === 'loved') {
    sorted = [...albumsWithDates.value].sort((a, b) => {
      const lovedA = albumLovedData.value[a.id]?.percentage || 0;
      const lovedB = albumLovedData.value[b.id]?.percentage || 0;
      return sortDirection.value === 'desc' 
        ? lovedB - lovedA 
        : lovedA - lovedB;
    });
  } else {
    // Sort by date (addedAt) - default
    sorted = [...albumsWithDates.value].sort((a, b) => {
      const dateA = new Date(a.addedAt);
      const dateB = new Date(b.addedAt);
      return sortDirection.value === 'desc' 
        ? dateB - dateA 
        : dateA - dateB;
    });
  }
  
  // Map to album objects with id, artists, artistName from albumData or albumRootDataMap
  return sorted.map(albumWithDate => {
    // Try to find album in current page data first
    const albumInPage = albumData.value.find(a => a.id === albumWithDate.id);
    if (albumInPage) {
      return albumInPage;
    }
    
    // Fallback to root data map
    const rootData = albumRootDataMap.value[albumWithDate.id];
    if (rootData) {
      return {
        id: albumWithDate.id,
        artists: rootData.artists || [],
        artistName: rootData.artistName || rootData.artists?.[0]?.name || ''
      };
    }
    
    // Last resort: return minimal object with id
    return {
      id: albumWithDate.id,
      artists: [],
      artistName: ''
    };
  });
});

// Update cache keys
const albumIdListCacheKey = computed(() => `playlist_${id.value}_albumsWithDates`);
const pageCacheKey = (page) => `playlist_${id.value}_page_${page}_${sortMode.value}_${sortDirection.value}`;

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

// Invalid albums checking state
const checkingInvalid = ref(false);
const invalidAlbumsReport = ref({
  nullAlbums: [],
  notInDb: [],
  noArtistId: []
});
const showInvalidReport = ref(false);

// Last.fm loved tracks data
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

// Progressive loading of loved track percentages (using unified cache)
// Only calculate when tracklist is enabled
async function loadLovedTrackPercentages() {
  if (!userData.value?.lastFmUserName || lovedTracksLoadingStarted.value || !showTracklists.value) {
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
    
    // Calculate percentages progressively for each album using unified cache
    for (const album of albumData.value) {
      try {
        const result = await getAlbumLovedPercentage(album.id);
        albumLovedData.value[album.id] = {
          ...result,
          isLoading: false
        };
      } catch (err) {
        logPlaylist(`Error calculating loved track percentage for album ${album.id}:`, err);
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
    logPlaylist('Error loading loved track percentages:', err);
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
// Only calculate when tracklist is enabled
async function loadLovedTrackPercentagesForNewAlbums() {
  if (!userData.value?.lastFmUserName || !showTracklists.value) {
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
  
  // Calculate percentages for new albums using unified cache
  for (const album of newAlbums) {
    try {
      const result = await getAlbumLovedPercentage(album.id);
      albumLovedData.value[album.id] = {
        ...result,
        isLoading: false
      };
    } catch (err) {
      logPlaylist(`Error calculating loved track percentage for album ${album.id}:`, err);
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
  logPlaylist('Fetching album ID list:', { playlistId, cacheKey: albumIdListCacheKey.value });
  let albumsWithDatesData = await getCache(albumIdListCacheKey.value);
  if (!albumsWithDatesData) {
    logCache('Cache miss for album ID list, fetching from Spotify');
    albumsWithDatesData = await getPlaylistAlbumsWithDates(playlistId);
    logCache('Caching album ID list:', { count: albumsWithDatesData.length });
    await setCache(albumIdListCacheKey.value, albumsWithDatesData);
  } else {
    logCache('Cache hit for album ID list:', { count: albumsWithDatesData.length });
  }
  albumsWithDates.value = albumsWithDatesData;
  
  // Apply initial sorting
  logPlaylist('Applying initial sorting');
  await applySortingAndReload();
  
  // Count albums in database after loading all albums
  logPlaylist('Counting albums in database');
  await countAlbumsInDatabase();
  
  logPlaylist('Album ID list fetch complete:', { sortedCount: sortedAlbumIds.value.length });
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
        pipelineRole: currentEntry.pipelineRole || 'transient',
        type: currentEntry.type,
        playlistId: currentEntry.playlistId
      } : null;
    } else {
      album.ratingData = null;
    }
  });
  await updateNeedsUpdateMap();
  
  // Load loved track percentages progressively (only when tracklist is enabled)
  if (userData.value?.lastFmUserName && showTracklists.value) {
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
  
  // Clear page caches for all sort modes and directions
  const totalPagesToClear = totalPages.value || 50; // Fallback number
  const sortModes = ['date', 'year', 'name', 'artist', 'loved'];
  const directions = ['asc', 'desc'];
  for (let page = 1; page <= totalPagesToClear; page++) {
    for (const mode of sortModes) {
      for (const dir of directions) {
        await clearCache(`playlist_${id.value}_page_${page}_${mode}_${dir}`);
      }
    }
  }
  
  // Also clear albumDbData cache for all albums on the current page
  if (user.value && albumData.value && albumData.value.length) {
    for (const album of albumData.value) {
      await clearCache(`albumDbData_${album.id}_${user.value.uid}`);
      // Clear album root data cache as well
      await clearCache(`albumRootData_${album.id}`);
    }
  }
  
  // Clear the playlist from unified track cache to force full rebuild
  if (user.value && id.value) {
    try {
      const cache = await loadUnifiedTrackCache(user.value.uid, userData.value?.lastFmUserName || '');
      if (cache?.playlists[id.value]) {
        delete cache.playlists[id.value];
        await saveUnifiedTrackCache(user.value.uid, true);
        logCache(`Removed playlist ${id.value} from unified cache to force rebuild`);
      }
    } catch (error) {
      logCache('Error removing playlist from unified cache:', error);
    }
  }
  
  cacheCleared.value = true;
  albumData.value = [];
  albumsWithDates.value = [];
  sortedAlbumIds.value = [];
  playlistName.value = '';
  albumsInDbCount.value = 0;
  
  // Store tracklist preference before clearing
  const wasTracklistEnabled = showTracklists.value;
  
  // Clear tracks data
  albumTracksData.value = {};
  
  // Clear loved tracks data
  lovedTracksLoadingStarted.value = false;
  albumLovedData.value = {};
  
  await loadPlaylistPage();
  
  // Restore tracklist if it was enabled before clearing
  if (wasTracklistEnabled && showTracklists.value && albumData.value.length > 0) {
    await fetchAlbumTracks();
  }
}

async function getPlaylistDocument() {
  if (!user.value) return null;
  
  const playlistsRef = collection(db, 'playlists');
  const q = query(
    playlistsRef, 
    where('playlistId', '==', id.value)
  );
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    logPlaylist('Playlist document not found');
    return null;
  }
  
  // Filter out deleted playlists
  const activePlaylists = querySnapshot.docs.filter(doc => {
    const data = doc.data();
    return data.deletedAt == null; // null or undefined both mean active
  });
  
  if (activePlaylists.length === 0) {
    logPlaylist('No active playlist document found');
    return null;
  }
  
  return activePlaylists[0];
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
    logPlaylist('Error updating playlist:', err);
    error.value = err.message || 'Failed to update playlist';
  } finally {
    updating.value = false;
  }
}

// Update pagination logic to load data per page
const nextPage = async () => {
  if (currentPage.value < totalPages.value) {
    const wasTracklistEnabled = showTracklists.value;
    currentPage.value++;
    await loadCurrentPage();
    
    // Restore tracklist if it was enabled
    if (wasTracklistEnabled && showTracklists.value && albumData.value.length > 0) {
      await fetchAlbumTracks();
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const previousPage = async () => {
  if (currentPage.value > 1) {
    const wasTracklistEnabled = showTracklists.value;
    currentPage.value--;
    await loadCurrentPage();
    
    // Restore tracklist if it was enabled
    if (wasTracklistEnabled && showTracklists.value && albumData.value.length > 0) {
      await fetchAlbumTracks();
    }
    
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
      logPlaylist('updateNeedsUpdateMap:', { albumId: album.id, details, needsUpdate });
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
    logPlaylist('Error updating album details:', err);
    error.value = err.message || 'Failed to update album details';
  }
}

async function loadPlaylistPage() {
  logPlaylist('Loading playlist page:', { playlistId: id.value });
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;
  try {
    logPlaylist('Fetching album ID list');
    await fetchAlbumIdList(id.value);
    logPlaylist('Album ID list fetched:', { count: sortedAlbumIds.value.length });
    
    if (!playlistName.value) {
      // Check unified track cache for playlist name first
      if (user.value) {
        try {
          const cache = await loadUnifiedTrackCache(user.value.uid, userData.value?.lastFmUserName || '');
          const cachedPlaylist = cache?.playlists[id.value];
          if (cachedPlaylist?.playlistName) {
            playlistName.value = cachedPlaylist.playlistName;
            logCache('Playlist name loaded from unified cache:', playlistName.value);
          }
        } catch (error) {
          logCache('Error loading playlist name from cache:', error);
        }
      }
      
      // Only fetch from API if not found in cache
      if (!playlistName.value) {
        logPlaylist('Playlist name not in cache, fetching playlist details from Spotify');
        const playlistResponse = await getPlaylist(id.value);
        playlistName.value = playlistResponse.name;
        totalTracks.value = playlistResponse.tracks?.total || 0;
        logPlaylist('Playlist details fetched:', { name: playlistName.value, totalTracks: totalTracks.value });
      } else {
        logPlaylist('Playlist name loaded from cache, skipping API call');
      }
    }
    
    // Always try to get track count from playlist_summaries_ cache
    if (user.value && totalTracks.value === 0) {
      try {
        const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
        const playlistSummariesCache = await getCache(playlistViewCacheKey);
        
        if (playlistSummariesCache) {
          // Search through all groups to find the playlist
          for (const group of Object.keys(playlistSummariesCache)) {
            const groupPlaylists = playlistSummariesCache[group] || [];
            const cachedPlaylist = groupPlaylists.find(p => p.id === id.value);
            
            if (cachedPlaylist?.tracks?.total !== undefined) {
              totalTracks.value = cachedPlaylist.tracks.total;
              logPlaylist('Track count loaded from playlist_summaries cache:', totalTracks.value);
              break;
            }
          }
        }
      } catch (error) {
        logPlaylist('Error loading track count from playlist_summaries cache:', error);
      }
    }
    
    // If still no track count, fetch from Spotify API
    if (totalTracks.value === 0) {
      try {
        logPlaylist('Track count not in cache, fetching from Spotify API');
        const playlistResponse = await getPlaylist(id.value);
        totalTracks.value = playlistResponse.tracks?.total || 0;
        logPlaylist('Track count fetched from Spotify API:', totalTracks.value);
      } catch (error) {
        logPlaylist('Error fetching track count from Spotify API:', error);
      }
    }
    
    // The album data is already loaded by applySortingAndReload in fetchAlbumIdList
    // loadCurrentPage is called within applySortingAndReload
    logPlaylist('Fetching playlist document');
    playlistDoc.value = await getPlaylistDocument();
    logPlaylist('Playlist page loaded successfully');
  } catch (e) {
    logPlaylist("Error loading playlist page:", e);
    if (e.name === 'QuotaExceededError' || e.message?.includes('quota') || e.message?.includes('QuotaExceededError')) {
      error.value = "Browser storage is full. Please go to Account > Cache Management to clear some cache data, then try again.";
    } else {
      error.value = e.message || "Failed to load playlist data. Please try again.";
    }
  } finally {
    loading.value = false;
  }
}

// Listen for playlist album updates from other views
const handlePlaylistAlbumsUpdated = async (event) => {
  const { playlistId } = event.detail;
  // If this is the playlist we're currently viewing, reload it
  if (playlistId === id.value) {
    logPlaylist(`Received playlist-albums-updated event for current playlist, reloading...`);
    await loadPlaylistPage();
  }
};

// Listen for track loved/unloved from player
const handleTrackLovedFromPlayer = async (event) => {
  const { track } = event.detail;
  if (!track || !userData.value?.lastFmUserName) return;
  
  // Find the album that contains this track
  const album = albumData.value.find(alb => {
    const tracks = albumTracksData.value[alb.id] || [];
    return tracks.some(t => 
      t.name.toLowerCase() === track.name.toLowerCase() &&
      t.artists?.some(a => a.name.toLowerCase() === track.artists[0]?.name?.toLowerCase())
    );
  });
  
  if (album) {
    // Use the existing handler which will update unified cache and recalculate percentages
    await handleTrackLoved({ album, track });
  } else if (track.id) {
    // If album not found but we have track ID, update unified cache directly
    await updateLovedStatus(track.id, true);
  }
};

const handleTrackUnlovedFromPlayer = async (event) => {
  const { track } = event.detail;
  if (!track || !userData.value?.lastFmUserName) return;
  
  // Find the album that contains this track
  const album = albumData.value.find(alb => {
    const tracks = albumTracksData.value[alb.id] || [];
    return tracks.some(t => 
      t.name.toLowerCase() === track.name.toLowerCase() &&
      t.artists?.some(a => a.name.toLowerCase() === track.artists[0]?.name?.toLowerCase())
    );
  });
  
  if (album) {
    // Use the existing handler which will update unified cache and recalculate percentages
    await handleTrackUnloved({ album, track });
  } else if (track.id) {
    // If album not found but we have track ID, update unified cache directly
    await updateLovedStatus(track.id, false);
  }
};

// Listen for Last.fm sync errors
const handleLastFmSyncError = (event) => {
  const { trackName, artistName, message, isSessionError, trackId, attemptedLoved } = event.detail;
  
  logPlaylist('Last.fm sync error received:', { trackId, trackName, artistName, attemptedLoved, message });
  
  // Show alert notification
  alert(message);
  
  // Revert the UI update for all errors (cache already reverted, just need to update UI)
  // The attemptedLoved tells us what we tried to set it to, so we revert to the opposite
  const targetLovedState = !attemptedLoved;
  let trackFound = false;
  
  if (trackId) {
    // Find and revert the track in albumTracksData by trackId
    Object.keys(albumTracksData.value).forEach(albumId => {
      const tracks = albumTracksData.value[albumId];
      const trackIndex = tracks.findIndex(t => t.id === trackId);
      if (trackIndex !== -1) {
        const track = tracks[trackIndex];
        // Only update if current state doesn't match the reverted state
        if (track.loved !== targetLovedState) {
          albumTracksData.value[albumId] = [
            ...tracks.slice(0, trackIndex),
            { ...track, loved: targetLovedState },
            ...tracks.slice(trackIndex + 1)
          ];
          trackFound = true;
          
          logPlaylist(`Reverted track ${trackId} in album ${albumId} from ${track.loved} to ${targetLovedState}`);
          
          // Also recalculate loved track percentage for this album
          if (albumLovedData.value[albumId]) {
            getAlbumLovedPercentage(albumId).then(result => {
              albumLovedData.value[albumId] = {
                ...result,
                isLoading: false
              };
            }).catch(err => {
              logPlaylist('Error recalculating loved percentage after revert:', err);
            });
          }
        }
      }
    });
  }
  
  // Fallback: try to find by track name and artist if trackId didn't work
  if (!trackFound && trackName && artistName) {
    Object.keys(albumTracksData.value).forEach(albumId => {
      const tracks = albumTracksData.value[albumId];
      const trackIndex = tracks.findIndex(t => 
        t.name?.toLowerCase() === trackName.toLowerCase() &&
        t.artists?.some(a => a.name?.toLowerCase() === artistName.toLowerCase())
      );
      if (trackIndex !== -1) {
        const track = tracks[trackIndex];
        // Only update if current state doesn't match the reverted state
        if (track.loved !== targetLovedState) {
          albumTracksData.value[albumId] = [
            ...tracks.slice(0, trackIndex),
            { ...track, loved: targetLovedState },
            ...tracks.slice(trackIndex + 1)
          ];
          trackFound = true;
          
          logPlaylist(`Reverted track "${trackName}" by "${artistName}" in album ${albumId} from ${track.loved} to ${targetLovedState}`);
          
          // Also recalculate loved track percentage for this album
          if (albumLovedData.value[albumId]) {
            getAlbumLovedPercentage(albumId).then(result => {
              albumLovedData.value[albumId] = {
                ...result,
                isLoading: false
              };
            }).catch(err => {
              logPlaylist('Error recalculating loved percentage after revert:', err);
            });
          }
        }
      }
    });
  }
  
  if (!trackFound) {
    logPlaylist('Could not find track to revert:', { trackId, trackName, artistName });
  }
};

onMounted(async () => {
  // Enable logging for debugging
  enableDebug('app:playlist,app:cache');
  logPlaylist('PlaylistSingle mounted - logging enabled for playlist and cache');
  
  document.addEventListener('click', handleSortDropdownClickOutside);
  window.addEventListener('playlist-albums-updated', handlePlaylistAlbumsUpdated);
  window.addEventListener('track-loved-from-player', handleTrackLovedFromPlayer);
  window.addEventListener('track-unloved-from-player', handleTrackUnlovedFromPlayer);
  window.addEventListener('lastfm-sync-error', handleLastFmSyncError);
  
  try {
    // Fetch user playlists to get position data
    if (user.value) {
      await fetchUserPlaylists(user.value.uid);
    }
    
    await loadPlaylistPage();
    
    // Unified cache is automatically initialized by useUnifiedTrackCache composable
    
    // Start polling for current playing track if user has Last.fm connected
    if (userData.value?.lastFmUserName) {
      startCurrentTrackPolling();
    }
    
    // If tracklists were shown on last visit, fetch them
    if (showTracklists.value && albumData.value.length > 0) {
      fetchAlbumTracks();
    }
  } catch (e) {
    logPlaylist("Error in PlaylistSingle:", e);
    error.value = e.message || "An unexpected error occurred. Please try again.";
  }
});

onUnmounted(() => {
  document.removeEventListener('click', handleSortDropdownClickOutside);
  window.removeEventListener('playlist-albums-updated', handlePlaylistAlbumsUpdated);
  window.removeEventListener('track-loved-from-player', handleTrackLovedFromPlayer);
  window.removeEventListener('track-unloved-from-player', handleTrackUnlovedFromPlayer);
  window.removeEventListener('lastfm-sync-error', handleLastFmSyncError);
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
    logPlaylist('Error adding album:', err);
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
    logPlaylist('Error removing album:', err);
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
    
    // 4. Update unified track cache - surgically move album from source to target playlist
    if (user.value) {
      try {
        // Ensure cache is loaded
        await loadUnifiedTrackCache(user.value.uid, userData.value?.lastFmUserName || '');
        
        // Move album in unified cache
        await moveAlbumBetweenPlaylists(
          id.value, // source playlist
          targetSpotifyPlaylistId, // target playlist
          album.id, // album ID
          user.value.uid,
          new Date().toISOString() // addedAt
        );
        
        logPlaylist(`Moved album ${album.id} in unified track cache from ${id.value} to ${targetSpotifyPlaylistId}`);
      } catch (error) {
        logPlaylist(`Error moving album in unified track cache:`, error);
        // Don't fail the whole operation if cache update fails
      }
    }
    
    const actionText = action === 'yes' ? 'moved to next stage' : 'terminated';
    successMessage.value = `"${album.name}" processed and ${actionText} successfully!`;
    
    // Clear cache and reload the current playlist to reflect the changes
    await handleClearCache();
    
    // Update count of albums in database
    await countAlbumsInDatabase();
    
    // Refresh only the affected playlists in PlaylistView cache (source and target)
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      
      // Get current cache state so we can properly update it
      const currentCacheState = await getCache(playlistViewCacheKey) || {};
      logPlaylist(`Cache state retrieved: ${Object.keys(currentCacheState).length} groups, playlists:`, 
        Object.keys(currentCacheState).map(g => `${g}: ${currentCacheState[g]?.length || 0}`).join(', '));
      
      // Refresh both playlists from Spotify and update cache
      const updatedState = await refreshSpecificPlaylists(
        [id.value, targetSpotifyPlaylistId], // Source and target playlists
        currentCacheState, // Pass cache state so it can be properly updated
        playlistViewCacheKey
      );
      
      // Explicitly save the updated state to ensure cache is persisted
      if (updatedState && Object.keys(updatedState).length > 0) {
        logPlaylist(`Saving updated state to cache with ${Object.keys(updatedState).length} groups`);
        await setCache(playlistViewCacheKey, updatedState);
        logPlaylist(`Cache saved successfully`);
        
        // Update totalTracks in the UI from the updated cache
        try {
          for (const group of Object.keys(updatedState)) {
            const groupPlaylists = updatedState[group] || [];
            const cachedPlaylist = groupPlaylists.find(p => p.id === id.value);
            if (cachedPlaylist?.tracks?.total !== undefined) {
              totalTracks.value = cachedPlaylist.tracks.total;
              logPlaylist('Track count updated from cache after processing:', totalTracks.value);
              break;
            }
          }
        } catch (error) {
          logPlaylist('Error updating track count from cache:', error);
          // Fallback: fetch directly from Spotify
          try {
            const playlistResponse = await getPlaylist(id.value);
            totalTracks.value = playlistResponse.tracks?.total || 0;
            logPlaylist('Track count fetched from Spotify API as fallback:', totalTracks.value);
          } catch (spotifyError) {
            logPlaylist('Error fetching track count from Spotify API:', spotifyError);
          }
        }
      } else {
        logPlaylist(`WARNING: Updated state is empty, not saving to cache`);
      }
      
      // Dispatch custom event to notify PlaylistView if it's open
      window.dispatchEvent(new CustomEvent('playlists-updated', {
        detail: { playlistIds: [id.value, targetSpotifyPlaylistId] }
      }));
      
      // Update target playlist's album cache
      const targetAlbumCacheKey = `playlist_${targetSpotifyPlaylistId}_albumsWithDates`;
      const targetAlbumsCache = await getCache(targetAlbumCacheKey);
      
      if (targetAlbumsCache && Array.isArray(targetAlbumsCache)) {
        // Check if album already exists in cache
        const albumExists = targetAlbumsCache.some(a => a.id === album.id);
        if (!albumExists) {
          // Add album with current date
          targetAlbumsCache.push({
            id: album.id,
            addedAt: new Date().toISOString()
          });
          await setCache(targetAlbumCacheKey, targetAlbumsCache);
          logPlaylist(`Added album ${album.id} to target playlist cache`);
        }
      } else {
        // Cache doesn't exist, fetch fresh data
        const freshAlbums = await getPlaylistAlbumsWithDates(targetSpotifyPlaylistId);
        await setCache(targetAlbumCacheKey, freshAlbums);
        logPlaylist(`Fetched and cached fresh album list for target playlist`);
      }
      
      // Clear page caches for target playlist (album list changed)
      const sortModes = ['date', 'year', 'name', 'artist', 'loved'];
      const directions = ['asc', 'desc'];
      for (let page = 1; page <= 50; page++) {
        for (const mode of sortModes) {
          for (const dir of directions) {
            await clearCache(`playlist_${targetSpotifyPlaylistId}_page_${page}_${mode}_${dir}`);
          }
        }
      }
      
      // Dispatch event for target playlist if it's currently open
      window.dispatchEvent(new CustomEvent('playlist-albums-updated', {
        detail: { playlistId: targetSpotifyPlaylistId }
      }));
    }
    
  } catch (err) {
    logPlaylist('Error processing album:', err);
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
        logPlaylist(`Error adding album ${album.id}:`, err);
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
    logPlaylist('Error batch processing albums:', err);
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
      if (!playlistAlbum || !playlistAlbum.id) {
        continue; // Skip null or invalid albums
      }
      
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
        logPlaylist(`Error fetching albums for artist ${artist.artistName}:`, err);
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
    logPlaylist('Error checking for ID mismatches:', err);
    error.value = err.message || 'Failed to check for ID mismatches';
    showProgressModal.value = false;
  } finally {
    checkingMismatches.value = false;
    mismatchCheckProgress.value = { current: 0, total: 0, currentArtist: null };
    currentlyProcessingAlbum.value = null;
  }
}

async function checkForInvalidAlbums() {
  if (!sortedAlbumIds.value.length || !user.value) {
    return;
  }

  checkingInvalid.value = true;
  invalidAlbumsReport.value = {
    nullAlbums: [],
    notInDb: [],
    noArtistId: []
  };
  showInvalidReport.value = false;
  error.value = null;
  successMessage.value = '';

  try {
    // Mirror the exact logic from checkForIdMismatches
    // Step 1: Load all albums from the playlist
    currentlyProcessingAlbum.value = 'Loading playlist albums...';
    const allAlbumsFromPlaylist = await loadAlbumsBatched(sortedAlbumIds.value);
    
    // Create a map of album ID -> album object from the loaded albums
    const loadedAlbumsMap = new Map();
    for (const album of allAlbumsFromPlaylist) {
      if (album && album.id) {
        loadedAlbumsMap.set(album.id, album);
      }
    }
    
    // Step 2: Check which original album IDs are missing from the loaded results
    // These are albums that failed to load from Spotify
    for (const originalAlbumId of sortedAlbumIds.value) {
      if (!loadedAlbumsMap.has(originalAlbumId)) {
        invalidAlbumsReport.value.nullAlbums.push({
          id: originalAlbumId,
          error: 'Failed to load from Spotify'
        });
      }
    }
    
    // Step 3: Now mirror the exact checkForIdMismatches logic
    // Identify which albums exist in the database (same as mismatch check)
    currentlyProcessingAlbum.value = 'Checking which albums are in database...';
    const albumsInDb = [];
    const albumIdToPlaylistAlbum = new Map();
    
    // This is the EXACT same loop as in checkForIdMismatches
    for (const playlistAlbum of allAlbumsFromPlaylist) {
      // THIS IS THE KEY CHECK - albums that fail this are the ones we need to track
      if (!playlistAlbum || !playlistAlbum.id) {
        // This album was filtered out - but we already caught it above in nullAlbums
        // So we can continue here without tracking again
        continue;
      }
      
      albumIdToPlaylistAlbum.set(playlistAlbum.id, playlistAlbum);
      const dbAlbumData = await fetchAlbumsData([playlistAlbum.id]);
      
      if (dbAlbumData[playlistAlbum.id] !== null) {
        // Album exists in DB - this is what would be checked
        albumsInDb.push(playlistAlbum);
      } else {
        // Album not in database
        invalidAlbumsReport.value.notInDb.push({
          id: playlistAlbum.id,
          name: playlistAlbum.name,
          artist: playlistAlbum.artists?.[0]?.name || 'Unknown Artist',
          cover: playlistAlbum.images?.[1]?.url || playlistAlbum.images?.[0]?.url || ''
        });
      }
    }
    
    // Step 4: Group albums by artist (same as mismatch check)
    // This is where albums without artistId get filtered out
    const artistMap = new Map();
    
    for (const album of albumsInDb) {
      const artistId = album.artists[0]?.id;
      const artistName = album.artists[0]?.name || 'Unknown Artist';
      
      if (artistId) {
        // Album has artistId - would be included in mismatch check
        if (!artistMap.has(artistId)) {
          artistMap.set(artistId, {
            artistId,
            artistName,
            albums: []
          });
        }
        artistMap.get(artistId).albums.push(album);
      } else {
        // Album doesn't have artistId - gets filtered out in mismatch check
        invalidAlbumsReport.value.noArtistId.push({
          id: album.id,
          name: album.name,
          artist: artistName,
          cover: album.images?.[1]?.url || album.images?.[0]?.url || ''
        });
      }
    }
    
    // Log for debugging
    logPlaylist('Total albums in playlist:', sortedAlbumIds.value.length);
    logPlaylist('Albums loaded from Spotify:', allAlbumsFromPlaylist.length);
    logPlaylist('Albums that failed to load (null/missing):', invalidAlbumsReport.value.nullAlbums.length);
    logPlaylist('Albums in database:', albumsInDb.length);
    logPlaylist('Albums with artistId (would be checked):', Array.from(artistMap.values()).reduce((sum, artist) => sum + artist.albums.length, 0));
    logPlaylist('Albums without artistId (filtered out):', invalidAlbumsReport.value.noArtistId.length);
    
    showInvalidReport.value = true;
    
    const totalInvalid = invalidAlbumsReport.value.nullAlbums.length + 
                         invalidAlbumsReport.value.notInDb.length + 
                         invalidAlbumsReport.value.noArtistId.length;
    
    if (totalInvalid === 0) {
      successMessage.value = 'No invalid albums found! All albums are valid.';
    } else {
      successMessage.value = `Found ${totalInvalid} invalid album(s). See report below.`;
    }
  } catch (err) {
    logPlaylist('Error checking for invalid albums:', err);
    error.value = err.message || 'Failed to check for invalid albums';
  } finally {
    checkingInvalid.value = false;
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
    logPlaylist('Error creating mapping:', err);
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
    logPlaylist('Error updating year:', err);
    error.value = err.message || 'Failed to update year';
  }
};
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <BackButton text="Back" />
    </div>

    <div class="flex items-center justify-between">
      <h1 class="h2">{{ playlistName }}</h1>
      <div class="flex items-center gap-4">
        <BaseButton 
          v-if="userData?.lastFmUserName && showTracklists"
          variant="secondary"
          @click="refreshLovedTracks"
          :disabled="refreshingLovedTracks"
          title="Refresh loved tracks and playcounts with Last.fm"
        >
          <template #icon-left>
            <HeartIcon class="h-5 w-5" :class="{ 'animate-spin': refreshingLovedTracks }" />
          </template>
          {{ refreshingLovedTracks ? 'Refreshing...' : 'Refresh' }}
        </BaseButton>
        <BaseButton variant="secondary" @click.prevent="handleClearCache" class="w-fit">
          <template #icon-left><ArrowPathIcon class="h-5 w-5" /></template>
        </BaseButton>
        <DropdownMenu aria-label="Playlist options">
          <button
            @click="checkForIdMismatches"
            :disabled="checkingMismatches || loading || batchProcessingAlbums"
            class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            role="menuitem"
          >
            <div class="flex items-center gap-2">
              <ArrowPathIcon v-if="checkingMismatches" class="h-4 w-4 animate-spin" />
              <span>{{ checkingMismatches ? 'Checking...' : 'Check for ID Mismatches' }}</span>
            </div>
          </button>
          <button
            @click="checkForInvalidAlbums"
            :disabled="checkingInvalid || loading || batchProcessingAlbums"
            class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            role="menuitem"
          >
            <div class="flex items-center gap-2">
              <ArrowPathIcon v-if="checkingInvalid" class="h-4 w-4 animate-spin" />
              <span>{{ checkingInvalid ? 'Checking...' : 'Check Invalid' }}</span>
            </div>
          </button>
          <button
            v-if="missingAlbumsCount > 0 && userData?.spotifyConnected"
            @click="batchAddAlbumsToDatabase"
            :disabled="batchProcessingAlbums || loading"
            class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            role="menuitem"
          >
            <div class="flex items-center gap-2">
              <ArrowPathIcon v-if="batchProcessingAlbums" class="h-4 w-4 animate-spin" />
              <span>{{ batchProcessingAlbums 
                ? 'Processing...' 
                : `Add ${missingAlbumsCount} Missing Albums to DB` 
              }}</span>
            </div>
          </button>
        </DropdownMenu>
      </div>
    </div>
    
    <p class="text-lg mb-2"><span class="text-2xl font-bold">{{ totalAlbums }}</span> albums<span v-if="isAdmin"> ({{ albumsInDbCount }} in db)</span></p>
    <p class="text-lg mb-4"><span class="text-2xl font-bold">{{ totalTracks }}</span> tracks</p>
    
    <div class="mb-4 flex gap-4 items-center">
      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="showTracklists" variant="primary-on-celadon" />
        <span class="text-delft-blue font-medium">
          Tracklist
        </span>
      </div>
      <BaseButton v-if="playlistDoc && !playlistDoc.data().name"
        @click="updatePlaylistName"
        :disabled="updating"
      >
        <template #icon-left><PencilIcon class="h-5 w-5" /></template>
        {{ updating ? 'Updating...' : 'Update Playlist Name' }}
      </BaseButton>
      <div class="flex items-center gap-2 ml-auto">
        <span class="text-delft-blue font-medium uppercase text-xs tracking-wide">Sort by:</span>
        <div class="relative" ref="sortDropdownRef">
          <button
            @click="sortDropdownOpen = !sortDropdownOpen"
            class="inline-flex items-center justify-between px-3 py-1.5 min-w-[140px] rounded-lg font-medium transition-colors duration-200 bg-white border border-gray-300 text-delft-blue hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-delft-blue focus:ring-offset-2"
            :aria-expanded="sortDropdownOpen"
          >
            <span>{{ currentSortLabel }}</span>
            <ChevronDownIcon class="h-4 w-4 ml-2" />
          </button>
          
          <Transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
          >
            <div
              v-if="sortDropdownOpen"
              class="absolute left-0 mt-2 w-48 rounded-lg shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50"
              role="menu"
              @click.stop
            >
              <div class="py-1" role="none">
                <button
                  @click="setSortMode('date')"
                  class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors flex items-center justify-between"
                  role="menuitem"
                >
                  <span>Date added</span>
                  <svg v-if="sortMode === 'date'" class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
                <button
                  @click="setSortMode('year')"
                  class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors flex items-center justify-between"
                  role="menuitem"
                >
                  <span>Release year</span>
                  <svg v-if="sortMode === 'year'" class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
                <button
                  @click="setSortMode('name')"
                  class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors flex items-center justify-between"
                  role="menuitem"
                >
                  <span>Album name</span>
                  <svg v-if="sortMode === 'name'" class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
                <button
                  @click="setSortMode('artist')"
                  class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors flex items-center justify-between"
                  role="menuitem"
                >
                  <span>Artist name</span>
                  <svg v-if="sortMode === 'artist'" class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
                <button
                  v-if="userData?.lastFmUserName"
                  @click="setSortMode('loved')"
                  class="block w-full text-left px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors flex items-center justify-between"
                  role="menuitem"
                >
                  <span>Loved</span>
                  <svg v-if="sortMode === 'loved'" class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </Transition>
        </div>
        <button
          @click="toggleSortDirection"
          class="inline-flex items-center justify-center px-3 py-2 rounded-lg font-medium transition-colors duration-200 bg-white border border-gray-300 text-delft-blue hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-delft-blue focus:ring-offset-2"
          :title="sortDirection === 'asc' ? 'Ascending' : 'Descending'"
        >
          <ArrowUpIcon v-if="sortDirection === 'asc'" class="h-5 w-5" />
          <ArrowDownIcon v-else class="h-5 w-5" />
        </button>
      </div>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading playlist...
    </p>

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

    <!-- Invalid Albums Report -->
    <div v-if="showInvalidReport && (invalidAlbumsReport.nullAlbums.length > 0 || invalidAlbumsReport.notInDb.length > 0 || invalidAlbumsReport.noArtistId.length > 0)" class="mb-6 bg-red-50 border-2 border-red-400 rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4 text-red-800">
        Invalid Albums Report
      </h2>
      
      <!-- Failed to Load from Spotify -->
      <div v-if="invalidAlbumsReport.nullAlbums.length > 0" class="mb-6">
        <h3 class="text-lg font-semibold mb-3 text-red-700">
          Failed to Load from Spotify ({{ invalidAlbumsReport.nullAlbums.length }})
        </h3>
        <div class="bg-white rounded-lg p-4 border border-red-300">
          <ul class="space-y-2">
            <li v-for="(album, index) in invalidAlbumsReport.nullAlbums" :key="index" class="text-sm">
              <span class="font-mono text-gray-600">{{ album.id }}</span>
              <span class="text-gray-500 ml-2">- {{ album.error }}</span>
            </li>
          </ul>
        </div>
      </div>
      
      <!-- Not in Database -->
      <div v-if="invalidAlbumsReport.notInDb.length > 0" class="mb-6">
        <h3 class="text-lg font-semibold mb-3 text-red-700">
          Not in Database ({{ invalidAlbumsReport.notInDb.length }})
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="(album, index) in invalidAlbumsReport.notInDb" 
            :key="index"
            class="bg-white rounded-lg p-4 border border-red-300"
          >
            <div class="mb-3">
              <img 
                v-if="album.cover" 
                :src="album.cover" 
                :alt="album.name"
                class="w-full h-auto rounded object-cover mb-2 shadow-sm"
              />
              <div v-else class="w-full h-48 bg-gray-200 rounded flex items-center justify-center mb-2">
                <span class="text-gray-400 text-xs">No Cover</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <div>
                <p class="text-xs font-medium text-gray-500 mb-0.5">Artist</p>
                <p class="text-sm font-semibold text-gray-900">{{ album.artist }}</p>
              </div>
              <div>
                <p class="text-xs font-medium text-gray-500 mb-0.5">Title</p>
                <p class="text-sm font-semibold text-gray-900">{{ album.name }}</p>
              </div>
              <div>
                <p class="text-xs font-medium text-gray-500 mb-0.5">ID</p>
                <p class="text-xs font-mono text-gray-600 break-all">{{ album.id }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- No Artist ID -->
      <div v-if="invalidAlbumsReport.noArtistId.length > 0" class="mb-6">
        <h3 class="text-lg font-semibold mb-3 text-red-700">
          Missing Artist ID ({{ invalidAlbumsReport.noArtistId.length }})
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="(album, index) in invalidAlbumsReport.noArtistId" 
            :key="index"
            class="bg-white rounded-lg p-4 border border-red-300"
          >
            <div class="mb-3">
              <img 
                v-if="album.cover" 
                :src="album.cover" 
                :alt="album.name"
                class="w-full h-auto rounded object-cover mb-2 shadow-sm"
              />
              <div v-else class="w-full h-48 bg-gray-200 rounded flex items-center justify-center mb-2">
                <span class="text-gray-400 text-xs">No Cover</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <div>
                <p class="text-xs font-medium text-gray-500 mb-0.5">Artist</p>
                <p class="text-sm font-semibold text-gray-900">{{ album.artist }}</p>
              </div>
              <div>
                <p class="text-xs font-medium text-gray-500 mb-0.5">Title</p>
                <p class="text-sm font-semibold text-gray-900">{{ album.name }}</p>
              </div>
              <div>
                <p class="text-xs font-medium text-gray-500 mb-0.5">ID</p>
                <p class="text-xs font-mono text-gray-600 break-all">{{ album.id }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <p class="mt-4 text-sm text-red-700">
        These albums have issues that prevent them from being processed in the ID mismatch check.
        Albums not in database may need to be added. Albums without artist IDs may have data issues.
      </p>
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
          :pipelinePosition="currentPlaylistPosition?.pipelinePosition ?? null"
          :totalPositions="currentPlaylistPosition?.totalPositions ?? null"
          :isMappedAlbum="false"
          :inCollection="!!inCollectionMap[album.id]"
          :needsUpdate="needsUpdateMap[album.id]"
          :showRemoveButton="userData?.spotifyConnected"
          :showProcessingButtons="userData?.spotifyConnected && !!playlistDoc?.data()?.nextStagePlaylistId"
          :isSourcePlaylist="!!playlistDoc?.data()?.nextStagePlaylistId"
          :hasTerminationPlaylist="!!playlistDoc?.data()?.terminationPlaylistId"
          :isProcessing="processingAlbum === album.id"
          :tracks="albumTracksData[album.id] || []"
          :showTracklist="showTracklists"
          :tracksLoading="tracksLoading"
          :lastFmSessionKey="userData?.lastFmSessionKey || ''"
          :allowTrackLoving="userData?.lastFmAuthenticated || false"
          :playlistId="id"
          :albumsList="sortedAlbumsList"
          :playlistTrackIds="{}"
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

@media (min-width: 1536px) {
  .album-grid {
    grid-template-columns: repeat(5, minmax(150px, 304px));
  }
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
