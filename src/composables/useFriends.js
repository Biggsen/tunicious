import { ref, computed } from 'vue';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  addDoc, 
  doc, 
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useCurrentUser } from 'vuefire';
import { logUser } from '@utils/logger';

export function useFriends() {
  const user = useCurrentUser();
  
  const loading = ref(false);
  const error = ref(null);
  const friends = ref([]);
  const incomingRequests = ref([]);
  const outgoingRequests = ref([]);

  /**
   * Normalize user IDs to ensure user1Id < user2Id (alphabetically)
   * @param {string} userId1 
   * @param {string} userId2 
   * @returns {[string, string]} Normalized user IDs
   */
  const normalizeUserIds = (userId1, userId2) => {
    return [userId1, userId2].sort();
  };

  /**
   * Search for users by display name or email
   * @param {string} searchTerm - Search query
   * @param {number} maxResults - Maximum number of results (default: 20)
   * @returns {Promise<Array>} Array of user documents
   */
  const searchUsers = async (searchTerm, maxResults = 20) => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }

    try {
      loading.value = true;
      error.value = null;

      const searchLower = searchTerm.toLowerCase().trim();
      const usersRef = collection(db, 'users');
      
      // Search by searchableDisplayName (case-insensitive prefix match)
      const nameQuery = query(
        usersRef,
        where('publicProfile', '==', true),
        where('searchableDisplayName', '>=', searchLower),
        where('searchableDisplayName', '<=', searchLower + '\uf8ff'),
        limit(maxResults)
      );

      const nameResults = await getDocs(nameQuery);
      
      // Also search by email if it looks like an email
      let emailResults = [];
      if (searchTerm.includes('@')) {
        const emailQuery = query(
          usersRef,
          where('publicProfile', '==', true),
          where('email', '==', searchTerm.toLowerCase()),
          limit(maxResults)
        );
        emailResults = await getDocs(emailQuery);
      }

      // Combine results and remove duplicates
      const allDocs = new Map();
      nameResults.forEach(doc => {
        if (doc.id !== user.value.uid) {
          allDocs.set(doc.id, doc.data());
        }
      });
      emailResults.forEach(doc => {
        if (doc.id !== user.value.uid) {
          allDocs.set(doc.id, doc.data());
        }
      });

      // Get relationship status for each user
      const usersWithStatus = await Promise.all(
        Array.from(allDocs.entries()).map(async ([userId, userData]) => {
          const status = await getFriendshipStatus(userId);
          return {
            id: userId,
            ...userData,
            relationshipStatus: status
          };
        })
      );

      // Sort by displayName for better UX
      usersWithStatus.sort((a, b) => {
        const nameA = (a.displayName || a.email || '').toLowerCase();
        const nameB = (b.displayName || b.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      return usersWithStatus;
    } catch (e) {
      logUser('Error searching users:', e);
      error.value = 'Failed to search users';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get relationship status with a user
   * @param {string} otherUserId 
   * @returns {Promise<'friend' | 'incoming_request' | 'outgoing_request' | 'none'>}
   */
  const getFriendshipStatus = async (otherUserId) => {
    if (!user.value || !otherUserId || user.value.uid === otherUserId) {
      return 'none';
    }

    try {
      // Check if already friends
      const [user1Id, user2Id] = normalizeUserIds(user.value.uid, otherUserId);
      const friendshipQuery = query(
        collection(db, 'friendships'),
        where('user1Id', '==', user1Id),
        where('user2Id', '==', user2Id),
        limit(1)
      );
      const friendshipSnapshot = await getDocs(friendshipQuery);
      if (!friendshipSnapshot.empty) {
        return 'friend';
      }

      // Check for pending requests
      const incomingQuery = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', otherUserId),
        where('toUserId', '==', user.value.uid),
        where('status', '==', 'pending'),
        limit(1)
      );
      const incomingSnapshot = await getDocs(incomingQuery);
      if (!incomingSnapshot.empty) {
        return 'incoming_request';
      }

      const outgoingQuery = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', user.value.uid),
        where('toUserId', '==', otherUserId),
        where('status', '==', 'pending'),
        limit(1)
      );
      const outgoingSnapshot = await getDocs(outgoingQuery);
      if (!outgoingSnapshot.empty) {
        return 'outgoing_request';
      }

      return 'none';
    } catch (e) {
      logUser('Error getting friendship status:', e);
      return 'none';
    }
  };

  /**
   * Send a friend request
   * @param {string} toUserId - User ID to send request to
   * @returns {Promise<string>} Request document ID
   */
  const sendFriendRequest = async (toUserId) => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    if (user.value.uid === toUserId) {
      throw new Error('Cannot send friend request to yourself');
    }

    try {
      loading.value = true;
      error.value = null;

      // Check if request already exists
      const existingQuery = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', user.value.uid),
        where('toUserId', '==', toUserId),
        limit(1)
      );
      const existingSnapshot = await getDocs(existingQuery);
      if (!existingSnapshot.empty) {
        throw new Error('Friend request already sent');
      }

      // Check if already friends
      const status = await getFriendshipStatus(toUserId);
      if (status === 'friend') {
        throw new Error('Already friends with this user');
      }

      // Create friend request
      const requestRef = await addDoc(collection(db, 'friendRequests'), {
        fromUserId: user.value.uid,
        toUserId: toUserId,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null
      });

      logUser('Friend request sent:', requestRef.id);
      return requestRef.id;
    } catch (e) {
      logUser('Error sending friend request:', e);
      error.value = e.message || 'Failed to send friend request';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Accept a friend request
   * @param {string} requestId - Friend request document ID
   * @returns {Promise<void>}
   */
  const acceptFriendRequest = async (requestId) => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    try {
      loading.value = true;
      error.value = null;

      // Get the request
      const requestDoc = await getDoc(doc(db, 'friendRequests', requestId));
      if (!requestDoc.exists()) {
        throw new Error('Friend request not found');
      }

      const requestData = requestDoc.data();
      
      // Verify user is the recipient
      if (requestData.toUserId !== user.value.uid) {
        throw new Error('Not authorized to accept this request');
      }

      if (requestData.status !== 'pending') {
        throw new Error('Request is not pending');
      }

      // Use batch to ensure atomicity
      const batch = writeBatch(db);

      // Update request status
      batch.update(doc(db, 'friendRequests', requestId), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
        respondedAt: serverTimestamp()
      });

      // Create friendship
      const [user1Id, user2Id] = normalizeUserIds(requestData.fromUserId, requestData.toUserId);
      batch.set(doc(collection(db, 'friendships')), {
        user1Id: user1Id,
        user2Id: user2Id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      logUser('Friend request accepted and friendship created');
    } catch (e) {
      logUser('Error accepting friend request:', e);
      error.value = e.message || 'Failed to accept friend request';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Decline a friend request
   * @param {string} requestId - Friend request document ID
   * @returns {Promise<void>}
   */
  const declineFriendRequest = async (requestId) => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    try {
      loading.value = true;
      error.value = null;

      // Get the request
      const requestDoc = await getDoc(doc(db, 'friendRequests', requestId));
      if (!requestDoc.exists()) {
        throw new Error('Friend request not found');
      }

      const requestData = requestDoc.data();
      
      // Verify user is the recipient
      if (requestData.toUserId !== user.value.uid) {
        throw new Error('Not authorized to decline this request');
      }

      if (requestData.status !== 'pending') {
        throw new Error('Request is not pending');
      }

      // Update request status
      await updateDoc(doc(db, 'friendRequests', requestId), {
        status: 'declined',
        updatedAt: serverTimestamp(),
        respondedAt: serverTimestamp()
      });

      logUser('Friend request declined');
    } catch (e) {
      logUser('Error declining friend request:', e);
      error.value = e.message || 'Failed to decline friend request';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Cancel an outgoing friend request
   * @param {string} requestId - Friend request document ID
   * @returns {Promise<void>}
   */
  const cancelFriendRequest = async (requestId) => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    try {
      loading.value = true;
      error.value = null;

      // Get the request
      const requestDoc = await getDoc(doc(db, 'friendRequests', requestId));
      if (!requestDoc.exists()) {
        throw new Error('Friend request not found');
      }

      const requestData = requestDoc.data();
      
      // Verify user is the sender
      if (requestData.fromUserId !== user.value.uid) {
        throw new Error('Not authorized to cancel this request');
      }

      // Delete the request
      await deleteDoc(doc(db, 'friendRequests', requestId));
      logUser('Friend request canceled');
    } catch (e) {
      logUser('Error canceling friend request:', e);
      error.value = e.message || 'Failed to cancel friend request';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get all incoming friend requests
   * @returns {Promise<Array>} Array of friend request documents with user data
   */
  const getIncomingRequests = async () => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    try {
      loading.value = true;
      error.value = null;

      const requestsRef = collection(db, 'friendRequests');
      const q = query(
        requestsRef,
        where('toUserId', '==', user.value.uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const requests = [];

      // Fetch user data for each requester
      for (const docSnap of snapshot.docs) {
        const requestData = docSnap.data();
        const userDoc = await getDoc(doc(db, 'users', requestData.fromUserId));
        requests.push({
          id: docSnap.id,
          ...requestData,
          fromUser: userDoc.exists() ? userDoc.data() : null
        });
      }

      incomingRequests.value = requests;
      return requests;
    } catch (e) {
      logUser('Error getting incoming requests:', e);
      error.value = 'Failed to get incoming requests';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get all outgoing friend requests
   * @returns {Promise<Array>} Array of friend request documents with user data
   */
  const getOutgoingRequests = async () => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    try {
      loading.value = true;
      error.value = null;

      const requestsRef = collection(db, 'friendRequests');
      const q = query(
        requestsRef,
        where('fromUserId', '==', user.value.uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const requests = [];

      // Fetch user data for each recipient
      for (const docSnap of snapshot.docs) {
        const requestData = docSnap.data();
        const userDoc = await getDoc(doc(db, 'users', requestData.toUserId));
        requests.push({
          id: docSnap.id,
          ...requestData,
          toUser: userDoc.exists() ? userDoc.data() : null
        });
      }

      outgoingRequests.value = requests;
      return requests;
    } catch (e) {
      logUser('Error getting outgoing requests:', e);
      error.value = 'Failed to get outgoing requests';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get all friends
   * @returns {Promise<Array>} Array of friend user documents
   */
  const getFriends = async () => {
    if (!user.value) {
      throw new Error('User must be authenticated');
    }

    try {
      loading.value = true;
      error.value = null;

      const friendshipsRef = collection(db, 'friendships');
      
      // Query where user is user1Id
      const q1 = query(
        friendshipsRef,
        where('user1Id', '==', user.value.uid)
      );
      
      // Query where user is user2Id
      const q2 = query(
        friendshipsRef,
        where('user2Id', '==', user.value.uid)
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ]);

      const friendIds = new Set();
      
      snapshot1.forEach(doc => {
        friendIds.add(doc.data().user2Id);
      });
      
      snapshot2.forEach(doc => {
        friendIds.add(doc.data().user1Id);
      });

      // Fetch user data for each friend
      const friendsList = await Promise.all(
        Array.from(friendIds).map(async (friendId) => {
          const userDoc = await getDoc(doc(db, 'users', friendId));
          return userDoc.exists() ? {
            id: friendId,
            ...userDoc.data()
          } : null;
        })
      );

      friends.value = friendsList.filter(f => f !== null);
      return friends.value;
    } catch (e) {
      logUser('Error getting friends:', e);
      error.value = 'Failed to get friends';
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Check if a user is a friend
   * @param {string} userId 
   * @returns {Promise<boolean>}
   */
  const isFriend = async (userId) => {
    if (!user.value || !userId || user.value.uid === userId) {
      return false;
    }

    try {
      const [user1Id, user2Id] = normalizeUserIds(user.value.uid, userId);
      const friendshipQuery = query(
        collection(db, 'friendships'),
        where('user1Id', '==', user1Id),
        where('user2Id', '==', user2Id),
        limit(1)
      );
      const snapshot = await getDocs(friendshipQuery);
      return !snapshot.empty;
    } catch (e) {
      logUser('Error checking if friend:', e);
      return false;
    }
  };

  return {
    loading,
    error,
    friends,
    incomingRequests,
    outgoingRequests,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    getIncomingRequests,
    getOutgoingRequests,
    getFriends,
    getFriendshipStatus,
    isFriend
  };
}

