import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadUnifiedTrackCache,
  clearUnifiedTrackCache,
  moveAlbumBetweenPlaylists,
  removeAlbumFromPlaylistInCache,
  addAlbumToPlaylistInCache,
} from './unifiedTrackCache';

const TEST_USER_ID = 'test-user-123';
const CACHE_KEY = `user_tracks_${TEST_USER_ID}`;

vi.mock('@/utils/cache', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock('@/composables/useAlbumMappings', () => ({
  useAlbumMappings: () => ({
    resolveToPrimaryId: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('./logger', () => ({
  logCache: vi.fn(),
}));

function createTestCache(overrides = {}) {
  const now = Date.now();
  return {
    metadata: {
      lastUpdated: now,
      lastFmUserName: '',
      userId: TEST_USER_ID,
      version: 1,
      totalTracks: 0,
      totalAlbums: 0,
      totalPlaylists: 0,
      unsyncedLovedTracks: [],
    },
    tracks: {
      track1: {
        id: 'track1',
        name: 'Track One',
        playlistIds: ['playlist-a'],
        albumIds: ['album1'],
        lastAccessed: now,
      },
      track2: {
        id: 'track2',
        name: 'Track Two',
        playlistIds: ['playlist-a'],
        albumIds: ['album1'],
        lastAccessed: now,
      },
    },
    albums: {
      album1: {
        trackIds: ['track1', 'track2'],
        lastUpdated: now,
        albumTitle: 'Test Album',
        artistName: 'Test Artist',
      },
    },
    playlists: {
      'playlist-a': {
        albums: {
          album1: {
            trackIds: ['track1', 'track2'],
            addedAt: '2024-01-01T00:00:00.000Z',
          },
        },
        lastUpdated: now,
        playlistName: 'Playlist A',
      },
    },
    indexes: {
      byTrackName: {},
      byArtist: {},
      lovedTrackIds: [],
      albumsByArtist: {},
    },
    ...overrides,
  };
}

async function setupCache(cacheOverrides = {}) {
  const { getCache } = await import('@/utils/cache');
  getCache.mockImplementation((key) => {
    if (key === CACHE_KEY) {
      return createTestCache(cacheOverrides);
    }
    return null;
  });
  return loadUnifiedTrackCache(TEST_USER_ID, '');
}

describe('unifiedTrackCache - album surgical operations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearUnifiedTrackCache(TEST_USER_ID);
  });

  describe('moveAlbumBetweenPlaylists', () => {
    it('moves album from source playlist to target playlist', async () => {
      const cache = await setupCache();
      const sourcePlaylistId = 'playlist-a';
      const targetPlaylistId = 'playlist-b';
      const albumId = 'album1';
      const addedAt = '2024-02-01T12:00:00.000Z';

      await moveAlbumBetweenPlaylists(
        sourcePlaylistId,
        targetPlaylistId,
        albumId,
        TEST_USER_ID,
        addedAt
      );

      expect(cache.playlists[sourcePlaylistId].albums[albumId]).toBeUndefined();
      expect(cache.playlists[targetPlaylistId]).toBeDefined();
      expect(cache.playlists[targetPlaylistId].albums[albumId]).toEqual({
        trackIds: ['track1', 'track2'],
        addedAt,
      });
    });

    it('updates track playlistIds when moving album', async () => {
      const cache = await setupCache();
      const sourcePlaylistId = 'playlist-a';
      const targetPlaylistId = 'playlist-b';
      const albumId = 'album1';

      await moveAlbumBetweenPlaylists(
        sourcePlaylistId,
        targetPlaylistId,
        albumId,
        TEST_USER_ID,
        '2024-02-01T12:00:00.000Z'
      );

      expect(cache.tracks.track1.playlistIds).toContain(targetPlaylistId);
      expect(cache.tracks.track1.playlistIds).not.toContain(sourcePlaylistId);
      expect(cache.tracks.track2.playlistIds).toContain(targetPlaylistId);
      expect(cache.tracks.track2.playlistIds).not.toContain(sourcePlaylistId);
    });

    it('initializes target playlist if it does not exist', async () => {
      const cache = await setupCache();
      const targetPlaylistId = 'playlist-new';

      await moveAlbumBetweenPlaylists(
        'playlist-a',
        targetPlaylistId,
        'album1',
        TEST_USER_ID,
        '2024-02-01T12:00:00.000Z'
      );

      expect(cache.playlists[targetPlaylistId]).toBeDefined();
      expect(cache.playlists[targetPlaylistId].albums.album1).toBeDefined();
      expect(cache.playlists[targetPlaylistId].playlistName).toBe('');
    });

    it('does nothing when album not found in source playlist', async () => {
      const cache = await setupCache();
      const originalPlaylists = JSON.parse(
        JSON.stringify(cache.playlists['playlist-a'])
      );

      await moveAlbumBetweenPlaylists(
        'playlist-a',
        'playlist-b',
        'nonexistent-album',
        TEST_USER_ID,
        '2024-02-01T12:00:00.000Z'
      );

      expect(cache.playlists['playlist-a']).toEqual(originalPlaylists);
      expect(cache.playlists['playlist-b']).toBeUndefined();
    });

    it('throws when cache not loaded for user', async () => {
      await expect(
        moveAlbumBetweenPlaylists(
          'playlist-a',
          'playlist-b',
          'album1',
          'unloaded-user',
          '2024-02-01T12:00:00.000Z'
        )
      ).rejects.toThrow('Cache not loaded');
    });
  });

  describe('removeAlbumFromPlaylistInCache', () => {
    it('removes album from playlist', async () => {
      const cache = await setupCache();

      await removeAlbumFromPlaylistInCache('playlist-a', 'album1', TEST_USER_ID);

      expect(cache.playlists['playlist-a'].albums.album1).toBeUndefined();
    });

    it('removes playlist from track playlistIds', async () => {
      const cache = await setupCache();

      await removeAlbumFromPlaylistInCache('playlist-a', 'album1', TEST_USER_ID);

      expect(cache.tracks.track1.playlistIds).not.toContain('playlist-a');
      expect(cache.tracks.track2.playlistIds).not.toContain('playlist-a');
    });

    it('does nothing when album not in playlist', async () => {
      const cache = await setupCache();
      const originalState = JSON.parse(JSON.stringify(cache.playlists));

      await removeAlbumFromPlaylistInCache(
        'playlist-a',
        'nonexistent-album',
        TEST_USER_ID
      );

      expect(cache.playlists).toEqual(originalState);
    });

    it('handles track with empty playlistIds gracefully', async () => {
      const cache = await setupCache();
      cache.tracks.track1.playlistIds = [];

      await removeAlbumFromPlaylistInCache('playlist-a', 'album1', TEST_USER_ID);

      expect(cache.playlists['playlist-a'].albums.album1).toBeUndefined();
    });
  });

  describe('addAlbumToPlaylistInCache', () => {
    it('adds album to existing playlist', async () => {
      const cache = await setupCache();
      cache.tracks.track3 = {
        id: 'track3',
        name: 'Track Three',
        playlistIds: [],
        albumIds: ['album2'],
        lastAccessed: Date.now(),
      };

      await addAlbumToPlaylistInCache(
        'playlist-a',
        'album2',
        ['track3'],
        '2024-02-15T10:00:00.000Z',
        TEST_USER_ID
      );

      expect(cache.playlists['playlist-a'].albums.album2).toEqual({
        trackIds: ['track3'],
        addedAt: '2024-02-15T10:00:00.000Z',
      });
    });

    it('creates playlist when it does not exist', async () => {
      const cache = await setupCache();

      await addAlbumToPlaylistInCache(
        'playlist-new',
        'album1',
        ['track1', 'track2'],
        '2024-02-15T10:00:00.000Z',
        TEST_USER_ID
      );

      expect(cache.playlists['playlist-new']).toBeDefined();
      expect(cache.playlists['playlist-new'].albums.album1).toEqual({
        trackIds: ['track1', 'track2'],
        addedAt: '2024-02-15T10:00:00.000Z',
      });
    });

    it('adds playlist to track playlistIds', async () => {
      const cache = await setupCache();
      cache.tracks.track3 = {
        id: 'track3',
        name: 'Track Three',
        playlistIds: [],
        albumIds: ['album2'],
        lastAccessed: Date.now(),
      };

      await addAlbumToPlaylistInCache(
        'playlist-b',
        'album2',
        ['track3'],
        '2024-02-15T10:00:00.000Z',
        TEST_USER_ID
      );

      expect(cache.tracks.track3.playlistIds).toContain('playlist-b');
    });

    it('does not duplicate playlistId if track already has it', async () => {
      const cache = await setupCache();
      cache.tracks.track1.playlistIds = ['playlist-a', 'playlist-b'];

      await addAlbumToPlaylistInCache(
        'playlist-b',
        'album1',
        ['track1', 'track2'],
        '2024-02-15T10:00:00.000Z',
        TEST_USER_ID
      );

      const playlistBCount = cache.tracks.track1.playlistIds.filter(
        (p) => p === 'playlist-b'
      ).length;
      expect(playlistBCount).toBe(1);
    });

    it('skips tracks that do not exist in cache', async () => {
      const cache = await setupCache();

      await addAlbumToPlaylistInCache(
        'playlist-a',
        'album2',
        ['nonexistent-track'],
        '2024-02-15T10:00:00.000Z',
        TEST_USER_ID
      );

      expect(cache.playlists['playlist-a'].albums.album2).toEqual({
        trackIds: ['nonexistent-track'],
        addedAt: '2024-02-15T10:00:00.000Z',
      });
    });
  });
});
