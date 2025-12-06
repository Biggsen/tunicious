<!-- PROJECT-MANIFEST:START -->
```json
{
  "schemaVersion": 1,
  "projectId": "tunicious",
  "name": "Tunicious",
  "repo": "Biggsen/tunicious",
  "visibility": "staging",
  "status": "active",
  "domain": "music",
  "type": "webapp",
  "lastUpdated": "2025-12-06",
  "links": {
    "prod": null,
    "staging": "https://audiofoodie-d5b2c.web.app/"
  },
  "tags": ["webapp", "vue", "firebase", "spotify", "lastfm", "music"]
}
```
<!-- PROJECT-MANIFEST:END -->

# Tunicious - Project Summary

<!-- 
  The manifest block above contains machine-readable metadata about the project.
  This block MUST be present at the top of the file and MUST be valid JSON.
  The parser extracts this block to populate the Project Atlas dashboard.
  
  Required fields:
  - schemaVersion: Always 1 for v1
  - projectId: Unique identifier (lowercase, hyphens)
  - name: Display name
  - repo: GitHub owner/repo-name
  - visibility: "public" | "staging" | "private"
  - status: "active" | "mvp" | "paused" | "archived"
  - domain: "music" | "minecraft" | "management" | "other" (field/area categorization)
  - type: "webapp" | "microservice" | "tool" | "cli" | "library" | "other" (technical architecture)
  - lastUpdated: ISO date string (YYYY-MM-DD)
  - links: Object with "prod" and "staging" (strings or null)
  - tags: Array of strings
-->

## Project Overview

<!-- 
  This section provides a high-level description of the project.
  Include: purpose, main goals, target audience, key value proposition.
-->

**Tunicious** is a music backlog management system that transforms music discovery into a structured, manageable listening pipeline. Built on a 10+ year proven methodology, it uses a pipeline-based approach where albums move through rating categories (Queued → Curious → Interested → Great → Excellent → Wonderful) based on listening decisions.

### Core Philosophy

- **Containment**: Limits the number of active albums being evaluated (preventing decision paralysis)
- **Active Listening**: Requires deliberate decisions to move albums forward
- **Pipeline Flow**: Albums move through structured stages based on listening decisions
- **100-Track Limit**: Transient playlists capped at 100 tracks to force decision-making

### Key Features

- Pipeline Playlist System: Source → Transient → Terminal → Sink roles
- Album Tracking: Tracks album progression through playlists
- Last.fm Integration: Loved tracks and playcounts
- Spotify Player Integration: In-app playback
- Album Mappings: Handles alternate Spotify album IDs
- Unified Track Cache: Single unified cache structure for all track data, loved status, and playcounts

---

## Tech Stack

<!-- 
  Document the technologies, frameworks, and tools used in the project.
  This helps with understanding dependencies and technical context.
-->

- **Frontend**: Vue 3 (Composition API), Vite, TailwindCSS
- **Backend**: Firebase (Firestore, Auth, Functions)
- **APIs**: Spotify API, Last.fm API
- **Development**: Storybook for component development
- **Styling**: SCSS + TailwindCSS

---

## Current Focus

<!-- 
  Describe what you're actively working on right now.
  This helps track immediate priorities and current development state.
-->

Recent completion of **Cache-Driven Playcount System** makes playcounts fully cache-driven with updates only when tracks finish playing (matching Last.fm scrobbling behavior with threshold requirements). The **Unified Track Data Cache** has consolidated all track-related data into a single unified cache structure, eliminating duplication and improving performance. Next focus areas include Firebase Project Separation for environment isolation and Pipeline Groups Refactoring to remove redundant data structures.

---

## Features (Done)

<!-- 
  WORK ITEM TYPE: Features
  
  List completed features and major accomplishments.
  Use checkboxes to mark completed items if desired.
  Items in this section will be tagged as "Features" by the parser.
  The parser will identify TODO items (- [ ] and - [x]) throughout the document.
-->

- [x] Pipeline Playlist System - Source → Transient → Terminal → Sink roles
- [x] Album Tracking - Tracks album progression through playlists
- [x] Last.fm Integration - Loved tracks and playcounts
- [x] Spotify Player Integration - In-app playback
- [x] Album Mappings - Handles alternate Spotify album IDs
- [x] Caching System - localStorage-based track data caching
- [x] Pipeline playlist system refactor
- [x] Priority field refactor
- [x] Security remediation
- [x] Unified Track Data Cache - Consolidated track data into single unified cache structure
- [x] Cache-Driven Playcount System - Fully cache-driven playcounts with threshold-based increment logic

### Detailed Completed Features

#### Pipeline Playlist System
- Implemented Source → Transient → Terminal → Sink role-based architecture
- Albums move through structured stages based on listening decisions
- Status: Production ready

#### Pipeline Playlist System Refactor
- Refactored playlist system to use role-based architecture
- Spec: `tasks/completed/pipeline-playlist-spec.md`
- Status: Completed

#### Priority Field Refactor
- Refactored priority field implementation
- Spec: `tasks/completed/priority-refactor-spec.md`
- Status: Completed

#### Security Remediation
- Completed security improvements
- Spec: `tasks/completed/security-remediation-spec.md`
- Status: Completed

#### Unified Track Data Cache
- Consolidated fragmented track data into a single unified cache structure
- Eliminated data duplication across multiple cache keys
- Implemented cache-first updates for loved tracks and playcounts
- All components migrated to use unified cache
- Cache Manager integration with statistics and manual refresh controls
- Spec: `tasks/completed/unified-track-cache-spec.md`
- Status: Completed

#### Cache-Driven Playcount System
- Fully cache-driven playcount system with updates only when tracks finish playing
- Threshold-based increment logic: natural finishes always count, skipped tracks require 4 minutes or 50% duration
- Removed all API calls from TrackList component
- Playcounts fetched only on initial load and explicit reload
- UI automatically updates and re-sorts when playcounts change
- Matches Last.fm scrobbling behavior
- Spec: `tasks/completed/cache-driven-playcount-spec.md` (completed December 6, 2025)
- Status: Completed

---

## Features (In Progress)

<!-- 
  WORK ITEM TYPE: Features
  
  List features currently being developed.
  Include estimated completion or progress indicators if helpful.
  Items in this section will be tagged as "Features" by the parser.
-->

No features currently in progress.

---

## Enhancements

<!-- 
  WORK ITEM TYPE: Enhancements
  
  List improvements and enhancements to existing features.
  These are not new features, but improvements to what already exists.
  Items in this section will be tagged as "Enhancements" by the parser.
-->

- [ ] Track-Based Backpressure Logic - Enforce 100-track limits on transient playlists (Medium Priority)
- [ ] Pipeline Management Interface - Visual graph/flowchart for pipeline connections (Low Priority)
- [ ] Pipeline Navigation UI - Visual indicators showing pipeline connections (Low Priority)
- [ ] Rate Limiting - Implement rate limiting on Firebase Functions (High Priority)
- [ ] PKCE for OAuth - Add PKCE to OAuth flow (Medium Priority)
- [ ] Secret Rotation - Document rotation procedure and set up periodic rotation schedule (Medium Priority)

### High Priority Enhancements

- **Rate Limiting**: Implement rate limiting on Firebase Functions to prevent API quota exhaustion and protect against abuse. Spec: `tasks/enhancements/security-hardening-enhancements.md`

### Medium Priority Enhancements

- **Track-Based Backpressure Logic**: Enforce 100-track limits on transient playlists, display track count/limit in UI, prevent adding albums when at capacity. Spec: `tasks/enhancements/pipeline-enhancements.md`

- **PKCE for OAuth**: Add PKCE to OAuth flow for additional security for authorization code. Spec: `tasks/enhancements/security-hardening-enhancements.md`

- **Secret Rotation**: Document rotation procedure and set up periodic rotation schedule. Spec: `tasks/enhancements/security-hardening-enhancements.md`

### Low Priority Enhancements

- **Pipeline Management Interface**: Visual graph/flowchart for pipeline connections, drag-and-drop pipeline configuration, color-coded by pipeline role. Spec: `tasks/enhancements/pipeline-enhancements.md`

- **Pipeline Navigation UI**: Visual indicators showing pipeline connections, pipeline role badges, flow direction indicators. Spec: `tasks/enhancements/pipeline-enhancements.md`

---

## Outstanding Tasks

<!-- 
  WORK ITEM TYPE: Tasks
  
  Inbox for uncategorized work items that may later become features or enhancements.
  Can be organized by priority, category, or timeline.
  Items in this section will be tagged as "Tasks" by the parser.
  
  Alternative section headings: "Tasks", "Outstanding Tasks", "Todo"
-->

### High Priority

- [ ] Core Authentication Pages - Complete authentication flow with signup, password reset, and email verification pages. Spec: `tasks/core-auth-pages-spec.md`

- [ ] Account Sidebar Navigation - Reorganize account details page with sidebar navigation for better organization and user experience. Spec: `tasks/account-sidebar-spec.md`

- [ ] Firebase Project Separation - Separate development and production environments into distinct Firebase projects for complete data isolation. Spec: `tasks/firebase-project-separation-spec.md`

- [ ] Pipeline Groups Refactoring - Remove redundant `group` field from playlists and infer groups from pipeline connections using graph traversal. Spec: `tasks/pipeline-groups-refactor-spec.md`

### Task Details

#### Core Authentication Pages
- **Description**: Complete authentication system with signup, password reset, and email verification pages
- **Key Tasks**: Create SignupView, ForgotPasswordView, ResetPasswordView, and VerifyEmailView components, implement password reset flow, add email verification handling, update router with new routes, enhance LoginView with links to new pages
- **Benefits**: Complete authentication flow, better user onboarding, password recovery functionality, email verification security
- **Spec**: `tasks/core-auth-pages-spec.md`
- **Status**: Planning

#### Account Sidebar Navigation
- **Description**: Reorganize account details page from single long-scrolling page into sidebar-based navigation with distinct sections
- **Key Tasks**: Create sidebar navigation component, implement nested routes for account sections, extract content into separate section components (Profile, Integrations, Diagnostics, Statistics, Cache, Security), update router with nested routes, implement responsive sidebar behavior
- **Benefits**: Better organization, improved user experience, reduced scrolling, clearer separation of functionality, easier navigation between account-related tasks
- **Spec**: `tasks/account-sidebar-spec.md`
- **Status**: Planning

#### Firebase Project Separation
- **Description**: Separate development and production environments into distinct Firebase projects for complete data isolation
- **Key Tasks**: Create development Firebase project, update environment-based Firebase configuration, remove environment-specific data structures, update Firebase Functions deployment, update CI/CD pipeline, test and validate both environments
- **Benefits**: Complete data isolation between dev/prod, improved security, simplified application code, better testing capabilities
- **Spec**: `tasks/firebase-project-separation-spec.md`

#### Pipeline Groups Refactoring
- **Description**: Remove redundant `group` field from playlists and infer groups from pipeline connections using graph traversal
- **Key Tasks**: Create `pipelineGroups` collection, implement graph-based group inference algorithm, migrate existing playlists to new structure, update UI to use new group system, remove legacy `group` field
- **Benefits**: Eliminates data redundancy, ensures consistency via graph connections, allows group metadata storage, more maintainable structure
- **Spec**: `tasks/pipeline-groups-refactor-spec.md`

---

## Project Status

<!-- 
  Optional section for project health indicators.
  Can include metrics, completion percentages, or status summaries.
-->

**Overall Status**: Active Development  
**Completion**: ~80%  
**Last Major Update**: December 6, 2025

### Current State

- ✅ 10+ years of proven methodology in personal use
- ✅ Single user system (personal use)
- ✅ Spotify integration with Last.fm for listening data
- ✅ Manual playlist management
- ✅ Vue 3 frontend with Firebase backend

### Metrics

- **Completed Features**: 11
- **Features In Progress**: 0
- **Outstanding Tasks**: 4
- **Enhancements**: 6

---

## Next Steps

<!-- 
  Outline immediate next actions and priorities.
  Helps track what should be worked on next.
-->

### Immediate (Next 1-3 months)

1. Core Authentication Pages
2. Account Sidebar Navigation
3. Firebase Project Separation
4. Pipeline Groups Refactoring

### Short-term (Next 3-6 months)

1. Track-based backpressure logic implementation
2. Rate limiting implementation
3. Pipeline navigation UI improvements
4. PKCE for OAuth implementation
5. Secret rotation documentation and setup

### Long-term (6-12+ months)

#### Commercialization Phase 1: Enhanced Admin Interface
- **Timeline**: 2-3 months
- **Goal**: Add basic automation to current app while maintaining personal use
- **Tasks**: Implement basic playlist sync automation, add 100-track limit enforcement, create automatic overflow playlist management, build simple movement rules between categories, add error handling and retry logic, create admin dashboard for monitoring automation
- **Outcome**: Current app becomes a working prototype with automation

#### Commercialization Phase 2: Commercial Foundation
- **Timeline**: 4-6 months
- **Goal**: Build new commercial version with multi-platform support
- **Tasks**: Design scalable architecture for multiple users, implement Last.fm as primary data bridge, build platform-agnostic playlist management, create user onboarding and setup flows, develop automated categorization system, build user management and authentication
- **Outcome**: Commercial MVP with multi-platform support

#### Commercialization Phase 3: Migration and Launch
- **Timeline**: 2-3 months
- **Goal**: Migrate personal data and launch commercial product
- **Tasks**: Migrate existing playlist data to commercial system, test automation with real historical data, create user documentation and guides, implement billing and subscription system, launch beta program, gather user feedback and iterate
- **Outcome**: Commercial product with proven methodology

---

## Notes

<!-- 
  Additional notes, decisions, or context that doesn't fit elsewhere.
  Can include architecture decisions, lessons learned, or future considerations.
-->

- All major tasks have detailed specifications in the `tasks/` directory
- Commercialization roadmap is a longer-term strategic initiative
- Enhancement tasks are optional and can be prioritized based on user feedback
- The project has a solid foundation with the pipeline system successfully implemented
- Current system is single-user (personal use) with potential for future multi-user expansion

---

<!-- 
  END OF TEMPLATE
  
  This template demonstrates the structure expected by Project Atlas.
  
  Key points:
  1. Manifest block MUST be at the top with valid JSON
  2. Four work item types are defined: Features, Enhancements, Bugs, Tasks
  3. Items are tagged by the section they appear in (no inference needed)
  4. TODO items use - [ ] (incomplete) and - [x] (completed) format
  5. Follow this structure when creating or regenerating project files
  
  Work Item Types:
  - Features: New functionality (sections like "Features (Done)", "Features (In Progress)")
  - Enhancements: Improvements to existing features (section: "Enhancements")
  - Bugs: Problems to fix (sections like "Known Issues", "Active Bugs")
  - Tasks: Inbox for uncategorized work (section: "Outstanding Tasks")
  
  The parser will:
  - Extract the manifest block and validate it
  - Parse markdown sections and extract work items
  - Tag items with their type based on section headings
  - Identify TODO items (- [ ] and - [x]) across all sections
  - Preserve markdown structure (lists, paragraphs, etc.)
-->
