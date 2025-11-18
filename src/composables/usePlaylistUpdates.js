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
            updatedState[playlistData.group][existingIndex] = updatedPlaylist;
          } else {
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

    return updatedState;
  };

  return {
    refreshSpecificPlaylists
  };
}

