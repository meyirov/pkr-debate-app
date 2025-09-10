// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import FeedView from '../views/FeedView.vue'
import TournamentsView from '../views/TournamentsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'feed',
      component: FeedView
    },
    {
      path: '/tournaments',
      name: 'tournaments',
      component: TournamentsView
    },
    // --- НОВЫЙ МАРШРУТ ---
    // :id означает, что эта часть адреса будет динамической (ID турнира)
    {
      path: '/tournaments/:id',
      name: 'tournament-detail',
      component: () => import('../views/TournamentDetailView.vue')
    },
    // --- КОНЕЦ НОВОГО МАРШРУТА ---
    {
      path: '/rating',
      name: 'rating',
      component: () => import('../views/RatingView.vue')
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/ProfileView.vue')
    },
    {
      path: '/edu',
      name: 'edu',
      component: () => import('../views/EduView.vue')
    }
  ]
})

export default router