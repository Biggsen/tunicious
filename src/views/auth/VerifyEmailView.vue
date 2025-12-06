<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCurrentUser } from "vuefire";
import { sendEmailVerification } from "firebase/auth";
import { getAuth } from "firebase/auth";
import BaseButton from '@components/common/BaseButton.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';

const currentUser = useCurrentUser();
const router = useRouter();
const loading = ref(false);
const error = ref(null);
const success = ref(false);
const emailSent = ref(false);

const resendVerification = async () => {
  if (!currentUser.value) {
    router.push('/login');
    return;
  }

  loading.value = true;
  error.value = null;
  success.value = false;

  try {
    await sendEmailVerification(currentUser.value);
    emailSent.value = true;
    success.value = true;
  } catch (err) {
    error.value = getErrorMessage(err.code);
  } finally {
    loading.value = false;
  }
};

const getErrorMessage = (errorCode) => {
  switch (errorCode) {
    case 'auth/too-many-requests':
      return 'Too many requests. Please wait before requesting another email.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    default:
      return 'An error occurred. Please try again.';
  }
};

onMounted(() => {
  if (!currentUser.value) {
    router.push('/login');
  } else if (currentUser.value.emailVerified) {
    router.push('/');
  }
});
</script>

<template>
  <div v-if="currentUser && !currentUser.emailVerified" class="p-4 pt-8">
    <h1 class="h2 pb-4">Verify Your Email</h1>
    
    <div class="verification-content">
      <p class="mb-4">
        We've sent a verification email to <strong>{{ currentUser.email }}</strong>
      </p>
      
      <p class="mb-4 text-gray-600">
        Please check your inbox and click the verification link to activate your account.
      </p>

      <div v-if="emailSent" class="success-message mb-4">
        Verification email sent! Please check your inbox.
      </div>

      <ErrorMessage v-if="error" :message="error" />

      <div class="form-actions">
        <BaseButton 
          @click="resendVerification"
          :disabled="loading"
          variant="primary"
        >
          {{ loading ? 'Sending...' : 'Resend Verification Email' }}
        </BaseButton>
      </div>

      <div class="auth-links mt-4">
        <p class="text-sm text-gray-600">
          <router-link to="/login" class="text-delft-blue hover:underline">Back to Login</router-link>
        </p>
      </div>
    </div>
  </div>
  <div v-else-if="currentUser?.emailVerified" class="p-4 pt-8">
    <div class="success-message">
      <p>Your email has been verified!</p>
      <BaseButton @click="router.push('/')" variant="primary" class="mt-4">
        Continue to App
      </BaseButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.verification-content {
  max-width: 400px;
}

.form-actions {
  margin-top: 2rem;
}

.success-message {
  @apply p-4 bg-green-50 text-green-700 rounded-md;
}

.auth-links {
  @apply text-left;
}
</style>

