# Tunicious Playlist Tag Specification

## **Status**: 📋 Planning

## Overview

This document specifies the refactoring to rename the playlist identification tag from `[AudioFoodie]` to `[Tunicious]` and make playlist filtering mandatory across the entire application. This ensures that the app only works with playlists that have been explicitly tagged as Tunicious playlists, providing better security and preventing accidental operations on unrelated playlists.

## Goals

1. **Rebrand**: Update all references from AudioFoodie to Tunicious
2. **Enforce Security**: Make playlist filtering mandatory everywhere playlists are loaded
3. **Prevent Accidents**: Ensure no operations can be performed on non-Tunicious playlists
4. **Consistency**: Apply filtering uniformly across all playlist retrieval points

## Current State

### Tag Usage
- **Tag Format**: `[AudioFoodie]` appended to playlist descriptions
- **Function**: `isAudioFoodiePlaylist()` checks for tag presence
- **Filtering**: Optional in some views (e.g., `PlaylistManagementView` has a checkbox)
- **Inconsistency**: Some views filter, others don't

### Problems
- Tag name doesn't match current app name (Tunicious)
- Filtering is optional in `PlaylistManagementView` (can show all playlists)
- `getUserPlaylists()` returns all playlists without filtering
- `getPlaylist()` doesn't validate tag when fetching individual playlists
- No protection against operating on non-Tunicious playlists

## New State

### Tag Format
- **New Tag**: `[Tunicious]` replaces `[AudioFoodie]`
- **Function**: `isTuniciousPlaylist()` replaces `isAudioFoodiePlaylist()`
- **Mandatory**: All playlist operations require the tag

### Mandatory Filtering
- `getUserPlaylists()` filters by default (only returns Tunicious playlists)
- `getPlaylist()` validates tag and throws error if missing
- All views automatically filter (no optional checkboxes)
- UI text updated to reference "Tunicious" instead of "AudioFoodie"

## Data Model Changes

### No Database Changes Required
- Playlist descriptions stored in Spotify (not Firestore)
- Existing playlists will need tag updated manually or via migration script
- Firestore playlists collection doesn't store descriptions

### Tag Migration
- Existing playlists with `[AudioFoodie]` tag will need to be updated
- New playlists will automatically get `[Tunicious]` tag
- Consider providing migration utility to update existing playlists

## Implementation Steps

### Phase 1: Update Core Functions

#### 1.1 Update `useUserSpotifyApi.js`

**Rename function:**
- `isAudioFoodiePlaylist()` → `isTuniciousPlaylist()`
- Update check from `[AudioFoodie]` to `[Tunicious]`

**Update `createPlaylist()`:**
- Change tag from `[AudioFoodie]` to `[Tunicious]`
- Update variable name: `audioFoodieDescription` → `tuniciousDescription`

**Update `getUserPlaylists()`:**
- Add mandatory filtering before returning results
- Only return playlists that have `[Tunicious]` tag
- Filter at API level, not just UI level

**Update `getPlaylist()`:**
- Add validation to check for `[Tunicious]` tag
- Throw error if playlist doesn't have tag
- Prevents operations on non-Tunicious playlists

**Update exports:**
- Export `isTuniciousPlaylist` instead of `isAudioFoodiePlaylist`

### Phase 2: Update Views

#### 2.1 Update `AddPlaylistView.vue`

**Function references:**
- Import `isTuniciousPlaylist` instead of `isAudioFoodiePlaylist`
- Update all calls to use new function name

**UI text updates:**
- "Select AudioFoodie Playlist" → "Select Tunicious Playlist"
- "Loading your AudioFoodie playlists..." → "Loading your Tunicious playlists..."
- "No AudioFoodie playlists found." → "No Tunicious playlists found."
- "Create AudioFoodie playlists" → "Create Tunicious playlists"
- "AudioFoodie: Yes/No" → "Tunicious: Yes/No"

**Filtering:**
- Keep existing filter (now redundant but safe)
- `getUserPlaylists()` already filters, but keep for safety

#### 2.2 Update `PlaylistManagementView.vue`

**Remove optional filtering:**
- Remove `showOnlyAudioFoodie` checkbox
- Remove watch for `showOnlyAudioFoodie`
- Always filter to Tunicious playlists only

**Function references:**
- Import `isTuniciousPlaylist` instead of `isAudioFoodiePlaylist`
- Update all calls to use new function name

**UI text updates:**
- "Show only AudioFoodie playlists" → Remove (always filtered)
- "No AudioFoodie playlists found" → "No Tunicious playlists found"
- "Create your first AudioFoodie playlist" → "Create your first Tunicious playlist"
- "AudioFoodie playlist created" → "Tunicious playlist created"
- Description display: Replace `[AudioFoodie]` with `[Tunicious]` in replace logic
- Badge: "AudioFoodie" → "Tunicious"

**Filtering logic:**
- `loadUserPlaylists()` always filters (remove conditional)
- Remove `showOnlyAudioFoodie` ref entirely

### Phase 3: Update Other References

#### 3.1 Search for remaining references

**Files to check:**
- Any other views that use `isAudioFoodiePlaylist`
- Any components that reference AudioFoodie in playlist context
- Documentation files (update if needed)

**Update pattern:**
- `[AudioFoodie]` → `[Tunicious]`
- `AudioFoodie` (in playlist context) → `Tunicious`
- Function name updates where applicable

### Phase 4: Validation & Testing

#### 4.1 Test Playlist Creation
- ✅ New playlists get `[Tunicious]` tag
- ✅ Tag is appended correctly to descriptions
- ✅ Empty descriptions get just `[Tunicious]`

#### 4.2 Test Playlist Retrieval
- ✅ `getUserPlaylists()` only returns Tunicious playlists
- ✅ `getPlaylist()` rejects non-Tunicious playlists
- ✅ All views only show Tunicious playlists

#### 4.3 Test Error Handling
- ✅ Error message when accessing non-Tunicious playlist
- ✅ Graceful handling when no Tunicious playlists exist
- ✅ Clear user messaging about Tunicious requirement

#### 4.4 Test Edge Cases
- ✅ Playlists with old `[AudioFoodie]` tag (should be filtered out)
- ✅ Playlists with no tag (should be filtered out)
- ✅ Playlists with both tags (should work if `[Tunicious]` present)

## Code Changes Summary

### Files to Modify

1. **`src/composables/useUserSpotifyApi.js`**
   - Rename `isAudioFoodiePlaylist` → `isTuniciousPlaylist`
   - Update tag from `[AudioFoodie]` to `[Tunicious]`
   - Add filtering to `getUserPlaylists()`
   - Add validation to `getPlaylist()`
   - Update `createPlaylist()` tag

2. **`src/views/playlists/AddPlaylistView.vue`**
   - Update function import and usage
   - Update all UI text references
   - Keep filtering (redundant but safe)

3. **`src/views/playlists/PlaylistManagementView.vue`**
   - Remove `showOnlyAudioFoodie` checkbox and ref
   - Remove watch for filtering toggle
   - Always filter playlists
   - Update function import and usage
   - Update all UI text references
   - Update description replacement logic

### Files to Review (May Need Updates)

- Any other components that use playlist functions
- Documentation files mentioning AudioFoodie playlists
- Test files (if any)

## Migration Considerations

### Existing Playlists
- Playlists with `[AudioFoodie]` tag will be filtered out
- Users need to manually update playlist descriptions or use migration script
- Consider providing admin tool to bulk-update playlist tags

### Backward Compatibility
- No backward compatibility needed
- Old tag is intentionally filtered out
- Forces migration to new tag

## Success Criteria

- ✅ All playlist operations require `[Tunicious]` tag
- ✅ No way to view or operate on non-Tunicious playlists
- ✅ All UI text references "Tunicious" instead of "AudioFoodie"
- ✅ `getUserPlaylists()` only returns Tunicious playlists
- ✅ `getPlaylist()` validates tag and throws error if missing
- ✅ New playlists automatically get `[Tunicious]` tag
- ✅ No optional filtering checkboxes remain
- ✅ Consistent behavior across all views

## Future Considerations

### Migration Script
- Consider creating script to update existing playlists
- Batch update `[AudioFoodie]` → `[Tunicious]` in Spotify
- Admin interface for bulk updates

### Documentation
- Update user documentation about Tunicious tag requirement
- Update onboarding to explain tag requirement
- Add FAQ about playlist tagging

## Notes

- This is a breaking change for existing playlists with old tag
- Users will need to update their playlist descriptions
- Consider communication strategy for existing users
- Tag validation provides security by preventing operations on untagged playlists

