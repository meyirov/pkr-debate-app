<template>
  <div>
    <div class="new-post-form">
      <textarea v-model="newPostText" placeholder="Что нового?"></textarea>
      
      <div class="form-actions">
        <label for="file-upload" class="file-upload-label">
          📷 Добавить фото
        </label>
        <input id="file-upload" type="file" @change="onFileChange" accept="image/*" style="display: none;">
      </div>
      <div v-if="imagePreviewUrl" class="image-preview">
        <img :src="imagePreviewUrl" alt="Предпросмотр">
        <button @click="removeImage" class="remove-image-btn">×</button>
      </div>

      <button @click="handlePostSubmit" :disabled="isPosting">
        {{ isPosting ? 'Публикация...' : 'Твитнуть' }}
      </button>
    </div>

    <div v-if="postsStore.isFeedLoading" class="loading-screen">
      <p>Загрузка постов...</p>
    </div>

    <div v-else>
      <div v-for="post in postsStore.posts" :key="post.id" class="post">
        <div class="post-header">
          <div class="post-user">
            <strong>{{ getPostAuthor(post) }}</strong>
            <span>@{{ post.user_id }}</span>
          </div>
          <div class="post-time">{{ getTimeAgo(post.timestamp) }}</div>
        </div>
        <div class="post-content" v-html="getPostContent(post)"></div>
        <img v-if="post.image_url" :src="post.image_url" class="post-image">
        
        <div class="post-actions">
          <button @click="postsStore.toggleReaction(post.id, 'like')" :class="['reaction-btn', { active: hasUserReacted(post, 'like') }]">
            👍 {{ countReactions(post, 'like') }}
          </button>
          <button @click="postsStore.toggleReaction(post.id, 'dislike')" :class="['reaction-btn', { active: hasUserReacted(post, 'dislike') }]">
            👎 {{ countReactions(post, 'dislike') }}
          </button>
          <button @click="toggleComments(post.id)" class="reaction-btn">
             💬 Комментарии
          </button>
        </div>
        
        <CommentSection v-if="commentsVisibleForPost === post.id" :post-id="post.id" />
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
import { ref, onMounted, onUnmounted } from 'vue';
import { usePostsStore } from '@/stores/posts';
import { useUserStore } from '@/stores/user';
import CommentSection from '@/components/CommentSection.vue';

const postsStore = usePostsStore();
const userStore = useUserStore();

const newPostText = ref('');
const isPosting = ref(false);
const commentsVisibleForPost = ref(null);
const selectedFile = ref(null);
const imagePreviewUrl = ref(null);

const handleScroll = (event) => {
  const { scrollTop, scrollHeight, clientHeight } = event.target;
  if (scrollHeight - scrollTop - clientHeight < 300) {
    postsStore.loadMorePosts();
  }
};

onMounted(() => {
  postsStore.loadPosts();
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.addEventListener('scroll', handleScroll);
  }
});

onUnmounted(() => {
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.removeEventListener('scroll', handleScroll);
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

const toggleComments = (postId) => {
  if (commentsVisibleForPost.value === postId) {
    commentsVisibleForPost.value = null;
  } else {
    commentsVisibleForPost.value = postId;
  }
};

const getPostAuthor = (post) => post.text.match(/^(.*?)\s\(@(.*?)\):/)?.[1] || 'Пользователь';
const getPostContent = (post) => post.text.replace(/^(.*?)\s\(@(.*?)\):\s?/, '').replace(/\n/g, '<br>');
const getTimeAgo = (date) => {
    const diffInSeconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds} сек.`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} мин.`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} ч.`;
    return `${Math.floor(diffInHours / 24)} д.`;
};
const countReactions = (post, type) => post.reactions.filter(r => r.type === type).length;
const hasUserReacted = (post, type) => {
  const userId = userStore.userData?.telegram_username;
  return post.reactions.some(r => r.user_id === userId && r.type === type);
};
</script>

<style scoped>
.loading-screen, .loading-more { padding: 20px; text-align: center; color: #888; }
.post-actions {
    border-top: 1px solid #2c2c2c;
    margin-top: 15px;
    padding-top: 10px;
}
.form-actions { margin-bottom: 10px; }
.image-preview {
  position: relative; margin-bottom: 10px; max-width: 150px;
}
.image-preview img { width: 100%; height: auto; border-radius: 8px; }
.remove-image-btn {
  position: absolute; top: -10px; right: -10px;
  background: rgba(0, 0, 0, 0.7); color: white; border: none;
  border-radius: 50%; width: 24px; height: 24px; font-size: 16px;
  cursor: pointer; line-height: 24px; text-align: center;
}
</style>