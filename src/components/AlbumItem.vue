<script setup>
import { useRouter } from 'vue-router';
import BaseButton from '@components/common/BaseButton.vue';
import { ref, computed } from 'vue';
import { useCurrentUser } from 'vuefire';
import { useAlbumsData } from '@composables/useAlbumsData';
import { useSpotifyApi } from '@composables/useSpotifyApi';
import { getLastFmLink } from '@utils/musicServiceLinks';
import { getRateYourMusicLink } from '@utils/musicServiceLinks';
import { TruckIcon, StarIcon } from '@heroicons/vue/24/solid';
import RatingBar from '@components/RatingBar.vue';

const router = useRouter();
const emit = defineEmits(['updatePlaylist', 'added-to-collection', 'update-album']);

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
  hasMoved: {
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
  }
});

console.log('AlbumItem hasMoved prop:', props.hasMoved, 'for album:', props.album.name);

const displayYear = (date) => {
  return date.substring(0, 4);
};

const navigateToArtist = (artistId) => {
  router.push({ name: 'artist', params: { id: artistId } });
};

const handleUpdatePlaylist = () => {
  emit('updatePlaylist', props.album);
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

const fallbackImage = '/placeholder.png'; // You can replace this with your own placeholder path
</script>

<template>
  <li :class="['album-item', { 'has-moved': hasMoved }]">
    <img :src="album.albumCover || album.images?.[1]?.url || album.images?.[0]?.url || fallbackImage" alt="" class="album-image" />
    <div v-if="hasMoved" class="moved-indicator">
      <span class="text-xs text-orange-600 mb-1 block">Moved</span>
      <BaseButton @click="handleUpdatePlaylist" :disabled="disabled" customClass="update-playlist-btn">
        Update playlist
      </BaseButton>
    </div>
    <div v-else-if="!inCollection" class="add-indicator">
      <BaseButton @click="handleAddToCollection" :disabled="saving" customClass="add-to-collection-btn">
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
        v-if="!hideArtist && (album.artists?.[0]?.name || album.artistName)"
        class="album-artist text-sm lg:text-base xl:text-lg cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
        :href="router.resolve({ name: 'artist', params: { id: album.artistId || album.artists?.[0]?.id } }).href"
      >
        {{ album.artists?.[0]?.name || album.artistName || 'Unknown Artist' }}
      </a>
    </div>
    <!-- Simulated rating bars -->
    <div>
      <RatingBar v-if="ratingData?.category && ratingData?.category !== 'queued'" :priority="ratingData?.priority" :category="ratingData?.category" />
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

.album-item.has-moved {
  @apply border-orange-500 border-2;
}

.album-image {
  @apply w-full object-cover;
  aspect-ratio: 1 / 1;
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
  @apply text-delft-blue;
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

.moved-indicator {
  @apply absolute top-2 right-2 bg-white px-2 py-1 rounded-lg shadow-md flex flex-col items-center;
  z-index: 10;
}

.update-playlist-btn {
  @apply text-xs bg-orange-500 text-white px-2 py-1 rounded-md hover:bg-orange-600 transition-colors duration-200;
  white-space: nowrap;
}

.add-to-collection-btn {
  @apply text-xs bg-mint text-white px-2 py-1 rounded-md hover:bg-celadon transition-colors duration-200;
  white-space: nowrap;
}

.add-indicator {
  @apply absolute top-2 right-2 bg-white px-2 py-1 rounded-lg shadow-md flex flex-col items-center;
  z-index: 10;
}
</style>
