<script setup>
import { useUserData } from "@composables/useUserData";
import LastFmStats from '@components/LastFmStats.vue';
import LastFmUsageStats from '@components/LastFmUsageStats.vue';
import SpotifyUsageStats from '@components/SpotifyUsageStats.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import Card from '@components/common/Card.vue';

const { userData, loading: userLoading, error: userError } = useUserData();
</script>

<template>
  <div class="statistics-section space-y-6">
    <h2 class="text-2xl font-semibold text-delft-blue mb-6">Statistics</h2>
    
    <LoadingMessage v-if="userLoading" message="Loading statistics..." />
    
    <ErrorMessage v-else-if="userError" :message="userError" />
    
    <div v-else-if="userData && userData.displayName" class="space-y-6">
      <!-- Spotify API Usage Stats -->
      <SpotifyUsageStats />

      <!-- Last.fm API Usage Stats -->
      <LastFmUsageStats />

      <!-- Last.fm User Stats -->
      <LastFmStats v-if="userData.lastFmUserName" :username="userData.lastFmUserName" />
      <Card v-else>
        <p class="text-gray-600">Last.fm username not configured. Set your Last.fm username in your profile to view statistics.</p>
      </Card>
    </div>
    
    <Card v-else>
      <p class="text-gray-600">No user data available.</p>
    </Card>
  </div>
</template>

