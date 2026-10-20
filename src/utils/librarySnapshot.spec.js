import { describe, expect, it } from 'vitest';
import { decideLibrarySync, slimSavedAlbum } from './librarySnapshot';

function album(id, addedAt = '2024-01-01T00:00:00.000Z') {
  return { id, addedAt, name: id };
}

describe('slimSavedAlbum', () => {
  it('keeps the grid fields and drops the rest of the Spotify album', () => {
    const slim = slimSavedAlbum({
      id: 'album-a',
      name: 'Kind of Blue',
      artists: [{ id: 'miles', name: 'Miles Davis' }, { id: 'other', name: 'Somebody' }],
      images: [{ url: 'https://images.example/large' }, { url: 'https://images.example/medium' }],
      release_date: '1959-08-17',
      addedAt: '2024-02-01T00:00:00.000Z',
      tracks: { items: [{ id: 'track-1' }] },
      available_markets: ['GB']
    });

    expect(slim).toEqual({
      id: 'album-a',
      name: 'Kind of Blue',
      artists: [{ id: 'miles', name: 'Miles Davis' }],
      images: [{ url: 'https://images.example/medium' }],
      release_date: '1959-08-17',
      addedAt: '2024-02-01T00:00:00.000Z'
    });
  });
});

describe('decideLibrarySync', () => {
  it('stops when total and the newest album match', () => {
    const snapshot = {
      total: 2,
      albums: [album('a', '2024-02-01T00:00:00.000Z'), album('b', '2024-01-01T00:00:00.000Z')]
    };
    const decision = decideLibrarySync({
      snapshot,
      pages: [[album('a', '2024-02-01T00:00:00.000Z'), album('b', '2024-01-01T00:00:00.000Z')]],
      spotifyTotal: 2
    });

    expect(decision.unchanged).toBe(true);
    expect(decision.done).toBe(true);
    expect(decision.fresh).toEqual([]);
    expect(decision.checkRemovalIds).toEqual([]);
  });

  it('takes a new prefix shorter than one page', () => {
    const snapshot = { total: 2, albums: [album('a'), album('b')] };
    const decision = decideLibrarySync({
      snapshot,
      pages: [[album('c', '2024-03-01T00:00:00.000Z'), album('a'), album('b')]],
      spotifyTotal: 3
    });

    expect(decision.unchanged).toBe(false);
    expect(decision.done).toBe(true);
    expect(decision.fresh.map((entry) => entry.id)).toEqual(['c']);
    expect(decision.checkRemovalIds).toEqual([]);
  });

  it('keeps paging when a new prefix fills the page, then stops at a known album', () => {
    const snapshot = { total: 2, albums: [album('a'), album('b')] };
    const first = decideLibrarySync({
      snapshot,
      pages: [[album('c', '2024-04-01T00:00:00.000Z'), album('d', '2024-03-01T00:00:00.000Z')]],
      spotifyTotal: 4,
      pageSize: 2
    });
    expect(first.done).toBe(false);
    expect(first.fresh.map((entry) => entry.id)).toEqual(['c', 'd']);
    expect(first.checkRemovalIds).toEqual([]);

    const second = decideLibrarySync({
      snapshot,
      pages: [
        [album('c', '2024-04-01T00:00:00.000Z'), album('d', '2024-03-01T00:00:00.000Z')],
        [album('a'), album('b')]
      ],
      spotifyTotal: 4,
      pageSize: 2
    });
    expect(second.done).toBe(true);
    expect(second.fresh.map((entry) => entry.id)).toEqual(['c', 'd']);
    expect(second.checkRemovalIds).toEqual([]);
  });

  it('asks to check snapshot ids that were not seen when total drops', () => {
    const snapshot = { total: 3, albums: [album('a'), album('b'), album('c')] };
    const decision = decideLibrarySync({
      snapshot,
      pages: [[album('a'), album('b')]],
      spotifyTotal: 2
    });

    expect(decision.done).toBe(true);
    expect(decision.fresh).toEqual([]);
    expect(decision.checkRemovalIds).toEqual(['c']);
  });

  it('waits until the new prefix is finished before listing removal checks', () => {
    const snapshot = { total: 4, albums: [album('a'), album('b'), album('c'), album('d')] };
    const decision = decideLibrarySync({
      snapshot,
      pages: [[album('e', '2024-06-01T00:00:00.000Z'), album('f', '2024-05-01T00:00:00.000Z')]],
      spotifyTotal: 3,
      pageSize: 2
    });

    expect(decision.done).toBe(false);
    expect(decision.fresh.map((entry) => entry.id)).toEqual(['e', 'f']);
    expect(decision.checkRemovalIds).toEqual([]);
  });

  it('picks up a new album and leaves the swapped-out one for a full refresh', () => {
    const snapshot = { total: 3, albums: [album('a'), album('b'), album('c')] };
    const decision = decideLibrarySync({
      snapshot,
      pages: [[album('d', '2024-05-01T00:00:00.000Z'), album('a'), album('b')]],
      spotifyTotal: 3
    });

    expect(decision.unchanged).toBe(false);
    expect(decision.done).toBe(true);
    expect(decision.fresh.map((entry) => entry.id)).toEqual(['d']);
    expect(decision.checkRemovalIds).toEqual([]);
  });
});
