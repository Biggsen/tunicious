<script setup>
import { RouterView } from "vue-router";
import TheHeader from "./components/TheHeader.vue";
import SpotifyPlayerBar from "./components/SpotifyPlayerBar.vue";
import ToastContainer from "./components/ToastContainer.vue";
import { useSpotifyPlayer } from "@composables/useSpotifyPlayer";
import { useWebPlayerPlaycountTracking } from "@composables/useWebPlayerPlaycountTracking";

useSpotifyPlayer();

// Initialize global playcount tracking (active on all pages)
useWebPlayerPlaycountTracking();
</script>

<template>
  <TheHeader></TheHeader>
  <ToastContainer />
  <div class="container mx-auto pb-24">
    <RouterView />
  </div>
  <SpotifyPlayerBar />
</template>

<style scoped></style>
