# Pipeline Groups Refactoring Specification

## Overview

This document specifies the refactoring to remove the redundant `group` field from playlist documents and replace it with a `pipelineGroups` collection that stores group metadata separately. Groups will be inferred from pipeline connections using graph traversal, eliminating data redundancy and ensuring consistency.

## Problem Statement

### Current Issues

1. **Data Redundancy**: Each playlist document stores a `group` string field (e.g., "rock", "jazz", "90s"), duplicating the same value across many documents
2. **Storage Inefficiency**: The `group` field is stored on every playlist when it should be a shared entity
3. **Potential Inconsistency**: Multiple playlists in the same pipeline could have different `group` values if data gets out of sync
4. **Group Metadata Limitations**: Cannot easily store additional group metadata (display order, custom sorting, etc.) without adding more redundant fields

### Current Structure

```json
// Each playlist stores group redundantly
{
  "playlistId": "spotifyId123",
  "name": "Rock Checking",
  "group": "rock",                     // ❌ Stored on EVERY playlist
  "pipelineRole": "transient",
  "nextStagePlaylistId": "nicePlaylistId",
  "terminationPlaylistId": "notCheckingId",
  "priority": 20,
  "userId": "user123",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## Solution

### Core Concept

Groups are **computed from pipeline connections** using graph traversal (connected components). Each group has a single document in the `pipelineGroups` collection that stores metadata, and playlists reference it via `groupId`.

### Key Principles

1. **Single Source of Truth**: Group metadata exists in one place (`pipelineGroups` collection)
2. **Graph-Based Inference**: Groups are determined by pipeline connections (not manually assigned)
3. **Reference-Based**: Playlists reference groups via `groupId` field
4. **Validation**: All connected playlists must reference the same group

## Data Structure Changes

### New Collection: `pipelineGroups`

```json
{
  "groupId": "auto-generated-firebase-id",
  "name": "rock",                     // Display name (e.g., "rock", "jazz", "90s")
  "userId": "user123",                // Owner of the group
  "displayOrder": 0,                  // Optional: for custom sorting of groups in UI
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Fields:**
- `groupId` (string): Auto-generated Firestore document ID
- `name` (string): Display name for the group (required)
- `userId` (string): Owner user ID (required)
- `displayOrder` (number, optional): Custom sort order for groups
- `createdAt` (timestamp): Creation timestamp
- `updatedAt` (timestamp): Last update timestamp

**Indexes:**
- Single field index on `userId` (for querying user's groups)

### Updated Collection: `playlists`

```json
{
  "playlistId": "spotifyId123",
  "name": "Rock Checking",
  "groupId": "group-doc-id",          // ✅ Reference to pipelineGroups document (replaces "group" string)
  "pipelineRole": "transient",
  "nextStagePlaylistId": "firebaseId...",
  "terminationPlaylistId": "firebaseId...",
  "priority": 20,
  "userId": "user123",
  "type": "rock",                     // Backward compatibility (legacy)
  "category": "checking",             // Backward compatibility (legacy)
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Changes:**
- ❌ Remove: `group` (string) field
- ✅ Add: `groupId` (string) - Reference to `pipelineGroups` document

**Indexes:**
- Single field index on `userId` (existing)
- Single field index on `groupId` (new - for querying playlists by group)
- Composite index on `userId`, `groupId`, `priority` (for sorting playlists within groups)

## Group Inference Algorithm

### Connected Components Approach

Groups are determined by finding connected components in the playlist graph:

1. **Build Graph**: Create adjacency map from pipeline connections
   - Forward edges: `nextStagePlaylistId` connections
   - Reverse edges: Playlists that reference this playlist as their `nextStagePlaylistId` or `terminationPlaylistId`

2. **Traverse Components**: For each unvisited playlist:
   - Start BFS/DFS from current playlist
   - Follow both `nextStagePlaylistId` and `terminationPlaylistId` connections (bidirectional)
   - Also follow reverse connections (playlists that point TO this one)
   - All reachable playlists belong to the same component (group)

3. **Group Assignment**:
   - If playlists in component already have a `groupId`: Use existing group
   - If no `groupId` exists (new pipeline): Create new `pipelineGroups` document and assign to all playlists
   - If mixed `groupId` values: Validation error (data inconsistency)

### Algorithm Pseudocode

```javascript
function computeGroups(playlists) {
  const graph = buildGraph(playlists);
  const visited = new Set();
  const groups = [];
  
  for (const playlist of playlists) {
    if (visited.has(playlist.id)) continue;
    
    // Find connected component via BFS
    const component = findConnectedComponent(playlist.id, graph);
    component.forEach(id => visited.add(id));
    
    // Determine groupId for component
    const groupId = determineGroupId(component, playlists);
    groups.push({ groupId, playlistIds: component });
  }
  
  return groups;
}

function findConnectedComponent(startId, graph) {
  const component = [];
  const queue = [startId];
  const visited = new Set([startId]);
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    component.push(currentId);
    
    // Follow forward connections
    const neighbors = graph[currentId] || [];
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
    
    // Follow reverse connections
    const reverseNeighbors = graph.getReverse(currentId) || [];
    for (const reverseId of reverseNeighbors) {
      if (!visited.has(reverseId)) {
        visited.add(reverseId);
        queue.push(reverseId);
      }
    }
  }
  
  return component;
}
```

### Edge Cases

1. **Orphaned Playlists** (no connections):
   - If `groupId` exists: Use existing group
   - If no `groupId`: Create new group or assign to default group based on `type`

2. **Multiple Sources** (multiple entry points):
   - All sources in same connected component share the same group
   - Group name can be user-defined or derived from first source playlist

3. **Disconnected Components** (same group name, different graphs):
   - Should have separate group documents (different `groupId`)
   - UI can still group them visually by name if desired

## Migration Strategy

### Phase 1: Add New Structure (Backward Compatible)

**Goal**: Add `pipelineGroups` collection and `groupId` field without breaking existing functionality

**Tasks:**
1. Create `pipelineGroups` collection schema
2. Add Firestore indexes for new fields
3. Update Firestore security rules for `pipelineGroups` collection
4. Add `groupId` field to playlist creation/editing (optional during transition)
5. Implement group computation algorithm (for new pipelines)
6. Keep existing `group` field functional (for backward compatibility)

**New Firestore Rules:**
```javascript
match /pipelineGroups/{groupId} {
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
  allow update: if request.auth != null && resource.data.userId == request.auth.uid;
  allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
}
```

**Indexes to Add:**
```json
{
  "indexes": [
    {
      "collectionGroup": "pipelineGroups",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "playlists",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "groupId", "order": "ASCENDING" },
        { "fieldPath": "priority", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### Phase 2: Migration Script

**Goal**: Migrate existing playlists to new structure

**Migration Script Logic:**
```javascript
async function migratePlaylists() {
  // 1. Fetch all playlists for all users
  const allPlaylists = await getAllPlaylists();
  
  // 2. Group playlists by userId
  const playlistsByUser = groupBy(allPlaylists, 'userId');
  
  // 3. For each user:
  for (const [userId, userPlaylists] of Object.entries(playlistsByUser)) {
    // 4. Compute connected components
    const groups = computeGroups(userPlaylists);
    
    // 5. For each connected component:
    for (const group of groups) {
      // 6. Check if group document already exists
      let groupDoc = await findGroupByName(userId, group.name);
      
      // 7. If not, create new group document
      if (!groupDoc) {
        groupDoc = await createGroup({
          userId,
          name: group.name,
          displayOrder: getDisplayOrder(group.name)
        });
      }
      
      // 8. Update all playlists in component with groupId
      for (const playlistId of group.playlistIds) {
        await updatePlaylist(playlistId, {
          groupId: groupDoc.id
          // Keep 'group' field for backward compatibility during transition
        });
      }
    }
  }
}
```

**Migration Mapping:**
- For existing playlists with `group` field: Create `pipelineGroups` document and assign `groupId`
- For playlists without connections: Use `type` field as group name fallback
- Validate: Ensure all playlists in same component get same `groupId`

### Phase 3: Update Application Code

**Goal**: Update codebase to use `groupId` references and group computation

**Tasks:**
1. **Create `usePipelineGroups` composable:**
   - `fetchUserGroups(userId)` - Fetch all groups for user
   - `createGroup(name, userId)` - Create new group
   - `updateGroup(groupId, updates)` - Update group metadata
   - `deleteGroup(groupId)` - Delete group (validate no playlists reference it)
   - `computeGroupsFromPlaylists(playlists)` - Compute groups from connections
   - `getGroupForPlaylist(playlistId)` - Get group for a specific playlist

2. **Update `usePlaylistData` composable:**
   - Change `getAvailableGroups()` to query `pipelineGroups` collection
   - Join with playlists to filter groups that have playlists
   - Group playlists by `groupId` instead of `group` string

3. **Update Playlist Views:**
   - `AddPlaylistView.vue`: Add group selection/creation UI
   - `EditPlaylistView.vue`: Show group name from `pipelineGroups`, allow changing `groupId`
   - `PlaylistView.vue`: Use `groupId` for grouping, display group names from `pipelineGroups`

4. **Update Playlist CRUD Operations:**
   - On playlist creation: Compute or assign `groupId`
   - On playlist update: Validate `groupId` consistency with connections
   - On connection changes: Recompute groups if necessary

5. **Update Validation:**
   - Ensure all connected playlists share same `groupId`
   - Validate `nextStagePlaylistId` and `terminationPlaylistId` reference playlists with same `groupId`

### Phase 4: Group Management UI

**Goal**: Add UI for managing groups

**New Features:**
1. **Group Management Page:**
   - List all user's groups
   - Create new groups
   - Edit group names and display order
   - Delete groups (with validation)

2. **Group Selection in Playlist Forms:**
   - Dropdown to select existing group
   - Option to create new group
   - For new playlists: Auto-assign group based on connections

3. **Group Display:**
   - Show group name from `pipelineGroups` collection
   - Sort groups by `displayOrder` or creation date
   - Visual indicators for group relationships

### Phase 5: Remove Legacy Fields

**Goal**: Clean up backward compatibility code

**Tasks:**
1. Remove `group` field from playlist documents (migration script)
2. Remove `group` field from all TypeScript/JavaScript types
3. Update all queries to use `groupId` instead of `group`
4. Remove fallback logic for `group` field
5. Update documentation

## Validation Rules

### Group Assignment Validation

- All playlists in the same connected component must have the same `groupId`
- If a playlist's connections change, validate that new connections are within the same group
- On playlist creation: If connecting to existing playlist, use that playlist's `groupId`

### Pipeline Connection Validation

- `nextStagePlaylistId` must reference a playlist with the same `groupId`
- `terminationPlaylistId` must reference a playlist with the same `groupId`
- When updating connections, ensure `groupId` consistency

### Group Reference Validation

- `groupId` must reference a valid `pipelineGroups` document
- `pipelineGroups` document must belong to the same user as the playlist
- Cannot delete a group that has playlists referencing it

### Data Consistency Checks

```javascript
async function validateGroupConsistency(userId) {
  const playlists = await getPlaylistsByUser(userId);
  const groups = computeGroups(playlists);
  
  const errors = [];
  
  for (const group of groups) {
    const groupIds = group.playlistIds
      .map(id => playlists.find(p => p.id === id)?.groupId)
      .filter(Boolean);
    
    const uniqueGroupIds = new Set(groupIds);
    
    if (uniqueGroupIds.size > 1) {
      errors.push({
        component: group.playlistIds,
        conflictingGroupIds: Array.from(uniqueGroupIds)
      });
    }
  }
  
  return errors;
}
```

## Implementation Details

### New Composable: `usePipelineGroups.js`

```javascript
export function usePipelineGroups() {
  const groups = ref([]);
  const loading = ref(false);
  const error = ref(null);
  
  const fetchUserGroups = async (userId) => {
    // Query pipelineGroups collection by userId
  };
  
  const createGroup = async (name, userId, displayOrder = 0) => {
    // Create new pipelineGroups document
  };
  
  const updateGroup = async (groupId, updates) => {
    // Update group metadata
  };
  
  const deleteGroup = async (groupId) => {
    // Validate no playlists reference it, then delete
  };
  
  const computeGroupsFromPlaylists = (playlists) => {
    // Graph traversal algorithm
  };
  
  const assignGroupIdToPlaylist = async (playlistId, groupId) => {
    // Update playlist with groupId reference
  };
  
  return {
    groups,
    loading,
    error,
    fetchUserGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    computeGroupsFromPlaylists,
    assignGroupIdToPlaylist
  };
}
```

### Updated Query Pattern

**Before:**
```javascript
// Group by string field
const grouped = {};
playlists.forEach(p => {
  const group = p.group || 'unknown';
  if (!grouped[group]) grouped[group] = [];
  grouped[group].push(p);
});
```

**After:**
```javascript
// Join with pipelineGroups collection
const groups = await fetchUserGroups(userId);
const groupsMap = new Map(groups.map(g => [g.id, g]));

const grouped = {};
playlists.forEach(p => {
  const group = groupsMap.get(p.groupId);
  const groupName = group?.name || 'unknown';
  if (!grouped[groupName]) grouped[groupName] = [];
  grouped[groupName].push(p);
});
```

## Testing Strategy

### Unit Tests

1. **Group Computation Algorithm:**
   - Test connected component detection
   - Test with multiple disconnected components
   - Test with orphaned playlists
   - Test with circular references (should be prevented)

2. **Group CRUD Operations:**
   - Create group
   - Update group metadata
   - Delete group (with validation)
   - Fetch user groups

3. **Validation Logic:**
   - Validate groupId consistency
   - Validate connection constraints
   - Validate reference integrity

### Integration Tests

1. **Migration Script:**
   - Test migration on sample data
   - Verify all playlists get groupId assigned
   - Verify group documents are created correctly
   - Verify backward compatibility maintained

2. **Playlist Operations:**
   - Create playlist with group assignment
   - Update playlist connections (verify group consistency)
   - Delete playlist (verify group cleanup if needed)

3. **UI Components:**
   - Group selection in forms
   - Group display in playlist views
   - Group management interface

### Manual Testing Checklist

- [ ] Create new playlist without connections → Assigns to new or default group
- [ ] Create new playlist with connection → Inherits group from connected playlist
- [ ] Update playlist connection → Validates group consistency
- [ ] Create new group → Appears in group selector
- [ ] Delete group with playlists → Validation error
- [ ] Delete group without playlists → Success
- [ ] Migration script runs without errors
- [ ] Existing functionality still works after migration

## Rollback Plan

If issues arise during migration:

1. **Keep Backward Compatibility:**
   - Maintain `group` field during Phase 1-3
   - Code falls back to `group` field if `groupId` is missing
   - Allows gradual migration and rollback

2. **Rollback Script:**
   - Restore `group` field from `pipelineGroups` name
   - Remove `groupId` references
   - Delete `pipelineGroups` collection

3. **Staged Rollout:**
   - Test migration on staging environment first
   - Migrate one user at a time if possible
   - Monitor for errors before full rollout

4. **Data Validation:**
   - Validate data consistency before and after migration
   - Keep backups of original data
   - Ability to revert individual playlists if needed

## Success Criteria

- [ ] All playlists have `groupId` field
- [ ] All groups have corresponding `pipelineGroups` documents
- [ ] Group computation algorithm correctly identifies connected components
- [ ] UI displays groups correctly
- [ ] No data redundancy (group name stored once per group)
- [ ] Validation prevents group inconsistencies
- [ ] Migration script completes successfully
- [ ] No regression in existing functionality

## Future Enhancements

1. **Group Metadata:**
   - Custom group descriptions
   - Group icons/colors
   - Group-level settings

2. **Group Sharing:**
   - Share group templates between users
   - Export/import group structures

3. **Advanced Grouping:**
   - Nested groups (if needed in future)
   - Group hierarchies
   - Dynamic group computation rules

