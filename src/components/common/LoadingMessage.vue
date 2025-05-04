<template>
  <div class="flex flex-col items-center justify-center py-6 text-center">
    <span class="animate-spin h-8 w-8 mb-2 border-4 border-blue-500 border-t-transparent rounded-full"></span>
    <div class="text-blue-700 font-semibold">
      <slot>{{ message }}</slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  message: { type: String, default: 'Loading...' }
});
</script> 