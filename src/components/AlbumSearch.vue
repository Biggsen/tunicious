<template>
  <div class="album-search">
    <div class="form-group">
      <label for="albumSearch">Search Albums</label>
      <div class="relative">
        <input 
          type="text" 
          id="albumSearch" 
          v-model="searchQuery"
          @input="handleSearch"
          @focus="showResults = true"
          placeholder="Search by artist name or album title..."
          class="form-input pr-10"
          :class="{ 'loading': searching }"
        />
        <div v-if="searching" class="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    </div>

    <!-- Search Results -->
    <div v-if="showResults && searchResults.length > 0" class="search-results">
      <div class="max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
        <div 
          v-for="album in searchResults" 
          :key="album.id"
          @click="selectAlbum(album)"
          class="album-result p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
        >
          <div class="flex items-center space-x-3">
            <img 
              v-if="album.images && album.images.length > 0" 
              :src="album.images[0].url" 
              :alt="album.name"
              class="w-12 h-12 rounded object-cover"
            />
            <div v-else class="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
              <span class="text-gray-400 text-xs">No Image</span>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-medium text-gray-900 truncate">{{ album.name }}</h4>
              <p class="text-sm text-gray-600 truncate">{{ album.artists.map(a => a.name).join(', ') }}</p>
              <p class="text-xs text-gray-500">{{ album.release_date?.split('-')[0] || 'Unknown Year' }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Selected Album -->
    <div v-if="selectedAlbum" class="selected-album mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
      <div class="flex items-center space-x-3">
        <img 
          v-if="selectedAlbum.images && selectedAlbum.images.length > 0" 
          :src="selectedAlbum.images[0].url" 
          :alt="selectedAlbum.name"
          class="w-16 h-16 rounded object-cover"
        />
        <div v-else class="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
          <span class="text-gray-400 text-xs">No Image</span>
        </div>
        <div class="flex-1">
          <h4 class="font-medium text-gray-900">{{ selectedAlbum.name }}</h4>
          <p class="text-sm text-gray-600">{{ selectedAlbum.artists.map(a => a.name).join(', ') }}</p>
          <p class="text-xs text-gray-500">{{ selectedAlbum.release_date?.split('-')[0] || 'Unknown Year' }}</p>
        </div>
        <button 
          @click="clearSelection"
          class="text-red-600 hover:text-red-800 text-sm"
        >
          Change
        </button>
      </div>
    </div>

    <!-- No Results -->
    <div v-if="showResults && searchQuery && !searching && searchResults.length === 0" class="mt-2 text-sm text-gray-500">
      No albums found. Try a different search term.
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';

const props = defineProps({
  modelValue: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:modelValue']);

const { searchAlbums, loading: spotifyLoading } = useUserSpotifyApi();

const searchQuery = ref('');
const searchResults = ref([]);
const selectedAlbum = ref(props.modelValue);
const showResults = ref(false);
const searching = ref(false);

// Debounce search
let searchTimeout = null;

const handleSearch = () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  if (searchQuery.value.trim().length < 2) {
    searchResults.value = [];
    showResults.value = false;
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      searching.value = true;
      const response = await searchAlbums(searchQuery.value.trim());
      searchResults.value = response.albums?.items || [];
      showResults.value = true;
    } catch (error) {
      console.error('Search error:', error);
      searchResults.value = [];
    } finally {
      searching.value = false;
    }
  }, 300);
};

const selectAlbum = (album) => {
  selectedAlbum.value = album;
  searchQuery.value = `${album.name} - ${album.artists.map(a => a.name).join(', ')}`;
  showResults.value = false;
  emit('update:modelValue', album);
};

const clearSelection = () => {
  selectedAlbum.value = null;
  searchQuery.value = '';
  searchResults.value = [];
  showResults.value = false;
  emit('update:modelValue', null);
};

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  selectedAlbum.value = newValue;
  if (newValue) {
    searchQuery.value = `${newValue.name} - ${newValue.artists.map(a => a.name).join(', ')}`;
  }
});

// Close results when clicking outside
const handleClickOutside = (event) => {
  if (!event.target.closest('.album-search')) {
    showResults.value = false;
  }
};

// Add click outside listener
if (typeof window !== 'undefined') {
  document.addEventListener('click', handleClickOutside);
}
</script>

<style scoped>
.form-group {
  @apply space-y-2;
}

label {
  @apply block text-sm font-medium text-gray-700;
}

.form-input {
  @apply block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6;
}

.form-input.loading {
  @apply ring-indigo-600;
}

.search-results {
  @apply mt-2;
}

.album-result {
  @apply transition-colors duration-150;
}
</style>
