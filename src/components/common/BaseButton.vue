<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center gap-2 px-4 rounded-lg transition-colors duration-200 font-medium min-h-[2.5rem]',
      variantPadding,
      variantClasses,
      'disabled:opacity-50 disabled:cursor-not-allowed',
      customClass
    ]"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
    <slot name="icon-left"></slot>
    <slot />
    <slot name="icon-right"></slot>
  </button>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  customClass: { type: String, default: '' },
  variant: { type: String, default: 'default' }
});

defineEmits(['click']);

const variantPadding = computed(() => {
  // No longer need special padding since border is removed
  return 'py-2';
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-delft-blue text-mindero hover:bg-raspberry';
    case 'secondary':
      return 'bg-mint text-delft-blue hover:bg-delft-blue hover:text-white';
    case 'default':
    default:
      return 'bg-blue-500 text-white hover:bg-blue-600';
  }
});
</script> 