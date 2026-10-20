<template>
  <BaseLayout>
      <div class="flex items-center justify-between gap-4 pb-4">
      <h1 class="h2">Library</h1>
      <div class="flex items-center gap-2">
        <RouterLink
          to="/library/add"
          class="px-4 py-2 border-2 border-delft-blue rounded text-delft-blue hover:bg-mindero"
        >
          Add album
        </RouterLink>
      <button
        v-if="!needsReconnect"
        type="button"
        class="px-4 py-2 border-2 border-delft-blue rounded text-delft-blue hover:bg-mindero disabled:opacity-50"
        :disabled="loading || loadingMore || refreshing"
        @click="refresh"
      >
        Refresh
      </button>
      </div>
    </div>

    <div v-if="needsReconnect" class="text-center py-8 space-y-4">
      <p class="text-delft-blue">Spotify needs permission to read your saved albums.</p>
      <BaseButton variant="primary" @click="initiateSpotifyLogin">
        Reconnect Spotify
      </BaseButton>
    </div>

    <template v-else>
      <div class="flex flex-col md:flex-row gap-3 mb-6">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Filter by album or artist"
          class="flex-1 px-4 py-2 border-2 border-delft-blue rounded focus:outline-none focus:ring-2 focus:ring-mindero text-lg"
        />
        <select
          v-model="sortKey"
          aria-label="Sort saved albums"
          class="px-4 py-2 border-2 border-delft-blue rounded bg-white text-delft-blue"
        >
          <option value="recent">Recently saved</option>
          <option value="title">Album title</option>
          <option value="artist">Artist</option>
        </select>
      </div>

      <p v-if="refreshing" class="text-sm text-delft-blue mb-4">
        Refreshing saved albums.
      </p>
      <p v-else-if="loadingMore" class="text-sm text-delft-blue mb-4">
        Loading more albums. Search and sort cover the full collection once loading finishes.
      </p>
      <p v-else-if="error && albums.length" class="text-sm text-raspberry mb-4">
        {{ error }}
        <button type="button" class="underline ml-2" @click="refresh">Retry</button>
      </p>

      <div v-if="loading && albums.length === 0" class="text-center text-delft-blue py-8">
        Loading saved albums...
      </div>
      <div v-else-if="error && albums.length === 0" class="text-center text-raspberry py-8 space-y-3">
        <p>{{ error }}</p>
        <button type="button" class="underline" @click="refresh">Retry</button>
      </div>
      <div v-else-if="visibleAlbums.length === 0" class="text-center text-gray-500 py-8">
        {{ searchTerm ? 'No saved albums match that filter.' : 'No saved albums yet.' }}
      </div>
      <template v-else>
        <p class="text-sm text-delft-blue mb-4">
          {{ visibleAlbums.length }} {{ visibleAlbums.length === 1 ? 'album' : 'albums' }}
          <span v-if="loadingMore && total"> of {{ total }}</span>
        </p>
        <ul class="album-grid">
          <LibraryAlbumCard
            v-for="album in visibleAlbums"
            :key="album.id"
            :album="album"
          />
        </ul>
      </template>
    </template>
  </BaseLayout>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import BaseLayout from '@components/common/BaseLayout.vue';
import BaseButton from '@components/common/BaseButton.vue';
import LibraryAlbumCard from '@/components/LibraryAlbumCard.vue';
import { useSpotifyAuth } from '@composables/useSpotifyAuth';
import { filterAndSortSavedAlbums, useSavedAlbums } from '@/composables/useSavedAlbums';

const searchTerm = ref('');
const sortKey = ref('recent');
const { initiateSpotifyLogin } = useSpotifyAuth();
const {
  albums,
  loading,
  loadingMore,
  error,
  needsReconnect,
  refreshing,
  total,
  loadSavedAlbums
} = useSavedAlbums();

const visibleAlbums = computed(() => filterAndSortSavedAlbums(albums.value, {
  query: searchTerm.value,
  sort: sortKey.value
}));

const refresh = () => loadSavedAlbums({ force: true });

const recheckLibrary = () => {
  if (document.visibilityState === 'visible') loadSavedAlbums();
};

onMounted(() => {
  loadSavedAlbums();
  document.addEventListener('visibilitychange', recheckLibrary);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', recheckLibrary);
});
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
