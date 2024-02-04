<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useCurrentUser } from 'vuefire'
const user = useCurrentUser()
</script>

<template>
  <ul class="flex gap-4">
    <li>
      <RouterLink to="/">Home</RouterLink>
    </li>
    <li>
      <RouterLink to="/playlist">Playlists</RouterLink>
    </li>
  </ul>
  <RouterView />
</template>

<style scoped>
</style>
