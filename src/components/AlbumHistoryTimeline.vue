<template>
  <div>
    <div class="flex gap-2 mb-4">
      <button
        v-for="option in filters"
        :key="option.id"
        type="button"
        :class="[
          'px-3 py-1 rounded-full text-sm font-medium border-2 border-delft-blue',
          filter === option.id ? 'bg-delft-blue text-mindero' : 'bg-white text-delft-blue'
        ]"
        @click="filter = option.id"
      >
        {{ option.label }}
      </button>
    </div>
    <p v-if="visibleEvents.length === 0" class="text-base">No album history yet.</p>
    <div v-else class="relative">
      <div class="absolute left-4 top-3 bottom-5 w-1 bg-mint -translate-x-1/2" aria-hidden="true" />
      <div
        v-for="event in visibleEvents"
        :key="event.key"
        class="relative flex items-start gap-4 pb-6 last:pb-0"
      >
        <div class="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 z-10 bg-mint">
          <component :is="event.icon" class="w-5 h-5 text-delft-blue" aria-hidden="true" />
        </div>
        <div class="pt-0.5 min-w-0 flex-1">
          <p class="text-lg font-semibold text-delft-blue">
            <router-link
              v-if="event.playlistId"
              :to="{ name: 'playlistSingle', params: { id: event.playlistId } }"
              class="hover:text-raspberry hover:underline transition-colors duration-200"
            >
              {{ event.label }}
            </router-link>
            <span v-else>{{ event.label }}</span>
          </p>
          <p class="text-sm text-stone-500">{{ event.detail }}</p>
          <p class="text-sm text-stone-500">{{ formatDate(event.at) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { BookmarkIcon, BookmarkSlashIcon } from '@heroicons/vue/24/outline';
import { ArrowRightIcon, ArchiveBoxArrowDownIcon } from '@heroicons/vue/24/solid';

const props = defineProps({
  playlistEntries: {
    type: Array,
    default: () => []
  },
  libraryEntries: {
    type: Array,
    default: () => []
  },
  playlistNames: {
    type: Object,
    default: () => ({})
  }
});

const filters = [
  { id: 'all', label: 'All' },
  { id: 'library', label: 'Library' },
  { id: 'playlists', label: 'Playlists' }
];
const filter = ref('all');

function eventDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = eventDate(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

const events = computed(() => {
  const list = [];
  const playlistEntries = [...(props.playlistEntries || [])].sort(
    (a, b) => (eventDate(a.addedAt)?.getTime() || 0) - (eventDate(b.addedAt)?.getTime() || 0)
  );
  playlistEntries.forEach((entry, index) => {
    const name = props.playlistNames[entry.playlistId] || 'Unknown Playlist';
    const movedOn = index < playlistEntries.length - 1;
    list.push({
      key: `playlist-add-${entry.playlistId}-${eventDate(entry.addedAt)?.getTime() || list.length}`,
      kind: 'playlist',
      at: entry.addedAt,
      label: name,
      detail: 'Added to playlist',
      playlistId: entry.playlistId,
      icon: ArrowRightIcon
    });
    if (entry.removedAt && !movedOn) {
      list.push({
        key: `playlist-left-${entry.playlistId}-${eventDate(entry.removedAt)?.getTime() || list.length}`,
        kind: 'playlist',
        at: entry.removedAt,
        label: name,
        detail: 'Left playlist',
        playlistId: entry.playlistId,
        icon: ArchiveBoxArrowDownIcon
      });
    }
  });
  for (const entry of props.libraryEntries || []) {
    list.push({
      key: `library-save-${entry.spotifyAlbumId}-${eventDate(entry.savedAt)?.getTime() || list.length}`,
      kind: 'library',
      at: entry.savedAt,
      label: 'Saved to library',
      detail: 'Saved in Spotify',
      icon: BookmarkIcon
    });
    if (entry.removedDetectedAt) {
      list.push({
        key: `library-gone-${entry.spotifyAlbumId}-${eventDate(entry.removedDetectedAt)?.getTime() || list.length}`,
        kind: 'library',
        at: entry.removedDetectedAt,
        label: 'Removed from library',
        detail: 'No longer saved when Tunicious checked',
        icon: BookmarkSlashIcon
      });
    }
  }
  return list.sort((a, b) => (eventDate(a.at)?.getTime() || 0) - (eventDate(b.at)?.getTime() || 0));
});

const visibleEvents = computed(() => {
  if (filter.value === 'library') return events.value.filter((event) => event.kind === 'library');
  if (filter.value === 'playlists') return events.value.filter((event) => event.kind === 'playlist');
  return events.value;
});
</script>
