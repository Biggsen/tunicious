# Firestore: Albums, Playlists & User Entries

Reference for the **current** Firestore collections and JSDoc/TypeScript-equivalent shapes for albums, playlists, and per-user album entries (`userEntries`). Fields only — no Spotify client code.

**Source of truth in code:** `src/composables/useAlbumsData.js`, `src/composables/usePlaylistData.js`

**Related:** [Technical Spec: Core Entities & Data Model](./technical-spec-core-entities-data-model.md) (includes target/future model).

---

## Firestore collections

| Collection | Document ID | Notes |
|------------|-------------|--------|
| **`albums`** | Primary album ID (currently: provider album ID) | Shared metadata at root; per-user data under `userEntries` |
| **`playlists`** | Auto-generated Firestore ID | Stage/pipeline config; `playlistId` field holds the external playlist ID |

**`userEntries` is not a top-level collection.** It is a map field on each `albums/{albumId}` document, keyed by Firebase Auth `userId`.

---

## `albums` — root-level fields

| Field | Type | Notes |
|-------|------|--------|
| `albumTitle` | string | |
| `artistName` | string | |
| `artistNameLower` | string | Optional; used for case-insensitive artist prefix search |
| `artistId` | string | Optional |
| `albumCover` | string | Optional |
| `releaseYear` | string \| number | Optional |
| `rymLink` | string \| null | Optional |
| `updatedAt` | timestamp | Optional |
| `userEntries` | `Record<userId, UserAlbumData>` | See below |

### Multi-user write rule

When updating one user's entry, use `updateDoc` with dot notation only: `userEntries.${uid}`. Do **not** use `setDoc` with a full `userEntries` object and `merge: true` — Firestore replaces the entire map at the top level and can wipe other users' data.

---

## `userEntries` — per-user album entry

Each value in `userEntries` is one user's entry for that album. JSDoc name: **`UserAlbumData`**.

### `UserAlbumData`

| Field | Type | Notes |
|-------|------|--------|
| `playlistHistory` | `PlaylistHistoryEntry[]` | Current stage = last entry with `removedAt == null` |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `notes` | string | Optional; used in app (not listed on JSDoc typedef) |

### `PlaylistHistoryEntry`

| Field | Type | Notes |
|-------|------|--------|
| `playlistId` | string | External playlist ID |
| `type` | `'known' \| 'new'` | `PlaylistType` |
| `pipelineRole` | string | |
| `addedAt` | timestamp | Read path may normalize to `Date` |
| `removedAt` | timestamp \| null | `null` = currently in this playlist/stage |

---

## `playlists` — stored fields

Each document represents a pipeline **stage** (e.g. Queued, Curious). Order is derived from `nextStagePlaylistId` / `terminationPlaylistId` links, not a stored ordered list.

| Field | Type | Notes |
|-------|------|--------|
| `playlistId` | string | External playlist ID |
| `userId` | string | Owner |
| `group` | string | e.g. `'known'`, `'new'` |
| `pipelineRole` | string | `'source' \| 'transient' \| 'terminal' \| 'sink'` |
| `nextStagePlaylistId` | string \| null | **Firestore playlist document ID** (not external `playlistId`) |
| `terminationPlaylistId` | string \| null | **Firestore playlist document ID** |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `deletedAt` | timestamp \| null | Optional; soft delete. Missing or `null` = active |

### Derived at read time (not stored)

The `Playlist` JSDoc in `usePlaylistData.js` also includes `pipelinePosition` and `totalPositions`. These are computed when ordering the pipeline. Reads also attach `firebaseId` (the Firestore document ID) alongside `playlistId`.

---

## JSDoc → TypeScript (equivalent)

There is no dedicated `Album` document typedef in the codebase; the root album shape is implied by fetch helpers.

```typescript
type PlaylistType = 'known' | 'new';

interface PlaylistHistoryEntry {
  playlistId: string;
  type: PlaylistType;
  pipelineRole: string;
  addedAt: FirebaseTimestamp | Date;
  removedAt: FirebaseTimestamp | Date | null;
}

interface UserAlbumData {
  playlistHistory: PlaylistHistoryEntry[];
  createdAt: FirebaseTimestamp;
  updatedAt: FirebaseTimestamp;
  notes?: string;
}

interface AlbumDocument {
  albumTitle: string;
  artistName: string;
  artistNameLower?: string;
  artistId?: string;
  albumCover?: string;
  releaseYear?: string | number;
  rymLink?: string | null;
  updatedAt?: FirebaseTimestamp;
  userEntries?: Record<string, UserAlbumData>;
}

interface PlaylistDocument {
  playlistId: string;
  userId: string;
  group: string;
  pipelineRole: string;
  nextStagePlaylistId: string | null;
  terminationPlaylistId: string | null;
  createdAt: FirebaseTimestamp;
  updatedAt: FirebaseTimestamp;
  deletedAt?: FirebaseTimestamp | null;
}

/** In-memory shape after fetch + pipeline ordering (not a Firestore document) */
interface Playlist extends PlaylistDocument {
  firebaseId: string;
  pipelinePosition: number;
  totalPositions: number;
}
```

---

## Security (Firestore rules)

- **`albums`:** Authenticated read. Writes require `userEntries[request.auth.uid]` on the incoming document (users only write their own entry on shared album docs).
- **`playlists`:** Authenticated read. Create/update/delete only when `userId` matches the authenticated user.

See `firestore.rules` for full rule definitions.

---

## Not in the current model

The [core entities technical spec](./technical-spec-core-entities-data-model.md) describes a **target** model with fields not yet in Firestore, including:

- `canonicalAlbumId`, `releaseId`
- `excludedTrackIds`, `trackStats`
- Renamed `stageMembershipHistory` / `stageId` (vs current `playlistHistory` / `playlistId`)

Those are planned for a rebuild; this document reflects **what is stored today**.
