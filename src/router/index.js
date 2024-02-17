import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import PlaylistView from "../views/PlaylistView.vue";
import PlaylistSingle from "../views/PlaylistSingle.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/playlists",
      name: "playlists",
      component: PlaylistView,
    },
    {
      path: "/playlist/:id",
      name: "playlist-id",
      component: PlaylistSingle,
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
    },
  ],
});

export default router;
