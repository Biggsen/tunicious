<script setup>
import { useUserData } from "@composables/useUserData";
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import Card from '@components/common/Card.vue';

const { user, userData, loading: userLoading, error: userError } = useUserData();
</script>

<template>
  <div class="profile-section">
    <h2 class="text-2xl font-semibold text-delft-blue mb-6">Profile</h2>
    
    <LoadingMessage v-if="userLoading" message="Loading profile..." />
    
    <ErrorMessage v-else-if="userError" :message="userError" />
    
    <Card v-else-if="userData && userData.displayName">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Name</h3>
          <span class="text-gray-600">{{ userData.displayName }}</span>
        </div>
        
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Email</h3>
          <span class="text-gray-600">{{ userData.email || user?.email || 'Not set' }}</span>
        </div>
        
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Last.fm Username</h3>
          <span class="text-gray-600">{{ userData.lastFmUserName || 'Not set' }}</span>
        </div>
      </div>
    </Card>
    
    <Card v-else>
      <p class="text-gray-600">No profile data available.</p>
      <p v-if="user" class="text-sm text-gray-500 mt-2">User ID: {{ user.uid }}</p>
    </Card>
  </div>
</template>


