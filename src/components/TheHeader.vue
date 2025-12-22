<script setup>
import { RouterLink } from "vue-router";
import { ref } from "vue";
import { useUserData } from "@composables/useUserData";
import { useAdmin } from "@composables/useAdmin";
import { MusicalNoteIcon, MagnifyingGlassIcon, RocketLaunchIcon, UserGroupIcon } from '@heroicons/vue/24/outline';

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
              <RouterLink to="/friends" class="flex items-center gap-1">
                <UserGroupIcon class="w-4 h-4" />
                <span>Friends</span>
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
      <div v-else class="flex items-center gap-3">
        <RouterLink to="/account/profile" class="flex items-center gap-2 text-delft-blue hover:text-raspberry">
          <div class="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
            <img 
              v-if="userData?.profileImageUrl" 
              :src="userData.profileImageUrl" 
              :key="userData.profileImageUrl"
              alt="Profile picture"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full bg-delft-blue flex items-center justify-center text-mindero text-lg font-semibold">
              {{ userData?.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?' }}
            </div>
          </div>
          <span class="hidden sm:inline">{{ userData?.displayName || user.email }}</span>
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
