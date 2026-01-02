<script setup>
import { RouterLink } from "vue-router";
import { ref } from "vue";
import { useUserData } from "@composables/useUserData";
import { useAdmin } from "@composables/useAdmin";
import { 
  MusicalNoteIcon, 
  MagnifyingGlassIcon, 
  RocketLaunchIcon, 
  UserGroupIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/vue/24/outline';

const { user, userData } = useUserData();
const { isAdmin } = useAdmin();
const isMobileMenuOpen = ref(false);

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false;
};
</script>

<template>
  <header class="bg-mint h-[64px] flex border-b-4 border-delft-blue relative z-50">
    <div class="container mx-auto px-4 flex items-center justify-between w-full">
      <div class="flex items-center gap-4 md:gap-8">
        <RouterLink to="/" class="no-underline hover:no-underline flex items-center gap-1" @click="closeMobileMenu">
          <img src="/tunicious-logo.png" alt="Tunicious" class="-mt-0.5" />
          <span
            class="text-[32px] leading-[32px] -tracking-[0.04em] italic font-black text-delft-blue cursor-pointer hover:text-raspberry transition-colors"
          >
            Tunicious
          </span>
        </RouterLink>
        
        <!-- Desktop Navigation -->
        <nav class="hidden md:flex items-center pt-[8px]">
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

      <div class="flex items-center gap-3">
        <!-- Desktop User Section -->
        <div v-if="!user" class="hidden md:block">
          <RouterLink to="/login">Login</RouterLink>
        </div>
        <div v-else class="hidden md:flex items-center gap-3">
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
            <span>{{ userData?.displayName || user.email }}</span>
          </RouterLink>
        </div>

        <!-- Mobile Menu Button -->
        <button
          @click="toggleMobileMenu"
          class="md:hidden p-2 text-delft-blue hover:text-raspberry transition-colors"
          aria-label="Toggle mobile menu"
        >
          <Bars3Icon v-if="!isMobileMenuOpen" class="w-6 h-6" />
          <XMarkIcon v-else class="w-6 h-6" />
        </button>
      </div>
    </div>

    <!-- Mobile Menu Overlay -->
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-300"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isMobileMenuOpen"
        class="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
        @click="closeMobileMenu"
      ></div>
    </Transition>

    <!-- Mobile Menu Drawer -->
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-300 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <nav
        v-if="isMobileMenuOpen"
        class="fixed top-0 right-0 h-full w-80 bg-mint border-l-4 border-delft-blue z-50 md:hidden shadow-2xl overflow-y-auto"
      >
        <div class="flex flex-col h-full">
          <!-- Mobile Menu Header -->
          <div class="flex items-center justify-between px-4 h-16 flex-shrink-0 border-b-4 border-delft-blue" style="height: 64px;">
            <h2 class="text-xl font-black text-delft-blue">Menu</h2>
            <button
              @click="closeMobileMenu"
              class="p-2 text-delft-blue hover:text-raspberry transition-colors"
              aria-label="Close menu"
            >
              <XMarkIcon class="w-6 h-6" />
            </button>
          </div>

          <!-- Mobile Navigation Links -->
          <div class="flex-1 p-4">
            <ul class="pt-2">
              <li>
                <RouterLink
                  to="/playlists"
                  class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-celadon transition-colors"
                  @click="closeMobileMenu"
                >
                  <MusicalNoteIcon class="w-6 h-6" />
                  <span>Playlists</span>
                </RouterLink>
              </li>
              <li>
                <RouterLink
                  to="/search"
                  class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-celadon transition-colors"
                  @click="closeMobileMenu"
                >
                  <MagnifyingGlassIcon class="w-6 h-6" />
                  <span>Search</span>
                </RouterLink>
              </li>
              <li>
                <RouterLink
                  to="/friends"
                  class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-celadon transition-colors"
                  @click="closeMobileMenu"
                >
                  <UserGroupIcon class="w-6 h-6" />
                  <span>Friends</span>
                </RouterLink>
              </li>
              <li>
                <RouterLink
                  to="/updates"
                  class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-celadon transition-colors"
                  @click="closeMobileMenu"
                >
                  <RocketLaunchIcon class="w-6 h-6" />
                  <span>Updates</span>
                </RouterLink>
              </li>
              <li v-if="isAdmin">
                <RouterLink
                  to="/styleguide"
                  class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-celadon transition-colors"
                  @click="closeMobileMenu"
                >
                  <span>Styleguide</span>
                </RouterLink>
              </li>
            </ul>
          </div>

          <!-- Mobile User Section -->
          <div class="p-4">
            <div v-if="!user">
              <RouterLink
                to="/login"
                class="flex items-center justify-center w-full px-4 py-2 rounded-lg bg-delft-blue text-mindero hover:bg-raspberry transition-colors duration-200 font-medium min-h-[2.5rem]"
                @click="closeMobileMenu"
              >
                Login
              </RouterLink>
            </div>
            <div v-else>
              <RouterLink
                to="/account/profile"
                class="flex items-center gap-3 p-4 rounded-lg hover:bg-celadon transition-colors"
                @click="closeMobileMenu"
              >
                <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
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
                <div class="flex flex-col">
                  <span class="font-bold text-delft-blue">{{ userData?.displayName || user.email }}</span>
                  <span class="text-sm text-delft-blue opacity-75">View Profile</span>
                </div>
              </RouterLink>
            </div>
          </div>
        </div>
      </nav>
    </Transition>
  </header>
</template>

<style lang="scss" scoped>
nav ul a {
  @apply font-bold text-delft-blue hover:text-raspberry;
}

nav ul a.router-link-active {
  @apply text-raspberry underline;
}

span.router-link-exact-active {
  @apply text-raspberry;
}

/* Mobile menu active state */
nav[class*="fixed"] ul a.router-link-active {
  @apply bg-celadon text-raspberry;
}
</style>
