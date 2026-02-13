import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import updatesData from '@/data/updates.json';

const STORAGE_KEY = 'lastSeenUpdateId';

export function useUpdatesBadge() {
  const route = useRoute();

  const visibleUpdates = updatesData
    .filter((u) => !u.hidden)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestUpdateId = visibleUpdates[0]?.id;

  const lastSeenUpdateId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const hasSeenLatestUpdate = ref(lastSeenUpdateId === String(latestUpdateId));

  const showUpdatesDot = computed(() => !hasSeenLatestUpdate.value);

  function markAsSeen() {
    if (latestUpdateId == null) return;
    localStorage.setItem(STORAGE_KEY, String(latestUpdateId));
    hasSeenLatestUpdate.value = true;
  }

  watch(
    () => route.path,
    (path) => {
      if (path === '/updates') {
        markAsSeen();
      }
    }
  );

  return { showUpdatesDot };
}
