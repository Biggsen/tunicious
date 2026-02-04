<script setup>
import LatestMovements from '@components/LatestMovements.vue';
import LastPlayed from '@components/LastPlayed.vue';
import BaseLayout from '@components/common/BaseLayout.vue';
</script>

<template>
  <BaseLayout>
    <div class="mb-8">
      <h1 class="h2 mb-2">Activity</h1>
      <p class="text-delft-blue/70">
        Latest movements and recently played
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
