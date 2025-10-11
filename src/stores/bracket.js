import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/supabase';
import { useTournamentsStore } from './tournaments';
import { useJudgesStore } from './judges';

export const useBracketStore = defineStore('bracket', () => {
  const bracket = ref(null);
  const isLoading = ref(true);

  // Normalize club name to improve matching reliability
  const _normalizeClub = (club) => (club || '').toString().trim().toLowerCase();

  // Select a group of teams for one match, trying to avoid same-club clashes.
  // Mutates the provided pool by removing the selected teams, and returns them.
  const _pickTeamsForMatchAvoidingSameClub = (pool, teamsPerMatch, options = {}) => {
    const getRegId = options.getRegId || (t => t.reg_id ?? t.id);
    const playedTogether = options.playedTogether || new Set();
    if (pool.length < teamsPerMatch) return pool.splice(0, pool.length);

    const idxs = Array.from({ length: pool.length }, (_, i) => i).sort(() => Math.random() - 0.5);

    // Try greedy construction starting from different seeds to find distinct clubs
    for (let s = 0; s < idxs.length; s++) {
      const startIdx = idxs[s];
      const selectedIdxs = [startIdx];
      const usedClubs = new Set([_normalizeClub(pool[startIdx]?.club)]);
      const selectedIds = new Set([getRegId(pool[startIdx])]);

      for (let j = 0; j < idxs.length && selectedIdxs.length < teamsPerMatch; j++) {
        const cand = idxs[j];
        if (cand === startIdx || selectedIdxs.includes(cand)) continue;
        const candClub = _normalizeClub(pool[cand]?.club);
        const candId = getRegId(pool[cand]);
        // Check repeat pairings with any already selected
        let repeats = false;
        for (const id of selectedIds) {
          const a = Math.min(id, candId);
          const b = Math.max(id, candId);
          if (playedTogether.has(`${a}-${b}`)) { repeats = true; break; }
        }
        if (repeats) continue;
        if (usedClubs.has(candClub)) continue;
        selectedIdxs.push(cand);
        usedClubs.add(candClub);
        selectedIds.add(candId);
      }

      if (selectedIdxs.length === teamsPerMatch) {
        // Splice out selected items from the pool without disturbing indices
        const sortedDesc = [...selectedIdxs].sort((a, b) => b - a);
        const picked = [];
        for (const i of sortedDesc) {
          picked.unshift(pool.splice(i, 1)[0]);
        }
        return picked;
      }
    }

    // Fallback: cannot avoid clash completely; pick the first K from shuffled order
    const fallbackIdxs = idxs.slice(0, teamsPerMatch).sort((a, b) => b - a);
    const picked = [];
    for (const i of fallbackIdxs) {
      picked.unshift(pool.splice(i, 1)[0]);
    }
    return picked;
  };

  const _buildPlayedTogetherSet = () => {
    const set = new Set();
    if (!bracket.value?.matches?.matches) return set;
    bracket.value.matches.matches.forEach(round => {
      round.matches.forEach(match => {
        const ids = match.teams.map(t => t.reg_id).filter(Boolean);
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = Math.min(ids[i], ids[j]);
            const b = Math.max(ids[i], ids[j]);
            set.add(`${a}-${b}`);
          }
        }
      });
    });
    return set;
  };

  const loadBracket = async (tournamentId) => {
    isLoading.value = true;
    bracket.value = null;
    const { data, error } = await supabase
      .from('brackets')
      .select('*')
      .eq('tournament_id', tournamentId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error("Ошибка загрузки сетки:", error);
    } else {
      // Normalize legacy shapes: older records stored matches as an array directly
      if (data && data.matches && Array.isArray(data.matches)) {
        const legacyRounds = data.matches;
        const format = data.format || 'АПФ';
        const firstRound = legacyRounds[0] || { matches: [] };
        const firstMatch = firstRound.matches?.[0];
        const inferredTeamsPerMatch = firstMatch?.teams?.length || (format === 'АПФ' ? 2 : 4);
        const teamCount = (firstRound.matches || []).length * inferredTeamsPerMatch;
        const roundCount = data.round_count || legacyRounds.length || 1;
        bracket.value = {
          ...data,
          matches: {
            setup: { format, teamCount, roundCount },
            matches: legacyRounds
          },
          _legacy: true
        };
      } else {
        bracket.value = data ? { ...data, _legacy: false } : data;
      }
    }
    isLoading.value = false;
  };

  const generateBracket = async (setupData) => {
    const { tournamentId, format, teamCount, roundCount } = setupData;
    const roomsList = (setupData.roomsText || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const tournamentsStore = useTournamentsStore();
    const acceptedTeams = tournamentsStore.registrations.filter(r => r.status === 'accepted');
    const teamsPerMatch = format === 'АПФ' ? 2 : 4;

    if (teamCount % teamsPerMatch !== 0) {
      alert(`Количество команд (${teamCount}) должно быть кратно ${teamsPerMatch} для формата ${format}.`);
      return false;
    }
    if (acceptedTeams.length < teamCount) {
      alert(`Недостаточно команд в основном составе! Требуется ${teamCount}, а в ТЭБе ${acceptedTeams.length}.`);
      return false;
    }

    // Keep club info for pairing constraints
    let teams = acceptedTeams
      .slice(0, teamCount)
      .map(t => ({ ...t, club: t.club }))
      .sort(() => Math.random() - 0.5);
    const positions = format === 'АПФ' ? ['Правительство', 'Оппозиция'] : ['ОП', 'ОО', 'ЗП', 'ЗО'];
    const roundMatches = [];

    const playedTogether = _buildPlayedTogetherSet();
    let roomIndex = 0;
    while(teams.length >= teamsPerMatch) {
      const matchTeams = _pickTeamsForMatchAvoidingSameClub(teams, teamsPerMatch, {
        getRegId: t => t.id,
        playedTogether
      });
      roundMatches.push({
        room: roomsList.length > 0 ? (roomsList[roomIndex % roomsList.length]) : '',
        judge: '',
        teams: matchTeams.map((team, index) => ({
          reg_id: team.id,
          faction_name: team.faction_name,
          position: positions[index],
          rank: 0,
          speakers: [
            { username: team.speaker1_username, points: 75 },
            { username: team.speaker2_username, points: 75 }
          ]
        }))
      });
      roomIndex++;
    }

    const firstRoundData = { round: 1, matches: roundMatches };
    const bracketData = {
      setup: { format, teamCount, roundCount },
      matches: [firstRoundData]
    };
    
    const { data, error } = await supabase.from('brackets').insert({
      tournament_id: tournamentId,
      matches: bracketData,
      format: format,
      published: false
    }).select().single();

    if (error) {
      console.error("Ошибка создания сетки:", error);
      alert("Не удалось сгенерировать сетку.");
      return false;
    }
    bracket.value = data;
    return true;
  };

  const updateBracketData = async () => {
    if (!bracket.value) return;
    const { error } = await supabase.from('brackets').update({ 
      matches: bracket.value.matches, 
      published: bracket.value.published,
      playoff_data: bracket.value.playoff_data || null,
      final_results_published: bracket.value.final_results_published || false
    }).eq('id', bracket.value.id);

    if (error) {
      alert('Не удалось сохранить изменения в сетке.');
      console.error(error);
    }
  };
  
  const generateNextRound = async () => {
    if (!bracket.value) return;

    const tournamentsStore = useTournamentsStore();
    const judgesStore = useJudgesStore();
    const allRegistrations = tournamentsStore.registrations;
    const teamStats = {};
    const POINT_SYSTEMS = {
      АПФ: { 1: 3, 2: 0 },
      БПФ: { 1: 3, 2: 2, 3: 1, 4: 0 }
    };
    const pointsSystem = POINT_SYSTEMS[bracket.value.format];

    bracket.value.matches.matches.forEach(round => {
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
        });
      });
    });

    const sortedTeams = Object.values(teamStats).sort((a, b) => {
      if (b.totalTP !== a.totalTP) {
        return b.totalTP - a.totalTP;
      }
      return b.totalSP - a.totalSP;
    });

    const pointBrackets = sortedTeams.reduce((acc, team) => {
      const key = team.totalTP;
      if (!acc[key]) acc[key] = [];
      acc[key].push(team);
      return acc;
    }, {});

    const newRoundMatches = [];
    const positions = bracket.value.format === 'АПФ' ? ['Правительство', 'Оппозиция'] : ['ОП', 'ОО', 'ЗП', 'ЗО'];
    const teamsPerMatch = bracket.value.format === 'АПФ' ? 2 : 4;
    const sortedKeys = Object.keys(pointBrackets).sort((a, b) => parseInt(b) - parseInt(a));
    
    let leftovers = [];

    const playedTogether = _buildPlayedTogetherSet();
    let roomIndex = 0;
    const roomsList = (bracket.value.matches?.setup?.roomsText || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    for (const key of sortedKeys) {
      let currentTeams = pointBrackets[key];
      let bucket = [...leftovers, ...currentTeams];
      leftovers = [];

      bucket.sort(() => Math.random() - 0.5);

      while (bucket.length >= teamsPerMatch) {
        const matchTeams = _pickTeamsForMatchAvoidingSameClub(bucket, teamsPerMatch, {
          getRegId: t => t.reg_id,
          playedTogether
        });
        newRoundMatches.push({
          room: roomsList.length > 0 ? (roomsList[roomIndex % roomsList.length]) : '', judge: '',
          teams: matchTeams.map((team, index) => ({
            reg_id: team.reg_id,
            faction_name: team.faction_name,
            position: positions[index],
            rank: 0,
            speakers: team.speakers.map(s => ({ username: s.username, points: 75 }))
          }))
        });
        roomIndex++;
      }
      
      if (bucket.length > 0) {
        leftovers = bucket;
      }
    }
    
    // Final safeguard: ensure no leftovers by relaxing constraints if needed
    while (leftovers.length >= teamsPerMatch) {
      const matchTeams = leftovers.splice(0, teamsPerMatch);
      newRoundMatches.push({
        room: roomsList.length > 0 ? (roomsList[roomIndex % roomsList.length]) : '', judge: '',
        teams: matchTeams.map((team, index) => ({
          reg_id: team.reg_id,
          faction_name: team.faction_name,
          position: positions[index],
          rank: 0,
          speakers: team.speakers.map(s => ({ username: s.username, points: 75 }))
        }))
      });
      roomIndex++;
    }
    
    const newRoundData = {
      round: bracket.value.matches.matches.length + 1,
      matches: newRoundMatches
    };
    
    // Assign judges avoiding club conflicts
    try {
      const acceptedJudges = judgesStore.acceptedJudges;
      const registrations = tournamentsStore.registrations;
      const regIdToClub = new Map(registrations.map(r => [r.id, (r.club || '').toString().trim().toLowerCase()]));
      let judgeIdx = 0;

      const canJudgeMatch = (judge, match) => {
        const jClub = (judge.club || '').toString().trim().toLowerCase();
        if (!jClub) return true; // if no club, no conflict known
        return !match.teams.some(t => regIdToClub.get(t.reg_id) === jClub);
      };

      for (const m of newRoundData.matches) {
        if (!acceptedJudges || acceptedJudges.length === 0) break;
        // simple round-robin with skipping conflicts
        let attempts = 0;
        let assigned = false;
        while (attempts < acceptedJudges.length && !assigned) {
          const j = acceptedJudges[(judgeIdx + attempts) % acceptedJudges.length];
          if (canJudgeMatch(j, m)) {
            m.judge = '@' + j.judge_username;
            judgeIdx = (judgeIdx + attempts + 1) % acceptedJudges.length;
            assigned = true;
          } else {
            attempts++;
          }
        }
        if (!assigned) {
          // fallback assign next judge even if conflict (should be rare if many judges)
          const j = acceptedJudges[judgeIdx];
          m.judge = '@' + j.judge_username;
          judgeIdx = (judgeIdx + 1) % acceptedJudges.length;
        }
      }
    } catch (e) {
      console.warn('Не удалось автоматически назначить судей:', e);
    }

    bracket.value.matches.matches.push(newRoundData);
    bracket.value.published = false;
    await updateBracketData();
    alert(`Раунд ${newRoundData.round} успешно сгенерирован!`);
  };

  const finalizeAndPublishBreak = async (playoffSettings) => {
    if (!bracket.value) return false;
    
    const tournamentsStore = useTournamentsStore();
    const allRegistrations = tournamentsStore.registrations;
    const teamStats = {};
    const POINT_SYSTEMS = {
      АПФ: { 1: 3, 2: 0 },
      БПФ: { 1: 3, 2: 2, 3: 1, 4: 0 }
    };
    const pointsSystem = POINT_SYSTEMS[bracket.value.format];

    // Calculate team statistics
    bracket.value.matches.matches.forEach(round => {
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
        });
      });
    });

    // Sort teams by performance
    const sortedTeams = Object.values(teamStats).sort((a, b) => {
      if (b.totalTP !== a.totalTP) {
        return b.totalTP - a.totalTP;
      }
      return b.totalSP - a.totalSP;
    });

    // Generate playoff brackets
    const playoffData = {};
    
    // Main break (Alpha)
    const mainBreakTeams = sortedTeams.slice(0, playoffSettings.mainBreakCount);
    playoffData['alpha'] = createPlayoffTree(mainBreakTeams, 'Плей-офф Альфа', playoffSettings.format);
    
    // Beta league if enabled
    if (playoffSettings.enableLeagues && playoffSettings.betaStart && playoffSettings.betaEnd) {
      const betaTeams = sortedTeams.slice(playoffSettings.betaStart - 1, playoffSettings.betaEnd);
      playoffData['beta'] = createPlayoffTree(betaTeams, 'Плей-офф Бета', playoffSettings.format);
    }

    // LD (Individual Speaker) if enabled
    if (playoffSettings.enableLD && playoffSettings.ldCount > 0) {
      const speakerStats = {};
      bracket.value.matches.matches.forEach(round => {
        round.matches.forEach(match => {
          match.teams.forEach(team => {
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

      const sortedSpeakers = Object.values(speakerStats).sort((a, b) => {
        return b.totalPoints - a.totalPoints; // Only by Speaker Points
      });

      const ldBreakSpeakers = sortedSpeakers.slice(0, playoffSettings.ldCount);
      const ldTeams = ldBreakSpeakers.map(s => ({
        faction_name: s.username,
        speakers: [{ username: s.username, points: s.totalPoints }],
        original_reg_id: s.username 
      }));
      playoffData['ld'] = createPlayoffTree(ldTeams, 'Плей-офф ЛД', playoffSettings.format);
    }

    // Update bracket with playoff data
    bracket.value.playoff_data = playoffData;
    bracket.value.results_published = true;
    
    const { error } = await supabase
      .from('brackets')
      .update({ 
        playoff_data: bracket.value.playoff_data,
        results_published: bracket.value.results_published
      })
      .eq('id', bracket.value.id);

    if (error) {
      console.error("Ошибка сохранения playoff данных:", error);
      alert("Не удалось сохранить playoff данные.");
      return false;
    }

    return true;
  };

  const createPlayoffTree = (teams, leagueName, format) => {
    if (teams.length < 2) return null;

    const validTeamCount = Math.pow(2, Math.floor(Math.log2(teams.length)));
    const seededTeams = teams.slice(0, validTeamCount);

    // Only generate the first round initially
    const firstRound = { round: 1, matches: [] };
    const highSeeds = seededTeams.slice(0, seededTeams.length / 2);
    const lowSeeds = seededTeams.slice(seededTeams.length / 2);

    for (let i = 0; i < highSeeds.length; i++) {
      const match = {
        room: '',
        judge: '',
        teams: [
          { ...highSeeds[i], position: format === 'АПФ' ? 'Правительство' : 'ОП', rank: 0 },
          { ...lowSeeds[i], position: format === 'АПФ' ? 'Оппозиция' : 'ОО', rank: 0 }
        ]
      };
      if (format === 'БПФ') {
        match.teams.push(
          { ...highSeeds[i + highSeeds.length / 2] || {}, position: 'ЗП', rank: 0 },
          { ...lowSeeds[i + lowSeeds.length / 2] || {}, position: 'ЗО', rank: 0 }
        );
      }
      firstRound.matches.push(match);
    }

    return { 
      name: leagueName, 
      format: format, 
      rounds: [firstRound], // Only first round initially
      totalRounds: Math.ceil(Math.log2(validTeamCount)), // Total rounds needed
      currentRound: 1
    };
  };

  const generateNextPlayoffRound = async (leagueName) => {
    if (!bracket.value || !bracket.value.playoff_data) return false;

    const playoff = bracket.value.playoff_data[leagueName.toLowerCase()];
    if (!playoff) return false;

    // Check if current round is finished
    const currentRound = playoff.rounds[playoff.currentRound - 1];
    if (!currentRound || !currentRound.matches.every(match => 
      match.teams.some(team => team.rank === 1)
    )) {
      alert('Текущий раунд плей-офф не завершен. Введите результаты всех матчей.');
      return false;
    }

    // Get winners from current round
    const winners = [];
    currentRound.matches.forEach(match => {
      const winner = match.teams.find(team => team.rank === 1);
      if (winner) {
        winners.push({
          ...winner,
          rank: 0 // Reset rank for next round
        });
      }
    });

    if (winners.length === 0) {
      alert('Не удалось определить победителей текущего раунда.');
      return false;
    }

    // If only one winner, tournament is over
    if (winners.length === 1) {
      alert(`Турнир ${leagueName} завершен! Победитель: ${winners[0].faction_name}`);
      return true;
    }

    // Generate next round
    const nextRound = { 
      round: playoff.currentRound + 1, 
      matches: [] 
    };

    const teamsPerMatch = playoff.format === 'АПФ' ? 2 : 4;
    
    for (let i = 0; i < winners.length; i += teamsPerMatch) {
      const matchTeams = winners.slice(i, i + teamsPerMatch);
      const match = {
        room: '',
        judge: '',
        teams: matchTeams.map((team, index) => ({
          ...team,
          position: playoff.format === 'АПФ' 
            ? (index === 0 ? 'Правительство' : 'Оппозиция')
            : ['ОП', 'ОО', 'ЗП', 'ЗО'][index],
          rank: 0
        }))
      };
      nextRound.matches.push(match);
    }

    // Add next round to playoff
    playoff.rounds.push(nextRound);
    playoff.currentRound++;

    // Save to database
    await updateBracketData();
    alert(`Раунд ${nextRound.round} плей-офф ${leagueName} успешно сгенерирован!`);
    return true;
  };

  const updatePlayoffMatch = (leagueName, matchId, updatedMatch) => {
    if (!bracket.value?.playoff_data) return;
    const league = bracket.value.playoff_data[leagueName];
    if (!league) return;

    for (const round of league.rounds) {
      const matchIndex = round.matches.findIndex(m => m.id === matchId);
      if (matchIndex !== -1) {
        round.matches[matchIndex] = updatedMatch;
        break;
      }
    }
    updateBracketData();
  };

  const areAllPlayoffsFinished = () => {
    if (!bracket.value?.playoff_data) return false;
    
    for (const league of Object.values(bracket.value.playoff_data)) {
      for (const round of league.rounds) {
        for (const match of round.matches) {
          if (!match.teams.some(team => team.rank === 1)) {
            return false;
          }
        }
      }
    }
    return true;
  };

  const generateQualifyingResultsPost = () => {
    if (!bracket.value) return '';

    const tournamentsStore = useTournamentsStore();
    const allRegistrations = tournamentsStore.registrations;

    // Calculate team and speaker statistics from qualifying rounds
    const teamStats = {};
    const speakerStats = {};

    const POINT_SYSTEMS = {
      АПФ: { 1: 3, 2: 0 },
      БПФ: { 1: 3, 2: 2, 3: 1, 4: 0 }
    };
    const pointsSystem = POINT_SYSTEMS[bracket.value.format];

    // Calculate from qualifying rounds
    bracket.value.matches.matches.forEach(round => {
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
          
          // Speaker statistics - Only track Speaker Points (SP)
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

    // Sort teams and speakers
    const sortedTeams = Object.values(teamStats).sort((a, b) => {
      if (b.totalTP !== a.totalTP) {
        return b.totalTP - a.totalTP;
      }
      return b.totalSP - a.totalSP;
    });

    const sortedSpeakers = Object.values(speakerStats).sort((a, b) => {
      return b.totalPoints - a.totalPoints;
    });

    // Generate detailed results text
    let resultsText = `📊 РЕЗУЛЬТАТЫ ОТБОРОЧНЫХ РАУНДОВ (${bracket.value.matches.matches.length} раундов)\n\n`;
    
    // Team rankings
    resultsText += '👥 РЕЙТИНГ КОМАНД:\n';
    sortedTeams.forEach((team, index) => {
      resultsText += `${index + 1}. ${team.faction_name} - ${team.totalTP} TP, ${team.totalSP} SP\n`;
    });
    
    resultsText += '\n🎤 РЕЙТИНГ СПИКЕРОВ:\n';
    sortedSpeakers.forEach((speaker, index) => {
      resultsText += `${index + 1}. ${speaker.username} - ${speaker.totalPoints} SP\n`;
    });

    resultsText += '\n⏳ Следующий этап: Плей-офф';

    return resultsText;
  };

  const generateFinalResultsPost = () => {
    if (!bracket.value?.playoff_data) return 'Данные плей-офф отсутствуют.';

    const { playoff_data } = bracket.value;
    const alphaLeague = playoff_data.alpha;
    let postText = '🏆 Итоги турнира 🏆\n\n';

    if (alphaLeague) {
      const finalRound = alphaLeague.rounds[alphaLeague.rounds.length - 1];
      const finalMatch = finalRound.matches[0];
      const winner = finalMatch.teams.find(t => t.rank === 1);
      const runnerUp = finalMatch.teams.find(t => t.rank !== 1);

      postText += `🥇 Победитель турнира:\n${winner.faction_name}\n\n`;
      postText += `🥈 Второе место:\n${runnerUp.faction_name}\n\n`;

      if (alphaLeague.rounds.length > 1) {
        const semiFinalRound = alphaLeague.rounds[alphaLeague.rounds.length - 2];
        const semiFinalLosers = semiFinalRound.matches
          .flatMap(match => match.teams.filter(team => team.rank !== 1));
        
        const qualifyingStats = _getQualifyingStats();

        semiFinalLosers.sort((a, b) => {
          const statsA = qualifyingStats[a.reg_id] || { totalTP: 0, totalSP: 0 };
          const statsB = qualifyingStats[b.reg_id] || { totalTP: 0, totalSP: 0 };
          if (statsB.totalTP !== statsA.totalTP) {
            return statsB.totalTP - statsA.totalTP;
          }
          return statsB.totalSP - statsA.totalSP;
        });

        postText += `🥉 Третье место:\n${semiFinalLosers[0].faction_name}\n\n`;
        if (semiFinalLosers.length > 1) {
          postText += `🏅 Четвертое место:\n${semiFinalLosers[1].faction_name}\n\n`;
        }
      }
    }

    const ldLeague = playoff_data.ld;
    if (ldLeague) {
      const finalRound = ldLeague.rounds[ldLeague.rounds.length - 1];
      const finalMatch = finalRound.matches[0];
      const bestSpeaker = finalMatch.teams.find(t => t.rank === 1);
      if (bestSpeaker) {
        postText += `🎤 Лучший спикер турнира:\n${bestSpeaker.faction_name}\n\n`;
      }
    }
    
    postText += '🎉 Поздравляем всех участников и победителей!';
    return postText;
  };

  const _getQualifyingStats = () => {
    const tournamentsStore = useTournamentsStore();
    const allRegistrations = tournamentsStore.registrations;
    const teamStats = {};
    const POINT_SYSTEMS = {
      АПФ: { 1: 3, 2: 0 },
      БПФ: { 1: 3, 2: 2, 3: 1, 4: 0 }
    };
    const pointsSystem = POINT_SYSTEMS[bracket.value.format];

    bracket.value.matches.matches.forEach(round => {
      round.matches.forEach(match => {
        match.teams.forEach(team => {
          if (!teamStats[team.reg_id]) {
            const regInfo = allRegistrations.find(r => r.id === team.reg_id);
            teamStats[team.reg_id] = {
              reg_id: team.reg_id,
              faction_name: team.faction_name,
              totalTP: 0,
              totalSP: 0,
            };
          }
          teamStats[team.reg_id].totalTP += pointsSystem[team.rank] || 0;
          const matchSpeakerPoints = team.speakers.reduce((sum, s) => sum + (s.points || 0), 0);
          teamStats[team.reg_id].totalSP += matchSpeakerPoints;
        });
      });
    });
    return teamStats;
  };

  const publishFinalResults = async () => {
    if (!bracket.value) return false;
    
    // Check if all playoffs are finished
    const allLeaguesFinished = Object.values(bracket.value.playoff_data || {}).every(league => {
      if (!league.rounds || league.rounds.length < league.totalRounds) return false;
      const finalRound = league.rounds[league.rounds.length - 1];
      return finalRound.matches.every(m => m.teams.some(t => t.rank === 1));
    });

    if (!allLeaguesFinished) {
      alert('Не все плей-офф раунды завершены. Завершите все матчи перед публикацией итогов.');
      return false;
    }
    
    const tournamentsStore = useTournamentsStore();
    
    // Generate final results post with playoff rankings
    const resultsPost = generateFinalResultsPost();
    
    // Create tournament post with final results
    const success = await tournamentsStore.createTournamentPost(
      bracket.value.tournament_id, 
      resultsPost
    );
    
    if (!success) {
      alert("Не удалось опубликовать финальные результаты в постах турнира.");
      return false;
    }
    
    bracket.value.final_results_published = true;
    
    // Update the bracket in Supabase
    await updateBracketData();

    alert("Итоги турнира успешно опубликованы!");
    return true;
  };

  const generateResultsPost = () => {
    if (!bracket.value) return '';
    
    const tournamentsStore = useTournamentsStore();
    const allRegistrations = tournamentsStore.registrations;
    const teamStats = {};
    const speakerStats = {};
    const POINT_SYSTEMS = {
      АПФ: { 1: 3, 2: 0 },
      БПФ: { 1: 3, 2: 2, 3: 1, 4: 0 }
    };
    const pointsSystem = POINT_SYSTEMS[bracket.value.format];

    // Calculate team and speaker statistics
    bracket.value.matches.matches.forEach(round => {
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

    // Add playoff results
    if (bracket.value.playoff_data) {
      Object.values(bracket.value.playoff_data).forEach(league => {
        league.rounds.forEach(round => {
          round.matches.forEach(match => {
            match.teams.forEach(team => {
              if (team.rank === 1) {
                // This is a playoff winner
                const teamId = team.reg_id || team.original_reg_id;
                if (teamStats[teamId]) {
                  teamStats[teamId].playoffResult = league.name;
                }
              }
            });
          });
        });
      });
    }

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
    let resultsText = '🏆 ИТОГИ ТУРНИРА 🏆\n\n';
    
    // Team rankings
    resultsText += '📊 РЕЙТИНГ КОМАНД:\n';
    sortedTeams.forEach((team, index) => {
      const playoffInfo = team.playoffResult ? ` (${team.playoffResult})` : '';
      resultsText += `${index + 1}. ${team.faction_name} - ${team.totalTP} TP, ${team.totalSP} SP${playoffInfo}\n`;
    });
    
    resultsText += '\n👥 РЕЙТИНГ СПИКЕРОВ:\n';
    sortedSpeakers.forEach((speaker, index) => {
      resultsText += `${index + 1}. ${speaker.username} - ${speaker.totalPoints} SP\n`;
    });

    return resultsText;
  };

  return { 
    bracket, 
    isLoading, 
    loadBracket, 
    generateBracket, 
    updateBracketData,
    generateNextRound,
    finalizeAndPublishBreak,
    generateNextPlayoffRound,
    updatePlayoffMatch,
    publishFinalResults
  };
});