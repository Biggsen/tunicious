import { ref } from 'vue';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useCurrentUser } from 'vuefire';
import { useAlbumMappings } from './useAlbumMappings';
import { isSimilar, stringSimilarity, albumTitleSimilarity } from '../utils/fuzzyMatch';

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
  const fetchAlbumData = async (albumId) => {
    if (!user.value) return null;

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

      return {
        ...userData,
        playlistHistory: userData.playlistHistory.map(entry => ({
          ...entry,
          addedAt: entry.addedAt?.toDate?.() || entry.addedAt,
          removedAt: entry.removedAt?.toDate?.() || entry.removedAt
        }))
      };
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
    const data = await fetchAlbumData(albumId);
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
      results[albumId] = await fetchAlbumData(albumId);
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
        artistName: doc.data().artistName
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
            similarity: similarityScore
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

  return {
    albumData,
    loading,
    error,
    fetchAlbumData,
    fetchAlbumsData,
    getCurrentPlaylistInfo,
    searchAlbumsByTitleAndArtist,
    searchAlbumsByTitleAndArtistFuzzy
  };
} 