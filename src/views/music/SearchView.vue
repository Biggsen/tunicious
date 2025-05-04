<template>
  <main class="pt-6">
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
        />
      </ul>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue';
import AlbumItem from '@/components/AlbumItem.vue';
import { useAlbumsData } from '@/composables/useAlbumsData';

const searchTerm = ref('');
const filter = ref('albums'); // 'albums' or 'artists'
const results = ref([]);
const loading = ref(false);
const error = ref(null);

const activeFilterClass =
  'px-3 py-2 rounded bg-mindero text-delft-blue font-bold shadow';
const inactiveFilterClass =
  'px-3 py-2 rounded bg-gray-100 text-gray-500 hover:bg-celadon';

const { searchAlbumsByTitlePrefix, searchAlbumsByArtistPrefix } = useAlbumsData();

const setFilter = (val) => {
  if (filter.value !== val) {
    filter.value = val;
    onSearch();
  }
};

const onSearch = async () => {
  if (!searchTerm.value.trim() || searchTerm.value.trim().length < 2) {
    results.value = [];
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