<template>
  <BaseLayout>
    <div class="mb-6">
      <BackButton to="/playlists" text="Back to Playlists" />
    </div>
    
    <h1 class="h2 pb-4">
      Add New Playlist<span v-if="route.query.group"> to {{ route.query.group }}</span>
    </h1>
    
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
        
        <ErrorMessage v-if="spotifyError" :message="spotifyError.message || spotifyError" class="mt-4" />
      </div>

      <!-- Select Existing Playlist Section -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Select from Existing</h2>
        
        <div v-if="loadingPlaylists" class="text-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p class="text-gray-500 mt-2">Loading your Tunicious playlists...</p>
        </div>
        
                 <div v-else-if="availablePlaylists.length === 0" class="text-center py-8">
           <p class="text-gray-500 mb-4">No Tunicious playlists found. Create one above.</p>
           
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
                 <span class="text-gray-500">Tunicious: {{ isTuniciousPlaylist(playlist) ? 'Yes' : 'No' }}</span>
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
       <div v-if="selectedPlaylist" class="bg-gray-50 shadow rounded-lg p-6">
         <h2 class="text-lg font-semibold mb-4">Playlist Configuration</h2>
         
         <form @submit.prevent="handleSubmit(onSubmit, enhancedValidateForm)" class="playlist-form">
           <p v-if="formErrors.playlistId" class="error-text mb-4">{{ formErrors.playlistId }}</p>
           
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
                  class="form-input"
                  :class="{ 'error': formErrors.group }"
                />
                 <span v-if="formErrors.group" class="error-text">{{ formErrors.group }}</span>
               </div>
             </div>
             
             <div class="mt-4">
               <label for="pipelineRole">Pipeline Role</label>
              <select 
                id="pipelineRole" 
                v-model="form.pipelineRole"
                class="form-input"
                :class="{ 'error': formErrors.pipelineRole }"
              >
                 <option v-for="role in pipelineRoles" :key="role.value" :value="role.value">
                   {{ role.label }}
                 </option>
               </select>
               <span v-if="formErrors.pipelineRole" class="error-text">{{ formErrors.pipelineRole }}</span>
             </div>
           </div>

                       <!-- Pipeline Connections -->
            <div v-if="pipelineRoleFields && pipelineRoleFields.length > 0" class="bg-white shadow rounded-lg p-6 mb-6">
              <h3 class="text-md font-semibold mb-4">Pipeline Connections</h3>
              <p class="text-sm text-gray-500 mb-4">
                Pipeline connections can be configured after the playlist is created in the Edit Playlist page.
              </p>
              
                             <div class="space-y-4">
                <div v-if="pipelineRoleFields && pipelineRoleFields.includes('previousStagePlaylistId')" class="form-group">
                  <label for="previousStagePlaylistId">Previous Stage Playlist</label>
                  <select 
                    id="previousStagePlaylistId" 
                    v-model="selectedPreviousStageId"
                    class="form-input"
                  >
                    <option value="">No previous stage</option>
                    <option 
                      v-for="playlist in availablePreviousStages" 
                      :key="playlist.firebaseId" 
                      :value="playlist.firebaseId"
                    >
                      {{ playlist.name }}
                    </option>
                  </select>
                  <p class="text-xs text-gray-500 mt-1">
                    <span v-if="form.pipelineRole === 'transient'">
                      This will update the selected playlist's "Next Stage" to point to this playlist.
                    </span>
                    <span v-else-if="form.pipelineRole === 'sink'">
                      This will update the selected Transient playlist's "Termination Playlist" to point to this playlist.
                    </span>
                    <span v-else-if="form.pipelineRole === 'terminal'">
                      This will update the selected Transient playlist's "Next Stage" to point to this playlist.
                    </span>
                  </p>
                </div>
                
                 <div v-if="pipelineRoleFields && pipelineRoleFields.includes('nextStagePlaylistId')" class="form-group">
                  <label for="nextStagePlaylistId">Next Stage Playlist</label>
                  <select 
                    id="nextStagePlaylistId" 
                    v-model="form.nextStagePlaylistId"
                    class="form-input"
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
                    class="form-input"
                    disabled
                  >
                    <option value="">Configure after creation</option>
                  </select>
                  <p class="text-xs text-gray-400 mt-1">This will be available after the playlist is created</p>
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
  </BaseLayout>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { collection, addDoc, serverTimestamp, getDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useUserData } from '@composables/useUserData';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { useForm } from '@composables/useForm';
import { getCache, setCache } from '@utils/cache';
import { resolvePlaylistNames } from '@utils/playlistNameResolver';
import BaseLayout from '@components/common/BaseLayout.vue';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import { logPlaylist } from '@utils/logger';

const { user, userData, loading: userLoading, error: userError } = useUserData();
const { 
  getUserPlaylists, 
  isTuniciousPlaylist, 
  getPlaylist,
  createPlaylist,
  loading: spotifyLoading,
  error: spotifyError
} = useUserSpotifyApi();

// Initialize form with all required fields
const initialFormData = {
  playlistId: '',
  group: '',
  pipelineRole: 'source',
  nextStagePlaylistId: '',
  terminationPlaylistId: ''
};

const router = useRouter();
const route = useRoute();

const { form, isSubmitting, error: formError, success, handleSubmit, validateForm } = useForm(initialFormData);

// Field-level validation errors
const formErrors = ref({});

// Create form state
const createForm = ref({
  name: '',
  description: '',
  isPublic: false
});

// Playlist selection state
const loadingPlaylists = ref(false);
const availablePlaylists = ref([]);
const allPlaylists = ref([]);
const selectedPlaylist = ref(null);

// Previous stage selection
const selectedPreviousStageId = ref('');
const availablePlaylistsForConnections = ref([]);

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
      const fields = ['previousStagePlaylistId'];
      // Only include nextStagePlaylistId if there are available next stages
      if (availableNextStages.value.length > 0) {
        fields.push('nextStagePlaylistId');
      }
      // Only include terminationPlaylistId if there are available terminations
      if (availableTerminations.value.length > 0) {
        fields.push('terminationPlaylistId');
      }
      return fields;
    case 'terminal':
    case 'sink':
      return ['previousStagePlaylistId'];
    default:
      return [];
  }
});

// Available next stages for transient role (only other transient playlists)
const availableNextStages = computed(() => {
  if (!availablePlaylistsForConnections.value) return [];
  
  return availablePlaylistsForConnections.value.filter(p => 
    p.group === form.group &&
    p.pipelineRole === 'transient' &&
    p.firebaseId !== selectedPlaylist.value?.id // Don't include self (if we had a firebaseId)
  );
});

// Available terminations for transient role
const availableTerminations = computed(() => {
  if (!availablePlaylistsForConnections.value) return [];
  
  return availablePlaylistsForConnections.value.filter(p => 
    p.group === form.group &&
    p.pipelineRole === 'sink'
  );
});

// Available previous stages based on role
const availablePreviousStages = computed(() => {
  if (!availablePlaylistsForConnections.value) return [];
  
  if (form.pipelineRole === 'transient') {
    // Transient can have Source or Transient as previous (via nextStagePlaylistId)
    return availablePlaylistsForConnections.value.filter(p => 
      p.group === form.group &&
      (p.pipelineRole === 'source' || p.pipelineRole === 'transient') &&
      !p.nextStagePlaylistId // Don't show if they already have a next stage
    );
  }
  
  if (form.pipelineRole === 'sink') {
    // Sink can only have Transient as previous (via terminationPlaylistId)
    return availablePlaylistsForConnections.value.filter(p => 
      p.group === form.group &&
      p.pipelineRole === 'transient' &&
      !p.terminationPlaylistId // Don't show if they already have a termination
    );
  }
  
  if (form.pipelineRole === 'terminal') {
    // Terminal can only have Transient as previous (via nextStagePlaylistId)
    return availablePlaylistsForConnections.value.filter(p => 
      p.group === form.group &&
      p.pipelineRole === 'transient' &&
      !p.nextStagePlaylistId // Don't show if they already have a next stage
    );
  }
  
  return [];
});



// Load available Tunicious playlists (excluding those already in Firestore)
const loadAvailablePlaylists = async () => {
  if (!userData.value?.spotifyConnected || !user.value) return;
  
  try {
    loadingPlaylists.value = true;
    
    // Fetch existing playlists from Firestore
    const playlistsRef = collection(db, 'playlists');
    const q = query(playlistsRef, where('userId', '==', user.value.uid));
    const querySnapshot = await getDocs(q);
    
    // Extract playlistIds that are already added
    const existingPlaylistIds = new Set();
    const playlistsForConnections = [];
    
    querySnapshot.forEach((docSnap) => {
      const playlistData = docSnap.data();
      if (playlistData.playlistId) {
        existingPlaylistIds.add(playlistData.playlistId);
      }
      
      // Skip deleted playlists
      if (playlistData.deletedAt != null) {
        return;
      }
      
      // Store playlist data for connection selection
      playlistsForConnections.push({
        firebaseId: docSnap.id,
        playlistId: playlistData.playlistId,
        group: playlistData.group || 'unknown',
        pipelineRole: playlistData.pipelineRole || 'transient',
        nextStagePlaylistId: playlistData.nextStagePlaylistId || null,
        terminationPlaylistId: playlistData.terminationPlaylistId || null
      });
    });
    
    // Resolve playlist names for connection playlists
    const playlistIds = playlistsForConnections.map(p => p.playlistId);
    const resolvedNames = await resolvePlaylistNames(playlistIds, user.value.uid, getPlaylist);
    
    playlistsForConnections.forEach(p => {
      p.name = resolvedNames[p.playlistId] || `${p.group} ${p.pipelineRole}`;
    });
    
    availablePlaylistsForConnections.value = playlistsForConnections;
    
    logPlaylist('Existing playlists in Firestore:', existingPlaylistIds.size);
    
    // Fetch all Tunicious playlists from Spotify
    const response = await getUserPlaylists(50, 0);
    
    // Filter out playlists that are already in Firestore
    const filteredPlaylists = response.items.filter(
      playlist => !existingPlaylistIds.has(playlist.id)
    );
    
    availablePlaylists.value = filteredPlaylists;
    allPlaylists.value = response.items; // For debug display (shows all, including existing)
    
    logPlaylist('Tunicious playlists loaded:', response.items.length);
    logPlaylist('Available playlists (not yet added):', filteredPlaylists.length);
  } catch (err) {
    logPlaylist('Error loading playlists:', err);
  } finally {
    loadingPlaylists.value = false;
  }
};

// Select a playlist from the grid
const selectPlaylist = (playlist) => {
  selectedPlaylist.value = playlist;
  form.playlistId = playlist.id;
};

// Handle playlist creation
const handleCreatePlaylist = async () => {
  try {
    spotifyError.value = null;
    
    const playlist = await createPlaylist(
      createForm.value.name,
      createForm.value.description,
      createForm.value.isPublic
    );
    
    // Reset create form
    createForm.value = {
      name: '',
      description: '',
      isPublic: false
    };
    
    // Refresh available playlists to include the new one
    await loadAvailablePlaylists();
    
    // Find and preselect the newly created playlist in the grid
    const newlyCreatedPlaylist = availablePlaylists.value.find(p => p.id === playlist.id);
    if (newlyCreatedPlaylist) {
      selectedPlaylist.value = newlyCreatedPlaylist;
      form.playlistId = newlyCreatedPlaylist.id;
    } else {
      // If not found in available (shouldn't happen), use the returned playlist
      selectedPlaylist.value = playlist;
      form.playlistId = playlist.id;
    }
  } catch (err) {
    logPlaylist('Error creating playlist:', err);
    // Error will be shown via spotifyError
  }
};

// Enhanced form validation
const enhancedValidateForm = () => {
  const errors = {};
  
  // Safety check to ensure form exists
  if (!form) {
    formErrors.value = {};
    return false;
  }
  
  if (!selectedPlaylist.value || !form.playlistId?.trim()) {
    errors.playlistId = 'Please select a playlist from the list above';
  }
  
  if (!form.group?.trim()) {
    errors.group = 'Please enter a group name';
  }
  
  if (!form.pipelineRole) {
    errors.pipelineRole = 'Please select a pipeline role';
  }
  
  // Assign errors to formErrors ref so template can display them
  formErrors.value = errors;
  return Object.keys(errors).length === 0;
};

const onSubmit = async (formData) => {
  if (!user.value) {
    throw new Error('You must be logged in to add a playlist');
  }

  if (!enhancedValidateForm()) {
    throw new Error('Please fill in all required fields');
  }

  // Add playlist to Firestore and get the document reference
  const docRef = await addDoc(collection(db, 'playlists'), {
    ...formData,
    userId: user.value.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // Handle previous stage playlist update if selected
  if (pipelineRoleFields.value.includes('previousStagePlaylistId') && selectedPreviousStageId.value) {
    const previousStageRef = doc(db, 'playlists', selectedPreviousStageId.value);
    const previousStageUpdate = { 
      updatedAt: serverTimestamp() 
    };
    
    // Set the appropriate connection field based on current playlist role
    if (form.pipelineRole === 'sink') {
      // Set terminationPlaylistId on the Transient
      previousStageUpdate.terminationPlaylistId = docRef.id;
    } else {
      // Set nextStagePlaylistId on the previous stage
      previousStageUpdate.nextStagePlaylistId = docRef.id;
    }
    
    await updateDoc(previousStageRef, previousStageUpdate);
  }

  // Update PlaylistView cache with the new playlist
  if (user.value) {
    try {
      const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
      const currentCacheState = await getCache(playlistViewCacheKey) || {};
      
      // Fetch playlist from Spotify to get track count and images
      const spotifyPlaylist = await getPlaylist(formData.playlistId);
      
      // Get the Firebase document to get full data
      const playlistDoc = await getDoc(docRef);
      const playlistData = playlistDoc.data();
      
      // Create playlist object for cache
      const newPlaylist = {
        id: spotifyPlaylist.id,
        firebaseId: docRef.id,
        name: spotifyPlaylist.name,
        images: spotifyPlaylist.images,
        tracks: { total: spotifyPlaylist.tracks.total },
        pipelineRole: playlistData.pipelineRole || 'transient'
      };
      
      // Add to cache state
      const group = playlistData.group || 'unknown';
      if (!currentCacheState[group]) {
        currentCacheState[group] = [];
      }
      currentCacheState[group].push(newPlaylist);
      // Playlists are already ordered by derivePipelineOrder in usePlaylistData
      
      // Save updated cache
      await setCache(playlistViewCacheKey, currentCacheState);
      logPlaylist(`Added new playlist ${formData.playlistId} to cache (group: ${group})`);
      
      // Dispatch event to notify PlaylistView
      window.dispatchEvent(new CustomEvent('playlists-updated', {
        detail: { playlistIds: [formData.playlistId] }
      }));
    } catch (cacheError) {
      logPlaylist('Error updating cache after adding playlist:', cacheError);
      // Don't throw - playlist was added successfully, cache update is secondary
    }
  }

  // Reset form after successful submission
  form.playlistId = '';
  form.group = '';
  form.pipelineRole = 'source';
  form.nextStagePlaylistId = '';
  form.terminationPlaylistId = '';
  selectedPlaylist.value = null;
  selectedPreviousStageId.value = '';
};

onMounted(async () => {
  // Prefill group from query parameter if provided
  if (route.query.group) {
    form.group = route.query.group;
  }
  
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

.form-input {
  @apply block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6;

  &.error {
    @apply ring-red-500;
  }
}

.btn-primary {
  @apply px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
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