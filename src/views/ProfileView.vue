<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useUserStore } from '@/stores/user';
import { supabase } from '@/supabase';

const userStore = useUserStore();

// --- Static Data for Dropdowns ---
const cities = ['Алматы', 'Астана'];
const clubsByCity = {
  'Алматы': [
    'SDU QAZAQ DC',
    'ТЭО ЖПМ',
    'Алтын Сапа ИПК',
    'Sirius IDC',
    'UIB DC',
    'Парасатты НЛО',
    'Атамекен ИПК',
    'Жастар ИПК',
    'Energo DC',
    'Technokrat',
    'President LDC',
    'KBTU DC',
    'Патриот',
    'Alma Mater LDC',
    'Нұр-Мүбәрәк',
    'КАУ'
  ],
  'Астана': ['Орда', 'Astana'],
  // Add more cities with their clubs as data becomes available
};

// --- Reactive Data ---
const isEditing = ref(false);
const editableFullname = ref('');
const editableCity = ref('');
const editableClub = ref('');

// --- Computed Properties ---
const userData = computed(() => userStore.userData);

const userInitials = computed(() => {
  if (userData.value?.fullname) {
    const names = userData.value.fullname.split(' ');
    return names.map(n => n[0]).join('').toUpperCase();
  }
  return '...';
});

const availableClubs = computed(() => {
  return clubsByCity[editableCity.value] || [];
});

const isTelegramLinked = computed(() => !!userData.value?.chat_id);

// --- Watchers ---
watch(editableCity, (newCity) => {
  // Reset club if it's not in the new city's list
  if (!availableClubs.value.includes(editableClub.value)) {
    editableClub.value = '';
  }
});

// --- Methods ---
const startEditing = () => {
  isEditing.value = true;
  editableFullname.value = userData.value?.fullname || '';
  editableCity.value = userData.value?.city || '';
  editableClub.value = userData.value?.club || '';
};

const cancelEditing = () => {
  isEditing.value = false;
};

const saveChanges = async () => {
  if (!editableFullname.value.trim()) {
    alert('Имя не может быть пустым.');
    return;
  }
  
  try {
    const updates = {
      fullname: editableFullname.value.trim(),
      city: editableCity.value.trim(),
      club: editableClub.value.trim(),
    };
    
    console.log('Attempting to update profile:', {
      telegram_username: userData.value.telegram_username,
      updates: updates
    });
    
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('telegram_username', userData.value.telegram_username)
      .select();
      
    console.log('Update result:', { data, error });
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      throw new Error(`No profile found with telegram_username: ${userData.value.telegram_username}`);
    }
    
    // Optimistically update local state
    userStore.userData.fullname = updates.fullname;
    userStore.userData.city = updates.city;
    userStore.userData.club = updates.club;
    
    isEditing.value = false;
    alert('Профиль успешно обновлен!');
  } catch (error) {
    console.error('Ошибка при обновлении профиля:', error);
    alert(`Не удалось обновить профиль: ${error.message}`);
  }
};

const linkTelegram = () => {
  alert('Функция привязки Telegram в разработке.');
};

// --- Language Switcher ---
const selectedLanguage = ref('ru');
const switchLanguage = (lang) => {
  selectedLanguage.value = lang;
  // Here you would integrate with vue-i18n
  console.log(`Language switched to ${lang}`);
};

// --- Lifecycle Hooks ---
onMounted(() => {
  if (!userStore.userData) {
    userStore.checkUserProfile();
  }
});
</script>

<template>
  <div class="profile-page">
    <!-- Steam-like Header -->
    <div class="profile-header-steam">
      <div class="avatar-container">
        <div class="avatar-circle">
          <span class="avatar-initials">{{ userInitials }}</span>
        </div>
        <div class="online-status"></div>
      </div>
      <div class="user-meta">
        <h1 class="username-steam">{{ userData?.fullname || 'Загрузка...' }}</h1>
        <div class="profile-meta-info">
          <span class="meta-item">📍 {{ userData?.city || 'Город не указан' }}</span>
          <span class="meta-item">🛡️ {{ userData?.club || 'Клуб не указан' }}</span>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="profile-grid">
      <!-- Left Column: Stats & Activity -->
      <div class="profile-column">
        <!-- Statistics Card -->
        <div class="profile-card-steam">
          <h2 class="card-title">Статистика игрока</h2>
          <div class="stats-grid-steam">
            <div class="stat-item-steam">
              <span class="stat-value">0</span>
              <span class="stat-label">Турниров</span>
            </div>
            <div class="stat-item-steam">
              <span class="stat-value">0</span>
              <span class="stat-label">Побед</span>
            </div>
            <div class="stat-item-steam">
              <span class="stat-value">0</span>
              <span class="stat-label">Очков рейтинга</span>
            </div>
            <div class="stat-item-steam">
              <span class="stat-value">#--</span>
              <span class="stat-label">Место в рейтинге</span>
            </div>
          </div>
          <p class="stats-footnote">Статистика начнет собираться с вашим первым турниром.</p>
        </div>

        <!-- Recent Activity Card (Placeholder) -->
        <div class="profile-card-steam">
          <h2 class="card-title">Последняя активность</h2>
          <div class="activity-placeholder">
            <p>Здесь будет отображаться ваша последняя активность в турнирах.</p>
          </div>
        </div>
      </div>

      <!-- Right Column: Info & Settings -->
      <div class="profile-column">
        <!-- Personal Info Card -->
        <div class="profile-card-steam">
          <div class="card-header-flex">
            <h2 class="card-title">Личная информация</h2>
            <button v-if="!isEditing" @click="startEditing" class="edit-btn">✏️</button>
          </div>
          <div v-if="!isEditing" class="info-view">
            <div class="info-row"><strong>Полное имя:</strong><span>{{ userData?.fullname || 'Не указано' }}</span></div>
            <div class="info-row"><strong>Город:</strong><span>{{ userData?.city || 'Не указан' }}</span></div>
            <div class="info-row"><strong>Клуб:</strong><span>{{ userData?.club || 'Не указан' }}</span></div>
            <div class="info-row"><strong>Telegram:</strong><span :class="{ 'linked': isTelegramLinked, 'unlinked': !isTelegramLinked }">{{ isTelegramLinked ? `@${userData?.telegram_username}` : 'Не привязан' }}</span></div>
          </div>
          <div v-else class="info-edit">
            <label for="fullname">Полное имя</label>
            <input id="fullname" type="text" v-model="editableFullname" placeholder="Имя Фамилия">
            
            <label for="city">Город</label>
            <select id="city" v-model="editableCity">
              <option disabled value="">Выберите город</option>
              <option v-for="city in cities" :key="city" :value="city">{{ city }}</option>
            </select>

            <label for="club">Клуб</label>
            <select id="club" v-model="editableClub" :disabled="!editableCity || availableClubs.length === 0">
              <option disabled value="">
                {{ availableClubs.length > 0 ? 'Выберите клуб' : 'Для этого города клубы не указаны' }}
              </option>
              <option v-for="club in availableClubs" :key="club" :value="club">{{ club }}</option>
            </select>
            
            <div class="edit-actions">
              <button @click="saveChanges" class="btn-save">Сохранить</button>
              <button @click="cancelEditing" class="btn-cancel">Отмена</button>
            </div>
          </div>
        </div>

        <!-- Settings Card -->
        <div class="profile-card-steam">
          <h2 class="card-title">Настройки</h2>
          <div class="settings-content">
            <label>Язык интерфейса</label>
            <div class="language-switcher">
              <button 
                :class="{ active: selectedLanguage === 'ru' }" 
                @click="switchLanguage('ru')"
              >
                Русский
              </button>
              <button 
                :class="{ active: selectedLanguage === 'kz' }" 
                @click="switchLanguage('kz')"
              >
                Қазақша
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  padding: 20px;
  background: #1b2838;
  color: #c7d5e0;
  min-height: 100vh;
}

/* Steam-like Header */
.profile-header-steam {
  background: linear-gradient(to right, #1a2a3a, #172533);
  padding: 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 20px;
  border: 1px solid #2a3f56;
  margin-bottom: 24px;
}

.avatar-container {
  position: relative;
}

.avatar-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(145deg, #7c3aed, #5a28a9);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid #a77dff;
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.5);
}

.avatar-initials {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
}

.online-status {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  background-color: #57cbde; /* Steam online color */
  border-radius: 50%;
  border: 3px solid #1a2a3a;
}

.user-meta {
  display: flex;
  flex-direction: column;
}

.username-steam {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px 0;
}

.profile-meta-info {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #a0a0c0;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Main Grid */
.profile-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

.profile-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-card-steam {
  background: #172533;
  border: 1px solid #2a3f56;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 16px 0;
  border-bottom: 1px solid #2a3f56;
  padding-bottom: 12px;
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.edit-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  filter: grayscale(100%);
  transition: filter 0.3s;
}

.edit-btn:hover {
  filter: grayscale(0%);
}


/* Stats Card */
.stats-grid-steam {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-item-steam {
  background: #1b2838;
  padding: 16px;
  border-radius: 6px;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #7c3aed;
}

.stat-label {
  font-size: 13px;
  color: #a0a0c0;
}

.stats-footnote {
  font-size: 12px;
  color: #a0a0c0;
  text-align: center;
  margin-top: 16px;
}

/* Activity Card */
.activity-placeholder {
  text-align: center;
  padding: 20px;
  color: #a0a0c0;
}


/* Info Card */
.info-view .info-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #2a3f56;
}
.info-view .info-row:last-child {
  border-bottom: none;
}
.info-row strong {
  color: #a0a0c0;
}
.info-row span {
  color: #fff;
}
.info-row .linked {
  color: #57cbde;
}
.info-row .unlinked {
  color: #ff6b6b;
}


/* Edit Mode */
.info-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-edit label {
  font-size: 13px;
  color: #a0a0c0;
}

.info-edit input, .info-edit select {
  width: 100%;
  padding: 10px;
  background: #1b2838;
  border: 1px solid #2a3f56;
  border-radius: 4px;
  color: #c7d5e0;
  font-size: 14px;
}

.info-edit input:focus, .info-edit select:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.3);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.btn-save, .btn-cancel {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
}

.btn-save {
  background: #7c3aed;
  color: #fff;
}

.btn-cancel {
  background: #4a5568;
  color: #c7d5e0;
}

/* Settings Card */
.settings-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.language-switcher {
  display: flex;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #2a3f56;
}

.language-switcher button {
  flex: 1;
  padding: 10px;
  background: #1b2838;
  border: none;
  color: #a0a0c0;
  cursor: pointer;
  transition: background-color 0.3s;
}

.language-switcher button.active {
  background: #7c3aed;
  color: #fff;
  font-weight: 600;
}

</style>