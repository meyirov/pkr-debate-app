// Проверяем, что Vue успешно подключился
if (typeof Vue === 'undefined') {
  alert('Ошибка: Vue.js не загрузился. Проверьте подключение к интернету.');
}

const { createApp, ref, computed } = Vue;

const app = createApp({
  // ❗ ИЗМЕНЕНИЕ: Добавляем свойство template.
  // Это HTML-каркас всего нашего приложения.
  // Vue будет использовать его для отрисовки.
  template: `
    <div v-if="!isLoading" class="app-container">
      <div class="main-content">
        <div v-if="activeTab === 'feed'" class="content">
          <h2>Лента</h2>
          </div>

        <div v-else-if="activeTab === 'tournaments'" class="content">
          <h2>Турниры</h2>
          </div>

        <div v-else-if="activeTab === 'rating'" class="content">
          <h2>Рейтинг</h2>
          </div>

        <div v-else-if="activeTab === 'profile'" class="content">
          <h2>Профиль</h2>
          </div>

        <div v-else-if="activeTab === 'edu'" class="content">
          <h2>EDU</h2>
          </div>
      </div>

      <nav class="navbar">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['nav-btn', { active: activeTab === tab.id }]"
          @click="changeTab(tab.id)"
        >
          <span>{{ tab.icon }}</span>
          {{ tab.name }}
        </button>
      </nav>
    </div>
  `,

  // setup() - это специальная функция в Vue, где будет вся наша логика
  setup() {
    // === СОСТОЯНИЕ (ДАННЫЕ) ===
    const isLoading = ref(true);
    const activeTab = ref('feed');
    const userData = ref(null);

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
      console.log('Приложение инициализировано!');

      // ❗ ИЗМЕНЕНИЕ: Проверяем, что мы внутри Telegram, прежде чем использовать его функции
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }

      // Убираем экран загрузки
      setTimeout(() => {
          isLoading.value = false;
      }, 1500);
    };

    // === ЗАПУСК ПРИЛОЖЕНИЯ ===
    initializeApp();

    // Возвращаем все переменные и функции,
    // чтобы их можно было использовать в HTML-шаблоне (template)
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
