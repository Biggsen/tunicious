<template>
  <Card>
    <h3 class="text-lg font-semibold mb-3 text-delft-blue">Cache Management</h3>
    
    <!-- General Cache Info -->
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

    <!-- Unified Track Cache Stats -->
    <div v-if="unifiedCacheStats" class="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <h4 class="text-md font-semibold mb-2 text-delft-blue">Track Cache</h4>
      <div class="space-y-1 text-sm">
        <div>
          <span class="font-medium">Tracks:</span> {{ (unifiedCacheStats.totalTracks || 0).toLocaleString() }}
        </div>
        <div>
          <span class="font-medium">Albums:</span> {{ (unifiedCacheStats.totalAlbums || 0).toLocaleString() }}
        </div>
        <div>
          <span class="font-medium">Playlists:</span> {{ (unifiedCacheStats.totalPlaylists || 0).toLocaleString() }}
        </div>
        <div>
          <span class="font-medium">Loved tracks:</span> {{ (unifiedCacheStats.lovedTracks || 0).toLocaleString() }}
        </div>
        <div v-if="unifiedCacheStats.unsyncedChanges > 0" class="text-amber-600">
          <span class="font-medium">Unsynced changes:</span> {{ unifiedCacheStats.unsyncedChanges }}
        </div>
        <div v-else class="text-green-600">
          <span class="font-medium">Sync status:</span> All synced
        </div>
        <div v-if="unifiedCacheStats.lastUpdated" class="text-xs text-gray-500 mt-2">
          Last updated: {{ formatDate(unifiedCacheStats.lastUpdated) }}
        </div>
      </div>
    </div>

    <!-- General Cache Actions -->
    <div class="mb-4">
      <h4 class="text-sm font-semibold mb-2 text-delft-blue">General Cache</h4>
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
    </div>

    <!-- Unified Track Cache Actions -->
    <div v-if="user && userData" class="mb-4">
      <h4 class="text-sm font-semibold mb-2 text-delft-blue">Track Cache</h4>
      <div class="flex flex-wrap gap-2">
        <BaseButton 
          @click="retryFailedSyncs" 
          :disabled="unifiedLoading || !unifiedCacheStats || unifiedCacheStats.unsyncedChanges === 0"
          variant="secondary"
          size="sm"
        >
          <template #icon-left>
            <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': unifiedLoading }" />
          </template>
          Retry Failed Syncs
          <span v-if="unifiedCacheStats && unifiedCacheStats.unsyncedChanges > 0" class="ml-1">
            ({{ unifiedCacheStats.unsyncedChanges }})
          </span>
        </BaseButton>
        
        <BaseButton 
          @click="refreshAllPlaycounts" 
          :disabled="unifiedLoading || !unifiedCacheStats || unifiedCacheStats.totalTracks === 0"
          variant="secondary"
          size="sm"
        >
          <template #icon-left>
            <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': refreshingPlaycounts }" />
          </template>
          Refresh All Playcounts
        </BaseButton>
        
        <BaseButton 
          @click="refreshAllLovedTracks" 
          :disabled="unifiedLoading || !userData.lastFmUserName"
          variant="secondary"
          size="sm"
        >
          <template #icon-left>
            <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': refreshingLoved }" />
          </template>
          Refresh Loved Status
        </BaseButton>
        
        <BaseButton 
          @click="clearUnifiedCache" 
          :disabled="unifiedLoading"
          variant="danger"
          size="sm"
        >
          <template #icon-left>
            <XMarkIcon class="h-4 w-4" />
          </template>
          Clear Track Cache
        </BaseButton>
      </div>
    </div>

    <div v-if="message" class="mt-3 p-2 rounded text-sm" :class="messageClass">
      {{ message }}
    </div>
  </Card>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { getCacheInfo, clearCache } from '@/utils/cache';
import BaseButton from '@/components/common/BaseButton.vue';
import Card from '@/components/common/Card.vue';
import { ArrowPathIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { logCache } from '@utils/logger';
import { useUnifiedTrackCache } from '@/composables/useUnifiedTrackCache';
import { useUserData } from '@/composables/useUserData';

const cacheInfo = ref(null);
const loading = ref(false);
const message = ref('');
const messageType = ref('');

// Unified track cache
const { user, userData } = useUserData();
const {
  stats: unifiedCacheStats,
  unsyncedCount,
  retrySyncs: retryFailedSyncsAction,
  refreshLovedTracksForUser,
  refreshPlaycountsForTracks,
  getAllTrackIdsFromCache,
  clearCache: clearUnifiedCacheAction
} = useUnifiedTrackCache();

const unifiedLoading = ref(false);
const refreshingPlaycounts = ref(false);
const refreshingLoved = ref(false);

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
    logCache('Error refreshing cache info:', error);
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
        logCache(`Error removing cache key ${key}:`, error);
      }
    });
    
    cacheInfo.value = getCacheInfo();
    showMessage(`Cleaned up ${keysToRemove.length} expired entries`, 'success');
  } catch (error) {
    logCache('Error cleaning up cache:', error);
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
    logCache('Error clearing cache:', error);
    showMessage('Error clearing cache', 'error');
  } finally {
    loading.value = false;
  }
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  return date.toLocaleString();
};

const retryFailedSyncs = async () => {
  unifiedLoading.value = true;
  try {
    const result = await retryFailedSyncsAction();
    if (result.retried > 0) {
      showMessage(`Retried ${result.retried} syncs: ${result.succeeded} succeeded, ${result.failed} failed`, result.failed > 0 ? 'warning' : 'success');
    } else {
      showMessage('No failed syncs to retry', 'info');
    }
    refreshInfo();
  } catch (error) {
    logCache('Error retrying failed syncs:', error);
    showMessage('Error retrying failed syncs', 'error');
  } finally {
    unifiedLoading.value = false;
  }
};

const refreshAllPlaycounts = async () => {
  if (!user.value || !userData.value?.lastFmUserName) {
    showMessage('Last.fm username required to refresh playcounts', 'warning');
    return;
  }

  refreshingPlaycounts.value = true;
  unifiedLoading.value = true;
  try {
    const trackIds = getAllTrackIdsFromCache();
    if (trackIds.length === 0) {
      showMessage('No tracks in cache to refresh', 'info');
      return;
    }

    let progressCount = 0;
    await refreshPlaycountsForTracks(trackIds, (progress) => {
      progressCount = progress.current;
    }, true);

    showMessage(`Refreshed playcounts for ${trackIds.length} tracks`, 'success');
    refreshInfo();
  } catch (error) {
    logCache('Error refreshing all playcounts:', error);
    showMessage('Error refreshing playcounts', 'error');
  } finally {
    refreshingPlaycounts.value = false;
    unifiedLoading.value = false;
  }
};

const refreshAllLovedTracks = async () => {
  if (!user.value || !userData.value?.lastFmUserName) {
    showMessage('Last.fm username required to refresh loved tracks', 'warning');
    return;
  }

  refreshingLoved.value = true;
  unifiedLoading.value = true;
  try {
    let progressCount = 0;
    const result = await refreshLovedTracksForUser((progress) => {
      progressCount = progress.current || 0;
    });

    showMessage(`Refreshed loved tracks: ${result.matchedCount} matched from ${result.totalLovedTracks} total`, 'success');
    refreshInfo();
  } catch (error) {
    logCache('Error refreshing loved tracks:', error);
    showMessage('Error refreshing loved tracks', 'error');
  } finally {
    refreshingLoved.value = false;
    unifiedLoading.value = false;
  }
};

const clearUnifiedCache = async () => {
  if (!confirm('Are you sure you want to clear the track cache? This will remove all cached tracks, playcounts, and loved status. You will need to rebuild the cache by visiting playlists with tracklists enabled.')) {
    return;
  }

  unifiedLoading.value = true;
  try {
    await clearUnifiedCacheAction();
    showMessage('Track cache cleared successfully', 'success');
    refreshInfo();
  } catch (error) {
    logCache('Error clearing unified cache:', error);
    showMessage('Error clearing track cache', 'error');
  } finally {
    unifiedLoading.value = false;
  }
};

// Watch for changes in unified cache stats to refresh display
watch([unifiedCacheStats, unsyncedCount], () => {
  // Stats are computed, so they update automatically
}, { deep: true });

onMounted(() => {
  refreshInfo();
});
</script> 