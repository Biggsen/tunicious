<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useAlbumsData } from '@composables/useAlbumsData';
import { useCurrentUser } from 'vuefire';
import { useAlbumMappings } from '@composables/useAlbumMappings';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useUserData } from '@composables/useUserData';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { useLastFmSessionModal } from '@composables/useLastFmSessionModal';
import { useToast } from '@composables/useToast';
import { useFriends } from '@composables/useFriends';
import { useAlbumRecommendations } from '@composables/useAlbumRecommendations';
import { getLastFmLink, getRateYourMusicLink } from '@utils/musicServiceLinks';
import { resolvePlaylistNames, resolvePlaylistName } from '@utils/playlistNameResolver';
import BaseLayout from '@components/common/BaseLayout.vue';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import TrackList from '@components/TrackList.vue';
import PlaylistHistoryTimeline from '@components/PlaylistHistoryTimeline.vue';
import AlbumMappingManager from '@components/AlbumMappingManager.vue';
import LastFmSessionExpiredModal from '@components/LastFmSessionExpiredModal.vue';
import BaseModal from '@components/common/BaseModal.vue';
import { PlayIcon } from '@heroicons/vue/24/solid';
import { MegaphoneIcon } from '@heroicons/vue/24/outline';

import { clearCache } from '@utils/cache';
import { logAlbum } from '@utils/logger';

const route = useRoute();
const router = useRouter();
const user = useCurrentUser();
const { userData } = useUserData();
const { getUserLovedTracks } = useLastFmApi();
const { fetchUserAlbumData, getAlbumDetails, searchAlbumsByTitleAndArtistFuzzy, updateAlbumDetails, getFriendsCurrentPlaylistForAlbum } = useAlbumsData();
const { getAlbum, getAlbumTracks, getPlaylist } = useUserSpotifyApi();
const { createMapping, isAlternateId, getPrimaryId } = useAlbumMappings();
const { isReady: playerReady, playAlbum: playAlbumTrack, error: playerError } = useSpotifyPlayer();
const { getAlbumLovedPercentage, addAlbumTracksToCache, getAlbumTracksForAlbum, getAlbumTracksForPlaylist, refreshLovedTracksForUser, refreshPlaycountsForTracks, getPlaycountForTrack, checkTrackLoved, updateLovedStatus } = useUnifiedTrackCache();

// Initialize toast
const { showToast } = useToast();

// Initialize Last.fm session modal
const { showModal: showLastFmSessionModal } = useLastFmSessionModal();

const { getFriends, friends: friendsList } = useFriends();
const { createRecommendation, getPendingRecommendationRecipientIds } = useAlbumRecommendations();

const showRecommendModal = ref(false);
const recommendFriends = ref([]);
const recommendFriendsLoading = ref(false);
const selectedRecommendFriendId = ref(null);
const creatingRecommend = ref(false);
const recommendAlreadySentToIds = ref(new Set());

const openRecommendModal = async () => {
  showRecommendModal.value = true;
  selectedRecommendFriendId.value = null;
  try {
    recommendFriendsLoading.value = true;
    await getFriends();
    recommendFriends.value = friendsList.value ? [...friendsList.value] : [];
    if (album.value?.id) {
      recommendAlreadySentToIds.value = await getPendingRecommendationRecipientIds(album.value.id);
    } else {
      recommendAlreadySentToIds.value = new Set();
    }
  } catch (_) {
    recommendFriends.value = [];
    recommendAlreadySentToIds.value = new Set();
  } finally {
    recommendFriendsLoading.value = false;
  }
};

const handleRecommendConfirm = async () => {
  if (!selectedRecommendFriendId.value || !album.value) return;
  try {
    creatingRecommend.value = true;
    await createRecommendation(album.value, selectedRecommendFriendId.value);
    showToast('Recommendation sent!', 'success');
    showRecommendModal.value = false;
  } catch (e) {
    showToast(e.message || 'Failed to send recommendation', 'error');
  } finally {
    creatingRecommend.value = false;
  }
};

const album = ref(null);
const tracks = ref([]);
const loading = ref(true);
const error = ref(null);
const playlistHistoryEntries = ref([]);
const playlistNamesMap = ref({});
const ALBUM_LISTEN_TAB_KEY = 'album_listen_tab';
const activeListenTab = ref(sessionStorage.getItem(ALBUM_LISTEN_TAB_KEY) || 'history');
const friendsWithAlbum = ref([]);
const friendsTabLoading = ref(false);
const updating = ref(false);
const needsUpdate = ref(false);
const searchResults = ref([]);
const isSearching = ref(false);
const searchError = ref(null);
const isMappedAlbum = ref(false);
const primaryAlbumId = ref(null);
const albumExists = ref(false);
const storedRymLink = ref(null);
const editingRymLink = ref(false);
const rymLinkInput = ref('');
const savingRymLink = ref(false);

// Last.fm loved tracks data (using unified cache)
const lovedTracksCount = ref(0);
const lovedTracksPercentage = ref(0);

const checkIfNeedsUpdate = async () => {
  if (!user.value || !album.value) {
    needsUpdate.value = false;
    return;
  }
  
  const details = await getAlbumDetails(album.value.id);
  needsUpdate.value = details ? !details.albumCover || !details.artistId || !details.releaseYear : false;
};




const fetchAllTracks = async (albumId) => {
  let allTracks = [];
  let offset = 0;
  const limit = 50; // Maximum allowed by Spotify API
  let retryCount = 0;
  const maxRetries = 3;
  
  while (true) {
    try {
      const response = await getAlbumTracks(albumId, limit, offset);
      
      // If we get here, the request was successful
      allTracks = [...allTracks, ...response.items];
      
      if (response.items.length < limit) {
        break; // No more tracks to fetch
      }
      
      offset += limit;
      retryCount = 0; // Reset retry count on successful request
    } catch (err) {
      logAlbum('Error fetching album tracks:', err);
      
      // For 502 Bad Gateway or other server errors, retry a few times
      if (err.status >= 500 && retryCount < maxRetries) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        continue; // Retry the request
      }
      
      throw new Error(`Failed to fetch album tracks: ${err.message}`);
    }
  }
  
  return allTracks;
};

const refreshPlaylistHistory = async () => {
  if (!album.value?.id || !user.value) return;
  const userAlbumData = await fetchUserAlbumData(album.value.id);
  if (userAlbumData?.playlistHistory?.length) {
    playlistHistoryEntries.value = userAlbumData.playlistHistory;
    const ids = [...new Set(userAlbumData.playlistHistory.map(e => e.playlistId).filter(Boolean))];
    playlistNamesMap.value = await resolvePlaylistNames(ids, user.value.uid, getPlaylist);
  } else {
    playlistHistoryEntries.value = [];
    playlistNamesMap.value = {};
  }
};

const loadFriendsAlbumData = async () => {
  if (!album.value?.id || !user.value) return;
  friendsTabLoading.value = true;
  friendsWithAlbum.value = [];
  try {
    await getFriends();
    const friendIds = (friendsList.value || []).map(f => f.id).filter(Boolean);
    if (friendIds.length === 0) {
      friendsWithAlbum.value = [];
      return;
    }
    const raw = await getFriendsCurrentPlaylistForAlbum(album.value.id, friendIds);
    const friendsById = new Map((friendsList.value || []).map(f => [f.id, f]));
    const rows = await Promise.all(
      raw.map(async ({ friendId, playlistId }) => {
        const friend = friendsById.get(friendId);
        const friendDisplayName = friend?.displayName || friend?.email || 'Unknown';
        const friendProfileImageUrl = friend?.profileImageUrl ?? null;
        const playlistName = await resolvePlaylistName(playlistId, friendId, getPlaylist);
        return { friendId, friendDisplayName, friendProfileImageUrl, playlistId, playlistName };
      })
    );
    friendsWithAlbum.value = rows;
  } catch (e) {
    logAlbum('Error loading friends album data:', e);
    friendsWithAlbum.value = [];
  } finally {
    friendsTabLoading.value = false;
  }
};

const handleUpdateAlbumDetails = async () => {
  if (!user.value || !album.value) return;
  
  try {
    updating.value = true;
    error.value = null;
    
    // Prepare details from the Spotify album data (matching PlaylistSingle logic)
    const details = {
      albumCover: album.value.images?.[1]?.url || album.value.images?.[0]?.url || '',
      artistId: album.value.artists?.[0]?.id || '',
      releaseYear: album.value.release_date ? album.value.release_date.substring(0, 4) : '',
    };
    
    await updateAlbumDetails(album.value.id, details);
    
    // Refresh the needsUpdate status
    await checkIfNeedsUpdate();
  } catch (err) {
    logAlbum('Error updating album details:', err);
    error.value = err.message || 'Failed to update album details';
  } finally {
    updating.value = false;
  }
};

const handleCheckExistingAlbum = async () => {
  if (!album.value) return;

  try {
    isSearching.value = true;
    searchError.value = null;
    logAlbum('Starting search for album:', album.value.name, 'by', album.value.artists[0].name);
    searchResults.value = await searchAlbumsByTitleAndArtistFuzzy(
      album.value.name,
      album.value.artists[0].name,
      0.7 // Lower threshold to catch more potential matches
    );
    logAlbum('Search results:', searchResults.value);
  } catch (e) {
    logAlbum('Error searching for existing albums:', e);
    searchError.value = 'Failed to search for existing albums';
  } finally {
    isSearching.value = false;
  }
};

const handleCreateMapping = async (primaryId) => {
  if (!album.value) return;

  try {
    const success = await createMapping(album.value.id, primaryId);
    if (success) {
      // Update mapping status
      isMappedAlbum.value = true;
      primaryAlbumId.value = primaryId;
      
      // Clear search results to close the dialog
      searchResults.value = [];
      
      // Refresh the album data to show the updated state
      await fetchUserAlbumData(route.params.id);
    }
  } catch (e) {
    logAlbum('Error creating mapping:', e);
    searchError.value = 'Failed to create album mapping';
  }
};

const handleCloseDialog = () => {
  searchResults.value = [];
};

const handleUpdateYear = async (primaryId, spotifyYear) => {
  if (!album.value || !spotifyYear) return;
  
  try {
    updating.value = true;
    searchError.value = null;
    
    // Update the database album's releaseYear to match Spotify catalog
    await updateAlbumDetails(primaryId, {
      releaseYear: parseInt(spotifyYear)
    });
    
    // Update the search result to reflect the change
    const resultIndex = searchResults.value.findIndex(r => r.id === primaryId);
    if (resultIndex !== -1) {
      searchResults.value[resultIndex].releaseYear = spotifyYear;
    }
    
    // Show success (you might want to add a success message state)
    logAlbum(`Year updated to ${spotifyYear} for album ${primaryId}`);
  } catch (e) {
    logAlbum('Error updating year:', e);
    searchError.value = 'Failed to update year';
  } finally {
    updating.value = false;
  }
};

const handleEditRymLink = () => {
  editingRymLink.value = true;
  rymLinkInput.value = storedRymLink.value || '';
};

const handleCancelEditRymLink = () => {
  editingRymLink.value = false;
  rymLinkInput.value = '';
};

const handleSaveRymLink = async () => {
  if (!user.value || !album.value) return;
  
  try {
    savingRymLink.value = true;
    error.value = null;
    
    const rymLinkValue = rymLinkInput.value.trim() || null;
    
    await updateAlbumDetails(album.value.id, {
      rymLink: rymLinkValue
    });
    
    storedRymLink.value = rymLinkValue;
    editingRymLink.value = false;
    rymLinkInput.value = '';
    
    logAlbum('RYM link saved:', rymLinkValue);
  } catch (err) {
    logAlbum('Error saving RYM link:', err);
    error.value = err.message || 'Failed to save RYM link';
  } finally {
    savingRymLink.value = false;
  }
};

const handleTrackLoved = async (track) => {
  if (!album.value || !user.value) return;
  
  try {
    // Optimistic UI update: update track in tracks array immediately
    const trackIndex = tracks.value.findIndex(t => t.id === track.id);
    if (trackIndex !== -1) {
      // Create new array to ensure Vue reactivity
      tracks.value = [
        ...tracks.value.slice(0, trackIndex),
        {
          ...tracks.value[trackIndex],
          loved: true
        },
        ...tracks.value.slice(trackIndex + 1)
      ];
    }
    
    // Update loved status in unified cache (optimistic update with background sync)
    await updateLovedStatus(track.id, true);
    
    // Recalculate loved percentage
    const result = await getAlbumLovedPercentage(album.value.id);
    lovedTracksCount.value = result.lovedCount;
    lovedTracksPercentage.value = result.percentage;
    
    // Emit window event to notify player bar
    window.dispatchEvent(new CustomEvent('track-loved-from-tracklist', {
      detail: {
        track: {
          id: track.id,
          name: track.name,
          artists: track.artists || []
        }
      }
    }));
  } catch (err) {
    logAlbum('Error handling track loved:', err);
    
    // Revert optimistic update on error
    const trackIndex = tracks.value.findIndex(t => t.id === track.id);
    if (trackIndex !== -1) {
      tracks.value = [
        ...tracks.value.slice(0, trackIndex),
        {
          ...tracks.value[trackIndex],
          loved: false
        },
        ...tracks.value.slice(trackIndex + 1)
      ];
    }
  }
};

const handleTrackUnloved = async (track) => {
  if (!album.value || !user.value) return;
  
  try {
    // Optimistic UI update: update track in tracks array immediately
    const trackIndex = tracks.value.findIndex(t => t.id === track.id);
    if (trackIndex !== -1) {
      // Create new array to ensure Vue reactivity
      tracks.value = [
        ...tracks.value.slice(0, trackIndex),
        {
          ...tracks.value[trackIndex],
          loved: false
        },
        ...tracks.value.slice(trackIndex + 1)
      ];
    }
    
    // Update loved status in unified cache (optimistic update with background sync)
    await updateLovedStatus(track.id, false);
    
    // Recalculate loved percentage
    const result = await getAlbumLovedPercentage(album.value.id);
    lovedTracksCount.value = result.lovedCount;
    lovedTracksPercentage.value = result.percentage;
    
    // Emit window event to notify player bar
    window.dispatchEvent(new CustomEvent('track-unloved-from-tracklist', {
      detail: {
        track: {
          id: track.id,
          name: track.name,
          artists: track.artists || []
        }
      }
    }));
  } catch (err) {
    logAlbum('Error handling track unloved:', err);
    
    // Revert optimistic update on error
    const trackIndex = tracks.value.findIndex(t => t.id === track.id);
    if (trackIndex !== -1) {
      tracks.value = [
        ...tracks.value.slice(0, trackIndex),
        {
          ...tracks.value[trackIndex],
          loved: true
        },
        ...tracks.value.slice(trackIndex + 1)
      ];
    }
  }
};

// Handle Last.fm sync errors
const handleLastFmSyncError = (event) => {
  const { trackName, artistName, message, isSessionError, trackId, attemptedLoved } = event.detail;
  
  logAlbum('Last.fm sync error received:', { trackId, trackName, artistName, attemptedLoved, message });
  
  // Show modal for session errors, toast for other errors
  if (isSessionError) {
    showLastFmSessionModal(message);
  } else {
    showToast(message, 'error');
  }
  
  // Revert the UI update for all errors (cache already reverted, just need to update UI)
  // The attemptedLoved tells us what we tried to set it to, so we revert to the opposite
  const targetLovedState = !attemptedLoved;
  
  if (trackId) {
    // Find and revert the track in tracks array by trackId
    const trackIndex = tracks.value.findIndex(t => t.id === trackId);
    if (trackIndex !== -1) {
      const track = tracks.value[trackIndex];
      // Only update if current state doesn't match the reverted state
      if (track.loved !== targetLovedState) {
        tracks.value = [
          ...tracks.value.slice(0, trackIndex),
          { ...track, loved: targetLovedState },
          ...tracks.value.slice(trackIndex + 1)
        ];
        
        logAlbum(`Reverted track ${trackId} from ${track.loved} to ${targetLovedState}`);
        
        // Recalculate loved percentage
        if (album.value) {
          getAlbumLovedPercentage(album.value.id).then(result => {
            lovedTracksCount.value = result.lovedCount;
            lovedTracksPercentage.value = result.percentage;
          }).catch(err => {
            logAlbum('Error recalculating loved percentage after revert:', err);
          });
        }
      }
    }
  }
  
  // Fallback: try to find by track name and artist if trackId didn't work
  if (trackName && artistName && !tracks.value.find(t => t.id === trackId)) {
    const trackIndex = tracks.value.findIndex(t => {
      const nameMatch = t.name?.toLowerCase() === trackName?.toLowerCase();
      const artistMatch = t.artists?.some(a => {
        const trackArtist = typeof a === 'string' ? a : a.name;
        return trackArtist?.toLowerCase() === artistName?.toLowerCase();
      });
      return nameMatch && artistMatch;
    });
    
    if (trackIndex !== -1) {
      const track = tracks.value[trackIndex];
      if (track.loved !== targetLovedState) {
        tracks.value = [
          ...tracks.value.slice(0, trackIndex),
          { ...track, loved: targetLovedState },
          ...tracks.value.slice(trackIndex + 1)
        ];
        
        logAlbum(`Reverted track ${trackName} by ${artistName} from ${track.loved} to ${targetLovedState}`);
        
        // Recalculate loved percentage
        if (album.value) {
          getAlbumLovedPercentage(album.value.id).then(result => {
            lovedTracksCount.value = result.lovedCount;
            lovedTracksPercentage.value = result.percentage;
          }).catch(err => {
            logAlbum('Error recalculating loved percentage after revert:', err);
          });
        }
      }
    }
  }
};

// Listen for track loved/unloved from player
const handleTrackLovedFromPlayer = async (event) => {
  const { track } = event.detail;
  if (!track || !user.value || !album.value) return;
  
  // Find the track in tracks array (by name+artist since IDs might differ)
  const foundTrack = tracks.value.find(t => {
    const nameMatch = t.name?.toLowerCase() === track.name?.toLowerCase();
    const artistMatch = t.artists?.some(a => {
      const trackArtist = typeof a === 'string' ? a : a.name;
      const playerArtist = track.artists?.[0];
      return trackArtist?.toLowerCase() === playerArtist?.toLowerCase();
    });
    return nameMatch && artistMatch;
  });
  
  if (foundTrack) {
    // Use the existing handler with the found track (which has the correct ID from cache)
    await handleTrackLoved(foundTrack);
  } else if (track.id) {
    // If track not found, update unified cache directly (with fallback lookup)
    const trackName = track.name;
    const artistName = track.artists?.[0] || '';
    await updateLovedStatus(track.id, true, trackName, artistName);
    
    // Try to find by ID and update if found
    const trackIndex = tracks.value.findIndex(t => t.id === track.id);
    if (trackIndex !== -1) {
      tracks.value = [
        ...tracks.value.slice(0, trackIndex),
        {
          ...tracks.value[trackIndex],
          loved: true
        },
        ...tracks.value.slice(trackIndex + 1)
      ];
      
      // Recalculate loved percentage
      const result = await getAlbumLovedPercentage(album.value.id);
      lovedTracksCount.value = result.lovedCount;
      lovedTracksPercentage.value = result.percentage;
    }
  }
};

const handleTrackUnlovedFromPlayer = async (event) => {
  const { track } = event.detail;
  if (!track || !user.value || !album.value) return;
  
  // Find the track in tracks array (by name+artist since IDs might differ)
  const foundTrack = tracks.value.find(t => {
    const nameMatch = t.name?.toLowerCase() === track.name?.toLowerCase();
    const artistMatch = t.artists?.some(a => {
      const trackArtist = typeof a === 'string' ? a : a.name;
      const playerArtist = track.artists?.[0];
      return trackArtist?.toLowerCase() === playerArtist?.toLowerCase();
    });
    return nameMatch && artistMatch;
  });
  
  if (foundTrack) {
    // Use the existing handler with the found track (which has the correct ID from cache)
    await handleTrackUnloved(foundTrack);
  } else if (track.id) {
    // If track not found, update unified cache directly (with fallback lookup)
    const trackName = track.name;
    const artistName = track.artists?.[0] || '';
    await updateLovedStatus(track.id, false, trackName, artistName);
    
    // Try to find by ID and update if found
    const trackIndex = tracks.value.findIndex(t => t.id === track.id);
    if (trackIndex !== -1) {
      tracks.value = [
        ...tracks.value.slice(0, trackIndex),
        {
          ...tracks.value[trackIndex],
          loved: false
        },
        ...tracks.value.slice(trackIndex + 1)
      ];
      
      // Recalculate loved percentage
      const result = await getAlbumLovedPercentage(album.value.id);
      lovedTracksCount.value = result.lovedCount;
      lovedTracksPercentage.value = result.percentage;
    }
  }
};

// Watch for changes to tracks data and recalculate loved tracks count
watch([tracks], async () => {
  if (tracks.value.length > 0 && album.value && user.value && userData.value?.lastFmUserName) {
    try {
      const result = await getAlbumLovedPercentage(album.value.id);
      lovedTracksCount.value = result.lovedCount;
      lovedTracksPercentage.value = result.percentage;
    } catch (err) {
      logAlbum('Error calculating loved tracks count:', err);
    }
  }
});

watch(activeListenTab, (newVal) => {
  sessionStorage.setItem(ALBUM_LISTEN_TAB_KEY, newVal);
});

// Computed properties for music service links
const lastFmLink = computed(() => {
  if (!userData.value?.lastFmUserName || !album.value) return '#';
  return getLastFmLink({
    lastFmUserName: userData.value.lastFmUserName,
    artist: album.value.artists?.[0]?.name || '',
    album: album.value.name || ''
  });
});

const rymLink = computed(() => {
  if (!album.value) return '#';
  return getRateYourMusicLink({
    artist: album.value.artists?.[0]?.name || '',
    album: album.value.name || '',
    rymLink: storedRymLink.value
  });
});

onMounted(async () => {
  // Listen for track loved/unloved from player
  window.addEventListener('track-loved-from-player', handleTrackLovedFromPlayer);
  window.addEventListener('track-unloved-from-player', handleTrackUnlovedFromPlayer);
  window.addEventListener('lastfm-sync-error', handleLastFmSyncError);
  
  try {
    loading.value = true;
    const albumId = route.params.id;
    
    // Check if this album is already mapped
    isMappedAlbum.value = await isAlternateId(albumId);
    if (isMappedAlbum.value) {
      primaryAlbumId.value = await getPrimaryId(albumId);
    }
    
    // Try to load tracks from unified cache first
    let tracksData = [];
    let albumData = null;
    
    if (user.value) {
      try {
        tracksData = await getAlbumTracksForAlbum(albumId);
        logAlbum('Loaded tracks from album cache:', { albumId, trackCount: tracksData.length });
      } catch (err) {
        logAlbum('Error loading tracks from cache:', err);
      }
    }
    
    // Fetch album data (always needed for display)
    albumData = await getAlbum(albumId);
    album.value = albumData;
    
    // Only fetch tracks from Spotify if not in cache
    if (tracksData.length === 0) {
      logAlbum('Tracks not in cache, fetching from Spotify API');
      tracksData = await fetchAllTracks(albumId);
      
      // Add to cache for future use
      if (user.value && tracksData.length > 0) {
        await addAlbumTracksToCache(albumId, tracksData, {
          name: albumData.name,
          artists: albumData.artists
        });
        logAlbum('Added tracks to cache:', { albumId, trackCount: tracksData.length });
      }
    }
    
    // Ensure tracks are sorted by track_number
    if (tracksData.length > 0) {
      tracksData.sort((a, b) => (a.track_number || 0) - (b.track_number || 0));
    }
    
    // Set tracks immediately so page renders fast
    tracks.value = tracksData;
    
    // Check if album exists in the albums collection (resolves alternate IDs for deduplicated albums)
    const details = await getAlbumDetails(albumId);
    albumExists.value = !!details;
    storedRymLink.value = details?.rymLink ?? null;
    
    if (albumId && user.value) {
      await refreshPlaylistHistory();
      await checkIfNeedsUpdate();
      if (activeListenTab.value === 'friends') {
        await loadFriendsAlbumData();
      }
    }
    
    // Calculate loved percentage from cache (fast, no API call)
    if (userData.value?.lastFmUserName && user.value) {
      try {
        const result = await getAlbumLovedPercentage(albumId);
        lovedTracksCount.value = result.lovedCount;
        lovedTracksPercentage.value = result.percentage;
        logAlbum('Calculated loved percentage from cache:', { albumId, lovedCount: result.lovedCount, percentage: result.percentage });
      } catch (err) {
        logAlbum('Error calculating loved percentage:', err);
      }
    }
    
    // Close loading state - page is now visible
    loading.value = false;
    
    // Load Last.fm data in background (non-blocking) if needed
    // Only refresh if tracks were just added or if data is missing
    if (userData.value?.lastFmUserName && user.value && tracksData.length > 0) {
      // Run in background - don't block UI
      (async () => {
        try {
          const trackIds = tracksData.map(t => t.id).filter(Boolean);
          
          // Check if tracks have Last.fm data already
          // Only refresh loved tracks if we just added tracks to cache (no loved/playcount data yet)
          const hasLastFmData = tracksData.some(t => 
            (t.loved !== undefined && t.loved !== null) || 
            (typeof t.playcount === 'number' && t.playcount > 0)
          );
          
          if (!hasLastFmData) {
            // New tracks without Last.fm data - refresh loved tracks to match them
            await refreshLovedTracksForUser();
            logAlbum('Refreshed loved tracks for new tracks');
          } else {
            logAlbum('Skipped loved tracks refresh (tracks already have Last.fm data)');
          }
          
          // Fetch playcounts for tracks that need it (has threshold check built-in)
          await refreshPlaycountsForTracks(trackIds, null, false);
          logAlbum('Fetched playcounts for tracks:', { trackCount: trackIds.length });
          
          // Reload tracks from cache to get updated playcount/loved data
          let reloadedTracks = [];
          try {
            reloadedTracks = await getAlbumTracksForAlbum(albumId);
          } catch (reloadErr) {
            logAlbum('Error reloading tracks from cache:', reloadErr);
          }
          
          // Update tracks with fresh data if available
          if (reloadedTracks.length > 0 && reloadedTracks.length === tracksData.length) {
            reloadedTracks.sort((a, b) => (a.track_number || 0) - (b.track_number || 0));
            tracks.value = reloadedTracks;
            logAlbum('Updated tracks with fresh Last.fm data');
          } else {
            // Enhance existing tracks with cache lookup
            tracks.value = tracks.value.map(track => ({
              ...track,
              playcount: getPlaycountForTrack(track.id) || track.playcount || 0,
              loved: checkTrackLoved(track.id, track.name, track.artists?.[0]?.name) || track.loved || false
            }));
            logAlbum('Enhanced tracks with cache lookup');
          }
        } catch (err) {
          logAlbum('Error loading Last.fm data in background:', err);
          // Continue - tracks are already shown
        }
      })();
    }
  } catch (err) {
    logAlbum('Error in AlbumView:', err);
    error.value = err.message || 'Failed to load album details. Please try refreshing the page.';
    loading.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener('track-loved-from-player', handleTrackLovedFromPlayer);
  window.removeEventListener('track-unloved-from-player', handleTrackUnlovedFromPlayer);
  window.removeEventListener('lastfm-sync-error', handleLastFmSyncError);
});
</script>

<template>
  <BaseLayout>
    <div class="mb-6 flex items-center justify-between gap-4">
      <BackButton />
      <BaseButton
        v-if="user && album && !loading"
        variant="secondary"
        @click="openRecommendModal"
      >
        <template #icon-left><MegaphoneIcon class="w-5 h-5" /></template>
        Recommend
      </BaseButton>
    </div>

    <div v-if="loading" class="text-center">
      <p class="text-delft-blue text-lg">Loading album details...</p>
    </div>
    
    <div v-else-if="error" class="text-center">
      <p class="text-red-500 text-lg">{{ error }}</p>
    </div>

    <div v-else>
      <!-- Desktop: two columns (cover+tracks | head+listen). Mobile: display:contents + order for head, cover, tracks, listen -->
      <div class="album-layout-grid">
        <div class="album-right-column">
        <!-- head: album title, artist (year, play, links) -->
        <div class="album-head">
            <p class="text-xl text-delft-blue font-bold mb-0">{{ album.release_date.substring(0, 4) }}</p>
            <h1 class="h2 mb-0.5">{{ album.name }}</h1>
            <p
              class="text-xl md:text-2xl text-delft-blue cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200 mb-6"
              @click="router.push({ name: 'artist', params: { id: album.artists[0].id } })"
            >
              {{ album.artists[0].name }}
            </p>
            <BaseButton
              v-if="playerReady"
              variant="primary"
              title="Play album"
              @click="playAlbumTrack(`spotify:album:${album.id}`, 0, { type: 'album', id: album.id, name: album.name })"
            >
              <template #icon-left><PlayIcon class="w-5 h-5" /></template>
              Play
            </BaseButton>
            <div v-if="playerError && playerReady" class="text-sm text-red-500 mb-2">
              {{ playerError }}
            </div>
          </div>

        <!-- listen: listening history in tabbed section -->
        <div class="album-listen">
          <div v-if="albumExists">
            <nav class="-mb-px flex space-x-2 ml-[20px]">
              <button
                @click="activeListenTab = 'history'"
                :class="[
                  'py-3 px-4 font-semibold text-base rounded-t-lg transition-all duration-200',
                  activeListenTab === 'history' ? 'text-delft-blue bg-mint' : 'text-gray-600 hover:text-delft-blue hover:bg-mint'
                ]"
                :aria-current="activeListenTab === 'history' ? 'page' : undefined"
              >
                History
              </button>
              <button
                @click="activeListenTab = 'friends'; loadFriendsAlbumData()"
                :class="[
                  'py-3 px-4 font-semibold text-base rounded-t-lg transition-all duration-200',
                  activeListenTab === 'friends' ? 'text-delft-blue bg-mint' : 'text-gray-600 hover:text-delft-blue hover:bg-mint'
                ]"
                :aria-current="activeListenTab === 'friends' ? 'page' : undefined"
              >
                Friends
              </button>
            </nav>
            <div class="bg-mint p-4 rounded-xl">
              <div class="bg-white border-2 border-delft-blue rounded-lg p-4">
                <template v-if="activeListenTab === 'history'">
                  <PlaylistHistoryTimeline
                    v-if="playlistHistoryEntries.length > 0"
                    :entries="playlistHistoryEntries"
                    :playlist-names="playlistNamesMap"
                  />
                  <p v-else class="text-base">No listening history for this album.</p>
                </template>
                <template v-else>
                  <p v-if="friendsTabLoading" class="text-base">Loading…</p>
                  <p v-else-if="friendsWithAlbum.length === 0" class="text-base">None of your friends have this album in a playlist.</p>
                  <ul v-else class="space-y-3">
                    <li
                      v-for="row in friendsWithAlbum"
                      :key="row.friendId"
                      class="flex flex-wrap items-center gap-x-2 gap-y-1"
                    >
                      <div class="w-6 h-6 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <img
                          v-if="row.friendProfileImageUrl"
                          :src="row.friendProfileImageUrl"
                          alt=""
                          class="w-full h-full object-cover"
                        />
                        <div v-else class="w-full h-full bg-delft-blue flex items-center justify-center text-mindero text-xs font-semibold">
                          {{ row.friendDisplayName?.charAt(0)?.toUpperCase() || '?' }}
                        </div>
                      </div>
                      <span class="font-semibold text-delft-blue">{{ row.friendDisplayName }}</span>
                      <span class="text-stone-500">–</span>
                      <span class="text-delft-blue">{{ row.playlistName }}</span>
                    </li>
                  </ul>
                </template>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div class="album-left-column">
        <!-- cover: album cover -->
        <div class="album-cover">
          <img
            :src="album.images[0].url"
            :alt="album.name"
            class="w-full rounded-xl shadow-lg"
          />
        </div>

        <!-- tracks: tracklist + update/mapping -->
        <div class="album-tracks flex flex-col gap-4">
          <div class="bg-white border-2 border-delft-blue pt-4 pb-4 pr-4 pl-2 rounded-lg">
            <TrackList
              :tracks="tracks"
              :albumArtist="album.artists[0]?.name || ''"
              :albumId="album.id"
              :albumTitle="album.name"
              :lastFmUserName="userData?.lastFmUserName || ''"
              :sortByPlaycount="false"
              :showTrackNumbers="true"
              :sessionKey="userData?.lastFmSessionKey || ''"
              :allowLoving="userData?.lastFmAuthenticated || false"
              :largeElements="true"
              :showDuration="true"
              @track-loved="handleTrackLoved"
              @track-unloved="handleTrackUnloved"
            />
          </div>
          <div v-if="albumExists && needsUpdate">
            <div class="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
              <p class="text-yellow-700 mb-2">
                This album is missing some details.
              </p>
              <BaseButton @click="handleUpdateAlbumDetails" :loading="updating" customClass="playlist-status-btn">
                {{ updating ? 'Updating...' : 'Update Album Details' }}
              </BaseButton>
            </div>
          </div>
          <AlbumMappingManager
            v-if="album && !albumExists"
            :search-results="searchResults"
            :is-searching="isSearching"
            :search-error="searchError"
            :is-mapped-album="isMappedAlbum"
            :primary-album-id="primaryAlbumId"
            :current-album-year="album.release_date ? album.release_date.substring(0, 4) : null"
            @check-existing="handleCheckExistingAlbum"
            @create-mapping="handleCreateMapping"
            @close="handleCloseDialog"
            @update-year="handleUpdateYear"
          />
        </div>

        <div class="album-links flex flex-col gap-2">
          <div class="flex gap-4 items-center flex-wrap">
            <a
              v-if="userData?.lastFmUserName"
              :href="lastFmLink"
              target="_blank"
              class="text-sm lg:text-base text-delft-blue hover:text-blue-500 hover:underline transition-colors duration-200"
            >
              Last.fm
            </a>
            <a
              :href="rymLink"
              target="_blank"
              class="text-sm lg:text-base text-delft-blue hover:text-blue-500 hover:underline transition-colors duration-200"
            >
              RYM
            </a>
            <button
              v-if="albumExists"
              @click="handleEditRymLink"
              class="text-xs text-gray-500 hover:text-gray-700 underline"
              title="Edit RYM link"
            >
              Edit RYM Link
            </button>
          </div>
          <div v-if="editingRymLink" class="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              RYM Link (leave empty to use auto-generated)
            </label>
            <input
              v-model="rymLinkInput"
              type="text"
              placeholder="https://rateyourmusic.com/release/album/artist/album-name/"
              class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-delft-blue focus:border-delft-blue"
            />
            <div class="mt-2 flex gap-2">
              <BaseButton
                @click="handleSaveRymLink"
                :disabled="savingRymLink"
                customClass="btn-primary text-sm px-3 py-1"
              >
                {{ savingRymLink ? 'Saving...' : 'Save' }}
              </BaseButton>
              <BaseButton
                @click="handleCancelEditRymLink"
                :disabled="savingRymLink"
                customClass="btn-secondary text-sm px-3 py-1"
              >
                Cancel
              </BaseButton>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
    <BaseModal
      :visible="showRecommendModal"
      :title="album ? `Recommend ${album.name} to a friend` : 'Recommend to a friend'"
      :show-cancel="true"
      :show-confirm="true"
      confirm-text="Send"
      :confirm-variant="'primary'"
      @close="showRecommendModal = false"
      @cancel="showRecommendModal = false"
      @confirm="handleRecommendConfirm"
    >
      <template #default>
        <p v-if="recommendFriendsLoading" class="text-gray-500">Loading friends...</p>
        <template v-else-if="recommendFriends.length === 0">
          <p class="text-gray-600">Add friends first to recommend albums.</p>
          <router-link to="/friends" class="text-mint font-semibold hover:underline mt-2 inline-block">Go to Friends</router-link>
        </template>
        <template v-else>
          <p class="text-sm text-gray-600 mb-3">Choose a friend:</p>
          <ul class="space-y-2 max-h-60 overflow-y-auto">
            <li
              v-for="friend in recommendFriends"
              :key="friend.id"
              @click="recommendAlreadySentToIds.has(friend.id) ? null : (selectedRecommendFriendId = friend.id)"
              :class="[
                'rounded-lg border-2 py-2 px-3 transition-colors flex items-center gap-3',
                recommendAlreadySentToIds.has(friend.id)
                  ? 'border-gray-300 bg-gray-100 cursor-not-allowed opacity-75'
                  : [
                      'cursor-pointer',
                      selectedRecommendFriendId === friend.id
                        ? 'border-delft-blue bg-mint'
                        : 'bg-white border-delft-blue hover:border-delft-blue/70'
                    ]
              ]"
            >
              <div class="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-delft-blue flex items-center justify-center">
                <img
                  v-if="friend.profileImageUrl"
                  :src="friend.profileImageUrl"
                  :alt="friend.displayName || friend.email || ''"
                  class="w-full h-full object-cover"
                />
                <span v-else class="text-mindero text-sm font-semibold">
                  {{ (friend.displayName || friend.email || '?').charAt(0).toUpperCase() }}
                </span>
              </div>
              <span class="font-semibold text-delft-blue text-sm truncate flex-1 min-w-0">
                {{ friend.displayName || friend.email || friend.id }}
              </span>
              <span v-if="recommendAlreadySentToIds.has(friend.id)" class="text-sm text-gray-500 flex-shrink-0">
                Already recommended
              </span>
            </li>
          </ul>
        </template>
      </template>
      <template #actions>
        <BaseButton variant="default" @click="showRecommendModal = false">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!selectedRecommendFriendId || creatingRecommend || recommendAlreadySentToIds.has(selectedRecommendFriendId)"
          @click="handleRecommendConfirm"
        >
          {{ creatingRecommend ? 'Sending...' : 'Send' }}
        </BaseButton>
      </template>
    </BaseModal>

    <LastFmSessionExpiredModal />
  </BaseLayout>
</template>

<style scoped>
.album-layout-grid {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.album-right-column,
.album-left-column {
  display: contents;
}
.album-head { order: 1; }
.album-cover { order: 2; }
.album-tracks { order: 3; }
.album-listen { order: 4; }
.album-links { order: 5; }
@media (min-width: 768px) {
  .album-layout-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    align-items: start;
  }
  .album-right-column,
  .album-left-column {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  .album-right-column { grid-column: 2; }
  .album-left-column { grid-column: 1; grid-row: 1; }
  .album-head,
  .album-cover,
  .album-tracks,
  .album-listen,
  .album-links { order: unset; }
}
@media (min-width: 1024px) {
  .album-layout-grid {
    grid-template-columns: minmax(0, 500px) 1fr;
  }
}
</style> 