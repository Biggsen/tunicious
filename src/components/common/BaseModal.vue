<template>
  <div
    v-if="visible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click.self="handleBackdropClick"
  >
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
      <h3 v-if="title" class="text-lg font-semibold mb-4">{{ title }}</h3>
      
      <div class="mb-4">
        <slot />
      </div>

      <div class="flex gap-3">
        <slot name="actions">
          <BaseButton
            v-if="showCancel"
            @click="handleCancel"
            customClass="bg-gray-500 hover:bg-gray-600"
          >
            {{ cancelText }}
          </BaseButton>
          <BaseButton
            v-if="showConfirm"
            @click="handleConfirm"
            :variant="confirmVariant"
          >
            {{ confirmText }}
          </BaseButton>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import BaseButton from './BaseButton.vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: null
  },
  showCancel: {
    type: Boolean,
    default: false
  },
  showConfirm: {
    type: Boolean,
    default: false
  },
  cancelText: {
    type: String,
    default: 'Cancel'
  },
  confirmText: {
    type: String,
    default: 'OK'
  },
  confirmVariant: {
    type: String,
    default: 'default'
  },
  closeOnBackdrop: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['cancel', 'confirm', 'close']);

const handleBackdropClick = () => {
  if (props.closeOnBackdrop) {
    emit('close');
  }
};

const handleCancel = () => {
  emit('cancel');
};

const handleConfirm = () => {
  emit('confirm');
};
</script>
