<script setup>
const props = defineProps({
  playlist: Object,
});
</script>

<template>
  <li v-if="playlist" class="flex">
    <img :src="playlist.images[2].url" alt="" class="mr-6" />
    <div>
      <h2 class="h4">{{ playlist.name }}</h2>
      <p>{{ playlist.tracks.total }} songs</p>
    </div>
  </li>
</template>
