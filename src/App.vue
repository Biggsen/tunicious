<template>
  <div id="app">
    <Navbar :auth="authenticated" />
    <div class="p-6">
      <router-view @authenticated="setAuthenticated"/>
    </div>
  </div>
</template>

<script>
  import Navbar from '@/components/Navbar'
  export default {
    data() {
      return {
        authenticated: false,
        isUserLoggedIn: localStorage.getItem('user-token') ? true : false
      }
    },
    components: {
      Navbar
    },
    methods: {
        setAuthenticated(status) {
            this.authenticated = status;
        },
        logout() {
            this.authenticated = false;
        }
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
