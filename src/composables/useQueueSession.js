import { ref, readonly, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useQueueTrackSelection } from './useQueueTrackSelection';
import { useAlbumMappings } from './useAlbumMappings';
import { getNextTrackUrisForAlbums } from '@utils/queueBatchUtils';
import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { albumIdFromUri, trackIdFromUri } from '@utils/spotify';
import { logPlayer } from '@utils/logger';

const QUEUE_CAP = 10;

const session = ref(null);
let isRefilling = false;
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
  const { updateLastPlayedFromPlaylist } = useUnifiedTrackCache();

  /**
   * @param {Object} payload
   * @param {string} payload.playlistId
   * @param {string} [payload.playlistName]
   * @param {Array<{id: string}>} payload.albumsList
   * @param {Record<string, Record<string, boolean>>} [payload.playlistTrackIds]
   * @param {string[]} [initialUris] - Initial internal queue (one URI per album ahead). Refill to REFILL_TARGET happens on consumption.
   */
  const setSession = (payload, initialUris = []) => {
    const len = Array.isArray(initialUris) ? initialUris.length : 0;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:setSession',message:'setSession called',data:{initialUrisLength:len,lastUri:len>0?initialUris[len-1]:null,secondLastUri:len>1?initialUris[len-2]:null,duplicateAtEnd:len>1&&initialUris[len-1]===initialUris[len-2]},timestamp:Date.now(),hypothesisId:'H1,H2'})}).catch(()=>{});
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
    const lenAtEntry = upcomingUris.value.length;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:refillUpcoming:entry',message:'refillUpcoming entry',data:{lenAtEntry,QUEUE_CAP,isRefilling},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (isRefilling || lenAtEntry >= QUEUE_CAP) return;
    isRefilling = true;
    const s = session.value;
    const track = currentTrack.value;
    if (!s || !track) {
      isRefilling = false;
      return;
    }

    const currentAlbumId = albumIdFromUri(track.albumUri);
    if (!currentAlbumId) {
      isRefilling = false;
      return;
    }

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
      isRefilling = false;
      return;
    }

    try {
      const nextIndex = (albumIndex + 1 + upcomingUris.value.length) % s.albumsList.length;
      const albumToAdd = s.albumsList[nextIndex];
      const selectionOpts = { playlistId: s.playlistId, playlistTrackIds: s.playlistTrackIds };
      const onTrackQueued = async (uri) => {
        await updateLastPlayedFromPlaylist(trackIdFromUri(uri), s.playlistId, s.playlistName, null, null);
      };
      const uris = await getNextTrackUrisForAlbums([albumToAdd], selectionOpts, {
        selectNextTrackUriForAlbum,
        onTrackQueued
      });
      const lenBeforePush = upcomingUris.value.length;
      if (uris.length > 0 && lenBeforePush < QUEUE_CAP) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:refillUpcoming:beforePush',message:'before push',data:{lenBeforePush,uriToAdd:uris[0],nextIndex,albumToAddId:albumToAdd?.id,QUEUE_CAP},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
        // #endregion
        upcomingUris.value.push(uris[0]);
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:refillUpcoming',message:'refill done',data:{added:uris.length,totalAfter:upcomingUris.value.length,currentAlbumId:albumIdFromUri(track?.albumUri)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
    } finally {
      isRefilling = false;
    }
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

        if (upcomingUris.value.length < QUEUE_CAP) {
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
        if (!s || !track) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:trackEndWatch',message:'early return no session or track',data:{hasS:!!s,hasTrack:!!track},timestamp:Date.now(),hypothesisId:'H1,H5'})}).catch(()=>{});
          // #endregion
          return;
        }
        if (!duration.value || duration.value <= 0) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:trackEndWatch',message:'early return no duration',data:{duration:duration.value,trackId:track?.id},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          return;
        }

        const remainingMs = duration.value - position.value;
        if (remainingMs <= 2000) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:trackEndWatch',message:'near end',data:{position:position.value,duration:duration.value,remainingMs,upcomingLen:upcomingUris.value.length},timestamp:Date.now(),hypothesisId:'H-next'})}).catch(()=>{});
          // #endregion
        }
        if (remainingMs > 500) return;

        if (track.id === lastHandledTrackId) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:trackEndWatch',message:'skip already handled',data:{trackId:track.id,lastHandledTrackId},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          return;
        }
        lastHandledTrackId = track.id;

        try {
          await updateLastPlayedFromPlaylist(
            track.id,
            s.playlistId,
            s.playlistName,
            track.name ?? null,
            track.artists?.[0] ?? null
          );
        } catch {
          // continue to advance playback
        }

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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/9d4c2a42-d337-4c5e-a4f5-acade31bf5da',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d13514'},body:JSON.stringify({sessionId:'d13514',location:'useQueueSession.js:playNext',message:'playTrack failed',data:{nextUri,errMessage:err?.message},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
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
