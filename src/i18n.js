import { createI18n } from 'vue-i18n';
import ru from './locales/ru.js';
import kz from './locales/kz.js';
import en from './locales/en.js';

const messages = {
  ru,
  kz,
  en
};

// Get saved language from localStorage or default to Russian
const savedLanguage = localStorage.getItem('app-language') || 'ru';

const i18n = createI18n({
  legacy: false,
  locale: savedLanguage,
  fallbackLocale: 'ru',
  messages
});

export default i18n;
