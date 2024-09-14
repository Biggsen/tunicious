export const Client = {
  ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
  SECRET: import.meta.env.VITE_SPOTIFY_CLIENT_SECRET,
};

export const ApiUrl = {
  playlists: "https://api.spotify.com/v1/playlists",
};

export const playlistIds = {
  new: {
    queued: "50mWTRVvyIC3lUjTJ3r5KV",
    curious: "67lIAfdpjpYSvruBVFuP9N",
    interested: "3BUpSXAvxd05UkBil8JYWe",
    great: "2tmqzXyCSHUeFWSdPF6UuC",
    excellent: "0JKPso7ACSmMc9NNWUzDQ6",
    wonderful: "6t7Ftpes0Wp2THxA4olWLC",
  },
  known: {
    queued: "3et9otGGsiXslIlfNGsZvX",
    curious: "6LPO8pVjeuK2PbhvXxmlHe",
    interested: "2YuK0rgxUgVquocFMeeVXF",
    great: "0PLm8YxaKVhjqUaOhujKzk",
    excellent: "2kNmtSF2ndUsYCOSSvcnmj",
    wonderful: "53VM2f4uc7yaGlDi1sEXYg",
  },
};
