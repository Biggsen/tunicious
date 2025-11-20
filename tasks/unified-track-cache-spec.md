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
    unsyncedLovedTracks: Array<{   // Failed sync operations
      trackId: string;
      loved: boolean;
      timestamp: number;
      retryCount: number;
    }>;
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
      lastAccessed: number;              // Timestamp of last access (for LRU eviction)
      
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
 * Loads cache from localStorage and keeps in memory
 * @param {string} userId - Firebase user ID
 * @param {string} lastFmUserName - Last.fm username
 * @returns {Promise<UnifiedTrackCache>}
 */
export async function loadUnifiedTrackCache(userId, lastFmUserName)

/**
 * Save unified track cache to localStorage (debounced)
 * Called automatically after updates, or explicitly for critical operations
 * @param {string} userId - Firebase user ID
 * @param {boolean} immediate - Force immediate save (skip debounce)
 * @returns {Promise<void>}
 */
export async function saveUnifiedTrackCache(userId, immediate = false)

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
 * Build cache for a specific playlist when tracklist is enabled
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} userId - Firebase user ID
 * @param {string} lastFmUserName - Last.fm username
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<void>}
 */
export async function buildPlaylistCache(playlistId, userId, lastFmUserName, progressCallback)

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
 * Retry failed sync operations (loved/unloved tracks)
 * @param {string} userId - Firebase user ID
 * @param {string} lastFmUserName - Last.fm username
 * @returns {Promise<void>}
 */
export async function retryFailedSyncs(userId, lastFmUserName)

/**
 * Get count of unsynced changes
 * @param {string} userId - Firebase user ID
 * @returns {number}
 */
export function getUnsyncedChangesCount(userId)

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
3. **If missing or invalid**: Create empty cache structure
4. **Load into memory**: Keep entire cache in memory during app session
   - All reads/writes use in-memory copy
   - localStorage used for persistence only

### Per-Playlist Tracklist Preference

**Storage:**
- Key: `audiofoodie_showTracklists_${playlistId}` in localStorage
- Value: `'true'` or `'false'` (string)
- Default: `'false'` for new playlists

**Behavior:**
- When user visits a playlist, check if tracklist was previously enabled
- If enabled, automatically show tracklist and load cached tracks
- If disabled (or first visit), tracklist is off by default

### Lazy Cache Building (When Tracklist Enabled)

**Trigger:** User enables tracklist toggle for a specific playlist

**Process:**
1. **Phase 1 (Primary):** Fetch playlist tracks
   - Fetch all tracks from Spotify playlist API
   - Extract unique tracks and albums
   - For each track:
     - Check if already in cache
     - If new: Add track data to cache
     - Update `lastAccessed` timestamp
     - Update album and playlist relationships
   - Build/update indexes

2. **Phase 2 (Secondary):** Match loved tracks
   - Fetch loved tracks from Last.fm API (if not already cached)
   - For each cached track:
     - Try exact match: `trackName.toLowerCase() === lovedTrackName.toLowerCase()`
     - If no match, try fuzzy matching (similarity threshold 0.85)
     - Match artist: check if loved artist matches album artist or any track artist
     - Update `loved` status in cache
   - Update `indexes.lovedTrackIds`

3. **Phase 3 (Background):** Fetch playcounts
   - Batch fetch playcounts for tracks (50-100 per batch)
   - Update `playcount` and `lastPlaycountUpdate` in cache
   - Continue in background, non-blocking

**Progress Tracking:**
- Show progress indicator:
  - "Loading tracks for [Playlist Name]..."
  - "Matching loved tracks (X of Y)..."
  - "Fetching playcounts..." (background, no blocking)

**Error Handling:**
- Playlist fetch fails: Log error, skip playlist, continue
- Playcount fetch fails: Mark track with `playcount: null`, `needsRefresh: true`, continue
- Loved tracks fetch fails: Retry 3 times, then continue without loved status (can refresh later)

### Incremental Updates

**When new album is added to playlist:**
1. Fetch album tracks from Spotify API
2. For each track:
   - Check if already in cache
   - If new: Fetch playcount, check loved status
   - Add to cache
   - Update album and playlist relationships

**When track is loved/unloved:**
1. Update `tracks[trackId].loved` immediately (cache-first)
2. Update `indexes.lovedTrackIds` array
3. Save cache
4. Sync to Last.fm API in background (non-blocking)
   - If sync succeeds: Remove from `metadata.unsyncedLovedTracks` (if present)
   - If sync fails: Add to `metadata.unsyncedLovedTracks` with retryCount: 0
5. Update UI immediately (optimistic update)

**Background Sync Error Handling:**

**Failed Sync Storage:**
- Store failed syncs in `metadata.unsyncedLovedTracks`
- Track: `trackId`, `loved` (new status), `timestamp`, `retryCount`

**Retry Strategy:**
1. **On next love/unlove operation:**
   - Before syncing new operation, batch retry all unsynced changes
   - Limit to max 10 retries per track (to prevent infinite retries)

2. **On page refresh:**
   - Check for unsynced changes on cache load
   - Retry all unsynced changes (non-blocking)

3. **On next Last.fm API call:**
   - If making any Last.fm API call, batch retry unsynced changes first
   - Natural opportunity to sync without extra API calls

4. **Optional: Timer-based retry:**
   - Retry unsynced changes after 5 minutes (timer-based)
   - Still non-blocking, runs in background
   - Limits retry attempts (max 10 per track)

**User Feedback:**
- Show subtle indicator if unsynced changes exist
- Small badge: "X unsynced changes" in header or account settings
- Manual retry button in account settings to retry all failed syncs
- Toast notification only if sync fails after retry (don't show on first failure)

**When playcount is refreshed:**
1. Check if playcount is stale: `lastPlaycountUpdate` is missing or `> 24 hours` old
2. If stale: Fetch playcount from Last.fm API (background, non-blocking)
   - Show cached playcount immediately (optimistic display)
   - Fetch new playcount in background
   - Update when ready
3. Update `tracks[trackId].playcount`
4. Update `tracks[trackId].lastPlaycountUpdate`
5. Update `tracks[trackId].lastAccessed` (for LRU eviction)
6. Save cache
7. If not stale: Use cached playcount (no API call)

**Note on Last.fm Scrobbling Threshold:**
- Last.fm uses a scrobbling threshold: tracks must be played for ~50% duration or 4 minutes (whichever is shorter) to count as a play
- Tracks played for less than the threshold don't register as scrobbles
- This means playcounts change slowly/occasionally, not in real-time
- No need for aggressive refresh - playcounts are relatively stable
- 24-hour refresh window is sufficient to keep playcounts reasonably aligned

### Track Matching (Last.fm to Spotify)

**Normalization:**
- Track names and artist names: `.toLowerCase()` only
- No punctuation removal or accent handling

**Matching Strategy:**
1. **Exact Match First:**
   - `trackName.toLowerCase() === lovedTrackName.toLowerCase()`
   - Artist match: loved artist matches album artist OR any track artist

2. **Fuzzy Match Fallback:**
   - If no exact match, use `isSimilar()` from `fuzzyMatch.js`
   - Similarity threshold: 0.85
   - Match track name + artist name together
   - Prefer accuracy over speed

3. **No Match:**
   - Track remains in cache without loved status
   - Can be matched later when loved tracks are refreshed

**Index Building:**
- `byTrackName` index uses normalized (lowercase) track and artist names
- Format: `indexes.byTrackName[normalizedTrackName][normalizedArtistName] = [trackIds]`

### Index Maintenance

Indexes are updated automatically when tracks are added/updated:

- **byTrackName**: Updated when track name changes (normalized to lowercase)
- **byArtist**: Updated when track artists change
- **lovedTrackIds**: Updated when loved status changes
- **albumsByArtist**: Updated when album tracks are added

### Cache Persistence

- Uses existing `src/utils/cache.js` utilities
- Stored in `localStorage` without automatic expiration
- Cache key: `user_tracks_${userId}`
- Format: `{ data: UnifiedTrackCache, timestamp: number }`
- Tracks persist indefinitely (evict only via LRU on storage limits)

**Concurrent Access Handling:**

1. **In-Memory Cache Copy:**
   - Load entire cache into memory at app startup
   - Keep in-memory copy during app session
   - All reads/writes use in-memory copy (fast, no localStorage reads)
   - In-memory copy is the single source of truth during session

2. **Debounced Saves:**
   - Save to localStorage after updates (debounced, 500ms delay)
   - Batch multiple rapid updates into one save operation
   - Explicit immediate save on critical operations (love/unlove, eviction)
   - Reduces localStorage writes for better performance

3. **No Locking Required:**
   - JavaScript is single-threaded, so operations queue naturally
   - No race conditions since writes are sequential
   - localStorage.setItem is atomic
   - All cache operations go through unified cache utility functions

4. **Error Handling:**
   - If save fails (QuotaExceededError), trigger LRU eviction
   - Retry save after eviction
   - If save fails after retry, log error but keep working with in-memory cache
   - In-memory cache remains functional even if localStorage save fails

**Cache Refresh Strategy:**

1. **No Automatic Expiration:**
   - Tracks remain in cache indefinitely
   - Only evicted via LRU when storage limit reached
   - Track metadata (Spotify) rarely changes, so no need to expire

2. **Incremental Refresh on Access:**
   - **Playcounts:** Refresh on track access if `lastPlaycountUpdate > 24 hours` (or never updated)
     - Background fetch (non-blocking)
     - Show cached playcount immediately, update when ready
     - Playcounts change slowly due to Last.fm scrobbling threshold
   - **Loved status:** Refresh on access if `lastLovedUpdate > 7 days`
     - Background fetch (non-blocking)
     - Show cached status immediately, update when ready

3. **Manual Refresh:**
   - Button in account settings to force refresh all playcounts
   - Button to force refresh all loved status
   - Full cache rebuild option (for troubleshooting)

**Refresh Timing:**
- **Playcounts:** Refresh if `lastPlaycountUpdate` is missing or >24 hours old
- **Loved status:** Refresh if `lastLovedUpdate` is missing or >7 days old
- **Background:** All refreshes happen in background (non-blocking UI)
- **On-demand:** Refresh triggered when track is accessed/viewed

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

**LRU Eviction Strategy:**

**Trigger:** Reactive - only on `QuotaExceededError` (matches current system)

**Eviction Priority (in order):**
1. **Orphaned tracks** (not in any `playlistIds` array) - lowest priority
2. Among orphaned tracks, evict **oldest by `lastAccessed`** timestamp
3. If still not enough space, evict **non-loved tracks** by `lastAccessed` (but always keep loved tracks)
4. Continue evicting until write succeeds

**Protected from Eviction:**
- **Always keep:** Loved tracks (`loved: true`)
- **Always keep:** Tracks in playlists (`playlistIds.length > 0`)

**Implementation:**
- On `QuotaExceededError`:
  1. Find tracks where `playlistIds.length === 0` (orphaned)
  2. Sort by `lastAccessed` (oldest first)
  3. Evict oldest orphaned tracks
  4. If still failing, evict non-loved tracks by `lastAccessed`
  5. Retry cache write
  6. Repeat until successful

**Track Access Tracking:**
- Update `lastAccessed` when:
  - Track is displayed in playlist/album view
  - Loved status is checked/updated
  - Playcount is fetched/updated
  - Track is played

**Other Optimization Strategies:**
1. Compress track data (remove unused fields)
2. Store only essential metadata
3. Split cache if needed (tracks vs. indexes)

## Migration Strategy

### Phase 1: Create New Cache System
1. Create `src/utils/unifiedTrackCache.js`
2. Implement core functions
3. Implement lazy cache building (triggered by tracklist toggle)
4. Add per-playlist tracklist preference storage

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

### Tracklist Toggle
- Per-playlist preference stored in localStorage
- When visiting playlist: check if tracklist was previously enabled
- If enabled: automatically show tracklist and load from cache
- If disabled: tracklist off by default

### Cache Building (When Tracklist Enabled)
- Show loading indicator: "Loading tracks..."
- Show progress: "Matching loved tracks (X of Y)..."
- Background playcount fetching (non-blocking)
- Allow user to interact with playlist while cache builds

### Cache Updates
- Optimistic updates: loved/unloved changes show immediately
- Silent background sync to Last.fm API
- Subtle indicator if unsynced changes exist (badge in header)
- Toast notification only if sync fails after retries
- Incremental refresh: playcounts/loved status refreshed on access if stale
- Playcount refresh happens in background (non-blocking, shows cached value first)
- Update `lastAccessed` on track interactions (for LRU eviction)
- Manual refresh buttons in account settings:
  - Retry failed syncs
  - Force refresh all playcounts
  - Force refresh all loved status
  - Full cache rebuild (troubleshooting)

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
- Implement lazy cache building (per-playlist)
- Add per-playlist tracklist preference storage

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
2. Should we sync cache to Firebase for backup?
3. How should we handle tracks that are removed from playlists? (Mark as orphaned, evict after X days?)
4. Should we implement cache sharding for very large caches?
5. How often should we refresh playcounts for cached tracks? (Background job?)

