# Priority Refactoring Specification

## Overview

This document specifies the refactoring to remove the `priority` field from the AudioFoodie system and replace it with connection-based ordering and position-derived ratings.

## Current State

### Priority Usage
- **Ordering**: Playlists sorted by `priority` field
- **Rating Display**: `priority` mapped to star ratings (5→0, 10/15→1, 20/25→2, etc.)
- **Storage**: Stored in playlists collection and album history entries
- **Indexes**: Firestore index on `userId + priority`

### Problems
- Priority doesn't reflect actual pipeline flow
- Priority conflicts (multiple playlists can have same priority)
- Hard to reorder (requires recalculating many priorities)
- Ambiguous (used for both ordering and rating)

## New State

### Connection-Based Ordering
- Playlists ordered by following `nextStagePlaylistId` connections
- Start at sources, traverse chain to build sequence
- Order is implicit from pipeline structure

### Position-Based Rating
- **Source**: Position 0 (clock icon, queued)
- **Transient**: Position 1, 2, 3... (notes icon, width based on position)
- **Sink**: Position = position of terminating transient (stars, width based on position)
- **Terminal**: Max rating (5 stars, always)

### No Priority Field
- Removed from all data models
- Removed from forms
- Removed from queries
- Removed from indexes

## Data Model Changes

### Playlists Collection
**Remove:**
- `priority` field

**Add:**
- Position calculated on-the-fly during ordering
- Position stored as computed property (not in database)

### Albums Collection
**Remove:**
- `priority` from `playlistHistory` entries

**Add:**
- Position calculated from historical pipeline state (if needed)
- Or remove priority from historical entries entirely

## Implementation Steps

### Phase 1: Update Ordering Logic
1. Remove `orderBy('priority')` from Firestore queries
2. Implement `derivePipelineOrder()` function:
   - Find all sources in group
   - Traverse `nextStagePlaylistId` connections
   - Build ordered array
   - Calculate position during traversal
3. Replace priority sorting with connection-based ordering
4. Store position as computed property on playlist objects

### Phase 2: Update RatingBar Component
1. Change props: `priority` → `pipelinePosition`
2. Update rating calculation:
   - Source: position 0 (clock icon)
   - Transient: position 1+ (notes icon, width = position/5)
   - Sink: position from terminating transient (stars, width = position/5)
   - Terminal: max (5 stars, 100% width)
3. Remove `computeRatingFromPriority()` function
4. Add position-based width calculation

### Phase 3: Remove Priority from Forms
1. Remove priority input from `AddPlaylistView.vue`
2. Remove priority input from `EditPlaylistView.vue`
3. Remove priority from form validation
4. Remove priority from form submission

### Phase 4: Update Data Fetching
1. Remove priority from `usePlaylistData.js`:
   - Remove from query
   - Remove from returned objects
   - Add position calculation
2. Remove priority from `useAlbumsData.js`:
   - Remove from playlist history entries
   - Calculate position when needed for display

### Phase 5: Update Firestore
1. Remove `priority` index from `firestore.indexes.json`
2. Deploy index changes
3. (Optional) Remove priority from existing documents via migration script

### Phase 6: Update Documentation
1. Update `.cursor/rules/data-structures.mdc`:
   - Remove priority from Playlist interface
   - Document position calculation
   - Document connection-based ordering
2. Update pipeline-playlist-spec.md:
   - Remove priority references
   - Document position-based rating system

## Position Calculation Algorithm

```javascript
function derivePipelineOrder(playlists) {
  // 1. Create lookup map
  const playlistMap = new Map();
  playlists.forEach(p => playlistMap.set(p.firebaseId, p));
  
  // 2. Find sources
  const sources = playlists.filter(p => p.pipelineRole === 'source');
  
  // 3. Traverse from each source
  const ordered = [];
  const visited = new Set();
  let position = 0;
  
  function traverse(playlist) {
    if (!playlist || visited.has(playlist.firebaseId)) return;
    
    visited.add(playlist.firebaseId);
    playlist.pipelinePosition = position++;
    ordered.push(playlist);
    
    // Follow nextStagePlaylistId
    if (playlist.nextStagePlaylistId) {
      const next = playlistMap.get(playlist.nextStagePlaylistId);
      if (next) traverse(next);
    }
  }
  
  sources.forEach(traverse);
  
  // 4. Handle sinks (position = terminating transient position)
  playlists.forEach(p => {
    if (p.pipelineRole === 'sink' && !visited.has(p.firebaseId)) {
      // Find transient that terminates to this sink
      const terminatingTransient = playlists.find(
        t => t.terminationPlaylistId === p.firebaseId
      );
      if (terminatingTransient && terminatingTransient.pipelinePosition !== undefined) {
        p.pipelinePosition = terminatingTransient.pipelinePosition;
        ordered.push(p);
      }
    }
  });
  
  return ordered;
}
```

## RatingBar Changes

### Props
- Remove: `priority: Number`
- Add: `pipelinePosition: Number`

### Display Logic
- **Source** (position 0): Clock icon, 100% width
- **Transient** (position 1+): Notes icon, width = `(position / 5) * 100%`
- **Sink** (position 1+): Stars, width = `(position / 5) * 100%`
- **Terminal**: 5 stars, 100% width

## Migration Considerations

### Existing Data
- Priority values in existing playlists can be ignored
- Priority values in album history can be ignored
- No data migration needed (position calculated on-the-fly)

### Backward Compatibility
- Old playlists without connections will be ordered by creation date
- Orphaned playlists added at end of ordered list

## Testing Requirements

### Unit Tests
1. Test `derivePipelineOrder()` with various pipeline structures
2. Test position calculation for all roles
3. Test handling of multiple sources
4. Test handling of sinks
5. Test handling of orphaned playlists

### Integration Tests
1. Test playlist ordering in PlaylistView
2. Test RatingBar display for all roles
3. Test album history display
4. Test form submission without priority

### Edge Cases
1. Multiple sources in one group
2. Sinks connected to different transients
3. Broken connections (missing nextStagePlaylistId)
4. Orphaned playlists (not in any chain)
5. Empty groups

## Rollback Plan

If issues arise:
1. Keep priority field in database (don't delete)
2. Add fallback: use priority if connections missing
3. Re-enable priority-based ordering as fallback
4. Test on staging before production

## Success Criteria

- [ ] Playlists ordered by connection traversal, not priority
- [ ] RatingBar uses position, not priority
- [ ] Priority removed from all forms
- [ ] Priority removed from Firestore queries
- [ ] Priority index removed
- [ ] Position calculated correctly for all roles
- [ ] No performance degradation
- [ ] All tests passing

## Timeline

1. **Phase 1-2**: Core ordering and RatingBar changes (2-3 hours)
2. **Phase 3-4**: Forms and data fetching (1-2 hours)
3. **Phase 5-6**: Firestore and documentation (1 hour)
4. **Testing**: Comprehensive testing (2-3 hours)

**Total Estimated Time**: 6-9 hours

