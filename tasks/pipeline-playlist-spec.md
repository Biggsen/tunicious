# Pipeline Playlist System Specification

## Overview

This document specifies the new pipeline-based playlist system for AudioFoodie, which introduces flexible music evaluation pipelines with source, transient, terminal, and sink nodes.

## Current vs New Structure

### Current Structure
```json
{
  "playlistId": "spotifyId123",
  "name": "Known Curious",
  "type": "known",           // "known" or "new"
  "category": "curious",     // "queued", "curious", "interested", "great", "excellent", "wonderful", "end"
  "priority": 20,
  "userId": "user123",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### New Pipeline Structure
```json
{
  "playlistId": "spotifyId123",
  "name": "Rock Checking",
  "type": "rock",                      // Backward compatibility
  "category": "checking",              // Backward compatibility - custom stage name
  "group": "rock",                     // NEW: Flexible grouping (rock, jazz, 90s, etc.)
  "pipelineRole": "transient",         // NEW: "source", "transient", "terminal", "sink"
  "nextStagePlaylistId": "nicePlaylistId",     // NEW: Progressive connection
  "terminationPlaylistId": "notCheckingId",    // NEW: Termination connection (transient only)
  "priority": 20,
  "userId": "user123",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## Pipeline Roles

### Source
- **Purpose**: Entry point for new albums
- **Connections**: Only `nextStagePlaylistId` (no termination)
- **Track Limit**: None (can grow indefinitely)
- **Example**: "Rock Queued"

### Transient
- **Purpose**: Evaluation and decision points
- **Connections**: Both `nextStagePlaylistId` and `terminationPlaylistId`
- **Track Limit**: 100 tracks (creates backpressure)
- **Example**: "Rock Checking", "Rock Nice"

### Terminal
- **Purpose**: Final destination (cream of the crop)
- **Connections**: None (no outgoing connections)
- **Track Limit**: None (can accumulate)
- **Example**: "Rock Loving It"

### Sink
- **Purpose**: Termination points for rejected albums
- **Connections**: None (no outgoing connections)
- **Track Limit**: None (can accumulate)
- **Example**: "Rock Not Checking"

## Migration Strategy

### Phase 1: Add New Fields (Backward Compatible)
**Goal**: Add new pipeline fields without breaking existing functionality

**Tasks**:
1. Update Firebase schema to include new fields
2. Modify playlist creation/editing to populate new fields
3. Ensure existing code continues to work with old fields
4. Add validation for new field combinations

**New Fields to Add**:
- `group` (string)
- `pipelineRole` (enum: "source", "transient", "terminal", "sink")
- `nextStagePlaylistId` (string, optional)
- `terminationPlaylistId` (string, optional)

### Phase 2: Migrate Existing Playlists
**Goal**: Convert existing playlists to new pipeline structure

**Tasks**:
1. Create migration script to update existing playlists
2. Map current categories to new pipeline roles:
   - `"queued"` → `pipelineRole: "source"`
   - `"curious"`, `"interested"`, `"great"`, `"excellent"`, `"wonderful"` → `pipelineRole: "transient"`
   - `"end"` categories → `pipelineRole: "sink"`
3. Set appropriate `group` values based on existing `type`
4. Establish `nextStagePlaylistId` connections between progressive stages
5. Set `terminationPlaylistId` for transient nodes

**Migration Mapping**:
```javascript
// Example migration mapping
const migrationMap = {
  "known": {
    "queued": { pipelineRole: "source", group: "known" },
    "curious": { pipelineRole: "transient", group: "known" },
    "interested": { pipelineRole: "transient", group: "known" },
    "great": { pipelineRole: "transient", group: "known" },
    "excellent": { pipelineRole: "transient", group: "known" },
    "wonderful": { pipelineRole: "terminal", group: "known" },
    "end": { pipelineRole: "sink", group: "known" }
  },
  "new": {
    // Similar mapping for "new" type
  }
};
```

### Phase 3: Update UI and Logic
**Goal**: Implement pipeline-aware interface and functionality

**Tasks**:
1. Update playlist display to show pipeline connections
2. Add pipeline navigation (promote/terminate actions)
3. Implement track-based backpressure logic
4. Add pipeline management interface
5. Update album movement logic to use new structure

### Phase 4: Cleanup
**Goal**: Remove old fields and complete migration

**Tasks**:
1. Update all code to use new pipeline fields
2. Remove references to old `type` and `category` fields
3. Update database queries and indexes
4. Remove backward compatibility code

## Implementation Requirements

### Database Changes
1. Add new fields to playlists collection
2. Create indexes for new field combinations
3. Update Firestore rules if needed

### Code Changes
1. Update playlist data models
2. Modify playlist CRUD operations
3. Update UI components to display pipeline information
4. Implement pipeline navigation logic
5. Add validation for pipeline connections

### UI Changes
1. Display pipeline roles and connections
2. Add promote/terminate action buttons
3. Show track counts and limits
4. Implement pipeline management interface

## Validation Rules

### Pipeline Role Validation
- **Source**: Must have `nextStagePlaylistId`, no `terminationPlaylistId`
- **Transient**: Must have both `nextStagePlaylistId` and `terminationPlaylistId`
- **Terminal**: No `nextStagePlaylistId` or `terminationPlaylistId`
- **Sink**: No `nextStagePlaylistId` or `terminationPlaylistId`

### Connection Validation
- `nextStagePlaylistId` must reference a valid playlist in the same group
- `terminationPlaylistId` must reference a valid sink playlist in the same group
- No circular references in pipeline connections

### Group Consistency
- All connected playlists must have the same `group` value
- Pipeline connections only work within the same group

## Testing Strategy

### Unit Tests
1. Validate pipeline role combinations
2. Test connection validation logic
3. Verify migration mapping functions

### Integration Tests
1. Test playlist creation with new fields
2. Verify pipeline navigation works correctly
3. Test track-based backpressure logic

### Migration Tests
1. Test migration script on sample data
2. Verify existing functionality still works
3. Test rollback procedures

## Rollback Plan

If issues arise during migration:
1. Keep old fields functional during transition
2. Maintain backward compatibility until migration is complete
3. Have rollback scripts ready to revert new fields
4. Test migration on staging environment first
