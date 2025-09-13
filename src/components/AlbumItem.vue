<script setup>
import { useRouter } from 'vue-router';
import BaseButton from '@components/common/BaseButton.vue';
import { ref, computed } from 'vue';
import { useCurrentUser } from 'vuefire';
import { useAlbumsData } from '@composables/useAlbumsData';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { getLastFmLink } from '@utils/musicServiceLinks';
import { getRateYourMusicLink } from '@utils/musicServiceLinks';
import { TruckIcon, StarIcon, PlusIcon, HandThumbUpIcon, ArchiveBoxArrowDownIcon, MusicalNoteIcon, TrashIcon } from '@heroicons/vue/24/solid';
import { ClockIcon } from '@heroicons/vue/24/outline';
import RatingBar from '@components/RatingBar.vue';

const router = useRouter();
const emit = defineEmits(['added-to-collection', 'update-album', 'remove-album', 'process-album']);

const props = defineProps({
  album: {
    type: Object,
    required: true
  },
  lastFmUserName: {
    type: String,
    default: ''
  },
  hideArtist: {
    type: Boolean,
    default: false
  },
  currentPlaylist: {
    type: Object,
    default: () => ({})
  },
  isMappedAlbum: {
    type: Boolean,
    default: false
  },

  inCollection: {
    type: Boolean,
    default: true
  },
  needsUpdate: {
    type: Boolean,
    default: false
  },
  ratingData: {
    type: Object,
    default: null
  },
  lovedTrackData: {
    type: Object,
    default: null // { lovedCount, totalCount, percentage, isLoading }
  },
  showRemoveButton: {
    type: Boolean,
    default: false
  },
  showProcessingButtons: {
    type: Boolean,
    default: false
  },
  isSourcePlaylist: {
    type: Boolean,
    default: false
  },
  isProcessing: {
    type: Boolean,
    default: false
  },
  hasTerminationPlaylist: {
    type: Boolean,
    default: false
  }
});



const displayYear = (date) => {
  return date.substring(0, 4);
};

const navigateToArtist = (artistId) => {
  router.push({ name: 'artist', params: { id: artistId } });
};



const saving = ref(false);
const error = ref(null);
const user = useCurrentUser();
const { addAlbumToCollection } = useAlbumsData();

const handleAddToCollection = async () => {
  if (!user.value || !props.album || !props.currentPlaylist?.playlistId) return;
  try {
    saving.value = true;
    error.value = null;
    await addAlbumToCollection({
      album: props.album,
      playlistId: props.currentPlaylist.playlistId
    });
    emit('added-to-collection', props.album.id);
  } catch (err) {
    console.error('Error saving album:', err);
    error.value = err.message || 'Failed to save album';
  } finally {
    saving.value = false;
  }
};

const handleUpdateAlbum = () => {
  emit('update-album', props.album);
};

const handleRemoveAlbum = () => {
  emit('remove-album', props.album);
};

const handleProcessAlbum = (action) => {
  emit('process-album', { album: props.album, action });
};

const handleYesClick = () => {
  handleProcessAlbum('yes');
};

const handleNoClick = () => {
  handleProcessAlbum('no');
};

const fallbackImage = '/placeholder.png'; // You can replace this with your own placeholder path
</script>

<template>
  <li class="album-item">
    <div class="album-image-container">
      <img :src="album.albumCover || album.images?.[1]?.url || album.images?.[0]?.url || fallbackImage" alt="" class="album-image" />
                    <div v-if="showProcessingButtons || showRemoveButton" class="hover-buttons">
                   <button 
            v-if="currentPlaylist?.nextStagePlaylistId"
            @click="handleYesClick"
            class="hover-btn yes-btn"
            title="Yes"
          >
            <MusicalNoteIcon v-if="currentPlaylist?.pipelineRole === 'source'" class="h-4 w-4" />
            <HandThumbUpIcon v-else class="h-4 w-4" />
          </button>
                   <button 
            v-if="hasTerminationPlaylist"
            @click="handleNoClick"
            class="hover-btn no-btn"
            title="No"
          >
            <ArchiveBoxArrowDownIcon class="h-4 w-4" />
          </button>
          <button 
            v-if="showRemoveButton"
            @click="handleRemoveAlbum"
            class="hover-btn remove-btn"
            title="Remove from playlist"
          >
            <TrashIcon class="h-4 w-4" />
          </button>
       </div>
    </div>
    <div v-if="!inCollection" class="add-indicator">
      <BaseButton @click="handleAddToCollection" :disabled="saving" customClass="add-to-collection-btn">
        <template #icon-left v-if="!saving"><PlusIcon class="h-4 w-4" /></template>
        <span v-if="saving">Adding...</span>
        <span v-else>Add</span>
      </BaseButton>
      <span v-if="error" class="text-xs text-red-500 mt-1">{{ error }}</span>
    </div>
    <div v-else-if="needsUpdate" class="add-indicator">
      <BaseButton @click="handleUpdateAlbum" customClass="add-to-collection-btn">
        Update
      </BaseButton>
    </div>
    <div class="album-info">
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <p v-if="album.releaseYear || album.release_date" class="album-year text-xs lg:text-sm xl:text-base">
            {{ album.releaseYear || displayYear(album.release_date) }}
          </p>
          <a
            class="album-name text-sm lg:text-base xl:text-lg cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
            :href="router.resolve({ 
              name: 'album', 
              params: { id: album.id },
              query: currentPlaylist && !isMappedAlbum ? { playlistId: currentPlaylist.playlistId } : undefined 
            }).href"
          >
            {{ album.name || album.albumTitle || 'Unknown Album' }}
          </a>
          <a
            v-if="!hideArtist && (album.artists?.[0]?.name || album.artistName) && (album.artistId || album.artists?.[0]?.id)"
            class="album-artist text-sm lg:text-base xl:text-lg cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
            :href="router.resolve({ name: 'artist', params: { id: album.artistId || album.artists?.[0]?.id } }).href"
          >
            {{ album.artists?.[0]?.name || album.artistName || 'Unknown Artist' }}
          </a>
          <span
            v-else-if="!hideArtist && (album.artists?.[0]?.name || album.artistName)"
            class="album-artist text-sm lg:text-base xl:text-lg text-delft-blue"
          >
            {{ album.artists?.[0]?.name || album.artistName || 'Unknown Artist' }}
          </span>
          
          <!-- Last.fm loved tracks percentage -->
          <div v-if="lastFmUserName && lovedTrackData" class="loved-tracks-info mt-2">
            <div v-if="lovedTrackData.isLoading" class="text-xs text-gray-500 flex items-center gap-1">
              <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading...</span>
            </div>
            <div v-else-if="lovedTrackData.percentage > 0" class="flex items-center gap-1">
              <svg class="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
              </svg>
              <span class="text-xs text-delft-blue font-medium">
                {{ lovedTrackData.percentage }}% loved ({{ lovedTrackData.lovedCount }}/{{ lovedTrackData.totalCount }})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Simulated rating bars -->
    <div>
      <RatingBar v-if="ratingData?.category && ratingData?.category !== 'queued'" :priority="ratingData?.priority" :category="ratingData?.category" />
      <!-- Show queued indicator for queued albums -->
      <div v-else-if="ratingData?.category === 'queued'" class="h-6 py-1 flex items-center justify-start pl-2" style="width: 100%">
        <ClockIcon class="w-5 h-5 text-delft-blue" title="Queued" />
      </div>
    </div>
    <div class="album-link">
      <a
        :href="getLastFmLink({ lastFmUserName, artist: album.artists?.[0]?.name || album.artistName || '', album: album.name || album.albumTitle || '' })"
        class="lastfm-link text-sm lg:text-base xl:text-lg" target="_blank"
        >LastFM</a
      >
      <a
        :href="getRateYourMusicLink({ artist: album.artists?.[0]?.name || album.artistName || '', album: album.name || album.albumTitle || '' })"
        class="rym-link text-sm lg:text-base xl:text-lg ml-2" target="_blank"
        >RYM</a
      >
    </div>
  </li>
</template>

<style scoped>
.album-item {
  @apply bg-mindero border-2 border-delft-blue rounded-xl flex flex-col overflow-hidden relative;
  height: 100%;
}



.album-image-container {
  @apply relative;
}

.album-image {
  @apply w-full object-cover;
  aspect-ratio: 1 / 1;
}

.hover-buttons {
  @apply absolute inset-0 opacity-0 transition-opacity duration-200;
  pointer-events: none;
}

.album-image-container:hover .hover-buttons {
  @apply opacity-100;
  pointer-events: auto;
}

.hover-btn {
  @apply absolute p-2 rounded-full transition-all duration-200;
  @apply shadow-lg hover:shadow-xl;
  @apply border-2 border-white;
}

.yes-btn {
  @apply top-2 right-2;
  @apply bg-green-500 hover:bg-green-600;
  @apply text-white;
}

.no-btn {
  @apply top-2 left-2;
  @apply bg-gray-500 hover:bg-gray-600;
  @apply text-white;
}

.remove-btn {
  @apply bottom-2 left-2;
  @apply bg-red-500 hover:bg-red-600;
  @apply text-white;
}

.album-info {
  @apply p-3 flex-grow;
}

.album-year {
  @apply text-delft-blue;
}

.album-name {
  @apply font-bold leading-tight mb-1 text-delft-blue;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.album-artist {
  @apply text-delft-blue leading-tight;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.album-link {
  @apply bg-delft-blue p-2 mt-auto;
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  align-items: center;
  padding-left: 2rem;
  padding-right: 2rem;
}

.rym-link {
  @apply text-white block text-center;
  display: inline;
}

.lastfm-link {
  @apply text-white block text-center;
  display: inline;
}



.add-to-collection-btn {
  @apply text-xs bg-mint text-delft-blue border border-delft-blue px-2 py-1 rounded-md hover:bg-celadon transition-colors duration-200;
  white-space: nowrap;
}

.add-indicator {
  @apply absolute top-2 right-2 flex flex-col items-center;
  z-index: 10;
}

.btn-danger {
  @apply px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200 text-sm font-bold;
}

.btn-sm {
  @apply text-xs;
}

.btn-process {
  @apply px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors duration-200 text-sm font-bold;
}

.btn-terminate {
  @apply px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200 text-sm font-bold;
}
</style>
