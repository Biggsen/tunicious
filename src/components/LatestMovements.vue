<script setup>
import { ref, onMounted, watch } from 'vue';
import { useLatestMovements } from '@/composables/useLatestMovements';
import { useRouter } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import LoadingMessage from '@/components/common/LoadingMessage.vue';
import ErrorMessage from '@/components/common/ErrorMessage.vue';
import { ClockIcon, ArrowUpRightIcon, ArrowDownRightIcon } from '@heroicons/vue/24/outline';

const router = useRouter();
const user = useCurrentUser();
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

const loadMovements = async () => {
  if (user.value) {
    await fetchLatestMovements(props.limit);
  }
};

onMounted(async () => {
  await loadMovements();
});

watch(user, () => {
  if (user.value) {
    loadMovements();
  }
});

const navigateToAlbum = (movement) => {
  router.push({ 
    name: 'album', 
    params: { id: movement.albumId }
  });
};

const navigateToArtist = (movement) => {
  if (movement.artistId) {
    router.push({ 
      name: 'artist', 
      params: { id: movement.artistId }
    });
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

const getRoleColor = (pipelineRole) => {
  const colors = {
    'source': 'bg-gray-800 text-white',
    'transient': 'bg-blue-800 text-white',
    'terminal': 'bg-red-800 text-white',
    'sink': 'bg-gray-600 text-white'
  };
  return colors[pipelineRole] || 'bg-gray-800 text-white';
};

const getMovementTypeStyles = (type) => {
  if (type === 'known') {
    return {
      background: 'bg-mindero',
      border: 'border-delft-blue',
      hoverBorder: 'hover:border-delft-blue',
      label: 'Known Artist',
      labelColor: 'text-delft-blue'
    };
  } else {
    return {
      background: 'bg-mindero',
      border: 'border-delft-blue',
      hoverBorder: 'hover:border-delft-blue',
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
                <div class="mb-4">
                  <p v-if="movement.releaseYear" class="text-xs lg:text-sm xl:text-base text-delft-blue">
                    {{ movement.releaseYear }}
                  </p>
                  <p class="text-sm lg:text-base xl:text-lg text-delft-blue font-semibold">
                    <button
                      v-if="movement.albumId"
                      @click="navigateToAlbum(movement)"
                      class="hover:underline cursor-pointer"
                    >
                      {{ movement.albumTitle }}
                    </button>
                    <span v-else>
                      {{ movement.albumTitle }}
                    </span>
                  </p>
                  <p class="text-sm lg:text-base xl:text-lg text-delft-blue">
                    <button
                      v-if="movement.artistId"
                      @click="navigateToArtist(movement)"
                      class="hover:underline cursor-pointer"
                    >
                      {{ movement.artistName }}
                    </button>
                    <span v-else>{{ movement.artistName }}</span>
                  </p>
                </div>
              </div>
              
              <!-- Type Tag -->
              <span
                class="px-3 py-1 rounded-full text-xs font-semibold bg-delft-blue/10 text-delft-blue border border-delft-blue/20 flex-shrink-0"
                :title="getMovementTypeStyles(movement.type).label"
              >
                {{ getMovementTypeStyles(movement.type).label }}
              </span>
            </div>
          </div>
        </div>
        
        <!-- Movement Description -->
        <div class="pt-3 border-t border-delft-blue/20 space-y-2">
          <!-- Playlist Info -->
          <div class="flex items-center gap-2 text-sm">
            <!-- Show badges for moved albums, text for added albums -->
            <div v-if="movement.movementType === 'moved' && movement.fromPlaylist" class="flex items-center gap-2">
              <button
                v-if="movement.fromPlaylistId"
                @click.stop="navigateToPlaylist(movement.fromPlaylistId)"
                class="text-base font-semibold text-delft-blue hover:underline cursor-pointer"
              >
                {{ movement.fromPlaylist }}
              </button>
              <span
                v-else
                class="text-base font-semibold text-delft-blue"
              >
                {{ movement.fromPlaylist }}
              </span>
              <ArrowDownRightIcon 
                v-if="movement.fromPipelineRole === 'transient' && movement.pipelineRole === 'sink'"
                class="h-4 w-4 text-delft-blue" 
              />
              <ArrowUpRightIcon 
                v-else
                class="h-4 w-4 text-delft-blue" 
              />
              <button
                v-if="movement.toPlaylistId"
                @click.stop="navigateToPlaylist(movement.toPlaylistId)"
                class="text-base font-semibold text-delft-blue hover:underline cursor-pointer"
              >
                {{ movement.toPlaylist }}
              </button>
              <span
                v-else
                class="text-base font-semibold text-delft-blue"
              >
                {{ movement.toPlaylist }}
              </span>
            </div>
            <div v-else-if="movement.movementType === 'moved'" class="flex items-center gap-2">
              <button
                v-if="movement.toPlaylistId"
                @click.stop="navigateToPlaylist(movement.toPlaylistId)"
                class="text-base font-semibold text-delft-blue hover:underline cursor-pointer"
              >
                {{ movement.toPlaylist }}
              </button>
              <span
                v-else
                class="text-base font-semibold text-delft-blue"
              >
                {{ movement.toPlaylist }}
              </span>
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-base text-delft-blue">Added to</span>
              <button
                v-if="movement.toPlaylistId"
                @click.stop="navigateToPlaylist(movement.toPlaylistId)"
                class="text-base font-semibold text-delft-blue hover:underline cursor-pointer"
              >
                {{ movement.toPlaylist }}
              </button>
              <span
                v-else
                class="text-base font-semibold text-delft-blue"
              >
                {{ movement.toPlaylist }}
              </span>
            </div>
          </div>
          
          <!-- Timestamp -->
          <div class="text-sm text-delft-blue/50">
            {{ movement.timeAgo }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style> 