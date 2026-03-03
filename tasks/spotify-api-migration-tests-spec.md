# Spotify API Migration – Test Specification

## **Status**: 📋 Planning

## Overview

This spec defines the test coverage to add **before** the Spotify API migration (see `spotify-api-migration-spec.md`). Tests will use Vitest with mocked dependencies—no Firebase emulators or real API calls.

**Goal**: Establish a passing test suite for current behavior, then update tests as the migration proceeds so we can verify nothing breaks.

---

## Test Strategy

| Aspect | Approach |
|--------|----------|
| **Runner** | Vitest (existing `npm run test`) |
| **Style** | Unit tests with mocked dependencies |
| **Emulators** | None – mock Firebase and backend API |
| **Pattern** | Follow `src/utils/unifiedTrackCache.spec.js` (vi.mock, spy on calls) |

---

## Mocking Requirements

### Dependencies to Mock

| Module | Mock Purpose |
|--------|--------------|
| `@/composables/useBackendApi` | Provide spy for `spotifyApiCall`; capture endpoint, method, body |
| `vuefire` (`useCurrentUser`) | Return `ref({ uid: 'test-uid' })` so composable has a user |
| `firebase/firestore` | Mock `getDoc` to return valid `spotifyTokens` (accessToken, expiresAt) |
| `@/firebase` | Mock `db` if needed for Firestore |
| `@/utils/logger` | Mock `logSpotify` to avoid console noise |

### Mock Setup Pattern

```js
vi.mock('@/composables/useBackendApi', () => ({
  useBackendApi: () => ({
    refreshSpotifyToken: vi.fn(),
    spotifyApiCall: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('vuefire', () => ({
  useCurrentUser: () => ref({ uid: 'test-uid' }),
}));
// ... Firestore mocks for getDoc returning tokens
```

---

## Test Files to Create

### 1. `src/composables/useUserSpotifyApi.spec.js`

**Scope**: All Spotify API methods that will change in the migration.

| Method | What to Verify |
|--------|----------------|
| `createPlaylist(name, description, isPublic)` | `spotifyApiCall` called with correct endpoint path (contains `playlists`), method `POST`, body with `name`, `description`, `public` |
| `addTracksToPlaylist(playlistId, trackUris)` | Endpoint contains `playlists/{id}/tracks` (pre) or `.../items` (post); method `POST`; body has `uris` array |
| `getPlaylistTracks(playlistId, limit, offset)` | Endpoint contains `playlists/{id}/tracks` or `.../items`; method `GET`; returns response (mock `items` array) |
| `removeTracksFromPlaylist(playlistId, trackUris)` | Endpoint contains `playlists/{id}/tracks` or `.../items`; method `DELETE`; body has `tracks` (pre) or `items` (post) array |
| `getPlaylistAlbumsWithDates(playlistId)` | Endpoint contains `playlists/{id}/tracks` or `.../items`; `fields` query includes `items(...)` or `track(...)` |
| `getAlbumsBatch(albumIds)` | Pre: single call with `albums?ids=...`. Post: multiple calls to `albums/{id}` |
| `loadAlbumsBatched(albumIds)` | Returns array of albums; structure matches `getAlbumsBatch` response handling |
| `searchAlbums(query, limit)` | Endpoint contains `search`; query param `limit` is passed; post-migration assert `limit <= 10` |

**Assertion style**: Spy on `spotifyApiCall` and assert `toHaveBeenCalledWith(expectedEndpoint, expectedMethod, expectedBody)` (or equivalent). Endpoint can be matched with `expect.stringContaining('/playlists/')` etc.

---

### 2. `src/composables/usePipelineGeneration.spec.js`

**Scope**: `deleteSpotifyPlaylist` (used for rollback on pipeline failure).

**Challenge**: `deleteSpotifyPlaylist` is currently a private (non-exported) function. Options: (a) export it for testability, or (b) test indirectly via `generateCompletePipelines` with a failing `createPlaylist` to trigger rollback. Option (a) is simpler.

| Test | What to Verify |
|------|----------------|
| `deleteSpotifyPlaylist calls makeUserRequest with correct endpoint` | `makeUserRequest` called with endpoint containing `playlists/{id}/followers` (pre) or `me/library?uris=spotify:playlist:{id}` (post); method `DELETE` |
| `deleteSpotifyPlaylist does not throw when makeUserRequest succeeds` | No error thrown |
| `deleteSpotifyPlaylist catches and logs errors (best-effort rollback)` | When `makeUserRequest` rejects, `deleteSpotifyPlaylist` does not throw (verify via try/catch or spy on console.warn) |

**Implementation note**: Import `deleteSpotifyPlaylist` directly. Create a mock `makeUserRequest = vi.fn().mockResolvedValue(undefined)` and pass it in. Assert on the mock's call arguments.

---

## Pre-Migration vs Post-Migration

| Phase | Action |
|-------|--------|
| **Pre-migration** | Write tests that assert **current** endpoints and formats (e.g. `.../tracks`, `tracks` in body). All tests should pass. |
| **Migration** | Implement changes per `spotify-api-migration-spec.md`. |
| **Post-migration** | Update test expectations to new endpoints/formats (e.g. `.../items`, `items` in body, `item` in response). Re-run; all tests should pass. |

---

## Test Data Helpers

Suggested fixtures for consistent assertions:

```js
const MOCK_PLAYLIST_ID = 'playlist-123';
const MOCK_TRACK_URIS = ['spotify:track:abc', 'spotify:track:def'];
const MOCK_ALBUM_IDS = ['album1', 'album2'];
const MOCK_SEARCH_RESPONSE = { albums: { items: [], total: 0 } };
const MOCK_PLAYLIST_ITEMS = { items: [{ track: { id: 't1', album: { id: 'a1' } }, added_at: '2024-01-01' }], total: 1 };
```

---

## Implementation Order

1. Set up mocks for `useUserSpotifyApi` (useBackendApi, vuefire, Firestore).
2. Add `useUserSpotifyApi.spec.js` with tests for each method listed above.
3. Export `deleteSpotifyPlaylist` from `usePipelineGeneration.js` (for testability).
4. Add `usePipelineGeneration.spec.js` with `deleteSpotifyPlaylist` tests.
5. Run `npm run test:run` – all tests pass with current implementation.
6. Proceed with migration; update expectations as needed; re-run tests after each change.

---

## Verification Checklist

- [ ] `useUserSpotifyApi.spec.js` exists and all tests pass
- [ ] `usePipelineGeneration.spec.js` exists and all tests pass
- [ ] No real API calls or emulators required
- [ ] Tests are fast (mocks only)
- [ ] After migration, updated tests still pass

---

## References

- [spotify-api-migration-spec.md](./spotify-api-migration-spec.md) – Migration changes
- [unifiedTrackCache.spec.js](../src/utils/unifiedTrackCache.spec.js) – Mocking pattern reference
