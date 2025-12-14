<template>
  <BaseModal
    :visible="visible"
    title="Last.fm Session Expired"
    :show-cancel="true"
    :show-confirm="true"
    cancel-text="Close"
    confirm-text="Reconnect"
    cancel-variant="tertiary"
    confirm-variant="primary"
    :close-on-backdrop="false"
    @cancel="handleClose"
    @confirm="handleReconnect"
    @close="handleClose"
  >
    <p class="text-delft-blue">
      {{ message }}
    </p>
  </BaseModal>
</template>

<script setup>
import { useRoute } from 'vue-router';
import BaseModal from './common/BaseModal.vue';
import { useLastFmSessionModal } from '@/composables/useLastFmSessionModal';
import { useLastFmApi } from '@/composables/useLastFmApi';
import { logLastFm } from '@utils/logger';

const route = useRoute();
const { visible, message, hideModal } = useLastFmSessionModal();
const { getAuthUrl } = useLastFmApi();

const handleClose = () => {
  hideModal();
};

const handleReconnect = () => {
  try {
    // Store the current route so we can redirect back after successful connection
    const currentPath = route.fullPath;
    sessionStorage.setItem('lastfm_return_path', currentPath);
    
    const callbackUrl = `${window.location.origin}/lastfm-callback`;
    const authUrl = getAuthUrl(callbackUrl);
    window.location.href = authUrl;
  } catch (err) {
    logLastFm("Error initiating Last.fm reconnect:", err);
    alert('Failed to initiate Last.fm reconnection. Please try again.');
  }
};
</script>
