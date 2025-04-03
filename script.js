const tg = window.Telegram.WebApp;
tg.ready();

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
const regFullname = document.getElementById('reg-fullname');
const submitProfileRegBtn = document.getElementById('submit-profile-reg-btn');
let userData = {};
let postsCache = [];
let lastPostTimestamp = null;

// Функция для экранирования HTML
const escapeHTML = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

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
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${response.status} - ${errorText}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

async function checkProfile() {
    console.log('Checking profile...');
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
    console.log('Showing app...');
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
        if (button.id === 'rating-btn') loadRating();
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
        sortPostsCache();
        renderPosts();
        lastPostTimestamp = postsCache[0].timestamp;
    } catch (error) {
        console.error('Error saving post:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadPosts() {
    try {
        postsCache = [];
        const posts = await supabaseFetch('posts?order=timestamp.desc&limit=20', 'GET');
        if (posts) {
            postsCache = posts;
            sortPostsCache();
            renderPosts();
            if (postsCache.length > 0) {
                lastPostTimestamp = postsCache[0].timestamp;
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
            postsCache.unshift(...newPosts);
            sortPostsCache();
            renderPosts();
            lastPostTimestamp = postsCache[0].timestamp;
        }
    } catch (error) {
        console.error('Error loading new posts:', error);
    }
}

function startNewPostCheck() {
    setInterval(async () => {
        if (!lastPostTimestamp) return;
        try {
            const formattedTimestamp = lastPostTimestamp.replace(' ', '+');
            const newPosts = await supabaseFetch(`posts?timestamp=gt.${encodeURIComponent(formattedTimestamp)}&order=timestamp.desc&limit=1`, 'GET');
            if (newPosts && newPosts.length > 0) {
                newPostsBtn.style.display = 'block';
            }
        } catch (error) {
            console.error('Error checking for new posts:', error);
        }
    }, 10000);
}

function sortPostsCache() {
    postsCache.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (timeA === timeB) {
            return b.id - a.id;
        }
        return timeB - timeA;
    });
}

async function renderPosts() {
    postsDiv.innerHTML = '';
    for (const post of postsCache) {
        await renderPost(post);
    }
}

async function renderPost(post) {
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
                <strong>${escapeHTML(fullname)}</strong>
                <span>@${escapeHTML(cleanUsername)}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${escapeHTML(content)}</div>
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

    postsDiv.appendChild(postDiv);

    if (comments) {
        await renderComments(post.id, comments);
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
    postsCache[postIndex].likes = likes;
    postsCache[postIndex].dislikes = dislikes;
    postsCache[postIndex].comment_count = commentCount;

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
                <strong>${escapeHTML(fullname)}</strong>
                <span>@${escapeHTML(cleanUsername)}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${escapeHTML(content)}</div>
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
        console.log('postId in loadReactions:', postId); // Логирование для отладки
        if (typeof postId !== 'number' && typeof postId !== 'string') {
            throw new Error('Invalid postId: ' + postId);
        }
        const reactions = await supabaseFetch('reactions?post_id=eq.' + postId, 'GET');
        return reactions || [];
    } catch (error) {
        console.error('Error loading reactions:', error);
        return [];
    }
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
                <strong>${escapeHTML(fullname)}</strong> <span>@${escapeHTML(cleanUsername)}</span>
            </div>
            <div class="comment-content">${escapeHTML(content)}</div>
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
            throw new Error('Пользователь не найден в базе данных. Пожалуйста, зарегистрируйтесь.');
        }

        const comment = {
            post_id: postId,
            user_id: userData.telegramUsername,
            text: `${userData.fullname} (@${userData.telegramUsername}):\n${text}`,
            timestamp: new Date().toISOString()
        };

        await supabaseFetch('comments', 'POST', comment);
        commentInput.value = '';
        await updatePost(postId);
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (commentSection) {
        commentSection.style.display = commentSection.style.display === 'none' ? 'block' : 'none';
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
        loadTournaments();
    } catch (error) {
        console.error('Error saving tournament:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadTournaments() {
    try {
        const tournaments = await supabaseFetch('tournaments?order=timestamp.desc&limit=50', 'GET');
        console.log('Loaded tournaments:', tournaments);
        tournamentList.innerHTML = '';
        if (tournaments) {
            tournaments.forEach(tournament => {
                const tournamentDiv = document.createElement('div');
                tournamentDiv.classList.add('tournament');
                const logoSrc = tournament.logo && tournament.logo.startsWith('http') ? escapeHTML(tournament.logo) : 'https://picsum.photos/80';
                tournamentDiv.innerHTML = `
                    <img src="${logoSrc}" alt="Логотип" onerror="this.onerror=null; this.src='https://picsum.photos/80';">
                    <div class="tournament-info">
                        <h3>${escapeHTML(tournament.name || 'Без названия')}</h3>
                        <p>${escapeHTML(tournament.date || 'Дата не указана')}</p>
                    </div>
                `;
                tournamentDiv.addEventListener('click', () => showTournamentPage(tournament));
                tournamentList.appendChild(tournamentDiv);
            });
        } else {
            tournamentList.innerHTML = '<p>Турниры не найдены.</p>';
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        alert('Ошибка загрузки турниров: ' + error.message);
    }
}

async function loadRegistrations(tournamentId) {
    try {
        const registrations = await supabaseFetch(`tournament_registrations?tournament_id=eq.${tournamentId}`, 'GET');
        return registrations || [];
    } catch (error) {
        console.error('Error loading registrations:', error);
        return [];
    }
}

async function renderRegistrations(tournamentId) {
    const registrations = await loadRegistrations(tournamentId);
    const content = document.getElementById('tournament-content');
    if (!content) {
        console.error('Tournament content element not found!');
        return;
    }
    content.innerHTML = '';

    const userRegistration = registrations.find(r => r.user_id === userData.telegramUsername);
    const isRegistered = !!userRegistration;

    const regButton = document.createElement('button');
    regButton.className = 'grid-button';
    regButton.textContent = isRegistered ? 'Вы уже зарегистрированы' : 'Зарегистрироваться';
    regButton.disabled = isRegistered;
    regButton.addEventListener('click', async () => {
        try {
            await supabaseFetch('tournament_registrations', 'POST', {
                tournament_id: tournamentId,
                user_id: userData.telegramUsername,
                timestamp: new Date().toISOString()
            });
            alert('Вы успешно зарегистрированы!');
            renderRegistrations(tournamentId);
        } catch (error) {
            console.error('Error registering for tournament:', error);
            alert('Ошибка регистрации: ' + error.message);
        }
    });

    content.appendChild(regButton);

    if (registrations.length > 0) {
        const list = document.createElement('div');
        list.className = 'registrations-list';
        for (const reg of registrations) {
            const userProfile = await supabaseFetch(`profiles?telegram_username=eq.${reg.user_id}`, 'GET');
            const userName = userProfile && userProfile.length > 0 ? userProfile[0].fullname : reg.user_id;
            const item = document.createElement('div');
            item.className = 'registration-item';
            item.innerHTML = `<strong>${escapeHTML(userName)}</strong> (@${escapeHTML(reg.user_id)})`;
            list.appendChild(item);
        }
        content.appendChild(list);
    } else {
        const noRegistrations = document.createElement('p');
        noRegistrations.textContent = 'Пока никто не зарегистрирован.';
        content.appendChild(noRegistrations);
    }
}

function showTournamentPage(tournament) {
    console.log('Tournament data:', tournament);

    // Проверяем, что данные турнира существуют
    if (!tournament || !tournament.id) {
        console.error('Tournament data is missing or invalid:', tournament);
        const tournamentPage = document.getElementById('tournament-page');
        if (tournamentPage) {
            tournamentPage.classList.add('active');
            const header = document.getElementById('tournament-header');
            if (header) {
                header.innerHTML = '<p>Ошибка: данные турнира не найдены.</p>';
            }
        }
        return;
    }

    // Переключаем видимость секций
    const sections = document.querySelectorAll('.content');
    sections.forEach(section => section.classList.remove('active'));
    const tournamentPage = document.getElementById('tournament-page');
    if (!tournamentPage) {
        console.error('Tournament page element not found!');
        return;
    }
    tournamentPage.classList.add('active');

    // Заполняем заголовок турнира
    const header = document.getElementById('tournament-header');
    if (!header) {
        console.error('Tournament header element not found!');
        return;
    }
    const logoSrc = (tournament.logo && tournament.logo.startsWith('http')) ? escapeHTML(tournament.logo) : 'https://picsum.photos/100';
    const name = escapeHTML(tournament.name || 'Без названия');
    const date = escapeHTML(tournament.date || 'Дата не указана');
    const deadline = escapeHTML(tournament.deadline || 'Дедлайн не указан');
    const address = escapeHTML(tournament.address || '#');
    const desc = escapeHTML(tournament.desc || 'Описание отсутствует');
    const tournamentId = escapeHTML(tournament.id || 'unknown');

    header.innerHTML = `
        <img src="${logoSrc}" alt="Логотип" onerror="this.onerror=null; this.src='https://picsum.photos/100';">
        <div class="info">
            <h2>${name}</h2>
            <p>Дата: ${date}</p>
            <p>Дедлайн: ${deadline}</p>
            <p><a href="${address}" target="_blank">Адрес</a></p>
            <p id="desc-${tournamentId}" class="desc-hidden">${desc}</p>
            <button id="toggle-desc-${tournamentId}" class="grid-button">Показать дальше</button>
        </div>
    `;

    // Добавляем обработчик для кнопки "Показать дальше"/"Скрыть"
    const toggleDescButton = document.getElementById(`toggle-desc-${tournamentId}`);
    if (toggleDescButton) {
        toggleDescButton.addEventListener('click', () => {
            const desc = document.getElementById(`desc-${tournamentId}`);
            if (desc.classList.contains('desc-hidden')) {
                desc.classList.remove('desc-hidden');
                toggleDescButton.textContent = 'Скрыть';
            } else {
                desc.classList.add('desc-hidden');
                toggleDescButton.textContent = 'Показать дальше';
            }
        });
    } else {
        console.error(`Toggle description button for tournament ${tournamentId} not found!`);
    }

    // Инициализируем вкладки
    const tabs = document.querySelectorAll('#tournament-tabs .tab-btn');
    const content = document.getElementById('tournament-content');
    if (!content) {
        console.error('Tournament content element not found!');
        return;
    }
    tabs.forEach(tab => tab.classList.remove('active'));
    const postsTab = document.getElementById('tournament-posts-btn');
    if (postsTab) {
        postsTab.classList.add('active');
    }
    content.innerHTML = '<p>Посты турнира скоро появятся!</p>';

    // Добавляем обработчики для вкладок
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.id === 'tournament-posts-btn') {
                content.innerHTML = '<p>Посты турнира скоро появятся!</p>';
            } else if (tab.id === 'tournament-reg-btn') {
                renderRegistrations(tournamentId);
            }
        });
    });

    // Добавляем обработчик для кнопки "Назад"
    const backButton = document.getElementById('back-to-tournaments');
    if (backButton) {
        backButton.addEventListener('click', () => {
            tournamentPage.classList.remove('active');
            document.getElementById('tournaments').classList.add('active');
        });
    } else {
        console.error('Back to tournaments button not found!');
    }
}

async function loadRating() {
    const ratingList = document.getElementById('rating-list');
    if (!ratingList) {
        console.error('Rating list element not found!');
        return;
    }
    ratingList.innerHTML = '';

    // Пример статического рейтинга (можно заменить на данные из Supabase)
    const rating = [
        { name: 'Иван Иванов', points: 150 },
        { name: 'Анна Петрова', points: 120 }
    ];

    rating.forEach(player => {
        const div = document.createElement('div');
        div.classList.add('post');
        div.innerHTML = `<strong>${escapeHTML(player.name)}</strong> - ${player.points} очков`;
        ratingList.appendChild(div);
    });
}

// Инициализация приложения
checkProfile();
