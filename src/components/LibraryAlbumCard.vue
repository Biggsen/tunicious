<script setup>
import { computed } from 'vue';

const props = defineProps({
  album: {
    type: Object,
    required: true
  }
});

const fallbackImage = '/placeholder.png';

const cover = computed(() => (
  props.album.images?.[0]?.url
  || props.album.albumCover
  || props.album.images?.[1]?.url
  || fallbackImage
));

const year = computed(() => {
  if (props.album.releaseYear) return String(props.album.releaseYear);
  const date = props.album.release_date || '';
  return date ? String(date).slice(0, 4) : '';
});

const artistName = computed(() => props.album.artists?.[0]?.name || props.album.artistName || '');
const artistId = computed(() => props.album.artistId || props.album.artists?.[0]?.id || '');
const title = computed(() => props.album.name || props.album.albumTitle || 'Unknown Album');
</script>

<template>
  <li class="library-album">
    <div class="library-album-cover">
      <img :src="cover" alt="" class="library-album-image" loading="lazy" decoding="async" />
    </div>
    <div class="library-album-info">
      <p v-if="year" class="library-album-year text-base">{{ year }}</p>
      <router-link
        class="library-album-name text-lg"
        :to="{ name: 'album', params: { id: album.id } }"
      >
        {{ title }}
      </router-link>
      <router-link
        v-if="artistName && artistId"
        class="library-album-artist text-lg"
        :to="{ name: 'artist', params: { id: artistId } }"
      >
        {{ artistName }}
      </router-link>
      <span v-else-if="artistName" class="library-album-artist text-lg">
        {{ artistName }}
      </span>
    </div>
  </li>
</template>

<style scoped>
.library-album {
  @apply bg-mindero border-2 border-delft-blue rounded-xl flex flex-col overflow-hidden;
  height: 100%;
}

.library-album-cover {
  margin: 8px;
}

.library-album-image {
  @apply w-full object-cover rounded-lg;
  aspect-ratio: 1 / 1;
}

.library-album-info {
  @apply p-3;
}

.library-album-year {
  @apply text-delft-blue;
}

.library-album-name,
.library-album-artist {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.library-album-name {
  @apply font-bold leading-tight mb-1 text-delft-blue;
}

.library-album-artist {
  @apply leading-tight text-delft-blue;
}

a.library-album-name,
a.library-album-artist {
  @apply cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200;
}
</style>
