/**
 * Shared type for queue session (playlist playback with refill/loop).
 * Set when user starts play from a playlist (multi-album); cleared on every play click.
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
