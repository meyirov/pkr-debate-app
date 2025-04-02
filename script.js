// =========================
// 🔐 АВТОРИЗАЦИЯ И ПРОФИЛЬ
// =========================
const tg = window.Telegram.WebApp;
tg.ready();

const SUPABASE_URL = 'https://dwkbptqrblyiqymnqjiv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2JwdHFyYmx5aXF5bW5xaml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MzA3NTcsImV4cCI6MjA1OTAwNjc1N30.QIHms9_kllO7SMxxUlu2U_ugICz1q_cr2-fO61092N4';

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
const regFullname = document.getElementById('reg-fullname');
const submitProfileRegBtn = document.getElementById('submit-profile-reg-btn');
let userData = {};

submitProfileRegBtn.addEventListener('click', async () => {
    if (!regFullname.value.trim()) return alert('Введите имя!');
    userData.fullname = regFullname.value.trim();
    try {
        await supabase('profiles', 'POST', {
            telegram_username: userData.telegramUsername,
            fullname: userData.fullname
        });
        registrationModal.style.display = 'none';
        showApp();
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
});

function showApp() {
    appContainer.style.display = 'block';
    document.getElementById('username').textContent = userData.telegramUsername;
    document.getElementById('fullname').value = userData.fullname;
    loadPosts();
    startNewPostCheck();
}

async function checkProfile() {
    const tgUsername = tg.initDataUnsafe.user?.username;
    if (!tgUsername) return alert('Укажите username в Telegram');
    userData.telegramUsername = tgUsername;
    try {
        const profiles = await supabase(`profiles?telegram_username=eq.${tgUsername}`, 'GET');
        if (profiles?.length) {
            userData.fullname = profiles[0].fullname;
            showApp();
        } else registrationModal.style.display = 'block';
    } catch {
        registrationModal.style.display = 'block';
    }
}

// =====================
// 📬 SUPABASE ОБЁРТКА
// =====================
async function supabase(endpoint, method, body = null) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': method === 'POST' ? 'return=representation' : undefined
        },
        body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(await res.text());
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// ===================
// 📰 ПОСТЫ И ЛЕНТА
// ===================
let postsCache = [];
let lastPostTimestamp = null;

const postText = document.getElementById('post-text');
const submitPost = document.getElementById('submit-post');
const postsDiv = document.getElementById('posts');

submitPost.addEventListener('click', async () => {
    const content = postText.value.trim();
    if (!content) return alert('Введите текст поста!');
    const post = {
        text: `${userData.fullname} (@${userData.telegramUsername}):\n${content}`,
        timestamp: new Date().toISOString()
    };
    try {
        const newPost = await supabase('posts', 'POST', post);
        postText.value = '';
        postsCache.unshift(newPost[0]);
        renderPosts();
        lastPostTimestamp = postsCache[0].timestamp;
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
});

async function loadPosts() {
    try {
        postsCache = await supabase('posts?order=timestamp.desc&limit=20', 'GET') || [];
        renderPosts();
        if (postsCache.length) lastPostTimestamp = postsCache[0].timestamp;
    } catch (e) {
        alert('Ошибка загрузки постов: ' + e.message);
    }
}

function renderPosts() {
    postsDiv.innerHTML = '';
    postsCache.forEach(post => {
        const div = document.createElement('div');
        div.className = 'post';
        div.innerHTML = `
            <div class="post-header">
                <strong>${post.text.split(':\n')[0]}</strong>
                <span>${getTimeAgo(new Date(post.timestamp))}</span>
            </div>
            <div class="post-content">${post.text.split(':\n')[1]}</div>
        `;
        postsDiv.appendChild(div);
    });
}

function getTimeAgo(date) {
    const s = Math.floor((new Date() - date) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

// =====================
// 🏆 ТУРНИРЫ
// =====================
const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');
const submitTournament = document.getElementById('submit-tournament');
const tournamentList = document.getElementById('tournament-list');

createTournamentBtn.onclick = () => createTournamentForm.classList.toggle('form-hidden');

submitTournament.addEventListener('click', async () => {
    const tournament = {
        name: getVal('tournament-name'),
        date: getVal('tournament-date'),
        logo: getVal('tournament-logo'),
        desc: getVal('tournament-desc'),
        address: getVal('tournament-address'),
        deadline: getVal('tournament-deadline'),
        timestamp: new Date().toISOString()
    };
    try {
        await supabase('tournaments', 'POST', tournament);
        alert('Турнир создан!');
        createTournamentForm.classList.add('form-hidden');
        loadTournaments();
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
});

async function loadTournaments() {
    try {
        const tournaments = await supabase('tournaments?order=timestamp.desc&limit=50', 'GET');
        tournamentList.innerHTML = '';
        tournaments.forEach(t => {
            const div = document.createElement('div');
            div.className = 'tournament';
            div.innerHTML = `
                <b>${t.name}</b><br>
                📅 ${t.date}<br>
                📍 <a href="${t.address}" target="_blank">Локация</a><br>
                📝 ${t.desc}<br>
                ⏰ Дедлайн: ${t.deadline}<br>
                <button onclick="showRegistrationForm('${t.id}')">Зарегистрироваться</button>
            `;
            tournamentList.appendChild(div);
        });
    } catch (e) {
        alert('Ошибка загрузки турниров: ' + e.message);
    }
}

function getVal(id) {
    return document.getElementById(id).value.trim();
}

// =====================
// 🌐 НАВИГАЦИЯ
// =====================
const sections = document.querySelectorAll('.content');
const buttons = document.querySelectorAll('.nav-btn');

buttons.forEach(button => {
    button.onclick = () => {
        buttons.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        button.classList.add('active');
        const sectionId = button.id.replace('-btn', '');
        document.getElementById(sectionId).classList.add('active');
        if (sectionId === 'tournaments') loadTournaments();
    }
});

// =====================
// 🏁 СТАРТ
// =====================
checkProfile();
