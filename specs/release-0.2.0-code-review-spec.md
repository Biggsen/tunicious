# Release 0.2.0 — Code review follow-up spec

**Created:** 2026-03-05  
**Context:** Follow-up work from code review of Release 0.2.0 (album notes, History/Friends/Notes tabs, search by year, playlist name resolution, AlbumView redesign).  
**Scope:** Bug fix (critical), refactors, and small improvements.

---

## 1. Critical: Firestore `userEntries` overwrite

### Problem

In `src/composables/useAlbumsData.js`, both **`updateAlbumNotes`** and **`removeAlbumFromPlaylist`** use:

```js
await setDoc(albumRef, {
  userEntries: {
    [user.value.uid]: { ...userEntry, ... }
  }
}, { merge: true });
```

With `merge: true`, Firestore merges only at the **document top level**. The entire `userEntries` map is **replaced**, so any other users’ entries on that album document are removed. This is a data-loss bug for albums that have multiple users (e.g. shared collections / friends).

### Acceptance criteria

- [ ] **updateAlbumNotes** updates only the current user’s entry. Other users’ `userEntries` are unchanged.
- [ ] **removeAlbumFromPlaylist** updates only the current user’s entry. Other users’ `userEntries` are unchanged.
- [ ] No other album writes are changed unless they have the same bug (audit once).

### Implementation notes

- Use **`updateDoc`** with **dot notation** so only the nested field for this user is written:
  - `updateDoc(albumRef, { [`userEntries.${user.value.uid}`]: { ...userEntry, notes: notes ?? '', updatedAt: serverTimestamp() } })`
  - Same pattern for `removeAlbumFromPlaylist` with the updated `playlistHistory` and `updatedAt`.
- Add **`updateDoc`** to the Firestore imports in `useAlbumsData.js` (from `firebase/firestore`).
- Optional: add a short comment above each call explaining that we use dot notation to avoid overwriting other users’ entries.

---

## 2. Refactors

### 2.1 Year search — dedupe + merge helper (`useAlbumsData.js`)

**Problem:** `searchAlbumsByYear` and `searchAlbumsByYearRange` duplicate the same logic: run two queries (numeric and string `releaseYear`), map with `mapAlbumDoc` + `seenIds`, combine (and in the range case, sort by year).

**Acceptance criteria**

- [ ] A single helper (e.g. `mergeAlbumSnapshots(numSnapshot, strSnapshot)`) returns a deduped array of mapped album objects.
- [ ] `searchAlbumsByYear` uses this helper and returns its result.
- [ ] `searchAlbumsByYearRange` uses this helper, then sorts the result by `releaseYear`, and returns it.
- [ ] Behavior (including deduplication and field mapping) is unchanged.

### 2.2 AlbumView listen tabs — data-driven tabs

**Problem:** The History / Friends / Notes tab buttons are three nearly identical blocks (same classes, only `activeListenTab` and label differ).

**Acceptance criteria**

- [ ] A small config (e.g. `LISTEN_TABS = [{ id: 'history', label: 'History' }, { id: 'friends', label: 'Friends' }, { id: 'notes', label: 'Notes' }]`) drives the tab buttons.
- [ ] Tab buttons are rendered with a single `v-for` over this config.
- [ ] Active state and `aria-current` are derived from `activeListenTab` and the tab `id`.
- [ ] Friends tab still triggers `loadFriendsAlbumData()` on click (e.g. in a handler or conditional in the loop).
- [ ] Visual and a11y behavior unchanged.

### 2.3 PlaylistHistoryTimeline — stable list key

**Problem:** The timeline uses `:key="index"`. If the list can reorder or change, a stable key is better for Vue’s diffing and avoids subtle DOM reuse bugs.

**Acceptance criteria**

- [ ] Each timeline item uses a stable `:key` (e.g. `${entry.playlistId}-${timestamp}` where timestamp is from `addedAt`, or a composite that’s unique per entry).
- [ ] Keys remain unique and stable when the list is re-fetched or reordered.

---

## 3. Simple improvements

### 3.1 AlbumView — remove unused destructuring

- [ ] Remove **`getAlbumTracksForPlaylist`** from the `useUnifiedTrackCache()` destructuring in `src/views/music/AlbumView.vue` (it’s no longer used after playlist-context track loading was removed).

### 3.2 useAlbumsData.js — trailing whitespace

- [ ] Remove trailing space and ensure the file ends with a single newline at the end of `src/composables/useAlbumsData.js`.

### 3.3 (Optional) Delete-note modal — confirm button variant

- [ ] If the design system has a “danger” or “destructive” button variant, use it for the delete-note modal’s confirm button (e.g. `confirm-variant="danger"`) so the action is clearly destructive. Skip if no such variant exists.

### 3.4 (Optional) PlaylistHistoryTimeline — missing playlistId

- [ ] If “no playlist” should be distinguishable from “unknown playlist”, handle falsy `entry.playlistId` explicitly (e.g. show “—” or “Unknown” only when `playlistId` is missing) instead of always using `playlistName(entry.playlistId)` which returns `'Unknown Playlist'`. Otherwise leave as-is.

---

## 4. Out of scope (noted for later)

- **Batch playlist name resolution for friends:** `loadFriendsAlbumData` calls `resolvePlaylistName` per friend in a `Promise.all`. A batch API that accepts `(playlistId, userId)[]` could reduce round-trips; defer unless performance becomes an issue.
- **BaseModal `cancelVariant` default:** Change from `'default'` to `'tertiary'` is already in 0.2.0; no spec change unless reverting or tuning further.

---

## 5. Verification

- [ ] Manually: update notes on an album that has multiple users’ data; confirm only current user’s notes change and other users’ entries remain.
- [ ] Manually: remove album from playlist for one user; confirm other users’ entries on that album are unchanged.
- [ ] Year search: exact and range searches still return correct, deduped results.
- [ ] AlbumView: History/Friends/Notes tabs still work and persist selection; Friends tab still loads data on click.
- [ ] PlaylistHistoryTimeline: list updates correctly when entries change; no console warnings about keys.
- [ ] Lint and any existing tests pass.

---

## 6. Files to touch (summary)

| Area              | File(s) |
|-------------------|---------|
| Firestore fix     | `src/composables/useAlbumsData.js` |
| Year search refactor | `src/composables/useAlbumsData.js` |
| Trailing whitespace | `src/composables/useAlbumsData.js` |
| Tab refactor      | `src/views/music/AlbumView.vue` |
| Unused destructuring | `src/views/music/AlbumView.vue` |
| Stable key        | `src/components/PlaylistHistoryTimeline.vue` |
| Optional modal variant | `src/views/music/AlbumView.vue` |
| Optional timeline copy | `src/components/PlaylistHistoryTimeline.vue` |
