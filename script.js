// Проверяем, что Vue успешно подключился
if (typeof Vue === 'undefined') {
  alert('Ошибка: Vue.js не загрузился. Проверьте подключение к интернету.');
}

const { createApp, ref, computed } = Vue;

const app = createApp({
  // setup() - это специальная функция в Vue, где будет вся наша логика
  setup() {
    // === СОСТОЯНИЕ (ДАННЫЕ) ===
    // ref() - так в Vue создаются "реактивные" переменные.
    // Когда они меняются, HTML обновляется сам.
    const isLoading = ref(true); // Показываем ли экран загрузки
    const activeTab = ref('feed'); // Какая вкладка сейчас активна
    const userData = ref(null); // Данные о пользователе

    const tabs = [
        { id: 'feed', icon: '🏠', name: 'Лента' },
        { id: 'tournaments', icon: '🏆', name: 'Турниры' },
        { id: 'rating', icon: '⭐', name: 'Рейтинг' },
        { id: 'profile', icon: '👤', name: 'Профиль' },
        { id: 'edu', icon: '📚', name: 'EDU' },
    ];

    // === МЕТОДЫ (ФУНКЦИИ) ===
    const changeTab = (tabId) => {
      activeTab.value = tabId;
    };

    const initializeApp = () => {
      // Имитируем запуск приложения
      console.log('Приложение инициализировано!');
      const tg = window.Telegram.WebApp;
      tg.ready();

      // Здесь в будущем будет логика проверки пользователя
      // А пока просто убираем экран загрузки через 2 секунды
      setTimeout(() => {
          isLoading.value = false;
          tg.expand(); // Раскрываем приложение на весь экран
      }, 1500);
    };

    // === ЗАПУСК ПРИЛОЖЕНИЯ ===
    // Вызываем нашу функцию инициализации
    initializeApp();

    // Возвращаем все переменные и функции,
    // чтобы их можно было использовать в HTML
    return {
      isLoading,
      activeTab,
      tabs,
      changeTab,
    };
  }
});

// "Монтируем" наше Vue-приложение в <div id="app"> в HTML
app.mount('#app');
