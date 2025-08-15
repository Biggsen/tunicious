import { ref } from 'vue';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';

export function useUserSpotifyApi() {
  const user = useCurrentUser();
  const loading = ref(false);
  const error = ref(null);

  /**
   * Gets the user's Spotify tokens from Firestore
   */
  const getUserTokens = async () => {
    if (!user.value) {
      throw new Error('User not authenticated');
    }

    const userDoc = await getDoc(doc(db, 'users', user.value.uid));
    if (!userDoc.exists()) {
      throw new Error('User profile not found');
    }

    const userData = userDoc.data();
    if (!userData.spotifyTokens) {
      throw new Error('Spotify not connected');
    }

    // Check if token is expired
    if (userData.spotifyTokens.expiresAt < Date.now()) {
      throw new Error('Spotify token expired - please reconnect');
    }

    return userData.spotifyTokens;
  };

  /**
   * Refreshes the user's Spotify access token
   */
  const refreshUserToken = async () => {
    try {
      const tokens = await getUserTokens();
      
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
          client_id: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const result = await response.json();
      
      // Update tokens in Firestore
      await setDoc(doc(db, 'users', user.value.uid), {
        spotifyTokens: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token || tokens.refreshToken, // Keep old refresh token if not provided
          expiresAt: Date.now() + (result.expires_in * 1000)
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      return result.access_token;
    } catch (err) {
      console.error('Token refresh error:', err);
      throw err;
    }
  };

  /**
   * Makes an authenticated request to the Spotify API using user's token
   */
  const makeUserRequest = async (endpoint, options = {}) => {
    try {
      loading.value = true;
      error.value = null;

      let accessToken;
      try {
        const tokens = await getUserTokens();
        accessToken = tokens.accessToken;
      } catch (err) {
        // Try to refresh token if expired
        if (err.message.includes('expired')) {
          accessToken = await refreshUserToken();
        } else {
          throw err;
        }
      }

      const response = await fetch(endpoint, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status} - ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Creates a new playlist for the user
   */
  const createPlaylist = async (name, description = '', isPublic = false) => {
    // First get the user's Spotify profile to get their user ID
    const profile = await makeUserRequest('https://api.spotify.com/v1/me');
    
    // Add AudioFoodie identifier to description
    const audioFoodieDescription = description 
      ? `${description} [AudioFoodie]`
      : '[AudioFoodie]';
    
    const playlistData = {
      name,
      description: audioFoodieDescription,
      public: isPublic
    };

    return makeUserRequest(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
      method: 'POST',
      body: JSON.stringify(playlistData)
    });
  };

  /**
   * Adds tracks to a playlist
   */
  const addTracksToPlaylist = async (playlistId, trackUris) => {
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({
        uris: trackUris
      })
    });
  };

  /**
   * Adds an album to a playlist
   */
  const addAlbumToPlaylist = async (playlistId, albumId) => {
    // First get all tracks from the album
    const albumTracks = await makeUserRequest(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`);
    
    // Convert track IDs to URIs
    const trackUris = albumTracks.items.map(track => `spotify:track:${track.id}`);
    
    // Add tracks to playlist
    return addTracksToPlaylist(playlistId, trackUris);
  };

  /**
   * Gets user's playlists
   */
  const getUserPlaylists = async (limit = 50, offset = 0) => {
    return makeUserRequest(`https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`);
  };

  /**
   * Gets a specific playlist
   */
  const getPlaylist = async (playlistId) => {
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}`);
  };

  /**
   * Gets tracks from a playlist
   */
  const getPlaylistTracks = async (playlistId, limit = 100, offset = 0) => {
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
  };

  /**
   * Removes tracks from a playlist
   */
  const removeTracksFromPlaylist = async (playlistId, trackUris) => {
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      body: JSON.stringify({
        uris: trackUris
      })
    });
  };

  /**
   * Searches for albums by query (artist name or album title)
   */
  const searchAlbums = async (query, limit = 20) => {
    const encodedQuery = encodeURIComponent(query);
    return makeUserRequest(`https://api.spotify.com/v1/search?q=${encodedQuery}&type=album&limit=${limit}`);
  };

  /**
   * Checks if a playlist was created by AudioFoodie
   */
  const isAudioFoodiePlaylist = (playlist) => {
    return playlist.description && playlist.description.includes('[AudioFoodie]');
  };

  return {
    loading,
    error,
    createPlaylist,
    addTracksToPlaylist,
    addAlbumToPlaylist,
    getUserPlaylists,
    getPlaylist,
    getPlaylistTracks,
    removeTracksFromPlaylist,
    searchAlbums,
    isAudioFoodiePlaylist,
    getUserTokens
  };
}
