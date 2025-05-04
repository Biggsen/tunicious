<script setup>
import { useForm } from "@composables/useForm";
import { useAuth } from "@composables/useAuth";
import { useCurrentUser } from "vuefire";
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const { form, isSubmitting, error: formError, success, handleSubmit } = useForm({
  email: "",
  password: "",
});

const { loading: authLoading, error: authError, login } = useAuth();
const currentUser = useCurrentUser();

const onSubmit = async (formData) => {
  await login(formData.email, formData.password);
};
</script>

<template>
  <div v-if="!currentUser?.email" class="p-4 pt-8">
    <h2 class="text-xl font-bold mb-6">Login</h2>
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
          customClass="submit-button"
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
  margin: 0 auto;
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

.submit-button {
  @apply w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed;
}

.success-message {
  @apply mt-4 p-4 bg-green-50 text-green-700 rounded-md;
}
</style>
