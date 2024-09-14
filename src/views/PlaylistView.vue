<script setup>
import { ref, onMounted, computed } from "vue";
import { useToken } from "../utils/auth";
import { getPlaylist } from "../utils/api";
import PlaylistItem from "../components/PlaylistItem.vue";
import { playlistIds } from "../constants";

const { token, initializeToken } = useToken();
const loading = ref(true);
const error = ref(null);

const playlists = ref({
  new: {},
  known: {}
});

const playlistCategories = ['queued', 'curious', 'interested', 'great', 'excellent', 'wonderful'];

const allPlaylistsLoaded = computed(() => 
  playlistCategories.every(category => 
    playlists.value.new[category] && playlists.value.known[category]
  )
);

async function loadPlaylists() {
  try {
    for (const category of playlistCategories) {
      const [newPlaylist, knownPlaylist] = await Promise.all([
        getPlaylist(playlistIds.new[category]),
        getPlaylist(playlistIds.known[category])
      ]);
      playlists.value.new[category] = newPlaylist;
      playlists.value.known[category] = knownPlaylist;
    }
  } catch (e) {
    console.error("Error loading playlists:", e);
    error.value = "Failed to load playlists. Please try again.";
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    await initializeToken();
    await loadPlaylists();
  } catch (e) {
    console.error("Error in PlaylistView:", e);
    error.value = "An unexpected error occurred. Please try again.";
    loading.value = false;
  }
});
</script>

<template>
  <main>
    <h1 class="h2 pb-10">Playlists</h1>
    <p v-if="loading">Loading playlists...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <div v-else-if="allPlaylistsLoaded" class="flex gap-40">
      <ul v-for="type in ['new', 'known']" :key="type" class="flex flex-col gap-4">
        <PlaylistItem 
          v-for="category in playlistCategories" 
          :key="`${type}-${category}`"
          :playlist="playlists[type][category]" 
        />
      </ul>
    </div>
    <p v-else>No playlists available.</p>
  </main>
</template>

<style scoped>
.error-message {
  color: red;
  font-weight: bold;
}
</style>
