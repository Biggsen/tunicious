import { ref } from 'vue';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';

export function usePlaylistDocument() {
  const playlistDoc = ref(null);
  const updating = ref(false);
  const error = ref(null);

  const getPlaylistDocument = async (playlistId) => {
    const playlistsRef = collection(db, 'playlists');
    const q = query(playlistsRef, where('playlistId', '==', playlistId));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    return querySnapshot.docs[0];
  };

  const updatePlaylistName = async (playlistId, name) => {
    try {
      updating.value = true;
      error.value = null;
      if (!playlistDoc.value) {
        playlistDoc.value = await getPlaylistDocument(playlistId);
      }
      if (!playlistDoc.value) throw new Error('Playlist document not found');
      await updateDoc(doc(db, 'playlists', playlistDoc.value.id), {
        name,
        updatedAt: serverTimestamp(),
      });
      playlistDoc.value = await getPlaylistDocument(playlistId);
    } catch (err) {
      console.error('Error updating playlist:', err);
      error.value = err.message || 'Failed to update playlist';
    } finally {
      updating.value = false;
    }
  };

  return { playlistDoc, updating, error, getPlaylistDocument, updatePlaylistName };
}
