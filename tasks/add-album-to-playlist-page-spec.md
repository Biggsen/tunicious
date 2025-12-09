# Add Album to Playlist Page Specification

## **Status**: 📋 Planning

## Overview

This document specifies the creation of a dedicated "Add Album to Playlist" page, moving the functionality from embedded panels in `PlaylistManagementView.vue` and `PlaylistSingle.vue` to a standalone page similar to the playlist management page structure.

## Goals

1. **Dedicated Interface**: Create a focused page for adding albums to playlists
2. **Improved UX**: Separate the add album functionality from playlist management and individual playlist views
3. **Flexible Navigation**: Support both standalone use and navigation from specific playlist pages
4. **Consistency**: Follow the same design patterns as `PlaylistManagementView.vue`

## Current State

### Existing Implementation

The "Add Album to Playlist" functionality currently exists in two locations:

1. **PlaylistManagementView.vue** (lines 72-108)
   - Includes playlist selector dropdown
   - Allows adding albums to any playlist
   - Located at `/playlist/management`

2. **PlaylistSingle.vue** (lines 3020-3039)
   - Adds album to the current playlist (no selector)
   - Uses playlist ID from route params
   - Located at `/playlist/:id`

### Issues with Current Implementation

- Duplicated functionality across two components
- Inconsistent UX (selector in one, no selector in the other)
- Clutters playlist management and single playlist views
- No dedicated space for this common operation

## Proposed Solution

### New Page: Add Album to Playlist

**Route**: `/playlist/add-album`  
**Component**: `AddAlbumToPlaylistView.vue`  
**Location**: `src/views/playlists/AddAlbumToPlaylistView.vue`

#### Features

- Album search using `AlbumSearch` component
- Playlist selector dropdown (shows AudioFoodie playlists by default)
- Pre-select playlist when navigating from a playlist page (via query string)
- Add album to both Spotify playlist and Firebase collection
- Success/error message display
- Cache clearing after successful addition
- Back button to return to playlists page

#### Query String Support

- **Parameter**: `playlistId`
- **Usage**: When navigating from a playlist page, pre-select that playlist
- **Example**: `/playlist/add-album?playlistId=abc123`
- **Behavior**: If `playlistId` is provided, automatically select it in the dropdown

## Page Specifications

### Layout

```
┌─────────────────────────────────────┐
│  Back to Playlists                   │
├─────────────────────────────────────┤
│  Add Album to Playlist (h1)         │
├─────────────────────────────────────┤
│  [Spotify Connection Warning]       │
│  (if not connected)                 │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐ │
│  │ Add Album to Playlist          │ │
│  │                                │ │
│  │ Album: [AlbumSearch]           │ │
│  │ Target Playlist: [Dropdown]    │ │
│  │                                │ │
│  │ [Add Album to Playlist Button]│ │
│  └───────────────────────────────┘ │
├─────────────────────────────────────┤
│  [Error Messages]                   │
│  [Success Messages]                 │
└─────────────────────────────────────┘
```

### Form Fields

#### Album Search
- **Component**: `AlbumSearch` (existing component)
- **Binding**: `v-model="selectedAlbum"`
- **Validation**: Required before submission
- **Placement**: Left column in grid layout

#### Target Playlist
- **Type**: Select dropdown
- **Binding**: `v-model="albumForm.playlistId"`
- **Options**: User's AudioFoodie playlists
- **Format**: `{playlist.name} ({playlist.tracks.total} tracks)`
- **Default**: Pre-selected if `playlistId` query param exists
- **Validation**: Required before submission
- **Placement**: Right column in grid layout

### User Flow

#### Standalone Use
1. User navigates to `/playlist/add-album`
2. Page loads and fetches user's playlists
3. User searches for and selects an album
4. User selects target playlist from dropdown
5. User clicks "Add Album to Playlist"
6. Album is added to Spotify playlist
7. Album is added to Firebase collection
8. Success message displayed
9. Form resets
10. Cache cleared to update track counts

#### From Playlist Page
1. User is viewing a playlist at `/playlist/:id`
2. User clicks link/button to add album
3. Navigates to `/playlist/add-album?playlistId=:id`
4. Page loads with playlist pre-selected
5. User searches for and selects an album
6. User clicks "Add Album to Playlist" (playlist already selected)
7. Album is added to Spotify playlist
8. Album is added to Firebase collection
9. Success message displayed
10. Form resets (playlist remains selected)

## Technical Implementation

### New Component

**File**: `src/views/playlists/AddAlbumToPlaylistView.vue`

#### Imports Required
- `useRoute`, `useRouter` from `vue-router`
- `useUserData` composable
- `useUserSpotifyApi` composable
- `useAlbumsData` composable
- `usePlaylistData` composable
- `BackButton` component
- `BaseButton` component
- `ErrorMessage` component
- `AlbumSearch` component
- `clearCache` utility

#### State Management

```javascript
const selectedAlbum = ref(null);
const albumForm = ref({
  playlistId: route.query.playlistId || '' // Pre-select from query
});
const userPlaylists = ref([]);
const successMessage = ref('');
```

#### Key Functions

1. **`handleAddAlbum()`**
   - Validates album and playlist selection
   - Calls `addAlbumToPlaylist()` from `useUserSpotifyApi`
   - Gets playlist data via `getPlaylistDoc()`
   - Calls `addAlbumToCollection()` from `useAlbumsData`
   - Updates local playlist track count
   - Clears cache
   - Shows success/error message
   - Resets form (keeps playlist if from query param)

2. **`loadUserPlaylists()`**
   - Fetches user playlists via `getUserPlaylists()`
   - Filters to AudioFoodie playlists only
   - Populates dropdown

#### Lifecycle

- `onMounted`: Load playlists if Spotify connected
- `watch`: Watch for Spotify connection changes

### Router Updates

**File**: `src/router/index.js`

Add new route:

```javascript
{
  path: '/playlist/add-album',
  name: 'addAlbumToPlaylist',
  component: () => import('@views/playlists/AddAlbumToPlaylistView.vue'),
  meta: { 
    requiresAuth: true,
    requiresSpotify: true 
  }
}
```

### Component Updates

#### PlaylistManagementView.vue

**Action**: Remove the "Add Album to Playlist" section (lines 72-108)

**Rationale**: Functionality moved to dedicated page

#### PlaylistSingle.vue

**Action**: Replace the "Add Album to Playlist" section (lines 3020-3039) with a navigation link

**New Code**:
```vue
<div v-if="userData?.spotifyConnected" class="mt-8 bg-white shadow rounded-lg p-6">
  <h2 class="text-lg font-semibold mb-4">Add Album to Playlist</h2>
  <router-link 
    :to="{ name: 'addAlbumToPlaylist', query: { playlistId: id } }"
    class="btn-primary inline-block"
  >
    Go to Add Album Page
  </router-link>
</div>
```

**Alternative**: Could also show a button that navigates to the page

### Navigation Updates

#### PlaylistView.vue (Optional)

Add link to dropdown menu for easy access:

```vue
<RouterLink
  to="/playlist/add-album"
  class="block px-4 py-2 text-sm text-delft-blue hover:bg-delft-blue hover:text-white transition-colors no-underline"
  role="menuitem"
>
  <div class="flex items-center gap-2">
    <PlusIcon class="h-4 w-4" />
    <span>Add Album to Playlist</span>
  </div>
</RouterLink>
```

## UI/UX Requirements

### Styling
- Follow existing design patterns from `PlaylistManagementView.vue`
- Use TailwindCSS utility classes
- Match color scheme (delft-blue, mindero, etc.)
- Responsive grid layout (1 column mobile, 2 columns desktop)

### Components
- Use existing `BackButton` component
- Use existing `BaseButton` component
- Use existing `ErrorMessage` component
- Use existing `AlbumSearch` component
- Consistent form styling with `.form-group`, `.form-input` classes

### User Feedback
- Loading states during API calls
- Success messages after successful addition
- Error messages for failures
- Disabled button states when form invalid
- Clear validation messages

### Accessibility
- Proper form labels
- ARIA attributes where needed
- Keyboard navigation support
- Screen reader friendly

## Error Handling

### Validation Errors
- Album not selected: "Please select an album first"
- Playlist not selected: "Please select a playlist"
- Both required before submission

### API Errors
- Spotify API errors: Display error message from `spotifyError`
- Firebase errors: Display error message from collection operation
- Network errors: Generic network error message
- All errors logged via `logPlaylist()`

### Edge Cases
- No playlists available: Show message "No playlists found. Create a playlist first."
- Invalid playlistId in query: Ignore and show empty selection
- Spotify not connected: Show connection warning (not form)

## Cache Management

After successful album addition:
1. Clear playlist summaries cache: `playlist_summaries_${user.uid}`
2. Update local playlist track count (optimistic update)
3. Note: Individual playlist cache will be cleared when user views that playlist

## Testing Checklist

### Functional Tests
- [ ] Navigate to page standalone
- [ ] Navigate to page with `playlistId` query param
- [ ] Playlist pre-selected when query param present
- [ ] Album search works correctly
- [ ] Playlist dropdown populates with AudioFoodie playlists
- [ ] Form validation prevents submission without album
- [ ] Form validation prevents submission without playlist
- [ ] Album added to Spotify playlist successfully
- [ ] Album added to Firebase collection successfully
- [ ] Success message displayed after addition
- [ ] Form resets after successful addition
- [ ] Error messages displayed on failure
- [ ] Cache cleared after successful addition
- [ ] Back button navigates to playlists page

### Integration Tests
- [ ] Navigation from PlaylistSingle works
- [ ] Query parameter passed correctly
- [ ] Playlist remains selected after form reset (when from query)
- [ ] Track counts update correctly
- [ ] Playlist view reflects new album after addition

### Edge Cases
- [ ] No playlists available
- [ ] Spotify not connected
- [ ] Invalid playlistId in query
- [ ] Network errors during addition
- [ ] Invalid album selection

## Implementation Phases

### Phase 1: Create New Page
**Priority**: High  
**Estimated Time**: 2-3 hours

**Tasks**:
1. Create `AddAlbumToPlaylistView.vue` component
2. Implement form with album search and playlist selector
3. Add query string support for pre-selecting playlist
4. Implement `handleAddAlbum()` function
5. Add success/error message display
6. Add route to router
7. Test standalone page functionality

### Phase 2: Remove from Existing Pages
**Priority**: High  
**Estimated Time**: 1 hour

**Tasks**:
1. Remove "Add Album to Playlist" section from `PlaylistManagementView.vue`
2. Replace section in `PlaylistSingle.vue` with navigation link
3. Test navigation from playlist page
4. Verify query parameter passing

### Phase 3: Add Navigation Links (Optional)
**Priority**: Low  
**Estimated Time**: 30 minutes

**Tasks**:
1. Add link to PlaylistView dropdown menu
2. Test navigation from playlists page
3. Verify all navigation paths work

## Rollback Plan

If issues arise:
1. Keep existing panels in `PlaylistManagementView.vue` and `PlaylistSingle.vue`
2. New page can be disabled via route guard if needed
3. No database changes, so rollback is straightforward
4. Test each phase independently

## Notes

- Follows existing code patterns and conventions
- Uses existing composables and components
- No new database collections required
- Maintains consistency with `PlaylistManagementView.vue` structure
- Query string approach provides flexibility for future enhancements
- Could add "Recent Playlists" or "Favorite Playlists" in future

