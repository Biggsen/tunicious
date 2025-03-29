<script setup>
import { getAuth, signOut } from "firebase/auth";
import { useRouter } from 'vue-router';
import { useUserData } from "../composables/useUserData";

const auth = getAuth();
const router = useRouter();
const { user, userData, loading, error } = useUserData();

async function logout() {
  try {
    await signOut(auth);
    router.push('/'); // Redirect to home page after logout
  } catch (e) {
    console.error("Error signing out:", e);
    error.value = "Failed to sign out. Please try again.";
  }
}
</script>

<template>
  <main>
    <h1 class="h2 pb-10">Account Details</h1>
    <div v-if="loading">Loading user profile...</div>
    <div v-else-if="error" class="error-message">{{ error }}</div>
    <div v-else-if="userData" class="user-profile">
      <h2><strong>Name:</strong> {{ userData.displayName }}</h2>
      <p><strong>Email:</strong> {{ userData.email }}</p>
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