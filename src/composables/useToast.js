import { ref } from 'vue';

const toasts = ref([]);
let toastIdCounter = 0;

const removeToast = (id) => {
  const index = toasts.value.findIndex(t => t.id === id);
  if (index > -1) {
    toasts.value.splice(index, 1);
  }
};

export function useToast() {
  const showToast = (message, type = 'info', duration = 5000) => {
    const id = ++toastIdCounter;
    const toast = {
      id,
      message,
      type,
      duration
    };

    toasts.value.push(toast);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  };

  const clearAll = () => {
    toasts.value = [];
  };

  return {
    toasts,
    showToast,
    removeToast,
    clearAll
  };
}

