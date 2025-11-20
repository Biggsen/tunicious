<template>
  <div
    v-if="isAdmin"
    class="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-2 text-xs z-50 max-w-xs"
  >
    <div class="font-semibold text-delft-blue mb-1">Cache Debug</div>
    <div v-if="cacheInfo" class="space-y-1">
      <div>
        <span class="text-gray-600">Size:</span>
        <span class="font-mono ml-1">{{ cacheInfo.totalSizeMB }} MB</span>
        <span class="text-gray-500">({{ cacheInfo.totalSizeKB }} KB)</span>
      </div>
      <div>
        <span class="text-gray-600">Entries:</span>
        <span class="font-mono ml-1">{{ cacheInfo.totalEntries }}</span>
      </div>
      <div v-if="cacheInfo.expiredEntries > 0" class="text-amber-600">
        <span>Expired:</span>
        <span class="font-mono ml-1">{{ cacheInfo.expiredEntries }}</span>
      </div>
      <div class="text-gray-400 text-[10px] mt-1">
        Updated {{ lastUpdate }}
      </div>
    </div>
    <div v-else class="text-gray-500">Loading...</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useAdmin } from '@composables/useAdmin';
import { getCacheInfo } from '@utils/cache';

const { isAdmin } = useAdmin();
const cacheInfo = ref(null);
const lastUpdate = ref('just now');
let updateInterval = null;

const updateCacheInfo = () => {
  try {
    cacheInfo.value = getCacheInfo();
    const now = new Date();
    lastUpdate.value = now.toLocaleTimeString();
  } catch (error) {
    console.error('Error updating cache info:', error);
    cacheInfo.value = {
      totalEntries: 0,
      totalSize: 0,
      expiredEntries: 0,
      totalSizeKB: 0,
      totalSizeMB: 0
    };
  }
};

const startUpdating = () => {
  if (isAdmin.value) {
    updateCacheInfo();
    // Update every 5 seconds
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(updateCacheInfo, 5000);
  }
};

const stopUpdating = () => {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
};

// Watch for admin status changes
watch(isAdmin, (newValue) => {
  if (newValue) {
    startUpdating();
  } else {
    stopUpdating();
  }
}, { immediate: true });

onMounted(() => {
  // Initialize immediately if admin
  if (isAdmin.value) {
    updateCacheInfo();
  }
  startUpdating();
});

onUnmounted(() => {
  stopUpdating();
});
</script>

