import { ref } from 'vue';

const visible = ref(false);
const message = ref('');

export function isSpotifyReconnectError(message) {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('reconnect') ||
    lower.includes('access denied') ||
    lower.includes('authentication failed') ||
    lower.includes('authentication expired') ||
    lower.includes('connection lost') ||
    lower.includes('token expired') ||
    lower.includes('refresh token expired')
  );
}

export function useSpotifySessionModal() {
  const showModal = (errorMessage) => {
    message.value = errorMessage || 'Spotify access denied. Please reconnect your account.';
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
