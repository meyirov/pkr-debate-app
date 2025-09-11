// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import FeedView from '../views/Feedview.vue'
import TournamentsView from '../views/TournamentsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    // Don't scroll to top when navigating to post detail
    if (to.name === 'post-detail') {
      return { top: 0 }
    }
    // Restore saved position when going back to feed
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'feed',
      component: FeedView
    },
    {
      path: '/compose',
      name: 'compose',
      component: () => import('../views/ComposeView.vue')
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
    },
    {
      path: '/post/:id',
      name: 'post-detail',
      component: () => import('../views/PostDetailView.vue')
    }
  ]
})

export default router