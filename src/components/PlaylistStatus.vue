<script setup>
import { defineProps, defineEmits } from 'vue';
import BaseButton from '@components/common/BaseButton.vue';

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
      <BaseButton v-if="needsUpdate" @click="$emit('update')" :loading="updating" customClass="playlist-status-btn">
        {{ updating ? 'Updating...' : 'Update Album Details' }}
      </BaseButton>
    </div>
    <div v-else class="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
      <p class="text-yellow-700 mb-2">
        This album is not yet in your collection.
      </p>
      <BaseButton v-if="!needsUpdate" @click="$emit('save')" :loading="saving" customClass="playlist-status-btn">
        {{ saving ? 'Adding...' : 'Add to Collection' }}
      </BaseButton>
    </div>
  </div>
</template> 