import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/supabase';
import { useTournamentsStore } from './tournaments';

export const useBracketStore = defineStore('bracket', () => {
  const bracket = ref(null);
  const isLoading = ref(true);

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
      bracket.value = data;
    }
    isLoading.value = false;
  };

  const generateBracket = async (setupData) => {
    const { tournamentId, format, teamCount, roundCount } = setupData;
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

    let teams = acceptedTeams.slice(0, teamCount).sort(() => Math.random() - 0.5);
    const positions = format === 'АПФ' ? ['Правительство', 'Оппозиция'] : ['ОП', 'ОО', 'ЗП', 'ЗО'];
    const roundMatches = [];

    while(teams.length >= teamsPerMatch) {
      const matchTeams = teams.splice(0, teamsPerMatch);
      roundMatches.push({
        room: '',
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
    }

    const firstRoundData = { round: 1, matches: roundMatches, results_published: false };
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

  const deleteBracket = async () => {
    if (!bracket.value) return;
    const { error } = await supabase
      .from('brackets')
      .delete()
      .eq('id', bracket.value.id);
    
    if (error) {
      alert('Не удалось удалить сетку.');
      console.error(error);
    } else {
      bracket.value = null;
    }
  };
  
  const generateNextRound = async () => {
    if (!bracket.value) return;

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

    for (const key of sortedKeys) {
      let currentTeams = pointBrackets[key];
      let bucket = [...leftovers, ...currentTeams];
      leftovers = [];

      bucket.sort(() => Math.random() - 0.5);

      while (bucket.length >= teamsPerMatch) {
        const matchTeams = bucket.splice(0, teamsPerMatch);
        newRoundMatches.push({
          room: '', judge: '',
          teams: matchTeams.map((team, index) => ({
            reg_id: team.reg_id,
            faction_name: team.faction_name,
            position: positions[index],
            rank: 0,
            speakers: team.speakers.map(s => ({ username: s.username, points: 75 }))
          }))
        });
      }
      
      if (bucket.length > 0) {
        leftovers = bucket;
      }
    }
    
    if (leftovers.length > 0) {
      console.error("Не удалось составить пары для всех команд. Остались:", leftovers);
      alert("Внимание: Не удалось составить пары для всех команд. Проверьте консоль для получения дополнительной информации.");
    }
    
    const newRoundData = {
      round: bracket.value.matches.matches.length + 1,
      matches: newRoundMatches,
      results_published: false
    };
    
    bracket.value.matches.matches.push(newRoundData);
    bracket.value.published = false;
    await updateBracketData();
    alert(`Раунд ${newRoundData.round} успешно сгенерирован!`);
  };

  const toggleRoundResultsPublication = async (roundIndex) => {
    if (!bracket.value || !bracket.value.matches?.matches?.[roundIndex]) return;

    const round = bracket.value.matches.matches[roundIndex];
    round.results_published = !round.results_published;

    await updateBracketData();
    alert(`Результаты раунда ${round.round} теперь ${round.results_published ? 'опубликованы' : 'скрыты'}.`);
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

    // Update bracket with playoff data and fetch the updated record
    const { data: updatedBracket, error } = await supabase
      .from('brackets')
      .update({ 
        playoff_data: playoffData
      })
      .eq('id', bracket.value.id)
      .select()
      .single();

    if (error) {
      console.error("Ошибка сохранения playoff данных:", error);
      // alert("Не удалось сохранить playoff данные."); // Move alert to component
      return false;
    }

    // Force reactivity by replacing the ref's value with the new object
    bracket.value = updatedBracket;

    return true;
  };

  const createPlayoffTree = (teams, leagueName, format) => {
    if (teams.length < 2) return null;

    const validTeamCount = Math.pow(2, Math.floor(Math.log2(teams.length)));
    const seededTeams = teams.slice(0, validTeamCount);

    // Calculate starting round based on team count
    let startingRound;
    if (validTeamCount === 2) startingRound = 4; // Final
    else if (validTeamCount === 4) startingRound = 3; // Semi-final (1/2)
    else if (validTeamCount === 8) startingRound = 2; // Quarter-final (1/4)
    else if (validTeamCount === 16) startingRound = 1; // Eighth-final (1/8)
    else if (validTeamCount === 32) startingRound = 0; // Sixteenth-final (1/16)
    else startingRound = 1; // Default

    const seedOrder = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    const bracketSize = seededTeams.length;
    const relevantSeedOrder = seedOrder.filter(s => s <= bracketSize);
    
    const reorderedTeams = relevantSeedOrder.map(seed => seededTeams[seed - 1]).filter(Boolean);

    const firstRound = { round: 1, matches: [], published: false };
    const teamsPerMatch = format === 'АПФ' ? 2 : 4;
    
    for (let i = 0; i < reorderedTeams.length; i += teamsPerMatch) {
      const matchTeams = reorderedTeams.slice(i, i + teamsPerMatch);
      const match = {
        room: '',
        judge: '',
        teams: matchTeams.map((team, index) => ({
          ...team,
          position: format === 'АПФ' ? (index === 0 ? 'Правительство' : 'Оппозиция') : ['ОП', 'ОО', 'ЗП', 'ЗО'][index],
          rank: 0
        }))
      };
      firstRound.matches.push(match);
    }

    return { 
      name: leagueName,
      format: format, 
      rounds: [firstRound],
      totalRounds: Math.log2(validTeamCount),
      currentRound: 1,
      startingRound: startingRound
    };
  };

  const updatePlayoffMatch = async (payload) => {
    const { leagueName, roundIndex, matchIndex, updatedMatchData } = payload;
    if (!bracket.value?.playoff_data) return;

    const league = bracket.value.playoff_data[leagueName];
    if (!league || !league.rounds[roundIndex] || !league.rounds[roundIndex].matches[matchIndex]) {
      console.error("Could not find match to update in store", payload);
      return;
    }
    
    league.rounds[roundIndex].matches[matchIndex] = updatedMatchData;
    await updateBracketData();
  };

  const publishPlayoffRound = async (payload) => {
    const { leagueName, roundIndex } = payload;
    if (!bracket.value?.playoff_data) return;

    const league = bracket.value.playoff_data[leagueName];
    if (!league) return;
    
    const round = league.rounds[roundIndex];
    if (!round) return;

    round.published = !round.published; // Toggle publication status

    if (round.published) {
      const tournamentsStore = useTournamentsStore();
      let postText = `📢 Сетка Плей-офф: ${league.name} - Раунд ${round.round}\n\n`;
      round.matches.forEach((match, index) => {
        const teams = match.teams.map(t => t.faction_name).join(' vs ');
        postText += `Матч ${index + 1}: ${teams}\n`;
        postText += `Кабинет: ${match.room || 'Не назначен'}\n`;
        postText += `Судья: ${match.judge || 'Не назначен'}\n\n`;
      });
      await tournamentsStore.createTournamentPost(bracket.value.tournament_id, postText);
    }
    
    await updateBracketData();
    alert(`Раунд ${round.round} теперь ${round.published ? 'опубликован' : 'скрыт'}.`);
  };

  const generateNextPlayoffRound = async (leagueName) => {
    if (!bracket.value || !bracket.value.playoff_data) return false;
    
    const playoff = bracket.value.playoff_data[leagueName];
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
      matches: [],
      published: false
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
    publishFinalResults,
    deleteBracket,
    toggleRoundResultsPublication,
    publishPlayoffRound
  };
});