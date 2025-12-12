import { ref } from 'vue';
import { collection, query, where, orderBy, getDocs, getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logPlaylist } from '@utils/logger';

/**
 * @typedef {Object} Playlist
 * @property {string} playlistId
 * @property {string} group
 * @property {string} pipelineRole
 * @property {string} nextStagePlaylistId
 * @property {string} terminationPlaylistId
 * @property {number} pipelinePosition
 * @property {number} totalPositions
 * @property {string} userId
 * 
 * @typedef {Object.<string, Playlist[]>} GroupedPlaylists
 */

/**
 * Derives pipeline order from connection-based structure
 * @param {Array} playlists - Array of playlists in a group
 * @returns {Array} Ordered array of playlists with pipelinePosition assigned
 */
function derivePipelineOrder(playlists) {
  // 1. Create lookup map
  const playlistMap = new Map();
  playlists.forEach(p => playlistMap.set(p.firebaseId, p));
  
  // 2. Find sources, sort by createdAt (oldest first)
  const sources = playlists
    .filter(p => p.pipelineRole === 'source')
    .sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateA - dateB;
    });
  
  // 3. Traverse from each source
  const ordered = [];
  const visited = new Set();
  let position = 0;
  
  function traverse(playlist) {
    if (!playlist || visited.has(playlist.firebaseId)) return;
    
    visited.add(playlist.firebaseId);
    playlist.pipelinePosition = position++;
    ordered.push(playlist);
    
    // If this is a transient with a termination, insert the sink immediately after
    if (playlist.pipelineRole === 'transient' && playlist.terminationPlaylistId) {
      const sink = playlistMap.get(playlist.terminationPlaylistId);
      if (sink && sink.pipelineRole === 'sink' && !visited.has(sink.firebaseId)) {
        visited.add(sink.firebaseId);
        sink.pipelinePosition = position++;
        ordered.push(sink);
      }
    }
    
    // Follow nextStagePlaylistId
    if (playlist.nextStagePlaylistId) {
      const next = playlistMap.get(playlist.nextStagePlaylistId);
      if (next) traverse(next);
    }
  }
  
  sources.forEach(traverse);
  
  // 4. Add orphaned playlists (not reachable from any source) at the end
  const orphaned = playlists.filter(p => !visited.has(p.firebaseId));
  orphaned.forEach(p => {
    // Orphaned playlists get a high position so they appear at the end
    // Use a position that's beyond the normal range (e.g., 1000 + index)
    p.pipelinePosition = 1000 + ordered.length;
    ordered.push(p);
  });
  
  // 5. Reassign sink and terminal positions based on their order among sinks/terminals only
  // This ensures width calculation is based on sink/terminal order, not absolute pipeline position
  const sinksAndTerminals = ordered.filter(p => 
    (p.pipelineRole === 'sink' || p.pipelineRole === 'terminal') && p.pipelinePosition < 1000
  );
  const totalPositions = sinksAndTerminals.length;
  
  // Create a map of sink/terminal firebaseId to their new position
  const sinkTerminalPositionMap = new Map();
  let sinkTerminalPosition = 1;
  sinksAndTerminals.forEach(p => {
    // For width calculation, use 1-based position (1, 2, 3, 4, 5)
    // But store it in a way that works with the width formula
    // Width should be: (position / totalPositions) * 100%
    // So position 1 should give 20% (1/5), position 2 should give 40% (2/5), etc.
    const newPosition = sinkTerminalPosition - 1; // Store as 0-based for consistency
    p.pipelinePosition = newPosition;
    sinkTerminalPositionMap.set(p.firebaseId, newPosition);
    sinkTerminalPosition++;
  });
  
  // 6. Assign the same position to parent transients (transients that terminate to sinks)
  ordered.forEach(p => {
    if (p.pipelineRole === 'transient' && p.terminationPlaylistId && p.pipelinePosition < 1000) {
      const sinkPosition = sinkTerminalPositionMap.get(p.terminationPlaylistId);
      if (sinkPosition !== undefined) {
        p.pipelinePosition = sinkPosition;
      }
    }
  });
  
  // Assign totalPositions to all playlists in the ordered list (including orphaned)
  ordered.forEach(p => {
    p.totalPositions = totalPositions;
  });
  
  return ordered;
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
        where('userId', '==', userId)
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
          deletedAt: playlist.deletedAt,
          hasDeletedAt: 'deletedAt' in playlist
        };
        logPlaylist('Processing playlist:', playlistInfo);
        
        // Skip if deleted (deletedAt exists and is not null)
        // Existing playlists without deletedAt field are considered active
        if (playlist.deletedAt != null) {
          logPlaylist('Skipping deleted playlist:', playlist.playlistId, 'deletedAt:', playlist.deletedAt);
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
          pipelineRole: playlist.pipelineRole || 'transient', // Include pipeline role
          nextStagePlaylistId: playlist.nextStagePlaylistId || null,
          terminationPlaylistId: playlist.terminationPlaylistId || null,
          group: playlist.group,
          createdAt: playlist.createdAt // Include createdAt for sorting groups
        });
      });

      // Order each group using connection-based pipeline ordering
      Object.keys(grouped).forEach(group => {
        grouped[group] = derivePipelineOrder(grouped[group]);
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