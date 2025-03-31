const tg = window.Telegram.WebApp;
tg.ready();

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

// Профиль
const username = document.getElementById('username');
const fullname = document.getElementById('fullname');
const saveProfileBtn = document.getElementById('save-profile');
let userData = {};

username.textContent = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.username : 'Неизвестный';

// Загружаем профиль при старте
async function loadProfile() {
    const telegramId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : null;
    if (!telegramId) {
        console.error('Telegram ID not available');
        return;
    }
    try {
        const profiles = await supabaseFetch(`profiles?telegram_id=eq.${telegramId}`, 'GET');
        if (profiles && profiles.length > 0) {
            userData.fullname = profiles[0].fullname;
            fullname.value = userData.fullname; // Подставляем имя в поле
            console.log('Profile loaded:', userData.fullname);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Сохраняем профиль
saveProfileBtn.addEventListener('click', async () => {
    const telegramId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : null;
    if (!telegramId) {
        alert('Telegram ID недоступен!');
        return;
    }
    userData.fullname = fullname.value;
    try {
        const existingProfile = await supabaseFetch(`profiles?telegram_id=eq.${telegramId}`, 'GET');
        if (existingProfile && existingProfile.length > 0) {
            // Обновляем существующий профиль
            await supabaseFetch(`profiles?telegram_id=eq.${telegramId}`, 'PATCH', { fullname: userData.fullname });
        } else {
            // Создаём новый профиль
            await supabaseFetch('profiles', 'POST', { telegram_id: telegramId, fullname: userData.fullname });
        }
        alert('Профиль сохранён!');
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Ошибка: ' + error.message);
    }
});

// Загружаем профиль при запуске
loadProfile();

// Лента
const postText = document.getElementById('post-text');
const submitPost = document.getElementById('submit-post');
const postsDiv = document.getElementById('posts');

submitPost.addEventListener('click', async () => {
    if (!userData.fullname) {
        alert('Сначала укажи имя и фамилию в профиле!');
        return;
    }
    const text = `${userData.fullname} (@${tg.initDataUnsafe.user.username}):\n${postText.value}`;
    const post = {
        text: text,
        timestamp: new Date().toISOString()
    };
    try {
        await supabaseFetch('posts', 'POST', post);
        postText.value = '';
        loadPosts();
    } catch (error) {
        console.error('Error saving post:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function loadPosts() {
    try {
        const posts = await supabaseFetch('posts?order=timestamp.desc&limit=50', 'GET');
        postsDiv.innerHTML = '';
        if (posts) {
            posts.forEach(post => {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post');
                postDiv.innerHTML = `${post.text}<br><small>${new Date(post.timestamp).toLocaleString()}</small>`;
                postsDiv.appendChild(postDiv);
            });
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        alert('Ошибка загрузки постов: ' + error.message);
    }
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
        tournament_id: tournamentId,
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
