<template>
  <div class="rating-container">
    <!-- Season Info Header -->
    <div class="season-header">
      <div class="time-display">
        {{ timeStore.currentTime.toLocaleTimeString('ru-RU') }}
      </div>
      <div class="season-info-main">
        <div v-if="timeStore.currentSeason">
          <h3 class="season-name">{{ timeStore.currentSeason.name }}</h3>
          <div class="progress-bar-container">
            <div class="progress-bar" :style="{ width: timeStore.seasonProgress + '%' }"></div>
          </div>
          <div class="season-details">
            <span>Прогресс: {{ timeStore.seasonProgress.toFixed(1) }}%</span>
            <span>Дней до конца: {{ timeStore.daysToSeasonEnd }}</span>
          </div>
        </div>
        <div v-else class="no-season">
          <p>Межсезонье</p>
        </div>
      </div>
      <div class="placeholder"></div> <!-- to balance flexbox -->
    </div>

    <!-- City Selection View -->
    <div v-if="currentView === 'cities'" class="cities-view">
      <div class="rating-header">
        <h2 class="rating-title">🏆 Рейтинг спикеров</h2>
        <p class="rating-subtitle">Выберите город для просмотра рейтинга</p>
      </div>

      <div class="cities-grid">
        <div
          v-for="city in cities"
          :key="city.id"
          @click="selectCity(city)"
          class="city-card"
        >
          <div class="city-icon">{{ city.icon }}</div>
          <h3 class="city-name">{{ city.name }}</h3>
          <p class="city-description">{{ city.description }}</p>
          <div class="city-stats">
            <span class="stat">{{ city.speakersCount }} спикеров</span>
            <span class="stat">{{ city.clubsCount }} клубов</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Season Selection View -->
    <div v-else-if="currentView === 'seasons'" class="seasons-view">
      <div class="rating-header">
        <button @click="goBackToCities" class="back-button">
          ← Назад к городам
        </button>
        <h2 class="rating-title">🏆 {{ selectedCity.name }}</h2>
        <p class="rating-subtitle">Выберите сезон для просмотра рейтинга</p>
      </div>

      <div class="seasons-grid">
        <div
          v-for="season in seasons"
          :key="season.id"
          @click="selectSeason(season)"
          class="season-card"
          :class="{ 'current-season': timeStore.currentSeason && timeStore.currentSeason.name.includes(season.name) }"
        >
          <div class="season-badge" v-if="timeStore.currentSeason && timeStore.currentSeason.name.includes(season.name)">Текущий</div>
          <h3 class="season-name">{{ season.name }}</h3>
          <p class="season-period">{{ season.period }}</p>
          <div class="season-stats">
            <span class="stat">{{ season.speakersCount }} спикеров</span>
            <span class="stat">{{ season.tournamentsCount }} турниров</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Results View -->
    <div v-else-if="currentView === 'results'" class="results-view">
      <div class="rating-header">
        <button @click="goBackToSeasons" class="back-button">
          ← Назад к сезонам
        </button>
        <h2 class="rating-title">🏆 {{ selectedCity.name }}</h2>
        <div class="rating-subtitle">
          <span class="season-info">{{ selectedSeason.name }}</span>
          <span class="season-period">{{ selectedSeason.period }}</span>
        </div>
      </div>

      <div class="rating-stats">
        <div class="stat-card">
          <div class="stat-number">{{ currentRatingData.length }}</div>
          <div class="stat-label">Спикеров в рейтинге</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{{ uniqueClubs }}</div>
          <div class="stat-label">Клубов</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{{ topSpeaker.points }}</div>
          <div class="stat-label">Максимум очков</div>
        </div>
      </div>

      <div class="rating-table-container">
        <table class="rating-table">
          <thead>
            <tr>
              <th class="rank-col">Место</th>
              <th class="name-col">Спикер</th>
              <th class="club-col">Клуб</th>
              <th class="points-col">Очки</th>
              <th class="medal-col">Награда</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="speaker in currentRatingData"
              :key="speaker.rank"
              class="rating-row"
              :class="{
                'top-3': speaker.rank <= 3,
                'top-10': speaker.rank <= 10
              }"
            >
              <td class="rank-cell">
                <span class="rank-number">{{ speaker.rank }}</span>
              </td>
              <td class="name-cell">
                <span class="speaker-name">{{ speaker.name }}</span>
              </td>
              <td class="club-cell">
                <span class="club-name">{{ speaker.club }}</span>
              </td>
              <td class="points-cell">
                <span class="points-value">{{ speaker.points }}</span>
              </td>
              <td class="medal-cell">
                <span v-if="speaker.rank === 1" class="medal gold">🥇</span>
                <span v-else-if="speaker.rank === 2" class="medal silver">🥈</span>
                <span v-else-if="speaker.rank === 3" class="medal bronze">🥉</span>
                <span v-else-if="speaker.rank <= 10" class="medal top-10">🏅</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rating-footer">
        <p class="update-info">Последнее обновление: {{ lastUpdate }}</p>
        <p class="season-note">Рейтинг обновляется по результатам турниров</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useTimeStore } from '../stores/time';

const timeStore = useTimeStore();

// Cities data
const cities = [
  {
    id: 'almaty',
    name: 'Алматы',
    icon: '🏔️',
    description: 'Крупнейший город Казахстана',
    speakersCount: 30,
    clubsCount: 10
  },
  {
    id: 'nur-sultan',
    name: 'Нур-Султан',
    icon: '🏛️',
    description: 'Столица Казахстана',
    speakersCount: 25,
    clubsCount: 8
  },
  {
    id: 'shymkent',
    name: 'Шымкент',
    icon: '🌾',
    description: 'Южная столица',
    speakersCount: 20,
    clubsCount: 6
  },
  {
    id: 'aktobe',
    name: 'Актобе',
    icon: '⚡',
    description: 'Западный регион',
    speakersCount: 15,
    clubsCount: 4
  },
  {
    id: 'taraz',
    name: 'Тараз',
    icon: '🏺',
    description: 'Древний город',
    speakersCount: 12,
    clubsCount: 3
  },
  {
    id: 'pavlodar',
    name: 'Павлодар',
    icon: '🏭',
    description: 'Промышленный центр',
    speakersCount: 10,
    clubsCount: 3
  }
];

// Seasons data
const seasons = [
  {
    id: '2024-2025',
    name: '2024-2025',
    period: 'Сентябрь 2024 - Май 2025',
    speakersCount: 30,
    tournamentsCount: 8,
  },
  {
    id: '2025-2026',
    name: '2025-2026',
    period: 'Сентябрь 2025 - Май 2026',
    speakersCount: 0,
    tournamentsCount: 0,
  }
];

// Rating data for different cities and seasons
const ratingData = {
  'almaty': {
    '2024-2025': [
      { name: "Олжас Сейтов", points: 948, rank: 1, club: "Дербес" },
      { name: "Мұхаммедәлі Әлішбаев", points: 936, rank: 2, club: "TЭО" },
      { name: "Нұрболат Тілеубай", points: 872, rank: 3, club: "КБТУ" },
      { name: "Темірлан Есенов", points: 785, rank: 4, club: "TЭО" },
      { name: "Нұрхан Жакен", points: 733, rank: 5, club: "Алтын Сапа" },
      { name: "Динара Әукенова", points: 671.5, rank: 6, club: "TЭО" },
      { name: "Ерасыл Шаймурадов", points: 665, rank: 7, club: "SDU" },
      { name: "Алтынай Қалдыбай", points: 600.5, rank: 8, club: "Дербес" },
      { name: "Жандос Әмре", points: 558, rank: 9, club: "UIB" },
      { name: "Ердаулет Қалмұрат", points: 462, rank: 10, club: "SDU" },
      { name: "Арайлым Абдукаримова", points: 460, rank: 11, club: "TЭО" },
      { name: "Ақылжан Итегулов", points: 440.5, rank: 12, club: "Дербес" },
      { name: "Ерғалым Айтжанов", points: 430.5, rank: 13, club: "ТЭО" },
      { name: "Еламан Әбдіманапов", points: 421, rank: 14, club: "Зиялы Қазақ" },
      { name: "Жансерік Жолшыбек", points: 411, rank: 15, club: "Сириус" },
      { name: "Регина Жардемгалиева", points: 400, rank: 16, club: "ТЭО" },
      { name: "Айдана Мухамет", points: 396, rank: 17, club: "НЛО" },
      { name: "Азамат Арынов", points: 377, rank: 18, club: "SDU" },
      { name: "Адема Сералиева", points: 373.5, rank: 19, club: "ТЭО" },
      { name: "Әлібек Сұлтанов", points: 351, rank: 20, club: "Алтын Сапа" },
      { name: "Гаухар Төлебай", points: 345, rank: 21, club: "SDU" },
      { name: "Әсет Оразғали", points: 336, rank: 22, club: "SDU" },
      { name: "Ислам Аманқос", points: 326.5, rank: 23, club: "SDU" },
      { name: "Арсен Сәуірбай", points: 322.5, rank: 24, club: "SDU" },
      { name: "Дәулет Мырзакулов", points: 282, rank: 25, club: "Алтын Сапа" },
      { name: "Димаш Әшірбек", points: 274, rank: 26, club: "SDU" },
      { name: "Ерлан Бөлекбаев", points: 268, rank: 27, club: "ТЭО" },
      { name: "Ахансері Амиреев", points: 263, rank: 28, club: "Сириус" },
      { name: "Айша Қуандық", points: 255.5, rank: 29, club: "SDU" },
      { name: "Диас Мухамет", points: 254, rank: 30, club: "Технократ" }
    ],
    '2025-2026': [] // Empty for now
  },
  'nur-sultan': {
    '2024-2025': [
      { name: "Айдар Нурланов", points: 850, rank: 1, club: "Астана" },
      { name: "Марат Кенжебаев", points: 820, rank: 2, club: "Столица" },
      { name: "Асель Толеуова", points: 780, rank: 3, club: "Астана" },
      { name: "Данияр Абдуллаев", points: 750, rank: 4, club: "Столица" },
      { name: "Айгуль Сатпаева", points: 720, rank: 5, club: "Астана" }
    ],
    '2025-2026': []
  },
  'shymkent': {
    '2024-2025': [
      { name: "Ерлан Жумабаев", points: 800, rank: 1, club: "Шымкент" },
      { name: "Айнур Касымова", points: 760, rank: 2, club: "Юг" },
      { name: "Максат Абдуллаев", points: 730, rank: 3, club: "Шымкент" }
    ],
    '2025-2026': []
  }
};

// Reactive data
const currentView = ref('cities');
const selectedCity = ref(null);
const selectedSeason = ref(null);

// Computed properties
const currentRatingData = computed(() => {
  if (!selectedCity.value || !selectedSeason.value) return [];
  return ratingData[selectedCity.value.id]?.[selectedSeason.value.id] || [];
});

const uniqueClubs = computed(() => {
  const clubs = [...new Set(currentRatingData.value.map(speaker => speaker.club))];
  return clubs.length;
});

const topSpeaker = computed(() => {
  return currentRatingData.value[0] || { points: 0 };
});

const lastUpdate = computed(() => {
  const now = new Date();
  return now.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Methods
const selectCity = (city) => {
  selectedCity.value = city;
  currentView.value = 'seasons';
};

const selectSeason = (season) => {
  selectedSeason.value = season;
  currentView.value = 'results';
};

const goBackToCities = () => {
  currentView.value = 'cities';
  selectedCity.value = null;
  selectedSeason.value = null;
};

const goBackToSeasons = () => {
  currentView.value = 'seasons';
  selectedSeason.value = null;
};

onMounted(() => {
  timeStore.startClock();
  // Initialize with cities view
  currentView.value = 'cities';
});

onUnmounted(() => {
  timeStore.stopClock();
});
</script>

<style scoped>
.rating-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  padding-bottom: 100px; /* Add padding to avoid overlap with navbar */
  background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
  min-height: 100vh;
}

.season-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 15px 20px;
  margin-bottom: 30px;
  backdrop-filter: blur(10px);
}

.time-display {
  font-family: 'Courier New', Courier, monospace;
  font-size: 1.2rem;
  font-weight: bold;
  color: #22c55e; /* Green accent */
  min-width: 110px;
}

.season-info-main {
  text-align: center;
}

.season-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px 0;
}

.progress-bar-container {
  width: 250px;
  height: 8px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 auto 8px auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #FFD700, #FFA500);
  border-radius: 4px;
  transition: width 0.5s ease-in-out;
}

.season-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #aaa;
}

.no-season p {
  color: #aaa;
  font-style: italic;
  margin: 0;
}

.placeholder {
  min-width: 110px;
}

.rating-header {
  text-align: center;
  margin-bottom: 30px;
}

.rating-title {
  font-size: 2.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 10px;
}

.rating-subtitle {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 20px;
}

.season-info, .city-info {
  background: rgba(255, 215, 0, 0.1);
  color: #FFD700;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.rating-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: linear-gradient(135deg, #222, #333);
  padding: 20px;
  border-radius: 12px;
  text-align: center;
  border: 1px solid #444;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(255, 215, 0, 0.2);
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: #FFD700;
  margin-bottom: 5px;
}

.stat-label {
  color: #aaa;
  font-size: 0.9rem;
  font-weight: 500;
}

/* Cities and Seasons Views */
.cities-grid, .seasons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.city-card, .season-card {
  background: linear-gradient(135deg, #222, #333);
  padding: 25px;
  border-radius: 15px;
  text-align: center;
  border: 1px solid #444;
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.city-card:hover, .season-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 15px 40px rgba(255, 215, 0, 0.2);
  border-color: #FFD700;
}

.city-card::before, .season-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.1), transparent);
  transition: left 0.5s ease;
}

.city-card:hover::before, .season-card:hover::before {
  left: 100%;
}

.city-icon {
  font-size: 3rem;
  margin-bottom: 15px;
  display: block;
}

.city-name, .season-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: #FFD700;
  margin-bottom: 10px;
}

.city-description, .season-period {
  color: #aaa;
  font-size: 0.9rem;
  margin-bottom: 15px;
}

.city-stats, .season-stats {
  display: flex;
  justify-content: space-around;
  gap: 10px;
}

.city-stats .stat, .season-stats .stat {
  background: rgba(255, 215, 0, 0.1);
  color: #FFD700;
  padding: 6px 12px;
  border-radius: 15px;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.season-badge {
  position: absolute;
  top: 15px;
  right: 15px;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
}

.current-season {
  border-color: #22c55e;
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
}

.back-button {
  background: linear-gradient(135deg, #444, #555);
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 20px;
  transition: all 0.3s ease;
}

.back-button:hover {
  background: linear-gradient(135deg, #555, #666);
  transform: translateX(-3px);
}

.rating-table-container {
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #333;
  margin-bottom: 30px;
}

.rating-table {
  width: 100%;
  border-collapse: collapse;
}

.rating-table thead {
  background: linear-gradient(135deg, #333, #444);
}

.rating-table th {
  padding: 15px 12px;
  text-align: left;
  font-weight: 600;
  color: #fff;
  border-bottom: 2px solid #555;
}

.rank-col { width: 80px; }
.name-col { width: 300px; }
.club-col { width: 150px; }
.points-col { width: 100px; }
.medal-col { width: 80px; }

.rating-row {
  transition: background-color 0.3s ease;
  border-bottom: 1px solid #333;
}

.rating-row:hover {
  background: rgba(255, 215, 0, 0.05);
}

.rating-row.top-3 {
  background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), transparent);
}

.rating-row.top-10 {
  background: rgba(255, 215, 0, 0.03);
}

.rating-row.highlighted {
  background: rgba(255, 215, 0, 0.15);
  animation: highlight 0.5s ease;
}

@keyframes highlight {
  0% { background: rgba(255, 215, 0, 0.3); }
  100% { background: rgba(255, 215, 0, 0.15); }
}

.rating-table td {
  padding: 12px;
  vertical-align: middle;
}

.rank-number {
  font-weight: 700;
  font-size: 1.1rem;
  color: #FFD700;
}

.speaker-name {
  font-weight: 600;
  color: #fff;
  font-size: 1rem;
}

.club-name {
  color: #aaa;
  font-size: 0.9rem;
}

.points-value {
  font-weight: 600;
  color: #FFD700;
  font-size: 1.1rem;
}

.medal {
  font-size: 1.5rem;
  display: inline-block;
  animation: medalGlow 2s ease-in-out infinite alternate;
}

@keyframes medalGlow {
  0% { filter: brightness(1); }
  100% { filter: brightness(1.2); }
}

.no-results {
  text-align: center;
  padding: 40px;
  color: #aaa;
  font-size: 1.1rem;
}

.rating-footer {
  text-align: center;
  padding: 20px;
  border-top: 1px solid #333;
  margin-top: 20px;
}

.update-info {
  color: #aaa;
  font-size: 0.9rem;
  margin-bottom: 5px;
}

.season-note {
  color: #666;
  font-size: 0.8rem;
  font-style: italic;
}

/* Responsive design */
@media (max-width: 768px) {
  .rating-container {
    padding: 15px;
  }

  .rating-title {
    font-size: 2rem;
  }

  .rating-subtitle {
    flex-direction: column;
    gap: 10px;
  }

  .cities-grid, .seasons-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .city-card, .season-card {
    padding: 20px;
  }

  .city-icon {
    font-size: 2.5rem;
  }

  .city-name, .season-name {
    font-size: 1.3rem;
  }

  .rating-table-container {
    overflow-x: auto;
  }

  .rating-table {
    min-width: 600px;
  }

  .rating-stats {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .rating-title {
    font-size: 1.8rem;
  }

  .stat-number {
    font-size: 1.5rem;
  }

  .rating-table th,
  .rating-table td {
    padding: 8px 6px;
    font-size: 0.9rem;
  }
}
</style>