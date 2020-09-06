import Vue from 'vue'
import VueRouter from 'vue-router'
import Home from '../pages/Home.vue'
import AuthService from '../services/AuthService'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/about',
    name: 'About',
    component: () => import(/* webpackChunkName: "about" */ '../pages/About.vue'),
    meta: {
      guest: true
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import(/* webpackChunkName: "login" */ '../pages/Login.vue'),
    meta: {
      guest: true
    }
  },
  {
    path: '/artists',
    name: 'Artists',
    component: () => import(/* webpackChunkName: "artists" */ '../pages/Artists.vue'),
    meta: {
      requiresAuth: true
    }
  },
  {
      path: '/dashboard',
      name: 'userboard',
      component: () => import(/* webpackChunkName: "dashboard" */ '../pages/Dashboard.vue'),
      meta: {
          requiresAuth: true
      }
  },
  {
      path: '/admin',
      name: 'admin',
      component: () => import(/* webpackChunkName: "admin" */ '../pages/Admin.vue'),
      meta: {
          requiresAuth: true,
          isAdmin : true
      }
  },
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

router.beforeEach((to, from, next) => {
    if(to.matched.some(record => record.meta.requiresAuth)) {
        console.log(`${to.fullPath} requiresAuth`)
        if (localStorage.getItem('user-token') == null) {
          console.log('requiresAuth and no token')
            next({
                path: '/login',
                params: { nextUrl: to.fullPath }
            })
        } else {
           console.log('requiresAuth and token')
          AuthService.getUser().then(res => {
            console.log(res.user)
            if(to.matched.some(record => record.meta.is_admin)) {
                //if(user.isAdmin == 1){
                    next()
                //}
                // else{
                //     next({ name: 'userboard'})
                // }
            }else {
                next()
            }
          })
        }
    } else if(to.matched.some(record => record.meta.guest)) {
        console.log(`${to.fullPath} guest`)
        //if(localStorage.getItem('user-token') == null){
            next()
        //}
        // else{
        //     next({ name: 'userboard'})
        // }
    }else {
        next()
    }
})

export default router
