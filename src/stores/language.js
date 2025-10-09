import { defineStore } from 'pinia';
import { ref } from 'vue';
import i18n from '@/i18n';

export const useLanguageStore = defineStore('language', () => {
  const currentLanguage = ref(localStorage.getItem('app-language') || 'ru');

  const switchLanguage = (lang) => {
    if (lang === 'ru' || lang === 'kz' || lang === 'en') {
      currentLanguage.value = lang;
      i18n.global.locale.value = lang;
      localStorage.setItem('app-language', lang);
      
      // Update document language attribute
      const langMap = { ru: 'ru', kz: 'kk', en: 'en' };
      document.documentElement.lang = langMap[lang];
      
      console.log(`Language switched to ${lang}`);
    }
  };

  const getCurrentLanguage = () => {
    return currentLanguage.value;
  };

  const isKazakh = () => {
    return currentLanguage.value === 'kz';
  };

  const isRussian = () => {
    return currentLanguage.value === 'ru';
  };

  const isEnglish = () => {
    return currentLanguage.value === 'en';
  };

  return {
    currentLanguage,
    switchLanguage,
    getCurrentLanguage,
    isKazakh,
    isRussian,
    isEnglish
  };
});
