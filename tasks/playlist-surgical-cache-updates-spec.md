# Playlist Surgical Cache Updates Spec

## Status: Pending

## Overview

When a user adds, moves, or removes an album from a playlist, the app today often triggers a **full unified track cache invalidation** for that playlist (by removing the playlist from the cache and forcing a rebuild on next load). The data needed to update the cache is already available at the time of the operation. This spec defines **surgical** cache updates for add/move/remove so we only update what changed and avoid unnecessary full rebuilds.

**Scope**: Add album to playlist, move album, remove album, and batch “add to DB” in PlaylistSingle. Playlist Management is out of scope (see `playlist-management-pipeline-awareness-spec.md`).

## Background

### Unified track cache shape (relevant parts)

- **`cache.playlists[playlistId]`**: `{ albums: { [albumId]: { trackIds, addedAt } }, lastUpdated, playlistName }`
- **`cache.albums[albumId]`**: `{ trackIds, lastUpdated, albumTitle, artistName }`
- **`cache.tracks[trackId]`**: includes `playlistIds[]`, `albumIds[]`, and track metadata

### Current behaviour

- **Move**: PlaylistSingle already calls `moveAlbumBetweenPlaylists()` (surgical). Then it calls `handleClearCache()`, which **deletes `cache.playlists[id]`** and saves, forcing a full rebuild next time the playlist is loaded with tracklists.
- **Remove**: PlaylistSingle does Spotify + Firebase remove, then `handleClearCache()` → same full invalidation. There is no surgical “remove album from playlist” in the unified cache.
- **Add (AddAlbumToPlaylistView)**: Adds to Spotify + Firebase, clears `playlist_summaries_*` and `playlist_*_albumsWithDates`, dispatches `playlist-albums-updated`. Does **not** update the unified track cache with the new album.
- **Batch add to DB (PlaylistSingle)**: Only calls `addAlbumToCollection` per album (Firebase). Does **not** change Spotify playlist contents. After 2s it calls `handleClearCache()`, which nukes the playlist from the unified cache unnecessarily.

### Where `handleClearCache()` is called (PlaylistSingle)

| Location   | Trigger                    | Should nuke unified cache? |
|-----------|----------------------------|----------------------------|
| ~1605     | After remove album         | No (after surgical remove) |
| ~1773     | After move back (undo)     | No (after surgical move)   |
| ~2004     | After move to other playlist | No (after surgical move) |
| ~2176     | After batch add to DB      | No (playlist contents unchanged) |
| ~2589     | Manual “Reload” button     | Yes (user explicitly wants full refresh) |

## Goals

1. **Move**: Keep using `moveAlbumBetweenPlaylists()`. After move, **do not** remove the playlist from the unified cache; only clear album-list and pagination caches so the UI refetches the list.
2. **Remove**: Add a surgical **removeAlbumFromPlaylistInCache(playlistId, albumId, userId)** in the unified track cache. After remove, call it and **do not** nuke the playlist from the cache.
3. **Add (to playlist)**: Add a surgical **addAlbumToPlaylistInCache(playlistId, albumId, trackIds, addedAt, userId)** (or equivalent) so that when an album is added via AddAlbumToPlaylistView, the unified cache is updated in place. Continue clearing album-list/summary caches and dispatching events as today.
4. **Batch add to DB**: Remove the `handleClearCache()` call (or replace with a light clear that does **not** remove the playlist from the unified cache). Optionally clear only `albumDbData_*` for the albums that were just added.
5. **Manual Reload**: The explicit “Reload” button should continue to perform a full clear (including removing the playlist from the unified cache) so users can force a full refresh when needed.

## Implementation Plan

### Phase 1: Avoid nuking unified cache after surgical operations

**1.1 Refactor `handleClearCache()` (PlaylistSingle)**

- Add an optional parameter, e.g. `options = { nukeUnifiedCache: true }`.
- When `nukeUnifiedCache` is `false`:
  - Still clear: `albumIdListCacheKey`, pagination caches (`playlist_*_page_*_*_*`), and optionally `albumDbData_*` / `albumRootData_*` for current page albums.
  - **Do not** delete `cache.playlists[id]` or call `saveUnifiedTrackCache` for that removal.
- When `nukeUnifiedCache` is `true` (default): keep current behaviour (including removing the playlist from the unified cache and clearing local state so the view reloads).

**1.2 Call sites**

- After **move back** (~1773) and **move to other playlist** (~2004): call `handleClearCache({ nukeUnifiedCache: false })` (or equivalent). Ensure the view still refetches the album list (e.g. by clearing the album list cache key and triggering a reload of the list, without wiping the unified cache).
- After **remove album** (~1605): once surgical remove in cache exists (Phase 2), call `handleClearCache({ nukeUnifiedCache: false })`.
- After **batch add to DB** (~2176): do **not** call `handleClearCache()` at all; or call a new helper that only clears `albumDbData_*` (and optionally `albumRootData_*`) for the `missingAlbums` that were just added, and does not clear the playlist’s album list or unified cache.
- **Manual Reload** button (~2589): call `handleClearCache()` with default (or `nukeUnifiedCache: true`) so full refresh behaviour is unchanged.

**1.3 Reload after light clear**

- When we call `handleClearCache({ nukeUnifiedCache: false })`, the view must still refresh the album list and counts. Ensure that clearing `albumIdListCacheKey` (and any other list keys) plus setting `cacheCleared.value = true` (or equivalent) still triggers `loadPlaylistPage()` or whatever refetches the list and updates the UI. Adjust if the current flow depends on the full clear to trigger a reload.

### Phase 2: Surgical remove in unified cache

**2.1 New function in `unifiedTrackCache.js`**

- **`removeAlbumFromPlaylistInCache(playlistId, albumId, userId)`**
  - Requires cache loaded for `userId` (caller must ensure `loadUnifiedTrackCache` has been called).
  - If `!cache.playlists[playlistId]?.albums[albumId]`, return (no-op).
  - Get `trackIds` from `cache.playlists[playlistId].albums[albumId]`.
  - Delete `cache.playlists[playlistId].albums[albumId]`.
  - For each `trackId` in `trackIds`: if `cache.tracks[trackId]` exists, remove `playlistId` from `track.playlistIds`. If a track’s `playlistIds` becomes empty, consider whether to remove the track from global indexes (match existing behaviour for “track in no playlists” if any).
  - Call `saveUnifiedTrackCache(userId)`.
  - Export the function and use it from the composable if needed.

**2.2 PlaylistSingle remove flow**

- After successful Spotify remove and Firebase `removeAlbumFromPlaylist` (useAlbumsData):
  - Ensure unified cache is loaded, then call `removeAlbumFromPlaylistInCache(id.value, album.id, user.value.uid)`.
  - Then call `handleClearCache({ nukeUnifiedCache: false })` (or equivalent light clear) so the list and UI refresh without nuking the unified cache.

### Phase 3: Surgical add in unified cache

**3.1 New function in `unifiedTrackCache.js`**

- **`addAlbumToPlaylistInCache(playlistId, albumId, trackIds, addedAt, userId, options?)`**
  - **trackIds**: array of Spotify track IDs (strings).
  - **addedAt**: ISO string (e.g. from Spotify or `new Date().toISOString()`).
  - Requires cache loaded for `userId`.
  - Ensure `cache.playlists[playlistId]` exists (create with `albums: {}, lastUpdated, playlistName: ''` if not).
  - Set `cache.playlists[playlistId].albums[albumId] = { trackIds: [...trackIds], addedAt }`.
  - For each `trackId` in `trackIds`: if `cache.tracks[trackId]` exists, add `playlistId` to `track.playlistIds` if not already present; if the track does not exist in cache, the caller may need to have already populated it via `addAlbumTracks` or we only update playlist→album and track→playlistIds for existing tracks (specify desired behaviour: e.g. “add only if track already in cache” vs “ensure track/album exist”).
  - Update `cache.playlists[playlistId].lastUpdated`.
  - Call `saveUnifiedTrackCache(userId)`.
  - Export and use from composable/views as needed.

**3.2 AddAlbumToPlaylistView**

- After successful `addAlbumToPlaylist` (Spotify) and `addAlbumToCollection` (Firebase):
  - Fetch the album’s track list (e.g. via existing Spotify API: get album tracks for `selectedAlbum.value.id`).
  - Ensure unified cache is loaded for the user, then call `addAlbumToPlaylistInCache(playlistId, albumId, trackIds, addedAt, userId)`.
  - If the album/tracks are not yet in the cache, either: (a) call existing `addAlbumTracks(albumId, tracks, albumData, userId)` first so tracks and album exist, then add the album to the playlist in cache, or (b) extend `addAlbumToPlaylistInCache` to accept track metadata and create tracks/album if missing. Prefer (a) for reuse.
  - Continue clearing `playlist_summaries_*`, `playlist_*_albumsWithDates`, and dispatching `playlist-albums-updated` as today.

### Phase 4: Batch add to DB

- In PlaylistSingle, in the batch “add to database” completion path (the `setTimeout` that runs ~2s after success):
  - **Remove** the call to `handleClearCache()`.
  - Optionally: clear only the `albumDbData_${albumId}_${userId}` (and `albumRootData_${albumId}` if used) for each album that was just added in `missingAlbums`, so that when the user opens those albums they get fresh DB data. Do not clear the playlist’s album list cache or the unified track cache.

## Files to Touch (summary)

| File | Changes |
|------|--------|
| `src/utils/unifiedTrackCache.js` | Add `removeAlbumFromPlaylistInCache`, add `addAlbumToPlaylistInCache` (or equivalent name). Export both. |
| `src/views/playlists/PlaylistSingle.vue` | Refactor `handleClearCache(options)`. After move (both call sites), call with `nukeUnifiedCache: false`. After remove, call `removeAlbumFromPlaylistInCache` then `handleClearCache({ nukeUnifiedCache: false })`. Remove `handleClearCache()` from batch add-to-DB completion. Keep full clear for manual Reload. |
| `src/views/playlists/AddAlbumToPlaylistView.vue` | After add success, fetch album tracks, ensure cache loaded, call `addAlbumToPlaylistInCache` (and `addAlbumTracks` if needed). Keep existing cache clears and event dispatch. |
| `src/composables/useUnifiedTrackCache.js` | Expose `removeAlbumFromPlaylistInCache` and `addAlbumToPlaylistInCache` if callers use the composable instead of the util directly. |

## Testing / Acceptance

- After **moving** an album (back or to another playlist), the playlist view updates without a full unified cache rebuild; tracklists and playcounts/loved state remain correct.
- After **removing** an album, the playlist view updates without a full rebuild; the album disappears and track cache no longer lists it for that playlist.
- After **adding** an album via Add Album to Playlist page, opening that playlist with tracklists shows the new album’s tracks without a full rebuild.
- After **batch add to DB**, the playlist does not lose its unified cache; album list and track data remain. Newly added albums show updated DB data when opened (if albumDbData clear is implemented).
- **Manual Reload** still performs a full refresh (unified cache for the playlist is cleared and rebuilt on next use).

## Out of Scope

- Playlist Management page remove behaviour (see `playlist-management-pipeline-awareness-spec.md`).
- Changes to Firebase or Spotify API contracts.
- Automatic creation of user entries when loading a playlist (unchanged).
