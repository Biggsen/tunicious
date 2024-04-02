<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getPlaylist } from "../utils/api";
import { getAuth } from "../utils/auth";
import PlaylistItem from "../components/PlaylistItem.vue";

const loading = ref(false);
const token = ref(localStorage.getItem("token"));
if (!token.value) {
  getAuth().then((response) => {
    console.log(response);
    token.value = response;
  });
}

const route = useRoute();
const id = ref(route.params.id);
console.log(id.value);

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
const albumData = ref({});
const playlistName = ref();

// getTrackInfo(token.value).then(profile => { console.log(profile) })
getPlaylist(id.value).then((response) => {
  playlistName.value = response.name;
});
getPlaylistItems(token.value).then((profile) => {
  console.log(profile);
  const albumIdArray = profile.items.map((elem) => {
    return elem.track.album.id;
  });
  //console.log(albumIdArray);
  albumsCuriousIds.value = albumIdArray.filter(onlyUnique);
  //console.log(albumsCuriousIds.value);
  const albumsCurios = [];
  albumsCuriousIds.value.forEach((album) => {
    //console.log(album);
    albumsCurios.push(
      getAlbum(token.value, album).then((data) => {
        return data;
      })
    );
  });
  Promise.all(albumsCurios).then((result) => {
    //console.log(typeof result);
    albumData.value = result;
    //console.log(albumData.value);
  });

  //console.log(albumData.value);
});
// getAlbum(token.value,"1x55Z0fYARLdeJVjG2UESs").then(data => {
//   album.value = data;
//   //console.log(album.href);
// })

const lastFmLink = ({ artist, album }) => {
  const lastfmRoot = "https://www.last.fm/user/biggzen/library/music";
  const artistName = artist.replace(/ /g, "+");
  const albumName = album.replace(/ /g, "+");
  const link = `${lastfmRoot}/${artistName}/${albumName}`;
  return link;
};

const displayYear = (date) => {
  return date.substring(0, 4);
};
</script>

<template>
  <p v-if="loading">Loading...</p>
  <main v-else>
    <h1 class="h2 pb-10">{{ playlistName }}</h1>
    <ul class="flex flex-wrap gap-4">
      <li
        v-for="album in albumData"
        class="bg-mindero border-2 border-delft-blue rounded-xl p-2 flex flex-col"
      >
        <img :src="album.images[1].url" alt="" class="rounded-lg" />
        <div class="p-3 w-[300px]">
          <p class="small-text text-delft-blue">
            {{ displayYear(album.release_date) }}
          </p>
          <p class="font-bold text-lg leading-5 mb-2 text-delft-blue">
            {{ album.name }}
          </p>
          <p class="text-delft-blue">
            {{ album.artists[0].name }}
          </p>
        </div>
        <div class="bg-delft-blue p-3 mt-auto rounded-lg">
          <a
            :href="
              lastFmLink({ artist: album.artists[0].name, album: album.name })
            "
            target="_blank"
            class="text-white"
            >LastFM</a
          >
        </div>
      </li>
    </ul>
  </main>
</template>
