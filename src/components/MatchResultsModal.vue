<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h3>Ввод результатов Раунда {{ round.round }}</h3>
      <p class="modal-subtitle">Введите результаты для всех матчей этого раунда</p>
      <div class="results-grid">
        <div v-for="(match, matchIndex) in localMatches" :key="matchIndex" class="result-match-card">
          <h4>Матч {{ matchIndex + 1 }} (Кабинет: {{ match.room || '?' }})</h4>
          
          <div v-if="format === 'АПФ'" class="winner-selector-apf">
            <label 
              v-for="team in match.teams" 
              :key="team.reg_id" 
              class="team-radio-label"
            >
              <input 
                type="radio" 
                :name="`winner-${matchIndex}`" 
                :value="team.reg_id"
                v-model="match.winner_reg_id"
              >
              <span>{{ team.faction_name }}</span>
            </label>
          </div>

          <div v-for="team in match.teams" :key="team.reg_id || team.original_reg_id" class="team-block">
            <strong>{{ team.faction_name }} ({{ team.position }})</strong>
            
            <!-- Speaker scores only for qualifying rounds -->
            <div v-if="!isPlayoff" class="speaker-inputs">
              <div v-for="speaker in team.speakers" :key="speaker.username" class="speaker-input-group">
                <label>{{ speaker.username }}</label>
                <input v-model.number="speaker.points" type="number" min="50" max="100">
              </div>
            </div>
            
            <!-- Rank selector for qualifying rounds -->
            <div v-if="!isPlayoff && format === 'БПФ'" class="rank-selector">
              <label>Ранг:</label>
              <select v-model.number="team.rank">
                <option value="0">-</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
            
            <!-- Winner selection for playoff rounds -->
            <div v-if="isPlayoff" class="winner-selector">
              <label>
                <input 
                  type="radio" 
                  :name="`winner-${matchIndex}`" 
                  :value="team.reg_id || team.original_reg_id"
                  v-model="match.winner_id"
                >
                Победитель
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button @click="$emit('close')" class="action-btn cancel">Отмена</button>
        <button @click="saveResults" class="action-btn save">Сохранить результаты</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue';

const props = defineProps({
  round: { type: Object, required: true },
  format: { type: String, required: true },
  isPlayoff: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'save']);

// ИСПРАВЛЕНИЕ: Используем reactive для лучшего отслеживания изменений в массиве объектов
const localMatches = reactive([]);

// ИСПРАВЛЕНИЕ: Используем watch вместо watchEffect для более точного контроля
watch(() => props.round, (newRound) => {
  // Очищаем старые данные
  localMatches.length = 0;
  
  // Создаём глубокую копию и добавляем в наш reactive массив
  const newMatches = JSON.parse(JSON.stringify(newRound.matches));

  // Добавляем поле winner_reg_id для АПФ, если его нет
  if (props.format === 'АПФ' && !props.isPlayoff) {
    newMatches.forEach(match => {
      const winner = match.teams.find(t => t.rank === 1);
      match.winner_reg_id = winner ? (winner.reg_id || winner.original_reg_id) : null;
    });
  }
  
  // Для playoff добавляем winner_id поле
  if (props.isPlayoff) {
    newMatches.forEach(match => {
      const winner = match.teams.find(t => t.rank === 1);
      match.winner_id = winner ? (winner.reg_id || winner.original_reg_id) : null;
    });
  }
  // Заполняем наш массив новыми данными
  Object.assign(localMatches, newMatches);
}, { immediate: true, deep: true }); // immediate: true - чтобы выполнился сразу при создании

const saveResults = () => {
  if (props.isPlayoff) {
    // For playoff: set rank based on winner selection
    localMatches.forEach(match => {
      match.teams.forEach(team => {
        const teamId = team.reg_id || team.original_reg_id;
        team.rank = (teamId === match.winner_id) ? 1 : 2;
      });
    });
  } else if (props.format === 'АПФ') {
    // For qualifying APF: set rank based on winner selection
    localMatches.forEach(match => {
      match.teams.forEach(team => {
        const teamId = team.reg_id || team.original_reg_id;
        team.rank = (teamId === match.winner_reg_id) ? 1 : 2;
      });
    });
  }
  emit('save', JSON.parse(JSON.stringify(localMatches)));
  emit('close');
};
</script>

<style scoped>
/* Стили без изменений */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.8); display: flex;
  justify-content: center; align-items: center; z-index: 1000; padding: 10px;
}
.modal-content {
  background: #1a1a1a; padding: 20px; border-radius: 12px;
  width: 95%; max-width: 600px; max-height: 90vh;
  display: flex; flex-direction: column;
}
.modal-content h3 { text-align: center; margin-bottom: 10px; }
.modal-subtitle {
  text-align: center;
  color: #aaa;
  font-size: 14px;
  margin-bottom: 20px;
}
.results-grid {
  overflow-y: auto; display: flex; flex-direction: column; gap: 15px;
  padding: 5px;
}
.result-match-card { background: #222; padding: 15px; border-radius: 8px; }
.result-match-card h4 { margin-bottom: 10px; color: #8b5cf6; }
.team-block { border-top: 1px solid #333; padding-top: 10px; margin-top: 10px; }
.team-block:first-of-type { border-top: none; margin-top: 0; padding-top: 0; }
.team-block strong { font-size: 16px; display: block; margin-bottom: 10px;}
.speaker-inputs { margin: 10px 0; display: flex; flex-direction: column; gap: 8px; }
.speaker-input-group { display: flex; justify-content: space-between; align-items: center; }
.speaker-input-group label { font-size: 14px; color: #aaa; }
.speaker-input-group input {
  width: 70px; padding: 5px; text-align: center;
  border-radius: 6px; border: 1px solid #444;
  background: #2c2c2c; color: #f0f0f0;
}
input[type=number]::-webkit-inner-spin-button, 
input[type=number]::-webkit-outer-spin-button { 
  -webkit-appearance: none; 
  margin: 0; 
}
input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}
.rank-selector { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.rank-selector select {
  width: 70px; padding: 5px;
  border-radius: 6px; border: 1px solid #444;
  background: #2c2c2c; color: #f0f0f0;
}
.modal-actions {
  display: flex; gap: 10px; margin-top: 20px;
  padding-top: 20px; border-top: 1px solid #333;
}
.action-btn {
  flex: 1; padding: 10px; border-radius: 8px; border: none;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.action-btn.save { background-color: #22c55e; color: white; }
.action-btn.cancel { background-color: #444; color: white; }
.winner-selector-apf {
  display: flex;
  justify-content: space-around;
  margin-bottom: 15px;
}
.team-radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.winner-selector {
  margin-top: 10px;
}
.winner-selector label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #ddd;
}
</style>