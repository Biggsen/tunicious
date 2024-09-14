<script setup>
import { ref } from "vue";
import { useRoute } from "vue-router";
import { getPlaylist } from "../utils/api";
import { getAuth } from "../utils/auth";
import PlaylistItem from "../components/PlaylistItem.vue";
import { playlistIds } from "../constants";

const loading = ref(false);
const token = ref(localStorage.getItem("token"));
if (!token.value) {
  getAuth().then((response) => {
    console.log(response);
    token.value = response;
  });
}

const route = useRoute();

const playlistNewQueued = ref();
const playlistNewCurious = ref();
const playlistNewInterested = ref();
const playlistNewGreat = ref();
const playlistNewExcellent = ref();
const playlistNewWonderful = ref();
const playlistKnownQueued = ref();
const playlistKnownCurious = ref();
const playlistKnownInterested = ref();
const playlistKnownGreat = ref();
const playlistKnownExcellent = ref();
const playlistKnownWonderful = ref();

getPlaylist(playlistIds.new.queued).then((response) => {
  playlistNewQueued.value = response;
});

getPlaylist(playlistIds.new.curious).then((response) => {
  playlistNewCurious.value = response;
});

getPlaylist(playlistIds.new.interested).then((response) => {
  playlistNewInterested.value = response;
});

getPlaylist(playlistIds.new.great).then((response) => {
  playlistNewGreat.value = response;
});

getPlaylist(playlistIds.new.excellent).then((response) => {
  playlistNewExcellent.value = response;
});

getPlaylist(playlistIds.new.wonderful).then((response) => {
  playlistNewWonderful.value = response;
});

getPlaylist(playlistIds.known.queued).then((r) => {
  playlistKnownQueued.value = r;
});

getPlaylist(playlistIds.known.curious).then((response) => {
  playlistKnownCurious.value = response;
});

getPlaylist(playlistIds.known.interested).then((response) => {
  playlistKnownInterested.value = response;
});

getPlaylist(playlistIds.known.great).then((response) => {
  playlistKnownGreat.value = response;
});

getPlaylist(playlistIds.known.excellent).then((response) => {
  playlistKnownExcellent.value = response;
});

getPlaylist(playlistIds.known.wonderful).then((response) => {
  playlistKnownWonderful.value = response;
});

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

const albumsCuriousIds = ref();
const album = ref();
const albumsCuriousData = ref({});
</script>

<template>
  <p v-if="loading">Loading...</p>
  <main v-else>
    <h1 class="h2 pb-10">Playlists</h1>
    <div class="flex gap-40">
      <ul class="flex flex-col gap-4">
        <PlaylistItem :playlist="playlistNewQueued" />
        <PlaylistItem :playlist="playlistNewCurious" />
        <PlaylistItem :playlist="playlistNewInterested" />
        <PlaylistItem :playlist="playlistNewGreat" />
        <PlaylistItem :playlist="playlistNewExcellent" />
        <PlaylistItem :playlist="playlistNewWonderful" />
      </ul>
      <ul class="flex flex-col gap-4">
        <PlaylistItem :playlist="playlistKnownQueued" />
        <PlaylistItem :playlist="playlistKnownCurious" />
        <PlaylistItem :playlist="playlistKnownInterested" />
        <PlaylistItem :playlist="playlistKnownGreat" />
        <PlaylistItem :playlist="playlistKnownExcellent" />
        <PlaylistItem :playlist="playlistKnownWonderful" />
      </ul>
    </div>
  </main>
</template>
