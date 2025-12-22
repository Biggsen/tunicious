<template>
  <Card variant="white" class="hover:shadow-lg transition-shadow">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4 flex-1">
        <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
          <img 
            v-if="user.profileImageUrl" 
            :src="user.profileImageUrl" 
            alt="Profile picture"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full bg-delft-blue flex items-center justify-center text-mindero text-lg font-semibold">
            {{ displayInitial }}
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-delft-blue truncate">
            {{ user.displayName || user.email }}
          </h3>
          <p class="text-sm text-gray-600 truncate">
            {{ user.email }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span 
          v-if="status === 'friend'" 
          class="px-3 py-1 bg-celadon text-delft-blue rounded-full text-sm font-medium"
        >
          Friends
        </span>
        <span 
          v-else-if="status === 'outgoing_request'" 
          class="px-3 py-1 bg-mint text-delft-blue rounded-full text-sm font-medium"
        >
          Request Sent
        </span>
        <span 
          v-else-if="status === 'incoming_request'" 
          class="px-3 py-1 bg-mindero text-delft-blue rounded-full text-sm font-medium"
        >
          Request Received
        </span>
        <BaseButton
          v-if="status === 'none'"
          @click="$emit('send-request')"
          :loading="loading"
          variant="primary"
          custom-class="text-sm px-3 py-1.5"
        >
          Send Request
        </BaseButton>
        <BaseButton
          v-else-if="status === 'outgoing_request'"
          @click="$emit('cancel-request')"
          :loading="loading"
          variant="tertiary"
          custom-class="text-sm px-3 py-1.5"
        >
          Cancel
        </BaseButton>
        <BaseButton
          v-else-if="status === 'incoming_request'"
          @click="$emit('view-requests')"
          variant="secondary"
          custom-class="text-sm px-3 py-1.5"
        >
          View Requests
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
  user: {
    type: Object,
    required: true
  },
  status: {
    type: String,
    default: 'none',
    validator: (value) => ['none', 'friend', 'incoming_request', 'outgoing_request'].includes(value)
  },
  loading: {
    type: Boolean,
    default: false
  }
});

defineEmits(['send-request', 'cancel-request', 'view-requests']);

const displayInitial = computed(() => {
  return props.user.displayName?.charAt(0)?.toUpperCase() || 
         props.user.email?.charAt(0)?.toUpperCase() || 
         '?';
});
</script>

