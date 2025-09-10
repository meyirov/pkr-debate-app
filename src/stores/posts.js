// src/stores/posts.js
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/supabase';
import { useUserStore } from './user';

export const usePostsStore = defineStore('posts', () => {
  const posts = ref([]);
  const isFeedLoading = ref(true);
  const isLoadingMore = ref(false);
  const hasMorePosts = ref(true);

  const loadPosts = async () => {
    isFeedLoading.value = true;
    hasMorePosts.value = true;
    const { data, error } = await supabase
      .from('posts')
      .select('*, reactions(*)')
      .order('id', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('Ошибка загрузки постов:', error);
    } else {
      posts.value = data;
      if (data.length < 20) {
        hasMorePosts.value = false;
      }
    }
    isFeedLoading.value = false;
  };

  const loadMorePosts = async () => {
    if (isLoadingMore.value || !hasMorePosts.value) return;

    isLoadingMore.value = true;
    const lastPostId = posts.value[posts.value.length - 1]?.id;
    if (!lastPostId) {
      isLoadingMore.value = false;
      return;
    }

    const { data, error } = await supabase
      .from('posts')
      .select('*, reactions(*)')
      .order('id', { ascending: false })
      .lt('id', lastPostId)
      .limit(20);

    if (error) {
      console.error('Ошибка подгрузки постов:', error);
    } else if (data && data.length > 0) {
      posts.value.push(...data);
      if (data.length < 20) {
        hasMorePosts.value = false;
      }
    } else {
      hasMorePosts.value = false;
    }
    isLoadingMore.value = false;
  };

  const uploadPostImage = async (file) => {
    if (!file) return null;
    const userStore = useUserStore();
    const userId = userStore.userData?.telegram_username;
    if (!userId) return null;
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from('post-images').upload(fileName, file);
    if (error) {
      console.error('Ошибка загрузки изображения:', error);
      return null;
    }
    const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const submitPost = async (postText, file) => {
    const userStore = useUserStore();
    if ((!postText.trim() && !file) || !userStore.userData) return false;
    let imageUrl = null;
    if (file) {
      imageUrl = await uploadPostImage(file);
      if (!imageUrl) {
        alert('Не удалось загрузить изображение. Пост не будет опубликован.');
        return false;
      }
    }
    const postContent = `${userStore.userData.fullname} (@${userStore.userData.telegram_username}):\n${postText.trim()}`;
    const { error } = await supabase
      .from('posts')
      .insert({ text: postContent, user_id: userStore.userData.telegram_username, image_url: imageUrl });
    if (error) {
      alert('Ошибка при публикации: ' + error.message);
      return false;
    }
    await loadPosts();
    return true;
  };

  const toggleReaction = async (postId, type) => {
    const userStore = useUserStore();
    const userId = userStore.userData?.telegram_username;
    if (!userId) return console.error("Пользователь не определён для реакции");
    const postIndex = posts.value.findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    const post = posts.value[postIndex];
    const existingReaction = post.reactions.find(r => r.user_id === userId);
    if (existingReaction) {
      if (existingReaction.type === type) {
        post.reactions = post.reactions.filter(r => r.user_id !== userId);
      } else {
        existingReaction.type = type;
      }
    } else {
      post.reactions.push({ id: Date.now(), post_id: postId, user_id: userId, type });
    }
    try {
      if (existingReaction) {
        if (existingReaction.type !== type) {
           await supabase.from('reactions').update({ type }).eq('user_id', userId).eq('post_id', postId);
        } else {
           await supabase.from('reactions').delete().eq('user_id', userId).eq('post_id', postId);
        }
      } else {
        await supabase.from('reactions').insert({ post_id: postId, user_id: userId, type });
      }
      const { data: updatedPost } = await supabase.from('posts').select('*, reactions(*)').eq('id', postId).single();
      if(updatedPost) posts.value[postIndex] = updatedPost;
    } catch (error) {
      console.error("Ошибка при обновлении реакции в Supabase:", error);
      loadPosts(); 
    }
  };

  const addComment = async (postId, commentText) => {
    const userStore = useUserStore();
    const user = userStore.userData;
    if (!user) return false;
    const fullCommentText = `${user.fullname} (@${user.telegram_username}):\n${commentText.trim()}`;
    const { error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: user.telegram_username, text: fullCommentText });
    if (error) {
      alert('Не удалось отправить комментарий: ' + error.message);
      return false;
    }
    return true;
  };

  return { 
    posts, isFeedLoading, loadPosts, submitPost, toggleReaction, addComment,
    isLoadingMore, hasMorePosts, loadMorePosts 
  };
});