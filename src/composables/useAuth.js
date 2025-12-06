import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, confirmPasswordReset, signOut } from 'firebase/auth';
import { logAuth } from '@utils/logger';

export function useAuth() {
  const router = useRouter();
  const auth = getAuth();
  const loading = ref(false);
  const error = ref(null);

  const login = async (email, password) => {
    loading.value = true;
    error.value = null;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (err) {
      logAuth('Login error:', err);
      error.value = getAuthErrorMessage(err.code);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const signup = async (email, password) => {
    loading.value = true;
    error.value = null;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Send email verification
      if (userCredential.user) {
        await sendEmailVerification(userCredential.user);
      }
      
      return userCredential.user;
    } catch (err) {
      logAuth('Signup error:', err);
      error.value = getAuthErrorMessage(err.code);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const sendPasswordReset = async (email) => {
    loading.value = true;
    error.value = null;

    try {
      await sendPasswordResetEmail(auth, email);
      // Always show success message (security best practice - don't reveal if email exists)
      return true;
    } catch (err) {
      logAuth('Password reset error:', err);
      // For user-not-found, still show success (security best practice)
      if (err.code === 'auth/user-not-found') {
        return true;
      }
      error.value = getAuthErrorMessage(err.code);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const resetPassword = async (actionCode, newPassword) => {
    loading.value = true;
    error.value = null;

    try {
      await confirmPasswordReset(auth, actionCode, newPassword);
      return true;
    } catch (err) {
      logAuth('Password reset confirmation error:', err);
      error.value = getAuthErrorMessage(err.code);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const logout = async (redirectPath = '/') => {
    loading.value = true;
    error.value = null;

    try {
      await signOut(auth);
      router.push(redirectPath);
    } catch (err) {
      logAuth('Logout error:', err);
      error.value = 'Failed to sign out. Please try again.';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const getAuthErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/email-already-in-use':
        return 'This email is already registered.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/operation-not-allowed':
        return 'Operation not allowed.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      case 'auth/expired-action-code':
        return 'Reset link has expired. Please request a new one.';
      case 'auth/invalid-action-code':
        return 'Invalid reset link. Please request a new one.';
      default:
        return 'An error occurred. Please try again.';
    }
  };

  return {
    loading,
    error,
    login,
    signup,
    sendPasswordReset,
    resetPassword,
    logout
  };
} 