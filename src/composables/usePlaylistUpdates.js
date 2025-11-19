import { ref } from 'vue';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { usePlaylistData } from './usePlaylistData';
import { getCache, setCache, updatePlaylistInCache } from '@utils/cache';
import { logPlaylist } from '@utils/logger';

/**
 * Composable for managing targeted playlist updates
 * Allows refreshing specific playlists without reloading everything
 */
export function usePlaylistUpdates() {
  const { getPlaylist } = useUserSpotifyApi();
  const { playlists: userPlaylists } = usePlaylistData();

  /**
   * Refresh specific playlists from Spotify and update cache
   * @param {string[]} spotifyPlaylistIds - Array of Spotify playlist IDs to refresh
   * @param {Object} currentPlaylistsState - Current playlists state object (grouped by type)
   * @param {string} cacheKey - Cache key for playlist summaries
   * @returns {Promise<Object>} Updated playlists state object
   */
  const refreshSpecificPlaylists = async (spotifyPlaylistIds, currentPlaylistsState, cacheKey) => {
    if (!spotifyPlaylistIds || spotifyPlaylistIds.length === 0) {
      return currentPlaylistsState || {};
    }

    logPlaylist(`Refreshing specific playlists:`, spotifyPlaylistIds);

    const updatedState = currentPlaylistsState ? { ...currentPlaylistsState } : {};
    
    try {
      // Find the Firebase data for these playlists
      const playlistsToRefresh = [];
      for (const group of Object.keys(userPlaylists.value)) {
        const groupPlaylists = userPlaylists.value[group] || [];
        for (const playlistData of groupPlaylists) {
          if (spotifyPlaylistIds.includes(playlistData.playlistId)) {
            playlistsToRefresh.push({ ...playlistData, group });
          }
        }
      }
      
      logPlaylist(`Found ${playlistsToRefresh.length} playlists in userPlaylists.value (looking for ${spotifyPlaylistIds.length})`);
      
      // If not all playlists found in userPlaylists, also check the cache state
      if (playlistsToRefresh.length < spotifyPlaylistIds.length && currentPlaylistsState) {
        const missingIds = spotifyPlaylistIds.filter(id => !playlistsToRefresh.find(p => p.playlistId === id));
        logPlaylist(`Not all playlists found in userPlaylists.value. Checking cache state for:`, missingIds);
        
        // Search for missing playlists in cache state
        for (const group of Object.keys(currentPlaylistsState)) {
          const groupPlaylists = currentPlaylistsState[group] || [];
          for (const cachedPlaylist of groupPlaylists) {
            if (missingIds.includes(cachedPlaylist.id)) {
              // Try to find Firebase data for this playlist
              let firebaseData = null;
              for (const fbGroup of Object.keys(userPlaylists.value)) {
                const fbPlaylists = userPlaylists.value[fbGroup] || [];
                firebaseData = fbPlaylists.find(p => p.playlistId === cachedPlaylist.id);
                if (firebaseData) break;
              }
              
              // Use Firebase data if found, otherwise use cache data
              playlistsToRefresh.push({
                playlistId: cachedPlaylist.id,
                firebaseId: firebaseData?.firebaseId || cachedPlaylist.firebaseId,
                priority: firebaseData?.priority || cachedPlaylist.priority || 0,
                pipelineRole: firebaseData?.pipelineRole || cachedPlaylist.pipelineRole || 'transient',
                group: group
              });
              
              logPlaylist(`Found playlist ${cachedPlaylist.id} in cache state (group: ${group})`);
            }
          }
        }
        
        const stillMissing = spotifyPlaylistIds.filter(id => !playlistsToRefresh.find(p => p.playlistId === id));
        if (stillMissing.length > 0) {
          logPlaylist(`WARNING: Still missing playlists after checking cache:`, stillMissing);
        }
      }
      
      // Refresh each playlist from Spotify
      for (const playlistData of playlistsToRefresh) {
        try {
          const spotifyPlaylist = await getPlaylist(playlistData.playlistId);
          
          const updatedPlaylist = {
            id: spotifyPlaylist.id,
            firebaseId: playlistData.firebaseId,
            name: spotifyPlaylist.name,
            images: spotifyPlaylist.images,
            tracks: { total: spotifyPlaylist.tracks.total },
            priority: playlistData.priority,
            pipelineRole: playlistData.pipelineRole || 'transient'
          };
          
          // Update in state
          if (!updatedState[playlistData.group]) {
            updatedState[playlistData.group] = [];
          }
          
          const existingIndex = updatedState[playlistData.group].findIndex(
            p => p.id === playlistData.playlistId || p.firebaseId === playlistData.firebaseId
          );
          
          if (existingIndex !== -1) {
            logPlaylist(`Updating existing playlist in state: ${playlistData.playlistId} (group: ${playlistData.group}, index: ${existingIndex})`);
            updatedState[playlistData.group][existingIndex] = updatedPlaylist;
          } else {
            logPlaylist(`Adding new playlist to state: ${playlistData.playlistId} (group: ${playlistData.group})`);
            updatedState[playlistData.group].push(updatedPlaylist);
          }
          
          // Re-sort by priority
          updatedState[playlistData.group].sort((a, b) => a.priority - b.priority);
          
          // Update cache if cacheKey provided
          if (cacheKey) {
            await updatePlaylistInCache(cacheKey, playlistData.playlistId, updatedPlaylist);
          }
          
          logPlaylist(`Refreshed playlist ${playlistData.playlistId} (${updatedPlaylist.tracks.total} tracks)`);
        } catch (error) {
          logPlaylist(`Failed to refresh playlist ${playlistData.playlistId}:`, error);
        }
      }
    } catch (error) {
      logPlaylist('Error refreshing specific playlists:', error);
    }

    logPlaylist(`Returning updated state with ${Object.keys(updatedState).length} groups`);
    return updatedState;
  };

  return {
    refreshSpecificPlaylists
  };
}

