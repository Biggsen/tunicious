<script setup>
import { TruckIcon, StarIcon } from '@heroicons/vue/24/solid';
import { computed } from 'vue';

defineProps({
  rating: {
    type: Number,
    required: true,
    validator: (val) => val >= 1 && val <= 5
  },
  category: {
    type: String,
    required: true
  }
});

const barWidths = ["20%", "40%", "60%", "80%", "100%"];
</script>

<template>
  <div
    class="h-8 bg-mint flex items-center justify-end pr-2"
    :style="{ width: barWidths[rating - 1] }"
  >
    <div class="flex justify-end gap-1">
      <StarIcon
        v-for="n in rating"
        :key="n"
        class="w-6 h-6 text-delft-blue"
      />
    </div>
  </div>
</template>
