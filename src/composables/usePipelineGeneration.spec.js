import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteSpotifyPlaylist } from './usePipelineGeneration';

const MOCK_PLAYLIST_ID = 'playlist-123';

describe('deleteSpotifyPlaylist', () => {
  let makeUserRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    makeUserRequest = vi.fn().mockResolvedValue(undefined);
  });

  it('calls makeUserRequest with endpoint containing playlists/{id}/followers and method DELETE', async () => {
    await deleteSpotifyPlaylist(MOCK_PLAYLIST_ID, makeUserRequest);

    expect(makeUserRequest).toHaveBeenCalledTimes(1);
    expect(makeUserRequest).toHaveBeenCalledWith(
      expect.stringContaining(`/playlists/${MOCK_PLAYLIST_ID}/followers`),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('does not throw when makeUserRequest succeeds', async () => {
    await expect(
      deleteSpotifyPlaylist(MOCK_PLAYLIST_ID, makeUserRequest)
    ).resolves.not.toThrow();
  });

  it('catches and logs errors without throwing (best-effort rollback)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeUserRequest.mockRejectedValue(new Error('API failed'));

    await expect(
      deleteSpotifyPlaylist(MOCK_PLAYLIST_ID, makeUserRequest)
    ).resolves.toBeUndefined();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(MOCK_PLAYLIST_ID),
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
  });
});
