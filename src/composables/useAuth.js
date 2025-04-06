import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

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
      console.error('Login error:', err);
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
      console.error('Logout error:', err);
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
      default:
        return 'An error occurred. Please try again.';
    }
  };

  return {
    loading,
    error,
    login,
    logout
  };
} 