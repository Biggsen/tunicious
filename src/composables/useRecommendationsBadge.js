import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useCurrentUser } from 'vuefire';
import { useAlbumRecommendations } from './useAlbumRecommendations';

const STORAGE_KEY = 'recommendationsLastSeenCount';

export function useRecommendationsBadge() {
  const route = useRoute();
  const user = useCurrentUser();
  const { getPendingRecommendationsCount } = useAlbumRecommendations();

  const pendingCount = ref(0);
  const lastSeenCount = ref(
    typeof localStorage !== 'undefined' ? parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) : 0
  );

  const showRecommendationsDot = computed(() => pendingCount.value > lastSeenCount.value);

  async function refreshPendingCount() {
    if (!user.value) {
      pendingCount.value = 0;
      return;
    }
    try {
      pendingCount.value = await getPendingRecommendationsCount();
    } catch (_) {
      pendingCount.value = 0;
    }
  }

  function markRecommendationsSeen() {
    lastSeenCount.value = pendingCount.value;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(pendingCount.value));
    }
  }

  onMounted(() => {
    refreshPendingCount().then(() => {
      if (route.path === '/friends') {
        markRecommendationsSeen();
      }
    });
  });

  watch(
    () => route.path,
    (path) => {
      refreshPendingCount().then(() => {
        if (path === '/friends') {
          markRecommendationsSeen();
        }
      });
    }
  );

  watch(user, (u) => {
    if (u) {
      refreshPendingCount();
    } else {
      pendingCount.value = 0;
    }
  });

  return { showRecommendationsDot, refreshPendingCount };
}
