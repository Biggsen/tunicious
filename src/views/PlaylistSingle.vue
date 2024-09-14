<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToken } from "../utils/auth";
import { getPlaylist, getUniqueAlbumIdsFromPlaylist, getAlbum } from "../utils/api";
import { setCache, getCache, clearCache } from "../utils/cache";
import AlbumItem from "../components/AlbumItem.vue";

const route = useRoute();
const router = useRouter();
const { token, loading: tokenLoading, initializeToken } = useToken();

const id = computed(() => route.params.id);
const loading = ref(false);
const error = ref(null);
const cacheCleared = ref(false);

const albumData = ref([]);
const playlistName = ref('');

const totalAlbums = computed(() => albumData.value.length);

const cacheKey = computed(() => `playlist_${id.value}`);

async function fetchPlaylistData(playlistId, accessToken) {
  const cachedData = getCache(cacheKey.value);

  if (cachedData) {
    playlistName.value = cachedData.playlistName;
    albumData.value = cachedData.albumData;
    return;
  }

  const playlistResponse = await getPlaylist(playlistId);
  playlistName.value = playlistResponse.name;

  const albumIds = await getUniqueAlbumIdsFromPlaylist(playlistId, accessToken);

  const albumPromises = albumIds.map(id => getAlbum(accessToken, id));
  albumData.value = await Promise.all(albumPromises);

  setCache(cacheKey.value, {
    playlistName: playlistName.value,
    albumData: albumData.value
  });
}

async function loadPlaylistData() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;
  try {
    await fetchPlaylistData(id.value, token.value);
  } catch (e) {
    console.error("Error loading playlist data:", e);
    error.value = e.message || "Failed to load playlist data. Please try again.";
  } finally {
    loading.value = false;
  }
}

function handleClearCache() {
  clearCache(cacheKey.value);
  cacheCleared.value = true;
  albumData.value = [];
  playlistName.value = '';
  loadPlaylistData();
}

onMounted(async () => {
  try {
    await initializeToken();
    if (!token.value) {
      router.push({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
    await loadPlaylistData();
  } catch (e) {
    console.error("Error in PlaylistSingle:", e);
    error.value = e.message || "An unexpected error occurred. Please try again.";
  }
});
</script>

<template>
  <main>
    <h1 class="h2 pb-4">{{ playlistName }}</h1>
    <div class="mb-4">
      <a href="#" @click.prevent="handleClearCache" class="text-blue-500 hover:underline">
        Clear cache and reload playlist
      </a>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading playlist...
    </p>

    <p class="text-lg mb-6">Total unique albums: {{ totalAlbums }}</p>
    <p v-if="tokenLoading || loading" class="loading-message">Loading...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <template v-else-if="albumData.length">
      <ul class="album-list">
        <AlbumItem v-for="album in albumData" :key="album.id" :album="album" />
      </ul>
    </template>
    <p v-else class="no-data-message">No albums found in this playlist.</p>
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
.album-list {
  @apply flex flex-wrap gap-4;
}
</style>
