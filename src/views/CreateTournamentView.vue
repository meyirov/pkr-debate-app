<template>
  <div class="create-tournament-page">
    <div class="page-header">
      <router-link to="/tournaments" class="back-button">←</router-link>
      <h1 class="page-title">Создать новый турнир</h1>
    </div>
    <CreateTournamentForm @close="navigateToTournaments" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import CreateTournamentForm from '@/components/CreateTournamentForm.vue';

const router = useRouter();

const navigateToTournaments = () => {
  router.push('/tournaments');
};
</script>

<style scoped>
.create-tournament-page {
  background-color: #121212;
  min-height: 100vh;
  padding: 20px;
  color: #e0e0e0;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
}

.back-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: #1e1e1e;
  border: 1px solid #333;
  border-radius: 50%;
  color: #e0e0e0;
  font-size: 1.5rem;
  text-decoration: none;
  transition: background-color 0.2s;
}

.back-button:hover {
  background-color: #2a2a2a;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}
</style>
