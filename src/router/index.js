import { createRouter, createWebHistory } from 'vue-router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import HomeView from '@views/HomeView.vue';
import PlaylistView from '@views/playlists/PlaylistView.vue';
import PlaylistSingle from '@views/playlists/PlaylistSingle.vue';
import AccountView from '@views/auth/AccountView.vue';
import LoginView from '@views/auth/LoginView.vue';
import AddPlaylistView from '@views/playlists/AddPlaylistView.vue';
import EditPlaylistView from '@views/playlists/EditPlaylistView.vue';
import PlaylistManagementView from '@views/playlists/PlaylistManagementView.vue';
import ArtistView from '@views/music/ArtistView.vue';
import AlbumView from '@views/music/AlbumView.vue';
import SearchView from '@views/music/SearchView.vue';
import SpotifyCallbackView from '@views/auth/SpotifyCallbackView.vue';
import LastFmCallbackView from '@views/auth/LastFmCallbackView.vue';
import StyleguideView from '@views/StyleguideView.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { requiresSpotify: true }
  },
  {
    path: '/playlists',
    name: 'playlists',
    component: PlaylistView,
    meta: { 
      requiresAuth: true,
      requiresSpotify: true 
    }
  },
  {
    path: '/playlist/add',
    name: 'addPlaylist',
    component: AddPlaylistView,
    meta: { 
      requiresAuth: true,
      requiresSpotify: true 
    }
  },
  {
    path: '/playlist/:id/edit',
    name: 'editPlaylist',
    component: EditPlaylistView,
    meta: { 
      requiresAuth: true,
      requiresSpotify: true 
    }
  },
  {
    path: '/playlist/management',
    name: 'playlistManagement',
    component: PlaylistManagementView,
    meta: { 
      requiresAuth: true,
      requiresSpotify: true 
    }
  },
  {
    path: '/playlist/:id',
    name: 'playlistSingle',
    component: PlaylistSingle,
    meta: { 
      requiresAuth: true,
      requiresSpotify: true 
    }
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
  },
  {
    path: '/spotify-callback',
    name: 'spotifyCallback',
    component: SpotifyCallbackView,
    meta: { requiresAuth: true }
  },
  {
    path: '/lastfm-callback',
    name: 'lastfmCallback',
    component: LastFmCallbackView,
    meta: { requiresAuth: true }
  },
  {
    path: '/artist/:id',
    name: 'artist',
    component: ArtistView,
    meta: { 
      requiresAuth: true,
      requiresSpotify: true 
    }
  },
  {
    path: '/album/:id',
    name: 'album',
    component: AlbumView,
    meta: { 
      requiresAuth: true,
      requiresSpotify: true 
    }
  },
  {
    path: '/search',
    name: 'search',
    component: SearchView
  },
  {
    path: '/styleguide',
    name: 'styleguide',
    component: StyleguideView
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


// Keep existing auth guard
router.beforeEach(async (to, from, next) => {
  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (await getCurrentUser()) {
      next();
    } else {
      alert('You must be logged in to access this page');
      next({ path: '/login', query: { redirect: to.fullPath } });
    }
  } else {
    next();
  }
});

export default router;
