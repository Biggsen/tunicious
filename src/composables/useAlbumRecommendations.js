import { ref } from 'vue';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useCurrentUser } from 'vuefire';
import { useFriends } from './useFriends';
import { useUserSpotifyApi } from './useUserSpotifyApi';
import { useAlbumsData } from './useAlbumsData';
import { useUserData } from './useUserData';
import { useAlbumMappings } from './useAlbumMappings';
import { loadUnifiedTrackCache, addAlbumTracks, addAlbumToPlaylistInCache } from '@utils/unifiedTrackCache';
import { clearCache, getCache, setCache } from '@utils/cache';
import { resolvePlaylistName } from '@utils/playlistNameResolver';
import { logPlaylist } from '@utils/logger';

/**
 * Build minimal album object for addAlbumToCollection from recommendation document.
 * @param {Object} rec - Recommendation document data
 * @returns {Object} Album-shaped object
 */
function albumFromRecommendation(rec) {
  return {
    id: rec.albumId,
    name: rec.albumTitle,
    artists: [{ name: rec.artistName, id: rec.artistId }],
    images: rec.albumCover ? [{ url: rec.albumCover }] : [],
    release_date: rec.releaseYear ? `${rec.releaseYear}-01-01` : ''
  };
}

export function useAlbumRecommendations() {
  const user = useCurrentUser();
  const { isFriend } = useFriends();
  const { addAlbumToPlaylist, getAlbumTracks, getUserPlaylists, isTuniciousPlaylist, getPlaylist } = useUserSpotifyApi();
  const { addAlbumToCollection, getCurrentPlaylistInfo } = useAlbumsData();
  const { userData } = useUserData();
  const { resolveToPrimaryId } = useAlbumMappings();
  const loading = ref(false);
  const error = ref(null);

  const createRecommendation = async (album, toUserId) => {
    if (!user.value) throw new Error('User must be authenticated');
    if (!album || !toUserId || user.value.uid === toUserId) {
      throw new Error('Invalid album or recipient');
    }
    const friend = await isFriend(toUserId);
    if (!friend) throw new Error('Can only recommend to a friend');

    const payload = {
      fromUserId: user.value.uid,
      toUserId,
      albumId: album.id,
      albumTitle: album.name,
      artistName: album.artists?.[0]?.name ?? '',
      artistId: album.artists?.[0]?.id ?? '',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      acceptedPlaylistId: null,
      acceptedAt: null
    };
    if (album.images?.[0]?.url) payload.albumCover = album.images[0].url;
    if (album.release_date) payload.releaseYear = album.release_date.split('-')[0];

    const col = collection(db, 'albumRecommendations');
    await addDoc(col, payload);
  };

  /**
   * Returns the set of user IDs who already have a pending recommendation for this album from the current user.
   * @param {string} albumId - Spotify album ID
   * @returns {Promise<Set<string>>}
   */
  const getPendingRecommendationRecipientIds = async (albumId) => {
    if (!user.value || !albumId) return new Set();
    try {
      const col = collection(db, 'albumRecommendations');
      const q = query(
        col,
        where('fromUserId', '==', user.value.uid),
        where('albumId', '==', albumId),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      const ids = new Set();
      snapshot.docs.forEach((d) => {
        const toUserId = d.data().toUserId;
        if (toUserId) ids.add(toUserId);
      });
      return ids;
    } catch (_) {
      return new Set();
    }
  };

  const getRecommendationsForMe = async (statusFilter = 'pending') => {
    if (!user.value) throw new Error('User must be authenticated');
    loading.value = true;
    error.value = null;
    try {
      const col = collection(db, 'albumRecommendations');
      const q = query(
        col,
        where('toUserId', '==', user.value.uid),
        where('status', '==', statusFilter),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const list = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let fromDisplayName = '';
        let fromProfileImageUrl = '';
        try {
          const userSnap = await getDoc(doc(db, 'users', data.fromUserId));
          if (userSnap.exists()) {
            const d = userSnap.data();
            fromDisplayName = d.displayName || d.email || 'Unknown';
            fromProfileImageUrl = d.profileImageUrl || '';
          }
        } catch (_) {}
        const rec = { id: docSnap.id, ...data, fromDisplayName, fromProfileImageUrl };
        const primaryAlbumId = await resolveToPrimaryId(data.albumId);
        const existingEntry = await getCurrentPlaylistInfo(primaryAlbumId);
        if (existingEntry?.playlistId) {
          rec.existingPlaylistId = existingEntry.playlistId;
          rec.existingPlaylistName = await resolvePlaylistName(existingEntry.playlistId, user.value.uid, getPlaylist) || 'a playlist';
        }
        list.push(rec);
      }
      return list;
    } catch (e) {
      error.value = e.message || 'Failed to load recommendations';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const acceptRecommendation = async (recommendationId, playlistId) => {
    if (!user.value) throw new Error('User must be authenticated');
    const recRef = doc(db, 'albumRecommendations', recommendationId);
    const recSnap = await getDoc(recRef);
    if (!recSnap.exists()) throw new Error('Recommendation not found');
    const data = recSnap.data();
    if (data.toUserId !== user.value.uid) throw new Error('Not the recipient');
    if (data.status !== 'pending') throw new Error('Recommendation already responded to');

    const primaryAlbumId = await resolveToPrimaryId(data.albumId);
    const existingEntry = await getCurrentPlaylistInfo(primaryAlbumId);
    if (existingEntry?.playlistId) {
      throw new Error('You already have this album in a playlist');
    }

    const album = albumFromRecommendation(data);
    await addAlbumToPlaylist(playlistId, data.albumId);
    await addAlbumToCollection({
      album,
      playlistId,
      playlistData: null,
      spotifyAddedAt: new Date()
    });

    if (user.value) {
      try {
        let allTracks = [];
        let offset = 0;
        const limit = 50;
        while (true) {
          const response = await getAlbumTracks(data.albumId, limit, offset);
          if (response?.items?.length) {
            allTracks = [...allTracks, ...response.items];
            if (response.items.length < limit) break;
            offset += limit;
          } else break;
        }
        if (allTracks.length > 0) {
          await loadUnifiedTrackCache(user.value.uid, userData.value?.lastFmUserName || '');
          await addAlbumTracks(data.albumId, allTracks, album, user.value.uid);
          await addAlbumToPlaylistInCache(
            playlistId,
            data.albumId,
            allTracks.map(t => t.id),
            new Date().toISOString(),
            user.value.uid
          );
          logPlaylist(`Added album ${data.albumId} to unified cache for playlist ${playlistId}`);

          const trackCountToAdd = allTracks.length;
          const playlistViewCacheKey = `playlist_summaries_${user.value.uid}`;
          const currentCacheState = getCache(playlistViewCacheKey);
          if (currentCacheState && typeof currentCacheState === 'object') {
            for (const group of Object.keys(currentCacheState)) {
              const list = currentCacheState[group];
              if (!Array.isArray(list)) continue;
              const entry = list.find(p => p.id === playlistId);
              if (entry) {
                const prev = entry.tracks?.total ?? 0;
                entry.tracks = { total: prev + trackCountToAdd };
                await setCache(playlistViewCacheKey, currentCacheState);
                logPlaylist('Updated playlist_summaries cache (optimistic) after accept recommendation:', { playlistId, newTotal: entry.tracks.total });
                break;
              }
            }
          }
          await clearCache(`playlist_${playlistId}_albumsWithDates`);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('playlist-albums-updated', { detail: { playlistId } }));
            window.dispatchEvent(new CustomEvent('playlists-updated', { detail: { playlistIds: [playlistId] } }));
          }
        }
      } catch (cacheErr) {
        logPlaylist('Error updating unified cache after accept recommendation:', cacheErr);
      }
    }

    await updateDoc(recRef, {
      status: 'accepted',
      acceptedPlaylistId: playlistId,
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };

  const declineRecommendation = async (recommendationId) => {
    if (!user.value) throw new Error('User must be authenticated');
    const recRef = doc(db, 'albumRecommendations', recommendationId);
    const recSnap = await getDoc(recRef);
    if (!recSnap.exists()) throw new Error('Recommendation not found');
    const data = recSnap.data();
    if (data.toUserId !== user.value.uid) throw new Error('Not the recipient');
    if (data.status !== 'pending') throw new Error('Recommendation already responded to');

    await updateDoc(recRef, {
      status: 'declined',
      updatedAt: serverTimestamp()
    });
  };

  const getTuniciousPlaylists = async () => {
    const response = await getUserPlaylists(50, 0);
    return response.items.filter(playlist => isTuniciousPlaylist(playlist));
  };

  /** Returns only playlists with pipelineRole === 'source' (for accept-recommendation dropdown). */
  const getSourcePlaylists = async () => {
    if (!user.value) return [];
    const playlistsRef = collection(db, 'playlists');
    const q = query(playlistsRef, where('userId', '==', user.value.uid));
    const snapshot = await getDocs(q);
    const sourceIds = new Set();
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.deletedAt != null) return;
      if (d.pipelineRole === 'source') sourceIds.add(d.playlistId);
    });
    if (sourceIds.size === 0) return [];
    const result = [];
    for (const playlistId of sourceIds) {
      try {
        const playlist = await getPlaylist(playlistId);
        if (playlist) result.push(playlist);
      } catch (_) {
        // getPlaylist throws if not Tunicious or 404; skip this playlist
      }
    }
    return result;
  };

  return {
    loading,
    error,
    createRecommendation,
    getPendingRecommendationRecipientIds,
    getRecommendationsForMe,
    acceptRecommendation,
    declineRecommendation,
    getTuniciousPlaylists,
    getSourcePlaylists
  };
}
