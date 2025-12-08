<script setup>
import { ref, watch } from "vue";
import { useForm } from "@composables/useForm";
import { useAuth } from "@composables/useAuth";
import { useCurrentUser } from "vuefire";
import { useRoute, useRouter } from "vue-router";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const { form, isSubmitting, error: formError, success, handleSubmit } = useForm({
  email: "",
  password: "",
  confirmPassword: "",
});

const { loading: authLoading, error: authError, signup } = useAuth();
const currentUser = useCurrentUser();
const route = useRoute();
const router = useRouter();
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const fieldErrors = ref({});

const validateSignupForm = () => {
  const errors = {};
  
  // Email validation
  if (!form.email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Invalid email address";
  }
  
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
  const validationErrors = validateSignupForm();
  if (validationErrors) {
    fieldErrors.value = validationErrors;
    throw new Error("Please fix the form errors");
  }
  
  // Create user account
  const user = await signup(formData.email, formData.password);
  
    // Create user document in Firestore
    if (user) {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: null,
        lastFmUserName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        emailVerified: user.emailVerified
      });
      
      // Redirect to onboarding to complete setup
      router.push('/onboarding');
    }
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
    <h1 class="h2 pb-4">Sign Up</h1>
    <form @submit.prevent="handleSubmit(onSubmit)" class="signup-form">
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

      <div class="form-group">
        <label for="password">Password</label>
        <div class="password-input-wrapper">
          <input 
            :type="showPassword ? 'text' : 'password'" 
            id="password" 
            v-model="form.password"
            :class="{ 'error': fieldErrors?.password }"
            placeholder="Enter your password"
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
            placeholder="Confirm your password"
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
          {{ isSubmitting || authLoading ? 'Creating account...' : 'Sign Up' }}
        </BaseButton>
      </div>

      <ErrorMessage v-if="authError" :message="authError" />

      <div v-if="success" class="success-message">
        Account created successfully!
      </div>

      <div class="auth-links">
        <p class="text-sm text-gray-600">
          Already have an account? 
          <router-link to="/login" class="text-delft-blue hover:underline">Log in</router-link>
        </p>
      </div>
    </form>
  </div>
  <div v-else class="p-4 pt-8">
    <p>You are already logged in.</p>
  </div>
</template>

<style lang="scss" scoped>
.signup-form {
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

.auth-links {
  @apply mt-4 text-left;
}
</style>

