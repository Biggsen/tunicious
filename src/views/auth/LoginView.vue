<script setup>
import { watch } from "vue";
import { useForm } from "@composables/useForm";
import { useAuth } from "@composables/useAuth";
import { useCurrentUser } from "vuefire";
import { useRoute, useRouter } from "vue-router";
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const { form, isSubmitting, error: formError, success, handleSubmit } = useForm({
  email: "",
  password: "",
});

const { loading: authLoading, error: authError, login } = useAuth();
const currentUser = useCurrentUser();
const route = useRoute();
const router = useRouter();

const onSubmit = async (formData) => {
  await login(formData.email, formData.password);
  
  // Redirect after successful login
  const redirectTo = route.query.redirect || '/';
  router.push(redirectTo);
};

// Redirect already logged-in users to homepage
watch(currentUser, (user) => {
  if (user?.email) {
    const redirectTo = route.query.redirect || '/';
    router.push(redirectTo);
  }
}, { immediate: true });
</script>

<template>
  <div v-if="!currentUser?.email" class="p-4 pt-8">
    <h1 class="h2 pb-4">Login</h1>
    <form @submit.prevent="handleSubmit(onSubmit)" class="login-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input 
          type="email" 
          id="email" 
          v-model="form.email"
          :class="{ 'error': formError?.email }"
        />
        <span v-if="formError?.email" class="error-text">{{ formError.email }}</span>
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input 
          type="password" 
          id="password" 
          v-model="form.password"
          :class="{ 'error': formError?.password }"
        />
        <span v-if="formError?.password" class="error-text">{{ formError.password }}</span>
      </div>

      <div class="form-actions">
        <BaseButton 
          type="submit" 
          :disabled="isSubmitting || authLoading"
          variant="primary"
        >
          {{ isSubmitting || authLoading ? 'Logging in...' : 'Login' }}
        </BaseButton>
      </div>

      <ErrorMessage v-if="authError" :message="authError" />

      <div v-if="success" class="success-message">
        Login successful!
      </div>
    </form>
  </div>
  <div v-else class="p-4 pt-8">
    <p>You are already logged in.</p>
  </div>
</template>

<style lang="scss" scoped>
.login-form {
  max-width: 400px;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  @apply block text-base font-medium leading-6 text-gray-900;
}

input {
  @apply block w-full rounded-md border-0 px-2 py-1.5 mt-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-base sm:leading-6;

  &.error {
    @apply ring-red-500;
  }
}

.error-text {
  @apply mt-1 text-sm text-red-600;
}

.form-actions {
  margin-top: 2rem;
}

.success-message {
  @apply mt-4 p-4 bg-green-50 text-green-700 rounded-md;
}
</style>
