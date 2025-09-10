<template>
  <nav class="navbar">
    <router-link v-for="tab in tabs" :key="tab.id" :to="tab.path" class="nav-btn">
      <span>{{ tab.icon }}</span>
      {{ tab.name }}
    </router-link>
  </nav>
</template>

<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

const tabs = ref([
  { id: 'feed', path: '/', icon: '🏠', name: 'Лента' },
  { id: 'tournaments', path: '/tournaments', icon: '🏆', name: 'Турниры' },
  { id: 'rating', path: '/rating', icon: '⭐', name: 'Рейтинг' },
  { id: 'profile', path: '/profile', icon: '👤', name: 'Профиль' },
  { id: 'edu', path: '/edu', icon: '📚', name: 'EDU' },
]);
</script>

<style scoped>
.navbar {
    display: flex;
    justify-content: space-around;
    background: #0f0f0f;
    padding-top: 10px;
    padding-bottom: 10px;
    border-top: 1px solid #262626;
}
.nav-btn {
    background: none; border: none; color: #6b7280; font-size: 12px;
    cursor: pointer; display: flex; flex-direction: column;
    align-items: center; gap: 4px; flex: 1; text-decoration: none;
    transition: color 0.2s ease;
}
.nav-btn span { font-size: 24px; }
/* Vue Router добавляет этот класс активной ссылке */
.nav-btn.router-link-exact-active {
    color: #8b5cf6;
}
</style>