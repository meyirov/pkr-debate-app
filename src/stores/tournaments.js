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
    if (!regData.faction_name || !regData.speaker1_username || !regData.speaker2_username || !regData.club) {
      alert('Пожалуйста, заполните все обязательные поля.');
      return false;
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
    updateRegistrationStatus, publishTab, getClubMembers, getUserNames, exportRegistrationsToCSV
  };
});