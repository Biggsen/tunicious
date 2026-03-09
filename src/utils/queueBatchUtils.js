import { logPlayer } from '@utils/logger';

/**
 * Round-robin queue builder: one track per album per pass, each album contributes its next
 * least-played track (playCount ASC, trackOrder ASC). No global sort, no randomness.
 *
 * @param {Array<Array<{ id: string, uri: string }>>} rankedTracksPerAlbum - Pre-sorted per album: playCount ASC, then trackOrder ASC
 * @param {number} startAlbumIndex - Album index of the currently playing track (its rank is consumed first)
 * @param {number} queueSize - Target number of tracks in the queue
 * @param {string|null} currentTrackId - ID of the currently playing track; seeds usedCount so it is not queued
 * @returns {{ queueUris: string[], usedCountPerAlbum: number[] }}
 */
export function buildQueue(rankedTracksPerAlbum, startAlbumIndex, queueSize, currentTrackId) {
  const numAlbums = rankedTracksPerAlbum.length;
  const usedCountPerAlbum = new Array(numAlbums).fill(0);

  if (currentTrackId != null && numAlbums > 0 && startAlbumIndex >= 0 && startAlbumIndex < numAlbums) {
    const ranked = rankedTracksPerAlbum[startAlbumIndex] || [];
    const idx = ranked.findIndex((t) => t.id === currentTrackId);
    if (idx >= 0) {
      usedCountPerAlbum[startAlbumIndex] = idx + 1;
    }
  }

  const queueUris = [];
  let albumIndex = (startAlbumIndex + 1) % numAlbums;

  while (queueUris.length < queueSize && numAlbums > 0) {
    const rankedTracks = rankedTracksPerAlbum[albumIndex] || [];
    const pickIndex = usedCountPerAlbum[albumIndex];

    if (pickIndex < rankedTracks.length) {
      queueUris.push(rankedTracks[pickIndex].uri);
      usedCountPerAlbum[albumIndex] += 1;
    }

    albumIndex = (albumIndex + 1) % numAlbums;

    const allExhausted = rankedTracksPerAlbum.every(
      (tracks, i) => usedCountPerAlbum[i] >= (tracks?.length ?? 0)
    );
    if (allExhausted) break;
  }

  return { queueUris, usedCountPerAlbum };
}

/**
 * Builds the ranked track list for one album: playlist tracks sorted by playCount ASC, then trackOrder ASC.
 * Used by the round-robin queue builder.
 *
 * @param {string} albumId
 * @param {Record<string, boolean>} playlistTrackIdsForAlbum - trackId -> true for tracks in playlist (empty = all tracks)
 * @param {Function} getAllAlbumTracks - (albumId) => Promise<Array<{ id, uri, track_number }>>
 * @param {Function} getPlaycountForTrack - (trackId) => number | undefined
 * @returns {Promise<Array<{ id: string, uri: string }>>}
 */
export async function getRankedTracksForAlbum(
  albumId,
  playlistTrackIdsForAlbum,
  getAllAlbumTracks,
  getPlaycountForTrack
) {
  const raw = await getAllAlbumTracks(albumId);
  if (!raw?.length) return [];

  const withMeta = raw.map((t) => ({
    id: t.id,
    uri: t.uri || `spotify:track:${t.id}`,
    playCount: getPlaycountForTrack(t.id) ?? 0,
    trackOrder: t.track_number ?? 0
  }));

  let list = withMeta;
  if (playlistTrackIdsForAlbum && Object.keys(playlistTrackIdsForAlbum).length > 0) {
    list = withMeta.filter((t) => !!playlistTrackIdsForAlbum[t.id]);
  }

  list.sort((a, b) => {
    if (a.playCount !== b.playCount) return a.playCount - b.playCount;
    return a.trackOrder - b.trackOrder;
  });

  return list.map((t) => ({ id: t.id, uri: t.uri }));
}

/**
 * Returns one track URI per album in order, using the provided selection function.
 * Same selection logic as addAlbumBatchToQueue. Retained for callers that need URIs without
 * using Spotify's queue (e.g. internal queue builders or future features).
 *
 * @param {Array<{id: string}>} albums - Albums to get one track URI each for
 * @param {{ playlistId: string, playlistTrackIds: Record<string, Record<string, boolean>> }} selectionOpts - playlistId and playlistTrackIds
 * @param {Object} deps
 * @param {Function} deps.selectNextTrackUriForAlbum - (album, selectionOpts) => Promise<string|null>
 * @param {Function} [deps.onTrackQueued] - (uri, album) => Promise<void> - called after each track is queued so cache can mark it "just played" for forward-thinking selection
 * @returns {Promise<string[]>} Track URIs in album order (skips albums that yield no URI)
 */
export async function getNextTrackUrisForAlbums(albums, selectionOpts, { selectNextTrackUriForAlbum, onTrackQueued }) {
  const uris = [];
  for (const album of albums) {
    try {
      const uri = await selectNextTrackUriForAlbum(album, selectionOpts);
      if (uri) {
        uris.push(uri);
        if (onTrackQueued) await onTrackQueued(uri, album);
      }
    } catch (err) {
      logPlayer('Queue batch failed for album:', album?.id, err);
    }
  }
  return uris;
}

/**
 * Adds one track per album from the given albums to Spotify's queue via the provided
 * selection and addToQueue functions. Retained for callers that use Spotify's queue
 * (e.g. TrackList initial fill or future features); playlist playback now uses internal queue (buildQueue).
 *
 * @param {Array<{id: string}>} albums - Remaining albums to add one track each for
 * @param {{ playlistId: string, playlistTrackIds: Record<string, Record<string, boolean>> }} selectionOpts - playlistId and playlistTrackIds
 * @param {Object} deps
 * @param {Function} deps.selectNextTrackUriForAlbum - (album, selectionOpts) => Promise<string|null>
 * @param {Function} deps.addToQueue - (uri) => Promise<void>
 */
export async function addAlbumBatchToQueue(albums, selectionOpts, { selectNextTrackUriForAlbum, addToQueue }) {
  for (const album of albums) {
    try {
      const uri = await selectNextTrackUriForAlbum(album, selectionOpts);
      if (uri) await addToQueue(uri);
    } catch (err) {
      logPlayer('Queue batch failed for album:', album?.id, err);
    }
  }
}
