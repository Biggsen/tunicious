import { logPlayer } from '@utils/logger';

/**
 * Adds one track per album from the given albums to the queue, using the provided
 * selection and queue functions. Used for initial queue fill (TrackList) and top-up (useQueueSession).
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
