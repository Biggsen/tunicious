import { ref } from 'vue';

const visible = ref(false);
const message = ref('');

export function useLastFmSessionModal() {
  const showModal = (errorMessage) => {
    message.value = errorMessage || 'Last.fm session expired. Please reconnect your account.';
    visible.value = true;
  };

  const hideModal = () => {
    visible.value = false;
    message.value = '';
  };

  return {
    visible,
    message,
    showModal,
    hideModal
  };
}
