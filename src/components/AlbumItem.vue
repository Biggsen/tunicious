<script setup>
const props = defineProps({
  album: Object,
});

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
  <li
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
        :href="lastFmLink({ artist: album.artists[0].name, album: album.name })"
        target="_blank"
        class="text-white"
        >LastFM</a
      >
    </div>
  </li>
</template>
