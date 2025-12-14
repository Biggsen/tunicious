<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { useUserData } from '@composables/useUserData';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import { MusicalNoteIcon } from '@heroicons/vue/24/outline';
import { logCache } from '@utils/logger';

const router = useRouter();
const { getLastPlayed, cacheLoaded } = useUnifiedTrackCache();
const { user } = useUserData();

const lastPlayed = ref(null);
const loading = ref(true);

const fetchLastPlayed = async () => {
  if (!user.value) {
    loading.value = false;
    return;
  }
  
  // Wait for cache to be loaded
  if (!cacheLoaded.value) {
    logCache('[LastPlayed] Cache not loaded yet, skipping fetch');
    return;
  }
  
  try {
    loading.value = true;
    logCache('[LastPlayed] Fetching last played track');
    lastPlayed.value = await getLastPlayed();
    logCache('[LastPlayed] Last played result:', lastPlayed.value);
  } catch (error) {
    logCache('[LastPlayed] Error fetching last played:', error);
  } finally {
    loading.value = false;
  }
};

const navigateToPlaylist = (playlistId) => {
  if (playlistId) {
    router.push({ 
      name: 'playlistSingle', 
      params: { id: playlistId }
    });
  }
};

const navigateToAlbum = (albumId) => {
  if (albumId) {
    router.push({ 
      name: 'album', 
      params: { id: albumId }
    });
  }
};

const navigateToArtist = (artistId) => {
  if (artistId && lastPlayed.value?.artists?.[0]?.id) {
    router.push({ 
      name: 'artist', 
      params: { id: lastPlayed.value.artists[0].id }
    });
  }
};

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  return 'Just now';
};


watch(user, () => {
  if (user.value) {
    fetchLastPlayed();
  }
});

watch(cacheLoaded, (loaded) => {
  if (loaded && user.value) {
    fetchLastPlayed();
  }
});

const handleLastPlayedUpdated = () => {
  logCache('[LastPlayed] Received last-played-updated event, refreshing...');
  fetchLastPlayed();
};

onMounted(() => {
  fetchLastPlayed();
  window.addEventListener('last-played-updated', handleLastPlayedUpdated);
});

onUnmounted(() => {
  window.removeEventListener('last-played-updated', handleLastPlayedUpdated);
});
</script>

<template>
  <div class="last-played">
    <div class="flex items-center gap-2 mb-4">
      <MusicalNoteIcon class="h-5 w-5 text-delft-blue" />
      <h2 class="text-xl font-bold text-delft-blue">Last Played</h2>
    </div>

    <LoadingMessage v-if="loading" />
    
    <div v-else-if="!lastPlayed" class="text-center py-8 text-gray-500">
      No playback history yet
    </div>

    <div v-else class="bg-white border-2 border-delft-blue rounded-xl p-6">
      <div class="flex gap-4 mb-4 items-start">
        <!-- Album Cover -->
        <div v-if="lastPlayed.albumCover" class="flex-shrink-0">
          <img
            :src="lastPlayed.albumCover"
            :alt="lastPlayed.albumName || 'Album cover'"
            class="w-28 h-28 rounded object-cover"
          />
        </div>

        <!-- Track Info -->
        <div class="flex-1 min-w-0">
          <!-- Track Title (large, bold) -->
          <div class="mb-2">
            <h3 class="text-lg font-semibold text-delft-blue">
              {{ lastPlayed.trackName || 'Unknown Track' }}
            </h3>
          </div>

          <!-- Album Year, Name, and Artist -->
          <div class="mb-4">
            <p v-if="lastPlayed.albumYear" class="text-xs lg:text-sm xl:text-base text-delft-blue/70">
              {{ lastPlayed.albumYear }}
            </p>
            <p class="text-sm lg:text-base xl:text-lg text-delft-blue/70 font-semibold">
              <button
                v-if="lastPlayed.albumId"
                @click="navigateToAlbum(lastPlayed.albumId)"
                class="hover:underline cursor-pointer"
              >
                {{ lastPlayed.albumName || 'Unknown Album' }}
              </button>
              <span v-else>
                {{ lastPlayed.albumName || 'Unknown Album' }}
              </span>
            </p>
            <p class="text-sm lg:text-base xl:text-lg text-delft-blue/70">
              <button
                v-if="lastPlayed.artists?.[0]?.id"
                @click="navigateToArtist(lastPlayed.artists[0].id)"
                class="hover:underline cursor-pointer"
              >
                {{ lastPlayed.artistName || 'Unknown Artist' }}
              </button>
              <span v-else>{{ lastPlayed.artistName || 'Unknown Artist' }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Playlist and Timestamp -->
      <div class="pt-3 border-t border-delft-blue/20 space-y-2">
        <!-- Playlist -->
        <div>
          <div class="text-sm text-delft-blue/50 mb-1">Playlist</div>
          <button
            v-if="lastPlayed.playlistId"
            @click="navigateToPlaylist(lastPlayed.playlistId)"
            class="text-base font-semibold text-delft-blue hover:underline cursor-pointer"
          >
            {{ lastPlayed.playlistName || 'Unknown Playlist' }}
          </button>
          <span v-else class="text-base font-semibold text-delft-blue">
            {{ lastPlayed.playlistName || 'Unknown Playlist' }}
          </span>
        </div>

        <!-- Timestamp -->
        <div v-if="lastPlayed.timestamp">
          <div class="text-sm text-delft-blue/50">
            {{ formatTimeAgo(lastPlayed.timestamp) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>

