import { createRouter, createWebHistory } from 'vue-router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import HomeView from '../views/HomeView.vue';
import PlaylistView from '../views/PlaylistView.vue';
import PlaylistSingle from '../views/PlaylistSingle.vue';
import AccountView from '../views/AccountView.vue';
import LoginView from '../views/LoginView.vue';  // Assuming you have a LoginView component
import AddPlaylistView from '../views/AddPlaylistView.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  },
  {
    path: '/playlists',
    name: 'playlists',
    component: PlaylistView,
    meta: { requiresAuth: true }
  },
  {
    path: '/playlist/add',
    name: 'addPlaylist',
    component: AddPlaylistView,
    meta: { requiresAuth: true }
  },
  {
    path: '/playlist/:id',
    name: 'playlistSingle',
    component: PlaylistSingle,
    meta: { requiresAuth: true }
  },
  {
    path: '/account',
    name: 'account',
    component: AccountView,
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

function getCurrentUser() {
  return new Promise((resolve, reject) => {
    const removeListener = onAuthStateChanged(
      getAuth(),
      (user) => {
        removeListener();
        resolve(user);
      },
      reject
    );
  });
}

router.beforeEach(async (to, from, next) => {
  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (await getCurrentUser()) {
      next();
    } else {
      alert('You must be logged in to access this page');
      next('/login');
    }
  } else {
    next();
  }
});

export default router;
