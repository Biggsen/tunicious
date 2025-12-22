<template>
  <Card variant="white" class="hover:shadow-lg transition-shadow cursor-pointer" @click="$emit('view-profile')">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4 flex-1">
        <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
          <img 
            v-if="friend.profileImageUrl" 
            :src="friend.profileImageUrl" 
            alt="Profile picture"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full bg-delft-blue flex items-center justify-center text-mindero text-lg font-semibold">
            {{ displayInitial }}
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-delft-blue truncate">
            {{ friend.displayName || friend.email }}
          </h3>
          <p class="text-sm text-gray-600 truncate">
            {{ friend.email }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <BaseButton
          @click.stop="$emit('view-profile')"
          variant="secondary"
          custom-class="text-sm px-3 py-1.5"
        >
          View Activity
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
  friend: {
    type: Object,
    required: true
  }
});

defineEmits(['view-profile']);

const displayInitial = computed(() => {
  return props.friend.displayName?.charAt(0)?.toUpperCase() || 
         props.friend.email?.charAt(0)?.toUpperCase() || 
         '?';
});
</script>

