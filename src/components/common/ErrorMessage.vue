<template>
  <div v-if="message || $slots.default" class="p-4 bg-red-50 text-red-700 rounded-md text-center font-bold">
    <slot>{{ message }}</slot>
  </div>
</template>

<script setup>
defineProps({
  message: { type: String, default: '' }
});
</script> 