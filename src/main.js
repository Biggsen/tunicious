import Vue from 'vue'
import App from './App.vue'
import '@/assets/css/tailwind.css'
import router from './router'
import axios from 'axios'

Vue.config.productionTip = false

Vue.prototype.$http = axios
const token = localStorage.getItem('user-token')
if (token) {
    Vue.prototype.$http.defaults.headers.common['Authorization'] = token
}

new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
