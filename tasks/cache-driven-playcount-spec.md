# Cache-Driven Playcount System Specification

## **Status**: 📋 **SPECIFICATION - READY FOR IMPLEMENTATION**

This document specifies the implementation of a fully cache-driven playcount system where playcounts are fetched once on initial playlist load, then updated only in cache when tracks are played. Playcounts are only refreshed from the Last.fm API with an explicit "Reload" button action.

## Overview

The playcount system will transition from a hybrid API/cache approach to a fully cache-driven model. This ensures:

1. **Initial Load**: All playcounts are fetched from Last.fm API and stored in unified track cache
2. **Runtime Updates**: Playcounts are updated in cache only when tracks finish playing (via web player)
3. **Manual Refresh**: Explicit "Reload" button fetches fresh playcounts from Last.fm API
4. **UI Reactivity**: TrackList automatically re-sorts when playcounts update

## Problem Statement

### Current Issues

1. **API Calls During Runtime**: `TrackList.vue` makes API calls to fetch playcounts when tracks don't have cached data
2. **Inconsistent Data Source**: Mix of cache and API calls makes it unclear where playcount data comes from
3. **Unnecessary API Load**: Playcounts are fetched on-demand even when cache has the data
4. **No Clear Refresh Mechanism**: Users can't explicitly refresh playcounts from Last.fm
5. **Increment Timing**: Playcount increments on pause, not just when tracks finish (doesn't match Last.fm behavior)

### Current Behavior

- Initial cache build fetches playcounts from Last.fm API ✅
- `TrackList.vue` has `fetchTrackPlaycounts()` that calls API when tracks lack playcount data ❌
- `selectNextTrackToQueue()` calls `getTrackPlaycountFromLastFm()` API ❌
- `usePlaycountTracking` increments on pause, not just on finish ❌
- No explicit "Reload" button for playcounts (only combined with loved tracks refresh) ⚠️

## Solution

### Core Principles

1. **Cache-First**: All playcount data comes from cache after initial load
2. **Finish-Based Increment**: Increment playcount when track finishes playing (with threshold for skipped tracks)
3. **Explicit Refresh**: Only update from API when user clicks "Reload" button
4. **Automatic UI Updates**: TrackList re-sorts automatically when playcounts change

### Architecture

```
Initial Load:
  Last.fm API → Unified Cache → UI Display

Runtime (Web Player):
  Track Finishes → Update Cache → Update UI → Reorder

Runtime (Spotify Direct):
  No detection → Cache stays static → User clicks "Reload" → Last.fm API → Update Cache → Update UI

Manual Refresh:
  User clicks "Reload" → Last.fm API → Update Cache → Update UI → Reorder
```

## Implementation Details

### Phase 1: Update Playcount Increment Logic

**File**: `src/composables/useWebPlayerPlaycountTracking.js`

**Changes**:
1. Increment playcount when track finishes (natural finish always counts, skipped tracks require threshold)
2. Add detection for track completion (position reaches duration OR track changes)

**Key Modifications**:
- Detect track finish when position reaches duration (within 500ms tolerance) - always increments
- Detect track finish when track changes to a different track - only increments if played long enough
- Threshold requirements (similar to Last.fm scrobbling):
  - Minimum play time: 4 minutes OR 50% of track duration (whichever is less)
  - Natural finishes (reached end) always count regardless of play duration
- Increment playcount when conditions are met

**Code Structure**:
```javascript
// Check if track has finished (position reached duration or very close to it)
if (trackedTrackDuration.value > 0 && position.value > 0) {
  const remainingTime = trackedTrackDuration.value - position.value;
  if (remainingTime <= 500 && !playcountIncremented.value) {
    // Track finished naturally - always increment (no threshold)
    handleTrackFinished(trackInfo, startTime, position.value, true);
  }
}

// For track changes (skips), check threshold:
// - Minimum: 4 minutes OR 50% of duration (whichever is less)
// - Only increment if played long enough
const wasPlayedLongEnough = (playDuration, trackDuration) => {
  const MIN_PLAY_TIME_MS = 4 * 60 * 1000; // 4 minutes
  const MIN_PLAY_PERCENTAGE = 0.5; // 50%
  
  if (!trackDuration || trackDuration === 0) {
    return playDuration >= MIN_PLAY_TIME_MS;
  }
  
  const minPlayTime = Math.min(MIN_PLAY_TIME_MS, trackDuration * MIN_PLAY_PERCENTAGE);
  return playDuration >= minPlayTime;
};
```

### Phase 2: Remove API Calls from TrackList

**File**: `src/components/TrackList.vue`

**Changes**:
1. Remove `fetchTrackPlaycounts()` function (lines 115-157)
2. Remove watch that triggers `fetchTrackPlaycounts()` (lines 196-210)
3. Remove `getTrackPlaycountFromLastFm()` function (lines 342-356)
4. Update `selectNextTrackToQueue()` to use cache instead of API
5. Remove unused imports and refs (`getTrackInfo`, `trackPlaycounts`, `playcountLoading`)

**Key Modifications**:
- `selectNextTrackToQueue()` should use `useUnifiedTrackCache().getPlaycountForTrack(trackId)`
- If track not in cache, throw error and stop queueing (indicates cache issue)
- `getTrackPlaycount()` already prioritizes cache (lines 163-181) - no changes needed
- `sortedTracks` computed already uses cache playcounts - no changes needed

**Code Structure**:
```javascript
// In selectNextTrackToQueue():
const { getPlaycountForTrack } = useUnifiedTrackCache();

// Get playcounts for all tracks from cache
const tracksWithPlaycounts = nextAlbumTracks.map(track => {
  const playcount = getPlaycountForTrack(track.id);
  if (playcount === undefined) {
    throw new Error(`Track ${track.id} not found in cache`);
  }
  return {
    ...track,
    playcount: playcount || 0,
    uri: track.uri || `spotify:track:${track.id}`
  };
});
```

### Phase 3: Ensure UI Updates and Reordering

**File**: `src/views/playlists/PlaylistSingle.vue`

**Current Implementation** (already correct):
- `updateTrackPlaycountInUI()` updates `albumTracksData` reactively
- TrackList receives updated tracks via props
- `sortedTracks` computed automatically re-sorts when props change

**Verification**:
- Ensure `updateTrackPlaycountInUI()` creates new array for Vue reactivity ✅
- Ensure TrackList `sortedTracks` computed depends on `props.tracks` ✅

### Phase 4: Reload Button

**File**: `src/views/playlists/PlaylistSingle.vue`

**Current Implementation** (already exists):
- "Refresh" button calls `refreshLovedTracks()` which also refreshes playcounts
- Uses `refreshPlaycountsForTracks()` with `forceRefresh = true`

**No Changes Needed**: The existing reload button already works correctly.

## Technical Specifications

### Playcount Increment Conditions

A playcount is incremented when **ALL** of the following are true:

1. Track is playing via Spotify Web Player
2. Track has finished:
   - **Natural finish**: Position reaches duration (within 500ms tolerance) - **always increments** (no threshold)
   - **Track change**: Track changes to a different track - **only increments if threshold met**
   - **Playback stopped**: Playback stops and track was cleared - **only increments if threshold met**

### Threshold Requirements

For non-natural finishes (skipped tracks, track changes, playback stopped), a playcount is only incremented if the track was played long enough:

- **Minimum play time**: 4 minutes OR 50% of track duration (whichever is less)
- **Natural finishes**: Always count regardless of play duration (matches Last.fm scrobbling behavior)

### Playcount Update Flow

```
1. Track finishes playing
   ↓
2. Get current playcount from cache
   ↓
3. Increment playcount (currentPlaycount + 1)
   ↓
4. Update cache (in-memory + localStorage)
   ↓
5. Notify listeners (playcountUpdateListeners)
   ↓
6. Update UI (albumTracksData)
   ↓
7. TrackList re-sorts automatically (sortedTracks computed)
```

### Cache Structure

Playcounts are stored in unified track cache:
```javascript
cache.tracks[trackId] = {
  // ... other track data
  playcount: 42,                    // Current playcount
  lastPlaycountUpdate: 1234567890   // Timestamp of last API fetch
}
```

### API Refresh Behavior

When "Reload" button is clicked:
1. Fetch fresh playcounts from Last.fm API for all tracks in playlist
2. Update cache with new playcounts
3. Force refresh (ignores 24-hour threshold)
4. Reload tracks from cache to reflect updated playcounts
5. UI automatically updates and re-sorts

## Edge Cases

### 1. Track Not in Cache

**Scenario**: `selectNextTrackToQueue()` encounters track not in cache

**Handling**: 
- Throw error and stop queueing
- Log error for debugging
- This indicates a cache issue that should be investigated

### 2. Track Skipped Before Finishing

**Scenario**: User skips track before it finishes

**Handling**: 
- Playcount is incremented only if track was played for at least 4 minutes OR 50% of duration (whichever is less)
- If skipped too early (below threshold), playcount is NOT incremented
- This matches Last.fm scrobbling behavior where partial plays may not count

### 3. Track Paused

**Scenario**: User pauses track

**Handling**: 
- Playcount is NOT incremented on pause
- Only increments when track finishes

### 4. Playing from Spotify Directly

**Scenario**: User plays music from Spotify app (not web player)

**Handling**: 
- App cannot detect playback
- Playcounts stay static in cache
- User must click "Reload" to get fresh playcounts from Last.fm
- This is expected behavior (app relies on Last.fm data)


### 5. Multiple Plays of Same Track

**Scenario**: Same track played multiple times in session

**Handling**: 
- Each play session tracked separately via `trackId_timestamp` key
- Prevents double-counting within same session
- Each finish increments playcount independently

## Testing Considerations

### Unit Tests

1. **Playcount Increment Logic**:
   - Test increment only on finish (not pause)
   - Test increment when position reaches duration (natural finish - always counts)
   - Test increment when track changes (only if threshold met)
   - Test threshold enforcement (4 minutes or 50% duration)
   - Test skipped tracks below threshold don't increment
   - Test multiple plays of same track

2. **Cache Updates**:
   - Test cache update when playcount increments
   - Test listener notification
   - Test UI update triggers

3. **TrackList Component**:
   - Test `getTrackPlaycount()` prioritizes cache
   - Test `sortedTracks` re-sorts when playcounts change
   - Test `selectNextTrackToQueue()` uses cache
   - Test error when track not in cache

### Integration Tests

1. **Full Flow**:
   - Play track → finish → increment → UI update → reorder
   - Verify cache is updated
   - Verify UI reflects new playcount
   - Verify tracklist is re-sorted

2. **Reload Button**:
   - Click reload → fetch from API → update cache → UI updates → reorder
   - Verify all tracks get fresh playcounts
   - Verify UI reflects updated playcounts

3. **Edge Cases**:
   - Skip track before finish → increment only if threshold met
   - Skip track too early (below threshold) → no increment
   - Pause track → no increment
   - Track not in cache → error handling

## Files to Modify

### Core Changes

1. **`src/composables/useWebPlayerPlaycountTracking.js`**
   - Detect track finish (position reaches duration OR track changes)
   - Increment playcount when track finishes
   - Notify listeners for UI updates

2. **`src/components/TrackList.vue`**
   - Remove `fetchTrackPlaycounts()` function
   - Remove watch for `fetchTrackPlaycounts()`
   - Remove `getTrackPlaycountFromLastFm()` function
   - Update `selectNextTrackToQueue()` to use cache
   - Remove unused imports/refs

### Verification (No Changes)

1. **`src/views/playlists/PlaylistSingle.vue`**
   - `updateTrackPlaycountInUI()` - already correct
   - Reload button - already correct

2. **`src/utils/unifiedTrackCache.js`**
   - `updateTrackPlaycount()` - already correct
   - `refreshPlaycounts()` - already correct

3. **`src/composables/useUnifiedTrackCache.js`**
   - `getPlaycountForTrack()` - already correct
   - `updatePlaycountForTrack()` - already correct

## Success Criteria

- [ ] Playcounts are only fetched from API on initial load and explicit reload
- [ ] Playcounts increment only when tracks finish (not on pause)
- [ ] TrackList no longer makes API calls for playcounts
- [ ] `selectNextTrackToQueue()` uses cache (throws error if not found)
- [ ] UI automatically updates when playcounts change
- [ ] TrackList automatically re-sorts when playcounts change
- [ ] All unused API-fetching code is removed from TrackList

## Notes

### Architecture Decisions

1. **Cache-First Approach**: All playcount data comes from cache after initial load. This reduces API calls and improves performance.

2. **Finish-Based Increment with Threshold**: Playcounts increment when tracks finish playing. Natural finishes (reached end) always count, while skipped tracks only count if played long enough (4 minutes or 50% of duration). This matches Last.fm scrobbling behavior and prevents accidental increments from brief track previews.

3. **Error on Missing Cache**: If a track isn't in cache when queueing, we throw an error rather than fetching from API. This helps identify cache issues early.

4. **Web Player Only**: Playcount increments only work with Spotify Web Player. When playing from Spotify directly, the app relies on Last.fm data and requires manual refresh.

### Future Considerations

1. **Background Sync**: Could implement background sync to Last.fm API periodically, but current explicit refresh is preferred for user control.

2. **Playcount History**: Could track playcount history over time, but current implementation focuses on current playcount only.

3. **Offline Support**: Cache persists in localStorage, so playcounts are available offline. Only refresh requires API connection.

## Related Documentation

- `tasks/completed/unified-track-cache-spec.md` - Unified track cache system
- `src/composables/usePlaycountTracking.js` - Current playcount tracking implementation
- `src/components/TrackList.vue` - Track list component with playcount display
- `src/utils/unifiedTrackCache.js` - Unified track cache utilities

