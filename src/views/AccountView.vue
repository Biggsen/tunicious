<script setup>
import { ref, onMounted } from "vue";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from 'vue-router';

const auth = getAuth();
const router = useRouter();
const loading = ref(true);
const error = ref(null);
const user = ref(null);

function fetchUserProfile() {
  onAuthStateChanged(auth, (firebaseUser) => {
    loading.value = false;
    if (firebaseUser) {
      user.value = {
        displayName: firebaseUser.displayName,
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL,
        emailVerified: firebaseUser.emailVerified,
        uid: firebaseUser.uid
      };
    } else {
      error.value = "No user is signed in.";
    }
  });
}

async function logout() {
  try {
    await signOut(auth);
    user.value = null;
    router.push('/'); // Redirect to home page after logout
  } catch (e) {
    console.error("Error signing out:", e);
    error.value = "Failed to sign out. Please try again.";
  }
}

onMounted(() => {
  fetchUserProfile();
});
</script>

<template>
  <main>
    <h1 class="h2 pb-10">Account Details</h1>
    <div v-if="loading">Loading user profile...</div>
    <div v-else-if="error" class="error-message">{{ error }}</div>
    <div v-else-if="user" class="user-profile">
      <img v-if="user.photoURL" 
           :src="user.photoURL" 
           :alt="user.displayName" 
           class="profile-image">
      <h2>{{ user.displayName }}</h2>
      <p><strong>Email:</strong> {{ user.email }}</p>
      <p><strong>User ID:</strong> {{ user.uid }}</p>
      <p><strong>Email Verified:</strong> {{ user.emailVerified ? 'Yes' : 'No' }}</p>
      <a href="#" @click.prevent="logout" class="logout-link">Logout</a>
    </div>
    <div v-else>No user profile data available.</div>
  </main>
</template>

<style scoped>
.error-message {
  color: red;
  font-weight: bold;
}

.user-profile {
  max-width: 600px;
  margin: 0 auto;
}

.profile-image {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  margin-bottom: 20px;
}

.logout-link {
  display: inline-block;
  margin-top: 20px;
  padding: 10px 20px;
  background-color: #f44336;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 16px;
}

.logout-link:hover {
  background-color: #d32f2f;
}
</style>