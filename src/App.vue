<script setup>
import { RouterView } from "vue-router";
import TheHeader from "./components/TheHeader.vue";
</script>

<template>
  <TheHeader></TheHeader>
  <div class="container mx-auto">
    <RouterView />
  </div>
</template>

<style scoped></style>
