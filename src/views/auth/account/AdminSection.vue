<script setup>
import { RouterLink } from 'vue-router';
import Card from '@components/common/Card.vue';
import { useAdmin } from '@composables/useAdmin';

const { isAdmin } = useAdmin();
</script>

<template>
  <div class="admin-section">
    <h2 class="text-2xl font-semibold text-delft-blue mb-6">Admin</h2>
    
    <Card v-if="isAdmin">
      <div class="space-y-6">
        <div>
          <h3 class="text-lg font-semibold text-delft-blue mb-4">Admin Tools</h3>
          <div class="space-y-3">
            <div>
              <RouterLink 
                to="/styleguide" 
                class="font-bold text-delft-blue hover:text-raspberry hover:underline"
              >
                Styleguide
              </RouterLink>
              <p class="text-sm text-gray-600 mt-1">
                View the design system and component documentation
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
    
    <Card v-else>
      <p class="text-gray-600">You do not have admin access.</p>
    </Card>
  </div>
</template>

<style scoped>
.admin-section {
  @apply w-full;
}
</style>
