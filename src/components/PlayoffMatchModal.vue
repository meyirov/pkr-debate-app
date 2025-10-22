<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h3>Результаты матча</h3>
      <div v-if="localParticipants.length > 0" class="match-details">
        <h4>{{ localParticipants.map(p => displayName(p.faction_name)).join(' vs ') }}</h4>
        <div class="teams-container">
          <div 
            v-for="participant in localParticipants"
            :key="participant.faction_name"
            class="team-card"
            :class="{ winner: participant.rank === 1 }"
            @click="setWinner(participant)"
          >
            {{ displayName(participant.faction_name) }}
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button @click="$emit('close')" class="btn-cancel">Отмена</button>
        <button @click="saveResults" class="btn-save">Сохранить</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue';

const props = defineProps({
  match: { type: Object, required: true },
  displayNameMap: { type: Object, default: null }
});

const emit = defineEmits(['close', 'save']);

const localParticipants = ref([]);

watch(() => props.match, (newMatch) => {
  if (newMatch && newMatch.teams) {
    localParticipants.value = JSON.parse(JSON.stringify(newMatch.teams));
  }
}, { immediate: true });

const setWinner = (winner) => {
  localParticipants.value.forEach(p => {
    p.rank = (p === winner) ? 1 : 2;
  });
};

const saveResults = () => {
  const updatedMatch = {
    ...props.match,
    teams: localParticipants.value
  };
  emit('save', updatedMatch);
};

const displayName = (usernameOrName) => {
  if (!usernameOrName) return 'TBD';
  if (props.displayNameMap && typeof props.displayNameMap.get === 'function') {
    return props.displayNameMap.get(usernameOrName) || usernameOrName;
  }
  return usernameOrName;
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background-color: #2a2a2a;
  padding: 20px;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
}
.teams-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 20px 0;
}
.team-card {
  padding: 15px;
  background-color: #333;
  border: 2px solid #555;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.team-card.winner {
  border-color: #ffd700;
  background-color: #4a4a3a;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
