<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router'
import { getToken } from '../utils/api';

const loading = ref(false)
const token = ref(localStorage.getItem('token'))
if (!token.value) {
  console.log('token not been set');
  loading.value = true;
  getToken().then(response => {
    localStorage.setItem('token', response.access_token)
    console.log('token is now set');
    token.value = response.access_token
    loading.value = false;
  })
} else {
  console.log('token was already set');
}
</script>

<template>
  <p v-if="loading">Loading...</p>
	<main v-else>
		<h1 class="h2">Homepage</h1>
	</main>
</template>