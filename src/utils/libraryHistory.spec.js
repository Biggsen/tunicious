import { describe, it, expect } from 'vitest';
import { mergeLibraryHistories, withLibraryRemoval, withLibrarySave } from './libraryHistory';

describe('libraryHistory', () => {
  it('appends a period and leaves an open one unchanged', () => {
    const first = withLibrarySave([], 'album-a', '2020-01-01T00:00:00.000Z');
    expect(first.changed).toBe(true);
    expect(first.history).toHaveLength(1);
    expect(first.history[0].removedDetectedAt).toBeNull();

    const second = withLibrarySave(first.history, 'album-a', '2024-01-01T00:00:00.000Z');
    expect(second.changed).toBe(false);
    expect(second.history).toHaveLength(1);
    expect(second.history[0].savedAt).toEqual(first.history[0].savedAt);
  });

  it('closes only the open period for that release', () => {
    const saved = withLibrarySave([], 'album-a', '2020-01-01T00:00:00.000Z');
    const also = withLibrarySave(saved.history, 'album-b', '2021-01-01T00:00:00.000Z');
    const closed = withLibraryRemoval(also.history, 'album-a', '2024-05-01T00:00:00.000Z');
    expect(closed.changed).toBe(true);
    expect(closed.history.find((entry) => entry.spotifyAlbumId === 'album-a').removedDetectedAt).toBeInstanceOf(Date);
    expect(closed.history.find((entry) => entry.spotifyAlbumId === 'album-b').removedDetectedAt).toBeNull();

    const again = withLibrarySave(closed.history, 'album-a', '2025-01-01T00:00:00.000Z');
    expect(again.history.filter((entry) => entry.spotifyAlbumId === 'album-a')).toHaveLength(2);
  });

  it('merges duplicate open periods down to the earlier save', () => {
    const merged = mergeLibraryHistories(
      [{ spotifyAlbumId: 'album-a', savedAt: '2022-01-01T00:00:00.000Z', removedDetectedAt: null }],
      [
        { spotifyAlbumId: 'album-a', savedAt: '2020-01-01T00:00:00.000Z', removedDetectedAt: null },
        { spotifyAlbumId: 'album-a', savedAt: '2019-01-01T00:00:00.000Z', removedDetectedAt: '2019-06-01T00:00:00.000Z' }
      ]
    );
    const open = merged.filter((entry) => entry.spotifyAlbumId === 'album-a' && !entry.removedDetectedAt);
    const closed = merged.filter((entry) => entry.removedDetectedAt);
    expect(open).toHaveLength(1);
    expect(open[0].savedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(closed).toHaveLength(1);
  });
});
