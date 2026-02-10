# Playlist Management: Pipeline Awareness & Accurate Remove

## Status: Pending (to be implemented at a later date)

## Overview

This spec defines how the **Playlist Management** page (`PlaylistManagementView.vue`) must be able to distinguish between playlists that are part of a pipeline (and may have user-entry history) and those that are not, so that the **Remove** action can be implemented accurately and safely for Tunicious.

## Background

### Current behaviour

- **Playlist Management** lists the user’s Tunicious playlists (from Spotify) and shows albums per playlist. It uses **useUserSpotifyApi** only (no Firestore playlist data).
- **Remove** currently calls **useUserSpotifyApi.removeAlbumFromPlaylist** (Spotify only). It does **not** call **useAlbumsData.removeAlbumFromPlaylist** (Firestore `removedAt`).
- **Risk**: If the user removes an album from a **pipeline** playlist (e.g. a sink) that already has a **user entry** for that album, Spotify is updated but Firestore is not. The user-entry record then no longer matches the real playlist state.

### Desired behaviour

- The page must know whether a playlist is **in a pipeline** (has a Firestore playlist doc with `group` and `pipelineRole`).
- Where useful, the page may need to know **which albums in a playlist have a user entry** for that playlist (so we can decide whether Remove must do Spotify + Firestore or Spotify-only, or show a warning).
- **Remove** must be implemented so that when a playlist is in a pipeline and the album has a user entry, we perform both Spotify remove and Firestore remove (set `removedAt`). For playlists not in a pipeline or albums with no user entry, behaviour can be defined accordingly (e.g. Spotify-only remove is acceptable, or we still sync Firestore when an entry exists).

## Goals

1. **Differentiate pipeline vs non-pipeline playlists**  
   The Playlist Management page must be able to tell, for each playlist it displays, whether that playlist is registered in a pipeline (exists in Firestore `playlists` with `group` and `pipelineRole`).

2. **Optional: Per-playlist, per-album user-entry awareness**  
   Where necessary for accurate Remove behaviour or UX (e.g. warnings), support a “deeper” query: for a given playlist, which albums (by album id) have a **user entry** for that playlist (i.e. an entry in `albums/{albumId}.userEntries[userId].playlistHistory` for that `playlistId` without `removedAt`).

3. **Accurate Remove**  
   - When the user removes an album from a playlist:
     - If the album has a user entry for that playlist: perform **both** Spotify remove and Firestore remove (set `removedAt`), so the record stays in sync.
     - If the album has no user entry: only Spotify remove is required (no Firestore update).
   - Optionally: when the playlist is in a pipeline, show a short warning or different copy (e.g. “This will remove from the playlist and update your history”) so the user understands the action.

4. **No breaking changes to other flows**  
   PlaylistSingle and other views keep their existing Remove behaviour (Spotify + Firestore). This spec only defines requirements for the Playlist Management page.

## Data Requirements

### 1. Pipeline membership (is playlist in a pipeline?)

- **Source**: Firestore `playlists` collection, filtered by `userId`.
- **Reuse**: Same data as **usePlaylistData** (grouped by `group`; each item has `playlistId`, `group`, `pipelineRole`, etc.).
- **Requirement**: Playlist Management must have access to this data so that for each displayed playlist (by Spotify `id` / `playlistId`) we can derive:
  - `isInPipeline: boolean` (has a Firestore playlist doc with `group` and `pipelineRole`)
  - Optionally: `group`, `pipelineRole` for labelling or warnings.

**Implementation note**: Either use **usePlaylistData** (or its Firestore fetch) and match playlists by `playlistId`, or add a dedicated query that returns pipeline metadata keyed by `playlistId` for the current user. No new Firestore schema is required; the data already exists.

### 2. Which albums have a user entry for a given playlist (optional “deeper query”)

- **Purpose**: To know, for a specific playlist, which of its albums (from Spotify) have a user entry for that playlist, so Remove can:
  - Call Firestore `removeAlbumFromPlaylist` only when an entry exists, and
  - Optionally show different UI (e.g. “Removes from playlist and history” vs “Removes from playlist only”).

- **Possible approaches** (to be chosen at implementation time):
  - **A. On demand when expanding a playlist**  
    When the user expands a playlist to see albums, fetch albums from Spotify (as today) and, for that list of album IDs, check which have a user entry for this `playlistId` (e.g. batch read `albums/{albumId}` and inspect `userEntries[uid].playlistHistory` for an entry with `playlistId` and no `removedAt`).
  - **B. Batch when loading Playlist Management**  
    If we already load all playlists and their album lists, we could batch-check user entries for all visible albums (may be heavier; only if needed for UX).
  - **C. Heuristic**  
    If a playlist is **not** in a pipeline, assume no user entries (or very few) and do Spotify-only remove unless we later add a cheap check. If the playlist **is** in a pipeline, do the deeper query (or always do both Spotify + Firestore remove when in pipeline, to be safe).

- **Requirement**: The design must allow the Remove action to know, at the time of click, whether this album has a user entry for this playlist, so the correct backend calls (Spotify only vs Spotify + Firestore) are made.

## UI / UX Requirements (high level)

- **Pipeline indicator** (required): For each playlist, the UI must make it clear whether it is part of a pipeline (e.g. badge “In pipeline” or group name, or both). This can be a simple label or icon derived from the pipeline-membership data above.

- **Remove behaviour** (required):  
  - If the album has a user entry for this playlist: perform Spotify remove **and** Firestore `removeAlbumFromPlaylist`.  
  - If the album has no user entry: perform Spotify remove only.  
  (Exact confirmation copy and any extra warnings can be defined in a later UX pass.)

- **Optional**: When the playlist is in a pipeline and the user clicks Remove, show a short line of copy that the removal will also update their history (so it’s clear we’re keeping things in sync).

## Out of Scope for This Spec

- Changes to **PlaylistSingle** Remove flow (already correct: Spotify + Firestore).
- Changes to **useAlbumsData.removeAlbumFromPlaylist** or **useUserSpotifyApi.removeAlbumFromPlaylist** signatures or behaviour beyond their current contracts.
- Automatic creation of user entries when loading a playlist (separate from “Add missing to DB” and Add Album flows).
- Cache/surgical-update work for add/move/remove (handled in other specs or future work).

## Summary

| Requirement | Description |
|-------------|-------------|
| Pipeline awareness | Page can tell, per playlist, if it’s in a pipeline (using Firestore `playlists` data). |
| Optional deeper query | For a given playlist, know which albums have a user entry for that playlist. |
| Remove accuracy | When removing an album: if user entry exists → Spotify + Firestore remove; else → Spotify remove only. |
| UI | Show pipeline status per playlist; optionally clarify Remove impact when in pipeline. |

This spec is intended to be implemented when the Playlist Management page is revisited; until then, the current (Spotify-only) Remove remains as-is, with the known risk for pipeline playlists that have user entries.
