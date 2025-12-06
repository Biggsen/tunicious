<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useForm } from "@composables/useForm";
import { useAuth } from "@composables/useAuth";
import { useRoute, useRouter } from "vue-router";
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const { form, isSubmitting, error: formError, success, handleSubmit } = useForm({
  password: "",
  confirmPassword: "",
});

const { loading: authLoading, error: authError, resetPassword } = useAuth();
const route = useRoute();
const router = useRouter();
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const fieldErrors = ref({});
const tokenValid = ref(false);
const actionCode = ref(null);
const redirectTimer = ref(null);

const validatePasswordForm = () => {
  const errors = {};
  
  // Password validation
  if (!form.password) {
    errors.password = "Password is required";
  } else if (form.password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }
  
  // Confirm password validation
  if (!form.confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (form.password !== form.confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }
  
  return Object.keys(errors).length === 0 ? null : errors;
};

const onSubmit = async (formData) => {
  // Clear previous field errors
  fieldErrors.value = {};
  
  // Validate form before submission
  const validationErrors = validatePasswordForm();
  if (validationErrors) {
    fieldErrors.value = validationErrors;
    throw new Error("Please fix the form errors");
  }
  
  if (!actionCode.value) {
    throw new Error("Invalid reset link. Please request a new one.");
  }
  
  // Reset password
  await resetPassword(actionCode.value, formData.password);
  
  // Redirect to login after 3 seconds
  redirectTimer.value = setTimeout(() => {
    router.push('/login');
  }, 3000);
};

onMounted(() => {
  // Extract action code from URL
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('oobCode');
  const mode = urlParams.get('mode');
  
  if (code && mode === 'resetPassword') {
    actionCode.value = code;
    tokenValid.value = true;
  } else {
    tokenValid.value = false;
    authError.value = 'Invalid or missing reset link. Please request a new password reset.';
  }
});

// Cleanup timer on unmount
onUnmounted(() => {
  if (redirectTimer.value) {
    clearTimeout(redirectTimer.value);
  }
});
</script>

<template>
  <div class="p-4 pt-8">
    <h1 class="h2 pb-4">Reset Password</h1>
    
    <div class="reset-password-content">
      <div v-if="!tokenValid" class="error-message mb-4">
        <p class="font-semibold mb-2">Invalid Reset Link</p>
        <p class="text-sm mb-4">
          The password reset link is invalid or has expired. Please request a new one.
        </p>
        <BaseButton 
          @click="router.push('/forgot-password')" 
          variant="primary"
        >
          Request New Reset Link
        </BaseButton>
      </div>

      <form v-else @submit.prevent="handleSubmit(onSubmit)" class="reset-password-form">
        <div class="form-group">
          <label for="password">New Password</label>
          <div class="password-input-wrapper">
            <input 
              :type="showPassword ? 'text' : 'password'" 
              id="password" 
              v-model="form.password"
              :class="{ 'error': fieldErrors?.password }"
              placeholder="Enter your new password"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="password-toggle"
              tabindex="-1"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <span v-if="fieldErrors?.password" class="error-text">{{ fieldErrors.password }}</span>
        </div>

        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <div class="password-input-wrapper">
            <input 
              :type="showConfirmPassword ? 'text' : 'password'" 
              id="confirmPassword" 
              v-model="form.confirmPassword"
              :class="{ 'error': fieldErrors?.confirmPassword }"
              placeholder="Confirm your new password"
            />
            <button
              type="button"
              @click="showConfirmPassword = !showConfirmPassword"
              class="password-toggle"
              tabindex="-1"
            >
              {{ showConfirmPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <span v-if="fieldErrors?.confirmPassword" class="error-text">{{ fieldErrors.confirmPassword }}</span>
        </div>

        <div class="form-actions">
          <BaseButton 
            type="submit" 
            :disabled="isSubmitting || authLoading"
            variant="primary"
          >
            {{ isSubmitting || authLoading ? 'Resetting Password...' : 'Reset Password' }}
          </BaseButton>
        </div>

        <ErrorMessage v-if="authError" :message="authError" />

        <div v-if="success" class="success-message">
          <p class="font-semibold mb-2">Password reset successful!</p>
          <p class="text-sm">Redirecting to login page in 3 seconds...</p>
        </div>
      </form>

      <div class="auth-links">
        <p class="text-sm text-gray-600">
          <router-link to="/login" class="text-delft-blue hover:underline">Back to Login</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.reset-password-content {
  max-width: 400px;
}

.reset-password-form {
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

.password-input-wrapper {
  @apply relative;
  
  input {
    @apply pr-20;
  }
}

.password-toggle {
  @apply absolute right-2 top-1/2 -translate-y-1/2 text-sm text-delft-blue hover:text-raspberry cursor-pointer;
  margin-top: 0.25rem;
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

.error-message {
  @apply p-4 bg-red-50 text-red-700 rounded-md;
}

.auth-links {
  @apply mt-4 text-left;
}
</style>

