<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useCurrentPlayingTrack } from '@composables/useCurrentPlayingTrack';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { PlayIcon, PauseIcon } from '@heroicons/vue/24/solid';

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
    default: '',
    description: 'Last.fm username for fetching playcounts and current playing track'
  },
  albumId: {
    type: String,
    default: '',
    description: 'Spotify album ID for finding next album in playlist'
  },
  playlistId: {
    type: String,
    default: '',
    description: 'Spotify playlist ID for finding next album'
  },
  playlistName: {
    type: String,
    default: '',
    description: 'Playlist name for tracking context'
  },
  albumsList: {
    type: Array,
    default: () => [],
    description: 'List of albums in the playlist, ordered by addedAt'
  },
  sortByPlaycount: {
    type: Boolean,
    default: true,
    description: 'Whether to sort tracks by playcount (descending)'
  }
});

const emit = defineEmits(['track-loved', 'track-unloved']);

// Last.fm API for playcount data
const { getTrackInfo } = useLastFmApi();
const trackPlaycounts = ref({});
const playcountLoading = ref(false);

// Current playing track functionality
const { isTrackCurrentlyPlaying } = useCurrentPlayingTrack(props.lastFmUserName);

// Spotify player functionality
const { 
  isReady: playerReady, 
  isPlaying, 
  currentTrack: playerCurrentTrack,
  playTrack,
  togglePlayback,
  isTrackPlaying,
  addToQueue,
  error: playerError
} = useSpotifyPlayer();

// Spotify API for fetching next album tracks
const { getAlbumTracks } = useUserSpotifyApi();

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

/**
 * Calculate percentage of loved tracks
 */
const lovedTracksPercentage = computed(() => {
  if (!props.tracks.length || !props.lovedTracks.length) {
    return 0;
  }
  
  const lovedCount = props.tracks.filter(track => isTrackLoved(track)).length;
  return Math.round((lovedCount / props.tracks.length) * 100);
});

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
 * Computed property for tracks sorted by playcount (descending)
 */
const sortedTracks = computed(() => {
  // If sorting is disabled, return tracks in original order
  if (!props.sortByPlaycount) {
    return props.tracks;
  }
  
  if (!props.lastFmUserName || Object.keys(trackPlaycounts.value).length === 0) {
    return props.tracks;
  }
  
  return [...props.tracks].sort((a, b) => {
    const playcountA = getTrackPlaycount(a.name);
    const playcountB = getTrackPlaycount(b.name);
    return playcountB - playcountA; // Descending order (highest playcount first)
  });
});

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

/**
 * Find all remaining albums in the playlist sequence (from current to end)
 */
const findRemainingAlbums = () => {
  if (!props.playlistId || !props.albumsList.length || !props.albumId) {
    return [];
  }

  const currentIndex = props.albumsList.findIndex(album => album.id === props.albumId);
  if (currentIndex === -1 || currentIndex === props.albumsList.length - 1) {
    return [];
  }

  // Return all albums from current + 1 to the end
  return props.albumsList.slice(currentIndex + 1);
};

/**
 * Get playcount for a track from Last.fm
 */
const getTrackPlaycountFromLastFm = async (trackName, artistName) => {
  if (!props.lastFmUserName || !artistName) {
    return 0;
  }

  try {
    const response = await getTrackInfo(trackName, artistName, props.lastFmUserName);
    if (response.track && response.track.userplaycount !== undefined) {
      return parseInt(response.track.userplaycount) || 0;
    }
  } catch (error) {
    console.warn(`Failed to fetch playcount for track "${trackName}":`, error);
  }
  return 0;
};

/**
 * Fetch all tracks from an album (handles pagination)
 */
const fetchAllAlbumTracks = async (albumId) => {
  let allTracks = [];
  let offset = 0;
  const limit = 50; // Maximum allowed by Spotify API
  
  while (true) {
    try {
      const response = await getAlbumTracks(albumId, limit, offset);
      if (response.items && response.items.length > 0) {
        allTracks = [...allTracks, ...response.items];
        
        if (response.items.length < limit) {
          break; // No more tracks to fetch
        }
        
        offset += limit;
      } else {
        break; // No more tracks
      }
    } catch (error) {
      console.warn(`Failed to fetch tracks for album ${albumId} at offset ${offset}:`, error);
      break; // Stop fetching on error
    }
  }
  
  return allTracks;
};

/**
 * Select the next track to queue from the next album
 */
const selectNextTrackToQueue = async (nextAlbum) => {
  if (!nextAlbum || !props.lastFmUserName) {
    return null;
  }

  try {
    // Fetch all tracks from the next album (handles pagination)
    const nextAlbumTracks = await fetchAllAlbumTracks(nextAlbum.id);

    if (nextAlbumTracks.length === 0) {
      return null;
    }

    // Get playcounts for all tracks
    const tracksWithPlaycounts = await Promise.all(
      nextAlbumTracks.map(async (track) => {
        const playcount = await getTrackPlaycountFromLastFm(
          track.name,
          nextAlbum.artists?.[0]?.name || nextAlbum.artistName || ''
        );
        return {
          ...track,
          playcount,
          uri: track.uri || `spotify:track:${track.id}`
        };
      })
    );

    // Find the minimum playcount (lowest, including 0)
    const minPlaycount = Math.min(...tracksWithPlaycounts.map(t => t.playcount));
    
    // Filter tracks with the minimum playcount and sort by track number
    const tracksWithMinPlaycount = tracksWithPlaycounts
      .filter(t => t.playcount === minPlaycount)
      .sort((a, b) => {
        // Sort by track number (preserve album order)
        return a.track_number - b.track_number;
      });

    // Take the last 3 tracks with minimum playcount, then select the last one
    const last3Tracks = tracksWithMinPlaycount.slice(-3);
    const selectedTrack = last3Tracks[last3Tracks.length - 1];
    
    return selectedTrack ? selectedTrack.uri : null;
  } catch (error) {
    console.error('Error selecting next track to queue:', error);
    return null;
  }
};

/**
 * Handle track play/pause click
 */
const handleTrackClick = async (track) => {
  if (!playerReady.value) {
    console.warn('Spotify player not ready');
    return;
  }

  const trackUri = track.uri || `spotify:track:${track.id}`;
  const isCurrentlyPlaying = isTrackPlaying(trackUri);

  if (isCurrentlyPlaying && isPlaying.value) {
    // If this track is playing, toggle pause
    await togglePlayback();
  } else {
    // Play this track
    try {
      // Create context if playing from a playlist
      const context = props.playlistId ? {
        type: 'playlist',
        id: props.playlistId,
        name: props.playlistName || 'Unknown Playlist'
      } : null;
      
      await playTrack(trackUri, context);
      
      // After playing, try to add tracks from all remaining albums to queue
      if (props.playlistId && props.albumsList.length > 0 && props.albumId) {
        const remainingAlbums = findRemainingAlbums();
        
        // Queue tracks from all remaining albums
        for (const nextAlbum of remainingAlbums) {
          try {
            const nextTrackUri = await selectNextTrackToQueue(nextAlbum);
            if (nextTrackUri) {
              await addToQueue(nextTrackUri);
              console.log('Added track to queue:', nextTrackUri);
            }
          } catch (queueError) {
            // Continue with next album even if one fails - don't interrupt playback
            console.warn('Failed to add track to queue:', queueError);
          }
        }
      }
    } catch (err) {
      console.error('Error playing track:', err);
    }
  }
};
</script>

<template>
  <div class="bg-white border-2 border-delft-blue p-4">
    <h2 class="text-xl font-bold text-delft-blue mb-4 px-3">Tracks</h2>
    <div v-if="playerError && playerReady" class="mb-2 px-3 text-xs text-red-500">
      {{ playerError }}
    </div>
    <ul>
      <li 
        v-for="track in sortedTracks" 
        :key="track.id"
        :class="[
          'group flex justify-between items-start text-delft-blue hover:bg-white/30 pl-3 pr-2 py-1 transition-colors',
          {
            'bg-mint/20': isTrackCurrentlyPlaying(track.name, albumArtist) || (playerReady && isTrackPlaying(track.uri || `spotify:track:${track.id}`)),
            'font-semibold': isTrackCurrentlyPlaying(track.name, albumArtist) || (playerReady && isTrackPlaying(track.uri || `spotify:track:${track.id}`)),
            'cursor-pointer': playerReady
          }
        ]"
        @click="playerReady ? handleTrackClick(track) : null"
      >
        <span class="flex items-center flex-1">
          <span 
            v-if="playerReady && isTrackPlaying(track.uri || `spotify:track:${track.id}`)" 
            class="mr-1 text-delft-blue flex-shrink-0 cursor-pointer" 
            title="Now Playing - Click to pause"
            @click.stop="togglePlayback()"
          >
            <PauseIcon v-if="isPlaying" class="w-3 h-3" />
            <PlayIcon v-else class="w-3 h-3" />
          </span>
          <span 
            v-else-if="isTrackCurrentlyPlaying(track.name, albumArtist)" 
            class="mr-1 text-delft-blue flex-shrink-0" 
            title="Now Playing (Last.fm)"
          >
            <PlayIcon class="w-3 h-3" />
          </span>
          <span 
            v-else-if="playerReady" 
            class="mr-1 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" 
            title="Click to play"
          >
            <PlayIcon class="w-3 h-3" />
          </span>
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
    
    <!-- Loved tracks progress bar -->
    <div v-if="lastFmUserName && lovedTracksPercentage > 0" class="mt-3 px-3">
      <div class="w-full bg-white rounded-full h-2">
        <div 
          class="bg-red-500 h-2 rounded-full transition-all duration-300" 
          :style="{ width: `${lovedTracksPercentage}%` }"
        ></div>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-xs text-gray-500">Loved tracks</span>
        <span class="text-xs text-delft-blue font-medium">
          {{ lovedTracksPercentage }}%
        </span>
      </div>
    </div>
  </div>
</template> 