import { ref } from 'vue';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logAlbum } from '@utils/logger';

export function useAlbumMappings() {
  const loading = ref(false);
  const error = ref(null);

  /**
   * Checks if an album ID is an alternate ID in the mappings
   * @param {string} albumId - The album ID to check
   * @returns {Promise<boolean>} True if the ID is an alternate ID, false otherwise
   */
  const isAlternateId = async (albumId) => {
    try {
      loading.value = true;
      error.value = null;

      const mappingsRef = collection(db, 'albumMappings');
      const q = query(mappingsRef, where('alternateId', '==', albumId));
      const querySnapshot = await getDocs(q);

      return !querySnapshot.empty;
    } catch (e) {
      logAlbum('Error checking if album is an alternate ID:', e);
      error.value = 'Failed to check if album is an alternate ID';
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Gets the primary ID for an album if it exists in the mappings
   * @param {string} alternateId - The alternate album ID to look up
   * @returns {Promise<string|null>} The primary ID if found, null otherwise
   */
  const getPrimaryId = async (alternateId) => {
    try {
      loading.value = true;
      error.value = null;

      const mappingsRef = collection(db, 'albumMappings');
      const q = query(mappingsRef, where('alternateId', '==', alternateId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        logAlbum(`No mapping found for alternateId: ${alternateId}`);
        return null;
      }

      // Get the first matching document
      const mappingDoc = querySnapshot.docs[0];
      const data = mappingDoc.data();
      logAlbum(`Found mapping for ${alternateId}:`, data);
      return data.primaryId || null;

    } catch (e) {
      logAlbum('Error fetching album mapping:', e);
      error.value = 'Failed to fetch album mapping';
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Gets all alternate IDs for a primary ID
   * @param {string} primaryId - The primary album ID to look up
   * @returns {Promise<string[]>} Array of alternate IDs
   */
  const getAlternateIds = async (primaryId) => {
    try {
      loading.value = true;
      error.value = null;

      const mappingsRef = collection(db, 'albumMappings');
      const q = query(mappingsRef, where('primaryId', '==', primaryId));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => doc.data().alternateId);

    } catch (e) {
      logAlbum('Error fetching alternate IDs:', e);
      error.value = 'Failed to fetch alternate IDs';
      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Creates a mapping between an alternate ID and a primary ID
   * @param {string} alternateId - The alternate album ID
   * @param {string} primaryId - The primary album ID
   * @returns {Promise<boolean>} Whether the mapping was created successfully
   */
  const createMapping = async (alternateId, primaryId) => {
    try {
      loading.value = true;
      error.value = null;

      const mappingsRef = collection(db, 'albumMappings');
      const mappingDoc = doc(mappingsRef);
      
      await setDoc(mappingDoc, {
        alternateId,
        primaryId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      logAlbum(`Created mapping: ${alternateId} -> ${primaryId}`);
      return true;

    } catch (e) {
      logAlbum('Error creating album mapping:', e);
      error.value = 'Failed to create album mapping';
      return false;
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    error,
    getPrimaryId,
    getAlternateIds,
    createMapping,
    isAlternateId
  };
} 