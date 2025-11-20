<script setup>
import { RouterView } from "vue-router";
import TheHeader from "./components/TheHeader.vue";
import SpotifyPlayerBar from "./components/SpotifyPlayerBar.vue";
import CacheDebugPanel from "./components/common/CacheDebugPanel.vue";
import { useSpotifyPlayer } from "@composables/useSpotifyPlayer";

useSpotifyPlayer();
</script>

<template>
  <TheHeader></TheHeader>
  <div class="container mx-auto pb-24">
    <RouterView />
  </div>
  <SpotifyPlayerBar />
  <CacheDebugPanel />
</template>

<style scoped></style>
