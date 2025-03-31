<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToken } from "../utils/auth";
import { getArtist, getArtistAlbums } from "../utils/api";
import { setCache, getCache, clearCache } from "../utils/cache";
import AlbumItem from "../components/AlbumItem.vue";
import { useUserData } from "../composables/useUserData";

const route = useRoute();
const router = useRouter();
const { token, loading: tokenLoading, initializeToken } = useToken();
const { userData } = useUserData();

const id = computed(() => route.params.id);
const loading = ref(false);
const error = ref(null);
const cacheCleared = ref(false);

const artistData = ref(null);
const albumData = ref([]);

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

async function fetchArtistData(artistId) {
  const cachedData = await getCache(cacheKey.value);

  if (cachedData) {
    artistData.value = cachedData.artistData;
    albumData.value = cachedData.albumData;
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
    const tokenResult = await initializeToken();
    if (!tokenResult?.access_token) {
      router.push({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
    localStorage.setItem('token', tokenResult.access_token);
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
      <a 
        href="#" 
        @click.prevent="goBack" 
        class="text-blue-500 hover:underline"
      >&larr; Back</a>
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
      <a href="#" @click.prevent="handleClearCache" class="text-blue-500 hover:underline">
        Clear cache and reload artist data
      </a>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading artist data...
    </p>

    <p v-if="tokenLoading || loading" class="loading-message">Loading...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <template v-else-if="albumData.length">
      <ul class="album-grid">
        <AlbumItem 
          v-for="album in paginatedAlbums" 
          :key="album.id" 
          :album="album" 
          :lastFmUserName="userData?.lastFmUserName"
          :hideArtist="true" 
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
</style> 