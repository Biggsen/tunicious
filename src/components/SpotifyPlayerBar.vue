<script setup>
import { computed, watch, onUnmounted, onMounted, ref } from 'vue';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUserData } from '@composables/useUserData';
import { useLastFmApi } from '@composables/useLastFmApi';
import { getCachedLovedTracks } from '@utils/lastFmUtils';
import { clearCache, setCache, getCache } from '@utils/cache';
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

const { userData } = useUserData();
const { loveTrack, unloveTrack } = useLastFmApi();
const lovedTracks = ref([]);
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

// Create lookup map for loved tracks
const lovedTracksLookup = computed(() => {
  const lookup = new Map();
  if (!lovedTracks.value || lovedTracks.value.length === 0) {
    return lookup;
  }
  
  lovedTracks.value.forEach(lovedTrack => {
    if (lovedTrack.name && lovedTrack.artist?.name) {
      const trackName = lovedTrack.name.toLowerCase();
      const artistName = lovedTrack.artist.name.toLowerCase();
      const key = `${trackName}|${artistName}`;
      lookup.set(key, true);
    }
  });
  
  return lookup;
});

// Check if current track is loved
const isCurrentTrackLoved = computed(() => {
  if (!currentTrack.value || !lovedTracksLookup.value.size) {
    return false;
  }

  const trackName = currentTrack.value.name?.toLowerCase();
  if (!trackName) return false;

  const trackArtists = currentTrack.value.artists?.map(artist => artist.toLowerCase()) || [];

  // Check against all track artists
  return trackArtists.some(artistName => {
    const key = `${trackName}|${artistName}`;
    return lovedTracksLookup.value.has(key);
  });
});

// Check if user can love tracks
const canLoveTracks = computed(() => {
  return !!(userData.value?.lastFmSessionKey && userData.value?.lastFmUserName);
});

// Handle love/unlove action
const handleHeartClick = async () => {
  if (!canLoveTracks.value || !currentTrack.value || isLoving.value) {
    return;
  }

  isLoving.value = true;
  const isLoved = isCurrentTrackLoved.value;
  const trackName = currentTrack.value.name;
  const artistName = currentTrack.value.artists?.[0] || '';

  try {
    if (isLoved) {
      // Unlove track
      await unloveTrack(trackName, artistName, userData.value.lastFmSessionKey);
      
      // Optimistically remove from loved tracks
      lovedTracks.value = lovedTracks.value.filter(lovedTrack => {
        const trackNameMatch = lovedTrack.name?.toLowerCase() === trackName.toLowerCase();
        const artistMatch = lovedTrack.artist?.name?.toLowerCase() === artistName.toLowerCase();
        return !(trackNameMatch && artistMatch);
      });
      
      // Update cache
      const cacheKey = `lovedTracks_${userData.value.lastFmUserName}`;
      await setCache(cacheKey, lovedTracks.value);
      
      // Emit window event to notify other components
      window.dispatchEvent(new CustomEvent('track-unloved-from-player', {
        detail: {
          track: {
            name: trackName,
            artists: [{ name: artistName }]
          }
        }
      }));
    } else {
      // Love track
      await loveTrack(trackName, artistName, userData.value.lastFmSessionKey);
      
      // Optimistically add to loved tracks
      const lovedTrack = {
        name: trackName,
        artist: { name: artistName },
        date: { uts: Math.floor(Date.now() / 1000).toString() }
      };
      lovedTracks.value = [...lovedTracks.value, lovedTrack];
      
      // Update cache
      const cacheKey = `lovedTracks_${userData.value.lastFmUserName}`;
      await setCache(cacheKey, lovedTracks.value);
      
      // Emit window event to notify other components
      window.dispatchEvent(new CustomEvent('track-loved-from-player', {
        detail: {
          track: {
            name: trackName,
            artists: [{ name: artistName }]
          }
        }
      }));
    }
  } catch (error) {
    console.error('Error toggling loved status:', error);
    
    // On error, refetch from Last.fm to get accurate state
    if (userData.value?.lastFmUserName) {
      await clearCache(`lovedTracks_${userData.value.lastFmUserName}`);
      lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
    }
  } finally {
    isLoving.value = false;
  }
};

// Load loved tracks on mount
onMounted(async () => {
  if (userData.value?.lastFmUserName) {
    lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
  }
});

// Watch for user data changes to reload loved tracks
watch(() => userData.value?.lastFmUserName, async (newUserName) => {
  if (newUserName) {
    lovedTracks.value = await getCachedLovedTracks(newUserName);
  } else {
    lovedTracks.value = [];
  }
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
  
  if (albumName && artistName) {
    const found = findAlbumInCache(albumName, artistName);
    albumInfo.value = found || { name: albumName, year: null };
  } else {
    albumInfo.value = { name: albumName || null, year: null };
  }
};

// Watch for track changes
watch(() => currentTrack.value?.id, fetchAlbumInfo, { immediate: true });
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
