<script setup>
import { ref, onMounted } from 'vue';
import { useLatestMovements } from '@/composables/useLatestMovements';
import { useRouter } from 'vue-router';
import LoadingMessage from '@/components/common/LoadingMessage.vue';
import ErrorMessage from '@/components/common/ErrorMessage.vue';
import { ClockIcon, ArrowRightIcon } from '@heroicons/vue/24/outline';
import { HeartIcon, SparklesIcon } from '@heroicons/vue/24/solid';

const router = useRouter();
const { movements, formattedMovements, loading, error, fetchLatestMovements } = useLatestMovements();

const props = defineProps({
  limit: {
    type: Number,
    default: 8
  },
  showHeader: {
    type: Boolean,
    default: true
  }
});

onMounted(async () => {
  await fetchLatestMovements(props.limit);
});

const navigateToAlbum = (movement) => {
  router.push({ 
    name: 'album', 
    params: { id: movement.albumId }
  });
};

const getCategoryColor = (category) => {
  const colors = {
    'queued': 'bg-gray-800 text-white',
    'curious': 'bg-blue-800 text-white',
    'interested': 'bg-green-800 text-white',
    'great': 'bg-yellow-800 text-white',
    'excellent': 'bg-orange-800 text-white',
    'wonderful': 'bg-red-800 text-white'
  };
  return colors[category] || 'bg-gray-800 text-white';
};

const getMovementTypeStyles = (type) => {
  if (type === 'known') {
    return {
      background: 'bg-mindero',
      border: 'border-delft-blue',
      hoverBorder: 'hover:border-delft-blue',
      icon: HeartIcon,
      iconColor: 'text-delft-blue',
      label: 'Known Artist',
      labelColor: 'text-delft-blue'
    };
  } else {
    return {
      background: 'bg-mindero',
      border: 'border-delft-blue',
      hoverBorder: 'hover:border-delft-blue',
      icon: SparklesIcon,
      iconColor: 'text-delft-blue',
      label: 'New Artist',
      labelColor: 'text-delft-blue'
    };
  }
};

const fallbackImage = '/placeholder.png';
</script>

<template>
  <div class="latest-movements">
    <div v-if="showHeader" class="flex items-center gap-2 mb-4">
      <ClockIcon class="h-5 w-5 text-delft-blue" />
      <h2 class="text-xl font-bold text-delft-blue">Latest Movements</h2>
    </div>

    <LoadingMessage v-if="loading" />
    <ErrorMessage v-else-if="error" :message="error" />
    
    <div v-else-if="formattedMovements.length === 0" class="text-center py-8 text-gray-500">
      No recent movements found
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="movement in formattedMovements"
        :key="`${movement.albumId}-${movement.timestamp}`"
        :class="[
          'movement-item border-2 rounded-xl p-4',
          getMovementTypeStyles(movement.type).background,
          getMovementTypeStyles(movement.type).border
        ]"
      >
        <div class="flex items-start gap-3">
          <!-- Album Cover -->
          <img
            :src="movement.albumCover || fallbackImage"
            :alt="movement.albumTitle"
            class="w-20 h-20 rounded object-cover flex-shrink-0"
          />
          
          <!-- Movement Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="mb-1">
                  <h3 
                    class="font-semibold text-delft-blue truncate cursor-pointer hover:underline"
                    @click="navigateToAlbum(movement)"
                  >
                    {{ movement.albumTitle }}
                  </h3>
                </div>
                <p class="text-sm text-delft-blue truncate">
                  by 
                  <span 
                    class="cursor-pointer hover:underline"
                    @click="navigateToAlbum(movement)"
                  >
                    {{ movement.artistName }}
                  </span>
                </p>
              </div>
              
              <!-- Type Icon -->
              <component 
                :is="getMovementTypeStyles(movement.type).icon"
                :class="['h-5 w-5 flex-shrink-0', getMovementTypeStyles(movement.type).iconColor]"
                :title="getMovementTypeStyles(movement.type).label"
              />
            </div>
            
            <!-- Movement Description -->
            <div class="mt-2 flex items-center gap-2 text-sm">
              <!-- Show badges for moved albums, text for added albums -->
              <div v-if="movement.movementType === 'moved' && movement.fromPlaylist" class="flex items-center gap-2">
                <span
                  :class="[
                    'inline-flex items-center px-2 py-1 text-xs font-medium',
                    movement.fromCategory === 'end' ? 'rounded' : 'rounded-full',
                    getCategoryColor(movement.fromCategory)
                  ]"
                >
                  {{ movement.fromPlaylist }}
                </span>
                <ArrowRightIcon class="h-3 w-3 text-delft-blue/50" />
                <span
                  :class="[
                    'inline-flex items-center px-2 py-1 text-xs font-medium',
                    movement.category === 'end' ? 'rounded' : 'rounded-full',
                    getCategoryColor(movement.category)
                  ]"
                >
                  {{ movement.toPlaylist }}
                </span>
              </div>
              <div v-else-if="movement.movementType === 'moved'" class="flex items-center gap-2">
                <span
                  :class="[
                    'inline-flex items-center px-2 py-1 text-xs font-medium',
                    movement.category === 'end' ? 'rounded' : 'rounded-full',
                    getCategoryColor(movement.category)
                  ]"
                >
                  {{ movement.toPlaylist }}
                </span>
              </div>
              <span v-else class="text-delft-blue font-medium">{{ movement.actionText }}</span>
              
              <span class="text-delft-blue/50">•</span>
              <span class="text-delft-blue/70">{{ movement.timeAgo }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- View All Link -->
    <div v-if="formattedMovements.length > 0" class="mt-4 text-center">
      <RouterLink
        to="/playlists"
        class="text-sm text-mint hover:text-delft-blue hover:underline font-medium"
      >
        View playlists →
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
</style> 