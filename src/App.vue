<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useCurrentUser } from 'vuefire'
const user = useCurrentUser()
</script>

<template>
  <RouterView />
</template>

<style scoped>
</style>
