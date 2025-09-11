<template>
  <div class="comment-section">
    <div v-if="isLoading" class="loading-comments">Загрузка комментариев...</div>
    <div v-else class="comment-list">
      <div v-if="comments.length === 0">
        <p>Комментариев пока нет.</p>
      </div>
      <div v-for="comment in comments" :key="comment.id" class="comment">
        <div class="comment-header">
          <div class="user-avatar">{{ getCommentInitials(comment) }}</div>
          <div class="user-details">
            <strong>{{ getCommentAuthor(comment) }}</strong>
            <span>@{{ getCommentUsername(comment) }}</span>
          </div>
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
const getCommentContent = (comment) => {
  let content = comment.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '');
  
  // Convert mentions to clickable links
  content = content.replace(/@(\w+)/g, '<span class="mention" onclick="handleMentionClick(\'$1\')">@$1</span>');
  
  // Convert hashtags to clickable links
  content = content.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  
  // Convert URLs to clickable links
  content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="post-link">$1</a>');
  
  // Convert line breaks
  content = content.replace(/\n/g, '<br>');
  
  return content;
};
const getCommentInitials = (comment) => {
  const authorName = getCommentAuthor(comment);
  const words = authorName.trim().split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return 'U';
};

// Загружаем комментарии, когда компонент появляется на экране
onMounted(loadComments);
</script>

<style scoped>
.comment-section {
    margin-top: 20px;
    border-top: 1px solid #2a2a2a;
    padding-top: 16px;
    background: #1a1a1a;
}
.comment-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 16px;
}
.comment {
    padding: 12px 0;
    border-bottom: 1px solid #2a2a2a;
    background: #1a1a1a;
}
.comment:last-child {
    border-bottom: none;
}
.comment-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
}
.comment-header .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 12px;
    color: white;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);
}
.comment-header .user-details {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.comment-header strong { 
    font-weight: 700; 
    color: #f0f0f0; 
    font-size: 14px;
}
.comment-header span { 
    color: #8b8b8b; 
    font-size: 12px;
    font-weight: 500;
}
.comment-content { 
    font-size: 15px; 
    color: #d1d5db; 
    line-height: 1.5;
    margin-left: 44px;
}

.comment-form { 
    display: flex; 
    gap: 12px; 
    margin-top: 16px; 
    align-items: flex-end;
}
.comment-form textarea {
    flex-grow: 1;
    height: 44px;
    padding: 12px;
    border: 2px solid #2a2a2a;
    border-radius: 12px;
    background: #1a1a1a;
    color: #e6e6e6;
    resize: none;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.3s ease;
    line-height: 1.4;
}
.comment-form textarea:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}
.comment-form button {
    padding: 12px 20px;
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    color: #ffffff;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
    min-height: 44px;
}
.comment-form button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}
.comment-form button:disabled {
    background: #2a2a2a;
    transform: none;
    box-shadow: none;
}
</style>