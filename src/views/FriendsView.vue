<template>
  <BaseLayout>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-delft-blue mb-2">Friends</h1>
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
      <!-- Search Tab -->
      <div v-if="activeTab === 'search'">
        <div class="mb-6">
          <div class="relative">
            <input
              v-model="searchQuery"
              @input="handleSearchInput"
              type="text"
              placeholder="Search by display name or email..."
              class="w-full px-4 py-3 pl-10 rounded-lg border-2 border-delft-blue focus:outline-none focus:ring-2 focus:ring-delft-blue"
            />
            <MagnifyingGlassIcon class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
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
        <div v-else-if="searchQuery && !searchLoading" class="text-center py-8 text-gray-500">
          No users found matching "{{ searchQuery }}"
        </div>
        <div v-else class="text-center py-8 text-gray-500">
          Start typing to search for users...
        </div>
      </div>

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
        <div v-else-if="friends.length > 0" class="space-y-3">
          <FriendCard
            v-for="friend in friends"
            :key="friend.id"
            :friend="friend"
            @view-profile="handleViewFriendProfile(friend.id)"
          />
        </div>
        <div v-else class="text-center py-8 text-gray-500">
          No friends yet. Search for users to send friend requests!
        </div>
      </div>
    </div>
  </BaseLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useFriends } from '@/composables/useFriends';
import { useToast } from '@/composables/useToast';
import BaseLayout from '@components/common/BaseLayout.vue';
import UserCard from '@/components/friends/UserCard.vue';
import FriendRequestCard from '@/components/friends/FriendRequestCard.vue';
import FriendCard from '@/components/friends/FriendCard.vue';
import LoadingMessage from '@/components/common/LoadingMessage.vue';
import ErrorMessage from '@/components/common/ErrorMessage.vue';
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

const router = useRouter();
const { showToast } = useToast();

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

const activeTab = ref('search');
const searchQuery = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const searchError = ref(null);
const requestsLoading = ref(false);
const requestsError = ref(null);
const actionLoading = ref({});

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
  return [
    { id: 'search', label: 'Search' },
    { 
      id: 'requests', 
      label: 'Requests',
      badge: incomingCount > 0 ? incomingCount : null
    },
    { id: 'friends', label: 'Friends' }
  ];
});

// Watch for tab changes to load data
watch(activeTab, (newTab) => {
  if (newTab === 'requests') {
    loadRequests();
  } else if (newTab === 'friends') {
    loadFriends();
  }
});

onMounted(() => {
  // Load initial data based on active tab
  if (activeTab.value === 'requests') {
    loadRequests();
  } else if (activeTab.value === 'friends') {
    loadFriends();
  }
});
</script>

<style scoped>
</style>

