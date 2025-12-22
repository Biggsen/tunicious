<template>
  <Card variant="white" class="hover:shadow-lg transition-shadow">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4 flex-1">
        <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
          <img 
            v-if="userData?.profileImageUrl" 
            :src="userData.profileImageUrl" 
            alt="Profile picture"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full bg-delft-blue flex items-center justify-center text-mindero text-lg font-semibold">
            {{ displayInitial }}
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-delft-blue truncate">
            {{ userData?.displayName || userData?.email || 'Unknown User' }}
          </h3>
          <p class="text-sm text-gray-600 truncate">
            {{ userData?.email }}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            {{ timeAgo }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <BaseButton
          v-if="type === 'incoming'"
          @click="$emit('accept')"
          :loading="loading"
          variant="primary"
          custom-class="text-sm px-3 py-1.5"
        >
          Accept
        </BaseButton>
        <BaseButton
          v-if="type === 'incoming'"
          @click="$emit('decline')"
          :loading="loading"
          variant="tertiary"
          custom-class="text-sm px-3 py-1.5"
        >
          Decline
        </BaseButton>
        <BaseButton
          v-if="type === 'outgoing'"
          @click="$emit('cancel')"
          :loading="loading"
          variant="tertiary"
          custom-class="text-sm px-3 py-1.5"
        >
          Cancel
        </BaseButton>
      </div>
    </div>
  </Card>
</template>

<script setup>
import { computed } from 'vue';
import Card from '@/components/common/Card.vue';
import BaseButton from '@/components/common/BaseButton.vue';

const props = defineProps({
  request: {
    type: Object,
    required: true
  },
  type: {
    type: String,
    required: true,
    validator: (value) => ['incoming', 'outgoing'].includes(value)
  },
  userData: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  }
});

defineEmits(['accept', 'decline', 'cancel']);

const displayInitial = computed(() => {
  const data = props.userData;
  return data?.displayName?.charAt(0)?.toUpperCase() || 
         data?.email?.charAt(0)?.toUpperCase() || 
         '?';
});

const timeAgo = computed(() => {
  if (!props.request.createdAt) return '';
  
  const date = props.request.createdAt.toDate ? 
    props.request.createdAt.toDate() : 
    new Date(props.request.createdAt);
  
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
});
</script>

