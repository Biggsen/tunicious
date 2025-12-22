/**
 * Generate a Last.fm album link for a user.
 */
export function getLastFmLink({ lastFmUserName, artist, album }) {
  if (!lastFmUserName || !artist || !album) return '#';
  const lastfmRoot = `https://www.last.fm/user/${lastFmUserName}/library/music`;
  const artistName = artist.replace(/ /g, "+");
  const albumName = album.replace(/ /g, "+");
  return `${lastfmRoot}/${artistName}/${albumName}`;
}

/**
 * Generate a RateYourMusic album link.
 * @param {Object} params - Parameters for generating the link
 * @param {string} params.artist - Artist name (used if rymLink not provided)
 * @param {string} params.album - Album name (used if rymLink not provided)
 * @param {string} [params.rymLink] - Optional stored RYM link (takes priority if provided)
 * @returns {string} RYM link URL
 */
export function getRateYourMusicLink({ artist, album, rymLink }) {
  // If a stored RYM link is provided, use it
  if (rymLink) {
    return rymLink;
  }
  
  // Otherwise, auto-generate from artist and album names
  if (!artist || !album) return '#';
  const base = 'https://rateyourmusic.com/release/album';
  const artistSlug = artist.toLowerCase().replace(/ /g, "-");
  const albumSlug = album.toLowerCase().replace(/ /g, "-");
  return `${base}/${artistSlug}/${albumSlug}/`;
} 