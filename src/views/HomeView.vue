<script setup>
import { ref } from "vue";
import { useToken } from "@utils/auth";

const { loading, error } = useToken();
</script>

<template>
  <main>
    <h1 class="h2 pb-10">Homepage</h1>
    <p v-if="loading">Loading...</p>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <div v-else>
      <p>Welcome to the homepage!</p>
      <RouterLink to="/playlists" class="text-blue-500 hover:underline">Go to Playlists</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.error-message {
  color: red;
  font-weight: bold;
}
</style>
