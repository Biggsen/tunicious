# PlaylistSingle Album Data Management Refactor Specification

**Status:** 📋 Planning

## Overview

This document specifies a refactor of the album data management in `PlaylistSingle.vue` to improve efficiency and clarity. The current implementation has redundant computed properties and processes more data than necessary for pagination.

## Problem Statement

### Current Issues

1. **Redundant Computed Properties**: 
   - `sortedAlbumsList` processes ALL albums in the playlist (potentially hundreds/thousands)
   - `paginatedAlbums` is just a slice of `sortedAlbumsList`
   - This creates unnecessary computation for albums not on the current page

2. **Data Availability Mismatch**:
   - `albumData.value` only contains Spotify data for the current page (20 albums)
   - `sortedAlbumsList` tries to merge data for ALL albums
   - For albums not on current page, it falls back to `albumRootDataMap`, which may have incomplete data
   - This means `sortedAlbumsList` does heavy work (sorting + merging) but only has complete data for the current page

3. **Unclear Separation of Concerns**:
   - `sortedAlbumsList` handles both sorting AND data merging
   - The relationship between `sortedAlbumsList` and `paginatedAlbums` is not immediately clear
   - The full sorted list is needed for `albumsList` prop (queue functionality), but pagination only needs the current page

### Current Architecture

```javascript
// Current flow:
albumsWithDates.value (all album IDs with dates)
  ↓
sortedAlbumsList (computed)
  - Sorts ALL albums
  - Merges data from albumData.value (current page only) + albumRootDataMap
  - Returns full sorted list
  ↓
paginatedAlbums (computed)
  - Slices sortedAlbumsList for current page
  - Used for rendering
```

**Files Affected:**
- `src/views/playlists/PlaylistSingle.vue`

**Key Computed Properties:**
- `sortedAlbumsList` (lines ~680-769): Sorts all albums and merges data
- `paginatedAlbums` (lines ~641-645): Slices sortedAlbumsList for current page

**Dependencies:**
- `albumsWithDates.value`: Full list of album IDs with dates
- `albumData.value`: Spotify data for current page only
- `albumRootDataMap.value`: Cached root album details (may be incomplete for non-current-page albums)
- `sortedAlbumIds.value`: Sorted list of album IDs (used for pagination)

## Proposed Solution

### Architecture Changes

1. **Separate Sorting from Data Merging**:
   - Keep `sortedAlbumIds` as the source of truth for sort order (already exists)
   - Only merge full data for albums on the current page
   - Create a lightweight sorted list structure for pagination

2. **Optimize Data Loading**:
   - Only fetch/merge complete album data for the current page
   - Use `albumRootDataMap` as a cache for basic info (name, artist, rymLink) when needed
   - Avoid processing all albums when only displaying a page

3. **Clarify Property Responsibilities**:
   - `sortedAlbumIds`: Sorted list of album IDs (already exists, used for pagination)
   - `paginatedAlbums`: Current page albums with full merged data
   - `fullSortedAlbumsList`: Lightweight sorted list for queue functionality (only when needed)

### Proposed Architecture

```javascript
// Proposed flow:
sortedAlbumIds.value (sorted album IDs - already exists)
  ↓
paginatedAlbums (computed)
  - Gets IDs for current page from sortedAlbumIds
  - Fetches/merges data only for current page albums
  - Returns complete album objects for rendering
  ↓
fullSortedAlbumsList (computed, lazy/optional)
  - Only computed when albumsList prop is needed
  - Lightweight structure (IDs + basic info from cache)
  - Used for queue functionality
```

## Implementation Plan

### Phase 1: Refactor `paginatedAlbums`

1. **Update `paginatedAlbums` computed property**:
   - Remove dependency on `sortedAlbumsList`
   - Use `sortedAlbumIds.value` directly for pagination
   - Only merge data for albums on current page
   - Ensure `rymLink` and other root data is properly merged

2. **Update data merging logic**:
   - Merge `albumData.value` (Spotify data) with `albumRootDataMap.value` (root details)
   - Ensure all necessary fields are included (rymLink, artistName, etc.)
   - Handle cases where data might be missing

### Phase 2: Optimize `sortedAlbumsList` (if still needed)

1. **Make `sortedAlbumsList` lazy/conditional**:
   - Only compute when `albumsList` prop is actually needed
   - Use lightweight structure (IDs + cached basic info)
   - Avoid full data merging for all albums

2. **Alternative: Create separate lightweight list**:
   - Create `fullSortedAlbumsList` only when needed
   - Use cached data from `albumRootDataMap` for basic info
   - Don't fetch full Spotify data for all albums

### Phase 3: Testing & Validation

1. **Verify pagination works correctly**:
   - Test all sort modes (date, year, name, artist, loved)
   - Test sort directions (asc/desc)
   - Verify correct albums appear on each page

2. **Verify data completeness**:
   - Ensure `rymLink` is properly merged and displayed
   - Verify all album fields are available in `AlbumItem`
   - Test with albums that have incomplete cached data

3. **Verify queue functionality**:
   - Test that `albumsList` prop works correctly in `TrackList`
   - Ensure queue operations work with sorted list

4. **Performance validation**:
   - Measure computation time for large playlists (100+ albums)
   - Verify no unnecessary re-computations
   - Check memory usage

## Technical Details

### Current Code Locations

**`src/views/playlists/PlaylistSingle.vue`:**

- Line ~640-645: `paginatedAlbums` computed property
- Line ~680-769: `sortedAlbumsList` computed property
- Line ~1007: `loadCurrentPage` function (loads current page data)
- Line ~975: `fetchAlbumsForPage` function (fetches Spotify data for page)
- Line ~820: `getCachedAlbumDetails` function (gets root album details)

### Key Dependencies

- `sortedAlbumIds.value`: Already sorted list of album IDs
- `albumData.value`: Spotify album data for current page
- `albumRootDataMap.value`: Cached root album details (includes rymLink)
- `albumsWithDates.value`: Full list with dates (used by sortedAlbumsList)

### Data Flow Requirements

1. **Pagination**:
   - Must use `sortedAlbumIds.value` for correct sort order
   - Must merge `albumData.value` + `albumRootDataMap.value` for complete data
   - Must include `rymLink` from root data

2. **Queue Functionality**:
   - Needs full sorted list of albums
   - Can use lightweight structure (IDs + basic cached info)
   - Doesn't need full Spotify data for all albums

## Benefits

1. **Performance**:
   - Only process data for albums on current page
   - Reduce unnecessary computations
   - Faster page loads for large playlists

2. **Clarity**:
   - Clear separation between sorting and data merging
   - Easier to understand data flow
   - Better maintainability

3. **Efficiency**:
   - Avoid fetching/processing data for albums not displayed
   - Better use of cached data
   - Reduced memory usage

## Risks & Considerations

1. **Breaking Changes**:
   - Must ensure `albumsList` prop still works for queue functionality
   - Verify all components using album data still work correctly

2. **Data Completeness**:
   - Ensure `rymLink` and other merged fields are still available
   - Handle edge cases where cached data is incomplete

3. **Sorting Logic**:
   - Must preserve all existing sort modes and directions
   - Ensure pagination respects sort order correctly

## Success Criteria

1. ✅ `paginatedAlbums` only processes current page albums
2. ✅ All sort modes work correctly
3. ✅ `rymLink` and other merged data is available in `AlbumItem`
4. ✅ Queue functionality (`albumsList` prop) still works
5. ✅ Performance improved for large playlists
6. ✅ Code is clearer and more maintainable

## Related Files

- `src/views/playlists/PlaylistSingle.vue` - Main file to refactor
- `src/components/AlbumItem.vue` - Receives album data
- `src/components/TrackList.vue` - Uses `albumsList` prop for queue functionality

## Notes

- This refactor should be done carefully to avoid breaking existing functionality
- Consider adding unit tests for the computed properties
- May want to add performance benchmarks before/after
- The current implementation works, so this is an optimization, not a bug fix

