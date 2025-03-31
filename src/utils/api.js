import { Client, ApiUrl } from "../constants";

export async function getToken() {
  console.log("Client ID being used:", Client.ID);
  console.log(
    "Client Secret length:",
    Client.SECRET ? Client.SECRET.length : 0
  );

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

  const result = await response.json();
  console.log("Token response status:", response.status);
  console.log("Token response contains access_token:", !!result.access_token);
  return result;
}

export async function getPlaylist(playlistId) {
  const response = await fetch(`${ApiUrl.playlists}/${playlistId}`, {
    method: "GET",
    headers: { Authorization: "Bearer " + localStorage.getItem("token") },
  });

  return await response.json();
}

export async function getPlaylistItems(playlistId, accessToken, limit = 100, offset = 0) {
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
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

export async function getUniqueAlbumIdsFromPlaylist(playlistId, accessToken) {
  let albumIds = new Set();
  let offset = 0;
  const limit = 100; // Maximum allowed by Spotify
  let total;

  do {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(album(id))),total&limit=${limit}&offset=${offset}`,
      {
        method: "GET",
        headers: { Authorization: "Bearer " + accessToken },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    data.items.forEach((item) => {
      if (item.track && item.track.album && item.track.album.id) {
        albumIds.add(item.track.album.id);
      }
    });

    total = data.total;
    offset += limit;
  } while (offset < total);

  return Array.from(albumIds);
}

export async function getAlbumsBatch(accessToken, albumIds) {
  // Spotify allows up to 20 albums per request
  const response = await fetch(
    `https://api.spotify.com/v1/albums?ids=${albumIds.join(',')}`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + accessToken },
    }
  );

  return await response.json();
}

export async function loadAlbumsBatched(albumIds, accessToken) {
  const batchSize = 20;
  const albums = [];
  
  for (let i = 0; i < albumIds.length; i += batchSize) {
    const batch = albumIds.slice(i, i + batchSize);
    const response = await getAlbumsBatch(accessToken, batch);
    albums.push(...response.albums);
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return albums;
}

export async function getArtistAlbums(artistId, accessToken, limit = 50, offset = 0) {
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=${limit}&offset=${offset}`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch artist albums: ${response.status}`);
  }

  return await response.json();
}

export async function getArtist(artistId, accessToken) {
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch artist: ${response.status}`);
  }

  return await response.json();
}

export async function getAlbumTracks(albumId) {
  const response = await fetch(
    `https://api.spotify.com/v1/albums/${albumId}/tracks`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch album tracks: ${response.status}`);
  }

  return await response.json();
}

export async function checkTracksInPlaylists(trackIds, playlistIds) {
  // Spotify API allows checking up to 50 tracks at once
  const response = await fetch(
    `https://api.spotify.com/v1/me/tracks/contains?ids=${trackIds.join(',')}`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to check tracks: ${response.status}`);
  }

  return await response.json();
}
