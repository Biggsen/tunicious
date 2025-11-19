# Unified Track Data Cache Specification

## Overview

This document specifies the design and implementation of a unified, user-specific cache system that consolidates all track-related data (tracks, loved status, playcounts) into a single, highly efficient cache structure. This eliminates data duplication across multiple cache keys and provides a cache-first approach where updates happen in the cache without requiring API calls after the initial fetch.

## Problem Statement

### Current Issues

1. **Cache Fragmentation**: Track data is scattered across multiple cache keys:
   - `albumTracks_${albumId}` - Full track objects per album
   - `playlist_tracks_${playlistId}` - Track IDs only per playlist
   - `lovedTracks_${lastFmUserName}` - Separate array of loved tracks
   - In-memory `albumTracks.value[albumId]` - Not persisted

2. **Data Duplication**: Same track data stored multiple times:
   - Track appears in album cache
   - Track appears in playlist cache (as ID)
   - Track metadata duplicated across albums

3. **Inefficient Updates**: Loved/playcount updates require:
   - Updating loved tracks array
   - Recalculating percentages
   - Multiple cache writes

4. **API Dependency**: Playcount data fetched on-demand, not cached effectively

5. **No Single Source of Truth**: Multiple caches can get out of sync

### Current Cache Structure

```javascript
// Fragmented across multiple keys:
albumTracks_${albumId} = [/* full track objects */]
playlist_tracks_${playlistId} = { albumId: { trackId: true } }
lovedTracks_${lastFmUserName} = [/* loved track objects */]
// Playcounts: fetched on-demand, not cached
```

## Solution

### Core Concept

A **single unified cache** (`user_tracks_${userId}`) that stores:
- All track data (Spotify track objects)
- Loved status (user-specific, updated in cache)
- Playcount data (user-specific, updated in cache)
- Album and playlist relationships
- Fast lookup indexes

### Key Principles

1. **Single Source of Truth**: All track data in one cache entry
2. **Cache-First Updates**: Loved/playcount updates happen in cache, sync to APIs in background
3. **User-Specific**: Cache is per-user (already isolated via localStorage)
4. **Incremental Updates**: New tracks added as discovered, existing tracks updated in place
5. **Efficient Lookups**: Multiple indexes for fast queries by album, playlist, track ID, name, artist

## Data Structure

### Cache Key

```
user_tracks_${userId}
```

Where `userId` is the Firebase user UID (consistent across sessions).

### Cache Structure

```typescript
interface UnifiedTrackCache {
  // Metadata
  metadata: {
    lastUpdated: number;           // Timestamp of last full refresh
    lastFmUserName: string;        // Last.fm username for this cache
    userId: string;                // Firebase user ID
    version: number;               // Cache schema version (for migrations)
    totalTracks: number;           // Total unique tracks
    totalAlbums: number;            // Total albums
    totalPlaylists: number;         // Total playlists
  };

  // Tracks indexed by Spotify track ID (primary data store)
  tracks: {
    [trackId: string]: {
      // Spotify track data (immutable after initial fetch)
      id: string;
      name: string;
      artists: Array<{
        id: string;
        name: string;
      }>;
      album: {
        id: string;
        name: string;
      };
      duration_ms: number;
      track_number: number;
      uri: string;
      external_urls: {
        spotify: string;
      };
      
      // User-specific data (mutable, updated in cache)
      loved: boolean;                    // Is track loved on Last.fm
      playcount: number;                 // Last.fm playcount
      lastPlaycountUpdate: number;       // Timestamp of last playcount fetch
      lastLovedUpdate: number;           // Timestamp of last loved status update
      
      // Relationships
      albumIds: string[];                // Albums this track appears on
      playlistIds: string[];             // Playlists this track appears in
    };
  };

  // Albums indexed by album ID
  albums: {
    [albumId: string]: {
      trackIds: string[];                // Ordered list of track IDs
      lastUpdated: number;                // When album tracks were last fetched
      albumTitle: string;                 // For quick access
      artistName: string;                 // For quick access
    };
  };

  // Playlists indexed by playlist ID
  playlists: {
    [playlistId: string]: {
      albums: {
        [albumId: string]: {
          trackIds: string[];             // Tracks from this album in playlist
          addedAt: string;                // When album was added to playlist
        };
      };
      lastUpdated: number;                // When playlist tracks were last fetched
      playlistName: string;               // For quick access
    };
  };

  // Fast lookup indexes
  indexes: {
    // Track name + artist lookup (for loved tracks matching)
    byTrackName: {
      [normalizedTrackName: string]: {
        [normalizedArtistName: string]: string[];  // Array of track IDs
      };
    };
    
    // Artist lookup
    byArtist: {
      [artistId: string]: string[];       // Array of track IDs
    };
    
    // Loved tracks lookup (for quick filtering)
    lovedTrackIds: string[];              // Array of loved track IDs
    
    // Albums by artist (for artist view)
    albumsByArtist: {
      [artistId: string]: string[];       // Array of album IDs
    };
  };
}
```

## API Design

### Core Functions

#### `src/utils/unifiedTrackCache.js`

```javascript
/**
 * Initialize or load the unified track cache
 * @param {string} userId - Firebase user ID
 * @param {string} lastFmUserName - Last.fm username
 * @returns {Promise<UnifiedTrackCache>}
 */
export async function loadUnifiedTrackCache(userId, lastFmUserName)

/**
 * Get tracks for an album
 * @param {string} albumId - Spotify album ID
 * @returns {Promise<Array<Track>>}
 */
export async function getAlbumTracks(albumId)

/**
 * Get tracks for an album within a playlist context
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} albumId - Spotify album ID
 * @returns {Promise<Array<Track>>}
 */
export async function getPlaylistAlbumTracks(playlistId, albumId)

/**
 * Get all tracks for a playlist
 * @param {string} playlistId - Spotify playlist ID
 * @returns {Promise<Array<Track>>}
 */
export async function getPlaylistTracks(playlistId)

/**
 * Check if a track is loved
 * @param {string} trackId - Spotify track ID
 * @returns {boolean}
 */
export function isTrackLoved(trackId)

/**
 * Get track playcount
 * @param {string} trackId - Spotify track ID
 * @returns {number}
 */
export function getTrackPlaycount(trackId)

/**
 * Update track loved status (cache-first, syncs to Last.fm in background)
 * @param {string} trackId - Spotify track ID
 * @param {boolean} loved - New loved status
 * @returns {Promise<void>}
 */
export async function updateTrackLoved(trackId, loved)

/**
 * Update track playcount (cache-first)
 * @param {string} trackId - Spotify track ID
 * @param {number} playcount - New playcount
 * @returns {Promise<void>}
 */
export async function updateTrackPlaycount(trackId, playcount)

/**
 * Add tracks from an album to cache
 * @param {string} albumId - Spotify album ID
 * @param {Array<Track>} tracks - Track objects from Spotify API
 * @param {Object} albumData - Album metadata
 * @returns {Promise<void>}
 */
export async function addAlbumTracks(albumId, tracks, albumData)

/**
 * Add tracks from a playlist to cache
 * @param {string} playlistId - Spotify playlist ID
 * @param {Array<PlaylistTrackItem>} playlistTracks - Tracks from playlist API
 * @param {string} playlistName - Playlist name
 * @returns {Promise<void>}
 */
export async function addPlaylistTracks(playlistId, playlistTracks, playlistName)

/**
 * Build initial cache from all user playlists and loved tracks
 * @param {string} userId - Firebase user ID
 * @param {string} lastFmUserName - Last.fm username
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<void>}
 */
export async function buildInitialCache(userId, lastFmUserName, progressCallback)

/**
 * Refresh playcounts for tracks (from Last.fm API)
 * @param {Array<string>} trackIds - Track IDs to refresh
 * @param {string} lastFmUserName - Last.fm username
 * @returns {Promise<void>}
 */
export async function refreshPlaycounts(trackIds, lastFmUserName)

/**
 * Refresh loved tracks (from Last.fm API)
 * @param {string} lastFmUserName - Last.fm username
 * @returns {Promise<void>}
 */
export async function refreshLovedTracks(lastFmUserName)

/**
 * Calculate loved track percentage for an album
 * @param {string} albumId - Spotify album ID
 * @returns {Promise<{lovedCount: number, totalCount: number, percentage: number}>}
 */
export async function calculateAlbumLovedPercentage(albumId)

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getCacheStats()

/**
 * Clear the unified track cache
 * @param {string} userId - Firebase user ID
 * @returns {Promise<void>}
 */
export async function clearUnifiedTrackCache(userId)
```

## Implementation Details

### Cache Initialization

1. **Check if cache exists** for user
2. **If exists**: Load and validate version
3. **If missing or invalid**: Build initial cache (see below)

### Initial Cache Build

**Process:**
1. Fetch all loved tracks from Last.fm API
2. For each playlist the user has:
   - Fetch all playlist tracks from Spotify API
   - Extract unique tracks
   - For each track:
     - Fetch playcount from Last.fm API (if not in loved tracks)
     - Store track with loved status and playcount
3. Build indexes
4. Save to cache

**Progress Tracking:**
- Show progress modal with:
  - Current step (e.g., "Fetching playlist tracks...")
  - Progress: X/Y playlists processed
  - Estimated time remaining

### Incremental Updates

**When new album is added to playlist:**
1. Fetch album tracks from Spotify API
2. For each track:
   - Check if already in cache
   - If new: Fetch playcount, check loved status
   - Add to cache
   - Update album and playlist relationships

**When track is loved/unloved:**
1. Update `tracks[trackId].loved` immediately
2. Update `indexes.lovedTrackIds` array
3. Save cache
4. Sync to Last.fm API in background (non-blocking)

**When playcount is refreshed:**
1. Fetch playcount from Last.fm API
2. Update `tracks[trackId].playcount`
3. Update `tracks[trackId].lastPlaycountUpdate`
4. Save cache

### Index Maintenance

Indexes are updated automatically when tracks are added/updated:

- **byTrackName**: Updated when track name changes
- **byArtist**: Updated when track artists change
- **lovedTrackIds**: Updated when loved status changes
- **albumsByArtist**: Updated when album tracks are added

### Cache Persistence

- Uses existing `src/utils/cache.js` utilities
- Stored in `localStorage` with 24-hour expiration
- Cache key: `user_tracks_${userId}`
- Format: `{ data: UnifiedTrackCache, timestamp: number }`

### Cache Size Management

**Estimated Sizes:**
- Track object: ~500 bytes
- 1000 tracks: ~500 KB
- 5000 tracks: ~2.5 MB
- 10000 tracks: ~5 MB

**localStorage Limits:**
- Chrome/Edge: ~5-10 MB
- Firefox: ~10 MB
- Safari: ~5 MB

**Optimization Strategies:**
1. Compress track data (remove unused fields)
2. Store only essential metadata
3. Implement LRU eviction for old/unused tracks
4. Split cache if needed (tracks vs. indexes)

## Migration Strategy

### Phase 1: Create New Cache System
1. Create `src/utils/unifiedTrackCache.js`
2. Implement core functions
3. Add cache build UI component

### Phase 2: Parallel Operation
1. New cache system works alongside old caches
2. Components can use either system
3. Build new cache in background

### Phase 3: Component Migration
1. Update `PlaylistSingle.vue` to use unified cache
2. Update `AlbumItem.vue` to use unified cache
3. Update `TrackList.vue` to use unified cache
4. Update `AlbumView.vue` to use unified cache
5. Update `ArtistView.vue` to use unified cache

### Phase 4: Cleanup
1. Remove old cache keys:
   - `albumTracks_${albumId}`
   - `playlist_tracks_${playlistId}`
   - `lovedTracks_${lastFmUserName}`
2. Remove old cache utility functions
3. Update documentation

### Migration Helper

```javascript
/**
 * Migrate from old cache system to unified cache
 * @param {string} userId - Firebase user ID
 * @param {string} lastFmUserName - Last.fm username
 * @returns {Promise<void>}
 */
export async function migrateFromOldCache(userId, lastFmUserName) {
  // 1. Load old caches
  // 2. Extract track data
  // 3. Build unified cache structure
  // 4. Save unified cache
  // 5. Mark migration as complete
}
```

## Performance Considerations

### Lookup Performance

- **Track by ID**: O(1) - Direct object access
- **Tracks by album**: O(1) - Direct album lookup, then track IDs
- **Tracks by playlist**: O(1) - Direct playlist lookup
- **Loved tracks**: O(1) - Pre-computed array
- **Track by name+artist**: O(1) - Index lookup

### Cache Update Performance

- **Add track**: O(1) - Direct assignment
- **Update loved**: O(1) - Direct update + index update
- **Update playcount**: O(1) - Direct update
- **Add album tracks**: O(n) - n = number of tracks

### Memory Usage

- Track objects: ~500 bytes each
- Indexes: ~10-20% overhead
- Total: ~600 bytes per track

### Cache Loading

- Load time: <100ms for 10,000 tracks (JSON parse)
- Save time: <200ms for 10,000 tracks (JSON stringify)

## Error Handling

### Cache Corruption
- Detect invalid cache structure
- Fall back to rebuilding cache
- Log error for debugging

### API Failures
- Retry failed API calls (3 attempts)
- Continue with partial data
- Mark tracks as needing refresh

### Storage Quota
- Detect `QuotaExceededError`
- Implement LRU eviction
- Show user warning
- Suggest cache cleanup

## Testing Strategy

### Unit Tests
- Cache structure validation
- Index building
- Lookup functions
- Update functions

### Integration Tests
- Cache build process
- Incremental updates
- Migration from old cache
- Error scenarios

### Performance Tests
- Cache load time
- Lookup performance
- Update performance
- Memory usage

## User Experience

### Initial Cache Build
- Show progress modal
- Allow cancellation
- Resume on next session if interrupted
- Estimate completion time

### Cache Updates
- Silent background updates
- Show toast notifications for loved/unloved
- Progress indicator for playcount refresh

### Cache Management
- Add to existing Cache Manager component
- Show cache size
- Allow manual refresh
- Allow cache clearing

## Future Enhancements

1. **Incremental Sync**: Only fetch new/updated tracks
2. **Background Sync**: Periodic updates in background
3. **Compression**: Compress cache data for storage
4. **Cloud Backup**: Sync cache to Firebase (optional)
5. **Multi-Device**: Share cache across devices
6. **Analytics**: Track cache hit rates, performance metrics

## Dependencies

- `src/utils/cache.js` - Cache storage utilities
- `src/composables/useUserSpotifyApi.js` - Spotify API access
- `src/composables/useLastFmApi.js` - Last.fm API access
- `src/composables/useUserData.js` - User data access

## Timeline

### Week 1: Core Implementation
- Create unified cache utility
- Implement core functions
- Build initial cache functionality

### Week 2: Component Integration
- Migrate PlaylistSingle.vue
- Migrate AlbumItem.vue
- Migrate TrackList.vue

### Week 3: Additional Views
- Migrate AlbumView.vue
- Migrate ArtistView.vue
- Update other components

### Week 4: Testing & Cleanup
- Comprehensive testing
- Remove old cache system
- Documentation updates

## Success Metrics

1. **Cache Hit Rate**: >95% of track lookups from cache
2. **API Calls Reduced**: <10% of previous API calls
3. **Load Time**: <200ms for cache load
4. **Update Time**: <50ms for loved/playcount updates
5. **Storage Usage**: <5MB for typical user

## Risks & Mitigations

### Risk: Cache Size Too Large
- **Mitigation**: Implement LRU eviction, compress data

### Risk: Cache Corruption
- **Mitigation**: Version validation, automatic rebuild

### Risk: Migration Issues
- **Mitigation**: Parallel operation, gradual migration

### Risk: Performance Degradation
- **Mitigation**: Performance testing, optimization

## Open Questions

1. Should we compress track data to reduce size?
2. Should we implement cache versioning for schema changes?
3. Should we sync cache to Firebase for backup?
4. How should we handle tracks that are removed from playlists?
5. Should we implement cache sharding for very large caches?

