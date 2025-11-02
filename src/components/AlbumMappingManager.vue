<script setup>
import { defineProps, defineEmits } from 'vue';
import BaseButton from '@components/common/BaseButton.vue';

const props = defineProps({
  searchResults: {
    type: Array,
    required: true
  },
  isSearching: {
    type: Boolean,
    default: false
  },
  searchError: {
    type: String,
    default: null
  },
  isMappedAlbum: {
    type: Boolean,
    default: false
  },
  primaryAlbumId: {
    type: String,
    default: null
  },
  currentAlbumYear: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['check-existing', 'create-mapping', 'close', 'update-year']);
</script>

<template>
  <div>
    <!-- Album Mapping UI -->
    <div v-if="!isMappedAlbum && !primaryAlbumId" class="mt-6 bg-white border-2 border-delft-blue rounded-xl p-4">
      <h3 class="text-xl font-bold text-delft-blue mb-4">Album Mapping</h3>
      
      <p class="text-delft-blue mb-4">
        This album might exist in your collection under a different ID. Check if it exists:
      </p>
      <BaseButton @click="emit('check-existing')" :loading="isSearching" customClass="mapping-btn">
        Check for Existing Albums
      </BaseButton>

      <div v-if="searchError" class="error-message mt-4">
        {{ searchError }}
      </div>
    </div>

    <!-- Already Mapped Message -->
    <div v-if="isMappedAlbum && primaryAlbumId" class="mt-6 bg-white border-2 border-delft-blue rounded-xl p-4">
      <h3 class="text-xl font-bold text-delft-blue mb-4">Album Mapping</h3>
      <p class="text-delft-blue">
        This album is already mapped to another album in your collection.
      </p>
    </div>

    <!-- Search Results Dialog -->
    <div v-if="searchResults.length > 0" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999]">
      <div class="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl">
        <h3 class="text-xl font-bold text-delft-blue mb-4">Found Matching Albums</h3>
        <p class="text-delft-blue mb-4">
          The following albums match the title and artist. Select one to create a mapping:
        </p>
        <ul class="space-y-3">
          <li 
            v-for="result in searchResults" 
            :key="result.id"
            class="flex flex-col p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <div class="font-medium">{{ result.albumTitle }}</div>
            <div class="text-sm text-gray-600">by {{ result.artistName }}</div>
            <div class="flex flex-col gap-1 mt-1">
              <div class="text-xs text-gray-500">
                Similarity: {{ Math.round(result.similarity * 100) }}%
              </div>
              <div 
                v-if="currentAlbumYear && result.releaseYear && parseInt(currentAlbumYear) !== parseInt(result.releaseYear)"
                class="flex items-center gap-2"
              >
                <span class="text-xs font-medium text-orange-600">⚠️ Year Difference:</span>
                <span class="text-xs font-semibold px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                  DB: {{ result.releaseYear }} vs Spotify: {{ currentAlbumYear }} ({{ Math.abs(parseInt(currentAlbumYear) - parseInt(result.releaseYear)) }} years)
                </span>
              </div>
            </div>
            <div v-if="currentAlbumYear && result.releaseYear && parseInt(currentAlbumYear) !== parseInt(result.releaseYear)" class="mt-2">
              <BaseButton 
                @click="emit('update-year', result.id, currentAlbumYear)" 
                customClass="w-full bg-yellow-500 text-white hover:bg-yellow-600 text-sm py-1.5 mb-2"
              >
                Update Year to {{ currentAlbumYear }} (from Spotify)
              </BaseButton>
            </div>
            <BaseButton @click="emit('create-mapping', result.id)" customClass="mapping-btn">
              Map to {{ result.albumTitle }}
            </BaseButton>
          </li>
        </ul>
        <BaseButton @click="emit('close')" customClass="mapping-btn">
          Close
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.check-existing-btn,
.create-mapping-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.check-existing-btn {
  background-color: #4CAF50;
  color: white;
}

.check-existing-btn:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.create-mapping-btn {
  background-color: #2196F3;
  color: white;
}

.error-message {
  color: #f44336;
}
</style> 