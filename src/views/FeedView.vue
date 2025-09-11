<template>
  <div class="feed-container" :class="{ 'feed-animating': postsStore.isFeedAnimating }">

    <div v-if="postsStore.isFeedLoading" class="loading-screen">
      <p>Загрузка постов...</p>
    </div>

    <div v-else>
      <div v-for="post in postsStore.posts" :key="post.id" class="tweet">
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
        <div class="tweet-content" @click="openPostDetail(post.id)">
          <div v-if="editingPost === post.id" class="tweet-edit-form" @click.stop>
            <textarea v-model="editPostText" class="tweet-edit-textarea" placeholder="Редактировать пост..."></textarea>
            <div class="tweet-edit-actions">
              <button @click="saveEdit(post.id)" :disabled="!editPostText.trim()" class="tweet-save-btn">Сохранить</button>
              <button @click="cancelEdit" class="tweet-cancel-btn">Отмена</button>
            </div>
          </div>
          <div v-else class="tweet-text">
            <div v-if="postsStore.shouldTruncatePost(post.text) && !postsStore.isPostExpanded(post.id)" 
                 v-html="getTruncatedPostContent(post)"></div>
            <div v-else v-html="getPostContent(post)"></div>
            
            <!-- Show More/Less Button -->
            <div v-if="postsStore.shouldTruncatePost(post.text)" class="show-more-container" @click.stop>
              <button @click="toggleShowMore(post.id)" class="show-more-btn">
                {{ postsStore.isPostExpanded(post.id) ? 'Показать меньше' : 'Показать больше' }}
              </button>
            </div>
          </div>
          <img v-if="post.image_url" :src="post.image_url" class="tweet-image">
        </div>

        <!-- Tweet Actions -->
        <div class="tweet-actions">
          <button @click="openPostDetail(post.id)" class="tweet-action-btn comment-btn">
            <svg class="tweet-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="tweet-action-count">{{ getCommentCount(post) }}</span>
          </button>
          <button @click="postsStore.toggleReaction(post.id, 'like')" :class="['tweet-action-btn', 'like-btn', { active: hasUserReacted(post, 'like') }]">
            <svg class="tweet-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span class="tweet-action-count">{{ countReactions(post, 'like') }}</span>
          </button>
          <button @click="postsStore.toggleReaction(post.id, 'dislike')" :class="['tweet-action-btn', 'dislike-btn', { active: hasUserReacted(post, 'dislike') }]">
            <svg class="tweet-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l18 18M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span class="tweet-action-count">{{ countReactions(post, 'dislike') }}</span>
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
      <p v-if="postsStore.posts.length === 0">В ленте пока нет записей. Стань первым!</p>
    </div>

    <div v-if="postsStore.isLoadingMore" class="loading-more">
      <p>Загрузка старых постов...</p>
    </div>
    <div v-if="!postsStore.hasMorePosts && !postsStore.isFeedLoading" class="loading-more">
      <p>Вы посмотрели все записи.</p>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { usePostsStore } from '@/stores/posts';
import { useUserStore } from '@/stores/user';
import { supabase } from '@/supabase';

const router = useRouter();
const postsStore = usePostsStore();
const userStore = useUserStore();

const newPostText = ref('');
const isPosting = ref(false);
const selectedFile = ref(null);
const imagePreviewUrl = ref(null);
const showPostMenu = ref(null);
const editingPost = ref(null);
const editPostText = ref('');
const refreshInterval = ref(null);

const handleScroll = (event) => {
  const { scrollTop, scrollHeight, clientHeight } = event.target;
  if (scrollHeight - scrollTop - clientHeight < 300) {
    postsStore.loadMorePosts();
  }
};

const handleClickOutside = (event) => {
  if (!event.target.closest('.tweet-menu-btn') && !event.target.closest('.tweet-menu-dropdown')) {
    showPostMenu.value = null;
  }
};

onMounted(() => {
  // Stop feed animation when returning to feed
  console.log('Stopping feed animation...');
  postsStore.stopFeedAnimation();
  console.log('Feed animating:', postsStore.isFeedAnimating);
  
  // Only load posts if it's the initial load
  if (postsStore.shouldLoadFeed()) {
  postsStore.loadPosts();
  } else {
    // Restore scroll position if returning from post detail
    // Use nextTick to ensure DOM is fully rendered
    nextTick(() => {
      postsStore.restoreScrollPosition();
    });
  }
  
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.addEventListener('scroll', handleScroll);
  }
  document.addEventListener('click', handleClickOutside);
  
  // Auto-refresh posts every 10 seconds (silent background refresh)
  refreshInterval.value = setInterval(async () => {
    try {
      await postsStore.silentRefresh();
    } catch (error) {
      console.error('Silent refresh error:', error);
    }
  }, 5000);
});

onUnmounted(() => {
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.removeEventListener('scroll', handleScroll);
  }
  document.removeEventListener('click', handleClickOutside);
  
  // Clear the refresh interval
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value);
  }
});

const onFileChange = (event) => {
  const file = event.target.files[0];
  if (file) {
    selectedFile.value = file;
    imagePreviewUrl.value = URL.createObjectURL(file);
  }
};

const removeImage = () => {
  selectedFile.value = null;
  imagePreviewUrl.value = null;
  document.getElementById('file-upload').value = '';
};

const handlePostSubmit = async () => {
  isPosting.value = true;
  const success = await postsStore.submitPost(newPostText.value, selectedFile.value);
  if (success) {
    newPostText.value = '';
    removeImage();
  }
  isPosting.value = false;
};

const openPostDetail = (postId) => {
  // Save current scroll position before navigating
  postsStore.saveScrollPosition();
  console.log('Starting feed animation...');
  postsStore.startFeedAnimation();
  console.log('Feed animating:', postsStore.isFeedAnimating);
  router.push(`/post/${postId}`);
};

const openCompose = () => {
  // Save position and open compose route
  postsStore.saveScrollPosition();
  router.push('/compose');
};

const getPostAuthor = (post) => post.text.match(/^(.*?)\s\(@(.*?)\):/)?.[1] || 'Пользователь';
const getPostContent = (post) => {
  let content = post.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '');
  
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

const getTruncatedPostContent = (post) => {
  let content = post.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '');
  
  // Truncate the content
  const truncatedContent = postsStore.getTruncatedText(content);
  
  // Convert mentions to clickable links
  content = truncatedContent.replace(/@(\w+)/g, '<span class="mention" onclick="handleMentionClick(\'$1\')">@$1</span>');
  
  // Convert hashtags to clickable links
  content = content.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  
  // Convert URLs to clickable links
  content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="post-link">$1</a>');
  
  // Convert line breaks
  content = content.replace(/\n/g, '<br>');
  
  return content;
};

const toggleShowMore = (postId) => {
  postsStore.togglePostExpansion(postId);
};
const getTimeAgo = (date) => {
    if (!date) return 'недавно';
    
    const now = new Date();
    const postDate = new Date(date);
    
    // Check if date is valid
    if (isNaN(postDate.getTime())) {
        return 'недавно';
    }
    
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
  } else if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return 'U';
};
const countReactions = (post, type) => post.reactions.filter(r => r.type === type).length;
const hasUserReacted = (post, type) => {
  const userId = userStore.userData?.telegram_username;
  return post.reactions.some(r => r.user_id === userId && r.type === type);
};

// Post editing and deletion functions
const isOwnPost = (post) => {
  const userId = userStore.userData?.telegram_username;
  return post.user_id === userId;
};

const getCommentCount = (post) => {
  return post.comment_count || 0;
};

const togglePostMenu = (postId) => {
  showPostMenu.value = showPostMenu.value === postId ? null : postId;
};

const editPost = (post) => {
  editingPost.value = post.id;
  editPostText.value = post.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '');
  showPostMenu.value = null;
};

const saveEdit = async (postId) => {
  if (!editPostText.value.trim()) return;
  
  const success = await postsStore.updatePost(postId, editPostText.value);
  if (success) {
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
    await postsStore.deletePost(postId);
    showPostMenu.value = null;
  }
};

// Handle mention clicks
const handleMentionClick = (username) => {
  // Filter posts to show only those mentioning this user
  const originalPosts = postsStore.posts;
  const mentionedPosts = originalPosts.filter(post => 
    post.text.toLowerCase().includes(`@${username.toLowerCase()}`)
  );
  
  if (mentionedPosts.length > 0) {
    // Temporarily show only posts mentioning this user
    postsStore.posts = mentionedPosts;
    
    // Show a message and restore after 5 seconds
    setTimeout(() => {
      postsStore.loadPosts(); // Reload all posts
    }, 5000);
    
    // Show notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #1d9bf0;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 1000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.textContent = `Показаны посты с упоминанием @${username}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 5000);
  } else {
    alert(`Нет постов с упоминанием @${username}`);
  }
};

// Make handleMentionClick available globally for onclick handlers
window.handleMentionClick = handleMentionClick;
</script>

<style scoped>
/* All styles moved to main.css for consistency */
</style>