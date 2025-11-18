<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'relative inline-flex items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      modelValue ? activeClasses : inactiveClasses,
      sizeClasses
    ]"
    @click="handleClick"
    :aria-pressed="modelValue"
    :aria-label="ariaLabel || label"
    role="switch"
  >
    <span
      :class="[
        'inline-block rounded-full transition-all duration-300 ease-in-out shadow-sm',
        thumbColorClasses,
        thumbSizeClasses,
        modelValue ? thumbActivePosition : thumbInactivePosition
      ]"
    ></span>
  </button>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'button'
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'celadon', 'raspberry', 'delft-blue', 'primary-on-celadon'].includes(value)
  },
  label: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'change']);

const sizeClasses = computed(() => 'w-12 h-6');
const thumbSizeClasses = computed(() => 'w-5 h-5');
const thumbInactivePosition = computed(() => 'translate-x-0.5');
const thumbActivePosition = computed(() => 'translate-x-[26px]');

const activeClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-mint';
    case 'celadon':
      return 'bg-celadon';
    case 'raspberry':
      return 'bg-raspberry';
    case 'delft-blue':
      return 'bg-delft-blue';
    case 'primary-on-celadon':
      return 'bg-delft-blue';
    default:
      return 'bg-mint';
  }
});

const inactiveClasses = computed(() => {
  if (props.variant === 'primary-on-celadon') {
    return 'bg-white';
  }
  return 'bg-gray-300';
});

const thumbColorClasses = computed(() => {
  if (props.variant === 'primary-on-celadon' && !props.modelValue) {
    return 'bg-gray-300';
  }
  return 'bg-white';
});

const handleClick = () => {
  if (!props.disabled) {
    const newValue = !props.modelValue;
    emit('update:modelValue', newValue);
    emit('change', newValue);
  }
};
</script>

