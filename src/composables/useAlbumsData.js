import { ref } from 'vue';
import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useCurrentUser } from 'vuefire';
import { useAlbumMappings } from './useAlbumMappings';
import { albumTitleSimilarity } from '../utils/fuzzyMatch';
import { useSpotifyApi } from '@/composables/useSpotifyApi';
import { setCache, getCache } from "@utils/cache";

/**
 * @typedef {'queued' | 'curious' | 'interested' | 'great' | 'excellent' | 'wonderful'} PlaylistCategory
 * @typedef {'known' | 'new'} PlaylistType
 * 
 * @typedef {Object} PlaylistHistoryEntry
 * @property {string} playlistId
 * @property {PlaylistCategory} category
 * @property {PlaylistType} type
 * @property {number} priority
 * @property {Date} addedAt
 * @property {Date|null} removedAt
 * 
 * @typedef {Object} UserAlbumData
 * @property {PlaylistHistoryEntry[]} playlistHistory
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

export function useAlbumsData() {
  const user = useCurrentUser();
  const { getPrimaryId } = useAlbumMappings();
  const albumData = ref({});
  const loading = ref(true);
  const error = ref(null);

  /**
   * Fetches album data for a specific album ID
   * @param {string} albumId - The Spotify album ID
   * @returns {Promise<UserAlbumData|null>} The album data for the current user, or null if not found
   */
  const fetchUserAlbumData = async (albumId) => {
    if (!user.value) return null;

    const cacheKey = `albumDbData_${albumId}_${user.value.uid}`;
    let cached = await getCache(cacheKey);
    if (cached) return cached;

    try {
      loading.value = true;
      error.value = null;
      
      // First try the direct album ID
      let albumDoc = await getDoc(doc(db, 'albums', albumId));
      
      // If not found, check if it's an alternate ID
      if (!albumDoc.exists()) {
        const primaryId = await getPrimaryId(albumId);
        if (primaryId) {
          albumDoc = await getDoc(doc(db, 'albums', primaryId));
        }
      }
      
      if (!albumDoc.exists()) {
        return null;
      }

      const data = albumDoc.data();
      console.log(`Album ${albumId} data:`, data);
      
      // Check if userEntries exists and has data for current user
      if (!data.userEntries || !data.userEntries[user.value.uid]) {
        console.log(`No user entries found for album ${albumId}`);
        return null;
      }

      const userData = data.userEntries[user.value.uid];
      console.log(`User data for album ${albumId}:`, userData);

      // Ensure playlistHistory is an array
      if (!Array.isArray(userData.playlistHistory)) {
        console.log(`Invalid playlistHistory for album ${albumId}`);
        return null;
      }

      const result = {
        ...userData,
        playlistHistory: userData.playlistHistory.map(entry => ({
          ...entry,
          addedAt: entry.addedAt?.toDate?.() || entry.addedAt,
          removedAt: entry.removedAt?.toDate?.() || entry.removedAt
        }))
      };
      await setCache(cacheKey, result);
      return result;
    } catch (e) {
      console.error('Error fetching album data:', e);
      error.value = 'Failed to fetch album data';
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Gets the current playlist information for an album
   * @param {string} albumId - The Spotify album ID
   * @returns {Promise<{category: PlaylistCategory, type: PlaylistType, playlistId: string, playlistName: string} | null>}
   */
  const getCurrentPlaylistInfo = async (albumId) => {
    console.log('Getting current playlist info for album:', albumId);
    const data = await fetchUserAlbumData(albumId);
    console.log('Fetched album data:', data);
    
    if (!data || !data.playlistHistory) {
      console.log('No data or playlist history found for album:', albumId);
      return null;
    }

    const currentEntry = data.playlistHistory.find(entry => !entry.removedAt);
    console.log('Current playlist entry:', currentEntry);
    
    if (!currentEntry) {
      console.log('No current playlist entry found for album:', albumId);
      return null;
    }

    return currentEntry;
  };

  /**
   * Fetches album data for multiple albums
   * @param {string[]} albumIds - Array of Spotify album IDs
   * @returns {Promise<Object.<string, UserAlbumData>>} Map of album IDs to their data
   */
  const fetchAlbumsData = async (albumIds) => {
    if (!user.value) return {};

    const results = {};
    for (const albumId of albumIds) {
      results[albumId] = await fetchUserAlbumData(albumId);
    }
    return results;
  };

  /**
   * Searches for albums by title and artist name
   * @param {string} albumTitle - The album title to search for
   * @param {string} artistName - The artist name to search for
   * @returns {Promise<{id: string, albumTitle: string, artistName: string}[]>} Array of matching albums
   */
  const searchAlbumsByTitleAndArtist = async (albumTitle, artistName) => {
    if (!user.value) return [];

    try {
      loading.value = true;
      error.value = null;

      const albumsRef = collection(db, 'albums');
      const q = query(
        albumsRef,
        where('albumTitle', '==', albumTitle),
        where('artistName', '==', artistName)
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        albumTitle: doc.data().albumTitle,
        artistName: doc.data().artistName,
        albumCover: doc.data().albumCover || '',
        releaseYear: doc.data().releaseYear || '',
        artistId: doc.data().artistId || ''
      }));

    } catch (e) {
      console.error('Error searching albums:', e);
      error.value = 'Failed to search albums';
      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Searches for albums by title and artist name with fuzzy matching
   * @param {string} albumTitle - The album title to search for
   * @param {string} artistName - The artist name to search for
   * @param {number} similarityThreshold - Threshold for fuzzy matching (0 to 1)
   * @returns {Promise<{id: string, albumTitle: string, artistName: string, similarity: number}[]>} Array of matching albums with similarity scores
   */
  const searchAlbumsByTitleAndArtistFuzzy = async (albumTitle, artistName, similarityThreshold = 0.7) => {
    if (!user.value) return [];

    try {
      loading.value = true;
      error.value = null;

      console.log('Starting fuzzy search for:', albumTitle, 'by', artistName, 'with threshold:', similarityThreshold);

      // First try exact match
      const exactMatches = await searchAlbumsByTitleAndArtist(albumTitle, artistName);
      console.log('Exact matches found:', exactMatches.length);
      
      if (exactMatches.length > 0) {
        return exactMatches.map(match => ({ ...match, similarity: 1 }));
      }

      // If no exact matches, try fuzzy matching
      const albumsRef = collection(db, 'albums');
      const q = query(albumsRef, where('artistName', '==', artistName));
      const querySnapshot = await getDocs(q);
      
      console.log('Found albums by artist:', querySnapshot.size);

      const fuzzyMatches = [];
      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        const similarityScore = albumTitleSimilarity(albumTitle, data.albumTitle);
        
        console.log('Comparing with:', data.albumTitle, 'Score:', similarityScore);
        
        // Since we're already matching by artist, we can use a lower threshold
        if (similarityScore >= similarityThreshold) {
          fuzzyMatches.push({
            id: doc.id,
            albumTitle: data.albumTitle,
            artistName: data.artistName,
            similarity: similarityScore,
            albumCover: data.albumCover || '',
            releaseYear: data.releaseYear || '',
            artistId: data.artistId || ''
          });
        }
      }

      console.log('Fuzzy matches found:', fuzzyMatches.length);
      
      // Sort by similarity (highest first)
      return fuzzyMatches.sort((a, b) => b.similarity - a.similarity);

    } catch (e) {
      console.error('Error searching albums with fuzzy matching:', e);
      error.value = 'Failed to search albums';
      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Searches for albums where the album title starts with the given prefix (case-insensitive)
   * @param {string} prefix - The album title prefix to search for
   * @returns {Promise<{id: string, albumTitle: string, artistName: string}[]>}
   */
  const searchAlbumsByTitlePrefix = async (prefix) => {
    if (!user.value) return [];
    try {
      loading.value = true;
      error.value = null;
      const albumsRef = collection(db, 'albums');
      // Fetch a wide range and filter client-side for case-insensitive match
      const q = query(
        albumsRef,
        where('albumTitle', '>=', prefix.charAt(0).toUpperCase()),
        where('albumTitle', '<=', prefix.charAt(0).toLowerCase() + '\uf8ff')
      );
      const querySnapshot = await getDocs(albumsRef); // get all, since Firestore can't do case-insensitive
      const lowerPrefix = prefix.toLowerCase();
      return querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          albumTitle: doc.data().albumTitle,
          artistName: doc.data().artistName,
          albumCover: doc.data().albumCover || '',
          releaseYear: doc.data().releaseYear || '',
          artistId: doc.data().artistId || ''
        }))
        .filter(album => album.albumTitle && album.albumTitle.toLowerCase().includes(lowerPrefix));
    } catch (e) {
      console.error('Error searching albums by title prefix:', e);
      error.value = 'Failed to search albums';
      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Searches for albums where the artist name starts with the given prefix (case-insensitive)
   * @param {string} prefix - The artist name prefix to search for
   * @returns {Promise<{id: string, albumTitle: string, artistName: string}[]>}
   */
  const searchAlbumsByArtistPrefix = async (prefix) => {
    if (!user.value) return [];
    try {
      loading.value = true;
      error.value = null;
      const lowerPrefix = prefix.toLowerCase();
      const albumsRef = collection(db, 'albums');
      const q = query(
        albumsRef,
        where('artistNameLower', '>=', lowerPrefix),
        where('artistNameLower', '<', lowerPrefix + '\uf8ff')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        albumTitle: doc.data().albumTitle,
        artistName: doc.data().artistName,
        albumCover: doc.data().albumCover || '',
        releaseYear: doc.data().releaseYear || '',
        artistId: doc.data().artistId || ''
      }));
    } catch (e) {
      console.error('Error searching albums by artist prefix:', e);
      error.value = 'Failed to search albums';
      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Adds an album to the user's collection and playlist history
   * @param {Object} params
   *   @param {Object} params.album - The album object (must have id, name, artists)
   *   @param {string} params.playlistId - The Spotify playlist ID
   *   @param {Object} [params.playlistData] - (Optional) The playlist data object (if already fetched)
   *   @param {Date} [params.spotifyAddedAt] - (Optional) The date the album was added to the playlist
   * @returns {Promise<void>}
   */
  const addAlbumToCollection = async ({ album, playlistId, playlistData = null, spotifyAddedAt = null }) => {
    if (!user.value || !album || !playlistId) throw new Error('Missing required parameters');
    try {
      loading.value = true;
      error.value = null;
      // Find the playlist document if not provided
      let _playlistData = playlistData;
      if (!_playlistData) {
        const playlistsRef = collection(db, 'playlists');
        const q = query(playlistsRef, where('playlistId', '==', playlistId));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          throw new Error('Playlist not found');
        }
        _playlistData = querySnapshot.docs[0].data();
      }
      // Get the Spotify added date for this album if not provided
      let _spotifyAddedAt = spotifyAddedAt;
      if (!_spotifyAddedAt) {
        const { getPlaylistAlbumsWithDates } = useSpotifyApi();
        const albumsWithDates = await getPlaylistAlbumsWithDates(playlistId);
        const albumWithDate = albumsWithDates.find(a => a.id === album.id);
        _spotifyAddedAt = albumWithDate?.addedAt ? new Date(albumWithDate.addedAt) : new Date();
      }
      const albumRef = doc(db, 'albums', album.id);
      // Get existing album data
      const existingData = await fetchUserAlbumData(album.id);
      // Prepare the new playlist history entry using playlist data
      const newEntry = {
        playlistId: _playlistData.playlistId,
        playlistName: _playlistData.name,
        category: _playlistData.category,
        type: _playlistData.type,
        priority: _playlistData.priority,
        addedAt: _spotifyAddedAt,
        removedAt: null
      };
      // Prepare the user's album data
      const userAlbumData = {
        playlistHistory: existingData?.playlistHistory 
          ? [...existingData.playlistHistory.filter(h => h.removedAt !== null), newEntry]
          : [newEntry],
        createdAt: existingData?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      // Update the album document
      await setDoc(albumRef, {
        albumTitle: album.name,
        artistName: album.artists[0].name,
        artistNameLower: album.artists[0].name.toLowerCase(),
        artistId: album.artists[0].id,
        albumCover: album.images && album.images.length > 0 ? album.images[1].url : '',
        releaseYear: album.release_date ? album.release_date.split('-')[0] : '',
        userEntries: {
          [user.value.uid]: userAlbumData
        }
      }, { merge: true });
    } catch (e) {
      console.error('Error adding album to collection:', e);
      error.value = e.message || 'Failed to add album to collection';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Fetches all album details (excluding userEntries) from the albums collection.
   * @returns {Promise<Array<{id: string, albumTitle: string, artistName: string, artistId?: string, albumCover?: string, releaseYear?: string}>>}
   */
  const fetchAlbumDetails = async () => {
    try {
      loading.value = true;
      error.value = null;
      const albumsRef = collection(db, 'albums');
      const querySnapshot = await getDocs(albumsRef);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Exclude userEntries
        const { albumTitle, artistName, artistId, albumCover, releaseYear } = data;
        return {
          id: doc.id,
          albumTitle: albumTitle || '',
          artistName: artistName || '',
          artistId: artistId || '',
          albumCover: albumCover || '',
          releaseYear: releaseYear || ''
        };
      });
    } catch (e) {
      console.error('Error fetching album details:', e);
      error.value = 'Failed to fetch album details';
      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Fetches root-level album details (excluding userEntries) from the albums collection for a given albumId.
   * @param {string} albumId - The Spotify album ID
   * @returns {Promise<Object|null>} The root-level album details or null if not found
   */
  const getAlbumDetails = async (albumId) => {
    try {
      const albumDoc = await getDoc(doc(db, 'albums', albumId));
      if (!albumDoc.exists()) return null;
      const data = albumDoc.data();
      // Only return root-level fields, exclude userEntries
      const { albumTitle, artistName, albumCover, artistId, releaseYear } = data;
      return { albumTitle, artistName, albumCover, artistId, releaseYear };
    } catch (e) {
      console.error('Error fetching album details:', e);
      return null;
    }
  };

  /**
   * Updates root-level album details (albumCover, artistId, releaseYear) for a given albumId in Firestore.
   * @param {string} albumId - The Spotify album ID
   * @param {Object} details - The details to update (albumCover, artistId, releaseYear)
   * @returns {Promise<void>}
   */
  const updateAlbumDetails = async (albumId, details) => {
    try {
      await setDoc(doc(db, 'albums', albumId), {
        ...details,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('Error updating album details:', e);
      throw e;
    }
  };

  /**
   * Gets the rating data (priority, category, type, playlistId) for the current playlist entry of an album
   * @param {string} albumId - The Spotify album ID
   * @returns {Promise<{priority: number, category: string, type: string, playlistId: string} | null>}
   */
  const getAlbumRatingData = async (albumId) => {
    const data = await fetchUserAlbumData(albumId);
    if (!data || !data.playlistHistory) return null;
    const currentEntry = data.playlistHistory.find(entry => !entry.removedAt);
    if (!currentEntry) return null;
    // Only return the relevant fields
    const { priority, category, type, playlistId } = currentEntry;
    return { priority, category, type, playlistId };
  };

  return {
    albumData,
    loading,
    error,
    fetchUserAlbumData,
    fetchAlbumsData,
    getCurrentPlaylistInfo,
    searchAlbumsByTitleAndArtist,
    searchAlbumsByTitleAndArtistFuzzy,
    addAlbumToCollection,
    searchAlbumsByTitlePrefix,
    searchAlbumsByArtistPrefix,
    fetchAlbumDetails,
    getAlbumDetails,
    updateAlbumDetails,
    getAlbumRatingData
  };
} 