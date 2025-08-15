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
      if (!user.value) {
        throw new Error('User not authenticated');
      }

      // Get tokens directly from Firestore without expiration check
      const userDoc = await getDoc(doc(db, 'users', user.value.uid));
      if (!userDoc.exists()) {
        throw new Error('User profile not found');
      }

      const userData = userDoc.data();
      if (!userData.spotifyTokens || !userData.spotifyTokens.refreshToken) {
        throw new Error('Spotify not connected or missing refresh token');
      }

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: userData.spotifyTokens.refreshToken,
          client_id: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
        }),
      });

             if (!response.ok) {
         const errorData = await response.json().catch(() => ({}));
         console.error('Token refresh failed:', response.status, errorData);
         
         // Handle specific Spotify error cases
         if (response.status === 400) {
           if (errorData.error === 'invalid_grant') {
             throw new Error('Spotify session expired - please reconnect your account');
           } else {
             throw new Error('Invalid refresh token - please reconnect your account');
           }
         } else if (response.status === 401) {
           throw new Error('Unauthorized - please reconnect your account');
         } else {
           throw new Error(`Failed to refresh token: ${response.status} - ${errorData.error_description || 'Unknown error'}`);
         }
       }

      const result = await response.json();
      
      // Update tokens in Firestore
      await setDoc(doc(db, 'users', user.value.uid), {
        spotifyTokens: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token || userData.spotifyTokens.refreshToken, // Keep old refresh token if not provided
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
        console.log('Using existing token, expires at:', new Date(tokens.expiresAt));
             } catch (err) {
         console.log('Token error:', err.message);
         // Try to refresh token if expired
         if (err.message.includes('expired') || err.message.includes('reconnect')) {
           console.log('Attempting token refresh...');
           try {
             accessToken = await refreshUserToken();
             console.log('Token refreshed successfully');
           } catch (refreshErr) {
             console.error('Token refresh failed:', refreshErr.message);
             // If refresh fails, clear the tokens and ask user to reconnect
             if (refreshErr.message.includes('reconnect')) {
               // Clear the invalid tokens from Firestore
               await setDoc(doc(db, 'users', user.value.uid), {
                 spotifyTokens: null,
                 spotifyConnected: false,
                 updatedAt: serverTimestamp()
               }, { merge: true });
               throw new Error('Spotify connection lost - please reconnect your account');
             }
             throw refreshErr;
           }
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
        const errorText = await response.text();
        console.error('Spotify API error:', response.status, response.statusText, errorText);
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
   * Gets all tracks from a playlist (handles pagination)
   */
  const getAllPlaylistTracks = async (playlistId) => {
    let allTracks = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const response = await getPlaylistTracks(playlistId, limit, offset);
      allTracks = allTracks.concat(response.items);
      
      if (response.items.length < limit) {
        break;
      }
      offset += limit;
    }
    
    return allTracks;
  };

  /**
   * Groups tracks by album and returns album information
   */
  const getPlaylistAlbums = async (playlistId) => {
    const tracks = await getAllPlaylistTracks(playlistId);
    
    // Group tracks by album
    const albumMap = new Map();
    
    tracks.forEach(track => {
      if (track.track && track.track.album) {
        const albumId = track.track.album.id;
        
        if (!albumMap.has(albumId)) {
          albumMap.set(albumId, {
            id: albumId,
            name: track.track.album.name,
            artist: track.track.artists.map(a => a.name).join(', '),
            cover: track.track.album.images?.[0]?.url,
            tracks: []
          });
        }
        
        const trackData = {
          id: track.track.id,
          uri: track.track.uri,
          name: track.track.name,
          duration: track.track.duration_ms
        };
        
        albumMap.get(albumId).tracks.push(trackData);
      }
    });
    
    return Array.from(albumMap.values());
  };

  /**
   * Removes an album from a playlist
   */
  const removeAlbumFromPlaylist = async (playlistId, album) => {
    // Fetch current playlist tracks to get the actual URIs
    const tracks = await getAllPlaylistTracks(playlistId);
    
    // Find tracks that belong to the specified album
    const albumTrackUris = tracks
      .filter(track => track.track && track.track.album && track.track.album.id === album.id)
      .map(track => track.track.uri);
    
    console.log('DEBUG: Found track URIs for album:', albumTrackUris);
    
    if (albumTrackUris.length === 0) {
      throw new Error('No tracks found for this album in the playlist');
    }
    
    return removeTracksFromPlaylist(playlistId, albumTrackUris);
  };

  /**
   * Removes tracks from a playlist
   */
  const removeTracksFromPlaylist = async (playlistId, trackUris) => {
    if (!trackUris || trackUris.length === 0) {
      throw new Error('No track URIs provided for removal');
    }
    
    // According to Spotify API docs, we need to use the tracks array format
    const requestBody = {
      tracks: trackUris.map(uri => ({ uri }))
    };
    
    console.log('DEBUG: Request body for removal:', JSON.stringify(requestBody, null, 2));
    
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      body: JSON.stringify(requestBody)
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
    getAllPlaylistTracks,
    getPlaylistAlbums,
    removeTracksFromPlaylist,
    removeAlbumFromPlaylist,
    searchAlbums,
    isAudioFoodiePlaylist,
    getUserTokens
  };
}
