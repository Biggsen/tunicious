import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useQueueSession } from './useQueueSession';
import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { useAlbumMappings } from './useAlbumMappings';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { buildQueue, getRankedTracksForAlbum } from '@utils/queueBatchUtils';
import { trackIdFromUri } from '@utils/spotify';

const QUEUE_SIZE = 10;

/**
 * Composable that encapsulates "play from playlist" flow: clear session, play track,
 * and for multi-album playlists set internal queue + session and playingFrom.
 */
export function usePlaylistPlay() {
  const { playTrack, setPlayingFrom } = useSpotifyPlayer();
  const { clearSession, setSession } = useQueueSession();
  const { updateLastPlayedFromPlaylist, getPlaycountForTrack } = useUnifiedTrackCache();
  const { getPrimaryId } = useAlbumMappings();
  const { getAllAlbumTracks } = useUserSpotifyApi();

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

      try {
        await updateLastPlayedFromPlaylist(
          track?.id ?? trackIdFromUri(trackUri),
          playlistId,
          playlistName ?? '',
          track?.name ?? null,
          track?.artists?.[0] ?? null
        );
      } catch {
        // continue; cache may not have track yet
      }

      const currentPrimaryId = (await getPrimaryId(albumId)) || albumId;
      const ptIds = playlistTrackIds ?? {};
      const rankedTracksPerAlbum = await Promise.all(
        albumsList.map((album) =>
          getRankedTracksForAlbum(
            album.id,
            ptIds[album.id] || {},
            getAllAlbumTracks,
            getPlaycountForTrack
          )
        )
      );
      const startAlbumIndex = albumsList.findIndex(
        (a) => a.id === albumId || a.id === currentPrimaryId
      );
      const currentTrackId = track?.id ?? trackIdFromUri(trackUri);
      const { queueUris, usedCountPerAlbum } = buildQueue(
        rankedTracksPerAlbum,
        startAlbumIndex >= 0 ? startAlbumIndex : 0,
        QUEUE_SIZE,
        currentTrackId
      );

      setSession(
        {
          playlistId,
          playlistName: playlistName ?? '',
          albumsList,
          playlistTrackIds: ptIds
        },
        queueUris,
        usedCountPerAlbum
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
