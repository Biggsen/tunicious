import { ref } from 'vue';
import { LastFmClient, ApiUrl } from '../constants';

export function useLastFmApi() {
  const loading = ref(false);
  const error = ref(null);

  /**
   * Makes a request to the Last.fm API
   * @param {string} method - The Last.fm API method (e.g., 'user.getinfo')
   * @param {Object} params - Additional parameters for the API call
   * @returns {Promise<Object>} The API response
   */
  const makeRequest = async (method, params = {}) => {
    try {
      loading.value = true;
      error.value = null;

      if (!LastFmClient.API_KEY) {
        throw new Error('Last.fm API key not configured');
      }

      const url = new URL(ApiUrl.lastfm);
      url.searchParams.append('method', method);
      url.searchParams.append('api_key', LastFmClient.API_KEY);
      url.searchParams.append('format', 'json');

      // Add additional parameters
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      });

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`Last.fm API error: ${response.status}`);
      }

      const data = await response.json();

      // Check for Last.fm API errors
      if (data.error) {
        throw new Error(`Last.fm API error: ${data.message}`);
      }

      return data;
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
    const params = { artist, album };
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
    const params = { artist };
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
      artist 
    });
  };

  /**
   * Gets user's scrobbles for a specific album
   * @param {string} username - The Last.fm username
   * @param {string} artist - The artist name
   * @param {string} album - The album name
   * @returns {Promise<Object>} User's album scrobble data
   */
  const getUserAlbumTracks = async (username, artist, album) => {
    return makeRequest('user.getalbumtracks', { 
      user: username, 
      artist, 
      album 
    });
  };

  /**
   * Search for albums
   * @param {string} album - The album name to search for
   * @param {number} limit - Number of results to return (default: 30)
   * @returns {Promise<Object>} Album search results
   */
  const searchAlbums = async (album, limit = 30) => {
    return makeRequest('album.search', { album, limit });
  };

  /**
   * Search for artists
   * @param {string} artist - The artist name to search for
   * @param {number} limit - Number of results to return (default: 30)
   * @returns {Promise<Object>} Artist search results
   */
  const searchArtists = async (artist, limit = 30) => {
    return makeRequest('artist.search', { artist, limit });
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
    getUserAlbumTracks,
    searchAlbums,
    searchArtists,
  };
} 