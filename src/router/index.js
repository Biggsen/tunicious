import { createRouter, createWebHistory } from 'vue-router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import HomeView from '@views/HomeView.vue';
import PlaylistView from '@views/playlists/PlaylistView.vue';
import PlaylistSingle from '@views/playlists/PlaylistSingle.vue';
import AccountView from '@views/auth/AccountView.vue';
import LoginView from '@views/auth/LoginView.vue';
import SignupView from '@views/auth/SignupView.vue';
import VerifyEmailView from '@views/auth/VerifyEmailView.vue';
import ForgotPasswordView from '@views/auth/ForgotPasswordView.vue';
import ResetPasswordView from '@views/auth/ResetPasswordView.vue';
import AddPlaylistView from '@views/playlists/AddPlaylistView.vue';
import EditPlaylistView from '@views/playlists/EditPlaylistView.vue';
import PlaylistManagementView from '@views/playlists/PlaylistManagementView.vue';
import ArtistView from '@views/music/ArtistView.vue';
import AlbumView from '@views/music/AlbumView.vue';
import SearchView from '@views/music/SearchView.vue';
import SpotifyCallbackView from '@views/auth/SpotifyCallbackView.vue';
import LastFmCallbackView from '@views/auth/LastFmCallbackView.vue';
import StyleguideView from '@views/StyleguideView.vue';
import OnboardingView from '@views/OnboardingView.vue';

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
    path: '/playlist/add-album',
    name: 'addAlbumToPlaylist',
    component: () => import('@views/playlists/AddAlbumToPlaylistView.vue'),
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
    path: '/onboarding',
    name: 'onboarding',
    component: OnboardingView,
    meta: { 
      requiresAuth: true,
      skipIfCompleted: true
    }
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView
  },
  {
    path: '/signup',
    name: 'signup',
    component: SignupView
  },
  {
    path: '/verify-email',
    name: 'verifyEmail',
    component: VerifyEmailView,
    meta: { requiresAuth: true }
  },
  {
    path: '/forgot-password',
    name: 'forgotPassword',
    component: ForgotPasswordView
  },
  {
    path: '/reset-password',
    name: 'resetPassword',
    component: ResetPasswordView
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


// Allowed routes during onboarding (when not completed)
const allowedOnboardingRoutes = [
  '/onboarding',
  '/account',
  '/login',
  '/signup',
  '/spotify-callback',
  '/lastfm-callback',
  '/verify-email',
  '/forgot-password',
  '/reset-password'
];

// Check onboarding status
async function checkOnboardingStatus(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const onboarding = data.onboarding || {};
      return {
        completed: onboarding.completed === true,
        skipped: onboarding.skipped === true
      };
    }
    // If user document doesn't exist, they need onboarding
    return { completed: false, skipped: false };
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    // On error, allow access (fail open)
    return { completed: true, skipped: true };
  }
}

// Router guards
router.beforeEach(async (to, from, next) => {
  // First check authentication
  if (to.matched.some((record) => record.meta.requiresAuth)) {
    const user = await getCurrentUser();
    if (!user) {
      alert('You must be logged in to access this page');
      next({ path: '/login', query: { redirect: to.fullPath } });
      return;
    }

    // Check onboarding status for authenticated users
    const onboardingStatus = await checkOnboardingStatus(user.uid);
    
    // If onboarding is not completed and not skipped, enforce route restrictions
    if (!onboardingStatus.completed && !onboardingStatus.skipped) {
      // Check if current route is allowed during onboarding
      const currentPath = to.path;
      const isAllowedRoute = allowedOnboardingRoutes.includes(currentPath) ||
        currentPath.startsWith('/spotify-callback') ||
        currentPath.startsWith('/lastfm-callback');

      // If route is not allowed, redirect to onboarding
      if (!isAllowedRoute) {
        next({ path: '/onboarding' });
        return;
      }
    }

    // If onboarding is completed or skipped, allow access
    next();
  } else {
    // Public routes - no auth required
    next();
  }
});

export default router;
