<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { SpotifyAuth } from '@/constants';
import { useBackendApi } from '@/composables/useBackendApi';

const router = useRouter();
const currentUser = useCurrentUser();
const loading = ref(true);
const error = ref(null);
const { exchangeSpotifyCode } = useBackendApi();

const exchangeCodeForTokens = async (code) => {
  try {
    // Use our secure backend instead of direct API call
    return await exchangeSpotifyCode(code, SpotifyAuth.REDIRECT_URI);
  } catch (err) {
    console.error('Token exchange error:', err);
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
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      throw new Error(`Spotify authorization failed: ${error}`);
    }

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    
    // Store tokens in Firestore
    await storeTokens(tokens);

    // Redirect to account page or home
    router.push('/account');
  } catch (err) {
    console.error('Spotify callback error:', err);
    error.value = err.message;
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
    
    <div v-else-if="error" class="text-center">
      <h2 class="text-xl font-bold mb-4 text-red-600">Connection Failed</h2>
      <p class="text-red-500 mb-4">{{ error }}</p>
      <button @click="router.push('/account')" class="btn-primary">
        Return to Account
      </button>
    </div>
  </div>
</template>

<style scoped>
.btn-primary {
  @apply px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200;
}
</style>
