<template>
  <div class="modal-overlay">
    <div class="modal-content">
      <h2>Добро пожаловать!</h2>
      <p>Похоже, ты у нас впервые. Пожалуйста, представься:</p>
      <input
        v-model="fullname"
        type="text"
        placeholder="Имя и фамилия"
        @keyup.enter="handleRegistration"
      />
      <button @click="handleRegistration">Зарегистрироваться</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();
const fullname = ref('');

const handleRegistration = () => {
  userStore.registerNewUser(fullname.value);
}
</script>

<style scoped>
.modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.85); display: flex; justify-content: center;
    align-items: center; z-index: 2000; padding: 15px;
}
.modal-content {
    background: #1a1a1a; padding: 25px; border-radius: 12px;
    text-align: center; max-width: 400px; width: 100%;
    color: #e6e6e6; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
h2 { margin-bottom: 10px; }
p { margin-bottom: 20px; color: #aaa; }
input {
    width: 100%; padding: 12px; border: 1px solid #333; border-radius: 8px;
    background: #262626; color: #e6e6e6; font-size: 16px; margin-bottom: 20px;
}
button {
    width: 100%; padding: 12px; background: #8b5cf6; color: #ffffff;
    border: none; border-radius: 8px; cursor: pointer; font-size: 16px;
    font-weight: 600; transition: background 0.2s ease;
}
</style>