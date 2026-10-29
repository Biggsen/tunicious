<script setup>
import { watch } from "vue";
import { useForm } from "@composables/useForm";
import { useAuth } from "@composables/useAuth";
import { useCurrentUser } from "vuefire";
import { useRoute, useRouter } from "vue-router";
import BaseButton from '@components/common/BaseButton.vue';
import BaseLayout from '@components/common/BaseLayout.vue';
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
  <BaseLayout>
  <div v-if="!currentUser?.email">
    <h1 class="h2 pb-4">Login</h1>
    <form @submit.prevent="handleSubmit(onSubmit)" class="login-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input 
          type="email" 
          id="email" 
          v-model="form.email"
          class="auth-field"
          :class="{ 'auth-input-error': formError?.email }"
        />
        <span v-if="formError?.email" class="error-text">{{ formError.email }}</span>
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input 
          type="password" 
          id="password" 
          v-model="form.password"
          class="auth-field"
          :class="{ 'auth-input-error': formError?.password }"
        />
        <span v-if="formError?.password" class="error-text">{{ formError.password }}</span>
      </div>

      <div class="form-actions">
        <BaseButton 
          type="submit" 
          :disabled="isSubmitting || authLoading"
          variant="primary"
          custom-class="dark:!bg-[#3f5b87] dark:!text-white dark:!ring-0"
        >
          {{ isSubmitting || authLoading ? 'Logging in...' : 'Login' }}
        </BaseButton>
      </div>

      <ErrorMessage v-if="authError" :message="authError" />

      <div v-if="success" class="success-message">
        Login successful!
      </div>

      <div class="auth-links">
        <p class="text-sm text-on-page/80 mb-2">
          <router-link to="/forgot-password" class="text-on-page hover:text-raspberry hover:underline">Forgot password?</router-link>
        </p>
        <p class="text-sm text-on-page/80 hidden">
          Don't have an account? 
          <router-link to="/signup" class="text-on-page hover:text-raspberry hover:underline">Sign up</router-link>
        </p>
      </div>
    </form>
  </div>
  <div v-else>
    <p class="text-on-page">You are already logged in.</p>
  </div>
  </BaseLayout>
</template>

<style lang="scss" scoped>
.login-form {
  max-width: 400px;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  @apply block text-base font-medium leading-6 text-on-page;
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

.auth-links {
  @apply mt-4 text-left;
}
</style>
