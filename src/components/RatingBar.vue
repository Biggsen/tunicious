<script setup>
import { MusicalNoteIcon, StarIcon, ClockIcon } from '@heroicons/vue/24/solid';
import { computed } from 'vue';

const props = defineProps({
  pipelinePosition: {
    type: Number,
    required: true
  },
  pipelineRole: {
    type: String,
    required: true
  },
  totalPositions: {
    type: Number,
    default: 1
  }
});

const bgClass = computed(() => (props.pipelineRole === 'sink' || props.pipelineRole === 'terminal') ? 'bg-raspberry' : 'bg-mint');

// Calculate width based on position and total positions
const width = computed(() => {
  if (props.pipelineRole === 'source') {
    return '100%';
  }
  if (props.pipelineRole === 'terminal') {
    return '100%';
  }
  // For sink and transient: use 1-based position for width calculation
  // Transients share the same position as their sink
  if ((props.pipelineRole === 'sink' || props.pipelineRole === 'transient') && props.totalPositions > 0) {
    // pipelinePosition is 0-based (0, 1, 2, 3), convert to 1-based (1, 2, 3, 4) for calculation
    const oneBasedPosition = props.pipelinePosition + 1;
    return `${(oneBasedPosition / props.totalPositions) * 100}%`;
  }
  return '100%';
});

// Calculate rating (stars) for sink and terminal
const rating = computed(() => {
  if (props.pipelineRole === 'sink') {
    // Sink rating = position (1-based for display, but position is 0-based)
    // So we add 1 to make it 1-based for star display
    return Math.max(1, props.pipelinePosition + 1);
  }
  if (props.pipelineRole === 'terminal') {
    // Terminal always gets max rating (5 stars)
    return 5;
  }
  return 0;
});
</script>

<template>
  <div
    :class="['h-6', 'py-1', bgClass, 'flex items-center justify-end pr-2']"
    :style="{ width: width }"
  >
    <div class="flex justify-end gap-1">
      <template v-if="props.pipelineRole === 'source'">
        <ClockIcon class="w-5 h-5 text-delft-blue" />
      </template>
      <template v-else-if="props.pipelineRole === 'transient'">
        <MusicalNoteIcon class="w-5 h-5 text-delft-blue" />
      </template>
      <template v-else-if="props.pipelineRole === 'sink' || props.pipelineRole === 'terminal'">
        <StarIcon
          v-for="n in rating"
          :key="n"
          class="w-5 h-5 text-mindero"
        />
      </template>
    </div>
  </div>
</template>
