# Playlist Name Field Removal & Caching Strategy Specification

## Status: ✅ Implementation Complete

## Problem Statement

The playlist `name` field stored in Firebase is causing inconsistencies throughout the application:

1. **Stale Data**: When users rename playlists in Spotify, the Firebase `name` field becomes outdated
2. **Inconsistent Display**: Some views use Spotify playlist names (accurate), others use Firebase `name` field (potentially stale)
3. **Historical Data Issues**: Album history stores `playlistName` from Firebase `name`, which becomes incorrect over time
4. **Maintenance Burden**: Keeping historical records in sync would require recursive updates across all albums

### Current State

**Where Firebase `name` field is used:**
- Album history entries (`playlistHistory.playlistName`)
- Homepage movement items (shows stale names)
- Edit Playlist pipeline connection dropdowns
- Form validation and storage

**Where Spotify playlist name is used:**
- PlaylistView (fetches from Spotify API)
- PlaylistSingle (fetches from Spotify API or unified cache)

## Solution Overview

Remove the `name` field entirely and implement a caching strategy that:
1. Resolves playlist names from existing caches when available
2. Falls back to Spotify API when needed
3. Stores only `playlistId` in album history (no `playlistName`)
4. Leverages existing cache infrastructure (unified track cache, playlist summaries cache)

## Goals

1. ✅ Remove all references to Firebase `name` field
2. ✅ Update album history to store only `playlistId` (remove `playlistName`)
3. ✅ Implement playlist name resolution utility
4. ✅ Update all UI components to use resolved names
5. ✅ Maintain performance (minimize API calls through caching)

## Implementation Plan

### Phase 1: Create Playlist Name Resolution Utility

**File**: `src/utils/playlistNameResolver.js` (new file)

Create a utility that resolves playlist names from multiple sources in priority order:

1. **Unified Track Cache** (`cache.playlists[playlistId].playlistName`)
2. **Playlist Summaries Cache** (`playlist_summaries_${userId}`)
3. **Spotify API** (with caching)

**Functions:**
- `resolvePlaylistName(playlistId, userId)` - Resolve single playlist name
- `resolvePlaylistNames(playlistIds, userId)` - Batch resolve multiple playlist names
- `getPlaylistNameFromCache(playlistId, userId)` - Check caches only (no API call)

**Implementation Notes:**
- Use existing cache utilities (`getCache`, `loadUnifiedTrackCache`)
- Batch API calls when multiple playlists need resolution
- Cache resolved names temporarily to avoid duplicate API calls in same session

### Phase 2: Remove Firebase `name` Field References

#### 2.1 Remove from Firebase Reads

**Files to update:**

1. **`src/composables/usePlaylistData.js`**
   - Remove `name: playlist.name` from line 194, 223
   - Remove `playlist.name` from log on line 203
   - Update return structure to not include `name`

2. **`src/views/playlists/EditPlaylistView.vue`**
   - Remove `name: playlistData.name || ''` from form initialization (line 110)
   - Remove `name` field from form object (line 29)
   - Remove name validation (line 167-168)
   - Remove name input field from template (lines 278-294)
   - Update `loadAvailablePlaylists()` to fetch names from cache/API (line 152)

#### 2.2 Remove from Firebase Writes

**Files to update:**

1. **`src/views/playlists/AddPlaylistView.vue`**
   - Remove `name` from form data (line 253)
   - Remove name input field (lines 128-137)
   - Remove name validation (lines 363-364)
   - Remove `name` from Firestore write (line 388)
   - Update playlist selection to use Spotify name (line 346)

2. **`src/views/playlists/EditPlaylistView.vue`**
   - Remove `name: form.value.name.trim()` from update (line 203)

3. **`src/views/playlists/PlaylistSingle.vue`**
   - Remove `updatePlaylistName()` function (lines 1127-1158)
   - Remove button that calls it (line 2570)
   - Remove condition `!playlistDoc.data().name`

4. **`src/composables/usePipelineGeneration.js`**
   - Remove `name: playlist.name` from Firestore write (line 114)
   - Update display name generation to use Spotify name or generate from role (lines 81-82)
   - Update connection key generation (lines 126, 154, 156) - use `playlistId` instead of `name`

#### 2.3 Remove from Album History

**Files to update:**

1. **`src/composables/useAlbumsData.js`**
   - Remove `playlistName: _playlistData.name` from history entry (line 377)
   - Store only `playlistId` in history
   - Update return type comment (line 105) to remove `playlistName`

### Phase 3: Update Display Components

#### 3.1 Movement Items (Homepage)

**File**: `src/composables/useLatestMovements.js`

**Changes:**
- Remove `playlistName` from movement objects (lines 87, 98, 100)
- Add playlist name resolution after fetching movements
- Use `resolvePlaylistNames()` to batch resolve all unique playlist IDs
- Update `formatMovement()` to use resolved names

**Implementation:**
```javascript
// After fetching movements, collect unique playlist IDs
const playlistIds = new Set();
movements.forEach(m => {
  if (m.toPlaylistId) playlistIds.add(m.toPlaylistId);
  if (m.fromPlaylistId) playlistIds.add(m.fromPlaylistId);
});

// Resolve all names at once
const playlistNames = await resolvePlaylistNames(Array.from(playlistIds), user.value.uid);

// Map resolved names back to movements
movements.forEach(m => {
  m.toPlaylist = playlistNames[m.toPlaylistId] || 'Unknown Playlist';
  m.fromPlaylist = m.fromPlaylistId ? (playlistNames[m.fromPlaylistId] || 'Unknown Playlist') : null;
});
```

#### 3.2 Edit Playlist Dropdowns

**File**: `src/views/playlists/EditPlaylistView.vue`

**Changes:**
- Update `loadAvailablePlaylists()` to resolve names from cache/API
- Display resolved names in dropdowns (lines 363, 389)

**Implementation:**
```javascript
async function loadAvailablePlaylists() {
  // ... existing code to get playlists from Firebase ...
  
  // Resolve names for all playlists
  const playlistIds = allPlaylists.map(p => p.id);
  const resolvedNames = await resolvePlaylistNames(playlistIds, user.value.uid);
  
  // Add resolved names to playlist objects
  allPlaylists.forEach(p => {
    p.name = resolvedNames[p.id] || `${p.group} ${p.pipelineRole}`;
  });
  
  availablePlaylists.value = allPlaylists;
}
```

#### 3.3 Other Display Components

**Files to verify/update:**

1. **`src/components/PlaylistItem.vue`**
   - Verify it's using Spotify name from cache (likely already OK)
   - If using `playlist.name`, ensure it's from Spotify cache, not Firebase

2. **`src/components/AlbumItem.vue`**
   - Update `playlistName` prop usage (line 308)
   - Ensure it receives resolved Spotify name

3. **`src/views/playlists/PlaylistView.vue`**
   - Remove fallback to `playlistData.name` (line 180)
   - Already uses Spotify name, but verify fallback logic

### Phase 4: Update Pipeline Generation

**File**: `src/composables/usePipelineGeneration.js`

**Changes:**
- Remove `name` field from Firestore writes
- Update connection key generation to use `playlistId` instead of `name`
- Update display name generation (use Spotify name or generate from role)

**Implementation:**
- After creating Spotify playlists, use Spotify names for display
- Use `playlistId` for connection keys instead of `name`
- Update connection mapping logic

### Phase 5: Cleanup & Testing

#### 5.1 Remove Unused Code
- Remove `updatePlaylistName()` function
- Remove name field from form objects
- Remove name validation logic
- Clean up any unused imports

#### 5.2 Testing Checklist

**Functional Tests:**
- [x] Create new playlist (should not require name field) ✅
- [x] Edit playlist (should not show name field) ✅
- [x] View playlists (should show Spotify names) ✅
- [x] View single playlist (should show Spotify name) ✅
- [x] Homepage movements (should show correct playlist names) ✅
- [x] Edit playlist dropdowns (should show correct playlist names) ✅
- [x] Album history (should store only playlistId) ✅
- [x] Move album between playlists (should work correctly) ✅
- [x] Pipeline generation (should create playlists without name field) ✅

**Performance Tests:**
- [x] Verify no excessive API calls when resolving names ✅
- [x] Verify cache is being used effectively ✅
- [x] Verify batch resolution works for multiple playlists ✅

**Edge Cases:**
- [x] Playlist not found in cache (should fetch from API) ✅
- [x] Playlist deleted from Spotify (should handle gracefully) ✅
- [x] Network error when fetching name (should show fallback) ✅
- [x] Old album history entries (should still work with playlistId only) ✅

## Migration Strategy

### Data Migration

**Existing Data:**
- Existing Firebase documents with `name` field can remain (will be ignored)
- Existing album history with `playlistName` can remain (will be ignored, resolved on-demand)
- No database migration required - code will simply stop reading/writing the field

**Backward Compatibility:**
- Code should gracefully handle missing `playlistName` in history
- Code should gracefully handle missing `name` in Firebase documents
- Old history entries will resolve names on-demand when displayed

### Rollout Plan

1. **Phase 1**: Create name resolution utility (no breaking changes)
2. **Phase 2**: Update components to use resolution utility (backward compatible)
3. **Phase 3**: Remove `name` field writes (stops storing new data)
4. **Phase 4**: Remove `name` field reads (stops using stored data)
5. **Phase 5**: Cleanup and testing

## Files to Modify

### New Files
- `src/utils/playlistNameResolver.js` - Name resolution utility

### Modified Files
1. `src/composables/usePlaylistData.js`
2. `src/composables/useAlbumsData.js`
3. `src/composables/useLatestMovements.js`
4. `src/composables/usePipelineGeneration.js`
5. `src/views/playlists/AddPlaylistView.vue`
6. `src/views/playlists/EditPlaylistView.vue`
7. `src/views/playlists/PlaylistSingle.vue`
8. `src/views/playlists/PlaylistView.vue`
9. `src/components/PlaylistItem.vue` (verify)
10. `src/components/AlbumItem.vue`

## Performance Considerations

### Caching Strategy
- **Unified Track Cache**: Already stores `playlistName` from Spotify
- **Playlist Summaries Cache**: Already stores playlist names from Spotify
- **Session Cache**: Temporary in-memory cache for resolved names during same session

### API Call Minimization
- Batch resolve multiple playlist names in single operation
- Check all caches before making API calls
- Cache resolved names temporarily to avoid duplicate calls
- Use existing cache infrastructure (no new cache needed)

### Expected API Calls
- **Best case**: 0 API calls (all names from cache)
- **Worst case**: 1 API call per unique playlist (when not in cache)
- **Typical case**: Most names from cache, few API calls for missing ones

## Risk Assessment

### Low Risk
- Removing unused field writes
- Using existing cache infrastructure
- Backward compatible (old data still works)

### Medium Risk
- Name resolution utility (new code, needs testing)
- Batch resolution logic (complexity)
- Performance impact of API calls (mitigated by caching)

### Mitigation
- Comprehensive testing of name resolution
- Fallback to "Unknown Playlist" if resolution fails
- Monitor API call frequency in production
- Gradual rollout with feature flag if needed

## Success Criteria

1. ✅ All references to Firebase `name` field removed
2. ✅ Album history stores only `playlistId` (no `playlistName`)
3. ✅ All UI components display correct Spotify playlist names
4. ✅ No increase in API call frequency (caching effective)
5. ✅ All existing functionality works correctly
6. ✅ No breaking changes for existing data

## Notes

- The `name` field will remain in existing Firebase documents but will be ignored
- Old album history entries with `playlistName` will be resolved on-demand
- No database migration script needed
- Can be rolled back by reverting code changes (data still exists)

## Related Issues

- Playlist name mismatch bug (this spec addresses it)
- Potential future: Add playlist name sync utility if needed (but not storing in Firebase)

