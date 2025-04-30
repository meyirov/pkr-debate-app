console.log('script.js loaded, version: 2025-04-30');

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const tg = window.Telegram.WebApp;
tg.ready();

const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN'; // Замени на свой токен

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
const notificationContainer = document.getElementById('notification-container');
const regFullname = document.getElementById('reg-fullname');
const submitProfileRegBtn = document.getElementById('submit-profile-reg-btn');
let userData = {};
let postsCache = [];
let lastPostId = null;
let currentTournamentId = null;
let isPostsLoaded = false;
let isLoadingMore = false;
let newPostsCount = 0;
let channel = null;
let commentChannels = new Map();
let reactionChannels = new Map();
let commentsCache = new Map();
let lastCommentIds = new Map();
let newCommentsCount = new Map();

async function supabaseFetch(endpoint, method, body = null, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
                method: method,
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': method === 'POST' || method === 'PATCH' ? 'return=representation' : undefined
                },
                body: body ? JSON.stringify(body) : null
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Supabase error: ${response.status} - ${errorText}`);
            }
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } catch (error) {
            if (attempt === retries) throw error;
            console.warn(`Retrying request (${attempt}/${retries})...`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

async function getChatId(telegramUsername) {
    try {
        const profiles = await supabaseFetch(`profiles?telegram_username=eq.${telegramUsername}`, 'GET');
        console.log('getChatId profiles:', profiles);
        if (profiles && profiles.length > 0 && profiles[0].chat_id) {
            return profiles[0].chat_id;
        }
        return null;
    } catch (error) {
        console.error('Error fetching chat ID:', error);
        return null;
    }
}

async function updateChatId(telegramUsername, chatId) {
    try {
        const response = await supabaseFetch(`profiles?telegram_username=eq.${telegramUsername}`, 'PATCH', {
            chat_id: chatId
        });
        console.log('updateChatId response:', response);
    } catch (error) {
        console.error('Error updating chat ID:', error);
    }
}

async function sendTelegramNotification(chatId, message) {
    try {
        console.log('Sending Telegram message to:', chatId);
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        const data = await response.json();
        if (!data.ok) {
            throw new Error(`Telegram API error: ${data.description}`);
        }
        console.log('Telegram notification sent:', data);
        return data;
    } catch (error) {
        console.error('Error sending Telegram notification:', error);
        return null;
    }
}

async function notifyUser(telegramUsername, message) {
    console.log('Attempting to notify:', telegramUsername);
    let chatId = await getChatId(telegramUsername);
    if (!chatId) {
        console.log('No chat ID found, sending temp message to:', '@' + telegramUsername);
        const tempMessage = await sendTelegramNotification('@' + telegramUsername, 'Please start the bot to receive notifications.');
        if (tempMessage && tempMessage.chat && tempMessage.chat.id) {
            chatId = tempMessage.chat.id;
            console.log('Received chat ID:', chatId);
            await updateChatId(telegramUsername, chatId);
        } else {
            console.warn('Failed to get chat ID from temp message:', tempMessage);
            return;
        }
    }
    console.log('Sending notification to chat ID:', chatId);
    const result = await sendTelegramNotification(chat "Ratchet up the intensity! Let's get those notifications firing! 🚀")
Id, message);
    console.log('Notification result:', result);
}

function showNotification(message) {
    console.log('Showing notification:', message);
    const notification = document.createElement('div');
    notification.classList.add('notification');
    notification.textContent = message;
    notificationContainer.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('visible');
    }, 100);
    setTimeout(() => {
        notification.classList.remove('visible');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

async function uploadImage(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { data, error } = await supabaseClient.storage
        .from('post-images')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });
    if (error) {
        throw new Error(`Ошибка загрузки изображения: ${error.message}`);
    }
    const { data: urlData } = supabaseClient.storage
        .from('post-images')
        .getPublicUrl(fileName);
    return urlData.publicUrl;
}

async function checkProfile() {
    console.log('checkProfile started');
    const telegramUsername = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.username : null;
    if (!telegramUsername) {
        alert('Telegram username недоступен! Укажите username в настройках Telegram.');
        return;
    }
    userData.telegramUsername = telegramUsername;
    try {
        const profiles = await supabaseFetch(`profiles?telegram_username=eq.${telegramUsername}`, 'GET');
        console.log('Profiles fetched:', profiles);
        if (profiles && profiles.length > 0) {
            userData.fullname = profiles[0].fullname;
            userData.chat_id = profiles[0].chat_id;
            showApp();
        } else {
            registrationModal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking profile:', error);
        registrationModal.style.display = 'block';
    }
}

submitProfileRegBtn.addEventListener('click', async () => {
    if (!regFullname.value.trim()) {
        alert('Пожалуйста, введите имя!');
        return;
    }
    userData.fullname = regFullname.value.trim();
    try {
        await supabaseFetch('profiles', 'POST', {
            telegram_username: userData.telegramUsername,
            fullname: userData.fullname
        });
        registrationModal.style.display = 'none';
        showApp();
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Ошибка: ' + error.message);
    }
});

function showApp() {
    console.log('showApp called, userData:', userData);
    appContainer.style.display = 'block';
    notificationContainer.style.display = 'block';
    document.getElementById('username').textContent = userData.telegramUsername;
    document.getElementById('fullname').value = userData.fullname;
    console.log('Calling loadPosts');
    loadPosts();
    console.log('Calling subscribeToNewPosts');
    subscribeToNewPosts();
}

const sections = document.querySelectorAll('.content');
const buttons = document.querySelectorAll('.nav-btn');

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

buttons.forEach(button => {
    button.addEventListener('click', () => {
        buttons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        sections.forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(button.id.replace('-btn', ''));
        targetSection.classList.add('active');
        if (button.id === 'feed-btn') {
            debouncedLoadPosts();
        }
        if (button.id === 'tournaments-btn') loadTournaments();
    });
});

const debouncedLoadPosts = debounce(loadPosts, 300);

const updateProfileBtn = document.getElementById('update-profile');
updateProfileBtn.addEventListener('click', async () => {
    const newFullname = document.getElementById('fullname').value.trim();
    if (!newFullname) {
        alert('Пожалуйста, введите новое имя!');
        return;
    }
    userData.fullname = newFullname;
    try {
        await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'PATCH', {
            fullname: userData.fullname
        });
        alert('Имя обновлено!');
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Ошибка: ' + error.message);
    }
});

const postText = document.getElementById('post-text');
const postImage = document.getElementById('post-image');
const submitPost = document.getElementById('submit-post');
const postsDiv = document.getElementById('posts');
const newPostsBtn = document.createElement('button');
newPostsBtn.id = 'new-posts-btn';
newPostsBtn.className = 'new-posts-btn';
newPostsBtn.style.display = 'none';
newPostsBtn.innerHTML = 'Новые посты';
newPostsBtn.addEventListener('click', () => {
    loadNewPosts();
    newPostsBtn.style.display = 'none';
    newPostsCount = 0;
});
document.getElementById('feed').prepend(newPostsBtn);

const loadMoreBtn = document.createElement('button');
loadMoreBtn.id = 'load-more-btn';
loadMoreBtn.className = 'load-more-btn';
loadMoreBtn.innerHTML = 'Загрузить ещё';
loadMoreBtn.style.display = 'block';
loadMoreBtn.addEventListener('click', () => {
    console.log('Load more button clicked');
    loadMorePosts();
});
postsDiv.appendChild(loadMoreBtn);

async function extractMentions(text) {
    const mentionRegex = /@(\w+)(?=\s|$|[.,!?])/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
        const username = match[1];
        if (username !== userData.telegramUsername) {
            mentions.push(username);
        }
    }
    return mentions;
}

submitPost.addEventListener('click', async () => {
    const postContent = postText.value.trim();
    if (!postContent) {
        alert('Пожалуйста, введите текст поста! Пустые посты не допускаются.');
        return;
    }
    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
    console.log('Post content:', text);
    const mentions = await extractMentions(postContent);
    console.log('Extracted mentions:', mentions);
    const post = {
        text: text,
        timestamp: new Date().toISOString(),
        user_id: userData.telegramUsername
    };
    try {
        if (postImage.files.length > 0) {
            const imageUrl = await uploadImage(postImage.files[0]);
            post.image_url = imageUrl;
        }
        const newPost = await supabaseFetch('posts', 'POST', post);
        postText.value = '';
        postImage.value = '';
        if (!postsCache.some(p => p.id === newPost[0].id)) {
            postsCache.unshift(newPost[0]);
            sortPostsCache();
            if (isUserAtTop()) {
                renderNewPost(newPost[0], true);
            } else {
                newPostsCount++;
                newPostsBtn.style.display = 'block';
                newPostsBtn.classList.add('visible');
            }
            lastPostId = postsCache[0].id;
        }
        if (mentions.length > 0) {
            console.log('Sending notifications for mentions:', mentions);
            for (const username of mentions) {
                const message = `[@${userData.telegramUsername}](tg://user?id=${userData.chat_id || ''}) упомянул вас в посте:\n${postContent.substring(0, 100)}${postContent.length > 100 ? '...' : ''}`;
                await notifyUser(username, message);
                showNotification(`Уведомлен @${username}`);
            }
        } else {
            console.log('No mentions found in post');
        }
    } catch (error) {
        console.error('Error saving post:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadPosts() {
    console.log('loadPosts started, isPostsLoaded:', isPostsLoaded);
    if (isPostsLoaded) {
        console.log('Posts already loaded, rendering from cache');
        renderPosts();
        return;
    }
    const loadingIndicator = document.getElementById('posts-loading');
    console.log('Loading indicator:', loadingIndicator);
    loadingIndicator.style.display = 'block';
    try {
        postsCache = [];
        console.log('Fetching initial posts from Supabase');
        const posts = await supabaseFetch('posts?order=id.desc&limit=20', 'GET');
        console.log('Initial posts loaded:', posts);
        if (posts) {
            postsCache = posts;
            sortPostsCache();
            renderPosts();
            if (postsCache.length > 0) {
                lastPostId = postsCache[0].id;
                console.log('lastPostId set to:', lastPostId);
            }
            isPostsLoaded = true;
            console.log('Fetching total posts count');
            const totalPosts = await supabaseFetch('posts?select=id', 'GET');
            console.log('Total posts in database:', totalPosts ? totalPosts.length : 'undefined');
            loadMoreBtn.style.display = totalPosts && totalPosts.length > 20 ? 'block' : 'block';
            console.log('loadMoreBtn display set to:', loadMoreBtn.style.display);
            if (posts.length === 20) {
                console.log('Loaded 20 posts, triggering loadMorePosts');
                loadMorePosts();
            }
        } else {
            console.log('No posts returned from Supabase');
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        alert('Ошибка загрузки постов: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
        console.log('loadPosts finished');
    }
    console.log('Setting up infinite scroll');
    setupInfiniteScroll();
}

async function loadMorePosts() {
    if (isLoadingMore || postsCache.length === 0) {
        console.log('Skipping loadMorePosts: isLoadingMore=', isLoadingMore, 'postsCache.length=', postsCache.length);
        return;
    }
    isLoadingMore = true;
    const oldestPostId = postsCache[postsCache.length - 1].id;
    console.log('Attempting to load more posts, oldestPostId:', oldestPostId);
    try {
        const query = `posts?id=lt.${oldestPostId}&order=id.desc&limit=20`;
        console.log('Supabase query:', query);
        const morePosts = await supabaseFetch(query, 'GET');
        console.log('Raw response from Supabase:', morePosts);
        if (morePosts && morePosts.length > 0) {
            const newPosts = morePosts.filter(post => !postsCache.some(p => p.id === post.id));
            console.log('Filtered new posts:', newPosts);
            if (newPosts.length > 0) {
                postsCache.push(...newPosts);
                sortPostsCache();
                renderMorePosts(newPosts);
                loadMoreBtn.style.display = 'block';
                console.log('Added new posts, total in cache:', postsCache.length);
            } else {
                loadMoreBtn.style.display = 'none';
                console.log('No new posts after filtering');
            }
        } else {
            loadMoreBtn.style.display = 'none';
            console.log('No more posts returned from Supabase');
        }
    } catch (error) {
        console.error('Error in loadMorePosts:', error);
    } finally {
        isLoadingMore = false;
        console.log('Finished loadMorePosts, isLoadingMore:', isLoadingMore);
    }
}

async function loadNewPosts() {
    try {
        const newPosts = await supabaseFetch(`posts?id=gt.${lastPostId}&order=id.desc`, 'GET');
        console.log('New posts loaded:', newPosts);
        if (newPosts && newPosts.length > 0) {
            const uniqueNewPosts = newPosts.filter(post => !postsCache.some(p => p.id === post.id));
            if (uniqueNewPosts.length > 0) {
                postsCache.unshift(...uniqueNewPosts);
                sortPostsCache();
                renderNewPosts(uniqueNewPosts, true);
                lastPostId = postsCache[0].id;
            }
        }
    } catch (error) {
        console.error('Error loading new posts:', error);
    }
}

function subscribeToNewPosts() {
    if (channel) {
        supabaseClient.removeChannel(channel);
    }
    channel = supabaseClient
        .channel('posts-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
            const newPost = payload.new;
            if (!postsCache.some(post => post.id === newPost.id)) {
                postsCache.unshift(newPost);
                sortPostsCache();
                if (isUserAtTop()) {
                    renderNewPost(newPost, true);
                    lastPostId = postsCache[0].id;
                } else {
                    newPostsCount++;
                    newPostsBtn.style.display = 'block';
                    newPostsBtn.classList.add('visible');
                }
                const mentions = await extractMentions(newPost.text);
                console.log('New post mentions:', mentions);
                for (const username of mentions) {
                    const message = `[@${newPost.user_id}](tg://user?id=${newPost.chat_id || ''}) упомянул вас в посте:\n${newPost.text.substring(0, 100)}${newPost.text.length > 100 ? '...' : ''}`;
                    await notifyUser(username, message);
                    showNotification(`Уведомлен @${username}`);
                }
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Subscribed to posts channel');
            } else {
                console.error('Failed to subscribe to posts channel:', status);
            }
        });
}

function isUserAtTop() {
    const feedSection = document.getElementById('feed');
    return feedSection.scrollTop <= 50;
}

function setupInfiniteScroll() {
    const feedSection = document.getElementById('feed');
    if (!feedSection) {
        console.error('Feed section not found!');
        return;
    }
    console.log('Setting up infinite scroll');
    console.log('Feed CSS height:', feedSection.style.maxHeight);
    console.log('Feed scrollHeight:', feedSection.scrollHeight, 'clientHeight:', feedSection.clientHeight);
    feedSection.style.overflowY = 'auto';
    feedSection.removeEventListener('scroll', debouncedLoadMorePosts);
    feedSection.addEventListener('scroll', debouncedLoadMorePosts);
}

const debouncedLoadMorePosts = debounce(() => {
    const feedSection = document.getElementById('feed');
    if (!feedSection) {
        console.error('Feed section not found in debouncedLoadMorePosts');
        return;
    }
    const scrollBottom = feedSection.scrollHeight - feedSection.scrollTop - feedSection.clientHeight;
    console.log('Scroll event - scrollTop:', feedSection.scrollTop, 'scrollHeight:', feedSection.scrollHeight, 'clientHeight:', feedSection.clientHeight, 'scrollBottom:', scrollBottom);
    if (scrollBottom <= 200) {
        console.log('Near bottom, triggering loadMorePosts');
        loadMorePosts();
    }
}, 300);

function sortPostsCache() {
    postsCache.sort((a, b) => b.id - a.id);
}

function renderPosts() {
    postsDiv.innerHTML = '';
    for (const post of postsCache) {
        renderNewPost(post, false);
    }
    console.log('Rendered posts, count:', postsCache.length);
    postsDiv.appendChild(loadMoreBtn);
}

function renderNewPosts(newPosts, prepend = false) {
    for (const post of newPosts) {
        renderNewPost(post, prepend);
    }
}

function formatPostContent(content) {
    let formattedContent = content.replace(/\n/g, '<br>');
    const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]\}])/g;
    formattedContent = formattedContent.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    return formattedContent;
}

function renderNewPost(post, prepend = false) {
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    postDiv.setAttribute('data-post-id', post.id);
    const [userInfo, ...contentParts] = post.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    const timeAgo = getTimeAgo(new Date(post.timestamp));
    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${formattedContent}</div>
        ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post image">` : ''}
        <div class="post-actions">
            <button class="reaction-btn like-btn" onclick="toggleReaction(${post.id}, 'like')">👍 0</button>
            <button class="reaction-btn dislike-btn" onclick="toggleReaction(${post.id}, 'dislike')">👎 0</button>
            <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">💬 Комментарии (0)</button>
        </div>
        <div class="comment-section" id="comments-${post.id}" style="display: none;">
            <button id="new-comments-btn-${post.id}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${post.id}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий..."></textarea>
                <button onclick="addComment(${post.id})">Отправить</button>
            </div>
        </div>
    `;
    if (prepend) {
        postsDiv.prepend(postDiv);
    } else {
        postsDiv.appendChild(postDiv);
    }
    loadReactionsAndComments(post.id);
    subscribeToReactions(post.id);
}

async function renderMorePosts(newPosts) {
    for (const post of newPosts) {
        const postDiv = document.createElement('div');
        postDiv.classList.add('post');
        postDiv.setAttribute('data-post-id', post.id);
        const [userInfo, ...contentParts] = post.text.split(':\n');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';
        const content = contentParts.join(':\n');
        const formattedContent = formatPostContent(content);
        const timeAgo = getTimeAgo(new Date(post.timestamp));
        postDiv.innerHTML = `
            <div class="post-header">
                <div class="post-user">
                    <strong>${fullname}</strong>
                    <span>@${cleanUsername}</span>
                </div>
                <div class="post-time">${timeAgo}</div>
            </div>
            <div class="post-content">${formattedContent}</div>
            ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post image">` : ''}
            <div class="post-actions">
                <button class="reaction-btn like-btn" onclick="toggleReaction(${post.id}, 'like')">👍 0</button>
                <button class="reaction-btn dislike-btn" onclick="toggleReaction(${post.id}, 'dislike')">👎 0</button>
                <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">💬 Комментарии (0)</button>
            </div>
            <div class="comment-section" id="comments-${post.id}" style="display: none;">
                <button id="new-comments-btn-${post.id}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
                <div class="comment-list" id="comment-list-${post.id}" style="max-height: 200px; overflow-y: auto;"></div>
                <div class="comment-form">
                    <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий..."></textarea>
                    <button onclick="addComment(${post.id})">Отправить</button>
                </div>
            </div>
        `;
        postsDiv.appendChild(postDiv);
        loadReactionsAndComments(post.id);
        subscribeToReactions(post.id);
    }
    console.log('Rendered more posts, count:', newPosts.length);
    postsDiv.appendChild(loadMoreBtn);
}

async function loadReactionsAndComments(postId) {
    try {
        const reactions = await loadReactions(postId);
        const likes = reactions.filter(r => r.type === 'like').length;
        const dislikes = reactions.filter(r => r.type === 'dislike').length;
        const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
        const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
        const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';
        const comments = await loadComments(postId);
        const commentCount = comments ? comments.length : 0;
        const postDiv = postsDiv.querySelector(`[data-post-id="${postId}"]`);
        if (postDiv) {
            const likeBtn = postDiv.querySelector('.like-btn');
            const dislikeBtn = postDiv.querySelector('.dislike-btn');
            const commentBtn = postDiv.querySelector('.comment-toggle-btn');
            likeBtn.className = `reaction-btn like-btn ${likeClass}`;
            likeBtn.innerHTML = `👍 ${likes}`;
            dislikeBtn.className = `reaction-btn dislike-btn ${dislikeClass}`;
            dislikeBtn.innerHTML = `👎 ${dislikes}`;
            commentBtn.innerHTML = `💬 Комментарии (${commentCount})`;
            if (comments) {
                await renderComments(postId, comments);
            }
            setupCommentInfiniteScroll(postId);
        }
    } catch (error) {
        console.error('Error loading reactions and comments:', error);
    }
}

async function updatePost(postId) {
    const postIndex = postsCache.findIndex(post => post.id === postId);
    if (postIndex === -1) return;
    const post = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
    if (!post || post.length === 0) return;
    const reactions = await loadReactions(postId);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';
    const comments = await loadComments(postId);
    const commentCount = comments ? comments.length : 0;
    postsCache[postIndex] = post[0];
    const postDiv = postsDiv.querySelector(`[data-post-id="${postId}"]`);
    if (!postDiv) return;
    const [userInfo, ...contentParts] = post[0].text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    const timeAgo = getTimeAgo(new Date(post[0].timestamp));
    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${formattedContent}</div>
        ${post[0].image_url ? `<img src="${post[0].image_url}" class="post-image" alt="Post image">` : ''}
        <div class="post-actions">
            <button class="reaction-btn like-btn ${likeClass}" onclick="toggleReaction(${postId}, 'like')">👍 ${likes}</button>
            <button class="reaction-btn dislike-btn ${dislikeClass}" onclick="toggleReaction(${postId}, 'dislike')">👎 ${dislikes}</button>
            <button class="comment-toggle-btn" onclick="toggleComments(${postId})">💬 Комментарии (${commentCount})</button>
        </div>
        <div class="comment-section" id="comments-${postId}" style="display: none;">
            <button id="new-comments-btn-${postId}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${postId}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий..."></textarea>
                <button onclick="addComment(${postId})">Отправить</button>
            </div>
        </div>
    `;
    if (comments) {
        await renderComments(postId, comments);
    }
    setupCommentInfiniteScroll(postId);
}

function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d`;
}

async function loadReactions(postId) {
    try {
        const reactions = await supabaseFetch(`reactions?post_id=eq.${postId}`, 'GET');
        return reactions || [];
    } catch (error) {
        console.error('Error loading reactions:', error);
        return [];
    }
}

function subscribeToReactions(postId) {
    if (reactionChannels.has(postId)) {
        supabaseClient.removeChannel(reactionChannels.get(postId));
    }
    const channel = supabaseClient
        .channel(`reactions-channel-${postId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `post_id=eq.${postId}` }, async (payload) => {
            console.log(`Reaction change detected for post ${postId}:`, payload);
            if (payload.eventType === 'INSERT' && payload.new.user_id !== userData.telegramUsername) {
                const post = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
                if (post && post.length > 0) {
                    const message = `[@${payload.new.user_id}](tg://user?id=${payload.new.chat_id || ''}) ${payload.new.type === 'like' ? 'поставил лайк' : 'поставил дизлайк'} вашему посту:\n${post[0].text.substring(0, 100)}${post[0].text.length > 100 ? '...' : ''}`;
                    await notifyUser(post[0].user_id, message);
                    showNotification(`Уведомлен @${post[0].user_id} о ${payload.new.type}`);
                }
            }
            updatePost(postId);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to reactions channel for post ${postId}`);
            } else {
                console.error(`Failed to subscribe to reactions channel for post ${postId}:`, status);
            }
        });
    reactionChannels.set(postId, channel);
}

async function toggleReaction(postId, type) {
    postId = parseInt(postId);
    try {
        const userExists = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
        if (!userExists || userExists.length === 0) {
            throw new Error('Пользователь не найден в базе данных. Пожалуйста, зарегистрируйтесь.');
        }
        const userReaction = await supabaseFetch(`reactions?post_id=eq.${postId}&user_id=eq.${userData.telegramUsername}`, 'GET');
        if (userReaction && userReaction.length > 0) {
            const currentReaction = userReaction[0];
            if (currentReaction.type === type) {
                await supabaseFetch(`reactions?id=eq.${currentReaction.id}`, 'DELETE');
            } else {
                await supabaseFetch(`reactions?id=eq.${currentReaction.id}`, 'PATCH', { type: type });
            }
        } else {
            await supabaseFetch('reactions', 'POST', {
                post_id: postId,
                user_id: userData.telegramUsername,
                type: type,
                timestamp: new Date().toISOString(),
                chat_id: userData.chat_id
            });
        }
        await updatePost(postId);
    } catch (error) {
        console.error('Error toggling reaction:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function loadComments(postId) {
    try {
        if (!commentsCache.has(postId)) {
            commentsCache.set(postId, []);
            lastCommentIds.set(postId, null);
            newCommentsCount.set(postId, 0);
        }
        const comments = await supabaseFetch(`comments?post_id=eq.${postId}&order=id.asc&limit=10`, 'GET');
        if (comments && comments.length > 0) {
            const currentComments = commentsCache.get(postId);
            const newComments = comments.filter(comment => !currentComments.some(c => c.id === comment.id));
            commentsCache.set(postId, [...newComments, ...currentComments]);
            sortCommentsCache(postId);
            if (newComments.length > 0) {
                lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
            }
        }
        return commentsCache.get(postId);
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

async function loadMoreComments(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList || commentList.dataset.isLoadingMore === 'true') return;
    commentList.dataset.isLoadingMore = 'true';
    const oldestCommentId = commentsCache.get(postId).length > 0 ? commentsCache.get(postId)[0].id : null;
    try {
        const moreComments = await supabaseFetch(`comments?post_id=eq.${postId}&id=lt.${oldestCommentId}&order=id.asc&limit=10`, 'GET');
        if (moreComments && moreComments.length > 0) {
            const currentComments = commentsCache.get(postId);
            const newComments = moreComments.filter(comment => !currentComments.some(c => c.id === comment.id));
            if (newComments.length > 0) {
                commentsCache.set(postId, [...newComments, ...currentComments]);
                sortCommentsCache(postId);
                renderMoreComments(postId, newComments);
            }
        }
    } catch (error) {
        console.error('Error loading more comments:', error);
    } finally {
        commentList.dataset.isLoadingMore = 'false';
    }
}

async function loadNewComments(postId) {
    const lastCommentId = lastCommentIds.get(postId);
    if (!lastCommentId) return;
    try {
        const newComments = await supabaseFetch(`comments?post_id=eq.${postId}&id=gt.${lastCommentId}&order=id.asc`, 'GET');
        if (newComments && newComments.length > 0) {
            const currentComments = commentsCache.get(postId);
            const uniqueNewComments = newComments.filter(comment => !currentComments.some(c => c.id === comment.id));
            if (uniqueNewComments.length > 0) {
                commentsCache.set(postId, [...currentComments, ...uniqueNewComments]);
                sortCommentsCache(postId);
                renderNewComments(postId, uniqueNewComments, true);
                lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
            }
        }
    } catch (error) {
        console.error('Error loading new comments:', error);
    }
}

function subscribeToNewComments(postId) {
    if (commentChannels.has(postId)) {
        supabaseClient.removeChannel(commentChannels.get(postId));
    }
    const channel = supabaseClient
        .channel(`comments-channel-${postId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, async (payload) => {
            const newComment = payload.new;
            const currentComments = commentsCache.get(postId) || [];
            if (!currentComments.some(comment => comment.id === newComment.id)) {
                commentsCache.set(postId, [...currentComments, newComment]);
                sortCommentsCache(postId);
                if (isUserAtBottom(postId)) {
                    renderNewComment(postId, newComment, true);
                    lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
                } else {
                    const currentCount = newCommentsCount.get(postId) || 0;
                    newCommentsCount.set(postId, currentCount + 1);
                    const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
                    if (newCommentsBtn) {
                        newCommentsBtn.style.display = 'block';
                        newCommentsBtn.classList.add('visible');
                        newCommentsBtn.textContent = `Новые комментарии (${newCommentsCount.get(postId)})`;
                    }
                }
                if (newComment.user_id !== userData.telegramUsername) {
                    const post = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
                    if (post && post.length > 0) {
                        const message = `[@${newComment.user_id}](tg://user?id=${newComment.chat_id || ''}) прокомментировал ваш пост:\n${newComment.text.substring(0, 100)}${newComment.text.length > 100 ? '...' : ''}`;
                        await notifyUser(post[0].user_id, message);
                        showNotification(`Уведомлен @${post[0].user_id} о комментарии`);
                    }
                }
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to comments channel for post ${postId}`);
            } else {
                console.error(`Failed to subscribe to comments channel for post ${postId}:`, status);
            }
        });
    commentChannels.set(postId, channel);
}

function isUserAtBottom(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return false;
    return commentList.scrollHeight - commentList.scrollTop <= commentList.clientHeight + 50;
}

function setupCommentInfiniteScroll(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;
    if (commentChannels.has(postId)) {
        supabaseClient.removeChannel(commentChannels.get(postId));
        commentChannels.delete(postId);
    }
    const debouncedLoadMoreComments = debounce(() => {
        if (commentList.scrollTop <= 50) {
            loadMoreComments(postId);
        }
    }, 300);
    commentList.removeEventListener('scroll', debouncedLoadMoreComments);
    commentList.addEventListener('scroll', debouncedLoadMoreComments);
    subscribeToNewComments(postId);
    const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
    if (newCommentsBtn) {
        newCommentsBtn.onclick = () => {
            loadNewComments(postId);
            newCommentsBtn.style.display = 'none';
            newCommentsCount.set(postId, 0);
        };
    }
}

function sortCommentsCache(postId) {
    const comments = commentsCache.get(postId);
    if (comments) {
        comments.sort((a, b) => a.id - b.id);
        commentsCache.set(postId, comments);
    }
}

async function renderComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;
    commentList.innerHTML = '';
    comments.forEach(comment => {
        renderNewComment(postId, comment, true);
    });
}

async function renderNewComments(postId, newComments, append = true) {
    for (const comment of newComments) {
        renderNewComment(postId, comment, append);
    }
}

function renderNewComment(postId, comment, append = true) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;
    const commentDiv = document.createElement('div');
    commentDiv.classList.add('comment');
    const [userInfo, ...contentParts] = comment.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    commentDiv.innerHTML = `
        <div class="comment-user">
            <strong>${fullname}</strong> <span>@${cleanUsername}</span>
        </div>
        <div class="comment-content">${content}</div>
    `;
    if (append) {
        commentList.appendChild(commentDiv);
        if (isUserAtBottom(postId)) {
            commentList.scrollTop = commentList.scrollHeight;
        }
    } else {
        commentList.prepend(commentDiv);
    }
}

async function renderMoreComments(postId, newComments) {
    for (const comment of newComments) {
        const commentList = document.getElementById(`comment-list-${postId}`);
        if (!commentList) return;
        const commentDiv = document.createElement('div');
        commentDiv.classList.add('comment');
        const [userInfo, ...contentParts] = comment.text.split(':\n');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';
        const content = contentParts.join(':\n');
        commentDiv.innerHTML = `
            <div class="comment-user">
                <strong>${fullname}</strong> <span>@${cleanUsername}</span>
            </div>
            <div class="comment-content">${content}</div>
        `;
        commentList.appendChild(commentDiv);
    }
}

async function addComment(postId) {
    postId = parseInt(postId);
    const commentInput = document.getElementById(`comment-input-${postId}`);
    if (!commentInput) return;
    const text = commentInput.value.trim();
    if (!text) {
        alert('Пожалуйста, введите текст комментария!');
        return;
    }
    try {
        const postExists = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
        if (!postExists || postExists.length === 0) {
            throw new Error('Пост не найден. Возможно, он был удалён.');
        }
        const userExists = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
        if (!userExists || userExists.length === 0) {
            throw new Error('Пользователь не найден в базе данных. Пожалуйста, зарегистрируйтесь.');
        }
        const comment = {
            post_id: postId,
            user_id: userData.telegramUsername,
            text: `${userData.fullname} (@${userData.telegramUsername}):\n${text}`,
            timestamp: new Date().toISOString()
        };
        const newComment = await supabaseFetch('comments', 'POST', comment);
        commentInput.value = '';
        const currentComments = commentsCache.get(postId) || [];
        if (!currentComments.some(c => c.id === newComment[0].id)) {
            commentsCache.set(postId, [...currentComments, newComment[0]]);
            sortCommentsCache(postId);
            if (isUserAtBottom(postId)) {
                renderNewComment(postId, newComment[0], true);
                lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
            } else {
                const currentCount = newCommentsCount.get(postId) || 0;
                newCommentsCount.set(postId, currentCount + 1);
                const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
                if (newCommentsBtn) {
                    newCommentsBtn.style.display = 'block';
                    newCommentsBtn.classList.add('visible');
                    newCommentsBtn.textContent = `Новые комментарии (${newCommentsCount.get(postId)})`;
                }
            }
        }
        await updatePost(postId);
        if (postExists[0].user_id !== userData.telegramUsername) {
            const message = `[@${userData.telegramUsername}](tg://user?id=${userData.chat_id || ''}) прокомментировал ваш пост:\n${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`;
            await notifyUser(postExists[0].user_id, message);
            showNotification(`Уведомлен @${postExists[0].user_id} о комментарии`);
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (commentSection) {
        const isVisible = commentSection.style.display === 'block';
        commentSection.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            loadComments(postId).then(comments => renderComments(postId, comments));
            setupCommentInfiniteScroll(postId);
        } else {
            if (commentChannels.has(postId)) {
                supabaseClient.removeChannel(commentChannels.get(postId));
                commentChannels.delete(postId);
            }
        }
    }
}

const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');
const submitTournament = document.getElementById('submit-tournament');
const tournamentList = document.getElementById('tournament-list');

createTournamentBtn.addEventListener('click', () => {
    createTournamentForm.classList.toggle('form-hidden');
});

submitTournament.addEventListener('click', async () => {
    const tournament = {
        name: document.getElementById('tournament-name').value,
        date: document.getElementById('tournament-date').value,
        logo: document.getElementById('tournament-logo').value,
        desc: document.getElementById('tournament-desc').value,
        address: document.getElementById('tournament-address').value,
        deadline: document.getElementById('tournament-deadline').value,
        creator_id: userData.telegramUsername,
        timestamp: new Date().toISOString()
    };
    try {
        await supabaseFetch('tournaments', 'POST', tournament);
        alert('Турнир создан!');
        createTournamentForm.classList.add('form-hidden');
        document.getElementById('tournament-name').value = '';
        document.getElementById('tournament-date').value = '';
        document.getElementById('tournament-logo').value = '';
        document.getElementById('tournament-desc').value = '';
        document.getElementById('tournament-address').value = '';
        document.getElementById('tournament-deadline').value = '';
        loadTournaments();
    } catch (error) {
        console.error('Error saving tournament:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadTournaments() {
    try {
        const tournaments = await supabaseFetch('tournaments?order=timestamp.desc&limit=50', 'GET');
        tournamentList.innerHTML = '';
        if (tournaments) {
            tournaments.forEach(tournament => {
                const tournamentCard = document.createElement('div');
                tournamentCard.classList.add('tournament-card');
                tournamentCard.setAttribute('data-tournament-id', tournament.id);
                tournamentCard.addEventListener('click', () => showTournamentDetails(tournament.id));
                const logoUrl = tournament.logo || 'placeholder.png';
                const city = tournament.address ? extractCityFromAddress(tournament.address) : 'Не указан';
                tournamentCard.innerHTML = `
                    <img src="${logoUrl}" class="tournament-logo" alt="Логотип турнира" onerror="this.src='placeholder.png'">
                    <div class="tournament-info">
                        <strong>${tournament.name}</strong>
                        <span>Дата: ${tournament.date}</span>
                        <span>Город: ${city}</span>
                    </div>
                `;
                tournamentList.appendChild(tournamentCard);
            });
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        alert('Ошибка загрузки турниров: ' + error.message);
    }
}

async function showTournamentDetails(tournamentId) {
    try {
        const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
        if (!tournament || tournament.length === 0) return;
        currentTournamentId = tournamentId;
        const data = tournament[0];
        const city = data.address ? extractCityFromAddress(data.address) : 'Не указан';
        const isCreator = data.creator_id === userData.telegramUsername;
        const header = document.getElementById('tournament-header');
        const description = document.getElementById('tournament-description');
        const toggleBtn = document.getElementById('toggle-description-btn');
        header.innerHTML = `
            <img src="${data.logo || 'placeholder.png'}" alt="Логотип турнира" onerror="this.src='placeholder.png'">
            <strong>${data.name}</strong>
            <p>Дата: ${data.date}</p>
            <p>Город: ${city}</p>
            <p>Адрес: <a href="${data.address}" target="_blank">${data.address}</a></p>
            <p>Дедлайн: ${data.deadline}</p>
        `;
        description.innerHTML = `
            <p>Описание: ${data.desc || 'Описание отсутствует'}</p>
        `;
        sections.forEach(section => section.classList.remove('active'));
        document.getElementById('tournament-details').classList.add('active');
        buttons.forEach(btn => btn.classList.remove('active'));
        toggleBtn.onclick = () => {
            if (description.classList.contains('description-hidden')) {
                description.classList.remove('description-hidden');
                toggleBtn.textContent = 'Свернуть описание';
            } else {
                description.classList.add('description-hidden');
                toggleBtn.textContent = 'Развернуть описание';
            }
        };
        initTabs();
        initTournamentPosts(isCreator, data.name);
        loadTournamentPosts(tournamentId);
        initRegistration();
        loadRegistrations(tournamentId, isCreator);
        initBracket(isCreator);
        loadBracket(tournamentId);
    } catch (error) {
        console.error('Error loading tournament details:', error);
        alert('Ошибка: ' + error.message);
    }
}

function extractCityFromAddress(address) {
    return address.split('/')[3] || 'Не указан';
}

function initTabs() {
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');
    const postsContent = document.getElementById('tournament-posts');
    const registrationContent = document.getElementById('tournament-registration');
    const bracketContent = document.getElementById('tournament-bracket');
    postsTab.onclick = () => {
        postsTab.classList.add('active');
        registrationTab.classList.remove('active');
        bracketTab.classList.remove('active');
        postsContent.classList.add('active');
        registrationContent.classList.remove('active');
        bracketContent.classList.remove('active');
    };
    registrationTab.onclick = () => {
        registrationTab.classList.add('active');
        postsTab.classList.remove('active');
        bracketTab.classList.remove('active');
        registrationContent.classList.add('active');
        postsContent.classList.remove('active');
        bracketContent.classList.remove('active');
    };
    bracketTab.onclick = () => {
        bracketTab.classList.add('active');
        postsTab.classList.remove('active');
        registrationTab.classList.remove('active');
        bracketContent.classList.add('active');
        postsContent.classList.remove('active');
        registrationContent.classList.remove('active');
    };
}

function initTournamentPosts(isCreator, tournamentName) {
    const postsSection = document.getElementById('tournament-posts');
    postsSection.innerHTML = '';
    if (isCreator) {
        postsSection.innerHTML = `
            <div id="new-tournament-post">
                <textarea id="tournament-post-text" placeholder="Создать пост от имени турнира"></textarea>
                <button id="submit-tournament-post">Опубликовать</button>
            </div>
            <div id="tournament-posts-list"></div>
        `;
        document.getElementById('submit-tournament-post').onclick = async () => {
            const text = document.getElementById('tournament-post-text').value.trim();
            if (!text) {
                alert('Пожалуйста, введите текст поста!');
                return;
            }
            try {
                await supabaseFetch('tournament_posts', 'POST', {
                    tournament_id: currentTournamentId,
                    creator_id: userData.telegramUsername,
                    text: text,
                    timestamp: new Date().toISOString()
                });
                document.getElementById('tournament-post-text').value = '';
                loadTournamentPosts(currentTournamentId);
            } catch (error) {
                console.error('Error saving tournament post:', error);
                alert('Ошибка: ' + error.message);
            }
        };
    } else {
        postsSection.innerHTML = `<div id="tournament-posts-list"></div>`;
    }
}

async function loadTournamentPosts(tournamentId) {
    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=timestamp.desc`, 'GET');
        const postsList = document.getElementById('tournament-posts-list');
        postsList.innerHTML = '';
        if (posts && posts.length > 0) {
            const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
            const tournamentName = tournament[0].name;
            posts.forEach(post => {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post');
                postDiv.innerHTML = `
                    <div class="post-header">
                        <strong>Турнир: ${tournamentName}</strong>
                        <span>${getTimeAgo(new Date(post.timestamp))}</span>
                    </div>
                    <div class="post-content">${post.text}</div>
                `;
                postsList.appendChild(postDiv);
            });
        } else {
            postsList.innerHTML = '<p>Пока нет постов от турнира.</p>';
        }
    } catch (error) {
        console.error('Error loading tournament posts:', error);
        postsList.innerHTML = '<p>Ошибка загрузки постов.</p>';
    }
}

function initRegistration() {
    const registerBtn = document.getElementById('register-tournament-btn');
    const registrationForm = document.getElementById('registration-form');
    const submitRegistrationBtn = document.getElementById('submit-registration');
    registerBtn.onclick = () => {
        registrationForm.classList.toggle('form-hidden');
    };
    submitRegistrationBtn.onclick = async () => {
        submitRegistrationBtn.disabled = true;
        const registration = {
            tournament_id: currentTournamentId,
            faction_name: document.getElementById('faction-name').value,
            club: document.getElementById('club').value,
            speaker1: document.getElementById('speaker1').value,
            speaker2: document.getElementById('speaker2').value,
            city: document.getElementById('city').value,
            contacts: document.getElementById('contacts').value,
            extra: document.getElementById('extra').value,
            timestamp: new Date().toISOString()
        };
        try {
            const existing = await supabaseFetch(`registrations?tournament_id=eq.${currentTournamentId}&faction_name=eq.${registration.faction_name}&club=eq.${registration.club}`, 'GET');
            if (existing && existing.length > 0) {
                alert('Эта команда уже зарегистрирована!');
                return;
            }
            await supabaseFetch('registrations', 'POST', registration);
            alert('Команда успешно зарегистрирована!');
            registrationForm.classList.add('form-hidden');
            document.getElementById('faction-name').value = '';
            document.getElementById('club').value = '';
            document.getElementById('speaker1').value = '';
            document.getElementById('speaker2').value = '';
            document.getElementById('city').value = '';
            document.getElementById('contacts').value = '';
            document.getElementById('extra').value = '';
            const isCreator = (await supabaseFetch(`tournaments?id=eq.${currentTournamentId}`, 'GET'))[0].creator_id === userData.telegramUsername;
            await loadRegistrations(currentTournamentId, isCreator);
        } catch (error) {
            console.error('Error saving registration:', error);
            alert('Ошибка: ' + error.message);
        } finally {
            submitRegistrationBtn.disabled = false;
        }
    };
}

async function loadRegistrations(tournamentId, isCreator) {
    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&order=timestamp.asc`, 'GET');
        const registrationList = document.getElementById('registration-list');
        registrationList.innerHTML = '';
        const seen = new Set();
        const uniqueRegistrations = registrations.filter(reg => {
            const key = `${reg.tournament_id}|${reg.faction_name}|${reg.club}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (uniqueRegistrations.length > 0) {
            uniqueRegistrations.forEach(reg => {
                const regCard = document.createElement('div');
                regCard.classList.add('registration-card');
                regCard.setAttribute('data-registration-id', reg.id);
                regCard.innerHTML = `
                    <strong>${reg.faction_name || 'Не указано'}</strong>
                    <p>Клуб: ${reg.club || 'Не указано'}</p>
                    <p>Спикер 1: ${reg.speaker1 || 'Не указано'}</p>
                    <p>Спикер 2: ${reg.speaker2 || 'Не указано'}</p>
                    <p>Город: ${reg.city || 'Не указано'}</p>
                    <p>Контакты: ${reg.contacts || 'Не указано'}</p>
                    <p>Дополнительно: ${reg.extra || 'Нет'}</p>
                    ${isCreator ? `<button class="delete-registration-btn" data-registration-id="${reg.id}">Удалить</button>` : ''}
                `;
                registrationList.appendChild(regCard);
            });
            if (isCreator) {
                const deleteButtons = document.querySelectorAll('.delete-registration-btn');
                deleteButtons.forEach(button => {
                    button.onclick = async () => {
                        const registrationId = button.getAttribute('data-registration-id');
                        if (confirm('Вы уверены, что хотите удалить эту команду?')) {
                            await deleteRegistration(registrationId, tournamentId);
                        }
                    };
                });
            }
        } else {
            registrationList.innerHTML = '<p>Пока нет зарегистрированных команд.</p>';
        }
    } catch (error) {
        console.error('Error loading registrations:', error);
        alert('Ошибка загрузки регистраций: ' + error.message);
    }
}

async function deleteRegistration(registrationId, tournamentId) {
    try {
        await supabaseFetch(`registrations?id=eq.${registrationId}`, 'DELETE');
        alert('Команда успешно удалена!');
        const isCreator = (await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET'))[0].creator_id === userData.telegramUsername;
        await loadRegistrations(tournamentId, isCreator);
    } catch (error) {
        console.error('Error deleting registration:', error);
        alert('Ошибка при удалении команды: ' + error.message);
    }
}

function initBracket(isCreator) {
    const bracketSection = document.getElementById('tournament-bracket');
    bracketSection.innerHTML = '';
    if (isCreator) {
        bracketSection.innerHTML = `
            <div id="bracket-form">
                <select id="bracket-format">
                    <option value="АПФ">АПФ</option>
                    <option value="БПФ">БПФ</option>
                </select>
                <input id="bracket-faction-count" type="number" placeholder="Количество фракций (чётное)" min="2" step="2">
                <select id="bracket-round-count">
                    <option value="1">1 раунд</option>
                    <option value="2">2 раунда</option>
                    <option value="3">3 раунда</option>
                    <option value="4">4 раунда</option>
                    <option value="5">5 раундов</option>
                </select>
                <button id="generate-bracket-btn">Сформировать сетку</button>
            </div>
            <div id="bracket-display"></div>
        `;
        document.getElementById('generate-bracket-btn').onclick = async () => {
            generateBracket();
        };
    } else {
        bracketSection.innerHTML = `<div id="bracket-display"></div>`;
    }
}

async function generateBracket() {
    const format = document.getElementById('bracket-format').value;
    const factionCount = parseInt(document.getElementById('bracket-faction-count').value);
    const roundCount = parseInt(document.getElementById('bracket-round-count').value);
    if (isNaN(factionCount) || factionCount < 2 || factionCount % 2 !== 0) {
        alert('Количество фракций должно быть чётным и больше 0!');
        return;
    }
    if (format === 'БПФ' && factionCount % 4 !== 0) {
        alert('Для БПФ количество фракций должно быть кратно 4!');
        return;
    }
    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${currentTournamentId}&order=timestamp.asc`, 'GET');
        if (!registrations || registrations.length < factionCount) {
            alert(`Недостаточно зарегистрированных команд для ${factionCount} фракций!`);
            return;
        }
        const bracket = {
            tournament_id: currentTournamentId,
            format: format,
            faction_count: factionCount,
            round_count: roundCount,
            timestamp: new Date().toISOString(),
            matches: generateMatches(registrations.slice(0, factionCount), format, roundCount)
        };
        await supabaseFetch('brackets', 'POST', bracket);
        alert('Сетка сформирована!');
        loadBracket(currentTournamentId);
    } catch (error) {
        console.error('Error generating bracket:', error);
        alert('Ошибка: ' + error.message);
    }
}

function generateMatches(teams, format, roundCount) {
    const matches = [];
    let currentTeams = [...teams];
    for (let round = 1; round <= roundCount; round++) {
        const roundMatches = [];
        if (format === 'АПФ') {
            for (let i = 0; i < currentTeams.length; i += 2) {
                if (currentTeams[i + 1]) {
                    roundMatches.push({
                        round: round,
                        team1: currentTeams[i].faction_name,
                        team2: currentTeams[i + 1].faction_name,
                        winner: null
                    });
                }
            }
            currentTeams = currentTeams.slice(0, currentTeams.length / 2);
        } else {
            for (let i = 0; i < currentTeams.length; i += 4) {
                if (currentTeams[i + 3]) {
                    roundMatches.push({
                        round: round,
                        team1: currentTeams[i].faction_name,
                        team2: currentTeams[i + 1].faction_name,
                        team3: currentTeams[i + 2].faction_name,
                        team4: currentTeams[i + 3].faction_name,
                        winner: null
                    });
                }
            }
            currentTeams = currentTeams.slice(0, currentTeams.length / 4);
        }
        matches.push(...roundMatches);
    }
    return matches;
}

async function loadBracket(tournamentId) {
    try {
        const brackets = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}&order=timestamp.desc`, 'GET');
        const bracketDisplay = document.getElementById('bracket-display');
        bracketDisplay.innerHTML = '';
        if (brackets && brackets.length > 0) {
            const bracket = brackets[0];
            const isCreator = (await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET'))[0].creator_id === userData.telegramUsername;
            bracketDisplay.innerHTML = `<h3>Формат: ${bracket.format}, Раундов: ${bracket.round_count}</h3>`;
            const rounds = [...new Set(bracket.matches.map(m => m.round))];
            rounds.forEach(round => {
                const roundDiv = document.createElement('div');
                roundDiv.classList.add('bracket-round');
                roundDiv.innerHTML = `<h4>Раунд ${round}</h4>`;
                const roundMatches = bracket.matches.filter(m => m.round === round);
                roundMatches.forEach(match => {
                    const matchDiv = document.createElement('div');
                    matchDiv.classList.add('bracket-match');
                    if (bracket.format === 'АПФ') {
                        matchDiv.innerHTML = `
                            <p>${match.team1} vs ${match.team2}</p>
                            <p>Победитель: ${match.winner || 'Не определён'}</p>
                            ${isCreator ? `<button onclick="setWinner(${match.round}, '${match.team1}', '${match.team2}', ${tournamentId})">Выбрать победителя</button>` : ''}
                        `;
                    } else {
                        matchDiv.innerHTML = `
                            <p>${match.team1} vs ${match.team2} vs ${match.team3} vs ${match.team4}</p>
                            <p>Победитель: ${match.winner || 'Не определён'}</p>
                            ${isCreator ? `<button onclick="setWinner(${match.round}, '${match.team1}', '${match.team2}', '${match.team3}', '${match.team4}', ${tournamentId})">Выбрать победителя</button>` : ''}
                        `;
                    }
                    roundDiv.appendChild(matchDiv);
                });
                bracketDisplay.appendChild(roundDiv);
            });
        } else {
            bracketDisplay.innerHTML = '<p>Сетка ещё не сформирована.</p>';
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
        bracketDisplay.innerHTML = '<p>Ошибка загрузки сетки.</p>';
    }
}

async function setWinner(round, ...teams) {
    const tournamentId = arguments[arguments.length - 1];
    const winner = prompt(`Выберите победителя среди: ${teams.join(', ')}`);
    if (!winner || !teams.includes(winner)) {
        alert('Пожалуйста, выберите корректного победителя!');
        return;
    }
    try {
        const brackets = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}&order=timestamp.desc`, 'GET');
        if (!brackets || brackets.length === 0) return;
        const bracket = brackets[0];
        const match = bracket.matches.find(m => m.round === round && teams.includes(m.team1));
        if (match) {
            match.winner = winner;
            await supabaseFetch(`brackets?id=eq.${bracket.id}`, 'PATCH', { matches: bracket.matches });
            alert('Победитель сохранён!');
            loadBracket(tournamentId);
        }
    } catch (error) {
        console.error('Error setting winner:', error);
        alert('Ошибка: ' + error.message);
    }
}

checkProfile();
