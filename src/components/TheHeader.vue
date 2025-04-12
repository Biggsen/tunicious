<script setup>
import { RouterLink } from "vue-router";
import { ref } from "vue";
import { useUserData } from "@composables/useUserData";

const { user, userData } = useUserData();
</script>

<template>
  <header class="bg-mint h-[64px] flex border-b-4 border-delft-blue">
    <div class="container mx-auto grid grid-cols-12 gap-5">
      <div class="flex items-center justify-between col-span-10">
        <h1
          class="text-[32px] leading-[32px] -tracking-[0.08em] italic font-black text-delft-blue"
        >
          aufoo
        </h1>
        <ul class="flex gap-6">
          <li>
            <RouterLink to="/">Home</RouterLink>
          </li>
          <li>
            <RouterLink to="/playlists">Playlists</RouterLink>
          </li>
        </ul>
      </div>
      <div class="flex items-center justify-end col-span-2">
        <div v-if="!user">
          <RouterLink to="/login">Login</RouterLink>
        </div>
        <div v-else>
          <RouterLink to="/account" class="text-delft-blue hover:text-raspberry hover:underline">
            {{ userData?.displayName || user.email }}
          </RouterLink>
        </div>
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
a {
  @apply font-bold text-delft-blue hover:text-raspberry hover:underline;
}
</style>
