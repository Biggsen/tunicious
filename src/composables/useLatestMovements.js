import { ref, computed } from 'vue';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { useCurrentUser } from 'vuefire';
import { logAlbum } from '@utils/logger';
import { resolvePlaylistNames } from '@utils/playlistNameResolver';
import { useUserSpotifyApi } from './useUserSpotifyApi';

export function useLatestMovements() {
  const user = useCurrentUser();
  const { getPlaylist } = useUserSpotifyApi();
  
  const loading = ref(false);
  const error = ref(null);
  const movements = ref([]);

  /**
   * Fetches recent album movements for the current user or friends
   * @param {number} limitCount - Number of movements to fetch (default: 10)
   * @param {Array<string>} friendIds - Optional array of friend user IDs to fetch movements for
   * @returns {Promise<Array>} Array of movement objects
   */
  const fetchLatestMovements = async (limitCount = 10, friendIds = null) => {
    if (!user.value && !friendIds) {
      logAlbum('No user found in fetchLatestMovements');
      return [];
    }

    try {
      loading.value = true;
      error.value = null;

      const targetUserIds = friendIds || [user.value.uid];
      logAlbum('Fetching latest movements for users:', targetUserIds);

      // Get all albums - simpler approach without nested field queries
      const albumsRef = collection(db, 'albums');
      const querySnapshot = await getDocs(albumsRef);
      
      logAlbum('Total albums in database:', querySnapshot.size);
      
      const albumMovements = [];

      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        
        // Check if any of the target users have entries for this album
        let userEntry = null;
        let userId = null;
        
        for (const targetUserId of targetUserIds) {
          if (data.userEntries && data.userEntries[targetUserId]) {
            userEntry = data.userEntries[targetUserId];
            userId = targetUserId;
            break;
          }
        }
        
        if (!userEntry) {
          continue;
        }

        logAlbum('Found user entry for album:', doc.id, data.albumTitle, 'for user:', userId);
        
        if (!userEntry?.playlistHistory || !Array.isArray(userEntry.playlistHistory)) {
          logAlbum('No playlist history for album:', doc.id);
          continue;
        }

        logAlbum('Playlist history for album', doc.id, ':', userEntry.playlistHistory);

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
          logAlbum('No latest entry for album:', doc.id);
          continue;
        }
        
        // Check if this was a new addition or a move
        const createdAt = userEntry.createdAt?.toDate ? userEntry.createdAt.toDate() : new Date(userEntry.createdAt);
        const addedAt = latestEntry.addedAt?.toDate ? latestEntry.addedAt.toDate() : new Date(latestEntry.addedAt);
        
        const isNewAddition = Math.abs(createdAt - addedAt) < 60000; // Within 1 minute
        
        // Use updatedAt for sorting movements
        const updatedAt = userEntry.updatedAt?.toDate ? userEntry.updatedAt.toDate() : new Date(userEntry.updatedAt);
        
        logAlbum('Processing movement for album:', doc.id, {
          isNewAddition,
          createdAt,
          addedAt,
          updatedAt,
          toPlaylistId: latestEntry.playlistId
        });
        
        albumMovements.push({
          albumId: doc.id,
          albumTitle: data.albumTitle,
          artistName: data.artistName,
          albumCover: data.albumCover,
          releaseYear: data.releaseYear,
          artistId: data.artistId,
          movementType: isNewAddition ? 'added' : 'moved',
          fromPlaylistId: sortedHistory[1]?.playlistId || null,
          toPlaylistId: latestEntry.playlistId,
          pipelineRole: latestEntry.pipelineRole || 'transient',
          fromPipelineRole: sortedHistory[1]?.pipelineRole || null,
          type: latestEntry.type,
          timestamp: addedAt,
          updatedAt: updatedAt,
          userId: userId, // Track which user this movement belongs to
          isFriendMovement: friendIds !== null // Flag to indicate if this is a friend's movement
        });
      }

      logAlbum('Total movements found:', albumMovements.length);

      // Collect unique playlist IDs for name resolution
      const playlistIds = new Set();
      albumMovements.forEach(m => {
        if (m.toPlaylistId) playlistIds.add(m.toPlaylistId);
        if (m.fromPlaylistId) playlistIds.add(m.fromPlaylistId);
      });

      // Resolve all playlist names at once
      // For friends' movements, we need to resolve playlists for each friend
      // For now, use the current user's context (playlists are readable by all authenticated users)
      const playlistNames = await resolvePlaylistNames(
        Array.from(playlistIds),
        user.value?.uid || targetUserIds[0],
        getPlaylist
      );

      // Map resolved names back to movements
      albumMovements.forEach(m => {
        m.toPlaylist = playlistNames[m.toPlaylistId] || 'Unknown Playlist';
        m.fromPlaylist = m.fromPlaylistId ? (playlistNames[m.fromPlaylistId] || 'Unknown Playlist') : null;
      });

      // Fetch excluded playlists for each user whose movements we're showing
      // This ensures filtering works for both your own movements and friends viewing your movements
      const excludedPlaylistsByUser = new Map(); // userId -> Set of excluded playlist IDs
      
      // Get unique user IDs from movements
      const uniqueUserIds = new Set(albumMovements.map(m => m.userId).filter(Boolean));
      
      if (uniqueUserIds.size > 0) {
        try {
          const playlistsRef = collection(db, 'playlists');
          
          // Fetch excluded playlists for each user
          for (const userId of uniqueUserIds) {
            const excludedQuery = query(
              playlistsRef,
              where('userId', '==', userId),
              where('excludeFromMovements', '==', true)
            );
            const excludedSnapshot = await getDocs(excludedQuery);
            const excludedIds = new Set();
            excludedSnapshot.forEach((doc) => {
              const playlistData = doc.data();
              if (playlistData.playlistId) {
                excludedIds.add(playlistData.playlistId);
              }
            });
            if (excludedIds.size > 0) {
              excludedPlaylistsByUser.set(userId, excludedIds);
              logAlbum(`Found ${excludedIds.size} excluded playlists for user ${userId}`);
            }
          }
        } catch (err) {
          logAlbum('Error fetching excluded playlists:', err);
          // Continue without filtering if query fails
        }
      }

      // Filter out movements involving excluded playlists based on the movement owner's excluded playlists
      const filteredMovements = albumMovements.filter(m => {
        if (!m.userId) return true; // Keep movements without userId
        
        const userExcludedPlaylists = excludedPlaylistsByUser.get(m.userId);
        if (!userExcludedPlaylists) return true; // No exclusions for this user, keep movement
        
        const toExcluded = m.toPlaylistId && userExcludedPlaylists.has(m.toPlaylistId);
        const fromExcluded = m.fromPlaylistId && userExcludedPlaylists.has(m.fromPlaylistId);
        return !toExcluded && !fromExcluded; // Exclude if either playlist is in user's excluded list
      });

      if (excludedPlaylistsByUser.size > 0) {
        logAlbum('Filtered movements (excluded playlists removed):', filteredMovements.length, 'of', albumMovements.length);
      }

      // Sort by updatedAt (most recent first) and limit
      const sortedMovements = filteredMovements
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, limitCount);

      logAlbum('Sorted and limited movements:', sortedMovements);

      movements.value = sortedMovements;
      return sortedMovements;

    } catch (e) {
      logAlbum('Error fetching latest movements:', e);
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

  /**
   * Fetches recent album movements for friends
   * @param {Array<string>} friendIds - Array of friend user IDs
   * @param {number} limitCount - Number of movements to fetch per friend (default: 10)
   * @returns {Promise<Array>} Array of movement objects from all friends
   */
  const fetchFriendsMovements = async (friendIds, limitCount = 10) => {
    if (!friendIds || friendIds.length === 0) {
      return [];
    }

    try {
      loading.value = true;
      error.value = null;

      logAlbum('Fetching movements for friends:', friendIds);

      // Fetch movements for all friends in parallel
      const allMovements = await fetchLatestMovements(limitCount * friendIds.length, friendIds);

      // Sort all movements by updatedAt and limit to top N
      const sortedMovements = allMovements
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, limitCount);

      logAlbum('Total friends movements found:', sortedMovements.length);

      movements.value = sortedMovements;
      return sortedMovements;

    } catch (e) {
      logAlbum('Error fetching friends movements:', e);
      error.value = 'Failed to fetch friends movements';
      return [];
    } finally {
      loading.value = false;
    }
  };

  const formattedMovements = computed(() => 
    movements.value.map(formatMovement)
  );

  return {
    movements,
    formattedMovements,
    loading,
    error,
    fetchLatestMovements,
    fetchFriendsMovements
  };
} 