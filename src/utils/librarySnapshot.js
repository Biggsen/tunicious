/**
 * Display fields for the library grid and recordLibrarySave.
 * Full Spotify album payloads (tracks, markets, and the rest) stay out of the snapshot.
 */
export function slimSavedAlbum(album) {
  if (!album?.id) return null;
  const artistName = album.artists?.[0]?.name || album.artistName || '';
  const artistId = album.artists?.[0]?.id || album.artistId || '';
  const cover = album.images?.[1]?.url || album.images?.[0]?.url || album.albumCover || '';
  const releaseDate = album.release_date || (album.releaseYear ? String(album.releaseYear) : '');
  return {
    id: album.id,
    name: album.name || album.albumTitle || '',
    artists: artistName || artistId ? [{ id: artistId, name: artistName }] : [],
    images: cover ? [{ url: cover }] : [],
    release_date: releaseDate,
    addedAt: album.addedAt || null
  };
}

function albumId(album) {
  return album?.id || '';
}

/**
 * Decide how far a newest-first saved-album sync still has to go.
 * Removal checks are only for a finished sync whose total shrank.
 * A same-count swap is not listed here; Refresh does that full pass.
 */
export function decideLibrarySync({
  snapshot = null,
  pages = [],
  spotifyTotal = 0,
  pageSize = 50,
  lastPageLength = null,
  received = null
} = {}) {
  const pageList = Array.isArray(pages) ? pages : [];
  const known = new Set((snapshot?.albums || []).map(albumId).filter(Boolean));
  const flat = [];
  for (const page of pageList) {
    for (const album of page || []) {
      if (albumId(album)) flat.push(album);
    }
  }

  const head = flat[0] || null;
  const snapshotHead = snapshot?.albums?.[0] || null;
  const totalMatches = Boolean(snapshot) && snapshot.total === spotifyTotal;
  const headMatches = Boolean(
    head
    && snapshotHead
    && head.id === snapshotHead.id
    && (head.addedAt || null) === (snapshotHead.addedAt || null)
  );
  const bothEmpty = Boolean(snapshot) && !head && !snapshotHead && totalMatches;
  if ((totalMatches && headMatches) || bothEmpty) {
    return { unchanged: true, done: true, fresh: [], checkRemovalIds: [] };
  }

  const fresh = [];
  const freshIds = new Set();
  for (const album of flat) {
    const id = albumId(album);
    if (!id || known.has(id) || freshIds.has(id)) continue;
    freshIds.add(id);
    fresh.push(album);
  }

  const lastPage = pageList.length ? (pageList[pageList.length - 1] || []) : [];
  const derivedReceived = pageList.reduce((sum, page) => sum + (Array.isArray(page) ? page.length : 0), 0);
  const receivedCount = Number.isFinite(received) ? received : derivedReceived;
  const lastLength = Number.isFinite(lastPageLength) ? lastPageLength : lastPage.length;
  const exhausted = pageList.length > 0 && (
    lastLength === 0
    || lastLength < pageSize
    || (Number.isFinite(spotifyTotal) && receivedCount >= spotifyTotal)
  );
  const lastPageHasKnown = lastPage.some((album) => known.has(albumId(album)));
  const done = exhausted || (known.size > 0 && lastPageHasKnown);

  const seen = new Set(flat.map(albumId));
  const totalDropped = Boolean(
    snapshot
    && typeof snapshot.total === 'number'
    && Number.isFinite(spotifyTotal)
    && spotifyTotal < snapshot.total
  );
  const checkRemovalIds = done && totalDropped
    ? (snapshot.albums || []).map(albumId).filter((id) => id && !seen.has(id))
    : [];

  return { unchanged: false, done, fresh, checkRemovalIds };
}
