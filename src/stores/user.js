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
      
      // Создаём "фейкового" пользователя для тестов
      userData.value = {
        id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', // случайный ID
        fullname: 'Тестовый Пользователь',
        telegram_username: 'dev_user'
      };
      
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
    } else {
      showRegistrationModal.value = true;
    }
    isLoading.value = false;
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
    }
  }

  return { isLoading, showRegistrationModal, userData, checkUserProfile, registerNewUser };
});