<script setup>
import { useRouter } from "vue-router";
import { computed } from "vue";
import { PencilIcon } from '@heroicons/vue/24/solid';

const router = useRouter();

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

const isEndCategory = computed(() => props.category === 'end');
</script>

<template>
  <li
    v-if="playlist"
    :class="[
      'p-2 rounded-xl flex items-center cursor-pointer hover:bg-raspberry pr-6 w-full min-w-[200px] relative group',
      isEndCategory ? 'bg-red-700 text-sm max-w-[460px]' : 'bg-delft-blue max-w-[500px]'
    ]"
    @click="navigateToPlaylist(playlist.id)"
  >
    <img :src="playlist.images[2]?.url" alt="" class="mr-4 rounded-lg w-16 h-16 sm:w-20 sm:h-20" />
    <div class="flex-1">
      <h2 :class="['mb-1 text-mindero truncate', isEndCategory ? 'text-[16px]' : 'text-[20px]']">{{ playlist.name }}</h2>
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
