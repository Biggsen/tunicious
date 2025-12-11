# Album Processing Rate Limit Optimization Specification

**Status:** 📋 Planning

## Overview

This document specifies optimizations to reduce Spotify API calls during album processing operations, specifically when moving a single album between playlists. The current implementation makes unnecessary API calls that can trigger rate limits, especially when processing albums from large playlists.

## Problem Statement

### Current Issues

When processing a single album (e.g., 13 tracks) from one transient playlist to another, the system makes excessive Spotify API calls:

1. **Inefficient Track Removal**: `removeAlbumFromPlaylist` fetches ALL tracks from the source playlist (potentially hundreds or thousands) just to find the tracks belonging to a single album
   - For a playlist with 500 tracks: **5 API calls** (100 tracks per page)
   - For a playlist with 1000 tracks: **10 API calls**
   - This is wasteful when we already know which album we're removing

2. **Redundant Track Fetching**: Album tracks are fetched multiple times:
   - Once for unloving tracks (if transient to transient)
   - Again when removing from playlist (via `getAllPlaylistTracks`)
   - Again when adding to target playlist

3. **Rate Limit Risk**: Combined with other operations, this can easily exceed:
   - Backend rate limit: 1000 requests/hour per user
   - Spotify's rate limits (though less restrictive)

### Current Flow for Single Album Processing

```
1. Unlove tracks (if transient → transient):
   - getAlbumTracks(albumId) → 1 API call
   - updateLovedStatus (per track) → Last.fm API calls (not Spotify)

2. Remove album from current playlist:
   - removeAlbumFromPlaylist() calls:
     - getAllPlaylistTracks(playlistId) → N API calls (100 tracks/page)
     - removeTracksFromPlaylist() → 1 API call
   
3. Add album to target playlist:
   - addAlbumToPlaylist() calls:
     - getAlbumTracks(albumId) → 1 API call (duplicate!)
     - addTracksToPlaylist() → 1 API call

Total: 3-12+ Spotify API calls for a single album
```

### Example Scenario

**Processing a single 13-track album from a 500-track playlist:**
- Unlove: 1 call to get album tracks
- Remove: 5 calls to get all playlist tracks + 1 call to remove = **6 calls**
- Add: 1 call to get album tracks (duplicate) + 1 call to add = **2 calls**
- **Total: 9 API calls** for a single album operation

## Solution

### Core Optimization Strategy

1. **Reuse Album Track Data**: Cache album tracks from the unloving step and reuse them for removal and addition
2. **Direct Track Removal**: Pass track URIs directly to removal function instead of fetching all playlist tracks
3. **Eliminate Redundant Fetches**: Remove duplicate `getAlbumTracks` calls

### Optimized Flow

```
1. Unlove tracks (if transient → transient):
   - getAlbumTracks(albumId) → 1 API call
   - Store track URIs for reuse
   - updateLovedStatus (per track) → Last.fm API calls

2. Remove album from current playlist:
   - Use cached track URIs from step 1
   - removeTracksFromPlaylist(playlistId, trackUris) → 1 API call
   - (No need to fetch all playlist tracks!)

3. Add album to target playlist:
   - Use cached track URIs from step 1
   - addTracksToPlaylist(playlistId, trackUris) → 1 API call
   - (No need to fetch album tracks again!)

Total: 2-3 Spotify API calls (down from 9+)
```

## Implementation Details

### Phase 1: Optimize `handleProcessAlbum` Function

**File**: `src/views/playlists/PlaylistSingle.vue`

**Changes**:

1. **Cache album tracks during unloving step**:
   ```javascript
   // In handleProcessAlbum, before unloving:
   let albumTrackUris = null; // Will store track URIs for reuse
   
   // After fetching tracks for unloving:
   if (currentPlaylistData?.pipelineRole === 'transient' && targetPlaylistData?.pipelineRole === 'transient') {
     const allTracks = []; // ... existing code ...
     
     // Store track URIs for later use
     albumTrackUris = allTracks.map(track => `spotify:track:${track.id}`);
     
     // ... unloving logic ...
   }
   ```

2. **Fetch album tracks if not already cached**:
   ```javascript
   // If we didn't fetch tracks (not transient→transient), fetch them now
   if (!albumTrackUris) {
     const albumTracks = await getAlbumTracks(album.id, 50, 0);
     albumTrackUris = albumTracks.items.map(track => `spotify:track:${track.id}`);
   }
   ```

3. **Use cached URIs for removal**:
   ```javascript
   // Instead of: await removeFromSpotify(id.value, album);
   // Use: await removeTracksFromPlaylist(id.value, albumTrackUris);
   ```

4. **Use cached URIs for addition**:
   ```javascript
   // Instead of: await addAlbumToPlaylist(targetSpotifyPlaylistId, album.id);
   // Use: await addTracksToPlaylist(targetSpotifyPlaylistId, albumTrackUris);
   ```

### Phase 2: Create Optimized Removal Function (Optional)

**File**: `src/composables/useUserSpotifyApi.js`

**New Function**:
```javascript
/**
 * Removes tracks from a playlist by track URIs (optimized - no playlist fetch needed)
 * @param {string} playlistId - Spotify playlist ID
 * @param {string[]} trackUris - Array of track URIs to remove
 * @returns {Promise} Spotify API response
 */
const removeTracksFromPlaylistByUris = async (playlistId, trackUris) => {
  if (!trackUris || trackUris.length === 0) {
    throw new Error('No track URIs provided for removal');
  }
  
  const requestBody = {
    tracks: trackUris.map(uri => ({ uri }))
  };
  
  return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: 'DELETE',
    body: requestBody
  });
};
```

**Note**: This function already exists as `removeTracksFromPlaylist`, so we can use that directly.

### Phase 3: Update Other Album Processing Functions

**Files to Update**:
- `src/views/playlists/PlaylistSingle.vue` - `handleMoveAlbumBack` function
- Consider similar optimizations for batch operations (if applicable)

## Code Changes Summary

### File: `src/views/playlists/PlaylistSingle.vue`

**Function**: `handleProcessAlbum` (around line 1777)

**Key Changes**:
1. Store `albumTrackUris` array when fetching tracks for unloving
2. Fetch album tracks if not already available (for non-transient moves)
3. Replace `removeFromSpotify(id.value, album)` with direct `removeTracksFromPlaylist` call
4. Replace `addAlbumToPlaylist(targetSpotifyPlaylistId, album.id)` with direct `addTracksToPlaylist` call

**Function**: `handleMoveAlbumBack` (around line 1650)

**Similar Changes**:
- Apply same optimization pattern
- Cache album tracks before removal/addition

### File: `src/composables/useUserSpotifyApi.js`

**No changes needed** - `removeTracksFromPlaylist` and `addTracksToPlaylist` already exist and can be used directly.

## Benefits

1. **Reduced API Calls**: From 9+ calls down to 2-3 calls per album
2. **Faster Processing**: Eliminates unnecessary network requests
3. **Lower Rate Limit Risk**: Significantly reduces chance of hitting limits
4. **Better Performance**: Especially noticeable for large playlists
5. **Cost Efficiency**: Fewer API calls = lower backend costs

## Testing Considerations

### Test Cases

1. **Single Album Processing (Transient → Transient)**:
   - Verify unloving still works
   - Verify removal uses cached tracks
   - Verify addition uses cached tracks
   - Check API call count in network tab

2. **Single Album Processing (Non-Transient)**:
   - Verify tracks are fetched once
   - Verify removal and addition work correctly

3. **Large Playlist Scenario**:
   - Test with playlist containing 500+ tracks
   - Verify no `getAllPlaylistTracks` calls are made
   - Verify processing completes quickly

4. **Edge Cases**:
   - Album with 1 track
   - Album with 100+ tracks (multiple pages)
   - Album not found in playlist (should handle gracefully)

### Validation

- Monitor network requests during album processing
- Verify no duplicate `getAlbumTracks` calls
- Verify no `getAllPlaylistTracks` calls for removal
- Confirm rate limit errors no longer occur

## Edge Cases & Error Handling

1. **Album tracks fetch fails**: Fall back to existing `removeAlbumFromPlaylist` behavior
2. **Track URIs empty**: Show appropriate error message
3. **Partial removal failure**: Handle gracefully, continue with addition
4. **Network errors**: Retry logic should still work

## Migration Notes

- **Backward Compatible**: Existing `removeAlbumFromPlaylist` function remains available for other use cases
- **No Breaking Changes**: All existing functionality preserved
- **Gradual Rollout**: Can be implemented incrementally

## Future Enhancements

1. **Batch Album Processing**: Apply similar optimizations when processing multiple albums
2. **Track URI Caching**: Cache track URIs per album in unified track cache
3. **Smart Batching**: For very large albums, batch track additions/removals if needed
4. **Rate Limit Monitoring**: Add proactive rate limit checking before operations

## Related Issues

- Backend rate limit: 1000 requests/hour per user (may need adjustment for batch operations)
- Current delay between batch requests: 100ms (may need increase for large batches)

## Success Metrics

- **API Call Reduction**: 70-80% reduction in calls per album operation
- **Rate Limit Errors**: Zero rate limit errors for single album operations
- **Processing Time**: 50-70% faster for albums in large playlists
- **User Experience**: No more "rate limit exceeded" errors during normal usage

