# Spotify API Migration Specification

## **Status**: ✅ Complete

## Overview

Spotify is deprecating and replacing several API endpoints. This spec documents the required migrations for Tunicious and notes potential uses of new endpoints for future enhancements.

## Impact Summary

| Severity | Count | Notes |
|----------|-------|-------|
| **Migration required** | 6 endpoints | Direct replacements available |
| **Behavior change** | 1 endpoint | Search limit reduced |
| **No action** | 8+ endpoints | Single album/artist, /me, player endpoints unaffected |

**Overall**: All changes are fixable. No architectural redesign needed.

---

## Phase 1: Required Migrations

### 1.1 Create Playlist

**Current**: `POST /users/{user_id}/playlists`  
**Replacement**: `POST /me/playlists`

| File | Location | Change |
|------|----------|--------|
| `src/composables/useUserSpotifyApi.js` | `createPlaylist()` ~line 441 | Replace `users/${profile.id}/playlists` with `me/playlists` |

**Notes**: No longer need to fetch user profile first to get `user_id`; `POST /me/playlists` uses the authenticated user implicitly. Can simplify `createPlaylist()` by removing the `getUserProfile()` call if it's only used for this.

---

### 1.2 Playlist Tracks → Playlist Items

**Current**: `/playlists/{id}/tracks`  
**Replacement**: `/playlists/{id}/items`

| File | Location | Method | Change |
|------|----------|--------|--------|
| `src/composables/useUserSpotifyApi.js` | ~line 451 | `addTracksToPlaylist()` | `POST .../tracks` → `POST .../items` |
| `src/composables/useUserSpotifyApi.js` | ~line 548 | `getPlaylistTracks()` | `GET .../tracks` → `GET .../items` |
| `src/composables/useUserSpotifyApi.js` | ~line 645 | `removeTracksFromPlaylist()` | `DELETE .../tracks` → `DELETE .../items` |
| `src/composables/useUserSpotifyApi.js` | ~line 672 | `getPlaylistAlbumsWithDates()` | `GET .../tracks?fields=...` → `GET .../items?fields=...` |

**Verification needed**: Confirm new `/items` endpoint request/response format. Spotify may use different field names (e.g. `uris` vs `tracks`, `items` structure). Check [Spotify Web API reference](https://developer.spotify.com/documentation/web-api) for `POST /playlists/{id}/items`, `GET /playlists/{id}/items`, `DELETE /playlists/{id}/items`.

---

### 1.3 Unfollow Playlist (Delete Playlist)

**Current**: `DELETE /playlists/{id}/followers`  
**Replacement**: `DELETE /me/library`

| File | Location | Change |
|------|----------|--------|
| `src/composables/usePipelineGeneration.js` | `deleteSpotifyPlaylist()` ~line 219 | Use `DELETE /me/library?uris=spotify:playlist:{playlistId}` (query param, no body) |

**Request format**: `DELETE /me/library` uses a **query parameter** `uris` (comma-separated Spotify URIs), not a body. For playlists: `DELETE /me/library?uris=spotify%3Aplaylist%3A{playlistId}`. Max 40 URIs per request.

---

### 1.4 Get Several Albums (Batch)

**Current**: `GET /albums?ids=id1,id2,...`  
**Replacement**: None. Use `GET /albums/{id}` per album.

| File | Location | Change |
|------|----------|--------|
| `src/composables/useUserSpotifyApi.js` | `getAlbumsBatch()` ~line 699 | Replace single batch call with loop of `GET /albums/{id}` |
| `src/composables/useUserSpotifyApi.js` | `loadAlbumsBatched()` ~line 708 | May need to adjust batching; consider parallel requests with rate limiting |

**Performance**: Previously 1 request per 20 albums; now 20 requests per 20 albums. Existing `loadAlbumsBatched` already has 100ms delay between batches; may need to tune or parallelize within rate limits.

---

### 1.5 Search Limit Change

**Current**: `GET /search` with `limit=20` (max 50)  
**Change**: Max `limit` reduced to **10**, default changed to **5**

| File | Location | Change |
|------|----------|--------|
| `src/composables/useUserSpotifyApi.js` | `searchAlbums()` ~line 654 | Cap `limit` at 10; add pagination if caller needs more than 10 results |
| `src/components/AlbumSearch.vue` | Uses `searchAlbums` | May need to handle pagination or "load more" for >10 results |

---

### 1.6 Backend Whitelist

| File | Location | Change |
|------|----------|--------|
| `functions/src/spotifyEndpoints.js` | `ALLOWED_ENDPOINTS` | Add: `/me/playlists`, `/me/library`, `/playlists/{playlistId}/items` |
| `functions/src/spotifyEndpoints.js` | `ALLOWED_ENDPOINTS` | Remove or deprecate: `/users/{userId}/playlists`, `/playlists/{playlistId}/tracks`, `/playlists/{playlistId}/followers` |

---

## Phase 2: New Endpoints – Potential Future Use

These endpoints are **not required** for migration but could enable new features.

### 2.1 Save to Library (PUT /me/library)

**Use case**: One-tap "Save album to my Spotify library" action.

- **Current flow**: User adds album to a Tunicious playlist.
- **Enhancement**: Add quick action to save album directly to Spotify library (Liked Songs / Saved Albums).
- **Location**: Could add to `AlbumView.vue`, `AlbumItem.vue`, or search results.
- **Priority**: Low – nice-to-have convenience.

---

### 2.2 Check User's Saved Items (GET /me/library/contains)

**Use case**: Show "already in library" badges; avoid duplicate suggestions.

- **Current flow**: No visibility into user's saved library.
- **Enhancement**: Show badge on albums in search/playlists that are already saved. Optionally skip suggesting "add to library" for saved items.
- **Location**: `AlbumSearch.vue`, `PlaylistSingle.vue`, `AlbumItem.vue`.
- **Priority**: Low – UX polish.

---

### 2.3 Update Playlist Items (PUT /playlists/{id}/items)

**Use case**: Bulk replace or reorder playlist items in a single call.

- **Current flow**: Move album = `removeTracksFromPlaylist` + `addTracksToPlaylist` (two API calls).
- **Enhancement**: For bulk moves or reordering, `PUT .../items` could replace entire playlist order in one request. Evaluate if move operations in `PlaylistSingle.vue` could be optimized.
- **Location**: `useUserSpotifyApi.js`, `PlaylistSingle.vue` (move album handlers).
- **Priority**: Low – optimization; current add/remove flow works.

---

### 2.4 Remove from Library (DELETE /me/library)

**Use case**: "Remove from library" action if Save to Library is added.

- **Note**: Required for unfollow migration (playlist URI). Also available for future "remove from library" feature if Phase 2.1 is implemented.

---

## Implementation Order

1. **Backend whitelist** – Add new endpoints to `spotifyEndpoints.js` before frontend changes.
2. **Playlist items migration** – Highest impact; affects add, get, remove tracks.
3. **Create playlist** – Simple path change.
4. **Unfollow playlist** – Required for pipeline rollback.
5. **Get Several Albums** – Refactor batch logic.
6. **Search** – Cap limit, add pagination if needed.

---

## Verification Checklist

- [x] All playlist CRUD operations work (create, add tracks, get tracks, remove tracks)
- [x] Pipeline generation creates playlists successfully
- [x] Pipeline rollback (delete playlists) works on failure
- [x] Album search returns results (max 10 per request)
- [x] Playlist album loading (e.g. PlaylistSingle) works with batched album fetches
- [x] No 403/404 from backend proxy (whitelist allows new endpoints)
- [x] Rate limiting acceptable with per-album fetch for `loadAlbumsBatched`

---

## Post-Migration UI Updates

Suggested UI tweaks to address migration behavior changes:

### Search: Load More / Pagination

**Context**: Search limit reduced from max 50 to max 10 per request. Users may expect more results for broad queries.

| Item | Description |
|------|--------------|
| **Component** | `src/components/AlbumSearch.vue` |
| **Change** | Add "Load more" button or infinite scroll when search returns 10 results and `total` indicates more exist |
| **API** | `searchAlbums()` supports `offset` for pagination (Spotify search uses `offset` + `limit`); extend composable if needed |
| **Priority** | Medium – improves discoverability for broad searches |

---

## References

- Spotify API deprecation notice (user-provided)
- [Spotify Web API Reference](https://developer.spotify.com/documentation/web-api) – verify new endpoint request/response formats before implementation
