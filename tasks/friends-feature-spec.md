# Friends Feature Specification

## **Status**: 📋 Planning

## Overview

This document specifies the Friends feature that enables users to search for other users, send friend requests, manage incoming/outgoing requests, and view friends' data throughout the application. This feature will enable social discovery and sharing of music pipeline data.

## Goals

1. **User Discovery**: Enable users to find and connect with other Tunicious users
2. **Friend Management**: Provide clear UI for sending, accepting, and declining friend requests
3. **Social Integration**: Enable displaying friends' data (playlists, movements, activity) in various parts of the app
4. **Privacy**: Ensure users have control over who can see their data
5. **Scalability**: Design data structures that efficiently support aggregating data from multiple friends

## User Flow Overview

```
┌─────────────────┐
│  Friends Page   │
│  (Search Users) │
└────────┬────────┘
         │
         ├──► Search for User ──► View Profile ──► Send Friend Request
         │
         ├──► View Incoming Requests ──► Accept/Decline
         │
         ├──► View Outgoing Requests ──► Cancel Request
         │
         └──► View Friends List ──► View Friend Profile/Activity
```

## Data Structures

### 1. friendRequests Collection

Stores pending, accepted, and declined friend requests.

**Document Structure:**
```javascript
{
  fromUserId: string,        // User ID of the requester
  toUserId: string,          // User ID of the recipient
  status: 'pending' | 'accepted' | 'declined',  // Request status
  createdAt: Timestamp,      // When request was created
  updatedAt: Timestamp,      // Last update timestamp
  respondedAt: Timestamp | null  // When request was accepted/declined (null if pending)
}
```

**Document ID**: Auto-generated Firestore document ID

**Fields:**
- `fromUserId` (string, required): Firebase Auth UID of the user sending the request
- `toUserId` (string, required): Firebase Auth UID of the user receiving the request
- `status` (string, required): Current status of the request
  - `'pending'`: Request sent but not yet responded to
  - `'accepted'`: Request was accepted (triggers friendship creation)
  - `'declined'`: Request was declined
- `createdAt` (Timestamp, required): Server timestamp when request was created
- `updatedAt` (Timestamp, required): Server timestamp of last update
- `respondedAt` (Timestamp, optional): Server timestamp when request was accepted/declined

**Indexes Required:**
- Composite index on `toUserId`, `status` (for querying incoming pending requests)
- Composite index on `fromUserId`, `status` (for querying outgoing requests)
- Composite index on `fromUserId`, `toUserId` (for checking if request already exists)

**Constraints:**
- Cannot create duplicate pending requests between same users
- `fromUserId` and `toUserId` must be different
- When status changes to `'accepted'`, create corresponding friendship document

### 2. friendships Collection

Stores accepted friendships between users.

**Document Structure:**
```javascript
{
  user1Id: string,           // Always the smaller userId (alphabetically)
  user2Id: string,           // Always the larger userId (alphabetically)
  createdAt: Timestamp,       // When friendship was established
  updatedAt: Timestamp        // Last update timestamp
}
```

**Document ID**: Auto-generated Firestore document ID

**Fields:**
- `user1Id` (string, required): Firebase Auth UID (always alphabetically smaller)
- `user2Id` (string, required): Firebase Auth UID (always alphabetically larger)
- `createdAt` (Timestamp, required): Server timestamp when friendship was created
- `updatedAt` (Timestamp, required): Server timestamp of last update

**Indexes Required:**
- Single field index on `user1Id` (for querying user's friends)
- Single field index on `user2Id` (for querying user's friends)
- Composite index on `user1Id`, `user2Id` (for checking if friendship exists)

**Constraints:**
- `user1Id` must always be < `user2Id` (alphabetically) to prevent duplicates
- Cannot create duplicate friendships
- When friendship is created, update corresponding friend request status to `'accepted'`

### 3. Users Collection Updates

Add fields to support user search and friend features.

**New Fields:**
```javascript
{
  // ... existing fields ...
  searchableDisplayName: string | null,  // Lowercase displayName for case-insensitive search
  friendsCount: number,                   // Cached count of friends (optional, for performance)
  publicProfile: boolean                  // Whether profile is searchable (default: true)
}
```

**Fields:**
- `searchableDisplayName` (string, optional): Lowercase version of `displayName` for efficient case-insensitive search
- `friendsCount` (number, optional): Cached count of user's friends (updated via Cloud Function or on-demand)
- `publicProfile` (boolean, optional): Whether user's profile appears in search results (default: `true`)

**Migration:**
- Existing users: Set `searchableDisplayName` to lowercase of `displayName` (or null if displayName is null)
- Existing users: Set `publicProfile` to `true` by default
- Existing users: Set `friendsCount` to `0`

## Page Specifications

### Friends Page (`/friends`)

**Route**: `/friends`  
**Component**: `FriendsView.vue`  
**Location**: `src/views/FriendsView.vue`  
**Requires**: Authentication

#### Purpose
Main page for discovering users, managing friend requests, and viewing friends list.

#### Layout

**Tabs/Sections:**
1. **Search** (default tab)
   - Search input for finding users
   - Search results list
   - User cards with profile info and action buttons

2. **Requests** (tab)
   - **Incoming Requests** section
     - List of pending requests received
     - Accept/Decline buttons for each
   - **Outgoing Requests** section
     - List of pending requests sent
     - Cancel button for each

3. **Friends** (tab)
   - List of all accepted friends
   - Friend cards with profile info
   - Link to view friend's activity/profile

#### Search Tab Features

**Search Input:**
- Placeholder: "Search by display name or email..."
- Real-time search (debounced, 300ms)
- Search by `displayName` or `email` (case-insensitive)
- Only search users where `publicProfile === true`
- Show loading state during search
- Show "No results found" if no matches

**Search Results:**
- Display user cards with:
  - Display name (or email if no display name)
  - Email address
  - Friend status indicator:
    - "Friends" badge (if already friends)
    - "Request Sent" badge (if outgoing request exists)
    - "Request Received" badge (if incoming request exists)
    - "Send Request" button (if no relationship)
- Exclude current user from results
- Exclude users who already have pending/accepted relationship

**User Card Actions:**
- **Send Friend Request**: If no existing relationship
- **Cancel Request**: If outgoing request exists
- **Accept/Decline**: If incoming request exists (redirects to Requests tab)
- **View Profile**: Navigate to friend's profile/activity (if friends)

#### Requests Tab Features

**Incoming Requests Section:**
- List all friend requests where `toUserId === currentUserId` and `status === 'pending'`
- Each request shows:
  - Requester's display name (or email)
  - Requester's email
  - Request timestamp ("2 days ago")
  - Accept button (primary action)
  - Decline button (secondary action)
- Empty state: "No incoming requests"

**Outgoing Requests Section:**
- List all friend requests where `fromUserId === currentUserId` and `status === 'pending'`
- Each request shows:
  - Recipient's display name (or email)
  - Recipient's email
  - Request timestamp ("2 days ago")
  - Cancel button
- Empty state: "No outgoing requests"

#### Friends Tab Features

**Friends List:**
- List all friendships where user is either `user1Id` or `user2Id`
- Each friend card shows:
  - Display name (or email)
  - Email address
  - Last activity timestamp (optional, from albums/playlists)
  - "View Activity" button (links to friend's activity feed)
- Empty state: "No friends yet. Search for users to send friend requests!"

**Friend Actions:**
- **View Activity**: Navigate to friend's latest movements/playlists
- **Unfriend**: Remove friendship (future enhancement)

#### UI Requirements

**Design:**
- Match existing app styling (TailwindCSS, design system colors)
- Use card-based layout for user/friend items
- Responsive design (mobile-friendly)
- Loading states for all async operations
- Error messages for failed operations

**Components to Create:**
- `UserSearch.vue` - Search input and results
- `FriendRequestCard.vue` - Card for displaying friend requests
- `FriendCard.vue` - Card for displaying friends
- `UserCard.vue` - Card for displaying search results

#### Technical Implementation

**Composables:**
- `useFriends.js` - Main composable for friends functionality
  - `searchUsers(query)` - Search users by name/email
  - `sendFriendRequest(toUserId)` - Create friend request
  - `acceptFriendRequest(requestId)` - Accept request and create friendship
  - `declineFriendRequest(requestId)` - Decline request
  - `cancelFriendRequest(requestId)` - Cancel outgoing request
  - `getIncomingRequests()` - Get pending incoming requests
  - `getOutgoingRequests()` - Get pending outgoing requests
  - `getFriends()` - Get all friends
  - `isFriend(userId)` - Check if user is a friend
  - `getFriendshipStatus(userId)` - Get relationship status with user

**Firestore Queries:**
```javascript
// Search users
query(
  collection(db, 'users'),
  where('publicProfile', '==', true),
  where('searchableDisplayName', '>=', searchTerm.toLowerCase()),
  where('searchableDisplayName', '<=', searchTerm.toLowerCase() + '\uf8ff'),
  limit(20)
)

// Get incoming requests
query(
  collection(db, 'friendRequests'),
  where('toUserId', '==', currentUserId),
  where('status', '==', 'pending'),
  orderBy('createdAt', 'desc')
)

// Get outgoing requests
query(
  collection(db, 'friendRequests'),
  where('fromUserId', '==', currentUserId),
  where('status', '==', 'pending'),
  orderBy('createdAt', 'desc')
)

// Get friends (user1Id)
query(
  collection(db, 'friendships'),
  where('user1Id', '==', currentUserId)
)

// Get friends (user2Id)
query(
  collection(db, 'friendships'),
  where('user2Id', '==', currentUserId)
)
```

**Error Handling:**
- Handle duplicate request attempts
- Handle network errors
- Handle permission errors
- Show user-friendly error messages

## Security Rules

### friendRequests Collection

```javascript
match /friendRequests/{requestId} {
  // Users can read requests they sent or received
  allow read: if isAuthenticated() && 
    (resource.data.fromUserId == request.auth.uid || 
     resource.data.toUserId == request.auth.uid);
  
  // Users can create requests where they are the sender
  allow create: if isAuthenticated() && 
    request.resource.data.fromUserId == request.auth.uid &&
    request.resource.data.fromUserId != request.resource.data.toUserId &&
    request.resource.data.status == 'pending';
  
  // Recipients can update to accept/decline
  // Senders can update to cancel (delete the request)
  allow update: if isAuthenticated() && 
    resource.data.toUserId == request.auth.uid &&
    (request.resource.data.status == 'accepted' || 
     request.resource.data.status == 'declined');
  
  // Users can delete their own outgoing requests (cancel)
  allow delete: if isAuthenticated() && 
    resource.data.fromUserId == request.auth.uid;
}
```

### friendships Collection

```javascript
match /friendships/{friendshipId} {
  // Users can read friendships they are part of
  allow read: if isAuthenticated() && 
    (resource.data.user1Id == request.auth.uid || 
     resource.data.user2Id == request.auth.uid);
  
  // Only allow creation via Cloud Function or ensure user1Id < user2Id
  // For now, allow authenticated users to create (will be validated client-side)
  allow create: if isAuthenticated() && 
    (request.resource.data.user1Id == request.auth.uid || 
     request.resource.data.user2Id == request.auth.uid) &&
    request.resource.data.user1Id < request.resource.data.user2Id;
  
  // No updates allowed (friendships are immutable)
  allow update: if false;
  
  // Users can delete friendships they are part of (unfriend)
  allow delete: if isAuthenticated() && 
    (resource.data.user1Id == request.auth.uid || 
     resource.data.user2Id == request.auth.uid);
}
```

### Users Collection Updates

```javascript
match /users/{userId} {
  // Existing rules...
  
  // Allow reading public profiles for search
  allow read: if isAuthenticated() && 
    (isOwner(userId) || isAdmin() || resource.data.publicProfile == true);
  
  // Users can update their own searchableDisplayName and publicProfile
  allow update: if isOwner(userId) && 
    request.resource.data.diff(resource.data).affectedKeys().hasOnly(['searchableDisplayName', 'publicProfile', 'updatedAt']);
}
```

## Firestore Indexes

Add to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "friendRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "toUserId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "friendRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "fromUserId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "friendRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "fromUserId", "order": "ASCENDING" },
        { "fieldPath": "toUserId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "friendships",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "user1Id", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "friendships",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "user2Id", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "publicProfile", "order": "ASCENDING" },
        { "fieldPath": "searchableDisplayName", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Integration Points

### 1. Home View - Friends Activity Feed

**Location**: `src/views/HomeView.vue`

**Enhancement:**
- Add section showing friends' latest movements
- Display aggregated feed of friends' album movements
- Link to full friends activity page

**Implementation:**
- Use `useFriends()` to get friends list
- Query each friend's latest movements (parallel queries)
- Combine and sort by timestamp
- Display top N items

### 2. Latest Movements Component

**Location**: `src/components/LatestMovements.vue`

**Enhancement:**
- Add toggle to view "My Movements" vs "Friends' Movements"
- Filter by specific friend (optional)

**Implementation:**
- Extend `useLatestMovements()` to accept `friendIds` parameter
- Query movements for specified friends
- Combine and display

### 3. Playlist View - Friends' Playlists

**Location**: `src/views/playlists/PlaylistView.vue`

**Enhancement:**
- Add filter to view friends' playlists
- Show which friend owns each playlist

**Implementation:**
- Extend `usePlaylistData()` to accept `friendIds` parameter
- Query playlists for specified friends
- Display with friend attribution

### 4. Navigation - Friends Link

**Location**: `src/components/TheHeader.vue`

**Enhancement:**
- Add "Friends" link to navigation
- Show badge with pending request count (optional)

**Implementation:**
- Add route link to `/friends`
- Use `useFriends()` to get pending request count
- Display badge if count > 0

## Future Enhancements

1. **Friend Activity Feed Page**: Dedicated page for viewing all friends' activity
2. **Friend Recommendations**: Suggest friends based on similar music taste
3. **Friend Groups**: Organize friends into groups/categories
4. **Privacy Settings**: Granular control over what friends can see
5. **Friend Notifications**: Notify users of friend activity
6. **Unfriend Functionality**: Remove friendships
7. **Block Users**: Prevent users from sending requests
8. **Friend Stats**: Show aggregated statistics from friends

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create data structures (friendRequests, friendships collections)
- [ ] Update users collection with new fields
- [ ] Create Firestore indexes
- [ ] Update security rules
- [ ] Create `useFriends.js` composable

### Phase 2: Friends Page
- [ ] Create `FriendsView.vue` page
- [ ] Implement search functionality
- [ ] Implement friend request sending
- [ ] Implement request management (accept/decline/cancel)
- [ ] Implement friends list

### Phase 3: Integration
- [ ] Add Friends link to navigation
- [ ] Integrate friends data into Home view
- [ ] Extend LatestMovements for friends
- [ ] Add friends filter to Playlist view

### Phase 4: Polish & Testing
- [ ] Error handling and edge cases
- [ ] Loading states and UX improvements
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] User testing and feedback

## Technical Notes

### Normalized User IDs in Friendships

To prevent duplicate friendships, always store user IDs in alphabetical order:
```javascript
const [user1Id, user2Id] = [userId1, userId2].sort();
```

### Request Status Transitions

- `pending` → `accepted`: Creates friendship document
- `pending` → `declined`: No further action
- `pending` → deleted: Canceled by sender

### Search Implementation

For case-insensitive search, use:
- `searchableDisplayName` field (lowercase)
- Range query: `>= searchTerm.toLowerCase()` and `<= searchTerm.toLowerCase() + '\uf8ff'`

### Performance Considerations

- Use parallel queries when aggregating friend data
- Consider pagination for large friends lists
- Cache friend lists in composable state
- Debounce search input (300ms recommended)

### Data Migration

For existing users:
1. Set `searchableDisplayName` = lowercase of `displayName` (or null)
2. Set `publicProfile` = true
3. Set `friendsCount` = 0

Run migration script or Cloud Function to update all existing user documents.

