<script setup>
import { useRouter } from 'vue-router';
import { RouterLink } from 'vue-router';

const props = defineProps({
  to: {
    type: String,
    default: null
  },
  text: {
    type: String,
    default: 'Back'
  }
});

const router = useRouter();

const goBack = () => {
  router.back();
};
</script>

<template>
  <RouterLink 
    v-if="to" 
    :to="to" 
    class="text-blue-500 hover:underline"
  >
    &larr; {{ text }}
  </RouterLink>
  <a 
    v-else
    href="#" 
    @click.prevent="goBack" 
    class="text-blue-500 hover:underline"
  >
    &larr; {{ text }}
  </a>
</template> 