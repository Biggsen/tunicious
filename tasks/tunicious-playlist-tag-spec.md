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
- Filter at API level (always filters, no parameter)
- This ensures the app never receives non-Tunicious playlists

**Add `getAllUserPlaylists()` (Admin Only):**
- New function that returns all playlists without filtering
- Only accessible to admin users (check `isAdmin` before allowing)
- Used by admin tool for bulk tag management

**Update `getPlaylist()`:**
- Add validation to check for `[Tunicious]` tag
- Throw user-friendly error if playlist doesn't have tag (e.g., "This playlist is not a Tunicious playlist")
- Prevents operations on non-Tunicious playlists

**Remove `isAudioFoodiePlaylist()`:**
- Remove function entirely (no backward compatibility)
- Remove from exports

**Update exports:**
- Export `isTuniciousPlaylist` (already exists)
- Export `getAllUserPlaylists` (admin only)
- Remove `isAudioFoodiePlaylist` export

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
- Remove client-side filtering (now redundant)
- `getUserPlaylists()` already filters at API level
- Update empty state message: "No Tunicious playlists found. Create one first."

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
- Remove all client-side filtering logic
- `getUserPlaylists()` already filters at API level
- Remove `showOnlyAudioFoodie` ref entirely
- Update empty state message: "No Tunicious playlists found. Create your first Tunicious playlist above!"

### Phase 3: Manual Tag Management

**Tag management approach:**
- Admin will manually update playlists via Spotify directly
- No admin tool needed in the application
- `getAllUserPlaylists()` function remains available for future use if needed

### Phase 4: Update Other References

#### 4.1 Search for remaining references

**Files identified:**
- ✅ `src/views/playlists/AddAlbumToPlaylistView.vue` - Already uses `isTuniciousPlaylist()`
- No other views need updates (already checked)

**Files with non-playlist AudioFoodie references (no changes needed):**
- `src/views/auth/AccountView.vue` - App name reference (not playlist tag)
- `src/composables/useSpotifyPlayer.js` - App name reference (not playlist tag)
- `functions/src/lastfm.js` - User-Agent string (not playlist tag)
- Documentation files - Historical references (no changes needed)

**Update pattern (if any found):**
- `[AudioFoodie]` → `[Tunicious]` (playlist tags only)
- `AudioFoodie` (in playlist context) → `Tunicious`
- Function name updates where applicable

### Phase 5: Validation & Testing

#### 5.1 Test Playlist Creation
- ✅ New playlists get `[Tunicious]` tag
- ✅ Tag is appended correctly to descriptions
- ✅ Empty descriptions get just `[Tunicious]`
- ✅ No validation needed for duplicate tags (user input unlikely to contain tag)

#### 5.2 Test Playlist Retrieval
- ✅ `getUserPlaylists()` only returns Tunicious playlists (filtered at API level)
- ✅ `getPlaylist()` rejects non-Tunicious playlists with user-friendly error
- ✅ All views only show Tunicious playlists (never receive non-Tunicious playlists)
- ✅ Admin can use `getAllUserPlaylists()` to see all playlists

#### 5.3 Test Error Handling
- ✅ User-friendly error message when accessing non-Tunicious playlist
- ✅ Specific empty state message: "No Tunicious playlists found. Create one first."
- ✅ Clear user messaging about Tunicious requirement

#### 5.4 Test Edge Cases
- ✅ Playlists with old `[AudioFoodie]` tag (should be filtered out)
- ✅ Playlists with no tag (should be filtered out)
- ✅ Playlists with both tags (should work if `[Tunicious]` present)

#### 5.5 Test Admin Functions
- ✅ Admin can access all playlists via `getAllUserPlaylists()` (if needed)
- ✅ Non-admin users cannot access admin functions

## Code Changes Summary

### Files to Modify

1. **`src/composables/useUserSpotifyApi.js`**
   - Remove `isAudioFoodiePlaylist()` function entirely
   - Update `isTuniciousPlaylist()` (already exists, ensure it's correct)
   - Update tag from `[AudioFoodie]` to `[Tunicious]` in `createPlaylist()`
   - Add mandatory filtering to `getUserPlaylists()` (always filter at API level)
   - Add `getAllUserPlaylists()` function (admin-only, no filtering)
   - Add validation to `getPlaylist()` with user-friendly error message
   - Remove `isAudioFoodiePlaylist` from exports

2. **`src/views/playlists/AddPlaylistView.vue`**
   - Update function import: `isTuniciousPlaylist` instead of `isAudioFoodiePlaylist`
   - Update all UI text references (4 instances)
   - Remove client-side filtering (now redundant, API filters)
   - Update empty state message: "No Tunicious playlists found. Create one first."

3. **`src/views/playlists/PlaylistManagementView.vue`**
   - Remove `showOnlyAudioFoodie` checkbox and ref
   - Remove watch for filtering toggle
   - Remove all client-side filtering logic
   - Update function import: `isTuniciousPlaylist` instead of `isAudioFoodiePlaylist`
   - Update all UI text references (6 instances)
   - Update description replacement logic: `[AudioFoodie]` → `[Tunicious]`
   - Update empty state message: "No Tunicious playlists found. Create your first Tunicious playlist above!"

### Files Already Updated (No Changes Needed)

- ✅ `src/views/playlists/AddAlbumToPlaylistView.vue` - Already uses `isTuniciousPlaylist()`

## Migration Considerations

### Migration Strategy
- **Immediate switch**: No transition period, `[AudioFoodie]` playlists filtered out immediately
- **Manual migration**: Admin will manually update playlists via Spotify directly

### Existing Playlists
- Playlists with `[AudioFoodie]` tag will be filtered out immediately
- Admin will manually update playlists via Spotify to replace tags
- Users cannot access non-Tunicious playlists through the app

### Backward Compatibility
- **No backward compatibility**: `isAudioFoodiePlaylist()` removed entirely
- Old tag is intentionally filtered out at API level
- Forces migration to new tag
- Admin will manually update playlists via Spotify

## Success Criteria

- ✅ All playlist operations require `[Tunicious]` tag
- ✅ No way to view or operate on non-Tunicious playlists
- ✅ All UI text references "Tunicious" instead of "AudioFoodie"
- ✅ `getUserPlaylists()` only returns Tunicious playlists
- ✅ `getPlaylist()` validates tag and throws error if missing
- ✅ New playlists automatically get `[Tunicious]` tag
- ✅ No optional filtering checkboxes remain
- ✅ Consistent behavior across all views

## Implementation Details

### API-Level Filtering
- `getUserPlaylists()` always filters at API level before returning results
- Regular users never receive non-Tunicious playlists
- Admin users can use `getAllUserPlaylists()` for unfiltered access
- This ensures security by default - app cannot operate on non-Tunicious playlists

### Error Messages
- `getPlaylist()` throws user-friendly error: "This playlist is not a Tunicious playlist"
- Empty state messages: "No Tunicious playlists found. Create one first."
- All error messages use friendly language, not technical details

### Admin Functions
- `getAllUserPlaylists()` function available for admin use if needed
- Admin will manually update playlists via Spotify directly
- No admin tool interface needed in the application

### Documentation
- Update user documentation about Tunicious tag requirement
- Update onboarding to explain tag requirement
- Add FAQ about playlist tagging

## Notes

- This is a breaking change for existing playlists with old tag
- Immediate switch - no transition period
- Admin will manually update playlists via Spotify directly
- API-level filtering ensures security - app cannot access non-Tunicious playlists
- Tag validation provides security by preventing operations on untagged playlists
- All filtering happens at API level, not in views

