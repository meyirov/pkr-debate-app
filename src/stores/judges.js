// src/stores/judges.js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/supabase';
import { useUserStore } from './user';

export const useJudgesStore = defineStore('judges', () => {
  const judges = ref([]); // { id, tournament_id, judge_username, status, club, timestamp }
  const isLoading = ref(false);

  const normalizeStatus = (s) => (s || '').toString().trim().toLowerCase();
  const acceptedJudges = computed(() => judges.value.filter(j => normalizeStatus(j.status) === 'accepted'));
  const pendingJudges = computed(() => judges.value.filter(j => normalizeStatus(j.status) === 'pending'));

  const loadJudges = async (tournamentId) => {
    isLoading.value = true;
    judges.value = [];
    const { data, error } = await supabase
      .from('judges')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Ошибка загрузки судей:', error);
      isLoading.value = false;
      return;
    }

    const raw = data || [];

    // Enrich clubs and full names from profiles to ensure up-to-date info
    const usernames = Array.from(new Set(raw.map(j => j.judge_username).filter(Boolean)));
    let clubMap = {};
    let nameMap = {};
    if (usernames.length > 0) {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('telegram_username, club, fullname')
        .in('telegram_username', usernames);
      if (!pErr && profiles) {
        clubMap = Object.fromEntries(profiles.map(p => [p.telegram_username, p.club]));
        nameMap = Object.fromEntries(profiles.map(p => [p.telegram_username, p.fullname]));
      }
    }

    judges.value = raw.map(j => ({
      ...j,
      club: j.club || clubMap[j.judge_username] || null,
      fullname: nameMap[j.judge_username] || null,
      status: normalizeStatus(j.status) || 'pending',
    }));
    isLoading.value = false;
  };

  const registerAsJudge = async (tournamentId) => {
    const userStore = useUserStore();
    const username = userStore.userData?.telegram_username;
    const club = userStore.userData?.club || null;
    if (!username) {
      alert('Чтобы зарегистрироваться судьей, войдите через Telegram.');
      return false;
    }

    const existing = judges.value.find(j => j.judge_username === username);
    if (existing) {
      alert('Вы уже зарегистрированы как судья.');
      return true;
    }

    const { error } = await supabase
      .from('judges')
      .insert({ tournament_id: tournamentId, judge_username: username, club, status: 'pending' });
    if (error) {
      console.error('Ошибка регистрации судьи:', error);
      // Unique violation => already registered
      if (error.code === '23505') {
        alert('Вы уже зарегистрированы как судья в этом турнире.');
        return true;
      }
      // Undefined table => migrations not applied
      if (error.code === '42P01') {
        alert('Таблица судей не найдена. Запустите миграции БД для judges.');
        return false;
      }
      alert('Не удалось зарегистрироваться судьей.');
      return false;
    }
    await loadJudges(tournamentId);
    return true;
  };

  const updateJudgeStatus = async (judgeId, newStatus) => {
    const { data, error } = await supabase
      .from('judges')
      .update({ status: newStatus })
      .eq('id', judgeId)
      .select()
      .single();

    if (error) {
      console.error('Ошибка обновления статуса судьи:', error);
      alert('Не удалось обновить статус судьи.');
      return false;
    }
    const idx = judges.value.findIndex(j => j.id === judgeId);
    if (idx !== -1) judges.value[idx] = data;
    return true;
  };

  return { judges, isLoading, acceptedJudges, pendingJudges, loadJudges, registerAsJudge, updateJudgeStatus };
});


