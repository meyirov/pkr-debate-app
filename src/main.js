// src/main.js
import './assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app.vue'
import router from './router'
import i18n from './i18n'

// Simple persisted-state plugin for Pinia (localStorage)
function createPersistedStatePlugin() {
  return (context) => {
    const { store } = context;
    const persistedKeys = ['language', 'user'];
    if (!persistedKeys.includes(store.$id)) return;

    const storageKey = `pinia-${store.$id}`;
    const fromStorage = localStorage.getItem(storageKey);
    if (fromStorage) {
      try {
        store.$patch(JSON.parse(fromStorage));
      } catch (e) { /* ignore corrupt data */ }
    }
    store.$subscribe((_mutation, state) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch { /* quota errors ignored */ }
    });
  };
}

const pinia = createPinia();
pinia.use(createPersistedStatePlugin());

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(i18n)
app.mount('#app')