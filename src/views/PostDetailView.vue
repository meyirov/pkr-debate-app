<template>
  <div 
    class="post-detail-container"
    :class="{ 'slide-in': isVisible }"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Header with back button -->
    <div class="post-detail-header">
      <button @click="goBack" class="back-button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h2>Пост</h2>
    </div>

    <!-- Loading State -->
    <div v-if="!post" class="loading-post">
      <div class="loading-spinner"></div>
      <p>Загрузка поста...</p>
    </div>

    <!-- Main Post -->
    <div v-else class="main-post">
      <div class="tweet">
        <!-- Tweet Header -->
        <div class="tweet-header">
          <div class="tweet-user-info">
            <div class="tweet-avatar">{{ getUserInitials(post) }}</div>
            <div class="tweet-user-details">
              <div class="tweet-name">{{ getPostAuthor(post) }}</div>
              <div class="tweet-username">@{{ post.user_id }}</div>
            </div>
          </div>
          <div class="tweet-meta">
            <span class="tweet-time">{{ getTimeAgo(post.timestamp) }}</span>
            <button v-if="isOwnPost(post)" @click="togglePostMenu(post.id)" class="tweet-menu-btn">⋯</button>
          </div>
        </div>

        <!-- Tweet Content -->
        <div class="tweet-content">
          <div v-if="editingPost === post.id" class="tweet-edit-form">
            <textarea v-model="editPostText" class="tweet-edit-textarea" placeholder="Редактировать пост..."></textarea>
            <div class="tweet-edit-actions">
              <button @click="saveEdit(post.id)" :disabled="!editPostText.trim()" class="tweet-save-btn">Сохранить</button>
              <button @click="cancelEdit" class="tweet-cancel-btn">Отмена</button>
            </div>
          </div>
          <div v-else class="tweet-text" v-html="getPostContent(post)"></div>
          <img v-if="post.image_url" :src="post.image_url" class="tweet-image">
        </div>

        <!-- Tweet Actions -->
        <div class="tweet-actions">
          <button @click="toggleReaction(post.id, 'like')" :class="['tweet-action-btn', 'like-btn', { active: hasUserReacted(post, 'like') }]">
            <svg class="tweet-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span class="tweet-action-count">{{ countReactions(post, 'like') }}</span>
          </button>
          <button @click="toggleReaction(post.id, 'dislike')" :class="['tweet-action-btn', 'dislike-btn', { active: hasUserReacted(post, 'dislike') }]">
            <svg class="tweet-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l18 18M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span class="tweet-action-count">{{ countReactions(post, 'dislike') }}</span>
          </button>
          <button class="tweet-action-btn comment-btn active">
            <svg class="tweet-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="tweet-action-count">{{ getCommentCount(post) }}</span>
          </button>
        </div>

        <!-- Menu Dropdown -->
        <div v-if="showPostMenu === post.id" class="tweet-menu-dropdown">
          <button v-if="isOwnPost(post)" @click="editPost(post)" class="tweet-menu-item">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Редактировать
          </button>
          <button v-if="isOwnPost(post)" @click="deletePost(post.id)" class="tweet-menu-item delete">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            Удалить
          </button>
          <div v-if="!isOwnPost(post)" class="tweet-menu-item disabled">Не ваш пост</div>
        </div>
      </div>
    </div>

    <!-- Comment Form -->
    <div v-if="post" class="comment-form-section">
      <div class="comment-form-header">
        <div class="comment-form-avatar">{{ getUserInitials({ user_id: userStore.userData?.telegram_username, text: `${userStore.userData?.fullname} (@${userStore.userData?.telegram_username}):` }) }}</div>
        <div class="comment-form-content">
          <textarea 
            v-model="newCommentText" 
            placeholder="Написать комментарий..."
            class="comment-textarea"
            @keydown.enter.prevent="handleCommentSubmit"
          ></textarea>
          <div class="comment-form-actions">
            <button 
              @click="handleCommentSubmit" 
              :disabled="isSubmitting || !newCommentText.trim()"
              class="comment-submit-btn"
            >
              {{ isSubmitting ? 'Отправка...' : 'Ответить' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Comments List -->
    <div v-if="post" class="comments-section">
      <div v-if="isLoadingComments" class="loading-comments">
        Загрузка комментариев...
      </div>
      <div v-else-if="comments.length === 0" class="no-comments">
        <p>Пока нет комментариев. Станьте первым!</p>
      </div>
      <div v-else class="comments-list">
        <div v-for="comment in comments" :key="comment.id" class="comment">
          <div class="comment-header">
            <div class="user-avatar">{{ getCommentInitials(comment) }}</div>
            <div class="user-details">
              <strong>{{ getCommentAuthor(comment) }}</strong>
              <span>@{{ getCommentUsername(comment) }}</span>
            </div>
            <span class="comment-time">{{ getTimeAgo(comment.timestamp) }}</span>
          </div>
          <div class="comment-content" v-html="getCommentContent(comment)"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePostsStore } from '@/stores/posts';
import { useUserStore } from '@/stores/user';
import { supabase } from '@/supabase';

const route = useRoute();
const router = useRouter();
const postsStore = usePostsStore();
const userStore = useUserStore();

const post = ref(null);
const comments = ref([]);
const isLoadingComments = ref(true);
const newCommentText = ref('');
const isSubmitting = ref(false);
const showPostMenu = ref(null);
const editingPost = ref(null);
const editPostText = ref('');
const isVisible = ref(false);

// Load post data
onMounted(async () => {
  // Start overlay slide immediately to avoid blank frame
  requestAnimationFrame(() => {
    isVisible.value = true;
  });

  const postId = route.params.id;
  if (postId && !isNaN(postId)) {
    // Try to get post from feed first (preloaded data)
    const preloadedPost = postsStore.getPostById(postId);
    if (preloadedPost) {
      // Use preloaded data for instant display
      post.value = preloadedPost;
    }
    
    // Load fresh data and comments in parallel (do not block animation)
    Promise.all([
      loadPost(postId),
      loadComments(postId)
    ]).then(() => {
      // Content loaded; do not alter feed scroll position
    });
  } else {
    alert('Неверный ID поста');
    router.push('/');
  }
  
  // Add click outside listener for menu
  document.addEventListener('click', handleClickOutside);
});

const loadPost = async (postId) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*, reactions(*)')
      .eq('id', postId)
      .single();
    
    if (error) {
      console.error('Error loading post:', error);
      if (error.code === 'PGRST116') {
        // Post not found
        alert('Пост не найден');
      } else {
        alert('Ошибка загрузки поста: ' + error.message);
      }
      router.push('/');
      return;
    }
    
    post.value = data;
  } catch (error) {
    console.error('Unexpected error loading post:', error);
    alert('Произошла неожиданная ошибка');
    router.push('/');
  }
};

const loadComments = async (postId) => {
  isLoadingComments.value = true;
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('timestamp', { ascending: true });
    
    if (error) throw error;
    comments.value = data || [];
  } catch (error) {
    console.error('Error loading comments:', error);
  } finally {
    isLoadingComments.value = false;
  }
};

const handleCommentSubmit = async () => {
  if (!newCommentText.value.trim() || isSubmitting.value) return;
  
  isSubmitting.value = true;
  try {
    const success = await postsStore.addComment(post.value.id, newCommentText.value);
    if (success) {
      newCommentText.value = '';
      await loadComments(post.value.id);
    }
  } catch (error) {
    console.error('Error submitting comment:', error);
  } finally {
    isSubmitting.value = false;
  }
};

// Post interaction functions
const toggleReaction = (postId, type) => {
  postsStore.toggleReaction(postId, type);
};

const hasUserReacted = (post, type) => {
  const user = userStore.userData;
  if (!user) return false;
  return post.reactions?.some(r => r.user_id === user.telegram_username && r.type === type);
};

const countReactions = (post, type) => {
  return post.reactions?.filter(r => r.type === type).length || 0;
};

const getCommentCount = (post) => {
  return comments.value.length;
};

const togglePostMenu = (postId) => {
  showPostMenu.value = showPostMenu.value === postId ? null : postId;
};

const editPost = (post) => {
  editingPost.value = post.id;
  editPostText.value = post.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '');
};

const saveEdit = async (postId) => {
  const success = await postsStore.updatePost(postId, editPostText.value);
  if (success) {
    await loadPost(postId);
    editingPost.value = null;
    editPostText.value = '';
  }
};

const cancelEdit = () => {
  editingPost.value = null;
  editPostText.value = '';
};

const deletePost = async (postId) => {
  if (confirm('Вы уверены, что хотите удалить этот пост?')) {
    const success = await postsStore.deletePost(postId);
    if (success) {
      router.push('/');
    }
  }
};

const goBack = () => {
  // Stop feed animation first
  console.log('Stopping feed animation in goBack...');
  postsStore.stopFeedAnimation();
  
  // Trigger slide-out animation
  console.log('Starting slide-out animation...');
  isVisible.value = false;
  
  // Wait for animation to complete, then navigate
  setTimeout(() => {
    console.log('Navigating back to feed...');
    router.push('/');
  }, 300);
};

// Swipe gesture support
let startX = 0;
let startY = 0;
let isSwipeGesture = false;

const handleTouchStart = (e) => {
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  isSwipeGesture = false;
};

const handleTouchMove = (e) => {
  if (!startX || !startY) return;
  
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  
  const diffX = startX - currentX;
  const diffY = startY - currentY;
  
  // Check if it's a horizontal swipe (more horizontal than vertical movement)
  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
    isSwipeGesture = true;
    // Add visual feedback - slightly move the container
    const container = document.querySelector('.post-detail-container');
    if (container && diffX > 0) { // Swiping left (back gesture)
      container.style.transform = `translateX(${Math.min(diffX * 0.3, 100)}px)`;
    }
  }
};

const handleTouchEnd = (e) => {
  if (!startX || !startY) return;
  
  const currentX = e.changedTouches[0].clientX;
  const diffX = startX - currentX;
  
  // Reset transform
  const container = document.querySelector('.post-detail-container');
  if (container) {
    container.style.transform = '';
  }
  
  // If it's a swipe gesture and swiped left enough, go back
  if (isSwipeGesture && diffX > 100) {
    goBack();
  }
  
  startX = 0;
  startY = 0;
  isSwipeGesture = false;
};

// Utility functions
const getPostAuthor = (post) => post?.text.match(/^(.*?)\s\(@(.*?)\):/)?.[1] || 'Пользователь';
const getPostContent = (post) => {
  if (!post) return '';
  let content = post.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '');
  content = content.replace(/@(\w+)/g, '<span class="mention" onclick="handleMentionClick(\'$1\')">@$1</span>');
  content = content.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="post-link">$1</a>');
  content = content.replace(/\n/g, '<br>');
  return content;
};

const getTimeAgo = (date) => {
  if (!date) return 'недавно';
  const now = new Date();
  const postDate = new Date(date);
  if (isNaN(postDate.getTime())) return 'недавно';
  const diffInSeconds = Math.floor((now - postDate) / 1000);
  if (diffInSeconds < 0) return 'только что';
  if (diffInSeconds < 60) return `${diffInSeconds} сек.`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} мин.`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} ч.`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays} д.`;
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return `${diffInWeeks} нед.`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} мес.`;
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} г.`;
};

const getUserInitials = (post) => {
  const authorName = getPostAuthor(post);
  const words = authorName.trim().split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return authorName.substring(0, 2).toUpperCase();
};

const isOwnPost = (post) => {
  const user = userStore.userData;
  return user && post.user_id === user.telegram_username;
};

// Comment utility functions
const getCommentAuthor = (comment) => comment.text.match(/^(.*?)\s\(@(.*?)\):/)?.[1] || 'Пользователь';
const getCommentUsername = (comment) => comment.text.match(/^(.*?)\s\(@(.*?)\):/)?.[2] || 'unknown';
const getCommentContent = (comment) => {
  let content = comment.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '');
  content = content.replace(/@(\w+)/g, '<span class="mention" onclick="handleMentionClick(\'$1\')">@$1</span>');
  content = content.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="post-link">$1</a>');
  content = content.replace(/\n/g, '<br>');
  return content;
};

const getCommentInitials = (comment) => {
  const authorName = getCommentAuthor(comment);
  const words = authorName.trim().split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return authorName.substring(0, 2).toUpperCase();
};

// Handle click outside to close menu
const handleClickOutside = (event) => {
  if (!event.target.closest('.tweet-menu-btn') && !event.target.closest('.tweet-menu-dropdown')) {
    showPostMenu.value = null;
  }
};

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
/* Slide animations */
.post-detail-container {
  position: fixed;
  inset: 0;
  max-width: 600px;
  margin: 0 auto;
  background: #1a1a1a;
  min-height: 100vh;
  z-index: 100; /* below global app header (z-index 120) */
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  touch-action: pan-y; /* Allow vertical scrolling but handle horizontal swipes */
  overflow-y: auto; /* enable scrolling inside post detail */
  -webkit-overflow-scrolling: touch; /* smooth scrolling on iOS */
  /* Keep clear of the two-tier app header (status shelf + branding) */
  padding-top: calc(28px + env(safe-area-inset-top, 0px) + 56px);
}

.post-detail-container.slide-in {
  transform: translateX(0) !important;
}

.post-detail-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2a2a2a;
  background: #1a1a1a;
}

.back-button {
  background: none;
  border: none;
  color: #e7e9ea;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  margin-right: 16px;
  transition: background-color 0.2s;
}

.back-button:hover {
  background-color: #1e1e1e;
}

.back-button svg {
  width: 20px;
  height: 20px;
}

.post-detail-header h2 {
  color: #e7e9ea;
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.loading-post {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  color: #71767b;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #2a2a2a;
  border-top: 3px solid #1d9bf0;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.main-post {
  border-bottom: 1px solid #2a2a2a;
}

.comment-form-section {
  padding: 16px;
  border-bottom: 1px solid #2a2a2a;
  background: #1a1a1a;
}

.comment-form-header {
  display: flex;
  gap: 12px;
}

.comment-form-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

.comment-form-content {
  flex: 1;
}

.comment-textarea {
  width: 100%;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #e7e9ea;
  font-size: 20px;
  resize: none;
  outline: none;
  min-height: 60px;
  font-family: inherit;
  padding: 12px;
}

.comment-textarea::placeholder {
  color: #71767b;
}

.comment-textarea:focus {
  border-color: #1d9bf0;
  box-shadow: 0 0 0 1px #1d9bf0;
}

.comment-form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.comment-submit-btn {
  background: #1d9bf0;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.comment-submit-btn:hover:not(:disabled) {
  background: #1a8cd8;
}

.comment-submit-btn:disabled {
  background: #2a2a2a;
  color: #71767b;
  cursor: not-allowed;
}

.comments-section {
  padding: 0 16px;
  background: #1a1a1a;
}

.loading-comments, .no-comments {
  padding: 32px 0;
  text-align: center;
  color: #71767b;
}

.comments-list {
  padding: 16px 0;
}

.comment {
  padding: 16px 0;
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

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 12px;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
}

.user-details strong {
  color: #e7e9ea;
  font-size: 15px;
  margin-right: 8px;
}

.user-details span {
  color: #71767b;
  font-size: 15px;
}

.comment-time {
  color: #71767b;
  font-size: 13px;
}

.comment-content {
  color: #e7e9ea;
  font-size: 15px;
  line-height: 1.4;
  margin-left: 44px;
}

/* Tweet styles (reusing from main.css) */
.tweet {
  padding: 12px 0;
  border-bottom: 1px solid #2a2a2a;
  transition: background-color 0.2s;
  width: 100%;
  margin: 0;
}

.tweet:hover {
  background-color: #1e1e1e;
}

.tweet-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  padding: 0 20px;
}

.tweet-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tweet-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

.tweet-user-details {
  display: flex;
  flex-direction: column;
}

.tweet-name {
  color: #e7e9ea;
  font-weight: 600;
  font-size: 15px;
}

.tweet-username {
  color: #71767b;
  font-size: 15px;
}

.tweet-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tweet-time {
  color: #71767b;
  font-size: 15px;
}

.tweet-menu-btn {
  background: none;
  border: none;
  color: #71767b;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.2s;
  font-size: 18px;
  line-height: 1;
}

.tweet-menu-btn:hover {
  background-color: #1a1a1a;
  color: #e7e9ea;
}

.tweet-content {
  margin-bottom: 12px;
  padding: 8px 20px 8px 8px;
}

.tweet-text {
  color: #e7e9ea;
  font-size: 15px;
  line-height: 1.4;
  word-wrap: break-word;
}

.tweet-image {
  max-width: 100%;
  border-radius: 12px;
  margin-top: 12px;
}

.tweet-actions {
  display: flex;
  justify-content: space-around;
  margin-top: 12px;
  padding: 12px 20px 0 0;
  border-top: 1px solid #2a2a2a;
}

.tweet-action-btn {
  background: transparent;
  border: none;
  color: #71767b;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 20px;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 400;
}

.tweet-action-btn:hover {
  background: rgba(29, 155, 240, 0.1);
}

.tweet-action-btn.like-btn:hover {
  background: rgba(249, 24, 128, 0.1);
  color: #f91880;
}

.tweet-action-btn.dislike-btn:hover {
  background: rgba(244, 33, 46, 0.1);
  color: #f4212e;
}

.tweet-action-btn.active {
  color: #1d9bf0;
}

.tweet-action-icon {
  width: 18px;
  height: 18px;
  transition: all 0.2s ease;
}

.tweet-action-btn.active .tweet-action-icon {
  fill: currentColor;
}

.tweet-action-btn.like-btn.active {
  color: #f91880;
}

.tweet-action-btn.dislike-btn.active {
  color: #f4212e;
}

.tweet-action-count {
  font-size: 13px;
  color: #71767b;
}

.tweet-menu-dropdown {
  position: absolute;
  background: #16181c;
  border: 1px solid #2f3336;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  min-width: 180px;
  overflow: hidden;
  margin-top: 4px;
}

.tweet-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: #ffffff;
  text-align: left;
  cursor: pointer;
  font-size: 15px;
  font-weight: 400;
  transition: background-color 0.2s;
  border-bottom: 1px solid #2f3336;
}

.tweet-menu-item:last-child {
  border-bottom: none;
}

.tweet-menu-item:hover {
  background: #16181c;
}

.tweet-menu-item.delete {
  color: #f4212e;
}

.tweet-menu-item.delete:hover {
  background: rgba(244, 33, 46, 0.1);
}

.tweet-menu-item.disabled {
  color: #71767b;
  cursor: not-allowed;
  opacity: 0.6;
}

.tweet-menu-item.disabled:hover {
  background: transparent;
}

.menu-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tweet-edit-form {
  margin: 12px 0;
}

.tweet-edit-textarea {
  width: 100%;
  background: transparent;
  border: 1px solid #2f3336;
  border-radius: 8px;
  color: #e7e9ea;
  font-size: 15px;
  padding: 12px;
  resize: none;
  outline: none;
  min-height: 80px;
  font-family: inherit;
}

.tweet-edit-textarea:focus {
  border-color: #1d9bf0;
}

.tweet-edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}

.tweet-save-btn {
  background: #1d9bf0;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.tweet-save-btn:hover:not(:disabled) {
  background: #1a8cd8;
}

.tweet-save-btn:disabled {
  background: #1a1a1a;
  color: #71767b;
  cursor: not-allowed;
}

.tweet-cancel-btn {
  background: transparent;
  color: #71767b;
  border: 1px solid #2f3336;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tweet-cancel-btn:hover {
  background: #1a1a1a;
  color: #e7e9ea;
}
</style>
