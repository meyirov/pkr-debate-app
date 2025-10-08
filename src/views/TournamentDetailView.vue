<template>
  <div class="tournament-detail-page">
    <div class="page-header">
      <router-link to="/tournaments" class="back-button">Все турниры</router-link>
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
        <div class="desc-content" :class="{ collapsed: !isDescExpanded }">
          <div class="desc-html" v-html="processedDescription"></div>
        </div>
        <button class="toggle-desc" @click="isDescExpanded = !isDescExpanded">
          {{ isDescExpanded ? 'Свернуть' : 'Показать ещё' }}
        </button>
      </div>

      <div class="detail-tabs">
        <button @click="setTab('posts')" :class="{ active: activeTab === 'posts' }">Посты</button>
        <button @click="setTab('registration')" :class="{ active: activeTab === 'registration' }">Регистрация</button>
        <button @click="setTab('participants')" :class="{ active: activeTab === 'participants' }">Участники</button>
        <button @click="setTab('bracket')" :class="{ active: activeTab === 'bracket' }">Сетка</button>
      </div>

      <div class="tab-content">
        <div v-if="activeTab === 'posts'">
          <div v-if="isCreator" class="new-post-form">
            <textarea v-model="newPostText" placeholder="Написать объявление от имени турнира..."></textarea>
            <button class="btn-neon" @click="handlePostSubmit">Опубликовать</button>
          </div>
          <div v-if="tournamentsStore.tournamentPosts.length > 0" class="posts-list">
            <div v-for="post in tournamentsStore.tournamentPosts" :key="post.id" class="post">
              <div class="post-header">
                <strong>{{ tournament.name }}</strong>
                <span class="post-time">{{ new Date(post.timestamp).toLocaleString('ru-RU') }}</span>
              </div>
              <div class="post-text" v-html="renderPost(post.text)"></div>
            </div>
          </div>
          <p v-else>Объявлений от организаторов пока нет.</p>
        </div>

        <div v-if="activeTab === 'registration'">
          <button @click="isRegFormVisible = !isRegFormVisible" class="main-action-btn btn-neon">
            {{ isRegFormVisible ? 'Скрыть форму' : 'Зарегистрировать команду' }}
          </button>
          <form v-if="isRegFormVisible" @submit.prevent="handleRegistrationSubmit" class="registration-form">
            <input v-model="regForm.faction_name" type="text" placeholder="Название фракции *" required>
            
            <div class="form-group">
              <label>1-й спикер *</label>
              <select v-model="regForm.speaker1_username" required :disabled="isLoadingMembers">
                <option value="" disabled>Выберите спикера</option>
                <option v-for="member in clubMembers" :key="member.telegram_username" :value="member.telegram_username">
                  {{ member.fullname }} (@{{ member.telegram_username }})
                </option>
              </select>
              <small v-if="isLoadingMembers">Загрузка участников клуба...</small>
              <small v-else-if="clubMembers.length === 0 && userStore.userData?.club">В вашем клубе пока нет других участников</small>
            </div>

            <div class="form-group">
              <label>2-й спикер *</label>
              <select v-model="regForm.speaker2_username" required :disabled="isLoadingMembers">
                <option value="" disabled>Выберите спикера</option>
                <option v-for="member in clubMembers" :key="member.telegram_username" :value="member.telegram_username">
                  {{ member.fullname }} (@{{ member.telegram_username }})
                </option>
              </select>
            </div>

            <input v-model="regForm.club" type="text" placeholder="Клуб *" required readonly>
            <input v-model="regForm.city" type="text" placeholder="Город" readonly>
            
            <input v-model="regForm.contacts" type="text" placeholder="Контакты (необязательно)">
            <textarea v-model="regForm.extra" placeholder="Дополнительно (достижения, опыт и т.д.)" rows="3"></textarea>
            
            <button type="submit" :disabled="isSubmittingReg || isLoadingMembers" class="btn-green">
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
          <div class="bracket-type-switcher">
            <button 
              :class="{ active: bracketType === 'qualifying' }"
              @click="bracketType = 'qualifying'"
            >
              Отборочные
            </button>
            <button 
              v-if="bracketStore.bracket?.playoff_data"
              :class="{ active: bracketType === 'playoff' }"
              @click="bracketType = 'playoff'"
            >
              Play Off
            </button>
          </div>

          <div v-if="bracketType === 'qualifying'">
            <QualifyingBracket 
              :tournament-id="Number(tournamentId)" 
              :is-creator="isCreator"
              :is-qualifying-finished="isQualifyingFinished"
              @switchToPlayoff="bracketType = 'playoff'"
            />
          </div>
          <div v-if="bracketType === 'playoff'">
            <PlayoffBracket 
              :tournament-id="Number(tournamentId)" 
              :is-creator="isCreator"
              @dataChanged="loadAllData(tournamentId)"
            />
          </div>
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
import PlayoffBracket from '@/components/PlayoffBracket.vue';

const route = useRoute();
const tournamentsStore = useTournamentsStore();
const userStore = useUserStore();
const bracketStore = useBracketStore();

const tournamentId = ref(route.params.id);
const activeTab = ref('posts');
const bracketType = ref('playoff'); // Default to playoff
const newPostText = ref('');
const isRegFormVisible = ref(false);
const isSubmittingReg = ref(false);

const isDescExpanded = ref(false);

const regForm = reactive({
  faction_name: '', speaker1_username: '', speaker2_username: '', club: '', city: '', contacts: '', extra: '',
});

const clubMembers = ref([]);
const isLoadingMembers = ref(false);

const tournament = computed(() => tournamentsStore.currentTournament);
const registrations = computed(() => tournamentsStore.registrations);

const isCreator = computed(() => {
  if (!userStore.userData || !tournament.value) return false;
  // Для локальной разработки создатель 'dev_user'
  if (import.meta.env.DEV && tournament.value.creator_id === 'dev_user') {
    return userStore.userData.telegram_username === 'dev_user';
  }
  return userStore.userData.telegram_username === tournament.value.creator_id;
});

const isQualifyingFinished = computed(() => {
  const bracket = bracketStore.bracket;
  if (!bracket || !bracket.matches || !bracket.matches.matches || !bracket.matches.setup) {
    return false;
  }
  
  const roundsPlayed = bracket.matches.matches.length;
  const totalRounds = bracket.matches.setup.roundCount;
  
  if (roundsPlayed < totalRounds) {
    return false;
  }

  const lastRound = bracket.matches.matches[roundsPlayed - 1];
  if (!lastRound || !lastRound.matches) {
    return false;
  }
  
  return lastRound.matches.every(match => 
    match.teams.some(team => team.rank > 0)
  );
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

const loadClubMembers = async () => {
  if (!userStore.userData?.club) return;
  
  isLoadingMembers.value = true;
  try {
    clubMembers.value = await tournamentsStore.getClubMembers(userStore.userData.club);
  } catch (error) {
    console.error('Ошибка загрузки участников клуба:', error);
    clubMembers.value = [];
  } finally {
    isLoadingMembers.value = false;
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

const setTab = (tab) => { activeTab.value = tab; };

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    const safeUrl = url.replace(/"/g, '%22');
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a>`;
  });
}
const processedDescription = computed(() => {
  const raw = tournament.value?.desc || 'Описание отсутствует.';
  return linkify(escapeHtml(raw));
});

// Render post with preserved line breaks and links
const renderPost = (text) => {
  const safe = escapeHtml(text || '');
  const withLinks = linkify(safe);
  return withLinks.replace(/\n/g, '<br>');
};

const loadAllData = async (id) => {
  const numericId = Number(id);
  if (isNaN(numericId)) return;
  await tournamentsStore.loadTournamentById(numericId);
  await tournamentsStore.loadTournamentPosts(numericId);
  await tournamentsStore.loadRegistrations(numericId);
  await bracketStore.loadBracket(numericId);
};

// Auto-populate form when it becomes visible
watch(isRegFormVisible, (isVisible) => {
  if (isVisible && userStore.userData) {
    // Auto-populate club and city from user profile
    regForm.club = userStore.userData.club || '';
    regForm.city = userStore.userData.city || '';
    
    // Load club members
    loadClubMembers();
  }
});

onMounted(() => { 
  loadAllData(tournamentId.value);
  // Load club members if user has a club
  if (userStore.userData?.club) {
    loadClubMembers();
  }
});

watch(() => route.params.id, (newId) => {
  if (newId) { tournamentId.value = newId; loadAllData(newId); }
});
</script>

<style scoped>
.page-header { margin-bottom: 15px; }
.back-button { 
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #1e1e1e, #2a2a2a);
  color: #c9c9c9;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  border: 1px solid #333;
  border-radius: 10px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.back-button:hover {
  background: linear-gradient(135deg, #6d28d9, #7c3aed);
  color: #ffffff;
  border-color: #7c3aed;
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.4);
  transform: translateY(-2px);
}

.back-button::before {
  content: "←";
  font-size: 16px;
  font-weight: bold;
}
.tournament-header {
  background: #1a1a1a; padding: 20px; border-radius: 12px;
  text-align: center; margin-bottom: 20px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  position: relative;
}
.tournament-header img {
  width: 120px; height: 120px; border-radius: 12px; object-fit: cover;
  margin-bottom: 5px; border: 2px solid rgba(124, 58, 237, 0.6);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.35);
}
.tournament-header h1 { font-size: 24px; margin: 0; }
.tournament-header p { color: #aaa; margin: 0; }

.tournament-description {
  background: #1a1a1a; padding: 20px; border-radius: 12px; margin-bottom: 20px;
}
.tournament-description h3 { margin-bottom: 10px; }
.desc-content { position: relative; max-height: none; }
.desc-content.collapsed { max-height: 120px; overflow: hidden; }
.desc-content.collapsed::after {
  content: '';
  position: absolute; left: 0; right: 0; bottom: 0; height: 56px;
  background: linear-gradient(180deg, rgba(26,26,26,0) 0%, rgba(26,26,26,1) 70%);
}
.desc-html a { color: #a77dff; text-decoration: underline; }
.toggle-desc {
  margin-top: 10px; padding: 8px 14px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #6d28d9, #7c3aed); color: #fff; font-weight: 600;
  cursor: pointer; box-shadow: 0 0 14px rgba(124,58,237,0.45);
}

/* Neon tabs */
.detail-tabs {
  display: flex; margin-bottom: 20px; background: #121212;
  border-radius: 10px; padding: 6px; border: 1px solid #2a2a2a;
}
.detail-tabs button {
  flex: 1; padding: 12px; background: #1e1e1e; border: 1px solid #2a2a2a;
  border-radius: 8px; color: #c9c9c9; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.25s ease; margin-right: 6px;
}
.detail-tabs button:last-child { margin-right: 0; }
.detail-tabs button:hover { box-shadow: 0 6px 18px rgba(124,58,237,0.25); }
.detail-tabs button.active {
  background: linear-gradient(135deg, #6d28d9, #7c3aed);
  color: #ffffff; border-color: #7c3aed;
  box-shadow: 0 0 20px rgba(124,58,237,0.45);
}

.bracket-type-switcher {
  display: flex;
  margin-bottom: 20px;
  background: #121212;
  border-radius: 10px;
  padding: 6px;
  border: 1px solid #2a2a2a;
}
.bracket-type-switcher button {
  flex: 1;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #c9c9c9;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  margin-right: 6px;
}
.bracket-type-switcher button:last-child { margin-right: 0; }
.bracket-type-switcher button.active {
  background: linear-gradient(135deg, #6d28d9, #7c3aed);
  color: #ffffff;
  border-color: #7c3aed;
  box-shadow: 0 0 20px rgba(124,58,237,0.45);
}


.tab-content { background: #1a1a1a; padding: 20px; border-radius: 12px; }

/* Neon buttons */
.btn-neon {
  padding: 10px 16px; background: linear-gradient(135deg, #6d28d9, #7c3aed);
  color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer;
  box-shadow: 0 0 18px rgba(124,58,237,0.45); transition: transform 0.15s ease;
}
.btn-neon:hover { transform: translateY(-1px); }
.btn-green {
  padding: 10px 16px; background: linear-gradient(135deg, #16a34a, #22c55e);
  color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer;
  box-shadow: 0 0 18px rgba(34,197,94,0.35);
}

.new-post-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #2c2c2c; }
.new-post-form textarea {
  width: 100%; min-height: 80px; padding: 10px; border: 1px solid #333;
  border-radius: 8px; background: #262626; color: #e6e6e6; font-size: 14px;
}

.list-header { margin-top: 10px; margin-bottom: 10px; font-size: 18px; border-bottom: 1px solid #333; padding-bottom: 5px; }

.registration-form { display: flex; flex-direction: column; gap: 15px; background: #222; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
.registration-form input { width: 100%; padding: 10px; border: 1px solid #333; border-radius: 8px; background: #262626; color: #e6e6e6; font-size: 14px; }
.registration-form input[readonly] { background: #1a1a1a; color: #888; cursor: not-allowed; }
.registration-form textarea { 
  width: 100%; padding: 10px; border: 1px solid #333; border-radius: 8px; 
  background: #262626; color: #e6e6e6; font-size: 14px; resize: vertical; min-height: 60px;
}

.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group label { color: #c9c9c9; font-weight: 600; font-size: 14px; }
.form-group select { 
  width: 100%; padding: 10px; border: 1px solid #333; border-radius: 8px; 
  background: #262626; color: #e6e6e6; font-size: 14px; cursor: pointer;
}
.form-group select:disabled { background: #1a1a1a; color: #888; cursor: not-allowed; }
.form-group small { color: #888; font-size: 12px; margin-top: 2px; }
.registration-form button:disabled { background: #555; }

.registration-card { background: #222; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid #8b5cf6; }
.registration-card strong { display: block; font-size: 16px; margin-bottom: 5px; }
.registration-card span { display: block; font-size: 14px; color: #aaa; }
.registration-card small { display: block; font-size: 12px; color: #888; margin-top: 5px; }

.admin-panel { margin-bottom: 20px; }
.tab-stats { text-align: center; background: #222; padding: 10px; border-radius: 8px; margin-bottom: 15px; }
.publish-btn { width: 100%; padding: 10px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
.publish-btn.publish { background-color: #22c55e; color: #fff; }
.publish-btn.unpublish { background-color: #ef4444; color: #fff; }

.admin-card { display: flex; justify-content: space-between; align-items: center; background: #222; padding: 10px 15px; border-radius: 8px; margin-bottom: 10px; }
.admin-card-info strong { display: block; }
.admin-card-info span { font-size: 14px; color: #aaa; }
.admin-card-actions { display: flex; gap: 8px; }
.action-btn { background: #333; border: none; color: #fff; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.action-btn.accept { color: #22c55e; }
.action-btn.reserve { color: #eab308; }
.action-btn.remove { color: #ef4444; }
.post-text { white-space: normal; line-height: 1.6; }
.post-text a { color: #a77dff; text-decoration: underline; word-break: break-word; }
</style>