<template>

  <div class="">
        <h1 class="text-xl font-bold mb-4">Login</h1>
        <label for="email" class="block mb-1">Email</label>
        <input
            id="email"
            type="text"
            placeholder="Email"
            name="email"
            v-model="email"
            class="border border-gray-500 rounded py-1 px-2 mb-4"
        >
        <label for="password" class="block mb-1">Password</label>
        <input
            id="password"
            type="password"
            name="password"
            v-model="password"
            class="block border border-gray-500 rounded py-1 px-2 mb-6"
        >
        <button class="inline-block bg-green-700 text-white font-bold rounded py-1 px-3 mr-6" v-on:click="login">Login</button>
        <a href="/register" class="inline-block text-indigo-500 underline">Create an account</a>
    </div>

</template>

<script>
import AuthService from '../services/AuthService'

export default {
  name: 'LoginFormComponent',
  async created() {},
  data(){
    return {
      email: '',
      password: ''
    }
  },
  methods: {
    async login() {
      const user = {
        email: this.email,
        password: this.password
      }
      AuthService.doLogin(user).then(() => {
        this.$router.push('/')
      })
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
