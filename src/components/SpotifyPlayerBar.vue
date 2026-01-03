<script setup>
import { computed, watch, onUnmounted, onMounted, ref } from 'vue';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUserData } from '@composables/useUserData';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
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
const isLoving = ref(false);
const albumInfo = ref({ name: null, year: null });
const optimisticLovedStatus = ref(null); // Track optimistic loved status for current track

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

// Check if current track is loved using unified cache
const isCurrentTrackLoved = computed(() => {
  if (!currentTrack.value?.id || !user.value) {
    return false;
  }
  
  // Use optimistic status if available, otherwise check cache
  if (optimisticLovedStatus.value !== null && currentTrack.value.id === optimisticLovedStatus.value.trackId) {
    return optimisticLovedStatus.value.loved;
  }
  
  try {
    const trackName = currentTrack.value.name;
    const artistName = currentTrack.value.artists?.[0] || '';
    return checkTrackLoved(currentTrack.value.id, trackName, artistName);
  } catch (err) {
    logPlayer('Error checking if track is loved:', err);
    return false;
  }
});

// Check if user can love tracks
const canLoveTracks = computed(() => {
  return !!(userData.value?.lastFmSessionKey && userData.value?.lastFmUserName);
});

// Handle love/unlove action with optimistic UI update
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
  const trackId = currentTrack.value.id;
  const trackName = currentTrack.value.name;
  const artistName = currentTrack.value.artists?.[0] || '';
  
  // Get current loved status from cache (before optimistic update) - use fallback lookup
  const wasLoved = checkTrackLoved(trackId, trackName, artistName);
  const newLovedStatus = !wasLoved;

  logPlayer(`${wasLoved ? 'Unloving' : 'Loving'} track:`, { trackId, trackName, artistName });

  // Optimistic UI update: update local state immediately
  optimisticLovedStatus.value = {
    trackId,
    loved: newLovedStatus
  };

  try {
    // Update loved status in unified cache (optimistic update with background sync)
    await updateLovedStatus(trackId, newLovedStatus, trackName, artistName);
    logPlayer(`Track ${wasLoved ? 'unloved' : 'loved'} successfully`);
    
    // Emit window event to notify other components
    window.dispatchEvent(new CustomEvent(wasLoved ? 'track-unloved-from-player' : 'track-loved-from-player', {
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
    
    // Revert optimistic update on error
    optimisticLovedStatus.value = {
      trackId,
      loved: wasLoved
    };
  } finally {
    isLoving.value = false;
  }
};

// Handle Last.fm sync errors and revert optimistic updates
const handleLastFmSyncError = (event) => {
  const { trackId, attemptedLoved } = event.detail;
  
  // Only revert if this error is for the currently playing track
  if (currentTrack.value?.id === trackId && optimisticLovedStatus.value?.trackId === trackId) {
    logPlayer('Last.fm sync error for current track, reverting optimistic update:', { trackId, attemptedLoved });
    
    // Revert to the opposite of what we tried to set
    optimisticLovedStatus.value = {
      trackId,
      loved: !attemptedLoved
    };
  }
};

// Handle track loved/unloved from tracklist
const handleTrackLovedFromTracklist = (event) => {
  const { track } = event.detail;
  if (!track || !currentTrack.value) {
    logPlayer('handleTrackLovedFromTracklist: missing track or currentTrack');
    return;
  }
  
  logPlayer('handleTrackLovedFromTracklist received:', { 
    eventTrack: { id: track.id, name: track.name, artists: track.artists },
    currentTrack: { id: currentTrack.value.id, name: currentTrack.value.name, artists: currentTrack.value.artists }
  });
  
  // Check if this is the currently playing track
  // First try by ID (might match even if IDs differ due to fallback lookup)
  const idMatch = track.id === currentTrack.value.id;
  
  // Then check by name and artist
  const nameMatch = track.name?.toLowerCase() === currentTrack.value.name?.toLowerCase();
  
  // Handle different artist formats
  // Tracklist track: artists is array of objects { id, name }
  // Player track: artists is array of strings
  const trackArtist = typeof track.artists?.[0] === 'string' 
    ? track.artists[0] 
    : track.artists?.[0]?.name || '';
  const currentArtist = typeof currentTrack.value.artists?.[0] === 'string'
    ? currentTrack.value.artists[0]
    : currentTrack.value.artists?.[0]?.name || '';
  const artistMatch = trackArtist?.toLowerCase() === currentArtist?.toLowerCase();
  
  if (idMatch || (nameMatch && artistMatch)) {
    logPlayer('Track loved from tracklist, updating player bar UI:', { 
      trackId: currentTrack.value.id, 
      trackName: track.name,
      matchedBy: idMatch ? 'id' : 'name+artist'
    });
    
    // Update optimistic status
    optimisticLovedStatus.value = {
      trackId: currentTrack.value.id,
      loved: true
    };
  } else {
    logPlayer('Track from tracklist does not match current track:', {
      nameMatch,
      artistMatch,
      trackArtist,
      currentArtist
    });
  }
};

const handleTrackUnlovedFromTracklist = (event) => {
  const { track } = event.detail;
  if (!track || !currentTrack.value) {
    logPlayer('handleTrackUnlovedFromTracklist: missing track or currentTrack');
    return;
  }
  
  logPlayer('handleTrackUnlovedFromTracklist received:', { 
    eventTrack: { id: track.id, name: track.name, artists: track.artists },
    currentTrack: { id: currentTrack.value.id, name: currentTrack.value.name, artists: currentTrack.value.artists }
  });
  
  // Check if this is the currently playing track
  // First try by ID (might match even if IDs differ due to fallback lookup)
  const idMatch = track.id === currentTrack.value.id;
  
  // Then check by name and artist
  const nameMatch = track.name?.toLowerCase() === currentTrack.value.name?.toLowerCase();
  
  // Handle different artist formats
  // Tracklist track: artists is array of objects { id, name }
  // Player track: artists is array of strings
  const trackArtist = typeof track.artists?.[0] === 'string' 
    ? track.artists[0] 
    : track.artists?.[0]?.name || '';
  const currentArtist = typeof currentTrack.value.artists?.[0] === 'string'
    ? currentTrack.value.artists[0]
    : currentTrack.value.artists?.[0]?.name || '';
  const artistMatch = trackArtist?.toLowerCase() === currentArtist?.toLowerCase();
  
  if (idMatch || (nameMatch && artistMatch)) {
    logPlayer('Track unloved from tracklist, updating player bar UI:', { 
      trackId: currentTrack.value.id, 
      trackName: track.name,
      matchedBy: idMatch ? 'id' : 'name+artist'
    });
    
    // Update optimistic status
    optimisticLovedStatus.value = {
      trackId: currentTrack.value.id,
      loved: false
    };
  } else {
    logPlayer('Track from tracklist does not match current track:', {
      nameMatch,
      artistMatch,
      trackArtist,
      currentArtist
    });
  }
};

// Watch for track changes to sync optimistic status with cache
watch(() => currentTrack.value?.id, (newTrackId) => {
  if (newTrackId) {
    // Reset optimistic status when track changes
    optimisticLovedStatus.value = null;
    
    // Sync with cache for new track (use fallback lookup)
    try {
      const trackName = currentTrack.value?.name;
      const artistName = currentTrack.value?.artists?.[0] || '';
      const loved = checkTrackLoved(newTrackId, trackName, artistName);
      optimisticLovedStatus.value = {
        trackId: newTrackId,
        loved
      };
    } catch (err) {
      optimisticLovedStatus.value = {
        trackId: newTrackId,
        loved: false
      };
    }
  } else {
    optimisticLovedStatus.value = null;
  }
}, { immediate: true });

// No need to load loved tracks - unified cache handles this automatically
onMounted(() => {
  logPlayer('SpotifyPlayerBar mounted');
  
  // Listen for Last.fm sync errors
  window.addEventListener('lastfm-sync-error', handleLastFmSyncError);
  // Listen for track loved/unloved from tracklist
  window.addEventListener('track-loved-from-tracklist', handleTrackLovedFromTracklist);
  window.addEventListener('track-unloved-from-tracklist', handleTrackUnlovedFromTracklist);
});

onUnmounted(() => {
  // Clean up event listeners
  window.removeEventListener('lastfm-sync-error', handleLastFmSyncError);
  window.removeEventListener('track-loved-from-tracklist', handleTrackLovedFromTracklist);
  window.removeEventListener('track-unloved-from-tracklist', handleTrackUnlovedFromTracklist);
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
    <div class="container mx-auto px-4 py-3 player-container">
      <div class="flex items-center gap-4 player-content">
        <div class="flex-shrink-0">
          <img 
            v-if="currentTrack?.image" 
            :src="currentTrack.image" 
            :alt="currentTrack.name"
            class="w-16 h-16 rounded object-cover"
          />
        </div>
        
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold truncate track-title">{{ currentTrack?.name }}</h3>
          <p class="text-sm text-gray-300 truncate">
            {{ currentTrack?.artists?.join(', ') }}
          </p>
          <p v-if="albumInfo.year || albumInfo.name" class="text-xs text-gray-400 truncate">
            {{ albumInfo.year || '' }}{{ albumInfo.year && albumInfo.name ? ' - ' : '' }}{{ albumInfo.name || '' }}
          </p>
        </div>
        
        <div class="flex items-center gap-2 flex-shrink-0 controls-container">
          <button
            v-if="canLoveTracks"
            @click="handleHeartClick"
            :disabled="isLoving"
            class="p-2 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50 control-button"
            :title="isCurrentTrackLoved ? 'Unlove track' : 'Love track'"
          >
            <HeartIcon v-if="isCurrentTrackLoved" class="w-6 h-6 text-raspberry" />
            <HeartIconOutline v-else class="w-6 h-6" />
          </button>
          <button
            @click="togglePlayback"
            class="p-2 hover:bg-white/20 rounded-full transition-colors control-button"
            :title="isPlaying ? 'Pause' : 'Play'"
          >
            <PauseIcon v-if="isPlaying" class="w-6 h-6" />
            <PlayIcon v-else class="w-6 h-6" />
          </button>
        </div>
        
        <div class="flex-shrink-0 text-sm text-gray-300 duration-display">
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
@media (max-width: 549px) {
  .player-container {
    padding-top: 0.45rem;
    padding-bottom: 0.75rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
  
  .player-content {
    gap: 0.75rem;
  }
  
  .flex-shrink-0 img {
    width: 3.25rem;
    height: 3.25rem;
  }
  
  .duration-display {
    display: none;
  }
  
  .controls-container {
    flex-direction: column;
    gap: 0;
  }
  
  .control-button {
    padding: 0.25rem;
  }
  
  .track-title {
    font-size: 0.875rem;
  }
}
</style>
