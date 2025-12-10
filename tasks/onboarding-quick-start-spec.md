# Onboarding Quick Start Specification

## **Status**: 📋 Planning

## Overview

This document specifies a quick start option for onboarding that allows users to generate all playlists for both "New artist" and "Known artist" pipelines at once, bypassing the step-by-step playlist creation process. This provides a faster path to getting started for users who want to jump in quickly.

## Goals

1. **Reduce Time to Value**: Get users up and running with a complete pipeline in minutes
2. **Simplify Setup**: Eliminate the need to understand pipeline structure before creating playlists
3. **Provide Choice**: Offer quick start option (step-by-step coming soon) to accommodate different user preferences
4. **Ensure Completeness**: Generate a fully functional pipeline with all necessary connections

## Prerequisites

Users must have completed:
- ✅ Step 1: Spotify Integration
- ✅ Step 2: Last.fm Integration

The quick start option is available after these integrations are complete.

## Integration Point

The quick start option is presented as a new step in the onboarding flow:

```
1. Spotify Integration ✅
2. Last.fm Integration ✅
2.5. Choose Setup Method
   ├─> Quick Start: Generate All Playlists → Onboarding Complete (Available)
   └─> Step-by-Step → Continue to Step 3 (Create Source Playlist) (Coming Soon - Disabled)
```

## Pipeline Structure

### Complete Pipeline - Quick Start

The quick start generates complete pipelines for both "New artist" and "Known artist" groups, creating 20 playlists total (10 per group).

#### New Artists Pipeline (10 playlists)

1. **Source: "Queued"**
   - `pipelineRole`: `source`
   - `group`: `new`
   - `name`: `Queued`
   - Connections: `nextStagePlaylistId` → "Curious"

2. **Transient: "Curious"**
   - `pipelineRole`: `transient`
   - `group`: `new`
   - `name`: `Curious`
   - Connections:
     - `nextStagePlaylistId` → "Interested"
     - `terminationPlaylistId` → "1 star"

3. **Sink: "1 star"**
   - `pipelineRole`: `sink`
   - `group`: `new`
   - `name`: `1 star`
   - Connections: None

4. **Transient: "Interested"**
   - `pipelineRole`: `transient`
   - `group`: `new`
   - `name`: `Interested`
   - Connections:
     - `nextStagePlaylistId` → "Good"
     - `terminationPlaylistId` → "2 stars"

5. **Sink: "2 stars"**
   - `pipelineRole`: `sink`
   - `group`: `new`
   - `name`: `2 stars`
   - Connections: None

6. **Transient: "Good"**
   - `pipelineRole`: `transient`
   - `group`: `new`
   - `name`: `Good`
   - Connections:
     - `nextStagePlaylistId` → "Excellent"
     - `terminationPlaylistId` → "3 stars"

7. **Sink: "3 stars"**
   - `pipelineRole`: `sink`
   - `group`: `new`
   - `name`: `3 stars`
   - Connections: None

8. **Transient: "Excellent"**
   - `pipelineRole`: `transient`
   - `group`: `new`
   - `name`: `Excellent`
   - Connections:
     - `nextStagePlaylistId` → "Wonderful"
     - `terminationPlaylistId` → "4 stars"

9. **Sink: "4 stars"**
   - `pipelineRole`: `sink`
   - `group`: `new`
   - `name`: `4 stars`
   - Connections: None

10. **Terminal: "Wonderful"**
    - `pipelineRole`: `terminal`
    - `group`: `new`
    - `name`: `Wonderful`
    - Connections: None

#### Known Artists Pipeline (10 playlists)

Same structure as New Artists pipeline, but with `group`: `known`:
1. Queued (source)
2. Curious (transient)
3. 1 star (sink)
4. Interested (transient)
5. 2 stars (sink)
6. Good (transient)
7. 3 stars (sink)
8. Excellent (transient)
9. 4 stars (sink)
10. Wonderful (terminal)

#### Pipeline Flow

```
New Artists:
Source: "Queued" → Transient: "Curious" → Transient: "Interested" → Transient: "Good" → Transient: "Excellent" → Terminal: "Wonderful"
                    ↓ (1 star)              ↓ (2 stars)            ↓ (3 stars)            ↓ (4 stars)

Known Artists:
Source: "Queued" → Transient: "Curious" → Transient: "Interested" → Transient: "Good" → Transient: "Excellent" → Terminal: "Wonderful"
                    ↓ (1 star)              ↓ (2 stars)            ↓ (3 stars)            ↓ (4 stars)
```

## Technical Implementation

### New Composable: `usePipelineGeneration.js`

Create a new composable to handle pipeline generation:

```javascript
// src/composables/usePipelineGeneration.js

import { collection, addDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function generateCompletePipelines(userId, userSpotifyApi) {
  // Define playlist structure for both groups
  const newArtistsPlaylists = [
    { name: 'Queued', role: 'source', group: 'new' },
    { name: 'Curious', role: 'transient', group: 'new' },
    { name: '1 star', role: 'sink', group: 'new' },
    { name: 'Interested', role: 'transient', group: 'new' },
    { name: '2 stars', role: 'sink', group: 'new' },
    { name: 'Good', role: 'transient', group: 'new' },
    { name: '3 stars', role: 'sink', group: 'new' },
    { name: 'Excellent', role: 'transient', group: 'new' },
    { name: '4 stars', role: 'sink', group: 'new' },
    { name: 'Wonderful', role: 'terminal', group: 'new' }
  ];

  const knownArtistsPlaylists = [
    { name: 'Queued', role: 'source', group: 'known' },
    { name: 'Curious', role: 'transient', group: 'known' },
    { name: '1 star', role: 'sink', group: 'known' },
    { name: 'Interested', role: 'transient', group: 'known' },
    { name: '2 stars', role: 'sink', group: 'known' },
    { name: 'Good', role: 'transient', group: 'known' },
    { name: '3 stars', role: 'sink', group: 'known' },
    { name: 'Excellent', role: 'transient', group: 'known' },
    { name: '4 stars', role: 'sink', group: 'known' },
    { name: 'Wonderful', role: 'terminal', group: 'known' }
  ];

  const allPlaylists = [...newArtistsPlaylists, ...knownArtistsPlaylists];
  const createdSpotifyPlaylists = [];
  
  // Phase 1: Create all Spotify playlists (store IDs in memory)
  for (let i = 0; i < allPlaylists.length; i++) {
    const playlist = allPlaylists[i];
    try {
      const spotifyPlaylist = await userSpotifyApi.createPlaylist(
        `${playlist.group === 'new' ? 'New' : 'Known'} ${playlist.name}`,
        `[Tunicious] ${playlist.name} playlist for ${playlist.group} artist pipeline`
      );
      createdSpotifyPlaylists.push({ 
        ...playlist, 
        spotifyId: spotifyPlaylist.id 
      });
    } catch (error) {
      // Rollback: Delete all created Spotify playlists
      for (const created of createdSpotifyPlaylists) {
        await userSpotifyApi.deletePlaylist(created.spotifyId);
      }
      throw new Error(`Failed to create playlist: ${playlist.name}. All playlists rolled back.`);
    }
  }
  
  // Phase 2: Create all Firestore documents with connections
  // If any Firestore creation fails, rollback all Spotify playlists
  
  // Pass 1: Create all Firestore documents without connections
  // Store Firestore document IDs in a map keyed by "group-name"
  const firestoreIds = {}; // e.g., { 'new-Queued': 'abc123', 'new-Curious': 'def456', ... }
  
  try {
    for (const playlist of createdSpotifyPlaylists) {
      const docRef = await addDoc(collection(db, 'playlists'), {
        playlistId: playlist.spotifyId,
        name: playlist.name,
        group: playlist.group,
        pipelineRole: playlist.role,
        userId: userId,
        // Connections will be set in Pass 2
        nextStagePlaylistId: null,
        terminationPlaylistId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Store Firestore document ID using "group-name" as key
      const key = `${playlist.group}-${playlist.name}`;
      firestoreIds[key] = docRef.id;
    }
    
    // Pass 2: Update all playlists with connections using stored Firestore IDs
    // Use writeBatch for efficiency (up to 500 operations per batch)
    const batch = writeBatch(db);
    
    // Define connection mappings for each group
    const connections = {
      'new': {
        'Queued': { nextStagePlaylistId: 'new-Curious' },
        'Curious': { nextStagePlaylistId: 'new-Interested', terminationPlaylistId: 'new-1 star' },
        'Interested': { nextStagePlaylistId: 'new-Good', terminationPlaylistId: 'new-2 stars' },
        'Good': { nextStagePlaylistId: 'new-Excellent', terminationPlaylistId: 'new-3 stars' },
        'Excellent': { nextStagePlaylistId: 'new-Wonderful', terminationPlaylistId: 'new-4 stars' }
      },
      'known': {
        'Queued': { nextStagePlaylistId: 'known-Curious' },
        'Curious': { nextStagePlaylistId: 'known-Interested', terminationPlaylistId: 'known-1 star' },
        'Interested': { nextStagePlaylistId: 'known-Good', terminationPlaylistId: 'known-2 stars' },
        'Good': { nextStagePlaylistId: 'known-Excellent', terminationPlaylistId: 'known-3 stars' },
        'Excellent': { nextStagePlaylistId: 'known-Wonderful', terminationPlaylistId: 'known-4 stars' }
      }
    };
    
    // Update each playlist with its connections
    for (const playlist of createdSpotifyPlaylists) {
      const key = `${playlist.group}-${playlist.name}`;
      const firestoreId = firestoreIds[key];
      const playlistConnections = connections[playlist.group]?.[playlist.name];
      
      if (playlistConnections) {
        const updateData = {
          updatedAt: serverTimestamp()
        };
        
        if (playlistConnections.nextStagePlaylistId) {
          updateData.nextStagePlaylistId = firestoreIds[playlistConnections.nextStagePlaylistId];
        }
        
        if (playlistConnections.terminationPlaylistId) {
          updateData.terminationPlaylistId = firestoreIds[playlistConnections.terminationPlaylistId];
        }
        
        const playlistRef = doc(db, 'playlists', firestoreId);
        batch.update(playlistRef, updateData);
      }
    }
    
    // Commit all connection updates in a single batch
    await batch.commit();
    
  } catch (error) {
    // Rollback: Delete all created Spotify playlists
    for (const created of createdSpotifyPlaylists) {
      try {
        await userSpotifyApi.deletePlaylist(created.spotifyId);
      } catch (rollbackError) {
        // Log but continue with other rollbacks
        console.error(`Failed to rollback playlist ${created.spotifyId}:`, rollbackError);
      }
    }
    throw new Error(`Failed to create Firestore documents: ${error.message}. All Spotify playlists rolled back.`);
  }
  
  return createdSpotifyPlaylists;
}
```

### Key Functions Needed

1. **Generate Spotify Playlists**
   - Use `useUserSpotifyApi().createPlaylist()`
   - Create all playlists sequentially
   - Store Spotify playlist IDs

2. **Create Firestore Documents** (Two-Pass Approach)
   
   **Pass 1: Create all documents without connections**
   - Create all 20 playlist documents sequentially using `addDoc()`
   - Store Firestore document IDs in a map keyed by `"group-name"` (e.g., `"new-Queued"`, `"known-Curious"`)
   - Each document gets: `playlistId` (Spotify ID), `name`, `group`, `pipelineRole`, `userId`, `createdAt`, `updatedAt`
   - Set `nextStagePlaylistId` and `terminationPlaylistId` to `null` initially
   - Order doesn't matter since connections aren't set yet
   
   **Pass 2: Update all playlists with connections**
   - Use stored Firestore document IDs to build connection updates
   - Use `writeBatch()` for efficiency (up to 500 operations per batch)
   - Update each playlist with:
     - `nextStagePlaylistId`: Firestore document ID of target playlist (for source/transient)
     - `terminationPlaylistId`: Firestore document ID of sink playlist (for transient only)
   - Commit all updates in a single batch operation

3. **Connection Mapping**
   
   **New Artists Pipeline:**
   - `Queued` (source): `nextStagePlaylistId` → `Curious`
   - `Curious` (transient): `nextStagePlaylistId` → `Interested`, `terminationPlaylistId` → `1 star`
   - `Interested` (transient): `nextStagePlaylistId` → `Good`, `terminationPlaylistId` → `2 stars`
   - `Good` (transient): `nextStagePlaylistId` → `Excellent`, `terminationPlaylistId` → `3 stars`
   - `Excellent` (transient): `nextStagePlaylistId` → `Wonderful`, `terminationPlaylistId` → `4 stars`
   - `Wonderful` (terminal): No connections
   - All sinks (`1 star`, `2 stars`, `3 stars`, `4 stars`): No connections
   
   **Known Artists Pipeline:**
   - Same connection structure as New Artists, but with `group: "known"`

4. **Error Handling**
   - Two-phase rollback strategy:
     - Phase 1: Create all Spotify playlists, rollback all if any fails
     - Phase 2: Create all Firestore documents, rollback all Spotify playlists if any fails
   - Clear error messages indicating which playlist failed
   - Retry mechanism

### New Onboarding Step Component

Create `OnboardingChooseSetupMethodStep.vue`:

- Display two options side-by-side or as cards
- Quick Start option: "Generate all playlists for both New and Known artist pipelines" (enabled)
- Step-by-Step option: "I want to learn each step" (disabled, marked as "Coming Soon")
- Clear explanations of each option
- Progress indication
- Note: Step-by-step option is currently disabled as it's not fully implemented yet

## User Experience

### Initial State

After completing Last.fm integration, show:

- Heading: "Choose Your Setup Method"
- Brief explanation: "You can either generate all playlists at once or learn step-by-step"
- Two options presented clearly

### Quick Start Option

**Selection:**
- User clicks "Quick Start" option
- Brief confirmation: "This will create 20 playlists for both New and Known artist pipelines"
- "Generate Playlists" button

**During Generation:**
- Show progress: "Creating playlist 1/20...", "Creating playlist 2/20...", etc.
- Loading state with spinner
- Disable other interactions
- Display current playlist being created: "Creating New Queued..."

**Success State:**
- Show checkmarks for all 20 created playlists
- Display pipeline structure visually (both New and Known)
- Success message: "Your pipelines are ready! Onboarding complete."
- "Start Using Tunicious" button (goes to home/playlists)

**Error Handling:**
- If playlist creation fails, show which one failed
- "Try Again" button
- Note: Step-by-step option is currently disabled

### Step-by-Step Option

- Currently disabled (marked as "Coming Soon")
- Will continue to Step 3 (Create Source Playlist) when implemented
- No changes to existing flow when enabled

## State Management

### Onboarding State Updates

When quick start is selected:

1. Store choice in `onboarding.stepData.setupMethod = 'quick_start'`
2. Store created playlist IDs in `onboarding.stepData.quickStartPlaylists`
3. Mark all steps as completed (all playlist creation steps skipped)
4. Set `onboarding.completed = true`
5. Set `onboarding.completedAt = Timestamp.now()`
6. Set `onboarding.currentStep = null`

### Skip Logic

In the onboarding flow, check if quick start was used:
- If `setupMethod === 'quick_start'`, onboarding is complete immediately after playlist generation
- User proceeds directly to main app (no further onboarding steps)

## Data Structure

### Playlist Documents Created

Each playlist document in Firestore:

```javascript
{
  playlistId: "spotify:playlist:...",  // Spotify playlist ID
  name: "Queued",                       // or "Curious", "1 star", etc.
  group: "new",                         // or "known"
  pipelineRole: "source",              // or "transient", "sink", "terminal"
  nextStagePlaylistId: "firebase:doc:id",  // Firestore document ID (for source/transient)
  terminationPlaylistId: "firebase:doc:id", // Firestore document ID (for transient only)
  userId: "user123",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Connection Mapping

**New Artists Pipeline:**
- Source ("Queued"): `nextStagePlaylistId` → "Curious"
- Transient ("Curious"): `nextStagePlaylistId` → "Interested", `terminationPlaylistId` → "1 star"
- Transient ("Interested"): `nextStagePlaylistId` → "Good", `terminationPlaylistId` → "2 stars"
- Transient ("Good"): `nextStagePlaylistId` → "Excellent", `terminationPlaylistId` → "3 stars"
- Transient ("Excellent"): `nextStagePlaylistId` → "Wonderful", `terminationPlaylistId` → "4 stars"
- Terminal ("Wonderful"): No connections
- All sinks: No connections

**Known Artists Pipeline:**
- Same connection structure as New Artists, but with `group: "known"`

## Validation

### Before Quick Start

- ✅ Verify Spotify is connected (`userData.spotifyConnected === true`)
- ✅ Verify Last.fm is connected (`userData.lastFmAuthenticated === true`)
- ✅ Check if user already has any playlists in Firestore
  - If playlists exist, skip onboarding entirely (user shouldn't be in onboarding if they have playlists)
  - This check should happen in Step 4 (Create Source Playlist) of the main onboarding flow

### After Quick Start

- ✅ Verify all 20 playlists created on Spotify (10 for "new", 10 for "known")
- ✅ Verify all 20 Firestore documents created
- ✅ Verify connections are set correctly for both pipelines
- ✅ Verify playlists have `[Tunicious]` tag in description
- ✅ Verify onboarding is marked as completed

## Error Scenarios

### Partial Failure

**Two-Phase Rollback Strategy:**

**Phase 1: Spotify Playlist Creation**
- Create all 20 Spotify playlists sequentially
- Store all created Spotify playlist IDs in memory
- If any Spotify playlist creation fails:
  - Rollback: Delete all Spotify playlists created so far
  - Show error: "Failed creating [playlist name]. All playlists rolled back."
  - Provide "Try Again" button

**Phase 2: Firestore Document Creation**
- After all Spotify playlists are created successfully, create all Firestore documents
- If any Firestore document creation fails:
  - Rollback: Delete all 20 Spotify playlists created in Phase 1
  - Show error: "Failed saving playlist data. All playlists rolled back."
  - Provide "Try Again" button

**Rationale:**
- Atomic operation: Either all 20 playlists succeed or none are created
- Clean state: No partial pipelines left in inconsistent state
- User-friendly: Clear progress indication and error messages

### Network Errors

- Show retry option
- Allow user to switch to step-by-step if preferred
- Cache partial state for recovery

### Existing Playlists

- If user already has playlists in Firestore, they should not be in onboarding
- Check for existing playlists should happen in Step 4 (Create Source Playlist) of main onboarding flow
- If playlists exist, skip onboarding entirely and redirect to main app

## Future Enhancements

1. **Customization Options**
   - Allow users to customize playlist names
   - Choose between minimal and full pipeline structure

2. **Additional Pipeline Types**
   - Quick start for genre-specific pipelines (Rock, Jazz, etc.)

3. **Template System**
   - Save custom pipeline structures as templates
   - Allow users to generate from saved templates

4. **Progress Persistence**
   - Save quick start progress if user navigates away
   - Resume from where they left off

## Files to Create/Modify

### New Files

1. `src/composables/usePipelineGeneration.js`
   - Core function to generate pipeline playlists
   - Error handling and rollback logic

2. `src/components/onboarding/OnboardingChooseSetupMethodStep.vue`
   - UI component for choosing setup method
   - Displays quick start and step-by-step options

### Modified Files

1. `src/composables/useOnboarding.js` (when created)
   - Add state management for setup method choice
   - Add skip logic based on quick start

2. `src/views/OnboardingView.vue` (when created)
   - Add new step component
   - Handle routing based on setup method choice
   - Complete onboarding immediately after quick start

## Testing Considerations

### Manual Testing

- [ ] Quick start creates all 20 playlists successfully (10 for "new", 10 for "known")
- [ ] Playlists are properly connected in Firestore for both pipelines
- [ ] Onboarding completes immediately after quick start (no further steps)
- [ ] User is redirected to main app after quick start completion
- [ ] Error handling works for failed playlist creation
- [ ] Phase 1 rollback works (Spotify playlist creation failure)
- [ ] Phase 2 rollback works (Firestore document creation failure)
- [ ] Step-by-step option still works normally
- [ ] Validation prevents quick start without integrations
- [ ] Existing playlists check prevents onboarding if user already has playlists

### Edge Cases

- User already has playlists (should skip onboarding)
- Spotify API rate limiting (20 playlists may hit rate limits)
- Network disconnection during creation
- User navigates away during quick start
- Partial failure during Phase 1 (Spotify creation)
- Partial failure during Phase 2 (Firestore creation)

## Notes

- This creates complete pipelines for both "new" and "known" artist groups
- 20 playlists total are created (10 per group)
- After quick start completes, onboarding is finished - user proceeds to main app
- The generated pipelines can be modified after creation (add more playlists, etc.)
- **Current Status**: Quick start is the only available option - step-by-step is disabled and marked as "Coming Soon"
- Step-by-step option is non-interactive (no click handler) and visually disabled
- If user already has playlists, they should not be in onboarding (check in Step 4 of main flow)

