import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useQueueSession } from './useQueueSession';
import { useQueueTrackSelection } from './useQueueTrackSelection';
import { addAlbumBatchToQueue } from '@utils/queueBatchUtils';

/**
 * Albums from currentAlbumIndex+1 to end. Returns [] if not a valid playlist-with-albums context.
 *
 * @param {Array<{id: string}>} albumsList
 * @param {string} currentAlbumId
 * @returns {Array<{id: string}>}
 */
function findRemainingAlbums(albumsList, currentAlbumId) {
  if (!albumsList?.length || !currentAlbumId) return [];
  const currentIndex = albumsList.findIndex((a) => a.id === currentAlbumId);
  if (currentIndex === -1 || currentIndex === albumsList.length - 1) return [];
  return albumsList.slice(currentIndex + 1);
}

/**
 * Composable that encapsulates "play from playlist" flow: clear session, play track,
 * optionally fill queue with one track per remaining album and set session.
 */
export function usePlaylistPlay() {
  const { playTrack, addToQueue } = useSpotifyPlayer();
  const { clearSession, setSession } = useQueueSession();
  const { selectNextTrackUriForAlbum } = useQueueTrackSelection();

  /**
   * Play a track and, when in a multi-album playlist, fill queue and set session for refill/loop.
   *
   * @param {Object} track - { id, uri? }
   * @param {Object} [playlistContext] - When present and has playlistId/albumsList/albumId, runs initial queue fill and setSession
   * @param {string} [playlistContext.playlistId]
   * @param {string} [playlistContext.playlistName]
   * @param {Array<{id: string}>} [playlistContext.albumsList]
   * @param {Record<string, Record<string, boolean>>} [playlistContext.playlistTrackIds]
   * @param {string} [playlistContext.albumId] - Current list's album ID (used to compute remaining albums)
   * @param {string} [playlistContext.albumTitle] - Album name for Spotify context when type is album
   */
  const playFromPlaylist = async (track, playlistContext = {}) => {
    clearSession();

    const trackUri = track?.uri || `spotify:track:${track?.id}`;
    let context = null;
    if (playlistContext.playlistId) {
      context = {
        type: 'playlist',
        id: playlistContext.playlistId,
        name: playlistContext.playlistName || 'Unknown Playlist'
      };
    } else if (playlistContext.albumId) {
      context = {
        type: 'album',
        id: playlistContext.albumId,
        name: playlistContext.albumTitle || 'Unknown Album'
      };
    }

    await playTrack(trackUri, context);

    const { playlistId, playlistName, albumsList, playlistTrackIds, albumId } = playlistContext;
    if (playlistId && albumsList?.length > 0 && albumId) {
      const remainingAlbums = findRemainingAlbums(albumsList, albumId);
      const selectionOpts = { playlistId, playlistTrackIds: playlistTrackIds ?? {} };

      await addAlbumBatchToQueue(remainingAlbums, selectionOpts, {
        selectNextTrackUriForAlbum,
        addToQueue
      });

      setSession({
        playlistId,
        playlistName: playlistName ?? '',
        albumsList,
        playlistTrackIds: playlistTrackIds ?? {}
      });
    }
  };

  return { playFromPlaylist };
}
