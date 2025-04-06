<script setup>
import { ref, onMounted, computed, watch } from "vue";
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
const showEndPlaylists = ref(sessionStorage.getItem('showEndPlaylists') !== 'false');

const playlists = ref({
  new: [],
  known: []
});

const cacheKey = computed(() => user.value ? `playlist_summaries_${user.value.uid}` : null);

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
  const newLoaded = playlists.value.new.length > 0 && 
    playlists.value.new.every(p => p.id != null);
  const knownLoaded = playlists.value.known.length > 0 && 
    playlists.value.known.every(p => p.id != null);
  
  console.log('Playlists loaded status:', { 
    hasPlaylists,
    newLoaded, 
    knownLoaded,
    newCategories: availableCategories.value.new,
    knownCategories: availableCategories.value.known
  });
  return newLoaded && knownLoaded;
});

const filteredPlaylists = computed(() => {
  if (showEndPlaylists.value) {
    return playlists.value;
  }
  return {
    new: playlists.value.new.filter(p => p.category !== 'end'),
    known: playlists.value.known.filter(p => p.category !== 'end')
  };
});

// Watch for changes to showEndPlaylists and update session storage
watch(showEndPlaylists, (newValue) => {
  sessionStorage.setItem('showEndPlaylists', newValue);
});

async function loadPlaylists() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;

  const cachedPlaylists = await getCache(cacheKey.value);

  if (cachedPlaylists) {
    console.log('Using cached playlists:', cachedPlaylists);
    playlists.value = cachedPlaylists;
    loading.value = false;
    return;
  }

  try {
    const playlistSummaries = { new: [], known: [] };
    
    // Load all playlists for each type
    for (const type of ['new', 'known']) {
      console.log(`Loading ${type} playlists...`);
      
      // Collect all playlists for this type
      const allPlaylistsForType = [];
      for (const category of availableCategories.value[type]) {
        const categoryPlaylists = userPlaylists.value[type][category] || [];
        for (const playlistData of categoryPlaylists) {
          if (!playlistData?.playlistId) {
            console.warn(`Missing playlist data for ${type} category: ${category}`);
            continue;
          }

          console.log(`Fetching Spotify data for ${type}/${category} (${playlistData.playlistId})`);
          const playlist = await getPlaylist(playlistData.playlistId);
          console.log(`Got Spotify data:`, playlist);
          
          allPlaylistsForType.push({
            id: playlist.id,
            name: playlist.name,
            images: playlist.images,
            tracks: { total: playlist.tracks.total },
            priority: playlistData.priority,
            category: category
          });
        }
      }
      
      // Sort all playlists by priority
      playlistSummaries[type] = allPlaylistsForType.sort((a, b) => a.priority - b.priority);
    }

    console.log('Final playlist summaries:', playlistSummaries);
    playlists.value = playlistSummaries;
    await setCache(cacheKey.value, playlistSummaries);
  } catch (e) {
    console.error("Error loading playlists:", e);
    error.value = "Failed to load playlists. Please try again.";
  } finally {
    loading.value = false;
  }
}

async function handleClearCache() {
  await clearCache(cacheKey.value);
  cacheCleared.value = true;
  playlists.value = { new: [], known: [] };
  await loadPlaylists();
}

onMounted(async () => {
  try {
    loading.value = true;
    console.log('PlaylistView mounted, user:', user.value);
    
    await initializeToken();
    
    if (user.value) {
      if (!userData.value) {
        console.log('Attempting to fetch user data again...');
        await fetchUserData(user.value.uid);
      }
      
      await fetchUserPlaylists(user.value.uid);
      await loadPlaylists();
    }
    
  } catch (e) {
    console.error("Error in PlaylistView:", e);
    error.value = "An unexpected error occurred. Please try again.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <RouterLink to="/" class="text-blue-500 hover:underline">&larr; Back to Home</RouterLink>
    </div>
    <h1 class="h2 pb-4">Playlists</h1>
    <div class="flex gap-4 mb-6">
      <RouterLink 
        to="/playlist/add" 
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
        </svg>
        Add playlist
      </RouterLink>
      <button 
        @click.prevent="handleClearCache" 
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
        </svg>
        Reload
      </button>
      <button 
        @click="showEndPlaylists = !showEndPlaylists" 
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
      >
        <svg v-if="showEndPlaylists" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd" />
          <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
        </svg>
        <span v-if="showEndPlaylists">Hide</span>
        <span v-else>Show</span>
        end playlists
      </button>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Reloading playlists...
    </p>

    <p v-if="loading">Loading playlists...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <div v-else-if="allPlaylistsLoaded" class="flex gap-8">
      <ul v-for="type in ['new', 'known']" :key="type" class="flex flex-col gap-4 w-1/2">
        <template v-for="playlist in filteredPlaylists[type]" :key="playlist.id">
          <PlaylistItem 
            :playlist="playlist"
            :category="playlist.category"
          />
        </template>
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
