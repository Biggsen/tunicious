<script setup>
import { computed, watch, onUnmounted, ref } from 'vue';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { PlayIcon, PauseIcon } from '@heroicons/vue/24/solid';

const { 
  isReady, 
  isPlaying, 
  currentTrack, 
  position, 
  duration, 
  togglePlayback
} = useSpotifyPlayer();

const showPlayer = computed(() => currentTrack.value !== null && isReady.value);
const currentPosition = ref(0);

let positionInterval = null;

const startPositionTracking = () => {
  if (positionInterval) return;
  
  currentPosition.value = position.value;
  
  positionInterval = setInterval(() => {
    if (isPlaying.value) {
      currentPosition.value += 100;
    }
  }, 100);
};

const stopPositionTracking = () => {
  if (positionInterval) {
    clearInterval(positionInterval);
    positionInterval = null;
  }
};

watch(isPlaying, (newValue) => {
  if (newValue) {
    startPositionTracking();
  } else {
    stopPositionTracking();
  }
});

watch(position, (newPosition) => {
  currentPosition.value = newPosition;
});

onUnmounted(() => {
  stopPositionTracking();
});

const formatTime = (ms) => {
  if (!ms || ms === 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const progressPercentage = computed(() => {
  if (!duration.value || duration.value === 0) return 0;
  return (currentPosition.value / duration.value) * 100;
});
</script>

<template>
  <div 
    v-if="showPlayer"
    class="fixed bottom-0 left-0 right-0 bg-delft-blue text-white z-50 shadow-lg"
  >
    <div class="container mx-auto px-4 py-3">
      <div class="flex items-center gap-4">
        <div class="flex-shrink-0">
          <img 
            v-if="currentTrack?.image" 
            :src="currentTrack.image" 
            :alt="currentTrack.name"
            class="w-16 h-16 rounded object-cover"
          />
        </div>
        
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold truncate">{{ currentTrack?.name }}</h3>
          <p class="text-sm text-gray-300 truncate">
            {{ currentTrack?.artists?.join(', ') }}
          </p>
        </div>
        
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            @click="togglePlayback"
            class="p-2 hover:bg-white/20 rounded-full transition-colors"
            :title="isPlaying ? 'Pause' : 'Play'"
          >
            <PauseIcon v-if="isPlaying" class="w-6 h-6" />
            <PlayIcon v-else class="w-6 h-6" />
          </button>
        </div>
        
        <div class="flex-shrink-0 text-sm text-gray-300">
          <span>{{ formatTime(currentPosition) }}</span>
          <span class="mx-2">/</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
      </div>
      
      <div class="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
        <div 
          class="h-full bg-mindero transition-all duration-100"
          :style="{ width: `${progressPercentage}%` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
