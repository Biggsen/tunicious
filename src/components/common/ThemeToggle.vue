<template>
  <button
    type="button"
    role="switch"
    class="inline-flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-mindero focus-visible:ring-offset-2 rounded-full"
    :aria-checked="isDark"
    aria-label="Dark mode"
    @click="toggleTheme"
  >
    <span class="relative inline-flex h-8 w-16 shrink-0 items-center rounded-full bg-[#23395b] dark:bg-[#3f5b87] transition-colors duration-300">
      <span class="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-1/2 items-center justify-center">
        <SunIcon class="h-4 w-4" :class="isDark ? 'text-[#FFFD98]' : 'text-[#23395b]'" />
      </span>
      <span class="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-1/2 items-center justify-center">
        <MoonIcon class="h-4 w-4" :class="isDark ? 'text-[#23395b]' : 'text-[#FFFD98]'" />
      </span>
      <span
        class="pointer-events-none absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300"
        :class="isDark ? 'translate-x-8' : 'translate-x-0'"
      ></span>
    </span>
    <slot />
  </button>
</template>

<script setup>
import { SunIcon, MoonIcon } from '@heroicons/vue/24/outline';
import { useTheme } from '@composables/useTheme';

const { isDark, toggleTheme } = useTheme();
</script>
