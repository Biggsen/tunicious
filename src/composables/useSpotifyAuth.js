import { Client, SpotifyAuth } from '@/constants';

export function useSpotifyAuth() {
  const initiateSpotifyLogin = () => {
    const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
      client_id: Client.ID,
      response_type: 'code',
      redirect_uri: SpotifyAuth.REDIRECT_URI,
      scope: SpotifyAuth.SCOPES,
      show_dialog: 'true'
    })}`;

    window.location.href = authUrl;
  };

  return {
    initiateSpotifyLogin
  };
}
