<script setup>
import { useCurrentUser } from 'vuefire';
import LatestMovements from '@components/LatestMovements.vue';
import LastPlayed from '@components/LastPlayed.vue';
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

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <LatestMovements :limit="8" />
      </div>
      <div>
        <LastPlayed />
      </div>
    </div>
  </BaseLayout>
</template>

<style scoped>
</style>
