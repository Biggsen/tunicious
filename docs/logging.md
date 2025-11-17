# Logging Documentation

This project uses a namespaced logging system built on the [`debug`](https://www.npmjs.com/package/debug) package. Logs are **disabled by default** to keep the console clean in production.

## Overview

The logging system is centralized in `src/utils/logger.js` and provides namespaced loggers for different parts of the application. This allows you to enable/disable logs for specific features or areas of the codebase.

## Available Namespaces

| Namespace | Logger Export | Use Case |
|-----------|--------------|----------|
| `app:spotify` | `logSpotify` | Spotify API calls, token management, authentication |
| `app:lastfm` | `logLastFm` | Last.fm API calls, track scrobbling, user data |
| `app:album` | `logAlbum` | Album data operations, album mappings, album search |
| `app:playlist` | `logPlaylist` | Playlist management, playlist operations, playlist data |
| `app:player` | `logPlayer` | Spotify Web Playback SDK, track playback, queue management |
| `app:user` | `logUser` | User data operations, user profile management |
| `app:auth` | `logAuth` | Authentication flows, login/logout operations |
| `app:cache` | `logCache` | Cache operations, localStorage management |
| `app:firebase` | `logFirebase` | Firestore operations, Firebase-specific logs |
| `app:api` | `logApi` | General API calls, backend API operations |
| `app:debug` | `logDebug` | General debug logs, utility functions, fuzzy matching |

## Enabling Logs

### In Browser Console

To enable all logs:
```javascript
localStorage.debug = 'app:*';
```

To enable specific namespaces:
```javascript
// Enable only Spotify and playlist logs
localStorage.debug = 'app:spotify,app:playlist';

// Enable all album-related logs
localStorage.debug = 'app:album';

// Enable multiple specific namespaces
localStorage.debug = 'app:spotify,app:player,app:cache';
```

### Programmatically

You can also enable/disable logs programmatically using the helper functions:

```javascript
import { enableDebug, disableDebug } from '@utils/logger';

// Enable all logs
enableDebug('app:*');

// Enable specific namespaces
enableDebug('app:spotify,app:playlist');

// Disable all logs
disableDebug();
```

### Disabling Logs

To disable logs:
```javascript
localStorage.removeItem('debug');
```

Or programmatically:
```javascript
import { disableDebug } from '@utils/logger';
disableDebug();
```

## Usage in Code

### Import the Logger

```javascript
import { logSpotify } from '@utils/logger';
```

### Use the Logger

```javascript
// Simple log
logSpotify('Fetching user playlists');

// Log with data
logSpotify('Token refreshed successfully', { expiresAt: new Date() });

// Error logging
logSpotify('Token refresh failed:', error);
```

### Example: Spotify API Call

```javascript
import { logSpotify } from '@utils/logger';

const fetchPlaylist = async (playlistId) => {
  logSpotify('Fetching playlist:', playlistId);
  
  try {
    const response = await makeUserRequest(`/playlists/${playlistId}`);
    logSpotify('Playlist fetched successfully:', response);
    return response;
  } catch (error) {
    logSpotify('Error fetching playlist:', error);
    throw error;
  }
};
```

## Best Practices

1. **Use appropriate namespaces**: Choose the logger that matches the context of your code
   - Spotify API calls → `logSpotify`
   - Playlist operations → `logPlaylist`
   - Album operations → `logAlbum`
   - General debugging → `logDebug`

2. **Include context**: Add relevant information to your logs
   ```javascript
   // Good
   logPlaylist('Adding album to playlist', { albumId, playlistId });
   
   // Less helpful
   logPlaylist('Adding album');
   ```

3. **Log errors with details**: Include error objects when logging errors
   ```javascript
   // Good
   logSpotify('Token refresh failed:', error);
   
   // Less helpful
   logSpotify('Token refresh failed');
   ```

4. **Don't log sensitive data**: Avoid logging passwords, tokens, or other sensitive information
   ```javascript
   // Bad
   logAuth('User logged in with password:', password);
   
   // Good
   logAuth('User logged in:', { email: user.email });
   ```

## Debug Package Features

The `debug` package supports wildcards and patterns:

- `app:*` - Enable all app namespaces
- `app:spotify*` - Enable all Spotify-related namespaces (if you add more)
- `-app:cache` - Disable specific namespace when using wildcards
  ```javascript
  localStorage.debug = 'app:*,-app:cache'; // All logs except cache
  ```

## Default Behavior

- **Logs are disabled by default** - The logger clears `localStorage.debug` on initialization
- **No console pollution** - Production builds won't show debug logs unless explicitly enabled
- **Easy debugging** - Developers can enable specific namespaces when debugging issues

## Troubleshooting

### Logs not showing?

1. Check that you've enabled the namespace:
   ```javascript
   localStorage.debug = 'app:spotify';
   ```

2. Refresh the page after setting `localStorage.debug`

3. Check the browser console - logs appear with namespace prefixes like `app:spotify`

### Too many logs?

Use specific namespaces instead of wildcards:
```javascript
// Instead of
localStorage.debug = 'app:*';

// Use
localStorage.debug = 'app:spotify,app:playlist';
```

### Need to see all logs temporarily?

```javascript
localStorage.debug = 'app:*';
// Debug your issue
localStorage.removeItem('debug'); // Clean up when done
```

