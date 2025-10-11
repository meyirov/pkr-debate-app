<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Результаты Раунда {{ round.round }}</h3>
        <button @click="close" class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="localMatches.length > 0" class="matches-container">
          <div v-for="(match, matchIndex) in localMatches" :key="matchIndex" class="match-editor">
            <h4 class="match-editor-title">Матч {{ matchIndex + 1 }}: {{ match.teams.map(t => t.faction_name).join(' vs ') }}</h4>
            <div class="teams-editor">
              <div v-for="(team, teamIndex) in match.teams" :key="teamIndex" class="team-editor-card">
                <div class="team-name">{{ team.position }}: {{ team.faction_name }}</div>
                <div class="rank-input">
                  <label>Ранг:</label>
                  <input v-model.number="team.rank" type="number" min="1" :max="match.teams.length">
                </div>
                <div class="speakers-editor">
                  <div v-for="(speaker, speakerIndex) in team.speakers" :key="speakerIndex" class="speaker-input">
                    <label>{{ speakerName(speaker.username) }}:</label>
                    <input
                      v-model.number="speaker.points"
                      type="number"
                      inputmode="numeric"
                      :min="60"
                      :max="100"
                      step="0.5"
                      placeholder="—"
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-else>Нет матчей для отображения.</p>
      </div>
      <div class="modal-actions">
        <button @click="close" class="btn-cancel">Отмена</button>
        <button @click="save" class="btn-save">Сохранить</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue';
import { supabase } from '@/supabase';

const props = defineProps({
  round: {
    type: Object,
    required: true
  },
  format: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'save']);

const localMatches = ref([]);

// Removed dropdown options; using manual numeric inputs instead

watch(() => props.round, (newRound) => {
  if (newRound && newRound.matches) {
    localMatches.value = JSON.parse(JSON.stringify(newRound.matches));
  } else {
    localMatches.value = [];
  }
}, { immediate: true, deep: true });

// Map usernames to full names
const nameCache = ref({});
const loadNamesForRound = async () => {
  const usernames = new Set();
  localMatches.value.forEach(m => m.teams.forEach(t => t.speakers.forEach(s => { if (s?.username) usernames.add(s.username); })));
  if (usernames.size === 0) return;
  const missing = Array.from(usernames).filter(u => !nameCache.value[u]);
  if (missing.length === 0) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('telegram_username, fullname')
    .in('telegram_username', missing);
  if (!error && data) {
    const map = { ...nameCache.value };
    data.forEach(p => { map[p.telegram_username] = p.fullname || p.telegram_username; });
    nameCache.value = map;
  }
};

watch(localMatches, () => { loadNamesForRound(); }, { immediate: true, deep: true });

const speakerName = (username) => nameCache.value[username] || username;

const setWinner = (match) => {
  match.participants.forEach(p => {
    p.rank = (p.id === match.winnerId) ? 1 : 2;
  });
};

const save = () => {
  emit('save', localMatches.value);
};

const close = () => {
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #1e1e1e;
  padding: 20px;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #333;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  padding-bottom: 15px;
  margin-bottom: 15px;
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  color: #8b5cf6;
}

.close-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 28px;
  cursor: pointer;
}

.modal-body {
  overflow-y: auto;
  padding-right: 10px; /* For scrollbar */
}

.matches-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.match-editor {
  background: #2a2a2a;
  padding: 15px;
  border-radius: 8px;
}

.match-editor-title {
  margin: 0 0 15px 0;
  font-size: 16px;
  border-bottom: 1px solid #444;
  padding-bottom: 10px;
}

.teams-editor {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.team-editor-card {
  background: #333;
  padding: 10px;
  border-radius: 6px;
}

.team-name {
  font-weight: 600;
  margin-bottom: 10px;
}

.rank-input {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.rank-input label {
  font-size: 14px;
}

.rank-input input {
  width: 60px;
  padding: 5px;
  background: #2a2a2a;
  border: 1px solid #555;
  color: #fff;
  border-radius: 4px;
}

.speakers-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid #444;
  padding-top: 10px;
}

.speaker-input {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.speaker-input label {
  font-size: 14px;
  color: #ccc;
}

.speaker-input select {
  width: 80px;
  padding: 5px;
  background: #2a2a2a;
  border: 1px solid #555;
  color: #fff;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #333;
}

.btn-cancel, .btn-save {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel {
  background: #444;
  color: #fff;
}

.btn-save {
  background: #8b5cf6;
  color: #fff;
}
</style>