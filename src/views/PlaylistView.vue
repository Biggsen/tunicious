<script setup>
import { ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const client_id = '397d11c9d22349e7b543b88edc139613'; 
const client_secret = '475940484e3243c9ae9762994a9705dc';

async function getToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    body: new URLSearchParams({
      'grant_type': 'client_credentials',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + (btoa(`${client_id}:${client_secret}`)),
    },
  });

  return await response.json();
}

async function getTrackInfo(access_token) {
  const response = await fetch("https://api.spotify.com/v1/tracks/4cOdK2wGLETKBW3PvgPWqT", {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + access_token },
  });

  return await response.json();
}

async function getPlaylist(access_token) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${route.params.id}`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + access_token },
  });

  return await response.json();
}

async function getPlaylistItems(access_token) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${route.params.id}/tracks`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + access_token },
  });

  return await response.json();
}

async function getAlbum(access_token,album_id) {
	const response = await fetch(`https://api.spotify.com/v1/albums/${album_id}`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + access_token },
  });

  return await response.json();
}

function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}

const albumsCuriousIds = ref();
const album = ref();
const albumsCuriousData = ref({});

getToken().then(response => {
	//getTrackInfo(response.access_token).then(profile => { console.log(profile) })
  getPlaylist(response.access_token).then(profile => { console.log(profile) })
  getPlaylistItems(response.access_token).then(profile => { 
		//console.log(profile)
		const albumIdArray = profile.items.map((elem) => {
			return elem.track.album.id
		})
		//console.log(albumIdArray);
		albumsCuriousIds.value = albumIdArray.filter(onlyUnique)
		console.log(albumsCuriousIds.value);
    const albumsCurios = [];
    albumsCuriousIds.value.forEach(album => {
      console.log(album);
      albumsCurios.push(
        getAlbum(response.access_token,album).then(data => {
          return data;
        })
      )
    })
    Promise.all(albumsCurios).then(result => {
      console.log(typeof result);
      albumsCuriousData.value = result
      console.log(albumsCuriousData.value);
    });
    
    //console.log(albumsCuriousData.value);
	})
	getAlbum(response.access_token,"1x55Z0fYARLdeJVjG2UESs").then(data => {
		album.value = data;
		//console.log(album.href);
	})
});

function promiseAllProps(arrayOfObjects) {
    let datum = [];
    let promises = [];

    arrayOfObjects.forEach(function(obj, index) {
        Object.keys(obj).forEach(function(prop) {
            let val = obj[prop];
            // if it smells like a promise, lets track it
            if (val && val.then) {
                promises.push(val);
                // and keep track of where it came from
                datum.push({obj: obj, prop: prop});
            }
        });
    });

    return Promise.all(promises).then(function(results) {
        // now put all the results back in original arrayOfObjects in place of the promises
        // so now instead of promises, the actaul values are there
        results.forEach(function(val, index) {
            // get the info for this index
            let info = datum[index];
            // use that info to know which object and which property this value belongs to
            info.obj[info.prop] = val;
        });
        // make resolved value be our original (now modified) array of objects
        return arrayOfObjects;
    });
}


</script>

<template>
	<main>
        <ul>
            <li>
                <router-link to="/playlist/67lIAfdpjpYSvruBVFuP9N">New - Curious</router-link>
            </li>
            <li>
                <router-link to="/playlist/0PLm8YxaKVhjqUaOhujKzk">Know - Great</router-link>
            </li>
        </ul>
		<h1 class="text-[36px] font-chivo font-bold">New - Curious</h1>
        <ul class="flex flex-wrap gap-4">
            <li v-for="album in albumsCuriousData" class="bg-mindero rounded-xl p-2 pb-0">
                <img :src="album.images[1].url" alt="" class="rounded-lg ">
                <div class="p-3">
                    <p class="font-chivo font-bold">{{ album.artists[0].name }}</p>
                    <p class="font-chivo">{{ album.name }}</p>
                </div>
            </li>
        </ul>
	</main>
</template>