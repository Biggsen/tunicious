import { createApp } from 'vue'
import './style.scss'
import { VueFire, VueFireAuth } from 'vuefire'
import { firebaseApp } from './firebase'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(VueFire, {
	firebaseApp,
	modules: [VueFireAuth()]
})

app.use(router)
app.mount('#app')
