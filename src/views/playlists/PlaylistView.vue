<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { setCache, getCache, clearCache, updatePlaylistInCache, removePlaylistFromCache } from "@utils/cache";
import PlaylistItem from "@components/PlaylistItem.vue";
import { useUserData } from "@composables/useUserData";
import { usePlaylistData } from "@composables/usePlaylistData";
import { usePlaylistUpdates } from "@composables/usePlaylistUpdates";
import { useRoute, RouterLink } from 'vue-router';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { PlusIcon, ArrowPathIcon } from '@heroicons/vue/24/solid'
import BaseButton from '@components/common/BaseButton.vue';
import ToggleSwitch from '@components/common/ToggleSwitch.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import DropdownMenu from '@components/common/DropdownMenu.vue';
import { logPlaylist } from '@utils/logger';

const { user, userData, fetchUserData } = useUserData();
const { playlists: userPlaylists, fetchUserPlaylists, getAvailableGroups } = usePlaylistData();
const { refreshSpecificPlaylists: refreshSpecificPlaylistsComposable } = usePlaylistUpdates();

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

  logPlaylist('loadPlaylists called');
  logPlaylist('availableGroups:', availableGroups.value);
  logPlaylist('userPlaylists:', userPlaylists.value);

  const cachedPlaylists = await getCache(cacheKey.value);

  if (cachedPlaylists) {
    logPlaylist('Using cached playlists:', cachedPlaylists);
    playlists.value = cachedPlaylists;
    loading.value = false;
    return;
  }

    try {
      logPlaylist('Starting loadPlaylists, availableGroups:', availableGroups.value);
      logPlaylist('userPlaylists data:', userPlaylists.value);
      
      const playlistSummaries = {};
      
      // Load all playlists for each group
      for (const group of availableGroups.value) {
        logPlaylist(`Loading ${group} playlists...`);
        
        // Collect all playlists for this group
        const allPlaylistsForGroup = [];
        const groupPlaylists = userPlaylists.value[group] || [];
        
        logPlaylist(`Group ${group} has ${groupPlaylists.length} playlists from userPlaylists`);
        
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

/**
 * Refresh specific playlists from Spotify without reloading everything
 * @param {string[]} spotifyPlaylistIds - Array of Spotify playlist IDs to refresh
 */
async function refreshSpecificPlaylists(spotifyPlaylistIds) {
  if (!user.value || !spotifyPlaylistIds || spotifyPlaylistIds.length === 0) return;
  
  const updatedState = await refreshSpecificPlaylistsComposable(
    spotifyPlaylistIds,
    playlists.value,
    cacheKey.value
  );
  
  // Update local state with refreshed playlists
  if (updatedState) {
    playlists.value = updatedState;
  }
}

/**
 * Optimistically remove a playlist from the UI and cache
 * @param {string} firebaseId - The Firebase document ID of the playlist to remove
 */
function removePlaylistFromState(firebaseId) {
  logPlaylist(`Optimistically removing playlist ${firebaseId} from state`);
  
  // Remove from local state
  let removed = false;
  for (const group in playlists.value) {
    if (Array.isArray(playlists.value[group])) {
      const initialLength = playlists.value[group].length;
      playlists.value[group] = playlists.value[group].filter(p => p.firebaseId !== firebaseId);
      if (playlists.value[group].length < initialLength) {
        removed = true;
      }
    }
  }
  
  if (removed) {
    logPlaylist(`Removed playlist ${firebaseId} from state`);
  }
}

async function handlePlaylistDeleted(firebaseId) {
  // Optimistic update: remove from UI immediately
  removePlaylistFromState(firebaseId);
  
  // Remove from cache
  if (cacheKey.value) {
    await removePlaylistFromCache(cacheKey.value, firebaseId);
  }
  
  // Refresh from Firestore (will filter out deleted playlists)
  if (user.value) {
    await fetchUserPlaylists(user.value.uid);
    // No need to reload from Spotify - we've already removed it optimistically
  }
}

// Listen for playlist updates from other views
const handlePlaylistsUpdated = (event) => {
  const { playlistIds } = event.detail;
  logPlaylist('Received playlists-updated event for:', playlistIds);
  
  if (playlistIds && playlistIds.length > 0) {
    // Refresh the affected playlists
    refreshSpecificPlaylists(playlistIds);
  }
};

onMounted(async () => {
  try {
    loading.value = true;
    logPlaylist('PlaylistView mounted, user:', user.value);
    
    // Listen for playlist updates from other views
    window.addEventListener('playlists-updated', handlePlaylistsUpdated);
    
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

// Clean up event listener on unmount
onUnmounted(() => {
  window.removeEventListener('playlists-updated', handlePlaylistsUpdated);
});
</script>

<template>
  <main class="pt-6">
    <div class="flex items-center justify-between pb-4">
      <h1 class="h2">Playlists</h1>
      <div class="flex items-center gap-4">
        <BaseButton variant="secondary" @click.prevent="handleClearCache" class="w-fit">
          <template #icon-left><ArrowPathIcon class="h-5 w-5" /></template>
        </BaseButton>
        <DropdownMenu aria-label="Playlist actions">
          <RouterLink
            to="/playlist/add"
            class="block px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors no-underline"
            role="menuitem"
          >
            <div class="flex items-center gap-2">
              <PlusIcon class="h-4 w-4" />
              <span>Add playlist</span>
            </div>
          </RouterLink>
          <RouterLink
            to="/playlist/management"
            class="block px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors no-underline"
            role="menuitem"
          >
            <div class="flex items-center gap-2">
              <PlusIcon class="h-4 w-4" />
              <span>Playlist Management</span>
            </div>
          </RouterLink>
        </DropdownMenu>
      </div>
    </div>
    <div class="flex items-center gap-3 mb-6">
      <ToggleSwitch v-model="showEndPlaylists" variant="primary-on-celadon" />
      <span class="text-delft-blue">Rating Playlists</span>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Reloading playlists...
    </p>

    <p v-if="loading">Loading playlists...</p>
    <ErrorMessage v-else-if="error" :message="error" />
    <div v-else-if="allPlaylistsLoaded && availableGroups.length > 0">
      <!-- Tab Navigation -->
      <div>
        <nav class="-mb-px flex space-x-2 ml-[20px]">
          <button
            v-for="group in availableGroups"
            :key="group"
            @click="activeTab = group"
            :class="[
              'py-3 px-4 font-semibold text-base capitalize rounded-t-lg transition-all duration-200',
              activeTab === group
                ? 'text-delft-blue bg-mint'
                : 'text-gray-600 hover:text-delft-blue hover:bg-mint'
            ]"
          >
            {{ group }} ({{ filteredPlaylists[group]?.length || 0 }})
          </button>
        </nav>
      </div>

      <!-- Tab Content -->
      <div v-if="currentPlaylists.length > 0" class="flex flex-col gap-4 bg-mint p-4 rounded-xl">
        <PlaylistItem 
          v-for="playlist in currentPlaylists"
          :key="playlist.id"
          :playlist="playlist"
          @playlist-deleted="handlePlaylistDeleted"
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
