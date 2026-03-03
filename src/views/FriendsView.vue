<template>
  <BaseLayout>
    <div class="mb-8">
      <h1 class="h2 mb-2">Friends</h1>
      <p class="text-delft-blue/70">
        Connect with other Tunicious users and discover music together
      </p>
    </div>

    <!-- Tab Navigation -->
    <div>
      <nav class="-mb-px flex space-x-2 ml-[20px]">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'py-3 px-4 font-semibold text-base rounded-t-lg transition-all duration-200',
            activeTab === tab.id
              ? 'text-delft-blue bg-mint'
              : 'text-gray-600 hover:text-delft-blue hover:bg-mint'
          ]"
        >
          {{ tab.label }}
          <span v-if="tab.badge" class="ml-2 px-2 py-0.5 bg-raspberry text-white rounded-full text-xs">
            {{ tab.badge }}
          </span>
        </button>
      </nav>
    </div>

    <!-- Tab Content -->
    <div class="bg-mint p-6 rounded-xl">
      <!-- Requests Tab -->
      <div v-if="activeTab === 'requests'">
        <LoadingMessage v-if="requestsLoading" />
        <ErrorMessage v-else-if="requestsError" :message="requestsError" />
        <div v-else>
          <!-- Incoming Requests -->
          <div class="mb-8">
            <h2 class="text-xl font-bold text-delft-blue mb-4">Incoming Requests</h2>
            <div v-if="incomingRequests.length > 0" class="space-y-3">
              <FriendRequestCard
                v-for="request in incomingRequests"
                :key="request.id"
                :request="request"
                type="incoming"
                :user-data="request.fromUser"
                :loading="actionLoading[request.id]"
                @accept="handleAcceptRequest(request.id)"
                @decline="handleDeclineRequest(request.id)"
              />
            </div>
            <div v-else class="text-center py-8 text-gray-500">
              No incoming requests
            </div>
          </div>

          <!-- Outgoing Requests -->
          <div>
            <h2 class="text-xl font-bold text-delft-blue mb-4">Outgoing Requests</h2>
            <div v-if="outgoingRequests.length > 0" class="space-y-3">
              <FriendRequestCard
                v-for="request in outgoingRequests"
                :key="request.id"
                :request="request"
                type="outgoing"
                :user-data="request.toUser"
                :loading="actionLoading[request.id]"
                @cancel="handleCancelRequestById(request.id)"
              />
            </div>
            <div v-else class="text-center py-8 text-gray-500">
              No outgoing requests
            </div>
          </div>
        </div>
      </div>

      <!-- Friends Tab -->
      <div v-if="activeTab === 'friends'">
        <LoadingMessage v-if="friendsLoading" />
        <ErrorMessage v-else-if="friendsError" :message="friendsError" />
        <div v-else-if="friends.length > 0" class="space-y-3 mb-8">
          <FriendCard
            v-for="friend in friends"
            :key="friend.id"
            :friend="friend"
            @view-profile="handleViewFriendProfile(friend.id)"
          />
        </div>
        <div v-else class="mb-8 text-center py-8 text-gray-500">
          No friends yet. Search for users below to send friend requests!
        </div>

        <div class="border-t border-delft-blue/20 pt-6">
          <h2 class="text-xl font-bold text-delft-blue mb-4">Add Friends</h2>
          <div class="relative mb-4">
            <input
              v-model="searchQuery"
              @input="handleSearchInput"
              type="text"
              placeholder="Search by display name or email..."
              class="w-full px-4 py-3 pl-10 rounded-lg border-2 border-delft-blue focus:outline-none focus:ring-2 focus:ring-delft-blue"
            />
            <MagnifyingGlassIcon class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
          <LoadingMessage v-if="searchLoading" />
          <ErrorMessage v-else-if="searchError" :message="searchError" />
          <div v-else-if="searchResults.length > 0" class="space-y-3">
            <UserCard
              v-for="user in searchResults"
              :key="user.id"
              :user="user"
              :status="user.relationshipStatus"
              :loading="actionLoading[user.id]"
              @send-request="handleSendRequest(user.id)"
              @cancel-request="handleCancelRequest(user.id)"
              @view-requests="activeTab = 'requests'"
            />
          </div>
          <div v-else-if="searchQuery && !searchLoading" class="text-center py-6 text-gray-500">
            No users found matching "{{ searchQuery }}"
          </div>
          <div v-else class="text-center py-6 text-gray-500">
            Start typing to search for users...
          </div>
        </div>
      </div>

      <!-- Recommendations Tab -->
      <div v-if="activeTab === 'recommendations'">
        <LoadingMessage v-if="recommendationsLoading" />
        <ErrorMessage v-else-if="recommendationsError" :message="recommendationsError" />
        <div v-else-if="recommendations.length > 0" class="space-y-3">
          <div
            v-for="rec in recommendations"
            :key="rec.id"
            class="bg-mindero rounded-lg border-2 border-delft-blue p-4 flex flex-wrap items-start gap-3"
          >
            <div class="flex flex-col items-center gap-1 flex-shrink-0 w-14 self-center mr-4">
              <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-delft-blue/30 flex-shrink-0 bg-delft-blue/10">
                <img
                  v-if="rec.fromProfileImageUrl"
                  :src="rec.fromProfileImageUrl"
                  alt=""
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-delft-blue text-sm font-semibold">
                  {{ (rec.fromDisplayName || '?').charAt(0).toUpperCase() }}
                </div>
              </div>
              <span class="text-xs text-delft-blue/80 text-center leading-tight">{{ rec.fromDisplayName || 'Someone' }}</span>
            </div>
            <img
              :src="rec.albumCover || recAlbumFallback"
              :alt="rec.albumTitle"
              class="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-white shadow-sm"
            />
            <div class="flex-1 min-w-0">
              <p v-if="rec.releaseYear" class="text-sm text-delft-blue">{{ rec.releaseYear }}</p>
              <p class="font-semibold text-lg text-delft-blue leading-tight">
                <router-link
                  v-if="rec.albumId"
                  :to="{ name: 'album', params: { id: rec.albumId } }"
                  class="hover:underline"
                >
                  {{ rec.albumTitle }}
                </router-link>
                <span v-else>{{ rec.albumTitle }}</span>
              </p>
              <p class="text-base text-delft-blue">{{ rec.artistName }}</p>
            </div>
            <div class="flex flex-col items-end gap-2 flex-shrink-0 self-center">
              <div v-if="rec.existingPlaylistId" class="flex items-center gap-2">
                <span class="inline-flex items-center min-h-[2.5rem] text-sm text-amber-700">Already in {{ rec.existingPlaylistName }}</span>
                <BaseButton
                  variant="default"
                  :disabled="actionLoading[rec.id]"
                  @click="handleDeclineRecommendation(rec.id)"
                >
                  Dismiss
                </BaseButton>
              </div>
              <div v-else class="flex gap-2">
                <BaseButton
                  variant="primary"
                  :disabled="actionLoading[rec.id]"
                  @click="openAcceptRecommendationModal(rec)"
                >
                  Accept
                </BaseButton>
                <BaseButton
                  variant="default"
                  :disabled="actionLoading[rec.id]"
                  @click="handleDeclineRecommendation(rec.id)"
                >
                  Decline
                </BaseButton>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-gray-500">
          No recommendations
        </div>
      </div>
    </div>

    <!-- Accept recommendation: playlist picker modal -->
    <BaseModal
      :visible="showAcceptRecommendationModal"
      title="Add to which playlist?"
      :show-cancel="true"
      :show-confirm="true"
      confirm-text="Add & accept"
      @close="showAcceptRecommendationModal = false"
      @cancel="showAcceptRecommendationModal = false"
      @confirm="handleAcceptRecommendationConfirm"
    >
      <template #default>
        <p class="text-sm text-gray-600 mb-3">Choose a source playlist to add the album to:</p>
        <select
          v-model="acceptRecommendationPlaylistId"
          class="w-full px-3 py-2 border-2 border-delft-blue rounded-lg focus:ring-2 focus:ring-delft-blue"
        >
          <option value="" disabled>Select a playlist</option>
          <option v-for="p in acceptPlaylists" :key="p.id" :value="p.id">
            {{ p.name }} ({{ p.tracks?.total ?? 0 }} tracks)
          </option>
        </select>
        <p v-if="acceptPlaylistsLoading" class="text-gray-500 mt-2 text-sm">Loading playlists...</p>
        <p v-else-if="acceptPlaylists.length === 0" class="text-gray-500 mt-2 text-sm">No source playlists found. Create a source playlist in Playlists first.</p>
      </template>
      <template #actions>
        <BaseButton variant="default" @click="showAcceptRecommendationModal = false">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!acceptRecommendationPlaylistId || acceptRecommendationSubmitting"
          @click="handleAcceptRecommendationConfirm"
        >
          {{ acceptRecommendationSubmitting ? 'Adding...' : 'Add & accept' }}
        </BaseButton>
      </template>
    </BaseModal>
  </BaseLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useFriends } from '@/composables/useFriends';
import { useToast } from '@/composables/useToast';
import { useAlbumRecommendations } from '@/composables/useAlbumRecommendations';
import { useUserData } from '@/composables/useUserData';
import BaseLayout from '@components/common/BaseLayout.vue';
import BaseButton from '@components/common/BaseButton.vue';
import BaseModal from '@components/common/BaseModal.vue';
import UserCard from '@/components/friends/UserCard.vue';
import FriendRequestCard from '@/components/friends/FriendRequestCard.vue';
import FriendCard from '@/components/friends/FriendCard.vue';
import LoadingMessage from '@/components/common/LoadingMessage.vue';
import ErrorMessage from '@/components/common/ErrorMessage.vue';
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

const router = useRouter();
const { showToast } = useToast();
const { userData } = useUserData();
const {
  getRecommendationsForMe,
  acceptRecommendation,
  declineRecommendation,
  getSourcePlaylists
} = useAlbumRecommendations();

const {
  loading: friendsLoading,
  error: friendsError,
  friends,
  incomingRequests,
  outgoingRequests,
  searchUsers: searchUsersFn,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  getFriends
} = useFriends();

const activeTab = ref('friends');
const searchQuery = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const searchError = ref(null);
const requestsLoading = ref(false);
const requestsError = ref(null);
const actionLoading = ref({});
const recommendations = ref([]);
const recommendationsLoading = ref(false);
const recommendationsError = ref(null);
const showAcceptRecommendationModal = ref(false);
const acceptRecommendationRec = ref(null);
const acceptRecommendationPlaylistId = ref('');
const acceptPlaylists = ref([]);
const acceptPlaylistsLoading = ref(false);
const acceptRecommendationSubmitting = ref(false);
const recAlbumFallback = '/placeholder.png';

// Debounce search
let searchTimeout = null;
const handleSearchInput = () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  searchTimeout = setTimeout(() => {
    performSearch();
  }, 300);
};

const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }

  try {
    searchLoading.value = true;
    searchError.value = null;
    const results = await searchUsersFn(searchQuery.value.trim(), 20);
    searchResults.value = results;
  } catch (error) {
    searchError.value = error.message || 'Failed to search users';
    searchResults.value = [];
  } finally {
    searchLoading.value = false;
  }
};

const loadRequests = async () => {
  try {
    requestsLoading.value = true;
    requestsError.value = null;
    await Promise.all([
      getIncomingRequests(),
      getOutgoingRequests()
    ]);
  } catch (error) {
    requestsError.value = error.message || 'Failed to load requests';
  } finally {
    requestsLoading.value = false;
  }
};

const loadFriends = async () => {
  try {
    await getFriends();
  } catch (error) {
    console.error('Failed to load friends:', error);
  }
};

const handleSendRequest = async (userId) => {
  try {
    actionLoading.value[userId] = true;
    await sendFriendRequest(userId);
    showToast('Friend request sent!', 'success');
    
    // Update search results to reflect new status
    const user = searchResults.value.find(u => u.id === userId);
    if (user) {
      user.relationshipStatus = 'outgoing_request';
    }
  } catch (error) {
    showToast(error.message || 'Failed to send friend request', 'error');
  } finally {
    actionLoading.value[userId] = false;
  }
};

const handleCancelRequest = async (userId) => {
  // Find the outgoing request for this user
  const request = outgoingRequests.value.find(r => r.toUserId === userId);
  if (request) {
    await handleCancelRequestById(request.id);
  }
};

const handleCancelRequestById = async (requestId) => {
  try {
    actionLoading.value[requestId] = true;
    await cancelFriendRequest(requestId);
    showToast('Friend request canceled', 'success');
    await loadRequests();
    
    // Update search results if user is in results
    const request = outgoingRequests.value.find(r => r.id === requestId);
    if (request) {
      const user = searchResults.value.find(u => u.id === request.toUserId);
      if (user) {
        user.relationshipStatus = 'none';
      }
    }
  } catch (error) {
    showToast(error.message || 'Failed to cancel request', 'error');
  } finally {
    actionLoading.value[requestId] = false;
  }
};

const handleAcceptRequest = async (requestId) => {
  try {
    actionLoading.value[requestId] = true;
    await acceptFriendRequest(requestId);
    showToast('Friend request accepted!', 'success');
    await Promise.all([
      loadRequests(),
      loadFriends()
    ]);
  } catch (error) {
    showToast(error.message || 'Failed to accept request', 'error');
  } finally {
    actionLoading.value[requestId] = false;
  }
};

const handleDeclineRequest = async (requestId) => {
  try {
    actionLoading.value[requestId] = true;
    await declineFriendRequest(requestId);
    showToast('Friend request declined', 'success');
    await loadRequests();
  } catch (error) {
    showToast(error.message || 'Failed to decline request', 'error');
  } finally {
    actionLoading.value[requestId] = false;
  }
};

const handleViewFriendProfile = (friendId) => {
  // TODO: Navigate to friend's activity/profile page
  // For now, just show a message
  showToast('Friend profile view coming soon!', 'info');
};

const tabs = computed(() => {
  const incomingCount = incomingRequests.value.length;
  const outgoingCount = outgoingRequests.value.length;
  const hasRequests = incomingCount > 0 || outgoingCount > 0;
  const pendingRecCount = recommendations.value.length;

  const allTabs = [
    { id: 'friends', label: 'Friends' },
    ...(hasRequests
      ? [{
          id: 'requests',
          label: 'Requests',
          badge: incomingCount > 0 ? incomingCount : null
        }]
      : []),
    { id: 'recommendations', label: 'Recommendations', badge: pendingRecCount > 0 ? pendingRecCount : null }
  ];

  return allTabs;
});

const loadRecommendations = async () => {
  try {
    recommendationsLoading.value = true;
    recommendationsError.value = null;
    recommendations.value = await getRecommendationsForMe('pending');
  } catch (e) {
    recommendationsError.value = e.message || 'Failed to load recommendations';
    recommendations.value = [];
  } finally {
    recommendationsLoading.value = false;
  }
};

const openAcceptRecommendationModal = async (rec) => {
  acceptRecommendationRec.value = rec;
  acceptRecommendationPlaylistId.value = '';
  showAcceptRecommendationModal.value = true;
  try {
    acceptPlaylistsLoading.value = true;
    acceptPlaylists.value = await getSourcePlaylists();
    if (acceptPlaylists.value.length > 0 && !acceptRecommendationPlaylistId.value) {
      acceptRecommendationPlaylistId.value = acceptPlaylists.value[0].id;
    }
  } catch (_) {
    acceptPlaylists.value = [];
  } finally {
    acceptPlaylistsLoading.value = false;
  }
};

const handleAcceptRecommendationConfirm = async () => {
  const rec = acceptRecommendationRec.value;
  const playlistId = acceptRecommendationPlaylistId.value;
  if (!rec || !playlistId) return;
  try {
    acceptRecommendationSubmitting.value = true;
    actionLoading.value[rec.id] = true;
    await acceptRecommendation(rec.id, playlistId);
    showToast('Album added to playlist and recommendation accepted.', 'success');
    showAcceptRecommendationModal.value = false;
    await loadRecommendations();
  } catch (e) {
    showToast(e.message || 'Failed to accept recommendation', 'error');
  } finally {
    acceptRecommendationSubmitting.value = false;
    actionLoading.value[rec.id] = false;
  }
};

const handleDeclineRecommendation = async (recommendationId) => {
  try {
    actionLoading.value[recommendationId] = true;
    await declineRecommendation(recommendationId);
    showToast('Recommendation declined', 'success');
    await loadRecommendations();
  } catch (e) {
    showToast(e.message || 'Failed to decline recommendation', 'error');
  } finally {
    actionLoading.value[recommendationId] = false;
  }
};

// Watch for tab changes to load data
watch(activeTab, (newTab) => {
  if (newTab === 'requests') {
    loadRequests();
  } else if (newTab === 'friends') {
    loadFriends();
  } else if (newTab === 'recommendations') {
    loadRecommendations();
  }
});

onMounted(() => {
  loadRequests();
  loadRecommendations();
  if (activeTab.value === 'friends') {
    loadFriends();
  }
});

watch(
  () => [incomingRequests.value.length, outgoingRequests.value.length],
  () => {
    if (
      activeTab.value === 'requests' &&
      incomingRequests.value.length === 0 &&
      outgoingRequests.value.length === 0
    ) {
      activeTab.value = 'friends';
    }
  }
);
</script>

<style scoped>
</style>

