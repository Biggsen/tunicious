<template>
    <div class="flex">
        <router-link to="/" class="mr-4">Home</router-link>
        <router-link to="/about" class="mr-4">About</router-link>
        <router-link to="/login" v-if="!loggedIn">Login</router-link>
        <p v-if="loggedIn">Logged in</p>
        <button v-on:click="logout()" v-if="loggedIn">Logout</button>
    </div>
</template>

<script>
export default {

  name: 'Navbar',
  props: ['loggedIn'],
  data () {
    return {}
  },
  methods: {
    logout: function() {
        localStorage.removeItem('user-token')
        this.$router.push('/login')
    }
  }
}
</script>

<style lang="css" scoped>
</style>