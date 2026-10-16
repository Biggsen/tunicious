import { collection, doc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useCurrentUser } from 'vuefire';
import { db } from '@/firebase';
import { useAlbumMappings } from './useAlbumMappings';
import { logAlbum } from '@utils/logger';
import { clearCache } from '@utils/cache';
import { toLibraryDate, withLibraryRemoval, withLibrarySave } from '@utils/libraryHistory';

function clearAlbumUserCache(uid, albumIds) {
  const seen = new Set();
  for (const albumId of albumIds) {
    if (!albumId || seen.has(albumId)) continue;
    seen.add(albumId);
    clearCache(`albumDbData_${albumId}_${uid}`);
  }
}

function catalogueFields(album) {
  const artistName = album.artists?.[0]?.name || album.artistName || '';
  const releaseYear = album.releaseYear
    || (album.release_date ? String(album.release_date).split('-')[0] : '');
  return {
    albumTitle: album.name || album.albumTitle || '',
    artistName,
    artistNameLower: artistName.toLowerCase(),
    artistId: album.artists?.[0]?.id || album.artistId || '',
    albumCover: album.images?.[1]?.url || album.images?.[0]?.url || album.albumCover || '',
    releaseYear
  };
}

function freshUserEntry(libraryHistory) {
  return {
    playlistHistory: [],
    libraryHistory,
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

export function useLibraryCatalogue() {
  const user = useCurrentUser();
  const { resolveToPrimaryId } = useAlbumMappings();

  async function recordLibrarySave(album, savedAt) {
    const spotifyAlbumId = album?.id;
    const uid = user.value?.uid;
    if (!spotifyAlbumId || !uid) return;

    const primaryId = await resolveToPrimaryId(spotifyAlbumId);
    const albumRef = doc(db, 'albums', primaryId);
    const indexRef = doc(db, 'users', uid, 'libraryIndex', spotifyAlbumId);
    const savedDate = toLibraryDate(savedAt);

    await runTransaction(db, async (transaction) => {
      const albumSnap = await transaction.get(albumRef);
      const indexSnap = await transaction.get(indexRef);
      const entry = albumSnap.exists() ? albumSnap.data().userEntries?.[uid] : null;
      const { history, changed } = withLibrarySave(entry?.libraryHistory, spotifyAlbumId, savedDate);
      if (!changed && indexSnap.exists()) return;

      if (!albumSnap.exists()) {
        transaction.set(albumRef, {
          ...catalogueFields(album),
          updatedAt: serverTimestamp(),
          userEntries: {
            [uid]: freshUserEntry(history)
          }
        });
      } else if (!entry) {
        transaction.update(albumRef, {
          [`userEntries.${uid}`]: freshUserEntry(history)
        });
      } else if (changed) {
        transaction.update(albumRef, {
          [`userEntries.${uid}.libraryHistory`]: history,
          [`userEntries.${uid}.updatedAt`]: serverTimestamp()
        });
      }

      if (!indexSnap.exists()) {
        const openPeriod = history.find((item) => item.spotifyAlbumId === spotifyAlbumId && !item.removedDetectedAt);
        transaction.set(indexRef, {
          primaryId,
          savedAt: openPeriod?.savedAt || savedDate
        });
      }
    });

    clearAlbumUserCache(uid, [spotifyAlbumId, primaryId]);
  }

  async function recordLibraryRemoval(spotifyAlbumId) {
    const uid = user.value?.uid;
    if (!spotifyAlbumId || !uid) return;

    const fallbackPrimaryId = await resolveToPrimaryId(spotifyAlbumId);
    const indexRef = doc(db, 'users', uid, 'libraryIndex', spotifyAlbumId);

    const primaryId = await runTransaction(db, async (transaction) => {
      const indexSnap = await transaction.get(indexRef);
      const catalogueId = indexSnap.exists() ? indexSnap.data().primaryId : fallbackPrimaryId;
      const albumRef = doc(db, 'albums', catalogueId);
      const albumSnap = await transaction.get(albumRef);
      const entry = albumSnap.exists() ? albumSnap.data().userEntries?.[uid] : null;
      const { history, changed } = withLibraryRemoval(entry?.libraryHistory, spotifyAlbumId, new Date());
      if (!changed && !indexSnap.exists()) return catalogueId;

      if (changed && entry) {
        transaction.update(albumRef, {
          [`userEntries.${uid}.libraryHistory`]: history,
          [`userEntries.${uid}.updatedAt`]: serverTimestamp()
        });
      }
      if (indexSnap.exists()) {
        transaction.delete(indexRef);
      }
      return catalogueId;
    });

    clearAlbumUserCache(uid, [spotifyAlbumId, primaryId]);
  }

  async function reconcileSavedAlbums(savedAlbums) {
    for (const album of savedAlbums || []) {
      try {
        await recordLibrarySave(album, album.addedAt);
      } catch (err) {
        logAlbum('Library catalogue reconcile failed', { albumId: album?.id, error: err?.message || err });
      }
    }
  }

  async function closeLibraryRemovals(savedIds, checkAlbumsInLibrary) {
    const uid = user.value?.uid;
    if (!uid) return;

    const indexSnap = await getDocs(collection(db, 'users', uid, 'libraryIndex'));
    const missing = indexSnap.docs.map((indexDoc) => indexDoc.id).filter((id) => !savedIds.has(id));
    for (let i = 0; i < missing.length; i += 40) {
      const batch = missing.slice(i, i + 40);
      let flags = [];
      try {
        flags = await checkAlbumsInLibrary(batch);
      } catch (err) {
        logAlbum('Skipping library removal check after Spotify contains failed', err?.message || err);
        continue;
      }
      if (!Array.isArray(flags)) continue;
      for (let j = 0; j < batch.length; j += 1) {
        if (flags[j] !== false) continue;
        try {
          await recordLibraryRemoval(batch[j]);
        } catch (err) {
          logAlbum('Failed to close library period', { albumId: batch[j], error: err?.message || err });
        }
      }
    }
  }

  return {
    recordLibrarySave,
    recordLibraryRemoval,
    reconcileSavedAlbums,
    closeLibraryRemovals
  };
}
