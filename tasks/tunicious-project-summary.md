# AudioFoodie Project Summary

## Overview

**AudioFoodie** is a music backlog management system that transforms music discovery into a structured, manageable listening pipeline. Built on a 10+ year proven methodology, it uses a pipeline-based approach where albums move through rating categories (Queued → Curious → Interested → Great → Excellent → Wonderful) based on listening decisions.

### Core Philosophy
- **Containment**: Limits the number of active albums being evaluated (preventing decision paralysis)
- **Active Listening**: Requires deliberate decisions to move albums forward
- **Pipeline Flow**: Albums move through structured stages based on listening decisions
- **100-Track Limit**: Transient playlists capped at 100 tracks to force decision-making

### Current State
- ✅ 10+ years of proven methodology in personal use
- ✅ Single user system (personal use)
- ✅ Spotify integration with Last.fm for listening data
- ✅ Manual playlist management
- ✅ Vue 3 frontend with Firebase backend

## Tech Stack

- **Frontend**: Vue 3 (Composition API), Vite, TailwindCSS
- **Backend**: Firebase (Firestore, Auth, Functions)
- **APIs**: Spotify API, Last.fm API
- **Development**: Storybook for component development
- **Styling**: SCSS + TailwindCSS

## Key Features

1. **Pipeline Playlist System**: Source → Transient → Terminal → Sink roles
2. **Album Tracking**: Tracks album progression through playlists
3. **Last.fm Integration**: Loved tracks and playcounts
4. **Spotify Player Integration**: In-app playback
5. **Album Mappings**: Handles alternate Spotify album IDs
6. **Caching System**: localStorage-based track data caching

---

# Outstanding Tasks

## Critical/High Priority Tasks

### 1. Firebase Project Separation
**Status**: Not Started  
**Spec**: `tasks/firebase-project-separation-spec.md`

Separate development and production environments into distinct Firebase projects for complete data isolation.

**Key Tasks:**
- Create development Firebase project
- Update environment-based Firebase configuration
- Remove environment-specific data structures (simplify user data)
- Update Firebase Functions deployment
- Update CI/CD pipeline
- Test and validate both environments

**Benefits:**
- Complete data isolation between dev/prod
- Improved security
- Simplified application code
- Better testing capabilities

### 2. Unified Track Data Cache
**Status**: In Progress (~70% complete)  
**Spec**: `tasks/unified-track-cache-spec.md`

Consolidate fragmented track data into a single unified cache structure to eliminate duplication and improve performance.

**Current Status:**
- ✅ Core cache utility and Vue composable implemented
- ✅ PlaylistSingle.vue and TrackList.vue integrated
- ⚠️ Some components still using old cache (SpotifyPlayerBar.vue, AlbumView.vue)
- ❌ Old cache cleanup not started

**Remaining Tasks:**
- Migrate remaining 3-4 components
- Remove old cache key references
- Delete old cache utilities

**Benefits:**
- Single source of truth for track data
- Reduced API calls
- Faster lookups
- Eliminated data duplication

### 3. Pipeline Groups Refactoring
**Status**: Not Started  
**Spec**: `tasks/pipeline-groups-refactor-spec.md`

Remove redundant `group` field from playlists and infer groups from pipeline connections using graph traversal.

**Key Tasks:**
- Create `pipelineGroups` collection
- Implement graph-based group inference algorithm
- Migrate existing playlists to new structure
- Update UI to use new group system
- Remove legacy `group` field

**Benefits:**
- Eliminates data redundancy
- Ensures consistency via graph connections
- Allows group metadata storage
- More maintainable structure

## Enhancement Tasks

### 4. Pipeline Enhancements (Optional)
**Status**: Not Started  
**Spec**: `tasks/enhancements/pipeline-enhancements.md`

**Priority Items:**
1. **Track-Based Backpressure Logic** (Medium Priority)
   - Enforce 100-track limits on transient playlists
   - Display track count/limit in UI
   - Prevent adding albums when at capacity

2. **Pipeline Management Interface** (Low Priority)
   - Visual graph/flowchart for pipeline connections
   - Drag-and-drop pipeline configuration
   - Color-coded by pipeline role

3. **Pipeline Navigation UI** (Low Priority)
   - Visual indicators showing pipeline connections
   - Pipeline role badges
   - Flow direction indicators

### 5. Security Hardening (Optional)
**Status**: Partial  
**Spec**: `tasks/enhancements/security-hardening-enhancements.md`

**Priority Items:**
1. **Rate Limiting** (High Priority)
   - Implement rate limiting on Firebase Functions
   - Prevent API quota exhaustion
   - Protect against abuse

2. **PKCE for OAuth** (Medium Priority)
   - Add PKCE to OAuth flow
   - Additional security for authorization code

3. **Secret Rotation** (Medium Priority)
   - Document rotation procedure
   - Set up periodic rotation schedule

## Commercialization Roadmap

### Phase 1: Enhanced Admin Interface
**Status**: Not Started  
**Timeline**: 2-3 months  
**Goal**: Add basic automation to current app while maintaining personal use

**Tasks:**
- [ ] Implement basic playlist sync automation
- [ ] Add 100-track limit enforcement
- [ ] Create automatic overflow playlist management
- [ ] Build simple movement rules between categories
- [ ] Add error handling and retry logic
- [ ] Create admin dashboard for monitoring automation

**Outcome**: Current app becomes a working prototype with automation

### Phase 2: Commercial Foundation
**Status**: Not Started  
**Timeline**: 4-6 months  
**Goal**: Build new commercial version with multi-platform support

**Tasks:**
- [ ] Design scalable architecture for multiple users
- [ ] Implement Last.fm as primary data bridge
- [ ] Build platform-agnostic playlist management
- [ ] Create user onboarding and setup flows
- [ ] Develop automated categorization system
- [ ] Build user management and authentication

**Outcome**: Commercial MVP with multi-platform support

### Phase 3: Migration and Launch
**Status**: Not Started  
**Timeline**: 2-3 months  
**Goal**: Migrate personal data and launch commercial product

**Tasks:**
- [ ] Migrate existing playlist data to commercial system
- [ ] Test automation with real historical data
- [ ] Create user documentation and guides
- [ ] Implement billing and subscription system
- [ ] Launch beta program
- [ ] Gather user feedback and iterate

**Outcome**: Commercial product with proven methodology

## Completed Tasks

- ✅ Pipeline playlist system refactor (`tasks/completed/pipeline-playlist-spec.md`)
- ✅ Priority field refactor (`tasks/completed/priority-refactor-spec.md`)
- ✅ Security remediation (`tasks/completed/security-remediation-spec.md`)

---

## Task Priority Summary

### Immediate Focus (Next 1-3 months)
1. Firebase Project Separation
2. Unified Track Data Cache
3. Pipeline Groups Refactoring

### Short-term Enhancements (3-6 months)
4. Track-based backpressure logic
5. Rate limiting implementation
6. Pipeline navigation UI improvements

### Long-term Strategy (6-12+ months)
7. Commercialization Phase 1
8. Commercialization Phase 2
9. Commercialization Phase 3

---

## Notes

- All major tasks have detailed specifications in the `tasks/` directory
- Commercialization roadmap is a longer-term strategic initiative
- Enhancement tasks are optional and can be prioritized based on user feedback
- The project has a solid foundation with the pipeline system successfully implemented
