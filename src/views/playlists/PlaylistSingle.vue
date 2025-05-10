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
import { usePlaylistMovement } from '../../composables/usePlaylistMovement';
import { useAlbumsData } from "@composables/useAlbumsData";
import { useSorting } from '@composables/useSorting';
import { ArrowPathIcon, PencilIcon, BarsArrowUpIcon, BarsArrowDownIcon } from '@heroicons/vue/24/solid'
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';

const route = useRoute();
const { user, userData } = useUserData();
const { getPlaylist, getPlaylistAlbumsWithDates, loadAlbumsBatched, loading: spotifyLoading, error: spotifyError } = useSpotifyApi();
const { updateAlbumPlaylist, error: moveError } = usePlaylistMovement();
const { getCurrentPlaylistInfo, fetchAlbumsData, getAlbumDetails, updateAlbumDetails } = useAlbumsData();

const id = computed(() => route.params.id);
const loading = ref(false);
const error = ref(null);
const cacheCleared = ref(false);
const updating = ref(false);

const albumData = ref([]);
const playlistName = ref('');
const playlistDoc = ref(null);

// Use the sorting composable
const { 
  sortDirection, 
  sortedItems: sortedAlbumData, 
  toggleSort, 
  sortDirectionLabel 
} = useSorting(albumData, {
  sortKey: 'addedAt',
  defaultDirection: 'asc' // Default to oldest first
});

const albumIdList = ref([]); // Store the full album ID list for pagination

const totalAlbums = computed(() => albumIdList.value.length);

const currentPage = ref(1);
const itemsPerPage = ref(20);

// Update paginatedAlbums to use sortedAlbumData
const paginatedAlbums = computed(() => {
  // albumData.value contains only the current page's album details
  // We want to return albumData.value as the paginated albums for the current page
  return albumData.value;
});

const totalPages = computed(() => Math.ceil(albumIdList.value.length / itemsPerPage.value));

const showPagination = computed(() => totalAlbums.value > itemsPerPage.value);

const albumIdListCacheKey = computed(() => `playlist_${id.value}_albumIds`);
const pageCacheKey = (page) => `playlist_${id.value}_page_${page}`;

const inCollectionMap = ref({});
const needsUpdateMap = ref({});

async function fetchAlbumIdList(playlistId) {
  let albumIds = await getCache(albumIdListCacheKey.value);
  if (!albumIds) {
    const albumsWithDates = await getPlaylistAlbumsWithDates(playlistId);
    albumIds = albumsWithDates.map(a => a.id);
    await setCache(albumIdListCacheKey.value, albumIds);
  }
  albumIdList.value = albumIds; // Store for pagination
  return albumIds;
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

async function loadPlaylistPage() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;
  try {
    const albumIds = await fetchAlbumIdList(id.value);
    // Fetch playlist name from Spotify if not set
    if (!playlistName.value) {
      const playlistResponse = await getPlaylist(id.value);
      playlistName.value = playlistResponse.name;
    }
    albumData.value = await fetchAlbumsForPage(albumIds, currentPage.value);
    inCollectionMap.value = await fetchAlbumsData(albumData.value.map(a => a.id));
    await updateNeedsUpdateMap();
    playlistDoc.value = await getPlaylistDocument();
  } catch (e) {
    console.error("Error loading playlist page:", e);
    error.value = e.message || "Failed to load playlist data. Please try again.";
  } finally {
    loading.value = false;
  }
}

async function handleClearCache() {
  // Clear all related cache keys for this playlist
  await clearCache(albumIdListCacheKey.value);
  const albumIds = await getCache(albumIdListCacheKey.value);
  const totalPagesToClear = albumIds ? Math.ceil(albumIds.length / itemsPerPage.value) : totalPages.value;
  for (let page = 1; page <= totalPagesToClear; page++) {
    await clearCache(pageCacheKey(page));
  }
  cacheCleared.value = true;
  albumData.value = [];
  playlistName.value = '';
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
    await loadPlaylistPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const previousPage = async () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    await loadPlaylistPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const checkAlbumMovements = async () => {
  console.log('Starting checkAlbumMovements for playlist:', id.value);
  for (const album of albumData.value) {
    try {
      console.log('Checking album:', album.name, 'ID:', album.id);
      const currentInfo = await getCurrentPlaylistInfo(album.id);
      console.log('Current playlist info for album:', album.name, currentInfo);
      
      if (currentInfo && currentInfo.playlistId !== id.value) {
        console.log('Album has moved:', album.name, 'Current playlist:', currentInfo.playlistId, 'Viewing playlist:', id.value);
        album.hasMoved = true;
      } else {
        console.log('Album has not moved:', album.name, currentInfo ? `Current playlist: ${currentInfo.playlistId}` : 'No current info');
        album.hasMoved = false;
      }
    } catch (err) {
      console.error('Error checking album movement:', album.name, err);
      album.hasMoved = false;
    }
  }
};

watch([() => albumData.value, id], () => {
  console.log('Album data or playlist ID changed, rechecking movements');
  checkAlbumMovements();
}, { immediate: true });

const handleUpdatePlaylist = async (album) => {
  try {
    error.value = null;
    
    // Get the current playlist data
    const playlistData = {
      playlistId: id.value,
      name: playlistName.value,
      ...playlistDoc.value.data()
    };

    const success = await updateAlbumPlaylist(album.id, playlistData, album.addedAt);
    if (success) {
      // Refresh the album's moved status
      album.hasMoved = false;
    }
  } catch (err) {
    console.error('Error updating playlist:', err);
    error.value = moveError.value || 'Failed to update playlist location';
  }
};

const refreshInCollectionForAlbum = async (albumId) => {
  // Only refresh the inCollectionMap for the given albumId
  const result = await fetchAlbumsData([albumId]);
  inCollectionMap.value = { ...inCollectionMap.value, ...result };
};

async function updateNeedsUpdateMap() {
  const entries = await Promise.all(
    albumData.value.map(async (album) => {
      const inCollection = !!inCollectionMap.value[album.id];
      if (!inCollection) return [album.id, false];
      const details = await getAlbumDetails(album.id);
      const needsUpdate = !details.albumCover || !details.artistId || !details.releaseYear;
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

onMounted(async () => {
  try {
    await loadPlaylistPage();
  } catch (e) {
    console.error("Error in PlaylistSingle:", e);
    error.value = e.message || "An unexpected error occurred. Please try again.";
  }
});
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

    <p class="text-lg mb-6">Total unique albums: {{ totalAlbums }}</p>
    <LoadingMessage v-if="loading" />
    <ErrorMessage v-else-if="error" :message="error" />
    <template v-else-if="albumData.length">
      <ul class="album-grid">
        <AlbumItem 
          v-for="album in paginatedAlbums" 
          :key="album.id" 
          :album="album" 
          :lastFmUserName="userData?.lastFmUserName"
          :currentPlaylist="{ playlistId: id }"
          :isMappedAlbum="false"
          :hasMoved="album.hasMoved"
          :inCollection="!!inCollectionMap[album.id]"
          :needsUpdate="needsUpdateMap[album.id]"
          @update-playlist="handleUpdatePlaylist"
          @added-to-collection="refreshInCollectionForAlbum"
          @update-album="handleUpdateAlbumDetails"
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
</style>
