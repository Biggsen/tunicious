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
  },
  sessionKey: {
    type: String,
    default: ''
  },
  allowLoving: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['track-loved', 'track-unloved']);


/**
 * Create a lookup map of loved tracks for better performance
 */
const lovedTracksLookup = computed(() => {
  console.log('TrackList: Creating loved tracks lookup', {
    lovedTracksCount: props.lovedTracks.length,
    albumArtist: props.albumArtist,
    lovedTracks: props.lovedTracks.slice(0, 3) // Show first 3 for debugging
  });
  
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
  
  console.log('TrackList: Created lookup with keys', Array.from(lookup).slice(0, 5)); // Show first 5 keys
  
  return lookup;
});

/**
 * Check if a track is in the user's loved tracks
 */
const isTrackLoved = (track) => {
  if (!lovedTracksLookup.value.size || !props.albumArtist) {
    console.log('TrackList: No loved tracks lookup or album artist', {
      lookupSize: lovedTracksLookup.value.size,
      albumArtist: props.albumArtist,
      trackName: track.name
    });
    return false;
  }

  const trackName = track.name.toLowerCase();
  const trackArtists = track.artists.map(artist => artist.name.toLowerCase());
  const albumArtistLower = props.albumArtist.toLowerCase();

  // Check against album artist first (most common case)
  const albumArtistKey = `${trackName}|${albumArtistLower}`;
  if (lovedTracksLookup.value.has(albumArtistKey)) {
    console.log('TrackList: Track is loved (album artist match)', {
      trackName: track.name,
      albumArtist: props.albumArtist,
      key: albumArtistKey
    });
    return true;
  }

  // Check against all track artists
  const trackArtistMatches = trackArtists.some(artistName => {
    const key = `${trackName}|${artistName}`;
    const isMatch = lovedTracksLookup.value.has(key);
    if (isMatch) {
      console.log('TrackList: Track is loved (track artist match)', {
        trackName: track.name,
        artistName,
        key
      });
    }
    return isMatch;
  });

  if (!trackArtistMatches) {
    console.log('TrackList: Track is not loved', {
      trackName: track.name,
      albumArtist: props.albumArtist,
      trackArtists,
      lookupKeys: Array.from(lovedTracksLookup.value)
    });
  }

  return trackArtistMatches;
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
    <h2 class="text-xl font-bold text-delft-blue mb-4">Track List</h2>
    <ul class="space-y-2">
      <li 
        v-for="(track, index) in tracks" 
        :key="track.id"
        class="flex justify-between items-center text-delft-blue"
      >
        <span class="flex items-center">
          <span class="mr-2">{{ index + 1 }}.</span>
          <span class="flex-1">{{ track.name }}</span>
        </span>
        <svg 
          v-if="isTrackLoved(track)" 
          class="w-4 h-4 text-red-500 flex-shrink-0 cursor-pointer hover:text-red-600 transition-colors" 
          fill="currentColor" 
          viewBox="0 0 20 20"
          :title="allowLoving ? 'Click to unlike' : 'Loved on Last.fm'"
          @click="handleHeartClick(track, $event)"
        >
          <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
        </svg>
        <svg 
          v-else-if="allowLoving && sessionKey" 
          class="w-4 h-4 text-gray-400 flex-shrink-0 cursor-pointer hover:text-red-500 transition-colors" 
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