<template>
  <BaseLayout>
    <div class="mb-6">
      <BackButton text="Back" />
    </div>
    
    <h1 class="h2 pb-6">Add Album to Playlist</h1>
    
    <!-- Spotify Connection Status -->
    <div v-if="!userData?.spotifyConnected" class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p class="text-yellow-800">
        <strong>Spotify Connection Required:</strong> Please connect your Spotify account in your 
        <router-link to="/account" class="text-yellow-900 underline">Account Settings</router-link> 
        to use this feature.
      </p>
    </div>

    <div v-else class="space-y-8">
      <!-- Add Album to Playlist Form -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Add Album to Playlist</h2>
        
        <form @submit.prevent="handleAddAlbum" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="form-group">
              <AlbumSearch v-model="selectedAlbum" />
            </div>
            <div class="form-group">
              <label for="targetPlaylist">Target Playlist</label>
              <select 
                id="targetPlaylist" 
                v-model="albumForm.playlistId"
                required
                class="form-input"
              >
                <option value="" disabled>Select a playlist</option>
                <option v-for="playlist in userPlaylists" :key="playlist.id" :value="playlist.id">
                  {{ playlist.name }} ({{ playlist.tracks.total }} tracks)
                </option>
              </select>
            </div>
          </div>
          
          <div class="flex gap-4">
            <BaseButton 
              type="submit" 
              :disabled="addingAlbum || !selectedAlbum || !albumForm.playlistId"
              customClass="btn-primary"
            >
              {{ addingAlbum ? 'Adding...' : 'Add Album to Playlist' }}
            </BaseButton>
          </div>
        </form>
      </div>

      <!-- No Playlists Message -->
      <div v-if="userPlaylists.length === 0 && !loadingPlaylists" class="bg-white shadow rounded-lg p-6">
        <p class="text-gray-500 text-center">
          No Tunicious playlists found. Create a playlist first!
        </p>
      </div>
    </div>
  </BaseLayout>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUserData } from '@composables/useUserData';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useAlbumsData } from '@composables/useAlbumsData';
import { useToast } from '@composables/useToast';
import { useCurrentUser } from 'vuefire';
import BaseLayout from '@components/common/BaseLayout.vue';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import AlbumSearch from '@components/AlbumSearch.vue';
import { clearCache } from '@utils/cache';
import { formatAlbumName } from '@utils/formatting';
import { logPlaylist } from '@utils/logger';

const route = useRoute();
const { userData } = useUserData();
const user = useCurrentUser();
const { showToast } = useToast();

const { 
  addAlbumToPlaylist, 
  getUserPlaylists, 
  isTuniciousPlaylist,
  getPlaylistAlbumsWithDates
} = useUserSpotifyApi();

const { addAlbumToCollection } = useAlbumsData();

const selectedAlbum = ref(null);
const albumForm = ref({
  playlistId: route.query.playlistId || ''
});
const userPlaylists = ref([]);
const addingAlbum = ref(false);
const loadingPlaylists = ref(false);

const loadUserPlaylists = async () => {
  if (!userData.value?.spotifyConnected) return;
  
  try {
    loadingPlaylists.value = true;
    const response = await getUserPlaylists(50, 0);
    
    // Filter to Tunicious playlists only
    userPlaylists.value = response.items.filter(playlist => isTuniciousPlaylist(playlist));
    
    // If query param playlistId exists, try to pre-select it
    if (route.query.playlistId && userPlaylists.value.length > 0) {
      const playlistExists = userPlaylists.value.some(p => p.id === route.query.playlistId);
      if (playlistExists) {
        albumForm.value.playlistId = route.query.playlistId;
      }
      // Silently ignore if playlist not found (as per spec)
    }
  } catch (err) {
    logPlaylist('Error loading playlists:', err);
    showToast(err.message || 'Failed to load playlists', 'error');
  } finally {
    loadingPlaylists.value = false;
  }
};

const handleAddAlbum = async () => {
  try {
    addingAlbum.value = true;
    
    if (!selectedAlbum.value) {
      showToast('Please select an album first', 'warning');
      return;
    }
    
    if (!albumForm.value.playlistId) {
      showToast('Please select a playlist', 'warning');
      return;
    }
    
    // Check if album already exists in playlist
    const existingAlbums = await getPlaylistAlbumsWithDates(albumForm.value.playlistId);
    const albumExists = existingAlbums.some(a => a.id === selectedAlbum.value.id);
    
    if (albumExists) {
      const albumText = formatAlbumName(selectedAlbum.value);
      showToast({
        parts: [
          ...albumText.parts,
          { text: ' is already in this playlist' }
        ]
      }, 'warning');
      return;
    }
    
    // Add album to Spotify playlist
    await addAlbumToPlaylist(albumForm.value.playlistId, selectedAlbum.value.id);
    
    // Add album to Firebase collection (let it fetch playlist data internally)
    await addAlbumToCollection({
      album: selectedAlbum.value,
      playlistId: albumForm.value.playlistId,
      playlistData: null,
      spotifyAddedAt: new Date()
    });
    
    // Show success toast with formatted album name
    const albumText = formatAlbumName(selectedAlbum.value);
    showToast({
      parts: [
        ...albumText.parts,
        { text: ' added to playlist and collection successfully!' }
      ]
    }, 'success');
    
    // Reset form: clear album search, keep playlist if from query param
    selectedAlbum.value = null;
    // Clear the AlbumSearch component's search field by resetting the model
    // (AlbumSearch component should handle this when selectedAlbum becomes null)
    
    // Only clear playlist selection if it didn't come from query param
    if (!route.query.playlistId) {
      albumForm.value.playlistId = '';
    }
    
    // Clear cache to update track counts
    if (user.value) {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      await clearCache(playlistViewCacheKey);
      
      // Clear the specific playlist's album list cache so PlaylistSingle will refresh
      const playlistAlbumListCacheKey = `playlist_${albumForm.value.playlistId}_albumsWithDates`;
      await clearCache(playlistAlbumListCacheKey);
      
      // Dispatch event to notify PlaylistSingle to reload if it's currently mounted
      window.dispatchEvent(new CustomEvent('playlist-albums-updated', {
        detail: { playlistId: albumForm.value.playlistId }
      }));
    }
    
  } catch (err) {
    logPlaylist('Error adding album:', err);
    showToast(err.message || 'Failed to add album to playlist', 'error');
  } finally {
    addingAlbum.value = false;
  }
};

// Load playlists on mount if Spotify connected
onMounted(() => {
  if (userData.value?.spotifyConnected) {
    loadUserPlaylists();
  }
});

// Watch for Spotify connection changes
watch(() => userData.value?.spotifyConnected, (isConnected) => {
  if (isConnected && userPlaylists.value.length === 0) {
    loadUserPlaylists();
  }
});
</script>

<style scoped>
.form-group {
  @apply mb-4;
}

.form-group label {
  @apply block text-sm font-medium text-gray-700 mb-2;
}

.form-input {
  @apply block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-delft-blue focus:border-delft-blue sm:text-sm sm:leading-6 bg-white;
}

.form-input:focus {
  @apply outline-none;
}

.form-input option {
  @apply text-gray-900;
}

.form-input option:disabled {
  @apply text-gray-400;
}
</style>

