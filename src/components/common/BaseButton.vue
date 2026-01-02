<template>
  <button
    :type="type"
    :disabled="disabled || loading"
      :class="[
      'inline-flex items-center justify-center gap-2 rounded-lg transition-colors duration-200 font-medium min-h-[2.5rem]',
      hideTextOnMobile ? '' : 'px-4 min-w-[100px]',
      variantPadding,
      mobileWidth,
      variantClasses,
      'disabled:opacity-50 disabled:cursor-not-allowed',
      customClass
    ]"
    @click="$emit('click', $event)"
  >
    <span 
      v-if="loading" 
      :class="[
        'animate-spin mr-2 h-5 w-5 border-2 border-t-transparent rounded-full',
        spinnerColor
      ]"
    ></span>
    <slot name="icon-left"></slot>
    <span :class="hideTextOnMobile ? 'hidden md:inline' : ''">
      <slot />
    </span>
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
  variant: { type: String, default: 'default' },
  hideTextOnMobile: { type: Boolean, default: false }
});

defineEmits(['click']);

const variantPadding = computed(() => {
  // When hiding text on mobile, use square padding on mobile, normal padding on desktop
  if (props.hideTextOnMobile) {
    if (props.variant === 'tertiary') {
      return 'p-[6px] md:px-4 md:py-[6px]';
    }
    return 'p-2 md:px-4 md:py-2';
  }
  // Tertiary variant has border-2, so reduce padding to maintain same height
  if (props.variant === 'tertiary') {
    return 'py-[6px]';
  }
  return 'py-2';
});

const mobileWidth = computed(() => {
  if (props.hideTextOnMobile) {
    return 'w-[2.5rem] md:w-auto';
  }
  return '';
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-delft-blue text-mindero hover:bg-raspberry';
    case 'secondary':
      return 'bg-mint text-delft-blue hover:bg-delft-blue hover:text-white';
    case 'tertiary':
      return 'bg-white text-delft-blue border-2 border-delft-blue hover:bg-mint hover:text-delft-blue';
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