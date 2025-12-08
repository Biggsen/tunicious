<script setup>
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useBackendApi } from '@/composables/useBackendApi';
import { logLastFm } from '@utils/logger';
import BaseButton from '@components/common/BaseButton.vue';

const router = useRouter();
const route = useRoute();
const currentUser = useCurrentUser();
const loading = ref(true);
const error = ref(null);
const success = ref(false);
const isOnboardingMode = ref(false);
const { lastfmApiCall } = useBackendApi();

const handleContinue = () => {
  console.log('[LastFmCallback] Continue button clicked, redirecting to onboarding');
  router.push('/onboarding?step=lastfm');
};

const handleErrorReturn = () => {
  if (isOnboardingMode.value) {
    router.push('/onboarding?step=lastfm');
  } else {
    router.push('/account');
  }
};

const getSessionKey = async (token) => {
  try {
    // Get session key from Last.fm using the token
    const response = await lastfmApiCall('auth.getSession', { token });
    
    if (response.session && response.session.key) {
      return response.session.key;
    } else {
      // Check if there's an error in the response
      if (response.error) {
        const errorMsg = response.message || `Last.fm error ${response.error}`;
        throw new Error(errorMsg);
      }
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
    // Check if user is in onboarding mode
    isOnboardingMode.value = sessionStorage.getItem('lastfm_onboarding') === 'true';
    
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

    console.log('[LastFmCallback] Connection successful, isOnboarding:', isOnboardingMode.value);
    
    if (isOnboardingMode.value) {
      // Show success message and let user continue
      success.value = true;
      loading.value = false;
      sessionStorage.removeItem('lastfm_onboarding');
    } else {
      // Redirect to account page
      router.push('/account');
    }
  } catch (err) {
    logLastFm('Last.fm callback error:', err);
    error.value = err.message;
    sessionStorage.removeItem('lastfm_onboarding');
  } finally {
    if (!success.value) {
      loading.value = false;
    }
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
    
    <div v-else-if="success" class="text-center">
      <div class="success-icon mb-4">✓</div>
      <h2 class="text-xl font-bold mb-4 text-green-600">Last.fm Connected Successfully!</h2>
      <p class="text-gray-700 mb-6">You can now love tracks while listening to music.</p>
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
