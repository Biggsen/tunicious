<template>
  <main class="pt-6">
    <div class="mb-6">
      <RouterLink to="/playlists" class="text-blue-500 hover:underline">&larr; Back to Playlists</RouterLink>
    </div>
    <h1 class="h2 pb-4">Add New Playlist</h1>
    
    <form @submit.prevent="handleSubmit" class="playlist-form">
      <div class="form-group">
        <label for="playlistId">Spotify Playlist ID</label>
        <input 
          type="text" 
          id="playlistId" 
          v-model="form.playlistId" 
          required
          placeholder="Enter Spotify playlist ID"
        />
      </div>

      <div class="form-group">
        <label for="type">Playlist Type</label>
        <select id="type" v-model="form.type" required>
          <option value="known">Known Artist</option>
          <option value="new">New Artist</option>
        </select>
      </div>

      <div class="form-group">
        <label for="category">Category</label>
        <select id="category" v-model="form.category" required>
          <option value="queued">Queued</option>
          <option value="curious">Curious</option>
          <option value="interested">Interested</option>
          <option value="great">Great</option>
          <option value="excellent">Excellent</option>
          <option value="wonderful">Wonderful</option>
        </select>
      </div>

      <div class="form-group">
        <label for="priority">Priority</label>
        <input 
          type="number" 
          id="priority" 
          v-model="form.priority" 
          required
        />
      </div>

      <div class="form-actions">
        <button type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Adding...' : 'Add Playlist' }}
        </button>
        <button type="button" @click="$router.push('/playlists')" class="cancel">
          Cancel
        </button>
      </div>
    </form>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="success" class="success-message">
      Playlist added successfully!
    </div>
  </main>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useUserData } from '../composables/useUserData'

const router = useRouter()
const { user, loading: userLoading, error: userError } = useUserData()
const isSubmitting = ref(false)
const error = ref('')
const success = ref(false)

const form = reactive({
  playlistId: '',
  type: 'known',
  category: 'queued',
  priority: 0
})

const handleSubmit = async () => {
  if (!user.value) {
    error.value = 'You must be logged in to add a playlist'
    return
  }

  isSubmitting.value = true
  error.value = ''

  try {
    await addDoc(collection(db, 'playlists'), {
      ...form,
      userId: user.value.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    success.value = true
    form.playlistId = ''
    form.type = 'known'
    form.category = 'queued'
    form.priority = 0
  } catch (err) {
    error.value = 'Failed to add playlist. Please try again.'
    console.error('Error adding playlist:', err)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.playlist-form {
  display: flex;
  flex-direction: column;
  max-width: 600px;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

label {
  font-weight: 500;
  color: #555;
}

input, select {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

input:focus, select:focus {
  outline: none;
  border-color: #4CAF50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

button[type="submit"] {
  background-color: #4CAF50;
  color: white;
}

button[type="submit"]:hover {
  background-color: #45a049;
}

button[type="submit"]:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

button.cancel {
  background-color: #f44336;
  color: white;
}

button.cancel:hover {
  background-color: #da190b;
}

.error-message {
  margin-top: 1rem;
  padding: 1rem;
  background-color: #ffebee;
  color: #c62828;
  border-radius: 4px;
}

.success-message {
  margin-top: 1rem;
  padding: 1rem;
  background-color: #e8f5e9;
  color: #2e7d32;
  border-radius: 4px;
}
</style> 