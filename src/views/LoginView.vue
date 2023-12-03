<script setup>
import { ref } from 'vue'
import { useFirebaseAuth, useCurrentUser } from 'vuefire'
import { signInWithEmailAndPassword, signOut } from '@firebase/auth'

const userInput = ref({
	email: '',
	password: ''
})

const auth = useFirebaseAuth()
const currentUser = useCurrentUser()

async function loginToFirebase() {
	signInWithEmailAndPassword(auth, userInput.value.email, userInput.value.password)
		.then((userCredential) => {
			// Signed in
			const user = userCredential.user
			// ...
		})
		.catch((error) => {
			const errorCode = error.code
			const errorMessage = error.message
		})
}

async function signOutOfFirebase() {
	signOut(auth)
		.then(() => {
			console.log('Logged out!')
		})
		.catch((error) => {
			console.error(error)
		})
}

console.log(auth)
</script>

<template>
	<div v-if="!currentUser?.email" class="p-4 pt-8">
		<h2 class="text-xl font-bold mb-6">Login</h2>
		<form @submit.prevent="loginToFirebase">
			<label for="email">email</label>
			<input type="email" id="email" v-model="userInput.email" />
			<label for="password">password</label>
			<input type="password" id="password" v-model="userInput.password" />
			<button type="submit">Login</button>
		</form>
	</div>
	<div v-else class="p-4 pt-8">
		<button @click="signOutOfFirebase">Log out</button>
	</div>
</template>

<style lang="scss" scoped>
label {
	@apply block text-base font-medium leading-6 text-gray-900;
}
input {
	@apply block w-full rounded-md border-0 px-2 py-1.5 mt-2 mb-6 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-base sm:leading-6;
}
button {
	@apply rounded-md bg-gray-400 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600;
}
</style>
