<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSpotifyApi } from '@composables/useSpotifyApi';
import { setCache, getCache, clearCache } from "@utils/cache";
import AlbumItem from "@components/AlbumItem.vue";
import { useUserData } from "@composables/useUserData";
import { usePlaylistData } from "@composables/usePlaylistData";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import BackButton from '@components/common/BackButton.vue';

const route = useRoute();
const router = useRouter();
const { user, userData } = useUserData();
const { getPlaylist, getUniqueAlbumIdsFromPlaylist, loadAlbumsBatched, loading: spotifyLoading, error: spotifyError } = useSpotifyApi();

const id = computed(() => route.params.id);
const loading = ref(false);
const error = ref(null);
const cacheCleared = ref(false);
const updating = ref(false);

const albumData = ref([]);
const playlistName = ref('');
const playlistDoc = ref(null);

const totalAlbums = computed(() => albumData.value.length);

const currentPage = ref(1);
const itemsPerPage = ref(20);

const paginatedAlbums = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return albumData.value.slice(start, end);
});

const totalPages = computed(() => 
  Math.ceil(albumData.value.length / itemsPerPage.value)
);

const showPagination = computed(() => 
  albumData.value.length > itemsPerPage.value
);

const cacheKey = computed(() => `playlist_${id.value}_essential`);

async function fetchPlaylistData(playlistId) {
  const cachedData = await getCache(cacheKey.value);

  if (cachedData) {
    playlistName.value = cachedData.playlistName;
    albumData.value = cachedData.albumData;
    return;
  }

  const playlistResponse = await getPlaylist(playlistId);
  playlistName.value = playlistResponse.name;

  const albumIds = await getUniqueAlbumIdsFromPlaylist(playlistId);
  
  const albums = await loadAlbumsBatched(albumIds);
  
  albumData.value = albums.map(album => ({
    id: album.id,
    name: album.name,
    release_date: album.release_date,
    images: [null, { url: album.images[1]?.url }],
    artists: [{ 
      id: album.artists[0]?.id,
      name: album.artists[0]?.name 
    }]
  }));

  console.log('Album Data:', albumData.value);

  await setCache(cacheKey.value, {
    playlistName: playlistName.value,
    albumData: albumData.value
  });
}

async function handleClearCache() {
  await clearCache(cacheKey.value);
  cacheCleared.value = true;
  albumData.value = [];
  playlistName.value = '';
  await loadPlaylistData();
}

async function getPlaylistDocument() {
  if (!user.value) return null;
  
  const playlistsRef = collection(db, 'playlists');
  const q = query(playlistsRef, where('playlistId', '==', id.value));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    console.warn('Playlist document not found');
    return null;
  }
  
  return querySnapshot.docs[0];
}

async function updatePlaylistName() {
  if (!user.value || !playlistName.value) return;
  
  try {
    updating.value = true;
    error.value = null;
    
    // Get the playlist document if we don't have it
    if (!playlistDoc.value) {
      playlistDoc.value = await getPlaylistDocument();
    }
    
    if (!playlistDoc.value) {
      throw new Error('Playlist document not found');
    }
    
    // Update the playlist document with the name
    await updateDoc(doc(db, 'playlists', playlistDoc.value.id), {
      name: playlistName.value,
      updatedAt: serverTimestamp()
    });
    
    // Update the local document data to reflect the change
    playlistDoc.value = await getPlaylistDocument();
    
  } catch (err) {
    console.error('Error updating playlist:', err);
    error.value = err.message || 'Failed to update playlist';
  } finally {
    updating.value = false;
  }
}

async function loadPlaylistData() {
  loading.value = true;
  error.value = null;
  cacheCleared.value = false;
  try {
    await fetchPlaylistData(id.value);
    // Get the playlist document after loading data
    playlistDoc.value = await getPlaylistDocument();
  } catch (e) {
    console.error("Error loading playlist data:", e);
    error.value = e.message || "Failed to load playlist data. Please try again.";
  } finally {
    loading.value = false;
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const previousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

onMounted(async () => {
  try {
    await loadPlaylistData();
  } catch (e) {
    console.error("Error in PlaylistSingle:", e);
    error.value = e.message || "An unexpected error occurred. Please try again.";
  }
});
</script>

<template>
  <main class="pt-6">
    <div class="mb-6">
      <BackButton to="/playlists" text="Back to Playlists" />
    </div>

    <h1 class="h2 pb-4">{{ playlistName }}</h1>
    <div class="mb-4 flex gap-4">
      <button 
        @click.prevent="handleClearCache" 
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
        </svg>
        Reload
      </button>

      <button 
        v-if="playlistDoc && !playlistDoc.data().name"
        @click="updatePlaylistName"
        :disabled="updating"
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
        {{ updating ? 'Updating...' : 'Update Playlist Name' }}
      </button>
    </div>

    <p v-if="cacheCleared" class="mb-4 text-green-500">
      Cache cleared! Reloading playlist...
    </p>

    <p class="text-lg mb-6">Total unique albums: {{ totalAlbums }}</p>
    <p v-if="loading" class="loading-message">Loading...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <template v-else-if="albumData.length">
      <ul class="album-grid">
        <AlbumItem 
          v-for="album in paginatedAlbums" 
          :key="album.id" 
          :album="album" 
          :lastFmUserName="userData?.lastFmUserName"
          :currentPlaylist="{ playlistId: id }"
          :isMappedAlbum="false"
        />
      </ul>

      <div v-if="showPagination" class="pagination-controls">
        <button 
          @click="previousPage" 
          :disabled="currentPage === 1"
          class="pagination-button"
        >
          Previous
        </button>
        
        <span class="pagination-info">
          Page {{ currentPage }} of {{ totalPages }}
          ({{ (currentPage - 1) * itemsPerPage + 1 }}-{{ Math.min(currentPage * itemsPerPage, totalAlbums) }} 
          of {{ totalAlbums }} albums)
        </span>
        
        <button 
          @click="nextPage" 
          :disabled="currentPage === totalPages"
          class="pagination-button"
        >
          Next
        </button>
      </div>
    </template>
    <p v-else class="no-data-message">No albums found in this playlist.</p>
  </main>
</template>

<style scoped>
.loading-message,
.error-message,
.no-data-message {
  @apply text-center py-4 font-bold;
}
.error-message {
  @apply text-red-500;
}
.album-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 1rem;
  justify-content: center;
}

@media (max-width: 639px) {
  .album-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}

.pagination-controls {
  @apply flex justify-center items-center gap-4 mt-6 mb-8;
}

.pagination-button {
  @apply px-4 py-2 bg-blue-500 text-white rounded 
         hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
         transition-colors duration-200;
}

.pagination-info {
  @apply text-gray-700 text-sm;
}
</style>
