# Queue Refill and Loop Specification

**Status:** ✅ Done

## Overview

When playing from a playlist, the app queues one track per remaining album so playback follows the app’s order. Once that queue runs out, Spotify falls back to the playlist/album context. This spec adds **automatic queue top-up** when the queue is short and **loop** behaviour so that when playback reaches the last album, the next round is queued from the first album again.

## Problem Statement

### Current Behaviour

1. User clicks play on a track in a playlist (TrackList).
2. App calls `playTrack(trackUri, context)` with playlist/album `context_uri` so Spotify has a fallback.
3. App queues **one track per remaining album** via `findRemainingAlbums()` → `selectNextTrackToQueue()` → `addToQueue()` (in `TrackList.vue`).
4. When the queued tracks finish, Spotify takes over and continues from the context (rest of playlist/album).
5. There is no loop: reaching the “end” of the list does not wrap back to the start.

### Desired Behaviour

1. When the queue is **short** (e.g. ≤ 2 tracks), automatically add the next batch (one track per remaining album, same selection rules).
2. When the **last** track/album in the playlist starts playing, treat “remaining” as the **full** album list and queue the next round (loop).
3. Session is cleared whenever the user clicks play on any track; a new session is set only when playing from our playlist.
4. No loop or refill for album-only playback (no `albumsList`); only for playlist (multi-album) mode.

## Solution

### Core Design

- **Queue session**: Stored in a composable (e.g. `useQueueSession`). Holds: `playlistId`, `playlistName`, `albumsList` (ordered), `playlistTrackIds`, and **last track** (or last album) so loop can detect “end of playlist”.
- **Clear on play**: Any time the user clicks play on any track, clear the session. When that play is from our playlist, set a new session (including last track/album).
- **Top-up trigger**: On **track change** (when a new track starts), if there is an active session and the **queue is short** (≤ 2 tracks), run the top-up logic.
- **Remaining albums**: Derived from the **now-playing track’s album**. If that album is the **last** in the session’s list → remaining = full `albumsList` (loop). Otherwise remaining = albums after current.
- **Re-entrancy**: Only one top-up in progress at a time (e.g. `isToppingUp` guard) to avoid duplicate batches when the user skips quickly.
- **Album-only**: No session, no refill, no loop when playing from a single album view.

### Architecture

```
First play (TrackList):
  User clicks play → clearSession() → playTrack() → initial queue fill (existing)
  → setSession(playlistId, albumsList, playlistTrackIds, lastTrackUri | lastAlbumId)

Track change (session composable):
  currentTrack changes → has session? → getQueue() → queue.length ≤ 2?
  → current track's album = lastAlbum? → remaining = full list (loop) : remaining = slice(index+1)
  → for each album in remaining: selectNextTrackToQueue(album) → addToQueue(uri)
  → guard: isToppingUp to prevent concurrent top-ups
```

## Implementation Details

### Phase 1: Spotify GET queue and session composable

**1.1 Expose queue in player**

- **File**: `src/composables/useSpotifyPlayer.js`
- **Changes**: Add `getQueue()` that calls `GET https://api.spotify.com/v1/me/player/queue` (with `device_id` if needed), returns `{ queue: [...] }` or similar. Handle no active device / no player gracefully.

**1.2 Queue session composable**

- **New file**: `src/composables/useQueueSession.js`
- **State**: `session` (ref, null or object). Session shape: `{ playlistId, playlistName, albumsList, playlistTrackIds, lastTrackUri }` (or `lastAlbumId` if preferred for loop detection).
- **API**:
  - `setSession(payload)` – set session from TrackList when user starts play from playlist.
  - `clearSession()` – set session to null. Called on every play click (before setting a new one when applicable).
  - `getSession()` – return current session (for top-up logic and any UI).
- No top-up logic in this phase; just state and get/set/clear.

### Phase 2: Extract “select next track per album” logic

**2.1 Reusable selection and batch queue**

- **Option A**: New composable e.g. `src/composables/useQueueTrackSelection.js` that exports a function like `selectNextTrackUriForAlbum(album, { playlistId, playlistTrackIds })` (and optionally `addBatchToQueue(remainingAlbums, session)` that loops and calls `addToQueue`). It should use `useUnifiedTrackCache().getPlaycountForTrack`, `getAlbumTracks` (or existing fetch album tracks helper), and the same rules as current `selectNextTrackToQueue` in TrackList (min playcount, track number order, filter by playlist tracks).
- **Option B**: Keep logic in TrackList but extract a **plain function** (or composable used by both) that takes `(album, playlistId, playlistTrackIds, getPlaycountForTrack, getAlbumTracks)` and returns the next track URI. TrackList and the session composable both call it.
- **File**: `src/components/TrackList.vue` – refactor to use the extracted function for the initial queue fill so behaviour stays identical.

**2.2 Dependencies**

- Selection logic needs: album (id, etc.), playlistId, playlistTrackIds, getPlaycountForTrack, getAlbumTracks (or equivalent). It must not depend on TrackList props beyond what’s passed in.

### Phase 3: Top-up and loop inside session composable

**3.1 useQueueSession: watch currentTrack and run top-up**

- **File**: `src/composables/useQueueSession.js`
- **Behaviour**:
  - Use `useSpotifyPlayer()` for `currentTrack`, `addToQueue`, and the new `getQueue()`.
  - When `currentTrack` changes (and is truthy), if there is no session, return. If session exists, check that the now-playing track is “in” our session (e.g. its album is in `session.albumsList`); if not, optionally clear session and return.
  - Call `getQueue()`. If queue has more than 2 tracks, return (no top-up).
  - Set `isToppingUp = true`. Compute **remaining albums**:
    - Resolve current track’s album (e.g. from `currentTrack.albumUri` or album id).
    - Find its index in `session.albumsList`. If not found, clear session and return.
    - If index is last (index === session.albumsList.length - 1): **loop** – remaining = `session.albumsList` (full list). Otherwise remaining = `session.albumsList.slice(index + 1)`.
  - For each album in remaining, call the extracted “select next track for album” and then `addToQueue(uri)` (skip if no URI). Then set `isToppingUp = false`. On error, set `isToppingUp = false` and log.
  - **Guard**: If `isToppingUp` is already true when the watcher runs, skip (or debounce and run once).

**3.2 Loop detection**

- Store in session either `lastTrackUri` or `lastAlbumId`. When computing remaining, “last album” = `session.albumsList[session.albumsList.length - 1].id` (or equivalent). If current track’s album id === last album id, use loop (remaining = full list).

### Phase 4: TrackList integration

**4.1 Clear and set session on play**

- **File**: `src/components/TrackList.vue`
- **Changes**:
  - On **every** play click (at the start of `handleTrackClick`), call `clearSession()` from `useQueueSession()`.
  - When building initial queue (playlist with `albumsList` and `albumId`), after calling `playTrack()` and the loop that adds initial queue:
    - Compute **last track** (or last album) from the current playlist/album list. For “last album” you can use `albumsList[albumsList.length - 1]`; for “last track” you’d need the last track in the playlist order (e.g. last track of the last album that’s in the playlist, or a single lastTrackUri if you define it).
    - Call `setSession({ playlistId, playlistName, albumsList, playlistTrackIds, lastTrackUri or lastAlbumId })`.
  - Use the extracted “select next track” helper for the initial queue fill so logic is shared.

**4.2 Only set session for playlist (multi-album)**

- Do not call `setSession` when there is no `playlistId` or no `albumsList`/multi-album (album-only view). That keeps album-only behaviour unchanged (no refill, no loop).

### Phase 5: Activate session composable in app

**5.1 Always-mounted consumer**

- **File**: `App.vue` or `src/components/SpotifyPlayerBar.vue` (or another always-mounted root component)
- **Change**: Call `useQueueSession()` so the composable’s watcher on `currentTrack` is active whenever the app is running. No need to expose session to the template unless you add UI later (e.g. “Queue session active” or “Loop on”).

## Acceptance Criteria

- [x] When user plays from a playlist (multi-album), a queue session is set and the initial queue is filled as today.
- [x] When the queue has ≤ 2 tracks and the track changes (same session), a new batch (one track per remaining album) is added automatically.
- [x] When the now-playing track is from the **last** album in the session, the next batch is the **full** album list (one track per album from the start), i.e. loop.
- [x] Clicking play on any track clears the previous session; playing from the playlist sets a new one.
- [x] Playing from a single album (no playlist / no albumsList) does not set a session and does not trigger refill or loop.
- [x] Rapid track skips do not cause duplicate batches (re-entrancy guard).
- [x] If the user plays from another source (e.g. different playlist or Spotify elsewhere), the session can be cleared when we detect “current track not in session” (optional but recommended).

## Out of Scope

- Album-only loop (repeating a single album’s “next” tracks).
- UI to enable/disable loop or refill (can be added later).
- Persisting the session across page reloads.

## Files Summary

| File | Action |
|------|--------|
| `src/composables/useSpotifyPlayer.js` | Add `getQueue()` |
| `src/composables/useQueueSession.js` | New: session state, set/clear, top-up + loop logic, guard |
| `src/composables/useQueueTrackSelection.js` (or shared util) | New or extract: select next track URI for an album, used by TrackList and useQueueSession |
| `src/components/TrackList.vue` | Clear/set session on play; use extracted selection for initial queue |
| `App.vue` or `SpotifyPlayerBar.vue` | Use `useQueueSession()` so watcher is active |

## References

- Current queue fill: `TrackList.vue` – `findRemainingAlbums`, `selectNextTrackToQueue`, `handleTrackClick` (lines ~307–478).
- Spotify Web API: [Get the user's queue](https://developer.spotify.com/documentation/web-api/reference/get-queue).
- Playcount / selection rules: same as existing `selectNextTrackToQueue` (min playcount, track number, playlist membership).
