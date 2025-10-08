<template>
  <nav class="navbar">
    <router-link v-for="tab in tabs" :key="tab.id" :to="tab.path" class="nav-btn">
      <!-- SVG icons styled via currentColor for active/inactive states -->
      <svg v-if="tab.id === 'feed'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5l9-7 9 7V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4H9v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10.5z"/>
      </svg>
      <svg v-else-if="tab.id === 'tournaments'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 21h8M12 17c3 0 5-2 5-5V4H7v8c0 3 2 5 5 5z"/>
        <path d="M19 6h2a3 3 0 0 1 0 6h-2M5 6H3a3 3 0 0 0 0 6h2"/>
      </svg>
      <svg v-else-if="tab.id === 'rating'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12h4v8H3zM10 8h4v12h-4zM17 4h4v16h-4z"/>
      </svg>
      <svg v-else-if="tab.id === 'profile'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5z"/>
        <path d="M20 21a8 8 0 1 0-16 0"/>
      </svg>
      <svg v-else-if="tab.id === 'edu'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 12l-10 6L2 12l10-6 10 6z"/>
        <path d="M6 18v-5.5"/>
      </svg>
      <!-- Labels removed for a cleaner, icon-only navbar -->
    </router-link>
  </nav>
</template>

<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

const tabs = ref([
  { id: 'feed', path: '/', name: 'Лента' },
  { id: 'tournaments', path: '/tournaments', name: 'Турниры' },
  { id: 'rating', path: '/rating', name: 'Рейтинг' },
  { id: 'profile', path: '/profile', name: 'Профиль' },
  { id: 'edu', path: '/edu', name: 'EDU' },
]);
</script>

<style scoped>
.navbar {
    display: flex;
    justify-content: space-around;
    background: #1a1a1a; /* balanced dark */
    padding-top: 12px;
    padding-bottom: calc(12px + 20px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid #2a2a2a;
}
.nav-btn {
    background: none; border: none; color: #6b7280; font-size: 12px;
    cursor: pointer; display: flex; flex-direction: column;
    align-items: center; gap: 0; flex: 1; text-decoration: none;
    transition: color 0.2s ease;
}
.nav-icon { width: 26px; height: 26px; }
/* Vue Router добавляет этот класс активной ссылке */
.nav-btn.router-link-exact-active {
    color: #8b5cf6;
}
</style>