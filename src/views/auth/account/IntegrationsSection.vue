<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useUserData } from "@composables/useUserData";
import { useSpotifyAuth } from '@composables/useSpotifyAuth';
import { useLastFmApi } from '@composables/useLastFmApi';
import { logLastFm } from '@utils/logger';
import BaseButton from '@components/common/BaseButton.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import Card from '@components/common/Card.vue';

const { user, userData, loading: userLoading, error: userError, fetchUserData } = useUserData();
const { initiateSpotifyLogin } = useSpotifyAuth();
const { getAuthUrl } = useLastFmApi();

const initiateLastFmAuth = () => {
  try {
    const callbackUrl = `${window.location.origin}/lastfm-callback`;
    const authUrl = getAuthUrl(callbackUrl);
    window.location.href = authUrl;
  } catch (err) {
    logLastFm("Error initiating Last.fm auth:", err);
  }
};

// Listen for token clearing events to refresh user data
const handleTokensCleared = () => {
  if (user.value) {
    fetchUserData(user.value.uid);
  }
};

onMounted(() => {
  window.addEventListener('spotify-tokens-cleared', handleTokensCleared);
});

onUnmounted(() => {
  window.removeEventListener('spotify-tokens-cleared', handleTokensCleared);
});
</script>

<template>
  <div class="integrations-section">
    <h2 class="text-2xl font-semibold text-delft-blue mb-6">Integrations</h2>
    
    <LoadingMessage v-if="userLoading" message="Loading integrations..." />
    
    <ErrorMessage v-else-if="userError" :message="userError" />
    
    <div v-else-if="userData && userData.displayName" class="space-y-6">
      <!-- Spotify Integration -->
      <Card>
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Spotify</h3>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-gray-700">Connection Status</span>
            <div class="flex items-center space-x-2">
              <span v-if="userData.spotifyConnected" class="text-green-600">✅ Connected</span>
              <span v-else class="text-gray-500">❌ Not Connected</span>
            </div>
          </div>
          
          <div v-if="!userData.spotifyConnected">
            <BaseButton 
              @click="initiateSpotifyLogin" 
              customClass="spotify-connect-button"
            >
              Connect Spotify Account
            </BaseButton>
          </div>
        </div>
      </Card>

      <!-- Last.fm Integration -->
      <Card>
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Last.fm</h3>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-gray-700">Username</span>
            <span class="text-gray-600">{{ userData.lastFmUserName || 'Not set' }}</span>
          </div>
          
          <div class="flex items-center justify-between">
            <span class="text-gray-700">Authentication Status</span>
            <div class="flex items-center space-x-2">
              <span v-if="userData.lastFmAuthenticated" class="text-green-600">✅ Authenticated</span>
              <span v-else class="text-gray-500">❌ Not Authenticated</span>
            </div>
          </div>
          
          <div v-if="!userData.lastFmAuthenticated && userData.lastFmUserName">
            <BaseButton 
              @click="initiateLastFmAuth" 
              customClass="lastfm-auth-button"
            >
              Enable Track Loving
            </BaseButton>
            <p class="text-sm text-gray-600 mt-2">
              Allow AudioFoodie to love/unlove tracks on your Last.fm profile
            </p>
          </div>
        </div>
      </Card>
    </div>
    
    <Card v-else>
      <p class="text-gray-600">No user data available.</p>
    </Card>
  </div>
</template>

<style scoped>
.spotify-connect-button {
  @apply px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200;
}

.lastfm-auth-button {
  @apply px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200;
}
</style>

