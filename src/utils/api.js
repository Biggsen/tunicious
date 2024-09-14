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

export async function getPlaylist(playlistId) {
  const response = await fetch(`${ApiUrl.playlists}/${playlistId}`, {
    method: "GET",
    headers: { Authorization: "Bearer " + localStorage.getItem("token") },
  });

  return await response.json();
}

export async function getPlaylistItems(playlistId, accessToken) {
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + accessToken },
    }
  );

  return await response.json();
}

export async function getAlbum(accessToken, album_id) {
  const response = await fetch(
    `https://api.spotify.com/v1/albums/${album_id}`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + accessToken },
    }
  );

  return await response.json();
}
