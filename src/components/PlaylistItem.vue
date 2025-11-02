<script setup>
import { useRouter } from "vue-router";
import { computed } from "vue";
import { PencilIcon } from '@heroicons/vue/24/solid';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';

const router = useRouter();
const { playingFrom, isPlaying } = useSpotifyPlayer();

const props = defineProps({
  playlist: Object,
  category: String,
});

const navigateToPlaylist = (id) => {
  router.push({ path: `playlist/${id}` });
};

const navigateToEdit = (event, firebaseId) => {
  event.stopPropagation(); // Prevent triggering the main playlist click
  router.push({ path: `playlist/${firebaseId}/edit` });
};

const isEndPlaylist = computed(() => {
  // Check if this is an end playlist using the new pipeline system
  // End playlists are those with pipelineRole 'terminal' or 'sink'
  return props.playlist?.pipelineRole === 'terminal' || props.playlist?.pipelineRole === 'sink';
});

const isTerminalPlaylist = computed(() => {
  // Terminal playlists are final destinations (cream of the crop)
  return props.playlist?.pipelineRole === 'terminal';
});

const isSinkPlaylist = computed(() => {
  // Sink playlists are termination points (rejected albums)
  return props.playlist?.pipelineRole === 'sink';
});

const isCurrentlyPlaying = computed(() => {
  return isPlaying.value && 
         playingFrom.value?.type === 'playlist' && 
         playingFrom.value.id === props.playlist.id;
});
</script>

<template>
  <li
    v-if="playlist"
    :class="[
      'p-2 rounded-xl flex items-center cursor-pointer hover:bg-raspberry pr-6 w-full min-w-[200px] relative group',
      isTerminalPlaylist ? 'bg-delft-blue text-sm max-w-[500px]' : 
      isSinkPlaylist ? 'bg-red-700 text-sm max-w-[460px]' : 
      'bg-delft-blue max-w-[500px]',
      isCurrentlyPlaying ? 'ring-4 ring-mint shadow-lg' : ''
    ]"
    @click="navigateToPlaylist(playlist.id)"
  >
    <img 
      v-if="playlist.images && playlist.images[2]?.url" 
      :src="playlist.images[2].url" 
      alt="" 
      class="mr-4 rounded-lg w-16 h-16 sm:w-20 sm:h-20" 
    />
    <div 
      v-else 
      class="mr-4 rounded-lg w-16 h-16 sm:w-20 sm:h-20 bg-gray-300 flex items-center justify-center"
    >
      <span class="text-gray-500 text-xs">No Image</span>
    </div>
    <div class="flex-1">
      <h2 :class="['mb-1 text-mindero truncate', isSinkPlaylist ? 'text-[16px]' : 'text-[20px]']">{{ playlist.name }}</h2>
      <p class="text-mindero">{{ playlist.tracks.total }} songs</p>
    </div>
    
    <!-- Edit Button -->
    <button
      @click="navigateToEdit($event, playlist.firebaseId)"
      class="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-md hover:bg-white/20"
      title="Edit playlist"
    >
      <PencilIcon class="h-4 w-4 text-mindero" />
    </button>
  </li>
</template>
