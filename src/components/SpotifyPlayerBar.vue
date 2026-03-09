<script setup>
import { computed, watch, onUnmounted, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQueueSession } from '@composables/useQueueSession';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUserData } from '@composables/useUserData';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { getCache } from '@utils/cache';
import { logPlayer, logCache } from '@utils/logger';
import { PlayIcon, PauseIcon, HeartIcon, SpeakerWaveIcon, SpeakerXMarkIcon, QueueListIcon, XMarkIcon } from '@heroicons/vue/24/solid';
import { HeartIcon as HeartIconOutline } from '@heroicons/vue/24/outline';
import { trackIdFromUri } from '@utils/spotify';

const router = useRouter();
const { session, upcomingUris } = useQueueSession();
const { getTracks } = useUserSpotifyApi();
const {
  isReady,
  isPlaying,
  currentTrack,
  position,
  duration,
  volume,
  togglePlayback,
  setVolume
} = useSpotifyPlayer();

const albumId = computed(() => {
  const uri = currentTrack.value?.albumUri;
  if (!uri || !uri.startsWith('spotify:album:')) return null;
  return uri.replace('spotify:album:', '');
});

const artistId = computed(() => {
  const uri = currentTrack.value?.artistUri;
  if (!uri || !uri.startsWith('spotify:artist:')) return null;
  return uri.replace('spotify:artist:', '');
});

const navigateToAlbum = () => {
  const id = albumId.value;
  if (id) router.push({ name: 'album', params: { id } });
};

const navigateToArtist = () => {
  const id = artistId.value;
  if (id) router.push({ name: 'artist', params: { id } });
};

const { userData, user } = useUserData();
const { loveTrack, unloveTrack } = useLastFmApi();
const { checkTrackLoved, updateLovedStatus } = useUnifiedTrackCache();
const isLoving = ref(false);
const albumInfo = ref({ name: null, year: null });
const optimisticLovedStatus = ref(null); // Track optimistic loved status for current track

const showPlayer = computed(() => currentTrack.value !== null && isReady.value);
const currentPosition = ref(0);

const QUEUE_DISPLAY_SIZE = 50;
const queuePanelOpen = ref(false);
const queueTrackDetails = ref([]);
const queueLoading = ref(false);
const hasQueue = computed(() => !!session.value);
const upcomingUrisToShow = computed(() => (upcomingUris.value || []).slice(0, QUEUE_DISPLAY_SIZE));

const fetchQueueTrackDetails = async () => {
  const uris = upcomingUrisToShow.value;
  if (!uris.length) {
    queueTrackDetails.value = [];
    return;
  }
  const ids = uris.slice(0, QUEUE_DISPLAY_SIZE).map((uri) => trackIdFromUri(uri)).filter(Boolean);
  if (!ids.length) {
    queueTrackDetails.value = [];
    return;
  }
  queueLoading.value = true;
  try {
    const res = await getTracks(ids);
    const raw = res?.tracks ?? res?.data?.tracks ?? [];
    queueTrackDetails.value = raw.map((t) =>
      t
        ? {
            name: t.name,
            artists: t.artists?.map((a) => a.name).filter(Boolean) || []
          }
        : null
    );
  } catch {
    queueTrackDetails.value = [];
  } finally {
    queueLoading.value = false;
  }
};

const queueAreaRef = ref(null);

const toggleQueuePanel = () => {
  queuePanelOpen.value = !queuePanelOpen.value;
  if (queuePanelOpen.value && upcomingUris.value.length) {
    fetchQueueTrackDetails();
  }
};

const closeQueueSidebar = () => {
  queuePanelOpen.value = false;
};

let volumeThrottleTimer = null;
const volumeBeforeMute = ref(null);

const handleVolumeChange = (value) => {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(value))));
  volume.value = clamped;
  volumeBeforeMute.value = null;
  if (volumeThrottleTimer) clearTimeout(volumeThrottleTimer);
  volumeThrottleTimer = setTimeout(() => setVolume(clamped), 100);
};

const isMuted = computed(() => volume.value === 0);

const toggleMute = () => {
  if (volumeThrottleTimer) {
    clearTimeout(volumeThrottleTimer);
    volumeThrottleTimer = null;
  }
  if (volume.value > 0) {
    volumeBeforeMute.value = volume.value;
    setVolume(0);
  } else {
    const restore = volumeBeforeMute.value ?? 50;
    volumeBeforeMute.value = null;
    setVolume(restore);
  }
};

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

watch(
  () => [...(upcomingUrisToShow.value || [])],
  () => {
    if (queuePanelOpen.value) fetchQueueTrackDetails();
  },
  { deep: true }
);

watch(showPlayer, (visible) => {
  if (!visible) queuePanelOpen.value = false;
});

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
  if (volumeThrottleTimer) {
    clearTimeout(volumeThrottleTimer);
    volumeThrottleTimer = null;
  }
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
  <div>
  <div 
    v-if="showPlayer"
    class="fixed bottom-0 left-0 right-0 bg-delft-blue text-white z-[60] player-bar-shadow"
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
          <button
            v-if="artistId"
            @click="navigateToArtist"
            class="text-sm text-gray-300 truncate text-left hover:text-white hover:underline transition-colors cursor-pointer block w-full"
          >
            {{ currentTrack?.artists?.join(', ') }}
          </button>
          <p v-else class="text-sm text-gray-300 truncate">
            {{ currentTrack?.artists?.join(', ') }}
          </p>
          <button
            v-if="(albumInfo.year || albumInfo.name) && albumId"
            @click="navigateToAlbum"
            class="text-xs text-gray-400 truncate text-left hover:text-white hover:underline transition-colors cursor-pointer block w-full"
          >
            {{ albumInfo.year || '' }}{{ albumInfo.year && albumInfo.name ? ' - ' : '' }}{{ albumInfo.name || '' }}
          </button>
          <p v-else-if="albumInfo.year || albumInfo.name" class="text-xs text-gray-400 truncate">
            {{ albumInfo.year || '' }}{{ albumInfo.year && albumInfo.name ? ' - ' : '' }}{{ albumInfo.name || '' }}
          </p>
        </div>
        
        <div class="flex items-center gap-2 flex-shrink-0 controls-container">
          <button
            @click="togglePlayback"
            class="p-2.5 hover:bg-white/20 rounded-full transition-colors control-button ring-1 ring-white/40 sm:ring-0"
            :title="isPlaying ? 'Pause' : 'Play'"
          >
            <PauseIcon v-if="isPlaying" class="w-7 h-7" />
            <PlayIcon v-else class="w-7 h-7 play-icon-offset" />
          </button>
        </div>
        
        <div class="flex-shrink-0 text-sm text-gray-300 duration-display">
          <span>{{ formatTime(currentPosition) }}</span>
          <span class="mx-2">/</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
        
        <div class="hidden sm:flex items-center gap-2 volume-control flex-shrink-0" title="Volume">
          <button
            type="button"
            @click="toggleMute"
            class="p-2 hover:bg-white/20 rounded-full transition-colors flex-shrink-0 control-button"
            :title="isMuted ? 'Unmute' : 'Mute'"
          >
<SpeakerXMarkIcon v-if="isMuted" class="w-6 h-6 text-gray-300" />
              <SpeakerWaveIcon v-else class="w-6 h-6 text-gray-300" />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            :value="volume"
            @input="handleVolumeChange($event.target.value)"
            class="w-20 h-1.5 accent-mindero bg-white/20 rounded-full appearance-none cursor-pointer volume-slider"
          />
        </div>
        
        <div class="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-2 flex-shrink-0">
          <button
            v-if="canLoveTracks"
            @click="handleHeartClick"
            :disabled="isLoving"
            class="p-2 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50 control-button sm:hidden"
            :title="isCurrentTrackLoved ? 'Unlove track' : 'Love track'"
          >
            <HeartIcon v-if="isCurrentTrackLoved" class="w-6 h-6 text-raspberry" />
            <HeartIconOutline v-else class="w-6 h-6" />
          </button>
          <button
            v-if="canLoveTracks"
            @click="handleHeartClick"
            :disabled="isLoving"
            class="hidden sm:flex p-2 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50 control-button items-center justify-center"
            :title="isCurrentTrackLoved ? 'Unlove track' : 'Love track'"
          >
            <HeartIcon v-if="isCurrentTrackLoved" class="w-6 h-6 text-raspberry" />
            <HeartIconOutline v-else class="w-6 h-6" />
          </button>
          <div v-if="hasQueue" class="relative" ref="queueAreaRef">
            <button
              @click.stop="toggleQueuePanel"
              class="p-2 hover:bg-white/20 rounded-full transition-colors control-button flex items-center gap-1"
              :class="{ 'bg-white/20': queuePanelOpen }"
              :title="'Up next: ' + (upcomingUris?.length ?? 0) + ' tracks'"
            >
              <QueueListIcon class="w-6 h-6" />
            </button>
          </div>
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

  <Teleport to="body">
    <div
      v-if="hasQueue"
      class="queue-sidebar"
      :class="{ 'queue-sidebar-open': queuePanelOpen }"
      role="dialog"
      aria-label="Up next queue"
    >
      <div class="flex items-center justify-between p-3 border-b border-white/20 sticky top-0 bg-delft-blue z-10">
        <h2 class="font-semibold text-lg text-white pl-[3px]">
          Up next
        </h2>
        <button
          type="button"
          @click="closeQueueSidebar"
          class="p-2 hover:bg-white/20 rounded-full transition-colors text-white"
          aria-label="Close queue"
        >
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>
      <div v-if="queueLoading" class="p-4 text-gray-400 text-sm">Loading…</div>
      <ul v-else class="p-2 divide-y divide-white/10 overflow-y-auto flex-1">
        <li
          v-for="(item, i) in queueTrackDetails"
          :key="i"
          class="py-2 px-2 text-sm truncate"
        >
          <span v-if="item" class="text-white">{{ item.name }}</span>
          <span v-else class="text-gray-500">—</span>
          <span v-if="item?.artists?.length" class="text-gray-400 block truncate">
            {{ item.artists.join(', ') }}
          </span>
        </li>
        <li v-if="!queueLoading && !queueTrackDetails.length && upcomingUrisToShow?.length" class="py-2 pl-2 text-white text-sm">
          No track details
        </li>
      </ul>
    </div>
  </Teleport>
  </div>
</template>

<style scoped>
.player-bar-shadow {
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.2);
}

.play-icon-offset {
  transform: translateX(2px);
}

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

.volume-slider {
  -webkit-appearance: none;
  appearance: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: theme('colors.mindero');
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: theme('colors.mindero');
  cursor: pointer;
  border: none;
}

/* Queue sidebar (teleported to body) */
.queue-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  width: 20rem;
  height: calc(100vh - 5.5rem);
  background: #23395b;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: -2px 0 6px rgba(0, 0, 0, 0.2);
  z-index: 50;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.3s ease-out;
  font-family: Chivo, sans-serif;
}

.queue-sidebar-open {
  transform: translateX(0);
}
</style>
