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
    class="bg-delft-blue p-2 rounded-xl flex items-center cursor-pointer hover:bg-raspberry pr-6"
    @click="navigateToPlaylist(playlist.id)"
  >
    <img :src="playlist.images[2]?.url" alt="" class="mr-4 rounded-lg" />
    <div>
      <h2 class="text-mindero mb-1 text-[20px]">{{ playlist.name }}</h2>
      <p class="text-mindero">{{ playlist.tracks.total }} songs</p>
    </div>
  </li>
</template>
