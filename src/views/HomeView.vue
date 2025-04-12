<script setup>
import { ref, onMounted } from "vue";
import { useToken } from "@utils/auth";
import { RouterLink } from "vue-router";

const { token, initializeToken } = useToken();
const loading = ref(true);
const error = ref(null);

onMounted(async () => {
  try {
    await initializeToken();
    // Add any additional initialization logic here if needed
  } catch (e) {
    console.error("Error in HomeView:", e);
    error.value = "An unexpected error occurred. Please try again.";
  } finally {
    loading.value = false;
  }
});
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
