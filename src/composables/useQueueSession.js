import { ref, readonly, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useQueueTrackSelection } from './useQueueTrackSelection';
import { useAlbumMappings } from './useAlbumMappings';
import { getNextTrackUrisForAlbums } from '@utils/queueBatchUtils';
import { albumIdFromUri } from '@utils/spotify';
import { logPlayer } from '@utils/logger';

const REFILL_TARGET = 10;

const session = ref(null);
const upcomingUris = ref([]);
let lastHandledTrackId = null;
let watchRegistered = false;

/**
 * Queue session for playlist playback: internal queue with refill and loop.
 * Session is set when user starts play from a playlist (multi-album);
 * cleared when user plays something else or session is cleared.
 * Session shape: see QueueSession in @/types/queueSession.js
 */
export function useQueueSession() {
  const { currentTrack, position, duration, playTrack, setPlayingFrom } = useSpotifyPlayer();
  const { selectNextTrackUriForAlbum } = useQueueTrackSelection();
  const { getPrimaryId } = useAlbumMappings();

  /**
   * @param {Object} payload
   * @param {string} payload.playlistId
   * @param {string} [payload.playlistName]
   * @param {Array<{id: string}>} payload.albumsList
   * @param {Record<string, Record<string, boolean>>} [payload.playlistTrackIds]
   * @param {string[]} [initialUris] - Initial internal queue (one URI per album ahead). Refill to REFILL_TARGET happens on consumption.
   */
  const setSession = (payload, initialUris = []) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:setSession',message:'setSession called',data:{hasPayload:!!payload,playlistId:payload?.playlistId,albumsListLength:payload?.albumsList?.length,initialUrisLength:Array.isArray(initialUris)?initialUris.length:'not-array'},timestamp:Date.now(),hypothesisId:'H1,H5'})}).catch(()=>{});
    // #endregion
    if (!payload?.playlistId || !payload?.albumsList?.length) {
      session.value = null;
      upcomingUris.value = [];
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
    upcomingUris.value = Array.isArray(initialUris) ? [...initialUris] : [];
    lastHandledTrackId = null;
  };

  const clearSession = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:clearSession',message:'clearSession called',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    session.value = null;
    upcomingUris.value = [];
    lastHandledTrackId = null;
    setPlayingFrom(null);
  };

  const getSession = () => readonly(session);

  async function refillUpcoming() {
    const s = session.value;
    const track = currentTrack.value;
    if (!s || !track) return;

    const currentAlbumId = albumIdFromUri(track.albumUri);
    if (!currentAlbumId) return;

    const albumIndex = s.albumsList.findIndex((a) => a.id === currentAlbumId);
    if (albumIndex === -1) return;

    const isLastAlbum = albumIndex === s.albumsList.length - 1;
    const remainingAlbums = isLastAlbum ? [...s.albumsList] : s.albumsList.slice(albumIndex + 1);
    const selectionOpts = { playlistId: s.playlistId, playlistTrackIds: s.playlistTrackIds };
    const uris = await getNextTrackUrisForAlbums(remainingAlbums, selectionOpts, {
      selectNextTrackUriForAlbum
    });
    upcomingUris.value.push(...uris);
  }

  if (!watchRegistered) {
    watchRegistered = true;

    watch(
      currentTrack,
      () => {
        lastHandledTrackId = null;
      },
      { flush: 'sync' }
    );

    watch(
      currentTrack,
      async (newTrack) => {
        if (!newTrack) return;
        const s = session.value;
        if (!s) return;

        const currentAlbumId = albumIdFromUri(newTrack.albumUri);
        if (!currentAlbumId) return;

        const currentPrimary = (await getPrimaryId(currentAlbumId)) || currentAlbumId;
        let albumIndex = s.albumsList.findIndex(
          (a) => a.id === currentAlbumId || a.id === currentPrimary
        );
        if (albumIndex === -1) {
          for (let i = 0; i < s.albumsList.length; i++) {
            const primaryA = (await getPrimaryId(s.albumsList[i].id)) || s.albumsList[i].id;
            if (primaryA === currentAlbumId || primaryA === currentPrimary) {
              albumIndex = i;
              break;
            }
          }
        }
        if (albumIndex === -1) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:currentTrackWatch',message:'album not in session, clearing',data:{currentAlbumId,albumUri:newTrack?.albumUri,sessionAlbumIds:s.albumsList.slice(0,3).map(a=>a.id)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          clearSession();
          return;
        }

        if (upcomingUris.value.length < REFILL_TARGET) {
          refillUpcoming();
        }
      },
      { immediate: false }
    );

    watch(
      [position, duration, currentTrack],
      async () => {
        const s = session.value;
        const track = currentTrack.value;
        if (!s || !track || !duration.value || duration.value <= 0) return;

        const remainingMs = duration.value - position.value;
        if (remainingMs <= 2000) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:trackEndWatch',message:'near end',data:{position:position.value,duration:duration.value,remainingMs,upcomingLen:upcomingUris.value.length},timestamp:Date.now(),hypothesisId:'H-next'})}).catch(()=>{});
          // #endregion
        }
        if (remainingMs > 500) return;

        if (track.id === lastHandledTrackId) return;
        lastHandledTrackId = track.id;

        if (upcomingUris.value.length === 0) {
          await refillUpcoming();
        }
        if (upcomingUris.value.length === 0) return;

        const nextUri = upcomingUris.value.shift();
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:playNext',message:'playing next',data:{nextUri,upcomingAfter:upcomingUris.value.length},timestamp:Date.now(),hypothesisId:'H-next'})}).catch(()=>{});
        // #endregion
        try {
          await playTrack(nextUri, null);
        } catch (err) {
          logPlayer('Play next (internal queue) failed:', err);
          lastHandledTrackId = null;
        }
      },
      { immediate: false }
    );
  }

  return {
    session: readonly(session),
    upcomingUris: readonly(upcomingUris),
    setSession,
    clearSession,
    getSession
  };
}
