import { ref, onMounted } from 'vue';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function useUserData() {
  const user = useCurrentUser();
  const userData = ref(null);
  const loading = ref(true);
  const error = ref(null);

  async function fetchUserData(uid) {
    try {
      loading.value = true;
      error.value = null;
      console.log('Fetching user data for UID:', uid);
      const userDoc = await getDoc(doc(db, "users", uid));
      console.log('User document exists:', userDoc.exists());
      if (userDoc.exists()) {
        userData.value = userDoc.data();
        console.log('User data fetched:', userData.value);
      } else {
        console.log('No user document found for UID:', uid);
        userData.value = null;
      }
    } catch (e) {
      console.error("Error fetching user data:", e);
      error.value = "Failed to fetch user data.";
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    console.log('useUserData mounted, current user:', user.value);
    if (user.value) {
      fetchUserData(user.value.uid);
    } else {
      console.log('No user found in useUserData mounted');
      loading.value = false;
    }
  });

  return {
    user,
    userData,
    loading,
    error,
    fetchUserData
  };
} 