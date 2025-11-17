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
import { getCachedLovedTracks, calculateLovedTrackPercentage } from '@utils/lastFmUtils';
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

// Last.fm loved tracks data
const lovedTracks = ref([]);
const lovedTracksLoading = ref(false);
const lovedTracksError = ref(null);
const lovedTracksCount = ref(0);

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

/**
 * Fetches loved tracks and calculates percentage for the current album
 */
const fetchLovedTracks = async () => {
  if (!userData.value?.lastFmUserName || !album.value) {
    return;
  }

  try {
    lovedTracksLoading.value = true;
    lovedTracksError.value = null;
    
    // Use the cached utility function to get loved tracks
    lovedTracks.value = await getCachedLovedTracks(userData.value.lastFmUserName);
    
    if (lovedTracks.value.length > 0 && tracks.value.length > 0) {
      // Calculate the loved track percentage using the utility function
      const result = await calculateLovedTrackPercentage(album.value, lovedTracks.value, tracks.value);
      lovedTracksCount.value = result.lovedCount;
    } else {
      lovedTracksCount.value = 0;
    }
    
  } catch (err) {
    logAlbum('Error fetching loved tracks:', err);
    lovedTracksError.value = err.message || 'Failed to fetch loved tracks';
  } finally {
    lovedTracksLoading.value = false;
  }
};

// Watch for changes to tracks data and recalculate loved tracks count
watch([tracks], async () => {
  if (tracks.value.length > 0 && lovedTracks.value.length > 0 && album.value) {
    try {
      const result = await calculateLovedTrackPercentage(album.value, lovedTracks.value, tracks.value);
      lovedTracksCount.value = result.lovedCount;
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
    album: album.value.name || ''
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
    
    const [albumData, tracksData] = await Promise.all([
      getAlbum(albumId),
      fetchAllTracks(albumId)
    ]);
    
    album.value = albumData;
    tracks.value = tracksData;
    
    // Check if album exists in the albums collection
    const albumRef = doc(db, 'albums', albumId);
    const albumDoc = await getDoc(albumRef);
    albumExists.value = albumDoc.exists();
    
    // Fetch current playlist info if available
    if (albumId) {
      currentPlaylistInfo.value = await getCurrentPlaylistInfo(albumId);
      await checkIfNeedsUpdate();
    }
    
    // Fetch Last.fm loved tracks if user has Last.fm username
    if (userData.value?.lastFmUserName) {
      await fetchLovedTracks();
    }
  } catch (err) {
    logAlbum('Error in AlbumView:', err);
    error.value = err.message || 'Failed to load album details. Please try refreshing the page.';
  } finally {
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
          <div class="mb-6 flex gap-4">
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
          </div>
          
          <!-- Last.fm Loved Tracks Info -->
          <div v-if="userData?.lastFmUserName" class="mb-6">
            <div v-if="lovedTracksLoading" class="text-sm text-gray-600">
              <span class="animate-pulse">Loading loved tracks...</span>
            </div>
            <div v-else-if="lovedTracksError" class="text-sm text-red-500">
              <span>{{ lovedTracksError }}</span>
            </div>
            <div v-else-if="!lovedTracksLoading" class="bg-mint bg-opacity-20 border border-mint rounded-lg p-4">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-5 h-5 text-mint" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
                </svg>
                <span class="font-semibold text-delft-blue">Last.fm Loved Tracks</span>
              </div>
              <p class="text-delft-blue">
                <span class="font-bold text-lg">{{ lovedTracksCount }}</span> 
                {{ lovedTracksCount === 1 ? 'track' : 'tracks' }} from this album 
                {{ lovedTracksCount === 1 ? 'is' : 'are' }} in your loved tracks
                <span v-if="tracks.length > 0 && lovedTracksCount > 0" class="text-sm text-gray-600">
                  ({{ Math.round((lovedTracksCount / tracks.length) * 100) }}% of album)
                </span>
              </p>
              <p v-if="lovedTracks.length === 0" class="text-sm text-gray-600 mt-1">
                No loved tracks found for {{ userData.lastFmUserName }}
              </p>
            </div>
          </div>
          
          <TrackList 
            :tracks="tracks" 
            :lovedTracks="lovedTracks"
            :albumArtist="album.artists[0]?.name || ''"
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