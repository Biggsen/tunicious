<template>
  <div
    v-if="visible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click.self="handleCancel"
  >
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-semibold mb-4">{{ title }}</h3>
      
      <!-- Progress Bar -->
      <div class="mb-4">
        <div class="w-full bg-gray-200 rounded-full h-4 mb-2">
          <div
            class="bg-mint h-4 rounded-full transition-all duration-300 ease-out"
            :style="{ width: `${percentage}%` }"
          ></div>
        </div>
        <div class="flex justify-between text-sm text-gray-600">
          <span>{{ current }} of {{ total }}</span>
          <span class="font-semibold text-delft-blue">{{ percentage }}%</span>
        </div>
      </div>

      <!-- Current Item -->
      <div v-if="currentItem" class="mb-4">
        <p class="text-sm text-gray-500 mb-1">Processing:</p>
        <p class="text-sm font-medium text-delft-blue truncate">{{ currentItem }}</p>
      </div>

      <!-- Time Information -->
      <div class="flex justify-between text-xs text-gray-500 mb-4">
        <span v-if="elapsedTime > 0">
          Elapsed: {{ formatTime(elapsedTime) }}
        </span>
        <span v-if="estimatedTimeRemaining > 0">
          Remaining: ~{{ formatTime(estimatedTimeRemaining) }}
        </span>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <BaseButton
          v-if="allowCancel"
          @click="handleCancel"
          :disabled="!allowCancel"
          customClass="flex-1 bg-gray-500 hover:bg-gray-600"
        >
          Cancel
        </BaseButton>
        <BaseButton
          v-else
          @click="handleDismiss"
          customClass="flex-1"
        >
          OK
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import BaseButton from './BaseButton.vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Processing...'
  },
  current: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  currentItem: {
    type: String,
    default: null
  },
  allowCancel: {
    type: Boolean,
    default: true
  },
  startTime: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(['cancel', 'dismiss']);

const percentage = computed(() => {
  if (props.total === 0) return 0;
  return Math.round((props.current / props.total) * 100);
});

const elapsedTime = computed(() => {
  if (!props.startTime || props.startTime === 0) return 0;
  return Math.floor((Date.now() - props.startTime) / 1000);
});

const estimatedTimeRemaining = computed(() => {
  if (props.current === 0 || props.total === 0 || elapsedTime.value === 0) return 0;
  const avgTimePerItem = elapsedTime.value / props.current;
  const remainingItems = props.total - props.current;
  return Math.floor(avgTimePerItem * remainingItems);
});

const formatTime = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

const handleCancel = () => {
  emit('cancel');
};

const handleDismiss = () => {
  emit('dismiss');
};
</script>

