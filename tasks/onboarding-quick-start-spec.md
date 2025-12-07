# Onboarding Quick Start Specification

## **Status**: 📋 Planning

## Overview

This document specifies a quick start option for onboarding that allows users to generate all playlists for a "New artist" pipeline at once, bypassing the step-by-step playlist creation process. This provides a faster path to getting started for users who want to jump in quickly.

## Goals

1. **Reduce Time to Value**: Get users up and running with a complete pipeline in minutes
2. **Simplify Setup**: Eliminate the need to understand pipeline structure before creating playlists
3. **Provide Choice**: Offer both quick start and step-by-step options to accommodate different user preferences
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
   ├─> Quick Start: Generate All Playlists → Skip to Step 4 (Add Album)
   └─> Step-by-Step → Continue to Step 3 (Create Source Playlist)
```

## Pipeline Structure

### "New Artist" Pipeline - Quick Start

The quick start generates a minimal but complete pipeline for discovering new artists:

#### Playlists Created

1. **Source: "Queued"**
   - `pipelineRole`: `source`
   - `group`: `new`
   - `name`: `Queued`
   - Connections: `nextStagePlaylistId` → "Checking"

2. **Transient: "Checking"**
   - `pipelineRole`: `transient`
   - `group`: `new`
   - `name`: `Checking`
   - Connections:
     - `nextStagePlaylistId`: `null` (can be set later)
     - `terminationPlaylistId` → "Not Checking"

3. **Sink: "Not Checking"**
   - `pipelineRole`: `sink`
   - `group`: `new`
   - `name`: `Not Checking`
   - Connections: None (sink has no outgoing connections)

#### Pipeline Flow

```
Source: "Queued"
  ↓ (nextStagePlaylistId)
Transient: "Checking"
  ├─> (nextStagePlaylistId) → (none initially, can be added later)
  └─> (terminationPlaylistId) → Sink: "Not Checking"
```

### Optional Future Enhancement

In the future, we could offer a more complete quick start with additional playlists:
- Additional Transient: "Nice"
- Terminal: "Loving It"

But for now, the minimal setup is sufficient to get users started.

## Technical Implementation

### New Composable: `usePipelineGeneration.js`

Create a new composable to handle pipeline generation:

```javascript
// src/composables/usePipelineGeneration.js

export async function generateNewArtistPipeline(userId, userSpotifyApi) {
  // Define playlist structure
  const playlists = [
    { name: 'Queued', role: 'source', group: 'new' },
    { name: 'Checking', role: 'transient', group: 'new' },
    { name: 'Not Checking', role: 'sink', group: 'new' }
  ];

  const createdPlaylists = [];
  
  // 1. Create all Spotify playlists
  for (const playlist of playlists) {
    const spotifyPlaylist = await userSpotifyApi.createPlaylist(
      playlist.name,
      `[AudioFoodie] ${playlist.name} playlist for new artist pipeline`
    );
    createdPlaylists.push({ 
      ...playlist, 
      spotifyId: spotifyPlaylist.id 
    });
  }
  
  // 2. Create Firestore documents with connections
  // 3. Link playlists
  
  return createdPlaylists;
}
```

### Key Functions Needed

1. **Generate Spotify Playlists**
   - Use `useUserSpotifyApi().createPlaylist()`
   - Create all playlists sequentially
   - Store Spotify playlist IDs

2. **Create Firestore Documents**
   - Create playlist documents in `playlists` collection
   - Set all required fields: `pipelineRole`, `group`, `name`, `userId`
   - Set connection fields: `nextStagePlaylistId`, `terminationPlaylistId`

3. **Link Playlists**
   - Source → Transient: Set `nextStagePlaylistId` on source
   - Transient → Sink: Set `terminationPlaylistId` on transient

4. **Error Handling**
   - Rollback strategy if any playlist creation fails
   - Clear error messages
   - Retry mechanism

### New Onboarding Step Component

Create `OnboardingChooseSetupMethodStep.vue`:

- Display two options side-by-side or as cards
- Quick Start option: "Generate all playlists for New Artist pipeline"
- Step-by-Step option: "I want to learn each step"
- Clear explanations of each option
- Progress indication

## User Experience

### Initial State

After completing Last.fm integration, show:

- Heading: "Choose Your Setup Method"
- Brief explanation: "You can either generate all playlists at once or learn step-by-step"
- Two options presented clearly

### Quick Start Option

**Selection:**
- User clicks "Quick Start" option
- Brief confirmation: "This will create 3 playlists for a New Artist pipeline"
- "Generate Playlists" button

**During Generation:**
- Show progress: "Creating Queued playlist...", "Creating Checking playlist...", etc.
- Loading state with spinner
- Disable other interactions

**Success State:**
- Show checkmarks for each created playlist
- Display pipeline structure visually
- Success message: "Your New Artist pipeline is ready!"
- "Continue" button to proceed to Step 4 (Add Album)

**Error Handling:**
- If playlist creation fails, show which one failed
- "Try Again" button
- Option to switch to step-by-step if preferred

### Step-by-Step Option

- Continue to Step 3 (Create Source Playlist) as normal
- No changes to existing flow

## State Management

### Onboarding State Updates

When quick start is selected:

1. Store choice in `onboarding.stepData.setupMethod = 'quick_start'`
2. Store created playlist IDs in `onboarding.stepData.quickStartPlaylists`
3. Mark steps as completed:
   - `create_source` (skipped)
   - `create_transient` (skipped)
   - `create_more_playlists` (skipped - sink already created)
4. Update `onboarding.currentStep` to `'add_album'` (Step 4)

### Skip Logic

In the onboarding flow, check if quick start was used:
- If `setupMethod === 'quick_start'`, skip steps 3, 5, and 9
- Proceed directly to Step 4 after quick start completes

## Data Structure

### Playlist Documents Created

Each playlist document in Firestore:

```javascript
{
  playlistId: "spotify:playlist:...",  // Spotify playlist ID
  name: "Queued",                       // or "Checking", "Not Checking"
  group: "new",
  pipelineRole: "source",               // or "transient", "sink"
  nextStagePlaylistId: "firebase:doc:id",  // For source/transient
  terminationPlaylistId: "firebase:doc:id", // For transient only
  userId: "user123",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Connection Mapping

- Source ("Queued") document:
  - `nextStagePlaylistId`: Firebase document ID of "Checking" playlist
  
- Transient ("Checking") document:
  - `terminationPlaylistId`: Firebase document ID of "Not Checking" playlist
  - `nextStagePlaylistId`: `null` (can be set later)

- Sink ("Not Checking") document:
  - No connection fields (sinks are terminal)

## Validation

### Before Quick Start

- ✅ Verify Spotify is connected (`userData.spotifyConnected === true`)
- ✅ Verify Last.fm is connected (`userData.lastFmAuthenticated === true`)
- ✅ Check for existing "new" group playlists (warn if they exist)

### After Quick Start

- ✅ Verify all 3 playlists created on Spotify
- ✅ Verify all 3 Firestore documents created
- ✅ Verify connections are set correctly
- ✅ Verify playlists have `[AudioFoodie]` tag in description

## Error Scenarios

### Partial Failure

If one playlist creation fails:
- **Option 1**: Rollback all created playlists and show error
- **Option 2**: Continue with successfully created playlists and show warning
- **Recommendation**: Option 1 (rollback) for cleaner state

### Network Errors

- Show retry option
- Allow user to switch to step-by-step if preferred
- Cache partial state for recovery

### Existing Playlists

- Check if playlists with same names already exist
- Warn user before creating
- Option to skip creation of existing playlists

## Future Enhancements

1. **Customization Options**
   - Allow users to customize playlist names
   - Choose between minimal and full pipeline structure

2. **Additional Pipeline Types**
   - Quick start for "Known Artist" pipeline
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

1. `tasks/onboarding-journey-spec.md`
   - Add Step 2.5: Choose Setup Method
   - Update flow diagrams
   - Document skip logic for quick start

2. `src/composables/useOnboarding.js` (when created)
   - Add state management for setup method choice
   - Add skip logic based on quick start

3. `src/views/OnboardingView.vue` (when created)
   - Add new step component
   - Handle routing based on setup method choice

## Testing Considerations

### Manual Testing

- [ ] Quick start creates all 3 playlists successfully
- [ ] Playlists are properly connected in Firestore
- [ ] User can proceed to Step 4 after quick start
- [ ] Error handling works for failed playlist creation
- [ ] Rollback works if creation fails partway through
- [ ] Step-by-step option still works normally
- [ ] Validation prevents quick start without integrations

### Edge Cases

- User already has "Queued" playlist
- Spotify API rate limiting
- Network disconnection during creation
- User navigates away during quick start

## Notes

- This is a minimal implementation to get users started quickly
- More advanced customization can be added later
- The generated pipeline can be modified after creation (add more playlists, etc.)
- Quick start is optional - step-by-step remains the default for learning

