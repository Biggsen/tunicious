# Pipeline System Enhancements

This document contains optional enhancements for the pipeline playlist system that were not included in the initial implementation.

## **Status**: Optional Enhancements

These items enhance the pipeline system with additional features and visualizations but are not required for core functionality.

---

## **1. Track-Based Backpressure Logic**

**Priority**: Medium  
**Status**: Not Started

### Overview
Implement automatic track limit enforcement for transient playlists to create backpressure in the pipeline system.

### Requirements

#### 1.1 Track Limit Enforcement
- **Transient playlists**: Enforce 100 track limit
- **Source playlists**: No limit (can grow indefinitely)
- **Terminal playlists**: No limit (can accumulate)
- **Sink playlists**: No limit (can accumulate)

#### 1.2 Implementation Details

**When to Check:**
- Before adding albums to transient playlists
- When displaying playlist information
- During album promotion/termination operations

**User Experience:**
- Show warning when transient playlist approaches limit (e.g., > 80 tracks)
- Display track count and limit in playlist UI
- Prevent adding albums to transient playlists that are at capacity
- Suggest promoting albums to next stage when limit is reached

**UI Indicators:**
- Display track count / limit (e.g., "87 / 100 tracks")
- Visual indicator (progress bar or color coding) when approaching limit
- Warning message when at or near capacity

### Technical Implementation

**Components to Update:**
- `PlaylistItem.vue` - Display track count and limit
- `PlaylistSingle.vue` - Check limit before adding albums
- `AlbumItem.vue` - Show warning if target playlist is at capacity
- `usePlaylistData.js` - Include track count in playlist data

**Data Sources:**
- Track count from Spotify API (`playlist.tracks.total`)
- Limit based on `pipelineRole` field

**Validation Logic:**
```javascript
function canAddToPlaylist(playlist, trackCount) {
  if (playlist.pipelineRole === 'transient' && trackCount >= 100) {
    return false; // At capacity
  }
  return true; // Source, terminal, or sink have no limits
}
```

---

## **2. Pipeline Management Interface**

**Priority**: Low  
**Status**: Not Started

### Overview
Create a visual interface for managing pipeline connections, viewing pipeline structure, and configuring pipeline relationships.

### Requirements

#### 2.1 Pipeline Visualization
- Display playlists as nodes in a graph/flowchart
- Show connections between playlists (`nextStagePlaylistId`, `terminationPlaylistId`)
- Color code by pipeline role:
  - Source: Green
  - Transient: Yellow/Orange
  - Terminal: Blue
  - Sink: Red
- Group playlists by `group` field
- Show track counts and limits

#### 2.2 Pipeline Configuration
- Drag-and-drop or click-to-connect interface for setting pipeline connections
- Visual validation of pipeline structure
- Ability to create new pipeline connections
- Ability to remove pipeline connections
- Validation feedback (e.g., "Source must have nextStagePlaylistId")

#### 2.3 Pipeline Navigation
- Click on playlist node to navigate to playlist detail page
- Highlight current playlist in pipeline view
- Show album flow through pipeline (if trackable)

### Technical Implementation

**New Components:**
- `PipelineView.vue` - Main pipeline management view
- `PipelineNode.vue` - Individual playlist node component
- `PipelineConnection.vue` - Connection line/arrow component
- `PipelineGroup.vue` - Group container component

**New Route:**
- `/playlists/pipeline` - Pipeline management page

**Libraries to Consider:**
- D3.js or vis.js for graph visualization
- Vue Flow (vue-flow) for flowchart-style interface
- Custom SVG-based solution for simpler implementation

**Data Structure:**
```javascript
// Pipeline graph structure
{
  groups: {
    [groupId]: {
      playlists: [
        {
          id: 'firebaseId',
          name: 'Playlist Name',
          pipelineRole: 'transient',
          trackCount: 87,
          trackLimit: 100,
          nextStagePlaylistId: 'nextId',
          terminationPlaylistId: 'sinkId',
          connections: {
            next: 'nextId',
            terminate: 'sinkId'
          }
        }
      ]
    }
  }
}
```

---

## **3. Pipeline Navigation UI**

**Priority**: Low  
**Status**: Not Started

### Overview
Add visual indicators and navigation aids to show pipeline connections throughout the application.

### Requirements

#### 3.1 Playlist Detail Page Enhancements
- Display pipeline connections visually
- Show "Next Stage" and "Termination" playlists with links
- Display pipeline position/flow indicator
- Show which playlists feed into current playlist (reverse connections)

#### 3.2 Playlist List Enhancements
- Show pipeline role badges/icons
- Display connection indicators (arrows or icons)
- Group playlists by pipeline group with visual separation
- Show pipeline flow direction

#### 3.3 Album Item Enhancements
- Show target playlist information when promoting/terminating
- Display pipeline path (e.g., "Source → Transient → Terminal")
- Visual feedback on pipeline movement

### Technical Implementation

**Components to Update:**
- `PlaylistSingle.vue` - Add pipeline connection display section
- `PlaylistView.vue` - Show pipeline structure in list view
- `PlaylistItem.vue` - Add pipeline role badges and connection indicators
- `AlbumItem.vue` - Show pipeline path information

**New Components:**
- `PipelineConnections.vue` - Display connections for a playlist
- `PipelineBadge.vue` - Role badge component
- `PipelineFlow.vue` - Visual flow indicator

**Visual Design:**
- Use icons for pipeline roles (source: clock, transient: notes, terminal: star, sink: archive)
- Use arrows or lines to show connections
- Color coding consistent with pipeline management interface

---

## **4. Pipeline Analytics (Future Consideration)**

**Priority**: Very Low  
**Status**: Not Started

### Overview
Track and display metrics about pipeline performance and album flow.

### Potential Features
- Albums processed per day/week
- Average time in each pipeline stage
- Most active pipelines
- Bottleneck identification (playlists with high track counts)
- Album movement history through pipeline

---

## Implementation Priority

1. **Track-Based Backpressure Logic** - Most practical immediate value
2. **Pipeline Navigation UI** - Enhances existing workflows
3. **Pipeline Management Interface** - Nice-to-have visualization

## Notes

- All enhancements are optional and can be implemented independently
- Track-based backpressure is the most critical for maintaining pipeline health
- Pipeline visualization is useful for complex multi-group setups
- Consider user feedback before implementing visualization features

