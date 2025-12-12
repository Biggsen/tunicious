<script setup>
import { defineProps, defineEmits, ref, watch, onMounted } from 'vue';
import { useCurrentUser } from 'vuefire';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { resolvePlaylistName } from '@utils/playlistNameResolver';
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

const user = useCurrentUser();
const { getPlaylist } = useUserSpotifyApi();
const playlistName = ref('');

const resolveName = async () => {
  if (!props.currentPlaylistInfo?.playlistId || !user.value) {
    playlistName.value = '';
    return;
  }

  // Always resolve from playlistId to ensure we get the current Spotify playlist name
  try {
    playlistName.value = await resolvePlaylistName(
      props.currentPlaylistInfo.playlistId,
      user.value.uid,
      getPlaylist
    );
  } catch (error) {
    playlistName.value = 'Unknown Playlist';
  }
};

watch(() => props.currentPlaylistInfo, resolveName, { immediate: true });
onMounted(resolveName);
</script>

<template>
  <div class="mt-6">
    <div v-if="currentPlaylistInfo" class="bg-green-100 border-2 border-green-500 rounded-xl p-4">
      <p class="text-green-700">
        This album is currently in playlist: <strong>{{ playlistName || 'Unknown Playlist' }}</strong>
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