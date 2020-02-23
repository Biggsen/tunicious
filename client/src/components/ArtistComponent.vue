<template>
  <div>
    <h1>Artists</h1>
    <div>
      <label for="artist-name">Artist name</label><br>
      <input type="text" id="artist-name" v-model="artistName" placeholder="New artist" />
      <button v-on:click="createArtist">Create artist</button>
    </div>
    <hr>
    <p class="error" v-if="error">{{ error }}</p>
    <div>
      <div
        v-for="(artist, index) in artists"
        v-bind:item="artist"
        v-bind:index="index"
        v-bind:key="artist._id"
        >
        <p class="text">
          <span>{{ artist.name }}</span>
          <span v-on:click="deleteArtist(artist._id)"> [X]</span>
        </p>

      </div>
    </div>
  </div>

</template>

<script>
import ArtistService from '../ArtistService'

export default {
  name: 'ArtistComponent',
  data() {
    return {
      artists: [],
      error: '',
      name: ''
    }
  },
  async created() {
    try {
      this.artists = await ArtistService.getArtists()
    } catch(err) {
      this.error = err.message
    }
  },
  methods: {
    async createArtist() {
      await ArtistService.insertArtist(this.artistName)
      this.artists = await ArtistService.getArtists()
    },
    async deleteArtist(id) {
      await ArtistService.deleteArtist(id)
      this.artists = await ArtistService.getArtists()
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
