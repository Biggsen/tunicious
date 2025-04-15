import { ref, computed } from 'vue';

/**
 * Composable for handling sorting functionality
 * @param {Array} items - The array of items to sort
 * @param {Object} options - Sorting options
 * @param {string} options.sortKey - The key to sort by
 * @param {string} options.defaultDirection - Default sort direction ('asc' or 'desc')
 * @param {Function} options.sortFn - Custom sort function (optional)
 * @returns {Object} Sorting utilities
 */
export function useSorting(items, options = {}) {
  const {
    sortKey = 'addedAt',
    defaultDirection = 'asc',
    sortFn = null
  } = options;

  // Sort direction state
  const sortDirection = ref(defaultDirection);

  // Default sort function if none provided
  const defaultSortFn = (a, b) => {
    const valueA = a[sortKey];
    const valueB = b[sortKey];
    
    // Handle date strings
    if (typeof valueA === 'string' && valueA.match(/^\d{4}-\d{2}-\d{2}/)) {
      return sortDirection.value === 'desc' 
        ? new Date(valueB) - new Date(valueA)
        : new Date(valueA) - new Date(valueB);
    }
    
    // Handle other types
    if (valueA < valueB) return sortDirection.value === 'desc' ? 1 : -1;
    if (valueA > valueB) return sortDirection.value === 'desc' ? -1 : 1;
    return 0;
  };

  // Use provided sort function or default
  const currentSortFn = sortFn || defaultSortFn;

  // Computed sorted items
  const sortedItems = computed(() => {
    return [...items.value].sort(currentSortFn);
  });

  // Toggle sort direction
  const toggleSort = () => {
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc';
  };

  // Get sort direction label
  const sortDirectionLabel = computed(() => {
    return sortDirection.value === 'desc' ? 'Newest First' : 'Oldest First';
  });

  return {
    sortDirection,
    sortedItems,
    toggleSort,
    sortDirectionLabel
  };
} 