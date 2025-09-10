<template>
  <div v-if="userStore.isLoading" class="loading-screen">
    <h2>PKR Debates</h2>
    <p>Проверка пользователя...</p>
  </div>

  <RegistrationModal v-else-if="userStore.showRegistrationModal" />

  <div v-else class="app-container">
    <main class="main-content">
      <RouterView />
    </main>
    <TheNavbar />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { useUserStore } from '@/stores/user';
import TheNavbar from '@/components/TheNavbar.vue';
import RegistrationModal from '@/components/RegistrationModal.vue';

const userStore = useUserStore();

onMounted(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
      tg.ready();
      tg.expand();
  }
  userStore.checkUserProfile();
});
</script>

<style>
/* Глобальные стили для основного контейнера */
.app-container { display: flex; flex-direction: column; flex: 1; height: 100vh; overflow: hidden; }
.main-content { flex: 1; padding: 10px; padding-bottom: 80px; overflow-y: auto; }
.loading-screen {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100vh; text-align: center;
}
</style>