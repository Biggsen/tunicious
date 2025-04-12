<script setup>
import { useAuth } from "@composables/useAuth";
import { useUserData } from "@composables/useUserData";
import { useCurrentUser } from "vuefire";
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@firebase';
import { useForm } from '@composables/useForm';

const { loading: authLoading, error: authError, logout } = useAuth();
const { user, userData, loading: userLoading, error: userError, fetchUserData } = useUserData();

const { form, isSubmitting, error: formError, success, handleSubmit } = useForm({
  displayName: '',
  lastFmUserName: ''
});

const validationRules = {
  displayName: { required: true, minLength: 2 },
  lastFmUserName: { required: false }
};

const createUserProfile = async (formData) => {
  if (!user.value) {
    throw new Error('No authenticated user found');
  }

  await setDoc(doc(db, 'users', user.value.uid), {
    displayName: formData.displayName,
    email: user.value.email,
    lastFmUserName: formData.lastFmUserName || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await fetchUserData(user.value.uid);
};

const handleLogout = async () => {
  try {
    await logout('/');
  } catch (err) {
    console.error("Error signing out:", err);
  }
};
</script>

<template>
  <main class="max-w-2xl mx-auto p-6">
    <h1 class="h2 pb-10">Account Details</h1>
    
    <div v-if="userLoading || authLoading" class="loading-message">
      Loading user profile...
    </div>
    
    <div v-else-if="userError || authError" class="error-message">
      {{ userError || authError }}
    </div>
    
    <div v-else-if="userData" class="user-profile bg-white shadow rounded-lg p-6">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Name</h2>
          <span class="text-gray-600">{{ userData.displayName }}</span>
        </div>
        
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Email</h2>
          <span class="text-gray-600">{{ userData.email }}</span>
        </div>
        
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Last.fm Username</h2>
          <span class="text-gray-600">{{ userData.lastFmUserName || 'Not set' }}</span>
        </div>
      </div>
      
      <div class="mt-8">
        <button 
          @click="handleLogout" 
          class="logout-button"
          :disabled="authLoading"
        >
          {{ authLoading ? 'Logging out...' : 'Logout' }}
        </button>
      </div>
    </div>
    
    <div v-else class="text-center">
      <p class="text-gray-600 mb-6">No user profile data available.</p>
      <form @submit.prevent="handleSubmit(createUserProfile)" class="max-w-md mx-auto bg-white shadow rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Create Your Profile</h2>
        
        <div class="space-y-4">
          <div class="form-group">
            <label for="displayName">Display Name</label>
            <input 
              type="text" 
              id="displayName" 
              v-model="form.displayName"
              class="form-input"
              :class="{ 'error': formError?.displayName }"
              required
            />
            <span v-if="formError?.displayName" class="error-text">{{ formError.displayName }}</span>
          </div>
          
          <div class="form-group">
            <label for="lastFmUserName">Last.fm Username (Optional)</label>
            <input 
              type="text" 
              id="lastFmUserName" 
              v-model="form.lastFmUserName"
              class="form-input"
              :class="{ 'error': formError?.lastFmUserName }"
            />
            <span v-if="formError?.lastFmUserName" class="error-text">{{ formError.lastFmUserName }}</span>
          </div>
        </div>
        
        <div class="mt-6">
          <button 
            type="submit" 
            class="submit-button w-full"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? 'Creating Profile...' : 'Create Profile' }}
          </button>
        </div>
        
        <div v-if="formError" class="error-message mt-4">
          {{ formError }}
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.loading-message {
  @apply text-center text-gray-600;
}

.error-message {
  @apply p-4 bg-red-50 text-red-700 rounded-lg;
}

.user-profile {
  @apply border border-gray-200;
}

.logout-button {
  @apply w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
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

.error-text {
  @apply text-sm text-red-600;
}

.submit-button {
  @apply px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>