<script setup>
const props = defineProps({
  tracks: {
    type: Array,
    required: true
  }
});

const formatDuration = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
</script>

<template>
  <div class="bg-white border-2 border-delft-blue rounded-xl p-4">
    <h2 class="text-xl font-bold text-delft-blue mb-4">Track List</h2>
    <ul class="space-y-2">
      <li 
        v-for="(track, index) in tracks" 
        :key="track.id"
        class="flex justify-between items-center text-delft-blue"
      >
        <span class="flex-1">
          <span class="mr-2">{{ index + 1 }}.</span>
          {{ track.name }}
        </span>
        <span class="ml-4">{{ formatDuration(track.duration_ms) }}</span>
      </li>
    </ul>
  </div>
</template> 