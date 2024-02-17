import { Client, ApiUrl } from "../constants";

export async function getToken() {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${Client.ID}:${Client.SECRET}`),
    },
  });

  return await response.json();
}

export async function getPlaylist({ token, playlistId }) {
  const response = await fetch(`${ApiUrl.playlists}/${playlistId}`, {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
  });

  return await response.json();
}
