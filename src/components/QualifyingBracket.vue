<template>
  <div>
    <!-- Bracket Sub-navigation REMOVED -->

    <!-- Qualifying Bracket Content -->
    <div class="bracket-content-pane">
      <!-- State 1: Loading -->
      <div v-if="bracketStore.isLoading">
        <p>Загрузка данных о сетке...</p>
      </div>

      <!-- State 2: Bracket does NOT exist -->
      <div v-else-if="!bracketStore.bracket">
        <!-- Show generation form to creator -->
        <form v-if="isCreator" @submit.prevent="handleGenerate" class="bracket-setup-form">
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

          <button type="submit" :disabled="isGenerating || !isFormValid">
            {{ isGenerating ? 'Генерация...' : 'Сгенерировать 1-й раунд' }}
          </button>
          <p v-if="!isFormValid && !isGenerating" class="error-message">
            Количество команд должно быть кратно {{ setup.format === 'АПФ' ? 2 : 4 }} и не превышать количество принятых команд ({{ acceptedTeamsCount }}).
          </p>
        </form>
        <!-- Show message to non-creators -->
        <div v-else>
          <p>Сетка отборочных раундов ещё не сформирована организатором.</p>
        </div>
      </div>

      <!-- State 3: Bracket EXISTS -->
      <div v-else>
        <div v-if="isCreator" class="round-admin-panel">
          <div class="tournament-status">
            <h5>Прогресс турнира: {{ bracketStore.bracket.matches?.matches?.length || 0 }} / {{ setup.roundCount }} раундов</h5>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${((bracketStore.bracket.matches?.matches?.length || 0) / setup.roundCount) * 100}%` }"></div>
            </div>
            <div class="debug-info" v-if="isCreator">
              <small>Debug: Раундов создано: {{ bracketStore.bracket.matches?.matches?.length || 0 }} / {{ setup.roundCount }} | Все раунды завершены: {{ isCurrentRoundFinished }} | Результаты опубликованы: {{ bracketStore.bracket?.results_published }} | Playoff данные: {{ !!bracketStore.bracket?.playoff_data }}</small>
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
            v-if="isCreator && isQualifyingFinished && !bracketStore.bracket?.results_published"
            @click="publishQualifyingResults" 
            class="admin-action-btn publish-qualifying"
          >
            📊 Опубликовать результаты отборочных
          </button>
          
          <!-- Show playoff setup only after qualifying results are published -->
          <button 
            v-if="isCreator && isQualifyingFinished && (bracketStore.bracket?.results_published || false) && !bracketStore.bracket?.playoff_data"
            @click="switchToPlayoffTab" 
            class="admin-action-btn setup-playoff"
          >
            Настроить Плей-офф
          </button>
        </div>

        <div v-for="(round, roundIndex) in (bracketStore.bracket.matches?.matches || [])" :key="round.round" class="round-section">
          <div class="round-header">
            <h4 class="round-title">Раунд {{ round.round }}</h4>
            <button 
              v-if="isCreator"
              @click="openResultsModal(roundIndex)" 
              class="round-results-btn"
              :class="{ 'results-complete': isRoundFinished(round) }"
            >
              {{ isRoundFinished(round) ? '✅ Результаты введены' : '📝 Ввести результаты' }}
            </button>
            <button
              v-if="isCreator && isRoundFinished(round)"
              @click="bracketStore.toggleRoundResultsPublication(roundIndex)"
              :class="['publish-results-btn', round.results_published ? 'unpublish' : 'publish']"
            >
              {{ round.results_published ? '🙈 Скрыть результаты' : '📢 Опубликовать результаты' }}
            </button>
          </div>
          <template v-if="Array.isArray(round.matches)">
            <div v-for="(match, matchIndex) in round.matches" :key="matchIndex" class="match-card">
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
                <li v-for="team in match.teams" :key="team.reg_id" :class="`team-position-${team.position.toLowerCase().replace(/[^a-z0-9]/g, '')}`">
                  <strong>{{ team.position }}:</strong> {{ team.faction_name }}
                  <span v-if="team.rank > 0 && (isCreator || round.results_published)" class="team-result">(Ранг: {{ team.rank }})</span>
                </li>
              </ul>
            </div>
          </template>
           <div v-else class="data-error-message">
            <p>Ошибка в данных сетки для Раунда {{ round.round }}. Обратитесь к администратору.</p>
            <button v-if="isCreator" @click="deleteBracket" class="delete-bracket-btn">
              Удалить сетку и начать заново
            </button>
          </div>
        </div>
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

const props = defineProps({
  tournamentId: { type: Number, required: true },
  isCreator: { type: Boolean, required: true },
  isQualifyingFinished: { type: Boolean, default: false }
});

const emit = defineEmits(['switchToPlayoff']);

const bracketStore = useBracketStore();
const tournamentsStore = useTournamentsStore();
const isGenerating = ref(false);
const showResultsModal = ref(false);
const selectedRound = ref(null);
const selectedRoundIndex = ref(0);

const setup = reactive({
  format: 'АПФ',
  teamCount: 8,
  roundCount: 4,
  tournamentId: props.tournamentId
});

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
  if (!bracketStore.bracket || !currentRound.value || !Array.isArray(currentRound.value.matches) || currentRound.value.matches.length === 0) {
    return false;
  }
  return currentRound.value.matches.every(match => 
    match.teams.every(team => team.rank > 0)
  );
});

const isRoundFinished = (round) => {
  if (!round || !Array.isArray(round.matches) || round.matches.length === 0) {
    return false;
  }
  return round.matches.every(match => 
    match.teams.every(team => team.rank > 0)
  );
};

const deleteBracket = async () => {
  if (!bracketStore.bracket) return;
  const confirmation = confirm("Вы уверены, что хотите удалить всю сетку? Это действие необратимо.");
  if (confirmation) {
    await bracketStore.deleteBracket();
    alert("Сетка была удалена. Теперь вы можете сгенерировать новую.");
  }
};

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
  const bracket = bracketStore.bracket;
  if (!bracket || !bracket.matches?.matches || !Array.isArray(bracket.matches.matches) || !bracket.matches.matches[roundIndex]) {
    console.error("Cannot open results modal: Round data is invalid or missing.", bracket?.matches?.matches);
    alert("Ошибка: Не удалось открыть модальное окно. Данные о раунде некорректны.");
    return;
  }
  
  selectedRoundIndex.value = roundIndex;
  selectedRound.value = {
    round: bracket.matches.matches[roundIndex].round,
    matches: bracket.matches.matches[roundIndex].matches
  };
  showResultsModal.value = true;
};

const handleSaveResults = (updatedMatches) => {
  if (!bracketStore.bracket || !bracketStore.bracket.matches?.matches) return;
  
  bracketStore.bracket.matches.matches[selectedRoundIndex.value].matches = updatedMatches;
  
  bracketStore.updateBracketData();
  
  showResultsModal.value = false;
  selectedRound.value = null;
};

const switchToPlayoffTab = () => {
  emit('switchToPlayoff');
};

const publishQualifyingResults = async () => {
  if (!bracketStore.bracket) return;
  
  const resultsPost = generateQualifyingResultsPost();
  
  const success = await tournamentsStore.createTournamentPost(
    bracketStore.bracket.tournament_id, 
    resultsPost
  );
  
  if (!success) {
    alert("Не удалось опубликовать результаты отборочных в постах турнира.");
    return;
  }
  
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

  bracketStore.bracket.matches.matches.forEach(round => {
    if (!Array.isArray(round.matches)) return;
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
        
        team.speakers.forEach(speaker => {
          if (!speakerStats[speaker.username]) {
            speakerStats[speaker.username] = {
              username: speaker.username,
              totalPoints: 0
            };
          }
          speakerStats[speaker.username].totalPoints += speaker.points || 0;
        });
      });
    });
  });

  const sortedTeams = Object.values(teamStats).sort((a, b) => {
    if (b.totalTP !== a.totalTP) {
      return b.totalTP - a.totalTP;
    }
    return b.totalSP - a.totalSP;
  });

  const sortedSpeakers = Object.values(speakerStats).sort((a, b) => {
    return b.totalPoints - a.totalPoints;
  });

  let resultsText = `📊 РЕЗУЛЬТАТЫ ОТБОРОЧНЫХ РАУНДОВ (${bracketStore.bracket.matches.matches.length} раундов)\n\n`;
  
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
.data-error-message {
  background: #442222;
  color: #ffaaaa;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #ef4444;
  text-align: center;
  margin-top: 15px;
}
.delete-bracket-btn {
  margin-top: 10px;
  padding: 8px 12px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
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

.publish-results-btn {
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

.publish-results-btn.publish {
  background-color: #3b82f6;
  color: white;
}

.publish-results-btn.unpublish {
  background-color: #f59e0b;
  color: white;
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

.bracket-content-pane {
  min-height: 200px;
}

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