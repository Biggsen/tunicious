<template>
  <div class="onboarding-view">
    <div v-if="loading" class="loading-container">
      <p>Loading onboarding...</p>
    </div>
    
    <div v-else-if="error" class="error-container">
      <p class="text-red-600">{{ error }}</p>
    </div>
    
    <div v-else class="onboarding-container">
      <!-- Progress Bar -->
      <OnboardingProgress
        :current-step-id="currentStep"
        :completed-steps="completedSteps"
        :steps="steps"
      />
      
      <!-- Step Content -->
      <div class="onboarding-content">
        <div class="step-description-section">
          <p class="step-description">
            {{ getStepDescription(currentStep) }}
          </p>
        </div>
        
        <div class="step-body">
          <!-- Step content will be added here later -->
          <div class="step-placeholder">
            <p>Step content for: {{ currentStepObjectComputed.title }}</p>
            <p class="text-sm text-gray-500 mt-2">
              This step's content will be implemented next.
            </p>
          </div>
        </div>
      </div>
      
      <!-- Navigation Buttons -->
      <div class="onboarding-actions">
        <BaseButton
          v-if="canGoBack"
          @click="goToPreviousStep"
          variant="secondary"
        >
          Back
        </BaseButton>
        
        <BaseButton
          @click="handleNext"
          :disabled="!canProceed"
          variant="primary"
        >
          {{ isLastStep ? 'Complete' : 'Next' }}
        </BaseButton>
        
        <BaseButton
          v-if="showSkip"
          @click="handleSkip"
          variant="secondary"
          class="skip-button"
        >
          Skip for Now
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOnboarding, ONBOARDING_STEPS } from '@composables/useOnboarding';
import OnboardingProgress from '@components/onboarding/OnboardingProgress.vue';
import BaseButton from '@components/common/BaseButton.vue';

const route = useRoute();
const router = useRouter();

const {
  currentStep: onboardingCurrentStep,
  completedSteps,
  isCompleted,
  isSkipped,
  loading,
  error,
  loadOnboardingState,
  updateCurrentStep,
  completeStep,
  skipOnboarding,
  completeOnboarding,
  isStepCompleted,
  steps
} = useOnboarding();

// Get step from URL query param or use onboarding state
const currentStep = computed(() => {
  const stepFromUrl = route.query.step;
  if (stepFromUrl && steps.find(s => s.id === stepFromUrl)) {
    return stepFromUrl;
  }
  return onboardingCurrentStep.value || 'welcome';
});

// Compute current step index from URL step
const currentStepIndexComputed = computed(() => {
  const step = steps.find(s => s.id === currentStep.value);
  return step ? step.order : 0;
});

// Get current step object
const currentStepObjectComputed = computed(() => {
  return steps.find(s => s.id === currentStep.value) || steps[0];
});

// Check if we can go back
const canGoBack = computed(() => {
  return currentStepIndexComputed.value > 0;
});

// Check if we can proceed (for now, always true - will be step-specific later)
const canProceed = computed(() => {
  return true;
});

// Check if this is the last step
const isLastStep = computed(() => {
  return currentStepIndexComputed.value === steps.length - 1;
});

// Show skip button after step 3 (create_source)
const showSkip = computed(() => {
  return currentStepIndexComputed.value >= 3;
});

// Get step description (placeholder for now)
const getStepDescription = (stepId) => {
  const descriptions = {
    welcome: 'Welcome to Tunicious! Let\'s get you set up.',
    spotify: 'Connect your Spotify account to enable playlist management and music playback.',
    lastfm: 'Connect your Last.fm account to enable track loving functionality.',
    create_source: 'Create your source playlist where new albums will be added.',
    add_album: 'Add your first album to the source playlist.',
    create_transient: 'Create a transient playlist for evaluating albums.',
    process_album_source: 'Move an album from source to transient playlist.',
    listen_heart: 'Listen to the album and love tracks you enjoy.',
    process_album_transient: 'Make a decision: keep exploring or stop here.',
    create_more_playlists: 'Complete your pipeline setup with sink and additional playlists.'
  };
  return descriptions[stepId] || 'Complete this step to continue.';
};

// Go to previous step
const goToPreviousStep = () => {
  if (!canGoBack.value) return;
  
  const prevIndex = currentStepIndexComputed.value - 1;
  const prevStep = steps[prevIndex];
  
  router.push({
    path: '/onboarding',
    query: { step: prevStep.id }
  });
  
  updateCurrentStep(prevStep.id);
};

// Handle next button
const handleNext = async () => {
  if (isLastStep.value) {
    // Complete onboarding
    await completeOnboarding();
    router.push('/');
  } else {
    // Go to next step
    const nextIndex = currentStepIndexComputed.value + 1;
    const nextStep = steps[nextIndex];
    
    // Mark current step as completed
    await completeStep(currentStep.value);
    
    // Navigate to next step
    router.push({
      path: '/onboarding',
      query: { step: nextStep.id }
    });
    
    await updateCurrentStep(nextStep.id);
  }
};

// Handle skip
const handleSkip = async () => {
  if (confirm('Are you sure you want to skip onboarding? You can complete it later from your account settings.')) {
    await skipOnboarding();
    router.push('/');
  }
};

// Sync URL with onboarding state on mount
onMounted(async () => {
  await loadOnboardingState();
  
  // If URL doesn't have step param, update it
  if (!route.query.step) {
    router.replace({
      path: '/onboarding',
      query: { step: onboardingCurrentStep.value || 'welcome' }
    });
  }
});

// Watch for URL changes and update onboarding state
watch(() => route.query.step, async (newStep) => {
  if (newStep && newStep !== onboardingCurrentStep.value) {
    await updateCurrentStep(newStep);
  }
});
</script>

<style lang="scss" scoped>
.onboarding-view {
  @apply min-h-screen bg-white;
}

.loading-container,
.error-container {
  @apply flex items-center justify-center min-h-screen p-6;
}

.onboarding-container {
  @apply max-w-4xl mx-auto;
}

.onboarding-content {
  @apply p-6;
}

.step-description-section {
  @apply mb-6;
}

.step-description {
  @apply text-lg text-gray-700;
}

.step-body {
  @apply mt-6;
}

.step-placeholder {
  @apply p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 text-center;
}

.onboarding-actions {
  @apply flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50 gap-4;
  
  .skip-button {
    @apply ml-auto;
  }
}

@media (max-width: 640px) {
  .onboarding-actions {
    @apply flex-col;
    
    button {
      @apply w-full;
    }
  }
}
</style>

