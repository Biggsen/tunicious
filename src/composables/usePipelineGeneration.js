import { collection, addDoc, doc, writeBatch, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useUserSpotifyApi } from './useUserSpotifyApi';

/**
 * Checks if user already has any playlists in Firestore
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if user has playlists, false otherwise
 */
export async function hasExistingPlaylists(userId) {
  try {
    const playlistsRef = collection(db, 'playlists');
    const q = query(
      playlistsRef,
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    
    // Check if there are any non-deleted playlists
    let hasPlaylists = false;
    querySnapshot.forEach((docSnap) => {
      const playlist = docSnap.data();
      // Skip deleted playlists
      if (playlist.deletedAt == null) {
        hasPlaylists = true;
      }
    });
    
    return hasPlaylists;
  } catch (error) {
    console.error('Error checking for existing playlists:', error);
    // If we can't check, assume no playlists to be safe
    return false;
  }
}

/**
 * Generates complete pipelines for both "new" and "known" artist groups
 * Creates 20 playlists total (10 per group) with proper pipeline connections
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of created playlist data
 */
export async function generateCompletePipelines(userId) {
  const { createPlaylist, makeUserRequest } = useUserSpotifyApi();

  // Define playlist structure for both groups
  const newArtistsPlaylists = [
    { name: 'Queued', role: 'source', group: 'new' },
    { name: 'Curious', role: 'transient', group: 'new' },
    { name: '1 star', role: 'sink', group: 'new' },
    { name: 'Interested', role: 'transient', group: 'new' },
    { name: '2 stars', role: 'sink', group: 'new' },
    { name: 'Good', role: 'transient', group: 'new' },
    { name: '3 stars', role: 'sink', group: 'new' },
    { name: 'Excellent', role: 'transient', group: 'new' },
    { name: '4 stars', role: 'sink', group: 'new' },
    { name: 'Wonderful', role: 'terminal', group: 'new' }
  ];

  const knownArtistsPlaylists = [
    { name: 'Queued', role: 'source', group: 'known' },
    { name: 'Curious', role: 'transient', group: 'known' },
    { name: '1 star', role: 'sink', group: 'known' },
    { name: 'Interested', role: 'transient', group: 'known' },
    { name: '2 stars', role: 'sink', group: 'known' },
    { name: 'Good', role: 'transient', group: 'known' },
    { name: '3 stars', role: 'sink', group: 'known' },
    { name: 'Excellent', role: 'transient', group: 'known' },
    { name: '4 stars', role: 'sink', group: 'known' },
    { name: 'Wonderful', role: 'terminal', group: 'known' }
  ];

  const allPlaylists = [...newArtistsPlaylists, ...knownArtistsPlaylists];
  const createdSpotifyPlaylists = [];
  
  // Phase 1: Create all Spotify playlists (store IDs in memory)
  for (let i = 0; i < allPlaylists.length; i++) {
    const playlist = allPlaylists[i];
    try {
      const displayName = `${playlist.group === 'new' ? 'New' : 'Known'} ${playlist.name}`;
      const description = `${playlist.name} playlist for ${playlist.group} artist pipeline`;
      
      const spotifyPlaylist = await createPlaylist(displayName, description);
      createdSpotifyPlaylists.push({ 
        ...playlist, 
        spotifyId: spotifyPlaylist.id 
      });
    } catch (error) {
      // Rollback: Delete all created Spotify playlists
      for (const created of createdSpotifyPlaylists) {
        try {
          await deleteSpotifyPlaylist(created.spotifyId, makeUserRequest);
        } catch (rollbackError) {
          // Log but continue with other rollbacks
          console.error(`Failed to rollback playlist ${created.spotifyId}:`, rollbackError);
        }
      }
      throw new Error(`Failed to create playlist: ${playlist.name}. All playlists rolled back.`);
    }
  }
  
  // Phase 2: Create all Firestore documents with connections
  // If any Firestore creation fails, rollback all Spotify playlists
  
  // Pass 1: Create all Firestore documents without connections
  // Store Firestore document IDs in a map keyed by "group-name"
  const firestoreIds = {}; // e.g., { 'new-Queued': 'abc123', 'new-Curious': 'def456', ... }
  
  try {
    for (const playlist of createdSpotifyPlaylists) {
      const docRef = await addDoc(collection(db, 'playlists'), {
        playlistId: playlist.spotifyId,
        group: playlist.group,
        pipelineRole: playlist.role,
        userId: userId,
        // Connections will be set in Pass 2
        nextStagePlaylistId: null,
        terminationPlaylistId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Store Firestore document ID using playlistId as key
      firestoreIds[playlist.spotifyId] = docRef.id;
    }
    
    // Pass 2: Update all playlists with connections using stored Firestore IDs
    // Use writeBatch for efficiency (up to 500 operations per batch)
    const batch = writeBatch(db);
    
    // Create a map of playlist name to spotifyId for connection lookups
    const nameToSpotifyId = {};
    createdSpotifyPlaylists.forEach(p => {
      const key = `${p.group}-${p.name}`;
      nameToSpotifyId[key] = p.spotifyId;
    });
    
    // Define connection mappings for each group (using name keys, will map to spotifyId)
    const connections = {
      'new': {
        'Queued': { nextStagePlaylistId: 'new-Curious' },
        'Curious': { nextStagePlaylistId: 'new-Interested', terminationPlaylistId: 'new-1 star' },
        'Interested': { nextStagePlaylistId: 'new-Good', terminationPlaylistId: 'new-2 stars' },
        'Good': { nextStagePlaylistId: 'new-Excellent', terminationPlaylistId: 'new-3 stars' },
        'Excellent': { nextStagePlaylistId: 'new-Wonderful', terminationPlaylistId: 'new-4 stars' }
      },
      'known': {
        'Queued': { nextStagePlaylistId: 'known-Curious' },
        'Curious': { nextStagePlaylistId: 'known-Interested', terminationPlaylistId: 'known-1 star' },
        'Interested': { nextStagePlaylistId: 'known-Good', terminationPlaylistId: 'known-2 stars' },
        'Good': { nextStagePlaylistId: 'known-Excellent', terminationPlaylistId: 'known-3 stars' },
        'Excellent': { nextStagePlaylistId: 'known-Wonderful', terminationPlaylistId: 'known-4 stars' }
      }
    };
    
    // Update each playlist with its connections
    for (const playlist of createdSpotifyPlaylists) {
      const firestoreId = firestoreIds[playlist.spotifyId];
      const playlistConnections = connections[playlist.group]?.[playlist.name];
      
      if (playlistConnections) {
        const updateData = {
          updatedAt: serverTimestamp()
        };
        
        if (playlistConnections.nextStagePlaylistId) {
          // Map connection name key to spotifyId, then to firestoreId
          const nextSpotifyId = nameToSpotifyId[playlistConnections.nextStagePlaylistId];
          if (nextSpotifyId) {
            updateData.nextStagePlaylistId = firestoreIds[nextSpotifyId];
          }
        }
        
        if (playlistConnections.terminationPlaylistId) {
          // Map connection name key to spotifyId, then to firestoreId
          const terminationSpotifyId = nameToSpotifyId[playlistConnections.terminationPlaylistId];
          if (terminationSpotifyId) {
            updateData.terminationPlaylistId = firestoreIds[terminationSpotifyId];
          }
        }
        
        const playlistRef = doc(db, 'playlists', firestoreId);
        batch.update(playlistRef, updateData);
      }
    }
    
    // Commit all connection updates in a single batch
    await batch.commit();
    
  } catch (error) {
    // Rollback: Delete all created Spotify playlists
    for (const created of createdSpotifyPlaylists) {
      try {
        await deleteSpotifyPlaylist(created.spotifyId, makeUserRequest);
      } catch (rollbackError) {
        // Log but continue with other rollbacks
        console.error(`Failed to rollback playlist ${created.spotifyId}:`, rollbackError);
      }
    }
    throw new Error(`Failed to create Firestore documents: ${error.message}. All Spotify playlists rolled back.`);
  }
  
  return createdSpotifyPlaylists;
}

/**
 * Deletes a Spotify playlist by unfollowing it
 * Note: Spotify doesn't have a direct delete endpoint, so we unfollow the playlist
 * @param {string} playlistId - Spotify playlist ID
 * @param {Function} makeUserRequest - Function to make authenticated Spotify API requests
 */
async function deleteSpotifyPlaylist(playlistId, makeUserRequest) {
  // Spotify doesn't have a direct delete endpoint, but we can unfollow it
  // which effectively removes it from the user's playlists
  try {
    await makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
      method: 'DELETE'
    });
  } catch (error) {
    // If unfollow fails, log the error but don't throw
    // This is a best-effort rollback - we've already logged the error
    console.warn(`Could not unfollow playlist ${playlistId}:`, error);
  }
}

