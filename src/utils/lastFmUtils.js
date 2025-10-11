import { useLastFmApi } from '@composables/useLastFmApi';
import { useUserSpotifyApi } from '@composables/useUserSpotifyApi';
import { getCache, setCache } from './cache';

/**
 * Gets cached loved tracks or fetches them from Last.fm
 * @param {string} lastFmUserName - The Last.fm username
 * @returns {Promise<Array>} Array of loved tracks
 */
export async function getCachedLovedTracks(lastFmUserName) {
  if (!lastFmUserName) return [];
  
  const cacheKey = `lovedTracks_${lastFmUserName}`;
  let cached = await getCache(cacheKey);
  
  if (cached) {
    return cached;
  }
  
  // Fetch loved tracks from Last.fm
  try {
    console.log('lastFmUtils: Fetching loved tracks for user:', lastFmUserName);
    const { getUserLovedTracks } = useLastFmApi();
    let allLovedTracks = [];
    let page = 1;
    const limit = 1000;
    const maxPages = 10; // Limit to first 10,000 loved tracks for performance
    
    while (page <= maxPages) {
      console.log(`lastFmUtils: Fetching page ${page} of loved tracks`);
      const response = await getUserLovedTracks(lastFmUserName, limit, page);
      console.log('lastFmUtils: Response from getUserLovedTracks:', response);
      
      if (!response.lovedtracks) {
        console.log('lastFmUtils: No lovedtracks in response, breaking');
        break;
      }
      
      const tracks = response.lovedtracks.track || [];
      
      if (!tracks || tracks.length === 0) {
        break;
      }
      
      if (!Array.isArray(tracks)) {
        // If it's a single track, convert to array
        allLovedTracks.push(tracks);
        break;
      }
      
      allLovedTracks = [...allLovedTracks, ...tracks];
      
      // Check if we have more pages
      const totalPages = parseInt(response.lovedtracks['@attr']?.totalPages || '0');
      if (page >= totalPages || tracks.length < limit) {
        break;
      }
      
      page++;
    }
    
    // Cache the result for 24 hours
    await setCache(cacheKey, allLovedTracks);
    return allLovedTracks;
    
  } catch (error) {
    console.error('Error fetching loved tracks:', error);
    return [];
  }
}

/**
 * Gets cached album tracks or fetches them from Spotify
 * @param {string} albumId - The Spotify album ID
 * @returns {Promise<Array>} Array of album tracks
 */
export async function getCachedAlbumTracks(albumId) {
  if (!albumId) return [];
  
  const cacheKey = `albumTracks_${albumId}`;
  let cached = await getCache(cacheKey);
  
  if (cached) {
    return cached;
  }
  
  try {
    const { getAlbumTracks } = useUserSpotifyApi();
    let allTracks = [];
    let offset = 0;
    const limit = 50;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (true) {
      try {
        const response = await getAlbumTracks(albumId, limit, offset);
        allTracks = [...allTracks, ...response.items];
        
        if (response.items.length < limit) {
          break;
        }
        
        offset += limit;
        retryCount = 0;
      } catch (err) {
        if (err.status >= 500 && retryCount < maxRetries) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }
        throw err;
      }
    }
    
    // Cache the result
    await setCache(cacheKey, allTracks);
    return allTracks;
    
  } catch (error) {
    console.error('Error fetching album tracks:', error);
    return [];
  }
}

/**
 * Calculates the loved track percentage for an album
 * @param {Object} album - The album object (from Spotify)
 * @param {Array} lovedTracks - Array of loved tracks from Last.fm
 * @param {Array} albumTracks - Optional array of album tracks (will fetch if not provided)
 * @returns {Promise<Object>} Object with lovedCount, totalCount, and percentage
 */
export async function calculateLovedTrackPercentage(album, lovedTracks = [], albumTracks = null) {
  if (!album || !lovedTracks.length) {
    return { lovedCount: 0, totalCount: 0, percentage: 0 };
  }
  
  // Get album tracks if not provided
  if (!albumTracks) {
    albumTracks = await getCachedAlbumTracks(album.id);
  }
  
  if (!albumTracks.length) {
    return { lovedCount: 0, totalCount: 0, percentage: 0 };
  }
  
  const albumArtist = (album.artists?.[0]?.name || album.artistName || '').toLowerCase();
  let lovedCount = 0;
  
  albumTracks.forEach(track => {
    const trackName = track.name.toLowerCase();
    const trackArtists = track.artists?.map(artist => artist.name.toLowerCase()) || [albumArtist];
    
    // Check if any track artist matches the album artist and track name matches
    const isLoved = lovedTracks.some(lovedTrack => {
      const lovedTrackName = lovedTrack.name?.toLowerCase() || '';
      const lovedArtistName = lovedTrack.artist?.name?.toLowerCase() || '';
      
      // Match track name and artist
      return lovedTrackName === trackName && 
             (lovedArtistName === albumArtist || 
              trackArtists.some(trackArtist => trackArtist === lovedArtistName));
    });
    
    if (isLoved) {
      lovedCount++;
    }
  });
  
  const percentage = albumTracks.length > 0 ? Math.round((lovedCount / albumTracks.length) * 100) : 0;
  
  return {
    lovedCount,
    totalCount: albumTracks.length,
    percentage
  };
} 