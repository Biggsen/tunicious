<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getPlaylist } from "../utils/api";
import { useToken } from "../utils/auth";
import AlbumItem from "../components/AlbumItem.vue";

const route = useRoute();
const id = ref(route.params.id);
const { token, loading: tokenLoading, initializeToken } = useToken();
const loading = ref(false);
const error = ref(null);

const albumsCuriousIds = ref();
const albumData = ref({});
const playlistName = ref();

async function getTrackInfo(access_token) {
  const response = await fetch(
    "https://api.spotify.com/v1/tracks/4cOdK2wGLETKBW3PvgPWqT",
    {
      method: "GET",
      headers: { Authorization: "Bearer " + access_token },
    }
  );

  return await response.json();
}

async function getPlaylistItems(access_token) {
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${route.params.id}/tracks`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + access_token },
    }
  );

  return await response.json();
}

async function getAlbum(access_token, album_id) {
  const response = await fetch(
    `https://api.spotify.com/v1/albums/${album_id}`,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + access_token },
    }
  );

  return await response.json();
}

function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}

async function loadPlaylistData() {
  loading.value = true;
  error.value = null;
  try {
    const playlistResponse = await getPlaylist(id.value);
    playlistName.value = playlistResponse.name;

    const profile = await getPlaylistItems(token.value);
    const albumIdArray = profile.items.map((elem) => elem.track.album.id);
    albumsCuriousIds.value = albumIdArray.filter(onlyUnique);

    const albumsCurios = albumsCuriousIds.value.map(album => 
      getAlbum(token.value, album)
    );
    albumData.value = await Promise.all(albumsCurios);
  } catch (e) {
    console.error("Error loading playlist data:", e);
    error.value = "Failed to load playlist data. Please try again.";
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    await initializeToken();
    await loadPlaylistData();
  } catch (e) {
    console.error("Error in PlaylistSingle:", e);
    error.value = "An unexpected error occurred. Please try again.";
  }
});
</script>

<template>
  <p v-if="tokenLoading || loading">Loading...</p>
  <p v-else-if="error" class="error-message">{{ error }}</p>
  <main v-else>
    <h1 class="h2 pb-10">{{ playlistName }}</h1>
    <ul class="flex flex-wrap gap-4">
      <AlbumItem v-for="album in albumData" :key="album.id" :album="album" />
    </ul>
  </main>
</template>

<style scoped>
.error-message {
  color: red;
  font-weight: bold;
}
</style>
