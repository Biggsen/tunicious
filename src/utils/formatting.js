/**
 * Formats an album name with artist for display in toast notifications and other UI elements
 * @param {Object} album - The album object (must have name and artists or artistName)
 * @returns {Object} Object with parts array for structured display
 */
export function formatAlbumName(album) {
  const artistName = album?.artists?.[0]?.name || album?.artistName || 'Unknown Artist';
  return {
    parts: [
      { text: album.name, bold: true },
      { text: ' by ' },
      { text: artistName, bold: true }
    ]
  };
}

