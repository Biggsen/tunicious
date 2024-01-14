<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router'

</script>

<template>
	<main>
		<h1 class="text-[36px] font-chivo font-bold">Homepage</h1>
    <router-link to="/playlist">Playlists</router-link>
	</main>
</template>