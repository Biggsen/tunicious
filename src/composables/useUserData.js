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
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        userData.value = userDoc.data();
      } else {
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
    if (user.value) {
      fetchUserData(user.value.uid);
    } else {
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