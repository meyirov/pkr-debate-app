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
          <!-- Sub-tabs for Registration -->
          <div class="sub-tabs">
            <button @click="regSubTab = 'teams'" :class="{ active: regSubTab === 'teams' }">Команды</button>
            <button @click="regSubTab = 'judges'" :class="{ active: regSubTab === 'judges' }">Судьи</button>
          </div>

          <!-- Teams sub-tab -->
          <div v-if="regSubTab === 'teams'">
          <button @click="isRegFormVisible = !isRegFormVisible" class="main-action-btn btn-neon">
            {{ isRegFormVisible ? 'Скрыть форму' : 'Зарегистрировать команду' }}
          </button>
          <form v-if="isRegFormVisible" @submit.prevent="handleRegistrationSubmit" class="registration-form">
            <input v-model="regForm.faction_name" type="text" placeholder="Название фракции *" required>

            <select v-model="regForm.speaker1_username" required>
              <option disabled value="">Выберите 1-го спикера</option>
              <option v-for="m in clubMembers" :key="m.telegram_username" :value="m.telegram_username">
                {{ m.fullname }} (@{{ m.telegram_username }})
              </option>
            </select>

            <select v-model="regForm.speaker2_username" required>
              <option disabled value="">Выберите 2-го спикера</option>
              <option v-for="m in clubMembers" :key="'s2-' + m.telegram_username" :value="m.telegram_username">
                {{ m.fullname }} (@{{ m.telegram_username }})
              </option>
            </select>

            <input v-model="regForm.club" type="text" placeholder="Клуб *" required disabled>
            <input v-model="regForm.city" type="text" placeholder="Город" disabled>
            <small v-if="!regForm.club">Укажите клуб и город в профиле, чтобы зарегистрироваться.</small>

            <button type="submit" :disabled="isSubmittingReg || !regForm.club || isDuplicateSelection" class="btn-green">
              {{ isSubmittingReg ? 'Отправка...' : 'Отправить заявку' }}
            </button>
            <small v-if="isDuplicateSelection">Один из выбранных спикеров уже зарегистрирован в этом турнире.</small>
          </form>
          <h3 class="list-header">Зарегистрированные команды ({{ registrations?.length || 0 }})</h3>
          <div class="registration-list">
            <div v-for="reg in registrations" :key="reg.id" :class="['registration-card', statusClass(reg.status)]">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; position: relative;">
                <strong style="flex:1;">{{ reg.faction_name }}</strong>
                <button v-if="isCreator" class="tweet-menu-btn reg-menu-btn" @click.stop="toggleRegMenuFor(reg.id)">⋯</button>
                <div v-if="isCreator && showRegMenuId === reg.id" class="tweet-menu-dropdown reg-menu-dropdown" style="right:0; top: 28px;">
                  <button class="tweet-menu-item" @click="startInlineEdit(reg)">Edit</button>
                </div>
              </div>

              <template v-if="reg._editing">
                <input class="inline-input" v-model="reg._edit_name" :placeholder="reg.faction_name" />
                <div class="inline-grid">
                  <select v-model="reg._edit_s1">
                    <option :value="reg.speaker1_username">@{{ reg.speaker1_username }}</option>
                    <option v-for="m in clubMembers" :key="'i1-'+m.telegram_username" :value="m.telegram_username">{{ m.fullname }} (@{{ m.telegram_username }})</option>
                  </select>
                  <select v-model="reg._edit_s2">
                    <option :value="reg.speaker2_username">@{{ reg.speaker2_username }}</option>
                    <option v-for="m in clubMembers" :key="'i2-'+m.telegram_username" :value="m.telegram_username">{{ m.fullname }} (@{{ m.telegram_username }})</option>
                  </select>
                </div>
                <div class="admin-card-actions" style="margin-top:8px;">
                  <button class="action-btn" @click="saveRegEdits(reg)">💾 Сохранить</button>
                  <button class="action-btn remove" @click="cancelRegEdits(reg)">✖ Отмена</button>
                </div>
              </template>
              <template v-else>
                <span>{{ displayFullname(reg.speaker1_username) }} & {{ displayFullname(reg.speaker2_username) }}</span>
                <small>{{ reg.club }}</small>
              </template>
            </div>
            <p v-if="!registrations || registrations.length === 0">Пока нет ни одной заявки.</p>
          </div>
          </div>

          <!-- Judges sub-tab -->
          <div v-if="regSubTab === 'judges'">
            <div v-if="isCreator" class="admin-panel">
              <div class="tab-stats">Зарегистрировано судей: {{ judgesStore.judges.length }}</div>
            </div>
            <div class="registration-list">
              <div :class="['registration-card', statusClass(j.status)]" v-for="j in judgesStore.judges" :key="j.id">
                <strong>@{{ j.judge_username }}</strong>
                <small>{{ j.club || 'Клуб не указан' }}</small>
                <small>Статус: {{ j.status }}</small>
                <div v-if="isCreator" class="admin-card-actions" style="margin-top:8px;">
                  <button class="action-btn accept" @click="judgesStore.updateJudgeStatus(j.id, 'accepted')">✅ Принять</button>
                  <button class="action-btn remove" @click="judgesStore.updateJudgeStatus(j.id, 'pending')">↺ В ожидании</button>
                </div>
              </div>
            </div>
            <div style="margin-top:12px;">
              <button class="btn-neon" @click="judgesStore.registerAsJudge(Number(tournamentId))">Зарегистрироваться судьей</button>
            </div>
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
                <div v-for="reg in pendingTeams" :key="reg.id" :class="['admin-card', statusClass(reg.status)]">
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
              <div v-for="reg in acceptedTeams" :key="reg.id" :class="['admin-card', statusClass(reg.status)]">
                <div class="admin-card-info" style="flex:1;">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ displayFullname(reg.speaker1_username) }} & {{ displayFullname(reg.speaker2_username) }}</span>
                </div>
                <div class="admin-card-actions">
                  <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'reserve')" class="action-btn reserve">🔄 В резерв</button>
                  <button @click="tournamentsStore.updateRegistrationStatus(reg.id, 'pending')" class="action-btn remove">❌ Убрать</button>
                </div>
              </div>
            </div>

            <h3 class="list-header">Резерв ({{ reserveTeams.length }})</h3>
            <div class="admin-list">
              <div v-for="reg in reserveTeams" :key="reg.id" :class="['admin-card', statusClass(reg.status)]">
                <div class="admin-card-info" style="flex:1;">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ displayFullname(reg.speaker1_username) }} & {{ displayFullname(reg.speaker2_username) }}</span>
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
                <div v-for="reg in acceptedTeams" :key="reg.id" :class="['registration-card', statusClass(reg.status)]">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ displayFullname(reg.speaker1_username) }} & {{ displayFullname(reg.speaker2_username) }}</span>
                  <small>{{ reg.club }}</small>
                </div>
                 <p v-if="acceptedTeams.length === 0">Команды в основном составе отсутствуют.</p>
              </div>

              <h3 class="list-header">Резерв ({{ reserveTeams.length }})</h3>
              <div class="registration-list">
                <div v-for="reg in reserveTeams" :key="reg.id" :class="['registration-card', statusClass(reg.status)]">
                  <strong>{{ reg.faction_name }}</strong>
                  <span>{{ displayFullname(reg.speaker1_username) }} & {{ displayFullname(reg.speaker2_username) }}</span>
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
              v-if="canShowPlayoff"
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
              @switchToPlayoff="bracketType = 'playoff'"
            />
          </div>
          <div v-if="bracketType === 'playoff'">
            <PlayoffBracket :tournament-id="Number(tournamentId)" :is-creator="isCreator" />
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
import { useJudgesStore } from '@/stores/judges';
import QualifyingBracket from '@/components/QualifyingBracket.vue';
import PlayoffBracket from '@/components/PlayoffBracket.vue';

const route = useRoute();
const tournamentsStore = useTournamentsStore();
const userStore = useUserStore();
const bracketStore = useBracketStore();
const judgesStore = useJudgesStore();

const tournamentId = ref(route.params.id);
const activeTab = ref('posts');
const bracketType = ref('qualifying');
const newPostText = ref('');
const isRegFormVisible = ref(false);
const isSubmittingReg = ref(false);
const regSubTab = ref('teams');

const isDescExpanded = ref(false);
const showRegMenuId = ref(null);

const regForm = reactive({
  faction_name: '', speaker1_username: '', speaker2_username: '', club: '', city: '',
});

// Club members list for dropdowns (filtered by current user's club)
const clubMembers = ref([]);
const loadClubMembers = async () => {
  const club = userStore.userData?.club;
  if (!club) { clubMembers.value = []; return; }
  const list = await tournamentsStore.getClubMembers(club);
  clubMembers.value = Array.isArray(list) ? list : [];
};

// Prefill and lock club/city from profile
const syncProfileToRegForm = () => {
  regForm.club = userStore.userData?.club || '';
  regForm.city = userStore.userData?.city || '';
};

onMounted(() => {
  syncProfileToRegForm();
  loadClubMembers();
});
watch(() => userStore.userData?.club, () => { syncProfileToRegForm(); loadClubMembers(); });
watch(() => userStore.userData?.city, () => { syncProfileToRegForm(); });

const tournament = computed(() => tournamentsStore.currentTournament);
const registrations = computed(() => tournamentsStore.registrations);

// Only show playoff when qualifying is finished and playoff_data exists
const canShowPlayoff = computed(() => {
  const b = bracketStore.bracket;
  if (!b) return false;
  const rounds = b.matches?.matches || [];
  const allRoundsFinished = rounds.length > 0 && rounds.every(r => r.matches.every(m => m.teams.every(t => t.rank > 0)));
  const resultsPublished = !!b.results_published;
  const hasPlayoff = !!b.playoff_data;
  return allRoundsFinished && resultsPublished && hasPlayoff;
});

watch(canShowPlayoff, (val) => {
  if (!val && bracketType.value === 'playoff') bracketType.value = 'qualifying';
});

const isCreator = computed(() => {
  return tournament.value && userStore.userData?.telegram_username === tournament.value.creator_id;
});

const pendingTeams = computed(() => (registrations.value || []).filter(r => r.status === 'pending'));
const acceptedTeams = computed(() => (registrations.value || []).filter(r => r.status === 'accepted'));
const reserveTeams = computed(() => (registrations.value || []).filter(r => r.status === 'reserve'));

// Map status to CSS class
const statusClass = (status) => {
  if (status === 'accepted') return 'status-accepted';
  if (status === 'pending') return 'status-pending';
  if (status === 'reserve') return 'status-reserve';
  return 'status-default';
};

// Display full names where available
const usernameToNameMap = ref({});
const displayFullname = (username) => usernameToNameMap.value[username] || `@${username}`;
const loadNamesForRegistrations = async () => {
  const regs = registrations.value || [];
  const usernames = new Set();
  regs.forEach(r => { if (r.speaker1_username) usernames.add(r.speaker1_username); if (r.speaker2_username) usernames.add(r.speaker2_username); });
  if (usernames.size === 0) return;
  const nameMap = await tournamentsStore.getUserNames(Array.from(usernames));
  usernameToNameMap.value = nameMap || {};
};
watch(registrations, () => { loadNamesForRegistrations(); }, { immediate: true });

const saveRegEdits = async (reg) => {
  const updates = {};
  if (reg._edit_name && reg._edit_name !== reg.faction_name) updates.faction_name = reg._edit_name.trim();
  if (reg._edit_s1 && reg._edit_s1 !== reg.speaker1_username) updates.speaker1_username = reg._edit_s1;
  if (reg._edit_s2 && reg._edit_s2 !== reg.speaker2_username) updates.speaker2_username = reg._edit_s2;
  if (Object.keys(updates).length === 0) return;
  const ok = await tournamentsStore.updateRegistrationFields(reg.id, updates);
  if (ok) {
    reg._edit_name = '';
    reg._edit_s1 = '';
    reg._edit_s2 = '';
    reg._editing = false;
    showRegMenuId.value = null;
  }
};

// Client-side duplicate check: disable submit if selected speakers already in registrations
const isDuplicateSelection = computed(() => {
  const s1 = regForm.speaker1_username;
  const s2 = regForm.speaker2_username;
  if (!s1 && !s2) return false;
  return (registrations.value || []).some(r => (
    r.speaker1_username === s1 || r.speaker2_username === s1 ||
    r.speaker1_username === s2 || r.speaker2_username === s2
  ));
});

const handlePostSubmit = async () => {
  const success = await tournamentsStore.createTournamentPost(Number(tournamentId.value), newPostText.value);
  if (success) {
    newPostText.value = '';
  }
};

const handleRegistrationSubmit = async () => {
  isSubmittingReg.value = true;
  if (regForm.speaker1_username === regForm.speaker2_username) {
    alert('Спикеры должны быть разными.');
    isSubmittingReg.value = false;
    return;
  }
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

// Per-registration menu and inline edit
const toggleRegMenuFor = (id) => {
  showRegMenuId.value = showRegMenuId.value === id ? null : id;
};
const startInlineEdit = (reg) => {
  showRegMenuId.value = null;
  reg._editing = true;
  reg._edit_name = reg.faction_name;
  reg._edit_s1 = reg.speaker1_username;
  reg._edit_s2 = reg.speaker2_username;
};
const cancelRegEdits = (reg) => {
  reg._editing = false;
  reg._edit_name = '';
  reg._edit_s1 = '';
  reg._edit_s2 = '';
};

// (Removed form-level menu and edit logic)

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
  await judgesStore.loadJudges(numericId);
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

/* Sub-tabs within Registration */
.sub-tabs {
  display: flex; gap: 10px; margin-bottom: 20px; background: #262626;
  border-radius: 8px; padding: 6px;
}
.sub-tabs button {
  flex: 1; padding: 10px; background: #1e1e1e; border: 1px solid #2a2a2a;
  border-radius: 6px; color: #c9c9c9; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.25s ease;
}
.sub-tabs button:hover { box-shadow: 0 4px 12px rgba(124,58,237,0.2); }
.sub-tabs button.active {
  background: linear-gradient(135deg, #6d28d9, #7c3aed);
  color: #ffffff; border-color: #7c3aed;
  box-shadow: 0 0 16px rgba(124,58,237,0.4);
}

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
.registration-form input,
.registration-form select { width: 100%; padding: 10px; border: 1px solid #333; border-radius: 8px; background: #262626; color: #e6e6e6; font-size: 14px; box-sizing: border-box; }
.registration-form select { appearance: none; -moz-appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, #aaa 50%), linear-gradient(135deg, #aaa 50%, transparent 50%); background-position: calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px); background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; }
.registration-form input[disabled],
.registration-form select[disabled] { opacity: 0.7; cursor: not-allowed; }
.registration-form small { color: #aaa; margin-top: -8px; }
.registration-form button:disabled { background: #555; }

.registration-card { background: #222; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid #555; }
.registration-card.status-accepted { border-left-color: #22c55e; }
.registration-card.status-pending { border-left-color: #eab308; }
.registration-card.status-reserve { border-left-color: #a78bfa; }
.registration-card.status-default { border-left-color: #555; }
.registration-card strong { display: block; font-size: 16px; margin-bottom: 5px; }
.registration-card span { display: block; font-size: 14px; color: #aaa; }
.registration-card small { display: block; font-size: 12px; color: #888; margin-top: 5px; }

.admin-panel { margin-bottom: 20px; }
.tab-stats { text-align: center; background: #222; padding: 10px; border-radius: 8px; margin-bottom: 15px; }
.publish-btn { width: 100%; padding: 10px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
.publish-btn.publish { background-color: #22c55e; color: #fff; }
.publish-btn.unpublish { background-color: #ef4444; color: #fff; }

.admin-card { display: flex; justify-content: space-between; align-items: center; background: #222; padding: 10px 15px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid #555; }
.inline-input { width: 100%; padding: 8px; border: 1px solid #333; border-radius: 6px; background: #262626; color: #e6e6e6; margin-bottom: 8px; }
.inline-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.inline-grid select { width: 100%; padding: 8px; border: 1px solid #333; border-radius: 6px; background: #262626; color: #e6e6e6; }
.admin-card.status-accepted { border-left-color: #22c55e; }
.admin-card.status-pending { border-left-color: #eab308; }
.admin-card.status-reserve { border-left-color: #a78bfa; }
.admin-card.status-default { border-left-color: #555; }
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