// src/stores/user.js
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/supabase';

export const useUserStore = defineStore('user', () => {
  const isLoading = ref(true);
  const showRegistrationModal = ref(false);
  const userData = ref(null);

  async function checkUserProfile() {
    isLoading.value = true;
    const tg = window.Telegram?.WebApp;

    // --- НАЧАЛО БЛОКА ДЛЯ РАЗРАБОТКИ ---
    // Проверяем, есть ли данные от Telegram
    if (!tg?.initDataUnsafe?.user?.username) {
      console.warn("ВНИМАНИЕ: Данные Telegram не найдены. Включаю режим локальной разработки.");
      
      // В режиме разработки загружаем dev_user из базы данных
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('telegram_username', 'dev_user')
        .single();

      if (profile) {
        userData.value = profile;
        showRegistrationModal.value = false;
        // Auto-populate profile from registrations
        await autoPopulateProfileFromRegistrations();
      } else {
        // Если dev_user не найден, создаём его
        userData.value = {
          id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
          fullname: 'Тестовый Пользователь',
          telegram_username: 'dev_user'
        };
        showRegistrationModal.value = false;
      }
      
      isLoading.value = false;
      return; // Завершаем функцию здесь
    }
    // --- КОНЕЦ БЛОКА ДЛЯ РАЗРАБОТКИ ---

    // Этот код выполнится, только если приложение открыто в Telegram
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_username', tg.initDataUnsafe.user.username)
      .single();

    if (profile) {
      userData.value = profile;
      showRegistrationModal.value = false;
      // Auto-populate profile from registrations
      await autoPopulateProfileFromRegistrations();
    } else {
      showRegistrationModal.value = true;
    }
    isLoading.value = false;
  }

  async function autoPopulateProfileFromRegistrations() {
    if (!userData.value?.telegram_username) return;
    
    try {
      const currentLeague = userData.value?.extra?.league || userData.value?.league || 'student';
      // Find all registrations where this user is a speaker
      const { data: registrations, error } = await supabase
        .from('registrations')
        .select('city, club, contacts, extra')
        .or(`speaker1_username.eq.${userData.value.telegram_username},speaker2_username.eq.${userData.value.telegram_username}`)
        .not('city', 'is', null)
        .not('club', 'is', null);

      if (error) {
        console.error('Ошибка поиска регистраций:', error);
        return;
      }

      if (!registrations || registrations.length === 0) return;

      // Get the most recent registration data
      const latestRegistration = registrations[registrations.length - 1];
      
      // Prepare updates for profile
      const updates = {};
      
      // Only update fields that are currently empty
      if (!userData.value.city && latestRegistration.city) {
        updates.city = latestRegistration.city;
      }
      
      // For school league we do not set a club at all
      if (currentLeague !== 'school') {
        // Handle club name standardization
        if (!userData.value.club && latestRegistration.club) {
          const standardizedClub = standardizeClubName(latestRegistration.club);
          // Use standardized name if found, otherwise use original
          updates.club = standardizedClub || latestRegistration.club;
        }
      }
      
      if (!userData.value.contacts && latestRegistration.contacts) {
        updates.contacts = latestRegistration.contacts;
      }
      if (!userData.value.extra && latestRegistration.extra) {
        updates.extra = latestRegistration.extra;
      }

      // Update profile if we have new data
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updates)
          .eq('telegram_username', userData.value.telegram_username);

        if (updateError) {
          console.error('Ошибка обновления профиля:', updateError);
        } else {
          // Update local userData
          userData.value = { ...userData.value, ...updates };
          console.log('Профиль автоматически обновлен из регистраций:', updates);
        }
      }
    } catch (error) {
      console.error('Ошибка автозаполнения профиля:', error);
    }
  }

  function standardizeClubName(inputClub) {
    if (!inputClub) return null;
    
    // Standard club names from the profile dropdown
    const standardClubs = {
      'Алматы': [
        'SDU QAZAQ DC', 'ТЭО ЖПМ', 'Алтын Сапа ИПК', 'Sirius IDC', 'UIB DC',
        'Парасатты НЛО', 'Атамекен ИПК', 'Жастар ИПК', 'Energo DC', 'Technokrat',
        'President LDC', 'KBTU DC', 'Патриот', 'Alma Mater LDC', 'Нұр-Мүбәрәк', 'КАУ'
      ],
      'Астана': ['Орда', 'Astana']
    };
    
    const allClubs = [...standardClubs['Алматы'], ...standardClubs['Астана']];
    
    // Normalize input for comparison
    const normalize = (str) => str.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
    const normalizedInput = normalize(inputClub);
    
    // Try exact match first
    for (const club of allClubs) {
      if (normalize(club) === normalizedInput) {
        return club;
      }
    }
    
    // Try partial matches for common variations
    const partialMatches = {
      'sdu': 'SDU QAZAQ DC',
      'qazaq': 'SDU QAZAQ DC',
      'тео': 'ТЭО ЖПМ',
      'жпм': 'ТЭО ЖПМ',
      'алтын': 'Алтын Сапа ИПК',
      'сапа': 'Алтын Сапа ИПК',
      'sirius': 'Sirius IDC',
      'uib': 'UIB DC',
      'парасатты': 'Парасатты НЛО',
      'нло': 'Парасатты НЛО',
      'атамекен': 'Атамекен ИПК',
      'жастар': 'Жастар ИПК',
      'energo': 'Energo DC',
      'technokrat': 'Technokrat',
      'president': 'President LDC',
      'kbtu': 'KBTU DC',
      'патриот': 'Патриот',
      'alma': 'Alma Mater LDC',
      'mater': 'Alma Mater LDC',
      'нур': 'Нұр-Мүбәрәк',
      'мубарак': 'Нұр-Мүбәрәк',
      'кау': 'КАУ',
      'орда': 'Орда',
      'astana': 'Astana'
    };
    
    for (const [key, value] of Object.entries(partialMatches)) {
      if (normalizedInput.includes(key)) {
        return value;
      }
    }
    
    // If no match found, return original input (keep as user typed)
    console.log(`Клуб "${inputClub}" не найден в стандартном списке, оставляем как есть`);
    return inputClub;
  }

  async function calculatePlayerStatistics() {
    if (!userData.value?.telegram_username) return null;
    
    try {
      // Get all registrations where user was a speaker
      const { data: registrations, error } = await supabase
        .from('registrations')
        .select(`
          id,
          tournament_id,
          faction_name,
          speaker1_username,
          speaker2_username,
          status,
          tournaments!inner(
            id,
            name,
            date,
            start_date,
            end_date
          )
        `)
        .or(`speaker1_username.eq.${userData.value.telegram_username},speaker2_username.eq.${userData.value.telegram_username}`)
        .eq('status', 'accepted');

      if (error) {
        console.error('Ошибка загрузки статистики:', error);
        return null;
      }

      if (!registrations || registrations.length === 0) {
        return {
          tournamentsPlayed: 0,
          wins: 0,
          ratingPoints: 0,
          rankingPosition: '--'
        };
      }

      // Get all brackets to check for results
      const tournamentIds = [...new Set(registrations.map(r => r.tournament_id))];
      const { data: brackets, error: bracketError } = await supabase
        .from('brackets')
        .select('*')
        .in('tournament_id', tournamentIds);

      if (bracketError) {
        console.error('Ошибка загрузки сеток:', bracketError);
      }

      let tournamentsPlayed = 0;
      let wins = 0;

      // Process each registration
      for (const reg of registrations) {
        const bracket = brackets?.find(b => b.tournament_id === reg.tournament_id);
        
        if (bracket) {
          tournamentsPlayed++;
          
          // Check if user won (1st place in any league)
          const hasWon = checkIfUserWon(reg.id, bracket);
          if (hasWon) {
            wins++;
          }
        }
      }

      return {
        tournamentsPlayed,
        wins,
        ratingPoints: 0, // Leave at 0 as requested - will implement rating system later
        rankingPosition: '--' // Leave as -- until rating system is implemented
      };
    } catch (error) {
      console.error('Ошибка расчета статистики:', error);
      return null;
    }
  }

  function checkIfUserWon(registrationId, bracket) {
    // Check qualifying rounds for 1st place
    if (bracket.matches?.matches) {
      for (const round of bracket.matches.matches) {
        for (const match of round.matches) {
          for (const team of match.teams) {
            if (team.reg_id === registrationId && team.rank === 1) {
              return true;
            }
          }
        }
      }
    }

    // Check playoff rounds for 1st place
    if (bracket.playoff_data) {
      for (const leagueName in bracket.playoff_data) {
        const league = bracket.playoff_data[leagueName];
        if (league.rounds) {
          for (const round of league.rounds) {
            for (const match of round.matches) {
              for (const team of match.teams) {
                if (team.reg_id === registrationId && team.rank === 1) {
                  return true;
                }
              }
            }
          }
        }
      }
    }

    return false;
  }

  async function registerNewUser(fullname) {
    const tg = window.Telegram?.WebApp;
    // В режиме разработки эта функция не будет вызываться,
    // но оставляем её для реальных пользователей.
    if (!fullname.trim()) return alert('Пожалуйста, введите имя.');

    const { data: newProfile, error } = await supabase
      .from('profiles')
      .insert({
        fullname: fullname.trim(),
        telegram_username: tg.initDataUnsafe.user.username,
        chat_id: tg.initDataUnsafe.user.id.toString(),
      })
      .select()
      .single();

    if (error) {
      alert('Ошибка регистрации: ' + error.message);
    } else {
      userData.value = newProfile;
      showRegistrationModal.value = false;
      
      // Auto-populate profile from registrations after registration
      await autoPopulateProfileFromRegistrations();
    }
  }

  return { 
    isLoading, 
    showRegistrationModal, 
    userData, 
    checkUserProfile, 
    registerNewUser, 
    calculatePlayerStatistics 
  };
});