<script setup>
import { useCurrentUser } from 'vuefire';
import BaseLayout from '@components/common/BaseLayout.vue';

const user = useCurrentUser();
</script>

<template>
  <BaseLayout>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-delft-blue mb-2">
        Welcome{{ user?.displayName ? `, ${user.displayName}` : '' }}!
      </h1>
      <p class="text-delft-blue/70">
        Track your music discovery journey
      </p>
    </div>
  </BaseLayout>
</template>

<style scoped>
</style>
