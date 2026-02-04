# Playlists Page Lazy-Load and Per-Pipeline Reload Specification

## **Status**: Complete

**Last verified**: Implementation complete; lazy-load and per-tab reload working as specified.

## Overview

This document specifies changes to the Playlists page (`PlaylistView.vue`) to improve initial load time by loading only the first (or active) pipeline from Spotify on mount, loading other pipelines when the user switches tabs, and replacing the global Reload button with a per-pipeline reload control inside the tab content.

## Goals

1. **Faster initial load**: Load Spotify data only for the first/active pipeline on page load instead of all pipelines.
2. **Lazy-load on tab switch**: When the user clicks a different pipeline tab, load that pipeline’s Spotify data if not already loaded (or from cache).
3. **Per-pipeline reload**: Remove the global Reload button; add a reload control in the tab content (above the first playlist) so the user can refresh only the current pipeline.
4. **Cache compatibility**: Keep the existing single-key cache shape; allow the cached object to be partial (only some groups). No change to `updatePlaylistInCache` / `removePlaylistFromCache` contract.

## Current State

### Data Flow

- **Firestore**: `fetchUserPlaylists(userId)` in `usePlaylistData.js` runs one query for all playlists for the user and groups them client-side by `group` (pipeline name). This returns all pipelines’ metadata (playlistId, firebaseId, pipelineRole, etc.) in one go. This is not the bottleneck.
- **Spotify**: In `PlaylistView.vue`, `loadPlaylists()` runs after `fetchUserPlaylists`. It either:
  - Reads from cache (`getCache(cacheKey)` → `playlist_summaries_${userId}`) and uses the full cached object, or
  - Loops over **every** `availableGroups` and for each group loops over every playlist and calls `getPlaylist(playlistData.playlistId)` (Spotify API). So N Spotify calls where N = total playlists across all pipelines. This is the slow path.

### UI

- Tabs are shown only when `allPlaylistsLoaded` is true (all pipelines have Spotify data).
- A global “Reload” button calls `handleClearCache()` then `loadPlaylists()`, clearing the single cache key and reloading all pipelines from Spotify.

### Cache

- **Key**: `playlist_summaries_${user.uid}` (one key per user).
- **Value**: Object `{ [group]: [...playlist summaries], ... }`. Currently populated with all groups when `loadPlaylists()` runs without cache.
- **Helpers**: `updatePlaylistInCache(cacheKey, playlistId, playlistData)` and `removePlaylistFromCache(cacheKey, firebaseId)` in `src/utils/cache.js` assume the value is an object keyed by group; they iterate over groups, update/remove, then `setCache(cacheKey, cachedData)`. They do **not** require every group to be present—only that the value is that shape. A partial object (some groups missing) is valid.

## Proposed Solution

### 1. Lazy-load pipelines

- **On mount (after `fetchUserPlaylists`)**:
  - Read cache: `getCache(cacheKey)`. If present, set `playlists.value = cachedPlaylists` (may be partial or full).
  - Determine active tab: use `sessionStorage.getItem('activeTab')` if set and in `availableGroups`, else first group in `availableGroups`.
  - If the active pipeline’s group is missing from `playlists.value` (or empty), load only that group from Spotify (see “Load one pipeline” below) and merge into `playlists.value`, then `setCache(cacheKey, playlists.value)`.
- **When user switches tab** (`activeTab` changes): If `playlists.value[activeTab]` is missing or empty, load that pipeline from Spotify (same “Load one pipeline” logic), merge, then `setCache(cacheKey, playlists.value)`.
- **Show UI earlier**: Instead of requiring `allPlaylistsLoaded`, show the tab bar and content when `availableGroups.length > 0` and the **active** pipeline has data (e.g. `playlists.value[activeTab]?.length > 0` or a dedicated `activePipelineLoaded` computed). For tabs that haven’t been loaded yet, tab label can show count from `userPlaylists[group].length`.

### 2. “Load one pipeline” helper

- Extract or add a function `loadPipelinePlaylists(group)` (or equivalent) that:
  - Takes a group name.
  - Gets `userPlaylists.value[group]` (Firestore data).
  - For each playlist in that group, calls `getPlaylist(playlistData.playlistId)` and builds the same summary shape (id, firebaseId, name, images, tracks.total, pipelinePosition, totalPositions, pipelineRole).
  - Returns or assigns the array for that group. Caller merges into `playlists.value[group]` and optionally updates cache with `setCache(cacheKey, playlists.value)`.

### 3. Remove global Reload button

- Remove the Reload `BaseButton` that calls `handleClearCache` from the Playlists page header.
- Remove or repurpose `handleClearCache` if nothing else uses it (e.g. Account cache management may clear by key; if so, keep only the cache-clear utility as needed elsewhere).

### 4. Per-pipeline reload in tab content

- In the tab content area (the block that renders `currentPlaylists` and the `PlaylistItem` list), add a reload control **above** the first playlist.
- The control triggers “reload this pipeline only”: e.g. clear `playlists.value[activeTab]` (and optionally that group from cache, or overwrite by re-fetching), then call `loadPipelinePlaylists(activeTab)` and merge + `setCache`.
- Optionally show a loading state for that pipeline only (e.g. `reloadingGroup === activeTab` and a spinner on the reload button or inline).

### 5. Cache strategy (no breaking changes)

- Keep single key `playlist_summaries_${user.uid}` and the same value shape `{ [group]: [...] }`.
- Allow the cached value to be **partial**: only groups that have been loaded at least once are present. Existing `updatePlaylistInCache` and `removePlaylistFromCache` continue to work; they only touch groups that exist in the cached object.
- When writing cache after loading one pipeline, use `setCache(cacheKey, playlists.value)` so the stored object is the current in-memory state (which may include multiple groups as the user switches tabs).

### 6. Edge cases

- **Reload (per-pipeline)**: Clearing cache for “this pipeline only” can be implemented by deleting `playlists.value[activeTab]`, then calling `loadPipelinePlaylists(activeTab)` and merging. To avoid leaving stale cache, re-fetch and then `setCache(cacheKey, playlists.value)` so the cache is updated with the new data for that group.
- **Tab count for unloaded pipelines**: Use `userPlaylists[group].length` for the count in the tab label when `playlists.value[group]` is missing or empty, so users see how many playlists are in each pipeline without loading Spotify data.

## Technical Implementation

### Files to modify

- **`src/views/playlists/PlaylistView.vue`**
  - Replace “load all groups” in `loadPlaylists()` with “load active group only” (and respect cache for that group if present).
  - Add `loadPipelinePlaylists(group)` (or equivalent) and use it on mount for active tab and on tab switch when group not loaded.
  - Change “show tabs + content” condition from `allPlaylistsLoaded` to “active pipeline loaded” (and `availableGroups.length > 0`).
  - Tab label count: use `filteredPlaylists[group]?.length ?? userPlaylists[group]?.length ?? 0` (or equivalent) so unloaded tabs show Firestore count.
  - Remove global Reload button and `handleClearCache` usage from this view (remove button; keep or remove `handleClearCache` depending on other usages).
  - In tab content, add reload control above the playlist list; wire to per-pipeline reload (clear that group, call `loadPipelinePlaylists(activeTab)`, merge, `setCache`). Optionally add `reloadingGroup` ref and loading UI for that pipeline.

### Cache and composables

- **`src/utils/cache.js`**: No changes required. Partial cache supported.
- **`src/composables/usePlaylistUpdates.js`**: No changes required; it works with whatever groups exist in the state/cache.
- **`src/composables/usePlaylistData.js`**: No changes required; `fetchUserPlaylists` and `getAvailableGroups` stay as-is.

## Acceptance Criteria

- [x] Initial load only fetches Spotify data for the first (or restored active) pipeline; other pipelines are not requested until the user switches to that tab.
- [x] Switching to a tab that hasn’t been loaded yet triggers loading of that pipeline only (from Spotify, or from cache if that group was loaded in a previous session).
- [x] Tab bar and content appear as soon as the active pipeline has data (and `availableGroups.length > 0`), not only when all pipelines are loaded.
- [x] Tab labels show the correct count: Spotify-loaded count when available, otherwise Firestore count for that group.
- [x] Global Reload button is removed from the Playlists page.
- [x] A per-pipeline reload control exists in the tab content above the playlist list and refreshes only the current pipeline’s Spotify data; cache is updated for that group.
- [x] Existing behavior for `refreshSpecificPlaylists` (e.g. playlists-updated event) and `removePlaylistFromCache` / `updatePlaylistInCache` continues to work with partial cache.
- [x] Per-pipeline loading indicator (spinner + “Loading” text when switching to an unloaded tab; spinner on reload button while refreshing).

## Notes

- Restoring `activeTab` from sessionStorage is already in place; ensure the “load on mount” path uses that as the initial pipeline to load when cache is empty or that group is missing.
- If cache is full (legacy), first load can still hydrate from cache and show all tabs immediately; lazy-load then only applies when a group is missing from cache or when the user explicitly reloads one pipeline.
