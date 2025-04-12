<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  currentPlaylistInfo: {
    type: Object,
    default: null
  },
  needsUpdate: {
    type: Boolean,
    default: false
  },
  updating: {
    type: Boolean,
    default: false
  },
  saving: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update', 'save']);
</script>

<template>
  <div class="mt-6">
    <div v-if="currentPlaylistInfo" class="bg-green-100 border-2 border-green-500 rounded-xl p-4">
      <p class="text-green-700">
        This album is currently in playlist: <strong>{{ currentPlaylistInfo.playlistName }}</strong>
      </p>
      <button 
        v-if="needsUpdate"
        @click="emit('update')"
        :disabled="updating"
        class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
      >
        {{ updating ? 'Updating...' : 'Update Album Data' }}
      </button>
    </div>
    <div v-else class="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
      <p class="text-yellow-700 mb-2">
        This album is not yet in your collection.
      </p>
      <button 
        @click="emit('save')"
        :disabled="saving"
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
      >
        {{ saving ? 'Adding...' : 'Add to Collection' }}
      </button>
    </div>
  </div>
</template> 