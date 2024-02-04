<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router'
import { getToken } from '../utils/api';

const tokenFromStorage = localStorage.getItem('token');

if (!tokenFromStorage) {
  getToken().then(response => {
    localStorage.setItem('token', response.access_token)
  })
}
</script>

<template>
	<main>
		<h1 class="text-[36px] font-chivo font-bold">Homepage</h1>
	</main>
</template>