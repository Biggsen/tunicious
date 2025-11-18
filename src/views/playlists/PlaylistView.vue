<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { setCache, getCache, clearCache } from "@utils/cache";
import PlaylistItem from "@components/PlaylistItem.vue";
import { useUserData } from "@composables/useUserData";
import { usePlaylistData } from "@composables/usePlaylistData";
import { useRoute, RouterLink } from 'vue-router';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { PlusIcon, ArrowPathIcon, EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/solid'
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import { logPlaylist } from '@utils/logger';

const { user, userData, fetchUserData } = useUserData();
const { playlists: userPlaylists, fetchUserPlaylists, getAvailableGroups } = usePlaylistData();

const route = useRoute();
const { getPlaylist} = useUserSpotifyApi();

const loading = ref(true);
const error = ref(null);
const cacheCleared = ref(false);
const showEndPlaylists = ref(sessionStorage.getItem('showEndPlaylists') !== 'false');

// Dynamic active tab - will be set to first available group
const activeTab = ref(sessionStorage.getItem('activeTab') || '');

// Dynamic playlists structure
const playlists = ref({});

const cacheKey = computed(() => user.value ? `playlist_summaries_${user.value.uid}` : null);

// Get available groups dynamically
const availableGroups = computed(() => {
  return getAvailableGroups();
});

// Set active tab to first available group if not set
const initializeActiveTab = () => {
  if (!activeTab.value && availableGroups.value.length > 0) {
    activeTab.value = availableGroups.value[0];
    sessionStorage.setItem('activeTab', activeTab.value);
  }
};


const allPlaylistsLoaded = computed(() => {
  logPlaylist('Computing allPlaylistsLoaded:', {
    availableGroups: availableGroups.value,
    userPlaylists: userPlaylists.value,
    spotifyPlaylists: playlists.value,
  });
  
  if (!userPlaylists.value || availableGroups.value.length === 0) return false;
  
  // Check if all available groups have been loaded from Spotify
  const allGroupsLoaded = availableGroups.value.every(group => {
    const groupPlaylists = playlists.value[group] || [];
      // A group is considered loaded if it has playlists in the userPlaylists data
      const hasPlaylistsInData = (userPlaylists.value[group] || []).length > 0;
    
    if (!hasPlaylistsInData) {
      // If no playlists in data, consider it loaded
      return true;
    }
    
    // If there are playlists in data, check if they've been loaded from Spotify
    return groupPlaylists.length > 0 && groupPlaylists.every(p => p.id != null);
  });
  
  logPlaylist('Playlists loaded status:', { 
    availableGroups: availableGroups.value,
    allGroupsLoaded
  });
  return allGroupsLoaded;
});

const filteredPlaylists = computed(() => {
  if (showEndPlaylists.value) {
    return playlists.value;
  }
  
  const filtered = {};
  availableGroups.value.forEach(group => {
    filtered[group] = (playlists.value[group] || []).filter(p => 
      p.pipelineRole !== 'sink'
    );
  });
  return filtered;
});

const currentPlaylists = computed(() => {
  const playlists = filteredPlaylists.value[activeTab.value] || [];
  logPlaylist(`Current playlists for ${activeTab.value}:`, playlists);
  return playlists;
});

// Watch for changes to showEndPlaylists and update session storage
watch(showEndPlaylists, (newValue) => {
  sessionStorage.setItem('showEndPlaylists', newValue);
});

// Watch for changes to activeTab and update session storage
watch(activeTab, (newValue) => {
  if (newValue) {
    sessionStorage.setItem('activeTab', newValue);
  }
});

// Watch for changes to available groups and initialize active tab
watch(availableGroups, () => {
  initializeActiveTab();
}, { immediate: true });

async function loadPlaylists() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;

  const cachedPlaylists = await getCache(cacheKey.value);

  if (cachedPlaylists) {
    logPlaylist('Using cached playlists:', cachedPlaylists);
    playlists.value = cachedPlaylists;
    loading.value = false;
    return;
  }

  try {
    const playlistSummaries = {};
    
    // Load all playlists for each group
    for (const group of availableGroups.value) {
      logPlaylist(`Loading ${group} playlists...`);
      
      // Collect all playlists for this group
      const allPlaylistsForGroup = [];
      const groupPlaylists = userPlaylists.value[group] || [];
      
      for (const playlistData of groupPlaylists) {
        if (!playlistData?.playlistId) {
          logPlaylist(`Missing playlist data for ${group}:`, playlistData);
          continue;
        }

        try {
          logPlaylist(`Fetching Spotify data for ${group} (${playlistData.playlistId})`);
          const playlist = await getPlaylist(playlistData.playlistId);
          logPlaylist(`Got Spotify data:`, playlist);
          
          allPlaylistsForGroup.push({
            id: playlist.id, // Spotify playlist ID
            firebaseId: playlistData.firebaseId, // Firebase document ID
            name: playlist.name,
            images: playlist.images,
            tracks: { total: playlist.tracks.total },
            priority: playlistData.priority,
            pipelineRole: playlistData.pipelineRole || 'transient' // Include pipeline role from Firebase data
          });
        } catch (playlistError) {
          logPlaylist(`Failed to load playlist ${playlistData.playlistId} for ${group}:`, playlistError);
          // Still add the playlist with basic data even if Spotify API fails
          allPlaylistsForGroup.push({
            id: playlistData.playlistId, // Use the playlistId as fallback
            firebaseId: playlistData.firebaseId,
            name: playlistData.name || `${group} playlist`, // Fallback name
            images: [],
            tracks: { total: 0 }, // Assume empty if we can't get data
            priority: playlistData.priority,
            pipelineRole: playlistData.pipelineRole || 'transient' // Include pipeline role from Firebase data
          });
        }
      }
      
      // Sort all playlists by priority
      playlistSummaries[group] = allPlaylistsForGroup.sort((a, b) => a.priority - b.priority);
    }

    logPlaylist('Final playlist summaries:', playlistSummaries);
    playlists.value = playlistSummaries;
    await setCache(cacheKey.value, playlistSummaries);
  } catch (e) {
    logPlaylist("Error loading playlists:", e);
    if (e.name === 'QuotaExceededError' || e.message?.includes('quota') || e.message?.includes('QuotaExceededError')) {
      error.value = "Browser storage is full. Please go to Account > Cache Management to clear some cache data, then try again.";
    } else {
      error.value = "Failed to load playlists. Please try again.";
    }
  } finally {
    loading.value = false;
  }
}

async function handleClearCache() {
  await clearCache(cacheKey.value);
  cacheCleared.value = true;
  playlists.value = {};
  await loadPlaylists();
}

onMounted(async () => {
  try {
    loading.value = true;
    logPlaylist('PlaylistView mounted, user:', user.value);
    
    if (user.value) {
      if (!userData.value) {
        logPlaylist('Attempting to fetch user data again...');
        await fetchUserData(user.value.uid);
      }
      
      await fetchUserPlaylists(user.value.uid);
      await loadPlaylists();
    }
    
  } catch (e) {
    logPlaylist("Error in PlaylistView:", e);
    if (e.name === 'QuotaExceededError' || e.message?.includes('quota') || e.message?.includes('QuotaExceededError')) {
      error.value = "Browser storage is full. Please go to Account > Cache Management to clear some cache data, then try again.";
    } else {
      error.value = "An unexpected error occurred. Please try again.";
    }
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="pt-6">
    <h1 class="h2 pb-4">Playlists</h1>
    <div class="flex gap-4 mb-6">
      <RouterLink to="/playlist/add" class="no-underline">
        <BaseButton variant="secondary">
          <template #icon-left><PlusIcon class="h-5 w-5" /></template>
          Add playlist
        </BaseButton>
      </RouterLink>
      <RouterLink to="/playlist/management" class="no-underline">
        <BaseButton variant="secondary">
          <template #icon-left><PlusIcon class="h-5 w-5" /></template>
          Playlist Management
        </BaseButton>
      </RouterLink>
      <BaseButton variant="secondary" @click.prevent="handleClearCache">
        <template #icon-left><ArrowPathIcon class="h-5 w-5" /></template>
        Reload
      </BaseButton>
      <BaseButton variant="secondary" @click="showEndPlaylists = !showEndPlaylists">
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
    <div v-else-if="allPlaylistsLoaded && availableGroups.length > 0">
      <!-- Tab Navigation -->
      <div class="mb-6 border-b border-gray-600">
        <nav class="-mb-px flex space-x-8">
          <button
            v-for="group in availableGroups"
            :key="group"
            @click="activeTab = group"
            :class="[
              'py-3 px-4 border-b-2 font-semibold text-sm capitalize rounded-t-lg transition-all duration-200',
              activeTab === group
                ? 'border-delft-blue text-delft-blue bg-white shadow-sm'
                : 'border-transparent text-gray-600 hover:text-delft-blue hover:border-gray-300 hover:bg-gray-50'
            ]"
          >
            {{ group }} ({{ filteredPlaylists[group]?.length || 0 }})
          </button>
        </nav>
      </div>

      <!-- Tab Content -->
      <div v-if="currentPlaylists.length > 0" class="flex flex-col gap-4">
        <PlaylistItem 
          v-for="playlist in currentPlaylists"
          :key="playlist.id"
          :playlist="playlist"
        />
      </div>
      <p v-else class="text-gray-500 text-center py-8">
        No {{ activeTab }} playlists available.
      </p>
    </div>
    <p v-else-if="availableGroups.length === 0" class="text-gray-500 text-center py-8">
      No playlists available.
    </p>
  </main>
</template>

<style scoped>
</style>
