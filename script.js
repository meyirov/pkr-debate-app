const tg = window.Telegram.WebApp;
tg.ready();

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
const regFullname = document.getElementById('reg-fullname');
const submitProfileRegBtn = document.getElementById('submit-profile-reg-btn');
let userData = {};
let postsCache = [];
let lastPostTimestamp = null;

async function supabaseFetch(endpoint, method, body = null) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method: method,
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': method === 'POST' ? 'return=representation' : undefined
        },
        body: body ? JSON.stringify(body) : null
    });
    console.log(`Supabase response status: ${response.status}`);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${response.status} - ${errorText}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

async function checkProfile() {
    const telegramUsername = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.username : null;
    if (!telegramUsername) {
        alert('Telegram username недоступен! Укажите username в настройках Telegram.');
        return;
    }
    userData.telegramUsername = telegramUsername;

    try {
        const profiles = await supabaseFetch(`profiles?telegram_username=eq.${telegramUsername}`, 'GET');
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
    appContainer.style.display = 'block';
    document.getElementById('username').textContent = userData.telegramUsername;
    document.getElementById('fullname').value = userData.fullname;
    loadPosts();
    startNewPostCheck();
}

const sections = document.querySelectorAll('.content');
const buttons = document.querySelectorAll('.nav-btn');

buttons.forEach(button => {
    button.addEventListener('click', () => {
        buttons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        sections.forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(button.id.replace('-btn', ''));
        targetSection.classList.add('active');
        if (button.id === 'feed-btn') loadPosts();
        if (button.id === 'tournaments-btn') loadTournaments();
    });
});

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
});
document.getElementById('feed').prepend(newPostsBtn);

submitPost.addEventListener('click', async () => {
    const postContent = postText.value.trim();
    if (!postContent) {
        alert('Пожалуйста, введите текст поста! Пустые посты не допускаются.');
        return;
    }
    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
    const post = {
        text: text,
        timestamp: new Date().toISOString()
    };
    try {
        const newPost = await supabaseFetch('posts', 'POST', post);
        postText.value = '';
        postsCache.unshift(newPost[0]);
        renderPost(newPost[0], true);
        lastPostTimestamp = new Date(newPost[0].timestamp).toISOString();
    } catch (error) {
        console.error('Error saving post:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadPosts() {
    try {
        if (postsCache.length === 0) {
            const posts = await supabaseFetch('posts?order=timestamp.desc&limit=20', 'GET');
            console.log('Loaded posts:', posts);
            if (posts) {
                postsCache = posts.sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime();
                    const timeB = new Date(b.timestamp).getTime();
                    if (timeA === timeB) {
                        return b.id - a.id;
                    }
                    return timeB - timeA;
                });
                postsDiv.innerHTML = '';
                const renderPromises = postsCache.map(post => renderPost(post));
                await Promise.all(renderPromises);
                if (postsCache.length > 0) {
                    lastPostTimestamp = new Date(postsCache[0].timestamp).toISOString();
                }
            }
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        alert('Ошибка загрузки постов: ' + error.message);
    }
}

async function loadNewPosts() {
    try {
        const newPosts = await supabaseFetch(`posts?timestamp=gt.${lastPostTimestamp}&order=timestamp.desc`, 'GET');
        if (newPosts && newPosts.length > 0) {
            newPosts.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                if (timeA === timeB) {
                    return b.id - a.id;
                }
                return timeB - timeA;
            });
            postsCache.unshift(...newPosts);
            const renderPromises = newPosts.map(post => renderPost(post, true));
            await Promise.all(renderPromises);
            lastPostTimestamp = new Date(postsCache[0].timestamp).toISOString();
        }
    } catch (error) {
        console.error('Error loading new posts:', error);
    }
}

function startNewPostCheck() {
    setInterval(async () => {
        if (!lastPostTimestamp) return;
        try {
            const newPosts = await supabaseFetch(`posts?timestamp=gt.${lastPostTimestamp}&order=timestamp.desc&limit=1`, 'GET');
            if (newPosts && newPosts.length > 0) {
                newPostsBtn.style.display = 'block';
            }
        } catch (error) {
            console.error('Error checking for new posts:', error);
        }
    }, 30000);
}

async function renderPost(post, prepend = false) {
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    postDiv.setAttribute('data-post-id', post.id);

    const [userInfo, ...contentParts] = post.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');

    const timeAgo = getTimeAgo(new Date(post.timestamp));

    const reactions = await loadReactions(post.id);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';

    const comments = await loadComments(post.id);
    const commentCount = comments ? comments.length : 0;

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${content}</div>
        <div class="post-actions">
            <button class="reaction-btn like-btn ${likeClass}" onclick="toggleReaction(${post.id}, 'like')">👍 ${likes}</button>
            <button class="reaction-btn dislike-btn ${dislikeClass}" onclick="toggleReaction(${post.id}, 'dislike')">👎 ${dislikes}</button>
            <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">💬 Комментарии (${commentCount})</button>
        </div>
        <div class="comment-section" id="comments-${post.id}" style="display: none;">
            <div class="comment-list" id="comment-list-${post.id}"></div>
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

    if (comments) {
        await renderComments(post.id, comments);
    }
}

async function updatePost(postId) {
    const postIndex = postsCache.findIndex(post => post.id === postId);
    if (postIndex === -1) return;

    const post = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
    if (!post || post.length === 0) return;

    postsCache[postIndex] = post[0];

    const postDiv = postsDiv.querySelector(`[data-post-id="${postId}"]`);
    if (!postDiv) return;

    const [userInfo, ...contentParts] = post[0].text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');

    const timeAgo = getTimeAgo(new Date(post[0].timestamp));

    const reactions = await loadReactions(postId);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';

    const comments = await loadComments(postId);
    const commentCount = comments ? comments.length : 0;

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${content}</div>
        <div class="post-actions">
            <button class="reaction-btn like-btn ${likeClass}" onclick="toggleReaction(${postId}, 'like')">👍 ${likes}</button>
            <button class="reaction-btn dislike-btn ${dislikeClass}" onclick="toggleReaction(${postId}, 'dislike')">👎 ${dislikes}</button>
            <button class="comment-toggle-btn" onclick="toggleComments(${postId})">💬 Комментарии (${commentCount})</button>
        </div>
        <div class="comment-section" id="comments-${postId}" style="display: none;">
            <div class="comment-list" id="comment-list-${postId}"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий..."></textarea>
                <button onclick="addComment(${postId})">Отправить</button>
            </div>
        </div>
    `;

    if (comments) {
        await renderComments(postId, comments);
    }
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

async function toggleReaction(postId, type) {
    postId = parseInt(postId);
    console.log('toggleReaction called with postId:', postId, 'type:', type, 'user_id:', userData.telegramUsername);
    try {
        const userExists = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
        if (!userExists || userExists.length === 0) {
            throw new Error('Пользователь не найден в базе данных. Пожалуйста, зарегистрируйтесь.');
        }

        const userReaction = await supabaseFetch(`reactions?post_id=eq.${postId}&user_id=eq.${userData.telegramUsername}`, 'GET');
        console.log('User reaction:', userReaction);
        
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
        const comments = await supabaseFetch(`comments?post_id=eq.${postId}&order=timestamp.asc`, 'GET');
        return comments || [];
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

async function renderComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;
    commentList.innerHTML = '';
    comments.forEach(comment => {
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
    });
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
            throw new Error('Пользователь не найден в базе данных. Пожалуйста,
