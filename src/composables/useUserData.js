import { ref, onMounted } from 'vue';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { logUser } from '@utils/logger';

export function useUserData() {
  const user = useCurrentUser();
  const userData = ref(null);
  const loading = ref(true);
  const error = ref(null);
  const { checkConnectionStatus } = useUserSpotifyApi();

  async function fetchUserData(uid) {
    try {
      loading.value = true;
      error.value = null;
      logUser('Fetching user data for UID:', uid);
      const userDoc = await getDoc(doc(db, "users", uid));
      logUser('User document exists:', userDoc.exists());
      if (userDoc.exists()) {
        userData.value = userDoc.data();
        logUser('User data fetched:', userData.value);
        
        // Check Spotify connection status if user has Spotify connected
        if (userData.value.spotifyConnected) {
          try {
            logUser('Checking Spotify connection status...');
            const connectionStatus = await checkConnectionStatus();
            logUser('Spotify connection status:', connectionStatus);
            
            // If connection failed and we couldn't recover, update the user data
            if (!connectionStatus.connected) {
              logUser('Spotify connection lost, updating user data');
              await setDoc(doc(db, 'users', uid), {
                spotifyConnected: false,
                updatedAt: serverTimestamp()
              }, { merge: true });
              
              // Update local userData to reflect the change
              userData.value.spotifyConnected = false;
            }
          } catch (connectionError) {
            logUser('Error checking Spotify connection:', connectionError);
            // Don't fail the entire user data fetch for connection check errors
          }
        }
      } else {
        logUser('No user document found for UID:', uid);
        userData.value = null;
      }
    } catch (e) {
      logUser("Error fetching user data:", e);
      error.value = "Failed to fetch user data.";
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    logUser('useUserData mounted, current user:', user.value);
    if (user.value) {
      fetchUserData(user.value.uid);
    } else {
      logUser('No user found in useUserData mounted');
      loading.value = false;
    }
  });

  async function clearLastFmAuth() {
    if (!user.value) {
      throw new Error('No authenticated user');
    }

    try {
      await setDoc(doc(db, 'users', user.value.uid), {
        lastFmSessionKey: null,
        lastFmAuthenticated: false,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Refresh user data to reflect the changes
      await fetchUserData(user.value.uid);
    } catch (error) {
      logUser('Error clearing Last.fm auth:', error);
      throw error;
    }
  }

  return {
    user,
    userData,
    loading,
    error,
    fetchUserData,
    clearLastFmAuth
  };
} 