<template>
  <BaseLayout>
    <div class="mb-6">
      <BackButton text="Library" to="/library" />
    </div>
    <h1 class="h2 pb-4">Add to Library</h1>
    <p class="text-delft-blue mb-6">Search Spotify, then save the album into your library.</p>
    <AlbumSearch v-model="selectedAlbum" />
    <div class="mt-6 flex items-center gap-4">
      <BaseButton
        variant="primary"
        :disabled="!selectedAlbum || saving"
        :loading="saving"
        @click="saveSelected"
      >
        Save to library
      </BaseButton>
      <p v-if="message" class="text-sm text-delft-blue">{{ message }}</p>
      <p v-if="errorMessage" class="text-sm text-raspberry">{{ errorMessage }}</p>
    </div>
  </BaseLayout>
</template>

<script setup>
import { ref } from 'vue';
import BaseLayout from '@components/common/BaseLayout.vue';
import BaseButton from '@components/common/BaseButton.vue';
import BackButton from '@components/common/BackButton.vue';
import AlbumSearch from '@components/AlbumSearch.vue';
import { useSavedAlbums } from '@/composables/useSavedAlbums';

const selectedAlbum = ref(null);
const saving = ref(false);
const message = ref('');
const errorMessage = ref('');
const { saveAlbum } = useSavedAlbums();

async function saveSelected() {
  if (!selectedAlbum.value?.id || saving.value) return;
  saving.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await saveAlbum(selectedAlbum.value);
    message.value = 'Saved. It will show in your library.';
    selectedAlbum.value = null;
  } catch (err) {
    errorMessage.value = err?.message || 'Could not save that album';
  } finally {
    saving.value = false;
  }
}
</script>
