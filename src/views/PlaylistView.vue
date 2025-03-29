<script setup>
import { ref, onMounted, computed, watchEffect } from "vue";
import { useToken } from "../utils/auth";
import { getPlaylist } from "../utils/api";
import { setCache, getCache, clearCache } from "../utils/cache";
import PlaylistItem from "../components/PlaylistItem.vue";
import { useUserData } from "../composables/useUserData";
import { usePlaylistData } from "../composables/usePlaylistData";

const { token, initializeToken } = useToken();
const { user, userData, loading: userLoading, error: userError, fetchUserData } = useUserData();
const { playlists: userPlaylists, loading: playlistsLoading, error: playlistsError, fetchUserPlaylists, getAvailableCategories } = usePlaylistData();

const loading = ref(true);
const error = ref(null);
const cacheCleared = ref(false);

const playlists = ref({
  new: {},
  known: {}
});

const playlistCategories = computed(() => {
  console.log('Computing playlistCategories, userData:', userData.value);
  if (!userData.value?.playlistOrder?.known) {
    console.log('No playlist order data available');
    return [];
  }
  console.log('Returning categories:', userData.value.playlistOrder.known);
  return userData.value.playlistOrder.known;
});

const availableCategories = computed(() => {
  console.log('Computing availableCategories, userPlaylists:', userPlaylists.value);
  if (!userPlaylists.value) return { new: [], known: [] };
  
  const categories = {
    new: getAvailableCategories('new'),
    known: getAvailableCategories('known')
  };
  console.log('Available categories:', categories);
  return categories;
});

const allPlaylistsLoaded = computed(() => {
  console.log('Computing allPlaylistsLoaded:', {
    availableCategories: availableCategories.value,
    userPlaylists: userPlaylists.value,
    spotifyPlaylists: playlists.value,
  });
  
  if (!userPlaylists.value) return false;
  
  // First check if we have any playlists to load
  const hasPlaylists = availableCategories.value.new.length > 0 || availableCategories.value.known.length > 0;
  if (!hasPlaylists) return true; // No playlists to load
  
  // Then check if all available playlists have been loaded from Spotify
  const newLoaded = availableCategories.value.new.every(category => 
    playlists.value.new[category]?.id != null
  );
  const knownLoaded = availableCategories.value.known.every(category => 
    playlists.value.known[category]?.id != null
  );
  
  console.log('Playlists loaded status:', { 
    hasPlaylists,
    newLoaded, 
    knownLoaded,
    newCategories: availableCategories.value.new,
    knownCategories: availableCategories.value.known
  });
  return newLoaded && knownLoaded;
});

const cacheKey = 'playlist_summaries';

// Watch for user data changes
watchEffect(() => {
  if (userData.value) {
    console.log('User data updated in watchEffect:', userData.value);
    // Here you can handle user data changes
    // For example, you might want to reload playlists or update the UI
  }
});

async function loadPlaylists() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;

  const cachedPlaylists = await getCache(cacheKey);

  if (cachedPlaylists) {
    console.log('Using cached playlists:', cachedPlaylists);
    playlists.value = cachedPlaylists;
    loading.value = false;
    return;
  }

  try {
    const playlistSummaries = { new: {}, known: {} };
    
    // Only load playlists for available categories
    for (const type of ['new', 'known']) {
      console.log(`Loading ${type} playlists...`);
      for (const category of availableCategories.value[type]) {
        console.log(`Processing category ${category} for ${type}`);
        const playlistId = userPlaylists.value[type][category]?.[0];
        console.log(`Found playlist ID for ${type}/${category}:`, playlistId);
        
        if (!playlistId) {
          console.warn(`Missing playlist ID for ${type} category: ${category}`);
          continue;
        }

        console.log(`Fetching Spotify data for ${type}/${category} (${playlistId})`);
        const playlist = await getPlaylist(playlistId);
        console.log(`Got Spotify data:`, playlist);
        
        playlistSummaries[type][category] = {
          id: playlist.id,
          name: playlist.name,
          images: playlist.images,
          tracks: { total: playlist.tracks.total }
        };
      }
    }

    console.log('Final playlist summaries:', playlistSummaries);
    playlists.value = playlistSummaries;
    await setCache(cacheKey, playlistSummaries);
  } catch (e) {
    console.error("Error loading playlists:", e);
    error.value = "Failed to load playlists. Please try again.";
  } finally {
    loading.value = false;
  }
}

async function handleClearCache() {
  await clearCache(cacheKey);
  cacheCleared.value = true;
  playlists.value = { new: {}, known: {} };
  await loadPlaylists();
}

onMounted(async () => {
  try {
    loading.value = true;
    console.log('PlaylistView mounted, user:', user.value);
    console.log('PlaylistView mounted, userData:', userData.value);
    
    await initializeToken();
    
    if (user.value) {
      if (!userData.value) {
        console.log('Attempting to fetch user data again...');
        await fetchUserData(user.value.uid);
      }
      
      await fetchUserPlaylists(user.value.uid);
      await loadPlaylists();
    }
    
    console.log('Final user data state:', userData.value);
  } catch (e) {
    console.error("Error in PlaylistView:", e);
    error.value = "An unexpected error occurred. Please try again.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main>
    <h1 class="h2 pb-4">Playlists</h1>
    <div class="mb-6">
      <a href="#" @click.prevent="handleClearCache" class="text-blue-500 hover:underline">
        Clear cache and reload playlists
      </a>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading playlists...
    </p>

    <p v-if="loading">Loading playlists...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <div v-else-if="allPlaylistsLoaded" class="flex gap-40">
      <ul v-for="type in ['new', 'known']" :key="type" class="flex flex-col gap-4">
        <PlaylistItem 
          v-for="category in availableCategories[type]" 
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
