<template>
  <div class="choose-setup-method-step">
    <div class="setup-intro">
      <h3 class="setup-heading">Choose Your Setup Method</h3>
      <p class="setup-description">
        You can either generate all playlists at once or learn step-by-step
      </p>
    </div>

    <div class="setup-options">
      <!-- Quick Start Option -->
      <div 
        class="setup-option"
        :class="{ 'selected': selectedMethod === 'quick_start', 'disabled': generating }"
        @click="selectMethod('quick_start')"
      >
        <div class="option-header">
          <div class="option-icon">⚡</div>
          <h4 class="option-title">Quick Start</h4>
        </div>
        <p class="option-description">
          Generate all 20 playlists for both New and Known artist pipelines at once.
        </p>
        <p class="option-note">
          This will create complete pipelines and complete your onboarding immediately.
        </p>
      </div>

      <!-- Step-by-Step Option -->
      <div 
        class="setup-option"
        :class="{ 'selected': selectedMethod === 'step_by_step', 'disabled': true }"
      >
        <div class="option-header">
          <div class="option-icon">📚</div>
          <h4 class="option-title">Step-by-Step</h4>
          <span class="text-xs text-gray-500 ml-2">(Coming Soon)</span>
        </div>
        <p class="option-description">
          Learn each step of the pipeline system as you create playlists.
        </p>
        <p class="option-note">
          Recommended if you want to understand how Tunicious works.
        </p>
      </div>
    </div>

    <!-- Quick Start Generation UI -->
    <div v-if="selectedMethod === 'quick_start' && !generating && !generationComplete" class="quick-start-confirm">
      <div class="confirm-message">
        <p>This will create 20 playlists for both New and Known artist pipelines.</p>
      </div>
      <BaseButton
        @click="handleQuickStart"
        variant="primary"
        :disabled="checkingExisting"
      >
        {{ checkingExisting ? 'Checking...' : 'Generate Playlists' }}
      </BaseButton>
    </div>

    <!-- Generation Progress -->
    <div v-if="generating" class="generation-progress">
      <div class="progress-header">
        <div class="spinner"></div>
        <h4>Generating Playlists...</h4>
      </div>
      <div class="progress-info">
        <p>Creating playlist {{ currentPlaylist }}/20...</p>
        <p class="current-playlist-name">{{ currentPlaylistName }}</p>
      </div>
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          :style="{ width: `${(currentPlaylist / 20) * 100}%` }"
        ></div>
      </div>
    </div>

    <!-- Success State -->
    <div v-if="generationComplete" class="generation-success">
      <div class="success-icon">✅</div>
      <h4>Your Pipelines Are Ready!</h4>
      <p>All 20 playlists have been created successfully.</p>
      <div class="success-details">
        <p>✓ New Artists Pipeline (10 playlists)</p>
        <p>✓ Known Artists Pipeline (10 playlists)</p>
      </div>
      <BaseButton
        @click="handleContinue"
        variant="primary"
        class="continue-button"
      >
        Continue
      </BaseButton>
    </div>

    <!-- Error State -->
    <div v-if="generationError" class="generation-error">
      <div class="error-icon">❌</div>
      <h4>Generation Failed</h4>
      <p class="error-message">{{ generationError }}</p>
      <div class="error-actions">
        <BaseButton
          @click="handleQuickStart"
          variant="primary"
          class="retry-button"
        >
          Try Again
        </BaseButton>
        <BaseButton
          @click="selectMethod('step_by_step')"
          variant="secondary"
          class="switch-button"
        >
          Switch to Step-by-Step
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useCurrentUser } from 'vuefire';
import { useOnboarding } from '@composables/useOnboarding';
import { generateCompletePipelines, hasExistingPlaylists } from '@composables/usePipelineGeneration';
import { useRouter } from 'vue-router';
import BaseButton from '@components/common/BaseButton.vue';

const user = useCurrentUser();
const router = useRouter();
const { completeStep, completeOnboarding } = useOnboarding();

const selectedMethod = ref(null);
const generating = ref(false);
const generationComplete = ref(false);
const generationError = ref(null);
const checkingExisting = ref(false);
const currentPlaylist = ref(0);
const currentPlaylistName = ref('');

const emit = defineEmits(['method-selected']);

const selectMethod = async (method) => {
  if (generating.value) return;
  selectedMethod.value = method;
  generationError.value = null;
  emit('method-selected', method);
  
  // If step-by-step is selected, save the selection
  if (method === 'step_by_step') {
    try {
      await completeStep('choose_setup_method', {
        setupMethod: 'step_by_step'
      });
    } catch (error) {
      console.error('Error saving step-by-step selection:', error);
    }
  }
};

// Expose selectedMethod so parent can check if step-by-step is selected
defineExpose({
  selectedMethod,
  canProceed: computed(() => selectedMethod.value === 'step_by_step' && !generating.value)
});

const handleQuickStart = async () => {
  if (!user.value) {
    generationError.value = 'You must be logged in to generate playlists';
    return;
  }

  // Check for existing playlists first
  checkingExisting.value = true;
  try {
    const hasPlaylists = await hasExistingPlaylists(user.value.uid);
    if (hasPlaylists) {
      generationError.value = 'You already have playlists. Onboarding should be skipped.';
      checkingExisting.value = false;
      // Redirect to home after a moment
      setTimeout(() => {
        router.push('/');
      }, 2000);
      return;
    }
  } catch (error) {
    generationError.value = `Error checking for existing playlists: ${error.message}`;
    checkingExisting.value = false;
    return;
  }
  checkingExisting.value = false;

  // Start generation
  generating.value = true;
  generationError.value = null;
  currentPlaylist.value = 0;

  try {
    // Update progress as we create playlists
    // Note: The actual progress tracking would need to be added to generateCompletePipelines
    // For now, we'll show a simple progress indicator
    
    const playlists = await generateCompletePipelines(user.value.uid);
    
    // Mark onboarding as complete
    await completeStep('choose_setup_method', {
      setupMethod: 'quick_start',
      quickStartPlaylists: playlists.map(p => ({
        spotifyId: p.spotifyId,
        name: p.name,
        group: p.group,
        role: p.role
      }))
    });

    // Mark all playlist creation steps as completed
    const stepsToComplete = [
      'create_source',
      'create_transient',
      'create_more_playlists'
    ];
    
    for (const stepId of stepsToComplete) {
      await completeStep(stepId, {});
    }

    // Complete onboarding
    await completeOnboarding();
    
    generationComplete.value = true;
    generating.value = false;

    // Don't auto-redirect - let user click Continue button
  } catch (error) {
    console.error('Error generating playlists:', error);
    generationError.value = error.message || 'Failed to generate playlists. Please try again.';
    generating.value = false;
  }
};

const handleContinue = () => {
  router.push('/playlists');
};

</script>

<style scoped>
.choose-setup-method-step {
  max-width: 800px;
  margin: 0 auto;
}

.setup-intro {
  text-align: center;
  margin-bottom: 2rem;
}

.setup-heading {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: var(--delft-blue, #23395B);
}

.setup-description {
  color: #666;
  font-size: 1rem;
}

.setup-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.setup-option {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
}

.setup-option:hover:not(.disabled) {
  border-color: var(--mint, #59C9A5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.setup-option.selected {
  border-color: var(--mint, #59C9A5);
  background: #f0fdf4;
}

.setup-option.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.option-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.option-icon {
  font-size: 2rem;
}

.option-title {
  font-size: 1.25rem;
  font-weight: bold;
  margin: 0;
  color: var(--delft-blue, #23395B);
}

.option-description {
  color: #666;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.option-note {
  font-size: 0.875rem;
  color: #999;
  font-style: italic;
}

.quick-start-confirm {
  text-align: center;
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 8px;
  margin-top: 1rem;
}

.confirm-message {
  margin-bottom: 1rem;
}

.generation-progress {
  text-align: center;
  padding: 2rem;
  background: #f9fafb;
  border-radius: 8px;
  margin-top: 1rem;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e0e0e0;
  border-top-color: var(--mint, #59C9A5);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-info {
  margin-bottom: 1rem;
}

.current-playlist-name {
  font-weight: bold;
  color: var(--delft-blue, #23395B);
  margin-top: 0.5rem;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--mint, #59C9A5);
  transition: width 0.3s ease;
}

.generation-success {
  text-align: center;
  padding: 2rem;
  background: #f0fdf4;
  border: 2px solid var(--mint, #59C9A5);
  border-radius: 8px;
  margin-top: 1rem;
}

.success-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.success-details {
  margin-top: 1rem;
  text-align: center;
  display: block;
  margin-bottom: 1rem;
}

.continue-button {
  margin-top: 1.5rem;
}

.generation-error {
  text-align: center;
  padding: 2rem;
  background: #fef2f2;
  border: 2px solid #ef4444;
  border-radius: 8px;
  margin-top: 1rem;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.error-message {
  color: #dc2626;
  margin: 1rem 0;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

@media (max-width: 768px) {
  .setup-options {
    grid-template-columns: 1fr;
  }
  
  .error-actions {
    flex-direction: column;
  }
}
</style>

