<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();
const emit = defineEmits(['updatePlaylist']);

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
  }
});

console.log('AlbumItem hasMoved prop:', props.hasMoved, 'for album:', props.album.name);

const lastFmLink = ({ artist, album }) => {
  const lastfmRoot = `https://www.last.fm/user/${props.lastFmUserName}/library/music`;
  const artistName = artist.replace(/ /g, "+");
  const albumName = album.replace(/ /g, "+");
  const link = `${lastfmRoot}/${artistName}/${albumName}`;
  return link;
};

const displayYear = (date) => {
  return date.substring(0, 4);
};

const navigateToArtist = (artistId) => {
  router.push({ name: 'artist', params: { id: artistId } });
};

const handleUpdatePlaylist = () => {
  emit('updatePlaylist', props.album);
};
</script>

<template>
  <li :class="['album-item', { 'has-moved': hasMoved }]">
    <img :src="album.images[1].url" alt="" class="album-image" />
    <div v-if="hasMoved" class="moved-indicator">
      <span class="text-xs text-orange-600 mb-1 block">Moved</span>
      <button 
        @click="handleUpdatePlaylist"
        class="update-playlist-btn"
      >
        Update playlist
      </button>
    </div>
    <div class="album-info">
      <p class="album-year text-xs lg:text-sm xl:text-base">
        {{ displayYear(album.release_date) }}
      </p>
      <p 
        class="album-name text-sm lg:text-base xl:text-lg cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
        @click="router.push({ 
          name: 'album', 
          params: { id: album.id },
          query: currentPlaylist && !isMappedAlbum ? { playlistId: currentPlaylist.playlistId } : undefined 
        })"
      >
        {{ album.name }}
      </p>
      <p 
        v-if="!hideArtist"
        class="album-artist text-sm lg:text-base xl:text-lg cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
        @click="navigateToArtist(album.artists[0].id)"
      >
        {{ album.artists[0].name }}
      </p>
    </div>
    <div class="album-link">
      <a
        :href="lastFmLink({ artist: album.artists[0].name, album: album.name })"
        target="_blank"
        class="lastfm-link text-sm lg:text-base xl:text-lg"
        >LastFM</a
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
}

.lastfm-link {
  @apply text-white block text-center;
}

.moved-indicator {
  @apply absolute top-2 right-2 bg-white px-2 py-1 rounded-lg shadow-md flex flex-col items-center;
  z-index: 10;
}

.update-playlist-btn {
  @apply text-xs bg-orange-500 text-white px-2 py-1 rounded-md hover:bg-orange-600 transition-colors duration-200;
  white-space: nowrap;
}
</style>
