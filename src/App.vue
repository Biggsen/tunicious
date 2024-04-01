<script setup>
import { RouterLink, RouterView } from "vue-router";
import { useCurrentUser } from "vuefire";
import TheHeader from "./components/TheHeader.vue";
const user = useCurrentUser();
</script>

<template>
  <TheHeader></TheHeader>
  <div class="container mx-auto">
    <RouterView />
  </div>
</template>

<style scoped></style>
