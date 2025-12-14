import { ref, computed } from 'vue';
import updatesData from '@/data/updates.json';

export function useUpdates() {
  const updates = ref(updatesData);

  // Filter out hidden updates and sort by date (newest first)
  const visibleUpdates = computed(() => {
    return updates.value
      .filter(update => !update.hidden)
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA; // Descending order (newest first)
      });
  });

  // Format date for display (e.g., "November 20, 2025")
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return {
    updates,
    visibleUpdates,
    formatDate
  };
}

