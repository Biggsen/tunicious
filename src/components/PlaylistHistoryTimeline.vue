<script setup>
import { computed } from 'vue';
import { ClockIcon } from '@heroicons/vue/24/outline';
import {
  ArrowRightIcon,
  ArchiveBoxArrowDownIcon,
  StarIcon
} from '@heroicons/vue/24/solid';

const props = defineProps({
  entries: {
    type: Array,
    default: () => []
  },
  playlistNames: {
    type: Object,
    default: () => ({})
  }
});

const sortedEntries = computed(() => {
  const list = [...(props.entries || [])];
  list.sort((a, b) => {
    const dateA = a.addedAt?.toDate ? a.addedAt.toDate() : new Date(a.addedAt || 0);
    const dateB = b.addedAt?.toDate ? b.addedAt.toDate() : new Date(b.addedAt || 0);
    return dateA - dateB;
  });
  return list.map((entry, index) => ({
    ...entry,
    isCurrent: index === list.length - 1 && !entry.removedAt
  }));
});

function getRoleIcon(role) {
  switch (role) {
    case 'source':
      return ClockIcon;
    case 'transient':
      return ArrowRightIcon;
    case 'sink':
      return ArchiveBoxArrowDownIcon;
    case 'terminal':
      return StarIcon;
    default:
      return ArrowRightIcon;
  }
}

function formatDate(addedAt) {
  if (!addedAt) return '';
  const d = addedAt?.toDate ? addedAt.toDate() : new Date(addedAt);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function playlistName(playlistId) {
  return props.playlistNames[playlistId] ?? 'Unknown Playlist';
}
</script>

<template>
  <div class="playlist-history-timeline">
    <h3 class="h4 font-semibold text-delft-blue mb-4">Listening history</h3>
    <div class="relative pl-4">
      <div
        class="absolute left-[30px] top-3 bottom-5 w-1 bg-mint"
        aria-hidden="true"
      />
      <div
        v-for="(entry, index) in sortedEntries"
        :key="index"
        class="relative flex items-start gap-4 pb-6 last:pb-0"
      >
        <div
          :class="[
            'flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 z-10',
            entry.isCurrent ? 'bg-delft-blue' : 'bg-mint'
          ]"
        >
          <component
            :is="getRoleIcon(entry.pipelineRole)"
            :class="['w-5 h-5', entry.isCurrent ? 'text-mindero' : 'text-delft-blue']"
            aria-hidden="true"
          />
        </div>
        <div class="pt-0.5 min-w-0 flex-1">
          <p class="text-lg font-semibold text-delft-blue">
            <router-link
              v-if="entry.playlistId"
              :to="{ name: 'playlistSingle', params: { id: entry.playlistId } }"
              class="hover:text-raspberry hover:underline transition-colors duration-200"
            >
              {{ playlistName(entry.playlistId) }}
            </router-link>
            <span v-else>{{ playlistName(entry.playlistId) }}</span>
          </p>
          <p class="text-sm text-stone-500">
            {{ formatDate(entry.addedAt) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
