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
- **Source**: Position 0 (clock icon, 100% width)
- **Transient**: Position 1, 2, 3... (notes icon, width = `(position / total) * 100%` where total = sinks + terminal)
- **Sink**: Position = position of terminating transient (stars, width = `(position / total) * 100%`)
- **Terminal**: Last item in chain, max position, rating = 1 above last sink (5 stars, 100% width)

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
**Note:**
- Priority field can remain in database (no migration needed)
- All playlists have already adopted pipeline structure, so no historical entries to handle

## Implementation Steps

### Phase 1: Update Ordering Logic
1. Remove `orderBy('priority')` from Firestore queries (rely fully on client-side ordering)
2. Implement `derivePipelineOrder()` function:
   - Find all sources in group, sort by `createdAt` (oldest first)
   - Traverse `nextStagePlaylistId` connections from each source
   - Build ordered array
   - Calculate position during traversal
   - Handle terminals as last item in chain (max position)
   - Exclude orphaned playlists (not reachable from any source)
3. Replace priority sorting with connection-based ordering
4. Store position as computed property on playlist objects
5. Calculate `totalPositions` for each group (count of sinks + terminals) for RatingBar width calculation

### Phase 2: Update RatingBar Component
1. Change props: `priority` → `pipelinePosition` and add `pipelineRole` (if not already present)
2. Add prop: `totalPositions` (number of sinks + terminal in group)
3. Update rating calculation:
   - Source: position 0 (clock icon, 100% width)
   - Transient: position 1+ (notes icon, width = `(position / totalPositions) * 100%`)
   - Sink: position from terminating transient (stars, width = `(position / totalPositions) * 100%`)
   - Terminal: max position (5 stars, 100% width, rating = 1 above last sink)
4. Remove `computeRatingFromPriority()` function
5. Add dynamic position-based width calculation

### Phase 3: Remove Priority from Forms
1. Remove priority input from `AddPlaylistView.vue`
2. Remove priority input from `EditPlaylistView.vue`
3. Remove priority from form validation
4. Remove priority from form submission

### Phase 4: Update Data Fetching
1. Update `usePlaylistData.js`:
   - Remove `orderBy('priority')` from Firestore query
   - Fetch `nextStagePlaylistId` and `terminationPlaylistId` from Firestore
   - Include `nextStagePlaylistId` and `terminationPlaylistId` in returned playlist objects
   - Remove priority from returned objects
   - Add position calculation using `derivePipelineOrder()`
   - Calculate `totalPositions` (sinks + terminal count) for each group
2. Update `useAlbumsData.js`:
   - Remove priority from playlist history entries (if used for display)
   - Priority field can remain in database

### Phase 5: Update Firestore
1. Remove `priority` index from `firestore.indexes.json`
2. Deploy index changes
3. Priority field can remain in database documents (no migration script needed)

### Phase 6: Update Documentation
1. Update `.cursor/rules/data-structures.mdc`:
   - Remove priority from Playlist interface
   - Document position calculation
   - Document connection-based ordering
2. Update `tasks/completed/pipeline-playlist-spec.md`:
   - Remove priority references
   - Document position-based rating system

## Position Calculation Algorithm

```javascript
function derivePipelineOrder(playlists) {
  // 1. Create lookup map
  const playlistMap = new Map();
  playlists.forEach(p => playlistMap.set(p.firebaseId, p));
  
  // 2. Find sources, sort by createdAt (oldest first)
  const sources = playlists
    .filter(p => p.pipelineRole === 'source')
    .sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateA - dateB;
    });
  
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
        visited.add(p.firebaseId);
        ordered.push(p);
      }
    }
  });
  
  // 5. Terminals are already handled during traversal (they're the end of chains)
  // Their position is set during traversal, and rating will be calculated as 1 above last sink
  
  // 6. Orphaned playlists (not reachable from any source) are excluded
  
  return ordered;
}
```

## RatingBar Changes

### Props
- Remove: `priority: Number`
- Add: `pipelinePosition: Number`
- Add: `pipelineRole: String` (if not already present)
- Add: `totalPositions: Number` (number of sinks + terminal in the group)

### Display Logic
- **Source** (position 0): Clock icon, 100% width (no progress bar, just icon display)
- **Transient** (position 1+): Notes icon, width = `(position / totalPositions) * 100%`
- **Sink** (position 1+): Stars, width = `(position / totalPositions) * 100%`, rating = position-based stars
- **Terminal** (max position): 5 stars, 100% width, rating = max(5, last sink rating + 1) stars

## Migration Considerations

### Existing Data
- Priority values in existing playlists can be ignored
- Priority field can remain in database (no deletion needed)
- Priority values in album history can be ignored (all playlists already use pipeline structure)
- No data migration needed (position calculated on-the-fly)

### Backward Compatibility
- Orphaned playlists (not reachable from any source) are excluded from ordered list
- Client-side ordering fully replaces Firestore `orderBy('priority')`

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
1. Multiple sources in one group (sorted by createdAt, each chain traversed separately)
2. Sinks connected to different transients (position = terminating transient position)
3. Broken connections (missing nextStagePlaylistId) - traversal stops
4. Orphaned playlists (not in any chain) - excluded from ordered list
5. Empty groups
6. Terminals (positioned as last in chain, max position, rating 1 above last sink)

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

