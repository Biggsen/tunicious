<script setup>
import { computed, ref } from 'vue';
import { useCurrentPlayingTrack } from '@composables/useCurrentPlayingTrack';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { PlayIcon, PauseIcon, HeartIcon } from '@heroicons/vue/24/solid';
import { HeartIcon as HeartIconOutline } from '@heroicons/vue/24/outline';
import { logPlayer } from '@utils/logger';

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
  playlistTrackIds: {
    type: Object,
    default: () => ({}),
    description: 'Map of albumId -> Object with track IDs as keys (for all albums in playlist)'
  },
  sortByPlaycount: {
    type: Boolean,
    default: true,
    description: 'Whether to sort tracks by playcount (descending)'
  }
});

const emit = defineEmits(['track-loved', 'track-unloved']);

// Unified track cache for playcount data
const { getPlaycountForTrack } = useUnifiedTrackCache();

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
 * Get playcount for a specific track
 * Uses playcount from unified cache (track.playcount or cache lookup)
 */
const getTrackPlaycount = (track) => {
  // First, check if track has playcount from unified cache
  if (track && typeof track.playcount === 'number') {
    return track.playcount;
  }
  
  // Fall back to cache lookup by track ID
  if (track && track.id) {
    return getPlaycountForTrack(track.id) || 0;
  }
  
  return 0;
};

/**
 * Calculate percentage of loved tracks
 */
const lovedTracksPercentage = computed(() => {
  if (!props.tracks.length) {
    return 0;
  }
  
  // Count tracks that are loved (either from track.loved property or lovedTracks lookup)
  const lovedCount = props.tracks.filter(track => isTrackLoved(track)).length;
  return Math.round((lovedCount / props.tracks.length) * 100);
});


/**
 * Computed property for tracks sorted by playcount (descending)
 */
const sortedTracks = computed(() => {
  // If sorting is disabled, return tracks in original order
  if (!props.sortByPlaycount) {
    return props.tracks;
  }
  
  // Sort by playcount from unified cache (track.playcount) or Last.fm fetched data
  // Even if we don't have Last.fm data yet, we can still sort by cache playcount
  return [...props.tracks].sort((a, b) => {
    const playcountA = getTrackPlaycount(a);
    const playcountB = getTrackPlaycount(b);
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
 * First checks track.loved property (from unified cache), then falls back to lovedTracks lookup
 */
const isTrackLoved = (track) => {
  // First, check if track has loved property from unified cache
  if (track.loved !== undefined) {
    return track.loved === true;
  }

  // Fall back to old lovedTracks lookup for backward compatibility
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
 * Check if a track is in the playlist
 */
const isTrackInPlaylist = (track) => {
  if (!props.playlistId || !props.playlistTrackIds || !props.albumId) {
    return true; // If no playlist context, assume all tracks are "in playlist"
  }
  const albumTrackIds = props.playlistTrackIds[props.albumId];
  if (!albumTrackIds || Object.keys(albumTrackIds).length === 0) {
    return true; // If no tracks for this album, assume all are in playlist
  }
  const trackId = track.id;
  return !!albumTrackIds[trackId];
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
      logPlayer(`Failed to fetch tracks for album ${albumId} at offset ${offset}:`, error);
      break; // Stop fetching on error
    }
  }
  
  return allTracks;
};

/**
 * Select the next track to queue from the next album
 */
const selectNextTrackToQueue = async (nextAlbum) => {
  if (!nextAlbum) {
    return null;
  }

  try {
    // Fetch all tracks from the next album (handles pagination)
    const nextAlbumTracks = await fetchAllAlbumTracks(nextAlbum.id);

    if (nextAlbumTracks.length === 0) {
      return null;
    }

    // Get playcounts for all tracks from cache
    const tracksWithPlaycounts = nextAlbumTracks.map(track => {
      const playcount = getPlaycountForTrack(track.id);
      if (playcount === undefined) {
        // Track not in cache - this indicates a cache issue
        throw new Error(`Track ${track.id} not found in cache`);
      }
      return {
        ...track,
        playcount: playcount || 0,
        uri: track.uri || `spotify:track:${track.id}`
      };
    });

    // Filter to only include tracks that are in the playlist for this next album
    const playlistTracksForNextAlbum = props.playlistTrackIds[nextAlbum.id] || {};
    const tracksInPlaylist = tracksWithPlaycounts.filter(track => {
      if (!props.playlistId || Object.keys(playlistTracksForNextAlbum).length === 0) {
        return true; // If no playlist context, include all tracks
      }
      return !!playlistTracksForNextAlbum[track.id];
    });

    if (tracksInPlaylist.length === 0) {
      return null; // No tracks from this album are in the playlist
    }

    // Find the minimum playcount (lowest, including 0) from tracks in playlist
    const minPlaycount = Math.min(...tracksInPlaylist.map(t => t.playcount));
    
    // Filter tracks with the minimum playcount and sort by track number
    const tracksWithMinPlaycount = tracksInPlaylist
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
    logPlayer('Error selecting next track to queue:', error);
    return null;
  }
};

/**
 * Handle track play/pause click
 */
const handleTrackClick = async (track) => {
  if (!playerReady.value) {
    logPlayer('Spotify player not ready');
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
              logPlayer('Added track to queue:', nextTrackUri);
            }
          } catch (queueError) {
            // Continue with next album even if one fails - don't interrupt playback
            logPlayer('Failed to add track to queue:', queueError);
          }
        }
      }
    } catch (err) {
      logPlayer('Error playing track:', err);
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
          'group flex justify-between items-start text-delft-blue hover:bg-white/30 pl-2 pr-2 py-1 transition-colors',
          {
            'bg-mint/20': isTrackCurrentlyPlaying(track.name, albumArtist) || (playerReady && isTrackPlaying(track.uri || `spotify:track:${track.id}`)),
            'font-semibold': isTrackCurrentlyPlaying(track.name, albumArtist) || (playerReady && isTrackPlaying(track.uri || `spotify:track:${track.id}`)),
            'cursor-pointer': playerReady,
            'opacity-40 text-gray-500': !isTrackInPlaylist(track)
          }
        ]"
        @click="playerReady ? handleTrackClick(track) : null"
      >
        <span class="flex items-start flex-1">
          <span 
            v-if="playerReady && isTrackPlaying(track.uri || `spotify:track:${track.id}`)" 
            class="mr-2 text-delft-blue flex-shrink-0 cursor-pointer self-center" 
            title="Now Playing - Click to pause"
            @click.stop="togglePlayback()"
          >
            <PauseIcon v-if="isPlaying" class="w-3 h-3" />
            <PlayIcon v-else class="w-3 h-3" />
          </span>
          <span 
            v-else-if="isTrackCurrentlyPlaying(track.name, albumArtist)" 
            class="mr-2 text-delft-blue flex-shrink-0 self-center" 
            title="Now Playing (Last.fm)"
          >
            <PlayIcon class="w-3 h-3" />
          </span>
          <span 
            v-else-if="playerReady" 
            class="mr-2 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center" 
            title="Click to play"
          >
            <PlayIcon class="w-3 h-3" />
          </span>
          <span class="flex-1">{{ track.name }}</span>
          <span v-if="lastFmUserName" class="ml-2 text-xs text-gray-500 flex-shrink-0">
            {{ formatPlaycount(getTrackPlaycount(track)) }}
          </span>
        </span>
        <HeartIcon 
          v-if="isTrackLoved(track)" 
          class="w-4 h-4 text-red-500 flex-shrink-0 cursor-pointer hover:text-red-600 transition-colors ml-2" 
          :title="allowLoving ? 'Click to unlike' : 'Loved on Last.fm'"
          @click="handleHeartClick(track, $event)"
        />
        <HeartIconOutline 
          v-else-if="allowLoving && sessionKey" 
          class="w-4 h-4 text-gray-400 flex-shrink-0 cursor-pointer hover:text-red-500 transition-colors ml-2" 
          title="Click to love"
          @click="handleHeartClick(track, $event)"
        />
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