<script setup>
import { useUserData } from "@composables/useUserData";
import CacheManager from '@components/common/CacheManager.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import Card from '@components/common/Card.vue';

const { userData, loading: userLoading, error: userError } = useUserData();
</script>

<template>
  <div class="cache-section">
    <h2 class="text-2xl font-semibold text-delft-blue mb-6">Cache</h2>
    
    <LoadingMessage v-if="userLoading" message="Loading cache manager..." />
    
    <ErrorMessage v-else-if="userError" :message="userError" />
    
    <div v-else-if="userData && userData.displayName">
      <CacheManager />
    </div>
    
    <Card v-else>
      <p class="text-gray-600">No user data available.</p>
    </Card>
  </div>
</template>

