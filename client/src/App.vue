<template>
  <div id="app">
    <Navbar loggedIn="isUserLoggedIn" />
    <div class="p-6">
      <router-view/>
    </div>
  </div>
</template>

<script>
  import Navbar from '@/components/Navbar'
  export default {
    data() {
      return {
        isUserLoggedIn: localStorage.getItem('user-token') ? true : false
      }
    },
    components: {
      Navbar
    }
  }
</script>

<style>
#app {
  font-family: Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}
</style>
