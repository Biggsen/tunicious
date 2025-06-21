import { ref, computed } from 'vue';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { useCurrentUser } from 'vuefire';

export function useLatestMovements() {
  const user = useCurrentUser();
  
  const loading = ref(false);
  const error = ref(null);
  const movements = ref([]);

  /**
   * Fetches recent album movements for the current user
   * @param {number} limitCount - Number of movements to fetch (default: 10)
   * @returns {Promise<Array>} Array of movement objects
   */
  const fetchLatestMovements = async (limitCount = 10) => {
    if (!user.value) {
      console.log('No user found in fetchLatestMovements');
      return [];
    }

    try {
      loading.value = true;
      error.value = null;

      console.log('Fetching latest movements for user:', user.value.uid);

      // Get all albums - simpler approach without nested field queries
      const albumsRef = collection(db, 'albums');
      const querySnapshot = await getDocs(albumsRef);
      
      console.log('Total albums in database:', querySnapshot.size);
      
      const albumMovements = [];

      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        
        // Check if this user has entries for this album
        if (!data.userEntries || !data.userEntries[user.value.uid]) {
          continue;
        }

        console.log('Found user entry for album:', doc.id, data.albumTitle);

        const userEntry = data.userEntries[user.value.uid];
        
        if (!userEntry?.playlistHistory || !Array.isArray(userEntry.playlistHistory)) {
          console.log('No playlist history for album:', doc.id);
          continue;
        }

        console.log('Playlist history for album', doc.id, ':', userEntry.playlistHistory);

        const sortedHistory = [...userEntry.playlistHistory].sort(
          (a, b) => {
            const dateA = a.addedAt?.toDate ? a.addedAt.toDate() : new Date(a.addedAt);
            const dateB = b.addedAt?.toDate ? b.addedAt.toDate() : new Date(b.addedAt);
            return dateB - dateA;
          }
        );

        // Get the most recent movement
        const latestEntry = sortedHistory[0];
        if (!latestEntry) {
          console.log('No latest entry for album:', doc.id);
          continue;
        }
        
        // Check if this was a new addition or a move
        const createdAt = userEntry.createdAt?.toDate ? userEntry.createdAt.toDate() : new Date(userEntry.createdAt);
        const addedAt = latestEntry.addedAt?.toDate ? latestEntry.addedAt.toDate() : new Date(latestEntry.addedAt);
        
        const isNewAddition = Math.abs(createdAt - addedAt) < 60000; // Within 1 minute
        
        // Use updatedAt for sorting movements
        const updatedAt = userEntry.updatedAt?.toDate ? userEntry.updatedAt.toDate() : new Date(userEntry.updatedAt);
        
        console.log('Processing movement for album:', doc.id, {
          isNewAddition,
          createdAt,
          addedAt,
          updatedAt,
          toPlaylist: latestEntry.playlistName
        });
        
        albumMovements.push({
          albumId: doc.id,
          albumTitle: data.albumTitle,
          artistName: data.artistName,
          albumCover: data.albumCover,
          releaseYear: data.releaseYear,
          artistId: data.artistId,
          movementType: isNewAddition ? 'added' : 'moved',
          fromPlaylist: sortedHistory[1]?.playlistName || null,
          toPlaylist: latestEntry.playlistName,
          category: latestEntry.category,
          fromCategory: sortedHistory[1]?.category || null,
          type: latestEntry.type,
          timestamp: addedAt,
          updatedAt: updatedAt
        });
      }

      console.log('Total movements found:', albumMovements.length);

      // Sort by updatedAt (most recent first) and limit
      const sortedMovements = albumMovements
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, limitCount);

      console.log('Sorted and limited movements:', sortedMovements);

      movements.value = sortedMovements;
      return sortedMovements;

    } catch (e) {
      console.error('Error fetching latest movements:', e);
      error.value = 'Failed to fetch latest movements';
      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Helper function to get time ago string
   * @param {Date|string} date - Date to compare
   * @returns {string} Time ago string
   */
  const getTimeAgo = (date) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  /**
   * Formats movement for display
   * @param {Object} movement - Movement object
   * @returns {Object} Formatted movement with display text
   */
  const formatMovement = (movement) => {
    const timeAgo = getTimeAgo(movement.timestamp);
    
    let actionText;
    if (movement.movementType === 'added') {
      actionText = `Added to ${movement.toPlaylist}`;
    } else {
      actionText = movement.fromPlaylist 
        ? `Moved from ${movement.fromPlaylist} to ${movement.toPlaylist}`
        : `Moved to ${movement.toPlaylist}`;
    }

    return {
      ...movement,
      actionText,
      timeAgo,
      displayText: `${movement.albumTitle} by ${movement.artistName} - ${actionText} ${timeAgo}`
    };
  };

  const formattedMovements = computed(() => 
    movements.value.map(formatMovement)
  );

  return {
    movements,
    formattedMovements,
    loading,
    error,
    fetchLatestMovements
  };
} 