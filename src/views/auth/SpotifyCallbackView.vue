<script setup>
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { SpotifyAuth } from '@/constants';
import { useBackendApi } from '@/composables/useBackendApi';
import { logSpotify } from '@utils/logger';
import BaseButton from '@components/common/BaseButton.vue';

const router = useRouter();
const route = useRoute();
const currentUser = useCurrentUser();
const loading = ref(true);
const error = ref(null);
const success = ref(false);
const isOnboardingMode = ref(false);
const { exchangeSpotifyCode } = useBackendApi();

const handleContinue = () => {
  console.log('[SpotifyCallback] Continue button clicked, redirecting to onboarding');
  router.push('/onboarding?step=spotify');
};

const handleErrorReturn = () => {
  if (isOnboardingMode.value) {
    router.push('/onboarding?step=spotify');
  } else {
    router.push('/account');
  }
};

const exchangeCodeForTokens = async (code) => {
  try {
    // Use our secure backend instead of direct API call
    return await exchangeSpotifyCode(code, SpotifyAuth.REDIRECT_URI);
  } catch (err) {
    logSpotify('Token exchange error:', err);
    throw err;
  }
};

const storeTokens = async (tokens) => {
  if (!currentUser.value) {
    throw new Error('No authenticated user');
  }

  await setDoc(doc(db, 'users', currentUser.value.uid), {
    spotifyTokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (tokens.expiresIn * 1000)
    },
    spotifyConnected: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

onMounted(async () => {
  try {
    // Check if user is in onboarding mode
    isOnboardingMode.value = sessionStorage.getItem('spotify_onboarding') === 'true';
    
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const errorParam = urlParams.get('error');

    if (errorParam) {
      throw new Error(`Spotify authorization failed: ${errorParam}`);
    }

    // Validate state parameter for CSRF protection
    const storedState = sessionStorage.getItem('spotify_oauth_state');
    if (!state || !storedState || state !== storedState) {
      sessionStorage.removeItem('spotify_oauth_state');
      throw new Error('Invalid state parameter - possible CSRF attack. Please try again.');
    }

    // Clear state from sessionStorage after validation
    sessionStorage.removeItem('spotify_oauth_state');

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    
    // Store tokens in Firestore
    await storeTokens(tokens);

    // Check if user is in onboarding mode
    const isOnboarding = sessionStorage.getItem('spotify_onboarding') === 'true';
    sessionStorage.removeItem('spotify_onboarding');
    
    console.log('[SpotifyCallback] Connection successful, isOnboarding:', isOnboarding);
    
    if (isOnboarding) {
      // Show success message and let user continue
      success.value = true;
      loading.value = false;
    } else {
      // Redirect to account page
      router.push('/account');
    }
  } catch (err) {
    logSpotify('Spotify callback error:', err);
    error.value = err.message;
    sessionStorage.removeItem('spotify_onboarding');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="p-4 pt-8">
    <div v-if="loading" class="text-center">
      <h2 class="text-xl font-bold mb-4">Connecting to Spotify...</h2>
      <p>Please wait while we complete your Spotify authorization.</p>
    </div>
    
    <div v-else-if="success" class="text-center">
      <div class="success-icon mb-4">✓</div>
      <h2 class="text-xl font-bold mb-4 text-green-600">Spotify Connected Successfully!</h2>
      <p class="text-gray-700 mb-6">You can now play music and manage playlists.</p>
      <BaseButton
        @click="handleContinue"
        variant="primary"
        class="continue-button"
      >
        Continue
      </BaseButton>
    </div>
    
    <div v-else-if="error" class="text-center">
      <h2 class="text-xl font-bold mb-4 text-red-600">Connection Failed</h2>
      <p class="text-red-500 mb-4">{{ error }}</p>
      <BaseButton
        @click="handleErrorReturn"
        variant="secondary"
        class="return-button"
      >
        {{ isOnboardingMode ? 'Return to Onboarding' : 'Return to Account' }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.btn-primary {
  @apply px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200;
}
</style>
