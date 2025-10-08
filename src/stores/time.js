import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useTimeStore = defineStore('time', () => {
    // --- Состояние (State) ---
    const currentTime = ref(new Date());
    const timezone = ref('Asia/Almaty'); // Можно сделать настраиваемым в будущем
    let intervalId = null;

    // --- Сезоны (можно будет загружать с сервера) ---
    const seasons = ref([
        { id: 1, name: 'Сезон 2024-2025', startDate: new Date('2024-09-01T00:00:00'), endDate: new Date('2025-05-31T23:59:59') },
        { id: 2, name: 'Сезон 2025-2026', startDate: new Date('2025-09-01T00:00:00'), endDate: new Date('2026-05-31T23:59:59') },
    ]);

    // --- Действия (Actions) ---

    // Обновляет текущее время
    const updateTime = () => {
        currentTime.value = new Date();
    };

    // Запускает часы, которые обновляются каждую секунду
    const startClock = () => {
        if (intervalId) return; // Не запускать, если уже запущен
        updateTime();
        intervalId = setInterval(updateTime, 1000);
    };

    // Останавливает часы (для оптимизации, когда компонент не виден)
    const stopClock = () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };

    // --- Геттеры (Getters/Computed) ---

    // Вычисляет текущий сезон
    const currentSeason = computed(() => {
        const now = currentTime.value;
        return seasons.value.find(s => now >= s.startDate && now <= s.endDate) || null;
    });

    // Вычисляет прогресс текущего сезона в процентах
    const seasonProgress = computed(() => {
        if (!currentSeason.value) return 0;

        const now = currentTime.value.getTime();
        const start = currentSeason.value.startDate.getTime();
        const end = currentSeason.value.endDate.getTime();

        if (now >= end) return 100;
        if (now < start) return 0;

        const totalDuration = end - start;
        const elapsed = now - start;
        
        return Math.min(100, (elapsed / totalDuration) * 100);
    });

    // Вычисляет, сколько дней осталось до конца сезона
    const daysToSeasonEnd = computed(() => {
        if (!currentSeason.value) return null;

        const now = currentTime.value;
        const end = currentSeason.value.endDate;
        const diffTime = end - now;

        if (diffTime < 0) return 0;
        
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    });

    // Возвращаем все необходимые данные и функции
    return {
        currentTime,
        timezone,
        startClock,
        stopClock,
        currentSeason,
        seasonProgress,
        daysToSeasonEnd,
    };
});


