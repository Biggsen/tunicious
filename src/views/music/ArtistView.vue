<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setCache, getCache, clearCache } from "@utils/cache";
import AlbumItem from "@components/AlbumItem.vue";
import { useUserData } from "@composables/useUserData";
import { useAlbumsData } from "@composables/useAlbumsData";
import { useAlbumMappings } from "@composables/useAlbumMappings";
import BackButton from '@components/common/BackButton.vue';
import { useSpotifyApi } from '@composables/useSpotifyApi';
import { ArrowPathIcon } from '@heroicons/vue/24/solid'

const route = useRoute();
const router = useRouter();
const { userData } = useUserData();
const { fetchAlbumsData, loading: albumsLoading } = useAlbumsData();
const { getPrimaryId, isAlternateId, loading: mappingsLoading } = useAlbumMappings();
const { getArtist, getArtistAlbums, loading: spotifyLoading, error: spotifyError } = useSpotifyApi();

const id = computed(() => route.params.id);
const loading = ref(false);
const error = ref(null);
const cacheCleared = ref(false);

const artistData = ref(null);
const albumData = ref([]);
const albumsStatus = ref({});

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
  console.log(`Checking playlist status for album ${albumId}`);
  
  // First check if this is a mapped album (alternateId)
  const isMappedAlbum = await isAlternateId(albumId);
  mappedAlbums.value[albumId] = isMappedAlbum;
  
  if (isMappedAlbum) {
    console.log(`Album ${albumId} is an alternateId (mapped album)`);
    // For mapped albums, we still want to show they're in a playlist if they map to a primary ID
    const primaryId = await getPrimaryId(albumId);
    playlistStatus.value[albumId] = primaryId !== null;
    return;
  }
  
  // For non-mapped albums, check direct album status
  const albumStatus = albumsStatus.value[albumId];
  if (albumStatus?.playlistHistory?.find(h => !h.removedAt)) {
    console.log(`Album ${albumId} found directly in albums collection with current playlist`);
    playlistStatus.value[albumId] = true;
    return;
  }
  
  // If not found in albums collection, check if it's an alternate ID
  console.log(`Album ${albumId} not found in albums collection, checking mappings...`);
  const primaryId = await getPrimaryId(albumId);
  console.log(`Album ${albumId} mapping result:`, primaryId);
  playlistStatus.value[albumId] = primaryId !== null;
  
  if (primaryId) {
    console.log(`Album ${albumId} is mapped to ${primaryId}`);
  }
};

// Update playlist status for all albums
const updatePlaylistStatuses = async (albums) => {
  console.log('Updating playlist statuses for albums:', albums.map(a => ({ id: a.id, name: a.name })));
  await Promise.all(albums.map(album => checkPlaylistStatus(album.id)));
  console.log('Final playlist status:', playlistStatus.value);
};

async function fetchArtistData(artistId) {
  const cachedData = await getCache(cacheKey.value);

  if (cachedData) {
    artistData.value = cachedData.artistData;
    albumData.value = cachedData.albumData;
    // Fetch fresh album statuses even when using cache
    albumsStatus.value = await fetchAlbumsData(albumData.value.map(a => a.id));
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
      images: [null, { url: album.images[1]?.url }],
      artists: [{ 
        id: album.artists[0]?.id,
        name: album.artists[0]?.name 
      }]
    }))
    .sort((a, b) => new Date(b.release_date) - new Date(a.release_date));

  // Fetch album statuses
  albumsStatus.value = await fetchAlbumsData(albumData.value.map(a => a.id));
  await updatePlaylistStatuses(albumData.value);

  console.log('Album Data:', albumData.value);
  console.log('Albums Status:', albumsStatus.value);
  console.log('Playlist Status:', playlistStatus.value);

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
    console.error("Error loading artist data:", e);
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
    console.error("Error in ArtistView:", e);
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
      <button 
        @click.prevent="handleClearCache" 
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
      >
        <ArrowPathIcon class="h-5 w-5" />
        Reload
      </button>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading artist data...
    </p>

    <p v-if="loading || albumsLoading || mappingsLoading" class="loading-message">Loading...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
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
          :class="{ 'not-in-playlist': !playlistStatus[album.id] }"
        />
      </ul>

      <div v-if="showPagination" class="pagination-controls">
        <button 
          @click="previousPage" 
          :disabled="currentPage === 1"
          class="pagination-button"
        >
          Previous
        </button>
        
        <span class="pagination-info">
          Page {{ currentPage }} of {{ totalPages }}
          ({{ (currentPage - 1) * itemsPerPage + 1 }}-{{ Math.min(currentPage * itemsPerPage, totalAlbums) }} 
          of {{ totalAlbums }} albums)
        </span>
        
        <button 
          @click="nextPage" 
          :disabled="currentPage === totalPages"
          class="pagination-button"
        >
          Next
        </button>
      </div>
    </template>
    <p v-else class="no-data-message">No albums found for this artist.</p>
  </main>
</template>

<style scoped>
.loading-message,
.error-message,
.no-data-message {
  @apply text-center py-4 font-bold;
}
.error-message {
  @apply text-red-500;
}
.album-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 1rem;
  justify-content: center;
}

@media (max-width: 639px) {
  .album-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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