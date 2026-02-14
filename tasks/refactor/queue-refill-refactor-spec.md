# Queue Refill Post-Implementation Refactor Specification

**Status:** 📋 Planning

**Related:** [Queue Refill and Loop Specification](../queue-refill-and-loop-spec.md) (implemented). This spec describes refactoring opportunities identified after that work.

## Overview

The queue refill and loop feature introduced `useQueueSession`, `useQueueTrackSelection`, `getQueue()` in the player, and changes in `TrackList.vue`. This document captures refactoring opportunities to reduce duplication, clarify boundaries, and make the queue/playlist-play code easier to maintain and extend.

## Relationship to Queue Refill Work

| Refill deliverable | Refactor opportunity |
|--------------------|----------------------|
| Initial queue fill in TrackList + top-up loop in useQueueSession | Same “add batch of albums to queue” logic in both places → extract shared helper. |
| Session shape and selection options (`playlistId`, `playlistTrackIds`) | Same shape built from props (TrackList) and from session (useQueueSession) → shared type/helper. |
| `albumIdFromUri()` in useQueueSession | Generic Spotify URI parsing → move to shared util for reuse. |
| `fetchAllAlbumTracks()` in useQueueTrackSelection | Generic paginated album fetch → move to API layer (e.g. useUserSpotifyApi). |
| handleTrackClick: clear session, play, initial fill, setSession | Playlist-play flow is a distinct concern → extract composable (e.g. usePlaylistPlay). |
| Session documented only in comments | Add shared type (e.g. QueueSession) for refactors and onboarding. |
| “First of first 3” in track selection | Simplify to “first after sort” if random-among-three is not required. |

## Refactoring Considerations

### 1. Extract shared “add album batch to queue”

**Current state:**  
- **TrackList.vue** (initial fill): loops over `remainingAlbums`, calls `selectNextTrackUriForAlbum(nextAlbum, selectionOpts)` then `addToQueue(nextTrackUri)`.  
- **useQueueSession.js** (top-up): same loop over `remainingAlbums`, same `selectNextTrackUriForAlbum` + `addToQueue`.

**Proposal:**  
- Add a single helper used by both, e.g. `addAlbumBatchToQueue(albums, selectionOpts, { selectNextTrackUriForAlbum, addToQueue })`.  
- Call it from TrackList after `playTrack()` for the initial batch, and from the useQueueSession watcher for top-up/loop.  
- Keeps the “one track per album” rule in one place and avoids drift between initial fill and refill.

**Files:**  
- New: small helper (could live in `useQueueTrackSelection.js` as an exported function, or in a dedicated `queueBatchUtils.js`).  
- Update: `src/components/TrackList.vue`, `src/composables/useQueueSession.js`.

---

### 2. Move `albumIdFromUri` to shared Spotify util

**Current state:**  
- `albumIdFromUri(albumUri)` in `useQueueSession.js` parses a Spotify album URI to return the ID.

**Proposal:**  
- Move to a shared util, e.g. `src/utils/spotify.js` (or existing spotify-related util), so any code that needs “ID from Spotify URI” can reuse it.  
- useQueueSession (and any other consumer) imports from that util.

**Files:**  
- New or update: `src/utils/spotify.js` (or equivalent).  
- Update: `src/composables/useQueueSession.js`.

---

### 3. Define selection options shape and reuse

**Current state:**  
- TrackList builds `{ playlistId, playlistTrackIds }` from props.  
- useQueueSession builds the same shape from `session` for `selectNextTrackUriForAlbum`.

**Proposal:**  
- Introduce a named shape (JSDoc type or shared constant) for “queue selection options,” e.g. `{ playlistId: string, playlistTrackIds: Record<string, Record<string, boolean>> }`.  
- Optionally: a tiny helper that builds this from props or from session, so both call sites use the same contract and naming.

**Files:**  
- Types or constants (e.g. in a types file or at top of `useQueueTrackSelection.js`).  
- Optional: use in TrackList and useQueueSession when building options.

---

### 4. Extract playlist-play flow (usePlaylistPlay)

**Current state:**  
- `handleTrackClick` in TrackList: clearSession → build context → playTrack → if playlist with albums: remainingAlbums loop + addToQueue + setSession.

**Proposal:**  
- Extract a composable, e.g. `usePlaylistPlay()`, that takes the needed deps (playTrack, addToQueue, clearSession, setSession, selectNextTrackUriForAlbum, etc.) and exposes something like `playFromPlaylist(track, playlistContext)`.  
- That function encapsulates: clear session, build play context, call playTrack, then “if playlist with albums” run initial batch add (via the shared batch helper from #1) and setSession.  
- TrackList’s handleTrackClick becomes: play/pause branch, then a single call to `playFromPlaylist` (or equivalent) for the play path.  
- Centralizes “when we set session” and “how we do initial queue fill” and relates clearly to the refill spec’s “clear on play; set session when playing from our playlist.”

**Files:**  
- New: `src/composables/usePlaylistPlay.js` (or similar name).  
- Update: `src/components/TrackList.vue`.

---

### 5. Move `fetchAllAlbumTracks` to API layer

**Current state:**  
- `fetchAllAlbumTracks(getAlbumTracks, albumId)` lives inside `useQueueTrackSelection.js` and wraps the paginated `getAlbumTracks` call.

**Proposal:**  
- Move to the Spotify API layer, e.g. `useUserSpotifyApi`, as something like `getAllAlbumTracks(albumId)` (or keep the same name).  
- useQueueTrackSelection (or the shared batch helper) calls that API method instead of owning pagination.  
- Keeps “fetch all pages” in the data layer and “choose next track” in the selection layer.

**Files:**  
- Update: `src/composables/useUserSpotifyApi.js` (add paginated album-tracks method).  
- Update: `src/composables/useQueueTrackSelection.js` (use the new API method).

---

### 6. Simplify “first of first 3” in track selection

**Current state:**  
- In `useQueueTrackSelection.js`: `tracksWithMinPlaycount.slice(0, 3)` then take the first. The spec mentioned “first 3 then select the first one” (e.g. for future random among three).

**Proposal:**  
- If there is no plan to randomise among the first three, simplify to taking the first element after the sort (remove the slice).  
- If random-among-three is desired later, document that and keep the slice; otherwise this is a small clarity refactor.

**Files:**  
- Update: `src/composables/useQueueTrackSelection.js`.

---

### 7. Add shared QueueSession type

**Current state:**  
- Session shape is documented only in a comment in useQueueSession (playlistId, playlistName, albumsList, playlistTrackIds, lastAlbumId).

**Proposal:**  
- Add a shared type (JSDoc or TypeScript), e.g. `QueueSession`, describing that shape.  
- Use it in useQueueSession and anywhere that reads or builds session (e.g. usePlaylistPlay if introduced).  
- Helps refactors and onboarding and pairs with #3 for selection options.

**Files:**  
- New or update: types or JSDoc (e.g. `src/types/queueSession.js` or inside the composable).  
- Update: `src/composables/useQueueSession.js` (and any new composables that touch session).

---

## Suggested order of work

1. **#1 (batch to queue)** and **#7 (QueueSession type)** — reduce duplication and lock the session contract.  
2. **#4 (playlist-play composable)** — use the batch helper and session type; simplifies TrackList.  
3. **#3 (selection options shape)** — small, supports #1/#4.  
4. **#2 (albumIdFromUri)** and **#5 (fetchAllAlbumTracks)** — move utilities to the right layer.  
5. **#6 (first of three)** — optional clarity tweak when touching useQueueTrackSelection.

## Files summary

| File | Actions |
|------|--------|
| `src/composables/useQueueSession.js` | Use shared batch helper; use albumIdFromUri from util; optionally use QueueSession type and selection-options type. |
| `src/composables/useQueueTrackSelection.js` | Use getAllAlbumTracks from API; optionally export or use shared batch helper; simplify first-of-three if desired. |
| `src/composables/useUserSpotifyApi.js` | Add getAllAlbumTracks (paginated). |
| `src/components/TrackList.vue` | Use shared batch helper and optionally usePlaylistPlay; simplify handleTrackClick. |
| `src/utils/spotify.js` (or equivalent) | Add albumIdFromUri (and optionally other URI parsers). |
| New composable | usePlaylistPlay (or equivalent) if #4 is done. |
| New helper / types | addAlbumBatchToQueue; QueueSession (and optionally selection options) type. |

## Out of scope

- Changing queue refill or loop behaviour (that stays as in the queue-refill spec).  
- UI for enabling/disabling refill or loop (already out of scope in the original spec).  
- Persisting session across reloads.

## References

- [Queue Refill and Loop Specification](../queue-refill-and-loop-spec.md)  
- Current implementation: `useQueueSession.js`, `useQueueTrackSelection.js`, `TrackList.vue` (handleTrackClick, initial queue fill), `useSpotifyPlayer.js` (getQueue, addToQueue).
