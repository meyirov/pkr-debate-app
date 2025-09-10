<template>
  <div>
    <div class="page-header">
      <h2>Турниры</h2>
      <button class="create-btn" @click="isFormVisible = !isFormVisible">
        {{ isFormVisible ? 'Отмена' : 'Создать турнир' }}
      </button>
    </div>

    <CreateTournamentForm v-if="isFormVisible" @close="isFormVisible = false" />

    <div class="controls-container">
      <div class="tabs">
        <button @click="isArchive = false" :class="{ active: !isArchive }">Активные</button>
        <button @click="isArchive = true" :class="{ active: isArchive }">Архив</button>
      </div>
      <div class="filters">
        <select v-model="filterCity">
          <option value="all">Все города</option>
          <option value="Алматы">Алматы</option>
          <option value="Астана">Астана</option>
          <option value="Другой">Другой</option>
        </select>
        <select v-model="filterScale">
          <option value="all">Все масштабы</option>
          <option value="Городской">Городской</option>
          <option value="Республиканский">Республиканский</option>
        </select>
      </div>
    </div>
    
    <div v-if="tournamentsStore.isLoading" class="loading-screen">
      <p>Загрузка турниров...</p>
    </div>
    <div v-else class="tournament-list">
      <router-link 
        v-for="tournament in filteredTournaments" 
        :key="tournament.id"
        :to="`/tournaments/${tournament.id}`"
        class="tournament-card-link"
      >
        <div class="tournament-card">
          <img :src="tournament.logo || 'https://via.placeholder.com/64'" class="tournament-logo" alt="Логотип">
          <div class="tournament-info">
            <strong>{{ tournament.name }}</strong>
            <span>{{ tournament.scale }} | {{ tournament.city }}</span>
            <span>Дата: {{ new Date(tournament.date).toLocaleDateString('ru-RU') }}</span>
          </div>
        </div>
      </router-link>
      <p v-if="filteredTournaments.length === 0 && !tournamentsStore.isLoading">Турниры не найдены.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useTournamentsStore } from '@/stores/tournaments';
import CreateTournamentForm from '@/components/CreateTournamentForm.vue';

const tournamentsStore = useTournamentsStore();
const isFormVisible = ref(false);
const isArchive = ref(false);
const filterCity = ref('all');
const filterScale = ref('all');

const filteredTournaments = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tournamentsStore.allTournaments
    .filter(t => {
      if (!t.date) return false;
      const tournamentDate = new Date(t.date);
      return isArchive.value ? tournamentDate < today : tournamentDate >= today;
    })
    .filter(t => filterCity.value === 'all' || t.city === filterCity.value)
    .filter(t => filterScale.value === 'all' || t.scale === filterScale.value)
    .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return isArchive.value ? dateB - dateA : dateA - dateB;
    });
});

onMounted(() => {
  tournamentsStore.loadTournaments();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 0 10px;
}
.create-btn {
  padding: 8px 16px;
  background: #8b5cf6;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.controls-container {
  background: #1a1a1a;
  padding: 10px;
  border-radius: 12px;
  margin-bottom: 15px;
}
.tabs {
  display: flex;
  background: #262626;
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 10px;
}
.tabs button {
  flex: 1; padding: 8px; background: none; border: none;
  border-radius: 6px; color: #d1d5db; font-size: 14px;
  cursor: pointer; transition: all 0.2s ease;
}
.tabs button.active {
  background: #8b5cf6;
  color: #ffffff;
  font-weight: 600;
}
.filters { display: flex; gap: 10px; }
.filters select {
  flex: 1; padding: 8px; border: 1px solid #333;
  border-radius: 8px; background: #262626;
  color: #e6e6e6; font-size: 14px;
}
.tournament-card {
  display: flex; align-items: center; background: #1a1a1a;
  padding: 15px; margin-bottom: 10px; border-radius: 12px;
  transition: background 0.2s ease;
}
.tournament-card:hover { background: #262626; }
.tournament-card-link {
  text-decoration: none;
  color: inherit;
}
.tournament-logo {
  width: 64px; height: 64px; margin-right: 15px;
  border-radius: 8px; object-fit: cover; background: #262626;
}
.tournament-info strong {
  font-size: 16px; font-weight: 600; color: #ffffff;
  display: block; margin-bottom: 4px;
}
.tournament-info span {
  font-size: 14px; color: #6b7280; display: block;
}
</style>