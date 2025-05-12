console.log('script.js loaded, version: 2025-05-12');

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const tg = window.Telegram.WebApp;
tg.ready();

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
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

async function saveChatId(userId) {
    if (tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ chat_id: tg.initDataUnsafe.user.id.toString() })
                .eq('telegram_username', userData.telegramUsername);
            if (error) throw error;
            console.log('Chat ID saved:', tg.initDataUnsafe.user.id);
            alert('Telegram успешно привязан!');
            showProfile();
        } catch (error) {
            console.error('Error saving chat_id:', error);
            alert('Ошибка привязки Telegram: ' + error.message);
        }
    } else {
        const botLink = `https://t.me/MyPKRBot?start=${userId}`;
        tg.openTelegramLink(botLink);
    }
}

async function showProfile() {
    const profileSection = document.getElementById('profile');
    try {
        const profiles = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
        if (profiles && profiles.length > 0) {
            const profile = profiles[0];
            const chatIdStatus = profile.chat_id ? `Привязан (ID: ${profile.chat_id})` : 'Не привязан';
            const avatarText = generateAvatarText(profile.fullname, userData.telegramUsername);
            profileSection.innerHTML = `
                <div id="profile-avatar" class="profile-avatar">${avatarText}</div>
                <h2>Профиль</h2>
                ${!profile.chat_id ? '<p style="color: #ff4d4d;">📢 Привяжите Telegram для уведомлений!</p>' : ''}
                <p>Username: <span>${userData.telegramUsername}</span></p>
                <p>Chat ID: <span>${chatIdStatus}</span></p>
                <input id="fullname" type="text" placeholder="Имя и фамилия" value="${profile.fullname || ''}">
                <button id="update-profile">Изменить имя</button>
                ${!profile.chat_id ? '<button id="link-telegram">Привязать Telegram</button>' : ''}
            `;
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
            if (!profile.chat_id) {
                document.getElementById('link-telegram').addEventListener('click', () => saveChatId(profiles[0].id));
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        profileSection.innerHTML += '<p>Ошибка загрузки профиля</p>';
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
            showApp();
            await saveChatId(profiles[0].id);
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
            fullname: userData.fullname,
            chat_id: tg.initDataUnsafe.user?.id?.toString() || null
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
        if (button.id === 'profile-btn') showProfile();
    });
});

const debouncedLoadPosts = debounce(loadPosts, 300);

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

async function processTags(text, postId) {
    const tagRegex = /@([a-zA-Z0-9_]+)/g;
    const tags = text.match(tagRegex) || [];
    for (const tag of tags) {
        const username = tag.slice(1);
        try {
            await supabaseFetch('tag_notifications', 'POST', {
                tagged_username: username,
                post_id: postId,
                user_id: userData.telegramUsername,
                text: text,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error sending tag notification:', error);
        }
    }
}

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
            await processTags(postContent, newPost[0].id);
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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
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
    const tagRegex = /@([a-zA-Z0-9_]+)/g;
    formattedContent = formattedContent.replace(tagRegex, (tag) => {
        return `<span class="tag">${tag}</span>`;
    });
    return formattedContent;
}

function generateAvatarText(name, username) {
    if (!name) {
        return username ? username.charAt(0).toUpperCase() : '?';
    }
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].charAt(0).toUpperCase();
    }
    return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}

function renderNewPost(post, prepend = false) {
    const postId = post.id;
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    postDiv.setAttribute('data-post-id', postId);

    const [userInfo, ...contentParts] = post.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    const avatarText = generateAvatarText(fullname, cleanUsername);

    const timeAgo = getTimeAgo(new Date(post.timestamp));

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <div class="user-avatar">${avatarText}</div>
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${formattedContent}</div>
        ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post image">` : ''}
        <div class="post-actions">
            <button class="reaction-btn like-btn" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'like')">👍 0</button>
            <button class="reaction-btn dislike-btn" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'dislike')">👎 0</button>
            <button class="comment-toggle-btn" data-post-id="${postId}" onclick="toggleComments(this.dataset.postId)">💬 Комментарии (0)</button>
        </div>
        <div class="comment-section" id="comments-${postId}" style="display: none;">
            <button id="new-comments-btn-${postId}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${postId}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий..."></textarea>
                <button data-post-id="${postId}" onclick="addComment(this.dataset.postId)">Отправить</button>
            </div>
        </div>
    `;

    if (prepend) {
        postsDiv.prepend(postDiv);
    } else {
        postsDiv.appendChild(postDiv);
    }

    loadReactionsAndComments(postId);
    subscribeToReactions(postId);
}

async function renderMorePosts(newPosts) {
    for (const post of newPosts) {
        const postId = post.id;
        const postDiv = document.createElement('div');
        postDiv.classList.add('post');
        postDiv.setAttribute('data-post-id', postId);

        const [userInfo, ...contentParts] = post.text.split(':\n');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';
        const content = contentParts.join(':\n');
        const formattedContent = formatPostContent(content);
        const avatarText = generateAvatarText(fullname, cleanUsername);

        const timeAgo = getTimeAgo(new Date(post.timestamp));

        postDiv.innerHTML = `
            <div class="post-header">
                <div class="post-user">
                    <div class="user-avatar">${avatarText}</div>
                    <strong>${fullname}</strong>
                    <span>@${cleanUsername}</span>
                </div>
                <div class="post-time">${timeAgo}</div>
            </div>
            <div class="post-content">${formattedContent}</div>
            ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post image">` : ''}
            <div class="post-actions">
                <button class="reaction-btn like-btn" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'like')">👍 0</button>
                <button class="reaction-btn dislike-btn" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'dislike')">👎 0</button>
                <button class="comment-toggle-btn" data-post-id="${postId}" onclick="toggleComments(this.dataset.postId)">💬 Комментарии (0)</button>
            </div>
            <div class="comment-section" id="comments-${postId}" style="display: none;">
                <button id="new-comments-btn-${postId}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
                <div class="comment-list" id="comment-list-${postId}" style="max-height: 200px; overflow-y: auto;"></div>
                <div class="comment-form">
                    <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий..."></textarea>
                    <button data-post-id="${postId}" onclick="addComment(this.dataset.postId)">Отправить</button>
                </div>
            </div>
        `;

        postsDiv.appendChild(postDiv);

        loadReactionsAndComments(postId);
        subscribeToReactions(postId);
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

        const postDiv = document.querySelector(`[data-post-id="${postId}"]`);
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
    const avatarText = generateAvatarText(fullname, cleanUsername);

    const timeAgo = getTimeAgo(new Date(post[0].timestamp));

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <div class="user-avatar">${avatarText}</div>
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${formattedContent}</div>
        ${post[0].image_url ? `<img src="${post[0].image_url}" class="post-image" alt="Post image">` : ''}
        <div class="post-actions">
            <button class="reaction-btn like-btn ${likeClass}" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'like')">👍 ${likes}</button>
            <button class="reaction-btn dislike-btn ${dislikeClass}" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'dislike')">👎 ${dislikes}</button>
            <button class="comment-toggle-btn" data-post-id="${postId}" onclick="toggleComments(this.dataset.postId)">💬 Комментарии (${commentCount})</button>
        </div>
        <div class="comment-section" id="comments-${postId}" style="display: none;">
            <button id="new-comments-btn-${postId}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${postId}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий..."></textarea>
                <button data-post-id="${postId}" onclick="addComment(this.dataset.postId)">Отправить</button>
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `post_id=eq.${postId}` }, (payload) => {
            console.log(`Reaction change detected for post ${postId}:`, payload);
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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, (payload) => {
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
}

function sortCommentsCache(postId) {
    const comments = commentsCache.get(postId);
    if (comments) {
        comments.sort((a, b) => a.id - b.id);
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

async function renderMoreComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    for (const comment of comments) {
        renderNewComment(postId, comment, false);
    }
}

async function renderNewComments(postId, comments, prepend = false) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    for (const comment of comments) {
        renderNewComment(postId, comment, prepend);
    }
}

function renderNewComment(postId, comment, prepend = false) {
    const commentDiv = document.createElement('div');
    commentDiv.classList.add('comment');
    const [userInfo, ...contentParts] = comment.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const avatarText = generateAvatarText(fullname, cleanUsername);

    const timeAgo = getTimeAgo(new Date(comment.timestamp));

    commentDiv.innerHTML = `
        <div class="comment-user">
            <div class="user-avatar">${avatarText}</div>
            <strong>${fullname}</strong>
            <span>@${cleanUsername}</span>
            <span class="team-club">${timeAgo}</span>
        </div>
        <div class="comment-content">${content}</div>
    `;

    const commentList = document.getElementById(`comment-list-${postId}`);
    if (prepend) {
        commentList.prepend(commentDiv);
    } else {
        commentList.appendChild(commentDiv);
    }
}

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const commentText = commentInput.value.trim();
    if (!commentText) {
        alert('Пожалуйста, введите текст комментария!');
        return;
    }
    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${commentText}`;
    const comment = {
        post_id: parseInt(postId),
        text: text,
        timestamp: new Date().toISOString(),
        user_id: userData.telegramUsername
    };
    try {
        await supabaseFetch('comments', 'POST', comment);
        commentInput.value = '';
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (commentSection.style.display === 'none') {
        commentSection.style.display = 'block';
    } else {
        commentSection.style.display = 'none';
    }
}

async function loadTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    tournamentList.innerHTML = '<div id="tournaments-loading" style="text-align: center; padding: 10px;">Загрузка...</div>';
    
    try {
        const tournaments = await supabaseFetch('tournaments?order=id.desc', 'GET');
        tournamentList.innerHTML = '';
        
        if (tournaments && tournaments.length > 0) {
            for (const tournament of tournaments) {
                const tournamentCard = document.createElement('div');
                tournamentCard.classList.add('tournament-card');
                tournamentCard.setAttribute('data-tournament-id', tournament.id);

                tournamentCard.innerHTML = `
                    <img src="${tournament.logo || 'https://via.placeholder.com/40'}" alt="Tournament Logo" class="tournament-logo">
                    <div class="tournament-info">
                        <strong>${tournament.name || 'Без названия'}</strong>
                        <span>${tournament.date ? new Date(tournament.date).toLocaleDateString('ru-RU') : 'Дата не указана'} | ${tournament.address || 'Адрес не указан'}</span>
                    </div>
                `;

                tournamentCard.addEventListener('click', () => {
                    currentTournamentId = tournament.id;
                    showTournamentDetails(tournament);
                });

                tournamentList.appendChild(tournamentCard);
            }
        } else {
            tournamentList.innerHTML = '<p>Турниров пока нет.</p>';
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        tournamentList.innerHTML = '<p>Ошибка загрузки турниров: ' + error.message + '</p>';
    }
}

async function loadTournamentPosts(tournamentId) {
    const tournamentPosts = document.getElementById('tournament-posts');
    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=id.desc`, 'GET');
        if (posts && posts.length > 0) {
            for (const post of posts) {
                if (!tournamentPosts.querySelector(`[data-post-id="${post.id}"]`)) {
                    renderTournamentPost(post, false);
                }
            }
        }
    } catch (error) {
        console.error('Error loading tournament posts:', error);
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `<p>Ошибка загрузки постов турнира: ${error.message}</p>`;
        tournamentPosts.appendChild(errorDiv);
    }
}

async function showTournamentDetails(tournament) {
    const tournamentDetails = document.getElementById('tournament-details');
    const tournamentHeader = document.getElementById('tournament-header');
    const tournamentDescription = document.getElementById('tournament-description');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');
    const tournamentPosts = document.getElementById('tournament-posts');
    const tournamentRegistration = document.getElementById('tournament-registration');
    const tournamentBracket = document.getElementById('tournament-bracket');
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');

    // Очистка содержимого перед загрузкой
    tournamentHeader.innerHTML = '';
    tournamentDescription.innerHTML = '';
    tournamentPosts.innerHTML = '';
    tournamentRegistration.innerHTML = '';
    tournamentBracket.innerHTML = '';

    // Заполняем заголовок турнира
    tournamentHeader.innerHTML = `
        ${tournament.logo ? `<img src="${tournament.logo}" alt="Tournament Logo">` : ''}
        <strong>${tournament.name || 'Без названия'}</strong>
        <p>Дата: ${tournament.date ? new Date(tournament.date).toLocaleDateString('ru-RU') : 'Не указана'}</p>
        <p>Адрес: ${tournament.address ? `<a href="${tournament.address}" target="_blank" rel="noopener noreferrer">${tournament.address}</a>` : 'Не указан'}</p>
        <p>Дедлайн: ${tournament.deadline ? new Date(tournament.deadline).toLocaleDateString('ru-RU') : 'Не указан'}</p>
    `;

    // Описание турнира
    tournamentDescription.textContent = tournament.description || 'Описание отсутствует.';
    toggleDescriptionBtn.addEventListener('click', () => {
        if (tournamentDescription.classList.contains('description-hidden')) {
            tournamentDescription.classList.remove('description-hidden');
            toggleDescriptionBtn.textContent = 'Свернуть описание';
        } else {
            tournamentDescription.classList.add('description-hidden');
            toggleDescriptionBtn.textContent = 'Развернуть описание';
        }
    });

    // Форма для нового поста в турнире
    const newTournamentPost = document.createElement('div');
    newTournamentPost.id = 'new-tournament-post';
    newTournamentPost.innerHTML = `
        <textarea id="tournament-post-text" placeholder="Что нового?"></textarea>
        <button id="submit-tournament-post">Твитнуть</button>
    `;
    tournamentPosts.appendChild(newTournamentPost);

    const submitTournamentPost = document.getElementById('submit-tournament-post');
    submitTournamentPost.addEventListener('click', async () => {
        const postContent = document.getElementById('tournament-post-text').value.trim();
        if (!postContent) {
            alert('Пожалуйста, введите текст поста!');
            return;
        }
        const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
        const post = {
            text: text,
            timestamp: new Date().toISOString(),
            user_id: userData.telegramUsername,
            tournament_id: currentTournamentId
        };
        try {
            const newPost = await supabaseFetch('tournament_posts', 'POST', post);
            document.getElementById('tournament-post-text').value = '';
            if (!tournamentPosts.querySelector(`[data-post-id="${newPost[0].id}"]`)) {
                renderTournamentPost(newPost[0], true);
            }
        } catch (error) {
            console.error('Error saving tournament post:', error);
            alert('Ошибка: ' + error.message);
        }
    });

    // Загружаем существующие посты турнира
    await loadTournamentPosts(currentTournamentId);

    // Вкладка регистрации
    tournamentRegistration.innerHTML = `
        <button id="register-tournament-btn">Зарегистрироваться</button>
        <div id="registration-form" class="form-hidden">
            <input id="reg-faction-name" type="text" placeholder="Название Фракции">
            <input id="reg-speaker1" type="text" placeholder="Имя и фамилия 1-го спикера">
            <input id="reg-speaker2" type="text" placeholder="Имя и фамилия 2-го спикера">
            <input id="reg-club" type="text" placeholder="Клуб">
            <input id="reg-city" type="text" placeholder="Город">
            <input id="reg-contacts" type="text" placeholder="Контакты">
            <textarea id="reg-extra" placeholder="Дополнительно (достижения)"></textarea>
            <button id="submit-registration-btn">Отправить</button>
        </div>
        <div id="registration-list"></div>
    `;

    const registerTournamentBtn = document.getElementById('register-tournament-btn');
    const registrationForm = document.getElementById('registration-form');
    const submitRegistrationBtn = document.getElementById('submit-registration-btn');
    const registrationList = document.getElementById('registration-list');

    registerTournamentBtn.addEventListener('click', () => {
        if (registrationForm.classList.contains('form-hidden')) {
            registrationForm.classList.remove('form-hidden');
        } else {
            registrationForm.classList.add('form-hidden');
        }
    });

    submitRegistrationBtn.addEventListener('click', async () => {
        const factionName = document.getElementById('reg-faction-name').value.trim();
        const speaker1 = document.getElementById('reg-speaker1').value.trim();
        const speaker2 = document.getElementById('reg-speaker2').value.trim();
        const club = document.getElementById('reg-club').value.trim();
        const city = document.getElementById('reg-city').value.trim();
        const contacts = document.getElementById('reg-contacts').value.trim();
        const extra = document.getElementById('reg-extra').value.trim();

        if (!factionName || !speaker1 || !speaker2 || !club || !city || !contacts) {
            alert('Заполните все обязательные поля!');
            return;
        }

        const registration = {
            tournament_id: currentTournamentId,
            faction_name: factionName,
            speaker1: speaker1,
            speaker2: speaker2,
            club: club,
            city: city,
            contacts: contacts,
            extra: extra,
            user_id: userData.telegramUsername,
            timestamp: new Date().toISOString()
        };

        try {
            const newRegistration = await supabaseFetch('tournament_registrations', 'POST', registration);
            registrationForm.classList.add('form-hidden');
            renderRegistration(newRegistration[0]);
        } catch (error) {
            console.error('Error submitting registration:', error);
            alert('Ошибка: ' + error.message);
        }
    });

    // Загружаем регистрации сразу, чтобы они отобразились при открытии вкладки
    const loadRegistrations = async () => {
        registrationList.innerHTML = '<div style="text-align: center; padding: 10px;">Загрузка...</div>';
        try {
            const registrations = await supabaseFetch(`tournament_registrations?tournament_id=eq.${currentTournamentId}`, 'GET');
            registrationList.innerHTML = '';
            if (registrations && registrations.length > 0) {
                for (const reg of registrations) {
                    renderRegistration(reg);
                }
            } else {
                registrationList.innerHTML = '<p>Регистраций пока нет.</p>';
            }
        } catch (error) {
            console.error('Error loading registrations:', error);
            registrationList.innerHTML = `<p>Ошибка загрузки регистраций: ${error.message}</p>`;
        }
    };

    // Вкладки
    postsTab.addEventListener('click', () => {
        postsTab.classList.add('active');
        registrationTab.classList.remove('active');
        bracketTab.classList.remove('active');
        tournamentPosts.classList.add('active');
        tournamentRegistration.classList.remove('active');
        tournamentBracket.classList.remove('active');
    });

    registrationTab.addEventListener('click', async () => {
        postsTab.classList.remove('active');
        registrationTab.classList.add('active');
        bracketTab.classList.remove('active');
        tournamentPosts.classList.remove('active');
        tournamentRegistration.classList.add('active');
        tournamentBracket.classList.remove('active');
        await loadRegistrations();
    });

    bracketTab.addEventListener('click', () => {
        postsTab.classList.remove('active');
        registrationTab.classList.remove('active');
        bracketTab.classList.add('active');
        tournamentPosts.classList.remove('active');
        tournamentRegistration.classList.remove('active');
        tournamentBracket.classList.add('active');
        loadBracket();
    });

    // Изначально показываем вкладку постов
    postsTab.classList.add('active');
    tournamentPosts.classList.add('active');
    tournamentRegistration.classList.remove('active');
    tournamentBracket.classList.remove('active');

    // Показываем секцию деталей турнира
    sections.forEach(section => section.classList.remove('active'));
    tournamentDetails.classList.add('active');
}

function renderTournamentPost(post, prepend = false) {
    const postId = post.id;
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    postDiv.setAttribute('data-post-id', postId);

    const [userInfo, ...contentParts] = post.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    const avatarText = generateAvatarText(fullname, cleanUsername);

    const timeAgo = getTimeAgo(new Date(post.timestamp));

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <div class="user-avatar">${avatarText}</div>
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${formattedContent}</div>
        <div class="post-actions">
            <button class="reaction-btn like-btn" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'like')">👍 0</button>
            <button class="reaction-btn dislike-btn" data-post-id="${postId}" onclick="toggleReaction(this.dataset.postId, 'dislike')">👎 0</button>
            <button class="comment-toggle-btn" data-post-id="${postId}" onclick="toggleComments(this.dataset.postId)">💬 Комментарии (0)</button>
        </div>
        <div class="comment-section" id="comments-${postId}" style="display: none;">
            <button id="new-comments-btn-${postId}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${postId}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий..."></textarea>
                <button data-post-id="${postId}" onclick="addComment(this.dataset.postId)">Отправить</button>
            </div>
        </div>
    `;

    const tournamentPosts = document.getElementById('tournament-posts');
    if (prepend) {
        tournamentPosts.insertBefore(postDiv, tournamentPosts.children[1]); // После формы нового поста
    } else {
        tournamentPosts.appendChild(postDiv);
    }

    loadReactionsAndComments(postId);
    subscribeToReactions(postId);
}

function renderRegistration(registration) {
    const registrationCard = document.createElement('div');
    registrationCard.classList.add('registration-card');
    const avatarText = generateAvatarText(registration.faction_name);

    registrationCard.innerHTML = `
        <strong>${registration.faction_name || 'Без названия'}</strong>
        <p>Спикеры: ${registration.speaker1 || 'Не указан'}, ${registration.speaker2 || 'Не указан'}</p>
        <p>Клуб: ${registration.club || 'Не указан'} (${registration.city || 'Не указан'})</p>
        <p>Контакты: ${registration.contacts || 'Не указаны'}</p>
        <p>Достижения: ${registration.extra || 'Нет данных'}</p>
        <button class="delete-registration-btn" data-registration-id="${registration.id}">Удалить</button>
    `;

    const deleteBtn = registrationCard.querySelector('.delete-registration-btn');
    deleteBtn.addEventListener('click', async () => {
        if (confirm('Вы уверены, что хотите удалить регистрацию?')) {
            try {
                await supabaseFetch(`tournament_registrations?id=eq.${registration.id}`, 'DELETE');
                registrationCard.remove();
            } catch (error) {
                console.error('Error deleting registration:', error);
                alert('Ошибка: ' + error.message);
            }
        }
    });

    const registrationList = document.getElementById('registration-list');
    registrationList.appendChild(registrationCard);
}

async function loadBracket() {
    const tournamentBracket = document.getElementById('tournament-bracket');
    tournamentBracket.innerHTML = '<div style="text-align: center; padding: 10px;">Загрузка...</div>';

    try {
        const bracket = await supabaseFetch(`tournament_brackets?tournament_id=eq.${currentTournamentId}`, 'GET');
        tournamentBracket.innerHTML = '';

        if (bracket && bracket.length > 0) {
            tournamentBracket.innerHTML = '<h2>Сетка</h2>';
            for (const round of bracket) {
                const roundDiv = document.createElement('div');
                roundDiv.classList.add('bracket-round');
                roundDiv.innerHTML = `<h3>${round.round_name || 'Раунд'}</h3>`;
                if (round.matches && Array.isArray(round.matches)) {
                    for (const match of round.matches) {
                        const matchDiv = document.createElement('div');
                        matchDiv.classList.add('bracket-match');
                        matchDiv.innerHTML = `
                            <p>${match.team1 || 'Команда 1'} vs ${match.team2 || 'Команда 2'}</p>
                            <p>Счет: ${match.score || 'Не определен'}</p>
                            ${match.winner ? `<p>Победитель: ${match.winner}</p>` : '<input type="text" placeholder="Победитель">'}
                        `;
                        roundDiv.appendChild(matchDiv);
                    }
                } else {
                    roundDiv.innerHTML += '<p>Матчи отсутствуют.</p>';
                }
                tournamentBracket.appendChild(roundDiv);
            }
            const publishBtn = document.createElement('button');
            publishBtn.id = 'publish-bracket-btn';
            publishBtn.textContent = 'Опубликовать сетку';
            publishBtn.addEventListener('click', () => {
                console.log('Publish bracket clicked');
            });
            tournamentBracket.appendChild(publishBtn);
        } else {
            tournamentBracket.innerHTML = `
                <div id="bracket-form">
                    <select id="round-select">
                        <option value="quarterfinals">1/4 финала</option>
                        <option value="semifinals">1/2 финала</option>
                        <option value="final">Финал</option>
                    </select>
                    <input type="text" id="team1-input" placeholder="Команда 1">
                    <input type="text" id="team2-input" placeholder="Команда 2">
                    <button id="add-match-btn">Добавить матч</button>
                </div>
            `;
            const addMatchBtn = document.getElementById('add-match-btn');
            addMatchBtn.addEventListener('click', async () => {
                const roundName = document.getElementById('round-select').value;
                const team1 = document.getElementById('team1-input').value.trim();
                const team2 = document.getElementById('team2-input').value.trim();
                if (team1 && team2) {
                    const match = { team1, team2, score: null, winner: null };
                    const bracketEntry = {
                        tournament_id: currentTournamentId,
                        round_name: roundName,
                        matches: [match]
                    };
                    try {
                        await supabaseFetch('tournament_brackets', 'POST', bracketEntry);
                        document.getElementById('team1-input').value = '';
                        document.getElementById('team2-input').value = '';
                        loadBracket();
                    } catch (error) {
                        console.error('Error adding match:', error);
                        alert('Ошибка: ' + error.message);
                    }
                } else {
                    alert('Укажите обе команды!');
                }
            });
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
        tournamentBracket.innerHTML = `<p>Ошибка загрузки сетки: ${error.message}</p>`;
    }
}

const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');
const submitTournament = document.getElementById('submit-tournament');

createTournamentBtn.addEventListener('click', () => {
    if (createTournamentForm.classList.contains('form-hidden')) {
        createTournamentForm.classList.remove('form-hidden');
    } else {
        createTournamentForm.classList.add('form-hidden');
    }
});

submitTournament.addEventListener('click', async () => {
    const name = document.getElementById('tournament-name').value.trim();
    const date = document.getElementById('tournament-date').value.trim();
    const logo = document.getElementById('tournament-logo').value.trim();
    const description = document.getElementById('tournament-desc').value.trim();
    const address = document.getElementById('tournament-address').value.trim();
    const deadline = document.getElementById('tournament-deadline').value.trim();

    if (!name || !date || !address || !deadline) {
        alert('Заполните все обязательные поля!');
        return;
    }

    const tournament = {
        name: name,
        date: date,
        logo: logo,
        description: description,
        address: address,
        deadline: deadline,
        user_id: userData.telegramUsername
    };

    try {
        await supabaseFetch('tournaments', 'POST', tournament);
        createTournamentForm.classList.add('form-hidden');
        loadTournaments();
    } catch (error) {
        console.error('Error creating tournament:', error);
        alert('Ошибка: ' + error.message);
    }
});

checkProfile();
