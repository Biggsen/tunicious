<script setup>
import { RouterLink } from "vue-router";
import { ref } from "vue";
import { useUserData } from "@composables/useUserData";
import { useAdmin } from "@composables/useAdmin";

const { user, userData } = useUserData();
const { isAdmin } = useAdmin();
</script>

<template>
  <header class="bg-mint h-[64px] flex border-b-4 border-delft-blue">
    <div class="container mx-auto px-4 flex items-center justify-between">
      <h1
        class="text-[32px] leading-[32px] -tracking-[0.08em] italic font-black text-delft-blue"
      >
        aufoo
      </h1>
      <nav class="flex items-center gap-8">
        <ul class="flex gap-8">
          <li>
            <RouterLink to="/">Home</RouterLink>
          </li>
          <li>
            <RouterLink to="/playlists">Playlists</RouterLink>
          </li>
          <li>
            <RouterLink to="/search">Search</RouterLink>
          </li>
          <li v-if="isAdmin">
            <RouterLink to="/styleguide">Styleguide</RouterLink>
          </li>
        </ul>
        <div v-if="!user">
          <RouterLink to="/login">Login</RouterLink>
        </div>
        <div v-else>
          <RouterLink to="/account" class="text-delft-blue hover:text-raspberry hover:underline">
            {{ userData?.displayName || user.email }}
          </RouterLink>
        </div>
      </nav>
    </div>
  </header>
</template>

<style lang="scss" scoped>
a {
  @apply font-bold text-delft-blue hover:text-raspberry hover:underline;
}
</style>
