<script setup>
import { RouterView } from "vue-router";
import TheHeader from "./components/TheHeader.vue";
import SpotifyPlayerBar from "./components/SpotifyPlayerBar.vue";
import { useSpotifyPlayer } from "@composables/useSpotifyPlayer";
import { usePlaycountTracking } from "@composables/usePlaycountTracking";

useSpotifyPlayer();
usePlaycountTracking();
</script>

<template>
  <TheHeader></TheHeader>
  <div class="container mx-auto pb-24">
    <RouterView />
  </div>
  <SpotifyPlayerBar />
</template>

<style scoped></style>
