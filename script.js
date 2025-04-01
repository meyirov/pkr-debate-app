const tg = window.Telegram.WebApp;
tg.ready();

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
const regFullname = document.getElementById('reg-fullname');
const submitProfileRegBtn = document.getElementById('submit-profile-reg-btn');
let userData = {};
let postsCache = []; // Глобальный кэш для постов

// Supabase API функции
async function supabaseFetch(endpoint, method, body = null) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method: method,
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
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

// Проверка и регистрация профиля
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
            showApp(); // Показываем приложение, если профиль есть
        } else {
            registrationModal.style.display = 'block'; // Показываем окно регистрации
        }
    } catch (error) {
        console.error('Error checking profile:', error);
        registrationModal.style.display = 'block'; // В случае ошибки показываем регистрацию
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

// Показываем приложение
function showApp() {
    appContainer.style.display = 'block';
    document.getElementById('username').textContent = userData.telegramUsername;
    document.getElementById('fullname').value = userData.fullname;
    loadPosts(); // Загружаем ленту сразу
}

// Навигация
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

// Обновление профиля
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

// Лента
const postText = document.getElementById('post-text');
const submitPost = document.getElementById('submit-post');
const postsDiv = document.getElementById('posts');

submitPost.addEventListener('click', async () => {
    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postText.value}`;
    const post = {
        text: text,
        timestamp: new Date().toISOString()
    };
    try {
        const newPost = await supabaseFetch('posts', 'POST', post);
        postText.value = '';
        // Добавляем новый пост в начало кэша и отображаем его
        postsCache.unshift(newPost);
        renderPost(newPost, true); // true означает добавить в начало
    } catch (error) {
        console.error('Error saving post:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadPosts() {
    try {
        // Загружаем посты только если кэш пустой
        if (postsCache.length === 0) {
            const posts = await supabaseFetch('posts?order=timestamp.desc&limit=50', 'GET');
            console.log('Loaded posts:', posts);
            if (posts) {
                // Сортируем посты на стороне клиента для стабильности
                postsCache = posts.sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime();
                    const timeB = new Date(b.timestamp).getTime();
                    if (timeA === timeB) {
                        return b.id - a.id; // Если timestamp совпадает, сортируем по id (убывание)
                    }
                    return timeB - timeA; // Сортировка по timestamp (убывание)
                });
                postsDiv.innerHTML = ''; // Очищаем только при первой загрузке
                for (const post of postsCache) {
                    await renderPost(post);
                }
            }
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        alert('Ошибка загрузки постов: ' + error.message);
    }
}

// Функция для отображения одного поста
async function renderPost(post, prepend = false) {
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    postDiv.setAttribute('data-post-id', post.id); // Добавляем атрибут для поиска

    // Разделяем текст поста на имя, username и содержимое
    const [userInfo, ...contentParts] = post.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');

    // Форматируем время
    const timeAgo = getTimeAgo(new Date(post.timestamp));

    // Загружаем лайки и дизлайки
    const reactions = await loadReactions(post.id);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';

    // Загружаем количество комментариев
    const comments = await loadComments(post.id);
    const commentCount = comments.length;

    // Создаём структуру поста
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

    // Добавляем пост в DOM
    if (prepend) {
        postsDiv.prepend(postDiv);
    } else {
        postsDiv.appendChild(postDiv);
    }

    // Загружаем комментарии (но не показываем, пока не нажата кнопка)
    await renderComments(post.id, comments);
}

// Функция для обновления одного поста
async function updatePost(postId) {
    const postIndex = postsCache.findIndex(post => post.id === postId);
    if (postIndex === -1) return;

    // Загружаем обновлённые данные для поста
    const post = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
    if (!post || post.length === 0) return;

    postsCache[postIndex] = post[0]; // Обновляем кэш

    // Находим элемент поста в DOM
    const postDiv = postsDiv.querySelector(`[data-post-id="${postId}"]`);
    if (!postDiv) return;

    // Разделяем текст поста на имя, username и содержимое
    const [userInfo, ...contentParts] = post[0].text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');

    // Форматируем время
    const timeAgo = getTimeAgo(new Date(post[0].timestamp));

    // Загружаем лайки и дизлайки
    const reactions = await loadReactions(postId);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';

    // Загружаем количество комментариев
    const comments = await loadComments(postId);
    const commentCount = comments.length;

    // Обновляем HTML поста
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

    // Обновляем комментарии
    await renderComments(postId, comments);
}

// Функция для форматирования времени (например, "15h")
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

// Функции для лайков и дизлайков
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
    postId = parseInt(postId); // Преобразуем postId в число
    console.log('toggleReaction called with postId:', postId, 'type:', type, 'user_id:', userData.telegramUsername);
    try {
        // Проверяем, существует ли пользователь в profiles
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
        // Обновляем только изменённый пост
        await updatePost(postId);
    } catch (error) {
        console.error('Error toggling reaction:', error);
        alert('Ошибка: ' + error.message);
    }
}

// Функции для комментариев
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
    postId = parseInt(postId); // Преобразуем postId в число
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const text = commentInput.value.trim();
    if (!text) {
        alert('Пожалуйста, введите текст комментария!');
        return;
    }

    try {
        // Проверяем, существует ли пост в posts
        const postExists = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
        if (!postExists || postExists.length === 0) {
            throw new Error('Пост не найден. Возможно, он был удалён.');
        }

        // Проверяем, существует ли пользователь в profiles
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
        console.log('Adding comment with data:', comment);

        await supabaseFetch('comments', 'POST', comment);
        commentInput.value = '';
        const comments = await loadComments(postId);
        await renderComments(postId, comments);
        // Обновляем только изменённый пост
        await updatePost(postId);
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    commentSection.style.display = commentSection.style.display === 'none' ? 'block' : 'none';
}

// Турниры
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
        tournamentList.innerHTML = '';
        if (tournaments) {
            tournaments.forEach(tournament => {
                const tournamentDiv = document.createElement('div');
                tournamentDiv.classList.add('tournament');
                tournamentDiv.innerHTML = `
                    Турнир: ${tournament.name}<br>
                    Дата: ${tournament.date}<br>
                    Логотип: ${tournament.logo}<br>
                    Описание: ${tournament.desc}<br>
                    Адрес: ${tournament.address}<br>
                    Дедлайн: ${tournament.deadline}<br>
                    <button onclick="showRegistrationForm('${tournament.id}')">Зарегистрироваться</button>
                `;
                tournamentList.appendChild(tournamentDiv);
            });
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        alert('Ошибка загрузки турниров: ' + error.message);
    }
}

function showRegistrationForm(tournamentId) {
    const form = document.createElement('div');
    form.innerHTML = `
        <input id="reg-speaker1" type="text" placeholder="Имя и фамилия 1-го спикера">
        <input id="reg-speaker2" type="text" placeholder="Имя и фамилия 2-го спикера">
        <input id="reg-club" type="text" placeholder="Клуб">
        <input id="reg-city" type="text" placeholder="Город">
        <input id="reg-contacts" type="text" placeholder="Контакты">
        <textarea id="reg-extra" placeholder="Дополнительно (достижения)"></textarea>
        <button onclick="submitRegistration('${tournamentId}')">Отправить</button>
    `;
    tournamentList.appendChild(form);
}

async function submitRegistration(tournamentId) {
    const registration = {
        tournament_id: parseInt(tournamentId),
        speaker1: document.getElementById('reg-speaker1').value,
        speaker2: document.getElementById('reg-speaker2').value,
        club: document.getElementById('reg-club').value,
        city: document.getElementById('reg-city').value,
        contacts: document.getElementById('reg-contacts').value,
        extra: document.getElementById('reg-extra').value,
        timestamp: new Date().toISOString()
    };
    try {
        await supabaseFetch('registrations', 'POST', registration);
        alert('Регистрация отправлена!');
        loadTournaments();
    } catch (error) {
        console.error('Error saving registration:', error);
        alert('Ошибка: ' + error.message);
    }
}

// Рейтинг (статический)
const ratingList = document.getElementById('rating-list');
const rating = [
    { name: 'Иван Иванов', points: 150 },
    { name: 'Анна Петрова', points: 120 }
];

rating.forEach(player => {
    const div = document.createElement('div');
    div.classList.add('post');
    div.innerHTML = `<strong>${player.name}</strong> - ${player.points} очков`;
    ratingList.appendChild(div);
});

// Запускаем проверку профиля
checkProfile();
