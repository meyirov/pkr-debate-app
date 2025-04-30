console.log('script.js loaded, version: 2025-04-30');

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const tg = window.Telegram.WebApp;
tg.ready();

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
const regFullname = document.getElementById('reg-fullname');
const regTelegramId = document.getElementById('reg-telegram-id');
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

async function sendTelegramNotification(telegramId, message) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: telegramId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        if (!response.ok) {
            throw new Error('Failed to send Telegram notification');
        }
    } catch (error) {
        console.error('Error sending Telegram notification:', error);
    }
}

async function notifyTaggedUsers(content, senderFullname, senderUsername, postId = null) {
    const tagRegex = /@(\w+)/g;
    const taggedUsernames = [...content.matchAll(tagRegex)].map(match => match[1]);
    
    for (const username of taggedUsernames) {
        const profile = await supabaseFetch(`profiles?telegram_username=eq.${username}`, 'GET');
        if (profile && profile.length > 0 && profile[0].telegram_id) {
            const message = postId ?
                `<b>${senderFullname} (@${senderUsername})</b> упомянул вас в посте:\n${content.substring(0, 100)}...\n<a href="#post-${postId}">Перейти к посту</a>` :
                `<b>${senderFullname} (@${senderUsername})</b> упомянул вас в комментарии:\n${content.substring(0, 100)}...`;
            await sendTelegramNotification(profile[0].telegram_id, message);
        }
    }
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
            userData.telegramId = profiles[0].telegram_id;
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
    if (!regFullname.value.trim() || !regTelegramId.value.trim()) {
        alert('Пожалуйста, введите имя и Telegram ID!');
        return;
    }
    userData.fullname = regFullname.value.trim();
    userData.telegramId = regTelegramId.value.trim();
    try {
        await supabaseFetch('profiles', 'POST', {
            telegram_username: userData.telegramUsername,
            fullname: userData.fullname,
            telegram_id: userData.telegramId
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
    document.getElementById('username').textContent = userData.telegramUsername;
    document.getElementById('fullname').value = userData.fullname;
    document.getElementById('telegram-id').value = userData.telegramId || '';
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
        if (button.id === 'rating-btn') loadRating();
        if (button.id === 'profile-btn') showProfile();
    });
});

const debouncedLoadPosts = debounce(loadPosts, 300);

const updateProfileBtn = document.getElementById('update-profile');
updateProfileBtn.addEventListener('click', async () => {
    const newFullname = document.getElementById('fullname').value.trim();
    const newTelegramId = document.getElementById('telegram-id').value.trim();
    if (!newFullname || !newTelegramId) {
        alert('Пожалуйста, введите имя и Telegram ID!');
        return;
    }
    userData.fullname = newFullname;
    userData.telegramId = newTelegramId;
    try {
        await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'PATCH', {
            fullname: userData.fullname,
            telegram_id: userData.telegramId
        });
        alert('Профиль обновлен!');
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

submitPost.addEventListener('click', async () => {
    const postContent = postText.value.trim();
    if (!postContent) {
        alert('Пожалуйста, введите текст поста! Пустые посты не допускаются.');
        return;
    }
    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
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
        await notifyTaggedUsers(postContent, userData.fullname, userData.telegramUsername, newPost[0].id);
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
                const [, content] = newPost.text.split(':\n');
                await notifyTaggedUsers(content, userData.fullname, userData.telegramUsername, newPost.id);
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
    const tagRegex = /@(\w+)/g;
    formattedContent = formattedContent.replace(tagRegex, '<span class="tag">@$1</span>');
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
                <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий... Используйте @username для тега"></textarea>
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
                    <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий... Используйте @username для тега"></textarea>
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
            <button id="new-comments- btn-${postId}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${postId}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий... Используйте @username для тега"></textarea>
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
            await updatePost(postId);
            const reaction = payload.new || payload.old;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const post = postsCache.find(p => p.id === postId);
                if (post && post.user_id !== userData.telegramUsername) {
                    const profile = await supabaseFetch(`profiles?telegram_username=eq.${post.user_id}`, 'GET');
                    if (profile && profile.length > 0 && profile[0].telegram_id) {
                        const message = `<b>${userData.fullname} (@${userData.telegramUsername})</b> поставил ${reaction.type === 'like' ? 'лайк' : 'дизлайк'} вашему посту:\n${post.text.substring(0, 100)}...`;
                        await sendTelegramNotification(profile[0].telegram_id, message);
                    }
                }
            }
        })
        .subscribe((status) => {
            if (status === ' 로드') {
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
                timestamp: new Date().toISOString()
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
                const post = postsCache.find(p => p.id === postId);
                if (post && post.user_id !== userData.telegramUsername) {
                    const profile = await supabaseFetch(`profiles?telegram_username=eq.${post.user_id}`, 'GET');
                    if (profile && profile.length > 0 && profile[0].telegram_id) {
                        const [, commentContent] = newComment.text.split(':\n');
                        const message = `<b>${userData.fullname} (@${userData.telegramUsername})</b> прокомментировал ваш пост:\n${commentContent.substring(0, 100)}...`;
                        await sendTelegramNotification(profile[0].telegram_id, message);
                    }
                }
                const [, commentContent] = newComment.text.split(':\n');
                await notifyTaggedUsers(commentContent, userData.fullname, userData.telegramUsername);
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

    for (const comment of comments) {
        renderNewComment(postId, comment, false);
    }
}

function renderNewComment(postId, comment, prepend = false) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    const commentDiv = document.createElement('div');
    commentDiv.classList.add('comment');

    const [userInfo, ...contentParts] = comment.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    const timeAgo = getTimeAgo(new Date(comment.timestamp));

    commentDiv.innerHTML = `
        <div class="comment-user">
            <strong>${fullname}</strong>
            <span>@${cleanUsername}</span> • ${timeAgo}
        </div>
        <div class="comment-content">${formattedContent}</div>
    `;

    if (prepend) {
        commentList.prepend(commentDiv);
    } else {
        commentList.appendChild(commentDiv);
    }
}

async function renderMoreComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    for (const comment of comments) {
        const commentDiv = document.createElement('div');
        commentDiv.classList.add('comment');

        const [userInfo, ...contentParts] = comment.text.split(':\n');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';
        const content = contentParts.join(':\n');
        const formattedContent = formatPostContent(content);
        const timeAgo = getTimeAgo(new Date(comment.timestamp));

        commentDiv.innerHTML = `
            <div class="comment-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span> • ${timeAgo}
            </div>
            <div class="comment-content">${formattedContent}</div>
        `;

        commentList.prepend(commentDiv);
    }
}

async function renderNewComments(postId, comments, prepend = false) {
    for (const comment of comments) {
        renderNewComment(postId, comment, prepend);
    }
}

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const commentContent = commentInput.value.trim();
    if (!commentContent) {
        alert('Пожалуйста, введите текст комментария!');
        return;
    }

    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${commentContent}`;
    const comment = {
        post_id: postId,
        user_id: userData.telegramUsername,
        text: text,
        timestamp: new Date().toISOString()
    };

    try {
        const newComment = await supabaseFetch('comments', 'POST', comment);
        commentInput.value = '';
        const currentComments = commentsCache.get(postId) || [];
        if (!currentComments.some(c => c.id === newComment[0].id)) {
            commentsCache.set(postId, [...currentComments, newComment[0]]);
            sortCommentsCache(postId);
            renderNewComment(postId, newComment[0], true);
            lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
            const commentBtn = document.querySelector(`[data-post-id="${postId}"] .comment-toggle-btn`);
            if (commentBtn) {
                const commentCount = commentsCache.get(postId).length;
                commentBtn.innerHTML = `💬 Комментарии (${commentCount})`;
            }
            await notifyTaggedUsers(commentContent, userData.fullname, userData.telegramUsername);
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (commentSection.style.display === 'none' || !commentSection.style.display) {
        commentSection.style.display = 'block';
        loadComments(postId).then(comments => renderComments(postId, comments));
    } else {
        commentSection.style.display = 'none';
    }
}

async function loadTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    tournamentList.innerHTML = '';

    try {
        const tournaments = await supabaseFetch('tournaments?order=created_at.desc', 'GET');
        if (tournaments && tournaments.length > 0) {
            tournaments.forEach(tournament => {
                const card = document.createElement('div');
                card.classList.add('tournament-card');
                card.innerHTML = `
                    <img src="${tournament.logo || 'https://via.placeholder.com/64'}" class="tournament-logo" alt="${tournament.name}">
                    <div class="tournament-info">
                        <strong>${tournament.name}</strong>
                        <span>Дата: ${tournament.date}</span>
                        <span>Дедлайн: ${tournament.deadline}</span>
                    </div>
                `;
                card.addEventListener('click', () => showTournamentDetails(tournament.id));
                tournamentList.appendChild(card);
            });
        } else {
            tournamentList.innerHTML = '<p>Турниры не найдены.</p>';
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        alert('Ошибка загрузки турниров: ' + error.message);
    }
}

async function showTournamentDetails(tournamentId) {
    currentTournamentId = tournamentId;
    const tournamentDetails = document.getElementById('tournament-details');
    const tournamentHeader = document.getElementById('tournament-header');
    const tournamentDescription = document.getElementById('tournament-description');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');
    const sections = document.querySelectorAll('.content');
    const navButtons = document.querySelectorAll('.nav-btn');

    sections.forEach(section => section.classList.remove('active'));
    navButtons.forEach(btn => btn.classList.remove('active'));
    tournamentDetails.classList.add('active');

    try {
        const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
        if (tournament && tournament.length > 0) {
            const t = tournament[0];
            tournamentHeader.innerHTML = `
                <img src="${t.logo || 'https://via.placeholder.com/150'}" alt="${t.name}">
                <strong>${t.name}</strong>
                <p>Дата: ${t.date}</p>
                <p>Дедлайн: ${t.deadline}</p>
                <p>Адрес: <a href="${t.address}" target="_blank">Открыть в 2GIS</a></p>
            `;
            tournamentDescription.innerHTML = `<p>${t.description}</p>`;
            tournamentDescription.classList.add('description-hidden');
            toggleDescriptionBtn.textContent = 'Развернуть описание';
            toggleDescriptionBtn.onclick = () => {
                tournamentDescription.classList.toggle('description-hidden');
                toggleDescriptionBtn.textContent = tournamentDescription.classList.contains('description-hidden') ? 'Развернуть описание' : 'Свернуть описание';
            };
            setupTournamentTabs(tournamentId);
            loadTournamentPosts(tournamentId);
        } else {
            tournamentHeader.innerHTML = '<p>Турнир не найден.</p>';
        }
    } catch (error) {
        console.error('Error loading tournament details:', error);
        alert('Ошибка: ' + error.message);
    }
}

function setupTournamentTabs(tournamentId) {
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');
    const postsContent = document.getElementById('tournament-posts');
    const registrationContent = document.getElementById('tournament-registration');
    const bracketContent = document.getElementById('tournament-bracket');

    postsTab.addEventListener('click', () => {
        postsTab.classList.add('active');
        registrationTab.classList.remove('active');
        bracketTab.classList.remove('active');
        postsContent.classList.add('active');
        registrationContent.classList.remove('active');
        bracketContent.classList.remove('active');
        loadTournamentPosts(tournamentId);
    });

    registrationTab.addEventListener('click', () => {
        postsTab.classList.remove('active');
        registrationTab.classList.add('active');
        bracketTab.classList.remove('active');
        postsContent.classList.remove('active');
        registrationContent.classList.add('active');
        bracketContent.classList.remove('active');
        loadRegistrations(tournamentId);
    });

    bracketTab.addEventListener('click', () => {
        postsTab.classList.remove('active');
        registrationTab.classList.remove('active');
        bracketTab.classList.add('active');
        postsContent.classList.remove('active');
        registrationContent.classList.remove('active');
        bracketContent.classList.add('active');
        loadBracket(tournamentId);
    });

    postsTab.classList.add('active');
    postsContent.classList.add('active');
}

async function loadTournamentPosts(tournamentId) {
    const postsContainer = document.getElementById('tournament-posts');
    postsContainer.innerHTML = `
        <div id="new-tournament-post">
            <textarea id="tournament-post-text" placeholder="Напишите пост для турнира... Используйте @username для тега"></textarea>
            <button id="submit-tournament-post">Опубликовать</button>
        </div>
        <div id="tournament-posts-list"></div>
    `;

    const submitTournamentPost = document.getElementById('submit-tournament-post');
    const tournamentPostText = document.getElementById('tournament-post-text');
    const tournamentPostsList = document.getElementById('tournament-posts-list');

    submitTournamentPost.addEventListener('click', async () => {
        const postContent = tournamentPostText.value.trim();
        if (!postContent) {
            alert('Пожалуйста, введите текст поста!');
            return;
        }
        const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
        const post = {
            tournament_id: tournamentId,
            text: text,
            timestamp: new Date().toISOString(),
            user_id: userData.telegramUsername
        };
        try {
            const newPost = await supabaseFetch('tournament_posts', 'POST', post);
            await notifyTaggedUsers(postContent, userData.fullname, userData.telegramUsername, newPost[0].id);
            tournamentPostText.value = '';
            loadTournamentPosts(tournamentId);
        } catch (error) {
            console.error('Error saving tournament post:', error);
            alert('Ошибка: ' + error.message);
        }
    });

    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=id.desc`, 'GET');
        tournamentPostsList.innerHTML = '';
        if (posts && posts.length > 0) {
            posts.forEach(post => {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post');
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
                `;
                tournamentPostsList.appendChild(postDiv);
            });
        } else {
            tournamentPostsList.innerHTML = '<p>Посты не найдены.</p>';
        }
    } catch (error) {
        console.error('Error loading tournament posts:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function loadRegistrations(tournamentId) {
    const registrationContainer = document.getElementById('registration-list');
    const registerBtn = document.getElementById('register-tournament-btn');
    const registrationForm = document.getElementById('registration-form');
    const submitRegistrationBtn = document.getElementById('submit-registration-btn');

    registerBtn.onclick = () => {
        registrationForm.classList.toggle('form-hidden');
    };

    submitRegistrationBtn.onclick = async () => {
        const factionName = document.getElementById('reg-faction-name').value.trim();
        const speaker1 = document.getElementById('reg-speaker1').value.trim();
        const speaker2 = document.getElementById('reg-speaker2').value.trim();
        const club = document.getElementById('reg-club').value.trim();
        const city = document.getElementById('reg-city').value.trim();
        const contacts = document.getElementById('reg-contacts').value.trim();
        const extra = document.getElementById('reg-extra').value.trim();

        if (!factionName || !speaker1 || !speaker2 || !club || !city || !contacts) {
            alert('Пожалуйста, заполните все обязательные поля!');
            return;
        }

        const registration = {
            tournament_id: tournamentId,
            user_id: userData.telegramUsername,
            faction_name: factionName,
            speaker1,
            speaker2,
            club,
            city,
            contacts,
            extra,
            status: 'pending'
        };

        try {
            await supabaseFetch('registrations', 'POST', registration);
            registrationForm.classList.add('form-hidden');
            document.getElementById('reg-faction-name').value = '';
            document.getElementById('reg-speaker1').value = '';
            document.getElementById('reg-speaker2').value = '';
            document.getElementById('reg-club').value = '';
            document.getElementById('reg-city').value = '';
            document.getElementById('reg-contacts').value = '';
            document.getElementById('reg-extra').value = '';
            loadRegistrations(tournamentId);
        } catch (error) {
            console.error('Error submitting registration:', error);
            alert('Ошибка: ' + error.message);
        }
    };

    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&order=created_at.desc`, 'GET');
        registrationContainer.innerHTML = '';
        if (registrations && registrations.length > 0) {
            registrations.forEach(reg => {
                const card = document.createElement('div');
                card.classList.add('registration-card');
                card.innerHTML = `
                    <strong>${reg.faction_name}</strong>
                    <p>Спикеры: ${reg.speaker1}, ${reg.speaker2}</p>
                    <p>Клуб: ${reg.club}</p>
                    <p>Город: ${reg.city}</p>
                    <p>Контакты: ${reg.contacts}</p>
                    ${reg.extra ? `<p>Дополнительно: ${reg.extra}</p>` : ''}
                    <p>Статус: ${reg.status === 'pending' ? 'Ожидает' : reg.status === 'approved' ? 'Подтверждено' : 'Отклонено'}</p>
                    ${reg.user_id === userData.telegramUsername ? `<button class="delete-registration-btn" onclick="deleteRegistration(${reg.id}, ${tournamentId})">Удалить</button>` : ''}
                `;
                registrationContainer.appendChild(card);
            });
        } else {
            registrationContainer.innerHTML = '<p>Регистрации не найдены.</p>';
        }
    } catch (error) {
        console.error('Error loading registrations:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function deleteRegistration(registrationId, tournamentId) {
    try {
        await supabaseFetch(`registrations?id=eq.${registrationId}`, 'DELETE');
        loadRegistrations(tournamentId);
    } catch (error) {
        console.error('Error deleting registration:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function loadBracket(tournamentId) {
    const bracketContainer = document.getElementById('tournament-bracket');
    bracketContainer.innerHTML = `
        <div id="bracket-form" class="form-hidden">
            <select id="bracket-team1">
                <option value="">Выберите первую команду</option>
            </select>
            <select id="bracket-team2">
                <option value="">Выберите вторую команду</option>
            </select>
            <input id="bracket-score1" type="number" placeholder="Счет первой команды">
            <input id="bracket-score2" type="number" placeholder="Счет второй команды">
            <input id="bracket-round" type="text" placeholder="Раунд (например, Полуфинал)">
            <button id="submit-bracket">Добавить матч</button>
        </div>
        <button id="toggle-bracket-form">Создать матч</button>
        <div id="bracket-list"></div>
    `;

    const toggleBracketForm = document.getElementById('toggle-bracket-form');
    const bracketForm = document.getElementById('bracket-form');
    const submitBracket = document.getElementById('submit-bracket');
    const team1Select = document.getElementById('bracket-team1');
    const team2Select = document.getElementById('bracket-team2');
    const bracketList = document.getElementById('bracket-list');

    toggleBracketForm.onclick = () => {
        bracketForm.classList.toggle('form-hidden');
    };

    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&status=eq.approved`, 'GET');
        if (registrations && registrations.length > 0) {
            registrations.forEach(reg => {
                const option1 = document.createElement('option');
                option1.value = reg.faction_name;
                option1.textContent = reg.faction_name;
                team1Select.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = reg.faction_name;
                option2.textContent = reg.faction_name;
                team2Select.appendChild(option2);
            });
        }
    } catch (error) {
        console.error('Error loading teams for bracket:', error);
    }

    submitBracket.onclick = async () => {
        const team1 = team1Select.value;
        const team2 = team2Select.value;
        const score1 = document.getElementById('bracket-score1').value;
        const score2 = document.getElementById('bracket-score2').value;
        const round = document.getElementById('bracket-round').value.trim();

        if (!team1 || !team2 || !round || score1 === '' || score2 === '') {
            alert('Пожалуйста, заполните все поля!');
            return;
        }

        if (team1 === team2) {
            alert('Команды должны быть разными!');
            return;
        }

        const match = {
            tournament_id: tournamentId,
            team1,
            team2,
            score1: parseInt(score1),
            score2: parseInt(score2),
            round
        };

        try {
            await supabaseFetch('brackets', 'POST', match);
            bracketForm.classList.add('form-hidden');
            team1Select.value = '';
            team2Select.value = '';
            document.getElementById('bracket-score1').value = '';
            document.getElementById('bracket-score2').value = '';
            document.getElementById('bracket-round').value = '';
            loadBracket(tournamentId);
        } catch (error) {
            console.error('Error submitting bracket:', error);
            alert('Ошибка: ' + error.message);
        }
    };

    try {
        const brackets = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}&order=created_at.asc`, 'GET');
        bracketList.innerHTML = '';
        if (brackets && brackets.length > 0) {
            const rounds = {};
            brackets.forEach(match => {
                if (!rounds[match.round]) {
                    rounds[match.round] = [];
                }
                rounds[match.round].push(match);
            });

            for (const round in rounds) {
                const roundDiv = document.createElement('div');
                roundDiv.classList.add('bracket-round');
                roundDiv.innerHTML = `<h3>${round}</h3>`;
                rounds[round].forEach(match => {
                    const matchDiv = document.createElement('div');
                    matchDiv.classList.add('bracket-match');
                    matchDiv.innerHTML = `
                        <p>${match.team1} vs ${match.team2}</p>
                        <p>Счет: ${match.score1} - ${match.score2}</p>
                    `;
                    roundDiv.appendChild(matchDiv);
                });
                bracketList.appendChild(roundDiv);
            }
        } else {
            bracketList.innerHTML = '<p>Сетка не найдена.</p>';
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
        alert('Ошибка: ' + error.message);
    }
}

const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');
const submitTournament = document.getElementById('submit-tournament');

createTournamentBtn.addEventListener('click', () => {
    createTournamentForm.classList.toggle('form-hidden');
});

submitTournament.addEventListener('click', async () => {
    const name = document.getElementById('tournament-name').value.trim();
    const date = document.getElementById('tournament-date').value.trim();
    const logo = document.getElementById('tournament-logo').value.trim();
    const description = document.getElementById('tournament-desc').value.trim();
    const address = document.getElementById('tournament-address').value.trim();
    const deadline = document.getElementById('tournament-deadline').value.trim();

    if (!name || !date || !description || !address || !deadline) {
        alert('Пожалуйста, заполните все обязательные поля!');
        return;
    }

    const tournament = {
        name,
        date,
        logo,
        description,
        address,
        deadline,
        created_by: userData.telegramUsername
    };

    try {
        await supabaseFetch('tournaments', 'POST', tournament);
        createTournamentForm.classList.add('form-hidden');
        document.getElementById('tournament-name').value = '';
        document.getElementById('tournament-date').value = '';
        document.getElementById('tournament-logo').value = '';
        document.getElementById('tournament-desc').value = '';
        document.getElementById('tournament-address').value = '';
        document.getElementById('tournament-deadline').value = '';
        loadTournaments();
    } catch (error) {
        console.error('Error creating tournament:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadRating() {
    const ratingList = document.getElementById('rating-list');
    ratingList.innerHTML = '<p>Загрузка рейтинга...</p>';

    try {
        const ratings = await supabaseFetch('ratings?order=points.desc', 'GET');
        ratingList.innerHTML = '';
        if (ratings && ratings.length > 0) {
            ratings.forEach((rating, index) => {
                const ratingItem = document.createElement('div');
                ratingItem.classList.add('rating-item');
                ratingItem.innerHTML = `
                    <p>${index + 1}. ${rating.user_id} - ${rating.points} очков</p>
                `;
                ratingList.appendChild(ratingItem);
            });
        } else {
            ratingList.innerHTML = '<p>Рейтинг не найден.</p>';
        }
    } catch (error) {
        console.error('Error loading rating:', error);
        alert('Ошибка загрузки рейтинга: ' + error.message);
    }
}

function showProfile() {
    document.getElementById('username').textContent = userData.telegramUsername;
    document.getElementById('fullname').value = userData.fullname;
    document.getElementById('telegram-id').value = userData.telegramId || '';
}

checkProfile();
