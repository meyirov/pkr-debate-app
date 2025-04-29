console.log('script.js loaded, version: 2025-04-29');

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
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    try {
        const { data, error } = await supabaseClient.storage
            .from('post-images')
            .upload(fileName, file);
        if (error) throw error;
        const { data: urlData } = supabaseClient.storage
            .from('post-images')
            .getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
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
const attachImageBtn = document.getElementById('attach-image-btn');
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

attachImageBtn.addEventListener('click', () => {
    postImage.click();
});

submitPost.addEventListener('click', async () => {
    const postContent = postText.value.trim();
    if (!postContent && !postImage.files[0]) {
        alert('Пожалуйста, введите текст или прикрепите изображение!');
        return;
    }
    let imageUrl = null;
    if (postImage.files[0]) {
        try {
            imageUrl = await uploadImage(postImage.files[0]);
        } catch (error) {
            alert('Ошибка загрузки изображения: ' + error.message);
            return;
        }
    }
    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
    const post = {
        text: text,
        image_url: imageUrl,
        timestamp: new Date().toISOString(),
        user_id: userData.telegramUsername
    };
    try {
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

function renderNewPost(post, prepend = false) {
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    postDiv.setAttribute('data-post-id', post.id);

    const [userInfo, ...contentParts] = post.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');

    const timeAgo = getTimeAgo(new Date(post.timestamp));

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${content}</div>
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

        const timeAgo = getTimeAgo(new Date(post.timestamp));

        postDiv.innerHTML = `
            <div class="post-header">
                <div class="post-user">
                    <strong>${fullname}</strong>
                    <span>@${cleanUsername}</span>
                </div>
                <div class="post-time">${timeAgo}</div>
            </div>
            <div class="post-content">${content}</div>
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

    const timeAgo = getTimeAgo(new Date(post[0].timestamp));

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${content}</div>
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

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const commentText = commentInput.value.trim();
    if (!commentText) {
        alert('Пожалуйста, введите комментарий!');
        return;
    }

    const comment = {
        post_id: postId,
        user_id: userData.telegramUsername,
        text: `${userData.fullname} (@${userData.telegramUsername}): ${commentText}`,
        timestamp: new Date().toISOString()
    };

    try {
        const newComment = await supabaseFetch('comments', 'POST', comment);
        commentInput.value = '';
        updatePost(postId);
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function renderComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    commentList.innerHTML = '';

    for (const comment of comments) {
        const commentDiv = document.createElement('div');
        commentDiv.classList.add('comment');

        const [userInfo, ...contentParts] = comment.text.split(': ');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';
        const content = contentParts.join(': ');

        commentDiv.innerHTML = `
            <div class="comment-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="comment-content">${content}</div>
        `;

        commentList.appendChild(commentDiv);
    }
}

function sortCommentsCache(postId) {
    const comments = commentsCache.get(postId);
    if (comments) {
        comments.sort((a, b) => a.id - b.id);
        commentsCache.set(postId, comments);
    }
}

function setupCommentInfiniteScroll(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    commentList.addEventListener('scroll', debounce(async () => {
        const scrollBottom = commentList.scrollHeight - commentList.scrollTop - commentList.clientHeight;
        if (scrollBottom <= 200 && !isLoadingMore) {
            await loadMoreComments(postId);
        }
    }, 300));
}

async function loadMoreComments(postId) {
    if (isLoadingMore) return;

    isLoadingMore = true;
    const lastCommentId = lastCommentIds.get(postId);

    try {
        const query = lastCommentId
            ? `comments?post_id=eq.${postId}&id=gt.${lastCommentId}&order=id.asc&limit=10`
            : `comments?post_id=eq.${postId}&order=id.asc&limit=10`;
        const moreComments = await supabaseFetch(query, 'GET');

        if (moreComments && moreComments.length > 0) {
            const currentComments = commentsCache.get(postId);
            const newComments = moreComments.filter(comment => !currentComments.some(c => c.id === comment.id));
            if (newComments.length > 0) {
                commentsCache.set(postId, [...currentComments, ...newComments]);
                sortCommentsCache(postId);
                await renderComments(postId, commentsCache.get(postId));
                lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
            }
        }
    } catch (error) {
        console.error('Error loading more comments:', error);
    } finally {
        isLoadingMore = false;
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    commentSection.style.display = commentSection.style.display === 'none' ? 'block' : 'none';
}

async function loadTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    tournamentList.innerHTML = '';

    try {
        const tournaments = await supabaseFetch('tournaments?order=timestamp.desc', 'GET');
        if (tournaments) {
            for (const tournament of tournaments) {
                const card = document.createElement('div');
                card.classList.add('tournament-card');
                card.innerHTML = `
                    <img src="${tournament.logo || 'https://via.placeholder.com/64'}" class="tournament-logo" alt="Tournament Logo">
                    <div class="tournament-info">
                        <strong>${tournament.name}</strong>
                        <span>${tournament.date}</span>
                        <span>${tournament.address.split('/').pop()}</span>
                    </div>
                `;
                card.addEventListener('click', () => loadTournamentDetails(tournament.id));
                tournamentList.appendChild(card);
            }
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        alert('Ошибка загрузки турниров: ' + error.message);
    }
}

const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');
createTournamentBtn.addEventListener('click', () => {
    createTournamentForm.classList.toggle('form-hidden');
});

const submitTournament = document.getElementById('submit-tournament');
submitTournament.addEventListener('click', async () => {
    const tournamentData = {
        name: document.getElementById('tournament-name').value.trim(),
        date: document.getElementById('tournament-date').value.trim(),
        logo: document.getElementById('tournament-logo').value.trim(),
        desc: document.getElementById('tournament-desc').value.trim(),
        address: document.getElementById('tournament-address').value.trim(),
        deadline: document.getElementById('tournament-deadline').value.trim(),
        creator_id: userData.telegramUsername,
        timestamp: new Date().toISOString()
    };

    if (!tournamentData.name || !tournamentData.date || !tournamentData.address) {
        alert('Пожалуйста, заполните обязательные поля: название, дата, адрес!');
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
        loadTournaments();
    } catch (error) {
        console.error('Error creating tournament:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadTournamentDetails(tournamentId) {
    currentTournamentId = tournamentId;
    sections.forEach(section => section.classList.remove('active'));
    document.getElementById('tournament-details').classList.add('active');

    try {
        const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
        if (tournament && tournament.length > 0) {
            const t = tournament[0];
            document.getElementById('tournament-header').innerHTML = `
                <img src="${t.logo || 'https://via.placeholder.com/150'}" alt="Tournament Logo">
                <strong>${t.name}</strong>
                <p>📅 ${t.date}</p>
                <p>📍 ${t.address}</p>
                <p>⏰ Дедлайн: ${t.deadline}</p>
            `;
            document.getElementById('tournament-description').innerHTML = `<p>${t.desc}</p>`;
            document.getElementById('tournament-description').classList.add('description-hidden');

            const toggleDescriptionBtn = document.getElementById('toggle-description-btn');
            toggleDescriptionBtn.innerHTML = 'Развернуть описание';
            toggleDescriptionBtn.onclick = () => {
                const descDiv = document.getElementById('tournament-description');
                descDiv.classList.toggle('description-hidden');
                toggleDescriptionBtn.innerHTML = descDiv.classList.contains('description-hidden')
                    ? 'Развернуть описание'
                    : 'Свернуть описание';
            };

            const isCreator = t.creator_id === userData.telegramUsername;
            setupTournamentTabs(tournamentId, isCreator);
            loadTournamentPosts(tournamentId, isCreator);
        }
    } catch (error) {
        console.error('Error loading tournament details:', error);
        alert('Ошибка: ' + error.message);
    }
}

function setupTournamentTabs(tournamentId, isCreator) {
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');
    const tournamentPosts = document.getElementById('tournament-posts');
    const tournamentRegistration = document.getElementById('tournament-registration');
    const tournamentBracket = document.getElementById('tournament-bracket');

    postsTab.classList.add('active');
    tournamentPosts.classList.add('active');
    registrationTab.classList.remove('active');
    tournamentRegistration.classList.remove('active');
    bracketTab.classList.remove('active');
    tournamentBracket.classList.remove('active');

    postsTab.onclick = () => {
        postsTab.classList.add('active');
        tournamentPosts.classList.add('active');
        registrationTab.classList.remove('active');
        tournamentRegistration.classList.remove('active');
        bracketTab.classList.remove('active');
        tournamentBracket.classList.remove('active');
        loadTournamentPosts(tournamentId, isCreator);
    };

    registrationTab.onclick = () => {
        postsTab.classList.remove('active');
        tournamentPosts.classList.remove('active');
        registrationTab.classList.add('active');
        tournamentRegistration.classList.add('active');
        bracketTab.classList.remove('active');
        tournamentBracket.classList.remove('active');
        loadRegistrations(tournamentId, isCreator);
    };

    bracketTab.onclick = () => {
        postsTab.classList.remove('active');
        tournamentPosts.classList.remove('active');
        registrationTab.classList.remove('active');
        tournamentRegistration.classList.remove('active');
        bracketTab.classList.add('active');
        tournamentBracket.classList.add('active');
        loadBracket(tournamentId, isCreator);
    };
}

async function loadTournamentPosts(tournamentId, isCreator) {
    const tournamentPostsList = document.getElementById('tournament-posts');
    tournamentPostsList.innerHTML = '';

    if (isCreator) {
        const newPostDiv = document.createElement('div');
        newPostDiv.id = 'new-tournament-post';
        newPostDiv.innerHTML = `
            <textarea id="tournament-post-text" placeholder="Напишите объявление от имени турнира..."></textarea>
            <button id="submit-tournament-post">Опубликовать</button>
        `;
        tournamentPostsList.appendChild(newPostDiv);

        document.getElementById('submit-tournament-post').addEventListener('click', async () => {
            const postText = document.getElementById('tournament-post-text').value.trim();
            if (!postText) {
                alert('Пожалуйста, введите текст поста!');
                return;
            }
            const post = {
                tournament_id: tournamentId,
                creator_id: userData.telegramUsername,
                text: postText,
                timestamp: new Date().toISOString()
            };
            try {
                await supabaseFetch('tournament_posts', 'POST', post);
                document.getElementById('tournament-post-text').value = '';
                loadTournamentPosts(tournamentId, isCreator);
            } catch (error) {
                console.error('Error posting tournament post:', error);
                alert('Ошибка: ' + error.message);
            }
        });
    }

    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=timestamp.desc`, 'GET');
        if (posts) {
            for (const post of posts) {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post');
                const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
                const timeAgo = getTimeAgo(new Date(post.timestamp));
                postDiv.innerHTML = `
                    <div class="post-header">
                        <div class="post-user">
                            <strong>${tournament[0].name}</strong>
                            <span>@${post.creator_id}</span>
                        </div>
                        <div class="post-time">${timeAgo}</div>
                    </div>
                    <div class="post-content">${post.text}</div>
                `;
                tournamentPostsList.appendChild(postDiv);
            }
        }
    } catch (error) {
        console.error('Error loading tournament posts:', error);
    }
}

const registerTournamentBtn = document.getElementById('register-tournament-btn');
const registrationForm = document.getElementById('registration-form');
registerTournamentBtn.addEventListener('click', () => {
    registrationForm.classList.toggle('form-hidden');
});

const submitRegistrationBtn = document.getElementById('submit-registration-btn');
submitRegistrationBtn.addEventListener('click', async () => {
    const registrationData = {
        tournament_id: currentTournamentId,
        faction_name: document.getElementById('reg-faction-name').value.trim(),
        speaker1: document.getElementById('reg-speaker1').value.trim(),
        speaker2: document.getElementById('reg-speaker2').value.trim(),
        club: document.getElementById('reg-club').value.trim(),
        city: document.getElementById('reg-city').value.trim(),
        contacts: document.getElementById('reg-contacts').value.trim(),
        extra: document.getElementById('reg-extra').value.trim(),
        timestamp: new Date().toISOString()
    };

    if (!registrationData.faction_name || !registrationData.speaker1 || !registrationData.speaker2) {
        alert('Пожалуйста, заполните обязательные поля: название фракции, спикеры!');
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
        loadRegistrations(currentTournamentId);
    } catch (error) {
        console.error('Error submitting registration:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadRegistrations(tournamentId, isCreator = false) {
    const registrationList = document.getElementById('registration-list');
    registrationList.innerHTML = '';

    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&order=timestamp.asc`, 'GET');
        if (registrations) {
            for (const reg of registrations) {
                const card = document.createElement('div');
                card.classList.add('registration-card');
                card.innerHTML = `
                    <strong>${reg.faction_name}</strong>
                    <p>Спикер 1: ${reg.speaker1}</p>
                    <p>Спикер 2: ${reg.speaker2}</p>
                    <p>Клуб: ${reg.club || 'Не указан'}</p>
                    <p>Город: ${reg.city || 'Не указан'}</p>
                    <p>Контакты: ${reg.contacts || 'Не указаны'}</p>
                    <p>Достижения: ${reg.extra || 'Не указаны'}</p>
                `;
                if (isCreator) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.classList.add('delete-registration-btn');
                    deleteBtn.innerText = 'Удалить';
                    deleteBtn.onclick = async () => {
                        try {
                            await supabaseFetch(`registrations?id=eq.${reg.id}`, 'DELETE');
                            loadRegistrations(tournamentId, isCreator);
                        } catch (error) {
                            console.error('Error deleting registration:', error);
                            alert('Ошибка: ' + error.message);
                        }
                    };
                    card.appendChild(deleteBtn);
                }
                registrationList.appendChild(card);
            }
        }
    } catch (error) {
        console.error('Error loading registrations:', error);
    }
}

async function loadBracket(tournamentId, isCreator) {
    const tournamentBracket = document.getElementById('tournament-bracket');
    tournamentBracket.innerHTML = '';

    try {
        const bracket = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}`, 'GET');
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}`, 'GET');

        if (isCreator && (!bracket || bracket.length === 0)) {
            const bracketForm = document.createElement('div');
            bracketForm.id = 'bracket-form';
            bracketForm.innerHTML = `
                <select id="bracket-format">
                    <option value="АПФ">АПФ</option>
                    <option value="БПФ">БПФ</option>
                </select>
                <input id="faction-count" type="number" placeholder="Количество фракций">
                <input id="round-count" type="number" placeholder="Количество раундов">
                <button id="generate-bracket">Сгенерировать сетку</button>
            `;
            tournamentBracket.appendChild(bracketForm);

            document.getElementById('generate-bracket').addEventListener('click', async () => {
                const format = document.getElementById('bracket-format').value;
                const factionCount = parseInt(document.getElementById('faction-count').value);
                const roundCount = parseInt(document.getElementById('round-count').value);

                if (!factionCount || !roundCount || factionCount < 2 || roundCount < 1) {
                    alert('Пожалуйста, укажите корректные значения для фракций и раундов!');
                    return;
                }

                if (registrations.length < factionCount) {
                    alert('Недостаточно зарегистрированных команд для указанного количества фракций!');
                    return;
                }

                const shuffledFactions = registrations.sort(() => 0.5 - Math.random()).slice(0, factionCount);
                const matches = [];
                for (let round = 1; round <= roundCount; round++) {
                    const roundMatches = [];
                    for (let i = 0; i < factionCount / 2; i++) {
                        roundMatches.push({
                            faction1: shuffledFactions[i * 2].faction_name,
                            faction2: shuffledFactions[i * 2 + 1].faction_name,
                            room: '',
                            judge: ''
                        });
                    }
                    matches.push(roundMatches);
                    shuffledFactions.sort(() => 0.5 - Math.random());
                }

                const bracketData = {
                    tournament_id: tournamentId,
                    format: format,
                    faction_count: factionCount,
                    round_count: roundCount,
                    matches: matches,
                    published: false,
                    timestamp: new Date().toISOString()
                };

                try {
                    await supabaseFetch('brackets', 'POST', bracketData);
                    loadBracket(tournamentId, isCreator);
                } catch (error) {
                    console.error('Error generating bracket:', error);
                    alert('Ошибка: ' + error.message);
                }
            });
        }

        if (bracket && bracket.length > 0) {
            const b = bracket[0];
            tournamentBracket.innerHTML = `<h2>Сетка (${b.format})</h2>`;
            if (isCreator && !b.published) {
                const publishBtn = document.createElement('button');
                publishBtn.id = 'publish-bracket-btn';
                publishBtn.innerText = 'Опубликовать сетку';
                publishBtn.onclick = async () => {
                    try {
                        await supabaseFetch(`brackets?id=eq.${b.id}`, 'PATCH', { published: true });
                        loadBracket(tournamentId, isCreator);
                    } catch (error) {
                        console.error('Error publishing bracket:', error);
                        alert('Ошибка: ' + error.message);
                    }
                };
                tournamentBracket.appendChild(publishBtn);
            }

            b.matches.forEach((round, index))37 {
                const roundDiv = document.createElement('div');
                roundDiv.classList.add('bracket-round');
                roundDiv.innerHTML = `<h3>Раунд ${index + 1}</h3>`;
                round.forEach((match, matchIndex) => {
                    const matchDiv = document.createElement('div');
                    matchDiv.classList.add('bracket-match');
                    matchDiv.innerHTML = `
                        <p>${match.faction1} vs ${match.faction2}</p>
                        <p>Кабинет: ${match.room || 'Не указан'}</p>
                        <p>Судья: ${match.judge || 'Не указан'}</p>
                    `;
                    if (isCreator && !b.published) {
                        matchDiv.innerHTML += `
                            <input id="room-${index}-${matchIndex}" type="text" placeholder="Кабинет">
                            <input id="judge-${index}-${matchIndex}" type="text" placeholder="Судья">
                            <button onclick="updateMatch(${b.id}, ${index}, ${matchIndex})">Сохранить</button>
                        `;
                    }
                    roundDiv.appendChild(matchDiv);
                });
                tournamentBracket.appendChild(roundDiv);
            });
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
    }
}

async function updateMatch(bracketId, roundIndex, matchIndex) {
    const room = document.getElementById(`room-${roundIndex}-${matchIndex}`).value.trim();
    const judge = document.getElementById(`judge-${roundIndex}-${matchIndex}`).value.trim();

    try {
        const bracket = await supabaseFetch(`brackets?id=eq.${bracketId}`, 'GET');
        if (bracket && bracket.length > 0) {
            const matches = bracket[0].matches;
            matches[roundIndex][matchIndex].room = room;
            matches[roundIndex][matchIndex].judge = judge;
            await supabaseFetch(`brackets?id=eq.${bracketId}`, 'PATCH', { matches: matches });
            loadBracket(currentTournamentId, true);
        }
    } catch (error) {
        console.error('Error updating match:', error);
        alert('Ошибка: ' + error.message);
    }
}

const ratingList = document.getElementById('rating-list');
ratingList.innerHTML = `
    <div><strong>Иван Иванов</strong> <span>1200 очков</span></div>
    <div><strong>Мария Петрова</strong> <span>1150 очков</span></div>
    <div><strong>Алексей Сидоров</strong> <span>1100 очков</span></div>
`;

checkProfile();
