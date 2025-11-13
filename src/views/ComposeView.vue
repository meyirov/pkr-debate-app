<template>
  <div class="compose-container">
    <div class="compose-header">
      <button class="back-button" @click="goBack" aria-label="Назад">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h2>Новый пост</h2>
      <button class="publish-btn" :disabled="isPosting || (!postText.trim() && !selectedFile)" @click="submit">
        {{ isPosting ? 'Публикация...' : 'Опубликовать' }}
      </button>
    </div>

    <div class="compose-body">
      <div class="avatar">{{ initials }}</div>
      <div class="inputs">
        <textarea v-model="postText" class="compose-text" placeholder="Что происходит?" />
        <div v-if="imagePreviewUrl" class="image-preview">
          <img :src="imagePreviewUrl" alt="Предпросмотр">
          <button @click="removeImage" class="remove-image-btn">×</button>
        </div>
        <div class="compose-actions">
          <label class="file-upload">
            <input type="file" accept="image/*" @change="onFileChange" hidden>
            📷 Фото
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePostsStore } from '@/stores/posts';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const postsStore = usePostsStore();
const userStore = useUserStore();

const postText = ref('');
const selectedFile = ref(null);
const imagePreviewUrl = ref(null);
const isPosting = ref(false);

const initials = computed(() => {
  const name = userStore.userData?.fullname || 'User';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
});

const onFileChange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile.value = file;
  imagePreviewUrl.value = URL.createObjectURL(file);
};

const removeImage = () => {
  selectedFile.value = null;
  imagePreviewUrl.value = null;
};

const submit = async () => {
  if (isPosting.value) return;
  isPosting.value = true;
  const ok = await postsStore.submitPost(postText.value, selectedFile.value);
  isPosting.value = false;
  if (ok) {
    postText.value = '';
    removeImage();
    router.push('/');
  }
};

const goBack = () => {
  router.push('/');
};
</script>

<style scoped>
.compose-container {
  position: fixed;
  inset: 0;
  background: #1a1a1a;
  z-index: 110; /* keep below global app header (z-index 120) */
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  /* Reserve space under the two-tier header so buttons don't collide with system icons */
  padding-top: calc(28px + env(safe-area-inset-top, 0px) + 56px);
}

.compose-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a2a;
}

.compose-header h2 { color: #e7e9ea; font-size: 18px; margin: 0; }
.back-button { background: none; border: none; color: #e7e9ea; padding: 8px; border-radius: 50%; }
.back-button:hover { background: #1e1e1e; }
.back-button svg { width: 20px; height: 20px; }

.publish-btn {
  background: #7c3aed; color: #fff; border: none; border-radius: 20px;
  padding: 8px 14px; font-weight: 600; cursor: pointer;
}
.publish-btn:disabled { background: #2a2a2a; color: #71767b; cursor: not-allowed; }

.compose-body { display: flex; padding: 12px 16px; gap: 12px; }
.avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; }
.inputs { flex: 1; }
.compose-text { width: 100%; min-height: 140px; resize: none; background: transparent; color: #e7e9ea; border: none; outline: none; font-size: 18px; }
.compose-actions { display:flex; gap: 12px; margin-top: 8px; }
.file-upload { color: #7c3aed; cursor: pointer; }

.image-preview { position: relative; margin-top: 10px; }
.image-preview img { max-width: 100%; border-radius: 12px; }
.remove-image-btn { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; }
</style>


