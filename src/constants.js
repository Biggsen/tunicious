export const Client = {
  ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
  // SECRET removed - now handled securely by backend
};

export const LastFmClient = {
  API_KEY: import.meta.env.PROD 
    ? import.meta.env.VITE_LASTFM_API_KEY_PROD
    : import.meta.env.VITE_LASTFM_API_KEY_DEV,
  // API_SECRET removed - now handled securely by backend
};

export const ApiUrl = {
  playlists: "https://api.spotify.com/v1/playlists",
  lastfm: "https://ws.audioscrobbler.com/2.0/",
};

export const SpotifyAuth = {
  REDIRECT_URI: import.meta.env.PROD 
    ? 'https://audiofoodie-d5b2c.web.app/spotify-callback'
    : 'http://localhost:5173/spotify-callback',
  SCOPES: [
    'playlist-modify-public',
    'playlist-modify-private', 
    'playlist-read-private'
  ].join(' ')
};
