<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { setCache, getCache, removePlaylistFromCache } from "@utils/cache";
import PlaylistItem from "@components/PlaylistItem.vue";
import { useUserData } from "@composables/useUserData";
import { usePlaylistData } from "@composables/usePlaylistData";
import { usePlaylistUpdates } from "@composables/usePlaylistUpdates";
import { useRoute, RouterLink } from 'vue-router';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { PlusIcon, ArrowPathIcon, SpeakerWaveIcon } from '@heroicons/vue/24/solid'
import BaseLayout from '@components/common/BaseLayout.vue';
import BaseButton from '@components/common/BaseButton.vue';
import ToggleSwitch from '@components/common/ToggleSwitch.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import DropdownMenu from '@components/common/DropdownMenu.vue';
import { logPlaylist } from '@utils/logger';

const { user, userData, fetchUserData } = useUserData();
const { playlists: userPlaylists, fetchUserPlaylists, getAvailableGroups } = usePlaylistData();
const { refreshSpecificPlaylists: refreshSpecificPlaylistsComposable } = usePlaylistUpdates();
const { playingFrom, isPlaying } = useSpotifyPlayer();

const route = useRoute();
const { getPlaylist} = useUserSpotifyApi();

const loading = ref(true);
const error = ref(null);
const loadingPipeline = ref(null);
const reloadingGroup = ref(null);
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


const activePipelineLoaded = computed(() => {
  if (!availableGroups.value.length) return false;
  const group = activeTab.value;
  if (!group) return false;
  const firestoreCount = (userPlaylists.value[group] || []).length;
  if (firestoreCount === 0) return true;
  const spotifyPlaylists = playlists.value[group] || [];
  return spotifyPlaylists.length > 0 && spotifyPlaylists.every(p => p.id != null);
});

function getTabCount(group) {
  const loaded = playlists.value[group];
  if (loaded?.length > 0) {
    return showEndPlaylists.value ? loaded.length : loaded.filter(p => p.pipelineRole !== 'sink').length;
  }
  return (userPlaylists.value[group] || []).length;
}

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

const hasTerminalPlaylist = computed(() => {
  return currentPlaylists.value.some(playlist => playlist.pipelineRole === 'terminal');
});

const isGroupPlaying = (group) => {
  if (!isPlaying.value || playingFrom.value?.type !== 'playlist') {
    return false;
  }
  const groupPlaylists = filteredPlaylists.value[group] || [];
  return groupPlaylists.some(playlist => playlist.id === playingFrom.value.id);
};

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

  logPlaylist('loadPlaylists called');
  logPlaylist('availableGroups:', availableGroups.value);
  logPlaylist('userPlaylists:', userPlaylists.value);

  const key = cacheKey.value;
  const cachedPlaylists = key ? getCache(key) : null;
  if (cachedPlaylists) {
    logPlaylist('Using cached playlists (may be partial)');
    playlists.value = cachedPlaylists;
  }
  const groupToLoad = activeTab.value || availableGroups.value[0];
  const needsLoad = groupToLoad && (userPlaylists.value[groupToLoad] || []).length > 0 && !(playlists.value[groupToLoad]?.length > 0);
  if (needsLoad) {
    try {
      logPlaylist(`Loading active pipeline only: ${groupToLoad}`);
      const summaries = await loadPipelinePlaylists(groupToLoad);
      playlists.value = { ...playlists.value, [groupToLoad]: summaries };
      await setCache(cacheKey.value, playlists.value);
    } catch (e) {
      logPlaylist('Error loading playlists:', e);
      if (e.name === 'QuotaExceededError' || e.message?.includes('quota') || e.message?.includes('QuotaExceededError')) {
        error.value = "Browser storage is full. Please go to Account > Cache Management to clear some cache data.";
      } else {
        error.value = "Failed to load playlists. Please try again.";
      }
    }
  }
  loading.value = false;
}

/**
 * Load Spotify data for a single pipeline (group). Returns array of playlist summaries.
 */
async function loadPipelinePlaylists(group) {
  const groupPlaylists = userPlaylists.value[group] || [];
  const allPlaylistsForGroup = [];
  for (const playlistData of groupPlaylists) {
    if (!playlistData?.playlistId) continue;
    try {
      const playlist = await getPlaylist(playlistData.playlistId);
      allPlaylistsForGroup.push({
        id: playlist.id,
        firebaseId: playlistData.firebaseId,
        name: playlist.name,
        images: playlist.images,
        tracks: { total: playlist.tracks.total },
        pipelinePosition: playlistData.pipelinePosition,
        totalPositions: playlistData.totalPositions,
        pipelineRole: playlistData.pipelineRole || 'transient'
      });
    } catch (playlistError) {
      logPlaylist(`Failed to load playlist ${playlistData.playlistId} for ${group}:`, playlistError);
      allPlaylistsForGroup.push({
        id: playlistData.playlistId,
        firebaseId: playlistData.firebaseId,
        name: `${group} playlist`,
        images: [],
        tracks: { total: 0 },
        pipelinePosition: playlistData.pipelinePosition,
        totalPositions: playlistData.totalPositions,
        pipelineRole: playlistData.pipelineRole || 'transient'
      });
    }
  }
  return allPlaylistsForGroup;
}

// When user switches tab, load that pipeline if not yet loaded
watch(activeTab, async (newTab) => {
  if (!newTab || !cacheKey.value) return;
  const groupPlaylists = userPlaylists.value[newTab] || [];
  if (groupPlaylists.length === 0) return;
  const alreadyLoaded = (playlists.value[newTab] || []).length > 0;
  if (alreadyLoaded) return;
  logPlaylist(`Lazy-loading pipeline: ${newTab}`);
  loadingPipeline.value = newTab;
  try {
    const summaries = await loadPipelinePlaylists(newTab);
    if (summaries) {
      playlists.value = { ...playlists.value, [newTab]: summaries };
      await setCache(cacheKey.value, playlists.value);
    }
  } finally {
    loadingPipeline.value = null;
  }
});

async function reloadPipeline(group) {
  if (!group || !cacheKey.value) return;
  reloadingGroup.value = group;
  try {
    const summaries = await loadPipelinePlaylists(group);
    playlists.value = { ...playlists.value, [group]: summaries };
    await setCache(cacheKey.value, playlists.value);
  } catch (e) {
    logPlaylist('Error reloading pipeline:', e);
    error.value = "Failed to reload pipeline. Please try again.";
  } finally {
    reloadingGroup.value = null;
  }
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
  <BaseLayout>
    <div class="flex items-center justify-between pb-4">
      <h1 class="h2">Playlists</h1>
      <div class="flex items-center gap-4">
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
          <RouterLink
            to="/playlist/add-album"
            class="block px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors no-underline"
            role="menuitem"
          >
            <div class="flex items-center gap-2">
              <PlusIcon class="h-4 w-4" />
              <span>Add Album to Playlist</span>
            </div>
          </RouterLink>
        </DropdownMenu>
      </div>
    </div>
    <div class="flex items-center gap-3 mb-6">
      <ToggleSwitch v-model="showEndPlaylists" variant="primary-on-celadon" />
      <span class="text-delft-blue">Rating Playlists</span>
    </div>

    <p v-if="loading">Loading playlists...</p>
    <ErrorMessage v-else-if="error" :message="error" />
    <div v-else-if="availableGroups.length > 0 && (activePipelineLoaded || loadingPipeline === activeTab)">
      <!-- Tab Navigation -->
      <div>
        <nav class="-mb-px flex space-x-2 ml-[20px]">
          <button
            v-for="group in availableGroups"
            :key="group"
            @click="activeTab = group"
            :class="[
              'py-3 px-4 font-semibold text-base capitalize rounded-t-lg transition-all duration-200 flex items-center gap-2',
              activeTab === group
                ? 'text-delft-blue bg-mint'
                : 'text-gray-600 hover:text-delft-blue hover:bg-mint'
            ]"
          >
            <span>{{ group }} ({{ getTabCount(group) }})</span>
            <SpeakerWaveIcon 
              v-if="isGroupPlaying(group)"
              class="w-4 h-4 text-delft-blue"
            />
          </button>
        </nav>
      </div>

      <!-- Tab Content -->
      <div v-if="currentPlaylists.length > 0" class="flex flex-col gap-4 bg-mint p-4 rounded-xl w-full md:w-3/4 lg:w-1/2">
        <div class="flex justify-end">
          <BaseButton
            variant="secondary"
            class="w-fit"
            :disabled="reloadingGroup === activeTab || loadingPipeline === activeTab"
            @click="reloadPipeline(activeTab)"
            :aria-label="`Reload ${activeTab}`"
          >
            <template #icon-left>
              <ArrowPathIcon :class="['h-5 w-5', reloadingGroup === activeTab && 'animate-spin']" />
            </template>
            {{ reloadingGroup === activeTab ? 'Reloading…' : 'Reload' }}
          </BaseButton>
        </div>
        <PlaylistItem 
          v-for="playlist in currentPlaylists"
          :key="playlist.id"
          :playlist="playlist"
          @playlist-deleted="handlePlaylistDeleted"
        />
        <RouterLink
          v-if="!hasTerminalPlaylist && loadingPipeline !== activeTab"
          :to="{ path: '/playlist/add', query: { group: activeTab } }"
          class="w-fit self-start no-underline"
        >
          <BaseButton variant="tertiary">
            <template #icon-left><PlusIcon class="h-5 w-5" /></template>
            Add playlist
          </BaseButton>
        </RouterLink>
      </div>
      <div v-else class="flex flex-col gap-4 bg-mint p-4 rounded-xl w-full md:w-3/4 lg:w-1/2">
        <div class="flex justify-end">
          <BaseButton
            variant="secondary"
            class="w-fit"
            :disabled="reloadingGroup === activeTab || loadingPipeline === activeTab"
            @click="reloadPipeline(activeTab)"
            :aria-label="`Reload ${activeTab}`"
          >
            <template #icon-left>
              <ArrowPathIcon :class="['h-5 w-5', reloadingGroup === activeTab && 'animate-spin']" />
            </template>
            {{ reloadingGroup === activeTab ? 'Reloading…' : 'Reload' }}
          </BaseButton>
        </div>
        <div v-if="loadingPipeline === activeTab" class="flex flex-col items-center gap-2 py-8" aria-label="Loading">
          <div class="animate-spin rounded-full h-8 w-8 border-2 border-delft-blue border-t-transparent" aria-hidden="true"></div>
          <span class="text-gray-500">Loading</span>
        </div>
        <p v-else class="text-gray-500 text-center py-8">
          No {{ activeTab }} playlists available.
        </p>
        <RouterLink
          v-if="!hasTerminalPlaylist && loadingPipeline !== activeTab"
          :to="{ path: '/playlist/add', query: { group: activeTab } }"
          class="w-fit self-start no-underline"
        >
          <BaseButton variant="tertiary">
            <template #icon-left><PlusIcon class="h-5 w-5" /></template>
            Add playlist
          </BaseButton>
        </RouterLink>
      </div>
    </div>
    <p v-else-if="availableGroups.length === 0" class="text-gray-500 text-center py-8">
      No playlists available.
    </p>
  </BaseLayout>
</template>

<style scoped>
</style>
