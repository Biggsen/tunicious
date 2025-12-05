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
2. **Last.fm Threshold**: Increment only when track finishes and meets Last.fm scrobbling threshold (50% duration OR 4 minutes, whichever is shorter)
3. **Explicit Refresh**: Only update from API when user clicks "Reload" button
4. **Automatic UI Updates**: TrackList re-sorts automatically when playcounts change

### Architecture

```
Initial Load:
  Last.fm API → Unified Cache → UI Display

Runtime (Web Player):
  Track Finishes → Check Threshold → Update Cache → Update UI → Reorder

Runtime (Spotify Direct):
  No detection → Cache stays static → User clicks "Reload" → Last.fm API → Update Cache → Update UI

Manual Refresh:
  User clicks "Reload" → Last.fm API → Update Cache → Update UI → Reorder
```

## Implementation Details

### Phase 1: Update Playcount Increment Logic

**File**: `src/composables/usePlaycountTracking.js`

**Changes**:
1. Remove increment on pause - only increment when track finishes
2. Add detection for track completion (position reaches duration)
3. Ensure threshold is checked before incrementing

**Key Modifications**:
- Remove `watch(isPlaying)` that increments on pause (lines 186-194)
- Add finish detection in `monitorPlayback()` when `position >= duration - 500ms`
- Only increment if threshold was met AND track finished

**Code Structure**:
```javascript
// In monitorPlayback():
// Check if track has finished (position reached duration or very close to it)
if (trackedTrackDuration.value > 0 && position.value > 0) {
  const remainingTime = trackedTrackDuration.value - position.value;
  if (remainingTime <= 500 && thresholdMet.value && !playcountIncremented.value) {
    // Track finished - increment playcount
    handleTrackFinished();
  }
}
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
2. Track has met scrobbling threshold:
   - Played for 50% of duration OR
   - Played for 4 minutes
   - (Whichever is shorter)
3. Track has finished:
   - Position reaches duration (within 500ms tolerance)
   - OR track changes to a different track
   - OR playback stops and track was cleared

### Playcount Update Flow

```
1. Track finishes playing
   ↓
2. Check if threshold was met
   ↓
3. Get current playcount from cache
   ↓
4. Increment playcount (currentPlaycount + 1)
   ↓
5. Update cache (in-memory + localStorage)
   ↓
6. Notify listeners (playcountUpdateListeners)
   ↓
7. Update UI (albumTracksData)
   ↓
8. TrackList re-sorts automatically (sortedTracks computed)
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
- Playcount is NOT incremented (matches Last.fm behavior)
- Threshold must be met AND track must finish

### 3. Track Paused

**Scenario**: User pauses track

**Handling**: 
- Playcount is NOT incremented on pause
- Only increments when track finishes (if threshold was met)

### 4. Playing from Spotify Directly

**Scenario**: User plays music from Spotify app (not web player)

**Handling**: 
- App cannot detect playback
- Playcounts stay static in cache
- User must click "Reload" to get fresh playcounts from Last.fm
- This is expected behavior (app relies on Last.fm data)

### 5. Threshold Not Met

**Scenario**: Track finishes but didn't meet threshold (e.g., skipped early)

**Handling**: 
- Playcount is NOT incremented (matches Last.fm behavior)
- Last.fm wouldn't scrobble it, so we don't increment

### 6. Multiple Plays of Same Track

**Scenario**: Same track played multiple times in session

**Handling**: 
- Each play session tracked separately via `trackId_timestamp` key
- Prevents double-counting within same session
- Each finish increments playcount independently

## Testing Considerations

### Unit Tests

1. **Playcount Increment Logic**:
   - Test threshold calculation (50% vs 4 minutes)
   - Test increment only on finish (not pause)
   - Test threshold must be met before increment
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
   - Play track → meet threshold → finish → increment → UI update → reorder
   - Verify cache is updated
   - Verify UI reflects new playcount
   - Verify tracklist is re-sorted

2. **Reload Button**:
   - Click reload → fetch from API → update cache → UI updates → reorder
   - Verify all tracks get fresh playcounts
   - Verify UI reflects updated playcounts

3. **Edge Cases**:
   - Skip track before threshold → no increment
   - Pause track → no increment
   - Track not in cache → error handling

## Files to Modify

### Core Changes

1. **`src/composables/usePlaycountTracking.js`**
   - Remove pause watch
   - Add finish detection in `monitorPlayback()`
   - Ensure increment only on finish

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
- [ ] Playcounts increment only if threshold is met
- [ ] TrackList no longer makes API calls for playcounts
- [ ] `selectNextTrackToQueue()` uses cache (throws error if not found)
- [ ] UI automatically updates when playcounts change
- [ ] TrackList automatically re-sorts when playcounts change
- [ ] All unused API-fetching code is removed from TrackList

## Notes

### Architecture Decisions

1. **Cache-First Approach**: All playcount data comes from cache after initial load. This reduces API calls and improves performance.

2. **Last.fm Threshold Matching**: We match Last.fm's scrobbling behavior exactly (50% or 4 minutes, increment only on finish). This ensures consistency with Last.fm data.

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

