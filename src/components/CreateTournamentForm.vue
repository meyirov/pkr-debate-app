<template>
  <form class="create-form" @submit.prevent="handleSubmit">
    <h3>Создание нового турнира</h3>
    <input v-model="name" type="text" placeholder="Название турнира" required>
    <input v-model="date" type="text" placeholder="Дата (в формате ДД.ММ.ГГГГ)" required>
    <select v-model="city" required>
      <option value="" disabled>Выберите город</option>
      <option value="Алматы">Алматы</option>
      <option value="Астана">Астана</option>
      <option value="Другой">Другой</option>
    </select>
    <select v-model="scale" required>
      <option value="" disabled>Выберите масштаб</option>
      <option value="Городской">Городской</option>
      <option value="Республиканский">Республиканский</option>
    </select>
    <textarea v-model="desc" placeholder="Описание турнира"></textarea>
    
    <label for="logo-upload" class="file-upload-label">🖼️ Загрузить логотип</label>
    <input id="logo-upload" type="file" @change="onFileChange" accept="image/*" style="display: none;">
    <span v-if="logoFile" class="file-name">{{ logoFile.name }}</span>

    <button type="submit" :disabled="isSubmitting">
      {{ isSubmitting ? 'Создание...' : 'Создать турнир' }}
    </button>
  </form>
</template>

<script setup>
import { ref } from 'vue';
import { useTournamentsStore } from '@/stores/tournaments';

const tournamentsStore = useTournamentsStore();

// `defineEmits` объявляет, какие события компонент может отправлять "наверх"
const emit = defineEmits(['close']);

const name = ref('');
const date = ref('');
const city = ref('');
const scale = ref('');
const desc = ref('');
const logoFile = ref(null);
const isSubmitting = ref(false);

const onFileChange = (event) => {
  logoFile.value = event.target.files[0];
};

const handleSubmit = async () => {
  isSubmitting.value = true;
  const tournamentData = {
    name: name.value,
    date: date.value,
    city: city.value,
    scale: scale.value,
    desc: desc.value,
    logoFile: logoFile.value
  };

  const success = await tournamentsStore.createTournament(tournamentData);
  if (success) {
    // Если турнир создан успешно, отправляем "наверх" сигнал, чтобы закрыть форму
    emit('close');
  }
  isSubmitting.value = false;
};
</script>

<style scoped>
.create-form {
  background: #1a1a1a;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.create-form h3 { margin-bottom: 10px; }
.create-form input,
.create-form select,
.create-form textarea {
  width: 100%; padding: 10px; border: 1px solid #333;
  border-radius: 8px; background: #262626; color: #e6e6e6; font-size: 14px;
}
.file-upload-label {
  padding: 8px 12px; background: #333;
  border-radius: 8px; cursor: pointer; text-align: center;
}
.file-name { font-size: 12px; color: #888; }
.create-form button {
  padding: 12px; background: #8b5cf6; color: #ffffff;
  border: none; border-radius: 8px; cursor: pointer;
  font-size: 16px; font-weight: 600;
}
.create-form button:disabled { background: #555; }
</style>