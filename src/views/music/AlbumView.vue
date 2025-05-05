<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSpotifyApi } from '@composables/useSpotifyApi';
import { useAlbumsData } from '@composables/useAlbumsData';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAlbumMappings } from '@composables/useAlbumMappings';
import BackButton from '@components/common/BackButton.vue';
import TrackList from '@components/TrackList.vue';
import PlaylistStatus from '@components/PlaylistStatus.vue';
import AlbumMappingManager from '@components/AlbumMappingManager.vue';
import { usePlaylistMovement } from '@composables/usePlaylistMovement';

const route = useRoute();
const router = useRouter();
const user = useCurrentUser();
const { fetchUserAlbumData, getCurrentPlaylistInfo, searchAlbumsByTitleAndArtist, searchAlbumsByTitleAndArtistFuzzy, addAlbumToCollection } = useAlbumsData();
const { getAlbum, getAlbumTracks, getPlaylistAlbumsWithDates, loading: spotifyLoading, error: spotifyError } = useSpotifyApi();
const { createMapping, isAlternateId, getPrimaryId } = useAlbumMappings();
const { updateAlbumPlaylist, loading: moveLoading, error: moveError } = usePlaylistMovement();

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
  const userData = albumData.userEntries?.[user.value.uid];
  
  needsUpdate.value = !albumData.albumTitle || 
                     !albumData.artistName || 
                     !userData?.playlistHistory?.some(entry => entry.playlistName) ||
                     userData?.playlistHistory?.some(entry => entry.playlistName === 'Unknown Playlist');
};

const hasMoved = computed(() => {
  // If there's no playlistId in the URL or no current playlist info, return false
  if (!playlistId.value || !currentPlaylistInfo.value) {
    return false;
  }

  // Return true if the current playlist ID doesn't match the URL query playlistId
  return currentPlaylistInfo.value.playlistId !== playlistId.value;
});

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
      console.error('Error fetching album tracks:', err);
      
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
    console.error('Error saving album:', err);
    error.value = err.message || 'Failed to save album';
  } finally {
    saving.value = false;
  }
};

const updateAlbumData = async () => {
  if (!user.value || !album.value || !playlistId.value) return;
  
  try {
    updating.value = true;
    error.value = null;
    
    const albumRef = doc(db, 'albums', album.value.id);
    
    // Get existing album data
    const albumDoc = await getDoc(albumRef);
    if (!albumDoc.exists()) {
      throw new Error('Album data not found');
    }
    
    const albumData = albumDoc.data();
    const existingData = albumData.userEntries?.[user.value.uid];
    if (!existingData) {
      throw new Error('User album data not found');
    }
    
    // Get the current playlist data
    const playlistsRef = collection(db, 'playlists');
    const q = query(playlistsRef, where('playlistId', '==', playlistId.value));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('Playlist not found');
    }
    
    const playlistDoc = querySnapshot.docs[0];
    const playlistData = playlistDoc.data();
    
    // Get the Spotify added date for this album
    const albumsWithDates = await getPlaylistAlbumsWithDates(playlistId.value);
    const albumWithDate = albumsWithDates.find(a => a.id === album.value.id);
    const spotifyAddedAt = albumWithDate?.addedAt ? new Date(albumWithDate.addedAt) : new Date();
    
    // Update the album's playlist history
    const success = await updateAlbumPlaylist(album.value.id, playlistData, spotifyAddedAt);
    if (success) {
      // Refresh the current playlist info
      currentPlaylistInfo.value = await getCurrentPlaylistInfo(album.value.id);
    }
  } catch (err) {
    console.error('Error updating album data:', err);
    error.value = err.message || 'Failed to update album data';
  } finally {
    updating.value = false;
  }
};

const updatePlaylist = async () => {
  if (!user.value || !album.value || !playlistId.value) return;
  
  try {
    updating.value = true;
    error.value = null;
    
    // Get the current playlist data
    const playlistsRef = collection(db, 'playlists');
    const q = query(playlistsRef, where('playlistId', '==', playlistId.value));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('Playlist not found');
    }
    
    const playlistData = querySnapshot.docs[0].data();
    
    const success = await updateAlbumPlaylist(album.value.id, playlistData);
    if (success) {
      // Refresh the current playlist info
      currentPlaylistInfo.value = await getCurrentPlaylistInfo(album.value.id);
    }
  } catch (err) {
    console.error('Error updating playlist:', err);
    error.value = moveError.value || 'Failed to update playlist';
  } finally {
    updating.value = false;
  }
};

const handleCheckExistingAlbum = async () => {
  if (!album.value) return;

  try {
    isSearching.value = true;
    searchError.value = null;
    console.log('Starting search for album:', album.value.name, 'by', album.value.artists[0].name);
    searchResults.value = await searchAlbumsByTitleAndArtistFuzzy(
      album.value.name,
      album.value.artists[0].name,
      0.7 // Lower threshold to catch more potential matches
    );
    console.log('Search results:', searchResults.value);
  } catch (e) {
    console.error('Error searching for existing albums:', e);
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
    console.error('Error creating mapping:', e);
    searchError.value = 'Failed to create album mapping';
  }
};

const handleCloseDialog = () => {
  searchResults.value = [];
};

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
  } catch (err) {
    console.error('Error in AlbumView:', err);
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
            :has-moved="hasMoved"
            :updating="updating"
            :saving="saving"
            @update="updateAlbumData"
            @save="saveAlbum"
            @update-playlist="updatePlaylist"
          />

          <!-- Album Mapping UI -->
          <AlbumMappingManager
            v-if="album && !albumExists"
            :search-results="searchResults"
            :is-searching="isSearching"
            :search-error="searchError"
            :is-mapped-album="isMappedAlbum"
            :primary-album-id="primaryAlbumId"
            @check-existing="handleCheckExistingAlbum"
            @create-mapping="handleCreateMapping"
            @close="handleCloseDialog"
          />
        </div>

        <!-- Album Info -->
        <div class="md:w-1/2">
          <h1 class="h2 mb-2">{{ album.name }}</h1>
          <p 
            class="text-2xl text-delft-blue mb-4 cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
            @click="router.push({ name: 'artist', params: { id: album.artists[0].id } })"
          >{{ album.artists[0].name }}</p>
          <p class="text-xl text-delft-blue mb-6 font-bold">{{ album.release_date.substring(0, 4) }}</p>
          
          <TrackList :tracks="tracks" />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
</style> 