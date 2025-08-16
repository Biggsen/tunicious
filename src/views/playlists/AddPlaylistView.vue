<template>
  <main class="max-w-4xl mx-auto p-6">
    <div class="mb-6">
      <BackButton to="/playlists" text="Back to Playlists" />
    </div>
    
    <h1 class="h2 pb-4">Add New Playlist</h1>
    
    <!-- Success Message -->
    <div v-if="success" class="mb-6 p-4 bg-green-50 text-green-700 rounded-md border border-green-200">
      Playlist added successfully!
    </div>
    
    <!-- Spotify Connection Status -->
    <div v-if="!userData?.spotifyConnected" class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p class="text-yellow-800">
        <strong>Spotify Connection Required:</strong> Please connect your Spotify account in your 
        <router-link to="/account" class="text-yellow-900 underline">Account Settings</router-link> 
        to use playlist selection features.
      </p>
    </div>

    <div v-else class="space-y-8">
      <!-- Playlist Selection Section -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Select AudioFoodie Playlist</h2>
        
        <div v-if="loadingPlaylists" class="text-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p class="text-gray-500 mt-2">Loading your AudioFoodie playlists...</p>
        </div>
        
                 <div v-else-if="availablePlaylists.length === 0" class="text-center py-8">
           <p class="text-gray-500 mb-4">No AudioFoodie playlists found.</p>
           <p class="text-sm text-gray-400 mb-4">
             Create AudioFoodie playlists in the 
             <router-link to="/playlist/management" class="text-indigo-600 underline">Playlist Management</router-link> 
             page first.
           </p>
           
           <!-- Refresh Button -->
           <div class="mt-4">
             <BaseButton 
               @click="loadAvailablePlaylists"
               :disabled="loadingPlaylists"
               customClass="btn-secondary"
             >
               {{ loadingPlaylists ? 'Loading...' : 'Refresh Playlists' }}
             </BaseButton>
           </div>
           
           <details class="mt-4 text-left">
             <summary class="cursor-pointer text-sm text-indigo-600 hover:text-indigo-800">
               Debug: Show all playlists ({{ allPlaylists.length }})
             </summary>
             <div class="mt-2 p-4 bg-gray-100 rounded text-xs">
               <div v-for="playlist in allPlaylists.slice(0, 10)" :key="playlist.id" class="mb-2">
                 <strong>{{ playlist.name }}</strong><br>
                 <span class="text-gray-600">Description: "{{ playlist.description || 'No description' }}"</span><br>
                 <span class="text-gray-500">AudioFoodie: {{ isAudioFoodiePlaylist(playlist) ? 'Yes' : 'No' }}</span>
               </div>
               <div v-if="allPlaylists.length > 10" class="text-gray-500">
                 ... and {{ allPlaylists.length - 10 }} more
               </div>
             </div>
           </details>
         </div>
        
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="playlist in availablePlaylists" 
            :key="playlist.id"
            :class="[
              'p-4 border-2 rounded-lg cursor-pointer transition-all duration-200',
              selectedPlaylist?.id === playlist.id 
                ? 'border-indigo-500 bg-indigo-50' 
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            ]"
            @click="selectPlaylist(playlist)"
          >
            <div class="flex items-start space-x-3">
              <img 
                v-if="playlist.images && playlist.images.length > 0" 
                :src="playlist.images[0].url" 
                :alt="playlist.name"
                class="w-12 h-12 rounded object-cover flex-shrink-0"
              />
              <div v-else class="w-12 h-12 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                <span class="text-gray-400 text-xs">No Image</span>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-gray-900 truncate">{{ playlist.name }}</h3>
                <p class="text-sm text-gray-600">{{ playlist.tracks.total }} tracks</p>
                <p v-if="playlist.description" class="text-xs text-gray-500 truncate">{{ playlist.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

             <!-- Playlist Configuration Section -->
       <div class="bg-gray-50 shadow rounded-lg p-6">
         <h2 class="text-lg font-semibold mb-4">Playlist Configuration</h2>
         
         <form @submit.prevent="handleSubmit(onSubmit, enhancedValidateForm)" class="playlist-form">
           <!-- Basic Information -->
           <div class="bg-white shadow rounded-lg p-6 mb-6">
             <h3 class="text-md font-semibold mb-4">Basic Information</h3>
             
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div class="form-group">
                 <label for="playlistId">Spotify Playlist ID</label>
                 <input 
                   type="text" 
                   id="playlistId" 
                   v-model="form.playlistId"
                   placeholder="Enter Spotify playlist ID"
                   :class="{ 'error': formError?.playlistId }"
                 />
                 <p class="text-sm text-gray-500 mt-1">
                   Selected playlist: <span v-if="selectedPlaylist" class="font-medium text-indigo-600">{{ selectedPlaylist.name }}</span>
                   <span v-else class="text-gray-400">None selected</span>
                 </p>
                 <span v-if="formError?.playlistId" class="error-text">{{ formError.playlistId }}</span>
               </div>

               <div class="form-group">
                 <label for="name">Playlist Name</label>
                 <input 
                   type="text" 
                   id="name" 
                   v-model="form.name"
                   placeholder="Enter playlist name"
                   :class="{ 'error': formError?.name }"
                 />
                 <span v-if="formError?.name" class="error-text">{{ formError.name }}</span>
               </div>
             </div>

             <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
               <div class="form-group">
                 <label for="priority">Priority</label>
                 <input 
                   type="number" 
                   id="priority" 
                   v-model="form.priority"
                   placeholder="0"
                   :class="{ 'error': formError?.priority }"
                 />
                 <span v-if="formError?.priority" class="error-text">{{ formError.priority }}</span>
               </div>
             </div>
           </div>

           <!-- Pipeline Configuration -->
           <div class="bg-white shadow rounded-lg p-6 mb-6">
             <h3 class="text-md font-semibold mb-4">Pipeline Configuration</h3>
             
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div class="form-group">
                 <label for="group">Group</label>
                 <input 
                   type="text" 
                   id="group" 
                   v-model="form.group"
                   placeholder="e.g., rock, jazz, 90s"
                   :class="{ 'error': formError?.group }"
                 />
                 <span v-if="formError?.group" class="error-text">{{ formError.group }}</span>
               </div>
               
               <div class="form-group">
                 <label for="category">Category</label>
                 <input 
                   type="text" 
                   id="category" 
                   v-model="form.category"
                   placeholder="e.g., queued, checking, nice"
                   :class="{ 'error': formError?.category }"
                 />
                 <span v-if="formError?.category" class="error-text">{{ formError.category }}</span>
               </div>
             </div>
             
             <div class="mt-4">
               <label for="pipelineRole">Pipeline Role</label>
               <select 
                 id="pipelineRole" 
                 v-model="form.pipelineRole"
                 :class="{ 'error': formError?.pipelineRole }"
               >
                 <option v-for="role in pipelineRoles" :key="role.value" :value="role.value">
                   {{ role.label }}
                 </option>
               </select>
               <span v-if="formError?.pipelineRole" class="error-text">{{ formError.pipelineRole }}</span>
             </div>
           </div>

                       <!-- Pipeline Connections -->
            <div v-if="pipelineRoleFields && pipelineRoleFields.length > 0" class="bg-white shadow rounded-lg p-6 mb-6">
              <h3 class="text-md font-semibold mb-4">Pipeline Connections</h3>
              <p class="text-sm text-gray-500 mb-4">
                Pipeline connections can be configured after the playlist is created in the Edit Playlist page.
              </p>
              
                             <div class="space-y-4">
                 <div v-if="pipelineRoleFields && pipelineRoleFields.includes('nextStagePlaylistId')" class="form-group">
                  <label for="nextStagePlaylistId">Next Stage Playlist</label>
                  <select 
                    id="nextStagePlaylistId" 
                    v-model="form.nextStagePlaylistId"
                    disabled
                  >
                    <option value="">Configure after creation</option>
                  </select>
                  <p class="text-xs text-gray-400 mt-1">This will be available after the playlist is created</p>
                </div>
                
                                 <div v-if="pipelineRoleFields && pipelineRoleFields.includes('terminationPlaylistId')" class="form-group">
                  <label for="terminationPlaylistId">Termination Playlist</label>
                  <select 
                    id="terminationPlaylistId" 
                    v-model="form.terminationPlaylistId"
                    disabled
                  >
                    <option value="">Configure after creation</option>
                  </select>
                  <p class="text-xs text-gray-400 mt-1">This will be available after the playlist is created</p>
                </div>
              </div>
            </div>

           <!-- Legacy Fields (Backward Compatibility) -->
           <div class="bg-gray-100 shadow rounded-lg p-6 mb-6">
             <h3 class="text-md font-semibold mb-4 text-gray-600">Legacy Fields</h3>
             <p class="text-sm text-gray-500 mb-4">
               These fields are maintained for backward compatibility with existing playlists.
             </p>
             
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div class="form-group">
                 <label for="type">Type (Legacy)</label>
                 <select 
                   id="type" 
                   v-model="form.type"
                 >
                   <option value="known">Known</option>
                   <option value="new">New</option>
                 </select>
               </div>
             </div>
           </div>

           <div class="form-actions">
             <BaseButton 
               type="submit" 
               :disabled="isSubmitting || userLoading"
               customClass="submit-button"
             >
               {{ isSubmitting ? 'Adding...' : 'Add Playlist' }}
             </BaseButton>
             <BaseButton 
               type="button" 
               @click="$router.push('/playlists')" 
               customClass="cancel-button"
             >
               Cancel
             </BaseButton>
           </div>
         </form>

                   <ErrorMessage v-if="userError || formError" :message="userError || formError" />
       </div>
  </div>
  </main>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useUserData } from '@composables/useUserData';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useForm } from '@composables/useForm';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const { user, userData, loading: userLoading, error: userError } = useUserData();
const { getUserPlaylists, isAudioFoodiePlaylist } = useUserSpotifyApi();

// Initialize form with all required fields
const initialFormData = {
  playlistId: '',
  name: '',
  type: '',
  category: '',
  priority: 0,
  group: '',
  pipelineRole: 'source',
  nextStagePlaylistId: '',
  terminationPlaylistId: ''
};

const { form, isSubmitting, error: formError, success, handleSubmit, validateForm } = useForm(initialFormData);

// Playlist selection state
const loadingPlaylists = ref(false);
const availablePlaylists = ref([]);
const allPlaylists = ref([]);
const selectedPlaylist = ref(null);

// Pipeline configuration
const pipelineRoles = [
  { value: 'source', label: 'Source (Entry Point)' },
  { value: 'transient', label: 'Transient (Evaluation Point)' },
  { value: 'terminal', label: 'Terminal (Final Destination)' },
  { value: 'sink', label: 'Sink (Termination Point)' }
];

const pipelineRoleFields = computed(() => {
  // Add safety check to ensure form exists and has pipelineRole
  if (!form || !form.pipelineRole) {
    return [];
  }
  
  switch (form.pipelineRole) {
    case 'source':
      return ['nextStagePlaylistId'];
    case 'transient':
      return ['nextStagePlaylistId', 'terminationPlaylistId'];
    case 'terminal':
    case 'sink':
      return [];
    default:
      return [];
  }
});



// Load available AudioFoodie playlists
const loadAvailablePlaylists = async () => {
  if (!userData.value?.spotifyConnected) return;
  
  try {
    loadingPlaylists.value = true;
    const response = await getUserPlaylists(50, 0);
    allPlaylists.value = response.items;
    
    console.log('All playlists loaded:', allPlaylists.value.length);
    console.log('Sample playlists:', allPlaylists.value.slice(0, 3).map(p => ({
      name: p.name,
      description: p.description,
      isAudioFoodie: isAudioFoodiePlaylist(p)
    })));
    
    // Filter for AudioFoodie playlists only
    const audioFoodiePlaylists = allPlaylists.value.filter(playlist => isAudioFoodiePlaylist(playlist));
    console.log('AudioFoodie playlists found:', audioFoodiePlaylists.length);
    
    availablePlaylists.value = audioFoodiePlaylists;
  } catch (err) {
    console.error('Error loading playlists:', err);
  } finally {
    loadingPlaylists.value = false;
  }
};

// Select a playlist from the grid
const selectPlaylist = (playlist) => {
  selectedPlaylist.value = playlist;
  form.playlistId = playlist.id;
  // Auto-populate name if not already set
  if (!form.name) {
    form.name = playlist.name;
  }
};

// Enhanced form validation
const enhancedValidateForm = () => {
  const errors = {};
  
  // Safety check to ensure form exists
  if (!form) {
    return false;
  }
  
  if (!form.playlistId?.trim()) {
    errors.playlistId = 'Please select a playlist or enter a playlist ID';
  }
  
  if (!form.name?.trim()) {
    errors.name = 'Please enter a playlist name';
  }
  
  if (!form.group?.trim()) {
    errors.group = 'Please enter a group name';
  }
  
  if (!form.category?.trim()) {
    errors.category = 'Please enter a category name';
  }
  
  if (!form.pipelineRole) {
    errors.pipelineRole = 'Please select a pipeline role';
  }
  
  return Object.keys(errors).length === 0;
};

const onSubmit = async (formData) => {
  if (!user.value) {
    throw new Error('You must be logged in to add a playlist');
  }

  if (!enhancedValidateForm()) {
    throw new Error('Please fill in all required fields');
  }

  await addDoc(collection(db, 'playlists'), {
    ...formData,
    userId: user.value.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // Reset form after successful submission
  form.playlistId = '';
  form.name = '';
  form.type = '';
  form.category = '';
  form.priority = 0;
  form.group = '';
  form.pipelineRole = 'source';
  form.nextStagePlaylistId = '';
  form.terminationPlaylistId = '';
  selectedPlaylist.value = null;
};

onMounted(async () => {
  // Wait for user data to be loaded
  if (userData.value?.spotifyConnected) {
    await loadAvailablePlaylists();
  }
});

// Watch for changes in user data and Spotify connection
watch(() => userData.value?.spotifyConnected, async (isConnected) => {
  if (isConnected && !loadingPlaylists.value && availablePlaylists.value.length === 0) {
    await loadAvailablePlaylists();
  }
});
</script>

<style scoped>
.playlist-form {
  @apply space-y-6;
}

.form-group {
  @apply space-y-2;
}

label {
  @apply block text-sm font-medium text-gray-700;
}

input, select {
  @apply block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6;

  &.error {
    @apply ring-red-500;
  }
}

.error-text {
  @apply text-sm text-red-600;
}

.form-actions {
  @apply flex gap-4 mt-6;
}

.submit-button {
  @apply flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed;
}

.cancel-button {
  @apply flex-1 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50;
}

.success-message {
  @apply mt-4 p-4 bg-green-50 text-green-700 rounded-md;
}

.btn-secondary {
  @apply px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}
</style> 