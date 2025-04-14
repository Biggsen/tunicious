import { ref } from 'vue';
import { useCurrentUser } from 'vuefire';
import { useAlbumsData } from './useAlbumsData';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';

export function usePlaylistMovement() {
  const user = useCurrentUser();
  const { getCurrentPlaylistInfo } = useAlbumsData();
  const loading = ref(false);
  const error = ref(null);

  /**
   * Checks if an album has moved from its original playlist
   * @param {string} albumId - The album ID to check
   * @param {string} originalPlaylistId - The playlist ID to compare against
   * @returns {Promise<boolean>} - True if the album has moved, false otherwise
   */
  const checkIfAlbumMoved = async (albumId, originalPlaylistId) => {
    if (!user.value || !albumId || !originalPlaylistId) {
      return false;
    }

    try {
      loading.value = true;
      error.value = null;

      const currentInfo = await getCurrentPlaylistInfo(albumId);
      if (!currentInfo) {
        return false;
      }

      return currentInfo.playlistId !== originalPlaylistId;
    } catch (err) {
      console.error('Error checking if album moved:', err);
      error.value = err.message || 'Failed to check album movement';
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Updates an album's playlist location
   * @param {string} albumId - The album's Spotify ID
   * @param {Object} playlistData - The target playlist data
   * @returns {Promise<boolean>} - True if update was successful
   */
  const updateAlbumPlaylist = async (albumId, playlistData) => {
    if (!user.value) {
      error.value = 'User must be logged in';
      return false;
    }

    try {
      loading.value = true;
      error.value = null;
      
      // Get the album document reference
      const albumRef = doc(db, 'albums', albumId);
      const albumDoc = await getDoc(albumRef);
      
      if (!albumDoc.exists()) {
        throw new Error('Album not found in database');
      }

      const data = albumDoc.data();
      const userEntry = data.userEntries[user.value.uid];
      
      if (!userEntry || !userEntry.playlistHistory) {
        throw new Error('No user entry found for this album');
      }

      // Update the current playlist entry's removedAt
      const updatedHistory = userEntry.playlistHistory.map(entry => {
        if (!entry.removedAt) {
          return {
            ...entry,
            removedAt: new Date()
          };
        }
        return entry;
      });

      // Add new playlist entry
      updatedHistory.push({
        playlistId: playlistData.playlistId,
        playlistName: playlistData.name,
        category: playlistData.category,
        type: playlistData.type,
        priority: playlistData.priority,
        addedAt: new Date(),
        removedAt: null
      });

      // Update the document
      await updateDoc(albumRef, {
        [`userEntries.${user.value.uid}.playlistHistory`]: updatedHistory,
        [`userEntries.${user.value.uid}.updatedAt`]: serverTimestamp()
      });

      return true;
    } catch (err) {
      console.error('Error updating album playlist:', err);
      error.value = err.message || 'Failed to update playlist location';
      return false;
    } finally {
      loading.value = false;
    }
  };

  return {
    checkIfAlbumMoved,
    updateAlbumPlaylist,
    loading,
    error
  };
} 