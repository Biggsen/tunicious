<template>
  <div :class="cardClasses">
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  variant: {
    type: String,
    default: 'white',
    validator: (value) => ['white', 'celadon', 'mint'].includes(value)
  }
});

const cardClasses = computed(() => {
  const baseClasses = 'border-2 border-delft-blue rounded-xl p-6 text-on-card';
  
  switch (props.variant) {
    case 'celadon':
      return `bg-celadon dark:bg-card ${baseClasses}`;
    case 'mint':
      return `bg-mint ${baseClasses}`;
    case 'white':
    default:
      return `bg-card ${baseClasses}`;
  }
});
</script>

