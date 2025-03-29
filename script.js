// Инициализация Telegram Web App
window.Telegram.WebApp.ready();
const user = window.Telegram.WebApp.initDataUnsafe.user || { id: 1, username: "testuser" };

// Инициализация данных
let fullName = localStorage.getItem("fullName");
if (!fullName) {
  fullName = prompt("Введите ваше имя и фамилию:");
  localStorage.setItem("fullName", fullName);
}

let posts = JSON.parse(localStorage.getItem("posts")) || [
  { fullName: "Бек Мейр", username: "Meyirov", text: "Сделал едем!", timestamp: Date.now() - 7 * 60 * 60 * 1000 }
];
let tournaments = JSON.parse(localStorage.getItem("tournaments")) || [
  { id: 1, name: "ATU CUP VIII", date: "Караганда 11, 2023 - Караганда 12, 2023", hashtag: "#ATUCup", registrations: [], grid: null, level: "Альматы | Худые коры: Бериксия" },
  { id: 2, name: "DOSTYQ CUP", date: "Караганда 18, 2023 - Караганда 19, 2023", hashtag: "#DostyqCup", registrations: [], grid: null, level: "Альматы | Худые коры: Бериксия" },
];
let rating = JSON.parse(localStorage.getItem("rating")) || [{ id: user.id, fullName, wins: 0 }];

// Сохранение данных
function saveData() {
  localStorage.setItem("posts", JSON.stringify(posts));
  localStorage.setItem("tournaments", JSON.stringify(tournaments));
  localStorage.setItem("rating", JSON.stringify(rating));
}

// Установка активной кнопки
function setActiveButton(btnId) {
  document.querySelectorAll(".menu-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(btnId).classList.add("active");
}

// Форматирование времени (например, "7h")
function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return `${Math.floor(diff / (1000 * 60))}m`;
  if (hours < 24) return `${hours}h`;
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

// Лента
function showFeed() {
  setActiveButton("feed-btn");
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="post fade-in">
      <div class="avatar"></div>
      <div class="content">
        <textarea id="newPost" placeholder="Что нового?"></textarea>
        <button onclick="submitPost()">Опубликовать</button>
      </div>
    </div>
    ${posts.map(post => `
      <div class="post fade-in">
        <div class="avatar"></div>
        <div class="content">
          <div class="header">
            <span class="name">${post.fullName}</span>
            <span class="username">@${post.username}</span>
            <span class="time">· ${formatTime(post.timestamp)}</span>
          </div>
          <div class="text">${post.text}</div>
          ${post.image ? `
            <div class="media">
              <img src="${post.image}" alt="Post image">
            </div>
          ` : ""}
          <div class="actions">
            <button><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> 0</button>
            <button><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg> 0</button>
          </div>
        </div>
      </div>
    `).join("")}
  `;
}

function submitPost() {
  const text = document.getElementById("newPost").value;
  if (text) {
    posts.push({ fullName, username: user.username, text, timestamp: Date.now() });
    saveData();
    showFeed();
  }
}

// Турниры
function showTournaments() {
  setActiveButton("tournaments-btn");
  const content = document.getElementById("content");
  content.innerHTML = `
    ${tournaments.map(t => `
      <div class="tournament fade-in">
        <div class="avatar"></div>
        <div class="content">
          <h3>${t.name}</h3>
          <p>${t.date}</p>
          <p>${t.level}</p>
          <button onclick="showTournament(${t.id})">Подробнее</button>
        </div>
      </div>
    `).join("")}
    <div class="fade-in">
      <button onclick="createTournament()">Создать турнир</button>
    </div>
  `;
}

function createTournament() {
  const name = prompt("Название турнира:");
  const date = prompt("Дата (например, Караганда 11, 2023 - Караганда 12, 2023):");
  const hashtag = prompt("Хештег (например, #Test1):");
  const level = prompt("Уровень (например, Альматы | Худые коры: Бериксия):");
  if (name && date && hashtag && level) {
    const id = tournaments.length + 1;
    tournaments.push({ id, name, date, hashtag, level, registrations: [], grid: null });
    saveData();
    showTournaments();
  }
}

function showTournament(id) {
  const tournament = tournaments.find(t => t.id === id);
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="fade-in">
      <h3>${tournament.name}</h3>
      <p>Дата: ${tournament.date}</p>
      <p>Уровень: ${tournament.level}</p>
      <h3>Посты</h3>
      ${posts.filter(p => p.text.includes(tournament.hashtag)).map(p => `
        <div class="post">
          <div class="avatar"></div>
          <div class="content">
            <div class="header">
              <span class="name">${p.fullName}</span>
              <span class="username">@${p.username}</span>
              <span class="time">· ${formatTime(p.timestamp)}</span>
            </div>
            <div class="text">${p.text}</div>
          </div>
        </div>
      `).join("")}
      <h3>Регистрация</h3>
      <input id="teamName" placeholder="Имя команды">
      <input id="speaker1" placeholder="Спикер 1">
      <input id="speaker2" placeholder="Спикер 2">
      <input id="club" placeholder="Клуб">
      <input id="school" placeholder="Место учебы">
      <input id="phone" placeholder="Номер телефона">
      <textarea id="comments" placeholder="Комментарии"></textarea>
      <button onclick="registerTeam(${id})">Зарегистрироваться</button>
      <h3>Зарегистрированные</h3>
      ${tournament.registrations.map(r => `<p>${r.teamName}: ${r.speaker1}, ${r.speaker2}</p>`).join("")}
      <button onclick="generateGrid(${id})">Сгенерировать сетку</button>
    </div>
  `;
}

function registerTeam(id) {
  const tournament = tournaments.find(t => t.id === id);
  const registration = {
    teamName: document.getElementById("teamName").value,
    speaker1: document.getElementById("speaker1").value,
    speaker2: document.getElementById("speaker2").value,
    club: document.getElementById("club").value,
    school: document.getElementById("school").value,
    phone: document.getElementById("phone").value,
    comments: document.getElementById("comments").value,
    userId: user.id
  };
  tournament.registrations.push(registration);
  saveData();
  showTournament(id);
}

function generateGrid(id) {
  const tournament = tournaments.find(t => t.id === id);
  const teams = tournament.registrations.map(r => r.teamName);
  const format = prompt("Формат (АПФ/БПФ):");
  const rounds = parseInt(prompt("Количество раундов (3, 4 и т.д.):"));
  let grid = [];
  for (let i = 0; i < rounds; i++) {
    let shuffled = teams.sort(() => 0.5 - Math.random());
    grid.push(shuffled.map((t, idx) => idx % 2 === 0 ? `${t} vs ${shuffled[idx + 1] || "BYE"}` : null).filter(Boolean));
  }
  tournament.grid = grid;
  saveData();
  const content = document.getElementById("content");
  content.innerHTML += `
    <h3>Сетка</h3>
    ${grid.map((round, i) => `<p>Раунд ${i + 1}: ${round.join(", ")}</p>`).join("")}
    <button onclick="setWinners(${id})">Указать прошедших</button>
  `;
}

function setWinners(id) {
  const tournament = tournaments.find(t => t.id === id);
  const winners = prompt("Введите команды, прошедшие в плей-офф (через запятую):").split(",").map(w => w.trim());
  posts.push({ fullName: "PKR", username: "system", text: `Прошедшие в плей-офф ${tournament.name}: ${winners.join(", ")}`, timestamp: Date.now() });
  const playoffGrid = winners.sort(() => 0.5 - Math.random()).map((t, idx) => idx % 2 === 0 ? `${t} vs ${winners[idx + 1] || "BYE"}` : null).filter(Boolean);
  tournament.grid = playoffGrid;
  saveData();
  showTournament(id);
}

// Рейтинг
function showRating() {
  setActiveButton("rating-btn");
  const now = new Date();
  if (now.getDate() === 1 && now.getDay() === 1) { // Первый понедельник месяца
    rating.sort((a, b) => b.wins - a.wins);
  }
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="fade-in">
      <h3>Рейтинг</h3>
      ${rating.map((r, i) => `
        <div class="rating-item">${i + 1}. ${r.fullName} - ${r.wins} побед</div>
      `).join("")}
      <button onclick="addWin()">Добавить победу (тест)</button>
    </div>
  `;
}

function addWin() {
  const player = rating.find(r => r.id === user.id) || { id: user.id, fullName, wins: 0 };
  player.wins++;
  if (!rating.some(r => r.id === user.id)) rating.push(player);
  saveData();
  showRating();
}

// Личный кабинет
function showProfile() {
  setActiveButton("profile-btn");
  const player = rating.find(r => r.id === user.id) || { wins: 0 };
  const userTournaments = tournaments.filter(t => t.registrations.some(r => r.userId === user.id)).map(t => t.name);
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="fade-in">
      <h3>Личный кабинет</h3>
      <p>Имя: ${fullName}</p>
      <p>Побед: ${player.wins}</p>
      <p>Турниры: ${userTournaments.join(", ") || "Нет"}</p>
    </div>
  `;
}

// PKR EDU
function showEdu() {
  setActiveButton("edu-btn");
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="fade-in">
      <h3>PKR EDU</h3>
      <p>Как играть в АПФ: [текст или ссылка]</p>
      <p>Правила БПФ: [текст или ссылка]</p>
    </div>
  `;
}

// Начальная загрузка
showFeed();
