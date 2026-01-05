<script setup>
import { useRouter } from "vue-router";
import { computed } from "vue";
import { PencilIcon, TrashIcon, SpeakerWaveIcon } from '@heroicons/vue/24/solid';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { usePlaylistData } from '@composables/usePlaylistData';

const router = useRouter();
const { playingFrom, isPlaying } = useSpotifyPlayer();
const { deletePlaylist, fetchUserPlaylists } = usePlaylistData();

const props = defineProps({
  playlist: Object,
});

const emit = defineEmits(['playlist-deleted']);

const navigateToPlaylist = (id) => {
  router.push({ path: `playlist/${id}` });
};

const navigateToEdit = (event, firebaseId) => {
  event.stopPropagation(); // Prevent triggering the main playlist click
  router.push({ path: `playlist/${firebaseId}/edit` });
};

const handleDelete = async (event, firebaseId, playlistName) => {
  event.stopPropagation(); // Prevent triggering the main playlist click
  
  if (!confirm(`Are you sure you want to delete "${playlistName}"? This will remove the playlist from this app. The playlist will remain in Spotify.`)) {
    return;
  }

  try {
    const success = await deletePlaylist(firebaseId);
    if (success) {
      emit('playlist-deleted', firebaseId);
    }
  } catch (error) {
    console.error('Error deleting playlist:', error);
    alert('Failed to delete playlist. Please try again.');
  }
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
  <li v-if="playlist" class="flex justify-end">
    <div
      :class="[
        'p-2 rounded-xl flex items-center cursor-pointer hover:bg-raspberry pr-6 relative group w-full',
        isTerminalPlaylist ? 'bg-delft-blue text-sm' : 
        isSinkPlaylist ? 'bg-red-700 text-sm ml-8' : 
        'bg-delft-blue'
      ]"
      @click="navigateToPlaylist(playlist.id)"
    >
      <div class="mr-4 relative">
        <img 
          v-if="playlist.images && playlist.images[2]?.url" 
          :src="playlist.images[2].url" 
          alt="" 
          class="rounded-lg w-16 h-16 sm:w-20 sm:h-20" 
        />
        <div 
          v-else 
          class="rounded-lg w-16 h-16 sm:w-20 sm:h-20 bg-gray-300 flex items-center justify-center"
        >
          <span class="text-gray-500 text-xs">No Image</span>
        </div>
        <div 
          v-if="isCurrentlyPlaying"
          class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-mindero border-2 border-delft-blue rounded-full p-2 shadow-lg"
        >
          <SpeakerWaveIcon class="w-5 h-5 text-delft-blue" />
        </div>
      </div>
      <div :class="['flex-1', isSinkPlaylist ? 'mr-8' : 'mr-16']">
        <h2 :class="['mb-1 text-mindero truncate', isSinkPlaylist ? 'text-[16px]' : 'text-[20px]']">{{ playlist.name }}</h2>
        <p class="text-mindero">{{ playlist.tracks.total }} tracks</p>
      </div>
      
      <!-- Action Buttons -->
      <div class="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1">
        <button
          @click="navigateToEdit($event, playlist.firebaseId)"
          class="p-1 rounded-md hover:bg-white/20"
          title="Edit playlist"
        >
          <PencilIcon class="h-4 w-4 text-mindero" />
        </button>
        <button
          @click="handleDelete($event, playlist.firebaseId, playlist.name)"
          class="p-1 rounded-md hover:bg-white/20"
          title="Delete playlist"
        >
          <TrashIcon class="h-4 w-4 text-mindero" />
        </button>
      </div>
    </div>
  </li>
</template>
