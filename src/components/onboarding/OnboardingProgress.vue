<template>
  <div class="onboarding-progress">
    <div class="progress-header">
      <h2 class="step-title-text">{{ currentStepTitle }}</h2>
      <span class="progress-text">
        Step {{ currentStepIndex + 1 }} of {{ totalSteps }}
      </span>
    </div>
    
    <div class="progress-bar-container">
      <div class="progress-bar">
        <div 
          class="progress-bar-fill"
          :style="{ width: `${progressPercentage}%` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  currentStepId: {
    type: String,
    required: true
  },
  completedSteps: {
    type: Array,
    default: () => []
  },
  steps: {
    type: Array,
    required: true
  }
});

const currentStepIndex = computed(() => {
  const index = props.steps.findIndex(step => step.id === props.currentStepId);
  return index >= 0 ? index : 0;
});

const totalSteps = computed(() => props.steps.length);

const currentStepTitle = computed(() => {
  const step = props.steps.find(step => step.id === props.currentStepId);
  return step ? step.title : '';
});

const progressPercentage = computed(() => {
  // Calculate progress based on current step (0-indexed)
  // Add 1 to include the current step in progress
  return ((currentStepIndex.value + 1) / totalSteps.value) * 100;
});
</script>

<style lang="scss" scoped>
.onboarding-progress {
  @apply bg-white border-b border-gray-200 py-6 px-6;
}

.progress-header {
  @apply mb-4 text-center;
}

.step-title-text {
  @apply text-2xl font-semibold text-delft-blue mb-2;
}

.progress-text {
  @apply text-base text-gray-600;
}

.progress-bar-container {
  @apply w-full;
}

.progress-bar {
  @apply w-full h-3 bg-gray-200 rounded-full overflow-hidden;
}

.progress-bar-fill {
  @apply h-full bg-delft-blue transition-all duration-300 ease-out;
  background: linear-gradient(90deg, #23395B 0%, #59C9A5 100%);
}

@media (max-width: 640px) {
  .onboarding-progress {
    @apply py-4 px-4;
  }
  
  .step-title-text {
    @apply text-xl;
  }
  
  .progress-text {
    @apply text-sm;
  }
}
</style>

