<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { setCache, getCache, clearCache } from "@utils/cache";
import PlaylistItem from "@components/PlaylistItem.vue";
import { useUserData } from "@composables/useUserData";
import { usePlaylistData } from "@composables/usePlaylistData";
import BackButton from '@components/common/BackButton.vue';
import { useRoute } from 'vue-router';
import { useSpotifyApi } from '@composables/useSpotifyApi';
import { PlusIcon, ArrowPathIcon, EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/solid'
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const { user, userData, fetchUserData } = useUserData();
const { playlists: userPlaylists, fetchUserPlaylists, getAvailableCategories } = usePlaylistData();

const route = useRoute();
const { getPlaylist} = useSpotifyApi();

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
      <BackButton to="/" text="Back to Home" />
    </div>
    <h1 class="h2 pb-4">Playlists</h1>
    <div class="flex gap-4 mb-6">
      <RouterLink 
        to="/playlist/add" 
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
      >
        <PlusIcon class="h-5 w-5" />
        Add playlist
      </RouterLink>
      <BaseButton @click.prevent="handleClearCache">
        <template #icon-left><ArrowPathIcon class="h-5 w-5" /></template>
        Reload
      </BaseButton>
      <BaseButton @click="showEndPlaylists = !showEndPlaylists">
        <template #icon-left>
          <EyeSlashIcon v-if="showEndPlaylists" class="h-5 w-5" />
          <EyeIcon v-else class="h-5 w-5" />
        </template>
        <span v-if="showEndPlaylists">Hide</span>
        <span v-else>Show</span>
        end playlists
      </BaseButton>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Reloading playlists...
    </p>

    <p v-if="loading">Loading playlists...</p>
    <ErrorMessage v-else-if="error" :message="error" />
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
</style>
