<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useBackendApi } from '@/composables/useBackendApi';
import { logLastFm } from '@utils/logger';

const router = useRouter();
const currentUser = useCurrentUser();
const loading = ref(true);
const error = ref(null);
const { lastfmApiCall } = useBackendApi();

const getSessionKey = async (token) => {
  try {
    // Get session key from Last.fm using the token
    const response = await lastfmApiCall('auth.getSession', { token });
    
    if (response.session && response.session.key) {
      return response.session.key;
    } else {
      throw new Error('No session key received from Last.fm');
    }
  } catch (err) {
    logLastFm('Session key error:', err);
    throw err;
  }
};

const storeSessionKey = async (sessionKey) => {
  if (!currentUser.value) {
    throw new Error('No authenticated user');
  }

  await setDoc(doc(db, 'users', currentUser.value.uid), {
    lastFmSessionKey: sessionKey,
    lastFmAuthenticated: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

onMounted(async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const errorParam = urlParams.get('error');

    if (errorParam) {
      throw new Error(`Last.fm authorization failed: ${errorParam}`);
    }

    if (!token) {
      throw new Error('No authorization token received');
    }

    // Exchange token for session key
    const sessionKey = await getSessionKey(token);
    
    // Store session key in Firestore
    await storeSessionKey(sessionKey);

    // Redirect to account page
    router.push('/account');
  } catch (err) {
    logLastFm('Last.fm callback error:', err);
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="p-4 pt-8">
    <div v-if="loading" class="text-center">
      <p class="text-delft-blue text-lg">Connecting to Last.fm...</p>
      <div class="mt-4">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-delft-blue mx-auto"></div>
      </div>
    </div>
    
    <div v-else-if="error" class="text-center">
      <p class="text-red-500 text-lg mb-4">{{ error }}</p>
      <button 
        @click="router.push('/account')" 
        class="bg-delft-blue text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
      >
        Return to Account
      </button>
    </div>
    
    <div v-else class="text-center">
      <p class="text-green-600 text-lg">Successfully connected to Last.fm!</p>
      <p class="text-delft-blue mt-2">Redirecting to your account...</p>
    </div>
  </div>
</template>
