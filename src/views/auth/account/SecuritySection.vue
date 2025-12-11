<script setup>
import { useAuth } from "@composables/useAuth";
import { logAuth } from '@utils/logger';
import BaseButton from '@components/common/BaseButton.vue';
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import Card from '@components/common/Card.vue';

const { loading: authLoading, error: authError, logout } = useAuth();

const handleLogout = async () => {
  try {
    await logout('/');
  } catch (err) {
    logAuth("Error signing out:", err);
  }
};
</script>

<template>
  <div class="security-section">
    <h2 class="text-2xl font-semibold text-delft-blue mb-6">Security</h2>
    
    <LoadingMessage v-if="authLoading" message="Loading..." />
    
    <ErrorMessage v-else-if="authError" :message="authError" />
    
    <Card v-else>
      <h3 class="text-lg font-semibold text-delft-blue mb-4">Account Actions</h3>
      <div class="space-y-4">
        <div>
          <BaseButton 
            @click="handleLogout" 
            :disabled="authLoading"
            :loading="authLoading"
            variant="primary"
          >
            Logout
          </BaseButton>
          <p class="text-sm text-gray-600 mt-2">
            Sign out of your account
          </p>
        </div>
      </div>
    </Card>
  </div>
</template>


