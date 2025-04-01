import { ref } from 'vue';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @typedef {'known' | 'new'} PlaylistType
 * @typedef {'queued' | 'curious' | 'interested' | 'great' | 'excellent' | 'wonderful'} PlaylistCategory
 * 
 * @typedef {Object} Playlist
 * @property {string} playlistId
 * @property {PlaylistType} type
 * @property {PlaylistCategory} category
 * @property {number} priority
 * @property {string} userId
 * 
 * @typedef {Object.<string, string[]>} PlaylistsByCategory
 * 
 * @typedef {Object} GroupedPlaylists
 * @property {PlaylistsByCategory} new
 * @property {PlaylistsByCategory} known
 */

const ALL_CATEGORIES = ['queued', 'curious', 'interested', 'great', 'excellent', 'wonderful', 'end'];

/**
 * Creates an empty grouped playlists structure with all categories initialized
 * @returns {GroupedPlaylists}
 */
function createEmptyGroupedPlaylists() {
  const empty = { new: {}, known: {} };
  ALL_CATEGORIES.forEach(category => {
    empty.new[category] = [];
    empty.known[category] = [];
  });
  return empty;
}

/**
 * Composable for managing playlist data from Firestore
 * @returns {Object} Playlist data and methods
 */
export function usePlaylistData() {
  const playlists = ref(createEmptyGroupedPlaylists());
  const loading = ref(true);
  const error = ref(null);

  /**
   * Gets categories that have playlists for a specific type
   * @param {PlaylistType} type - The playlist type to check
   * @returns {PlaylistCategory[]} Array of categories that have playlists
   */
  const getAvailableCategories = (type) => {
    console.log(`Getting available categories for type ${type}:`, {
      playlistsValue: playlists.value,
      typeData: playlists.value[type],
      categories: ALL_CATEGORIES.filter(category => 
        playlists.value[type][category]?.length > 0
      )
    });
    
    // Get categories that have playlists
    return ALL_CATEGORIES.filter(category => 
      playlists.value[type][category]?.length > 0
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
      
      const grouped = createEmptyGroupedPlaylists();

      querySnapshot.forEach((doc) => {
        const playlist = doc.data();
        console.log('Processing playlist:', playlist);
        
        if (!grouped[playlist.type][playlist.category]) {
          grouped[playlist.type][playlist.category] = [];
        }
        grouped[playlist.type][playlist.category].push({
          playlistId: playlist.playlistId,
          priority: playlist.priority
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
    getAvailableCategories
  };
} 