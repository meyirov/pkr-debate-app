<template>
  <div class="tournament-detail-page">
    <div class="page-header">
      <router-link to="/tournaments" class="back-button">← Все турниры</router-link>
    </div>

    <div v-if="tournamentsStore.isLoading" class="loading-screen">
      <p>Загрузка турнира...</p>
    </div>

    <div v-else-if="tournament" class="tournament-content">
      <div class="tournament-header">
        <img :src="tournament.logo || 'https://via.placeholder.com/128'" alt="Логотип турнира">
        <h1>{{ tournament.name }}</h1>
        <p>{{ tournament.scale }} | {{ tournament.city }}</p>
        <p>Дата: {{ new Date(tournament.date).toLocaleDateString('ru-RU') }}</p>
      </div>
      
      <div class="tournament-description">
        <h3>Описание</h3>
        <p>{{ tournament.desc || 'Описание отсутствует.' }}</p>
      </div>

      <div class="detail-tabs">
        <button @click="activeTab = 'posts'" :class="{ active: activeTab === 'posts' }">Посты</button>
        <button @click="activeTab = 'registration'" :class="{ active: activeTab === 'registration' }">Регистрация</button>
        <button @click="activeTab = 'participants'" :class="{ active: activeTab === 'participants' }">Участники</button>
        <button @click="activeTab = 'bracket'" :class="{ active: activeTab === 'bracket' }">Сетка</button>
      </div>

      <div class="tab-content">
        <div v-if="activeTab === 'posts'">
          <div v-if="isCreator" class="new-post-form">
            <textarea v-model="newPostText" placeholder="Написать объявление от имени турнира..."></textarea>
            <button @click="handlePostSubmit">Опубликовать</button>
          </div>
          <div v-if="tournamentsStore.tournamentPosts.length > 0" class="posts-list">
            <div v-for="post in tournamentsStore.tournamentPosts" :key="post.id" class="post">
              <div class="post-header">
                <strong>{{ tournament.name }}</strong>
                <span class="post-time">{{ new Date(post.timestamp).toLocaleString('ru-RU') }}</span>
              </div>
              <p class="post-text">{{ post.text }}</p>
            </div>
          </div>
          <p v-else>Объявлений от организаторов пока нет.</p>
        </div>

        <div v-if="activeTab === 'registration'">
          <button @click="isRegFormVisible = !isRegFormVisible" class="main-action-btn">
            {{ isRegFormVisible ? 'Скрыть форму' : 'Зарегистрировать команду' }}
          </button>
          <form v-if="isRegFormVisible" @submit.prevent="handleRegistrationSubmit" class="registration-form">
            <input v-model="regForm.faction_name" type="text" placeholder="Название фракции *" required>
            <input v-model="regForm.speaker1_username" type="text" placeholder="Username 1-го спикера (без @) *" required>
            <input v-model="regForm.speaker2_username" type="text" placeholder="Username 2-го спикера (без @) *" required>
            <input v-model="regForm.club" type="text" placeholder="Клуб *" required>
            <input v-model="regForm.city" type="text" placeholder="Город">
            <button type="submit" :disabled="isSubmittingReg">
              {{ isSubmittingReg ? 'Отправка...' : 'Отправить заявку' }}
            </button>
          </form>
          <h3 class="list-header">Зарегистрированные команды ({{ registrations?.length || 0 }})</h3>
          <div class="registration-list">
            <div v-for="reg in registrations" :key="reg.id" class="registration-card">
              <strong>{{ reg.faction_name }}</strong>
              <span>{{ reg.speaker1_username }} & {{ reg.speaker2_username }}</span>
              <small>{{ reg.club }}</small>
            </div>
            <p v-if="!registrations || registrations.length === 0">Пока нет ни одной заявки.</p>
          </div>
        </div>

        <div v-if="activeTab === 'participants'">
          <div v-if="isCreator">
            <div class="admin-panel">
              <div class="tab-stats">
                Зарегистрировано: {{ registrations.length }} | В основе: {{ acceptedTeams.length }} | В резерве: {{ reserveTeams.length }}
              </div>
              <button 
                @click="tournamentsStore.publishTab(Number(tournamentId), !tournament.tab_published)"
                :class="['publish-btn', tournament.tab_published ? 'unpublish' : 'publish']"
              >
                {{ tournament.tab_published ? 'Скрыть ТЭБ' : 'Опубликовать ТЭБ' }}
              </button>
            </div>

            <div v-if="pendingTeams.length > 0">
              <h3 class="list-header">Новые заявки</h3>
              <div class="admin-list">
                <div v-for="reg in pendingTeams" :key="reg.id" class="admin-card">
                  <div class="admin-card-info">
                    <strong>{{ reg.faction_name }}</strong>
                    <span>{{ reg.speaker1_username }} & {{ reg.speaker2_username }}</span>
                  </div>
                  <div class="admin-card-actions">
                    <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'accepted')" class="action-btn accept">✅ В основу</button>
                    <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'reserve')" class="action-btn reserve">🔄 В резерв</button>
                  </div>
                </div>
              </div>
            </div>

            <h3 class="list-header">Основной состав ({{ acceptedTeams.length }})</h3>
            <div class="admin-list">
              <div v-for="reg in acceptedTeams" :key="reg.id" class="admin-card">
                <div class="admin-card-info">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ reg.speaker1_username }} & {{ reg.speaker2_username }}</span>
                </div>
                <div class="admin-card-actions">
                  <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'reserve')" class="action-btn reserve">🔄 В резерв</button>
                  <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'pending')" class="action-btn remove">❌ Убрать</button>
                </div>
              </div>
            </div>

            <h3 class="list-header">Резерв ({{ reserveTeams.length }})</h3>
            <div class="admin-list">
               <div v-for="reg in reserveTeams" :key="reg.id" class="admin-card">
                <div class="admin-card-info">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ reg.speaker1_username }} & {{ reg.speaker2_username }}</span>
                </div>
                <div class="admin-card-actions">
                  <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'accepted')" class="action-btn accept">✅ В основу</button>
                  <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'pending')" class="action-btn remove">❌ Убрать</button>
                </div>
              </div>
            </div>
          </div>

          <div v-else>
            <div v-if="tournament.tab_published">
              <h3 class="list-header">Основной состав ({{ acceptedTeams.length }})</h3>
              <div class="registration-list">
                <div v-for="reg in acceptedTeams" :key="reg.id" class="registration-card">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ reg.speaker1_username }} & {{ reg.speaker2_username }}</span>
                  <small>{{ reg.club }}</small>
                </div>
                 <p v-if="acceptedTeams.length === 0">Команды в основном составе отсутствуют.</p>
              </div>

              <h3 class="list-header">Резерв ({{ reserveTeams.length }})</h3>
              <div class="registration-list">
                <div v-for="reg in reserveTeams" :key="reg.id" class="registration-card">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ reg.speaker1_username }} & {{ reg.speaker2_username }}</span>
                  <small>{{ reg.club }}</small>
                </div>
                 <p v-if="reserveTeams.length === 0">Команды в резерве отсутствуют.</p>
              </div>
            </div>
            <p v-else>Список участников (ТЭБ) ещё не опубликован организатором.</p>
          </div>
        </div>

        <div v-if="activeTab === 'bracket'">
          <QualifyingBracket :tournament-id="Number(tournamentId)" :is-creator="isCreator" />
        </div>
      </div>
    </div>
    
    <div v-else>
      <p>Турнир не найден.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTournamentsStore } from '@/stores/tournaments';
import { useUserStore } from '@/stores/user';
import { useBracketStore } from '@/stores/bracket';
import QualifyingBracket from '@/components/QualifyingBracket.vue';
// Забыли импортировать CreateTournamentForm!
import CreateTournamentForm from '@/components/CreateTournamentForm.vue';

const route = useRoute();
const tournamentsStore = useTournamentsStore();
const userStore = useUserStore();
const bracketStore = useBracketStore();

const tournamentId = ref(route.params.id);
const activeTab = ref('posts');
const newPostText = ref('');
const isRegFormVisible = ref(false);
const isSubmittingReg = ref(false);

const regForm = reactive({
  faction_name: '', speaker1_username: '', speaker2_username: '', club: '', city: '',
});

const tournament = computed(() => tournamentsStore.currentTournament);
const registrations = computed(() => tournamentsStore.registrations);

const isCreator = computed(() => {
  return tournament.value && userStore.userData?.telegram_username === tournament.value.creator_id;
});

const pendingTeams = computed(() => (registrations.value || []).filter(r => r.status === 'pending'));
const acceptedTeams = computed(() => (registrations.value || []).filter(r => r.status === 'accepted'));
const reserveTeams = computed(() => (registrations.value || []).filter(r => r.status === 'reserve'));

const handlePostSubmit = async () => {
  const success = await tournamentsStore.createTournamentPost(Number(tournamentId.value), newPostText.value);
  if (success) {
    newPostText.value = '';
  }
};

const handleRegistrationSubmit = async () => {
  isSubmittingReg.value = true;
  const success = await tournamentsStore.submitRegistration({
    ...regForm,
    tournament_id: Number(tournamentId.value),
  });
  if (success) {
    isRegFormVisible.value = false;
    Object.keys(regForm).forEach(key => regForm[key] = '');
  }
  isSubmittingReg.value = false;
};

const loadAllData = async (id) => {
  const numericId = Number(id);
  if (isNaN(numericId)) return;
  await tournamentsStore.loadTournamentById(numericId);
  await tournamentsStore.loadTournamentPosts(numericId);
  await tournamentsStore.loadRegistrations(numericId);
  await bracketStore.loadBracket(numericId);
};

onMounted(() => { loadAllData(tournamentId.value); });
watch(() => route.params.id, (newId) => {
  if (newId) { tournamentId.value = newId; loadAllData(newId); }
});
</script>

<style scoped>
.page-header { margin-bottom: 15px; }
.back-button { color: #8b5cf6; text-decoration: none; font-weight: 600; font-size: 16px; }
.tournament-header {
  background: #1a1a1a; padding: 20px; border-radius: 12px;
  text-align: center; margin-bottom: 20px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.tournament-header img {
  width: 100px; height: 100px; border-radius: 50%; object-fit: cover;
  margin-bottom: 5px; border: 2px solid #333;
}
.tournament-header h1 { font-size: 24px; margin: 0; }
.tournament-header p { color: #aaa; margin: 0; }
.tournament-description {
  background: #1a1a1a; padding: 20px; border-radius: 12px; margin-bottom: 20px;
}
.tournament-description h3 { margin-bottom: 10px; }
.tournament-description p { line-height: 1.7; }
.detail-tabs {
  display: flex; margin-bottom: 20px; background: #1a1a1a;
  border-radius: 8px; padding: 5px;
}
.detail-tabs button {
  flex: 1; padding: 10px; background: none; border: none;
  border-radius: 6px; color: #d1d5db; font-size: 14px;
  cursor: pointer; transition: all 0.2s ease; font-weight: 500;
}
.detail-tabs button.active { background: #8b5cf6; color: #ffffff; font-weight: 600; }
.tab-content { background: #1a1a1a; padding: 20px; border-radius: 12px; }
.new-post-form {
  display: flex; flex-direction: column; gap: 10px;
  margin-bottom: 20px; padding-bottom: 20px;
  border-bottom: 1px solid #2c2c2c;
}
.new-post-form textarea {
  width: 100%; min-height: 80px; padding: 10px; border: 1px solid #333;
  border-radius: 8px; background: #262626; color: #e6e6e6; font-size: 14px;
}
.new-post-form button {
  padding: 8px 15px; background: #8b5cf6; color: #ffffff;
  border: none; border-radius: 8px; cursor: pointer;
  font-size: 14px; font-weight: 600; align-self: flex-end;
}
.post { padding: 15px 0; border-bottom: 1px solid #2c2c2c; }
.post:last-child { border-bottom: none; padding-bottom: 0; }
.post-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px; color: #aaa;
}
.post-header strong { color: #fff; }
.post-text { white-space: pre-wrap; line-height: 1.6; }
.main-action-btn {
  width: 100%; padding: 12px; margin-bottom: 20px;
  background: #8b5cf6; color: #ffffff; border: none;
  border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600;
}
.registration-form {
  display: flex; flex-direction: column; gap: 15px;
  background: #222; padding: 15px; border-radius: 8px; margin-bottom: 20px;
}
.registration-form input {
  width: 100%; padding: 10px; border: 1px solid #333;
  border-radius: 8px; background: #262626; color: #e6e6e6; font-size: 14px;
}
.registration-form button {
  padding: 10px; background: #22c55e; color: #ffffff;
  border: none; border-radius: 8px; cursor: pointer;
  font-size: 14px; font-weight: 600;
}
.registration-form button:disabled { background: #555; }
.list-header {
  margin-top: 10px;
  margin-bottom: 10px; font-size: 18px;
  border-bottom: 1px solid #333; padding-bottom: 5px;
}
.registration-card {
  background: #222; padding: 15px; border-radius: 8px;
  margin-bottom: 10px; border-left: 3px solid #8b5cf6;
}
.registration-card strong { display: block; font-size: 16px; margin-bottom: 5px; }
.registration-card span { display: block; font-size: 14px; color: #aaa; }
.registration-card small { display: block; font-size: 12px; color: #888; margin-top: 5px; }
.admin-panel { margin-bottom: 20px; }
.tab-stats {
  text-align: center; background: #222; padding: 10px;
  border-radius: 8px; margin-bottom: 15px;
}
.publish-btn {
  width: 100%; padding: 10px; border: none; border-radius: 8px;
  font-size: 16px; font-weight: 600; cursor: pointer;
}
.publish-btn.publish { background-color: #22c55e; color: #fff; }
.publish-btn.unpublish { background-color: #ef4444; color: #fff; }

.admin-card {
  display: flex; justify-content: space-between; align-items: center;
  background: #222; padding: 10px 15px; border-radius: 8px; margin-bottom: 10px;
}
.admin-card-info strong { display: block; }
.admin-card-info span { font-size: 14px; color: #aaa; }
.admin-card-actions { display: flex; gap: 8px; }
.action-btn {
  background: #333; border: none; color: #fff; padding: 6px 10px;
  border-radius: 6px; cursor: pointer; font-size: 12px;
}
.action-btn.accept { color: #22c55e; }
.action-btn.reserve { color: #eab308; }
.action-btn.remove { color: #ef4444; }
</style>