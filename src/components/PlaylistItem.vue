<script setup>
import { useRouter } from "vue-router";

const router = useRouter();

const props = defineProps({
  playlist: Object,
});

const navigateToPlaylist = (id) => {
  router.push({ path: `playlist/${id}` });
};
</script>

<template>
  <li
    v-if="playlist"
    class="flex cursor-pointer hover:bg-mindero pr-6"
    @click="navigateToPlaylist(playlist.id)"
  >
    <img :src="playlist.images[2].url" alt="" class="mr-6" />
    <div>
      <h2 class="h4">{{ playlist.name }}</h2>
      <p>{{ playlist.tracks.total }} songs</p>
    </div>
  </li>
</template>
