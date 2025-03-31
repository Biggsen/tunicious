<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getAlbum, getAlbumTracks } from '../utils/api';

const route = useRoute();
const router = useRouter();
const album = ref(null);
const tracks = ref(null);
const loading = ref(true);
const error = ref(null);

const formatDuration = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

onMounted(async () => {
  try {
    loading.value = true;
    const albumId = route.params.id;
    const [albumData, tracksData] = await Promise.all([
      getAlbum(localStorage.getItem('token'), albumId),
      getAlbumTracks(albumId)
    ]);
    album.value = albumData;
    tracks.value = tracksData.items;
  } catch (err) {
    error.value = 'Failed to load album details';
    console.error(err);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <a 
        href="#" 
        @click.prevent="router.back()" 
        class="text-blue-500 hover:underline"
      >&larr; Back</a>
    </div>

    <div v-if="loading" class="text-center">
      <p class="text-delft-blue text-lg">Loading album details...</p>
    </div>
    
    <div v-else-if="error" class="text-center">
      <p class="text-red-500 text-lg">{{ error }}</p>
    </div>

    <div v-else>
      <div class="flex flex-col md:flex-row gap-8">
        <!-- Album Cover -->
        <div class="md:w-1/2">
          <img 
            :src="album.images[0].url" 
            :alt="album.name"
            class="w-full rounded-xl shadow-lg"
          />
        </div>

        <!-- Album Info -->
        <div class="md:w-1/2">
          <h1 class="h2 mb-2">{{ album.name }}</h1>
          <p 
            class="text-2xl text-delft-blue mb-4 cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
            @click="router.push({ name: 'artist', params: { id: album.artists[0].id } })"
          >{{ album.artists[0].name }}</p>
          <p class="text-xl text-delft-blue mb-6 font-bold">{{ album.release_date.substring(0, 4) }}</p>
          
          <div class="bg-white border-2 border-delft-blue rounded-xl p-4">
            <h2 class="text-xl font-bold text-delft-blue mb-4">Track List</h2>
            <ul class="space-y-2">
              <li 
                v-for="(track, index) in tracks" 
                :key="track.id"
                class="flex justify-between items-center text-delft-blue"
              >
                <span class="flex-1">
                  <span class="mr-2">{{ index + 1 }}.</span>
                  {{ track.name }}
                </span>
                <span class="ml-4">{{ formatDuration(track.duration_ms) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </main>
</template> 