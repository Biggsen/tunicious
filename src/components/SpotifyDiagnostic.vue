<script setup>
import { ref, onMounted } from 'vue';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUserSpotifyApi } from '@/composables/useUserSpotifyApi';
import BaseButton from '@/components/common/BaseButton.vue';

const user = useCurrentUser();
const { getUserTokens, makeUserRequest } = useUserSpotifyApi();

const diagnosticResults = ref({
  userAuthenticated: false,
  userDocExists: false,
  spotifyConnected: false,
  tokensExist: false,
  tokenExpired: false,
  tokenValid: false,
  apiTest: false,
  errors: []
});

const loading = ref(false);

const runDiagnostic = async () => {
  loading.value = true;
  diagnosticResults.value = {
    userAuthenticated: false,
    userDocExists: false,
    spotifyConnected: false,
    tokensExist: false,
    tokenExpired: false,
    tokenValid: false,
    apiTest: false,
    errors: []
  };

  try {
    // Check 1: User authenticated
    if (user.value) {
      diagnosticResults.value.userAuthenticated = true;
      console.log('✅ User authenticated:', user.value.uid);
    } else {
      diagnosticResults.value.errors.push('User not authenticated');
      return;
    }

    // Check 2: User document exists
    const userDoc = await getDoc(doc(db, 'users', user.value.uid));
    if (userDoc.exists()) {
      diagnosticResults.value.userDocExists = true;
      const userData = userDoc.data();
      console.log('✅ User document exists');
      
      // Check 3: Spotify connected flag
      if (userData.spotifyConnected) {
        diagnosticResults.value.spotifyConnected = true;
        console.log('✅ Spotify connected flag is true');
      } else {
        diagnosticResults.value.errors.push('Spotify connected flag is false');
      }

      // Check 4: Tokens exist
      if (userData.spotifyTokens) {
        diagnosticResults.value.tokensExist = true;
        console.log('✅ Spotify tokens exist');
        
        // Check 5: Token expiration
        const now = Date.now();
        const expiresAt = userData.spotifyTokens.expiresAt;
        if (expiresAt && expiresAt > now) {
          diagnosticResults.value.tokenValid = true;
          console.log('✅ Token is valid, expires at:', new Date(expiresAt));
        } else {
          diagnosticResults.value.tokenExpired = true;
          diagnosticResults.value.errors.push(`Token expired at: ${new Date(expiresAt)}`);
          console.log('❌ Token expired at:', new Date(expiresAt));
        }
      } else {
        diagnosticResults.value.errors.push('No Spotify tokens found');
      }
    } else {
      diagnosticResults.value.errors.push('User document does not exist');
    }

    // Check 6: API test
    try {
      await makeUserRequest('/me');
      diagnosticResults.value.apiTest = true;
      console.log('✅ Spotify API test successful');
    } catch (err) {
      diagnosticResults.value.errors.push(`API test failed: ${err.message}`);
      console.log('❌ Spotify API test failed:', err.message);
    }

  } catch (err) {
    diagnosticResults.value.errors.push(`Diagnostic error: ${err.message}`);
    console.error('Diagnostic error:', err);
  } finally {
    loading.value = false;
  }
};

const clearTokens = async () => {
  if (!user.value) return;
  
  try {
    // First, get the current user data to preserve other fields
    const userDoc = await getDoc(doc(db, 'users', user.value.uid));
    const currentData = userDoc.exists() ? userDoc.data() : {};
    
    // Only clear Spotify-related fields, preserve everything else
    await setDoc(doc(db, 'users', user.value.uid), {
      ...currentData,
      spotifyTokens: null,
      spotifyConnected: false,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    // Emit event to refresh parent component
    window.dispatchEvent(new CustomEvent('spotify-tokens-cleared'));
    
    alert('Spotify tokens cleared. Please reconnect your account.');
    await runDiagnostic();
  } catch (err) {
    console.error('Error clearing tokens:', err);
    alert('Error clearing tokens: ' + err.message);
  }
};

onMounted(() => {
  runDiagnostic();
});
</script>

<template>
  <div class="bg-white shadow rounded-lg p-6">
    <h3 class="text-lg font-semibold text-delft-blue mb-4">Spotify Connection Diagnostic</h3>
    
    <div class="space-y-3 mb-6">
      <div class="flex items-center justify-between">
        <span>User Authenticated:</span>
        <span :class="diagnosticResults.userAuthenticated ? 'text-green-600' : 'text-red-600'">
          {{ diagnosticResults.userAuthenticated ? '✅ Yes' : '❌ No' }}
        </span>
      </div>
      
      <div class="flex items-center justify-between">
        <span>User Document Exists:</span>
        <span :class="diagnosticResults.userDocExists ? 'text-green-600' : 'text-red-600'">
          {{ diagnosticResults.userDocExists ? '✅ Yes' : '❌ No' }}
        </span>
      </div>
      
      <div class="flex items-center justify-between">
        <span>Spotify Connected Flag:</span>
        <span :class="diagnosticResults.spotifyConnected ? 'text-green-600' : 'text-red-600'">
          {{ diagnosticResults.spotifyConnected ? '✅ Yes' : '❌ No' }}
        </span>
      </div>
      
      <div class="flex items-center justify-between">
        <span>Tokens Exist:</span>
        <span :class="diagnosticResults.tokensExist ? 'text-green-600' : 'text-red-600'">
          {{ diagnosticResults.tokensExist ? '✅ Yes' : '❌ No' }}
        </span>
      </div>
      
      <div class="flex items-center justify-between">
        <span>Token Valid:</span>
        <span :class="diagnosticResults.tokenValid ? 'text-green-600' : 'text-red-600'">
          {{ diagnosticResults.tokenValid ? '✅ Yes' : '❌ No' }}
        </span>
      </div>
      
      <div class="flex items-center justify-between">
        <span>API Test:</span>
        <span :class="diagnosticResults.apiTest ? 'text-green-600' : 'text-red-600'">
          {{ diagnosticResults.apiTest ? '✅ Success' : '❌ Failed' }}
        </span>
      </div>
    </div>

    <div v-if="diagnosticResults.errors.length > 0" class="mb-4">
      <h4 class="font-semibold text-gray-700 mb-2">Additional Details:</h4>
      <ul class="list-disc list-inside space-y-1">
        <li v-for="error in diagnosticResults.errors" :key="error" class="text-gray-600 text-sm">
          {{ error }}
        </li>
      </ul>
    </div>

    <div class="flex space-x-3">
      <BaseButton 
        @click="runDiagnostic" 
        :disabled="loading"
        customClass="bg-mint text-white"
      >
        {{ loading ? 'Running...' : 'Run Diagnostic' }}
      </BaseButton>
      
      <BaseButton 
        @click="clearTokens" 
        customClass="bg-red-500 text-white"
      >
        Clear Tokens & Reconnect
      </BaseButton>
    </div>
  </div>
</template>
