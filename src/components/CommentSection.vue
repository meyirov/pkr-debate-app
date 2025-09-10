<template>
  <div class="comment-section">
    <div v-if="isLoading" class="loading-comments">Загрузка комментариев...</div>
    <div v-else class="comment-list">
      <div v-if="comments.length === 0">
        <p>Комментариев пока нет.</p>
      </div>
      <div v-for="comment in comments" :key="comment.id" class="comment">
        <div class="comment-header">
          <strong>{{ getCommentAuthor(comment) }}</strong>
          <span>@{{ getCommentUsername(comment) }}</span>
        </div>
        <div class="comment-content" v-html="getCommentContent(comment)"></div>
      </div>
    </div>

    <form @submit.prevent="handleCommentSubmit" class="comment-form">
      <textarea v-model="newCommentText" placeholder="Написать комментарий..."></textarea>
      <button type="submit" :disabled="isSubmitting">Отправить</button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '@/supabase';
import { usePostsStore } from '@/stores/posts';

// Этот компонент принимает post.id извне
const props = defineProps({
  postId: {
    type: Number,
    required: true
  }
});

const postsStore = usePostsStore();
const comments = ref([]);
const isLoading = ref(true);
const newCommentText = ref('');
const isSubmitting = ref(false);

const loadComments = async () => {
  isLoading.value = true;
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', props.postId)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error("Ошибка загрузки комментариев:", error);
  } else {
    comments.value = data;
  }
  isLoading.value = false;
};

const handleCommentSubmit = async () => {
    if (!newCommentText.value.trim()) return;
    isSubmitting.value = true;
    const success = await postsStore.addComment(props.postId, newCommentText.value);
    if (success) {
        newCommentText.value = '';
        await loadComments(); // Перезагружаем комменты после добавления
    }
    isSubmitting.value = false;
};

// Вспомогательные функции для парсинга текста комментария
const getCommentAuthor = (comment) => comment.text.match(/^(.*?)\s\(@(.*?)\):/)?.[1] || 'Пользователь';
const getCommentUsername = (comment) => comment.text.match(/^(.*?)\s\(@(.*?)\):/)?.[2] || 'unknown';
const getCommentContent = (comment) => comment.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '').replace(/\n/g, '<br>');

// Загружаем комментарии, когда компонент появляется на экране
onMounted(loadComments);
</script>

<style scoped>
.comment-section {
    margin-top: 15px;
    border-top: 1px solid #262626;
    padding-top: 10px;
}
.comment-list {
    max-height: 250px;
    overflow-y: auto;
    margin-bottom: 10px;
}
.comment {
    padding: 8px 0;
    border-bottom: 1px solid #222;
}
.comment:last-child {
    border-bottom: none;
}
.comment-header {
    font-size: 14px;
    margin-bottom: 4px;
}
.comment-header strong { font-weight: 600; color: #f0f0f0; }
.comment-header span { color: #888; margin-left: 5px; }
.comment-content { font-size: 15px; color: #d1d5db; }

.comment-form { display: flex; gap: 10px; margin-top: 10px; }
.comment-form textarea {
    flex-grow: 1;
    height: 40px;
    padding: 8px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #262626;
    color: #e6e6e6;
    resize: none;
    font-size: 14px;
}
.comment-form button {
    padding: 0 15px;
    background: #8b5cf6;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
}
.comment-form button:disabled {
    background: #555;
}
</style>