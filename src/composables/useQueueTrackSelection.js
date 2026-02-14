import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { logPlayer } from '@utils/logger';

/**
 * Fetches all tracks from an album (handles Spotify pagination).
 */
async function fetchAllAlbumTracks(getAlbumTracks, albumId) {
  let allTracks = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    try {
      const response = await getAlbumTracks(albumId, limit, offset);
      if (response?.items?.length > 0) {
        allTracks = [...allTracks, ...response.items];
        if (response.items.length < limit) break;
        offset += limit;
      } else {
        break;
      }
    } catch (error) {
      logPlayer(`Failed to fetch tracks for album ${albumId} at offset ${offset}:`, error);
      break;
    }
  }

  return allTracks;
}

/**
 * Composable for selecting the next track to queue per album (min playcount, track order, playlist membership).
 * Used by TrackList for initial queue fill and by useQueueSession for top-up/loop.
 */
export function useQueueTrackSelection() {
  const { getPlaycountForTrack } = useUnifiedTrackCache();
  const { getAlbumTracks } = useUserSpotifyApi();

  /**
   * Select the next track URI to queue from the given album.
   * @param {Object} album - Album with at least .id
   * @param {Object} options - { playlistId?, playlistTrackIds? }
   * @returns {Promise<string|null>} Track URI or null
   */
  const selectNextTrackUriForAlbum = async (album, { playlistId = '', playlistTrackIds = {} } = {}) => {
    if (!album?.id) return null;

    try {
      const nextAlbumTracks = await fetchAllAlbumTracks(getAlbumTracks, album.id);
      if (nextAlbumTracks.length === 0) return null;

      const tracksWithPlaycounts = nextAlbumTracks.map((track) => {
        const playcount = getPlaycountForTrack(track.id);
        if (playcount === undefined) {
          throw new Error(`Track ${track.id} not found in cache`);
        }
        return {
          ...track,
          playcount: playcount ?? 0,
          uri: track.uri || `spotify:track:${track.id}`
        };
      });

      const playlistTracksForAlbum = playlistTrackIds[album.id] || {};
      const tracksInPlaylist = tracksWithPlaycounts.filter((track) => {
        if (!playlistId || Object.keys(playlistTracksForAlbum).length === 0) {
          return true;
        }
        return !!playlistTracksForAlbum[track.id];
      });

      if (tracksInPlaylist.length === 0) return null;

      const minPlaycount = Math.min(...tracksInPlaylist.map((t) => t.playcount));
      const tracksWithMinPlaycount = tracksInPlaylist
        .filter((t) => t.playcount === minPlaycount)
        .sort((a, b) => a.track_number - b.track_number);

      const first3Tracks = tracksWithMinPlaycount.slice(0, 3);
      const selectedTrack = first3Tracks[0];
      return selectedTrack ? selectedTrack.uri : null;
    } catch (error) {
      logPlayer('Error selecting next track to queue:', error);
      return null;
    }
  };

  return {
    selectNextTrackUriForAlbum
  };
}
