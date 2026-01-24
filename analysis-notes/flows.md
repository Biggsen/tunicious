# Critical Runtime Flow

1. User authentication via Firebase Auth (`src/composables/useAuth.js`)
2. User data loading with Spotify connection check (`src/composables/useUserData.js`)
3. Onboarding flow if incomplete (`src/composables/useOnboarding.js`)
4. Spotify token refresh cycle (`src/composables/useUserSpotifyApi.js`)
5. Unified track cache loading (`src/composables/useUnifiedTrackCache.js`)
6. API calls proxied through Firebase Functions (`functions/src/`)
7. Rate limiting per user/IP (`functions/src/rateLimit.js`)
8. Playlist pipeline processing (`src/composables/usePlaylistData.js`)
