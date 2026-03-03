<template>
  <BaseModal
    :visible="visible"
    title="Spotify Connection Required"
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
import { useSpotifySessionModal } from '@/composables/useSpotifySessionModal';
import { useSpotifyAuth } from '@/composables/useSpotifyAuth';
import { logSpotify } from '@utils/logger';

const route = useRoute();
const { visible, message, hideModal } = useSpotifySessionModal();
const { initiateSpotifyLogin } = useSpotifyAuth();

const handleClose = () => {
  hideModal();
};

const handleReconnect = () => {
  try {
    const currentPath = route.fullPath;
    sessionStorage.setItem('spotify_return_path', currentPath);

    initiateSpotifyLogin();
  } catch (err) {
    logSpotify('Error initiating Spotify reconnect:', err);
    alert('Failed to initiate Spotify reconnection. Please try again.');
  }
};
</script>
