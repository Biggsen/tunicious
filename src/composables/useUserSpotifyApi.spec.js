import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useUserSpotifyApi } from './useUserSpotifyApi';

const MOCK_PLAYLIST_ID = 'playlist-123';
const MOCK_TRACK_URIS = ['spotify:track:abc', 'spotify:track:def'];
const MOCK_ALBUM_IDS = ['album1', 'album2'];
const MOCK_SEARCH_RESPONSE = { albums: { items: [], total: 0 } };
const MOCK_PLAYLIST_ITEMS = {
  items: [{ track: { id: 't1', album: { id: 'a1' } }, added_at: '2024-01-01' }],
  total: 1
};

const createMockUserDoc = (overrides = {}) => ({
  exists: () => true,
  data: () => ({
    spotifyTokens: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      ...overrides.spotifyTokens
    },
    ...overrides
  })
});

const mockSpotifyApiCall = vi.fn().mockResolvedValue({});
vi.mock('@/composables/useBackendApi', () => ({
  useBackendApi: () => ({
    refreshSpotifyToken: vi.fn().mockResolvedValue({ accessToken: 'refreshed', expiresIn: 3600 }),
    spotifyApiCall: mockSpotifyApiCall
  })
}));

vi.mock('vuefire', () => ({
  useCurrentUser: () => ref({ uid: 'test-uid' })
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, collection, id) => ({ _path: `${collection}/${id}` })),
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' }))
}));

vi.mock('@/firebase', () => ({
  db: {}
}));

vi.mock('@utils/logger', () => ({
  logSpotify: vi.fn()
}));

describe('useUserSpotifyApi', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockSpotifyApiCall.mockResolvedValue({});
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValue(createMockUserDoc());
  });

  describe('createPlaylist', () => {
    it('calls mockSpotifyApiCall with me/playlists endpoint, POST method, and body', async () => {
      mockSpotifyApiCall.mockResolvedValue({ id: MOCK_PLAYLIST_ID });

      const { createPlaylist } = useUserSpotifyApi();
      await createPlaylist('My Playlist', 'A description', true);

      expect(mockSpotifyApiCall).toHaveBeenCalledTimes(1);
      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining('/me/playlists'),
        'POST',
        expect.objectContaining({
          name: 'My Playlist',
          description: expect.stringContaining('A description'),
          public: true
        }),
        expect.any(String)
      );
    });
  });

  describe('addTracksToPlaylist', () => {
    it('calls mockSpotifyApiCall with items endpoint, POST method, and uris in body', async () => {
      const { addTracksToPlaylist } = useUserSpotifyApi();
      await addTracksToPlaylist(MOCK_PLAYLIST_ID, MOCK_TRACK_URIS);

      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining(`/playlists/${MOCK_PLAYLIST_ID}/items`),
        'POST',
        { uris: MOCK_TRACK_URIS },
        expect.any(String)
      );
    });
  });

  describe('getPlaylistTracks', () => {
    it('calls mockSpotifyApiCall with items endpoint, GET method, and returns response', async () => {
      mockSpotifyApiCall.mockResolvedValue(MOCK_PLAYLIST_ITEMS);

      const { getPlaylistTracks } = useUserSpotifyApi();
      const result = await getPlaylistTracks(MOCK_PLAYLIST_ID, 50, 10);

      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining(`/playlists/${MOCK_PLAYLIST_ID}/items`),
        'GET',
        undefined,
        expect.any(String)
      );
      expect(result.items).toEqual(MOCK_PLAYLIST_ITEMS.items);
      expect(result.total).toBe(1);
    });
  });

  describe('removeTracksFromPlaylist', () => {
    it('calls mockSpotifyApiCall with items endpoint, DELETE method, and items in body', async () => {
      const { removeTracksFromPlaylist } = useUserSpotifyApi();
      await removeTracksFromPlaylist(MOCK_PLAYLIST_ID, MOCK_TRACK_URIS);

      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining(`/playlists/${MOCK_PLAYLIST_ID}/items`),
        'DELETE',
        expect.objectContaining({
          items: MOCK_TRACK_URIS.map(uri => ({ uri }))
        }),
        expect.any(String)
      );
    });

    it('throws when no track URIs provided', async () => {
      const { removeTracksFromPlaylist } = useUserSpotifyApi();
      await expect(removeTracksFromPlaylist(MOCK_PLAYLIST_ID, [])).rejects.toThrow(
        'No track URIs provided for removal'
      );
    });
  });

  describe('getPlaylistAlbumsWithDates', () => {
    it('calls mockSpotifyApiCall with items endpoint and fields query', async () => {
      mockSpotifyApiCall.mockResolvedValue({
        items: [{ track: { album: { id: 'a1' } }, added_at: '2024-01-01' }],
        total: 1
      });

      const { getPlaylistAlbumsWithDates } = useUserSpotifyApi();
      const result = await getPlaylistAlbumsWithDates(MOCK_PLAYLIST_ID);

      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining(`/playlists/${MOCK_PLAYLIST_ID}/items`),
        'GET',
        undefined,
        expect.any(String)
      );
      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining('fields=items'),
        expect.any(String),
        undefined,
        expect.any(String)
      );
      expect(result).toEqual([{ id: 'a1', addedAt: '2024-01-01' }]);
    });
  });

  describe('getAlbumsBatch', () => {
    it('calls mockSpotifyApiCall with albums/{id} per album', async () => {
      mockSpotifyApiCall
        .mockResolvedValueOnce({ id: 'album1' })
        .mockResolvedValueOnce({ id: 'album2' });

      const { getAlbumsBatch } = useUserSpotifyApi();
      const result = await getAlbumsBatch(MOCK_ALBUM_IDS);

      expect(mockSpotifyApiCall).toHaveBeenCalledTimes(2);
      expect(mockSpotifyApiCall).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/albums/album1'),
        'GET',
        undefined,
        expect.any(String)
      );
      expect(mockSpotifyApiCall).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/albums/album2'),
        'GET',
        undefined,
        expect.any(String)
      );
      expect(result.albums).toEqual([{ id: 'album1' }, { id: 'album2' }]);
    });
  });

  describe('loadAlbumsBatched', () => {
    it('returns array of albums from per-album fetches', async () => {
      mockSpotifyApiCall
        .mockResolvedValueOnce({ id: 'album1', name: 'Album 1' })
        .mockResolvedValueOnce({ id: 'album2', name: 'Album 2' });

      const { loadAlbumsBatched } = useUserSpotifyApi();
      const result = await loadAlbumsBatched(MOCK_ALBUM_IDS);

      expect(result).toEqual([{ id: 'album1', name: 'Album 1' }, { id: 'album2', name: 'Album 2' }]);
      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining('/albums/album1'),
        'GET',
        undefined,
        expect.any(String)
      );
    });
  });

  describe('searchAlbums', () => {
    it('calls mockSpotifyApiCall with search endpoint and limit capped at 10', async () => {
      mockSpotifyApiCall.mockResolvedValue(MOCK_SEARCH_RESPONSE);

      const { searchAlbums } = useUserSpotifyApi();
      await searchAlbums('test query', 20);

      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining('/search'),
        'GET',
        undefined,
        expect.any(String)
      );
      expect(mockSpotifyApiCall).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(String),
        undefined,
        expect.any(String)
      );
    });
  });
});
