<template>
  <div class="playoff-bracket">
    <!-- New Canvas Constructor (default when no playoff data) -->
    <div v-if="isCreator && showConstructor" class="playoff-constructor-container">
      <div class="constructor-header">
        <h3>Конструктор Плей-офф</h3>
        <button class="reset-button" @click="showConstructor = false" v-if="bracket?.playoff_data">Закрыть</button>
          </div>
      <PlayoffBracketConstructor
        :available-teams="availableTeamsFromQualifying"
        :available-speakers="availableSpeakersFromQualifying"
        :initial-bracket="null"
        @save="handleSaveConstructor"
      />
    </div>

    <!-- Playoff Bracket Display (if generated) -->
    <div v-else-if="bracket?.playoff_data && !showConstructor" class="bracket-display-container">
      <!-- MOBILE: Round-by-round view (Option A) -->
      <div v-if="isMobile" class="mobile-bracket">
        <div class="mobile-top-controls">
          <div class="league-tabs" v-if="leagues.length > 1">
            <button
              v-for="league in leagues"
              :key="league.id"
              :class="{ active: activeLeagueId === league.id }"
              @click="activeLeagueName = league.id"
            >
              {{ league.name }}
            </button>
          </div>

          <div class="round-chip-bar" ref="chipBarRef">
            <button
              v-for="(r, i) in visualRounds"
              :key="`chip-${i}`"
              :class="['round-chip', { active: i === mobileRoundIndex } ]"
              @click="mobileRoundIndex = i; scrollToTopMobile()"
            >
              {{ r.displayLabel || getRoundDisplayName(r.round) }}
            </button>
          </div>
        </div>

        <div class="mobile-match-list" ref="mobileListRef">
          <div
            v-for="(match, idx) in (visualRounds[mobileRoundIndex]?.matches || [])"
            :key="`m-${mobileRoundIndex}-${match.id}`"
            class="mobile-match-card"
          >
            <div class="mobile-match-head">
              <span class="mobile-match-num">M{{ match.match_in_round }}</span>
                      <div class="mobile-match-meta">
                <span class="meta-item">🚪 {{ match.room || '-' }}</span>
                <span class="meta-item">⚖️ {{ match.judge || '-' }}</span>
              </div>
            </div>

            <div class="mobile-participants">
              <div
                v-for="(team, tIdx) in (match.teams || [])"
                :key="`p-${match.id}-${tIdx}`"
                class="mobile-participant"
                :class="{ winner: team?.rank === 1 }"
              >
                <span class="name">{{ displayTeamName(team) }}</span>
                <span v-if="team?.rank" class="rank">{{ team.rank }}</span>
              </div>
            </div>

            <button
              v-if="mobileRoundIndex > 0"
              class="mobile-toggle-sources"
              @click="toggleMobileSources(match.id)"
            >
              {{ expandedMobileSources.has(match.id) ? 'Скрыть источник' : 'Показать источник' }}
            </button>

            <div v-if="expandedMobileSources.has(match.id) && mobileRoundIndex > 0" class="mobile-sources">
              <div class="mobile-source-title">Из предыдущего раунда</div>
              <div class="mobile-source-cards">
                <div v-for="src in getMobileSourceMatches(mobileRoundIndex, idx)" :key="`src-${src?.id}`" class="mobile-source-card">
                      <div class="mobile-source-head">M{{ src?.match_in_round }}</div>
                  <div class="mobile-participants">
                    <div v-for="(team, sIdx) in (src?.teams || [])" :key="`sp-${src?.id}-${sIdx}`" class="mobile-participant" :class="{ winner: team?.rank === 1 }">
                      <span class="name">{{ displayTeamName(team) }}</span>
                      <span v-if="team?.rank" class="rank">{{ team.rank }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- DESKTOP: original canvas bracket -->
      <div v-else class="bracket-controls-container">
        <div class="publish-container">
          <template v-if="isCreator">
            <button v-if="!bracket?.final_results_published && allPlayoffsFinished" @click="handlePublish" class="publish-button">
              Опубликовать итоги турнира
            </button>
            <div v-else-if="bracket?.final_results_published" class="results-published-indicator">
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
              <!-- Round Headers -->
              <div class="round-headers-row">
                <div v-for="(round, roundIndex) in visualRounds" :key="`header-${roundIndex}`" class="round-header-column">
                  <div class="round-header-card">
                    <h3 class="round-title">{{ round.displayLabel || getRoundDisplayName(round.round) }}</h3>
                    <button
                      v-if="isCreator && !bracket?.final_results_published"
                      @click="publishRoundClick((round.sourceIndices || [roundIndex])[0])"
                      :class="['publish-round-btn', round.published ? 'unpublish' : 'publish']"
                      :disabled="!isRoundReadyForPublication(round)"
                    >
                      <span v-if="round.published">🙈 Скрыть</span>
                      <span v-else>📢 Опубликовать</span>
                    </button>
                    </div>
                  </div>
                </div>

              <!-- Bracket Grid with positioned matches -->
              <div class="bracket-grid" :style="bracketGridStyle" ref="gridInnerRef">
              <div
                  v-for="(round, roundIndex) in visualRounds"
                  :key="`round-${roundIndex}`"
                  class="grid-round-column"
                >
                  <div
                    v-for="(match, matchIndex) in round.matches"
                    :key="match.id"
                    class="match-card-positioned"
                  :data-match-id="`${activeLeagueId}-r${round.round}-m${matchIndex}`"
                  :data-orig-id="match.id"
                  :ref="el => setMatchRef(match.id, el)"
                    :class="{ 'highlighted': highlightedPath.matches.has(match.id) }"
                 :style="getGridPositionForId(match.id, round.round, matchIndex)"
                  >
                    <div class="match-card-inner">
                      <div class="match-mini-header">
                        <span class="match-number">M{{ match.match_in_round }}</span>
                        <div v-if="!isCreator || round.published" class="match-meta">
                          <span class="meta-item">🚪 {{ match.room || '-' }}</span>
                          <span class="meta-item">⚖️ {{ match.judge || '-' }}</span>
                      </div>
                    </div>
                    
                      <div v-if="isCreator && !round.published && !bracket?.final_results_published" class="match-editor-compact">
                        <!-- Room dropdown -->
                        <select v-model="match.room" @change="debouncedSave(activeLeagueId, roundIndex, matchIndex)" class="compact-input">
                          <option value="">Выберите кабинет</option>
                          <option v-for="room in roomsOptions" :key="room" :value="room">{{ room }}</option>
                        </select>
                        <!-- Judges: primary dropdown + additional checkboxes -->
                        <div class="judges-dropdown">
                          <div class="judge-select" @click="toggleJudgeMenu(roundIndex, matchIndex)">
                            <span v-if="getPrimaryUsername(match)">{{ displayJudgeName(getPrimaryUsername(match)) }}</span>
                            <span v-else class="placeholder">Выберите судью</span>
                            <span class="chevron">▾</span>
                          </div>
                          <div 
                            v-if="isJudgeMenuOpen(roundIndex, matchIndex)"
                            class="judge-menu"
                          >
                            <div class="judge-menu-header">Выберите главного судью и доп. судей</div>
                            <div
                              v-for="j in availableJudgesForPlayoff(match, roundIndex, matchIndex)"
                              :key="'opt-' + j.judge_username"
                              class="judge-row"
                            >
                              <label class="radio-wrap">
                                <input type="radio" name="primary-{{roundIndex}}-{{matchIndex}}" :checked="getPrimaryUsername(match)===j.judge_username" @change="selectPrimaryJudge(j.judge_username, match, roundIndex, matchIndex)">
                              </label>
                              <label class="checkbox-wrap">
                                <input type="checkbox" :checked="Array.isArray(match.judges) && match.judges.includes(j.judge_username)" @change="toggleAdditionalJudge(j.judge_username, match, roundIndex, matchIndex)">
                              </label>
                              <div class="judge-label">{{ displayJudgeName(j.judge_username) }}<span v-if="j.club"> — {{ j.club }}</span></div>
                            </div>
                            <button class="judge-menu-close" @click.stop="toggleJudgeMenu(roundIndex, matchIndex)">Готово</button>
                          </div>
                        </div>
                    </div>

                      <div class="participants-list">
                      <div 
                        v-for="(team, teamIndex) in match.teams" 
                        :key="`${match.id}-team-${teamIndex}`" 
                          class="participant-row"
                        :class="{ 
                            'is-winner': team.rank === 1,
                          'highlighted-participant': highlightedPath.participants.has(`${match.id}-p${teamIndex}`) 
                        }"
                          @click="toggleHighlight({...team, id: `${match.id}-p${teamIndex}`, name: displayTeamName(team), is_winner: team.rank === 1}, match.round, match)"
                        >
                          <span class="participant-name">{{ displayTeamName(team) }}</span>
                          <span v-if="team.rank" class="participant-rank">{{ team.rank }}</span>
                      </div>
                    </div>

                    <button 
                        v-if="isCreator && round.published && !bracket?.final_results_published" 
                      @click="openResultsModal(match, roundIndex, matchIndex)"
                        class="results-btn-compact"
                    >
                        Результаты
                    </button>
                  </div>
                </div>
              </div>
            </div>

              <!-- Connectors removed per product decision -->
              </div>
            </div>
          </div>
        </div>
      <PlayoffMatchModal
        v-if="showModal"
        :match="selectedMatch"
        :display-name-map="activeLeagueId === 'ld' ? ldProfileNameMap : null"
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
import { supabase } from '@/supabase';
import { useBracketStore } from '@/stores/bracket';
import { storeToRefs } from 'pinia';
import PlayoffMatchModal from '@/components/PlayoffMatchModal.vue';
import PlayoffBracketConstructor from '@/components/PlayoffBracketConstructor.vue';
import { useJudgesStore } from '@/stores/judges';
import { useTournamentsStore } from '@/stores/tournaments';

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
const judgesStore = useJudgesStore();
const tournamentsStore = useTournamentsStore();

const activeLeagueName = ref(null);
const showConstructor = ref(false);
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

// Show constructor only when no playoff_data yet (for creator). Hide once saved.
watch(bracket, (val) => {
  if (props.isCreator) {
    showConstructor.value = !val?.playoff_data;
  } else {
    showConstructor.value = false;
  }
}, { immediate: true });

// Teams for constructor: compute from qualifying rounds (published or not)
const availableTeamsFromQualifying = computed(() => {
  const m = bracket.value?.matches?.matches;
  if (!Array.isArray(m) || m.length === 0) return [];

  const POINTS = {
    АПФ: { 1: 3, 2: 0 },
    БПФ: { 1: 3, 2: 2, 3: 1, 4: 0 }
  };
  const system = POINTS[bracket.value?.format] || POINTS['АПФ'];
  const stats = new Map();

  m.forEach(round => {
    round.matches?.forEach(match => {
      match.teams?.forEach(team => {
        const key = team.reg_id || team.faction_name;
        if (!key) return;
        if (!stats.has(key)) {
          stats.set(key, {
            reg_id: team.reg_id || team.faction_name,
            faction_name: team.faction_name || `Team` ,
            totalTP: 0,
            totalSP: 0
          });
        }
        const s = stats.get(key);
        s.totalTP += system[team.rank] || 0;
        const sp = Array.isArray(team.speakers) ? team.speakers.reduce((sum, s) => sum + (s.points || 0), 0) : 0;
        s.totalSP += sp;
      });
    });
  });

  const ranked = Array.from(stats.values()).sort((a, b) => {
    if (b.totalTP !== a.totalTP) return b.totalTP - a.totalTP;
    return b.totalSP - a.totalSP;
  });

  return ranked.map((t, idx) => ({
    reg_id: t.reg_id || `rank-${idx+1}`,
    faction_name: t.faction_name || `Team ${idx+1}`
  }));
});

// Speakers for LD: compute by total SP, then resolve full names via profiles
const availableSpeakersFromQualifying = ref([]);
const rankedSpeakersRaw = computed(() => {
  const m = bracket.value?.matches?.matches;
  if (!Array.isArray(m) || m.length === 0) return [];
  const speakerPoints = new Map();
  m.forEach(round => {
    round.matches?.forEach(match => {
      match.teams?.forEach(team => {
        (team.speakers || []).forEach(s => {
          const key = s.username || s.id;
          if (!key) return;
          if (!speakerPoints.has(key)) speakerPoints.set(key, { username: key, points: 0 });
          speakerPoints.get(key).points += s.points || 0;
        });
      });
    });
  });
  return Array.from(speakerPoints.values()).sort((a,b) => b.points - a.points);
});

watch(rankedSpeakersRaw, async (ranked) => {
  if (!ranked || ranked.length === 0) {
    availableSpeakersFromQualifying.value = [];
    return;
  }
  try {
    const usernames = ranked.map(s => s.username);
    const { data, error } = await supabase
      .from('profiles')
      .select('telegram_username, fullname')
      .in('telegram_username', usernames);
    const nameMap = new Map();
    if (!error && data) data.forEach(p => nameMap.set(p.telegram_username, p.fullname || p.telegram_username));
    availableSpeakersFromQualifying.value = ranked.map(s => ({ username: s.username, fullname: nameMap.get(s.username) || s.username, totalPoints: s.points }));
  } catch (e) {
    availableSpeakersFromQualifying.value = ranked.map(s => ({ username: s.username, fullname: s.username, totalPoints: s.points }));
  }
}, { immediate: true });

// Map LD usernames -> full profile names for display in published view
const ldProfileNameMap = ref(new Map());
watch(() => bracket.value?.playoff_data?.ld, async (ldData) => {
  if (!ldData) { ldProfileNameMap.value = new Map(); return; }
  const usernames = new Set();
  (ldData.rounds || []).forEach(r => (r.matches || []).forEach(m => (m.teams || []).forEach(t => { if (t?.faction_name) usernames.add(t.faction_name); })));
  if (usernames.size === 0) { ldProfileNameMap.value = new Map(); return; }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('telegram_username, fullname')
      .in('telegram_username', Array.from(usernames));
    const map = new Map();
    if (!error && data) data.forEach(p => map.set(p.telegram_username, p.fullname || p.telegram_username));
    ldProfileNameMap.value = map;
  } catch (_) {
    // fallback to empty map
    ldProfileNameMap.value = new Map();
  }
}, { immediate: true, deep: true });

// Convert free-form canvas data (nodes + connections) into a simple rounds structure
// Group by stageLabel if present; otherwise put into the first round
const convertCanvasToRounds = (matches = [], connections = []) => {
  // Group matches by stage label
  const groupsMap = new Map();
  const order = [];
  (matches || []).forEach((m) => {
    const key = m.stageLabel || 'Stage 1';
    if (!groupsMap.has(key)) { groupsMap.set(key, []); order.push(key); }
    groupsMap.get(key).push(m);
  });

  // Build rounds array with round numbers starting at 1
  const rounds = order.map((key, idx) => {
    const ms = groupsMap.get(key) || [];
    const roundMatches = ms.map((m, i) => {
      const teams = Array.isArray(m.teams)
        ? m.teams.map((t, ti) => t || { reg_id: `tbd-${m.id}-${ti}`, faction_name: 'TBD', rank: null })
        : [];
      return {
        id: m.id,
        room: m.room || '',
        judge: m.judge || '',
        teams,
        match_in_round: i + 1,
      };
    });
    return { round: idx + 1, label: key, published: false, matches: roundMatches };
  });

  if (rounds.length === 0) {
    // Fallback: create a single empty round so display view stays stable
    rounds.push({ round: 1, label: 'Stage 1', published: false, matches: [] });
  }
  return rounds;
};

const calculateTotalRounds = (matches = [], connections = []) => {
  // Total rounds equals number of unique stage labels or 1 if none
  const labels = new Set();
  (matches || []).forEach(m => labels.add(m.stageLabel || 'Stage 1'));
  return Math.max(1, labels.size);
};

const handleSaveConstructor = async (constructorData) => {
  // Support new constructor payload structure: { format, ldEnabled, alpha: {matches, connections}, ld?: {...} }
  const alpha = constructorData.alpha || { matches: constructorData.matches || [], connections: constructorData.connections || [] };
  const ld = constructorData.ldEnabled && constructorData.ld ? constructorData.ld : null;

  const playoffData = {};
  playoffData.alpha = {
    name: 'Альфа',
    format: constructorData.format,
    rounds: convertCanvasToRounds(alpha.matches, alpha.connections),
    totalRounds: calculateTotalRounds(alpha.matches, alpha.connections),
    currentRound: 1,
    connections: (alpha.connections || []).map(c => ({ from: c.from, to: c.to }))
  };
  if (ld) {
    playoffData.ld = {
      name: 'ЛД',
      format: 'ЛД',
      rounds: convertCanvasToRounds(ld.matches, ld.connections),
      totalRounds: calculateTotalRounds(ld.matches, ld.connections),
      currentRound: 1,
      connections: (ld.connections || []).map(c => ({ from: c.from, to: c.to }))
    };
  }

  // Persist
  bracket.value.playoff_data = playoffData;
  await bracketStore.updateBracketData();
  // Auto-assign rooms and judges for first round across leagues
  try { await judgesStore.loadJudges(bracket.value?.tournament_id || props.tournamentId); } catch (_) {}
  try { await bracketStore.assignInitialJudgesAndRoomsForPlayoff(); } catch (_) {}
  showConstructor.value = false;
  emit('dataChanged');
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


const handlePublish = async () => {
  await bracketStore.publishFinalResults();
  // Reload to ensure UI reflects DB state
  await bracketStore.loadBracket(props.tournamentId);
};

const publishRoundClick = async (roundIndex) => {
  try {
    await bracketStore.publishPlayoffRound({ leagueName: activeLeagueId, roundIndex });
    await bracketStore.loadBracket(props.tournamentId);
  } catch (e) {
    console.error('Publish round failed', e);
  }
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
  // After saving results, propagate winner to any connected target matches
  const leagueName = selectedMatchInfo.value.leagueName;
  const roundIndex = selectedMatchInfo.value.roundIndex;
  const matchIndex = selectedMatchInfo.value.matchIndex;
  nextTick(() => propagateWinnerForward(leagueName, roundIndex, matchIndex));

  showModal.value = false;
  selectedMatchInfo.value = null;
};

const propagateWinnerForward = (leagueName, roundIndex, matchIndex) => {
  const league = bracket.value?.playoff_data?.[leagueName];
  if (!league) return;
  const match = league.rounds?.[roundIndex]?.matches?.[matchIndex];
  if (!match) return;
  const winner = (match.teams || []).find(t => t && t.rank === 1);
  if (!winner) return;

  const winnerClone = { ...winner, rank: null };
  const fromId = match.id;
  const targets = (league.connections || []).filter(c => c.from === fromId).map(c => c.to);
  if (targets.length === 0) return;

  targets.forEach(targetId => {
    for (const r of league.rounds || []) {
      const idx = (r.matches || []).findIndex(m => m.id === targetId);
      if (idx !== -1) {
        const tm = r.matches[idx];
        if (!Array.isArray(tm.teams)) tm.teams = [];
        const slot = tm.teams.findIndex(t => !t || !t.faction_name || t.faction_name === 'TBD');
        if (slot >= 0) tm.teams[slot] = { ...winnerClone }; else tm.teams.push({ ...winnerClone });
        break;
      }
    }
  });
  // Persist the updated playoff structure
  bracketStore.updateBracketData();
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
  return round.matches.every(match => (match.teams || []).some(team => team && team.rank === 1));
};

const isLastRound = (round) => {
  if (!round || !bracket.value?.playoff_data) return false;
  const leagueData = bracket.value.playoff_data[activeLeagueId.value];
  if (!leagueData) return false;
  return round.round >= leagueData.totalRounds;
};

const allPlayoffsFinished = computed(() => {
  const pd = bracket.value?.playoff_data;
  if (!pd) return false;
  return Object.values(pd).every((league) => {
    if (!league || !league.rounds || league.rounds.length === 0) return false;
    const lastRound = league.rounds[league.rounds.length - 1];
    return (lastRound.matches || []).every(m => (m.teams || []).some(t => t && t.rank === 1));
  });
});

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

// Rooms options from qualifying setup
const roomsOptions = computed(() => {
  const txt = bracket.value?.matches?.setup?.roomsText || '';
  return txt.split(',').map(s => s.trim()).filter(Boolean);
});

// Filter accepted judges by club conflict for a match (LD has no conflict)
const filteredJudgesForMatch = (match) => {
  const accepted = judgesStore?.acceptedJudges?.value || [];
  const isLd = activeLeagueId.value === 'ld';
  const regToClub = new Map((tournamentsStore.registrations || []).map(r => [r.id, (r.club || '').toString().trim().toLowerCase()]));
  const teamClubs = new Set();
  if (!isLd) (match?.teams || []).forEach(t => { const c = regToClub.get(t.reg_id); if (c) teamClubs.add(c); });
  return accepted.filter(j => {
    if (isLd) return true;
    const jc = (j.club || '').toString().trim().toLowerCase();
    if (!jc) return true;
    return !teamClubs.has(jc);
  });
};

// Primary/additional judges helpers
const getPrimaryUsername = (match) => {
  return (match?.judge || '').toString().replace(/^@/, '');
};

const ensurePrimaryFirst = (match) => {
  const primary = getPrimaryUsername(match);
  if (!Array.isArray(match.judges)) match.judges = [];
  if (!primary) {
    match.judges = match.judges.filter(u => !!u);
    return;
  }
  const rest = match.judges.filter(u => u && u !== primary);
  match.judges = [primary, ...Array.from(new Set(rest))];
};

const onPrimaryJudgeChange = () => {};
const onAdditionalJudgesChange = () => {};

// Custom dropdown state/logic
const openJudgeMenuKey = ref(null);
const menuKeyFor = (ri, mi) => `${ri}-${mi}`;
const isJudgeMenuOpen = (ri, mi) => openJudgeMenuKey.value === menuKeyFor(ri, mi);
const toggleJudgeMenu = (ri, mi) => {
  const key = menuKeyFor(ri, mi);
  openJudgeMenuKey.value = openJudgeMenuKey.value === key ? null : key;
};

const isJudgeTakenInPlayoff = (username, roundIndex, matchIndex) => {
  const league = bracket.value?.playoff_data?.[activeLeagueId.value];
  const round = league?.rounds?.[roundIndex];
  if (!round) return false;
  return (round.matches || []).some((m, idx) => {
    if (idx === matchIndex) return false;
    const primary = (m.judge || '').replace(/^@/, '');
    const extras = Array.isArray(m.judges) ? m.judges : [];
    return primary === username || extras.includes(username);
  });
};

const availableJudgesForPlayoff = (match, roundIndex, matchIndex) => {
  return (allAcceptedJudges.value || []).filter(j => {
    if (judgeConflictsWithMatch(match, j)) return false;
    // Allow already-selected users in the same match to stay visible
    const alreadySelected = getPrimaryUsername(match) === j.judge_username || (Array.isArray(match.judges) && match.judges.includes(j.judge_username));
    if (alreadySelected) return true;
    return !isJudgeTakenInPlayoff(j.judge_username, roundIndex, matchIndex);
  });
};

const selectPrimaryJudge = (username, match, roundIndex, matchIndex) => {
  match.judge = username ? ('@' + username) : '';
  if (!Array.isArray(match.judges)) match.judges = [];
  if (!match.judges.includes(username)) match.judges.unshift(username);
  ensurePrimaryFirst(match);
  debouncedSave(activeLeagueId, roundIndex, matchIndex);
};

const toggleAdditionalJudge = (username, match, roundIndex, matchIndex) => {
  if (!Array.isArray(match.judges)) match.judges = [];
  if (match.judges.includes(username)) {
    match.judges = match.judges.filter(u => u !== username);
  } else {
    match.judges.push(username);
  }
  ensurePrimaryFirst(match);
  debouncedSave(activeLeagueId, roundIndex, matchIndex);
};

// Judges pool and conflict checks
const allAcceptedJudges = computed(() => {
  let list = judgesStore?.acceptedJudges?.value ?? judgesStore?.acceptedJudges ?? [];
  if (!list || list.length === 0) list = judgesStore?.pendingJudges?.value ?? judgesStore?.pendingJudges ?? [];
  if (!list || list.length === 0) list = judgesStore?.judges?.value ?? judgesStore?.judges ?? [];
  return Array.isArray(list) ? list : [];
});
const judgeConflictsWithMatch = (match, j) => {
  const isLd = activeLeagueId.value === 'ld';
  if (isLd) return false;
  const jc = (j?.club || '').toString().trim().toLowerCase();
  if (!jc) return false;
  const regToClub = new Map((tournamentsStore.registrations || []).map(r => [r.id, (r.club || '').toString().trim().toLowerCase()]));
  return (match?.teams || []).some(t => regToClub.get(t.reg_id) === jc);
};

const displayJudgeName = (username) => {
  const list = judgesStore?.judges?.value || judgesStore?.judges || [];
  const found = Array.isArray(list) ? list.find(x => x.judge_username === username) : null;
  return found?.fullname || ('@' + username);
};

// Debug counters removed per request

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
    if (!leagueDetails.rounds) return;

    // Build lookup by original id
    const matchById = new Map();
    leagueDetails.rounds.forEach((round) => {
      (round.matches || []).forEach((m) => matchById.set(m.id, m));
    });

    // Apply winner propagation into a shallow-cloned structure
    const clonedRounds = leagueDetails.rounds.map(r => ({
      round: r.round,
      label: r.label,
      published: r.published,
      matches: (r.matches || []).map(m => ({
        ...m,
        teams: (m.teams || []).map(t => t || { faction_name: 'TBD', rank: null })
      }))
    }));

    const clonedById = new Map();
    clonedRounds.forEach(r => (r.matches || []).forEach(m => clonedById.set(m.id, m)));

    const conns = leagueDetails.connections || [];
    conns.forEach(c => {
      const from = matchById.get(c.from);
      const to = clonedById.get(c.to);
      if (!from || !to) return;
      const winner = (from.teams || []).find(t => t && t.rank === 1);
      if (!winner) return;
      // Place winner into first empty/TBD slot
      const idx = (to.teams || []).findIndex(t => !t || !t.faction_name || t.faction_name === 'TBD');
      const placed = { ...winner, rank: null };
      if (idx >= 0) to.teams[idx] = placed; else to.teams.push(placed);
    });

    // Emit flattened list for rendering
    clonedRounds.forEach(round => {
      (round.matches || []).forEach((match, matchIndex) => {
                    const matchId = `${leagueName}-r${round.round}-m${matchIndex}`;
                    allMatches.push({
                        ...match,
                        id: matchId,
                        league_id: leagueName,
                        round: round.round,
                        match_in_round: matchIndex + 1,
          participants: (match.teams || []).map((team, teamIndex) => {
            const t = team || { faction_name: 'TBD', rank: null };
            return {
              ...t,
                            id: `${matchId}-p${teamIndex}`,
              name: leagueName === 'ld' ? (ldProfileNameMap.value.get(t.faction_name) || t.faction_name || 'TBD') : (t.faction_name || 'TBD'),
              is_winner: t.rank === 1
            };
          })
                    });
                });
          });
  });
  return allMatches;
});


const zoom = ref(1);
const highlightedParticipant = ref(null);

const gridRef = ref(null);
const zoomContentRef = ref(null);
const zoomSizerRef = ref(null);
const canvasRef = ref(null);
const gridInnerRef = ref(null);
const isMobile = computed(() => window.innerWidth <= 480);
const mobileRoundIndex = ref(0);
const expandedMobileSources = ref(new Set());
const chipBarRef = ref(null);
const mobileListRef = ref(null);

function scrollToTopMobile() {
  if (mobileListRef.value) mobileListRef.value.scrollTop = 0;
}

function toggleMobileSources(matchId) {
  const s = new Set(expandedMobileSources.value);
  if (s.has(matchId)) s.delete(matchId); else s.add(matchId);
  expandedMobileSources.value = s;
}

function getMobileSourceMatches(roundIdx, matchIdx) {
  if (roundIdx <= 0) return [];
  const prev = visualRounds.value?.[roundIdx - 1];
  if (!prev) return [];
  const a = prev.matches?.[matchIdx * 2];
  const b = prev.matches?.[matchIdx * 2 + 1];
  return [a, b].filter(Boolean);
}

let resizeObserver = null;

// Map original match id -> DOM element for measurement
const matchRefs = ref(new Map());
const setMatchRef = (origId, el) => {
  if (!origId) return;
  const map = matchRefs.value;
  if (el) {
    map.set(origId, el);
  } else {
    map.delete(origId);
  }
};

// Precomputed vertical layout per round (map of matchId -> top)
const columnLayout = ref(new Map()); // roundNumber -> Map<origMatchId, topPx>

const computeColumnLayout = () => {
  const rds = visualRounds.value || [];
  const layout = new Map();
  const paddingTop = 40;
  const minGap = 24;

  const getHeight = (m) => {
    const el = matchRefs.value.get(m.id);
    return el?.offsetHeight || 180;
  };

  if (!rds.length) { columnLayout.value = layout; return; }

  // Round 1: simple stacking
  const r0 = rds[0];
  const r0Matches = r0.matches || [];
  const r0Heights = r0Matches.map(getHeight);
  const tops0 = new Map();
  let currentTop = paddingTop;
  for (let i = 0; i < r0Matches.length; i++) {
    tops0.set(r0Matches[i].id, currentTop);
    currentTop += (r0Heights[i] || 180) + minGap;
  }
  layout.set(r0.round, tops0);

  // Subsequent rounds: center between paired sources (2i and 2i+1)
  for (let ri = 1; ri < rds.length; ri++) {
    const prev = rds[ri - 1];
    const curr = rds[ri];
    const prevMatches = prev.matches || [];
    const currMatches = curr.matches || [];
    const prevTops = layout.get(prev.round) || [];
    const prevHeights = prevMatches.map(getHeight);
    const currHeights = currMatches.map(getHeight);

    // Clear any residual margins
    currMatches.forEach(m => { const el = matchRefs.value.get(m.id); if (el) el.style.marginTop = '0px'; });

    const tops = new Map();
    for (let i = 0; i < currMatches.length; i++) {
      const aIdx = i * 2;
      const bIdx = i * 2 + 1;
      const aTop = prevTops.get(prevMatches[aIdx]?.id);
      const bTop = prevTops.get(prevMatches[bIdx]?.id);
      const aH = prevHeights[aIdx];
      const bH = prevHeights[bIdx];
      const h = currHeights[i] || 180;

      if (aTop != null && bTop != null && aH != null && bH != null) {
        const centerA = aTop + aH / 2;
        const centerB = bTop + bH / 2;
        const desiredCenter = (centerA + centerB) / 2;
        tops.set(currMatches[i].id, desiredCenter - h / 2);
      } else {
        // Fallback to stacking relative to previous computed top
        const prevTop = i === 0 ? paddingTop : (tops.get(currMatches[i - 1].id) + (currHeights[i - 1] || 180) + minGap);
        tops.set(currMatches[i].id, prevTop);
      }
    }

    // Enforce minimum gap and non-overlap
    for (let i = 0; i < currMatches.length; i++) {
      const id = currMatches[i].id;
      if (i === 0) {
        tops.set(id, Math.max(paddingTop, tops.get(id)));
      } else {
        const prevId = currMatches[i - 1].id;
        const prevBottom = tops.get(prevId) + (currHeights[i - 1] || 180) + minGap;
        if (tops.get(id) < prevBottom) tops.set(id, prevBottom);
      }
    }

    // Normalize spacing within the column so all gaps are equal-ish
    // Compute desired uniform gap as the median of current gaps
    const gaps = [];
    for (let i = 1; i < currMatches.length; i++) {
      const id = currMatches[i].id;
      const prevId = currMatches[i - 1].id;
      gaps.push(tops.get(id) - (tops.get(prevId) + (currHeights[i - 1] || 180)));
    }
    if (gaps.length > 0) {
      const sorted = gaps.slice().sort((a,b)=>a-b);
      const medianGap = sorted[Math.floor(sorted.length/2)];
      // Rebuild tops with uniform gap starting from the first
      for (let i = 1; i < currMatches.length; i++) {
        const prevId = currMatches[i - 1].id;
        const id = currMatches[i].id;
        tops.set(id, tops.get(prevId) + (currHeights[i - 1] || 180) + Math.max(minGap, medianGap));
      }
    }

    layout.set(curr.round, tops);
  }

  columnLayout.value = layout;
};

// Position helper using measured heights; falls back to estimate
const getGridPositionForId = (origId, roundNumber, matchIndexInRound) => {
  const map = columnLayout.value.get(roundNumber);
  const top = map?.get(origId) ?? (40 + matchIndexInRound * (160 + 24));
  return { position: 'absolute', left: '0', top: `${top}px` };
};

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

// Merge multiple stage-labeled columns that represent the same numeric round
const visualRounds = computed(() => {
  const byRound = new Map();
  (rounds.value || []).forEach((r, idx) => {
    const key = r.round || idx + 1;
    if (!byRound.has(key)) byRound.set(key, { round: key, sourceIndices: [], matches: [], published: true, displayLabel: null });
    const group = byRound.get(key);
    group.sourceIndices.push(idx);
    group.matches = group.matches.concat(r.matches || []);
    group.published = (group.published ?? true) && !!r.published;
    if (!group.displayLabel && r.label) group.displayLabel = r.label;
  });
  // Sort by round number
  const arr = Array.from(byRound.values()).sort((a, b) => a.round - b.round);
  // Ensure matches are in bracket order within each round
  arr.forEach(g => {
    g.matches = (g.matches || []).slice().sort((m1, m2) => {
      const a = Number(m1?.match_in_round ?? 0);
      const b = Number(m2?.match_in_round ?? 0);
      if (a !== b) return a - b;
      return String(m1?.id).localeCompare(String(m2?.id));
    });
  });
  return arr;
});

const displayTeamName = (team) => {
  if (!team) return 'TBD';
  if (activeLeagueId.value === 'ld') {
    return ldProfileNameMap.value.get(team.faction_name) || team.faction_name || 'TBD';
  }
  return team.faction_name || 'TBD';
};

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

// Let CSS control columns and gaps; avoid inline overrides that desync desktop/mobile
const bracketGridStyle = computed(() => ({}));


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

  // Determine the zero-based index of this match within its round
  const indexInRound = allMatchesForLeague.value
    .filter(m => m.round === match.round)
    .sort((a, b) => a.match_in_round - b.match_in_round)
    .findIndex(m => m.id === matchId);

  return getGridPositionByIndex(match.round, indexInRound);
};

// Kept for backward compatibility if needed elsewhere
const getGridPositionByIndex = (roundNumber, matchIndexInRound) => {
  const nodeHeight = 160;
  const spacing = 24;
  const topPosition = 40 + matchIndexInRound * (nodeHeight + spacing);
  return { position: 'absolute', left: '0', top: `${topPosition}px` };
};

const zoomIn = () => zoom.value = Math.min(1.5, +(zoom.value + 0.1).toFixed(2));
const zoomOut = () => zoom.value = Math.max(0.3, +(zoom.value - 0.1).toFixed(2));
const resetZoom = () => zoom.value = 1;

// Connectors removed


watch([allMatchesForLeague, zoom, rounds], () => {
  nextTick(() => {
    computeColumnLayout();
  });
}, { deep: true, immediate: true });

const updateSizer = () => {
    if (zoomContentRef.value && zoomSizerRef.value) {
        const contentRect = zoomContentRef.value.getBoundingClientRect();
        zoomSizerRef.value.style.width = `${contentRect.width}px`;
        zoomSizerRef.value.style.height = `${contentRect.height}px`;
    }
};

onMounted(async () => {
  if (zoomContentRef.value) {
    resizeObserver = new ResizeObserver(() => {
        updateSizer();
        computeColumnLayout();
    });
    resizeObserver.observe(zoomContentRef.value);
  }
  setTimeout(() => {
  computeColumnLayout();
  }, 200);
  // Load judges for selectors (playoff)
  try { await judgesStore.loadJudges(bracket.value?.tournament_id || props.tournamentId); } catch (_) {}
});

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout);
  if (resizeObserver && zoomContentRef.value) {
    resizeObserver.unobserve(zoomContentRef.value);
  }
});

watch(zoom, updateSizer);

// No connector watchers
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

/* Mobile round-by-round */
.mobile-bracket {
  width: 100%;
}
.mobile-top-controls {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 0 8px;
  background: linear-gradient(180deg, rgba(10,10,10,0.95), rgba(10,10,10,0.6));
  backdrop-filter: blur(6px);
}
.round-chip-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.round-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #333;
  background: #1e1e1e;
  color: #ddd;
  font-weight: 700;
  white-space: nowrap;
}
.round-chip.active { background: #7c3aed; color: #fff; box-shadow: 0 0 14px rgba(124,58,237,0.4); }

.mobile-match-list {
  height: calc(100vh - 140px);
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-match-card {
  background: linear-gradient(135deg, rgba(30,30,30,0.95), rgba(20,20,20,0.9));
  border: 1px solid rgba(139,92,246,0.25);
  border-radius: 12px;
  padding: 12px;
}
.mobile-match-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mobile-match-num { font-size: 12px; font-weight: 700; color: #a78bfa; background: rgba(124,58,237,0.2); padding: 3px 8px; border-radius: 8px; }
.mobile-match-meta { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #9ca3af; }
.mobile-participants { display: flex; flex-direction: column; gap: 6px; }
.mobile-participant { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.15); border-radius: 10px; }
.mobile-participant.winner { background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.1)); border-color: rgba(34,197,94,0.5); }
.mobile-participant .name { font-size: 13px; color: #e5e7eb; }
.mobile-participant .rank { font-size: 11px; font-weight: 700; color: #a78bfa; background: rgba(124,58,237,0.2); padding: 3px 6px; border-radius: 6px; }
.mobile-toggle-sources { margin-top: 8px; width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #333; background: #1e1e1e; color: #fff; font-weight: 600; }
.mobile-sources { margin-top: 8px; }
.mobile-source-title { font-size: 12px; color: #aaa; margin-bottom: 6px; }
.mobile-source-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.mobile-source-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.15); border-radius: 10px; padding: 8px; }
.mobile-source-head { font-size: 11px; color: #a78bfa; margin-bottom: 4px; }

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
  /* Dark canvas with subtle dotted grid */
  background-color: #0a0a0a;
  background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, rgba(0,0,0,0) 1px);
  background-size: 20px 20px;
  border-radius: 12px;
  padding: 20px;
  box-sizing: border-box;
  border: 1px solid rgba(139, 92, 246, 0.2);
}

/* Mobile optimizations */
@media (max-width: 480px) {
  .bracket-canvas {
    padding: 12px;
    background-size: 16px 16px;
  }

  .round-headers-row {
    gap: 24px;
    margin-bottom: 8px;
  }
  .round-header-column {
    width: 240px; /* match .grid-round-column width on mobile */
  }
  .round-header-card {
    padding: 8px 10px;
  }
  .round-title {
    font-size: 14px;
    letter-spacing: .5px;
  }

  .bracket-grid {
    gap: 24px;
    min-height: 1200px;
    padding: 10px 0;
  }
  .grid-round-column {
    width: 240px;
  }
  .match-card-inner {
    border-radius: 12px;
    padding: 12px;
    min-width: 220px;
  }
  .match-mini-header { margin-bottom: 8px; padding-bottom: 8px; }
  .match-number { font-size: 12px; padding: 3px 8px; }
  .match-meta { font-size: 10px; }
  .participants-list { gap: 6px; margin-bottom: 8px; }
  .participant-row { padding: 8px 10px; }
  .participant-name { font-size: 13px; }
  .participant-rank { font-size: 11px; }
  .results-btn-compact { padding: 8px; font-size: 12px; }
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
  position: relative;
  min-width: max-content;
  padding: 40px 20px;
}

.round-headers-row {
  display: flex;
  gap: 80px; /* match grid gap with .bracket-grid */
  margin-bottom: 16px;
  padding-left: 0; /* align with grid */
}

.round-header-column {
  width: 300px; /* match .grid-round-column width */
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.round-header-card {
  width: 100%;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(99, 102, 241, 0.15));
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 12px;
  padding: 12px 16px;
  text-align: center;
  box-shadow: 0 2px 12px rgba(124, 58, 237, 0.2);
}

.round-title {
  font-size: 18px;
  font-weight: 700;
  color: #e9d5ff;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.bracket-grid {
  position: relative;
  display: flex;
  gap: 80px;
  min-height: 2000px;
  padding: 20px 0;
}

.grid-round-column {
  position: relative;
  width: 300px;
  flex-shrink: 0;
}

.match-card-positioned {
  position: relative;
  z-index: 10;
}

.match-card-inner {
  background: linear-gradient(135deg, rgba(30, 30, 30, 0.95), rgba(20, 20, 20, 0.9));
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 240px;
}

.match-card-inner:hover {
  border-color: rgba(139, 92, 246, 0.5);
  box-shadow: 0 12px 40px rgba(124, 58, 237, 0.3), 0 0 0 1px rgba(139, 92, 246, 0.2);
  transform: translateY(-4px);
}

.match-card-positioned.highlighted .match-card-inner {
  border-color: rgba(139, 92, 246, 0.8);
  box-shadow: 0 12px 48px rgba(124, 58, 237, 0.6), 0 0 0 2px rgba(139, 92, 246, 0.5);
}

.match-mini-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(139, 92, 246, 0.2);
}

.match-number {
  font-size: 14px;
  font-weight: 700;
  color: #a78bfa;
  background: rgba(124, 58, 237, 0.2);
  padding: 4px 10px;
  border-radius: 8px;
}

.match-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #9ca3af;
}

.meta-item {
  white-space: nowrap;
}

.match-editor-compact {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.judges-multiselect .judge-option { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ddd; margin: 4px 0; }
.judges-list { max-height: 140px; overflow-y: auto; padding: 6px; border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 8px; background: rgba(255,255,255,0.03); }

/* Custom judge dropdown */
.judges-dropdown { position: relative; }
.judge-select { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; color: #fff; cursor: pointer; }
.judge-select .placeholder { color: #aaa; }
.judge-select .chevron { margin-left: 8px; opacity: .8; }
.judge-menu { position: absolute; z-index: 30; top: 110%; left: 0; right: 0; background: #1a1a1a; border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 10px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.4); max-height: 220px; overflow: auto; }
.judge-menu-header { color: #bbb; font-size: 11px; margin: 4px 2px 8px; }
.judge-row { display: grid; grid-template-columns: 22px 22px 1fr; align-items: center; gap: 6px; padding: 6px 4px; border-radius: 6px; }
.judge-row:hover { background: rgba(255,255,255,0.04); }
.judge-label { color: #ddd; font-size: 13px; }
.judge-menu-close { margin-top: 6px; width: 100%; padding: 6px 8px; border: 1px solid #333; border-radius: 8px; background: #242424; color: #ddd; cursor: pointer; }

.compact-input {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  transition: all 0.2s ease;
}

.compact-input:focus {
  outline: none;
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

.participants-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.participant-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.participant-row:hover {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
  transform: translateX(4px);
}

.participant-row.is-winner {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(22, 163, 74, 0.1));
  border-color: rgba(34, 197, 94, 0.5);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.2);
}

.participant-row.highlighted-participant {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(124, 58, 237, 0.2));
  border-color: rgba(139, 92, 246, 0.7);
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.4);
}

.participant-name {
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
}

.participant-row.is-winner .participant-name {
  color: #6ee7b7;
}

.participant-rank {
  font-size: 12px;
  font-weight: 700;
  color: #a78bfa;
  background: rgba(124, 58, 237, 0.2);
  padding: 4px 8px;
  border-radius: 6px;
}

.results-btn-compact {
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #7c3aed, #8b5cf6);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.results-btn-compact:hover {
  background: linear-gradient(135deg, #8b5cf6, #a78bfa);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.5);
  transform: translateY(-2px);
}

.connections-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

.connections-canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 2; /* above svg for glow */
}

.connection-path {
  opacity: 0.8;
  transition: all 0.3s ease;
  stroke-width: 2.5;
}

.connection-path.highlighted {
  stroke: #22c55e !important;
  stroke-width: 4;
  opacity: 1;
  filter: drop-shadow(0 0 12px rgba(34, 197, 94, 0.8));
}

.publish-round-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 12px;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.publish-round-btn.publish {
  background: linear-gradient(135deg, #16a34a, #22c55e);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}
.publish-round-btn.publish:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.5);
  transform: translateY(-2px);
}
.publish-round-btn.unpublish {
  background: linear-gradient(135deg, #dc2626, #ef4444);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}
.publish-round-btn.unpublish:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5);
  transform: translateY(-2px);
}
.publish-round-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
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
  margin-top: 0; /* dynamically adjusted when centering via JS */
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
