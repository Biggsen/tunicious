<script setup>
import { useUpdates } from '@/composables/useUpdates';
import BaseLayout from '@components/common/BaseLayout.vue';

const { visibleUpdates, formatDate } = useUpdates();
</script>

<template>
  <BaseLayout>
    <h1 class="h2 pb-4">Updates</h1>

    <div v-if="visibleUpdates.length === 0" class="py-12">
      <p class="text-delft-blue/70">No updates available at this time.</p>
    </div>

    <div v-else class="space-y-8 max-w-[70ch]">
      <article
        v-for="update in visibleUpdates"
        :key="update.id"
        class="update-entry"
      >
        <div class="mb-2">
          <time
            :datetime="update.date"
            class="text-orange-600 font-medium"
          >
            {{ formatDate(update.date) }}
          </time>
        </div>

        <h3 class="text-2xl font-bold text-delft-blue mb-3">
          {{ update.title }}
        </h3>

        <p
          v-if="update.description"
          class="text-delft-blue/90 mb-4 leading-relaxed"
        >
          {{ update.description }}
        </p>

        <ul
          v-if="update.changes && update.changes.length > 0"
          class="list-disc list-outside mb-4 space-y-1 text-delft-blue/80 ml-6"
        >
          <li v-for="(change, index) in update.changes" :key="index">
            {{ change }}
          </li>
        </ul>

        <div
          v-if="update.types && update.types.length > 0"
          class="flex flex-wrap gap-2 mt-4"
        >
          <span
            v-for="(type, index) in update.types"
            :key="index"
            class="px-3 py-1 rounded-full text-xs font-semibold bg-delft-blue/10 text-delft-blue border border-delft-blue/20"
          >
            {{ type }}
          </span>
        </div>
      </article>
    </div>
  </BaseLayout>
</template>

<style scoped>
.update-entry {
  @apply pb-8 border-b border-delft-blue/20 last:border-b-0;
}

.update-entry:last-child {
  @apply pb-0;
}
</style>

