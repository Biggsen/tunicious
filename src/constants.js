export const Client = {
  ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
  SECRET: import.meta.env.VITE_SPOTIFY_CLIENT_SECRET,
};

export const LastFmClient = {
  API_KEY: import.meta.env.VITE_LASTFM_API_KEY,
  API_SECRET: import.meta.env.VITE_LASTFM_API_SECRET,
};

export const ApiUrl = {
  playlists: "https://api.spotify.com/v1/playlists",
  lastfm: "https://ws.audioscrobbler.com/2.0/",
};
