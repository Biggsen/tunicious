<script setup>
import { ref, onMounted, computed } from 'vue';
import { useLastFmApi } from '@/composables/useLastFmApi';
import LoadingMessage from '@/components/common/LoadingMessage.vue';
import ErrorMessage from '@/components/common/ErrorMessage.vue';
import Card from '@/components/common/Card.vue';
import { MusicalNoteIcon, UserIcon, CalendarIcon } from '@heroicons/vue/24/outline';
import { logLastFm } from '@utils/logger';

const props = defineProps({
  username: {
    type: String,
    required: true
  },
  showRecentTracks: {
    type: Boolean,
    default: true
  },
  showTopAlbums: {
    type: Boolean,
    default: true
  },
  showUserInfo: {
    type: Boolean,
    default: true
  },
  limit: {
    type: Number,
    default: 10
  }
});

const { 
  loading, 
  error, 
  getUserInfo, 
  getUserRecentTracks, 
  getUserTopAlbums 
} = useLastFmApi();

const userInfo = ref(null);
const recentTracks = ref([]);
const topAlbums = ref([]);
const fetchError = ref(null);

const isLoading = computed(() => loading.value);
const hasError = computed(() => error.value || fetchError.value);

const formatPlaycount = (count) => {
  if (!count) return '0';
  const num = parseInt(count);
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(parseInt(timestamp) * 1000);
  return date.toLocaleDateString();
};

const getImageUrl = (images, size = 'medium') => {
  if (!images || !Array.isArray(images)) return '/placeholder.png';
  
  const sizeMap = {
    small: '0',
    medium: '1', 
    large: '2',
    extralarge: '3'
  };
  
  const targetSize = sizeMap[size] || '1';
  const image = images.find(img => img.size === size) || images[targetSize] || images[0];
  return image?.['#text'] || '/placeholder.png';
};

const fetchLastFmData = async () => {
  if (!props.username) return;
  
  try {
    fetchError.value = null;
    
    const promises = [];
    
    if (props.showUserInfo) {
      promises.push(getUserInfo(props.username));
    }
    
    if (props.showRecentTracks) {
      promises.push(getUserRecentTracks(props.username, props.limit));
    }
    
    if (props.showTopAlbums) {
      promises.push(getUserTopAlbums(props.username, '1month', props.limit));
    }
    
    const results = await Promise.allSettled(promises);
    
    let resultIndex = 0;
    
    if (props.showUserInfo) {
      const userResult = results[resultIndex++];
      if (userResult.status === 'fulfilled') {
        userInfo.value = userResult.value.user;
      }
    }
    
    if (props.showRecentTracks) {
      const tracksResult = results[resultIndex++];
      if (tracksResult.status === 'fulfilled') {
        recentTracks.value = tracksResult.value.recenttracks?.track || [];
      }
    }
    
    if (props.showTopAlbums) {
      const albumsResult = results[resultIndex++];
      if (albumsResult.status === 'fulfilled') {
        topAlbums.value = albumsResult.value.topalbums?.album || [];
      }
    }
    
  } catch (err) {
    fetchError.value = err.message;
    logLastFm('Error fetching Last.fm data:', err);
  }
};

onMounted(() => {
  fetchLastFmData();
});
</script>

<template>
  <div class="lastfm-stats">
    <div v-if="!username" class="text-center py-8 text-gray-500">
      No Last.fm username configured
    </div>
    
    <LoadingMessage v-else-if="isLoading" message="Loading Last.fm data..." />
    
    <ErrorMessage v-else-if="hasError" :message="hasError" />
    
    <div v-else class="space-y-6">
      <!-- User Info Section -->
      <Card v-if="showUserInfo && userInfo">
        <div class="flex items-center space-x-4">
          <img 
            :src="getImageUrl(userInfo.image, 'large')" 
            :alt="`${userInfo.name} avatar`"
            class="w-16 h-16 rounded-full object-cover"
          />
          <div>
            <h3 class="text-lg font-semibold text-delft-blue">{{ userInfo.name }}</h3>
            <div class="text-sm text-gray-600 space-y-1">
              <div class="flex items-center">
                <MusicalNoteIcon class="w-4 h-4 mr-1" />
                <span>{{ formatPlaycount(userInfo.playcount) }} scrobbles</span>
              </div>
              <div v-if="userInfo.registered" class="flex items-center">
                <CalendarIcon class="w-4 h-4 mr-1" />
                <span>Member since {{ formatDate(userInfo.registered.unixtime) }}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Recent Tracks Section -->
      <Card v-if="showRecentTracks && recentTracks.length > 0">
        <h3 class="text-lg font-semibold text-delft-blue mb-4 flex items-center">
          <MusicalNoteIcon class="w-5 h-5 mr-2" />
          Recent Tracks
        </h3>
        <div class="space-y-2">
          <div 
            v-for="(track, index) in recentTracks" 
            :key="`${track.artist['#text']}-${track.name}-${index}`"
            class="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded"
          >
            <img 
              :src="getImageUrl(track.image, 'small')" 
              :alt="`${track.name} cover`"
              class="w-12 h-12 rounded object-cover"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-delft-blue truncate">{{ track.name }}</p>
              <p class="text-sm text-gray-500 truncate">{{ track.artist['#text'] }}</p>
              <p v-if="track.album && track.album['#text']" class="text-xs text-gray-400 truncate">
                {{ track.album['#text'] }}
              </p>
            </div>
            <div v-if="track['@attr']?.nowplaying" class="text-xs text-mint font-semibold">
              Now Playing
            </div>
            <div v-else-if="track.date" class="text-xs text-gray-400">
              {{ formatDate(track.date.uts) }}
            </div>
          </div>
        </div>
      </Card>

      <!-- Top Albums Section -->
      <Card v-if="showTopAlbums && topAlbums.length > 0">
        <h3 class="text-lg font-semibold text-delft-blue mb-4">
          Top Albums (Past Month)
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div 
            v-for="(album, index) in topAlbums" 
            :key="`${album.artist.name}-${album.name}-${index}`"
            class="text-center"
          >
            <img 
              :src="getImageUrl(album.image, 'large')" 
              :alt="`${album.name} cover`"
              class="w-full aspect-square rounded object-cover mb-2"
            />
            <p class="text-sm font-medium text-delft-blue truncate">{{ album.name }}</p>
            <p class="text-xs text-gray-500 truncate">{{ album.artist.name }}</p>
            <p class="text-xs text-gray-400">{{ formatPlaycount(album.playcount) }} plays</p>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.lastfm-stats {
  @apply max-w-4xl mx-auto;
}
</style> 