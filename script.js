console.log('script.js loaded, version: 2025-05-16');

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
        if (button.id === 'rating-btn') loadRating();
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

       halftime const comments = await supabaseFetch(`comments?post_id=eq.${postId}&order=id.asc&limit=10`, 'GET');
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

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const commentText = commentInput.value.trim();
    if (!commentText) {
        alert('Пожалуйста, введите текст комментария!');
        return;
    }

    try {
        const comment = {
            post_id: postId,
            user_id: userData.telegramUsername,
            text: `${userData.fullname} (@${userData.telegramUsername}): ${commentText}`,
            timestamp: new Date().toISOString()
        };
        const newComment = await supabaseFetch('comments', 'POST', comment);
        commentInput.value = '';
        if (!commentsCache.get(postId).some(c => c.id === newComment[0].id)) {
            commentsCache.get(postId).push(newComment[0]);
            sortCommentsCache(postId);
            await renderComments(postId, commentsCache.get(postId));
            updatePost(postId);
            await processTags(commentText, postId);
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function sortCommentsCache(postId) {
    const comments = commentsCache.get(postId);
    comments.sort((a, b) => a.id - b.id);
}

async function renderComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    commentList.innerHTML = '';
    for (const comment of comments) {
        const commentDiv = document.createElement('div');
        commentDiv.classList.add('comment');

        const [userInfo, content] = comment.text.split(': ');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';
        const formattedContent = formatPostContent(content);

        commentDiv.innerHTML = `
            <div class="comment-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="comment-content">${formattedContent}</div>
        `;
        commentList.appendChild(commentDiv);
    }
}

function renderMoreComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    for (const comment of comments) {
        const commentDiv = document.createElement('div');
        commentDiv.classList.add('comment');

        const [userInfo, content] = comment.text.split(': ');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';
        const formattedContent = formatPostContent(content);

        commentDiv.innerHTML = `
            <div class="comment-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="comment-content">${formattedContent}</div>
        `;
        commentList.prepend(commentDiv);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    const isVisible = commentSection.style.display !== 'none';
    commentSection.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        loadComments(postId);
        subscribeToComments(postId);
        const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
        if (newCommentsCount.get(postId) > 0) {
            newCommentsBtn.style.display = 'block';
            newCommentsBtn.classList.add('visible');
        }
    }
}

function subscribeToComments(postId) {
    if (commentChannels.has(postId)) {
        supabaseClient.removeChannel(commentChannels.get(postId));
    }

    const channel = supabaseClient
        .channel(`comments-channel-${postId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, (payload) => {
            const newComment = payload.new;
            if (!commentsCache.get(postId).some(c => c.id === newComment.id)) {
                commentsCache.get(postId).push(newComment);
                sortCommentsCache(postId);
                const commentSection = document.getElementById(`comments-${postId}`);
                if (commentSection.style.display !== 'none') {
                    renderComments(postId, commentsCache.get(postId));
                    updatePost(postId);
                } else {
                    newCommentsCount.set(postId, (newCommentsCount.get(postId) || 0) + 1);
                    const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
                    newCommentsBtn.style.display = 'block';
                    newCommentsBtn.classList.add('visible');
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

function setupCommentInfiniteScroll(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    commentList.removeEventListener('scroll', debouncedLoadMoreComments);
    commentList.addEventListener('scroll', debouncedLoadMoreComments);

    function debouncedLoadMoreComments() {
        const scrollBottom = commentList.scrollHeight - commentList.scrollTop - commentList.clientHeight;
        if (scrollBottom <= 200) {
            loadMoreComments(postId);
        }
    }
}

async function loadTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    tournamentList.innerHTML = '';
    try {
        const tournaments = await supabaseFetch('tournaments?order=created_at.desc', 'GET');
        if (tournaments) {
            for (const tournament of tournaments) {
                const tournamentCard = document.createElement('div');
                tournamentCard.classList.add('tournament-card');
                tournamentCard.innerHTML = `
                    <img src="${tournament.logo_url || 'https://via.placeholder.com/64'}" class="tournament-logo" alt="Tournament logo">
                    <div class="tournament-info">
                        <strong>${tournament.name}</strong>
                        <span>${new Date(tournament.date).toLocaleDateString('ru-RU')}</span>
                        <span>Дедлайн: ${new Date(tournament.registration_deadline).toLocaleDateString('ru-RU')}</span>
                    </div>
                `;
                tournamentCard.addEventListener('click', () => showTournamentDetails(tournament.id));
                tournamentList.appendChild(tournamentCard);
            }
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        tournamentList.innerHTML = '<p>Ошибка загрузки турниров</p>';
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
    const date = document.getElementById('tournament-date').value;
    const logoUrl = document.getElementById('tournament-logo').value.trim();
    const description = document.getElementById('tournament-desc').value.trim();
    const address = document.getElementById('tournament-address').value.trim();
    const deadline = document.getElementById('tournament-deadline').value;

    if (!name || !date || !deadline) {
        alert('Пожалуйста, заполните обязательные поля: Название, Дата, Дедлайн регистрации.');
        return;
    }

    try {
        await supabaseFetch('tournaments', 'POST', {
            name,
            date,
            logo_url: logoUrl || null,
            description: description || null,
            address: address || null,
            registration_deadline: deadline,
            creator_id: userData.telegramUsername
        });
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

async function showTournamentDetails(tournamentId) {
    currentTournamentId = tournamentId;
    sections.forEach(section => section.classList.remove('active'));
    document.getElementById('tournament-details').classList.add('active');

    const tournamentHeader = document.getElementById('tournament-header');
    const tournamentDescription = document.getElementById('tournament-description');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');

    try {
        const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
        if (tournament && tournament.length > 0) {
            const t = tournament[0];
            tournamentHeader.innerHTML = `
                ${t.logo_url ? `<img src="${t.logo_url}" alt="Tournament logo">` : ''}
                <strong>${t.name}</strong>
                <p>Дата: ${new Date(t.date).toLocaleDateString('ru-RU')}</p>
                <p>Дедлайн: ${new Date(t.registration_deadline).toLocaleDateString('ru-RU')}</p>
                ${t.address ? `<p><a href="${t.address}" target="_blank">Адрес</a></p>` : ''}
            `;
            tournamentDescription.innerHTML = t.description ? `<p>${t.description}</p>` : '<p>Описание отсутствует</p>';
            tournamentDescription.classList.add('description-hidden');

            toggleDescriptionBtn.style.display = t.description ? 'block' : 'none';
            toggleDescriptionBtn.addEventListener('click', () => {
                tournamentDescription.classList.toggle('description-hidden');
                toggleDescriptionBtn.textContent = tournamentDescription.classList.contains('description-hidden') ? 'Развернуть описание' : 'Свернуть описание';
            });

            setupTournamentTabs(t);
        }
    } catch (error) {
        console.error('Error loading tournament details:', error);
        tournamentHeader.innerHTML = '<p>Ошибка загрузки деталей турнира</p>';
    }
}

function setupTournamentTabs(tournament) {
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');
    const tournamentPosts = document.getElementById('tournament-posts');
    const tournamentRegistration = document.getElementById('tournament-registration');
    const tournamentBracket = document.getElementById('tournament-bracket');

    postsTab.addEventListener('click', () => {
        postsTab.classList.add('active');
        registrationTab.classList.remove('active');
        bracketTab.classList.remove('active');
        tournamentPosts.classList.add('active');
        tournamentRegistration.classList.remove('active');
        tournamentBracket.classList.remove('active');
        loadTournamentPosts(tournament.id, tournament.creator_id);
    });

    registrationTab.addEventListener('click', () => {
        postsTab.classList.remove('active');
        registrationTab.classList.add('active');
        bracketTab.classList.remove('active');
        tournamentPosts.classList.remove('active');
        tournamentRegistration.classList.add('active');
        tournamentBracket.classList.remove('active');
        loadRegistrations(tournament.id, tournament.creator_id);
    });

    bracketTab.addEventListener('click', () => {
        postsTab.classList.remove('active');
        registrationTab.classList.remove('active');
        bracketTab.classList.add('active');
        tournamentPosts.classList.remove('active');
        tournamentRegistration.classList.remove('active');
        tournamentBracket.classList.add('active');
        loadBracket(tournament.id, tournament.creator_id);
    });

    loadTournamentPosts(tournament.id, tournament.creator_id);
}

async function loadTournamentPosts(tournamentId, creatorId) {
    const tournamentPosts = document.getElementById('tournament-posts');
    tournamentPosts.innerHTML = '';

    if (userData.telegramUsername === creatorId) {
        tournamentPosts.innerHTML = `
            <div id="new-tournament-post">
                <textarea id="tournament-post-text" placeholder="Напишите пост от имени турнира..."></textarea>
                <button id="submit-tournament-post">Опубликовать</button>
            </div>
            <div id="tournament-posts-list"></div>
        `;
        document.getElementById('submit-tournament-post').addEventListener('click', async () => {
            const postText = document.getElementById('tournament-post-text').value.trim();
            if (!postText) {
                alert('Пожалуйста, введите текст поста!');
                return;
            }
            try {
                await supabaseFetch('tournament_posts', 'POST', {
                    tournament_id: tournamentId,
                    text: postText,
                    timestamp: new Date().toISOString(),
                    user_id: userData.telegramUsername
                });
                document.getElementById('tournament-post-text').value = '';
                loadTournamentPosts(tournamentId, creatorId);
            } catch (error) {
                console.error('Error posting tournament post:', error);
                alert('Ошибка: ' + error.message);
            }
        });
    }

    const postsList = document.getElementById('tournament-posts-list') || tournamentPosts;
    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=timestamp.desc`, 'GET');
        if (posts) {
            for (const post of posts) {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post');
                const timeAgo = getTimeAgo(new Date(post.timestamp));
                postDiv.innerHTML = `
                    <div class="post-header">
                        <div class="post-user">
                            <strong>Турнир</strong>
                            <span>@${post.user_id}</span>
                        </div>
                        <div class="post-time">${timeAgo}</div>
                    </div>
                    <div class="post-content">${formatPostContent(post.text)}</div>
                `;
                postsList.appendChild(postDiv);
            }
        }
    } catch (error) {
        console.error('Error loading tournament posts:', error);
        postsList.innerHTML = '<p>Ошибка загрузки постов</p>';
    }
}

async function loadRegistrations(tournamentId, creatorId) {
    const tournamentRegistration = document.getElementById('tournament-registration');
    const registrationForm = document.getElementById('registration-form');
    const registerBtn = document.getElementById('register-tournament-btn');
    const registrationList = document.getElementById('registration-list');

    if (userData.telegramUsername === creatorId) {
        registerBtn.style.display = 'none';
        registrationForm.style.display = 'none';
    } else {
        registerBtn.style.display = 'block';
        registrationForm.classList.add('form-hidden');
        registerBtn.addEventListener('click', () => {
            registrationForm.classList.toggle('form-hidden');
        });
    }

    const submitRegistrationBtn = document.getElementById('submit-registration-btn');
    submitRegistrationBtn.addEventListener('click', async () => {
        const factionName = document.getElementById('reg-faction-name').value.trim();
        const speaker1 = document.getElementById('reg-speaker1').value.trim();
        const speaker2 = document.getElementById('reg-speaker2').value.trim();
        const club = document.getElementById('reg-club').value.trim();
        const city = document.getElementById('reg-city').value.trim();
        const contacts = document.getElementById('reg-contacts').value.trim();
        const extra = document.getElementById('reg-extra').value.trim();

        if (!factionName || !speaker1 || !speaker2 || !contacts) {
            alert('Пожалуйста, заполните обязательные поля: Название фракции, Спикер 1, Спикер 2, Контакты.');
            return;
        }

        try {
            await supabaseFetch('registrations', 'POST', {
                tournament_id: tournamentId,
                faction_name: factionName,
                speaker1,
                speaker2,
                club: club || null,
                city: city || null,
                contacts,
                extra: extra || null,
                user_id: userData.telegramUsername
            });
            registrationForm.classList.add('form-hidden');
            document.getElementById('reg-faction-name').value = '';
            document.getElementById('reg-speaker1').value = '';
            document.getElementById('reg-speaker2').value = '';
            document.getElementById('reg-club').value = '';
            document.getElementById('reg-city').value = '';
            document.getElementById('reg-contacts').value = '';
            document.getElementById('reg-extra').value = '';
            loadRegistrations(tournamentId, creatorId);
        } catch (error) {
            console.error('Error submitting registration:', error);
            alert('Ошибка: ' + error.message);
        }
    });

    registrationList.innerHTML = '';
    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}`, 'GET');
        if (registrations) {
            for (const reg of registrations) {
                const regCard = document.createElement('div');
                regCard.classList.add('registration-card');
                regCard.innerHTML = `
                    <strong>${reg.faction_name}</strong>
                    <p>Спикер 1: ${reg.speaker1}</p>
                    <p>Спикер 2: ${reg.speaker2}</p>
                    ${reg.club ? `<p>Клуб: ${reg.club}</p>` : ''}
                    ${reg.city ? `<p>Город: ${reg.city}</p>` : ''}
                    <p>Контакты: ${reg.contacts}</p>
                    ${reg.extra ? `<p>Дополнительно: ${reg.extra}</p>` : ''}
                    ${userData.telegramUsername === creatorId ? `<button class="delete-registration-btn" data-reg-id="${reg.id}">Удалить</button>` : ''}
                `;
                registrationList.appendChild(regCard);
            }

            if (userData.telegramUsername === creatorId) {
                document.querySelectorAll('.delete-registration-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const regId = btn.dataset.regId;
                        try {
                            await supabaseFetch(`registrations?id=eq.${regId}`, 'DELETE');
                            loadRegistrations(tournamentId, creatorId);
                        } catch (error) {
                            console.error('Error deleting registration:', error);
                            alert('Ошибка: ' + error.message);
                        }
                    });
                });
            }
        }
    } catch (error) {
        console.error('Error loading registrations:', error);
        registrationList.innerHTML = '<p>Ошибка загрузки регистраций</p>';
    }
}

async function loadBracket(tournamentId, creatorId) {
    const tournamentBracket = document.getElementById('tournament-bracket');
    tournamentBracket.innerHTML = '';

    if (userData.telegramUsername === creatorId) {
        tournamentBracket.innerHTML = `
            <div id="bracket-form">
                <select id="bracket-format">
                    <option value="APF">АПФ (2 команды)</option>
                    <option value="BPF">БПФ (4 команды)</option>
                </select>
                <input id="bracket-factions" type="number" placeholder="Количество фракций" min="2">
                <input id="bracket-rounds" type="number" placeholder="Количество раундов" min="1">
                <button id="generate-bracket">Сгенерировать сетку</button>
            </div>
            <div id="bracket-list"></div>
        `;
        document.getElementById('generate-bracket').addEventListener('click', async () => {
            const format = document.getElementById('bracket-format').value;
            const factions = parseInt(document.getElementById('bracket-factions').value);
            const rounds = parseInt(document.getElementById('bracket-rounds').value);

            if (!factions || factions < 2 || !rounds || rounds < 1) {
                alert('Пожалуйста, укажите корректное количество фракций (мин. 2) и раундов (мин. 1).');
                return;
            }

            try {
                const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}`, 'GET');
                if (!registrations || registrations.length < factions) {
                    alert('Недостаточно зарегистрированных команд для указанного количества фракций.');
                    return;
                }

                const matches = [];
                for (let r = 1; r <= rounds; r++) {
                    const shuffled = registrations.sort(() => Math.random() - 0.5);
                    for (let i = 0; i < factions; i += format === 'APF' ? 2 : 4) {
                        const teams = shuffled.slice(i, i + (format === 'APF' ? 2 : 4)).map(t => t.faction_name);
                        if (teams.length === (format === 'APF' ? 2 : 4)) {
                            matches.push({
                                round: r,
                                teams,
                                room: '',
                                judges: ''
                            });
                        }
                    }
                }

                await supabaseFetch('brackets', 'POST', {
                    tournament_id: tournamentId,
                    format,
                    factions,
                    rounds,
                    matches,
                    is_published: false
                });
                loadBracket(tournamentId, creatorId);
            } catch (error) {
                console.error('Error generating bracket:', error);
                alert('Ошибка: ' + error.message);
            }
        });
    }

    const bracketList = document.getElementById('bracket-list') || tournamentBracket;
    try {
        const brackets = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}`, 'GET');
        if (brackets && brackets.length > 0) {
            const bracket = brackets[0];
            if (bracket.is_published || userData.telegramUsername === creatorId) {
                const matches = bracket.matches;
                let currentRound = 0;
                let roundDiv = null;

                for (const match of matches) {
                    if (match.round !== currentRound) {
                        currentRound = match.round;
                        roundDiv = document.createElement('div');
                        roundDiv.classList.add('bracket-round');
                        roundDiv.innerHTML = `<h3>Раунд ${currentRound}</h3>`;
                        bracketList.appendChild(roundDiv);
                    }

                    const matchDiv = document.createElement('div');
                    matchDiv.classList.add('bracket-match');
                    matchDiv.innerHTML = `
                        <p>Команды: ${match.teams.join(', ')}</p>
                        ${match.room ? `<p>Кабинет: ${match.room}</p>` : ''}
                        ${match.judges ? `<p>Судьи: ${match.judges}</p>` : ''}
                    `;
                    if (userData.telegramUsername === creatorId && !bracket.is_published) {
                        matchDiv.innerHTML += `
                            <input type="text" class="bracket-room" placeholder="Кабинет" value="${match.room || ''}">
                            <input type="text" class="bracket-judges" placeholder="Судьи" value="${match.judges || ''}">
                        `;
                    }
                    roundDiv.appendChild(matchDiv);
                }

                if (userData.telegramUsername === creatorId && !bracket.is_published) {
                    const publishBtn = document.createElement('button');
                    publishBtn.id = 'publish-bracket-btn';
                    publishBtn.textContent = 'Опубликовать сетку';
                    publishBtn.addEventListener('click', async () => {
                        const updatedMatches = matches.map((match, index) => {
                            const matchDiv = bracketList.querySelectorAll('.bracket-match')[index];
                            const roomInput = matchDiv.querySelector('.bracket-room');
                            const judgesInput = matchDiv.querySelector('.bracket-judges');
                            return {
                                ...match,
                                room: roomInput ? roomInput.value.trim() : match.room,
                                judges: judgesInput ? judgesInput.value.trim() : match.judges
                            };
                        });

                        try {
                            await supabaseFetch(`brackets?id=eq.${bracket.id}`, 'PATCH', {
                                matches: updatedMatches,
                                is_published: true
                            });
                            loadBracket(tournamentId, creatorId);
                        } catch (error) {
                            console.error('Error publishing bracket:', error);
                            alert('Ошибка: ' + error.message);
                        }
                    });
                    bracketList.appendChild(publishBtn);
                }
            } else {
                bracketList.innerHTML = '<p>Сетка еще не опубликована.</p>';
            }
        } else {
            bracketList.innerHTML = '<p>Сетка не создана.</p>';
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
        bracketList.innerHTML = '<p>Ошибка загрузки сетки</p>';
    }
}

// Rating section logic
const rankingData = [
    { name: 'Олжас Сейтов', points: 948, position: 1, club: 'derbes' },
    { name: 'Мұхаммедәлі Әлішбаев', points: 936, position: 2, club: 'TEO' },
    { name: 'Нұрболат Тілеубай', points: 872, position: 3, club: 'KBTU' },
    { name: 'Темірлан Есенов', points: 785, position: 4, club: 'TEO' },
    { name: 'Нұрхан Жакен', points: 733, position: 5, club: 'AS' },
    { name: 'Динара Әукенова', points: 671.5, position: 6, club: 'TEO' },
    { name: 'Ерасыл Шаймурадов', points: 665, position: 7, club: 'СДУ' },
    { name: 'Алтынай Қалдыбай', points: 600.5, position: 8, club: 'ДЕРБЕС' },
    { name: 'Жандос Әмре', points: 558, position: 9, club: 'ЮАЙБИ' },
    { name: 'Ердаулет Қалмұрат', points: 462, position: 10, club: 'СДУ' },
    { name: 'Арайлым Абдукаримова', points: 460, position: 11, club: 'ТЭО' },
    { name: 'Ақылжан Итегулов', points: 440.5, position: 12, club: 'ДЕРБЕС' },
    { name: 'Ерғалым Айтжанов', points: 430.5, position: 13, club: 'ТЭО' },
    { name: 'Еламан Әбдіманапов', points: 421, position: 14, club: 'ЗИЯЛЫ' },
    { name: 'Жансерік Жолшыбек', points: 411, position: 15, club: 'СИРИУС' },
    { name: 'Регина Жардемгалиева', points: 400, position: 16, club: 'ТЭО' },
    { name: 'Айдана Мухамет', points: 396, position: 17, club: 'НЛО' },
    { name: 'Азамат Арынов', points: 377, position: 18, club: 'СДУ' },
    { name: 'Адема Сералиева', points: 373.5, position: 19, club: 'ТЭО' },
    { name: 'Әлібек Сұлтанов', points: 351, position: 20, club: 'АС' },
    { name: 'Гаухар Төлебай', points: 345, position: 21, club: 'СДУ' },
    { name: 'Әсет Оразғали', points: 336, position: 22, club: 'СДУ' },
    { name: 'Ислам Аманқос', points: 326.5, position: 23, club: 'СДУ' },
    { name: 'Арсен Сәуірбай', points: 322.5, position: 24, club: 'СДУ' },
    { name: 'Дәулет Мырзакулов', points: 282, position: 25, club: 'АС' },
    { name: 'Димаш Әшірбек', points: 274, position: 26, club: 'СДУ' },
    { name: 'Ерлан Бөлекбаев', points: 268, position: 27, club: 'ТЭО' },
    { name: 'Ахансері Амиреев', points: 263, position: 28, club: 'СИРИУС' },
    { name: 'Айша Қуандық', points: 255.5, position: 29, club: 'СДУ' },
    { name: 'Диас Мухамет', points: 254, position: 30, club: 'ТЕХНО' }
];

function loadRating() {
    const ratingCities = document.getElementById('rating-cities');
    const ratingYears = document.getElementById('rating-years');
    const ratingList = document.getElementById('rating-list');

    ratingCities.style.display = 'block';
    ratingYears.style.display = 'none';
    ratingList.style.display = 'none';

    ratingCities.innerHTML = '<div class="city-card" data-city="Алматы">Алматы</div>';

    ratingCities.querySelectorAll('.city-card').forEach(card => {
        card.addEventListener('click', () => {
            ratingCities.style.display = 'none';
            ratingYears.style.display = 'block';
            ratingList.style.display = 'none';

            ratingYears.innerHTML = '<div class="year-card" data-year="2024-2025">2024-2025</div>';

            ratingYears.querySelectorAll('.year-card').forEach(yearCard => {
                yearCard.addEventListener('click', () => {
                    ratingCities.style.display = 'none';
                    ratingYears.style.display = 'none';
                    ratingList.style.display = 'block';

                    ratingList.innerHTML = '';
                    rankingData.forEach(speaker => {
                        const speakerCard = document.createElement('div');
                        speakerCard.classList.add('ranking-card', `rank-${speaker.position}`);
                        speakerCard.innerHTML = `
                            <div class="ranking-position">${speaker.position}</div>
                            <div class="ranking-info">
                                <strong>${speaker.name}</strong>
                                <span>${speaker.points} баллов | Клуб: ${speaker.club}</span>
                            </div>
                        `;
                        ratingList.appendChild(speakerCard);
                    });
                });
            });
        });
    });
}

checkProfile();
