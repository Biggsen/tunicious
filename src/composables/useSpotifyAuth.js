import { Client, SpotifyAuth } from '@/constants';

export function useSpotifyAuth() {
  const initiateSpotifyLogin = () => {
    // Generate a random state parameter for CSRF protection
    const state = crypto.randomUUID();
    
    // Store state in sessionStorage to validate on callback
    sessionStorage.setItem('spotify_oauth_state', state);
    
    const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
      client_id: Client.ID,
      response_type: 'code',
      redirect_uri: SpotifyAuth.REDIRECT_URI,
      scope: SpotifyAuth.SCOPES,
      state: state,
      show_dialog: 'true'
    })}`;

    window.location.href = authUrl;
  };

  return {
    initiateSpotifyLogin
  };
}
