# Playlist Internal Queue Specification

**Status:** Draft

**Related:** [Queue Refill and Loop Specification](completed/queue-refill-and-loop-spec.md), [Queue Refill Refactor Specification](completed/queue-refill-refactor-spec.md). This spec replaces reliance on Spotify’s queue with an app-owned internal queue for multi-album playlist playback.

---

## 1. Overview

When playing from a **multi-album playlist**, the app currently uses Spotify’s queue: it adds one track per remaining album via `addToQueue` and tops up when the queue is short. This spec moves “what plays next” into an **internal queue** (an in-app list of track URIs). When the current track ends, the app takes the next URI from the internal queue and calls `playTrack(nextUri)` with **no context**, so Spotify only ever plays a single track and the app controls advancement. Same playback result (next album in order, least played, played longest ago), but the queue is fully under app control and can support future features (e.g. “Up next” UI, reorder, persist).

**Scope**

- **In scope:** Multi-album playlist playback only (TrackList play + playlist header “Play” button).
- **Out of scope for now:** Single-album / album view continues to use Spotify context (`context_uri` for the album). Internal queue for album view may be considered later.

---

## 2. Goals and Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Remove dependency on Spotify’s queue for playlist “what’s next”. | Change behaviour for single-album / album view. |
| Keep same user-visible behaviour: next album in order, least played, played longest ago, loop. | Expose “Up next” UI in this spec (queue is ready for it later). |
| Advance playback only when the current track ends (position-based or equivalent). | Persist or sync the internal queue across devices/reloads. |
| Keep “playing from this playlist” UI correct (play/pause, context label). | Change track selection rules (still `useQueueTrackSelection`). |

---

## 3. Current vs Desired Behaviour

### 3.1 Current

- **TrackList (click track):** `playFromPlaylist` → `playTrack(uri, context)` with playlist `context_uri`, then `addAlbumBatchToQueue(remainingAlbums)` into Spotify’s queue, then `setSession`. `useQueueSession` watches `currentTrack`; when queue is short (≤2) or on last album, it calls `addAlbumBatchToQueue` again to top up Spotify’s queue.
- **Playlist “Play” button:** Builds first track, `playTrack(firstUri, context)`, then loops `addToQueue(trackUri)` for remaining albums. Does **not** call `setSession`, so no top-up or loop.
- **playingFrom:** Set only when `playTrack(..., context)` is called with context.

### 3.2 Desired

- **Both entry points** use the same flow: start playback with a single track (no `context_uri` for playlist), set session, and fill an **internal queue** of upcoming URIs (one per album, same selection rules). When the current track **ends** (e.g. position within 500 ms of duration), take the next URI from the internal queue, call `playTrack(nextUri)` (no context), and refill the internal queue so it stays at **10 URIs ahead**. When the last album is reached, refill with the full album list (loop).
- **playingFrom:** Set by the app when starting a playlist session (so “playing from this playlist” still works); cleared when session is cleared.
- **Album view:** Unchanged; still use `playTrack(uri, context)` with album context.

---

## 4. Data and Rules

### 4.1 Session (existing, extended)

- **Session** continues to hold: `playlistId`, `playlistName`, `albumsList`, `playlistTrackIds`, `lastAlbumId`.
- **New:** Session is associated with an **internal queue** `upcomingUris: string[]` (track URIs). Not necessarily stored inside the same object; can be a separate ref in the same composable.

### 4.2 Internal queue

- **Content:** Track URIs, one per album, in album order (same as current “remaining albums” order).
- **Selection per album:** Unchanged — `selectNextTrackUriForAlbum(album, { playlistId, playlistTrackIds })` from `useQueueTrackSelection` (least playcount, then oldest last-played, then track number; playlist membership filter).
- **Refill target:** Keep **10** URIs ahead. When consuming (playing next), if length falls below 10, append URIs for the next albums in order (or full list for loop).
- **Loop:** When the “remaining” albums for refill would be empty (we’re past the last album), use the full `albumsList` as the next batch (same as current loop behaviour).

### 4.3 Track-ended detection

- When there is an active session and a current track, consider the track **ended** when `duration > 0` and `(duration - position) <= 500` ms.
- Use a **guard** (e.g. “advancing” flag or “lastHandledTrackId”) so “play next” runs only once per track. Clear the guard when the next track is playing or after a short timeout to avoid double-fire.

### 4.4 Clearing session

- When the user plays something that is not part of the session (e.g. track from another playlist or album), clear session and internal queue and set `playingFrom` to `null`.
- Detect by: current track’s album is not in `session.albumsList`. Optionally also clear on any new `playTrack` from a different context (already achieved by `clearSession()` at start of `playFromPlaylist`).

---

## 5. Component and Composable Changes

### 5.1 `useSpotifyPlayer.js`

- **Add** `setPlayingFrom(context)`: sets `playingFrom.value = context` (or `null`). Called when starting/clearing a playlist session so the UI can show “playing from playlist X” without passing context into `playTrack`.
- **No change** to `playTrack(trackUri, context)`. Callers pass `context = null` for playlist internal-queue flow so the request body is `{ uris: [trackUri] }`.
- **Keep** `addToQueue` and `getQueue` for other uses; playlist flow will not use them for “what’s next”.

### 5.2 `queueBatchUtils.js`

- **Add** `getNextTrackUrisForAlbums(albums, selectionOpts, { selectNextTrackUriForAlbum })` → `Promise<string[]>`.
- Same logic as `addAlbumBatchToQueue` but collect URIs into an array and return; no `addToQueue` call.
- **Keep** `addAlbumBatchToQueue` if still used elsewhere; otherwise it can be removed or left for backward compatibility during migration.

### 5.3 `useQueueSession.js`

- **State:** Keep `session` ref. Add `upcomingUris` ref (array of track URIs). Remove use of `getQueue` and `addToQueue` for top-up.
- **setSession(payload, initialUris):** Set `session.value` from payload. Set `upcomingUris.value = initialUris ?? []`. Optional: if `initialUris` is shorter than 10, refill immediately to 10.
- **clearSession():** Set `session.value = null`, clear `upcomingUris`, reset any “advancing”/loop flags. Call `setPlayingFrom(null)`.
- **Track-ended handling:** Watch `position`, `duration`, `currentTrack` (and optionally `isPlaying`). When session exists and current track and `(duration - position) <= 500` with guard:
  - If `upcomingUris.length === 0`, refill first (next albums or full list for loop) using `getNextTrackUrisForAlbums`, append to `upcomingUris`.
  - Shift one URI from `upcomingUris`, call `playTrack(nextUri)` (no context).
  - If `upcomingUris.length < 10`, refill in background to keep 10 ahead.
- **Optional:** Watch `currentTrack` to clear session when the current track’s album is not in `session.albumsList` (user left the playlist).
- **Remove:** Logic that calls `getQueue()` and `addAlbumBatchToQueue` for top-up/loop.

### 5.4 `usePlaylistPlay.js`

- **playFromPlaylist:** For **multi-album** playlist context (e.g. `playlistId` and `albumsList?.length > 0` and `albumId`):
  - Call `playTrack(trackUri, null)` (no context).
  - Build initial internal queue: `findRemainingAlbums(albumsList, albumId)` → `getNextTrackUrisForAlbums(remainingAlbums, selectionOpts, { selectNextTrackUriForAlbum })`. Refill to 10 if needed (e.g. if remaining is fewer than 10, add from start of list for loop).
  - Call `setSession({ playlistId, playlistName, albumsList, playlistTrackIds }, initialUris)`.
  - Call `setPlayingFrom({ type: 'playlist', id: playlistId, name: playlistName })`.
- For **album-only** context (single album): keep current behaviour — `playTrack(trackUri, context)` with album context, no session, no internal queue.
- **Remove:** `addAlbumBatchToQueue` and `addToQueue` usage for the playlist path.

### 5.5 `PlaylistSingle.vue` — `handlePlayPlaylist`

- **Unify with session + internal queue:** Use the same flow as TrackList so that “Play” on the playlist gets top-up and loop.
- **Option A:** Call a shared “start playlist from first album” helper that: gets first track URI via `selectNextTrackUriForAlbum(firstAlbum, selectionOpts)` (reuse same selection as TrackList), calls `playTrack(firstUri, null)`, builds `initialUris` for remaining albums (and refills to 10 using loop if needed), then `setSession(..., initialUris)` and `setPlayingFrom({ type: 'playlist', id, name })`.
- **Option B:** Reuse `playFromPlaylist(firstTrack, { playlistId, playlistName, albumsList: sortedAlbumsList, albumId: firstAlbum.id, playlistTrackIds })` by building the synthetic first track and context so one code path handles both.
- **Remove:** The local loop that calls `addToQueue(trackUri)` for each remaining album.
- Ensure `playlistTrackIds` (and any data needed for `selectNextTrackUriForAlbum`) is available when starting the playlist (e.g. from existing playlist data on the page).

### 5.6 `TrackList.vue`

- No change to the call site; `playFromPlaylist(track, playlistContext)` signature unchanged. Internal queue is built inside `usePlaylistPlay` and passed into `setSession`.

### 5.7 `useQueueTrackSelection.js`

- No change. Still used to compute the next track URI per album.

### 5.8 Types / docs

- **`types/queueSession.js`** (or equivalent): Document that the session is used with an internal queue `upcomingUris` and refill rule (10 ahead, loop when at end of list).

---

## 6. Edge Cases and Behaviour

| Case | Behaviour |
|------|-----------|
| User skips or plays another track | When current track’s album is not in `session.albumsList`, clear session and internal queue, call `setPlayingFrom(null)`. |
| Double-fire “track ended” | Guard (e.g. advancing flag or lastHandledTrackId) so “play next” runs once per track; clear when next track is current. |
| No next track for an album | `selectNextTrackUriForAlbum` returns null; skip that album when building/refilling. If entire refill is empty, leave queue empty and do nothing (playback stops) or skip to next album. |
| Loop | When refilling and current album is last in list, use full `albumsList` as the next batch. |
| Refill to 10 when list is small | If there are fewer than 10 albums total, refill with loop so we still have up to 10 URIs (e.g. [A,B,C] → [A,B,C,A,B,C,A,B,C,A]). |

---

## 7. Implementation Order

1. **queueBatchUtils.js** — Add `getNextTrackUrisForAlbums`, keep or remove `addAlbumBatchToQueue` per usage.
2. **useSpotifyPlayer.js** — Add `setPlayingFrom(context)`.
3. **useQueueSession.js** — Add `upcomingUris`, extend `setSession` with initial URIs, implement track-ended watch and “play next” + refill (10 ahead, loop), clear session and `setPlayingFrom(null)` in `clearSession`; remove Spotify queue top-up.
4. **usePlaylistPlay.js** — For multi-album playlist: `playTrack(uri, null)`, build initial URIs, `setSession(..., initialUris)`, `setPlayingFrom(...)`; remove `addAlbumBatchToQueue` for that path.
5. **PlaylistSingle.vue** — Unify `handlePlayPlaylist` with shared flow (session + internal queue); remove `addToQueue` loop.
6. **types/queueSession.js** — Document internal queue and refill behaviour.

---

## 8. Testing and Acceptance

- From **TrackList**, click a track in a multi-album playlist: playback starts with that track; when it ends, the next track (next album, least played / longest ago) plays; queue refills to 10; at end of list playback loops to first album.
- From **Playlist “Play”** button: same behaviour (first track of first album, then same progression and loop).
- “Playing from this playlist” (play/pause, context label) still correct.
- Playing a track from another playlist or album clears the session and stops the internal queue.
- Album view (single album) unchanged: still uses Spotify context, no internal queue.
