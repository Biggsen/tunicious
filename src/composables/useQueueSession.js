import { ref, readonly, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useQueueTrackSelection } from './useQueueTrackSelection';
import { logPlayer } from '@utils/logger';

const session = ref(null);
const isToppingUp = ref(false);
let watchRegistered = false;
let loopAddedForAlbumId = null;

const QUEUE_TOP_UP_THRESHOLD = 2;

function albumIdFromUri(albumUri) {
  if (!albumUri || typeof albumUri !== 'string') return null;
  const parts = albumUri.split(':');
  return parts.length >= 3 ? parts[2] : null;
}

/**
 * Queue session for playlist playback: tracks refill and loop.
 * Session is set when user starts play from a playlist (multi-album);
 * cleared on every play click.
 *
 * Session shape: {
 *   playlistId: string,
 *   playlistName: string,
 *   albumsList: Array<{ id: string, ... }>,
 *   playlistTrackIds: Record<albumId, Record<trackId, boolean>>,
 *   lastAlbumId: string
 * }
 */
export function useQueueSession() {
  const { currentTrack, getQueue, addToQueue } = useSpotifyPlayer();
  const { selectNextTrackUriForAlbum } = useQueueTrackSelection();

  const setSession = (payload) => {
    if (!payload?.playlistId || !payload?.albumsList?.length) {
      session.value = null;
      return;
    }
    const lastAlbum = payload.albumsList[payload.albumsList.length - 1];
    session.value = {
      playlistId: payload.playlistId,
      playlistName: payload.playlistName ?? '',
      albumsList: [...payload.albumsList],
      playlistTrackIds: payload.playlistTrackIds ?? {},
      lastAlbumId: lastAlbum?.id ?? null
    };
  };

  const clearSession = () => {
    session.value = null;
    loopAddedForAlbumId = null;
  };

  const getSession = () => readonly(session);

  if (!watchRegistered) {
    watchRegistered = true;
    watch(
      currentTrack,
      async (newTrack) => {
        if (!newTrack) return;
        const s = session.value;
        if (!s) return;

        const currentAlbumId = albumIdFromUri(newTrack.albumUri);
        if (!currentAlbumId) return;

        const albumIndex = s.albumsList.findIndex((a) => a.id === currentAlbumId);
        if (albumIndex === -1) {
          clearSession();
          return;
        }

        const { queue } = await getQueue();
        const isLastAlbum = albumIndex === s.albumsList.length - 1;
        const queueShort = queue.length <= QUEUE_TOP_UP_THRESHOLD;

        if (!isLastAlbum) {
          loopAddedForAlbumId = null;
        }
        if (isLastAlbum && loopAddedForAlbumId === currentAlbumId) return;
        if (!queueShort && !isLastAlbum) return;

        if (isToppingUp.value) return;
        isToppingUp.value = true;

        try {
          const remainingAlbums = isLastAlbum
            ? [...s.albumsList]
            : s.albumsList.slice(albumIndex + 1);

          const selectionOpts = {
            playlistId: s.playlistId,
            playlistTrackIds: s.playlistTrackIds
          };

          for (const album of remainingAlbums) {
            try {
              const uri = await selectNextTrackUriForAlbum(album, selectionOpts);
              if (uri) await addToQueue(uri);
            } catch (err) {
              logPlayer('Queue top-up failed for album:', album?.id, err);
            }
          }
          if (isLastAlbum) {
            loopAddedForAlbumId = currentAlbumId;
          }
        } finally {
          isToppingUp.value = false;
        }
      },
      { immediate: false }
    );
  }

  return {
    session: readonly(session),
    setSession,
    clearSession,
    getSession
  };
}
