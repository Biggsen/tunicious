<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSpotifyApi } from '@composables/useSpotifyApi';
import { setCache, getCache, clearCache } from "@utils/cache";
import AlbumItem from "@components/AlbumItem.vue";
import { useUserData } from "@composables/useUserData";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import BackButton from '@components/common/BackButton.vue';

import { useAlbumsData } from "@composables/useAlbumsData";
import { ArrowPathIcon, PencilIcon, BarsArrowUpIcon, BarsArrowDownIcon } from '@heroicons/vue/24/solid'
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import { getCachedLovedTracks, calculateLovedTrackPercentage } from '@utils/lastFmUtils';
import AlbumSearch from '@components/AlbumSearch.vue';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';

const route = useRoute();
const { user, userData } = useUserData();
const { getPlaylist, getPlaylistAlbumsWithDates, loadAlbumsBatched, loading: spotifyLoading, error: spotifyError } = useSpotifyApi();

const { getCurrentPlaylistInfo, fetchAlbumsData, getAlbumDetails, updateAlbumDetails, getAlbumRatingData, addAlbumToCollection, removeAlbumFromPlaylist } = useAlbumsData();
const { addAlbumToPlaylist, removeFromSpotify, loading: spotifyApiLoading, error: spotifyApiError } = useUserSpotifyApi();

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

const toggleSort = async () => {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc';
  await applySortingAndReload();
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

async function fetchAlbumIdList(playlistId) {
  let albumsWithDatesData = await getCache(albumIdListCacheKey.value);
  if (!albumsWithDatesData) {
    albumsWithDatesData = await getPlaylistAlbumsWithDates(playlistId);
    await setCache(albumIdListCacheKey.value, albumsWithDatesData);
  }
  albumsWithDates.value = albumsWithDatesData;
  
  // Apply initial sorting
  await applySortingAndReload();
  
  return sortedAlbumIds.value;
}

async function fetchAlbumsForPage(albumIds, page) {
  const start = (page - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  const pageAlbumIds = albumIds.slice(start, end);
  let pageAlbums = await getCache(pageCacheKey(page));
  if (!pageAlbums) {
    pageAlbums = await loadAlbumsBatched(pageAlbumIds);
    await setCache(pageCacheKey(page), pageAlbums);
  }
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
  } catch (e) {
    console.error("Error in PlaylistSingle:", e);
    error.value = e.message || "An unexpected error occurred. Please try again.";
  }
});

// Add album to playlist state
const selectedAlbum = ref(null);
const successMessage = ref('');

const handleAddAlbum = async () => {
  try {
    spotifyApiError.value = null;
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
    
    // Also clear the PlaylistView cache to update track counts
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      await clearCache(playlistViewCacheKey);
    }
    
  } catch (err) {
    console.error('Error adding album:', err);
    spotifyApiError.value = err.message || 'Failed to add album to playlist';
  }
};

const handleRemoveAlbum = async (album) => {
  if (!confirm(`Are you sure you want to remove "${album.name}" from this playlist?`)) {
    return;
  }
  
  try {
    spotifyApiError.value = null;
    successMessage.value = '';
    
    // Remove from Spotify playlist
    await removeFromSpotify(id.value, album);
    
    // Remove from Firebase collection
    await removeAlbumFromPlaylist(album.id, id.value);
    
    successMessage.value = `"${album.name}" removed from playlist and collection successfully!`;
    
    // Clear cache and reload the playlist to reflect the removal
    await handleClearCache();
    
    // Also clear the PlaylistView cache to update track counts
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      await clearCache(playlistViewCacheKey);
    }
    
  } catch (err) {
    console.error('Error removing album:', err);
    spotifyApiError.value = err.message || 'Failed to remove album from playlist';
  }
};

const handleProcessAlbum = async ({ album, action }) => {
  if (action !== 'yes' && action !== 'no') return;
  
  try {
    spotifyApiError.value = null;
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
    
    // Also clear the PlaylistView cache to update track counts
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      await clearCache(playlistViewCacheKey);
    }
    
  } catch (err) {
    console.error('Error processing album:', err);
    spotifyApiError.value = err.message || 'Failed to process album';
  } finally {
    processingAlbum.value = null;
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
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading playlist...
    </p>

    <p class="text-lg mb-2">Total unique albums: {{ totalAlbums }}</p>
    <p class="text-lg mb-6">Total tracks: {{ totalTracks }}</p>
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
          @added-to-collection="refreshInCollectionForAlbum"
          @update-album="handleUpdateAlbumDetails"
          @remove-album="handleRemoveAlbum"
          @process-album="handleProcessAlbum"
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
            :disabled="spotifyApiLoading || !selectedAlbum"
            customClass="btn-primary"
          >
            {{ spotifyApiLoading ? 'Adding...' : 'Add Album to Playlist' }}
          </BaseButton>
        </div>
      </form>

      <!-- Error Messages -->
      <ErrorMessage v-if="spotifyApiError" :message="spotifyApiError" class="mt-4" />
      
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
