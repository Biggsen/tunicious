# PlaylistSingle Refactor Specification

**Status:** 📋 Planning

## Overview

This document specifies performance and maintainability refactors for `PlaylistSingle.vue`, derived from analysis of the page load flow and debug instrumentation. The goal is to make the playlist single view snappier and easier to maintain.

**Files Affected:**
- `src/views/playlists/PlaylistSingle.vue`
- `src/composables/useAlbumsData.js`

---

## 1. Parallelize Independent Work

**Impact:** High (~300–900ms saved)  
**Effort:** Medium

### Current Behavior

`loadPlaylistPage` runs operations sequentially:

1. `fetchAlbumIdList` – album list, sorting, page load
2. Playlist name and track count
3. `getPlaylistDocument` – Firestore playlist doc (permissions, pipeline position)

### Proposed Change

`getPlaylistDocument` does not depend on album data. Run it in parallel with `fetchAlbumIdList`:

```javascript
const [_, playlistDocResult] = await Promise.all([
  fetchAlbumIdList(id.value),
  getPlaylistDocument()
]);
playlistDoc.value = playlistDocResult;
```

Playlist name and track count can also be kicked off early (e.g. in parallel with `fetchAlbumIdList`) since they only depend on `id.value`.

---

## 2. Skip Firestore for Spotify-Only Albums

**Impact:** High (~600–1500ms saved)  
**Effort:** Low

### Current Behavior

`getCachedAlbumDetails` is called for every album in `loadCurrentPage`. For albums loaded from Spotify (`loadAlbumsBatched`) that are not in the DB, `getAlbumDetails` hits Firestore and returns `null`.

### Proposed Change

In `loadCurrentPage`, for albums that already have `name`, `artists`, `images`, `release_date` from the Spotify response, build the root object locally instead of calling `getCachedAlbumDetails`:

```javascript
// Build root from Spotify album object
{
  albumTitle: album.name,
  artistName: album.artists?.[0]?.name || '',
  releaseYear: album.release_date?.substring(0, 4) || '',
  albumCover: album.images?.[0]?.url || '',
  artistId: album.artists?.[0]?.id || '',
  rymLink: null  // Only exists for DB albums
}
```

Only call `getCachedAlbumDetails` for albums from `getAlbumsDetailsBatch` (DB albums) that might have RYM link or other DB-only fields.

---

## 3. Use getAlbumsDetailsBatch for Root Data (Remove Redundancy)

**Impact:** Medium (cleaner data flow, fewer code paths)  
**Effort:** Medium

### Current Behavior

- `getAlbumsDetailsBatch` already checks and populates the `albumRootData_` cache
- `loadCurrentPage` uses `fetchAlbumsData` plus `getCachedAlbumDetails` per album (separate Firestore path)

### Proposed Change

Call `getAlbumsDetailsBatch(pageAlbumIds)` once in `loadCurrentPage` (or in `fetchAlbumsForPage` when building page data). Use that result to populate `albumRootDataMap` instead of `getCachedAlbumDetails` per album. For albums missing from the batch (Spotify-only), use the Spotify-derived root object from section 2.

---

## 4. Extract loadPlaylistPage into Composable/Helpers

**Impact:** Maintainability  
**Effort:** Medium

### Current Behavior

`loadPlaylistPage` is a long function with many conditional branches for playlist name, track count, and cache fallbacks.

### Proposed Change

Split into focused functions:

- `loadPlaylistMetadata()` – name and track count from caches and Spotify
- `loadAlbumListAndPage()` – album list, sorting, page load (current `fetchAlbumIdList` + `loadCurrentPage`)
- `loadPlaylistDocument()` – Firestore playlist doc

Then orchestrate with `Promise.all` where dependencies allow. This simplifies testing and makes the load flow easier to follow.

---

## 5. Defer Non-Critical Data

**Impact:** Medium (faster perceived load)  
**Effort:** Medium

### Current Behavior

All data is loaded before `loading.value = false`. This includes `updateNeedsUpdateMap`, `loadLovedTrackPercentages` (when tracklists enabled), etc.

### Proposed Change

- First paint: playlist name, track count, album list, current page, `getPlaylistDocument` (via parallel load)
- After render: `loadLovedTrackPercentages`, `updateNeedsUpdateMap`, etc. (fire-and-forget or low-priority)

This keeps the critical path shorter and defers non-critical work until after the main content is visible.

---

## 6. Cache Key Management Optimization

**Impact:** Low–Medium  
**Effort:** Medium

### Current Behavior

`handleClearCache` clears hundreds of permutations (page × sortMode × sortDirection) when a single playlist changes, even if many keys were never used.

### Proposed Change

- Track which page cache keys have been written (e.g. a set of keys)
- Clear only keys that exist, or
- Use a single “version” or “invalidatedAt” value per playlist so a single check invalidates all cached pages

---

## 7. useAlbumsData Optimizations

**Impact:** Low (incremental)  
**Effort:** Low

### Current Behavior

- `fetchUserAlbumData` uses `await getCache(...)`; `getCache` is synchronous
- Each `fetchUserAlbumData` does `resolveToPrimaryId` before the Firestore read

### Proposed Change

- Remove redundant `await` on `getCache` (or make cache check sync and skip `resolveToPrimaryId` on cache hit)
- If mappings support it, batch `resolveToPrimaryId` for all album IDs before fetching

---

## Implementation Priority

| # | Recommendation                          | Expected Impact  | Effort  | Priority |
|---|----------------------------------------|------------------|---------|----------|
| 1 | Parallelize fetchAlbumIdList & getPlaylistDocument | ~300–900ms saved | Medium  | High     |
| 2 | Skip Firestore for Spotify-only albums | ~600–1500ms saved| Low     | High     |
| 3 | Use getAlbumsDetailsBatch for root data| Cleaner flow     | Medium  | High     |
| 5 | Defer non-critical data                 | Faster perceived load | Medium | Medium   |
| 4 | Extract composables                    | Maintainability  | Medium  | Medium   |
| 6 | Cache key management                   | Cleanup          | Medium  | Low      |
| 7 | useAlbumsData polish                   | Incremental      | Low     | Low      |

---

## Related Specs

- `tasks/refactor/playlist-single-album-data-refactor-spec.md` – Album data / sortedAlbumsList refactor
- `tasks/completed/unified-track-cache-spec.md` – Unified track cache
- `tasks/playlist-surgical-cache-updates-spec.md` – Surgical cache updates
