// src/main.js
import './assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app.vue'
import router from './router' // <-- ИМПОРТИРУЕМ РОУТЕР

const app = createApp(App)
app.use(createPinia())
app.use(router) // <-- ПОДКЛЮЧАЕМ РОУТЕР
app.mount('#app')