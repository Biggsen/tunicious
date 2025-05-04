<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center gap-2 px-4 py-2 rounded transition-colors duration-200 font-semibold',
      'bg-blue-500 text-white hover:bg-blue-600',
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
defineProps({
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  customClass: { type: String, default: '' }
});

defineEmits(['click']);
</script> 