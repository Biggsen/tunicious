/**
 * Shared type for queue session (playlist playback with refill/loop).
 * Set when user starts play from a playlist (multi-album); cleared when user plays something else.
 *
 * Playback uses an internal queue of track URIs (one per album, same selection rules as before).
 * When the current track ends, the next URI is taken from the internal queue and played with
 * no Spotify context; the queue is refilled to keep 10 URIs ahead. At end of album list,
 * refill uses the full albumsList (loop).
 *
 * @typedef {Object} QueueSession
 * @property {string} playlistId
 * @property {string} playlistName
 * @property {Array<{id: string}>} albumsList
 * @property {Record<string, Record<string, boolean>>} [playlistTrackIds]
 * @property {string|null} lastAlbumId
 */

/** @type {QueueSession} */
export const QueueSession = null;
