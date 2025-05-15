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
    console.log('Calling initRating');
    initRating();
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
        if (button.id === 'rating-btn') initRating();
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
            renderPosts(postsCache);
            await processTags(postContent, newPost[0].id);
        }
    } catch (error) {
        console.error('Error posting:', error);
        alert('Ошибка: ' + error.message);
    } finally {
        submitPost.disabled = false;
    }
});

function sortPostsCache() {
    postsCache.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    lastPostId = postsCache.length > 0 ? postsCache[postsCache.length - 1].id : null;
}

async function loadPosts() {
    if (isPostsLoaded) return;
    console.log('loadPosts called');
    const postsLoading = document.getElementById('posts-loading');
    postsLoading.style.display = 'block';
    try {
        const posts = await supabaseFetch('posts?select=*&order=timestamp.desc&limit=10', 'GET');
        console.log('Posts fetched:', posts);
        postsCache = posts || [];
        sortPostsCache();
        renderPosts(postsCache);
        isPostsLoaded = true;
    } catch (error) {
        console.error('Error loading posts:', error);
        postsDiv.innerHTML += '<p>Ошибка загрузки постов</p>';
    } finally {
        postsLoading.style.display = 'none';
    }
}

async function loadMorePosts() {
    if (isLoadingMore || !lastPostId) return;
    isLoadingMore = true;
    loadMoreBtn.disabled = true;
    try {
        const morePosts = await supabaseFetch(`posts?select=*&id=lt.${lastPostId}&order=timestamp.desc&limit=10`, 'GET');
        console.log('More posts fetched:', morePosts);
        if (morePosts && morePosts.length > 0) {
            postsCache.push(...morePosts);
            sortPostsCache();
            renderPosts(postsCache);
        }
        if (!morePosts || morePosts.length < 10) {
            loadMoreBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading more posts:', error);
        postsDiv.innerHTML += '<p>Ошибка загрузки постов</p>';
    } finally {
        isLoadingMore = false;
        loadMoreBtn.disabled = false;
    }
}

async function loadNewPosts() {
    try {
        const newPosts = await supabaseFetch(`posts?select=*&id=gt.${postsCache[0]?.id || 0}&order=timestamp.desc`, 'GET');
        if (newPosts && newPosts.length > 0) {
            postsCache.unshift(...newPosts);
            sortPostsCache();
            renderPosts(postsCache);
        }
    } catch (error) {
        console.error('Error loading new posts:', error);
    }
}

function subscribeToNewPosts() {
    console.log('subscribeToNewPosts called');
    if (channel) {
        supabaseClient.removeChannel(channel);
    }
    channel = supabaseClient
        .channel('public:posts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
            console.log('New post received:', payload);
            if (!postsCache.some(p => p.id === payload.new.id)) {
                postsCache.unshift(payload.new);
                sortPostsCache();
                newPostsCount++;
                newPostsBtn.innerHTML = `Новые посты (${newPostsCount})`;
                newPostsBtn.style.display = 'block';
                newPostsBtn.classList.add('visible');
            }
        })
        .subscribe();
}

async function loadComments(postId) {
    try {
        const comments = await supabaseFetch(`comments?post_id=eq.${postId}&order=timestamp.desc`, 'GET');
        commentsCache.set(postId, comments || []);
        lastCommentIds.set(postId, comments.length > 0 ? comments[comments.length - 1].id : null);
        return comments || [];
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

async function loadMoreComments(postId, commentSection) {
    const lastCommentId = lastCommentIds.get(postId);
    if (!lastCommentId) return;
    try {
        const moreComments = await supabaseFetch(`comments?post_id=eq.${postId}&id=lt.${lastCommentId}&order=timestamp.desc&limit=10`, 'GET');
        if (moreComments && moreComments.length > 0) {
            const currentComments = commentsCache.get(postId) || [];
            commentsCache.set(postId, [...currentComments, ...moreComments]);
            lastCommentIds.set(postId, moreComments[moreComments.length - 1].id);
            renderComments(postId, commentSection);
        }
    } catch (error) {
        console.error('Error loading more comments:', error);
    }
}

function subscribeToComments(postId, commentSection) {
    if (commentChannels.has(postId)) {
        supabaseClient.removeChannel(commentChannels.get(postId));
    }
    const channel = supabaseClient
        .channel(`comments:${postId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, payload => {
            console.log('New comment received:', payload);
            const comments = commentsCache.get(postId) || [];
            if (!comments.some(c => c.id === payload.new.id)) {
                comments.unshift(payload.new);
                commentsCache.set(postId, comments);
                newCommentsCount.set(postId, (newCommentsCount.get(postId) || 0) + 1);
                renderComments(postId, commentSection);
            }
        })
        .subscribe();
    commentChannels.set(postId, channel);
}

async function getReactions(postId) {
    try {
        const reactions = await supabaseFetch(`reactions?post_id=eq.${postId}&select=type,user_id`, 'GET');
        return reactions || [];
    } catch (error) {
        console.error('Error fetching reactions:', error);
        return [];
    }
}

async function toggleReaction(postId, type) {
    const reactions = await getReactions(postId);
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername && r.type === type);
    try {
        if (userReaction) {
            await supabaseFetch(`reactions?post_id=eq.${postId}&user_id=eq.${userData.telegramUsername}&type=eq.${type}`, 'DELETE');
        } else {
            await supabaseFetch('reactions', 'POST', {
                post_id: postId,
                user_id: userData.telegramUsername,
                type: type
            });
        }
        const updatedReactions = await getReactions(postId);
        renderReactions(postId, updatedReactions);
    } catch (error) {
        console.error('Error toggling reaction:', error);
    }
}

function subscribeToReactions(postId) {
    if (reactionChannels.has(postId)) {
        supabaseClient.removeChannel(reactionChannels.get(postId));
    }
    const channel = supabaseClient
        .channel(`reactions:${postId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `post_id=eq.${postId}` }, async () => {
            const reactions = await getReactions(postId);
            renderReactions(postId, reactions);
        })
        .subscribe();
    reactionChannels.set(postId, channel);
}

function renderReactions(postId, reactions) {
    const postElement = document.getElementById(`post-${postId}`);
    if (!postElement) return;
    const likeBtn = postElement.querySelector('.like-btn');
    const dislikeBtn = postElement.querySelector('.dislike-btn');
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userLiked = reactions.some(r => r.type === 'like' && r.user_id === userData.telegramUsername);
    const userDisliked = reactions.some(r => r.type === 'dislike' && r.user_id === userData.telegramUsername);

    likeBtn.innerHTML = `👍 ${likes}`;
    likeBtn.className = `reaction-btn like-btn ${userLiked ? 'active' : ''}`;
    dislikeBtn.innerHTML = `👎 ${dislikes}`;
    dislikeBtn.className = `reaction-btn dislike-btn ${userDisliked ? 'active' : ''}`;
}

function renderComments(postId, commentSection) {
    const comments = commentsCache.get(postId) || [];
    const commentList = commentSection.querySelector('.comment-list');
    commentList.innerHTML = comments.map(comment => `
        <div class="comment">
            <div class="comment-user">
                <strong>${comment.user_id}</strong>
                <span>${new Date(comment.timestamp).toLocaleString()}</span>
            </div>
            <p class="comment-content">${comment.text}</p>
        </div>
    `).join('');
}

function renderPosts(posts) {
    console.log('renderPosts called with:', posts);
    const postsHtml = posts.map(async post => {
        const comments = await loadComments(post.id);
        const reactions = await getReactions(post.id);
        const likes = reactions.filter(r => r.type === 'like').length;
        const dislikes = reactions.filter(r => r.type === 'dislike').length;
        const userLiked = reactions.some(r => r.type === 'like' && r.user_id === userData.telegramUsername);
        const userDisliked = reactions.some(r => r.type === 'dislike' && r.user_id === userData.telegramUsername);

        return `
            <div class="post" id="post-${post.id}">
                <div class="post-header">
                    <div class="post-user">
                        <strong>${post.user_id}</strong>
                        <span>${new Date(post.timestamp).toLocaleString()}</span>
                    </div>
                </div>
                <p class="post-content">${post.text.replace(/@([a-zA-Z0-9_]+)/g, '<a href="#" class="tag">$&</a>')}</p>
                ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post image">` : ''}
                <div class="post-actions">
                    <button class="reaction-btn like-btn ${userLiked ? 'active' : ''}" data-post-id="${post.id}" data-type="like">👍 ${likes}</button>
                    <button class="reaction-btn dislike-btn ${userDisliked ? 'active' : ''}" data-post-id="${post.id}" data-type="dislike">👎 ${dislikes}</button>
                    <button class="comment-toggle-btn" data-post-id="${post.id}">💬 ${comments.length}</button>
                </div>
                <div class="comment-section" id="comment-section-${post.id}" style="display: none;">
                    <div class="comment-list">
                        ${comments.map(comment => `
                            <div class="comment">
                                <div class="comment-user">
                                    <strong>${comment.user_id}</strong>
                                    <span>${new Date(comment.timestamp).toLocaleString()}</span>
                                </div>
                                <p class="comment-content">${comment.text}</p>
                            </div>
                        `).join('')}
                    </div>
                    <form class="comment-form" data-post-id="${post.id}">
                        <textarea class="comment-input" placeholder="Ваш комментарий..."></textarea>
                        <button type="submit">Отправить</button>
                    </form>
                </div>
            </div>
        `;
    });

    Promise.all(postsHtml).then(htmls => {
        postsDiv.innerHTML = htmls.join('') + postsDiv.querySelector('#load-more-btn')?.outerHTML;
        posts.forEach(post => {
            subscribeToReactions(post.id);
            const commentSection = document.getElementById(`comment-section-${post.id}`);
            if (commentSection) {
                subscribeToComments(post.id, commentSection);
            }
        });

        document.querySelectorAll('.reaction-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const postId = btn.dataset.postId;
                const type = btn.dataset.type;
                toggleReaction(postId, type);
            });
        });

        document.querySelectorAll('.comment-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const postId = btn.dataset.postId;
                const commentSection = document.getElementById(`comment-section-${postId}`);
                commentSection.style.display = commentSection.style.display === 'none' ? 'block' : 'none';
            });
        });

        document.querySelectorAll('.comment-form').forEach(form => {
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const postId = form.dataset.postId;
                const input = form.querySelector('.comment-input');
                const text = input.value.trim();
                if (!text) return;
                try {
                    await supabaseFetch('comments', 'POST', {
                        post_id: postId,
                        user_id: userData.telegramUsername,
                        text: text,
                        timestamp: new Date().toISOString()
                    });
                    input.value = '';
                } catch (error) {
                    console.error('Error posting comment:', error);
                    alert('Ошибка: ' + error.message);
                }
            });
        });
    });
}

async function loadTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    try {
        const tournaments = await supabaseFetch('tournaments?select=*&order=date.desc', 'GET');
        tournamentList.innerHTML = tournaments.map(tournament => `
            <div class="tournament-card" data-id="${tournament.id}">
                <img src="${tournament.logo_url || 'https://via.placeholder.com/64'}" class="tournament-logo" alt="Tournament logo">
                <div class="tournament-info">
                    <strong>${tournament.name}</strong>
                    <span>📅 ${new Date(tournament.date).toLocaleDateString()}</span>
                    <span>📍 ${tournament.address}</span>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.tournament-card').forEach(card => {
            card.addEventListener('click', () => {
                currentTournamentId = card.dataset.id;
                showTournamentDetails(currentTournamentId);
            });
        });
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
    const date = document.getElementById('tournament-date').value.trim();
    const logoUrl = document.getElementById('tournament-logo').value.trim();
    const description = document.getElementById('tournament-desc').value.trim();
    const address = document.getElementById('tournament-address').value.trim();
    const deadline = document.getElementById('tournament-deadline').value.trim();

    if (!name || !date || !address || !deadline) {
        alert('Пожалуйста, заполните все обязательные поля!');
        return;
    }

    try {
        await supabaseFetch('tournaments', 'POST', {
            name,
            date,
            logo_url: logoUrl || null,
            description: description || null,
            address,
            registration_deadline: deadline,
            created_by: userData.telegramUsername
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
    sections.forEach(section => section.classList.remove('active'));
    document.getElementById('tournament-details').classList.add('active');
    const tournamentHeader = document.getElementById('tournament-header');
    const tournamentDescription = document.getElementById('tournament-description');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');

    try {
        const tournament = (await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET'))[0];
        tournamentHeader.innerHTML = `
            <img src="${tournament.logo_url || 'https://via.placeholder.com/300x150'}" alt="Tournament banner">
            <strong>${tournament.name}</strong>
            <p>📅 Дата: ${new Date(tournament.date).toLocaleDateString()}</p>
            <p>📍 Адрес: <a href="${tournament.address}" target="_blank">Открыть карту</a></p>
            <p>⏰ Дедлайн регистрации: ${new Date(tournament.registration_deadline).toLocaleDateString()}</p>
        `;
        tournamentDescription.innerHTML = `<p>${tournament.description || 'Описание отсутствует'}</p>`;
        toggleDescriptionBtn.style.display = tournament.description ? 'block' : 'none';

        loadTournamentPosts(tournamentId);
        loadTournamentRegistrations(tournamentId);
        loadTournamentBracket(tournamentId);
    } catch (error) {
        console.error('Error loading tournament details:', error);
        tournamentHeader.innerHTML = '<p>Ошибка загрузки деталей турнира</p>';
    }

    toggleDescriptionBtn.addEventListener('click', () => {
        tournamentDescription.classList.toggle('description-hidden');
        toggleDescriptionBtn.textContent = tournamentDescription.classList.contains('description-hidden')
            ? 'Развернуть описание'
            : 'Свернуть описание';
    });
}

async function loadTournamentPosts(tournamentId) {
    const tournamentPosts = document.getElementById('tournament-posts');
    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&select=*&order=timestamp.desc`, 'GET');
        tournamentPosts.innerHTML = `
            <div id="new-tournament-post">
                <textarea id="tournament-post-text" placeholder="Напишите пост для турнира..."></textarea>
                <button id="submit-tournament-post">Опубликовать</button>
            </div>
            <div id="tournament-posts-list">
                ${posts.map(post => `
                    <div class="post">
                        <div class="post-header">
                            <div class="post-user">
                                <strong>${post.user_id}</strong>
                                <span>${new Date(post.timestamp).toLocaleString()}</span>
                            </div>
                        </div>
                        <p class="post-content">${post.text}</p>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('submit-tournament-post').addEventListener('click', async () => {
            const text = document.getElementById('tournament-post-text').value.trim();
            if (!text) {
                alert('Пожалуйста, введите текст поста!');
                return;
            }
            try {
                await supabaseFetch('tournament_posts', 'POST', {
                    tournament_id: tournamentId,
                    user_id: userData.telegramUsername,
                    text: text,
                    timestamp: new Date().toISOString()
                });
                document.getElementById('tournament-post-text').value = '';
                loadTournamentPosts(tournamentId);
            } catch (error) {
                console.error('Error posting to tournament:', error);
                alert('Ошибка: ' + error.message);
            }
        });
    } catch (error) {
        console.error('Error loading tournament posts:', error);
        tournamentPosts.innerHTML = '<p>Ошибка загрузки постов</p>';
    }
}

async function loadTournamentRegistrations(tournamentId) {
    const registrationList = document.getElementById('registration-list');
    const registrationForm = document.getElementById('registration-form');
    const registerBtn = document.getElementById('register-tournament-btn');

    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&select=*`, 'GET');
        const userRegistration = registrations.find(r => r.user_id === userData.telegramUsername);
        registrationList.innerHTML = registrations.map(reg => `
            <div class="registration-card">
                <strong>${reg.faction_name}</strong>
                <p>Спикеры: ${reg.speaker_1}, ${reg.speaker_2}</p>
                <p>Клуб: ${reg.club || 'Не указан'}</p>
                <p>Город: ${reg.city || 'Не указан'}</p>
                <p>Контакты: ${reg.contacts || 'Не указаны'}</p>
                <p>Дополнительно: ${reg.extra_info || 'Отсутствует'}</p>
                ${reg.user_id === userData.telegramUsername ? `<button class="delete-registration-btn" data-id="${reg.id}">Отменить регистрацию</button>` : ''}
            </div>
        `).join('');

        registrationForm.classList.toggle('form-hidden', !!userRegistration);
        registerBtn.style.display = userRegistration ? 'none' : 'block';

        document.querySelectorAll('.delete-registration-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await supabaseFetch(`registrations?id=eq.${btn.dataset.id}`, 'DELETE');
                    loadTournamentRegistrations(tournamentId);
                } catch (error) {
                    console.error('Error deleting registration:', error);
                    alert('Ошибка: ' + error.message);
                }
            });
        });

        document.getElementById('submit-registration-btn').addEventListener('click', async () => {
            const factionName = document.getElementById('reg-faction-name').value.trim();
            const speaker1 = document.getElementById('reg-speaker1').value.trim();
            const speaker2 = document.getElementById('reg-speaker2').value.trim();
            const club = document.getElementById('reg-club').value.trim();
            const city = document.getElementById('reg-city').value.trim();
            const contacts = document.getElementById('reg-contacts').value.trim();
            const extraInfo = document.getElementById('reg-extra').value.trim();

            if (!factionName || !speaker1 || !speaker2) {
                alert('Пожалуйста, заполните все обязательные поля!');
                return;
            }

            try {
                await supabaseFetch('registrations', 'POST', {
                    tournament_id: tournamentId,
                    user_id: userData.telegramUsername,
                    faction_name: factionName,
                    speaker_1: speaker1,
                    speaker_2: speaker2,
                    club: club || null,
                    city: city || null,
                    contacts: contacts || null,
                    extra_info: extraInfo || null
                });
                registrationForm.classList.add('form-hidden');
                registerBtn.style.display = 'none';
                loadTournamentRegistrations(tournamentId);
            } catch (error) {
                console.error('Error registering:', error);
                alert('Ошибка: ' + error.message);
            }
        });
    } catch (error) {
        console.error('Error loading registrations:', error);
        registrationList.innerHTML = '<p>Ошибка загрузки регистраций</p>';
    }

    registerBtn.addEventListener('click', () => {
        registrationForm.classList.remove('form-hidden');
        registerBtn.style.display = 'none';
    });
}

async function loadTournamentBracket(tournamentId) {
    const bracketDiv = document.getElementById('tournament-bracket');
    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&select=*`, 'GET');
        const bracket = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}&select=*`, 'GET');
        const isCreator = (await supabaseFetch(`tournaments?id=eq.${tournamentId}&select=created_by`, 'GET'))[0].created_by === userData.telegramUsername;

        if (bracket.length > 0) {
            bracketDiv.innerHTML = bracket.map(round => `
                <div class="bracket-round">
                    <h3>Раунд ${round.round_number}</h3>
                    ${round.matches.map(match => `
                        <div class="bracket-match">
                            <p>Команда 1: ${match.team_1 || 'TBD'}</p>
                            <p>Команда 2: ${match.team_2 || 'TBD'}</p>
                            <p>Результат: ${match.result || 'Ожидается'}</p>
                        </div>
                    `).join('')}
                </div>
            `).join('');
        } else {
            bracketDiv.innerHTML = isCreator ? `
                <div id="bracket-form">
                    <h3>Создать сетку</h3>
                    <select id="round-number">
                        <option value="1">Раунд 1</option>
                        <option value="2">Раунд 2</option>
                        <option value="3">Раунд 3</option>
                    </select>
                    <select id="team-1">
                        ${registrations.map(reg => `<option value="${reg.faction_name}">${reg.faction_name}</option>`).join('')}
                    </select>
                    <select id="team-2">
                        ${registrations.map(reg => `<option value="${reg.faction_name}">${reg.faction_name}</option>`).join('')}
                    </select>
                    <input id="match-result" type="text" placeholder="Результат матча">
                    <button id="add-match">Добавить матч</button>
                    <button id="publish-bracket-btn">Опубликовать сетку</button>
                </div>
            ` : '<p>Сетка еще не создана</p>';
        }

        if (isCreator) {
            document.getElementById('add-match')?.addEventListener('click', async () => {
                const roundNumber = document.getElementById('round-number').value;
                const team1 = document.getElementById('team-1').value;
                const team2 = document.getElementById('team-2').value;
                const result = document.getElementById('match-result').value.trim();

                try {
                    await supabaseFetch('brackets', 'POST', {
                        tournament_id: tournamentId,
                        round_number: parseInt(roundNumber),
                        team_1: team1,
                        team_2: team2,
                        result: result || null
                    });
                    loadTournamentBracket(tournamentId);
                } catch (error) {
                    console.error('Error adding match:', error);
                    alert('Ошибка: ' + error.message);
                }
            });

            document.getElementById('publish-bracket-btn')?.addEventListener('click', async () => {
                try {
                    await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'PATCH', { bracket_published: true });
                    loadTournamentBracket(tournamentId);
                } catch (error) {
                    console.error('Error publishing bracket:', error);
                    alert('Ошибка: ' + error.message);
                }
            });
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
        bracketDiv.innerHTML = '<p>Ошибка загрузки сетки</p>';
    }
}

async function initRating() {
    const citySelection = document.getElementById('city-selection');
    const yearSelection = document.getElementById('year-selection');
    const ratingList = document.getElementById('rating-list');

    citySelection.addEventListener('click', (e) => {
        if (e.target.closest('.city-card')) {
            citySelection.style.display = 'none';
            yearSelection.style.display = 'block';
        }
    });

    yearSelection.addEventListener('click', async (e) => {
        if (e.target.closest('.year-card')) {
            yearSelection.style.display = 'none';
            ratingList.style.display = 'block';
            try {
                const ratings = await supabaseFetch('ratings?city=eq.Almaty&season=eq.2024-2025&select=*&order=points.desc&limit=30', 'GET');
                ratingList.innerHTML = ratings.map((rating, index) => `
                    <div class="rating-card ${index === 0 ? 'position-1' : index === 1 ? 'position-2' : index === 2 ? 'position-3' : ''}">
                        <div class="rating-position">${index + 1}</div>
                        <div class="rating-info">
                            <strong>${rating.speaker_name}</strong>
                            <span>Очки: ${rating.points}</span>
                            <span>Клуб: ${rating.club || 'Не указан'}</span>
                        </div>
                    </div>
                `).join('');
            } catch (error) {
                console.error('Error loading ratings:', error);
                ratingList.innerHTML = '<p>Ошибка загрузки рейтинга</p>';
            }
        }
    });
}

checkProfile();
