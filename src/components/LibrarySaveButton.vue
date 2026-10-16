<template>
  <div class="inline-flex flex-col items-start gap-1">
    <BaseButton
      v-if="needsReconnect"
      variant="secondary"
      @click="initiateSpotifyLogin"
    >
      Reconnect Spotify
    </BaseButton>
    <BaseButton
      v-else
      variant="secondary"
      :loading="pending || checking"
      :disabled="!album?.id"
      @click="toggleSaved"
    >
      {{ saved ? 'Remove' : 'Save' }}
    </BaseButton>
    <p v-if="errorMessage" class="text-sm text-raspberry max-w-xs">{{ errorMessage }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import BaseButton from '@components/common/BaseButton.vue';
import { useSpotifyAuth } from '@composables/useSpotifyAuth';
import { useSavedAlbums } from '@/composables/useSavedAlbums';

const props = defineProps({
  album: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['changed']);

const { initiateSpotifyLogin } = useSpotifyAuth();
const { isAlbumSaved, saveAlbum, removeAlbum, needsReconnect } = useSavedAlbums();

const saved = ref(false);
const pending = ref(false);
const checking = ref(false);
const errorMessage = ref('');

async function refreshStatus() {
  if (!props.album?.id) return;
  checking.value = true;
  errorMessage.value = '';
  try {
    saved.value = await isAlbumSaved(props.album.id);
  } catch (err) {
    saved.value = false;
    errorMessage.value = err?.needsReconnect || needsReconnect.value
      ? 'Reconnect Spotify to save albums.'
      : (err?.message || 'Could not check saved status');
  } finally {
    checking.value = false;
  }
}

async function toggleSaved() {
  if (!props.album?.id || pending.value || checking.value) return;
  const previous = saved.value;
  const nextSaved = !previous;
  pending.value = true;
  errorMessage.value = '';
  saved.value = nextSaved;
  try {
    if (nextSaved) {
      await saveAlbum(props.album);
    } else {
      await removeAlbum(props.album.id);
    }
    emit('changed');
  } catch (err) {
    saved.value = previous;
    errorMessage.value = err?.needsReconnect || needsReconnect.value
      ? 'Reconnect Spotify to save albums.'
      : (err?.message || 'Could not update your library');
  } finally {
    pending.value = false;
  }
}

onMounted(refreshStatus);
watch(() => props.album?.id, (id, previousId) => {
  if (id && id !== previousId) refreshStatus();
});
</script>
