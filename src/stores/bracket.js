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
      matches: newRoundMatches
    };
    
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
    if (!bracket.value) return '';

    // Process playoff results and determine final rankings
    const playoffResults = {};
    const finalTeamRankings = [];
    const finalSpeakerRankings = [];

    if (bracket.value.playoff_data) {
      // Process playoff results
      Object.entries(bracket.value.playoff_data).forEach(([leagueKey, league]) => {
        const finalRound = league.rounds[league.rounds.length - 1];
        if (finalRound && finalRound.matches.length > 0) {
          const finalMatch = finalRound.matches[0];
          const winner = finalMatch.teams.find(team => team.rank === 1);
          const runnerUp = finalMatch.teams.find(team => team.rank === 2);
          
          if (winner) {
            playoffResults[leagueKey] = {
              winner: winner.faction_name,
              runnerUp: runnerUp?.faction_name || 'Не определен'
            };
          }
        }
      });

      // Create final team rankings (1st-4th place)
      // 1st place: Main playoff winner
      if (playoffResults.alpha?.winner) {
        finalTeamRankings.push({
          place: 1,
          team: playoffResults.alpha.winner,
          type: 'Победитель турнира'
        });
      }
      
      // 2nd place: Main playoff runner-up
      if (playoffResults.alpha?.runnerUp) {
        finalTeamRankings.push({
          place: 2,
          team: playoffResults.alpha.runnerUp,
          type: 'Финалист'
        });
      }

      // 3rd place: Beta playoff winner (if exists)
      if (playoffResults.beta?.winner) {
        finalTeamRankings.push({
          place: 3,
          team: playoffResults.beta.winner,
          type: 'Победитель Бета-лиги'
        });
      }

      // 4th place: Beta playoff runner-up (if exists)
      if (playoffResults.beta?.runnerUp) {
        finalTeamRankings.push({
          place: 4,
          team: playoffResults.beta.runnerUp,
          type: 'Финалист Бета-лиги'
        });
      }

      // Create final speaker rankings (1st-2nd place)
      // 1st place: LD playoff winner (if exists)
      if (playoffResults.ld?.winner) {
        finalSpeakerRankings.push({
          place: 1,
          speaker: playoffResults.ld.winner,
          type: 'Лучший спикер турнира'
        });
      }

      // 2nd place: LD playoff runner-up (if exists)
      if (playoffResults.ld?.runnerUp) {
        finalSpeakerRankings.push({
          place: 2,
          speaker: playoffResults.ld.runnerUp,
          type: 'Второй лучший спикер'
        });
      }
    }

    // Generate final results text - only playoff winners
    let resultsText = '🏆 ИТОГИ ТУРНИРА 🏆\n\n';
    
    // Team rankings (only playoff winners)
    if (finalTeamRankings.length > 0) {
      resultsText += '🥇 ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ КОМАНД:\n';
      finalTeamRankings.forEach(ranking => {
        const medal = ranking.place === 1 ? '🥇' : ranking.place === 2 ? '🥈' : ranking.place === 3 ? '🥉' : '🏅';
        resultsText += `${medal} ${ranking.place} место: ${ranking.team}\n`;
      });
      resultsText += '\n';
    }
    
    // Speaker rankings (only playoff winners)
    if (finalSpeakerRankings.length > 0) {
      resultsText += '🎤 ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ СПИКЕРОВ:\n';
      finalSpeakerRankings.forEach(ranking => {
        const medal = ranking.place === 1 ? '🥇' : '🥈';
        resultsText += `${medal} ${ranking.place} место: ${ranking.speaker}\n`;
      });
      resultsText += '\n';
    }

    resultsText += '🎉 Поздравляем всех участников турнира!';

    return resultsText;
  };

  const publishFinalResults = async () => {
    if (!bracket.value) return false;
    
    // Check if all playoffs are finished
    if (!areAllPlayoffsFinished()) {
      alert('Не все плей-офф раунды завершены. Завершите все матчи перед публикацией итогов.');
      return false;
    }
    
    const tournamentsStore = useTournamentsStore();
    
    // First, publish qualifying round results if not already published
    if (!bracket.value.results_published) {
      const qualifyingResultsPost = generateQualifyingResultsPost();
      const qualifyingSuccess = await tournamentsStore.createTournamentPost(
        bracket.value.tournament_id, 
        qualifyingResultsPost
      );
      
      if (!qualifyingSuccess) {
        alert("Не удалось опубликовать результаты отборочных раундов.");
        return false;
      }
      
      // Mark qualifying results as published
      bracket.value.results_published = true;
    }
    
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
    
    const { error } = await supabase
      .from('brackets')
      .update({ 
        final_results_published: bracket.value.final_results_published,
        results_published: bracket.value.results_published
      })
      .eq('id', bracket.value.id);

    if (error) {
      console.error("Ошибка публикации финальных результатов:", error);
      alert("Не удалось обновить статус публикации результатов.");
      return false;
    }

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
    publishFinalResults
  };
});