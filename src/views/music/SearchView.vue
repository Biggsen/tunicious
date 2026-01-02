<template>
  <BaseLayout>
    <h1 class="h2 pb-4">Search</h1>
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex items-center gap-2">
        <input
          v-model="searchTerm"
          @input="onSearch"
          type="text"
          placeholder="Search albums or artists..."
          class="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-mindero text-lg"
        />
        <div class="flex gap-1 ml-2">
          <button
            :class="filter === 'albums' ? activeFilterClass : inactiveFilterClass"
            @click="setFilter('albums')"
          >Albums</button>
          <button
            :class="filter === 'artists' ? activeFilterClass : inactiveFilterClass"
            @click="setFilter('artists')"
          >Artists</button>
        </div>
      </div>
    </div>
    <div v-if="loading" class="text-center text-delft-blue py-8">Loading...</div>
    <div v-else-if="error" class="text-center text-raspberry py-8">{{ error }}</div>
    <div v-else>
      <div v-if="results.length === 0" class="text-center text-gray-500 py-8">No results found.</div>
      <ul class="album-grid">
        <AlbumItem
          v-for="album in results"
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
import { ref, onMounted } from 'vue';
import BaseLayout from '@components/common/BaseLayout.vue';
import AlbumItem from '@/components/AlbumItem.vue';
import { useAlbumsData } from '@/composables/useAlbumsData';
import { usePlaylistData } from '@/composables/usePlaylistData';
import { useUserData } from '@/composables/useUserData';
import { setCache, getCache } from "@utils/cache";

const searchTerm = ref('');
const filter = ref('albums'); // 'albums' or 'artists'
const results = ref([]);
const ratingDataMap = ref({});
const positionDataMap = ref({});
const albumDbDataMap = ref({});
const albumRootDataMap = ref({});
const loading = ref(false);
const error = ref(null);

const activeFilterClass =
  'px-3 py-2 rounded bg-mindero text-delft-blue font-bold shadow';
const inactiveFilterClass =
  'px-3 py-2 rounded bg-gray-100 text-gray-500 hover:bg-celadon';

const { searchAlbumsByTitlePrefix, searchAlbumsByArtistPrefix, getAlbumRatingData, fetchAlbumsData, getAlbumDetails } = useAlbumsData();
const { playlists: userPlaylists, fetchUserPlaylists } = usePlaylistData();
const { user } = useUserData();

const setFilter = (val) => {
  if (filter.value !== val) {
    filter.value = val;
    onSearch();
  }
};

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
    ratingDataMap.value = {};
    positionDataMap.value = {};
    albumDbDataMap.value = {};
    albumRootDataMap.value = {};
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    if (filter.value === 'albums') {
      results.value = await searchAlbumsByTitlePrefix(searchTerm.value.trim());
    } else {
      results.value = await searchAlbumsByArtistPrefix(searchTerm.value.trim());
    }
    // Filter out any undefined or invalid albums
    results.value = results.value.filter(album => album && album.id);
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