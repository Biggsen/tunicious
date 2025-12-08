<template>
  <div class="lastfm-step">
    <!-- Username Entry (Step 2a) - if username doesn't exist -->
    <div v-if="!hasUsername" class="lastfm-content">
      <div class="lastfm-intro">
        <div class="lastfm-logo">🎵</div>
        <h3 class="lastfm-heading">Enter Your Last.fm Username</h3>
        <p class="lastfm-description">
          Last.fm enables track loving/hearting functionality. This helps you track your favorite tracks while listening.
        </p>
      </div>

      <form @submit.prevent="handleSaveUsername" class="username-form">
        <div class="form-group">
          <label for="lastFmUserName" class="form-label">Last.fm Username</label>
          <input
            type="text"
            id="lastFmUserName"
            v-model="form.lastFmUserName"
            class="form-input"
            :class="{ 'error': fieldErrors?.lastFmUserName }"
            placeholder="Enter your Last.fm username"
            required
          />
          <span v-if="fieldErrors?.lastFmUserName" class="error-text">
            {{ fieldErrors.lastFmUserName }}
          </span>
        </div>

        <div class="form-actions">
          <BaseButton
            type="submit"
            :disabled="!canSaveUsername || savingUsername"
            variant="primary"
            class="save-button"
          >
            {{ savingUsername ? 'Saving...' : 'Save Username' }}
          </BaseButton>
        </div>

        <div v-if="saveError" class="error-message">
          <p class="error-text">{{ saveError }}</p>
          <BaseButton
            @click="handleSaveUsername"
            variant="secondary"
            class="retry-button"
          >
            Try Again
          </BaseButton>
        </div>
      </form>
    </div>

    <!-- Connection Step (Step 2b) - if username exists -->
    <div v-else-if="!isConnected" class="lastfm-content">
      <div class="lastfm-intro">
        <div class="lastfm-logo">🎵</div>
        <h3 class="lastfm-heading">Connect Your Last.fm Account</h3>
        <p class="lastfm-description">
          Last.fm enables track loving/hearting functionality. This helps you track your favorite tracks while listening.
        </p>
      </div>

      <div class="username-display">
        <p class="username-label">Last.fm Username:</p>
        <p class="username-value">{{ userData?.lastFmUserName }}</p>
      </div>

      <div class="lastfm-actions">
        <BaseButton
          @click="handleConnect"
          :disabled="connecting"
          variant="primary"
          class="connect-button"
        >
          {{ connecting ? 'Connecting...' : 'Enable Track Loving' }}
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

    <!-- Success State -->
    <div v-else class="lastfm-success">
      <div class="success-icon">✓</div>
      <h3 class="success-heading">Last.fm Connected Successfully!</h3>
      <p class="success-description">
        You can now love tracks while listening to music.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useLastFmApi } from '@composables/useLastFmApi';
import { useUserData } from '@composables/useUserData';
import BaseButton from '@components/common/BaseButton.vue';

const user = useCurrentUser();
const { getAuthUrl } = useLastFmApi();
const { userData, fetchUserData } = useUserData();

const form = ref({
  lastFmUserName: ''
});

const fieldErrors = ref({});
const savingUsername = ref(false);
const saveError = ref(null);
const connecting = ref(false);
const error = ref(null);

const hasUsername = computed(() => {
  return !!userData.value?.lastFmUserName;
});

const isConnected = computed(() => {
  return !!userData.value?.lastFmAuthenticated;
});

const canSaveUsername = computed(() => {
  return !!form.value.lastFmUserName.trim();
});

// Watch for connection status changes
watch(() => userData.value?.lastFmAuthenticated, (connected) => {
  if (connected) {
    console.log('[LastFmStep] Last.fm connection detected');
    error.value = null;
    connecting.value = false;
  }
}, { immediate: true });

// Populate form if username exists
watch(() => userData.value?.lastFmUserName, (username) => {
  if (username && !form.value.lastFmUserName) {
    form.value.lastFmUserName = username;
  }
}, { immediate: true });

// Refresh user data on mount
onMounted(async () => {
  console.log('[LastFmStep] Component mounted, checking Last.fm status...');
  if (user.value) {
    await fetchUserData(user.value.uid);
  }
});

const handleSaveUsername = async () => {
  console.log('[LastFmStep] Save username clicked:', form.value.lastFmUserName);
  
  if (!user.value || !form.value.lastFmUserName.trim()) {
    fieldErrors.value.lastFmUserName = 'Last.fm username is required';
    return;
  }

  savingUsername.value = true;
  saveError.value = null;
  fieldErrors.value = {};

  try {
    console.log('[LastFmStep] Saving Last.fm username to Firestore...');
    await setDoc(doc(db, 'users', user.value.uid), {
      lastFmUserName: form.value.lastFmUserName.trim(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log('[LastFmStep] Username saved successfully');
    
    // Refresh user data
    await fetchUserData(user.value.uid);
    console.log('[LastFmStep] User data refreshed');
  } catch (err) {
    console.error('[LastFmStep] Error saving username:', err);
    saveError.value = err.message || 'Failed to save username. Please try again.';
  } finally {
    savingUsername.value = false;
  }
};

const handleConnect = () => {
  console.log('[LastFmStep] Enable Track Loving button clicked');
  connecting.value = true;
  error.value = null;
  
  try {
    // Mark that we're in onboarding mode so callback knows where to redirect
    sessionStorage.setItem('lastfm_onboarding', 'true');
    console.log('[LastFmStep] Set onboarding flag, initiating Last.fm auth...');
    
    const callbackUrl = `${window.location.origin}/lastfm-callback`;
    const authUrl = getAuthUrl(callbackUrl);
    console.log('[LastFmStep] Redirecting to Last.fm auth:', authUrl);
    window.location.href = authUrl;
    // User will be redirected to Last.fm, so we don't need to handle the return here
  } catch (err) {
    console.error('[LastFmStep] Error initiating Last.fm auth:', err);
    error.value = err.message || 'Failed to connect to Last.fm. Please try again.';
    connecting.value = false;
    sessionStorage.removeItem('lastfm_onboarding');
  }
};
</script>

<style lang="scss" scoped>
.lastfm-step {
  @apply w-full;
}

.lastfm-content {
  @apply space-y-6;
}

.lastfm-intro {
  @apply text-center mb-8;
}

.lastfm-logo {
  @apply text-6xl mb-4;
}

.lastfm-heading {
  @apply text-2xl font-bold text-delft-blue mb-3;
}

.lastfm-description {
  @apply text-lg text-gray-700 mb-2;
}

.username-form {
  @apply bg-white rounded-lg p-6 border border-gray-200;
}

.form-group {
  @apply mb-4;
}

.form-label {
  @apply block text-base font-medium text-gray-900 mb-2;
}

.form-input {
  @apply block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-delft-blue sm:text-base;
  
  &.error {
    @apply ring-red-500;
  }
}

.error-text {
  @apply mt-1 text-sm text-red-600;
}

.form-actions {
  @apply mt-6;
}

.save-button,
.connect-button {
  @apply min-w-[200px];
}

.username-display {
  @apply bg-celadon rounded-lg p-4 mb-6 text-center;
}

.username-label {
  @apply text-sm text-gray-600 mb-1;
}

.username-value {
  @apply text-lg font-semibold text-delft-blue;
}

.error-message {
  @apply mt-4 p-4 bg-red-50 rounded-lg border border-red-200 text-center;
}

.retry-button {
  @apply mt-2;
}

.lastfm-success {
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
  .lastfm-logo,
  .success-icon {
    @apply text-4xl;
  }
  
  .lastfm-heading,
  .success-heading {
    @apply text-xl;
  }
}
</style>

