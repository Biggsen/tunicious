<script setup>
import AccountSidebar from '@components/AccountSidebar.vue';
import { RouterView } from 'vue-router';
</script>

<template>
  <main class="account-layout">
    <div class="account-container">
      <!-- Sidebar Navigation -->
      <aside class="account-sidebar-container">
        <AccountSidebar />
      </aside>

      <!-- Content Area -->
      <div class="account-content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </div>
    </div>
  </main>
</template>

<style scoped>
.account-layout {
  @apply min-h-screen;
}

.account-container {
  @apply flex flex-col md:flex-row gap-6 p-6 max-w-7xl mx-auto;
}

.account-sidebar-container {
  @apply w-full md:w-64 flex-shrink-0;
}

.account-content {
  @apply flex-1 min-w-0 p-4;
}
</style>
