import { ref } from 'vue';
import { LastFmClient } from '../constants';
import { useBackendApi } from './useBackendApi';
import { logLastFm } from '@utils/logger';

export function useLastFmApi() {
  const loading = ref(false);
  const error = ref(null);
  const { lastfmApiCall } = useBackendApi();

  /**
   * Makes a request to the Last.fm API
   * All requests now go through the backend to protect the API key
   * @param {string} method - The Last.fm API method (e.g., 'user.getinfo')
   * @param {Object} params - Additional parameters for the API call
   * @returns {Promise<Object>} The API response
   */
  const makeRequest = async (method, params = {}) => {
    try {
      loading.value = true;
      error.value = null;

      // All Last.fm API calls now go through the backend to protect the API key
      logLastFm('useLastFmApi: Making API call via backend:', method);
      return await lastfmApiCall(method, params);
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Gets user information from Last.fm
   * @param {string} username - The Last.fm username
   * @returns {Promise<Object>} User information
   */
  const getUserInfo = async (username) => {
    return makeRequest('user.getinfo', { user: username });
  };

  /**
   * Gets user's top albums
   * @param {string} username - The Last.fm username
   * @param {string} period - Time period (overall, 7day, 1month, 3month, 6month, 12month)
   * @param {number} limit - Number of results to return (default: 50)
   * @returns {Promise<Object>} Top albums data
   */
  const getUserTopAlbums = async (username, period = 'overall', limit = 50) => {
    return makeRequest('user.gettopalbums', { 
      user: username, 
      period, 
      limit 
    });
  };

  /**
   * Gets user's top artists
   * @param {string} username - The Last.fm username
   * @param {string} period - Time period (overall, 7day, 1month, 3month, 6month, 12month)
   * @param {number} limit - Number of results to return (default: 50)
   * @returns {Promise<Object>} Top artists data
   */
  const getUserTopArtists = async (username, period = 'overall', limit = 50) => {
    return makeRequest('user.gettopartists', { 
      user: username, 
      period, 
      limit 
    });
  };

  /**
   * Gets user's recent tracks
   * @param {string} username - The Last.fm username
   * @param {number} limit - Number of results to return (default: 50)
   * @param {number} from - Beginning timestamp of a range (optional)
   * @param {number} to - End timestamp of a range (optional)
   * @returns {Promise<Object>} Recent tracks data
   */
  const getUserRecentTracks = async (username, limit = 50, from = null, to = null) => {
    const params = { user: username, limit };
    if (from) params.from = from;
    if (to) params.to = to;
    
    return makeRequest('user.getrecenttracks', params);
  };

  /**
   * Gets album information
   * @param {string} artist - The artist name
   * @param {string} album - The album name
   * @param {string} username - The Last.fm username (optional, for user-specific data)
   * @returns {Promise<Object>} Album information
   */
  const getAlbumInfo = async (artist, album, username = null) => {
    // Manually encode artist and album to ensure proper double-encoding for Last.fm
    const params = { 
      artist: encodeURIComponent(artist), 
      album: encodeURIComponent(album), 
      autocorrect: '1' 
    };
    if (username) params.username = username;
    
    return makeRequest('album.getinfo', params);
  };

  /**
   * Gets artist information
   * @param {string} artist - The artist name
   * @param {string} username - The Last.fm username (optional, for user-specific data)
   * @returns {Promise<Object>} Artist information
   */
  const getArtistInfo = async (artist, username = null) => {
    // Manually encode artist to ensure proper double-encoding for Last.fm
    const params = { artist: encodeURIComponent(artist), autocorrect: '1' };
    if (username) params.username = username;
    
    return makeRequest('artist.getinfo', params);
  };

  /**
   * Gets user's library info for a specific artist
   * @param {string} username - The Last.fm username
   * @param {string} artist - The artist name
   * @returns {Promise<Object>} User's artist library data
   */
  const getUserArtistTracks = async (username, artist) => {
    return makeRequest('user.getartisttracks', { 
      user: username, 
      artist: encodeURIComponent(artist)
    });
  };

  /**
   * Gets track information including user playcount
   * @param {string} track - The track name
   * @param {string} artist - The artist name
   * @param {string} username - The Last.fm username (optional, for user-specific data)
   * @returns {Promise<Object>} Track information
   */
  const getTrackInfo = async (track, artist, username = null) => {
    // Manually encode track and artist to ensure proper double-encoding for Last.fm
    const params = { 
      track: encodeURIComponent(track), 
      artist: encodeURIComponent(artist), 
      autocorrect: '1' 
    };
    if (username) params.username = username;
    
    return makeRequest('track.getinfo', params);
  };

  /**
   * Search for albums
   * @param {string} album - The album name to search for
   * @param {number} limit - Number of results to return (default: 30)
   * @returns {Promise<Object>} Album search results
   */
  const searchAlbums = async (album, limit = 30) => {
    return makeRequest('album.search', { album: encodeURIComponent(album), limit });
  };

  /**
   * Search for artists
   * @param {string} artist - The artist name to search for
   * @param {number} limit - Number of results to return (default: 30)
   * @returns {Promise<Object>} Artist search results
   */
  const searchArtists = async (artist, limit = 30) => {
    return makeRequest('artist.search', { artist: encodeURIComponent(artist), limit });
  };

  /**
   * Gets user's loved tracks
   * @param {string} username - The Last.fm username
   * @param {number} limit - Number of results to return (default: 50, max: 1000)
   * @param {number} page - Page number to fetch (default: 1)
   * @returns {Promise<Object>} User's loved tracks data
   */
  const getUserLovedTracks = async (username, limit = 50, page = 1) => {
    return makeRequest('user.getlovedtracks', { 
      user: username, 
      limit, 
      page 
    });
  };

  /**
   * Love a track on Last.fm
   * @param {string} trackName - The name of the track
   * @param {string} artistName - The name of the artist
   * @param {string} sessionKey - User's Last.fm session key
   * @returns {Promise<Object>} API response
   */
  const loveTrack = async (trackName, artistName, sessionKey) => {
    return makeRequest('track.love', {
      track: trackName,
      artist: artistName,
      session_key: sessionKey
    });
  };

  /**
   * Unlove a track on Last.fm
   * @param {string} trackName - The name of the track
   * @param {string} artistName - The name of the artist
   * @param {string} sessionKey - User's Last.fm session key
   * @returns {Promise<Object>} API response
   */
  const unloveTrack = async (trackName, artistName, sessionKey) => {
    return makeRequest('track.unlove', {
      track: trackName,
      artist: artistName,
      session_key: sessionKey
    });
  };

  /**
   * Validate if a Last.fm session is still valid
   * @param {string} sessionKey - User's Last.fm session key
   * @returns {Promise<Object>} Validation result
   */
  const validateSession = async (sessionKey) => {
    try {
      // Try to get user info using the session key to validate it
      const result = await makeRequest('user.getinfo', { 
        sk: sessionKey 
      });
      return {
        valid: true,
        username: result.user?.name,
        message: 'Session is valid'
      };
    } catch (error) {
      return {
        valid: false,
        username: null,
        message: error.message || 'Session validation failed'
      };
    }
  };

  /**
   * Get the Last.fm authorization URL
   * Note: The API key in OAuth URLs is public and acceptable for OAuth flows
   * @param {string} callbackUrl - The callback URL for after authorization
   * @returns {string} The authorization URL
   */
  const getAuthUrl = (callbackUrl) => {
    // Note: API key in OAuth URLs is public and acceptable
    // This is different from using it for API calls, which is now done via backend
    if (!LastFmClient.API_KEY) {
      throw new Error('Last.fm API key not configured');
    }

    const params = new URLSearchParams({
      api_key: LastFmClient.API_KEY,
      cb: callbackUrl
    });

    return `https://www.last.fm/api/auth?${params.toString()}`;
  };

  return {
    loading,
    error,
    makeRequest,
    getUserInfo,
    getUserTopAlbums,
    getUserTopArtists,
    getUserRecentTracks,
    getAlbumInfo,
    getArtistInfo,
    getUserArtistTracks,
    getTrackInfo,
    searchAlbums,
    searchArtists,
    getUserLovedTracks,
    loveTrack,
    unloveTrack,
    validateSession,
    getAuthUrl,
  };
} 