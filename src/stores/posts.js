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
  const scrollPosition = ref(0);
  const isInitialLoad = ref(true);
  
  // State for post expansion
  const expandedPosts = ref(new Set());
  
  // State for feed animation
  const isFeedAnimating = ref(false);

  const loadPosts = async () => {
    isFeedLoading.value = true;
    hasMorePosts.value = true;
    
    // First, load posts with reactions
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        reactions(*)
      `)
      .order('id', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('Ошибка загрузки постов:', error);
      isFeedLoading.value = false;
      return;
    }
    
    // Set posts immediately for faster UI response
    posts.value = data.map(post => ({ ...post, comment_count: 0 }));
    
    // Then load comment counts in background (non-blocking)
    if (data.length > 0) {
      const postIds = data.map(post => post.id);
      
      // Get all comment counts in one query
      const { data: commentCounts } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);
      
      // Count comments per post
      const counts = {};
      commentCounts?.forEach(comment => {
        counts[comment.post_id] = (counts[comment.post_id] || 0) + 1;
      });
      
      // Update posts with comment counts
      posts.value = data.map(post => ({
        ...post,
        comment_count: counts[post.id] || 0
      }));
    }
    
    if (data.length < 20) {
      hasMorePosts.value = false;
    }
    isFeedLoading.value = false;
    isInitialLoad.value = false;
  };

  const silentRefresh = async () => {
    // Silent background refresh without showing loading state
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        reactions(*)
      `)
      .order('id', { ascending: false })
      .limit(20);

    if (error || !data) return;

    // Fetch comment counts for fetched posts in one query
    const fetchedIds = data.map(p => p.id);
    const { data: commentRows } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', fetchedIds);

    const countByPostId = {};
    commentRows?.forEach(row => {
      countByPostId[row.post_id] = (countByPostId[row.post_id] || 0) + 1;
    });

    const fetchedWithCounts = data.map(post => ({
      ...post,
      comment_count: countByPostId[post.id] || 0
    }));

    // Merge into existing posts without dropping older ones
    const currentPosts = posts.value.slice();
    if (currentPosts.length === 0) {
      posts.value = fetchedWithCounts;
      return;
    }

    const indexById = new Map(currentPosts.map((p, idx) => [p.id, idx]));
    const newItems = [];

    for (const post of fetchedWithCounts) {
      const idx = indexById.get(post.id);
      if (idx !== undefined) {
        currentPosts[idx] = { ...currentPosts[idx], ...post };
      } else {
        newItems.push(post);
      }
    }

    // Prepend new items (keep descending order by id)
    newItems.sort((a, b) => b.id - a.id);
    posts.value = [...newItems, ...currentPosts];
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
      .select(`
        *,
        reactions(*)
      `)
      .order('id', { ascending: false })
      .lt('id', lastPostId)
      .limit(20);

    if (error) {
      console.error('Ошибка подгрузки постов:', error);
    } else if (data && data.length > 0) {
      // Get comment counts for each post
      const postsWithComments = await Promise.all(
        data.map(async (post) => {
          const { count } = await supabase
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id);
          
          return {
            ...post,
            comment_count: count || 0
          };
        })
      );
      
      posts.value.push(...postsWithComments);
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

  const sendTelegramNotification = async (mentionedUsername, mentionedBy, postText, postId) => {
    // For now, just log the mention - you can implement the actual notification later
    console.log(`📢 Mention detected: @${mentionedUsername} mentioned by @${mentionedBy}`);
    console.log(`📝 Post content: ${postText.substring(0, 100)}...`);
    
    // TODO: Implement actual Telegram notification
    // You can either:
    // 1. Use the Edge Function approach (requires deployment)
    // 2. Use a webhook endpoint in your bot
    // 3. Use a third-party service like Zapier
    
    // For now, we'll just create the database record and log the mention
    // The actual notification can be implemented later when you're ready
  };

  const processMentions = async (text, postId) => {
    const userStore = useUserStore();
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const mentions = text.match(mentionRegex) || [];
    
    for (const mention of mentions) {
      const username = mention.slice(1); // Remove @ symbol
      
      // Create notification record (optional - table might not exist yet)
      try {
        const { error } = await supabase
          .from('tag_notifications')
          .insert({
            tagged_username: username,
            post_id: postId,
            user_id: userStore.userData.telegram_username,
            text: text,
            timestamp: new Date().toISOString()
          });
        
        if (error) {
          console.warn('Tag notifications table not available:', error.message);
          // Continue anyway - this is optional
        } else {
          console.log('✅ Mention logged in database for @' + username);
        }
      } catch (error) {
        console.warn('Tag notifications system not available:', error.message);
        // Continue anyway - this is optional
      }
      
      // Send notification to mentioned user via direct API call
      try {
        await sendTelegramNotification(username, userStore.userData.telegram_username, text, postId);
      } catch (error) {
        console.warn('Telegram notification failed:', error.message);
        // Don't throw error - just log it as a warning
      }
    }
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
    const { data, error } = await supabase
      .from('posts')
      .insert({ text: postContent, user_id: userStore.userData.telegram_username, image_url: imageUrl })
      .select()
      .single();
    
    if (error) {
      alert('Ошибка при публикации: ' + error.message);
      return false;
    }
    
    // Add new post to the beginning of the list immediately
    if (data) {
      posts.value.unshift({
        ...data,
        reactions: [],
        comment_count: 0
      });
    }
    
    // Process mentions for notifications (non-blocking)
    if (data && data.id) {
      processMentions(postContent, data.id).catch(console.error);
    }
    
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
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: user.telegram_username, text: fullCommentText })
      .select()
      .single();
    
    if (error) {
      alert('Не удалось отправить комментарий: ' + error.message);
      return false;
    }
    
    // Update comment count immediately in local state
    const postIndex = posts.value.findIndex(p => p.id === postId);
    if (postIndex !== -1) {
      posts.value[postIndex].comment_count = (posts.value[postIndex].comment_count || 0) + 1;
    }
    
    // Process mentions in comments for notifications
    if (data && data.id) {
      await processMentions(fullCommentText, data.id);
    }
    
    return true;
  };

  const updatePost = async (postId, newText) => {
    const userStore = useUserStore();
    const user = userStore.userData;
    if (!user) return false;
    
    const postIndex = posts.value.findIndex(p => p.id === postId);
    if (postIndex === -1) return false;
    
    const post = posts.value[postIndex];
    const updatedText = `${user.fullname} (@${user.telegram_username}):\n${newText.trim()}`;
    
    const { error } = await supabase
      .from('posts')
      .update({ text: updatedText })
      .eq('id', postId)
      .eq('user_id', user.telegram_username);
    
    if (error) {
      alert('Не удалось обновить пост: ' + error.message);
      return false;
    }
    
    // Update local state
    posts.value[postIndex].text = updatedText;
    return true;
  };

  const deletePost = async (postId) => {
    const userStore = useUserStore();
    const user = userStore.userData;
    if (!user) return false;
    
    try {
      // Use Promise.all to delete related data in parallel for better performance
      const deletePromises = [
        // Delete reactions
        supabase
          .from('reactions')
          .delete()
          .eq('post_id', postId)
          .then(({ error }) => {
            if (error) console.warn('Ошибка удаления реакций:', error);
          }),
        
        // Delete comments
        supabase
          .from('comments')
          .delete()
          .eq('post_id', postId)
          .then(({ error }) => {
            if (error) console.warn('Ошибка удаления комментариев:', error);
          }),
        
        // Delete tag notifications (optional - table might not exist)
        supabase
          .from('tag_notifications')
          .delete()
          .eq('post_id', postId)
          .then(({ error }) => {
            if (error) console.warn('Tag notifications table not available:', error.message);
          })
          .catch((error) => {
            console.warn('Tag notifications system not available:', error.message);
          })
      ];
      
      // Wait for all related deletions to complete
      await Promise.all(deletePromises);
      
      // Finally, delete the post itself
      const { error: postError } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.telegram_username);
      
      if (postError) {
        alert('Не удалось удалить пост: ' + postError.message);
        return false;
      }
      
      // Remove from local state
      posts.value = posts.value.filter(p => p.id !== postId);
      console.log('✅ Пост успешно удален вместе с реакциями и комментариями');
      return true;
      
    } catch (error) {
      console.error('Ошибка при удалении поста:', error);
      alert('Произошла ошибка при удалении поста: ' + error.message);
      return false;
    }
  };

  // Save scroll position when navigating away from feed
  const saveScrollPosition = () => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      scrollPosition.value = mainContent.scrollTop;
    } else {
      scrollPosition.value = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    console.log('Saved scroll position:', scrollPosition.value);
  };

  // Restore scroll position when returning to feed
  const restoreScrollPosition = () => {
    if (scrollPosition.value > 0) {
      console.log('Restoring scroll position:', scrollPosition.value);
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = scrollPosition.value;
        } else {
          window.scrollTo(0, scrollPosition.value);
          document.documentElement.scrollTop = scrollPosition.value;
          document.body.scrollTop = scrollPosition.value;
        }
      }, 100);
    }
  };

  // Get post by ID from current feed (for preloading)
  const getPostById = (postId) => {
    return posts.value.find(post => post.id === parseInt(postId));
  };

  // Check if feed needs to be loaded (only on initial app load)
  const shouldLoadFeed = () => {
    return isInitialLoad.value && posts.value.length === 0;
  };

  // Clear scroll position (useful for new posts or resets)
  const clearScrollPosition = () => {
    scrollPosition.value = 0;
  };

  // Post expansion functions
  const togglePostExpansion = (postId) => {
    if (expandedPosts.value.has(postId)) {
      expandedPosts.value.delete(postId);
    } else {
      expandedPosts.value.add(postId);
    }
  };

  const isPostExpanded = (postId) => {
    return expandedPosts.value.has(postId);
  };

  const shouldTruncatePost = (postText, maxLength = 280) => {
    return postText && postText.length > maxLength;
  };

  const getTruncatedText = (postText, maxLength = 280) => {
    if (!postText || postText.length <= maxLength) return postText;
    return postText.substring(0, maxLength) + '...';
  };

  // Feed animation functions
  const startFeedAnimation = () => {
    isFeedAnimating.value = true;
  };

  const stopFeedAnimation = () => {
    isFeedAnimating.value = false;
  };

  return { 
    posts, isFeedLoading, loadPosts, submitPost, toggleReaction, addComment,
    isLoadingMore, hasMorePosts, loadMorePosts, updatePost, deletePost, silentRefresh,
    scrollPosition, isInitialLoad, saveScrollPosition, restoreScrollPosition, 
    getPostById, shouldLoadFeed, clearScrollPosition,
    expandedPosts, togglePostExpansion, isPostExpanded, shouldTruncatePost, getTruncatedText,
    isFeedAnimating, startFeedAnimation, stopFeedAnimation
  };
});