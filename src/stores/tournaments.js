// src/stores/tournaments.js
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/supabase';
import { useUserStore } from './user';

function convertDateToISO(dateString) {
  if (!dateString || !/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) return null;
  const [day, month, year] = dateString.split('.');
  return `${year}-${month}-${day}`;
}

export const useTournamentsStore = defineStore('tournaments', () => {
  const allTournaments = ref([]);
  const isLoading = ref(true);
  const currentTournament = ref(null);
  const tournamentPosts = ref([]);
  const registrations = ref([]);

  const loadTournaments = async () => {
    if (allTournaments.value.length > 0 && !isLoading.value) {
      return;
    }
    isLoading.value = true;
    
    try {
      // Try to load tournaments without ordering first
      const { data, error } = await supabase
        .from('tournaments')
        .select('*');
        
      if (error) {
        console.error("Ошибка загрузки турниров:", error);
        alert("Не удалось загрузить турниры: " + error.message);
        allTournaments.value = [];
      } else {
        allTournaments.value = data || [];
        console.log("Загружено турниров:", data?.length || 0);
      }
    } catch (err) {
      console.error("Критическая ошибка загрузки турниров:", err);
      alert("Критическая ошибка загрузки турниров");
      allTournaments.value = [];
    }
    
    isLoading.value = false;
  };

  // Archive function temporarily removed to avoid database schema issues
  // const archiveExpiredTournaments = async () => { ... }

  const loadTournamentById = async (id) => {
    isLoading.value = true;
    currentTournament.value = null;
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.error("Ошибка загрузки турнира:", error);
      currentTournament.value = null;
    } else {
      currentTournament.value = data;
    }
    isLoading.value = false;
  };

  const createTournament = async (tournamentData) => {
    const userStore = useUserStore();
    let logoUrl = null;
    if (tournamentData.logoFile) {
      const file = tournamentData.logoFile;
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('tournament-logos')
        .upload(fileName, file);
      if (uploadError) {
        console.error("Ошибка загрузки логотипа:", uploadError);
        alert("Не удалось загрузить логотип.");
        return false;
      }
      const { data } = supabase.storage.from('tournament-logos').getPublicUrl(fileName);
      logoUrl = data.publicUrl;
    }
    // Temporarily use old format for compatibility
    const tournamentDate = tournamentData.startDate || tournamentData.endDate || new Date().toISOString().split('T')[0];
    
    const { error } = await supabase
      .from('tournaments')
      .insert({
        name: tournamentData.name,
        date: tournamentDate, // Use old date field for now
        city: tournamentData.city,
        league: tournamentData.league || 'student',
        scale: tournamentData.scale,
        desc: tournamentData.desc,
        logo: logoUrl,
        creator_id: userStore.userData?.telegram_username
      });
    if (error) {
      console.error("Ошибка создания турнира:", error);
      alert("Не удалось создать турнир: " + error.message);
      return false;
    }
    allTournaments.value = [];
    await loadTournaments();
    return true;
  };

  const loadTournamentPosts = async (tournamentId) => {
    const { data, error } = await supabase
      .from('tournament_posts')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('timestamp', { ascending: false });
    if (error) console.error("Ошибка загрузки постов турнира:", error);
    else tournamentPosts.value = data;
  };

  const createTournamentPost = async (tournamentId, postText) => {
    if (!postText.trim()) return false;
    const { error } = await supabase
      .from('tournament_posts')
      .insert({ tournament_id: tournamentId, text: postText.trim() });
    if (error) {
      alert("Не удалось опубликовать пост: " + error.message);
      return false;
    }
    await loadTournamentPosts(tournamentId);
    return true;
  };

  const loadRegistrations = async (tournamentId) => {
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('timestamp', { ascending: true });
    if (error) {
      console.error("Ошибка загрузки регистраций:", error);
      registrations.value = [];
    } else {
      registrations.value = data || [];
    }
  };

  const submitRegistration = async (regData) => {
    // Load tournament league first for validation
    let tournamentLeague = 'student';
    try {
      const { data: t } = await supabase.from('tournaments').select('league').eq('id', regData.tournament_id).single();
      tournamentLeague = t?.league || 'student';
    } catch (e) {
      console.warn('Не удалось определить лигу турнира; по умолчанию: student', e);
    }

    // Base required fields
    if (!regData.faction_name || !regData.speaker1_username || !regData.speaker2_username) {
      alert('Пожалуйста, заполните все обязательные поля.');
      return false;
    }
    // Club required only for student league
    if (tournamentLeague === 'student' && !regData.club) {
      alert('Для регистрации в студенческой лиге требуется указать клуб в профиле.');
      return false;
    }

    // Enforce league eligibility: team registrations must match tournament league
    try {
      const userStore = useUserStore();
      const userLeague = userStore.userData?.extra?.league || userStore.userData?.league || 'student';
      if (userLeague !== tournamentLeague) {
        const leagueLabel = tournamentLeague === 'student' ? 'Студенческая лига' : 'Школьная лига';
        alert(`Регистрация команд доступна только для лиги: ${leagueLabel}`);
        return false;
      }
    } catch (e) {
      // If check fails unexpectedly, proceed but log
      console.warn('League eligibility check failed:', e);
    }

    // Prevent duplicate registration by speakers within the same tournament
    try {
      const { data: existingRegs, error: dupErr } = await supabase
        .from('registrations')
        .select('id, faction_name, status, speaker1_username, speaker2_username')
        .eq('tournament_id', regData.tournament_id)
        .or(
          `speaker1_username.eq.${regData.speaker1_username},speaker2_username.eq.${regData.speaker1_username},speaker1_username.eq.${regData.speaker2_username},speaker2_username.eq.${regData.speaker2_username}`
        );
      if (dupErr) {
        console.error('Ошибка проверки дубликатов регистрации:', dupErr);
      } else if (existingRegs && existingRegs.length > 0) {
        alert('Один из выбранных спикеров уже зарегистрирован в этом турнире.');
        return false;
      }
    } catch (e) {
      console.warn('Не удалось выполнить проверку дубликатов регистрации:', e);
    }
    const { error } = await supabase
      .from('registrations')
      .insert({
        tournament_id: regData.tournament_id,
        faction_name: regData.faction_name,
        speaker1_username: regData.speaker1_username,
        speaker2_username: regData.speaker2_username,
        club: regData.club,
        city: regData.city,
        status: 'pending'
      });
    if (error) {
      console.error("Ошибка при отправке регистрации:", error);
      alert("Не удалось отправить регистрацию: " + error.message);
      return false;
    }
    await loadRegistrations(regData.tournament_id);
    return true;
  };

  const updateRegistrationStatus = async (registrationId, newStatus) => {
    const { data, error } = await supabase
      .from('registrations')
      .update({ status: newStatus })
      .eq('id', registrationId)
      .select()
      .single();

    if (error) {
      console.error("Ошибка обновления статуса:", error);
      alert("Не удалось обновить статус команды.");
    } else {
      const regIndex = registrations.value.findIndex(r => r.id === registrationId);
      if (regIndex !== -1) {
        registrations.value[regIndex] = data;
      }
    }
  };

  // Organizer edit: update team fields with duplicate checks on speakers
  const updateRegistrationFields = async (registrationId, updates) => {
    // Prevent selecting same speaker twice
    if (updates.speaker1_username && updates.speaker2_username && updates.speaker1_username === updates.speaker2_username) {
      alert('Спикеры должны быть разными.');
      return false;
    }

    try {
      // Load current registration for tournament id
      const current = registrations.value.find(r => r.id === registrationId);
      if (!current) return false;
      const tournamentId = current.tournament_id;

      // Duplicate speakers across tournament
      const s1 = updates.speaker1_username;
      const s2 = updates.speaker2_username;
      if (s1 || s2) {
        const { data: existing, error: dupErr } = await supabase
          .from('registrations')
          .select('id, speaker1_username, speaker2_username')
          .eq('tournament_id', tournamentId)
          .neq('id', registrationId)
          .or(
            [
              s1 ? `speaker1_username.eq.${s1},speaker2_username.eq.${s1}` : '',
              s2 ? `speaker1_username.eq.${s2},speaker2_username.eq.${s2}` : ''
            ].filter(Boolean).join(',') || 'id.eq.-1'
          );
        if (!dupErr && existing && existing.length > 0) {
          alert('Один из выбранных спикеров уже зарегистрирован в этом турнире.');
          return false;
        }
      }

      const { data, error } = await supabase
        .from('registrations')
        .update(updates)
        .eq('id', registrationId)
        .select()
        .single();

      if (error) {
        console.error('Ошибка обновления регистрации:', error);
        alert('Не удалось обновить регистрацию.');
        return false;
      }
      const idx = registrations.value.findIndex(r => r.id === registrationId);
      if (idx !== -1) registrations.value[idx] = data;
      return true;
    } catch (e) {
      console.error('Критическая ошибка обновления регистрации:', e);
      alert('Критическая ошибка обновления регистрации.');
      return false;
    }
  };

  const publishTab = async (tournamentId, publishState) => {
    const { error } = await supabase
      .from('tournaments')
      .update({ tab_published: publishState })
      .eq('id', tournamentId);
    
    if (error) {
      alert("Не удалось изменить статус публикации ТЭБа.");
    } else {
      if (currentTournament.value) {
        currentTournament.value.tab_published = publishState;
      }
      alert(`ТЭБ успешно ${publishState ? 'опубликован' : 'скрыт'}.`);
    }
  };

  const getClubMembers = async (clubName) => {
    if (!clubName) return [];
    
    const { data, error } = await supabase
      .from('profiles')
      .select('fullname, telegram_username')
      .eq('club', clubName)
      .order('fullname');
      
    if (error) {
      console.error("Ошибка загрузки участников клуба:", error);
      return [];
    }
    
    return data || [];
  };

  const getSchoolMembersByCity = async (city) => {
    if (!city) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('fullname, telegram_username')
      .eq('city', city)
      .contains('extra', { league: 'school' })
      .order('fullname');
    if (error) {
      console.error('Ошибка загрузки школьной лиги по городу:', error);
      return [];
    }
    return data || [];
  };

  const getUserNames = async (usernames) => {
    if (!usernames || usernames.length === 0) return {};
    
    const { data, error } = await supabase
      .from('profiles')
      .select('fullname, telegram_username')
      .in('telegram_username', usernames);
      
    if (error) {
      console.error("Ошибка загрузки имен пользователей:", error);
      return {};
    }
    
    // Convert array to object for easy lookup
    const nameMap = {};
    data?.forEach(user => {
      nameMap[user.telegram_username] = user.fullname;
    });
    
    return nameMap;
  };

  const exportRegistrationsToCSV = async (tournamentId) => {
    try {
      // Load registrations
      await loadRegistrations(tournamentId);
      
      if (!registrations.value || registrations.value.length === 0) {
        alert('Нет зарегистрированных команд для экспорта');
        return;
      }

      // Get all unique usernames
      const allUsernames = [];
      registrations.value.forEach(reg => {
        if (reg.speaker1_username) allUsernames.push(reg.speaker1_username);
        if (reg.speaker2_username) allUsernames.push(reg.speaker2_username);
      });

      // Get user names
      const nameMap = await getUserNames(allUsernames);

      // Create CSV content
      const headers = [
        'Название фракции',
        '1-й спикер (имя)',
        '1-й спикер (username)',
        '2-й спикер (имя)',
        '2-й спикер (username)',
        'Клуб',
        'Город',
        'Контакты',
        'Дополнительно',
        'Статус',
        'Дата регистрации'
      ];

      const csvRows = [headers.join(',')];

      registrations.value.forEach(reg => {
        const row = [
          `"${reg.faction_name || ''}"`,
          `"${nameMap[reg.speaker1_username] || reg.speaker1_username || ''}"`,
          `"${reg.speaker1_username || ''}"`,
          `"${nameMap[reg.speaker2_username] || reg.speaker2_username || ''}"`,
          `"${reg.speaker2_username || ''}"`,
          `"${reg.club || ''}"`,
          `"${reg.city || ''}"`,
          `"${reg.contacts || ''}"`,
          `"${reg.extra || ''}"`,
          `"${reg.status || ''}"`,
          `"${reg.timestamp ? new Date(reg.timestamp).toLocaleString('ru-RU') : ''}"`
        ];
        csvRows.push(row.join(','));
      });

      // Create and download file
      const csvContent = csvRows.join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `tournament_${tournamentId}_registrations.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('CSV файл успешно скачан!');
    } catch (error) {
      console.error('Ошибка экспорта CSV:', error);
      alert('Ошибка при создании CSV файла');
    }
  };

  return { 
    allTournaments, isLoading, currentTournament, tournamentPosts, registrations,
    loadTournaments, loadTournamentById, createTournament, 
    loadTournamentPosts, createTournamentPost,
    loadRegistrations, submitRegistration,
    updateRegistrationStatus, updateRegistrationFields, publishTab, getClubMembers, getUserNames, exportRegistrationsToCSV
  };
});