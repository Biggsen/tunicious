# Technical Spec: Core Entities & Data Model

This document specifies the **core entities and data model** for Tunicious. It reflects the [Tunicious Behaviour Spec (Revised)](./tunicious_behavior_spec_revised.md) §§1–2 (Core Entities, Effective Album) and is informed by the current codebase. It is intended to guide a rebuild (e.g. provider-agnostic or YouTube-backed) and to align the data layer with the behaviour spec.

**Scope:** Canonical album, release, user album entry, effective album (excluded tracks), and related storage. Pipelines/stages, playcount, and queue are covered in separate technical specs.

---

## 1. Current Implementation (Reference)

### 1.1 Albums collection (Firestore)

- **Collection:** `albums`
- **Document ID:** Primary album ID (currently: Spotify album ID; deduplication uses this as the single document per “logical” album).
- **Root-level fields (shared):**
  - `albumTitle` (string)
  - `artistName` (string)
  - `artistNameLower` (string) — for case-insensitive artist prefix search
  - `artistId` (string, optional)
  - `albumCover` (string, optional)
  - `releaseYear` (string or number)
  - `rymLink` (string, optional)
  - `updatedAt` (timestamp, optional)
- **Per-user data:** `userEntries` map, keyed by `userId`. Each value is one user’s entry for this album.
  - **Critical:** Writes must update only `userEntries.${uid}` (e.g. via `updateDoc` with dot notation). Replacing the whole `userEntries` map would overwrite other users’ data.
- **User entry shape (current):**
  - `playlistHistory`: array of `{ playlistId, type, pipelineRole, addedAt, removedAt }`. Current stage = last entry with `removedAt == null`.
  - `createdAt`, `updatedAt`: timestamps
  - `notes`: string (optional)
- **No current fields:** `canonicalAlbumId`, `releaseId`, `excludedTrackIds`, `trackStats`. Album identity is effectively “document ID = primary ID”; there is no separate canonical vs release model.

**Indexes / queries (current):**  
Title+artist equality; artist prefix (`artistNameLower`); release year (numeric and string); full collection scan for title prefix (client-side filter). Composite indexes as in project rules/docs.

### 1.2 Album Mappings collection (Firestore)

- **Collection:** `albumMappings`
- **Purpose:** Map an alternate album ID (e.g. another Spotify release of the same album) to the primary album ID. All reads/writes for “this album” use the primary ID; document lives under `albums/{primaryId}`.
- **Fields:** `alternateId`, `primaryId`, `createdAt`, `updatedAt`
- **Index:** Query by `alternateId` (single-field or composite as required)
- **Rules:** Create/update require both IDs; delete restricted (e.g. admin-only) to avoid breaking references.

### 1.3 Tracks and effective tracklist (current)

- **Tracks are not stored in Firestore.** Track lists and metadata come from the provider (e.g. Spotify API). The app uses a **unified track cache** (in-memory + persisted, e.g. IndexedDB) keyed by track ID, holding: track metadata, playcount, loved, and which albums/playlists reference the track.
- **“Effective” tracklist per album per stage:** The current app does **not** have a global “excluded tracks” list on the user’s album entry. Instead it has a **per-playlist, per-album** whitelist: `playlistTrackIds[albumId][trackId] === true` means “this track is in the stage for this album.” Empty map = all album tracks are eligible. This is used for queue logic and UI. So “effective” is currently “all release tracks” or “subset chosen for this stage,” not “release minus excluded.”

### 1.4 Playlists collection (stages)

- **Collection:** `playlists`
- **Role:** Each document represents a **stage** (e.g. Queued, Curious, 1 star). Pipeline order is derived from links (`nextStagePlaylistId`, `terminationPlaylistId`), not from a single ordered list.
- **Fields:** `playlistId`, `userId`, `group`, `pipelineRole`, `nextStagePlaylistId`, `terminationPlaylistId`, `createdAt`, `updatedAt`, `deletedAt` (soft delete).
- **Note:** In a rebuild, “stage” may exist without an external playlist; this spec does not define the stage schema (see Pipelines technical spec).

---

## 2. Target Model (Improved Requirements)

The following aligns with the behaviour spec: **Canonical Album**, **Release**, **User Album Entry**, and **Effective Album**.

### 2.1 Canonical Album

- **Concept:** The underlying musical work (e.g. “In Rainbows”). One canonical album can have multiple **releases** (Standard, Deluxe, Remastered, etc.).
- **Identity:** Stable ID (e.g. `canonicalAlbumId`). In the current app this is implicit (primary album document ID). In the target model it should be explicit so multiple releases can reference the same canonical album.
- **Storage options:**
  - **Option A:** Dedicated `canonicalAlbums` collection: document ID = `canonicalAlbumId`; fields e.g. `displayTitle`, `artistName` (or `artistId`), optional `releases[]` or a separate releases collection.
  - **Option B:** No separate collection; canonical = “the primary album document” and releases are child documents or a subcollection (e.g. `albums/{canonicalAlbumId}/releases/{releaseId}`). Document ID of the “main” album = canonical ID.
- **Recommendation:** For a rebuild, introduce an explicit canonical identity and either a small `canonicalAlbums` collection or a convention (e.g. one release per canonical is “default”; document ID = canonical ID).

### 2.2 Release

- **Concept:** A concrete tracklist version of a canonical album (different track counts, order, bonus discs, etc.).
- **Identity:** `releaseId` (stable).
- **Data:** Track list (ordered), duration, optional metadata (e.g. release type label). Track list can be stored as a subcollection (e.g. `releases/{releaseId}/tracks`) or an ordered array of track references.
- **When user adds an album:** Store `canonicalAlbumId` and `releaseId` on the **user album entry**. The release chosen at add-time is **immutable** (behaviour spec). Users do not switch release later; they shape the effective album via **excluded tracks**.

### 2.3 User Album Entry

- **Unique key:** `(userId, canonicalAlbumId)` — at most one entry per user per canonical album.
- **Structure (target):**
  - `canonicalAlbumId` (string)
  - `releaseId` (string) — immutable after add
  - `excludedTrackIds` (array of track IDs) — see Effective Album
  - `trackStats` (object) — reserved; to be defined (e.g. cached playcount/last-played per track for queue and UI)
  - `stageMembershipHistory` (array) — same semantics as current `playlistHistory`, but with `stageId` instead of `playlistId` (and optional type/role). Each entry: `stageId`, `addedAt`, `removedAt`; current stage = latest with `removedAt == null`.
  - `notes` (string, optional)
  - `createdAt`, `updatedAt` (timestamps)
- **Storage:** Can remain as `albums/{albumId}.userEntries.{userId}` if document ID continues to represent the canonical (or primary) album. If canonical and release are split, user entry might live under a document keyed by `canonicalAlbumId` and still use a single-key update for `userEntries.${uid}`.

### 2.4 Effective Album

- **Definition:** `effectiveTracks = releaseTracks − excludedTrackIds` (set difference). Only effective tracks are used for playback, queue logic, and duration/progress.
- **Excluded tracks:**
  - Stored on the user album entry as `excludedTrackIds[]`.
  - Excluded from main tracklist UI; exposed in a secondary surface (e.g. “Excluded Tracks”).
  - Must be applied whenever: building queue, playing album, computing duration/progress, and displaying “effective” tracklist.
- **Current vs target:** Current app has no `excludedTrackIds`; it has per-stage “included” sets (`playlistTrackIds`). Target model is “all release tracks minus excluded” for a global effective list; stage-specific restrictions (if any) can sit on top (e.g. stage-level filter still applied when building queue for that stage).

### 2.5 Album Mappings (alternate ↔ primary)

- **Purpose:** Unchanged — map alternate IDs (e.g. different edition from provider) to the primary/canonical ID used for storage and deduplication.
- **Fields:** `alternateId`, `primaryId`, `createdAt`, `updatedAt`. Optionally align naming with “canonical” (e.g. `primaryId` = canonical album ID or primary release ID, depending on schema choice).

---

## 3. Storage and Access

### 3.1 Firestore

- **Albums:** Continue to use a single document per “album” (canonical or primary). Prefer `updateDoc(ref, { ['userEntries.' + uid]: { ... } })` for per-user updates; never replace the whole `userEntries` map in one write.
- **Album Mappings:** Keep as a separate collection; index on `alternateId` for fast resolution.
- **Releases (target):** Either subcollection under canonical album (e.g. `albums/{canonicalId}/releases/{releaseId}`) or a top-level `releases` collection with `canonicalAlbumId` for queries. Track list per release: subcollection `releases/{releaseId}/tracks` or embedded ordered list, depending on size and update patterns.

### 3.2 Tracks

- **Current:** Track metadata and playcounts live in the unified track cache; provider (e.g. Spotify) is source of track list for a given album/release.
- **Target:** For a rebuild, track metadata and ordered list per release can be stored in DB (e.g. `releases/{releaseId}/tracks` or a `tracks` collection keyed by track ID with `releaseId`/`canonicalAlbumId`). Playcount cache and “last played” can remain in a local cache keyed by track ID, with Last.fm as source of truth (see Playcount technical spec).

### 3.3 Security (multi-user)

- **Invariant:** Any write that updates one user’s data on a shared document (e.g. album with `userEntries`) must update only that user’s key (e.g. `userEntries.${uid}`). Do not use `setDoc(..., { merge: true })` with a full `userEntries` object — Firestore merge is top-level only and can wipe other users’ entries.
- **Rules:** Existing Firestore rules that enforce “user can only write their own `userEntries`” should be kept and extended if new fields are added to the user entry.

---

## 4. APIs / Operations (Summary)

- **Resolve album ID:** Given an alternate or provider-specific ID, resolve to canonical/primary ID via `albumMappings` (and optionally provider-specific mapping). All DB reads/writes use the resolved ID.
- **Get user album entry:** Fetch `albums/{primaryId}` and read `userEntries[userId]`; apply `excludedTrackIds` when computing effective tracklist.
- **Add album to collection:** Resolve to primary/canonical ID; ensure one entry per (userId, canonicalAlbumId). Create or update user entry with `releaseId`, initial `stageMembershipHistory` entry, and optional `excludedTrackIds: []`.
- **Update excluded tracks:** Update only `userEntries.${uid}.excludedTrackIds` (and `updatedAt`). Recompute effective tracklist wherever it is derived.
- **Move album between stages:** Append-only update to `stageMembershipHistory`: set `removedAt` on current entry, append new entry with new `stageId`, `addedAt`, `removedAt: null`. (See Pipelines technical spec for stage transitions.)
- **Notes:** Update `userEntries.${uid}.notes` and `updatedAt` with a single-key update.

---

## 5. Migration / Compatibility Notes

- **Current → target:** Existing documents have no `canonicalAlbumId` or `releaseId`. Migration can treat current document ID as both canonical and “default release” and backfill `userEntries.*.excludedTrackIds = []` and (if desired) rename `playlistHistory` to `stageMembershipHistory` and `playlistId` to `stageId` in application code. New fields can be added gradually; behaviour spec’s “one entry per canonical album” is already enforced if one document per primary ID is used.
- **playlistTrackIds (current):** Per-stage “which tracks count” can remain in cache or be moved to a small structure per (user, stage, album) if needed; it is complementary to global `excludedTrackIds` (excluded = never play; stage filter = only these in this stage).

---

## 6. Open Decisions

- **Canonical vs primary ID:** Whether to introduce a separate `canonicalAlbums` collection or keep “one document per album” with document ID = canonical/primary.
- **Release storage:** Subcollection under album vs top-level `releases` collection; and whether track list is embedded or a subcollection.
- **trackStats shape:** To be defined in Playcount/queue specs (e.g. playcount, lastPlayedAt per track ID).

---

*This technical spec should be read alongside the [Tunicious Behaviour Spec (Revised)](./tunicious_behavior_spec_revised.md) and the other technical specs (Pipelines & Stages, Playcount, Queue Session, etc.) as they are added.*
