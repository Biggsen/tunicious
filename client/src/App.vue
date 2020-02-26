<template>
  <div id="app">
    <div id="nav" class="p-6">
      <router-link to="/" class="mr-4">Home</router-link>
      <router-link to="/about" class="mr-4">About</router-link>
      <router-link to="/login">Login</router-link>
    </div>
    <div class="p-6">
      <router-view/>
    </div>
  </div>
</template>

<style>
#app {
  font-family: Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}
</style>
