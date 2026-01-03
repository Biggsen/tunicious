# Cross-Device Player Sync Specification

## **Status**: 📋 Planning

## Overview

This document specifies the cross-device synchronization feature for the Spotify player state. Currently, the player state (currently playing track, playback status, position) is stored only in local memory, meaning each device shows only its own local player state. This feature will enable real-time synchronization of the player state across all devices where a user is logged in.

## Goals

1. **Real-Time Sync**: Sync currently playing track, playback status, and position across all user devices
2. **Seamless Experience**: When a user plays music on one device, all other devices should reflect the current state
3. **Conflict Resolution**: Handle cases where multiple devices are playing simultaneously
4. **Performance**: Minimize Firestore writes and reads while maintaining real-time updates
5. **Offline Resilience**: Handle offline scenarios gracefully

## Problem Statement

Currently, the Spotify player state is managed entirely in local memory via singleton refs in `useSpotifyPlayer.js`. When a user plays music on their PC, their mobile device has no way of knowing what's playing. Each device operates independently with its own Spotify Web Playback SDK instance.

**Current Architecture:**
- Player state stored in local refs (`currentTrack`, `isPlaying`, `position`, `duration`)
- `player_state_changed` event updates local state only
- No Firestore persistence or real-time listeners
- Each device is isolated

**Desired Architecture:**
- Player state persisted in Firestore
- Real-time listeners sync state across devices
- Local state updates trigger Firestore writes
- Firestore updates trigger local state updates

## User Flow

```
┌─────────────────────────────────────────────────────────┐
│  Device A (PC)                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ User plays track "Song A"                         │  │
│  │ → Spotify SDK fires player_state_changed          │  │
│  │ → Update local state                              │  │
│  │ → Write to Firestore (nowPlaying field)           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        │
                        │ Firestore Update
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore: users/{userId}/nowPlaying                   │
│  {                                                      │
│    trackId: "spotify:track:abc123",                    │
│    trackName: "Song A",                                 │
│    artists: ["Artist Name"],                            │
│    album: "Album Name",                                 │
│    image: "https://...",                                │
│    isPlaying: true,                                     │
│    position: 15000,                                    │
│    duration: 180000,                                   │
│    deviceId: "device_abc",                             │
│    updatedAt: Timestamp                                │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                        │
                        │ Real-time Listener
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Device B (Mobile)                                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Firestore listener detects change                 │  │
│  │ → Update local player state                       │  │
│  │ → Update UI (SpotifyPlayerBar)                   │  │
│  │ → Show "Song A" is playing                        │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Data Structures

### Users Collection - nowPlaying Field

Add a `nowPlaying` field to the `users` collection document for each user.

**Field Structure:**
```javascript
{
  // ... existing user fields ...
  nowPlaying: {
    trackId: string,              // Spotify track ID (e.g., "spotify:track:abc123")
    trackName: string,             // Track name
    artists: string[],             // Array of artist names
    album: string,                 // Album name
    image: string,                 // Album/track image URL
    uri: string,                   // Spotify track URI
    isPlaying: boolean,            // Whether track is currently playing
    position: number,             // Current playback position in milliseconds
    duration: number,              // Track duration in milliseconds
    deviceId: string,             // Spotify device ID that's playing
    deviceName: string,           // Human-readable device name
    updatedAt: Timestamp,         // Server timestamp of last update
    updatedByDevice: string       // Unique device identifier (for conflict resolution)
  } | null
}
```

**Fields:**
- `trackId` (string, required): Spotify track ID (e.g., `"spotify:track:4iV5W9uYEdYUVa79Axb7Rh"`)
- `trackName` (string, required): Display name of the track
- `artists` (string[], required): Array of artist names (e.g., `["Artist 1", "Artist 2"]`)
- `album` (string, optional): Album name
- `image` (string, optional): URL to album/track cover image
- `uri` (string, required): Full Spotify URI (e.g., `"spotify:track:4iV5W9uYEdYUVa79Axb7Rh"`)
- `isPlaying` (boolean, required): Whether the track is currently playing
- `position` (number, required): Current playback position in milliseconds (0 to duration)
- `duration` (number, required): Total track duration in milliseconds
- `deviceId` (string, required): Spotify device ID that's actively playing
- `deviceName` (string, optional): Human-readable device name (e.g., "Chrome on Windows", "Safari on iPhone")
- `updatedAt` (Timestamp, required): Server timestamp when this state was last updated
- `updatedByDevice` (string, required): Unique identifier for the device that made this update (for conflict resolution)

**Null State:**
- `nowPlaying` is `null` when no track is playing or when player is disconnected

**Indexes Required:**
- No additional indexes needed (single document per user)

## Implementation Details

### 1. Device Identification

Each device needs a unique identifier to track which device is making updates and for conflict resolution.

**Implementation:**
- Generate a unique device ID on first load (store in localStorage)
- Format: `device_${timestamp}_${randomString}`
- Store in: `localStorage.getItem('tunicious_device_id')`

**Device Name:**
- Generate human-readable device name from user agent
- Format: `{browser} on {platform}` (e.g., "Chrome on Windows", "Safari on iPhone")
- Store in: `localStorage.getItem('tunicious_device_name')`

### 2. Firestore Write Strategy

**When to Write:**
- Track changes (new track starts playing)
- Playback state changes (play/pause)
- Position updates (throttled, every 2-5 seconds while playing)
- Player disconnects (set `nowPlaying` to `null`)

**Throttling:**
- Position updates: Write every 2-5 seconds (not on every position change)
- Track/playback changes: Write immediately (no throttling)
- Use debouncing for rapid state changes

**Write Function:**
```javascript
async function syncPlayerStateToFirestore(userId, playerState) {
  const nowPlaying = playerState.currentTrack ? {
    trackId: playerState.currentTrack.id,
    trackName: playerState.currentTrack.name,
    artists: playerState.currentTrack.artists,
    album: playerState.currentTrack.album || '',
    image: playerState.currentTrack.image || '',
    uri: playerState.currentTrack.uri,
    isPlaying: playerState.isPlaying,
    position: playerState.position,
    duration: playerState.duration,
    deviceId: playerState.deviceId,
    deviceName: getDeviceName(),
    updatedAt: serverTimestamp(),
    updatedByDevice: getDeviceId()
  } : null;

  await updateDoc(doc(db, 'users', userId), {
    nowPlaying,
    updatedAt: serverTimestamp()
  });
}
```

### 3. Firestore Read Strategy

**Real-Time Listener:**
- Set up `onSnapshot` listener on user document
- Listen for changes to `nowPlaying` field
- Update local player state when Firestore changes

**Listener Setup:**
```javascript
onSnapshot(doc(db, 'users', userId), (docSnapshot) => {
  const userData = docSnapshot.data();
  const remoteNowPlaying = userData?.nowPlaying;
  
  // Only update if change came from different device
  if (remoteNowPlaying?.updatedByDevice !== getDeviceId()) {
    updateLocalPlayerState(remoteNowPlaying);
  }
});
```

### 4. Conflict Resolution

**Scenario: Multiple devices playing simultaneously**

**Strategy: Last Write Wins with Device Priority**
- If a device is actively playing (has active Spotify SDK connection), its updates take priority
- If multiple devices are playing, the most recent update wins
- Devices that are not actively playing should not overwrite active playback

**Implementation:**
- Check `updatedByDevice` before applying remote updates
- If remote update is from different device:
  - If local device is actively playing: Ignore remote update (local takes priority)
  - If local device is not playing: Apply remote update
- Track "active device" status (device with active Spotify SDK connection)

**Edge Cases:**
- Device A starts playing, Device B also starts playing → Device B's updates overwrite Device A
- Device A is playing, Device B opens app → Device B shows Device A's state
- Device A pauses, Device B resumes → Device B's state takes over

### 5. Position Sync

**Challenge:** Position updates are frequent (every 100ms) but we don't want to write to Firestore that often.

**Solution:**
- Throttle position writes to Firestore (every 2-5 seconds)
- Only write position if track is playing
- When receiving remote position updates, smoothly interpolate local position
- Don't seek local player to remote position (would cause feedback loop)

**Position Display:**
- Show remote position in UI (from Firestore)
- Don't control local player position based on remote updates
- Only sync track and playback state, not exact position

### 6. Offline Handling

**When Device Goes Offline:**
- Firestore writes will fail (handle gracefully)
- Queue writes for when connection is restored
- Continue showing last known state

**When Device Comes Online:**
- Sync local state to Firestore
- Apply any remote updates that occurred while offline

## Technical Implementation

### Composable: `usePlayerSync.js`

Create a new composable to handle player synchronization.

**Location**: `src/composables/usePlayerSync.js`

**Functions:**
```javascript
export function usePlayerSync() {
  // Initialize device ID and name
  const getDeviceId = () => { /* ... */ };
  const getDeviceName = () => { /* ... */ };
  
  // Sync local state to Firestore
  const syncToFirestore = async (userId, playerState) => { /* ... */ };
  
  // Set up real-time listener
  const setupListener = (userId, onUpdate) => { /* ... */ };
  
  // Clean up listener
  const cleanup = () => { /* ... */ };
  
  return {
    syncToFirestore,
    setupListener,
    cleanup,
    getDeviceId,
    getDeviceName
  };
}
```

### Integration with `useSpotifyPlayer.js`

**Modifications:**
1. Import `usePlayerSync` composable
2. In `player_state_changed` listener:
   - Update local state (existing behavior)
   - Call `syncToFirestore()` to write to Firestore
3. Set up Firestore listener on mount:
   - Listen for remote updates
   - Update local state when remote changes detected
4. Handle conflict resolution:
   - Check if update is from same device before applying

**Key Changes:**
```javascript
// In player_state_changed listener
player.value.addListener('player_state_changed', (state) => {
  // ... existing state update code ...
  
  // Sync to Firestore (throttled for position updates)
  if (shouldSyncToFirestore()) {
    syncToFirestore(user.value.uid, {
      currentTrack: currentTrack.value,
      isPlaying: isPlaying.value,
      position: position.value,
      duration: duration.value,
      deviceId: deviceId.value
    });
  }
});
```

### Integration with `SpotifyPlayerBar.vue`

**Modifications:**
- No changes needed (component already uses `useSpotifyPlayer`)
- UI will automatically reflect synced state

## Security Rules

### Users Collection - nowPlaying Field

```javascript
match /users/{userId} {
  // ... existing rules ...
  
  // Users can read their own nowPlaying field
  allow read: if isOwner(userId);
  
  // Users can update their own nowPlaying field
  allow update: if isOwner(userId) && 
    request.resource.data.diff(resource.data).affectedKeys().hasOnly(['nowPlaying', 'updatedAt']);
  
  // Validate nowPlaying structure
  allow update: if isOwner(userId) && 
    (request.resource.data.nowPlaying == null ||
     (request.resource.data.nowPlaying.trackId is string &&
      request.resource.data.nowPlaying.trackName is string &&
      request.resource.data.nowPlaying.artists is list &&
      request.resource.data.nowPlaying.isPlaying is bool &&
      request.resource.data.nowPlaying.position is number &&
      request.resource.data.nowPlaying.duration is number &&
      request.resource.data.nowPlaying.deviceId is string &&
      request.resource.data.nowPlaying.updatedAt is timestamp &&
      request.resource.data.nowPlaying.updatedByDevice is string));
}
```

## Performance Considerations

### Write Optimization

1. **Throttle Position Updates**
   - Write position every 2-5 seconds (not every 100ms)
   - Use `setTimeout` or `throttle` utility

2. **Debounce Rapid Changes**
   - If track changes rapidly, debounce writes
   - Only write final state

3. **Batch Updates**
   - Combine multiple state changes into single write when possible

### Read Optimization

1. **Selective Listening**
   - Only listen to `nowPlaying` field (not entire user document)
   - Use field-level listeners if available

2. **Update Frequency**
   - Real-time listeners are efficient (Firestore handles optimization)
   - No additional optimization needed

### Network Usage

- **Writes**: ~1-2 writes per second (throttled position updates)
- **Reads**: Real-time listener (efficient, only sends deltas)
- **Bandwidth**: Minimal (small JSON payloads)

## Edge Cases & Error Handling

### 1. Multiple Devices Playing Simultaneously

**Scenario:** User starts playing on Device A, then starts playing on Device B.

**Handling:**
- Last write wins (most recent `updatedAt` timestamp)
- Devices will eventually converge to same state
- User experience: whichever device they're actively using will control playback

### 2. Device Disconnects

**Scenario:** Device A is playing, then user closes browser/tab.

**Handling:**
- On disconnect, write `nowPlaying: null` to Firestore
- Other devices will see playback stopped
- If disconnect is abrupt (no cleanup), other devices will see stale state until next update

**Solution:**
- Use `beforeunload` event to write null state
- Set up periodic "heartbeat" (every 10 seconds) to indicate device is still active
- If heartbeat stops, other devices can assume device disconnected

### 3. Network Latency

**Scenario:** Device A updates state, but Device B receives update with delay.

**Handling:**
- Use `updatedAt` timestamp to determine most recent state
- Ignore stale updates (older than 5 seconds)
- Show loading state while syncing

### 4. Firestore Write Failures

**Scenario:** Network error prevents writing to Firestore.

**Handling:**
- Queue writes for retry
- Show error message to user (optional)
- Continue with local state
- Retry on network recovery

### 5. Spotify SDK Disconnects

**Scenario:** Spotify Web Playback SDK disconnects (user closes Spotify app).

**Handling:**
- Write `nowPlaying: null` to Firestore
- Update local state to reflect disconnect
- Other devices will see playback stopped

## Testing Requirements

### Unit Tests

1. **Device ID Generation**
   - Test device ID generation and persistence
   - Test device name generation

2. **Sync Logic**
   - Test `syncToFirestore()` function
   - Test conflict resolution logic
   - Test throttling/debouncing

### Integration Tests

1. **Firestore Integration**
   - Test writing player state to Firestore
   - Test reading player state from Firestore
   - Test real-time listener updates

2. **Spotify SDK Integration**
   - Test `player_state_changed` event handling
   - Test sync on track change
   - Test sync on play/pause

### Manual Testing Scenarios

1. **Basic Sync**
   - Play track on Device A
   - Verify Device B shows same track
   - Pause on Device A
   - Verify Device B shows paused state

2. **Multiple Devices**
   - Start playing on Device A
   - Start playing on Device B
   - Verify both devices converge to same state

3. **Offline/Online**
   - Play track on Device A
   - Take Device A offline
   - Verify Device B still shows state
   - Bring Device A online
   - Verify sync resumes

4. **Position Sync**
   - Play track on Device A
   - Wait 10 seconds
   - Open Device B
   - Verify Device B shows approximate position

## Migration & Rollout

### Data Migration

**Existing Users:**
- No migration needed (new field, defaults to `null`)
- Existing users will have `nowPlaying: null` until they play a track

### Feature Flags

Consider adding feature flag to enable/disable sync:
- `enablePlayerSync: boolean` in user document or app config
- Allows gradual rollout or disabling if issues arise

### Backward Compatibility

- If `nowPlaying` field doesn't exist, treat as `null`
- Old clients without sync will continue to work (just won't sync)
- New clients will sync with each other

## Future Enhancements

1. **Playback Control from Remote Devices**
   - Allow Device B to control playback on Device A
   - Requires additional Firestore fields and logic

2. **Queue Sync**
   - Sync playback queue across devices
   - Show what's next in queue on all devices

3. **History Sync**
   - Sync recently played tracks across devices
   - Show playback history on all devices

4. **Device Management**
   - Show list of active devices
   - Allow user to disconnect specific devices
   - Show which device is currently playing

5. **Friends' Now Playing**
   - Show what friends are currently playing (if privacy allows)
   - Social features around shared listening

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create `usePlayerSync.js` composable
- [ ] Implement device ID generation and storage
- [ ] Implement `syncToFirestore()` function
- [ ] Update Firestore security rules
- [ ] Add `nowPlaying` field structure to data structures doc

### Phase 2: Write Integration
- [ ] Integrate `usePlayerSync` into `useSpotifyPlayer.js`
- [ ] Add Firestore writes on player state changes
- [ ] Implement throttling for position updates
- [ ] Handle write errors and retries

### Phase 3: Read Integration
- [ ] Set up Firestore real-time listener
- [ ] Implement remote state updates
- [ ] Add conflict resolution logic
- [ ] Handle offline scenarios

### Phase 4: Testing & Polish
- [ ] Unit tests for sync logic
- [ ] Integration tests for Firestore
- [ ] Manual testing across multiple devices
- [ ] Error handling and edge cases
- [ ] Performance optimization
- [ ] User testing and feedback

## Technical Notes

### Device ID Format

```javascript
// Generate on first load
const deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
localStorage.setItem('tunicious_device_id', deviceId);
```

### Throttle Implementation

```javascript
let lastPositionWrite = 0;
const POSITION_WRITE_INTERVAL = 3000; // 3 seconds

function shouldWritePosition() {
  const now = Date.now();
  if (now - lastPositionWrite > POSITION_WRITE_INTERVAL) {
    lastPositionWrite = now;
    return true;
  }
  return false;
}
```

### Conflict Resolution Logic

```javascript
function shouldApplyRemoteUpdate(remoteState, localState, localDeviceId) {
  // Don't apply if update is from same device
  if (remoteState.updatedByDevice === localDeviceId) {
    return false;
  }
  
  // Apply if local device is not actively playing
  if (!localState.isPlaying || !localState.currentTrack) {
    return true;
  }
  
  // Apply if remote update is newer (by 5+ seconds)
  const remoteTime = remoteState.updatedAt?.toMillis() || 0;
  const localTime = Date.now();
  if (remoteTime > localTime + 5000) {
    return true;
  }
  
  return false;
}
```

### Heartbeat Mechanism (Future)

To detect disconnected devices:
```javascript
// Write heartbeat every 10 seconds
setInterval(() => {
  if (isPlaying.value && currentTrack.value) {
    updateDoc(doc(db, 'users', userId), {
      'nowPlaying.lastHeartbeat': serverTimestamp()
    });
  }
}, 10000);

// Check if remote device is still active (heartbeat < 15 seconds ago)
const isDeviceActive = (lastHeartbeat) => {
  const now = Date.now();
  const heartbeatTime = lastHeartbeat?.toMillis() || 0;
  return (now - heartbeatTime) < 15000;
};
```
