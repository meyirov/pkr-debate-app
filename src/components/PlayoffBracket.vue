<template>
  <div class="playoff-bracket">
    <!-- Playoff Setup Form (for creator, if not yet generated) -->
    <div v-if="isCreator && !bracket?.playoff_data" class="playoff-setup-container">
      <h3>Настройка Плей-офф</h3>
      <form @submit.prevent="handleGeneratePlayoffs" class="playoff-setup-form">
        <!-- Main Break Settings -->
        <fieldset>
          <legend>Основной брейк (Альфа Лига)</legend>
          <div class="form-group">
            <label>Формат Плей-офф</label>
            <select v-model="playoffSettings.format">
              <option value="АПФ">АПФ</option>
              <option value="БПФ">БПФ</option>
            </select>
          </div>
          <div class="form-group">
            <label>Команды в брейке</label>
            <select v-model.number="playoffSettings.mainBreakCount">
              <option v-for="opt in breakOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </fieldset>

        <!-- Beta League Settings -->
        <fieldset>
          <legend>Бета Лига</legend>
          <div class="form-group-checkbox">
            <input type="checkbox" id="enableLeagues" v-model="playoffSettings.enableLeagues">
            <label for="enableLeagues">Включить Бета Лигу (для новичков/продолжающих)</label>
          </div>
          <div v-if="playoffSettings.enableLeagues" class="form-group-inline">
            <label>Команды с</label>
            <input type="number" v-model.number="playoffSettings.betaStart" min="1">
            <label>по</label>
            <input type="number" v-model.number="playoffSettings.betaEnd" min="1">
          </div>
        </fieldset>

        <!-- LD League Settings -->
        <fieldset>
          <legend>Лига Лучших Спикеров (ЛД)</legend>
          <div class="form-group-checkbox">
            <input type="checkbox" id="enableLD" v-model="playoffSettings.enableLD">
            <label for="enableLD">Включить ЛД</label>
          </div>
          <div v-if="playoffSettings.enableLD" class="form-group">
            <label>Количество спикеров в брейке</label>
            <select v-model.number="playoffSettings.ldCount">
              <option v-for="opt in breakOptions" :key="opt.value" :value="opt.value">{{ opt.label.replace('команды', 'спикеров').replace('команд', 'спикеров') }}</option>
            </select>
          </div>
        </fieldset>

        <button type="submit" class="generate-playoff-btn">Сгенерировать Плей-офф</button>
      </form>
    </div>

    <!-- Playoff Bracket Display (if generated) -->
    <div v-else-if="bracket?.playoff_data" class="bracket-display-container">
      <div class="bracket-controls-container">
        <div class="publish-container">
          <template v-if="isCreator">
            <button v-if="!bracket?.final_results_published" @click="handlePublish" class="publish-button">
              Опубликовать итоги турнира
            </button>
            <div v-else class="results-published-indicator">
              🏆 Итоги турнира опубликованы!
            </div>
          </template>
          <div v-else-if="bracket?.final_results_published" class="results-published-indicator">
            🏆 Итоги турнира опубликованы!
          </div>
        </div>
        <div class="bracket-canvas-controls">
          <div class="league-tabs">
            <button
              v-for="league in leagues"
              :key="league.id"
              :class="{ active: activeLeagueId === league.id }"
              @click="activeLeagueName = league.id"
            >
              {{ league.name }}
            </button>
          </div>
          <div class="zoom-controls">
            <button @click="zoomOut">-</button>
            <span>{{ Math.round(zoom * 100) }}%</span>
            <button @click="zoomIn">+</button>
          </div>
          <button class="reset-button" @click="resetZoom">Сброс</button>
        </div>
      </div>
      
      <div class="bracket-canvas">
        <div ref="zoomSizerRef" class="zoom-container-sizer">
          <div 
            ref="zoomContentRef" 
            class="zoom-container-content" 
            :style="{ transform: `scale(${zoom})` }"
          >
            <div class="bracket-layout-container" ref="gridRef">
              <div v-for="(round, roundIndex) in rounds" :key="roundIndex" class="round-column">
                <div class="round-header">
                  <h3 class="round-title">{{ getRoundDisplayName(round.round) }}</h3>
                  <div class="round-controls">
                    <button
                      v-if="isCreator"
                      @click="bracketStore.publishPlayoffRound({ leagueName: activeLeagueId, roundIndex: roundIndex })"
                      :class="['publish-round-btn', round.published ? 'unpublish' : 'publish']"
                      :disabled="!isRoundReadyForPublication(round)"
                    >
                      <span v-if="round.published">🙈 Скрыть</span>
                      <span v-else>📢 Опубликовать</span>
                    </button>
                    <!-- Debug info -->
                    <div v-if="isCreator" class="debug-info" style="font-size: 10px; color: #666; margin-top: 5px;">
                      <div>{{ getRoundDisplayName(round.round) }}:</div>
                      <div>Published: {{ round.published }}</div>
                      <div>Ready for publication: {{ isRoundReadyForPublication(round) }}</div>
                      <div>Matches count: {{ round.matches?.length }}</div>
                      <div>All matches have room/judge: {{ round.matches?.every(m => m.room && m.judge) }}</div>
                      <div>Active League Name: {{ activeLeagueName }}</div>
                      <div>Active League ID: {{ activeLeagueId }}</div>
                    </div>
                    <button
                      v-if="isCreator && round.published && isRoundFinished(round) && !isLastRound(round)"
                      @click="generateNextRound"
                      class="generate-next-round-btn"
                    >
                      ➡️ Следующий раунд
                    </button>
                  </div>
                </div>
                <div class="matches-in-round">
                  <div
                    v-for="(match, matchIndex) in round.matches"
                    :key="match.id"
                    class="match-card"
                    :data-match-id="match.id"
                    :class="{ 'highlighted': highlightedPath.matches.has(match.id) }"
                  >
                    <div class="match-header">
                      <span class="match-title">Матч {{ match.match_in_round }}</span>
                      <div v-if="!isCreator || round.published" class="match-details-public">
                        <span>Кабинет: {{ match.room || 'Не назначен' }}</span>
                        <span>Судья: {{ match.judge || 'Не назначен' }}</span>
                      </div>
                    </div>
                    
                    <div v-if="isCreator && !round.published" class="match-details-editor">
                      <div class="input-group">
                        <label>Кабинет:</label>
                        <input v-model="match.room" type="text" placeholder="№" @input="debouncedSave(activeLeagueId, roundIndex, matchIndex)">
                      </div>
                      <div class="input-group">
                        <label>Судья:</label>
                        <input v-model="match.judge" type="text" placeholder="Имя" @input="debouncedSave(activeLeagueId, roundIndex, matchIndex)">
                      </div>
                    </div>

                    <div class="match-participants">
                      <div 
                        v-for="(team, teamIndex) in match.teams" 
                        :key="`${match.id}-team-${teamIndex}`" 
                        class="participant"
                        :class="{ 
                          winner: team.rank === 1,
                          'highlighted-participant': highlightedPath.participants.has(`${match.id}-p${teamIndex}`) 
                        }"
                        @click="toggleHighlight({...team, id: `${match.id}-p${teamIndex}`, name: team.faction_name, is_winner: team.rank === 1}, match.round, match)"
                      >
                        <span class="participant-info">
                          <span>{{ team.faction_name }}</span>
                           <template v-if="match.round > 1">
                            <span
                              v-if="getSourceMatch({...team, id: `${match.id}-p${teamIndex}`, name: team.faction_name, is_winner: team.rank === 1}, match)"
                              class="source-match-link"
                              @click.stop="highlightSourcePath({...team, id: `${match.id}-p${teamIndex}`, name: team.faction_name, is_winner: team.rank === 1}, match)"
                            >
                              из M{{ getSourceMatch({...team, id: `${match.id}-p${teamIndex}`, name: team.faction_name, is_winner: team.rank === 1}, match)?.match_in_round }}
                            </span>
                          </template>
                        </span>
                         <span v-if="isCreator || round.published" class="rank">{{ team.rank ? `Ранг: ${team.rank}` : '' }}</span>
                      </div>
                    </div>
                    <button 
                      v-if="isCreator && round.published" 
                      @click="openResultsModal(match, roundIndex, matchIndex)"
                      class="enter-results-btn"
                    >
                      Ввести результаты
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="line-container">
                <template v-for="line in lines" :key="line.id">
                  <div v-if="line.type === 'H'" class="connector-line" :class="{'highlighted': line.highlighted}" :style="{ left: `${line.x}px`, top: `${line.y}px`, width: `${line.width}px`, height: '2px' }"></div>
                  <div v-if="line.type === 'V'" class="connector-line" :class="{'highlighted': line.highlighted}" :style="{ left: `${line.x}px`, top: `${line.y}px`, width: '2px', height: `${line.height}px` }"></div>
                </template>
              </div>
            </div>
          </div>
        </div>
      <PlayoffMatchModal
        v-if="showModal"
        :match="selectedMatch"
        @close="showModal = false"
        @save="handleSaveResults"
      />
    </div>

    <!-- Message for non-creators, if bracket not generated -->
    <div v-else>
      <p>Сетка плей-офф еще не была сгенерирована организатором.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick, reactive, defineEmits } from 'vue';
import { useBracketStore } from '@/stores/bracket';
import { storeToRefs } from 'pinia';
import PlayoffMatchModal from '@/components/PlayoffMatchModal.vue';

const props = defineProps({
  tournamentId: {
    type: Number,
    required: true,
  },
  isCreator: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['dataChanged']);

const bracketStore = useBracketStore();
const { bracket } = storeToRefs(bracketStore);

const activeLeagueName = ref(null);
const showModal = ref(false);
const selectedMatch = ref(null);
const selectedMatchInfo = ref(null);

const playoffSettings = reactive({
  format: 'АПФ',
  mainBreakCount: 8,
  enableLeagues: false,
  betaStart: 9,
  betaEnd: 16,
  enableLD: false,
  ldCount: 4,
});

const breakOptions = [
  { value: 2, label: 'Финал (2 команды)' },
  { value: 4, label: 'Полуфинал (4 команды)' },
  { value: 8, label: 'Четвертьфинал (8 команд)' },
  { value: 16, label: '1/8 финала (16 команд)' },
  { value: 32, label: '1/16 финала (32 команды)' },
];

const handleGeneratePlayoffs = async () => {
  const success = await bracketStore.finalizeAndPublishBreak(playoffSettings);
  if (success) {
    alert('Плей-офф успешно сгенерирован!');
    emit('dataChanged');
  } else {
    alert('Не удалось сгенерировать плей-офф. Проверьте настройки и количество команд.');
  }
};

let saveTimeout = null;
const debouncedSave = (leagueName, roundIndex, matchIndex) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const match = bracket.value.playoff_data[leagueName].rounds[roundIndex].matches[matchIndex];
    bracketStore.updatePlayoffMatch({
      leagueName,
      roundIndex,
      matchIndex,
      updatedMatchData: match
    });
  }, 1000); 
};


const handlePublish = () => {
  bracketStore.publishFinalResults();
};

const openResultsModal = (match, roundIndex, matchIndex) => {
  selectedMatchInfo.value = {
    leagueName: activeLeagueId,
    roundIndex: roundIndex,
    matchIndex: matchIndex,
  };
  selectedMatch.value = match;
  showModal.value = true;
};

const handleSaveResults = async (updatedMatchData) => {
  if (!selectedMatchInfo.value) return;
  
  bracketStore.updatePlayoffMatch({
    ...selectedMatchInfo.value,
    updatedMatchData
  });

  showModal.value = false;
  selectedMatchInfo.value = null;
};

const roundIsPublished = (leagueName, roundIndex) => {
  const league = bracket.value?.playoff_data?.[leagueName];
  if (!league || !league.rounds?.[roundIndex]) {
    return false;
  }
  return league.rounds[roundIndex].published;
};

const isRoundReadyForPublication = (round) => {
  if (!round || !round.matches) return false;
  return round.matches.every(match => match.room && match.judge);
};

const isRoundFinished = (round) => {
  if (!round || !round.matches) return false;
  return round.matches.every(match => match.teams.some(team => team.rank === 1));
};

const isLastRound = (round) => {
  if (!round || !bracket.value?.playoff_data) return false;
  const leagueData = bracket.value.playoff_data[activeLeagueId.value];
  if (!leagueData) return false;
  return round.round >= leagueData.totalRounds;
};

const generateNextRound = async () => {
  await bracketStore.generateNextPlayoffRound(activeLeagueId);
};

const getRoundDisplayName = (roundNumber) => {
  console.log('getRoundDisplayName called with:', roundNumber);
  
  if (!bracket.value?.playoff_data || !activeLeagueId.value) {
    console.log('Early return: missing bracket or activeLeagueId', {
      hasBracket: !!bracket.value,
      hasPlayoffData: !!bracket.value?.playoff_data,
      activeLeagueId: activeLeagueId.value
    });
    return `Раунд ${roundNumber}`;
  }
  
  console.log('Available leagues:', Object.keys(bracket.value.playoff_data));
  console.log('Looking for league:', activeLeagueId.value);
  
  const leagueData = bracket.value.playoff_data[activeLeagueId.value];
  if (!leagueData) {
    console.log('Early return: no leagueData for', activeLeagueId.value);
    return `Раунд ${roundNumber}`;
  }
  
  console.log('Debug getRoundDisplayName:', {
    roundNumber,
    leagueData,
    totalRounds: leagueData.totalRounds,
    startingRound: leagueData.startingRound
  });
  
  // For existing brackets without startingRound, calculate based on team count
  if (!leagueData.startingRound) {
    // Calculate starting round based on total rounds (which reflects team count)
    let startingRound;
    if (leagueData.totalRounds === 1) startingRound = 4; // Final (2 teams)
    else if (leagueData.totalRounds === 2) startingRound = 3; // Semi-final (4 teams)
    else if (leagueData.totalRounds === 3) startingRound = 2; // Quarter-final (8 teams)
    else if (leagueData.totalRounds === 4) startingRound = 1; // Eighth-final (16 teams)
    else startingRound = 1; // Default
    
    const actualRound = startingRound + roundNumber - 1;
    const roundNames = {
      1: '1/8',
      2: '1/4', 
      3: '1/2',
      4: 'Финал'
    };
    console.log('Calculated for existing bracket:', { startingRound, actualRound, result: roundNames[actualRound] });
    return roundNames[actualRound] || `Раунд ${actualRound}`;
  }
  
  // For new brackets with startingRound configuration
  const actualRound = leagueData.startingRound + roundNumber - 1;
  const roundNames = {
    1: '1/8',
    2: '1/4', 
    3: '1/2',
    4: 'Финал'
  };
  
  console.log('Using stored startingRound:', { startingRound: leagueData.startingRound, actualRound, result: roundNames[actualRound] });
  return roundNames[actualRound] || `Раунд ${actualRound}`;
};

const leagues = computed(() => {
  if (!bracket.value?.playoff_data) return [];
  const leagueData = bracket.value.playoff_data;
  const leagueNames = Object.keys(leagueData);

  if (leagueNames.length > 0 && !activeLeagueName.value) {
      activeLeagueName.value = leagueNames[0];
  }

  return leagueNames.map(name => ({
      id: name,
      name: leagueData[name].name || name,
  }));
});

// Ensure active league is set when leagues change
watch(leagues, (newLeagues) => {
  if (newLeagues.length > 0 && !activeLeagueName.value) {
    activeLeagueName.value = newLeagues[0].id;
  }
}, { immediate: true });

const matches = computed(() => {
  if (!bracket.value?.playoff_data) return [];
  const allMatches = [];
  const leagueData = bracket.value.playoff_data;

  Object.entries(leagueData).forEach(([leagueName, leagueDetails]) => {
      if (leagueDetails.rounds) {
          leagueDetails.rounds.forEach(round => {
              if(round.matches) {
                round.matches.forEach((match, matchIndex) => {
                    const matchId = `${leagueName}-r${round.round}-m${matchIndex}`;
                    allMatches.push({
                        ...match,
                        id: matchId,
                        league_id: leagueName,
                        round: round.round,
                        match_in_round: matchIndex + 1,
                        participants: (match.teams || []).map((team, teamIndex) => ({
                            ...team,
                            id: `${matchId}-p${teamIndex}`,
                            name: team.faction_name,
                            is_winner: team.rank === 1
                        }))
                    });
                });
              }
          });
      }
  });
  return allMatches;
});


const zoom = ref(1);
const highlightedParticipant = ref(null);

const gridRef = ref(null);
const zoomContentRef = ref(null);
const zoomSizerRef = ref(null);

const lines = ref([]);
let resizeObserver = null;

const activeLeagueId = computed(() => {
  if (activeLeagueName.value) return activeLeagueName.value;
  if (leagues.value.length > 0) return leagues.value[0].id;
  return null;
});
const activeLeague = computed(() => leagues.value.find(l => l.id === activeLeagueId.value));

const allMatchesForLeague = computed(() => {
    if (!activeLeague.value) return [];
    return matches.value.filter(m => m.league_id === activeLeague.value.id);
});

const rounds = computed(() => {
  if (!activeLeague.value || !bracket.value.playoff_data) return [];
  const leagueData = bracket.value.playoff_data[activeLeague.value.id];
  return leagueData.rounds || [];
});

const getSourceMatch = (participant, currentMatch) => {
    if (currentMatch.round === 1) return null;

    const prevRound = currentMatch.round - 1;
    
    // Find potential previous matches based on the logic that two matches from round N-1 feed into one match in round N
    const potentialSourceMatches = allMatchesForLeague.value.filter(m => 
      m.round === prevRound && Math.ceil(m.match_in_round / 2) === currentMatch.match_in_round
    );

    // Find the specific match from which this participant (winner) came
    const sourceMatch = potentialSourceMatches.find(m =>
        m.participants.some(p => p.name === participant.name && p.is_winner)
    );

    return sourceMatch;
};


const highlightedPath = computed(() => {
  const path = {
    matches: new Set(),
    participants: new Set(),
  };
  if (!highlightedParticipant.value) {
    return path;
  }

  const allMatches = allMatchesForLeague.value;
  
  const startingMatch = allMatches.find(m => 
    m.id === highlightedParticipant.value.source_match_id
  );

  if (!startingMatch) return path;

  let currentMatchForwards = startingMatch;
  while (currentMatchForwards) {
    path.matches.add(currentMatchForwards.id);
    const participantInMatch = currentMatchForwards.participants.find(p => p.name === highlightedParticipant.value.name);
    if(participantInMatch) {
      path.participants.add(participantInMatch.id);
    }
    
    if (currentMatchForwards.round >= rounds.value.length) break;
    
    const winner = currentMatchForwards.participants.find(p => p.is_winner);
    if (!winner || winner.name !== highlightedParticipant.value.name) break;

    const nextRound = currentMatchForwards.round + 1;
    const nextMatchInRound = Math.ceil(currentMatchForwards.match_in_round / 2);
    currentMatchForwards = allMatches.find(m => m.round === nextRound && m.match_in_round === nextMatchInRound);
  }
  
  let currentMatchBackwards = startingMatch;
  while(currentMatchBackwards) {
    path.matches.add(currentMatchBackwards.id);
    const participantInMatch = currentMatchBackwards.participants.find(p => p.name === highlightedParticipant.value.name);
    if(participantInMatch) {
      path.participants.add(participantInMatch.id);
    }
    
    if (currentMatchBackwards.round === 1) break;
    
    currentMatchBackwards = getSourceMatch(highlightedParticipant.value, currentMatchBackwards)
  }

  return path;
});

const isLineHighlighted = (matchId, nextMatchId) => {
  return highlightedPath.value.matches.has(matchId) && highlightedPath.value.matches.has(nextMatchId);
};

const bracketGridStyle = computed(() => {
  return {
    gridTemplateColumns: `repeat(${rounds.value.length}, 240px)`,
  };
});

const highlightSourcePath = (participant, currentMatch) => {
    if (!props.isCreator) return;
    const sourceMatch = getSourceMatch(participant, currentMatch);
    if (!sourceMatch) return;

    const winnerInSourceMatch = sourceMatch.participants.find(p => p.name === participant.name && p.is_winner);
    if (winnerInSourceMatch) {
        toggleHighlight(winnerInSourceMatch, sourceMatch.round, sourceMatch);
    }
};

const toggleHighlight = (participant, round, match) => {
  if (!props.isCreator) return;
  
  // If clicking a non-winner, find the winner from their source match and highlight them instead
  if (!participant.is_winner) {
    const sourceMatch = getSourceMatch(participant, match);
    if(sourceMatch) {
        const winnerInSourceMatch = sourceMatch.participants.find(p => p.name === participant.name && p.is_winner);
        if (winnerInSourceMatch) {
            highlightSourcePath(participant, match);
        }
    }
    return;
  }

  if (highlightedParticipant.value && highlightedParticipant.value.id === participant.id) {
    highlightedParticipant.value = null;
  } else {
    highlightedParticipant.value = { ...participant, source_round: round, source_match_id: match.id };
  }
};

const getGridPosition = (matchId) => {
  const match = allMatchesForLeague.value.find(m => m.id === matchId);
  if (!match) return {};

  const matchesInFirstRound = allMatchesForLeague.value.filter(m => m.round === 1).length;
  const maxRows = matchesInFirstRound * 2;
  
  const matchesInRound = allMatchesForLeague.value.filter(m => m.round === match.round).sort((a, b) => a.match_in_round - b.match_in_round);
  const matchIndex = matchesInRound.findIndex(m => m.id === matchId);

  const numMatchesInRound = matchesInRound.length;
  const rowPower = Math.log2(maxRows / numMatchesInRound);
  const spacing = 2 ** rowPower;
  const offset = spacing / 2;

  const gridRowStart = matchIndex * spacing + offset + 1;

  return {
    gridColumn: match.round,
    gridRow: `${gridRowStart} / span ${offset}`,
  };
};

const zoomIn = () => zoom.value = Math.min(1.5, +(zoom.value + 0.1).toFixed(2));
const zoomOut = () => zoom.value = Math.max(0.3, +(zoom.value - 0.1).toFixed(2));
const resetZoom = () => zoom.value = 1;

const drawLines = () => {
  if (!gridRef.value) return;

  requestAnimationFrame(() => {
    const newLines = [];
    const renderedMatches = allMatchesForLeague.value;

    for (const match of renderedMatches) {
      if (match.round >= rounds.value.length) continue;

      const nextRoundMatchNumber = Math.ceil(match.match_in_round / 2);
      const nextMatch = renderedMatches.find(m => m.round === match.round + 1 && m.match_in_round === nextRoundMatchNumber);

      if (nextMatch) {
        const startEl = gridRef.value.querySelector(`[data-match-id='${match.id}']`);
        const endEl = gridRef.value.querySelector(`[data-match-id='${nextMatch.id}']`);

        if (startEl && endEl) {
          const startX = startEl.offsetLeft + startEl.offsetWidth;
          const startY = startEl.offsetTop + startEl.offsetHeight / 2;
          const endX = endEl.offsetLeft;
          const endY = endEl.offsetTop + endEl.offsetHeight / 2;

          const midX = startX + (endX - startX) / 2;
          const highlighted = isLineHighlighted(match.id, nextMatch.id);

          newLines.push({ id: `${match.id}-h1`, type: 'H', x: startX, y: startY, width: (midX - startX), highlighted });
          newLines.push({ id: `${match.id}-v`, type: 'V', x: midX, y: Math.min(startY, endY), height: Math.abs(endY - startY), highlighted });
          newLines.push({ id: `${match.id}-h2`, type: 'H', x: midX, y: endY, width: (endX - midX), highlighted });
        }
      }
    }
    lines.value = newLines;
  });
};


watch([allMatchesForLeague, zoom], () => nextTick(drawLines), { deep: true, immediate: true });

const updateSizer = () => {
    if (zoomContentRef.value && zoomSizerRef.value) {
        const contentRect = zoomContentRef.value.getBoundingClientRect();
        zoomSizerRef.value.style.width = `${contentRect.width}px`;
        zoomSizerRef.value.style.height = `${contentRect.height}px`;
    }
};

onMounted(() => {
  if (zoomContentRef.value) {
    resizeObserver = new ResizeObserver(() => {
        updateSizer();
        drawLines();
    });
    resizeObserver.observe(zoomContentRef.value);
  }
  drawLines();
});

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout);
  if (resizeObserver && zoomContentRef.value) {
    resizeObserver.unobserve(zoomContentRef.value);
  }
});

watch(zoom, updateSizer);
</script>

<style scoped>
.playoff-bracket {
  width: 100%;
  display: flex;
  flex-direction: column;
  color: #fff;
  padding: 1rem;
  box-sizing: border-box;
}

.playoff-setup-container {
  background-color: #1a1a1a;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.playoff-setup-container h3 {
  text-align: center;
  color: #c4b5fd;
  margin-bottom: 20px;
}

.playoff-setup-form fieldset {
  border: 1px solid #333;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
}

.playoff-setup-form legend {
  padding: 0 10px;
  color: #a78bfa;
  font-weight: 600;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  font-size: 14px;
  color: #ddd;
  margin-bottom: 8px;
}

.form-group select, .form-group input {
  width: 100%;
  padding: 10px;
  background-color: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
}

.form-group-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-group-checkbox label {
  margin-bottom: 0;
}

.form-group-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.form-group-inline label {
  margin-bottom: 0;
  flex-shrink: 0;
}

.generate-playoff-btn {
  width: 100%;
  padding: 12px;
  background: #7c3aed;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.generate-playoff-btn:hover {
  background: #8b5cf6;
}

.bracket-display-container {
  width: 100%;
}

.bracket-controls-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

.publish-container {
  margin-bottom: 20px;
}

.publish-button {
  padding: 10px 20px;
  background-color: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  transition: all 0.3s ease;
  box-shadow: 0 0 5px #9500ff, 0 0 10px #9500ff, 0 0 15px #9500ff;
}

.publish-button:hover {
  background-color: #a833ff;
  box-shadow: 0 0 10px #9500ff, 0 0 20px #9500ff, 0 0 30px #9500ff;
}

.results-mode-toggle {
  padding: 8px 16px;
  background-color: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}

.results-mode-toggle.active {
  background-color: #22c55e;
  border-color: #22c55e;
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
}

.enter-results-btn {
  margin-top: 10px;
  width: 100%;
  padding: 8px;
  background-color: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.results-published-indicator {
  padding: 10px 20px;
  background-color: #22c55e;
  color: #fff;
  border-radius: 8px;
  font-weight: 700;
  font-size: 14px;
  text-align: center;
}

.bracket-canvas-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 10px;
  background-color: rgba(30, 30, 30, 0.8);
  border-radius: 8px;
  width: 100%;
  max-width: 900px;
  box-sizing: border-box;
}

.league-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.league-tabs button {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #333;
  background: #1e1e1e;
  color: #ddd;
  font-weight: 700;
  cursor: pointer;
}

.league-tabs button.active {
  background: #7c3aed;
  color: #fff;
  box-shadow: 0 0 14px rgba(124,58,237,0.4);
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-controls button {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #333;
  background: #1e1e1e;
  color: #fff;
  font-weight: 700;
}

.reset-button {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #7c3aed;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.bracket-canvas {
  width: 100%;
  overflow: auto;
  position: relative;
  background-image: radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.1) 1px, transparent 0);
  background-size: 20px 20px;
  border-radius: 12px;
  padding: 20px;
  box-sizing: border-box;
}

.zoom-container-sizer {
  position: relative;
  transition: width 0.2s ease-out, height 0.2s ease-out;
}

.zoom-container-content {
  display: inline-block;
  transform-origin: top left;
  transition: transform 0.2s ease-out;
}

.bracket-layout-container {
  display: flex;
  gap: 80px;
  align-items: flex-start;
}

.round-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px; /* Spacing between matches in a round */
}

.round-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  width: 240px; /* Match match-card width */
}

.round-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.publish-round-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.publish-round-btn.publish {
  background-color: #16a34a; /* green */
}
.publish-round-btn.unpublish {
  background-color: #dc2626; /* red */
}
.publish-round-btn:disabled {
  background-color: #444;
  cursor: not-allowed;
  opacity: 0.7;
}

.generate-next-round-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background-color: #7c3aed;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.generate-next-round-btn:hover {
  background-color: #8b5cf6;
}

.matches-in-round {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.round-headers {
  display: grid;
  margin-bottom: 20px;
  column-gap: 80px;
}

.round-title {
  text-align: center;
  font-weight: bold;
  color: #aaa;
  white-space: nowrap;
}

.bracket-grid {
  display: grid;
  grid-auto-flow: column;
  grid-auto-rows: min-content;
  align-items: center;
  column-gap: 80px;
  row-gap: 16px;
  position: relative; /* For line container positioning */
}

.line-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.connector-line {
  position: absolute;
  background: linear-gradient(90deg, #6a0dad, #9500ff, #c36aff);
  box-shadow: 0 0 4px #9500ff;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.connector-line.highlighted {
  background: linear-gradient(90deg, #00c6ff, #0072ff);
  box-shadow: 0 0 8px #00c6ff;
  z-index: 1;
}

.match-card {
  background-color: #1a1a1a;
  border: 1px solid #333;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 8px 12px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
  width: 240px;
  white-space: nowrap;
  transition: all 0.3s ease;
}

.match-card.highlighted {
  border-color: #00c6ff;
  box-shadow: 0 0 12px rgba(0, 198, 255, 0.7);
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 12px rgba(0, 198, 255, 0.7);
  }
  50% {
    box-shadow: 0 0 20px rgba(0, 198, 255, 1);
  }
  100% {
    box-shadow: 0 0 12px rgba(0, 198, 255, 0.7);
  }
}

.match-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid #444;
  padding-bottom: 6px;
  margin-bottom: 6px;
  font-size: 0.9em;
  color: #ccc;
  min-height: 40px; /* Ensure consistent height */
}

.match-details-public {
  font-size: 11px;
  color: #aaa;
}

.match-details-editor { 
  display: flex; 
  flex-direction: column; 
  gap: 8px; 
  margin: 8px 0;
}
.match-details-editor .input-group {
  display: flex; 
  align-items: center; 
  gap: 8px;
}
.match-details-editor .input-group label {
  color: #ddd; 
  font-size: 12px; 
  min-width: 50px;
}
.match-details-editor input {
  flex: 1; 
  padding: 6px; 
  border-radius: 4px; 
  border: 1px solid #444;
  background: #2c2c2c; 
  color: #f0f0f0; 
  font-size: 12px;
}

.match-title {
  font-weight: 700;
  color: #7c3aed;
  font-size: 11px;
}

.match-details {
  font-size: 10px;
  color: #9aa;
}

.match-participants {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.participant {
  padding: 6px 8px;
  background-color: #2a2a2a;
  border-radius: 4px;
  border-left: 3px solid #555;
  transition: all 0.3s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 30px; /* Ensure consistent height */
}

.participant.winner {
  border-left-color: #ffd700;
  background-color: #3a3a2a;
  font-weight: bold;
  color: #fce57f;
}

.participant.winner .participant-info > span:first-child {
  color: #fce57f;
}

.participant-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.source-match-link {
  font-size: 10px;
  color: #999;
  cursor: pointer;
  background-color: #333;
  padding: 1px 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.source-match-link:hover {
  color: #fff;
  background-color: #7c3aed;
}

.participant.winner {
  cursor: pointer;
}

.participant:not(.winner) .source-match-link {
  cursor: default;
}

.participant:not(.winner) .source-match-link:hover {
    background-color: #333;
    color: #999;
}


.participant.winner:hover {
  background-color: #3f3f3f;
}

.participant.highlighted-participant {
  border-left-color: #00c6ff;
  background-color: #1f3a47;
  animation: pulse 2s infinite;
}

.rank {
  font-size: 10px;
  color: #7c3aed;
  font-weight: 700;
  min-width: 40px; /* Reserve space to prevent layout shift */
  text-align: right;
}
</style>
