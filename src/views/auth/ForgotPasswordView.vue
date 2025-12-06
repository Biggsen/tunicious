<script setup>
import { ref } from "vue";
import { useForm } from "@composables/useForm";
import { useAuth } from "@composables/useAuth";
import { useCurrentUser } from "vuefire";
import { useRouter } from "vue-router";
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const { form, isSubmitting, error: formError, success, handleSubmit } = useForm({
  email: "",
});

const { loading: authLoading, error: authError, sendPasswordReset } = useAuth();
const currentUser = useCurrentUser();
const router = useRouter();
const emailSent = ref(false);
const fieldErrors = ref({});

const validateEmail = () => {
  const errors = {};
  
  if (!form.email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Invalid email address";
  }
  
  return Object.keys(errors).length === 0 ? null : errors;
};

const onSubmit = async (formData) => {
  // Clear previous field errors
  fieldErrors.value = {};
  
  // Validate form before submission
  const validationErrors = validateEmail();
  if (validationErrors) {
    fieldErrors.value = validationErrors;
    throw new Error("Please fix the form errors");
  }
  
  // Send password reset email
  await sendPasswordReset(formData.email);
  emailSent.value = true;
};

// Redirect already logged-in users
if (currentUser.value?.email) {
  router.push('/');
}
</script>

<template>
  <div v-if="!currentUser?.email" class="p-4 pt-8">
    <h1 class="h2 pb-4">Forgot Password</h1>
    
    <div class="forgot-password-content">
      <p class="mb-4 text-gray-600">
        Enter your email address and we'll send you a link to reset your password.
      </p>

      <form @submit.prevent="handleSubmit(onSubmit)" class="forgot-password-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            v-model="form.email"
            :class="{ 'error': fieldErrors?.email }"
            placeholder="Enter your email"
          />
          <span v-if="fieldErrors?.email" class="error-text">{{ fieldErrors.email }}</span>
        </div>

        <div class="form-actions">
          <BaseButton 
            type="submit" 
            :disabled="isSubmitting || authLoading"
            variant="primary"
          >
            {{ isSubmitting || authLoading ? 'Sending...' : 'Send Reset Link' }}
          </BaseButton>
        </div>

        <ErrorMessage v-if="authError" :message="authError" />

        <div v-if="emailSent || success" class="success-message">
          <p class="font-semibold mb-2">Password reset email sent!</p>
          <p class="text-sm">
            Please check your email and click the link to reset your password. 
            If you don't see the email, check your spam folder.
          </p>
        </div>
      </form>

      <div class="auth-links">
        <p class="text-sm text-gray-600 mb-2">
          <router-link to="/login" class="text-delft-blue hover:underline">Back to Login</router-link>
        </p>
        <p class="text-sm text-gray-600">
          Don't have an account? 
          <router-link to="/signup" class="text-delft-blue hover:underline">Sign up</router-link>
        </p>
      </div>
    </div>
  </div>
  <div v-else class="p-4 pt-8">
    <p>You are already logged in.</p>
  </div>
</template>

<style lang="scss" scoped>
.forgot-password-content {
  max-width: 400px;
}

.forgot-password-form {
  margin-bottom: 2rem;
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

.auth-links {
  @apply mt-4 text-left;
}
</style>

