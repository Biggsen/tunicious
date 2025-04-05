import { ref } from 'vue';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export function useAlbumMappings() {
  const loading = ref(false);
  const error = ref(null);

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
        console.log(`No mapping found for alternateId: ${alternateId}`);
        return null;
      }

      // Get the first matching document
      const mappingDoc = querySnapshot.docs[0];
      const data = mappingDoc.data();
      console.log(`Found mapping for ${alternateId}:`, data);
      return data.primaryId || null;

    } catch (e) {
      console.error('Error fetching album mapping:', e);
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
      console.error('Error fetching alternate IDs:', e);
      error.value = 'Failed to fetch alternate IDs';
      return [];
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    error,
    getPrimaryId,
    getAlternateIds
  };
} 