<template>
  <div v-if="userStore.isLoading" class="loading-screen">
    <h2>PKR Debates</h2>
    <p>Проверка пользователя...</p>
  </div>

  <RegistrationModal v-else-if="userStore.showRegistrationModal" />

  <div v-else class="app-container">
    <AppHeader />
    <main class="main-content">
      <!-- For post detail, keep FeedView alive underneath and show overlay -->
      <template v-if="route.name === 'post-detail'">
        <KeepAlive>
          <FeedView />
        </KeepAlive>
        <PostDetailView />
      </template>
      <!-- For all other routes (including feed), render the routed view only (single instance) -->
      <template v-else>
        <RouterView />
      </template>

      <!-- Global Floating Compose Button (visible on feed and detail) -->
      <button v-if="route.name === 'feed' || route.name === 'post-detail'"
              class="fab-compose"
              @click="openCompose"
              aria-label="Написать пост">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </main>
    <TheNavbar />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import TheNavbar from '@/components/TheNavbar.vue';
import AppHeader from '@/components/AppHeader.vue';
import RegistrationModal from '@/components/RegistrationModal.vue';
import FeedView from '@/views/FeedView.vue';
import PostDetailView from '@/views/PostDetailView.vue';

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

const openCompose = () => {
  router.push('/compose');
};

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
.main-content { flex: 1; padding: 0; padding-bottom: 80px; overflow-y: auto; height: 100vh; padding-top: 56px; transition: padding-top 180ms ease-in-out; }
/* When header is hidden, allow content to move up */
body.header-hidden .main-content { padding-top: 0; }
.loading-screen {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100vh; text-align: center;
}

/* Router transitions removed - handled at component level */
</style>