import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { logPlayer } from '@utils/logger';

/**
 * Options for selecting the next track per album (playlist context for filtering).
 * @typedef {Object} QueueSelectionOptions
 * @property {string} [playlistId]
 * @property {Record<string, Record<string, boolean>>} [playlistTrackIds] - albumId -> trackId -> true
 */

/**
 * Composable for selecting the next track to queue per album (min playcount, track order, playlist membership).
 * Used by usePlaylistPlay for initial queue fill and by useQueueSession for top-up/loop.
 */
export function useQueueTrackSelection() {
  const { getPlaycountForTrack, getLastPlayedTimestampForTrack } = useUnifiedTrackCache();
  const { getAllAlbumTracks } = useUserSpotifyApi();

  /**
   * Select the next track URI to queue from the given album.
   * @param {Object} album - Album with at least .id
   * @param {QueueSelectionOptions} [options]
   * @returns {Promise<string|null>} Track URI or null
   */
  const selectNextTrackUriForAlbum = async (album, options = {}) => {
    const {
      playlistId = '',
      playlistTrackIds = {},
      excludeTrackId = null,
      excludeForAlbumId = null,
      excludeForAlbumPrimaryId = null,
      excludeTrackIds = null,
      excludeUris = null
    } = options;
    if (!album?.id) return null;

    try {
      const nextAlbumTracks = await getAllAlbumTracks(album.id);
      if (nextAlbumTracks.length === 0) return null;

      const tracksWithPlaycounts = nextAlbumTracks.map((track) => {
        const playcount = getPlaycountForTrack(track.id);
        if (playcount === undefined) {
          throw new Error(`Track ${track.id} not found in cache`);
        }
        return {
          ...track,
          playcount: playcount ?? 0,
          lastPlayedFromTimestamp: getLastPlayedTimestampForTrack(track.id),
          uri: track.uri || `spotify:track:${track.id}`
        };
      });

      const playlistTracksForAlbum = playlistTrackIds[album.id] || {};
      let tracksInPlaylist = tracksWithPlaycounts.filter((track) => {
        if (!playlistId || Object.keys(playlistTracksForAlbum).length === 0) {
          return true;
        }
        return !!playlistTracksForAlbum[track.id];
      });

      const isExcludedAlbum =
        excludeTrackId &&
        (album.id === excludeForAlbumId || album.id === excludeForAlbumPrimaryId);
      if (isExcludedAlbum) {
        tracksInPlaylist = tracksInPlaylist.filter((t) => t.id !== excludeTrackId);
      }
      if (excludeTrackIds && excludeTrackIds.size > 0) {
        tracksInPlaylist = tracksInPlaylist.filter((t) => !excludeTrackIds.has(t.id));
      }
      if (excludeUris && excludeUris.size > 0) {
        tracksInPlaylist = tracksInPlaylist.filter((t) => {
          const u = t.uri || `spotify:track:${t.id}`;
          return !excludeUris.has(u);
        });
      }

      if (tracksInPlaylist.length === 0) return null;

      const minPlaycount = Math.min(...tracksInPlaylist.map((t) => t.playcount));
      const tracksWithMinPlaycount = tracksInPlaylist
        .filter((t) => t.playcount === minPlaycount)
        .sort((a, b) => {
          const numA = a.track_number || 0;
          const numB = b.track_number || 0;
          if (numA !== numB) return numA - numB;
          const tsA = a.lastPlayedFromTimestamp || 0;
          const tsB = b.lastPlayedFromTimestamp || 0;
          return tsA - tsB;
        });

      const selectedTrack = tracksWithMinPlaycount[0];
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
