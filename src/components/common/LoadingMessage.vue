<template>
  <div class="flex flex-col items-center justify-center py-6 text-center">
    <span class="animate-spin h-8 w-8 mb-2 border-4 border-mint border-t-transparent rounded-full"></span>
    <div class="text-on-page font-semibold">
      <slot>{{ message }}</slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  message: { type: String, default: 'Loading...' }
});
</script> 