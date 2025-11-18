<script setup>
import { useRouter } from 'vue-router';
import { RouterLink } from 'vue-router';
import { ArrowLeftIcon } from '@heroicons/vue/24/solid';

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
    class="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 font-medium min-h-[2.5rem] bg-mint text-delft-blue hover:bg-delft-blue hover:text-white"
  >
    <ArrowLeftIcon class="h-5 w-5" />
    {{ text }}
  </RouterLink>
  <button 
    v-else
    @click.prevent="goBack" 
    class="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 font-medium min-h-[2.5rem] bg-mint text-delft-blue hover:bg-delft-blue hover:text-white"
  >
    <ArrowLeftIcon class="h-5 w-5" />
    {{ text }}
  </button>
</template> 