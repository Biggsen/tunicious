import { ref, watch } from 'vue';
import { useCurrentUser } from 'vuefire';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useBackendApi } from '@/composables/useBackendApi';
import { logSpotify } from '@utils/logger';
import { TUNICIOUS_TAG } from '@/constants';

// Module-level cache for connection status checks (shared across all instances)
let connectionStatusCache = null;
let connectionStatusCacheTime = 0;
let connectionStatusPromise = null;
let cachedUserId = null;
const CONNECTION_STATUS_CACHE_TTL = 30000; // 30 seconds

export function useUserSpotifyApi() {
  const user = useCurrentUser();
  const loading = ref(false);
  const error = ref(null);
  const { refreshSpotifyToken, spotifyApiCall } = useBackendApi();

  // Clear cache when user changes
  watch(user, (newUser, oldUser) => {
    if (newUser?.uid !== oldUser?.uid) {
      logSpotify('User changed, clearing connection status cache');
      connectionStatusCache = null;
      connectionStatusCacheTime = 0;
      cachedUserId = null;
    }
  });

  /**
   * Gets the user's Spotify tokens from Firestore
   * Automatically refreshes the token if it's expired or about to expire
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

    if (!userData.spotifyTokens.refreshToken) {
      throw new Error('Spotify not connected or missing refresh token');
    }

    // Check if token is expired or about to expire
    const now = Date.now();
    const expiresAt = typeof userData.spotifyTokens.expiresAt === 'number' 
      ? userData.spotifyTokens.expiresAt 
      : userData.spotifyTokens.expiresAt?.toMillis?.() || userData.spotifyTokens.expiresAt;
    
    // If token is expired or expires within 10 minutes, refresh it
    const tenMinutes = 10 * 60 * 1000;
    const timeUntilExpiry = expiresAt ? (expiresAt - now) : 0;
    
    if (!expiresAt || expiresAt <= now || timeUntilExpiry < tenMinutes) {
      // Try to refresh the token
      try {
        await refreshUserToken();
        // After refresh, get the updated tokens
        const updatedDoc = await getDoc(doc(db, 'users', user.value.uid));
        const updatedData = updatedDoc.data();
        if (!updatedData.spotifyTokens) {
          throw new Error('Spotify token refresh failed - please reconnect');
        }
        return updatedData.spotifyTokens;
      } catch (refreshErr) {
        logSpotify('Token refresh failed in getUserTokens:', refreshErr);
        // If refresh fails, throw an error indicating reconnection is needed
        throw new Error('Spotify token expired - please reconnect');
      }
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

      // Use our secure backend for token refresh
      const result = await refreshSpotifyToken(userData.spotifyTokens.refreshToken);
      
      // Update tokens in Firestore
      await setDoc(doc(db, 'users', user.value.uid), {
        spotifyTokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || userData.spotifyTokens.refreshToken, // Keep old refresh token if not provided
          expiresAt: Date.now() + (result.expiresIn * 1000)
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      logSpotify('Token refreshed successfully, new expiry:', new Date(Date.now() + (result.expiresIn * 1000)));
      return result.accessToken;
    } catch (err) {
      logSpotify('Token refresh error:', err);
      
      // Check if this is a refresh token expiration error
      if (err.message.includes('Failed to refresh token') || err.message.includes('400')) {
        // Clear the invalid tokens from Firestore
        await setDoc(doc(db, 'users', user.value.uid), {
          spotifyTokens: null,
          spotifyConnected: false,
          updatedAt: serverTimestamp()
        }, { merge: true });
        
        throw new Error('Spotify refresh token expired - please reconnect your account');
      }
      
      throw err;
    }
  };

  /**
   * Proactively refresh token if it's close to expiration (within 10 minutes)
   */
  const ensureTokenFresh = async () => {
    try {
      if (!user.value) {
        return null;
      }

      const userDoc = await getDoc(doc(db, 'users', user.value.uid));
      if (!userDoc.exists()) {
        return null;
      }

      const userData = userDoc.data();
      if (!userData.spotifyTokens || !userData.spotifyTokens.refreshToken) {
        return null;
      }

      // Handle Firestore timestamp types correctly
      const now = Date.now();
      const expiresAt = typeof userData.spotifyTokens.expiresAt === 'number' 
        ? userData.spotifyTokens.expiresAt 
        : userData.spotifyTokens.expiresAt?.toMillis?.() || userData.spotifyTokens.expiresAt;
      
      if (!expiresAt) {
        return null;
      }

      // Check if token expires within 10 minutes
      const tenMinutes = 10 * 60 * 1000;
      const timeUntilExpiry = expiresAt - now;
      
      if (timeUntilExpiry < tenMinutes) {
        logSpotify('Token expires soon, refreshing proactively...', {
          expiresAt: new Date(expiresAt),
          timeUntilExpiry: Math.round(timeUntilExpiry / 1000 / 60) + ' minutes'
        });
        return await refreshUserToken();
      }

      return userData.spotifyTokens.accessToken;
    } catch (err) {
      logSpotify('Error in ensureTokenFresh:', err);
      return null;
    }
  };

  /**
   * Check and recover Spotify connection status
   * Uses caching and deduplication to prevent redundant API calls
   */
  const checkConnectionStatus = async () => {
    // Check cache first (only if same user)
    const now = Date.now();
    if (connectionStatusCache && 
        cachedUserId === user.value?.uid &&
        (now - connectionStatusCacheTime) < CONNECTION_STATUS_CACHE_TTL) {
      logSpotify('Using cached connection status');
      return connectionStatusCache;
    }

    // If a check is already in progress, return the same promise
    if (connectionStatusPromise) {
      logSpotify('Connection status check already in progress, waiting...');
      return connectionStatusPromise;
    }

    // Start new check
    connectionStatusPromise = (async () => {
      try {
        if (!user.value) {
          const result = { connected: false, error: 'User not authenticated' };
          connectionStatusCache = result;
          connectionStatusCacheTime = now;
          cachedUserId = null;
          return result;
        }

        // If user changed, clear cache
        if (cachedUserId && cachedUserId !== user.value.uid) {
          logSpotify('User ID changed, clearing cache');
          connectionStatusCache = null;
          connectionStatusCacheTime = 0;
        }

        const userDoc = await getDoc(doc(db, 'users', user.value.uid));
        if (!userDoc.exists()) {
          const result = { connected: false, error: 'User profile not found' };
          connectionStatusCache = result;
          connectionStatusCacheTime = now;
          cachedUserId = user.value.uid;
          return result;
        }

        const userData = userDoc.data();
        if (!userData.spotifyTokens) {
          const result = { connected: false, error: 'Spotify not connected' };
          connectionStatusCache = result;
          connectionStatusCacheTime = now;
          cachedUserId = user.value.uid;
          return result;
        }

        if (!userData.spotifyTokens.refreshToken) {
          const result = { connected: false, error: 'No refresh token available' };
          connectionStatusCache = result;
          connectionStatusCacheTime = now;
          cachedUserId = user.value.uid;
          return result;
        }

        // Check if token is expired (handle Firestore timestamp types correctly)
        const expiresAt = typeof userData.spotifyTokens.expiresAt === 'number' 
          ? userData.spotifyTokens.expiresAt 
          : userData.spotifyTokens.expiresAt?.toMillis?.() || userData.spotifyTokens.expiresAt;
        
        if (expiresAt && expiresAt < now) {
          logSpotify('Token expired, attempting refresh...');
          try {
            await refreshUserToken();
            // Clear cache after token refresh since status changed
            connectionStatusCache = null;
            connectionStatusCacheTime = 0;
            const result = { connected: true, error: null, refreshed: true };
            connectionStatusCache = result;
            connectionStatusCacheTime = Date.now();
            cachedUserId = user.value.uid;
            return result;
          } catch (refreshErr) {
            logSpotify('Token refresh failed:', refreshErr);
            const result = { connected: false, error: 'Token refresh failed - please reconnect' };
            connectionStatusCache = result;
            connectionStatusCacheTime = now;
            cachedUserId = user.value.uid;
            return result;
          }
        }

        // Test the connection with a simple API call
        try {
          await makeUserRequest('/me');
          const result = { connected: true, error: null, refreshed: false };
          connectionStatusCache = result;
          connectionStatusCacheTime = Date.now();
          cachedUserId = user.value.uid;
          return result;
        } catch (apiErr) {
          logSpotify('API test failed:', apiErr);
          
          // If API call fails, try refreshing the token
          if (apiErr.message.includes('401') || apiErr.message.includes('expired')) {
            try {
              await refreshUserToken();
              // Clear cache after token refresh since status changed
              connectionStatusCache = null;
              connectionStatusCacheTime = 0;
              const result = { connected: true, error: null, refreshed: true };
              connectionStatusCache = result;
              connectionStatusCacheTime = Date.now();
              cachedUserId = user.value.uid;
              return result;
            } catch (refreshErr) {
              const result = { connected: false, error: 'Connection test failed - please reconnect' };
              connectionStatusCache = result;
              connectionStatusCacheTime = now;
              cachedUserId = user.value.uid;
              return result;
            }
          }
          
          const result = { connected: false, error: 'Connection test failed' };
          connectionStatusCache = result;
          connectionStatusCacheTime = now;
          cachedUserId = user.value.uid;
          return result;
        }
      } catch (err) {
        logSpotify('Error checking connection status:', err);
        const result = { connected: false, error: 'Failed to check connection status' };
        connectionStatusCache = result;
        connectionStatusCacheTime = now;
        cachedUserId = user.value?.uid || null;
        return result;
      } finally {
        // Clear the promise so future calls can start a new check
        connectionStatusPromise = null;
      }
    })();

    return connectionStatusPromise;
  };

  /**
   * Makes an authenticated request to the Spotify API using user's token
   */
  const makeUserRequest = async (endpoint, options = {}) => {
    try {
      loading.value = true;
      error.value = null;

      // Proactively ensure token is fresh before making any request
      let accessToken = await ensureTokenFresh();
      
      // If ensureTokenFresh returned null, try to get tokens directly
      if (!accessToken) {
        try {
          const tokens = await getUserTokens();
          accessToken = tokens.accessToken;
          logSpotify('Using existing token, expires at:', new Date(tokens.expiresAt));
        } catch (err) {
          logSpotify('Token error:', err.message);
          
          // Try to refresh token if expired or about to expire
          if (err.message.includes('expired') || err.message.includes('reconnect')) {
            logSpotify('Attempting token refresh...');
            try {
              accessToken = await refreshUserToken();
              logSpotify('Token refreshed successfully');
            } catch (refreshErr) {
              logSpotify('Token refresh failed:', refreshErr.message);
              
              // If refresh fails, clear the tokens and ask user to reconnect
              if (refreshErr.message.includes('reconnect') || refreshErr.message.includes('expired')) {
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
      } else {
        logSpotify('Token was proactively refreshed, using fresh token');
      }

      // Use our secure backend proxy instead of direct API call
      const endpointPath = endpoint.replace('https://api.spotify.com/v1', '');
      logSpotify(`Making API call: ${options.method || 'GET'} ${endpointPath}`);
      return await spotifyApiCall(endpointPath, options.method || 'GET', options.body, accessToken);
    } catch (err) {
      error.value = err.message || err.toString();
      
      // Provide more specific error messages for common issues
      if (err.message.includes('Failed to refresh token') || err.message.includes('400')) {
        throw new Error('Spotify connection lost - please reconnect your account');
      } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        throw new Error('Spotify authentication expired - please reconnect your account');
      } else if (err.message.includes('403') || err.message.includes('Forbidden')) {
        throw new Error('Spotify access denied - please reconnect your account');
      } else if (err.message.includes('429') || err.message.includes('rate limit')) {
        throw new Error('Spotify rate limit exceeded - please try again in a moment');
      } else if (err.message.includes('network') || err.message.includes('fetch')) {
        throw new Error('Network error connecting to Spotify - please check your connection and try again');
      }
      
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Formats a description with the Tunicious tag at the beginning
   */
  const formatTuniciousDescription = (description) => {
    return description 
      ? `${TUNICIOUS_TAG} ${description}`
      : TUNICIOUS_TAG;
  };

  /**
   * Creates a new playlist for the user
   */
  const createPlaylist = async (name, description = '', isPublic = false) => {
    // First get the user's Spotify profile to get their user ID
    const profile = await makeUserRequest('https://api.spotify.com/v1/me');
    
    // Add Tunicious identifier to description at the beginning
    const tuniciousDescription = formatTuniciousDescription(description);
    
    const playlistData = {
      name,
      description: tuniciousDescription,
      public: isPublic
    };

    return makeUserRequest(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
      method: 'POST',
      body: playlistData
    });
  };

  /**
   * Adds tracks to a playlist
   */
  const addTracksToPlaylist = async (playlistId, trackUris) => {
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: {
        uris: trackUris
      }
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
   * Checks if a playlist was created by Tunicious
   */
  const isTuniciousPlaylist = (playlist) => {
    return playlist.description && playlist.description.includes(TUNICIOUS_TAG);
  };

  /**
   * Gets user's playlists (only returns Tunicious playlists)
   */
  const getUserPlaylists = async (limit = 50, offset = 0) => {
    let allTuniciousPlaylists = [];
    let currentOffset = 0;
    const pageLimit = 50;
    let hasMore = true;
    
    // Paginate through all playlists to find Tunicious ones
    while (hasMore) {
      const response = await makeUserRequest(`https://api.spotify.com/v1/me/playlists?limit=${pageLimit}&offset=${currentOffset}`);
      
      // Filter to only return Tunicious playlists
      const filteredItems = response.items.filter(playlist => isTuniciousPlaylist(playlist));
      allTuniciousPlaylists = allTuniciousPlaylists.concat(filteredItems);
      
      // Check if there are more pages
      hasMore = response.items.length === pageLimit && (currentOffset + pageLimit < response.total);
      currentOffset += pageLimit;
      
      // If we've found enough playlists for the requested limit and offset is 0, stop
      if (allTuniciousPlaylists.length >= limit && offset === 0) {
        break;
      }
    }
    
    // Apply limit and offset to the filtered results
    const startIndex = offset;
    const endIndex = offset + limit;
    const paginatedItems = allTuniciousPlaylists.slice(startIndex, endIndex);
    
    return {
      items: paginatedItems,
      total: allTuniciousPlaylists.length,
      limit: limit,
      offset: offset
    };
  };

  /**
   * Gets a specific playlist (validates Tunicious tag)
   */
  const getPlaylist = async (playlistId) => {
    const playlist = await makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}`);
    
    // Validate that playlist has Tunicious tag
    if (!isTuniciousPlaylist(playlist)) {
      throw new Error('This playlist is not a Tunicious playlist');
    }
    
    return playlist;
  };

  /**
   * Updates a playlist
   */
  const updatePlaylist = async (playlistId, updates) => {
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      method: 'PUT',
      body: updates
    });
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
    
    logSpotify('DEBUG: Found track URIs for album:', albumTrackUris);
    
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
    
    logSpotify('DEBUG: Request body for removal:', JSON.stringify(requestBody, null, 2));
    
    return makeUserRequest(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      body: requestBody
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
   * Fetches album IDs and their added dates from a playlist
   * @param {string} playlistId - The Spotify playlist ID
   * @returns {Promise<Array<{id: string, addedAt: string}>>} Array of objects containing album ID and when it was added
   */
  const getPlaylistAlbumsWithDates = async (playlistId) => {
    let albumData = new Map(); // Using Map to handle duplicate albums (keep earliest date)
    let offset = 0;
    const limit = 100; // Maximum allowed by Spotify
    let total;

    do {
      const data = await makeUserRequest(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(added_at,track(album(id))),total&limit=${limit}&offset=${offset}`
      );

      data.items.forEach((item) => {
        if (item.track?.album?.id) {
          const albumId = item.track.album.id;
          // Only add if not already present (keeps earliest addition date)
          if (!albumData.has(albumId)) {
            albumData.set(albumId, {
              id: albumId,
              addedAt: item.added_at
            });
          }
        }
      });

      total = data.total;
      offset += limit;
    } while (offset < total);

    return Array.from(albumData.values());
  };

  /**
   * Fetches multiple albums in a batch
   */
  const getAlbumsBatch = async (albumIds) => {
    // Spotify allows up to 20 albums per request
    return makeUserRequest(
      `https://api.spotify.com/v1/albums?ids=${albumIds.join(',')}`
    );
  };

  /**
   * Loads albums in batches with rate limiting
   */
  const loadAlbumsBatched = async (albumIds) => {
    const batchSize = 20;
    const albums = [];
    
    for (let i = 0; i < albumIds.length; i += batchSize) {
      const batch = albumIds.slice(i, i + batchSize);
      const response = await getAlbumsBatch(batch);
      albums.push(...response.albums);
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return albums;
  };

  /**
   * Fetches an album by ID
   */
  const getAlbum = async (albumId) => {
    return makeUserRequest(`https://api.spotify.com/v1/albums/${albumId}`);
  };

  /**
   * Fetches tracks from an album
   */
  const getAlbumTracks = async (albumId, limit = 50, offset = 0) => {
    return makeUserRequest(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=${limit}&offset=${offset}`
    );
  };

  /**
   * Fetches albums by an artist
   */
  const getArtistAlbums = async (artistId, limit = 50, offset = 0) => {
    return makeUserRequest(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=${limit}&offset=${offset}`
    );
  };

  /**
   * Gets all albums from an artist (handles pagination)
   */
  const getAllArtistAlbums = async (artistId) => {
    let allAlbums = [];
    let offset = 0;
    const limit = 50;
    
    while (true) {
      const response = await getArtistAlbums(artistId, limit, offset);
      allAlbums = allAlbums.concat(response.items);
      
      if (response.items.length < limit) {
        break;
      }
      offset += limit;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return allAlbums;
  };

  /**
   * Fetches artist details
   */
  const getArtist = async (artistId) => {
    return makeUserRequest(`https://api.spotify.com/v1/artists/${artistId}`);
  };

  return {
    loading,
    error,
    makeUserRequest,
    createPlaylist,
    addTracksToPlaylist,
    addAlbumToPlaylist,
    getUserPlaylists,
    getPlaylist,
    updatePlaylist,
    getPlaylistTracks,
    getAllPlaylistTracks,
    getPlaylistAlbums,
    removeTracksFromPlaylist,
    removeAlbumFromPlaylist,
    searchAlbums,
    isTuniciousPlaylist,
    getUserTokens,
    refreshUserToken,
    ensureTokenFresh,
    checkConnectionStatus,
    getPlaylistAlbumsWithDates,
    getAlbumsBatch,
    loadAlbumsBatched,
    getAlbum,
    getAlbumTracks,
    getArtistAlbums,
    getAllArtistAlbums,
    getArtist
  };
}
