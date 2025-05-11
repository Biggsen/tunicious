<script setup>
import { TruckIcon, StarIcon } from '@heroicons/vue/24/solid';
import { computed } from 'vue';

const props = defineProps({
  priority: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true
  }
});

const computeRatingFromPriority = (pri) => {
  if (pri === 5) return 0;
  if (pri === 10 || pri === 15) return 1;
  if (pri === 20 || pri === 25) return 2;
  if (pri === 30 || pri === 35) return 3;
  if (pri === 40 || pri === 45) return 4;
  if (pri === 50) return 5;
  return 0;
};

const rating = computed(() => computeRatingFromPriority(props.priority));
const barWidths = ["20%", "40%", "60%", "80%", "100%"];
const bgClass = computed(() => (props.category === 'end' || props.category === 'wonderful') ? 'bg-raspberry' : 'bg-mint');
</script>

<template>
  <div
    :class="['h-8', bgClass, 'flex items-center justify-end pr-2']"
    :style="{ width: barWidths[Math.max(0, rating - 1)] }"
  >
    <div class="flex justify-end gap-1">
      <template v-if="props.category === 'end' || props.category === 'wonderful'">
        <StarIcon
          v-for="n in rating"
          :key="n"
          class="w-6 h-6 text-mindero"
        />
      </template>
      <template v-else>
        <TruckIcon class="w-6 h-6 text-delft-blue" />
      </template>
    </div>
  </div>
</template>
