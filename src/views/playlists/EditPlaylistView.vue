<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUserData } from '@composables/useUserData';
import { usePlaylistData } from '@composables/usePlaylistData';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { resolvePlaylistNames, resolvePlaylistName } from '@utils/playlistNameResolver';
import BaseLayout from '@components/common/BaseLayout.vue';
import BackButton from '@components/common/BackButton.vue';
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import { logPlaylist } from '@utils/logger';

const route = useRoute();
const router = useRouter();
const { user } = useUserData();
const { playlists: userPlaylists, fetchUserPlaylists } = usePlaylistData();
const { getPlaylist } = useUserSpotifyApi();

const playlistId = computed(() => route.params.id);
const loading = ref(true);
const saving = ref(false);
const error = ref(null);
const successMessage = ref('');

const playlist = ref(null);
const playlistName = ref('');
const availablePlaylists = ref([]);

// Form data
const form = ref({
  group: 'known',
  pipelineRole: 'source',
  nextStagePlaylistId: '',
  terminationPlaylistId: '',
  excludeFromMovements: false
});

// Validation
const formErrors = ref({});

const pipelineRoles = [
  { value: 'source', label: 'Source (Entry Point)' },
  { value: 'transient', label: 'Transient (Evaluation Point)' },
  { value: 'terminal', label: 'Terminal (Final Destination)' },
  { value: 'sink', label: 'Sink (Termination Point)' }
];

const pipelineRoleFields = computed(() => {
  switch (form.value.pipelineRole) {
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

const availableNextStages = computed(() => {
  if (!availablePlaylists.value) return [];
  
  return availablePlaylists.value.filter(p => 
    p.firebaseId !== playlistId.value && 
    p.group === form.value.group &&
    p.pipelineRole !== 'sink'
  );
});

const availableTerminations = computed(() => {
  if (!availablePlaylists.value) return [];
  
  return availablePlaylists.value.filter(p => 
    p.firebaseId !== playlistId.value && 
    p.group === form.value.group &&
    p.pipelineRole === 'sink'
  );
});

async function loadPlaylist() {
  if (!user.value || !playlistId.value) return;
  
  try {
    loading.value = true;
    error.value = null;
    
    // Get playlist document directly by Firebase document ID
    const playlistRef = doc(db, 'playlists', playlistId.value);
    const playlistDoc = await getDoc(playlistRef);
    
    if (!playlistDoc.exists()) {
      throw new Error('Playlist not found');
    }
    
    const playlistData = playlistDoc.data();
    
    // Check if user owns this playlist
    if (playlistData.userId !== user.value.uid) {
      throw new Error('You do not have permission to edit this playlist');
    }
    
    playlist.value = {
      id: playlistDoc.id,
      ...playlistData
    };
    
    // Fetch playlist name
    if (playlistData.playlistId && user.value) {
      playlistName.value = await resolvePlaylistName(playlistData.playlistId, user.value.uid, getPlaylist);
    }
    
    // Populate form with existing data
    form.value = {
      group: playlistData.group || 'unknown',
      pipelineRole: playlistData.pipelineRole || 'source',
      nextStagePlaylistId: playlistData.nextStagePlaylistId || '',
      terminationPlaylistId: playlistData.terminationPlaylistId || '',
      excludeFromMovements: playlistData.excludeFromMovements || false
    };
    
    // Load available playlists for connections
    await loadAvailablePlaylists();
    
  } catch (err) {
    logPlaylist('Error loading playlist:', err);
    error.value = err.message || 'Failed to load playlist';
  } finally {
    loading.value = false;
  }
}

async function loadAvailablePlaylists() {
  if (!user.value) return;
  
  try {
    // Get all playlists for this user from Firebase
    const playlistsRef = collection(db, 'playlists');
    const q = query(
      playlistsRef,
      where('userId', '==', user.value.uid)
    );
    const querySnapshot = await getDocs(q);
    
    const allPlaylists = [];
    querySnapshot.forEach((doc) => {
      const playlistData = doc.data();
      
      // Skip deleted playlists
      if (playlistData.deletedAt != null) {
        return;
      }
      
      allPlaylists.push({
        id: playlistData.playlistId, // Spotify playlist ID
        firebaseId: doc.id, // Firebase document ID
        group: playlistData.group || 'unknown',
        pipelineRole: playlistData.pipelineRole || 'transient'
      });
    });
    
    // Resolve playlist names from cache/API
    const playlistIds = allPlaylists.map(p => p.id);
    const resolvedNames = await resolvePlaylistNames(playlistIds, user.value.uid, getPlaylist);
    
    // Add resolved names to playlist objects
    allPlaylists.forEach(p => {
      p.name = resolvedNames[p.id] || `${p.group} ${p.pipelineRole}`;
    });
    
    availablePlaylists.value = allPlaylists;
  } catch (err) {
    logPlaylist('Error loading available playlists:', err);
  }
}

function validateForm() {
  const errors = {};
  
  if (!form.value.group.trim()) {
    errors.group = 'Group is required';
  }
  
  // Validate pipeline role specific fields
  if (pipelineRoleFields.value.includes('nextStagePlaylistId') && !form.value.nextStagePlaylistId) {
    errors.nextStagePlaylistId = 'Next stage playlist is required for this pipeline role';
  }
  
  if (pipelineRoleFields.value.includes('terminationPlaylistId') && !form.value.terminationPlaylistId) {
    errors.terminationPlaylistId = 'Termination playlist is required for this pipeline role';
  }
  
  formErrors.value = errors;
  return Object.keys(errors).length === 0;
}

async function savePlaylist() {
  if (!user.value || !playlist.value) return;
  
  if (!validateForm()) {
    return;
  }
  
  try {
    saving.value = true;
    error.value = null;
    successMessage.value = '';
    
    const playlistRef = doc(db, 'playlists', playlist.value.id);
    
    const updateData = {
      group: form.value.group,
      pipelineRole: form.value.pipelineRole,
      excludeFromMovements: form.value.excludeFromMovements,
      updatedAt: serverTimestamp()
    };
    
    // Add pipeline connection fields based on role
    if (pipelineRoleFields.value.includes('nextStagePlaylistId')) {
      updateData.nextStagePlaylistId = form.value.nextStagePlaylistId;
    } else {
      updateData.nextStagePlaylistId = null;
    }
    
    if (pipelineRoleFields.value.includes('terminationPlaylistId')) {
      updateData.terminationPlaylistId = form.value.terminationPlaylistId;
    } else {
      updateData.terminationPlaylistId = null;
    }
    
    await updateDoc(playlistRef, updateData);
    
    successMessage.value = 'Playlist updated successfully!';
    
    // Update local playlist data
    playlist.value = {
      ...playlist.value,
      ...updateData
    };
    
  } catch (err) {
    logPlaylist('Error saving playlist:', err);
    error.value = err.message || 'Failed to save playlist';
  } finally {
    saving.value = false;
  }
}

function handlePipelineRoleChange() {
  // Clear connection fields when role changes
  if (!pipelineRoleFields.value.includes('nextStagePlaylistId')) {
    form.value.nextStagePlaylistId = '';
  }
  if (!pipelineRoleFields.value.includes('terminationPlaylistId')) {
    form.value.terminationPlaylistId = '';
  }
}

onMounted(async () => {
  await loadPlaylist();
});
</script>

<template>
  <BaseLayout>
    <div class="mb-6">
      <BackButton :to="`/playlists`" text="Back to Playlists" />
    </div>
    
    <h1 class="h2 pb-6">Edit {{ playlistName || 'Playlist' }} playlist</h1>
    
    <!-- Success Message -->
    <div v-if="successMessage" class="mb-6 p-4 bg-green-50 text-green-700 rounded-md border border-green-200">
      {{ successMessage }}
    </div>
    
    <LoadingMessage v-if="loading" />
    <ErrorMessage v-else-if="error" :message="error" />
    
    <div v-else-if="playlist" class="space-y-8">
      <!-- Pipeline Configuration -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Pipeline Configuration</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-group">
            <label for="group" class="block text-sm font-medium text-gray-700 mb-1">
              Group
            </label>
            <input 
              type="text" 
              id="group" 
              v-model="form.group"
              :class="[
                'form-input w-full',
                formErrors.group ? 'border-red-500' : 'border-gray-300'
              ]"
              placeholder="e.g., rock, jazz, 90s"
            />
            <p v-if="formErrors.group" class="text-red-500 text-sm mt-1">
              {{ formErrors.group }}
            </p>
          </div>
        </div>
        
        <div class="mt-4">
          <label for="pipelineRole" class="block text-sm font-medium text-gray-700 mb-1">
            Pipeline Role
          </label>
          <select 
            id="pipelineRole" 
            v-model="form.pipelineRole"
            @change="handlePipelineRoleChange"
            class="form-input w-full border-gray-300"
          >
            <option v-for="role in pipelineRoles" :key="role.value" :value="role.value">
              {{ role.label }}
            </option>
          </select>
        </div>
      </div>
      
      <!-- Pipeline Connections -->
      <div v-if="pipelineRoleFields.length > 0" class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Pipeline Connections</h2>
        
        <div class="space-y-4">
          <div v-if="pipelineRoleFields.includes('nextStagePlaylistId')" class="form-group">
            <label for="nextStagePlaylistId" class="block text-sm font-medium text-gray-700 mb-1">
              Next Stage Playlist
            </label>
            <select 
              id="nextStagePlaylistId" 
              v-model="form.nextStagePlaylistId"
              :class="[
                'form-input w-full',
                formErrors.nextStagePlaylistId ? 'border-red-500' : 'border-gray-300'
              ]"
            >
              <option value="">Select next stage playlist</option>
                             <option 
                 v-for="playlist in availableNextStages" 
                 :key="playlist.firebaseId" 
                 :value="playlist.firebaseId"
               >
                 {{ playlist.name }}
               </option>
            </select>
            <p v-if="formErrors.nextStagePlaylistId" class="text-red-500 text-sm mt-1">
              {{ formErrors.nextStagePlaylistId }}
            </p>
          </div>
          
          <div v-if="pipelineRoleFields.includes('terminationPlaylistId')" class="form-group">
            <label for="terminationPlaylistId" class="block text-sm font-medium text-gray-700 mb-1">
              Termination Playlist
            </label>
            <select 
              id="terminationPlaylistId" 
              v-model="form.terminationPlaylistId"
              :class="[
                'form-input w-full',
                formErrors.terminationPlaylistId ? 'border-red-500' : 'border-gray-300'
              ]"
            >
              <option value="">Select termination playlist</option>
                             <option 
                 v-for="playlist in availableTerminations" 
                 :key="playlist.firebaseId" 
                 :value="playlist.firebaseId"
               >
                 {{ playlist.name }}
               </option>
            </select>
            <p v-if="formErrors.terminationPlaylistId" class="text-red-500 text-sm mt-1">
              {{ formErrors.terminationPlaylistId }}
            </p>
          </div>
        </div>
      </div>
      
      <!-- Exclude from Movements -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Visibility Settings</h2>
        
        <div class="flex items-center">
          <input 
            type="checkbox" 
            id="excludeFromMovements"
            v-model="form.excludeFromMovements"
            class="h-4 w-4 text-delft-blue focus:ring-delft-blue border-gray-300 rounded"
          />
          <label for="excludeFromMovements" class="ml-2 block text-sm text-gray-700">
            Exclude from Latest Movements
          </label>
        </div>
        <p class="mt-2 text-sm text-gray-500">
          When checked, movements to/from this playlist will not appear in the Latest Movements feed.
        </p>
      </div>
      
      <!-- Action Buttons -->
      <div class="flex gap-4">
        <BaseButton 
          @click="savePlaylist"
          :disabled="saving"
          customClass="btn-primary"
        >
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </BaseButton>
        
        <BaseButton 
          @click="router.push('/playlists')"
          customClass="btn-secondary"
        >
          Cancel
        </BaseButton>
      </div>
      
      
    </div>
  </BaseLayout>
</template>

<style scoped>
.form-input {
  @apply block w-full rounded-md border px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-delft-blue sm:text-sm sm:leading-6;
}

.btn-primary {
  @apply bg-delft-blue text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400;
}
</style>
