<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AlbumItem from '@components/AlbumItem.vue';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import { ArrowPathIcon, PencilIcon, BarsArrowUpIcon, BarsArrowDownIcon } from '@heroicons/vue/24/solid';
import { usePlaylistAlbums } from '@composables/usePlaylistAlbums';
import { usePlaylistDocument } from '@composables/usePlaylistDocument';
import { useUserData } from '@composables/useUserData';

const route = useRoute();
const { userData } = useUserData();
const id = computed(() => route.params.id);

const {
  albumData,
  playlistName,
  inCollectionMap,
  needsUpdateMap,
  loading,
  error,
  currentPage,
  totalPages,
  totalAlbums,
  itemsPerPage,
  showPagination,
  sortDirection,
  sortDirectionLabel,
  toggleSort,
  nextPage,
  previousPage,
  loadPlaylistPage,
  handleClearCache,
  handleUpdatePlaylist,
  refreshInCollectionForAlbum,
  handleUpdateAlbumDetails,
  cacheCleared
} = usePlaylistAlbums(id);

const { playlistDoc, updating, getPlaylistDocument, updatePlaylistName } = usePlaylistDocument();

onMounted(async () => {
  await loadPlaylistPage();
  playlistDoc.value = await getPlaylistDocument(id.value);
});
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <BackButton to="/playlists" text="Back to Playlists" />
    </div>

    <h1 class="h2 pb-4">{{ playlistName }}</h1>
    <div class="mb-4 flex gap-4">
      <BaseButton @click.prevent="handleClearCache">
        <template #icon-left><ArrowPathIcon class="h-5 w-5" /></template>
        Reload
      </BaseButton>
      <BaseButton v-if="playlistDoc && !playlistDoc.data().name"
        @click="updatePlaylistName"
        :disabled="updating"
      >
        <template #icon-left><PencilIcon class="h-5 w-5" /></template>
        {{ updating ? 'Updating...' : 'Update Playlist Name' }}
      </BaseButton>
      <BaseButton @click="toggleSort">
        <template #icon-left>
          <BarsArrowUpIcon v-if="sortDirection === 'asc'" class="h-5 w-5" />
          <BarsArrowDownIcon v-else class="h-5 w-5" />
        </template>
        Sort: {{ sortDirectionLabel }}
      </BaseButton>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading playlist...
    </p>

    <p class="text-lg mb-6">Total unique albums: {{ totalAlbums }}</p>
    <LoadingMessage v-if="loading" />
    <ErrorMessage v-else-if="error" :message="error" />
    <template v-else-if="albumData.length">
      <ul class="album-grid">
        <AlbumItem
          v-for="album in albumData"
          :key="album.id" 
          :album="album" 
          :lastFmUserName="userData?.lastFmUserName"
          :currentPlaylist="{ playlistId: id }"
          :ratingData="album.ratingData"
          :isMappedAlbum="false"
          :hasMoved="album.hasMoved"
          :inCollection="!!inCollectionMap[album.id]"
          :needsUpdate="needsUpdateMap[album.id]"
          @update-playlist="handleUpdatePlaylist"
          @added-to-collection="refreshInCollectionForAlbum"
          @update-album="handleUpdateAlbumDetails"
        />
      </ul>

      <div v-if="showPagination" class="pagination-controls">
        <BaseButton v-if="showPagination" @click="previousPage" :disabled="currentPage === 1" customClass="pagination-button">
          Previous
        </BaseButton>
        
        <span class="pagination-info">
          Page {{ currentPage }} of {{ totalPages }}
          ({{ (currentPage - 1) * itemsPerPage + 1 }}-{{ Math.min(currentPage * itemsPerPage, totalAlbums) }} 
          of {{ totalAlbums }} albums)
        </span>
        
        <BaseButton v-if="showPagination" @click="nextPage" :disabled="currentPage === totalPages" customClass="pagination-button">
          Next
        </BaseButton>
      </div>
    </template>
    <p v-else class="no-data-message">No albums found in this playlist.</p>
  </main>
</template>

<style scoped>
.album-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 304px));
  gap: 1rem;
  justify-content: center;
}

@media (max-width: 639px) {
  .album-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 304px));
  }
}

.pagination-controls {
  @apply flex justify-center items-center gap-4 mt-6 mb-8;
}

.pagination-button {
  @apply px-4 py-2 bg-blue-500 text-white rounded 
         hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
         transition-colors duration-200;
}

.pagination-info {
  @apply text-gray-700 text-sm;
}
</style>
