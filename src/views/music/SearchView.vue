<template>
  <BaseLayout>
    <h1 class="h2 pb-4">Search</h1>
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex items-center gap-2">
        <input
          ref="searchInput"
          v-model="searchTerm"
          @input="onSearch"
          type="text"
          placeholder="Search for albums or artists"
          class="flex-1 px-4 py-2 border-2 border-delft-blue rounded focus:outline-none focus:ring-2 focus:ring-mindero text-lg"
        />
        <button
          v-if="searchTerm || filters.albums || filters.artists"
          @click="resetSearch"
          class="p-2 text-delft-blue hover:text-raspberry transition-colors"
          aria-label="Reset search"
        >
          <XMarkIcon class="w-6 h-6" />
        </button>
      </div>
      <div v-if="searchTerm" class="flex gap-2">
        <button
          :class="filters.albums ? activeFilterClass : inactiveFilterClass"
          @click="toggleFilter('albums')"
        >Albums</button>
        <button
          :class="filters.artists ? activeFilterClass : inactiveFilterClass"
          @click="toggleFilter('artists')"
        >Artists</button>
      </div>
    </div>
    <div v-if="loading" class="text-center text-delft-blue py-8">Loading...</div>
    <div v-else-if="error" class="text-center text-raspberry py-8">{{ error }}</div>
    <div v-else>
      <div v-if="filteredResults.length === 0" class="text-center text-gray-500 py-8">No results found.</div>
      <ul class="album-grid">
        <AlbumItem
          v-for="album in filteredResults"
          :key="album.id"
          :album="album"
          :rating-data="ratingDataMap[album.id]"
          :pipeline-position="positionDataMap[album.id]?.pipelinePosition ?? null"
          :total-positions="positionDataMap[album.id]?.totalPositions ?? null"
        />
      </ul>
    </div>
  </BaseLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import BaseLayout from '@components/common/BaseLayout.vue';
import AlbumItem from '@/components/AlbumItem.vue';
import { useAlbumsData } from '@/composables/useAlbumsData';
import { usePlaylistData } from '@/composables/usePlaylistData';
import { useUserData } from '@/composables/useUserData';
import { setCache, getCache } from "@utils/cache";

const searchTerm = ref('');
const searchInput = ref(null);
const filters = ref({ albums: false, artists: false });
const results = ref([]);
const resultTypes = ref({}); // Track which search type each result came from
const ratingDataMap = ref({});
const positionDataMap = ref({});
const albumDbDataMap = ref({});
const albumRootDataMap = ref({});
const loading = ref(false);
const error = ref(null);

const activeFilterClass =
  'px-4 py-2 rounded-full bg-delft-blue text-mindero font-medium hover:bg-raspberry transition-colors duration-200';
const inactiveFilterClass =
  'px-[14px] py-[6px] rounded-full bg-white text-delft-blue border-2 border-delft-blue font-medium hover:bg-mint transition-colors duration-200';

const { searchAlbumsByTitlePrefix, searchAlbumsByArtistPrefix, getAlbumRatingData, fetchAlbumsData, getAlbumDetails } = useAlbumsData();
const { playlists: userPlaylists, fetchUserPlaylists } = usePlaylistData();
const { user } = useUserData();

const toggleFilter = (filterType) => {
  filters.value[filterType] = !filters.value[filterType];
};

const resetSearch = () => {
  searchTerm.value = '';
  filters.value = { albums: false, artists: false };
  results.value = [];
  resultTypes.value = {};
  ratingDataMap.value = {};
  positionDataMap.value = {};
  albumDbDataMap.value = {};
  albumRootDataMap.value = {};
  // Focus the input after resetting
  if (searchInput.value) {
    searchInput.value.focus();
  }
};

// Filter displayed results based on active toggles
const filteredResults = computed(() => {
  // If both are off, show nothing (visibility toggle behavior)
  if (!filters.value.albums && !filters.value.artists) {
    return [];
  }
  return results.value.filter(album => {
    const resultType = resultTypes.value[album.id];
    if (resultType === 'album' && filters.value.albums) return true;
    if (resultType === 'artist' && filters.value.artists) return true;
    return false;
  });
});

// Add a cache utility for album root details
async function getCachedAlbumDetails(albumId) {
  const cacheKey = `albumRootData_${albumId}`;
  let cached = await getCache(cacheKey);
  if (cached) return cached;
  const details = await getAlbumDetails(albumId);
  if (details) await setCache(cacheKey, details);
  return details;
}

// Fetch user playlists on mount to get position data
onMounted(async () => {
  if (user.value) {
    await fetchUserPlaylists(user.value.uid);
  }
});

const onSearch = async () => {
  if (!searchTerm.value.trim() || searchTerm.value.trim().length < 2) {
    results.value = [];
    resultTypes.value = {};
    filters.value = { albums: false, artists: false };
    ratingDataMap.value = {};
    positionDataMap.value = {};
    albumDbDataMap.value = {};
    albumRootDataMap.value = {};
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    // Always search both, regardless of filter state
    const [albumResults, artistResults] = await Promise.all([
      searchAlbumsByTitlePrefix(searchTerm.value.trim()),
      searchAlbumsByArtistPrefix(searchTerm.value.trim())
    ]);
    
    // Combine results from both searches, removing duplicates
    const combinedResults = [];
    const seenIds = new Set();
    const newResultTypes = {};
    
    // Track album results
    albumResults.forEach(album => {
      if (album && album.id && !seenIds.has(album.id)) {
        seenIds.add(album.id);
        combinedResults.push(album);
        newResultTypes[album.id] = 'album';
      }
    });
    
    // Track artist results
    artistResults.forEach(album => {
      if (album && album.id && !seenIds.has(album.id)) {
        seenIds.add(album.id);
        combinedResults.push(album);
        newResultTypes[album.id] = 'artist';
      }
    });
    
    results.value = combinedResults;
    resultTypes.value = newResultTypes;
    
    // Enable filters based on what we found
    filters.value.albums = albumResults.length > 0;
    filters.value.artists = artistResults.length > 0;
    // Batch fetch user album data and root details
    albumDbDataMap.value = await fetchAlbumsData(results.value.map(album => album.id));
    const rootDetailsArr = await Promise.all(results.value.map(album => getCachedAlbumDetails(album.id)));
    albumRootDataMap.value = Object.fromEntries(results.value.map((album, i) => [album.id, rootDetailsArr[i]]));
    // Use the batch data for ratingData and position data
    ratingDataMap.value = {};
    positionDataMap.value = {};
    results.value.forEach((album) => {
      const userData = albumDbDataMap.value[album.id];
      if (userData && userData.playlistHistory) {
        const currentEntry = userData.playlistHistory.find(entry => !entry.removedAt);
        if (currentEntry) {
          ratingDataMap.value[album.id] = {
            pipelineRole: currentEntry.pipelineRole || 'transient',
            type: currentEntry.type,
            playlistId: currentEntry.playlistId
          };
          
          // Find the playlist in userPlaylists to get position data
          if (currentEntry.playlistId && userPlaylists.value) {
            // Search through all groups to find the playlist
            for (const group in userPlaylists.value) {
              const playlist = userPlaylists.value[group].find(
                p => p.playlistId === currentEntry.playlistId
              );
              if (playlist) {
                positionDataMap.value[album.id] = {
                  pipelinePosition: playlist.pipelinePosition,
                  totalPositions: playlist.totalPositions
                };
                break;
              }
            }
          }
        } else {
          ratingDataMap.value[album.id] = null;
        }
      } else {
        ratingDataMap.value[album.id] = null;
      }
    });
  } catch (e) {
    error.value = 'Failed to search. Please try again.';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
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
</style> 