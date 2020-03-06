<template>
    <div class="flex">
        <router-link to="/" class="mr-4">Home</router-link>
        <router-link to="/about" class="mr-4">About</router-link>
        <router-link to="/artists" class="mr-4">Artists</router-link>
        <router-link to="/login" class="mr-4" v-if="!auth">Login</router-link>
        <button v-on:click="logout()" v-if="auth">Logout</button>
    </div>
</template>

<script>
export default {

  name: 'Navbar',
  props: ['auth'],
  data () {
    return {}
  },
  methods: {
    logout: function() {
        localStorage.removeItem('user-token')
        this.$parent.logout()
        this.$router.push('/login')
    }
  }
}
</script>

<style lang="css" scoped>
</style>