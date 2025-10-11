<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useLastFmApi } from '@composables/useLastFmApi';

const props = defineProps({
  tracks: {
    type: Array,
    required: true
  },
  lovedTracks: {
    type: Array,
    default: () => []
  },
  albumArtist: {
    type: String,
    default: ''
  },
  albumTitle: {
    type: String,
    default: ''
  },
  sessionKey: {
    type: String,
    default: ''
  },
  allowLoving: {
    type: Boolean,
    default: false
  },
  lastFmUserName: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['track-loved', 'track-unloved']);

// Last.fm API for playcount data
const { getTrackInfo } = useLastFmApi();
const trackPlaycounts = ref({});
const playcountLoading = ref(false);

/**
 * Format playcount number for display
 */
const formatPlaycount = (count) => {
  if (!count || count === 0) return '0';
  const num = parseInt(count);
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * Fetch playcount data for tracks
 */
const fetchTrackPlaycounts = async () => {
  if (!props.lastFmUserName || !props.albumArtist || !props.tracks.length) {
    return;
  }

  try {
    playcountLoading.value = true;
    const playcountMap = {};
    
    // Fetch playcount for each track individually
    const trackPromises = props.tracks.map(async (track) => {
      try {
        const response = await getTrackInfo(track.name, props.albumArtist, props.lastFmUserName);
        if (response.track && response.track.userplaycount !== undefined) {
          return {
            trackName: track.name.toLowerCase(),
            playcount: parseInt(response.track.userplaycount) || 0
          };
        }
      } catch (error) {
        console.warn(`Failed to fetch playcount for track "${track.name}":`, error);
      }
      return {
        trackName: track.name.toLowerCase(),
        playcount: 0
      };
    });
    
    const results = await Promise.allSettled(trackPromises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        playcountMap[result.value.trackName] = result.value.playcount;
      }
    });
    
    trackPlaycounts.value = playcountMap;
  } catch (error) {
    console.error('Error fetching track playcounts:', error);
  } finally {
    playcountLoading.value = false;
  }
};

/**
 * Get playcount for a specific track
 */
const getTrackPlaycount = (trackName) => {
  return trackPlaycounts.value[trackName.toLowerCase()] || 0;
};

// Watch for changes in props that affect playcount fetching
watch([() => props.lastFmUserName, () => props.albumArtist, () => props.tracks], 
  () => {
    if (props.lastFmUserName && props.albumArtist && props.tracks.length) {
      fetchTrackPlaycounts();
    }
  },
  { immediate: true }
);

/**
 * Create a lookup map of loved tracks for better performance
 */
const lovedTracksLookup = computed(() => {
  if (!props.lovedTracks.length) return new Set();
  
  const lookup = new Set();
  const albumArtistLower = props.albumArtist.toLowerCase();
  
  props.lovedTracks.forEach(lovedTrack => {
    const trackName = lovedTrack.name?.toLowerCase();
    const artistName = lovedTrack.artist?.name?.toLowerCase();
    
    if (trackName && artistName) {
      // Create lookup keys for different artist combinations
      lookup.add(`${trackName}|${artistName}`);
      if (artistName === albumArtistLower) {
        lookup.add(`${trackName}|${albumArtistLower}`);
      }
    }
  });
  
  return lookup;
});

/**
 * Check if a track is in the user's loved tracks
 */
const isTrackLoved = (track) => {
  if (!lovedTracksLookup.value.size || !props.albumArtist) {
    return false;
  }

  const trackName = track.name.toLowerCase();
  const trackArtists = track.artists.map(artist => artist.name.toLowerCase());
  const albumArtistLower = props.albumArtist.toLowerCase();

  // Check against album artist first (most common case)
  const albumArtistKey = `${trackName}|${albumArtistLower}`;
  if (lovedTracksLookup.value.has(albumArtistKey)) {
    return true;
  }

  // Check against all track artists
  return trackArtists.some(artistName => {
    const key = `${trackName}|${artistName}`;
    return lovedTracksLookup.value.has(key);
  });
};

/**
 * Handle heart icon click
 */
const handleHeartClick = async (track, event) => {
  event.preventDefault();
  event.stopPropagation();

  if (!props.allowLoving || !props.sessionKey) {
    return;
  }

  const isLoved = isTrackLoved(track);
  
  if (isLoved) {
    emit('track-unloved', track);
  } else {
    emit('track-loved', track);
  }
};
</script>

<template>
  <div class="bg-white border-2 border-delft-blue rounded-xl p-4">
    <h2 class="text-xl font-bold text-delft-blue mb-4 px-3">Track List</h2>
    <ul>
      <li 
        v-for="(track, index) in tracks" 
        :key="track.id"
        class="flex justify-between items-start text-delft-blue hover:bg-white/30 rounded pl-3 pr-2 py-1 transition-colors cursor-pointer"
      >
        <span class="flex items-start flex-1">
          <span class="mr-2 flex-shrink-0 w-4 text-right">{{ index + 1 }}</span>
          <span class="flex-1">{{ track.name }}</span>
          <span v-if="lastFmUserName && !playcountLoading" class="ml-2 text-xs text-gray-500 flex-shrink-0">
            {{ formatPlaycount(getTrackPlaycount(track.name)) }}
          </span>
          <span v-else-if="playcountLoading" class="ml-2 text-xs text-gray-400 flex-shrink-0">
            ...
          </span>
        </span>
        <svg 
          v-if="isTrackLoved(track)" 
          class="w-4 h-4 text-red-500 flex-shrink-0 cursor-pointer hover:text-red-600 transition-colors ml-2" 
          fill="currentColor" 
          viewBox="0 0 20 20"
          :title="allowLoving ? 'Click to unlike' : 'Loved on Last.fm'"
          @click="handleHeartClick(track, $event)"
        >
          <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
        </svg>
        <svg 
          v-else-if="allowLoving && sessionKey" 
          class="w-4 h-4 text-gray-400 flex-shrink-0 cursor-pointer hover:text-red-500 transition-colors ml-2" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          title="Click to love"
          @click="handleHeartClick(track, $event)"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
        </svg>
      </li>
    </ul>
  </div>
</template> 