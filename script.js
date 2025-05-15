console.log('script.js loaded, version: 2025-05-15');

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
            profileSection.innerHTML = `
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
        if (button.id === 'rating-btn') initRating();
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
    if (submitPost.disabled) return;
    submitPost.disabled = true;

    const postContent = postText.value.trim();
    if (!postContent) {
        alert('Пожалуйста, введите текст поста! Пустые посты не допускаются.');
        submitPost.disabled = false;
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
    } finally {
        submitPost.disabled = false;
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

function renderNewPosts'

(newPosts, prepend = false) {
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

    const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
    if (newCommentsBtn) {
        newCommentsBtn.addEventListener('click', () => {
            loadNewComments(postId);
            newCommentsBtn.style.display = 'none';
            newCommentsCount.set(postId, 0);
        });
    }

    subscribeToNewComments(postId);
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
        await renderNewComment(postId, comment, false);
    }
}

async function renderNewComment(postId, comment, prepend = false) {
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
            <span>@${cleanUsername}</span>
        </div>
        <div class="comment-content">${formattedContent}</div>
        <div class="comment-time">${timeAgo}</div>
    `;

    if (prepend) {
        commentList.appendChild(commentDiv);
        commentList.scrollTop = commentList.scrollHeight;
    } else {
        commentList.insertBefore(commentDiv, commentList.firstChild);
    }
}

async function renderMoreComments(postId, newComments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    for (const comment of newComments) {
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
                <span>@${cleanUsername}</span>
            </div>
            <div class="comment-content">${formattedContent}</div>
            <div class="comment-time">${timeAgo}</div>
        `;

        commentList.insertBefore(commentDiv, commentList.firstChild);
    }
}

async function renderNewComments(postId, newComments, prepend = false) {
    for (const comment of newComments) {
        await renderNewComment(postId, comment, prepend);
    }
}

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const commentContent = commentInput.value.trim();
    if (!commentContent) {
        alert('Пожалуйста, введите комментарий!');
        return;
    }

    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${commentContent}`;
    try {
        const newComment = await supabaseFetch('comments', 'POST', {
            post_id: postId,
            text: text,
            user_id: userData.telegramUsername,
            timestamp: new Date().toISOString()
        });

        commentInput.value = '';
        const currentComments = commentsCache.get(postId) || [];
        if (!currentComments.some(c => c.id === newComment[0].id)) {
            commentsCache.set(postId, [...currentComments, newComment[0]]);
            sortCommentsCache(postId);
            renderNewComment(postId, newComment[0], true);
            lastCommentIds.set(postId, newComment[0].id);

            const commentBtn = postsDiv.querySelector(`[data-post-id="${postId}"] .comment-toggle-btn`);
            if (commentBtn) {
                const currentCount = commentsCache.get(postId).length;
                commentBtn.innerHTML = `💬 Комментарии (${currentCount})`;
            }
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (commentSection.style.display === 'none') {
        commentSection.style.display = 'block';
        loadComments(postId);
    } else {
        commentSection.style.display = 'none';
    }
}

async function loadTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    tournamentList.innerHTML = '<div>Загрузка турниров...</div>';

    try {
        const tournaments = await supabaseFetch('tournaments?order=date.asc', 'GET');
        tournamentList.innerHTML = '';

        if (tournaments && tournaments.length > 0) {
            for (const tournament of tournaments) {
                const tournamentCard = document.createElement('div');
                tournamentCard.classList.add('tournament-card');
                tournamentCard.innerHTML = `
                    <img src="${tournament.logo_url || 'https://via.placeholder.com/64'}" class="tournament-logo" alt="Tournament logo">
                    <div class="tournament-info">
                        <strong>${tournament.name}</strong>
                        <span>📅 ${new Date(tournament.date).toLocaleDateString()}</span>
                        <span>📍 ${tournament.address || 'Не указан'}</span>
                    </div>
                `;
                tournamentCard.addEventListener('click', () => showTournamentDetails(tournament.id));
                tournamentList.appendChild(tournamentCard);
            }
        } else {
            tournamentList.innerHTML = '<div>Турниры не найдены</div>';
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        tournamentList.innerHTML = '<div>Ошибка загрузки турниров</div>';
    }
}

const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');

createTournamentBtn.addEventListener('click', () => {
    createTournamentForm.classList.toggle('form-hidden');
});

document.getElementById('submit-tournament').addEventListener('click', async () => {
    const tournamentData = {
        name: document.getElementById('tournament-name').value.trim(),
        date: document.getElementById('tournament-date').value,
        logo_url: document.getElementById('tournament-logo').value.trim() || 'https://via.placeholder.com/64',
        description: document.getElementById('tournament-desc').value.trim(),
        address: document.getElementById('tournament-address').value.trim(),
        registration_deadline: document.getElementById('tournament-deadline').value,
        created_by: userData.telegramUsername
    };

    if (!tournamentData.name || !tournamentData.date) {
        alert('Название и дата турнира обязательны!');
        return;
    }

    try {
        await supabaseFetch('tournaments', 'POST', tournamentData);
        createTournamentForm.classList.add('form-hidden');
        document.getElementById('tournament-name').value = '';
        document.getElementById('tournament-date').value = '';
        document.getElementById('tournament-logo').value = '';
        document.getElementById('tournament-desc').value = '';
        document.getElementById('tournament-address').value = '';
        document.getElementById('tournament-deadline').value = '';
        await loadTournaments();
        alert('Турнир успешно создан!');
    } catch (error) {
        console.error('Error creating tournament:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function showTournamentDetails(tournamentId) {
    currentTournamentId = tournamentId;
    sections.forEach(section => section.classList.remove('active'));
    const tournamentDetailsSection = document.getElementById('tournament-details');
    tournamentDetailsSection.classList.add('active');
    buttons.forEach(btn => btn.classList.remove('active'));
    document.getElementById('tournaments-btn').classList.add('active');

    const tournamentHeader = document.getElementById('tournament-header');
    const tournamentDescription = document.getElementById('tournament-description');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');

    try {
        const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
        if (tournament && tournament.length > 0) {
            const t = tournament[0];
            tournamentHeader.innerHTML = `
                <img src="${t.logo_url || 'https://via.placeholder.com/180'}" alt="Tournament logo" class="tournament-logo-large">
                <strong>${t.name}</strong>
                <p>📅 ${new Date(t.date).toLocaleDateString()}</p>
                <p>📍 ${t.address || 'Не указан'}</p>
                <p>⏰ Дедлайн регистрации: ${t.registration_deadline ? new Date(t.registration_deadline).toLocaleDateString() : 'Не указан'}</p>
                <p>👤 Организатор: @${t.created_by}</p>
            `;
            tournamentDescription.innerHTML = `<p>${t.description || 'Описание отсутствует'}</p>`;
            toggleDescriptionBtn.textContent = 'Развернуть описание';
            tournamentDescription.classList.add('description-hidden');

            toggleDescriptionBtn.onclick = () => {
                tournamentDescription.classList.toggle('description-hidden');
                toggleDescriptionBtn.textContent = tournamentDescription.classList.contains('description-hidden')
                    ? 'Развернуть описание'
                    : 'Свернуть описание';
            };

            setupTournamentTabs(tournamentId);
            loadTournamentPosts(tournamentId);
        } else {
            tournamentHeader.innerHTML = '<p>Турнир не найден</p>';
            tournamentDescription.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading tournament details:', error);
        tournamentHeader.innerHTML = '<p>Ошибка загрузки турнира</p>';
        tournamentDescription.innerHTML = '';
    }
}

function setupTournamentTabs(tournamentId) {
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');
    const postsContent = document.getElementById('tournament-posts');
    const registrationContent = document.getElementById('tournament-registration');
    const bracketContent = document.getElementById('tournament-bracket');

    const tabs = [postsTab, registrationTab, bracketTab];
    const contents = [postsContent, registrationContent, bracketContent];

    tabs.forEach((tab, index) => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            contents[index].classList.add('active');

            if (tab.id === 'posts-tab') loadTournamentPosts(tournamentId);
            if (tab.id === 'registration-tab') loadTournamentRegistrations(tournamentId);
            if (tab.id === 'bracket-tab') loadTournamentBracket(tournamentId);
        };
    });

    postsTab.click();
}

async function loadTournamentPosts(tournamentId) {
    const postsContent = document.getElementById('tournament-posts');
    postsContent.innerHTML = `
        <div id="new-tournament-post">
            <textarea id="tournament-post-text" placeholder="Написать пост..."></textarea>
            <button id="submit-tournament-post">Опубликовать</button>
        </div>
        <div id="tournament-posts-list"></div>
    `;

    const submitTournamentPost = document.getElementById('submit-tournament-post');
    const tournamentPostText = document.getElementById('tournament-post-text');

    submitTournamentPost.addEventListener('click', async () => {
        if (submitTournamentPost.disabled) return;
        submitTournamentPost.disabled = true;

        const postContent = tournamentPostText.value.trim();
        if (!postContent) {
            alert('Пожалуйста, введите текст поста!');
            submitTournamentPost.disabled = false;
            return;
        }

        const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
        try {
            const newPost = await supabaseFetch('tournament_posts', 'POST', {
                tournament_id: tournamentId,
                text: text,
                user_id: userData.telegramUsername,
                timestamp: new Date().toISOString()
            });
            tournamentPostText.value = '';
            loadTournamentPosts(tournamentId);
            await processTags(postContent, newPost[0].id);
        } catch (error) {
            console.error('Error posting to tournament:', error);
            alert('Ошибка: ' + error.message);
        } finally {
            submitTournamentPost.disabled = false;
        }
    });

    const postsList = document.getElementById('tournament-posts-list');
    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=timestamp.desc`, 'GET');
        postsList.innerHTML = '';

        if (posts && posts.length > 0) {
            for (const post of posts) {
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
                `;
                postsList.appendChild(postDiv);
            }
        } else {
            postsList.innerHTML = '<div>Посты отсутствуют</div>';
        }
    } catch (error) {
        console.error('Error loading tournament posts:', error);
        postsList.innerHTML = '<div>Ошибка загрузки постов</div>';
    }
}

async function loadTournamentRegistrations(tournamentId) {
    const registrationContent = document.getElementById('tournament-registration');
    const registrationList = document.getElementById('registration-list');
    registrationList.innerHTML = '<div>Загрузка регистраций...</div>';

    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}`, 'GET');
        registrationList.innerHTML = '';

        if (registrations && registrations.length > 0) {
            for (const reg of registrations) {
                const regCard = document.createElement('div');
                regCard.classList.add('registration-card');
                regCard.innerHTML = `
                    <strong>${reg.faction_name} (${reg.club || 'Без клуба'})</strong>
                    <p>Спикер 1: ${reg.speaker1}</p>
                    <p>Спикер 2: ${reg.speaker2}</p>
                    <p>Город: ${reg.city || 'Не указан'}</p>
                    <p>Контакты: ${reg.contacts || 'Не указаны'}</p>
                    <p>Дополнительно: ${reg.extra || 'Отсутствует'}</p>
                    ${reg.user_id === userData.telegramUsername ? `<button class="delete-registration-btn" onclick="deleteRegistration(${reg.id}, ${tournamentId})">Удалить</button>` : ''}
                `;
                registrationList.appendChild(regCard);
            }
        } else {
            registrationList.innerHTML = '<div>Регистрации отсутствуют</div>';
        }
    } catch (error) {
        console.error('Error loading registrations:', error);
        registrationList.innerHTML = '<div>Ошибка загрузки регистраций</div>';
    }

    const registerBtn = document.getElementById('register-tournament-btn');
    const registrationForm = document.getElementById('registration-form');

    registerBtn.onclick = () => {
        registrationForm.classList.toggle('form-hidden');
    };

    document.getElementById('submit-registration-btn').addEventListener('click', async () => {
        const registrationData = {
            tournament_id: tournamentId,
            faction_name: document.getElementById('reg-faction-name').value.trim(),
            speaker1: document.getElementById('reg-speaker1').value.trim(),
            speaker2: document.getElementById('reg-speaker2').value.trim(),
            club: document.getElementById('reg-club').value.trim(),
            city: document.getElementById('reg-city').value.trim(),
            contacts: document.getElementById('reg-contacts').value.trim(),
            extra: document.getElementById('reg-extra').value.trim(),
            user_id: userData.telegramUsername
        };

        if (!registrationData.faction_name || !registrationData.speaker1 || !registrationData.speaker2) {
            alert('Название фракции, спикер 1 и спикер 2 обязательны!');
            return;
        }

        try {
            await supabaseFetch('registrations', 'POST', registrationData);
            registrationForm.classList.add('form-hidden');
            document.getElementById('reg-faction-name').value = '';
            document.getElementById('reg-speaker1').value = '';
            document.getElementById('reg-speaker2').value = '';
            document.getElementById('reg-club').value = '';
            document.getElementById('reg-city').value = '';
            document.getElementById('reg-contacts').value = '';
            document.getElementById('reg-extra').value = '';
            loadTournamentRegistrations(tournamentId);
            alert('Регистрация успешна!');
        } catch (error) {
            console.error('Error registering for tournament:', error);
            alert('Ошибка: ' + error.message);
        }
    }, { once: true });
}

async function deleteRegistration(registrationId, tournamentId) {
    if (!confirm('Вы уверены, что хотите удалить регистрацию?')) return;

    try {
        await supabaseFetch(`registrations?id=eq.${registrationId}`, 'DELETE');
        loadTournamentRegistrations(tournamentId);
        alert('Регистрация удалена!');
    } catch (error) {
        console.error('Error deleting registration:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function loadTournamentBracket(tournamentId) {
    const bracketContent = document.getElementById('tournament-bracket');
    bracketContent.innerHTML = '<div>Загрузка сетки...</div>';

    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}`, 'GET');
        const brackets = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}`, 'GET');

        bracketContent.innerHTML = `
            <div id="bracket-form" class="form-hidden">
                <select id="bracket-format">
                    <option value="APF">APF</option>
                    <option value="BPF">BPF</option>
                </select>
                <input type="text" id="bracket-round" placeholder="Название раунда">
                <button id="generate-bracket">Сгенерировать сетку</button>
            </div>
            <button id="create-bracket-btn">Создать сетку</button>
            <div id="bracket-list"></div>
        `;

        const createBracketBtn = document.getElementById('create-bracket-btn');
        const bracketForm = document.getElementById('bracket-form');

        createBracketBtn.onclick = () => {
            bracketForm.classList.toggle('form-hidden');
        };

        document.getElementById('generate-bracket').addEventListener('click', async () => {
            const format = document.getElementById('bracket-format').value;
            const roundName = document.getElementById('bracket-round').value.trim();

            if (!roundName) {
                alert('Пожалуйста, укажите название раунда!');
                return;
            }

            try {
                const bracketData = {
                    tournament_id: tournamentId,
                    format: format,
                    round_name: roundName,
                    matches: generateBracketMatches(registrations, format),
                    created_by: userData.telegramUsername
                };

                await supabaseFetch('brackets', 'POST', bracketData);
                bracketForm.classList.add('form-hidden');
                document.getElementById('bracket-round').value = '';
                loadTournamentBracket(tournamentId);
                alert('Сетка успешно создана!');
            } catch (error) {
                console.error('Error generating bracket:', error);
                alert('Ошибка: ' + error.message);
            }
        }, { once: true });

        const bracketList = document.getElementById('bracket-list');
        bracketList.innerHTML = '';

        if (brackets && brackets.length > 0) {
            for (const b of brackets) {
                const bracketRound = document.createElement('div');
                bracketRound.classList.add('bracket-round');
                bracketRound.innerHTML = `<h3>${b.round_name} (${b.format})</h3>`;

                for (const match of b.matches) {
                    const matchDiv = document.createElement('div');
                    matchDiv.classList.add('bracket-match');
                    matchDiv.innerHTML = `
                        <p>Команда 1: ${match.team1 || 'TBD'}</p>
                        <p>Команда 2: ${match.team2 || 'TBD'}</p>
                        <p>Результат: ${match.result || 'Не определён'}</p>
                        ${b.created_by === userData.telegramUsername ? `
                            <input type="text" class="match-result" placeholder="Результат матча" data-match-id="${match.id}">
                            <button onclick="updateMatchResult(${b.id}, ${match.id}, this.previousElementSibling.value)">Обновить</button>
                        ` : ''}
                    `;
                    bracketRound.appendChild(matchDiv);
                }
                bracketList.appendChild(bracketRound);
            }

            bracketList.innerHTML += `<button id="publish-bracket-btn" onclick="publishBracket(${tournamentId})">Опубликовать сетку</button>`;
        } else {
            bracketList.innerHTML = '<div>Сетка не создана</div>';
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
        bracketContent.innerHTML = '<div>Ошибка загрузки сетки</div>';
    }
}

function generateBracketMatches(registrations, format) {
    const matches = [];
    const teams = registrations.map(r => r.faction_name);
    const shuffledTeams = teams.sort(() => Math.random() - 0.5);

    if (format === 'APF') {
        for (let i = 0; i < shuffledTeams.length; i += 2) {
            if (i + 1 < shuffledTeams.length) {
                matches.push({
                    id: matches.length + 1,
                    team1: shuffledTeams[i],
                    team2: shuffledTeams[i + 1],
                    result: null
                });
            }
        }
    } else if (format === 'BPF') {
        for (let i = 0; i < shuffledTeams.length; i += 4) {
            if (i + 3 < shuffledTeams.length) {
                matches.push({
                    id: matches.length + 1,
                    team1: shuffledTeams[i],
                    team2: shuffledTeams[i + 1],
                    team3: shuffledTeams[i + 2],
                    team4: shuffledTeams[i + 3],
                    result: null
                });
            }
        }
    }

    return matches;
}

async function updateMatchResult(bracketId, matchId, result) {
    try {
        const bracket = await supabaseFetch(`brackets?id=eq.${bracketId}`, 'GET');
        if (bracket && bracket.length > 0) {
            const matches = bracket[0].matches;
            const matchIndex = matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
                matches[matchIndex].result = result;
                await supabaseFetch(`brackets?id=eq.${bracketId}`, 'PATCH', { matches: matches });
                loadTournamentBracket(bracket[0].tournament_id);
                alert('Результат матча обновлён!');
            }
        }
    } catch (error) {
        console.error('Error updating match result:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function publishBracket(tournamentId) {
    try {
        const bracket = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}`, 'GET');
        if (bracket && bracket.length > 0) {
            const text = `Сетка турнира опубликована!\n${bracket.map(b => `${b.round_name} (${b.format}):\n${b.matches.map(m => `${m.team1 || 'TBD'} vs ${m.team2 || 'TBD'}${m.result ? ` - ${m.result}` : ''}`).join('\n')}`).join('\n\n')}`;
            await supabaseFetch('tournament_posts', 'POST', {
                tournament_id: tournamentId,
                text: text,
                user_id: userData.telegramUsername,
                timestamp: new Date().toISOString()
            });
            alert('Сетка опубликована в постах турнира!');
        } else {
            alert('Сетка не найдена!');
        }
    } catch (error) {
        console.error('Error publishing bracket:', error);
        alert('Ошибка: ' + error.message);
    }
}

const speakers = [
    { name: 'Олжас Сейтов', points: 948, rank: 1, club: 'derbes' },
    { name: 'Мұхаммедәлі Әлішбаев', points: 936, rank: 2, club: 'TEO' },
    { name: 'Нұрболат Тілеубай', points: 872, rank: 3, club: 'KBTU' },
    { name: 'Темірлан Есенов', points: 785, rank: 4, club: 'TEO' },
    { name: 'Нұр漢 Жакен', points: 733, rank: 5, club: 'AS' },
    { name: 'Динара Әукенова', points: 671.5, rank: 6, club: 'TEO' },
    { name: 'Ерасыл Шаймурадов', points: 665, rank: 7, club: 'СДУ' },
    { name: 'Алтынай Қалдыбай', points: 600.5, rank: 8, club: 'ДЕРБЕС' },
    { name: 'Жандос Әмре', points: 558, rank: 9, club: 'ЮАЙБИ' },
    { name: 'Ердаулет Қалмұрат', points: 462, rank: 10, club: 'СДУ' },
    { name: 'Арайлым Абдукаримова', points: 460, rank: 11, club: 'ТЭО' },
    { name: 'Ақылжан Итегулов', points: 440.5, rank: 12, club: 'ДЕРБЕС' },
    { name: 'Ерғалым Айтжанов', points: 430.5, rank: 13, club: 'ТЭО' },
    { name: 'Еламан Әбдіманапов', points: 421, rank: 14, club: 'ЗИЯЛЫ' },
    { name: 'Жансерік Жолшыбек', points: 411, rank: 15, club: 'СИРИУС' },
    { name: 'Регина Жардемгалиева', points: 400, rank: 16, club: 'ТЭО' },
    { name: 'Айдана Мухамет', points: 396, rank: 17, club: 'НЛО' },
    { name: 'Азамат Арынов', points: 377, rank: 18, club: 'СДУ' },
    { name: 'Адема Сералиева', points: 373.5, rank: 19, club: 'ТЭО' },
    { name: 'Әлібек Сұлтанов', points: 351, rank: 20, club: 'АС' },
    { name: 'Гаухар Төлебай', points: 345, rank: 21, club: 'СДУ' },
    { name: 'Әсет Оразғали', points: 336, rank: 22, club: 'СДУ' },
    { name: 'Ислам Аманқос', points: 326.5, rank: 23, club: 'СДУ' },
    { name: 'Арсен Сәуірбай', points: 322.5, rank: 24, club: 'СДУ' },
    { name: 'Дәулет Мырзакулов', points: 282, rank: 25, club: 'АС' },
    { name: 'Димаш Әшірbeck', points: 274, rank: 26, club: 'СДУ' },
    { name: 'Ерлан Бөлекбаев', points: 268, rank: 27, club: 'ТЭО' },
    { name: 'Ахансері Амиреев', points: 263, rank: 28, club: 'СИРИУС' },
    { name: 'Айша Қуандық', points: 255.5, rank: 29, club: 'СДУ' },
    { name: 'Диас Мухамет', points: 254, rank: 30, club: 'ТЕХНО' }
];

function initRating() {
    const cityList = document.getElementById('city-list');
    const yearList = document.getElementById('year-list');
    const speakersList = document.getElementById('speakers-list');

    cityList.style.display = 'block';
    yearList.style.display = 'none';
    speakersList.style.display = 'none';

    const cityItems = cityList.querySelectorAll('.rating-item');
    cityItems.forEach(item => {
        item.onclick = () => {
            cityList.style.display = 'none';
            yearList.style.display = 'block';
            speakersList.style.display = 'none';
        };
    });

    const yearItems = yearList.querySelectorAll('.rating-item');
    yearItems.forEach(item => {
        item.onclick = () => {
            cityList.style.display = 'none';
            yearList.style.display = 'none';
            speakersList.style.display = 'block';
            renderSpeakers();
        };
    });
}

function renderSpeakers() {
    const speakersList = document.getElementById('speakers-list');
    speakersList.innerHTML = '';

    speakers.forEach(speaker => {
        const speakerDiv = document.createElement('div');
        speakerDiv.classList.add('speaker-item', `rank-${speaker.rank}`);
        speakerDiv.innerHTML = `
            <div class="speaker-info">
                <div class="speaker-name">${speaker.name}</div>
                <div class="speaker-club">${speaker.club}</div>
            </div>
            <div class="speaker-points">${speaker.points}</div>
            <div class="speaker-rank">${speaker.rank}</div>
        `;
        speakersList.appendChild(speakerDiv);
    });
}

checkProfile();
