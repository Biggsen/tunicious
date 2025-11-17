<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setCache, getCache, clearCache } from "@utils/cache";
import AlbumItem from "@components/AlbumItem.vue";
import { useUserData } from "@composables/useUserData";
import { useAlbumsData } from "@composables/useAlbumsData";
import { useAlbumMappings } from "@composables/useAlbumMappings";
import BackButton from '@components/common/BackButton.vue';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { ArrowPathIcon } from '@heroicons/vue/24/solid'
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import { logAlbum } from '@utils/logger';

const route = useRoute();
const router = useRouter();
const { userData } = useUserData();
const { fetchAlbumsData, loading: albumsLoading, getAlbumRatingData } = useAlbumsData();
const { getPrimaryId, isAlternateId, loading: mappingsLoading } = useAlbumMappings();
const { getArtist, getArtistAlbums} = useUserSpotifyApi();

const id = computed(() => route.params.id);
const loading = ref(false);
const error = ref(null);
const cacheCleared = ref(false);

const artistData = ref(null);
const albumData = ref([]);
const albumsStatus = ref({});
const albumDbDataMap = ref({});
const albumRootDataMap = ref({});

// Track which albums are in playlists
const playlistStatus = ref({});
// Track which albums are mapped
const mappedAlbums = ref({});

const totalAlbums = computed(() => albumData.value.length);

const currentPage = ref(1);
const itemsPerPage = ref(20);

const paginatedAlbums = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return albumData.value.slice(start, end);
});

const totalPages = computed(() => 
  Math.ceil(albumData.value.length / itemsPerPage.value)
);

const showPagination = computed(() => 
  albumData.value.length > itemsPerPage.value
);

const cacheKey = computed(() => `artist_${id.value}_essential`);

// Check if an album is in a playlist
const checkPlaylistStatus = async (albumId) => {
  logAlbum(`Checking playlist status for album ${albumId}`);
  
  // First check if this is a mapped album (alternateId)
  const isMappedAlbum = await isAlternateId(albumId);
  mappedAlbums.value[albumId] = isMappedAlbum;
  
  if (isMappedAlbum) {
    logAlbum(`Album ${albumId} is an alternateId (mapped album)`);
    // For mapped albums, we still want to show they're in a playlist if they map to a primary ID
    const primaryId = await getPrimaryId(albumId);
    playlistStatus.value[albumId] = primaryId !== null;
    return;
  }
  
  // For non-mapped albums, check direct album status
  const albumStatus = albumsStatus.value[albumId];
  if (albumStatus?.playlistHistory?.find(h => !h.removedAt)) {
    logAlbum(`Album ${albumId} found directly in albums collection with current playlist`);
    playlistStatus.value[albumId] = true;
    return;
  }
  
  // If not found in albums collection, check if it's an alternate ID
  logAlbum(`Album ${albumId} not found in albums collection, checking mappings...`);
  const primaryId = await getPrimaryId(albumId);
  logAlbum(`Album ${albumId} mapping result:`, primaryId);
  playlistStatus.value[albumId] = primaryId !== null;
  
  if (primaryId) {
    logAlbum(`Album ${albumId} is mapped to ${primaryId}`);
  }
};

// Update playlist status for all albums
const updatePlaylistStatuses = async (albums) => {
  logAlbum('Updating playlist statuses for albums:', albums.map(a => ({ id: a.id, name: a.name })));
  await Promise.all(albums.map(album => checkPlaylistStatus(album.id)));
  logAlbum('Final playlist status:', playlistStatus.value);
};

// Add a cache utility for album root details
async function getCachedAlbumDetails(albumId) {
  const cacheKey = `albumRootData_${albumId}`;
  let cached = await getCache(cacheKey);
  if (cached) return cached;
  const details = await getAlbumRatingData(albumId); // Should be getAlbumDetails, fix below
  if (details) await setCache(cacheKey, details);
  return details;
}

async function fetchArtistData(artistId) {
  const cachedData = await getCache(cacheKey.value);

  if (cachedData) {
    artistData.value = cachedData.artistData;
    albumData.value = cachedData.albumData;
    // Batch fetch user album data and root details
    albumDbDataMap.value = await fetchAlbumsData(albumData.value.map(a => a.id));
    const rootDetailsArr = await Promise.all(albumData.value.map(a => getCachedAlbumDetails(a.id)));
    albumRootDataMap.value = Object.fromEntries(albumData.value.map((a, i) => [a.id, rootDetailsArr[i]]));
    albumsStatus.value = albumDbDataMap.value;
    // Use the batch data for ratingData
    albumData.value.forEach(album => {
      const userData = albumDbDataMap.value[album.id];
      if (userData && userData.playlistHistory) {
        const currentEntry = userData.playlistHistory.find(entry => !entry.removedAt);
        album.ratingData = currentEntry ? {
          priority: currentEntry.priority,
          pipelineRole: currentEntry.pipelineRole || 'transient',
          type: currentEntry.type,
          playlistId: currentEntry.playlistId
        } : null;
      } else {
        album.ratingData = null;
      }
    });
    await updatePlaylistStatuses(albumData.value);
    return;
  }

  const [artistResponse, albumsResponse] = await Promise.all([
    getArtist(artistId),
    getArtistAlbums(artistId)
  ]);

  artistData.value = artistResponse;
  
  albumData.value = albumsResponse.items
    .map(album => ({
      id: album.id,
      name: album.name,
      release_date: album.release_date,
      images: album.images,
      artists: [{ 
        id: album.artists[0]?.id,
        name: album.artists[0]?.name 
      }]
    }))
    .sort((a, b) => new Date(b.release_date) - new Date(a.release_date));

  // Batch fetch user album data and root details
  albumDbDataMap.value = await fetchAlbumsData(albumData.value.map(a => a.id));
  const rootDetailsArr = await Promise.all(albumData.value.map(a => getCachedAlbumDetails(a.id)));
  albumRootDataMap.value = Object.fromEntries(albumData.value.map((a, i) => [a.id, rootDetailsArr[i]]));
  albumsStatus.value = albumDbDataMap.value;
  // Use the batch data for ratingData
  albumData.value.forEach(album => {
    const userData = albumDbDataMap.value[album.id];
    if (userData && userData.playlistHistory) {
      const currentEntry = userData.playlistHistory.find(entry => !entry.removedAt);
      album.ratingData = currentEntry ? {
        priority: currentEntry.priority,
        pipelineRole: currentEntry.pipelineRole || 'transient',
        type: currentEntry.type,
        playlistId: currentEntry.playlistId
      } : null;
    } else {
      album.ratingData = null;
    }
  });
  await updatePlaylistStatuses(albumData.value);

  await setCache(cacheKey.value, {
    artistData: artistData.value,
    albumData: albumData.value
  });
}

async function handleClearCache() {
  await clearCache(cacheKey.value);
  cacheCleared.value = true;
  artistData.value = null;
  albumData.value = [];
  await loadArtistData();
}

async function loadArtistData() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;
  try {
    await fetchArtistData(id.value);
  } catch (e) {
    logAlbum("Error loading artist data:", e);
    error.value = e.message || "Failed to load artist data. Please try again.";
  } finally {
    loading.value = false;
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const previousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const goBack = () => {
  router.go(-1);
};

onMounted(async () => {
  try {
    await loadArtistData();
  } catch (e) {
    logAlbum("Error in ArtistView:", e);
    error.value = e.message || "An unexpected error occurred. Please try again.";
  }
});
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <BackButton />
    </div>

    <div v-if="artistData" class="mb-8">
      <div class="flex items-center gap-4">
        <img 
          :src="artistData.images[0]?.url" 
          :alt="artistData.name"
          class="w-32 h-32 rounded-full object-cover"
        />
        <div>
          <h1 class="h2">{{ artistData.name }}</h1>
          <p class="text-gray-600">{{ totalAlbums }} albums</p>
        </div>
      </div>
    </div>

    <div class="mb-4">
      <BaseButton @click.prevent="handleClearCache">
        <template #icon-left><ArrowPathIcon class="h-5 w-5" /></template>
        Reload
      </BaseButton>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading artist data...
    </p>

    <LoadingMessage v-if="loading || albumsLoading || mappingsLoading" />
    <ErrorMessage v-else-if="error" :message="error" />
    <template v-else-if="albumData.length">
      <ul class="album-grid">
        <AlbumItem 
          v-for="album in paginatedAlbums" 
          :key="album.id" 
          :album="album" 
          :lastFmUserName="userData?.lastFmUserName"
          :hideArtist="true"
          :currentPlaylist="albumsStatus[album.id]?.playlistHistory?.find(h => !h.removedAt)"
          :isMappedAlbum="mappedAlbums[album.id]"
          :ratingData="album.ratingData"
          :class="{ 'not-in-playlist': !playlistStatus[album.id] }"
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
    <p v-else class="no-data-message">No albums found for this artist.</p>
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

/* Artist-specific album styling */
:deep(.album-item.not-in-playlist) {
  @apply bg-white border-opacity-30;
}

:deep(.album-item.not-in-playlist) .album-link {
  @apply bg-opacity-30;
}

:deep(.album-item.not-in-playlist) .album-info {
  @apply bg-white;
}
</style> 