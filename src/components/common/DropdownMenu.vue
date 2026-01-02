<template>
  <div class="relative" ref="dropdownRef">
    <IconButton
      @click="toggle"
      variant="secondary"
      :custom-class="buttonClass"
      :aria-label="ariaLabel"
      :aria-expanded="isOpen"
    >
      <EllipsisVerticalIcon class="h-5 w-5" />
    </IconButton>
    
    <Transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 mt-2 w-56 rounded-lg shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50"
        role="menu"
        aria-orientation="vertical"
        @click.stop
      >
        <div class="py-1" role="none" @click="close">
          <slot />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline';
import IconButton from './IconButton.vue';

const props = defineProps({
  buttonClass: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: 'Menu'
  }
});

const isOpen = ref(false);
const dropdownRef = ref(null);

const toggle = (event) => {
  event.stopPropagation();
  isOpen.value = !isOpen.value;
};

const close = () => {
  isOpen.value = false;
};

const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    close();
  }
};

const handleEscape = (event) => {
  if (event.key === 'Escape') {
    close();
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleEscape);
});

defineExpose({
  close
});
</script>

