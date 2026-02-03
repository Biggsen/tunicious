# Album Deduplication Specification

**Status:** ✅ Complete

**Completed:** 2026-02-02

**Implementation summary:** Part 1 (prevention in `addAlbumToCollection`) and Part 2 (migration script `dbscripts/dedupe-albums.js`) implemented. Extended migration script with Phase 1 orphan cleanup and `--phase-1-only` / `--only-album` flags. Conducted album ID resolution audit and fixed all P0–P3 items across `useAlbumsData`, `AlbumView`, and `unifiedTrackCache`. Fixed cache invalidation regression when moving albums (source → transient → sink) with alternate IDs. Manual testing verified.

---

## Overview

This document specifies the design and implementation of album deduplication to prevent and clean up duplicate album entries in Firestore that occur when Spotify changes album IDs over time.

## Problem Statement

### Root Cause

Spotify frequently changes album IDs for what is effectively the same album. This happens due to:
- Regional release differences
- Re-releases or remastered versions
- Catalog updates and metadata corrections
- Label changes or licensing updates

### Current Behavior

When a user adds an album to a playlist:
1. `addAlbumToCollection()` creates a Firestore document with the Spotify album ID as the document ID
2. User data is stored in `userEntries[userId]`

**The Problem:**
- User A adds "Kill 'Em All (Remastered)" in 2023 → Spotify ID: `1aGapZGHBovnmhwqVNI6JZ`
- User B adds the same album in 2025 → Spotify now returns ID: `7hKjNN2595RdaLSR2PB7sA`
- Two separate documents are created for the same album
- Search results show duplicates
- User data is fragmented across documents

### Impact

1. **Duplicate search results** - Same album appears multiple times
2. **Fragmented user data** - Different users' data for the same album split across documents
3. **Inconsistent album mappings** - The existing mapping system only works at read time, not write time
4. **Wasted storage** - Duplicate album metadata stored

## Solution

### Core Principle

**One album (title + artist) = one Firestore document. Always.**

### Two-Part Implementation

1. **Prevent Future Duplicates** - Modify `addAlbumToCollection()` to check for existing albums before creating new documents
2. **Clean Up Existing Duplicates** - Migration script to find, merge, and deduplicate existing album entries

## Part 1: Prevent Future Duplicates

### Implementation in `useAlbumsData.js`

Modify `addAlbumToCollection()` to:

1. **Before creating a new document**, check if an album with the same `albumTitle` + `artistName` already exists
2. **If found**: Use that existing document's ID and add user data to its `userEntries`
3. **If the incoming ID differs from the existing ID**: Create a mapping from incoming ID → existing ID
4. **If not found**: Create new document with the incoming ID (current behavior)

### Pseudocode

```javascript
const addAlbumToCollection = async ({ album, playlistId, ... }) => {
  // Step 1: Check for existing album by title + artist
  const existingAlbums = await searchAlbumsByTitleAndArtist(
    album.name, 
    album.artists[0].name
  );

  let targetAlbumId = album.id;
  
  if (existingAlbums.length > 0) {
    // Use the existing album's document ID
    targetAlbumId = existingAlbums[0].id;
    
    // If IDs differ, create a mapping for future lookups
    if (targetAlbumId !== album.id) {
      await createMapping(album.id, targetAlbumId);
    }
  }

  // Step 2: Write user data to the target document
  const albumRef = doc(db, 'albums', targetAlbumId);
  await setDoc(albumRef, { ... }, { merge: true });
};
```

### Edge Cases

1. **Fuzzy matching**: Album titles may have slight variations (e.g., "Kill 'Em All" vs "Kill'em All"). Use exact match first, fall back to fuzzy match with high threshold (0.9+).

2. **Same title, different albums**: Rare but possible (e.g., two artists with same album name). The `artistName` match prevents this.

3. **Compilation albums**: May have different artist names. Rely on exact title + artist match; compilations with different listed artists are treated as different albums.

4. **Album updates during write**: If two users add the same "new ID" album simultaneously, both will create mappings to the same existing album. Firestore's `merge: true` handles concurrent `userEntries` writes safely.

## Part 2: Clean Up Existing Duplicates

### Migration Script: `dbscripts/dedupe-albums.js`

#### Process

1. **Fetch all albums** from the `albums` collection
2. **Group by** `albumTitle + artistName` (case-insensitive)
3. **For each group with multiple entries:**
   - Select the **primary** document (oldest `createdAt` or most `userEntries`)
   - Merge `userEntries` from duplicate documents into the primary
   - Create mappings from duplicate IDs → primary ID
   - Delete duplicate documents
4. **Log results** for verification

#### Selection Criteria for Primary

Choose the document that:
1. Has the most `userEntries` (prioritize data preservation), OR
2. Has the oldest `createdAt` timestamp (if user counts are equal)

#### Data Merging

```javascript
// Merge userEntries from duplicate into primary
const mergedUserEntries = { ...primaryDoc.userEntries };

for (const [userId, userData] of Object.entries(duplicateDoc.userEntries)) {
  if (!mergedUserEntries[userId]) {
    // User only exists in duplicate - move to primary
    mergedUserEntries[userId] = userData;
  } else {
    // User exists in both - merge playlistHistory
    mergedUserEntries[userId].playlistHistory = [
      ...mergedUserEntries[userId].playlistHistory,
      ...userData.playlistHistory
    ];
  }
}
```

#### Script Output

```
=== Album Deduplication Report ===

Found 3 duplicate groups:

1. "Kill 'Em All (Remastered)" by Metallica
   - Primary: 1aGapZGHBovnmhwqVNI6JZ (2 user entries)
   - Duplicate: 7hKjNN2595RdaLSR2PB7sA (1 user entry) → MERGED & DELETED
   - Mapping created: 7hKjNN2595RdaLSR2PB7sA → 1aGapZGHBovnmhwqVNI6JZ

2. ...

=== Summary ===
Total albums scanned: 847
Duplicate groups found: 3
Documents merged: 3
Documents deleted: 3
Mappings created: 3
```

### Dry Run Mode

The script should support a `--dry-run` flag that:
- Reports what would be changed
- Does not modify any data
- Allows verification before actual migration

## Album Mappings Enhancement

### Current System

The `albumMappings` collection stores:
```javascript
{
  alternateId: string,  // The "old" or alternate Spotify ID
  primaryId: string,    // The canonical document ID
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Usage Points

Mappings are checked in:
- `fetchUserAlbumData()` - Falls back to primary ID if direct lookup fails
- Artist discography view - Consolidates album versions
- **NEW**: `addAlbumToCollection()` - Prevents duplicate creation
- **NEW**: `removeAlbumFromPlaylist()` - Must resolve alternate ID to primary before lookup (otherwise users with alternate IDs cannot remove albums from playlists after deduplication)

### No Schema Changes Required

The existing mapping structure is sufficient. The enhancement is purely behavioral (checking mappings at write time, not just read time).

## Files to Modify

### Code Changes

| File | Change |
|------|--------|
| `src/composables/useAlbumsData.js` | Modify `addAlbumToCollection()` to check for existing albums; modify `removeAlbumFromPlaylist()` to resolve alternate ID via `getPrimaryId` before Firestore lookup |
| `src/composables/useAlbumMappings.js` | No changes needed (existing `createMapping()` is sufficient) |

### New Files

| File | Purpose |
|------|---------|
| `dbscripts/dedupe-albums.js` | One-time migration script to clean up existing duplicates |

## Testing Strategy

### Unit Tests

1. `addAlbumToCollection()` with new album (no existing) → creates new document
2. `addAlbumToCollection()` with existing album (same ID) → updates existing
3. `addAlbumToCollection()` with existing album (different ID) → uses existing, creates mapping

### Integration Tests

1. Search for deduplicated album → single result
2. Look up album by alternate ID → resolves to primary
3. Multiple users add same album with different IDs → single document with all user entries
4. User with alternate ID removes album from playlist → succeeds (resolves to primary document)

### Migration Testing

1. Run script with `--dry-run` on production data copy
2. Verify duplicate detection logic
3. Verify merge logic preserves all user data
4. Verify mappings are created correctly

## Rollback Plan

### Code Rollback

Revert changes to `addAlbumToCollection()`. Future duplicates may occur again, but no data loss.

### Data Rollback

Before running migration:
1. Export affected albums collection
2. Store backup in Cloud Storage or local file
3. If issues arise, restore from backup

## Implementation Order

### Phase 1: Prevention (Code Change)
1. Modify `addAlbumToCollection()` to check for existing albums
2. Test thoroughly with new album additions
3. Deploy to production

### Phase 2: Cleanup (Migration)
1. Develop and test `dedupe-albums.js` script
2. Run with `--dry-run` on production
3. Review output and verify logic
4. Create data backup
5. Run migration
6. Verify results

## Success Criteria

1. **No duplicate albums** in search results for identical title + artist
2. **All user data preserved** after migration
3. **Mappings work correctly** - alternate IDs resolve to primary
4. **No regression** in album addition flow performance

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| False positive matches (different albums matched as duplicates) | Use exact title + artist match; fuzzy matching only as opt-in |
| Data loss during merge | Backup before migration; merge (don't replace) user entries |
| Performance impact on album addition | Cache recent title+artist lookups; single additional query is acceptable |
| Migration script errors | Dry-run mode; batch commits; detailed logging |

## Open Questions

1. Should we notify users if their album data was merged? (Probably not - transparent to them)
2. Should fuzzy matching be used for title comparison? (Start with exact match only)
3. How to handle albums where the artist name has changed? (Rely on exact match; edge case)
