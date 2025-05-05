<script setup>
import { useToken } from "@utils/auth";
import ErrorMessage from '@components/common/ErrorMessage.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';

const { loading, error } = useToken();
</script>

<template>
  <main>
    <h1 class="h2 pb-10">Homepage</h1>
    <LoadingMessage v-if="loading" />
    <ErrorMessage v-else-if="error" :message="error" />
    <div v-else>
      <p>Welcome to the homepage!</p>
      <RouterLink to="/playlists" class="text-blue-500 hover:underline">Go to Playlists</RouterLink>
    </div>
  </main>
</template>

<style scoped>
</style>
