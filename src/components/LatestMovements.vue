<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useLatestMovements } from '@/composables/useLatestMovements';
import { useFriends } from '@/composables/useFriends';
import { useRouter } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import LoadingMessage from '@/components/common/LoadingMessage.vue';
import ErrorMessage from '@/components/common/ErrorMessage.vue';
import { ClockIcon, ArrowUpRightIcon, ArrowDownRightIcon } from '@heroicons/vue/24/outline';

const router = useRouter();
const user = useCurrentUser();
const { movements, formattedMovements, loading, error, fetchLatestMovements, fetchFriendsMovements } = useLatestMovements();
const { getFriends } = useFriends();

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

const activeTab = ref('mine');
const friends = ref([]);
const friendDataMap = ref({}); // Map of userId -> userData for displaying friend names

const loadMovements = async () => {
  if (user.value) {
    await fetchLatestMovements(props.limit);
  }
};

const loadFriendsMovements = async () => {
  if (!user.value) return;
  
  try {
    // Get friends list
    const friendsList = await getFriends();
    friends.value = friendsList;
    
    if (friendsList.length === 0) {
      movements.value = [];
      return;
    }

    // Fetch friend user data for display
    const friendIds = friendsList.map(f => f.id);
    const friendDataPromises = friendIds.map(async (friendId) => {
      const userDoc = await getDoc(doc(db, 'users', friendId));
      return userDoc.exists() ? { id: friendId, data: userDoc.data() } : null;
    });
    
    const friendDataResults = await Promise.all(friendDataPromises);
    friendDataMap.value = {};
    friendDataResults.forEach(result => {
      if (result) {
        friendDataMap.value[result.id] = result.data;
      }
    });

    // Fetch movements for all friends
    await fetchFriendsMovements(friendIds, props.limit);
  } catch (err) {
    console.error('Error loading friends movements:', err);
  }
};

const loadDataForTab = async () => {
  if (activeTab.value === 'mine') {
    await loadMovements();
  } else {
    await loadFriendsMovements();
  }
};

onMounted(async () => {
  await loadDataForTab();
});

watch(user, () => {
  if (user.value) {
    loadDataForTab();
  }
});

watch(activeTab, () => {
  loadDataForTab();
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

    <!-- Tab Navigation -->
    <div>
      <nav class="-mb-px flex space-x-2 ml-[20px]">
        <button
          @click="activeTab = 'mine'"
          :class="[
            'py-3 px-4 font-semibold text-base rounded-t-lg transition-all duration-200',
            activeTab === 'mine'
              ? 'text-delft-blue bg-mint'
              : 'text-gray-600 hover:text-delft-blue hover:bg-mint'
          ]"
        >
          Mine
        </button>
        <button
          @click="activeTab = 'friends'"
          :class="[
            'py-3 px-4 font-semibold text-base rounded-t-lg transition-all duration-200',
            activeTab === 'friends'
              ? 'text-delft-blue bg-mint'
              : 'text-gray-600 hover:text-delft-blue hover:bg-mint'
          ]"
        >
          Friends
        </button>
      </nav>
    </div>

    <!-- Tab Content -->
    <div class="bg-mint p-4 rounded-xl">
      <LoadingMessage v-if="loading" />
      <ErrorMessage v-else-if="error" :message="error" />
      
      <div v-else-if="formattedMovements.length === 0" class="text-center py-8 text-gray-500">
        <span v-if="activeTab === 'mine'">No recent movements found</span>
        <span v-else-if="friends.length === 0">No friends yet. Add friends to see their movements!</span>
        <span v-else>No recent movements from friends</span>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="movement in formattedMovements"
          :key="`${movement.albumId}-${movement.timestamp}-${movement.userId || 'mine'}`"
          :class="[
            'movement-item border-2 rounded-xl p-4',
            getMovementTypeStyles(movement.type).background,
            getMovementTypeStyles(movement.type).border
          ]"
        >
          <div class="flex items-start gap-3 mb-3">
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
          
          <!-- Timestamp with Friend Name -->
          <div class="text-sm text-delft-blue/50 flex items-center gap-2">
            <template v-if="activeTab === 'friends' && movement.userId && friendDataMap[movement.userId]">
              <div class="w-5 h-5 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                <img 
                  v-if="friendDataMap[movement.userId].profileImageUrl" 
                  :src="friendDataMap[movement.userId].profileImageUrl" 
                  alt="Profile picture"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full bg-delft-blue flex items-center justify-center text-mindero text-xs font-semibold">
                  {{ (friendDataMap[movement.userId].displayName || friendDataMap[movement.userId].email)?.charAt(0)?.toUpperCase() || '?' }}
                </div>
              </div>
              <span class="font-bold text-delft-blue text-base">
                {{ friendDataMap[movement.userId].displayName || friendDataMap[movement.userId].email }}
              </span>
            </template>
            <span class="ml-2">{{ movement.timeAgo }}</span>
          </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style> 