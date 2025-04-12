<template>
  <main class="max-w-2xl mx-auto p-6">
    <div class="mb-6">
      <BackButton to="/playlists" text="Back to Playlists" />
    </div>
    
    <h1 class="h2 pb-4">Add New Playlist</h1>
    
    <form @submit.prevent="handleSubmit(onSubmit)" class="playlist-form">
      <div class="form-group">
        <label for="playlistId">Spotify Playlist ID</label>
        <input 
          type="text" 
          id="playlistId" 
          v-model="form.playlistId"
          required
          placeholder="Enter Spotify playlist ID"
          :class="{ 'error': formError?.playlistId }"
        />
        <span v-if="formError?.playlistId" class="error-text">{{ formError.playlistId }}</span>
      </div>

      <div class="form-group">
        <label for="type">Playlist Type</label>
        <select 
          id="type" 
          v-model="form.type"
          required
          :class="{ 'error': formError?.type }"
        >
          <option value="known">Known Artist</option>
          <option value="new">New Artist</option>
        </select>
        <span v-if="formError?.type" class="error-text">{{ formError.type }}</span>
      </div>

      <div class="form-group">
        <label for="category">Category</label>
        <select 
          id="category" 
          v-model="form.category"
          required
          :class="{ 'error': formError?.category }"
        >
          <option value="queued">Queued</option>
          <option value="curious">Curious</option>
          <option value="interested">Interested</option>
          <option value="great">Great</option>
          <option value="excellent">Excellent</option>
          <option value="wonderful">Wonderful</option>
          <option value="end">End of the line --]</option>
        </select>
        <span v-if="formError?.category" class="error-text">{{ formError.category }}</span>
      </div>

      <div class="form-group">
        <label for="priority">Priority</label>
        <input 
          type="number" 
          id="priority" 
          v-model="form.priority"
          required
          :class="{ 'error': formError?.priority }"
        />
        <span v-if="formError?.priority" class="error-text">{{ formError.priority }}</span>
      </div>

      <div class="form-actions">
        <button 
          type="submit" 
          :disabled="isSubmitting || userLoading"
          class="submit-button"
        >
          {{ isSubmitting ? 'Adding...' : 'Add Playlist' }}
        </button>
        <button 
          type="button" 
          @click="$router.push('/playlists')" 
          class="cancel-button"
        >
          Cancel
        </button>
      </div>
    </form>

    <div v-if="userError || formError" class="error-message">
      {{ userError || formError }}
    </div>

    <div v-if="success" class="success-message">
      Playlist added successfully!
    </div>
  </main>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useUserData } from '@composables/useUserData';
import { useForm } from '@composables/useForm';
import BackButton from '@components/common/BackButton.vue';

const router = useRouter();
const { user, loading: userLoading, error: userError } = useUserData();

const { form, isSubmitting, error: formError, success, handleSubmit, validateForm } = useForm({
  playlistId: '',
  type: 'known',
  category: 'queued',
  priority: 0
});

const validationRules = {
  playlistId: { required: true, minLength: 1 },
  type: { required: true },
  category: { required: true },
  priority: { required: true }
};

const onSubmit = async (formData) => {
  if (!user.value) {
    throw new Error('You must be logged in to add a playlist');
  }

  await addDoc(collection(db, 'playlists'), {
    ...formData,
    userId: user.value.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // Reset form after successful submission
  form.playlistId = '';
  form.type = 'known';
  form.category = 'queued';
  form.priority = 0;
};
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

.error-message {
  @apply mt-4 p-4 bg-red-50 text-red-700 rounded-md;
}

.success-message {
  @apply mt-4 p-4 bg-green-50 text-green-700 rounded-md;
}
</style> 