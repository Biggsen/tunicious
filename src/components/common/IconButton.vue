<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center rounded-lg transition-colors duration-200 font-medium min-h-[2.5rem] w-[2.5rem]',
      variantPadding,
      'focus:outline-none focus:ring-2 focus:ring-white',
      variantClasses,
      'disabled:opacity-50 disabled:cursor-not-allowed',
      customClass
    ]"
    v-bind="$attrs"
    @click="$emit('click', $event)"
  >
    <span 
      v-if="loading" 
      :class="[
        'animate-spin h-5 w-5 border-2 border-t-transparent rounded-full',
        spinnerColor
      ]"
    ></span>
    <slot v-else />
  </button>
</template>

<script setup>
import { computed } from 'vue';

defineOptions({
  inheritAttrs: false
});

const props = defineProps({
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  customClass: { type: String, default: '' },
  variant: { type: String, default: 'default' }
});

defineEmits(['click']);

const variantPadding = computed(() => {
  // Tertiary variant has border-2, so reduce padding to maintain same height
  if (props.variant === 'tertiary') {
    return 'p-[6px]';
  }
  return 'p-2';
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-delft-blue text-mindero hover:bg-raspberry';
    case 'secondary':
      return 'bg-mint text-delft-blue hover:bg-delft-blue hover:text-white focus:bg-mint focus:text-delft-blue';
    case 'tertiary':
      return 'bg-white text-delft-blue border-2 border-delft-blue hover:bg-mint hover:text-delft-blue focus:bg-white focus:text-delft-blue';
    case 'default':
    default:
      return 'bg-blue-500 text-white hover:bg-blue-600';
  }
});

const spinnerColor = computed(() => {
  if (props.variant === 'secondary' || props.variant === 'tertiary') {
    return 'border-delft-blue';
  }
  return 'border-white';
});
</script>
