<template>
  <div class="home">
    <img alt="Vue logo" src="../assets/logo.png">
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
