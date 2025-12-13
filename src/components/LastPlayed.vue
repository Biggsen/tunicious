<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUnifiedTrackCache } from '@composables/useUnifiedTrackCache';
import { useUserData } from '@composables/useUserData';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import { MusicalNoteIcon } from '@heroicons/vue/24/outline';

const router = useRouter();
const { getLastPlayed, cacheLoaded } = useUnifiedTrackCache();
const { user } = useUserData();

const lastPlayed = ref(null);
const loading = ref(true);

const fetchLastPlayed = () => {
  if (!user.value) {
    loading.value = false;
    return;
  }
  
  // Wait for cache to be loaded
  if (!cacheLoaded.value) {
    return;
  }
  
  try {
    loading.value = true;
    lastPlayed.value = getLastPlayed();
  } catch (error) {
    console.error('Error fetching last played:', error);
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

onMounted(() => {
  fetchLastPlayed();
});

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

    <div v-else class="bg-white border-2 border-delft-blue rounded-xl p-6 space-y-4">
      <!-- Playlist -->
      <div>
        <div class="text-sm text-delft-blue/70 mb-1">Playlist</div>
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

      <!-- Album -->
      <div>
        <div class="text-sm text-delft-blue/70 mb-1">Album</div>
        <button
          v-if="lastPlayed.albumId"
          @click="navigateToAlbum(lastPlayed.albumId)"
          class="text-base font-semibold text-delft-blue hover:underline cursor-pointer"
        >
          {{ lastPlayed.albumName || 'Unknown Album' }}
        </button>
        <span v-else class="text-base font-semibold text-delft-blue">
          {{ lastPlayed.albumName || 'Unknown Album' }}
        </span>
      </div>

      <!-- Track -->
      <div>
        <div class="text-sm text-delft-blue/70 mb-1">Track</div>
        <div class="text-base font-semibold text-delft-blue">
          {{ lastPlayed.trackName || 'Unknown Track' }}
        </div>
        <div v-if="lastPlayed.artistName" class="text-sm text-delft-blue/70 mt-1">
          by 
          <button
            v-if="lastPlayed.artists?.[0]?.id"
            @click="navigateToArtist(lastPlayed.artists[0].id)"
            class="hover:underline cursor-pointer"
          >
            {{ lastPlayed.artistName }}
          </button>
          <span v-else>{{ lastPlayed.artistName }}</span>
        </div>
      </div>

      <!-- Timestamp -->
      <div v-if="lastPlayed.timestamp" class="pt-2 border-t border-delft-blue/20">
        <div class="text-xs text-delft-blue/50">
          {{ formatTimeAgo(lastPlayed.timestamp) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>

