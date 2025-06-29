<template>
  <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
    <h3 class="text-lg font-semibold mb-3 text-delft-blue">Cache Management</h3>
    
    <div v-if="cacheInfo" class="mb-4 space-y-2">
      <div class="text-sm">
        <span class="font-medium">Total entries:</span> {{ cacheInfo.totalEntries }}
      </div>
      <div class="text-sm">
        <span class="font-medium">Cache size:</span> {{ cacheInfo.totalSizeKB }} KB ({{ cacheInfo.totalSizeMB }} MB)
      </div>
      <div v-if="cacheInfo.expiredEntries > 0" class="text-sm text-amber-600">
        <span class="font-medium">Expired entries:</span> {{ cacheInfo.expiredEntries }}
      </div>
      <div class="text-xs text-gray-500">
        Cache entries expire after 24 hours
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <BaseButton 
        @click="refreshInfo" 
        :disabled="loading"
        variant="secondary"
        size="sm"
      >
        <template #icon-left>
          <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        </template>
        Refresh Info
      </BaseButton>
      
      <BaseButton 
        @click="cleanupExpired" 
        :disabled="loading || !cacheInfo || cacheInfo.expiredEntries === 0"
        variant="secondary"
        size="sm"
      >
        <template #icon-left>
          <TrashIcon class="h-4 w-4" />
        </template>
        Clean Expired
      </BaseButton>
      
      <BaseButton 
        @click="clearAllCache" 
        :disabled="loading"
        variant="danger"
        size="sm"
      >
        <template #icon-left>
          <XMarkIcon class="h-4 w-4" />
        </template>
        Clear All Cache
      </BaseButton>
    </div>

    <div v-if="message" class="mt-3 p-2 rounded text-sm" :class="messageClass">
      {{ message }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { getCacheInfo, clearCache } from '@/utils/cache';
import BaseButton from '@/components/common/BaseButton.vue';
import { ArrowPathIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';

const cacheInfo = ref(null);
const loading = ref(false);
const message = ref('');
const messageType = ref('');

const messageClass = computed(() => {
  switch (messageType.value) {
    case 'success':
      return 'bg-green-50 text-green-700 border border-green-200';
    case 'error':
      return 'bg-red-50 text-red-700 border border-red-200';
    case 'warning':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    default:
      return 'bg-blue-50 text-blue-700 border border-blue-200';
  }
});

const showMessage = (msg, type = 'info') => {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
    messageType.value = '';
  }, 3000);
};

const refreshInfo = async () => {
  loading.value = true;
  try {
    cacheInfo.value = getCacheInfo();
    showMessage('Cache info refreshed', 'success');
  } catch (error) {
    console.error('Error refreshing cache info:', error);
    showMessage('Error refreshing cache info', 'error');
  } finally {
    loading.value = false;
  }
};

const cleanupExpired = async () => {
  loading.value = true;
  try {
    const beforeInfo = getCacheInfo();
    
    // Clear expired entries by iterating through localStorage
    const keysToRemove = [];
    const now = Date.now();
    const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      try {
        const item = localStorage.getItem(key);
        if (!item) continue;
        
        const parsed = JSON.parse(item);
        if (parsed.timestamp && (now - parsed.timestamp > CACHE_EXPIRATION)) {
          keysToRemove.push(key);
        }
      } catch (parseError) {
        // Remove unparseable entries
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Error removing cache key ${key}:`, error);
      }
    });
    
    cacheInfo.value = getCacheInfo();
    showMessage(`Cleaned up ${keysToRemove.length} expired entries`, 'success');
  } catch (error) {
    console.error('Error cleaning up cache:', error);
    showMessage('Error cleaning up cache', 'error');
  } finally {
    loading.value = false;
  }
};

const clearAllCache = async () => {
  if (!confirm('Are you sure you want to clear all cache? This will remove all stored data and may slow down the next page loads.')) {
    return;
  }
  
  loading.value = true;
  try {
    clearCache(); // Clear all cache
    cacheInfo.value = getCacheInfo();
    showMessage('All cache cleared successfully', 'success');
  } catch (error) {
    console.error('Error clearing cache:', error);
    showMessage('Error clearing cache', 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  refreshInfo();
});
</script> 