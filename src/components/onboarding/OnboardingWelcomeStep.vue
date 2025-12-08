<template>
  <div class="welcome-step">
    <div v-if="!hasDisplayName" class="welcome-content">
      <div class="welcome-section">
        <h2 class="welcome-heading">Welcome to Tunicious!</h2>
        <p class="welcome-text">
          Tunicious helps you discover and organize your music through a pipeline system.
        </p>
      </div>

      <div class="requirements-section">
        <h3 class="requirements-heading">What You'll Need</h3>
        <div class="requirements-list">
          <div class="requirement-item">
            <div class="requirement-icon">🎵</div>
            <div class="requirement-content">
              <h4 class="requirement-title">Last.fm Account</h4>
              <p class="requirement-description">
                For tracking your listening and loving tracks. You'll need your Last.fm username.
              </p>
            </div>
          </div>
          <div class="requirement-item">
            <div class="requirement-icon">🎧</div>
            <div class="requirement-content">
              <h4 class="requirement-title">Premium Spotify Account</h4>
              <p class="requirement-description">
                Required for playing full albums and managing playlists. Free accounts have limited playback features.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="profile-form">
        <div class="form-group">
          <label for="displayName" class="form-label">Display Name</label>
          <input
            type="text"
            id="displayName"
            v-model="form.displayName"
            class="form-input"
            :class="{ 'error': fieldErrors?.displayName }"
            placeholder="Enter your display name"
            required
          />
          <span v-if="fieldErrors?.displayName" class="error-text">
            {{ fieldErrors.displayName }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="welcome-content">
      <div class="welcome-section">
        <h2 class="welcome-heading">Welcome to Tunicious!</h2>
        <p class="welcome-text">
          Tunicious helps you discover and organize your music through a pipeline system.
        </p>
        <p class="welcome-message">Let's get you set up!</p>
      </div>

      <div class="requirements-section">
        <h3 class="requirements-heading">What You'll Need</h3>
        <div class="requirements-list">
          <div class="requirement-item">
            <div class="requirement-icon">🎵</div>
            <div class="requirement-content">
              <h4 class="requirement-title">Last.fm Account</h4>
              <p class="requirement-description">
                For tracking your listening and loving tracks. You'll need your Last.fm username.
              </p>
            </div>
          </div>
          <div class="requirement-item">
            <div class="requirement-icon">🎧</div>
            <div class="requirement-content">
              <h4 class="requirement-title">Premium Spotify Account</h4>
              <p class="requirement-description">
                Required for playing full albums and managing playlists. Free accounts have limited playback features.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useCurrentUser } from 'vuefire';
import { useUserData } from '@composables/useUserData';

const props = defineProps({
  displayName: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:displayName']);

const user = useCurrentUser();
const { userData } = useUserData();

const form = ref({
  displayName: props.displayName || ''
});

const fieldErrors = ref({});

const hasDisplayName = computed(() => {
  return !!userData.value?.displayName;
});

// Watch for userData changes to populate form if displayName exists
watch(() => userData.value?.displayName, (newDisplayName) => {
  if (newDisplayName) {
    // Always update form and emit to parent when userData has displayName
    form.value.displayName = newDisplayName;
    emit('update:displayName', newDisplayName);
    console.log('[WelcomeStep] DisplayName found in userData, syncing:', newDisplayName);
  }
}, { immediate: true });

// Watch form changes and emit to parent, and handle validation
watch(() => form.value.displayName, (newValue) => {
  emit('update:displayName', newValue);
  
  // Clear field errors when user types
  if (newValue && newValue.trim() !== '') {
    fieldErrors.value.displayName = null;
  }
}, { immediate: true });
</script>

<style lang="scss" scoped>
.welcome-step {
  @apply w-full;
}

.welcome-content {
  @apply space-y-6;
}

.welcome-section {
  @apply text-center mb-8;
}

.welcome-heading {
  @apply text-3xl font-bold text-delft-blue mb-4;
}

.welcome-text {
  @apply text-lg text-gray-700 mb-2;
}

.welcome-message {
  @apply text-xl font-semibold text-delft-blue mt-4;
}

.requirements-section {
  @apply bg-celadon rounded-lg p-6 mb-6;
}

.requirements-heading {
  @apply text-xl font-semibold text-delft-blue mb-4;
}

.requirements-list {
  @apply space-y-4;
}

.requirement-item {
  @apply flex gap-4 items-start;
}

.requirement-icon {
  @apply text-3xl flex-shrink-0;
}

.requirement-content {
  @apply flex-1;
}

.requirement-title {
  @apply text-lg font-semibold text-delft-blue mb-1;
}

.requirement-description {
  @apply text-gray-700;
}

.profile-form {
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

@media (max-width: 640px) {
  .welcome-heading {
    @apply text-2xl;
  }
  
  .requirement-item {
    @apply flex-col;
  }
  
  .requirement-icon {
    @apply text-2xl;
  }
}
</style>

