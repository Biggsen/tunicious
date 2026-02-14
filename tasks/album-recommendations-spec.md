# Album Recommendations Specification

## **Status**: 📋 Planning

## Overview

This document specifies the Album Recommendations feature that enables users to recommend an album to a friend from the album page. The friend receives the recommendation in a new "Recommendations" tab on the Friends page, can accept it by choosing which source playlist to add the album to, or decline it.

## Goals

1. **Recommend from Album Page**: One-tap way to share an album with a friend from the album view.
2. **Clear Recipient UX**: Friends see incoming recommendations in a dedicated tab and can accept or decline.
3. **Accept = Add to Playlist**: Accepting a recommendation adds the album to the friend's chosen Tunicious (source) playlist and collection, reusing existing add-album flows.
4. **Audit Trail**: Store who recommended what, when, and (when accepted) which playlist and when.

## User Flow Overview

```
┌─────────────────────┐
│   Album Page        │
│   [Back] [Recommend] │  ← Recommend in same row as Back, right side
└──────────┬──────────┘
           │
           └──► Click Recommend ──► Modal: pick friend ──► Confirm
                                         │
                                         └──► Toast: "Recommendation sent!"
                                 
┌─────────────────────┐
│   Friends Page      │
│   [Friends][Requests][Recommendations]  ← New tab
└──────────┬──────────┘
           │
           └──► Recommendations tab: list of pending (from, album, artist)
                         │
                         ├──► Accept ──► Modal: "Add to which playlist?" ──► Pick playlist ──► Add album + mark accepted
                         │                      └──► Toast: success
                         └──► Decline ──► Mark declined, remove from list
```

## Data Structures

### albumRecommendations Collection

Stores album recommendations sent from one user to another.

**Document Structure:**
```javascript
{
  fromUserId: string,           // User ID of the sender
  toUserId: string,              // User ID of the recipient
  albumId: string,               // Spotify album ID
  albumTitle: string,            // Denormalized for display
  artistName: string,            // Denormalized for display
  status: 'pending' | 'accepted' | 'declined',
  createdAt: Timestamp,
  updatedAt: Timestamp,
  acceptedPlaylistId: string | null,   // Set when accepted (Spotify playlist ID)
  acceptedAt: Timestamp | null          // Set when accepted (optional)
}
```

**Document ID**: Auto-generated Firestore document ID

**Fields:**
- `fromUserId` (string, required): Firebase Auth UID of the user sending the recommendation
- `toUserId` (string, required): Firebase Auth UID of the friend receiving the recommendation
- `albumId` (string, required): Spotify album ID (for add-to-collection and add-to-playlist)
- `albumTitle` (string, required): Album name at time of recommendation (display in list)
- `artistName` (string, required): Artist name at time of recommendation (display in list)
- `status` (string, required): `'pending'` | `'accepted'` | `'declined'`
- `createdAt` (Timestamp, required): Server timestamp when recommendation was created
- `updatedAt` (Timestamp, required): Server timestamp of last update
- `acceptedPlaylistId` (string, optional): Spotify playlist ID the recipient added the album to; set when status becomes `'accepted'`
- `acceptedAt` (Timestamp, optional): Server timestamp when the recommendation was accepted

**Indexes Required:**
- Composite index on `toUserId`, `status` (for "my pending recommendations")
- Composite index on `toUserId`, `status`, `createdAt` (desc) for ordered list

**Constraints:**
- `fromUserId` and `toUserId` must be different (only recommend to friends, not self)
- Sender must be friends with recipient (enforced in UI/composable by only showing friends list)
- When creating, store sufficient album info so accept flow can call `addAlbumToCollection` (and optionally fetch full album from Spotify if needed)

## Page Specifications

### Album Page – Recommend Button & Modal

**Route**: `/album/:id` (with optional `?playlistId=`)  
**Component**: `AlbumView.vue`  
**Location**: `src/views/music/AlbumView.vue`

#### Layout

- **Top row**: Same row as the Back button.
  - **Left**: Existing `BackButton` component.
  - **Right**: "Recommend" (or "Recommendation") button.
- **Recommend button**: Opens a modal. Only show when user is authenticated; optionally hide or disable when album not loaded.

#### Recommend Modal

- **Title**: e.g. "Recommend to a friend"
- **Content**: List of friends from `useFriends().getFriends()`. If no friends, show message "Add friends first" (optionally link to `/friends`).
- **Selection**: User selects one friend (e.g. click on friend card or radio list).
- **Actions**: Confirm (primary) and Cancel. On Confirm: call `createRecommendation(album, selectedFriendId)`; on success show toast "Recommendation sent!" (or similar) and close modal; on error show error toast.

#### Technical Notes

- Use `BaseModal` (or a dedicated `RecommendAlbumModal.vue`) for consistency.
- Reuse `useToast()` for success and error feedback.

---

### Friends Page – Recommendations Tab

**Route**: `/friends`  
**Component**: `FriendsView.vue`  
**Location**: `src/views/FriendsView.vue`

#### Tabs

- Add a third tab **"Recommendations"** next to existing "Friends" and "Requests".
- Show tab when there is at least one recommendation, or always (with empty state "No recommendations").
- Optional: badge on tab with count of pending recommendations.

#### Recommendations Tab Content

- **Query**: Recommendations where `toUserId === currentUser.uid` and optionally filter by `status === 'pending'` for main list (or show all with status labels).
- **List**: For each recommendation show:
  - Sender: display name (from `users` via `fromUserId`)
  - Album title and artist (from document)
  - Optional: link to album page (`/album/:albumId`)
  - **Accept** and **Decline** actions

#### Accept Flow

1. User clicks **Accept** on a recommendation.
2. Show modal (or inline step): **"Add to which playlist?"** with a dropdown of the **current user's** Tunicious playlists (same source as Add Album to Playlist: `getUserPlaylists` from `useUserSpotifyApi` filtered to Tunicious, or Firestore `playlists` for current user).
3. User selects a playlist and confirms.
4. **Backend**:
   - Add album to Spotify playlist: `addAlbumToPlaylist(playlistId, albumId)` (from `useUserSpotifyApi`).
   - Add album to collection: `addAlbumToCollection({ album, playlistId, ... })` (from `useAlbumsData`). Album payload: use stored `albumId` and either a minimal snapshot (albumTitle, artistName, etc.) stored on the recommendation doc or fetch album from Spotify by `albumId`.
   - Update recommendation document: `status: 'accepted'`, `acceptedPlaylistId`, `acceptedAt: serverTimestamp()`, `updatedAt: serverTimestamp()`.
5. Toast: e.g. "Album added to [playlist] and recommendation accepted."
6. Remove or update the recommendation in the list.

#### Decline Flow

1. User clicks **Decline**.
2. Update recommendation: `status: 'declined'`, `updatedAt: serverTimestamp()`.
3. Remove or update the recommendation in the list; optional toast "Recommendation declined."

#### Technical Notes

- Reuse existing add-album logic (Spotify + Firestore + any cache updates) from `AddAlbumToPlaylistView` / `useAlbumsData` and `useUserSpotifyApi` so accepting a recommendation is equivalent to "add this album to this playlist" for the recipient.
- "Source" playlist here means the playlist the recipient chooses as the destination (same concept as target playlist in Add Album to Playlist). Optionally restrict dropdown to `pipelineRole === 'source'` only, or show all Tunicious playlists.

## Composables

### useAlbumRecommendations

**Location**: `src/composables/useAlbumRecommendations.js` (or similar)

**Functions:**
- `createRecommendation(album, toUserId)`  
  - Current user is sender. Create document with `fromUserId`, `toUserId`, `albumId`, `albumTitle`, `artistName`, `status: 'pending'`, `createdAt`, `updatedAt`. Validate that `toUserId` is a friend (e.g. via `useFriends().isFriend(toUserId)` or only call from UI that lists friends).

- `getRecommendationsForMe(status?)`  
  - Query `albumRecommendations` where `toUserId === currentUser.uid`, optional filter by `status`, order by `createdAt` desc. Return list with sender info (join `users` for `fromUserId` to get display name).

- `acceptRecommendation(recommendationId, playlistId)`  
  - Ensure document exists, `toUserId === currentUser.uid`, `status === 'pending'`. Then: (1) add album to playlist and collection (see Accept Flow above), (2) update doc: `status: 'accepted'`, `acceptedPlaylistId`, `acceptedAt: serverTimestamp()`, `updatedAt: serverTimestamp()`.

- `declineRecommendation(recommendationId)`  
  - Ensure document exists, `toUserId === currentUser.uid`, `status === 'pending'`. Update doc: `status: 'declined'`, `updatedAt: serverTimestamp()`.

**Album payload for accept:** Either store on the recommendation doc a minimal snapshot (e.g. `albumId`, `albumTitle`, `artistName`, `artistId`, `images`) when creating, or resolve album by `albumId` from Spotify when accepting. Storing a snapshot keeps accept flow simple and works if the album is later removed from Spotify.

## Security Rules

### albumRecommendations Collection

```javascript
match /albumRecommendations/{recommendationId} {
  // Recipients can read recommendations sent to them; senders can read their sent recommendations
  allow read: if request.auth != null &&
    (resource.data.toUserId == request.auth.uid || resource.data.fromUserId == request.auth.uid);
  
  // Only sender can create; must be sender and cannot recommend to self
  allow create: if request.auth != null &&
    request.resource.data.fromUserId == request.auth.uid &&
    request.resource.data.fromUserId != request.resource.data.toUserId &&
    request.resource.data.status == 'pending';
  
  // Only recipient can update (accept/decline); limit fields to status, acceptedPlaylistId, acceptedAt, updatedAt
  allow update: if request.auth != null &&
    resource.data.toUserId == request.auth.uid;
  
  allow delete: if false;  // No deletion; use status instead
}
```

## Firestore Indexes

Add to `firestore.indexes.json`:

```json
{
  "collectionGroup": "albumRecommendations",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "toUserId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

## Implementation Phases

### Phase 1: Data & composable
- [ ] Create `albumRecommendations` collection (document structure as above)
- [ ] Add Firestore index for `toUserId`, `status`, `createdAt`
- [ ] Update security rules for `albumRecommendations`
- [ ] Create `useAlbumRecommendations` composable (create, getRecommendationsForMe, accept, decline)

### Phase 2: Album page
- [ ] Put Recommend button in same row as Back button, right side (`AlbumView.vue`)
- [ ] Add Recommend modal (friend list from `useFriends().getFriends()`)
- [ ] Wire create recommendation + success/error toasts

### Phase 3: Friends page – Recommendations tab
- [ ] Add "Recommendations" tab to `FriendsView.vue`
- [ ] Load and display pending recommendations (with sender name, album, artist)
- [ ] Implement Accept: playlist picker modal → add album to playlist + collection → update recommendation (acceptedPlaylistId, acceptedAt)
- [ ] Implement Decline: update status to declined
- [ ] Optional: badge count on Recommendations tab

### Phase 4: Polish
- [ ] Empty states (no friends, no recommendations)
- [ ] Loading and error states
- [ ] Optional: real-time listener for recommendations for live badge/tab updates

## Out of Scope / Future

- Notifications (push or in-app) when a new recommendation is received
- "Recommendations I sent" view (can be added later by querying `fromUserId === currentUser.uid`)
- Allowing recommend to non-friends (e.g. share link); this spec is friends-only

## Summary

| Item | Description |
|------|-------------|
| **Album page** | Recommend button same row as Back, right side; modal to pick friend; toast on success |
| **Data** | `albumRecommendations` with fromUserId, toUserId, albumId, albumTitle, artistName, status, createdAt, updatedAt, acceptedPlaylistId, acceptedAt |
| **Friends page** | New "Recommendations" tab; list pending; Accept (with playlist picker → add album + set acceptedAt/acceptedPlaylistId) and Decline |
| **Reuse** | useFriends (friends list), useToast, BaseModal, addAlbumToPlaylist + addAlbumToCollection + cache updates |
