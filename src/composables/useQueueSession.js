import { ref, readonly, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useQueueTrackSelection } from './useQueueTrackSelection';
import { addAlbumBatchToQueue } from '@utils/queueBatchUtils';
import { albumIdFromUri } from '@utils/spotify';
import { logPlayer } from '@utils/logger';

const session = ref(null);
const isToppingUp = ref(false);
let watchRegistered = false;
let loopAddedForAlbumId = null;

const QUEUE_TOP_UP_THRESHOLD = 2;

/**
 * Queue session for playlist playback: tracks refill and loop.
 * Session is set when user starts play from a playlist (multi-album);
 * cleared on every play click.
 * Session shape: see QueueSession in @/types/queueSession.js
 */
export function useQueueSession() {
  const { currentTrack, getQueue, addToQueue } = useSpotifyPlayer();
  const { selectNextTrackUriForAlbum } = useQueueTrackSelection();

  /**
   * @param {Object} payload
   * @param {string} payload.playlistId
   * @param {string} [payload.playlistName]
   * @param {Array<{id: string}>} payload.albumsList
   * @param {Record<string, Record<string, boolean>>} [payload.playlistTrackIds]
   */
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

          await addAlbumBatchToQueue(remainingAlbums, selectionOpts, {
            selectNextTrackUriForAlbum,
            addToQueue
          });
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
