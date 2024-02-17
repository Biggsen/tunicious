<script setup>
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { getAuth } from "../utils/auth";

const loading = ref(false);
const token = ref();
getAuth().then((response) => {
  console.log(response);
  token.value = response;
});
</script>

<template>
  <p v-if="loading">Loading...</p>
  <main v-else>
    <h1 class="h2">Homepage</h1>
  </main>
</template>
