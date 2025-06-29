# Last.fm API Setup

This guide will help you set up the Last.fm API integration for AudioFoodie.

## Getting Last.fm API Credentials

1. **Create a Last.fm Account**
   - If you don't have one, sign up at [https://www.last.fm/join](https://www.last.fm/join)

2. **Apply for API Access**
   - Go to [https://www.last.fm/api/account/create](https://www.last.fm/api/account/create)
   - Fill out the application form:
     - **Application name**: AudioFoodie (or your preferred name)
     - **Application description**: Music discovery and playlist management application
     - **Application homepage URL**: Your app's URL (can be localhost for development)
     - **Callback URL**: Not required for this integration
   - Submit the application

3. **Get Your API Key and Secret**
   - Once approved, you'll receive:
     - **API Key**: Used for all API requests
     - **Shared Secret**: Used for authenticated requests (optional for read-only operations)

## Environment Configuration

Add your Last.fm API credentials to your environment variables:

```bash
# Add these to your .env file
VITE_LASTFM_API_KEY=your_api_key_here
VITE_LASTFM_API_SECRET=your_shared_secret_here
```

**Note**: The API secret is optional if you're only making read-only requests (which is what the current integration does).

## Testing the Integration

1. **Set your Last.fm username** in your account settings
2. **Visit the Account page** - you should see your Last.fm stats if everything is configured correctly
3. **Check the browser console** for any error messages if data doesn't load

## Available Last.fm API Methods

The `useLastFmApi` composable provides the following methods:

### User Data
- `getUserInfo(username)` - Get user profile information
- `getUserRecentTracks(username, limit)` - Get recently played tracks
- `getUserTopAlbums(username, period, limit)` - Get top albums for a time period
- `getUserTopArtists(username, period, limit)` - Get top artists for a time period

### Music Data
- `getAlbumInfo(artist, album, username?)` - Get album information
- `getArtistInfo(artist, username?)` - Get artist information
- `getUserAlbumTracks(username, artist, album)` - Get user's plays for a specific album
- `getUserArtistTracks(username, artist)` - Get user's plays for a specific artist

### Search
- `searchAlbums(album, limit)` - Search for albums
- `searchArtists(artist, limit)` - Search for artists

## Usage Examples

### Basic Usage
```javascript
import { useLastFmApi } from '@/composables/useLastFmApi';

const { getUserTopAlbums, loading, error } = useLastFmApi();

// Get user's top albums from the past month
const topAlbums = await getUserTopAlbums('username', '1month', 10);
```

### Component Integration
```vue
<script setup>
import { useLastFmApi } from '@/composables/useLastFmApi';
import { ref, onMounted } from 'vue';

const { getUserRecentTracks } = useLastFmApi();
const recentTracks = ref([]);

onMounted(async () => {
  try {
    const data = await getUserRecentTracks('username', 5);
    recentTracks.value = data.recenttracks.track;
  } catch (err) {
    console.error('Failed to fetch recent tracks:', err);
  }
});
</script>
```

## Time Periods

For methods that accept a `period` parameter, use these values:
- `overall` - All time
- `7day` - Past 7 days
- `1month` - Past month
- `3month` - Past 3 months
- `6month` - Past 6 months
- `12month` - Past 12 months

## Rate Limiting

Last.fm has rate limits on their API:
- **5 requests per second** per API key
- **Maximum of 1000 requests per hour** per API key

The composable includes basic error handling, but you may want to implement additional rate limiting or request queuing for high-volume applications.

## Troubleshooting

### Common Issues

1. **"API key not configured" error**
   - Check that `VITE_LASTFM_API_KEY` is set in your environment variables
   - Restart your development server after adding environment variables

2. **"User not found" error**
   - Verify the Last.fm username is correct and the profile is public
   - Check that the user has scrobbled tracks to Last.fm

3. **CORS errors**
   - Last.fm API supports CORS, so this shouldn't be an issue
   - If you encounter CORS errors, check your API key is valid

4. **Empty data returned**
   - Some users may have private profiles or no scrobbling history
   - Check the Last.fm user's privacy settings

### API Response Examples

**User Info Response:**
```json
{
  "user": {
    "name": "username",
    "playcount": "123456",
    "registered": {
      "unixtime": "1234567890"
    },
    "image": [
      {"#text": "url", "size": "small"},
      {"#text": "url", "size": "medium"},
      {"#text": "url", "size": "large"}
    ]
  }
}
```

**Recent Tracks Response:**
```json
{
  "recenttracks": {
    "track": [
      {
        "name": "Track Name",
        "artist": {"#text": "Artist Name"},
        "album": {"#text": "Album Name"},
        "image": [...],
        "date": {"uts": "1234567890"}
      }
    ]
  }
}
```

## Next Steps

- **Enhanced Album Integration**: Show Last.fm play counts on album pages
- **Music Discovery**: Use Last.fm similar artists/recommendations
- **Social Features**: Compare listening habits with friends
- **Scrobbling**: Add write access to scrobble plays to Last.fm (requires authentication) 