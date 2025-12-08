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
          <!-- Welcome Step -->
          <OnboardingWelcomeStep
            v-if="currentStep === 'welcome'"
            :display-name="welcomeDisplayName"
            @update:display-name="welcomeDisplayName = $event"
          />
          
          <!-- Other steps will be added here -->
          <div v-else class="step-placeholder">
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
          @click="() => { console.log('[Onboarding] Get Started/Next button clicked'); handleNext(); }"
          :disabled="!canProceed || savingDisplayName"
          variant="primary"
        >
          {{ savingDisplayName ? 'Saving...' : (isLastStep ? 'Complete' : (currentStep === 'welcome' ? 'Get Started' : 'Next')) }}
        </BaseButton>
        
        <!-- Debug info (remove in production) -->
        <div v-if="currentStep === 'welcome'" class="text-xs text-gray-500 mt-2">
          Debug: canProceed={{ canProceed }}, saving={{ savingDisplayName }}, 
          welcomeDisplayName="{{ welcomeDisplayName }}", 
          userDisplayName="{{ userData?.displayName }}"
        </div>
        
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
import { computed, onMounted, watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useOnboarding, ONBOARDING_STEPS } from '@composables/useOnboarding';
import { useUserData } from '@composables/useUserData';
import OnboardingProgress from '@components/onboarding/OnboardingProgress.vue';
import OnboardingWelcomeStep from '@components/onboarding/OnboardingWelcomeStep.vue';
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

const user = useCurrentUser();
const { userData, fetchUserData } = useUserData();
const welcomeDisplayName = ref('');
const savingDisplayName = ref(false);

// Removed per-keystroke logging - only log important actions

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

// Check if we can proceed (step-specific validation)
const canProceed = computed(() => {
  // For welcome step, require displayName
  if (currentStep.value === 'welcome') {
    return !!userData.value?.displayName || !!welcomeDisplayName.value.trim();
  }
  // For other steps, default to true (will be step-specific later)
  return true;
});

// Removed canProceed logging - only log important actions

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

// Save display name for welcome step
const saveDisplayName = async (displayName) => {
  console.log('[Onboarding] saveDisplayName called:', { displayName, userId: user.value?.uid });
  
  if (!user.value || !displayName || !displayName.trim()) {
    console.error('[Onboarding] saveDisplayName validation failed:', { 
      hasUser: !!user.value, 
      displayName,
      trimmed: displayName?.trim() 
    });
    throw new Error('Display name is required');
  }

  savingDisplayName.value = true;
  try {
    console.log('[Onboarding] Saving displayName to Firestore...');
    await setDoc(doc(db, 'users', user.value.uid), {
      displayName: displayName.trim(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    console.log('[Onboarding] displayName saved successfully');

    // Refresh user data
    console.log('[Onboarding] Refreshing user data...');
    await fetchUserData(user.value.uid);
    console.log('[Onboarding] User data refreshed');
  } catch (error) {
    console.error('[Onboarding] Error saving displayName:', error);
    throw error;
  } finally {
    savingDisplayName.value = false;
  }
};

// Handle next button
const handleNext = async () => {
  console.log('[Onboarding] handleNext called:', {
    currentStep: currentStep.value,
    welcomeDisplayName: welcomeDisplayName.value,
    userDisplayName: userData.value?.displayName,
    canProceed: canProceed.value,
    savingDisplayName: savingDisplayName.value
  });
  
  // For welcome step, save displayName first if needed
  if (currentStep.value === 'welcome') {
    const displayNameToSave = welcomeDisplayName.value.trim();
    console.log('[Onboarding] Welcome step - checking if displayName needs saving:', {
      displayNameToSave,
      hasUserDisplayName: !!userData.value?.displayName
    });
    
    if (displayNameToSave && !userData.value?.displayName) {
      console.log('[Onboarding] Saving displayName before proceeding...');
      await saveDisplayName(displayNameToSave);
    } else {
      console.log('[Onboarding] DisplayName already exists or empty, skipping save');
    }
  }

  await proceedToNextStep();
};

// Proceed to next step
const proceedToNextStep = async () => {
  console.log('[Onboarding] proceedToNextStep called:', {
    isLastStep: isLastStep.value,
    currentStepIndex: currentStepIndexComputed.value,
    currentStep: currentStep.value
  });
  
  if (isLastStep.value) {
    // Complete onboarding
    console.log('[Onboarding] Last step - completing onboarding');
    await completeOnboarding();
    router.push('/');
  } else {
    // Go to next step
    const nextIndex = currentStepIndexComputed.value + 1;
    const nextStep = steps[nextIndex];
    console.log('[Onboarding] Moving to next step:', { nextIndex, nextStep: nextStep.id });
    
    // Mark current step as completed
    console.log('[Onboarding] Marking current step as completed:', currentStep.value);
    await completeStep(currentStep.value);
    
    // Navigate to next step
    console.log('[Onboarding] Navigating to next step');
    router.push({
      path: '/onboarding',
      query: { step: nextStep.id }
    });
    
    await updateCurrentStep(nextStep.id);
    console.log('[Onboarding] Step updated successfully');
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

