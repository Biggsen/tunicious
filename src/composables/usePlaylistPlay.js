import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useQueueSession } from './useQueueSession';
import { useQueueTrackSelection } from './useQueueTrackSelection';
import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { getNextTrackUrisForAlbums } from '@utils/queueBatchUtils';
import { trackIdFromUri } from '@utils/spotify';

const REFILL_TARGET = 10;

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
 * Build initial internal queue URIs (one per album) and refill to REFILL_TARGET by looping if needed.
 *
 * @param {Array<{id: string}>} remainingAlbums
 * @param {Array<{id: string}>} fullAlbumsList
 * @param {Object} selectionOpts
 * @param {Object} deps
 * @returns {Promise<string[]>}
 */
async function buildInitialUris(remainingAlbums, fullAlbumsList, selectionOpts, deps) {
  const uris = await getNextTrackUrisForAlbums(remainingAlbums, selectionOpts, deps);
  while (uris.length < REFILL_TARGET && fullAlbumsList?.length > 0) {
    const batch = await getNextTrackUrisForAlbums(fullAlbumsList, selectionOpts, deps);
    if (batch.length === 0) break;
    uris.push(...batch);
  }
  const result = uris.slice(0, REFILL_TARGET);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'usePlaylistPlay.js:buildInitialUris',message:'buildInitialUris return',data:{urisLengthBeforeSlice:uris.length,resultLength:result.length,REFILL_TARGET,lastUri:result[result.length-1],secondLastUri:result.length>1?result[result.length-2]:null,duplicateAtEnd:result.length>1&&result[result.length-1]===result[result.length-2]},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  return result;
}

/**
 * Composable that encapsulates "play from playlist" flow: clear session, play track,
 * and for multi-album playlists set internal queue + session and playingFrom.
 */
export function usePlaylistPlay() {
  const { playTrack, setPlayingFrom } = useSpotifyPlayer();
  const { clearSession, setSession } = useQueueSession();
  const { selectNextTrackUriForAlbum } = useQueueTrackSelection();
  const { updateLastPlayedFromPlaylist } = useUnifiedTrackCache();

  /**
   * Play a track. For multi-album playlist: uses internal queue (no Spotify context), sets session and playingFrom.
   * For album-only: uses Spotify context_uri for the album; no session.
   *
   * @param {Object} track - { id, uri? }
   * @param {Object} [playlistContext] - When present and has playlistId/albumsList/albumId, uses internal queue and setSession
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
    const { playlistId, playlistName, albumsList, playlistTrackIds, albumId, albumTitle } = playlistContext;

    const isMultiAlbumPlaylist = playlistId && albumsList?.length > 0 && albumId;

    if (isMultiAlbumPlaylist) {
      await playTrack(trackUri, null);

      const remainingAlbums = findRemainingAlbums(albumsList, albumId);
      const selectionOpts = { playlistId, playlistTrackIds: playlistTrackIds ?? {} };
      const onTrackQueued = async (uri) => {
        await updateLastPlayedFromPlaylist(trackIdFromUri(uri), playlistId, playlistName ?? '', null, null);
      };
      const initialUris = await buildInitialUris(remainingAlbums, albumsList, selectionOpts, {
        selectNextTrackUriForAlbum,
        onTrackQueued
      });

      setSession(
        {
          playlistId,
          playlistName: playlistName ?? '',
          albumsList,
          playlistTrackIds: playlistTrackIds ?? {}
        },
        initialUris
      );
      setPlayingFrom({ type: 'playlist', id: playlistId, name: playlistName || 'Unknown Playlist' });
      return;
    }

    let context = null;
    if (playlistId) {
      context = { type: 'playlist', id: playlistId, name: playlistName || 'Unknown Playlist' };
    } else if (albumId) {
      context = { type: 'album', id: albumId, name: albumTitle || 'Unknown Album' };
    }
    await playTrack(trackUri, context);
  };

  return { playFromPlaylist };
}
