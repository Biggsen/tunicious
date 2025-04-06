<script setup>
import { useAuth } from "../composables/useAuth";
import { useUserData } from "../composables/useUserData";

const { loading: authLoading, error: authError, logout } = useAuth();
const { user, userData, loading: userLoading, error: userError } = useUserData();

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
    
    <div v-else class="text-center text-gray-600">
      No user profile data available.
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
</style>