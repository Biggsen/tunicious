import { ref, readonly, watch } from 'vue';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import { useAlbumMappings } from './useAlbumMappings';
import { useUnifiedTrackCache } from './useUnifiedTrackCache';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { getRankedTracksForAlbum } from '@utils/queueBatchUtils';
import { albumIdFromUri } from '@utils/spotify';
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
  const { getPrimaryId } = useAlbumMappings();
  const { updateLastPlayedFromPlaylist, getPlaycountForTrack } = useUnifiedTrackCache();
  const { getAllAlbumTracks } = useUserSpotifyApi();

  /**
   * @param {Object} payload
   * @param {string} payload.playlistId
   * @param {string} [payload.playlistName]
   * @param {Array<{id: string}>} payload.albumsList
   * @param {Record<string, Record<string, boolean>>} [payload.playlistTrackIds]
   * @param {string[]} [initialUris] - Initial queue from round-robin builder
   * @param {number[]} [usedCountPerAlbum] - Per-album pick index for refill round-robin
   */
  const setSession = (payload, initialUris = [], usedCountPerAlbum = []) => {
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
      lastAlbumId: lastAlbum?.id ?? null,
      usedCountPerAlbum: Array.isArray(usedCountPerAlbum) ? [...usedCountPerAlbum] : []
    };
    upcomingUris.value = Array.isArray(initialUris) ? [...initialUris] : [];
    lastHandledTrackId = null;
  };

  const clearSession = () => {
    session.value = null;
    upcomingUris.value = [];
    lastHandledTrackId = null;
    setPlayingFrom(null);
  };

  const getSession = () => readonly(session);

  async function refillUpcoming() {
    if (isRefilling || upcomingUris.value.length >= QUEUE_CAP) return;
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
      const nextIndex = (albumIndex + 1) % s.albumsList.length;
      const albumToAdd = s.albumsList[nextIndex];
      const usedCountPerAlbum = s.usedCountPerAlbum ?? [];
      const pickIndex = usedCountPerAlbum[nextIndex] ?? 0;

      const ranked = await getRankedTracksForAlbum(
        albumToAdd.id,
        s.playlistTrackIds[albumToAdd.id] ?? {},
        getAllAlbumTracks,
        getPlaycountForTrack
      );
      if (pickIndex < ranked.length && upcomingUris.value.length < QUEUE_CAP) {
        const nextUri = ranked[pickIndex].uri;
        upcomingUris.value.push(nextUri);
        if (usedCountPerAlbum.length > nextIndex) {
          usedCountPerAlbum[nextIndex] = pickIndex + 1;
        }
        try {
          await updateLastPlayedFromPlaylist(
            ranked[pickIndex].id,
            s.playlistId,
            s.playlistName,
            null,
            null
          );
        } catch {
          // continue
        }
      }
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
        if (!s || !track) return;
        if (!duration.value || duration.value <= 0) return;

        const remainingMs = duration.value - position.value;
        if (remainingMs > 500) return;

        if (track.id === lastHandledTrackId) return;
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
