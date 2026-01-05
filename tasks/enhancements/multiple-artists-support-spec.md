# Multiple Artists Support Specification

## **Status**: 📋 Planning

## Overview

This document specifies the enhancement to support multiple artists for albums in the Tunicious application. Currently, the system only stores and displays the first artist from Spotify's artist array, which causes issues with collaboration albums, compilation albums, and albums with featured artists.

## Goals

1. **Data Accuracy**: Store all artists associated with an album, not just the first one
2. **Display Accuracy**: Show all artists in UI components (e.g., "Artist A & Artist B" or "Artist A, Artist B, Artist C")
3. **Search Functionality**: Enable searching/filtering by any artist on an album
4. **Backward Compatibility**: Maintain compatibility with existing data and code during migration
5. **Performance**: Ensure search and filtering remain efficient with multiple artists

## Current State Analysis

### Data Structure

**Firestore Albums Collection:**
```javascript
{
  albumTitle: string,
  artistName: string,           // Only first artist
  artistNameLower: string,      // Only first artist (lowercase, for search)
  artistId: string,             // Only first artist ID
  albumCover: string,
  releaseYear: string,
  rymLink: string,
  userEntries: {
    [userId]: {
      playlistHistory: [...],
      createdAt: Timestamp,
      updatedAt: Timestamp
    }
  }
}
```

### Current Code Issues

1. **Storage** (`src/composables/useAlbumsData.js:393-395`):
   - Only saves `album.artists[0]` to Firestore
   - Loses all other artists from Spotify API

2. **Search/Filtering**:
   - `searchAlbumsByTitleAndArtist()` - filters by single `artistName`
   - `searchAlbumsByArtistPrefix()` - searches by single `artistNameLower`
   - `searchAlbumsByTitleAndArtistFuzzy()` - uses single `artistName`

3. **Display**:
   - Most components use `album.artists?.[0]?.name || album.artistName` as fallback
   - Some components (e.g., `AlbumSearch.vue`) already display multiple artists from Spotify API, but database only has first artist

4. **Unified Track Cache** (`src/utils/unifiedTrackCache.js:769`):
   - Only stores first artist: `artistName: albumData?.artists?.[0]?.name || ''`

## Proposed Data Structure

### New Firestore Schema

**Albums Collection:**
```javascript
{
  albumTitle: string,
  
  // NEW: Array of all artists
  artists: Array<{
    id: string,           // Spotify artist ID
    name: string          // Artist name
  }>,
  
  // NEW: Searchable field (all artist names combined, lowercase)
  artistNamesLower: string,  // e.g., "artist a, artist b, artist c"
  
  // DEPRECATED (kept for backward compatibility during migration)
  artistName: string,        // First artist name (for fallback)
  artistNameLower: string,    // First artist name lowercase (for fallback)
  artistId: string,          // First artist ID (for fallback)
  
  albumCover: string,
  releaseYear: string,
  rymLink: string,
  userEntries: {
    [userId]: {
      playlistHistory: [...],
      createdAt: Timestamp,
      updatedAt: Timestamp
    }
  }
}
```

### Field Descriptions

**New Fields:**
- `artists` (array, required): Array of artist objects with `id` and `name` from Spotify API
- `artistNamesLower` (string, required): Comma-separated, lowercase string of all artist names for efficient search/filtering
  - Format: `"artist a, artist b, artist c"` (lowercase, trimmed, comma-separated)
  - Used for prefix searches and filtering

**Deprecated Fields (kept during migration):**
- `artistName`: First artist name (maintained for backward compatibility)
- `artistNameLower`: First artist name lowercase (maintained for backward compatibility)
- `artistId`: First artist ID (maintained for backward compatibility)

**Migration Strategy:**
- Phase 1: Add new fields alongside old fields (both written)
- Phase 2: Update all read code to prefer new fields, fallback to old
- Phase 3: Migrate existing documents (backfill `artists` and `artistNamesLower` from `artistName`)
- Phase 4: Remove deprecated fields (after all code updated and migration complete)

## Data Migration

### Migration Script Requirements

**Location**: `dbscripts/migrate-albums-multiple-artists.js`

**Purpose**: Backfill `artists` and `artistNamesLower` fields for existing albums

**Process:**
1. Query all albums in Firestore
2. For each album:
   - If `artists` field exists and is valid, skip (already migrated)
   - If only `artistName` exists:
     - Create `artists` array: `[{ id: artistId || '', name: artistName }]`
     - Create `artistNamesLower`: `artistName.toLowerCase()`
   - Update document with new fields
3. Batch updates for performance (500 documents per batch)
4. Log progress and errors

**Safety:**
- Use `merge: true` to preserve existing data
- Validate data before writing
- Create backup/rollback plan
- Run in dry-run mode first

### Index Updates

**New Indexes Required:**
- Single field index on `artistNamesLower` (for prefix searches)
- Composite index on `albumTitle`, `artistNamesLower` (if needed for combined searches)

**Existing Indexes:**
- Keep `artistNameLower` index during migration period
- Remove after migration complete

## Code Changes

### 1. Storage Layer (`src/composables/useAlbumsData.js`)

**Function: `addAlbumToCollection()`**
```javascript
// OLD (lines 393-395):
artistName: album.artists[0].name,
artistNameLower: album.artists[0].name.toLowerCase(),
artistId: album.artists[0].id,

// NEW:
artists: album.artists.map(a => ({ id: a.id, name: a.name })),
artistNamesLower: album.artists.map(a => a.name.toLowerCase().trim()).join(', '),
// Keep old fields for backward compatibility:
artistName: album.artists[0]?.name || '',
artistNameLower: album.artists[0]?.name?.toLowerCase() || '',
artistId: album.artists[0]?.id || '',
```

**Function: `updateAlbumDetails()`**
- Update to handle `artists` array in addition to single `artistId`
- Update `artistNamesLower` when artists change

**Function: `transformDbAlbumToSpotifyFormat()`**
- Use `artists` array if available, fallback to `artistName`/`artistId`
- Ensure returned format matches Spotify API format

### 2. Search Functions (`src/composables/useAlbumsData.js`)

**Function: `searchAlbumsByTitleAndArtist()`**
- Update to search in `artistNamesLower` field (contains check)
- Fallback to `artistNameLower` for backward compatibility

**Function: `searchAlbumsByArtistPrefix()`**
- Update to use `artistNamesLower` with prefix query
- Fallback to `artistNameLower` for backward compatibility

**Function: `searchAlbumsByTitleAndArtistFuzzy()`**
- Update to search in `artistNamesLower` field
- Consider all artists when calculating similarity

**Function: `fetchAlbumDetails()` / `getAlbumDetails()`**
- Return `artists` array in addition to legacy fields
- Maintain backward compatibility

### 3. Display Components

**Component: `AlbumItem.vue`**
- Update to display all artists: `album.artists?.map(a => a.name).join(', ') || album.artistName`
- Update artist link to use first artist ID (or handle multiple artists)

**Component: `AlbumSearch.vue`**
- Already displays multiple artists from Spotify API
- Ensure fallback to database `artists` array when Spotify data unavailable

**Component: `TrackList.vue`**
- Update artist matching logic to check against all album artists
- Current code (line 202) checks `albumArtistLower` - update to check all artists

**Component: `SpotifyPlayerBar.vue`**
- Already uses track artists (which can differ from album artists)
- No changes needed (tracks have their own artist arrays)

**View: `AlbumView.vue`**
- Update artist display to show all artists
- Update artist navigation link (use first artist or handle multiple)

**View: `PlaylistSingle.vue`**
- Update sorting/filtering by artist to consider all artists
- Update artist grouping logic (lines 2243-2244, 2452-2453) to handle multiple artists
- Consider how to group albums with multiple artists (use first artist? create separate entries?)

**View: `SearchView.vue`**
- Update `searchAlbumsByArtistPrefix()` usage (already calls the function, will benefit from updates)

### 4. Unified Track Cache (`src/utils/unifiedTrackCache.js`)

**Function: `addAlbumTracks()`**
```javascript
// OLD (line 769):
artistName: albumData?.artists?.[0]?.name || ''

// NEW:
artists: albumData?.artists || [],
artistNamesLower: albumData?.artists?.map(a => a.name.toLowerCase().trim()).join(', ') || ''
```

**Update cache structure:**
- Add `artists` array to album cache entries
- Add `artistNamesLower` for search
- Keep `artistName` for backward compatibility during migration

### 5. Utility Functions

**File: `src/utils/musicServiceLinks.js`**
- `getLastFmLink()` - Currently uses single artist
- Consider: Use first artist for Last.fm links (Last.fm typically uses primary artist)
- Or: Create link for first artist, note that collaborations may not work perfectly

**File: `src/utils/unifiedTrackCache.js`**
- `normalizeArtistName()` - Already exists, works for single artist
- Update any artist matching logic to consider multiple artists

### 6. Latest Movements (`src/composables/useLatestMovements.js`)

**Display Format:**
- Update movement display text to show all artists
- Format: `"Album Title by Artist A, Artist B - action"`
- Or: `"Album Title by Artist A & Artist B - action"` (for 2 artists)

## UI/UX Considerations

### Display Formats

**Single Artist:**
- `"Artist Name"`

**Two Artists:**
- `"Artist A & Artist B"` (preferred for collaborations)

**Three or More Artists:**
- `"Artist A, Artist B, Artist C"` (comma-separated)
- Or: `"Artist A, Artist B & Artist C"` (Oxford comma style)

**Component Behavior:**
- Truncate if too long (e.g., "Artist A, Artist B, Artist C + 2 more")
- Tooltip showing full list on hover

### Search Behavior

**Artist Search:**
- Search should match if query appears in any artist name
- Example: Searching "Beyoncé" should find "The Carters" album (Beyoncé & Jay-Z)

**Filtering:**
- When filtering by artist, include albums where that artist appears (not just primary artist)
- Update artist grouping in PlaylistSingle to handle this

## Testing Requirements

### Unit Tests

1. **Data Storage:**
   - Verify `addAlbumToCollection()` saves all artists
   - Verify `artistNamesLower` is correctly formatted
   - Verify backward compatibility fields are maintained

2. **Search Functions:**
   - Test `searchAlbumsByArtistPrefix()` with multiple artists
   - Test `searchAlbumsByTitleAndArtist()` matches any artist
   - Test fuzzy search considers all artists

3. **Display Functions:**
   - Test artist name formatting (1, 2, 3+ artists)
   - Test fallback to legacy fields

### Integration Tests

1. **End-to-End Flow:**
   - Add album with multiple artists
   - Verify all artists saved to Firestore
   - Verify search finds album by any artist name
   - Verify display shows all artists

2. **Migration:**
   - Test migration script on sample data
   - Verify existing albums work after migration
   - Verify new albums work correctly

### Manual Testing Checklist

- [ ] Add collaboration album (e.g., "Watch the Throne" - Jay-Z & Kanye West)
- [ ] Verify all artists appear in album display
- [ ] Search for album by secondary artist name
- [ ] Filter playlists by secondary artist
- [ ] Verify artist links work (use first artist)
- [ ] Verify Last.fm links work (use first artist)
- [ ] Test with albums that have 3+ artists
- [ ] Test backward compatibility with old album data
- [ ] Verify unified track cache updates correctly

## Backward Compatibility

### Phase 1: Dual Write (Current + New Fields)
- Write both old and new fields when saving albums
- All read code continues using old fields
- New fields populated for new albums

### Phase 2: Dual Read (Prefer New, Fallback to Old)
- Update all read code to prefer new fields
- Fallback to old fields if new fields missing
- Ensures compatibility during migration

### Phase 3: Migration
- Run migration script to backfill existing albums
- Verify all albums have new fields

### Phase 4: Cleanup
- Remove deprecated fields from write operations
- Remove fallback code (optional, can keep for safety)
- Remove old indexes

### Compatibility Helpers

**Create utility function: `getAlbumArtists(album)`**
```javascript
// Returns artists array, with fallback to legacy fields
export function getAlbumArtists(album) {
  if (album.artists && Array.isArray(album.artists) && album.artists.length > 0) {
    return album.artists;
  }
  // Fallback to legacy fields
  if (album.artistName || album.artistId) {
    return [{
      id: album.artistId || '',
      name: album.artistName || 'Unknown Artist'
    }];
  }
  return [];
}
```

**Create utility function: `formatArtistNames(artists)`**
```javascript
// Formats artist array for display
export function formatArtistNames(artists) {
  if (!artists || artists.length === 0) return 'Unknown Artist';
  if (artists.length === 1) return artists[0].name;
  if (artists.length === 2) return `${artists[0].name} & ${artists[1].name}`;
  // 3+ artists: comma-separated
  return artists.map(a => a.name).join(', ');
}
```

## Performance Considerations

### Search Performance

**Current:**
- Single field index on `artistNameLower`
- Prefix queries are efficient

**New:**
- Single field index on `artistNamesLower`
- String contains check (for exact artist name matching)
- May need array-contains queries if we store as array (but string is more efficient for prefix)

**Optimization:**
- `artistNamesLower` as comma-separated string allows efficient prefix search
- For exact artist matching, use string contains (e.g., `artistNamesLower.includes(searchTerm.toLowerCase())`)
- Consider full-text search if needed for complex queries

### Cache Performance

- Unified track cache should store `artists` array efficiently
- `artistNamesLower` string is small and searchable
- No significant performance impact expected

## Implementation Plan

### Phase 1: Foundation (Week 1)
1. Update `addAlbumToCollection()` to write new fields
2. Create utility functions (`getAlbumArtists`, `formatArtistNames`)
3. Update `transformDbAlbumToSpotifyFormat()` to use new fields
4. Test with new albums

### Phase 2: Search Updates (Week 1-2)
1. Update `searchAlbumsByArtistPrefix()` to use `artistNamesLower`
2. Update `searchAlbumsByTitleAndArtist()` to search all artists
3. Update `searchAlbumsByTitleAndArtistFuzzy()` to consider all artists
4. Test search functionality

### Phase 3: Display Updates (Week 2)
1. Update `AlbumItem.vue` to show all artists
2. Update `AlbumView.vue` to show all artists
3. Update `TrackList.vue` artist matching
4. Update `PlaylistSingle.vue` artist grouping/filtering
5. Update unified track cache
6. Test all display components

### Phase 4: Migration (Week 2-3)
1. Create migration script
2. Test migration on staging/dev data
3. Run migration on production
4. Verify all albums migrated

### Phase 5: Cleanup (Week 3)
1. Remove deprecated field writes (keep reads for safety)
2. Update Firestore indexes
3. Remove old indexes
4. Documentation updates

## Success Criteria

- [ ] All new albums save all artists to Firestore
- [ ] Search finds albums by any artist name
- [ ] Display shows all artists correctly formatted
- [ ] Existing albums work (backward compatibility maintained)
- [ ] Migration script successfully backfills all albums
- [ ] No performance degradation in search/filtering
- [ ] All tests pass
- [ ] Manual testing checklist complete

## Open Questions

1. **Artist Links**: Should clicking on artist name navigate to first artist only, or show all artists?
   - **Decision**: Use first artist for navigation (simplest, most common use case)

2. **Last.fm Links**: How to handle multiple artists for Last.fm links?
   - **Decision**: Use first artist (Last.fm typically uses primary artist)

3. **Artist Grouping in Playlists**: How to group albums with multiple artists?
   - **Decision**: Group by first artist (maintains current behavior, can enhance later)

4. **Migration Timing**: When to run migration?
   - **Decision**: After Phase 3 (display updates) complete, before Phase 5 (cleanup)

5. **Deprecated Field Removal**: When to remove old fields?
   - **Decision**: Keep for 1-2 release cycles, then remove in major version update

## Related Files

### Core Files to Modify
- `src/composables/useAlbumsData.js` - Storage and search
- `src/components/AlbumItem.vue` - Album display
- `src/components/TrackList.vue` - Track/artist matching
- `src/views/playlists/PlaylistSingle.vue` - Playlist display and filtering
- `src/views/music/AlbumView.vue` - Album detail page
- `src/utils/unifiedTrackCache.js` - Cache structure
- `src/composables/useLatestMovements.js` - Movement display

### Utility Files to Create/Modify
- `src/utils/albumArtists.js` - New utility file for artist helpers
- `src/utils/musicServiceLinks.js` - May need updates for multiple artists

### Migration Files
- `dbscripts/migrate-albums-multiple-artists.js` - New migration script

### Configuration Files
- `firestore.indexes.json` - Add new indexes
- `.cursor/rules/data-structures.mdc` - Update documentation (if exists)

## Notes

- Spotify API already provides `artists` array, so we're just storing what we receive
- This change improves data accuracy and user experience
- Backward compatibility is critical - many existing albums in database
- Consider future enhancements: artist pages showing all collaborations, filtering by multiple artists, etc.
