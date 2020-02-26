<template>
  <div class="home">
    <ArtistComponent />
  </div>
</template>

<script>
// @ is an alias to /src
import ArtistComponent from '@/components/ArtistComponent.vue'

export default {
  name: 'Home',
  components: {
    ArtistComponent
  }
}
</script>
