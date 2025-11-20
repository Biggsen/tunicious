import { ref } from 'vue';
import { collection, query, where, orderBy, getDocs, getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logPlaylist } from '@utils/logger';

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
   * Gets all available groups that have playlists, sorted by earliest createdAt
   * @returns {string[]} Array of group names that have playlists, sorted by creation date
   */
  const getAvailableGroups = () => {
    const groupsWithPlaylists = Object.keys(playlists.value).filter(group => 
      playlists.value[group]?.length > 0
    );
    
    // Sort groups by the earliest createdAt date in each group
    return groupsWithPlaylists.sort((groupA, groupB) => {
      const playlistsA = playlists.value[groupA] || [];
      const playlistsB = playlists.value[groupB] || [];
      
      // Find earliest createdAt in each group
      const earliestA = playlistsA.reduce((earliest, playlist) => {
        if (!playlist.createdAt) return earliest;
        const date = playlist.createdAt?.toDate ? playlist.createdAt.toDate() : new Date(playlist.createdAt);
        return !earliest || date < earliest ? date : earliest;
      }, null);
      
      const earliestB = playlistsB.reduce((earliest, playlist) => {
        if (!playlist.createdAt) return earliest;
        const date = playlist.createdAt?.toDate ? playlist.createdAt.toDate() : new Date(playlist.createdAt);
        return !earliest || date < earliest ? date : earliest;
      }, null);
      
      // If one group has no dates, put it at the end
      if (!earliestA && !earliestB) return 0;
      if (!earliestA) return 1;
      if (!earliestB) return -1;
      
      // Sort by earliest date (oldest first)
      return earliestA - earliestB;
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

      logPlaylist('Fetching playlists for user:', userId);
      const querySnapshot = await getDocs(q);
      logPlaylist('Query snapshot size:', querySnapshot.size);
      logPlaylist('Query snapshot docs:', querySnapshot.docs.map(d => ({ id: d.id, data: d.data() })));
      
      const grouped = {};
      let skippedCount = 0;
      let processedCount = 0;

      querySnapshot.forEach((docSnap) => {
        const playlist = docSnap.data();
        const playlistInfo = {
          id: docSnap.id,
          playlistId: playlist.playlistId,
          name: playlist.name,
          deletedAt: playlist.deletedAt,
          hasDeletedAt: 'deletedAt' in playlist
        };
        logPlaylist('Processing playlist:', playlistInfo);
        
        // Skip if deleted (deletedAt exists and is not null)
        // Existing playlists without deletedAt field are considered active
        if (playlist.deletedAt != null) {
          logPlaylist('Skipping deleted playlist:', playlist.name, 'deletedAt:', playlist.deletedAt);
          skippedCount++;
          return;
        }
        
        processedCount++;
        
        // Use group field (required for all playlists)
        const group = playlist.group || 'unknown';
        
        if (!grouped[group]) {
          grouped[group] = [];
        }
        
        grouped[group].push({
          playlistId: playlist.playlistId,
          firebaseId: docSnap.id, // Include Firebase document ID
          priority: playlist.priority,
          pipelineRole: playlist.pipelineRole || 'transient', // Include pipeline role
          name: playlist.name,
          group: playlist.group,
          createdAt: playlist.createdAt // Include createdAt for sorting groups
        });
      });

      // Sort each group by priority
      Object.keys(grouped).forEach(group => {
        grouped[group].sort((a, b) => a.priority - b.priority);
      });

      logPlaylist('Final grouped playlists:', grouped);
      logPlaylist(`Summary: ${processedCount} processed, ${skippedCount} skipped, ${Object.keys(grouped).length} groups`);
      playlists.value = grouped;
    } catch (e) {
      logPlaylist('Error fetching playlists:', e);
      logPlaylist('Error details:', {
        message: e.message,
        code: e.code,
        stack: e.stack
      });
      error.value = e.message || 'Failed to fetch playlists';
      console.error('Playlist fetch error:', e);
    } finally {
      loading.value = false;
    }
  };

  /**
   * Soft deletes a playlist (albums collection remains unchanged as it's an archive)
   * @param {string} playlistFirebaseId - The Firebase document ID of the playlist
   * @returns {Promise<boolean>} Success status
   */
  const deletePlaylist = async (playlistFirebaseId) => {
    loading.value = true;
    error.value = null;

    try {
      // Get the playlist document
      const playlistRef = doc(db, 'playlists', playlistFirebaseId);
      const playlistSnap = await getDoc(playlistRef);
      
      if (!playlistSnap.exists()) {
        throw new Error('Playlist not found');
      }

      // Soft delete the playlist
      await updateDoc(playlistRef, {
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      logPlaylist(`Playlist ${playlistFirebaseId} soft deleted`);

      return true;
    } catch (e) {
      logPlaylist('Error deleting playlist:', e);
      error.value = 'Failed to delete playlist';
      return false;
    } finally {
      loading.value = false;
    }
  };

  return {
    playlists,
    loading,
    error,
    fetchUserPlaylists,
    getAvailableGroups,
    deletePlaylist
  };
} 