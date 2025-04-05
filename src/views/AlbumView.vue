<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getAlbum, getAlbumTracks } from '../utils/api';
import { useAlbumsData } from '../composables/useAlbumsData';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useToken } from '../utils/auth';
import { useAlbumMappings } from '../composables/useAlbumMappings';

const route = useRoute();
const router = useRouter();
const user = useCurrentUser();
const { fetchAlbumData, getCurrentPlaylistInfo, searchAlbumsByTitleAndArtist, searchAlbumsByTitleAndArtistFuzzy } = useAlbumsData();
const { token, initializeToken } = useToken();
const { createMapping, isAlternateId, getPrimaryId } = useAlbumMappings();

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

const playlistId = computed(() => route.query.playlistId);
const isFromPlaylist = computed(() => !!playlistId.value);

const formatDuration = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const fetchAllTracks = async (albumId) => {
  let allTracks = [];
  let offset = 0;
  const limit = 50; // Maximum allowed by Spotify API
  let retryCount = 0;
  const maxRetries = 3;
  
  while (true) {
    try {
      if (!token.value) {
        await initializeToken();
      }

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
      
      // If we get a 401 or 403, try refreshing the token
      if (err.status === 401 || err.status === 403) {
        try {
          await initializeToken();
          continue; // Retry the current request with new token
        } catch (refreshErr) {
          console.error('Failed to refresh token:', refreshErr);
          throw new Error('Failed to refresh Spotify token');
        }
      }
      
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
    
    // First find the playlist document by Spotify playlist ID
    const playlistsRef = collection(db, 'playlists');
    const q = query(playlistsRef, where('playlistId', '==', playlistId.value));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('Playlist not found');
    }
    
    const playlistDoc = querySnapshot.docs[0];
    const playlistData = playlistDoc.data();
    
    const albumRef = doc(db, 'albums', album.value.id);
    const now = new Date();
    
    // Get existing album data
    const existingData = await fetchAlbumData(album.value.id);
    
    // Prepare the new playlist history entry using playlist data
    const newEntry = {
      playlistId: playlistData.playlistId,
      playlistName: playlistData.name,
      category: playlistData.category,
      type: playlistData.type,
      priority: playlistData.priority,
      addedAt: now,
      removedAt: null
    };
    
    // Prepare the user's album data
    const userAlbumData = {
      playlistHistory: existingData?.playlistHistory 
        ? [...existingData.playlistHistory.filter(h => h.removedAt !== null), newEntry]
        : [newEntry],
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Update the album document
    await setDoc(albumRef, {
      albumTitle: album.value.name,
      artistName: album.value.artists[0].name,
      userEntries: {
        [user.value.uid]: userAlbumData
      }
    }, { merge: true });
    
    // Refresh the current playlist info
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
    
    const playlistData = querySnapshot.docs[0].data();
    
    // Update only the playlist name for the matching entry
    const updatedHistory = existingData.playlistHistory.map(entry => {
      if (entry.playlistId === playlistId.value) {
        return {
          ...entry,
          playlistName: playlistData.name
        };
      }
      return entry;
    });
    
    // Prepare the updated user data
    const updatedUserData = {
      ...existingData,
      playlistHistory: updatedHistory,
      updatedAt: serverTimestamp()
    };
    
    // Update the album document
    await setDoc(albumRef, {
      albumTitle: album.value.name,
      artistName: album.value.artists[0].name,
      userEntries: {
        [user.value.uid]: updatedUserData
      }
    }, { merge: true });
    
    // Refresh the current playlist info and update status
    currentPlaylistInfo.value = await getCurrentPlaylistInfo(album.value.id);
    await checkIfNeedsUpdate();
    
  } catch (err) {
    console.error('Error updating album:', err);
    error.value = err.message || 'Failed to update album';
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
      await fetchAlbumData(route.params.id);
    }
  } catch (e) {
    console.error('Error creating mapping:', e);
    searchError.value = 'Failed to create album mapping';
  }
};

onMounted(async () => {
  try {
    loading.value = true;
    const albumId = route.params.id;
    
    // Initialize token if needed
    if (!token.value) {
      await initializeToken();
    }
    
    // Check if this album is already mapped
    isMappedAlbum.value = await isAlternateId(albumId);
    if (isMappedAlbum.value) {
      primaryAlbumId.value = await getPrimaryId(albumId);
    }
    
    const [albumData, tracksData] = await Promise.all([
      getAlbum(token.value, albumId),
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

  // Add this after the onMounted hook
  watch(searchResults, (newValue) => {
    console.log('searchResults changed:', newValue);
    console.log('searchResults length:', newValue.length);
  }, { deep: true });
});
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <a 
        href="#" 
        @click.prevent="router.back()" 
        class="text-blue-500 hover:underline"
      >&larr; Back</a>
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
          <div v-if="isFromPlaylist" class="mt-6">
            <div v-if="currentPlaylistInfo" class="bg-green-100 border-2 border-green-500 rounded-xl p-4">
              <p class="text-green-700">
                This album is currently in playlist: <strong>{{ currentPlaylistInfo.playlistName }}</strong>
              </p>
              <button 
                v-if="needsUpdate"
                @click="updateAlbumData"
                :disabled="updating"
                class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {{ updating ? 'Updating...' : 'Update Album Data' }}
              </button>
            </div>
            <div v-else class="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
              <p class="text-yellow-700 mb-2">
                This album is not yet in your collection.
              </p>
              <button 
                @click="saveAlbum"
                :disabled="saving"
                class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {{ saving ? 'Adding...' : 'Add to Collection' }}
              </button>
            </div>
          </div>

          <!-- Album Mapping UI -->
          <div v-if="album && !albumExists" class="mt-6 bg-white border-2 border-delft-blue rounded-xl p-4">
            <h3 class="text-xl font-bold text-delft-blue mb-4">Album Mapping</h3>
            
            <div v-if="isMappedAlbum && primaryAlbumId" class="text-delft-blue mb-4">
              <p>This album is already mapped to another album in your collection.</p>
            </div>
            
            <div v-else>
              <p class="text-delft-blue mb-4">
                This album might exist in your collection under a different ID. Check if it exists:
              </p>
              <button 
                @click="handleCheckExistingAlbum" 
                :disabled="isSearching"
                class="check-existing-btn w-full"
              >
                {{ isSearching ? 'Searching...' : 'Check for Existing Album' }}
              </button>

              <div v-if="searchError" class="error-message mt-4">
                {{ searchError }}
              </div>
            </div>
          </div>
        </div>

        <!-- Album Info -->
        <div class="md:w-1/2">
          <h1 class="h2 mb-2">{{ album.name }}</h1>
          <p 
            class="text-2xl text-delft-blue mb-4 cursor-pointer hover:text-blue-500 hover:underline transition-colors duration-200"
            @click="router.push({ name: 'artist', params: { id: album.artists[0].id } })"
          >{{ album.artists[0].name }}</p>
          <p class="text-xl text-delft-blue mb-6 font-bold">{{ album.release_date.substring(0, 4) }}</p>
          
          <div class="bg-white border-2 border-delft-blue rounded-xl p-4">
            <h2 class="text-xl font-bold text-delft-blue mb-4">Track List</h2>
            <ul class="space-y-2">
              <li 
                v-for="(track, index) in tracks" 
                :key="track.id"
                class="flex justify-between items-center text-delft-blue"
              >
                <span class="flex-1">
                  <span class="mr-2">{{ index + 1 }}.</span>
                  {{ track.name }}
                </span>
                <span class="ml-4">{{ formatDuration(track.duration_ms) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirmation Dialog for Search Results -->
    <div v-if="searchResults.length > 0" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999]">
      <div class="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl">
        <h3 class="text-xl font-bold text-delft-blue mb-4">Found Matching Albums</h3>
        <p class="text-delft-blue mb-4">
          The following albums match the title and artist. Select one to create a mapping:
        </p>
        <ul class="space-y-3">
          <li 
            v-for="result in searchResults" 
            :key="result.id"
            class="flex flex-col p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <div class="font-medium">{{ result.albumTitle }}</div>
            <div class="text-sm text-gray-600">by {{ result.artistName }}</div>
            <div class="text-xs text-gray-500 mt-1">
              Similarity: {{ Math.round(result.similarity * 100) }}%
            </div>
            <button 
              @click="handleCreateMapping(result.id)"
              class="create-mapping-btn mt-2"
            >
              Create Mapping
            </button>
          </li>
        </ul>
        <button 
          @click="searchResults = []"
          class="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors duration-200"
        >
          Cancel
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.check-existing-btn,
.create-mapping-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.check-existing-btn {
  background-color: #4CAF50;
  color: white;
}

.check-existing-btn:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.create-mapping-btn {
  background-color: #2196F3;
  color: white;
}

.error-message {
  color: #f44336;
}
</style> 