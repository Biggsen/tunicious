import { ref } from 'vue';
import { Client, ApiUrl } from '../constants';

export function useSpotifyApi() {
  const loading = ref(false);
  const error = ref(null);
  const token = ref(null);
  const tokenExpiry = ref(null);

  /**
   * Ensures we have a valid token, refreshing if necessary
   */
  const ensureToken = async () => {
    if (!token.value || (tokenExpiry.value && Date.now() >= tokenExpiry.value)) {
      await refreshToken();
    }
    return token.value;
  };

  /**
   * Refreshes the Spotify access token
   */
  const refreshToken = async () => {
    try {
      loading.value = true;
      error.value = null;

      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "client_credentials",
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(`${Client.ID}:${Client.SECRET}`),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh token: ${response.status}`);
      }

      const result = await response.json();
      token.value = result.access_token;
      // Set token expiry to 55 minutes (token lasts 1 hour)
      tokenExpiry.value = Date.now() + (55 * 60 * 1000);
      
      return token.value;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Makes an authenticated request to the Spotify API
   */
  const makeRequest = async (endpoint, options = {}) => {
    try {
      loading.value = true;
      error.value = null;

      const accessToken = await ensureToken();
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
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
   * Fetches a playlist by ID
   */
  const getPlaylist = async (playlistId) => {
    return makeRequest(`${ApiUrl.playlists}/${playlistId}`);
  };

  /**
   * Fetches an album by ID
   */
  const getAlbum = async (albumId) => {
    return makeRequest(`https://api.spotify.com/v1/albums/${albumId}`);
  };

  /**
   * Fetches tracks from an album
   */
  const getAlbumTracks = async (albumId, limit = 50, offset = 0) => {
    return makeRequest(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=${limit}&offset=${offset}`
    );
  };

  /**
   * Fetches unique album IDs from a playlist
   */
  const getUniqueAlbumIdsFromPlaylist = async (playlistId) => {
    let albumIds = new Set();
    let offset = 0;
    const limit = 100; // Maximum allowed by Spotify
    let total;

    do {
      const data = await makeRequest(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(album(id))),total&limit=${limit}&offset=${offset}`
      );

      data.items.forEach((item) => {
        if (item.track?.album?.id) {
          albumIds.add(item.track.album.id);
        }
      });

      total = data.total;
      offset += limit;
    } while (offset < total);

    return Array.from(albumIds);
  };

  /**
   * Fetches multiple albums in a batch
   */
  const getAlbumsBatch = async (albumIds) => {
    // Spotify allows up to 20 albums per request
    return makeRequest(
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
   * Fetches albums by an artist
   */
  const getArtistAlbums = async (artistId, limit = 50, offset = 0) => {
    return makeRequest(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=${limit}&offset=${offset}`
    );
  };

  /**
   * Fetches artist details
   */
  const getArtist = async (artistId) => {
    return makeRequest(`https://api.spotify.com/v1/artists/${artistId}`);
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
      const data = await makeRequest(
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

  return {
    loading,
    error,
    ensureToken,
    refreshToken,
    getPlaylist,
    getAlbum,
    getAlbumTracks,
    getUniqueAlbumIdsFromPlaylist,
    getAlbumsBatch,
    loadAlbumsBatched,
    getArtistAlbums,
    getArtist,
    getPlaylistAlbumsWithDates,
  };
} 