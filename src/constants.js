export const Client = {
  ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
  // SECRET removed - now handled securely by backend
};

export const LastFmClient = {
  // API_KEY is only used for OAuth URL construction (getAuthUrl)
  // This is acceptable as API keys in OAuth URLs are public by design
  // All actual API calls now go through the backend to protect the key
  API_KEY: import.meta.env.PROD 
    ? import.meta.env.VITE_LASTFM_API_KEY_PROD
    : import.meta.env.VITE_LASTFM_API_KEY_DEV,
  // API_SECRET removed - now handled securely by backend
};

export const ApiUrl = {
  playlists: "https://api.spotify.com/v1/playlists",
  // lastfm URL removed - all Last.fm API calls now go through backend
};

export const SpotifyAuth = {
  REDIRECT_URI: import.meta.env.PROD 
    ? 'https://www.tunicious.com/spotify-callback'
    : 'http://127.0.0.1:5173/spotify-callback',
  SCOPES: [
    'playlist-modify-public',
    'playlist-modify-private', 
    'playlist-read-private',
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ')
};

export const TUNICIOUS_TAG = '[Tunicious]';