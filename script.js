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

// Профиль
const username = document.getElementById('username');
const fullname = document.getElementById('fullname');
const saveProfileBtn = document.getElementById('save-profile');
let userData = {};

username.textContent = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.username : 'Неизвестный';

saveProfileBtn.addEventListener('click', () => {
    userData.fullname = fullname.value;
    alert('Профиль сохранён!');
});

// Лента
const postText = document.getElementById('post-text');
const submitPost = document.getElementById('submit-post');
const postsDiv = document.getElementById('posts');
const BOT_TOKEN = '6943054679:AAH_F8XNpxNfTB2puY1NrsKlTNEArBMPta8'; // Твой токен
const FEED_CHAT_ID = '-1002596440957'; // chat_id группы ленты
const TOURNAMENT_CHAT_ID = '-1002596440957'; // chat_id чата турниров

submitPost.addEventListener('click', () => {
    if (!userData.fullname) {
        alert('Сначала укажи имя и фамилию в профиле!');
        return;
    }
    const text = `${userData.fullname} (@${tg.initDataUnsafe.user.username}):\n${postText.value}`;
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: FEED_CHAT_ID, text })
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            postText.value = '';
            loadPosts();
        } else {
            alert('Ошибка: ' + data.description);
        }
    });
});

function loadPosts() {
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatHistory?chat_id=${FEED_CHAT_ID}&limit=50`)
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            postsDiv.innerHTML = '';
            data.result.messages.forEach(msg => {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post');
                postDiv.innerHTML = `${msg.text}<br><small>${new Date(msg.date * 1000).toLocaleString()}</small>`;
                postsDiv.appendChild(postDiv);
            });
        }
    });
}

// Турниры
const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');
const submitTournament = document.getElementById('submit-tournament');
const tournamentList = document.getElementById('tournament-list');

createTournamentBtn.addEventListener('click', () => {
    createTournamentForm.classList.toggle('form-hidden');
});

submitTournament.addEventListener('click', () => {
    const tournament = {
        name: document.getElementById('tournament-name').value,
        date: document.getElementById('tournament-date').value,
        logo: document.getElementById('tournament-logo').value,
        desc: document.getElementById('tournament-desc').value,
        address: document.getElementById('tournament-address').value,
        deadline: document.getElementById('tournament-deadline').value
    };
    const text = `Турнир: ${tournament.name}\nДата: ${tournament.date}\nЛоготип: ${tournament.logo}\nОписание: ${tournament.desc}\nАдрес: ${tournament.address}\nДедлайн: ${tournament.deadline}`;
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TOURNAMENT_CHAT_ID, text })
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            alert('Турнир создан!');
            createTournamentForm.classList.add('form-hidden');
            loadTournaments();
        }
    });
});

function loadTournaments() {
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatHistory?chat_id=${TOURNAMENT_CHAT_ID}&limit=50`)
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            tournamentList.innerHTML = '';
            data.result.messages.forEach(msg => {
                if (msg.text.startsWith('Турнир:')) {
                    const tournamentDiv = document.createElement('div');
                    tournamentDiv.classList.add('tournament');
                    tournamentDiv.innerHTML = `${msg.text}<br><button onclick="showRegistrationForm(${msg.message_id})">Зарегистрироваться</button>`;
                    tournamentList.appendChild(tournamentDiv);
                }
            });
        }
    });
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
        <button onclick="submitRegistration(${tournamentId})">Отправить</button>
    `;
    tournamentList.appendChild(form);
}

function submitRegistration(tournamentId) {
    const registration = {
        speaker1: document.getElementById('reg-speaker1').value,
        speaker2: document.getElementById('reg-speaker2').value,
        club: document.getElementById('reg-club').value,
        city: document.getElementById('reg-city').value,
        contacts: document.getElementById('reg-contacts').value,
        extra: document.getElementById('reg-extra').value
    };
    const text = `Регистрация на турнир #${tournamentId}:\nСпикер 1: ${registration.speaker1}\nСпикер 2: ${registration.speaker2}\nКлуб: ${registration.club}\nГород: ${registration.city}\nКонтакты: ${registration.contacts}\nДополнительно: ${registration.extra}`;
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TOURNAMENT_CHAT_ID, text })
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            alert('Регистрация отправлена!');
            loadTournaments();
        }
    });
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
