# Album ID Resolution Audit

**Purpose:** Identify every code path that touches the `albums` Firestore collection with an album ID, and whether it resolves alternate IDs through the `albumMappings` collection. After deduplication, alternate IDs point to deleted documents; only the primary document exists.

**Date:** 2025-02-02

---

## Summary

| Category | Count |
|----------|-------|
| ✅ Resolves mappings | 3 |
| ❌ No resolution (needs fix) | 6 |
| ➖ N/A (collection query, no doc ID) | 6 |

---

## Direct Firestore Access by Album ID

### ✅ RESOLVES MAPPINGS (safe)

| Location | Function | Notes |
|----------|----------|-------|
| `useAlbumsData.js:39-63` | `fetchUserAlbumData` | Tries direct lookup, falls back to `getPrimaryId`, retries with primary. |
| `useAlbumsData.js:330-409` | `addAlbumToCollection` | Uses `getPrimaryId` + title/artist search to determine `targetAlbumId` before write. |
| (via fetchUserAlbumData) | `getCurrentPlaylistInfo`, `getAlbumRatingData`, `fetchAlbumsData` | All delegate to `fetchUserAlbumData`. |

---

### ❌ NO RESOLUTION (needs fix)

| Location | Function | Risk | Callers |
|----------|----------|------|---------|
| `useAlbumsData.js:481-489` | `getAlbumDetails` | Returns null for alternate IDs. Callers may get wrong/missing metadata. | SearchView, PlaylistSingle (getCachedAlbumDetails, mismatch report) |
| `useAlbumsData.js:501-529` | `getAlbumsDetailsBatch` | Returns null for alternate IDs. | PlaylistSingle (fetchAlbumsForPage) – **mitigated**: falls back to Spotify API when null |
| `useAlbumsData.js:575-585` | `updateAlbumDetails` | **HIGH** – `setDoc(merge:true)` with alternate ID **recreates** the deleted document. | AlbumView (save details, RYM link), PlaylistSingle (fix metadata, mismatch reconciliation) |
| `useAlbumsData.js:608-665` | `removeAlbumFromPlaylist` | Fails for alternate IDs – doc not found, returns false. User cannot remove. | PlaylistSingle (3 remove flows) |
| `AlbumView.vue:76` | `checkIfNeedsUpdate` | Direct `getDoc(albums, album.value.id)`. Wrong result for alternate ID. | AlbumView |
| `AlbumView.vue:667` | Album load (albumExists, storedRymLink) | Direct `getDoc(albums, albumId)`. Wrong result for alternate ID. | AlbumView |
| `unifiedTrackCache.js:740` | `getLastPlayedTrack` | Direct `getDoc(albums, mostRecent.albumId)`. Last-played display missing year/cover for alternate ID. | Player / last-played UI |

---

### ➖ N/A – Collection Queries (no specific doc ID)

| Location | Function | Notes |
|----------|----------|-------|
| `useAlbumsData.js:156` | `searchAlbumsByTitleAndArtist` | `where('albumTitle','artistName')` – query, not doc lookup |
| `useAlbumsData.js:207` | `searchAlbumsByTitleAndArtistFuzzy` | Same |
| `useAlbumsData.js:258` | `searchAlbumsByTitlePrefix` | Query |
| `useAlbumsData.js:297` | `searchAlbumsByArtistPrefix` | Query |
| `useAlbumsData.js:451` | `fetchAlbumDetails` | `getDocs(albums)` – fetches all |
| `useLatestMovements.js:37` | Latest movements | `getDocs(albums)` – iterates all docs |

---

## Call Graph: Where Album IDs Come From

Album IDs flow from:
- **Route params** (`/album/:id`) – user may land on alternate ID
- **Spotify API** – playlist contents, artist discography, search results
- **Cache** – `unifiedTrackCache` stores `track.album?.id` from Spotify response

All of these can be alternate IDs after deduplication.

---

## Priority Fixes

### P0 – Data integrity

1. **`updateAlbumDetails`** – Resolve to primary before write. Prevents recreating duplicates.

### P1 – Core user actions

2. **`removeAlbumFromPlaylist`** – Resolve to primary before lookup. Users must be able to remove albums.

### P2 – Correctness

3. **`getAlbumDetails`** – Resolve to primary before lookup (or document that callers handle null).
4. **`getAlbumsDetailsBatch`** – Resolve each ID before lookup. Currently mitigated by Spotify fallback but would improve consistency.
5. **AlbumView direct access** (lines 76, 667) – Resolve `album.value.id` / `albumId` before Firestore access.

### P3 – Polish

6. **unifiedTrackCache `getLastPlayedTrack`** – Resolve `mostRecent.albumId` before lookup. Minor – last-played display only.

---

## Implementation Pattern

For any function that does `doc(db, 'albums', albumId)` or `getDoc`/`setDoc` with an album ID:

```javascript
// At start of function
let targetAlbumId = albumId;
const primaryId = await getPrimaryId(albumId);
if (primaryId) targetAlbumId = primaryId;
// Use targetAlbumId for all Firestore operations
```

Or extract a shared helper:

```javascript
const resolveToPrimaryId = async (albumId) => {
  const primary = await getPrimaryId(albumId);
  return primary || albumId;
};
```

---

## Notes

- **PlaylistManagementView** uses `removeAlbumFromPlaylist` from **useUserSpotifyApi** (Spotify API), not useAlbumsData. No Firestore impact.
- **ArtistView** `getCachedAlbumDetails` calls `getAlbumRatingData` (which uses fetchUserAlbumData ✅) – comment says "Should be getAlbumDetails" – worth normalizing.
- Cache keys use raw album ID (`albumRootData_${albumId}`). After resolution, consider whether cache should key by primary for deduplication. Lower priority.
