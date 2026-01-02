<script setup>
import { RouterLink, useRoute } from 'vue-router';
import { computed } from 'vue';
import { useAdmin } from '@composables/useAdmin';
import {
  UserIcon,
  PuzzlePieceIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
  ArchiveBoxIcon,
  LockClosedIcon,
  ShieldCheckIcon
} from '@heroicons/vue/24/outline';

const route = useRoute();
const { isAdmin } = useAdmin();

const baseNavItems = [
  {
    name: 'Profile',
    path: '/account/profile',
    icon: UserIcon,
    order: 1
  },
  {
    name: 'Integrations',
    path: '/account/integrations',
    icon: PuzzlePieceIcon,
    order: 2
  },
  {
    name: 'Diagnostics',
    path: '/account/diagnostics',
    icon: WrenchScrewdriverIcon,
    order: 3
  },
  {
    name: 'Statistics',
    path: '/account/statistics',
    icon: ChartBarIcon,
    order: 4
  },
  {
    name: 'Cache',
    path: '/account/cache',
    icon: ArchiveBoxIcon,
    order: 5
  },
  {
    name: 'Security',
    path: '/account/security',
    icon: LockClosedIcon,
    order: 6
  }
];

const adminNavItem = {
  name: 'Admin',
  path: '/account/admin',
  icon: ShieldCheckIcon,
  order: 7
};

const navItems = computed(() => {
  const items = [...baseNavItems];
  if (isAdmin.value) {
    items.push(adminNavItem);
  }
  return items;
});

const isActive = (path) => {
  return route.path === path || route.path.startsWith(path + '/');
};
</script>

<template>
  <nav class="account-sidebar" aria-label="Account navigation">
    <!-- Desktop/Tablet: Vertical sidebar -->
    <div class="hidden md:block">
      <ul class="space-y-1">
        <li v-for="item in navItems" :key="item.path">
          <RouterLink
            :to="item.path"
            :class="[
              'nav-link',
              isActive(item.path) ? 'nav-link-active' : ''
            ]"
          >
            <component :is="item.icon" class="nav-icon" />
            <span>{{ item.name }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>

    <!-- Mobile: Horizontal stacked links -->
    <div class="md:hidden">
      <ul class="flex flex-wrap gap-2">
        <li v-for="item in navItems" :key="item.path">
          <RouterLink
            :to="item.path"
            :class="[
              'nav-link-mobile',
              isActive(item.path) ? 'nav-link-mobile-active' : ''
            ]"
          >
            <component :is="item.icon" class="nav-icon-mobile" />
            <span>{{ item.name }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.account-sidebar {
  @apply w-full;
}

/* Desktop/Tablet Navigation */
.nav-link {
  @apply flex items-center gap-3 px-4 py-3 rounded-lg text-delft-blue transition-colors duration-200;
  @apply hover:bg-celadon;
}

.nav-link-active {
  @apply bg-mint text-delft-blue font-medium;
}

.nav-link-active:hover {
  @apply bg-mint;
}

.nav-icon {
  @apply w-5 h-5;
}

/* Mobile Navigation */
.nav-link-mobile {
  @apply flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-delft-blue transition-colors duration-200;
  @apply bg-white border border-delft-blue hover:bg-celadon;
}

.nav-link-mobile-active {
  @apply bg-mint border-delft-blue font-medium;
}

.nav-link-mobile-active:hover {
  @apply bg-mint;
}

.nav-icon-mobile {
  @apply w-4 h-4;
}
</style>

