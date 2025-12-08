<template>
  <div class="spotify-step">
    <div v-if="!isConnected" class="spotify-content">
      <div class="spotify-intro">
        <div class="spotify-logo">🎵</div>
        <h3 class="spotify-heading">Connect Your Spotify Account</h3>
        <p class="spotify-description">
          Spotify is required for playing music and managing playlists.
        </p>
        <p class="spotify-safety">
          We won't mess with any of your existing playlists.
        </p>
      </div>

      <div class="spotify-actions">
        <BaseButton
          @click="handleConnect"
          :disabled="connecting"
          variant="primary"
          class="connect-button"
        >
          {{ connecting ? 'Connecting...' : 'Connect Spotify' }}
        </BaseButton>
      </div>

      <div v-if="error" class="error-message">
        <p class="error-text">{{ error }}</p>
        <BaseButton
          @click="handleConnect"
          variant="secondary"
          class="retry-button"
        >
          Try Again
        </BaseButton>
      </div>
    </div>

    <div v-else class="spotify-success">
      <div class="success-icon">✓</div>
      <h3 class="success-heading">Spotify Connected Successfully!</h3>
      <p class="success-description">
        You can now play music, manage playlists, and explore albums.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useCurrentUser } from 'vuefire';
import { useSpotifyAuth } from '@composables/useSpotifyAuth';
import { useUserData } from '@composables/useUserData';
import BaseButton from '@components/common/BaseButton.vue';

const user = useCurrentUser();
const { initiateSpotifyLogin } = useSpotifyAuth();
const { userData, fetchUserData } = useUserData();

const connecting = ref(false);
const error = ref(null);

const isConnected = computed(() => {
  return !!userData.value?.spotifyConnected;
});

// Watch for connection status changes
watch(() => userData.value?.spotifyConnected, (connected) => {
  if (connected) {
    console.log('[SpotifyStep] Spotify connection detected');
    error.value = null;
    connecting.value = false;
  }
}, { immediate: true });

// Refresh user data on mount to check connection status
onMounted(async () => {
  console.log('[SpotifyStep] Component mounted, checking Spotify connection status...');
  if (userData.value && !userData.value.spotifyConnected) {
    // Try to refresh user data in case connection was just established
    const { user } = useCurrentUser();
    if (user.value) {
      await fetchUserData(user.value.uid);
    }
  }
});

const handleConnect = () => {
  console.log('[SpotifyStep] Connect Spotify button clicked');
  connecting.value = true;
  error.value = null;
  
  try {
    // Mark that we're in onboarding mode so callback knows where to redirect
    sessionStorage.setItem('spotify_onboarding', 'true');
    console.log('[SpotifyStep] Set onboarding flag, initiating Spotify login...');
    initiateSpotifyLogin();
    // User will be redirected to Spotify, so we don't need to handle the return here
  } catch (err) {
    console.error('[SpotifyStep] Error initiating Spotify login:', err);
    error.value = err.message || 'Failed to connect to Spotify. Please try again.';
    connecting.value = false;
    sessionStorage.removeItem('spotify_onboarding');
  }
};
</script>

<style lang="scss" scoped>
.spotify-step {
  @apply w-full;
}

.spotify-content {
  @apply space-y-6;
}

.spotify-intro {
  @apply text-center mb-8;
}

.spotify-logo {
  @apply text-6xl mb-4;
}

.spotify-heading {
  @apply text-2xl font-bold text-delft-blue mb-3;
}

.spotify-description {
  @apply text-lg text-gray-700 mb-2;
}

.spotify-safety {
  @apply text-sm text-gray-500 italic;
}

.spotify-actions {
  @apply flex justify-center;
}

.connect-button {
  @apply min-w-[200px];
}

.error-message {
  @apply mt-4 p-4 bg-red-50 rounded-lg border border-red-200 text-center;
}

.error-text {
  @apply text-red-600 mb-3;
}

.retry-button {
  @apply mt-2;
}

.spotify-success {
  @apply text-center py-8;
}

.success-icon {
  @apply text-6xl text-mint mb-4 font-bold;
}

.success-heading {
  @apply text-2xl font-bold text-delft-blue mb-3;
}

.success-description {
  @apply text-lg text-gray-700;
}

@media (max-width: 640px) {
  .spotify-logo,
  .success-icon {
    @apply text-4xl;
  }
  
  .spotify-heading,
  .success-heading {
    @apply text-xl;
  }
}
</style>

