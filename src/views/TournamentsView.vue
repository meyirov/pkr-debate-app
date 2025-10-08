<template>
  <div class="tournaments-page">
    <div class="controls-container">
      <div class="tabs">
        <button @click="isArchive = false" :class="{ active: !isArchive }">Активные</button>
        <button @click="isArchive = true" :class="{ active: isArchive }">Архив</button>
      </div>
      <div class="filters">
        <select v-model="filterCity">
          <option value="all">Все города</option>
          <option v-for="city in availableCities" :key="city" :value="city">{{ city }}</option>
        </select>
        <select v-model="filterScale">
          <option value="all">Все масштабы</option>
          <option v-for="scale in availableScales" :key="scale" :value="scale">{{ scale }}</option>
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
        <div class="tournament-card-insta">
          <div class="card-image-container">
            <img 
              :src="tournament.logo || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9InVybCgjZ3JhZCkiLz4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ3JhZCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiMzNzNkNWY7c3RvcC1vcGFjaXR5OjEiIC8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6IzdlM2FlZDtzdG9wLW9wYWNpdHk6MSIgLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIiBmb250LXNpemU9IjI0cHgiIGZvbnQtd2VpZ2h0PSJib2xkIj5Mb2dvIG5vdCBmb3VuZDwvdGV4dD4KPC9zdmc+'" 
              class="card-img" 
              alt="Логотип турнира"
            >
          </div>
          <div class="card-content">
            <h3 class="tournament-name">{{ tournament.name }}</h3>
            <div class="meta-row">
              <span class="chip chip-scale">{{ tournament.scale }}</span>
              <span class="chip chip-city">{{ tournament.city }}</span>
              <span class="spacer"></span>
              <span class="date-chip">{{ new Date(tournament.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) }}</span>
            </div>
          </div>
        </div>
      </router-link>
      <p v-if="filteredTournaments.length === 0 && !tournamentsStore.isLoading" class="no-tournaments">Турниры не найдены.</p>
    </div>

    <!-- Navigate to dedicated creation page -->
    <router-link to="/tournaments/new" class="fab">+</router-link>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useTournamentsStore } from '@/stores/tournaments';

const tournamentsStore = useTournamentsStore();
const isArchive = ref(false);
const filterCity = ref('all');
const filterScale = ref('all');

const availableCities = computed(() => {
  const cities = tournamentsStore.allTournaments.map(t => t.city);
  return [...new Set(cities)].sort();
});
const availableScales = computed(() => {
  const scales = tournamentsStore.allTournaments.map(t => t.scale);
  return [...new Set(scales)].sort();
});

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
.tournaments-page {
  background-color: #121212;
  min-height: 100vh;
  padding: 15px;
  padding-bottom: 100px; /* Space for navbar */
}

.controls-container {
  margin-bottom: 20px;
}

.tabs {
  display: flex;
  background-color: #1e1e1e;
  border-radius: 10px;
  padding: 5px;
  margin-bottom: 15px;
}

.tabs button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: #888;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.tabs button.active {
  background-color: #7c3aed;
  color: #fff;
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);
}

.filters {
  display: flex;
  gap: 10px;
}

.filters select {
  flex: 1;
  padding: 12px;
  background-color: #1e1e1e;
  border: 1px solid #333;
  color: #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 1em;
}

.tournament-list {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.tournament-card-link {
  text-decoration: none;
  color: inherit;
}

.tournament-card-insta {
  background-color: #1e1e1e;
  border-radius: 16px;
  border: 1px solid #333;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: relative;
  overflow: visible; /* allow outer glow to be visible */
}

/* Outer neon border glow */
.tournament-card-insta::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 18px;
  background: conic-gradient(from 180deg at 50% 50%, rgba(124,58,237,0.9), rgba(55,61,95,0.6), rgba(124,58,237,0.9));
  filter: blur(14px);
  opacity: 0.28;
  transition: opacity 0.3s ease, filter 0.3s ease;
  z-index: 0;
}

/* Inner soft light at the bottom for depth */
.tournament-card-insta::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background: radial-gradient(120% 70% at 50% 120%, rgba(124,58,237,0.18), transparent 60%);
  pointer-events: none;
  z-index: 0;
}

.tournament-card-insta:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 32px rgba(124, 58, 237, 0.45);
  border-color: #7c3aed;
}

.tournament-card-insta:hover::before {
  opacity: 0.5;
  filter: blur(18px);
}

/* Subtle continuous neon pulse */
@keyframes neonPulse {
  0%, 100% { box-shadow: 0 0 0 rgba(124,58,237,0.0); }
  50% { box-shadow: 0 0 18px rgba(124,58,237,0.25); }
}

.tournament-card-insta {
  animation: neonPulse 3.2s ease-in-out infinite;
}

/* Ensure content sits above glow layers */
.card-image-container, .card-content { position: relative; z-index: 1; }

.card-image-container {
  width: 100%;
  aspect-ratio: 1 / 1; /* Enforce square ratio */
  border-radius: 16px 16px 0 0;
  overflow: hidden;
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: cover; /* Cover the square area */
  transition: transform 0.4s ease;
}
.tournament-card-insta:hover .card-img {
  transform: scale(1.05);
}

.card-content {
  padding: 15px;
}

.tournament-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 15px 0;
  line-height: 1.3;
}

/* Single-line meta row */
.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.meta-row .spacer { flex: 1 1 auto; }
.meta-row .chip, .meta-row .date-chip { flex-shrink: 0; }

.chip {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid;
}

.chip-scale {
  background-color: rgba(124, 58, 237, 0.1);
  border-color: rgba(124, 58, 237, 0.5);
  color: #a77dff;
}

.chip-city {
  background-color: rgba(100, 100, 100, 0.2);
  border-color: rgba(150, 150, 150, 0.5);
  color: #ccc;
}

.date-chip {
  background-color: #ffd700;
  color: #121212;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
}

.no-tournaments {
  color: #888;
  text-align: center;
  padding: 40px;
}

.fab {
  position: fixed;
  bottom: 80px; /* Adjust to be above the main navbar */
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #7c3aed;
  color: white;
  border: none;
  font-size: 2rem;
  line-height: 56px;
  text-align: center;
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.5);
  cursor: pointer;
  z-index: 1000;
  text-decoration: none; /* router-link */
  display: inline-block;
}
</style>