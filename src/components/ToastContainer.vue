<template>
  <Teleport to="body">
    <div
      v-if="toasts.length > 0"
      class="fixed top-[72px] left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pt-2 pointer-events-none"
    >
      <TransitionGroup name="toast" tag="div" class="flex flex-col items-center gap-2">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[
            'pointer-events-auto rounded-lg p-3 flex items-center justify-between gap-3 font-chivo text-sm',
            toastClasses[toast.type]
          ]"
        >
          <div class="flex items-center gap-2">
            <component
              :is="iconComponents[toast.type]"
              :class="['w-5 h-5 flex-shrink-0', iconClasses[toast.type]]"
            />
            <span class="font-medium text-sm leading-none pt-[2px] pr-[6px]">
              <template v-if="typeof toast.message === 'string'">{{ toast.message }}</template>
              <template v-else>
                <template v-for="(part, index) in toast.message.parts" :key="index">
                  <strong v-if="part.bold">{{ part.text }}</strong>
                  <span v-else>{{ part.text }}</span>
                </template>
              </template>
            </span>
          </div>
          <button
            v-if="toast.duration === 0"
            @click="removeToast(toast.id)"
            class="flex-shrink-0 hover:opacity-70 transition-opacity"
            aria-label="Dismiss"
          >
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { useToast } from '@/composables/useToast';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline';

const { toasts, removeToast } = useToast();

const toastClasses = computed(() => ({
  success: 'bg-mindero text-delft-blue',
  error: 'bg-mindero text-delft-blue',
  warning: 'bg-mindero text-delft-blue',
  info: 'bg-mindero text-delft-blue'
}));

const iconClasses = computed(() => ({
  success: 'text-delft-blue',
  error: 'text-delft-blue',
  warning: 'text-delft-blue',
  info: 'text-delft-blue'
}));

const iconComponents = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon
};
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>

