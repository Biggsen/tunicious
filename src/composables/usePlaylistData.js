import { ref } from 'vue';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @typedef {Object} Playlist
 * @property {string} playlistId
 * @property {string} group
 * @property {string} pipelineRole
 * @property {number} priority
 * @property {string} userId
 * 
 * @typedef {Object.<string, Playlist[]>} GroupedPlaylists
 */

/**
 * Composable for managing playlist data from Firestore
 * @returns {Object} Playlist data and methods
 */
export function usePlaylistData() {
  const playlists = ref({});
  const loading = ref(true);
  const error = ref(null);

  /**
   * Gets all available groups that have playlists
   * @returns {string[]} Array of group names that have playlists
   */
  const getAvailableGroups = () => {
    return Object.keys(playlists.value).filter(group => 
      playlists.value[group]?.length > 0
    );
  };

  /**
   * Fetches and groups playlists for a specific user
   * @param {string} userId - The user's ID
   * @returns {Promise<void>}
   */
  const fetchUserPlaylists = async (userId) => {
    loading.value = true;
    error.value = null;

    try {
      const playlistsRef = collection(db, 'playlists');
      const q = query(
        playlistsRef,
        where('userId', '==', userId),
        orderBy('priority')
      );

      console.log('Fetching playlists for user:', userId);
      const querySnapshot = await getDocs(q);
      console.log('Query snapshot size:', querySnapshot.size);
      
      const grouped = {};

      querySnapshot.forEach((doc) => {
        const playlist = doc.data();
        console.log('Processing playlist:', playlist);
        
        // Use group field if available, fallback to type for backward compatibility
        const group = playlist.group || playlist.type || 'unknown';
        
        if (!grouped[group]) {
          grouped[group] = [];
        }
        
        grouped[group].push({
          playlistId: playlist.playlistId,
          firebaseId: doc.id, // Include Firebase document ID
          priority: playlist.priority,
          pipelineRole: playlist.pipelineRole || 'transient', // Include pipeline role
          name: playlist.name,
          type: playlist.type,
          group: playlist.group
        });
      });

      // Sort each group by priority
      Object.keys(grouped).forEach(group => {
        grouped[group].sort((a, b) => a.priority - b.priority);
      });

      console.log('Final grouped playlists:', grouped);
      playlists.value = grouped;
    } catch (e) {
      console.error('Error fetching playlists:', e);
      error.value = 'Failed to fetch playlists';
    } finally {
      loading.value = false;
    }
  };

  return {
    playlists,
    loading,
    error,
    fetchUserPlaylists,
    getAvailableGroups
  };
} 