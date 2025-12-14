<script setup>
import { RouterLink } from "vue-router";
import { ref } from "vue";
import { useUserData } from "@composables/useUserData";
import { useAdmin } from "@composables/useAdmin";
import { MusicalNoteIcon, MagnifyingGlassIcon, RocketLaunchIcon } from '@heroicons/vue/24/outline';

const { user, userData } = useUserData();
const { isAdmin } = useAdmin();
</script>

<template>
  <header class="bg-mint h-[64px] flex border-b-4 border-delft-blue">
    <div class="container mx-auto px-4 flex items-center justify-between">
      <div class="flex items-center gap-8">
        <RouterLink to="/" class="no-underline hover:no-underline flex items-center gap-1">
          <img src="/tunicious-logo.png" alt="Tunicious" class="-mt-0.5" />
          <span
            class="text-[32px] leading-[32px] -tracking-[0.04em] italic font-black text-delft-blue cursor-pointer hover:text-raspberry transition-colors"
          >
            Tunicious
          </span>
        </RouterLink>
        <nav class="flex items-center pt-[8px]">
          <ul class="flex gap-8">
            <li>
              <RouterLink to="/playlists" class="flex items-center gap-1">
                <MusicalNoteIcon class="w-4 h-4" />
                <span>Playlists</span>
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/search" class="flex items-center gap-1">
                <MagnifyingGlassIcon class="w-4 h-4" />
                <span>Search</span>
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/updates" class="flex items-center gap-1">
                <RocketLaunchIcon class="w-4 h-4" />
                <span>Updates</span>
              </RouterLink>
            </li>
            <li v-if="isAdmin">
              <RouterLink to="/styleguide">Styleguide</RouterLink>
            </li>
          </ul>
        </nav>
      </div>
      <div v-if="!user">
        <RouterLink to="/login">Login</RouterLink>
      </div>
      <div v-else>
        <RouterLink to="/account" class="text-delft-blue hover:text-raspberry">
          {{ userData?.displayName || user.email }}
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
a {
  @apply font-bold text-delft-blue hover:text-raspberry;
}

a.router-link-active {
  @apply text-raspberry;
}

nav a.router-link-active {
  @apply text-raspberry underline;
}

span.router-link-exact-active {
  @apply text-raspberry;
}
</style>
