<script setup>
import { computed, watch, onUnmounted, onMounted, ref } from 'vue';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUserData } from '@composables/useUserData';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { useWebPlayerPlaycountSimulation } from '@composables/useWebPlayerPlaycountSimulation';
import { getCache } from '@utils/cache';
import { logPlayer, logCache } from '@utils/logger';
import { PlayIcon, PauseIcon, HeartIcon } from '@heroicons/vue/24/solid';
import { HeartIcon as HeartIconOutline } from '@heroicons/vue/24/outline';

const { 
  isReady, 
  isPlaying, 
  currentTrack, 
  position, 
  duration, 
  togglePlayback
} = useSpotifyPlayer();

const { userData, user } = useUserData();
const { loveTrack, unloveTrack } = useLastFmApi();
const { checkTrackLoved, updateLovedStatus } = useUnifiedTrackCache();
const { simulatedIncrements } = useWebPlayerPlaycountSimulation();
const isLoving = ref(false);
const albumInfo = ref({ name: null, year: null });

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
  logPlayer('Playback state changed:', { isPlaying: newValue, track: currentTrack.value?.name });
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

// Show web player playcount simulation indicator
const showWebPlayerSimulation = computed(() => {
  return simulatedIncrements.value.length > 0;
});

// Check if current track is loved using unified cache
const isCurrentTrackLoved = computed(() => {
  if (!currentTrack.value?.id || !user.value) {
    return false;
  }
  
  try {
    return checkTrackLoved(currentTrack.value.id);
  } catch (err) {
    logPlayer('Error checking if track is loved:', err);
    return false;
  }
});

// Check if user can love tracks
const canLoveTracks = computed(() => {
  return !!(userData.value?.lastFmSessionKey && userData.value?.lastFmUserName);
});

// Handle love/unlove action
const handleHeartClick = async () => {
  if (!canLoveTracks.value || !currentTrack.value?.id || !user.value || isLoving.value) {
    logPlayer('Cannot toggle love - missing requirements:', {
      canLoveTracks: canLoveTracks.value,
      hasTrack: !!currentTrack.value,
      hasTrackId: !!currentTrack.value?.id,
      hasUser: !!user.value,
      isLoving: isLoving.value
    });
    return;
  }

  isLoving.value = true;
  const isLoved = isCurrentTrackLoved.value;
  const trackId = currentTrack.value.id;

  logPlayer(`${isLoved ? 'Unloving' : 'Loving'} track:`, { trackId, trackName: currentTrack.value.name });

  try {
    // Use unified cache to update loved status (handles cache update and background sync)
    await updateLovedStatus(trackId, !isLoved);
    logPlayer(`Track ${isLoved ? 'unloved' : 'loved'} successfully`);
    
    // Emit window event to notify other components
    window.dispatchEvent(new CustomEvent(isLoved ? 'track-unloved-from-player' : 'track-loved-from-player', {
      detail: {
        track: {
          id: trackId,
          name: currentTrack.value.name,
          artists: currentTrack.value.artists || []
        }
      }
    }));
  } catch (error) {
    logPlayer('Error toggling loved status:', error);
  } finally {
    isLoving.value = false;
  }
};

// No need to load loved tracks - unified cache handles this automatically
onMounted(() => {
  logPlayer('SpotifyPlayerBar mounted');
});

// Helper function to find album in cache by name and artist
const findAlbumInCache = (albumName, artistName) => {
  if (!albumName || !artistName) return null;
  
  const normalizedAlbumName = albumName.toLowerCase().trim();
  const normalizedArtistName = artistName.toLowerCase().trim();
  
  try {
    // Collect only albumRootData_ keys
    const albumKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('albumRootData_')) {
        albumKeys.push(key);
      }
    }
    
    // Search through album cache entries
    for (const key of albumKeys) {
      try {
        const item = localStorage.getItem(key);
        if (!item) continue;
        
        const parsed = JSON.parse(item);
        if (!parsed.data) continue;
        
        const cachedAlbum = parsed.data;
        const cachedAlbumName = (cachedAlbum.albumTitle || '').toLowerCase().trim();
        const cachedArtistName = (cachedAlbum.artistName || '').toLowerCase().trim();
        
        if (cachedAlbumName === normalizedAlbumName && 
            cachedArtistName === normalizedArtistName) {
          return {
            name: cachedAlbum.albumTitle || albumName,
            year: cachedAlbum.releaseYear ? String(cachedAlbum.releaseYear) : null
          };
        }
      } catch (parseError) {
        continue;
      }
    }
  } catch (error) {
    console.error('Error searching cache:', error);
  }
  
  return null;
};

// Fetch album info when track changes
const fetchAlbumInfo = () => {
  if (!currentTrack.value) {
    albumInfo.value = { name: null, year: null };
    return;
  }

  const albumName = currentTrack.value.album;
  const artistName = currentTrack.value.artists?.[0];
  
  logPlayer('Fetching album info:', { albumName, artistName });
  
  if (albumName && artistName) {
    const found = findAlbumInCache(albumName, artistName);
    logCache(found ? 'Found album in cache' : 'Album not found in cache', { albumName, artistName });
    albumInfo.value = found || { name: albumName, year: null };
  } else {
    albumInfo.value = { name: albumName || null, year: null };
  }
  
  logPlayer('Album info set:', albumInfo.value);
};

// Watch for track changes
watch(() => currentTrack.value?.id, (trackId, oldTrackId) => {
  logPlayer('Track changed:', { 
    trackId, 
    oldTrackId,
    trackName: currentTrack.value?.name,
    artists: currentTrack.value?.artists
  });
  fetchAlbumInfo();
}, { immediate: true });
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
          <p v-if="albumInfo.year || albumInfo.name" class="text-xs text-gray-400 truncate">
            {{ albumInfo.year || '' }}{{ albumInfo.year && albumInfo.name ? ' - ' : '' }}{{ albumInfo.name || '' }}
          </p>
        </div>
        
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            v-if="canLoveTracks"
            @click="handleHeartClick"
            :disabled="isLoving"
            class="p-2 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50"
            :title="isCurrentTrackLoved ? 'Unlove track' : 'Love track'"
          >
            <HeartIcon v-if="isCurrentTrackLoved" class="w-6 h-6 text-raspberry" />
            <HeartIconOutline v-else class="w-6 h-6" />
          </button>
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
      
      <!-- Web Player Playcount Simulation Indicators (POC) - Stacked Results -->
      <div v-if="showWebPlayerSimulation" class="mt-2 space-y-1 max-h-48 overflow-y-auto">
        <div 
          v-for="(result, index) in simulatedIncrements" 
          :key="`${result.trackId}-${result.timestamp}`"
          class="px-3 py-2 rounded text-sm font-medium bg-mint text-delft-blue"
        >
          <span class="flex items-center gap-2">
            <span class="font-bold">✓</span>
            <span>
              Playcount would increment: <strong>{{ result.trackName }}</strong> by <strong>{{ result.artist }}</strong>
            </span>
          </span>
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
