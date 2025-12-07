# Onboarding/Getting Started Journey Specification

## **Status**: 📋 Planning

## Overview

This document specifies a comprehensive onboarding flow that guides new users through the complete Tunicious workflow. The onboarding journey takes users from initial account setup through all core features: Spotify and Last.fm integrations, playlist creation, album management, listening and hearting, album processing, and advanced playlist setup.

## Goals

1. **Educate Users**: Teach users how Tunicious works through hands-on experience
2. **Reduce Friction**: Make initial setup feel guided and supported
3. **Complete Setup**: Ensure users have a working pipeline after onboarding
4. **Build Confidence**: Help users understand the core workflow before they're on their own
5. **Optional**: Allow users to skip or resume onboarding at any time

## User Flow Overview

```
0. Welcome & Profile Setup
   ↓
1. Spotify Integration
   ↓
2. Last.fm Integration
   ↓
3. Create Source Playlist
   ↓
4. Create First Transient Playlist
   ↓
5. Add First Album
   ↓
6. Listen & Heart Tracks
   ↓
7. Process Album (Yes/No Decision)
   ↓
8. Create Sink & Additional Transient Playlists
   ↓
✅ Onboarding Complete
```

## Layout & Navigation

### Header During Onboarding

**Approach**: Minimal Header (Option 1)

- **Logo/Home Link**: Disabled (non-clickable, visual only)
- **Navigation Links**: Hidden (Playlists, Search, Styleguide not visible)
- **Account Link**: Visible but limited (see Account Access below)
- **Login Link**: Visible if not authenticated
- **Visual State**: Logo appears but is not clickable (cursor: not-allowed, opacity: 0.6)

### Progress Indicator

**Location**: Above content area (between header and main content)

**Design**:
- Horizontal progress bar showing "Step X of 9" (includes welcome step)
- Visual checkmarks for completed steps
- Current step highlighted
- Step names visible (optional, can be abbreviated)
- Matches existing page container width

**Example**:
```
[✓] [✓] [●] [ ] [ ] [ ] [ ] [ ]
Spotify Last.fm Create Source...
```

### Account Access

**Limited Account View**: During onboarding, account access is restricted

**Accessible**:
- View profile information (read-only)
- Access integrations section (for Spotify/Last.fm setup)
- View diagnostics (if needed for troubleshooting)

**Not Accessible**:
- Full account navigation
- Cache management
- Statistics (not relevant during onboarding)
- Security settings (except logout if needed)

**Implementation**: 
- Special route: `/account?onboarding=true`
- Conditional rendering in AccountView based on onboarding state
- Simplified sidebar or single-page view

### Skip Button

**Visibility**: Hidden until later steps

**When to Show**:
- After Step 3 (Create Source Playlist) - user has basic setup
- Or after Step 4 (Create Transient) - user has pipeline started
- Always available in a menu/overflow (three dots) for power users

**Behavior**:
- Shows warning: "You can skip onboarding, but some features may not be set up"
- Option to "Skip for Now" or "Complete Setup"
- If skipped, mark `onboarding.skipped = true`
- User can return to complete later via account settings

### Container Width

**Match Existing Pages**: Use same container width as other views

**Implementation**:
- Use existing container classes (e.g., `max-w-2xl`, `max-w-6xl` from existing views)
- Match padding and spacing patterns
- Consistent with HomeView, AccountView, etc.

### Route Locking

**Locked Routes** (redirect to `/onboarding`):
- `/` (home)
- `/playlists`
- `/playlist/*` (all playlist routes)
- `/search`
- `/artist/*`
- `/album/*`
- Any other main app routes

**Accessible Routes**:
- `/onboarding` (main onboarding flow)
- `/account` (limited view)
- `/login` (if not authenticated)
- `/signup` (if not authenticated)
- `/spotify-callback` (OAuth callback)
- `/lastfm-callback` (OAuth callback)
- `/verify-email` (if needed)
- `/forgot-password` (if needed)
- `/reset-password` (if needed)

**Router Guard Logic**:
```javascript
// In router/index.js beforeEach guard
if (user && !onboarding.completed && !onboarding.skipped) {
  // Check if current route is allowed
  const allowedRoutes = ['/onboarding', '/account', '/login', '/signup', 
                         '/spotify-callback', '/lastfm-callback', 
                         '/verify-email', '/forgot-password', '/reset-password'];
  
  if (!allowedRoutes.includes(to.path)) {
    next({ path: '/onboarding' });
    return;
  }
}
```

### Layout Structure

```
┌─────────────────────────────────────────┐
│  [Minimal Header]                        │
│  Logo (disabled) | Account Link          │
├─────────────────────────────────────────┤
│  [Progress Indicator: Step X of 9]      │
│  ✓ ● ○ ○ ○ ○ ○ ○ ○                      │
├─────────────────────────────────────────┤
│                                         │
│  [Onboarding Content - max-w-*]        │
│  - Step title                           │
│  - Step explanation                     │
│  - Step-specific content                │
│  - Forms, buttons, etc.                │
│                                         │
├─────────────────────────────────────────┤
│  [Action Buttons]                       │
│  [Back] [Continue] [Skip (if shown)]    │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Design

**Header**:
- Same styling as existing header (bg-mint, border-delft-blue)
- Disabled logo: `opacity: 0.6, cursor: not-allowed, pointer-events: none`
- Account link: Normal styling, functional

**Progress Indicator**:
- Background: Light (white or celadon)
- Active step: Highlighted with delft-blue or raspberry
- Completed steps: Checkmark icon, muted color
- Future steps: Empty circle, muted color
- Responsive: Stack vertically on mobile if needed

**Content Area**:
- Matches existing page container width
- Consistent padding (p-6 or similar)
- Card-based layout for step content
- Loading states, error states match existing patterns

## Data Structure

### Onboarding State in Firestore

Add to `users` collection:

```javascript
{
  onboarding: {
    completed: false,                    // Boolean - true when all steps done
    currentStep: 'welcome',              // String - current step identifier
    startedAt: Timestamp,                // When onboarding was first started
    completedAt: Timestamp,              // When onboarding was completed (null if not done)
    completedSteps: [                    // Array of completed step identifiers
      'welcome',
      'spotify',
      'lastfm',
      // ...
    ],
    stepData: {                          // Store step-specific data for resume
      sourcePlaylistId: 'spotify:playlist:...',
      transientPlaylistId: 'spotify:playlist:...',
      firstAlbumId: 'spotify:album:...',
      // ...
    },
    skipped: false,                      // Boolean - true if user skipped onboarding
    skippedAt: Timestamp                 // When onboarding was skipped (if applicable)
  }
}
```

### Step Identifiers

```javascript
const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  SPOTIFY: 'spotify',
  LASTFM: 'lastfm',
  CREATE_SOURCE: 'create_source',
  CREATE_TRANSIENT: 'create_transient',
  ADD_ALBUM: 'add_album',
  LISTEN_HEART: 'listen_heart',
  PROCESS_ALBUM: 'process_album',
  CREATE_MORE_PLAYLISTS: 'create_more_playlists'
};
```

## Step-by-Step Specifications

### Step 0: Welcome & Profile Setup

**Step ID**: `welcome`  
**Order**: 0  
**Estimated Time**: 1-2 minutes  
**Required Before**: All other steps

#### Purpose
Welcome new users to Tunicious, collect profile information, and set expectations about what's needed for the onboarding process.

#### Prerequisites
- User must be authenticated (Firebase Auth)
- User document exists in Firestore (created during signup)

#### User Experience

**Initial State - Profile Doesn't Exist**
- Welcome heading: "Welcome to Tunicious!"
- Brief explanation: "Tunicious helps you discover and organize your music through a pipeline system"
- "What You'll Need" section:
  - Last.fm account (with username)
  - Premium Spotify account
  - Brief explanation of why each is needed
- Profile form:
  - Display Name input (required)
  - "Get Started" button (disabled until field filled)

**Initial State - Profile Already Exists**
- Welcome heading: "Welcome to Tunicious!"
- Brief explanation: "Tunicious helps you discover and organize your music through a pipeline system"
- "What You'll Need" section:
  - Last.fm account (with username)
  - Premium Spotify account
  - Brief explanation of why each is needed
- Welcome message: "Let's get you set up!"
- "Get Started" button (immediately available)

**During Profile Creation**
- Show loading state: "Setting up your profile..."
- Disable form inputs
- Show progress indicator

**Success State**
- Brief success message (if profile was created)
- "Get Started" button to proceed to Step 1

**Error Handling**
- If profile creation fails, show error message
- Provide "Try Again" button
- Form validation errors shown inline

#### Technical Implementation

**Components**
- New: `OnboardingWelcomeStep.vue`
- Reuse profile creation logic from `AccountView.vue`

**State Updates**
- Update `onboarding.completedSteps` to include `'welcome'`
- Update `onboarding.currentStep` to `'spotify'`
- If profile created, update Firestore user document:
  - `displayName`: from form
  - `updatedAt`: serverTimestamp()

**Validation**
- `displayName` is required
- Display name: non-empty string
- Check if profile already exists before showing form

**Skip Behavior**
- Not skippable - required first step
- If profile already exists, form is skipped but welcome screen still shown

**Content Details**

**Welcome Message**:
- Brief, friendly introduction to Tunicious
- Focus on value proposition: music discovery and organization

**"What You'll Need" Section**:
- **Last.fm Account**:
  - Explanation: "For tracking your listening and loving tracks"
  - Note: "You'll need your Last.fm username"
- **Premium Spotify Account**:
  - Explanation: "Required for playing full albums and managing playlists"
  - Note: "Free accounts have limited playback features"

**Profile Form** (if needed):
- Display Name: Text input, required
- Field must be filled to enable "Get Started" button

---

### Step 1: Spotify Integration

**Step ID**: `spotify`  
**Order**: 1  
**Estimated Time**: 2-3 minutes  
**Required Before**: Steps 3-8

#### Purpose
Connect user's Spotify account to enable playlist management and music playback.

#### Prerequisites
- User must be authenticated (Firebase Auth)
- User profile must exist

#### User Experience

**Initial State**
- Brief explanation of why Spotify connection is needed:
  - "Spotify is required for playing music and managing playlists"
  - Safety note: "We won't mess with any of your existing playlists"
- Visual: Spotify logo/icon (matches existing design patterns)
- Clear call-to-action button: "Connect Spotify"

**During Connection**
- Show loading state: "Connecting to Spotify..."
- Redirect to Spotify OAuth (existing flow)
- Handle callback at `/spotify-callback`

**Callback Page Behavior**
- Show loading state while processing: "Connecting to Spotify..."
- On success: Show success message "Spotify connected successfully!"
- Display "Continue" button to proceed back to onboarding
- On error: Show error message with "Try Again" button
- Check if user is in onboarding mode and redirect accordingly

**Success State** (on onboarding step after callback)
- Checkmark icon
- Success message: "Spotify connected successfully!"
- Brief explanation of what's now possible
- "Continue" button to proceed to Step 2 (Last.fm)
- User must click button to advance (no auto-advance)

**Error Handling**
- If connection fails, show error message
- Provide "Try Again" button
- Not skippable - user must connect Spotify to continue onboarding

#### Technical Implementation

**Components**
- Reuse existing `useSpotifyAuth` composable
- Modify existing `SpotifyCallbackView` to:
  - Detect if user is in onboarding mode
  - Show success message with "Continue" button
  - Redirect to `/onboarding` when Continue is clicked (instead of `/account`)
- New: `OnboardingSpotifyStep.vue`
- Visual design matches existing Spotify connect button patterns

**State Updates**
- Update `onboarding.completedSteps` to include `'spotify'`
- Update `onboarding.currentStep` to `'lastfm'` (or `'welcome'` if not completed)
- Set `userData.spotifyConnected = true` (existing)

**Validation**
- Check `userData.spotifyConnected === true`
- Verify tokens exist in Firestore
- Test API connection (optional)

**Skip Behavior**
- Not skippable - Spotify connection is required
- User must complete this step to continue onboarding
- All subsequent steps (3-8) require Spotify connection

---

### Step 2: Last.fm Integration

**Step ID**: `lastfm`  
**Order**: 2  
**Estimated Time**: 2-3 minutes  
**Required Before**: Steps 6 (Listen & Heart), 7 (Process Album)

#### Purpose
Connect Last.fm account to enable track loving/hearting functionality.

#### Prerequisites
- Step 1 (Spotify) completed
- Step 0 (Welcome) completed (for displayName)

#### User Experience

**Initial State**
- Brief explanation of why Last.fm is needed:
  - "Last.fm enables track loving/hearting functionality"
  - What track loving enables (tracking favorites)
- Visual: Last.fm logo/icon (matches existing design patterns)
- Check if `lastFmUserName` exists:
  - If no: Show username entry form first (Step 2a)
  - If yes: Show username and proceed to connection (Step 2b)

**Username Entry (Step 2a - if needed)**
- Input field for Last.fm username (required)
- "Save Username" button
- Validation: Check username exists on Last.fm (optional)
- After saving: Show success message
- Then proceed to connection step (Step 2b)

**Connection Step (Step 2b)**
- Show Last.fm username (read-only, from Step 2a or existing)
- "Enable Track Loving" button to connect

**During Connection**
- Show loading state: "Connecting to Last.fm..."
- Redirect to Last.fm OAuth (existing flow)
- Handle callback at `/lastfm-callback`

**Callback Page Behavior**
- Show loading state while processing: "Connecting to Last.fm..."
- On success: Show success message "Last.fm connected successfully!"
- Display "Continue" button to proceed back to onboarding
- On error: Show error message with "Try Again" button
- Check if user is in onboarding mode and redirect accordingly

**Success State** (on onboarding step after callback)
- Checkmark icon
- Success message: "Last.fm connected successfully!"
- Brief explanation: "You can now love tracks while listening"
- "Continue" button to proceed to Step 3 (Create Source Playlist)
- User must click button to advance (no auto-advance)

**Error Handling**
- If username save fails, show error message
- Provide "Try Again" button
- If connection fails, show error message
- Provide "Try Again" button
- Not skippable - user must connect Last.fm to continue onboarding

#### Technical Implementation

**Components**
- Reuse existing `useLastFmApi` composable
- Modify existing `LastFmCallbackView` to:
  - Detect if user is in onboarding mode
  - Show success message with "Continue" button
  - Redirect to `/onboarding` when Continue is clicked (instead of `/account`)
- New: `OnboardingLastFmStep.vue`
- Visual design matches existing design patterns

**State Updates**
- Update `onboarding.completedSteps` to include `'lastfm'`
- Update `onboarding.currentStep` to `'create_source'`
- Set `userData.lastFmAuthenticated = true` (existing)
- If username was entered, update Firestore user document:
  - `lastFmUserName`: from form
  - `updatedAt`: serverTimestamp()

**Validation**
- `lastFmUserName` must be set (either already exists or entered in this step)
- Check `userData.lastFmAuthenticated === true`
- Verify session key exists in Firestore
- Test API connection (optional)

**Skip Behavior**
- Not skippable - Last.fm connection is required
- User must complete this step to continue onboarding
- Steps 6-7 (Listen & Heart, Process Album) require Last.fm connection

---

### Step 3: Create Source Playlist

**Step ID**: `create_source`  
**Order**: 3  
**Estimated Time**: 3-5 minutes  
**Required Before**: Steps 4, 5

#### Purpose
Create the first playlist in the pipeline - the source playlist where new albums are added.

#### Prerequisites
- Step 1 (Spotify) completed
- Spotify connection active

#### User Experience

**Initial State**
- Explanation of source playlists:
  - "Source playlists are where you add new albums you want to explore"
  - "Albums flow from source → transient → terminal/sink"
  - Visual: Simple pipeline diagram (source → transient → terminal)
- Show form to create playlist:
  - Playlist name input (suggest: "My Music Queue" or "Albums to Check")
  - Description (optional, pre-filled with explanation)
  - Public/Private toggle (default: private)
  - "Create Source Playlist" button

**During Creation**
- Show loading state: "Creating playlist on Spotify..."
- Disable form inputs
- Show progress indicator

**Success State**
- Checkmark icon
- Success message: "Source playlist created!"
- Show playlist name and Spotify link (optional)
- Store playlist ID for later steps
- "Continue" button to next step

**Error Handling**
- If creation fails, show error message
- Provide "Try Again" button
- Allow manual entry of existing playlist ID (advanced option)

#### Technical Implementation

**Components**
- Reuse `useUserSpotifyApi.createPlaylist`
- New: `OnboardingCreateSourceStep.vue`
- Reuse `AlbumSearch` component for later steps

**State Updates**
- Update `onboarding.completedSteps` to include `'create_source'`
- Update `onboarding.currentStep` to `'create_transient'`
- Store in `onboarding.stepData.sourcePlaylistId`
- Create Firestore playlist document with:
  - `pipelineRole: 'source'`
  - `group: 'default'` (or user-selected group)
  - `userId: user.uid`
  - Other required fields

**Validation**
- Verify playlist exists on Spotify
- Verify Firestore document created
- Check playlist has `[Tunicious]` tag in description

**Skip Behavior**
- Allow skip if user already has source playlists
- Show list of existing playlists, allow selection
- If skipped, use first available source playlist

---

### Step 4: Create First Transient Playlist

**Step ID**: `create_transient`  
**Order**: 4  
**Estimated Time**: 3-5 minutes  
**Required Before**: Steps 5, 7

#### Purpose
Create a transient playlist and link it to the source playlist, establishing the pipeline connection.

#### Prerequisites
- Step 3 (Create Source) completed
- Source playlist ID stored

#### User Experience

**Initial State**
- Explanation of transient playlists:
  - "Transient playlists are where you evaluate albums"
  - "You'll listen and decide: keep exploring (yes) or stop (no)"
  - Visual: Updated pipeline diagram showing source → transient
- Show form to create transient playlist:
  - Playlist name input (suggest: "Checking Out" or "Under Review")
  - Description (optional, pre-filled)
  - Public/Private toggle (default: private)
  - "Create Transient Playlist" button

**During Creation**
- Show loading state: "Creating transient playlist..."
- Disable form inputs

**After Creation - Link to Source**
- Show success: "Transient playlist created!"
- Explanation: "Now let's connect it to your source playlist"
- Show connection UI:
  - Source playlist: [display name] (read-only, from step 3)
  - Transient playlist: [display name] (read-only, just created)
  - "Link Playlists" button
- During linking: "Connecting playlists..."

**Success State**
- Checkmark icon
- Success message: "Playlists connected! Albums will flow from source to transient"
- Visual: Pipeline diagram showing connection
- "Continue" button to next step

**Error Handling**
- If creation fails, show error and retry option
- If linking fails, show error and retry option
- Allow manual linking via playlist selection

#### Technical Implementation

**Components**
- Reuse `useUserSpotifyApi.createPlaylist`
- Reuse `usePlaylistData` for linking
- New: `OnboardingCreateTransientStep.vue`

**State Updates**
- Update `onboarding.completedSteps` to include `'create_transient'`
- Update `onboarding.currentStep` to `'add_album'`
- Store in `onboarding.stepData.transientPlaylistId`
- Create Firestore playlist document with:
  - `pipelineRole: 'transient'`
  - `group: 'default'` (match source playlist group)
  - `nextStagePlaylistId: null` (will be set later)
  - `terminationPlaylistId: null` (will be set in step 8)
  - `userId: user.uid`
- Update source playlist document:
  - `nextStagePlaylistId: transientPlaylistId`

**Validation**
- Verify transient playlist exists on Spotify
- Verify Firestore documents created/updated
- Verify source playlist has `nextStagePlaylistId` set correctly

**Skip Behavior**
- Allow skip if user already has transient playlists
- Show list of existing transient playlists, allow selection
- If skipped, use first available transient playlist

---

### Step 5: Add First Album

**Step ID**: `add_album`  
**Order**: 5  
**Estimated Time**: 2-4 minutes  
**Required Before**: Steps 6, 7

#### Purpose
Add an album to the source playlist, demonstrating the album addition workflow.

#### Prerequisites
- Step 3 (Create Source) completed
- Source playlist ID available

#### User Experience

**Initial State**
- Explanation of adding albums:
  - "Add albums to your source playlist to start exploring"
  - "You can search for any album on Spotify"
- Show album search interface:
  - Search input field
  - "Search Albums" button
  - Results display (album cards with cover, name, artist)
- Instructions: "Search for an album you'd like to explore"

**Search Results**
- Display album search results in grid/list
- Each album shows:
  - Album cover image
  - Album name
  - Artist name
  - "Add to Source Playlist" button
- Allow multiple searches if needed

**During Addition**
- Show loading state: "Adding album to playlist..."
- Disable search and buttons
- Show progress: "Adding tracks to Spotify playlist..."

**Success State**
- Checkmark icon
- Success message: "[Album Name] added to your source playlist!"
- Show album card with confirmation
- Brief explanation: "This album is now in your queue"
- Store album ID for next steps
- "Continue" button to next step

**Error Handling**
- If search fails, show error and retry option
- If addition fails, show error and retry option
- Allow selecting different album

#### Technical Implementation

**Components**
- Reuse `AlbumSearch` component
- Reuse `useUserSpotifyApi.addAlbumToPlaylist`
- Reuse `useAlbumsData.addAlbumToCollection`
- New: `OnboardingAddAlbumStep.vue`

**State Updates**
- Update `onboarding.completedSteps` to include `'add_album'`
- Update `onboarding.currentStep` to `'listen_heart'`
- Store in `onboarding.stepData.firstAlbumId`
- Album added to Spotify playlist (via `addAlbumToPlaylist`)
- Album added to Firestore collection (via `addAlbumToCollection`)

**Validation**
- Verify album exists in Spotify playlist
- Verify album document exists in Firestore
- Check album appears in playlist view

**Skip Behavior**
- Allow skip if source playlist already has albums
- Show list of existing albums, allow selection
- If skipped, use first album from source playlist

---

### Step 6: Listen & Heart Tracks

**Step ID**: `listen_heart`  
**Order**: 6  
**Estimated Time**: 5-10 minutes (user-controlled)  
**Required Before**: Step 7

#### Purpose
Guide users through playing an album and hearting/loving tracks, demonstrating the listening and hearting workflow.

#### Prerequisites
- Step 5 (Add Album) completed
- Step 2 (Last.fm) completed (for hearting)
- Album ID available
- Spotify player initialized

#### User Experience

**Initial State**
- Explanation of listening and hearting:
  - "Listen to the album you just added"
  - "Love tracks you enjoy - this helps you remember favorites"
  - "You can love tracks from the player bar or track list"
- Show album card:
  - Album cover, name, artist
  - "Open Album in Playlist" button (links to playlist view)
  - Or: Embedded player/track list (if feasible)
- Instructions:
  1. "Click to open the album in your source playlist"
  2. "Start playing the album"
  3. "Love at least one track you enjoy"

**During Listening**
- Show progress indicator:
  - "Playing: [Track Name]"
  - "Loved tracks: X"
- Show player bar (existing component)
- Show track list with heart icons
- Highlight heart icon when clicked
- Update counter: "You've loved X tracks"

**Completion Criteria**
- User must love at least 1 track
- Track loving should be verified (check Last.fm or cache)
- Show success when criteria met

**Success State**
- Checkmark icon
- Success message: "Great! You've loved [X] tracks"
- Brief explanation: "Loved tracks help you track your favorites"
- "Continue" button to next step

**Error Handling**
- If player doesn't initialize, show troubleshooting
- If hearting fails, show error and retry option
- Allow manual verification (skip if already loved)

#### Technical Implementation

**Components**
- Reuse `SpotifyPlayerBar` component
- Reuse `TrackList` component
- Reuse `useSpotifyPlayer` composable
- Reuse `useUnifiedTrackCache.updateLovedStatus`
- New: `OnboardingListenHeartStep.vue`

**State Updates**
- Update `onboarding.completedSteps` to include `'listen_heart'`
- Update `onboarding.currentStep` to `'process_album'`
- Store in `onboarding.stepData.lovedTracksCount` (optional)
- Track loved status in unified cache
- Sync to Last.fm (background)

**Validation**
- Verify at least 1 track is loved
- Check loved status in unified cache
- Verify Last.fm sync (optional, can be async)

**Skip Behavior**
- Allow skip if user has already loved tracks
- Check if any tracks from the album are loved
- If skipped, assume user understands hearting

---

### Step 7: Process Album (Yes/No Decision)

**Step ID**: `process_album`  
**Order**: 7  
**Estimated Time**: 1-2 minutes  
**Required Before**: Step 8

#### Purpose
Guide users through making a yes/no decision about an album and moving it through the pipeline.

#### Prerequisites
- Step 4 (Create Transient) completed
- Step 5 (Add Album) completed
- Step 6 (Listen & Heart) completed (recommended)
- Album in source playlist
- Transient playlist available

#### User Experience

**Initial State**
- Explanation of processing albums:
  - "After listening, decide: do you want to explore more? (Yes) or stop here? (No)"
  - "Yes = move to transient playlist (keep exploring)"
  - "No = move to sink playlist (stop here)"
  - Visual: Pipeline diagram showing decision point
- Show album card:
  - Album cover, name, artist
  - Current location: "In: Source Playlist"
  - Loved tracks count (if available)
- Show decision buttons:
  - "Yes - Keep Exploring" (primary, green)
  - "No - Stop Here" (secondary, red)
- Instructions: "Make your decision about this album"

**During Processing**
- Show loading state: "Processing album..."
- Show progress:
  - "Removing from source playlist..."
  - "Adding to [target] playlist..."
  - "Updating database..."

**Success State - Yes Path**
- Checkmark icon
- Success message: "[Album Name] moved to [Transient Playlist Name]"
- Explanation: "The album will stay in your transient playlist for further evaluation"
- Visual: Updated pipeline showing album in transient
- "Continue" button to next step

**Success State - No Path**
- Checkmark icon
- Success message: "[Album Name] moved to sink playlist"
- Note: "You'll create a sink playlist in the next step"
- Explanation: "Albums you choose 'No' for go to sink playlists"
- "Continue" button to next step

**Error Handling**
- If processing fails, show error and retry option
- If playlist move fails, show error
- Allow manual processing via playlist view

#### Technical Implementation

**Components**
- Reuse `handleProcessAlbum` logic from `PlaylistSingle.vue`
- Reuse `useUserSpotifyApi` for playlist operations
- Reuse `useAlbumsData` for collection updates
- New: `OnboardingProcessAlbumStep.vue`

**State Updates**
- Update `onboarding.completedSteps` to include `'process_album'`
- Update `onboarding.currentStep` to `'create_more_playlists'`
- Store in `onboarding.stepData.processDecision` ('yes' or 'no')
- Move album in Spotify (remove from source, add to target)
- Update Firestore album document (playlist history)
- Update unified track cache

**Validation**
- Verify album removed from source playlist
- Verify album added to target playlist
- Verify Firestore document updated
- Check album appears in correct playlist

**Skip Behavior**
- Allow skip if user has already processed albums
- Check if album has been moved
- If skipped, assume user understands processing

---

### Step 8: Create Sink & Additional Transient Playlists

**Step ID**: `create_more_playlists`  
**Order**: 8  
**Estimated Time**: 5-7 minutes  
**Required Before**: Onboarding completion

#### Purpose
Complete the pipeline setup by creating sink playlist and optionally additional transient playlists.

#### Prerequisites
- Step 4 (Create Transient) completed
- Step 7 (Process Album) completed
- Understanding of pipeline structure

#### User Experience

**Initial State**
- Explanation of completing the pipeline:
  - "Let's finish setting up your pipeline"
  - "You need a sink playlist for albums you choose 'No' for"
  - "You can also create more transient playlists for different stages"
- Show current pipeline status:
  - Source: ✓ Created
  - Transient: ✓ Created
  - Sink: ✗ Not created
  - Additional Transients: Optional

**Create Sink Playlist**
- Form to create sink playlist:
  - Playlist name input (suggest: "Not For Me" or "Passed On")
  - Description (optional)
  - Public/Private toggle
  - "Create Sink Playlist" button
- During creation: "Creating sink playlist..."
- After creation: "Sink playlist created!"
- Link to transient playlist:
  - Show: "Connect sink to transient playlist"
  - Display transient playlist name
  - "Link Playlists" button
  - Success: "Sink playlist connected!"

**Optional: Additional Transient Playlist**
- Show option: "Create another transient playlist?"
- Explanation: "You can have multiple evaluation stages"
- If yes, show form similar to step 4
- Link new transient to previous transient or source
- Update pipeline diagram

**Final Pipeline Review**
- Show complete pipeline diagram:
  - Source → Transient → [Additional Transients] → Terminal (optional)
  - Sink (connected to transient)
- Show summary:
  - "You've created:"
  - "✓ Source playlist"
  - "✓ Transient playlist(s)"
  - "✓ Sink playlist"
- "Complete Onboarding" button

**Success State**
- Celebration animation/icon
- Success message: "Congratulations! Your pipeline is set up!"
- Summary of what was created
- "Start Using Tunicious" button (goes to home/playlists)

#### Technical Implementation

**Components**
- Reuse playlist creation components
- Reuse playlist linking logic
- New: `OnboardingCreateMorePlaylistsStep.vue`

**State Updates**
- Update `onboarding.completedSteps` to include `'create_more_playlists'`
- Update `onboarding.currentStep` to `null`
- Set `onboarding.completed = true`
- Set `onboarding.completedAt = Timestamp.now()`
- Store in `onboarding.stepData.sinkPlaylistId`
- Store in `onboarding.stepData.additionalTransientPlaylistIds` (array)
- Create Firestore playlist documents
- Update transient playlist with `terminationPlaylistId`
- Link playlists as needed

**Validation**
- Verify sink playlist exists
- Verify sink playlist linked to transient
- Verify all playlists in Firestore
- Check pipeline connections are valid

**Skip Behavior**
- Allow skip if user already has sink playlists
- Show list of existing sink playlists
- If skipped, use first available sink playlist

---

## Onboarding Component Architecture

### Main Components

```
src/views/
└── OnboardingView.vue              # Main onboarding container

src/components/onboarding/
├── OnboardingProgress.vue          # Progress indicator (steps 0-8)
├── OnboardingStep.vue              # Base step wrapper component
├── WelcomeStep.vue                  # Step 0
├── SpotifyConnectStep.vue           # Step 1
├── LastFmConnectStep.vue            # Step 2
├── CreateSourcePlaylistStep.vue     # Step 3
├── CreateTransientPlaylistStep.vue  # Step 4
├── AddAlbumStep.vue                 # Step 5
├── ListenHeartStep.vue              # Step 6
├── ProcessAlbumStep.vue             # Step 7
└── CreateMorePlaylistsStep.vue      # Step 8
```

### Composables

```
src/composables/
└── useOnboarding.js                 # Onboarding state management
```

## Technical Implementation Details

### useOnboarding Composable

```javascript
export function useOnboarding() {
  const user = useCurrentUser();
  const { userData } = useUserData();
  
  const onboardingState = ref(null);
  const currentStep = computed(() => onboardingState.value?.currentStep);
  const completedSteps = computed(() => onboardingState.value?.completedSteps || []);
  const isCompleted = computed(() => onboardingState.value?.completed === true);
  const stepData = computed(() => onboardingState.value?.stepData || {});
  
  // Load onboarding state from Firestore
  const loadOnboardingState = async () => { /* ... */ };
  
  // Update current step
  const updateCurrentStep = async (stepId) => { /* ... */ };
  
  // Mark step as completed
  const completeStep = async (stepId, data = {}) => { /* ... */ };
  
  // Skip onboarding
  const skipOnboarding = async () => { /* ... */ };
  
  // Complete onboarding
  const completeOnboarding = async () => { /* ... */ };
  
  // Check if step is completed
  const isStepCompleted = (stepId) => { /* ... */ };
  
  // Get step data
  const getStepData = (key) => { /* ... */ };
  
  return {
    onboardingState,
    currentStep,
    completedSteps,
    isCompleted,
    stepData,
    loadOnboardingState,
    updateCurrentStep,
    completeStep,
    skipOnboarding,
    completeOnboarding,
    isStepCompleted,
    getStepData
  };
}
```

### Router Integration

```javascript
// Add to router/index.js
{
  path: '/onboarding',
  name: 'onboarding',
  component: OnboardingView,
  meta: { 
    requiresAuth: true,
    skipIfCompleted: true  // Don't show if already completed
  }
}

// Add route guard
router.beforeEach(async (to, from, next) => {
  // ... existing auth guard ...
  
  // Check onboarding status
  if (to.meta.requiresAuth && !to.meta.skipOnboarding) {
    const user = await getCurrentUser();
    if (user) {
      const { isCompleted } = useOnboarding();
      await loadOnboardingState();
      
      if (!isCompleted.value && to.path !== '/onboarding') {
        // Redirect to onboarding if not completed
        next({ path: '/onboarding' });
        return;
      }
    }
  }
  
  next();
});
```

### OnboardingView Structure

```vue
<template>
  <div class="onboarding-container">
    <OnboardingProgress 
      :current-step="currentStep"
      :completed-steps="completedSteps"
    />
    
    <div class="onboarding-content">
      <OnboardingStep 
        v-if="currentStep === 'spotify'"
        :step-id="'spotify'"
        :title="'Connect Spotify'"
      >
        <SpotifyConnectStep />
      </OnboardingStep>
      
      <!-- Other steps... -->
    </div>
    
    <div class="onboarding-actions">
      <button @click="skipOnboarding">Skip for Now</button>
      <button v-if="canGoBack" @click="goToPreviousStep">Back</button>
    </div>
  </div>
</template>
```

## UI/UX Requirements

### Design Principles

1. **Clear Progress Indication**
   - Show step X of 8
   - Visual progress bar
   - Checkmarks for completed steps
   - Highlight current step

2. **Helpful Explanations**
   - Each step explains what and why
   - Use simple language
   - Visual aids (diagrams, icons)
   - Tooltips for advanced concepts

3. **Flexible Navigation**
   - Allow going back to previous steps
   - Allow skipping (with warnings)
   - Save progress automatically
   - Resume where left off

4. **Error Handling**
   - Clear error messages
   - Retry options
   - Fallback options (e.g., manual entry)
   - Support/help links

5. **Mobile Responsive**
   - Works on all screen sizes
   - Touch-friendly buttons
   - Readable text
   - Scrollable content

### Visual Design

- Use design system colors (mint, delft-blue, celadon)
- Consistent spacing and typography
- Loading states for all async operations
- Success animations/feedback
- Error states with clear messaging

## Edge Cases & Error Handling

### Connection Failures
- Spotify OAuth fails → Show error, allow retry
- Last.fm OAuth fails → Show error, allow retry
- Network errors → Show retry option

### Missing Prerequisites
- User tries to skip ahead → Redirect to required step
- Prerequisites not met → Show clear message

### Data Loss
- User closes browser mid-onboarding → Resume from last completed step
- Firestore write fails → Retry with exponential backoff

### Existing Data
- User already has playlists → Allow selection instead of creation
- User already connected services → Skip connection steps
- User already has albums → Use existing data

## Testing Strategy

### Manual Testing Checklist

**Step 1: Spotify Integration**
- [ ] New user can connect Spotify
- [ ] Existing connected user skips step
- [ ] Connection failure handled gracefully
- [ ] Progress saved after connection

**Step 2: Last.fm Integration**
- [ ] User can enter Last.fm username
- [ ] User can connect Last.fm
- [ ] Existing connected user skips step
- [ ] Connection failure handled gracefully

**Step 3: Create Source Playlist**
- [ ] User can create source playlist
- [ ] Playlist created on Spotify
- [ ] Playlist document created in Firestore
- [ ] Existing source playlists can be selected

**Step 4: Create Transient Playlist**
- [ ] User can create transient playlist
- [ ] Playlist linked to source
- [ ] Firestore documents updated correctly
- [ ] Existing transient playlists can be selected

**Step 5: Add Album**
- [ ] User can search for albums
- [ ] Album can be added to source playlist
- [ ] Album added to Firestore collection
- [ ] Existing albums can be selected

**Step 6: Listen & Heart**
- [ ] User can play album
- [ ] User can love tracks
- [ ] Loved status tracked correctly
- [ ] Completion criteria met

**Step 7: Process Album**
- [ ] User can make yes/no decision
- [ ] Album moved correctly (yes path)
- [ ] Album moved correctly (no path)
- [ ] Firestore updated correctly

**Step 8: Create More Playlists**
- [ ] User can create sink playlist
- [ ] Sink linked to transient
- [ ] Optional additional transient can be created
- [ ] Onboarding completes successfully

**General**
- [ ] Progress persists across page refreshes
- [ ] User can skip onboarding
- [ ] User can go back to previous steps
- [ ] Mobile responsive
- [ ] Error states handled
- [ ] Loading states shown

## Migration & Rollout

### For Existing Users

- Existing users should not be forced through onboarding
- Check `onboarding.completed` or `onboarding.skipped` before redirecting
- Existing users can access onboarding manually via `/onboarding` if desired
- Show "Take Tour" option in account settings

### For New Users

- New users automatically redirected to onboarding after signup
- Onboarding required before accessing main app features
- Can skip with understanding of limitations

## Future Enhancements

1. **Interactive Tutorials**
   - Tooltips pointing to UI elements
   - Highlight specific buttons/features
   - Step-by-step guided interactions

2. **Video Tutorials**
   - Embedded video explanations
   - Screen recordings of workflows
   - Optional video content

3. **Advanced Onboarding**
   - Multiple pipeline setup
   - Custom group creation
   - Advanced features tour

4. **Onboarding Analytics**
   - Track completion rates
   - Identify drop-off points
   - A/B test different flows

5. **Contextual Help**
   - Help button on each step
   - FAQ section
   - Support contact option

## Notes

- All existing composables and components should be reused where possible
- No breaking changes to existing functionality
- Onboarding is additive - doesn't modify core app behavior
- Consider performance: lazy load onboarding components
- Accessibility: Ensure keyboard navigation and screen reader support
- Internationalization: Consider i18n for future multi-language support

