<script setup>
import { useCurrentUser } from 'vuefire';
import LatestMovements from '@components/LatestMovements.vue';

const user = useCurrentUser();
</script>

<template>
  <main class="max-w-6xl mx-auto px-4 py-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-delft-blue mb-2">
        Welcome{{ user?.displayName ? `, ${user.displayName}` : '' }}!
      </h1>
      <p class="text-delft-blue/70">
        Track your music discovery journey
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Latest Movements Section -->
      <div class="lg:col-span-2">
        <LatestMovements :limit="8" />
      </div>

      <!-- Quick Actions Sidebar -->
      <div class="space-y-6">
        <div class="bg-celadon border-2 border-delft-blue rounded-xl p-6">
          <h3 class="text-lg font-semibold text-delft-blue mb-4">Quick Actions</h3>
          <div class="space-y-3">
            <RouterLink
              to="/playlists"
              class="block w-full text-left px-4 py-2 bg-mint text-delft-blue rounded-lg hover:bg-delft-blue hover:text-white transition-colors font-medium"
            >
              Manage Playlists
            </RouterLink>
            <RouterLink
              to="/search"
              class="block w-full text-left px-4 py-2 bg-mindero text-delft-blue rounded-lg hover:bg-delft-blue hover:text-white transition-colors font-medium"
            >
              Search Music
            </RouterLink>
            <RouterLink
              to="/account"
              class="block w-full text-left px-4 py-2 bg-white text-delft-blue rounded-lg hover:bg-delft-blue hover:text-white transition-colors font-medium border border-delft-blue"
            >
              Account Settings
            </RouterLink>
          </div>
        </div>

        <!-- Stats Card -->
        <div class="bg-white border-2 border-delft-blue rounded-xl p-6">
          <h3 class="text-lg font-semibold text-delft-blue mb-4">Your Journey</h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between items-center">
              <span class="text-delft-blue/70">Total Albums</span>
              <span class="font-medium text-delft-blue">Coming soon</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-delft-blue/70">This Month</span>
              <span class="font-medium text-delft-blue">Coming soon</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-delft-blue/70">Favorite Category</span>
              <span class="font-medium text-delft-blue">Coming soon</span>
            </div>
          </div>
        </div>

        <!-- Info Card -->
        <div class="bg-raspberry/10 border-2 border-raspberry rounded-xl p-6">
          <h3 class="text-lg font-semibold text-raspberry mb-2">💡 Tip</h3>
          <p class="text-sm text-raspberry/80">
            Click on any album movement to view its details and explore the full playlist history.
          </p>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
</style>
