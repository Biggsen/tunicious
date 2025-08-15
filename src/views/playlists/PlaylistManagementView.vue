<template>
  <main class="max-w-4xl mx-auto p-6">
    <div class="mb-6">
      <BackButton to="/playlists" text="Back to Playlists" />
    </div>
    
    <h1 class="h2 pb-6">Playlist Management</h1>
    
    <!-- Spotify Connection Status -->
    <div v-if="!userData?.spotifyConnected" class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p class="text-yellow-800">
        <strong>Spotify Connection Required:</strong> Please connect your Spotify account in your 
        <router-link to="/account" class="text-yellow-900 underline">Account Settings</router-link> 
        to use playlist management features.
      </p>
    </div>

    <div v-else class="space-y-8">
      <!-- Create New Playlist Section -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Create New Playlist</h2>
        
        <form @submit.prevent="handleCreatePlaylist" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="form-group">
              <label for="playlistName">Playlist Name</label>
              <input 
                type="text" 
                id="playlistName" 
                v-model="createForm.name"
                required
                placeholder="Enter playlist name"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label for="playlistDescription">Description (Optional)</label>
              <input 
                type="text" 
                id="playlistDescription" 
                v-model="createForm.description"
                placeholder="Enter description"
                class="form-input"
              />
            </div>
          </div>
          
          <div class="flex items-center space-x-4">
            <label class="flex items-center">
              <input 
                type="checkbox" 
                v-model="createForm.isPublic"
                class="mr-2"
              />
              <span class="text-sm">Make playlist public</span>
            </label>
          </div>
          
          <div class="flex gap-4">
            <BaseButton 
              type="submit" 
              :disabled="spotifyLoading"
              customClass="btn-primary"
            >
              {{ spotifyLoading ? 'Creating...' : 'Create Playlist' }}
            </BaseButton>
          </div>
        </form>
      </div>

             <!-- Add Album to Playlist Section -->
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
                 <option value="">Select a playlist</option>
                 <option v-for="playlist in userPlaylists" :key="playlist.id" :value="playlist.id">
                   {{ playlist.name }} ({{ playlist.tracks.total }} tracks)
                 </option>
               </select>
             </div>
           </div>
           
           <div class="flex gap-4">
             <BaseButton 
               type="submit" 
               :disabled="spotifyLoading || !selectedAlbum"
               customClass="btn-primary"
             >
               {{ spotifyLoading ? 'Adding...' : 'Add Album to Playlist' }}
             </BaseButton>
           </div>
         </form>
       </div>

             <!-- User's Playlists Section -->
       <div class="bg-white shadow rounded-lg p-6">
         <div class="flex justify-between items-center mb-4">
           <h2 class="text-lg font-semibold">Your Playlists</h2>
           <div class="flex items-center gap-4">
             <label class="flex items-center text-sm">
               <input 
                 type="checkbox" 
                 v-model="showOnlyAudioFoodie"
                 class="mr-2"
               />
               <span>Show only AudioFoodie playlists</span>
             </label>
             <BaseButton 
               @click="loadUserPlaylists"
               :disabled="spotifyLoading"
               customClass="btn-secondary"
             >
               {{ spotifyLoading ? 'Loading...' : 'Refresh' }}
             </BaseButton>
           </div>
         </div>
        
                 <div v-if="userPlaylists.length === 0" class="text-center py-8 text-gray-500">
           <p v-if="showOnlyAudioFoodie">
             No AudioFoodie playlists found. Create your first AudioFoodie playlist above!
           </p>
           <p v-else>
             No playlists found. Create your first playlist above!
           </p>
         </div>
        
        <div v-else class="space-y-4">
          <div 
            v-for="playlist in userPlaylists" 
            :key="playlist.id"
            class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
          >
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <h3 class="font-medium">{{ playlist.name }}</h3>
                <p class="text-sm text-gray-600">{{ playlist.tracks.total }} tracks</p>
                                 <p v-if="playlist.description" class="text-sm text-gray-500 mt-1">
                   {{ playlist.description.replace(' [AudioFoodie]', '') }}
                 </p>
                 <div class="flex items-center gap-2 mt-1">
                   <p class="text-xs text-gray-400">
                     {{ playlist.public ? 'Public' : 'Private' }} • ID: {{ playlist.id }}
                   </p>
                   <span v-if="isAudioFoodiePlaylist(playlist)" class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                     AudioFoodie
                   </span>
                 </div>
              </div>
              <div class="flex gap-2">
                <BaseButton 
                  @click="viewPlaylist(playlist.id)"
                  customClass="btn-secondary btn-sm"
                >
                  View
                </BaseButton>
                <a 
                  :href="playlist.external_urls.spotify" 
                  target="_blank"
                  class="btn-secondary btn-sm"
                >
                  Open in Spotify
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error Messages -->
    <ErrorMessage v-if="spotifyError" :message="spotifyError" class="mt-4" />
    
    <!-- Success Messages -->
    <div v-if="successMessage" class="mt-4 p-4 bg-green-50 text-green-700 rounded-md">
      {{ successMessage }}
    </div>
  </main>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUserData } from '@composables/useUserData';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import AlbumSearch from '@components/AlbumSearch.vue';

const router = useRouter();
const { userData } = useUserData();
const { 
  loading: spotifyLoading, 
  error: spotifyError, 
  createPlaylist, 
  addAlbumToPlaylist, 
  getUserPlaylists,
  isAudioFoodiePlaylist
} = useUserSpotifyApi();

const userPlaylists = ref([]);
const allPlaylists = ref([]);
const showOnlyAudioFoodie = ref(true);
const successMessage = ref('');

const createForm = ref({
  name: '',
  description: '',
  isPublic: false
});

const selectedAlbum = ref(null);
const albumForm = ref({
  playlistId: ''
});

const handleCreatePlaylist = async () => {
  try {
    spotifyError.value = null;
    successMessage.value = '';
    
    const playlist = await createPlaylist(
      createForm.value.name,
      createForm.value.description,
      createForm.value.isPublic
    );
    
         successMessage.value = `AudioFoodie playlist "${playlist.name}" created successfully!`;
    
    // Reset form
    createForm.value = {
      name: '',
      description: '',
      isPublic: false
    };
    
    // Refresh playlists
    await loadUserPlaylists();
  } catch (err) {
    console.error('Error creating playlist:', err);
    spotifyError.value = err.message;
  }
};

const handleAddAlbum = async () => {
  try {
    spotifyError.value = null;
    successMessage.value = '';
    
    if (!selectedAlbum.value) {
      throw new Error('Please select an album first');
    }
    
    await addAlbumToPlaylist(albumForm.value.playlistId, selectedAlbum.value.id);
    
    successMessage.value = `"${selectedAlbum.value.name}" added to playlist successfully!`;
    
    // Reset form
    selectedAlbum.value = null;
    albumForm.value = {
      playlistId: ''
    };
    
    // Refresh playlists
    await loadUserPlaylists();
  } catch (err) {
    console.error('Error adding album:', err);
    spotifyError.value = err.message;
  }
};

const loadUserPlaylists = async () => {
  try {
    spotifyError.value = null;
    const response = await getUserPlaylists(50, 0);
    allPlaylists.value = response.items;
    
    // Filter playlists based on current setting
    if (showOnlyAudioFoodie.value) {
      userPlaylists.value = allPlaylists.value.filter(playlist => isAudioFoodiePlaylist(playlist));
    } else {
      userPlaylists.value = allPlaylists.value;
    }
  } catch (err) {
    console.error('Error loading playlists:', err);
    spotifyError.value = err.message;
  }
};

// Watch for changes in filter setting
watch(showOnlyAudioFoodie, () => {
  if (showOnlyAudioFoodie.value) {
    userPlaylists.value = allPlaylists.value.filter(playlist => isAudioFoodiePlaylist(playlist));
  } else {
    userPlaylists.value = allPlaylists.value;
  }
});

const viewPlaylist = (playlistId) => {
  router.push(`/playlist/${playlistId}`);
};

onMounted(async () => {
  if (userData.value?.spotifyConnected) {
    await loadUserPlaylists();
  }
});
</script>

<style scoped>
.form-group {
  @apply space-y-2;
}

label {
  @apply block text-sm font-medium text-gray-700;
}

.form-input {
  @apply block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6;
}

.btn-primary {
  @apply px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-sm {
  @apply px-2 py-1 text-sm;
}
</style>
