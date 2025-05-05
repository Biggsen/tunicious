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
 */
export function getRateYourMusicLink({ artist, album }) {
  if (!artist || !album) return '#';
  // Example RYM URL structure (may need adjustment for actual RYM URLs)
  const base = 'https://rateyourmusic.com/release/album';
  const artistSlug = artist.toLowerCase().replace(/ /g, "_");
  const albumSlug = album.toLowerCase().replace(/ /g, "_");
  return `${base}/${artistSlug}/${albumSlug}/`;
} 