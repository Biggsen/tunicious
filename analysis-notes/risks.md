# Top 10 Technical Risks / Tech Debt

1. **Spotify token expiry** - 1-hour disconnections mentioned in `.specstory/history/`
2. **Cache complexity** - Multiple caching layers in `src/utils/cache.js` and unified cache system
3. **API key exposure** - Firebase config keys flagged in history files
4. **Rate limiting** - Complex per-user/IP logic in `functions/src/rateLimit.js`
5. **Concurrent fetch prevention** - Race conditions in `src/composables/useUserData.js`
6. **LocalStorage quota** - Aggressive cleanup needed in `src/utils/cache.js`
7. **Pipeline ordering** - Complex playlist dependency logic in `src/composables/usePlaylistData.js`
8. **Token refresh failures** - Multiple retry mechanisms across Spotify composables
9. **CORS configuration** - Origin validation in `functions/src/cors.js`
10. **Migration scripts** - Database schema changes via `dbscripts/migrate-user-friends-fields.js`
