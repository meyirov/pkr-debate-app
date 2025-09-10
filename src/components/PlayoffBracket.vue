<template>
  <div class="playoff-bracket-container">
    <div v-if="bracketStore.isLoading">
      <p>Загрузка playoff данных...</p>
    </div>
    
    <div v-else-if="!bracketStore.bracket?.playoff_data">
      <div v-if="isCreator" class="playoff-setup-section">
        <button @click="showPlayoffSetup = !showPlayoffSetup" class="setup-playoff-btn">
          {{ showPlayoffSetup ? 'Скрыть настройки' : 'Настроить Плей-офф' }}
        </button>
        
        <form v-if="showPlayoffSetup" @submit.prevent="handlePlayoffSetup" class="playoff-setup-form">
          <h4>Настройки Плей-офф</h4>
          
          <div class="form-group">
            <label for="playoff-format">Формат Плей-офф</label>
            <select id="playoff-format" v-model="playoffSettings.format">
              <option value="АПФ">АПФ</option>
              <option value="БПФ" disabled>БПФ (недоступен для плей-офф)</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="playoff-teams-count">Команд в главном брейке</label>
            <input 
              id="playoff-teams-count" 
              v-model.number="playoffSettings.mainBreakCount" 
              type="number" 
              placeholder="Напр., 8 или 16" 
              min="2"
              required
            >
          </div>
          
          <div class="form-group">
            <label>
              <input 
                type="checkbox" 
                v-model="playoffSettings.enableLeagues"
                @change="playoffSettings.enableLeagues ? null : playoffSettings.betaStart = null; playoffSettings.betaEnd = null"
              >
              Разделить на лиги (напр. Бета-лига)
            </label>
            <div v-if="playoffSettings.enableLeagues" class="sub-form">
              <input 
                v-model.number="playoffSettings.betaStart" 
                type="number" 
                placeholder="Команда, начиная с №"
                min="1"
              >
              <input 
                v-model.number="playoffSettings.betaEnd" 
                type="number" 
                placeholder="Команда, заканчивая №"
                min="1"
              >
            </div>
          </div>
          
          <div class="form-group">
            <label>
              <input 
                type="checkbox" 
                v-model="playoffSettings.enableLD"
                @change="playoffSettings.enableLD ? null : playoffSettings.ldCount = 0"
              >
              Сформировать сетку ЛД (Личный Зачет)
            </label>
            <div v-if="playoffSettings.enableLD" class="sub-form">
              <input 
                v-model.number="playoffSettings.ldCount" 
                type="number" 
                placeholder="Спикеров в брейке ЛД (напр. 8)"
                min="2"
              >
            </div>
          </div>
          
          <button type="submit" :disabled="isGeneratingPlayoff">
            {{ isGeneratingPlayoff ? 'Генерация...' : 'Опубликовать Брейк и Сгенерировать Сетки' }}
          </button>
        </form>
      </div>
      <p v-else>Playoff сетки ещё не сформированы организатором.</p>
    </div>

    <div v-else class="playoff-display">
      <div v-for="(league, leagueName) in bracketStore.bracket.playoff_data" :key="leagueName" class="league-bracket">
        <h3 class="league-title">{{ league.name }}</h3>
        
        <div class="playoff-bracket">
          <div v-for="round in league.rounds" :key="round.round" class="playoff-round">
            <h4 class="round-title">{{ round.round === league.rounds.length ? 'Финал' : `Раунд ${round.round}` }}</h4>
            
            <div v-for="(match, matchIndex) in round.matches" :key="matchIndex" class="playoff-match">
              <div class="match-header">
                <span class="match-number">Матч {{ matchIndex + 1 }}</span>
                <span v-if="match.room" class="match-room">Кабинет: {{ match.room }}</span>
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
              
              <div class="playoff-teams">
                <div 
                  v-for="team in match.teams" 
                  :key="team.reg_id || team.original_reg_id" 
                  class="playoff-team"
                  :class="{ 
                    'team-winner': team.rank === 1,
                    'team-seed': team.seed 
                  }"
                >
                  <span v-if="team.seed" class="team-seed">#{{ team.seed }}</span>
                  <span class="team-name">{{ team.faction_name }}</span>
                  <span v-if="team.rank > 0" class="team-rank">Ранг: {{ team.rank }}</span>
                </div>
              </div>
              
              <button 
                v-if="isCreator" 
                @click="openPlayoffResultsModal(leagueName, round.round - 1, matchIndex)"
                class="result-btn"
              >
                Ввести результаты
              </button>
            </div>
          </div>
          
          <!-- Generate Next Round Button -->
          <div v-if="isCreator && canGenerateNextRound(league)" class="generate-next-round-section">
            <button 
              @click="generateNextRound(leagueName)"
              class="generate-next-round-btn"
            >
              Сгенерировать {{ getNextRoundName(league) }}
            </button>
          </div>
        </div>
      </div>
      
      <div v-if="isCreator && areAllPlayoffsFinished" class="final-results-section">
        <button 
          v-if="!bracketStore.bracket.final_results_published"
          @click="handlePublishFinalResults"
          class="publish-final-btn"
        >
          🏆 Опубликовать итоги турнира (отборочные + финальные результаты)
        </button>
        <div v-else class="final-results-published">
          <h3>🏆 Итоги турнира опубликованы!</h3>
        </div>
      </div>
    </div>

    <!-- Playoff Results Modal -->
    <MatchResultsModal 
      v-if="showPlayoffResultsModal" 
      :round="currentPlayoffRound"
      :format="currentPlayoffFormat"
      :is-playoff="true"
      @close="showPlayoffResultsModal = false"
      @save="handleSavePlayoffResults"
    />
  </div>
</template>

<script setup>
import { reactive, ref, computed, onUnmounted } from 'vue';
import { useBracketStore } from '@/stores/bracket';
import MatchResultsModal from '@/components/MatchResultsModal.vue';

const props = defineProps({
  isCreator: { type: Boolean, required: true }
});

const bracketStore = useBracketStore();
const showPlayoffSetup = ref(false);
const showPlayoffResultsModal = ref(false);
const isGeneratingPlayoff = ref(false);
const currentPlayoffRound = ref(null);
const currentPlayoffFormat = ref('');
const currentPlayoffLeague = ref('');
const currentPlayoffRoundIndex = ref(0);
const currentPlayoffMatchIndex = ref(0);

const playoffSettings = reactive({
  format: 'АПФ',
  mainBreakCount: 8,
  enableLeagues: false,
  betaStart: null,
  betaEnd: null,
  enableLD: false,
  ldCount: 0
});

let saveTimeout = null;
const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    bracketStore.updateBracketData();
  }, 1000);
};

const areAllPlayoffsFinished = computed(() => {
  if (!bracketStore.bracket?.playoff_data) return false;
  
  for (const league of Object.values(bracketStore.bracket.playoff_data)) {
    for (const round of league.rounds) {
      for (const match of round.matches) {
        if (!match.teams.some(team => team.rank === 1)) {
          return false;
        }
      }
    }
  }
  return true;
});

const handlePlayoffSetup = async () => {
  isGeneratingPlayoff.value = true;
  const success = await bracketStore.finalizeAndPublishBreak(playoffSettings);
  if (success) {
    showPlayoffSetup.value = false;
    alert('Playoff сетки успешно сгенерированы!');
  }
  isGeneratingPlayoff.value = false;
};

const openPlayoffResultsModal = (leagueName, roundIndex, matchIndex) => {
  const league = bracketStore.bracket.playoff_data[leagueName];
  const round = league.rounds[roundIndex];
  
  currentPlayoffLeague.value = leagueName;
  currentPlayoffRoundIndex.value = roundIndex;
  currentPlayoffMatchIndex.value = matchIndex;
  currentPlayoffFormat.value = league.format;
  currentPlayoffRound.value = {
    round: round.round,
    matches: [round.matches[matchIndex]]
  };
  
  showPlayoffResultsModal.value = true;
};

const handleSavePlayoffResults = (updatedMatches) => {
  if (!bracketStore.bracket?.playoff_data) return;
  
  const league = bracketStore.bracket.playoff_data[currentPlayoffLeague.value];
  const round = league.rounds[currentPlayoffRoundIndex.value];
  round.matches[currentPlayoffMatchIndex.value] = updatedMatches[0];
  
  bracketStore.updateBracketData();
};

const handlePublishFinalResults = async () => {
  if (confirm('Вы уверены, что хотите опубликовать итоги турнира? Это действие нельзя отменить.')) {
    const success = await bracketStore.publishFinalResults();
    if (success) {
      alert('Итоги турнира успешно опубликованы!');
    }
  }
};

const canGenerateNextRound = (league) => {
  if (!league.rounds || league.rounds.length === 0) return false;
  
  const currentRound = league.rounds[league.currentRound - 1];
  if (!currentRound) return false;
  
  // Check if current round is finished
  const isCurrentRoundFinished = currentRound.matches.every(match => 
    match.teams.some(team => team.rank === 1)
  );
  
  // Check if we haven't reached the final round yet
  const hasMoreRounds = league.currentRound < league.totalRounds;
  
  return isCurrentRoundFinished && hasMoreRounds;
};

const getNextRoundName = (league) => {
  const nextRoundNumber = league.currentRound + 1;
  const totalRounds = league.totalRounds;
  
  if (nextRoundNumber === totalRounds) {
    return 'Финал';
  } else if (nextRoundNumber === totalRounds - 1) {
    return 'Полуфинал';
  } else {
    return `Раунд ${nextRoundNumber}`;
  }
};

const generateNextRound = async (leagueName) => {
  const success = await bracketStore.generateNextPlayoffRound(leagueName);
  if (success) {
    // Round generated successfully
  }
};

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout);
});
</script>

<style scoped>
.playoff-bracket-container {
  width: 100%;
}

.playoff-setup-section {
  margin-bottom: 20px;
}

.setup-playoff-btn {
  width: 100%;
  padding: 12px;
  background: #8b5cf6;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 15px;
}

.playoff-setup-form {
  background: #222;
  padding: 20px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.playoff-setup-form h4 {
  margin-bottom: 5px;
  text-align: center;
  font-size: 18px;
  color: #fff;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  color: #ddd;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding-left: 20px;
}

.playoff-setup-form input,
.playoff-setup-form select {
  width: 100%;
  padding: 10px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #262626;
  color: #e6e6e6;
  font-size: 14px;
  box-sizing: border-box;
}

.playoff-setup-form button {
  padding: 12px;
  background: #22c55e;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  margin-top: 10px;
}

.playoff-setup-form button:disabled {
  background: #555;
  cursor: not-allowed;
}

.playoff-display {
  display: flex;
  overflow-x: auto;
  padding: 20px;
  background-color: #0f0f0f;
  gap: 20px;
}

.league-bracket {
  flex-shrink: 0;
  min-width: 300px;
}

.league-title {
  text-align: center;
  color: #a78bfa;
  margin-bottom: 30px;
  font-size: 20px;
  font-weight: 600;
}

.playoff-bracket {
  display: flex;
  flex-direction: row;
}

.playoff-round {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  margin-right: 50px;
  min-width: 200px;
}

.playoff-round:last-child {
  margin-right: 0;
}

.round-title {
  text-align: center;
  color: #6b7280;
  margin-bottom: 20px;
  font-weight: 500;
  font-size: 16px;
}

.playoff-match {
  background: #1a1a1a;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #333;
  margin-bottom: 20px;
  position: relative;
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.match-number {
  font-weight: 600;
  color: #8b5cf6;
  font-size: 14px;
}

.match-room {
  font-size: 12px;
  color: #aaa;
}

.match-details-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-group label {
  color: #ddd;
  font-size: 12px;
  min-width: 50px;
}

.input-group input {
  flex: 1;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2c2c2c;
  color: #f0f0f0;
  font-size: 12px;
}

.match-details-public {
  font-size: 12px;
  color: #aaa;
  margin: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.playoff-teams {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
}

.playoff-team {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #222;
  border: 1px solid #333;
  transition: background-color 0.2s ease;
}

.playoff-team.team-winner {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
  font-weight: 600;
}

.team-seed {
  font-size: 10px;
  color: #6b7280;
  font-weight: bold;
  min-width: 30px;
}

.team-name {
  flex: 1;
  font-size: 14px;
  color: #e6e6e6;
}

.team-rank {
  font-size: 12px;
  color: #8b5cf6;
  font-weight: 600;
}

.result-btn {
  width: 100%;
  margin-top: 10px;
  padding: 8px;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
}

.result-btn:hover {
  background: #a78bfa;
}

.generate-next-round-section {
  margin-top: 20px;
  text-align: center;
}

.generate-next-round-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);
  transition: all 0.3s ease;
}

.generate-next-round-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
}

.final-results-section {
  margin-top: 30px;
  text-align: center;
}

.publish-final-btn {
  padding: 15px 30px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: #000;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 18px;
  font-weight: 700;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
}

.publish-final-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4);
}

.final-results-published {
  padding: 20px;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  border-radius: 12px;
  color: white;
}

.final-results-published h3 {
  margin: 0;
  font-size: 20px;
}
</style>
