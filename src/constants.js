export const Client = {
  ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
  SECRET: import.meta.env.VITE_SPOTIFY_CLIENT_SECRET,
};

export const ApiUrl = {
  playlists: "https://api.spotify.com/v1/playlists",
};

export const SpotifyAuth = {
  REDIRECT_URI: import.meta.env.PROD 
    ? 'https://yourdomain.com/spotify-callback'
    : 'http://localhost:5173/spotify-callback',
  SCOPES: [
    'playlist-modify-public',
    'playlist-modify-private', 
    'playlist-read-private'
  ].join(' ')
};
