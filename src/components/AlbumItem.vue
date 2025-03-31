<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const props = defineProps({
  album: Object,
  lastFmUserName: String,
  hideArtist: Boolean,
  currentPlaylist: Object,
});

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
</script>

<template>
  <li class="album-item">
    <img :src="album.images[1].url" alt="" class="album-image" />
    <div class="album-info">
      <p class="album-year text-xs lg:text-sm xl:text-base">
        {{ displayYear(album.release_date) }}
      </p>
      <p 
        class="album-name text-sm lg:text-base xl:text-lg cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
        @click="router.push({ name: 'album', params: { id: album.id } })"
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
  @apply bg-mindero border-2 border-delft-blue rounded-xl flex flex-col overflow-hidden;
  height: 100%;
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
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.album-link {
  @apply bg-delft-blue p-2 mt-auto;
}

.lastfm-link {
  @apply text-white block text-center;
}
</style>
