<script setup>
import { computed } from 'vue';

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
  }
});

const formatDuration = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

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
  if (lovedTracksLookup.value.has(`${trackName}|${albumArtistLower}`)) {
    return true;
  }

  // Check against all track artists
  return trackArtists.some(artistName => 
    lovedTracksLookup.value.has(`${trackName}|${artistName}`)
  );
};
</script>

<template>
  <div class="bg-white border-2 border-delft-blue rounded-xl p-4">
    <h2 class="text-xl font-bold text-delft-blue mb-4">Track List</h2>
    <ul class="space-y-2">
      <li 
        v-for="(track, index) in tracks" 
        :key="track.id"
        class="flex justify-between items-center text-delft-blue"
      >
        <span class="flex-1 flex items-center">
          <span class="mr-2">{{ index + 1 }}.</span>
          <span class="flex-1">{{ track.name }}</span>
          <svg 
            v-if="isTrackLoved(track)" 
            class="w-4 h-4 text-red-500 ml-2 flex-shrink-0" 
            fill="currentColor" 
            viewBox="0 0 20 20"
            title="Loved on Last.fm"
          >
            <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
          </svg>
        </span>
        <span class="ml-4">{{ formatDuration(track.duration_ms) }}</span>
      </li>
    </ul>
  </div>
</template> 