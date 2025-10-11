<template>
  <div>
    <!-- Bracket Sub-navigation REMOVED -->

    <!-- Qualifying Bracket Content -->
    <div class="bracket-content-pane">
      <div v-if="bracketStore.isLoading">
        <p>Загрузка данных о сетке...</p>
      </div>
    
    <div v-else-if="!bracketStore.bracket && isCreator">
      <form @submit.prevent="handleGenerate" class="bracket-setup-form">
        <h4>Управление сеткой отборочных</h4>
        <p class="form-description">Выберите формат, количество команд и раундов для турнира.</p>
        
        <div class="tournament-progress">
          <h5>Планируемые раунды: {{ setup.roundCount }}</h5>
          <p class="progress-description">После завершения всех {{ setup.roundCount }} раундов вы сможете опубликовать результаты и настроить плей-офф.</p>
        </div>
        
        <div class="form-group">
          <label for="format-select">Формат:</label>
          <select id="format-select" v-model="setup.format">
            <option value="АПФ">АПФ (2 команды)</option>
            <option value="БПФ">БПФ (4 команды)</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="team-count-input">Количество фракций:</label>
          <input id="team-count-input" v-model.number="setup.teamCount" type="number" 
                 placeholder="Например, 16" required 
                 :min="setup.format === 'АПФ' ? 2 : 4" 
                 :step="setup.format === 'АПФ' ? 2 : 4">
          <p class="input-hint">Должно быть кратно {{ setup.format === 'АПФ' ? 2 : 4 }}.</p>
        </div>

        <div class="form-group">
          <label for="round-count-input">Количество раундов:</label>
          <input id="round-count-input" v-model.number="setup.roundCount" type="number" 
                 placeholder="Например, 4" required min="1">
        </div>

        <div class="form-group">
          <label for="rooms-input">Кабинеты (через запятую):</label>
          <input id="rooms-input" v-model="setup.roomsText" type="text" placeholder="101, 102, 201, 202">
          <p class="input-hint">Пример: 101, 102, 201, 202 — будет назначено по порядку на матчи.</p>
        </div>

        <button type="submit" :disabled="isGenerating || !isFormValid">
          {{ isGenerating ? 'Генерация...' : 'Сгенерировать 1-й раунд' }}
        </button>
        <p v-if="!isFormValid && !isGenerating" class="error-message">
          Количество команд должно быть кратно {{ setup.format === 'АПФ' ? 2 : 4 }} и не превышать количество принятых команд ({{ acceptedTeamsCount }}).
        </p>
      </form>
    </div>

    <div v-else-if="bracketStore.bracket">
      <!-- Round Tabs Navigation -->
      <div 
        class="bracket-sub-nav" 
        v-if="(rounds && rounds.length > 0)"
      >
        <button
          v-for="(r, idx) in rounds"
          :key="r.round"
          class="bracket-sub-nav-btn"
          :class="{ active: idx === activeRoundIndex }"
          @click="activeRoundIndex = idx"
        >
          Раунд {{ r.round }}
          <span v-if="isRoundFinished(r)"> ✅</span>
        </button>
      </div>

      <div v-if="isCreator" class="round-admin-panel">
        <div class="tournament-status">
          <h5>Прогресс турнира: {{ bracketStore.bracket.matches?.matches?.length || 0 }} / {{ setup.roundCount }} раундов</h5>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${((bracketStore.bracket.matches?.matches?.length || 0) / setup.roundCount) * 100}%` }"></div>
          </div>
          <div class="debug-info" v-if="isCreator">
            <small>Debug: Раундов создано: {{ bracketStore.bracket.matches?.matches?.length || 0 }} / {{ setup.roundCount }} | Все раунды завершены: {{ isAllQualifyingRoundsFinished }} | Результаты опубликованы: {{ bracketStore.bracket?.results_published }} | Playoff данные: {{ !!bracketStore.bracket?.playoff_data }}</small>
          </div>
        </div>
        
        <button 
          @click="togglePublication"
          :class="['admin-action-btn', bracketStore.bracket.published ? 'unpublish' : 'publish']"
        >
          {{ bracketStore.bracket.published ? 'Скрыть сетку' : 'Опубликовать сетку' }}
        </button>
        <button 
          v-if="isCreator && isCurrentRoundFinished && (bracketStore.bracket.matches?.matches?.length || 0) < setup.roundCount"
          @click="bracketStore.generateNextRound()" 
          class="admin-action-btn generate"
        >
          Сгенерировать Раунд {{ (bracketStore.bracket.matches?.matches?.length || 0) + 1 }}
        </button>
        
        <!-- Show qualifying results publication when all planned rounds are done -->
        <button 
          v-if="isCreator && isAllQualifyingRoundsFinished && !bracketStore.bracket?.results_published"
          @click="publishQualifyingResults" 
          class="admin-action-btn publish-qualifying"
        >
          📊 Опубликовать результаты отборочных
        </button>
        
        <!-- Show playoff setup only after qualifying results are published -->
        <button 
          v-if="isCreator && isAllQualifyingRoundsFinished && (bracketStore.bracket?.results_published || false) && !bracketStore.bracket?.playoff_data"
          @click="switchToPlayoffTab" 
          class="admin-action-btn setup-playoff"
        >
          Настроить Плей-офф
        </button>
      </div>

      <div v-if="visibleRound" :key="visibleRound.round" class="round-section">
        <div class="round-header">
          <h4 class="round-title">Раунд {{ visibleRound.round }}</h4>
          <button 
            v-if="isCreator"
            @click="openResultsModal(activeRoundIndex)" 
            class="round-results-btn"
            :class="{ 'results-complete': isRoundFinished(visibleRound) }"
          >
            {{ isRoundFinished(visibleRound) ? '✅ Результаты введены' : '📝 Ввести результаты' }}
          </button>
        </div>
        <div v-for="(match, matchIndex) in visibleRound.matches" :key="matchIndex" class="match-card">
          <div class="match-info-row">
            <span class="match-number">Матч {{ matchIndex + 1 }}</span>
            <span class="match-status"></span>
          </div>
          
          <div v-if="isCreator" class="match-details-editor">
            <div class="input-group">
              <label>Кабинет:</label>
              <input v-model="match.room" type="text" placeholder="№ Кабинета" @input="debouncedSave">
            </div>
            <div class="input-group">
              <label>Судья:</label>
              <input v-model="match.judge" type="text" placeholder="Имя судьи" @input="debouncedSave">
            </div>
          </div>
          <div v-else-if="bracketStore.bracket.published" class="match-details-public">
            <span><strong>Кабинет:</strong> {{ match.room || 'Не назначен' }}</span>
            <span><strong>Судья:</strong> {{ match.judge || 'Не назначен' }}</span>
          </div>
          <div v-else class="match-details-public">
            <span>Информация о матче скрыта организатором.</span>
          </div>

          <ul class="team-list">
            <li v-for="(team, teamIdx) in match.teams" :key="team.reg_id" :class="`team-position-${team.position.toLowerCase().replace(/[^a-z0-9]/g, '')}`">
              <div class="team-row">
                <div class="team-left">
                  <strong>{{ team.position }}:</strong> {{ team.faction_name }}
                  <small class="team-club" v-if="teamClub(team)"> — {{ teamClub(team) }}</small>
                  <span 
                    v-if="team.rank > 0 && (isCreator || (bracketStore.bracket && bracketStore.bracket.results_published))" 
                    class="team-result"
                  >(Ранг: {{ team.rank }})</span>
                </div>
                <!-- Team replace control removed as requested -->
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    
      <div v-else>
        <p>Сетка отборочных раундов ещё не сформирована организатором.</p>
      </div>
    </div>

    <!-- Playoff Bracket Content REMOVED -->

    <MatchResultsModal 
      v-if="showResultsModal" 
      :round="selectedRound"
      :format="bracketStore.bracket.format"
      @close="showResultsModal = false"
      @save="handleSaveResults"
    />
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onUnmounted, watch, defineEmits } from 'vue';
import { useBracketStore } from '@/stores/bracket';
import { useTournamentsStore } from '@/stores/tournaments';
import MatchResultsModal from '@/components/MatchResultsModal.vue';
// PlayoffBracket import removed as it's no longer rendered here
// import PlayoffBracket from '@/components/PlayoffBracket.vue';

const props = defineProps({
  tournamentId: { type: Number, required: true },
  isCreator: { type: Boolean, required: true }
});

const emit = defineEmits(['switchToPlayoff']);

const bracketStore = useBracketStore();
const tournamentsStore = useTournamentsStore();
const isGenerating = ref(false);
const showResultsModal = ref(false);
// activeBracketTab ref removed
const selectedRound = ref(null);
const selectedRoundIndex = ref(0);

const setup = reactive({
  format: 'АПФ',
  teamCount: 8,
  roundCount: 4,
  tournamentId: props.tournamentId,
  roomsText: ''
});

// Round tabs state
const activeRoundIndex = ref(0);
const rounds = computed(() => bracketStore.bracket?.matches?.matches || []);
const visibleRound = computed(() => rounds.value?.[activeRoundIndex.value] || null);

// Initialize activeRoundIndex to latest round whenever rounds change
watch(rounds, (rs) => {
  if (rs && rs.length > 0) {
    activeRoundIndex.value = rs.length - 1;
  } else {
    activeRoundIndex.value = 0;
  }
}, { immediate: true });

// Load setup from tournament data if available
onMounted(() => {
  if (bracketStore.bracket && bracketStore.bracket.matches && bracketStore.bracket.matches.setup) {
    setup.format = bracketStore.bracket.matches.setup.format || 'АПФ';
    setup.teamCount = bracketStore.bracket.matches.setup.teamCount || 8;
    setup.roundCount = bracketStore.bracket.matches.setup.roundCount || 4;
  } else if (bracketStore.bracket) {
    setup.format = bracketStore.bracket.format || 'АПФ';
    setup.teamCount = 8;
    setup.roundCount = 4;
  }
});

// Watch for bracket changes and update setup
watch(() => bracketStore.bracket, (newBracket) => {
  if (newBracket && newBracket.matches && newBracket.matches.setup) {
    setup.format = newBracket.matches.setup.format || 'АПФ';
    setup.teamCount = newBracket.matches.setup.teamCount || 8;
    setup.roundCount = newBracket.matches.setup.roundCount || 4;
  } else if (newBracket) {
    setup.format = newBracket.format || 'АПФ';
    setup.teamCount = 8;
    setup.roundCount = 4;
  }
}, { immediate: true });

let saveTimeout = null;
const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    bracketStore.updateBracketData();
  }, 1000); 
};

const acceptedTeamsCount = computed(() => {
  return tournamentsStore.registrations.filter(r => r.status === 'accepted').length;
});

const acceptedRegistrations = computed(() => (tournamentsStore.registrations || []).filter(r => r.status === 'accepted'));

const onReplaceTeam = async (roundIdx, matchIdx, teamIdx, newRegId) => {
  if (!bracketStore.bracket || newRegId == null) return;
  const reg = acceptedRegistrations.value.find(r => r.id === newRegId);
  if (!reg) return;
  const round = bracketStore.bracket.matches?.matches?.[roundIdx];
  if (!round) return;
  const match = round.matches?.[matchIdx];
  if (!match) return;
  const oldTeam = match.teams[teamIdx];
  match.teams[teamIdx] = {
    ...oldTeam,
    reg_id: reg.id,
    faction_name: reg.faction_name,
    speakers: [
      { username: reg.speaker1_username, points: oldTeam?.speakers?.[0]?.points ?? 75 },
      { username: reg.speaker2_username, points: oldTeam?.speakers?.[1]?.points ?? 75 }
    ],
    rank: 0
  };
  await bracketStore.updateBracketData();
};

// Show profile names instead of usernames when available
import { supabase } from '@/supabase';
const speakerNameMap = ref({});
const loadSpeakerNames = async () => {
  const usernames = new Set();
  const allRounds = bracketStore.bracket?.matches?.matches || [];
  allRounds.forEach(r => r.matches.forEach(m => m.teams.forEach(t => t.speakers.forEach(s => { if (s?.username) usernames.add(s.username); }))));
  if (usernames.size === 0) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('telegram_username, fullname')
    .in('telegram_username', Array.from(usernames));
  if (!error && data) {
    const map = {};
    data.forEach(p => { map[p.telegram_username] = p.fullname || p.telegram_username; });
    speakerNameMap.value = map;
  }
};

watch(() => bracketStore.bracket, () => { loadSpeakerNames(); }, { immediate: true });

const isFormValid = computed(() => {
  const isTeamCountValid = setup.format === 'АПФ' 
    ? setup.teamCount % 2 === 0 
    : setup.teamCount % 4 === 0;
  
  const isTeamCountWithinLimits = setup.teamCount > 0 && setup.teamCount <= acceptedTeamsCount.value;

  return isTeamCountValid && isTeamCountWithinLimits;
});

const currentRound = computed(() => {
  if (bracketStore.bracket && bracketStore.bracket.matches && bracketStore.bracket.matches.matches && bracketStore.bracket.matches.matches.length > 0) {
    const rounds = bracketStore.bracket.matches.matches;
    return rounds[rounds.length - 1];
  }
  return { round: 0, matches: [] };
});

const isCurrentRoundFinished = computed(() => {
  if (!bracketStore.bracket || currentRound.value.matches.length === 0) {
    return false;
  }
  return currentRound.value.matches.every(match => 
    match.teams.every(team => team.rank > 0)
  );
});

const isRoundFinished = (round) => {
  if (!round || round.matches.length === 0) {
    return false;
  }
  return round.matches.every(match => 
    match.teams.every(team => team.rank > 0)
  );
};

const isAllQualifyingRoundsFinished = computed(() => {
  if (!bracketStore.bracket || !bracketStore.bracket.matches || !bracketStore.bracket.matches.matches) {
    return false;
  }
  
  const rounds = bracketStore.bracket.matches.matches;
  
  // Check if we have completed all planned rounds
  if (rounds.length < setup.roundCount) {
    return false;
  }
  
  // Check if all rounds have results entered
  return rounds.every(round => isRoundFinished(round));
});

const handleGenerate = async () => {
  isGenerating.value = true;
  await bracketStore.generateBracket(setup);
  isGenerating.value = false;
};

const togglePublication = () => {
  if (!bracketStore.bracket) return;
  bracketStore.bracket.published = !bracketStore.bracket.published;
  bracketStore.updateBracketData();
  alert(`Сетка успешно ${bracketStore.bracket.published ? 'опубликована' : 'скрыта'}`);
};

const openResultsModal = (roundIndex) => {
  if (!bracketStore.bracket || !bracketStore.bracket.matches?.matches?.[roundIndex]) return;
  
  selectedRoundIndex.value = roundIndex;
  selectedRound.value = {
    round: bracketStore.bracket.matches.matches[roundIndex].round,
    matches: bracketStore.bracket.matches.matches[roundIndex].matches
  };
  showResultsModal.value = true;
};

const handleSaveResults = (updatedMatches) => {
  if (!bracketStore.bracket || !bracketStore.bracket.matches?.matches) return;
  
  // Update the specific round's matches
  bracketStore.bracket.matches.matches[selectedRoundIndex.value].matches = updatedMatches;
  
  // Save to database
  bracketStore.updateBracketData();
  
  // Close modal
  showResultsModal.value = false;
  selectedRound.value = null;
};

const switchToPlayoffTab = () => {
  emit('switchToPlayoff');
};

const publishQualifyingResults = async () => {
  if (!bracketStore.bracket) return;
  
  // Generate qualifying results post
  const resultsPost = generateQualifyingResultsPost();
  
  // Create tournament post with results
  const success = await tournamentsStore.createTournamentPost(
    bracketStore.bracket.tournament_id, 
    resultsPost
  );
  
  if (!success) {
    alert("Не удалось опубликовать результаты отборочных в постах турнира.");
    return;
  }
  
  // Mark qualifying results as published
  bracketStore.bracket.results_published = true;
  await bracketStore.updateBracketData();
  
  alert("Результаты отборочных раундов успешно опубликованы!");
};

const generateQualifyingResultsPost = () => {
  if (!bracketStore.bracket) return '';
  
  const allRegistrations = tournamentsStore.registrations;
  const teamStats = {};
  const speakerStats = {};
  const POINT_SYSTEMS = {
    АПФ: { 1: 3, 2: 0 },
    БПФ: { 1: 3, 2: 2, 3: 1, 4: 0 }
  };
  const pointsSystem = POINT_SYSTEMS[bracketStore.bracket.format];

  // Calculate team and speaker statistics from qualifying rounds only
  bracketStore.bracket.matches.matches.forEach(round => {
    round.matches.forEach(match => {
      match.teams.forEach(team => {
        if (!teamStats[team.reg_id]) {
          const regInfo = allRegistrations.find(r => r.id === team.reg_id);
          teamStats[team.reg_id] = {
            ...team,
            club: regInfo?.club || 'unknown',
            totalTP: 0,
            totalSP: 0,
          };
        }
        teamStats[team.reg_id].totalTP += pointsSystem[team.rank] || 0;
        const matchSpeakerPoints = team.speakers.reduce((sum, s) => sum + (s.points || 0), 0);
        teamStats[team.reg_id].totalSP += matchSpeakerPoints;
        
        // Speaker statistics - Only track Speaker Points (SP), not Tournament Points (TP)
        team.speakers.forEach(speaker => {
          if (!speakerStats[speaker.username]) {
            speakerStats[speaker.username] = {
              username: speaker.username,
              totalPoints: 0
            };
          }
          // Each speaker gets their individual speaker points
          speakerStats[speaker.username].totalPoints += speaker.points || 0;
        });
      });
    });
  });

  // Sort teams and speakers
  const sortedTeams = Object.values(teamStats).sort((a, b) => {
    if (b.totalTP !== a.totalTP) {
      return b.totalTP - a.totalTP;
    }
    return b.totalSP - a.totalSP;
  });

  // Sort speakers by Speaker Points (SP) only, not Tournament Points (TP)
  const sortedSpeakers = Object.values(speakerStats).sort((a, b) => {
    return b.totalPoints - a.totalPoints; // Only by Speaker Points
  });

  // Generate results text
  let resultsText = `📊 РЕЗУЛЬТАТЫ ОТБОРОЧНЫХ РАУНДОВ (${bracketStore.bracket.matches.length} раундов)\n\n`;
  
  // Team rankings
  resultsText += '🏆 РЕЙТИНГ КОМАНД:\n';
  sortedTeams.forEach((team, index) => {
    resultsText += `${index + 1}. ${team.faction_name} - ${team.totalTP} TP, ${team.totalSP} SP\n`;
  });
  
  resultsText += '\n👥 РЕЙТИНГ СПИКЕРОВ:\n';
  sortedSpeakers.forEach((speaker, index) => {
    resultsText += `${index + 1}. ${speaker.username} - ${speaker.totalPoints} SP\n`;
  });

  resultsText += '\n⏳ Следующий этап: Плей-офф (скоро)';

  return resultsText;
};

// Helper: map reg_id -> registration
const registrationById = computed(() => {
  const map = new Map();
  (tournamentsStore.registrations || []).forEach(r => map.set(r.id, r));
  return map;
});

// Determine team club: for legacy brackets, prefer club from registrations; otherwise use profile-based club if present in team
const teamClub = (team) => {
  const isLegacy = !!bracketStore.bracket?._legacy;
  if (isLegacy) {
    const reg = registrationById.value.get(team.reg_id);
    if (reg?.club) return reg.club;
  }
  // Current/future: try embedded team.club if present (some code paths enrich it), fallback to registration
  if (team.club) return team.club;
  const reg = registrationById.value.get(team.reg_id);
  return reg?.club || '';
};

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout);
});

watch(() => setup.format, (newFormat) => {
  if (newFormat === 'АПФ' && setup.teamCount % 4 === 0) {
    setup.teamCount = Math.max(2, Math.floor(setup.teamCount / 4) * 2);
  } else if (newFormat === 'БПФ' && setup.teamCount % 2 === 0 && setup.teamCount % 4 !== 0) {
    setup.teamCount = Math.max(4, Math.floor(setup.teamCount / 2) * 4);
  }
});
</script>

<style scoped>
/* Стили для формы генерации сетки */
.bracket-setup-form {
  background: #222; padding: 20px; border-radius: 12px;
  display: flex; flex-direction: column; gap: 15px;
}
.bracket-setup-form h4 {
  margin-bottom: 5px; text-align: center; font-size: 18px; color: #fff;
}
.form-description {
  text-align: center; color: #aaa; margin-bottom: 15px; font-size: 14px;
}
.form-group {
  display: flex; flex-direction: column; gap: 5px;
}
.form-group label {
  color: #ddd; font-size: 14px; font-weight: 500;
}
.bracket-setup-form input,
.bracket-setup-form select {
  width: 100%; padding: 10px; border: 1px solid #333;
  border-radius: 8px; background: #262626; color: #e6e6e6; font-size: 14px;
  box-sizing: border-box;
}
.input-hint {
  font-size: 12px; color: #888; margin-top: 5px;
}
.error-message {
  color: #ef4444; font-size: 13px; text-align: center; margin-top: -5px;
}
.bracket-setup-form button {
  padding: 12px; background: #8b5cf6; color: #ffffff;
  border: none; border-radius: 8px; cursor: pointer;
  font-size: 16px; font-weight: 600;
  margin-top: 10px; transition: background-color 0.2s ease;
}
.bracket-setup-form button:disabled {
  background: #555; cursor: not-allowed;
}
.round-admin-panel {
  display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;
  background: #1a1a1a; padding: 15px; border-radius: 12px;
  justify-content: center;
}
.admin-action-btn {
  flex: 1 1 auto; min-width: 120px; padding: 10px; border-radius: 8px; border: none;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease;
}
.admin-action-btn.publish { background-color: #22c55e; color: white; }
.admin-action-btn.publish:hover { background-color: #16a34a; }
.admin-action-btn.unpublish { background-color: #ef4444; color: white; }
.admin-action-btn.unpublish:hover { background-color: #dc2626; }
.admin-action-btn.results { background-color: #eab308; color: white; }
.admin-action-btn.results:hover { background-color: #d97706; }
.admin-action-btn.generate { background-color: #9333ea; color: white; }
.admin-action-btn.generate:hover { background-color: #7e22ce; }
.admin-action-btn.setup-playoff { background-color: #f59e0b; color: white; }
.admin-action-btn.setup-playoff:hover { background-color: #d97706; }
.admin-action-btn.publish-qualifying { background-color: #3b82f6; color: white; }
.admin-action-btn.publish-qualifying:hover { background-color: #2563eb; }
.round-section { margin-top: 20px; }
.round-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}
.round-title { 
  font-size: 20px; color: #e6e6e6;
  margin: 0;
}
.round-results-btn {
  padding: 8px 12px;
  background: #8b5cf6;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: background-color 0.2s ease;
}
.round-results-btn:hover {
  background: #a78bfa;
}
.round-results-btn.results-complete {
  background: #22c55e;
}
.round-results-btn.results-complete:hover {
  background: #16a34a;
}
.match-card {
  background: #222; padding: 15px; border-radius: 12px;
  margin-bottom: 15px; border: 1px solid #333;
}
.match-info-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #333;
}
.match-number { font-weight: 700; font-size: 16px; color: #8b5cf6; }
.match-status { font-size: 12px; color: #aaa; }
.match-details-editor { 
  display: flex; flex-direction: column; gap: 10px; margin: 10px 0 15px;
}
.match-details-editor .input-group {
  display: flex; align-items: center; gap: 10px;
}
.match-details-editor .input-group label {
  color: #ddd; font-size: 14px; min-width: 60px;
}
.match-details-editor input {
  flex: 1; padding: 8px; border-radius: 8px; border: 1px solid #444;
  background: #2c2c2c; color: #f0f0f0; font-size: 14px;
}
.match-details-public {
  font-size: 14px; color: #aaa; margin: 10px 0 15px;
  display: flex; flex-direction: column; gap: 5px;
}
.match-details-public strong { color: #ccc; }
.team-list { list-style: none; padding-left: 0; margin-top: 0; }
.team-list li { 
  margin-bottom: 8px; font-size: 15px; padding-left: 10px;
  border-left: 3px solid #555;
}
.team-list li:last-child { margin-bottom: 0; }
.team-list li strong { 
  font-weight: 600; min-width: 100px; display: inline-block;
}
.team-result {
  color: #8b5cf6;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
}
.team-position-правительство { color: #22c55e; }
.team-position-оппозиция { color: #ef4444; }
.team-position-оп { color: #3b82f6; }
.team-position-оо { color: #f97316; }
.team-position-зп { color: #8b5cf6; }
.team-position-зо { color: #ec4899; }

/* Bracket Sub-navigation */
.bracket-sub-nav {
  display: flex;
  background: #262626;
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 20px;
}

.bracket-sub-nav-btn {
  flex: 1;
  padding: 10px;
  background: none;
  border: none;
  border-radius: 6px;
  color: #d1d5db;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.bracket-sub-nav-btn.active {
  background: #8b5cf6;
  color: #ffffff;
  font-weight: 600;
}

.bracket-content-pane {
  min-height: 200px;
}

/* Tournament Progress Styles */
.tournament-progress {
  background: #1a1a1a;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 15px;
  border-left: 4px solid #8b5cf6;
}

.tournament-progress h5 {
  color: #8b5cf6;
  margin: 0 0 8px 0;
  font-size: 16px;
}

.progress-description {
  color: #aaa;
  font-size: 14px;
  margin: 0;
  line-height: 1.4;
}

.tournament-status {
  margin-bottom: 15px;
  padding: 15px;
  background: #1a1a1a;
  border-radius: 8px;
  border-left: 4px solid #22c55e;
}

.tournament-status h5 {
  color: #22c55e;
  margin: 0 0 10px 0;
  font-size: 16px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #16a34a);
  transition: width 0.3s ease;
}

.debug-info {
  margin-top: 8px;
  padding: 8px;
  background: #333;
  border-radius: 4px;
  font-size: 11px;
  color: #aaa;
}
</style>