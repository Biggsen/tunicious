import { computed } from 'vue';
import { useUserData } from './useUserData';

export function useAdmin() {
  const { userData } = useUserData();
  
  const isAdmin = computed(() => {
    return userData.value?.isAdmin === true;
  });

  return {
    isAdmin
  };
}

