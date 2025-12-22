<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useAlbumsData } from '@composables/useAlbumsData';
import { useCurrentUser } from 'vuefire';
import { doc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAlbumMappings } from '@composables/useAlbumMappings';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useUserData } from '@composables/useUserData';
import { useSpotifyPlayer } from '@composables/useSpotifyPlayer';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { getLastFmLink, getRateYourMusicLink } from '@utils/musicServiceLinks';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import TrackList from '@components/TrackList.vue';
import PlaylistStatus from '@components/PlaylistStatus.vue';
import AlbumMappingManager from '@components/AlbumMappingManager.vue';
import { PlayIcon } from '@heroicons/vue/24/solid';

import { clearCache } from '@utils/cache';
import { logAlbum } from '@utils/logger';

const route = useRoute();
const router = useRouter();
const user = useCurrentUser();
const { userData } = useUserData();
const { getUserLovedTracks } = useLastFmApi();
const { fetchUserAlbumData, getCurrentPlaylistInfo, searchAlbumsByTitleAndArtistFuzzy, addAlbumToCollection, updateAlbumDetails } = useAlbumsData();
const { getAlbum, getAlbumTracks, getPlaylistAlbumsWithDates} = useUserSpotifyApi();
const { createMapping, isAlternateId, getPrimaryId } = useAlbumMappings();
const { isReady: playerReady, playAlbum: playAlbumTrack, error: playerError } = useSpotifyPlayer();
const { getAlbumLovedPercentage, addAlbumTracksToCache, getAlbumTracksForAlbum, getAlbumTracksForPlaylist, refreshLovedTracksForUser, refreshPlaycountsForTracks, getPlaycountForTrack, checkTrackLoved } = useUnifiedTrackCache();


const album = ref(null);
const tracks = ref([]);
const loading = ref(true);
const error = ref(null);
const saving = ref(false);
const currentPlaylistInfo = ref(null);
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
  
  const albumRef = doc(db, 'albums', album.value.id);
  const albumDoc = await getDoc(albumRef);
  
  if (!albumDoc.exists()) {
    needsUpdate.value = false;
    return;
  }
  
  const albumData = albumDoc.data();
  
  // Check for missing album details (matching PlaylistSingle logic)
  needsUpdate.value = !albumData.albumCover || !albumData.artistId || !albumData.releaseYear;
};



const playlistId = computed(() => route.query.playlistId);
const isFromPlaylist = computed(() => !!playlistId.value);

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

const saveAlbum = async () => {
  if (!user.value || !album.value || !playlistId.value) return;
  try {
    saving.value = true;
    error.value = null;
    await addAlbumToCollection({
      album: album.value,
      playlistId: playlistId.value
    });
    currentPlaylistInfo.value = await getCurrentPlaylistInfo(album.value.id);
  } catch (err) {
    logAlbum('Error saving album:', err);
    error.value = err.message || 'Failed to save album';
  } finally {
    saving.value = false;
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
  try {
    loading.value = true;
    const albumId = route.params.id;
    
    // Check if this album is already mapped
    isMappedAlbum.value = await isAlternateId(albumId);
    if (isMappedAlbum.value) {
      primaryAlbumId.value = await getPrimaryId(albumId);
    }
    
    // Try to load tracks from unified cache first (if coming from PlaylistSingle)
    let tracksData = [];
    let albumData = null;
    
    if (user.value) {
      try {
        // If coming from a playlist, try playlist context first
        if (playlistId.value) {
          tracksData = await getAlbumTracksForPlaylist(playlistId.value, albumId);
          logAlbum('Loaded tracks from playlist cache:', { albumId, playlistId: playlistId.value, trackCount: tracksData.length });
        }
        
        // If not found in playlist context, try album context
        if (tracksData.length === 0) {
          tracksData = await getAlbumTracksForAlbum(albumId);
          logAlbum('Loaded tracks from album cache:', { albumId, trackCount: tracksData.length });
        }
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
    
    // Check if album exists in the albums collection
    const albumRef = doc(db, 'albums', albumId);
    const albumDoc = await getDoc(albumRef);
    albumExists.value = albumDoc.exists();
    
    // Fetch stored RYM link if album exists
    if (albumDoc.exists()) {
      const albumData = albumDoc.data();
      storedRymLink.value = albumData.rymLink || null;
    }
    
    // Fetch current playlist info if available
    if (albumId) {
      currentPlaylistInfo.value = await getCurrentPlaylistInfo(albumId);
      await checkIfNeedsUpdate();
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
            if (playlistId.value) {
              reloadedTracks = await getAlbumTracksForPlaylist(playlistId.value, albumId);
            } else {
              reloadedTracks = await getAlbumTracksForAlbum(albumId);
            }
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
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <BackButton />
    </div>

    <div v-if="loading" class="text-center">
      <p class="text-delft-blue text-lg">Loading album details...</p>
    </div>
    
    <div v-else-if="error" class="text-center">
      <p class="text-red-500 text-lg">{{ error }}</p>
    </div>

    <div v-else>
      <div class="flex flex-col md:flex-row gap-8">
        <!-- Album Cover -->
        <div class="md:w-1/2">
          <img 
            :src="album.images[0].url" 
            :alt="album.name"
            class="w-full rounded-xl shadow-lg"
          />
          
                     <!-- Playlist Status -->
           <PlaylistStatus
             v-if="isFromPlaylist"
             :current-playlist-info="currentPlaylistInfo"
             :needs-update="needsUpdate"
             :updating="updating"
             :saving="saving"
             @update="handleUpdateAlbumDetails"
             @save="saveAlbum"
           />
          
          <!-- Album Details Update for non-playlist albums -->
          <div v-if="!isFromPlaylist && albumExists && needsUpdate" class="mt-6">
            <div class="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
              <p class="text-yellow-700 mb-2">
                This album is missing some details.
              </p>
              <BaseButton @click="handleUpdateAlbumDetails" :loading="updating" customClass="playlist-status-btn">
                {{ updating ? 'Updating...' : 'Update Album Details' }}
              </BaseButton>
            </div>
          </div>

          <!-- Album Mapping UI -->
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

        <!-- Album Info -->
        <div class="md:w-1/2">
          <div class="flex items-center gap-3 mb-2">
            <h1 class="h2 flex-1">{{ album.name }}</h1>
            <button
              v-if="playerReady"
              @click="playAlbumTrack(`spotify:album:${album.id}`)"
              class="flex items-center gap-2 px-4 py-2 bg-mint text-delft-blue rounded-lg hover:bg-mint/80 transition-colors font-semibold"
              title="Play album"
            >
              <PlayIcon class="w-5 h-5" />
              <span>Play</span>
            </button>
          </div>
          <p 
            class="text-2xl text-delft-blue mb-4 cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
            @click="router.push({ name: 'artist', params: { id: album.artists[0].id } })"
          >{{ album.artists[0].name }}</p>
          <p class="text-xl text-delft-blue mb-4 font-bold">{{ album.release_date.substring(0, 4) }}</p>
          <div v-if="playerError && playerReady" class="mb-4 text-sm text-red-500">
            {{ playerError }}
          </div>
          
          <!-- Music Service Links -->
          <div class="mb-6">
            <div class="flex gap-4 items-center mb-2">
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
            
            <!-- RYM Link Editor -->
            <div v-if="editingRymLink" class="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
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

          
          <TrackList 
            :tracks="tracks" 
            :albumArtist="album.artists[0]?.name || ''"
            :albumId="album.id"
            :albumTitle="album.name"
            :lastFmUserName="userData?.lastFmUserName || ''"
            :sortByPlaycount="false"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
</style> 