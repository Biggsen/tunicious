<template>
  <div id="app">
    <img alt="Vue logo" src="./assets/logo.png">
    <ArtistComponent />
  </div>
</template>

<script>
import ArtistComponent from './components/ArtistComponent.vue'

export default {
  name: 'App',
  components: {
    ArtistComponent
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
