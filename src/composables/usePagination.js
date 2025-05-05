import { ref } from 'vue';

export function usePagination(itemsPerPage = 20) {
  const currentPage = ref(1);
  const itemsPerPageRef = ref(itemsPerPage);

  const paginatedItems = (items) => {
    const start = (currentPage.value - 1) * itemsPerPageRef.value;
    const end = start + itemsPerPageRef.value;
    return items.slice(start, end);
  };

  const totalPages = (totalItems) => 
    Math.ceil(totalItems / itemsPerPageRef.value);

  const showPagination = (totalItems) => 
    totalItems > itemsPerPageRef.value;

  const nextPage = (totalPages) => {
    if (currentPage.value < totalPages) {
      currentPage.value++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const previousPage = () => {
    if (currentPage.value > 1) {
      currentPage.value--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const resetPagination = () => {
    currentPage.value = 1;
  };

  return {
    currentPage,
    itemsPerPage: itemsPerPageRef,
    paginatedItems,
    totalPages,
    showPagination,
    nextPage,
    previousPage,
    resetPagination
  };
} 