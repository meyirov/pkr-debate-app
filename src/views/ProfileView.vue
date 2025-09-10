<template>
  <div class="profile-container">
    <div class="profile-header">
      <h2 class="profile-title">👤 Профиль</h2>
      <div class="profile-status" :class="{ 'linked': isTelegramLinked, 'unlinked': !isTelegramLinked }">
        <span v-if="isTelegramLinked" class="status-icon">✅</span>
        <span v-else class="status-icon">⚠️</span>
        <span class="status-text">
          {{ isTelegramLinked ? 'Telegram привязан' : 'Telegram не привязан' }}
        </span>
      </div>
    </div>

    <div class="profile-content">
      <!-- User Information Card -->
      <div class="profile-card">
        <div class="card-header">
          <h3>Личная информация</h3>
          <button 
            v-if="!isEditing" 
            @click="startEditing" 
            class="edit-button"
          >
            ✏️ Изменить
          </button>
        </div>
        
        <div class="user-info">
          <div class="info-item">
            <label>Username:</label>
            <span class="username">{{ userData?.telegram_username || 'Не указан' }}</span>
          </div>
          
          <div class="info-item">
            <label>Chat ID:</label>
            <span class="chat-id">
              {{ userData?.chat_id ? `Привязан (ID: ${userData.chat_id})` : 'Не привязан' }}
            </span>
          </div>
          
          <div class="info-item">
            <label>Полное имя:</label>
            <div v-if="!isEditing" class="fullname-display">
              {{ userData?.fullname || 'Не указано' }}
            </div>
            <div v-else class="fullname-edit">
              <input 
                v-model="editingFullname" 
                type="text" 
                placeholder="Введите имя и фамилию"
                class="fullname-input"
              />
              <div class="edit-actions">
                <button @click="saveChanges" class="save-button">💾 Сохранить</button>
                <button @click="cancelEditing" class="cancel-button">❌ Отмена</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Telegram Binding Card -->
      <div v-if="!isTelegramLinked" class="profile-card telegram-card">
        <div class="card-header">
          <h3>🔗 Привязка Telegram</h3>
        </div>
        <div class="telegram-info">
          <p class="warning-text">
            📢 Для получения уведомлений о турнирах и результатах привяжите свой Telegram аккаунт!
          </p>
          <button @click="linkTelegram" class="link-telegram-button">
            🔗 Привязать Telegram
          </button>
        </div>
      </div>

      <!-- User Statistics Card -->
      <div class="profile-card stats-card">
        <div class="card-header">
          <h3>📊 Статистика</h3>
        </div>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-number">{{ userStats.tournamentsParticipated }}</div>
            <div class="stat-label">Турниров участвовал</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">{{ userStats.tournamentsWon }}</div>
            <div class="stat-label">Турниров выиграл</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">{{ userStats.totalPoints }}</div>
            <div class="stat-label">Всего очков</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">{{ userStats.currentRank }}</div>
            <div class="stat-label">Текущий рейтинг</div>
          </div>
        </div>
      </div>

      <!-- Recent Activity Card -->
      <div class="profile-card activity-card">
        <div class="card-header">
          <h3>🎯 Последняя активность</h3>
        </div>
        <div class="activity-list">
          <div v-if="recentActivity.length === 0" class="no-activity">
            <p>Пока нет активности</p>
          </div>
          <div v-else>
            <div 
              v-for="activity in recentActivity" 
              :key="activity.id"
              class="activity-item"
            >
              <div class="activity-icon">{{ activity.icon }}</div>
              <div class="activity-content">
                <div class="activity-title">{{ activity.title }}</div>
                <div class="activity-date">{{ formatDate(activity.date) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Card -->
      <div class="profile-card settings-card">
        <div class="card-header">
          <h3>⚙️ Настройки</h3>
        </div>
        <div class="settings-list">
          <div class="setting-item">
            <label class="setting-label">
              <input 
                type="checkbox" 
                v-model="settings.notifications"
                @change="updateSettings"
              />
              <span class="checkmark"></span>
              Уведомления о турнирах
            </label>
          </div>
          <div class="setting-item">
            <label class="setting-label">
              <input 
                type="checkbox" 
                v-model="settings.resultsNotifications"
                @change="updateSettings"
              />
              <span class="checkmark"></span>
              Уведомления о результатах
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { supabase } from '@/supabase';

const userStore = useUserStore();

// Reactive data
const isEditing = ref(false);
const editingFullname = ref('');
const settings = ref({
  notifications: true,
  resultsNotifications: true
});

// Mock data for statistics and activity (in real app, this would come from API)
const userStats = ref({
  tournamentsParticipated: 12,
  tournamentsWon: 3,
  totalPoints: 1250,
  currentRank: 15
});

const recentActivity = ref([
  {
    id: 1,
    icon: '🏆',
    title: 'Участие в турнире "Весенний кубок"',
    date: new Date('2024-03-15')
  },
  {
    id: 2,
    icon: '📊',
    title: 'Результаты опубликованы',
    date: new Date('2024-03-10')
  },
  {
    id: 3,
    icon: '🎯',
    title: 'Регистрация на турнир "Летний чемпионат"',
    date: new Date('2024-03-05')
  }
]);

// Computed properties
const userData = computed(() => userStore.userData);

const isTelegramLinked = computed(() => {
  return userData.value?.chat_id && userData.value.chat_id !== null;
});

// Methods
const startEditing = () => {
  isEditing.value = true;
  editingFullname.value = userData.value?.fullname || '';
};

const cancelEditing = () => {
  isEditing.value = false;
  editingFullname.value = '';
};

const saveChanges = async () => {
  if (!editingFullname.value.trim()) {
    alert('Введите имя!');
    return;
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ fullname: editingFullname.value.trim() })
      .eq('telegram_username', userData.value.telegram_username);

    if (error) throw error;

    // Update local user data
    userStore.userData.fullname = editingFullname.value.trim();
    isEditing.value = false;
    
    alert('Имя обновлено!');
  } catch (error) {
    alert('Ошибка: ' + error.message);
  }
};

const linkTelegram = async () => {
  const tg = window.Telegram?.WebApp;
  
  if (!tg?.initDataUnsafe?.user?.id) {
    alert('Ошибка: данные Telegram недоступны');
    return;
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ chat_id: tg.initDataUnsafe.user.id.toString() })
      .eq('telegram_username', userData.value.telegram_username);

    if (error) throw error;

    // Update local user data
    userStore.userData.chat_id = tg.initDataUnsafe.user.id.toString();
    
    alert('Telegram успешно привязан!');
  } catch (error) {
    alert('Ошибка привязки Telegram: ' + error.message);
  }
};

const updateSettings = async () => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ 
        settings: {
          notifications: settings.value.notifications,
          resultsNotifications: settings.value.resultsNotifications
        }
      })
      .eq('telegram_username', userData.value.telegram_username);

    if (error) throw error;
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
  }
};

const formatDate = (date) => {
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
};

const loadUserStats = async () => {
  // In a real app, this would fetch actual statistics from the database
  // For now, we'll use mock data
  try {
    // Example of how to fetch real stats:
    // const { data: tournaments } = await supabase
    //   .from('tournament_registrations')
    //   .select('*')
    //   .eq('speaker1_username', userData.value.telegram_username)
    //   .or(`speaker2_username.eq.${userData.value.telegram_username}`);
    
    // userStats.value.tournamentsParticipated = tournaments.length;
  } catch (error) {
    console.error('Ошибка загрузки статистики:', error);
  }
};

const loadUserSettings = async () => {
  try {
    if (userData.value?.settings) {
      settings.value = {
        notifications: userData.value.settings.notifications ?? true,
        resultsNotifications: userData.value.settings.resultsNotifications ?? true
      };
    }
  } catch (error) {
    console.error('Ошибка загрузки настроек:', error);
  }
};

onMounted(() => {
  loadUserStats();
  loadUserSettings();
});
</script>

<style scoped>
.profile-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
  min-height: 100vh;
}

.profile-header {
  text-align: center;
  margin-bottom: 30px;
}

.profile-title {
  font-size: 2.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 15px;
}

.profile-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.9rem;
}

.profile-status.linked {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.profile-status.unlinked {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.profile-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-card {
  background: linear-gradient(135deg, #222, #333);
  border-radius: 15px;
  padding: 25px;
  border: 1px solid #444;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.profile-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(255, 215, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #444;
}

.card-header h3 {
  color: #FFD700;
  font-size: 1.3rem;
  font-weight: 600;
  margin: 0;
}

.edit-button {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.edit-button:hover {
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  transform: translateY(-1px);
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-item label {
  color: #aaa;
  font-weight: 600;
  font-size: 0.9rem;
}

.username, .chat-id, .fullname-display {
  color: #fff;
  font-weight: 500;
  font-size: 1rem;
}

.fullname-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fullname-input {
  padding: 12px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #222;
  color: #fff;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.fullname-input:focus {
  outline: none;
  border-color: #FFD700;
  box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.2);
}

.edit-actions {
  display: flex;
  gap: 10px;
}

.save-button, .cancel-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.save-button {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
}

.save-button:hover {
  background: linear-gradient(135deg, #16a34a, #15803d);
  transform: translateY(-1px);
}

.cancel-button {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
}

.cancel-button:hover {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  transform: translateY(-1px);
}

.telegram-card {
  border-color: #ef4444;
  background: linear-gradient(135deg, #2a1a1a, #3a1a1a);
}

.warning-text {
  color: #fbbf24;
  font-weight: 500;
  margin-bottom: 15px;
  text-align: center;
}

.link-telegram-button {
  width: 100%;
  background: linear-gradient(135deg, #0088cc, #0066aa);
  color: white;
  border: none;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.link-telegram-button:hover {
  background: linear-gradient(135deg, #0066aa, #004488);
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 136, 204, 0.3);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
}

.stat-item {
  text-align: center;
  padding: 15px;
  background: rgba(255, 215, 0, 0.05);
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: #FFD700;
  margin-bottom: 5px;
}

.stat-label {
  color: #aaa;
  font-size: 0.8rem;
  font-weight: 500;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.no-activity {
  text-align: center;
  color: #666;
  font-style: italic;
  padding: 20px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  border: 1px solid #333;
  transition: background-color 0.3s ease;
}

.activity-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.activity-icon {
  font-size: 1.5rem;
  width: 40px;
  text-align: center;
}

.activity-content {
  flex: 1;
}

.activity-title {
  color: #fff;
  font-weight: 500;
  margin-bottom: 5px;
}

.activity-date {
  color: #aaa;
  font-size: 0.8rem;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.setting-item {
  display: flex;
  align-items: center;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  color: #fff;
  font-weight: 500;
}

.setting-label input[type="checkbox"] {
  appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid #444;
  border-radius: 4px;
  background: #222;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
}

.setting-label input[type="checkbox"]:checked {
  background: #FFD700;
  border-color: #FFD700;
}

.setting-label input[type="checkbox"]:checked::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #000;
  font-weight: bold;
  font-size: 12px;
}

/* Responsive design */
@media (max-width: 768px) {
  .profile-container {
    padding: 15px;
  }
  
  .profile-title {
    font-size: 2rem;
  }
  
  .card-header {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .edit-actions {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .profile-title {
    font-size: 1.8rem;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .activity-item {
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }
}
</style>