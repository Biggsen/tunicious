<template>
  <div class="lastfm-usage-stats">
    <Card>
      <h3 class="text-xl font-bold text-delft-blue mb-4">
        Last.fm API Usage Statistics
      </h3>

      <LoadingMessage v-if="loading" message="Loading usage statistics..." />
      <ErrorMessage v-else-if="error" :message="error" />

      <div v-else class="space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gradient-to-br from-mint to-celadon p-4 rounded-lg text-white">
            <div class="text-sm opacity-90">Today</div>
            <div class="text-3xl font-bold">{{ stats.today }}</div>
            <div class="text-sm opacity-75">API calls</div>
          </div>
          
          <div class="bg-gradient-to-br from-delft-blue to-raspberry p-4 rounded-lg text-white">
            <div class="text-sm opacity-90">This Week</div>
            <div class="text-3xl font-bold">{{ stats.thisWeek }}</div>
            <div class="text-sm opacity-75">API calls</div>
          </div>
          
          <div class="bg-gradient-to-br from-raspberry to-mindero p-4 rounded-lg text-white">
            <div class="text-sm opacity-90">This Month</div>
            <div class="text-3xl font-bold">{{ stats.thisMonth }}</div>
            <div class="text-sm opacity-75">API calls</div>
          </div>
        </div>

        <!-- Hourly Chart -->
        <div class="bg-gray-50 p-4 rounded-lg">
          <h4 class="text-lg font-semibold text-delft-blue mb-3">
            Last 24 Hours
          </h4>
          <div class="flex items-end justify-between gap-1 h-48 pb-8">
            <div
              v-for="(item, index) in stats.hourly"
              :key="index"
              class="flex-1 flex flex-col items-center group relative"
            >
              <div
                class="w-full bg-mint rounded-t transition-all hover:bg-celadon cursor-pointer"
                :style="{ height: `${Math.max((item.count / maxHourlyCount) * 100, 5)}%` }"
                :title="`${item.label}: ${item.count} calls`"
              ></div>
              <div class="text-xs text-gray-600 mt-1 absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                {{ index % 4 === 0 ? item.label : '' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Most Used Methods -->
        <div class="bg-gray-50 p-4 rounded-lg">
          <h4 class="text-lg font-semibold text-delft-blue mb-3">
            Most Used Methods
          </h4>
          <div class="space-y-2">
            <div
              v-for="(method, index) in stats.methods.slice(0, 10)"
              :key="method.method"
              class="flex items-center justify-between p-2 bg-white rounded"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-500">#{{ index + 1 }}</span>
                <code class="text-sm font-mono text-delft-blue">{{ method.method }}</code>
              </div>
              <span class="text-sm font-semibold text-raspberry">{{ method.count }}</span>
            </div>
            <p v-if="stats.methods.length === 0" class="text-gray-500 text-sm">
              No API calls recorded yet
            </p>
          </div>
        </div>

        <!-- Refresh Button -->
        <div class="flex justify-end">
          <BaseButton @click="fetchStats" :disabled="loading">
            <span v-if="loading" class="animate-spin mr-2">⟳</span>
            Refresh Stats
          </BaseButton>
        </div>
      </div>
    </Card>
  </div>
</template>

<script setup>
import { onMounted, computed } from 'vue';
import { useLastFmUsageStats } from '@/composables/useLastFmUsageStats';
import Card from '@/components/common/Card.vue';
import LoadingMessage from '@/components/common/LoadingMessage.vue';
import ErrorMessage from '@/components/common/ErrorMessage.vue';
import BaseButton from '@/components/common/BaseButton.vue';

const { loading, error, stats, fetchStats } = useLastFmUsageStats();

const maxHourlyCount = computed(() => {
  return Math.max(...stats.value.hourly.map(h => h.count), 1);
});

onMounted(() => {
  fetchStats();
});
</script>

<style scoped>
.lastfm-usage-stats {
  @apply w-full;
}
</style>

