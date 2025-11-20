# Priority Refactoring Specification

## **Status**: ✅ Implementation Complete

The priority refactor has been completed. All priority references have been removed and replaced with connection-based ordering and position-derived ratings.

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
   - Include orphaned playlists at end (not reachable from any source)
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
   - Remove priority from new playlist history entries
   - Remove priority from ratingData objects in views
   - Priority field removed from being saved (old entries may still have it)

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
    
    // If this is a transient with a termination, insert the sink immediately after
    if (playlist.pipelineRole === 'transient' && playlist.terminationPlaylistId) {
      const sink = playlistMap.get(playlist.terminationPlaylistId);
      if (sink && sink.pipelineRole === 'sink' && !visited.has(sink.firebaseId)) {
        visited.add(sink.firebaseId);
        sink.pipelinePosition = position++;
        ordered.push(sink);
      }
    }
    
    // Follow nextStagePlaylistId
    if (playlist.nextStagePlaylistId) {
      const next = playlistMap.get(playlist.nextStagePlaylistId);
      if (next) traverse(next);
    }
  }
  
  sources.forEach(traverse);
  
  // 4. Add orphaned playlists (not reachable from any source) at the end
  const orphaned = playlists.filter(p => !visited.has(p.firebaseId));
  orphaned.forEach(p => {
    p.pipelinePosition = 1000 + ordered.length;
    ordered.push(p);
  });
  
  // 5. Reassign sink and terminal positions based on their order among sinks/terminals only
  const sinksAndTerminals = ordered.filter(p => 
    (p.pipelineRole === 'sink' || p.pipelineRole === 'terminal') && p.pipelinePosition < 1000
  );
  const totalPositions = sinksAndTerminals.length;
  
  // Assign positions 0, 1, 2, 3... to sinks and terminals based on their order
  let sinkTerminalPosition = 1;
  sinksAndTerminals.forEach(p => {
    p.pipelinePosition = sinkTerminalPosition - 1;
    sinkTerminalPosition++;
  });
  
  // 6. Assign the same position to parent transients (transients that terminate to sinks)
  ordered.forEach(p => {
    if (p.pipelineRole === 'transient' && p.terminationPlaylistId && p.pipelinePosition < 1000) {
      const sink = sinksAndTerminals.find(s => s.firebaseId === p.terminationPlaylistId);
      if (sink) {
        p.pipelinePosition = sink.pipelinePosition;
      }
    }
  });
  
  // Assign totalPositions to all playlists
  ordered.forEach(p => {
    p.totalPositions = totalPositions;
  });
  
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
- Orphaned playlists (not reachable from any source) are included at end of ordered list for visibility/editing
- Client-side ordering fully replaces Firestore `orderBy('priority')`
- Priority field removed from new album history entries

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
4. Orphaned playlists (not in any chain) - included at end of ordered list
5. Empty groups
6. Terminals (positioned as last in chain, max position, rating 1 above last sink)

## Rollback Plan

If issues arise:
1. Keep priority field in database (don't delete)
2. Add fallback: use priority if connections missing
3. Re-enable priority-based ordering as fallback
4. Test on staging before production

## Success Criteria

- [x] Playlists ordered by connection traversal, not priority
- [x] RatingBar uses position, not priority
- [x] Priority removed from all forms
- [x] Priority removed from Firestore queries
- [x] Priority index removed
- [x] Position calculated correctly for all roles
- [x] No performance degradation
- [x] All tests passing

## Implementation Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Update Ordering Logic | ✅ Complete | derivePipelineOrder() implemented, orderBy('priority') removed |
| Phase 2: Update RatingBar Component | ✅ Complete | Position-based widths and ratings implemented |
| Phase 3: Remove Priority from Forms | ✅ Complete | Removed from AddPlaylistView and EditPlaylistView |
| Phase 4: Update Data Fetching | ✅ Complete | Connection fields fetched, position data added to all views |
| Phase 5: Update Firestore | ✅ Complete | Priority index removed |
| Phase 6: Update Documentation | ✅ Complete | All priority references removed from codebase |

**Additional Improvements:**
- Sinks positioned directly below parent transient
- Transients share width with their sink
- Orphaned playlists included at end for visibility/editing
- Position data added to SearchView and ArtistView
- Priority completely removed from album history entries

## Timeline

1. **Phase 1-2**: Core ordering and RatingBar changes (2-3 hours)
2. **Phase 3-4**: Forms and data fetching (1-2 hours)
3. **Phase 5-6**: Firestore and documentation (1 hour)
4. **Testing**: Comprehensive testing (2-3 hours)

**Total Estimated Time**: 6-9 hours

