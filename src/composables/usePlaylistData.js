import { ref } from 'vue';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @typedef {'queued' | 'curious' | 'interested' | 'great' | 'excellent' | 'wonderful'} PlaylistCategory
 * 
 * @typedef {Object} Playlist
 * @property {string} playlistId
 * @property {string} group
 * @property {PlaylistCategory} category
 * @property {number} priority
 * @property {string} userId
 * 
 * @typedef {Object.<string, string[]>} PlaylistsByCategory
 * 
 * @typedef {Object.<string, PlaylistsByCategory>} GroupedPlaylists
 */

const ALL_CATEGORIES = ['queued', 'curious', 'interested', 'great', 'excellent', 'wonderful', 'end'];

/**
 * Creates an empty grouped playlists structure for a specific group
 * @param {string} group - The group name
 * @returns {PlaylistsByCategory}
 */
function createEmptyGroupPlaylists(group) {
  const empty = {};
  ALL_CATEGORIES.forEach(category => {
    empty[category] = [];
  });
  return empty;
}

/**
 * Creates an empty grouped playlists structure with all groups initialized
 * @param {string[]} groups - Array of group names to initialize
 * @returns {GroupedPlaylists}
 */
function createEmptyGroupedPlaylists(groups = []) {
  const empty = {};
  groups.forEach(group => {
    empty[group] = createEmptyGroupPlaylists(group);
  });
  return empty;
}

/**
 * Composable for managing playlist data from Firestore
 * @returns {Object} Playlist data and methods
 */
export function usePlaylistData() {
  const playlists = ref({});
  const loading = ref(true);
  const error = ref(null);

  /**
   * Gets categories that have playlists for a specific group
   * @param {string} group - The group name to check
   * @returns {PlaylistCategory[]} Array of categories that have playlists
   */
  const getAvailableCategories = (group) => {
    console.log(`Getting available categories for group ${group}:`, {
      playlistsValue: playlists.value,
      groupData: playlists.value[group],
      categories: ALL_CATEGORIES.filter(category => 
        playlists.value[group]?.[category]?.length > 0
      )
    });
    
    // Get categories that have playlists
    return ALL_CATEGORIES.filter(category => 
      playlists.value[group]?.[category]?.length > 0
    );
  };

  /**
   * Gets all available groups that have playlists
   * @returns {string[]} Array of group names that have playlists
   */
  const getAvailableGroups = () => {
    return Object.keys(playlists.value).filter(group => {
      const groupPlaylists = playlists.value[group];
      return Object.values(groupPlaylists).some(categoryPlaylists => 
        categoryPlaylists.length > 0
      );
    });
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
      const groups = new Set();

      querySnapshot.forEach((doc) => {
        const playlist = doc.data();
        console.log('Processing playlist:', playlist);
        
        // Use group field if available, fallback to type for backward compatibility
        const group = playlist.group || playlist.type || 'unknown';
        groups.add(group);
        
        if (!grouped[group]) {
          grouped[group] = createEmptyGroupPlaylists(group);
        }
        
        if (!grouped[group][playlist.category]) {
          grouped[group][playlist.category] = [];
        }
        
        grouped[group][playlist.category].push({
          playlistId: playlist.playlistId,
          firebaseId: doc.id, // Include Firebase document ID
          priority: playlist.priority,
          pipelineRole: playlist.pipelineRole || 'transient', // Include pipeline role
          name: playlist.name,
          type: playlist.type,
          group: playlist.group
        });
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
    getAvailableCategories,
    getAvailableGroups
  };
} 