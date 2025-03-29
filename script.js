// Инициализация Telegram Web App
window.Telegram.WebApp.ready();
const user = window.Telegram.WebApp.initDataUnsafe.user || { id: 1, username: "testuser" };

// Инициализация данных
let fullName = localStorage.getItem("fullName");
if (!fullName) {
  fullName = prompt("Введите ваше имя и фамилию:");
  localStorage.setItem("fullName", fullName);
}

let posts = JSON.parse(localStorage.getItem("posts")) || [];
let tournaments = JSON.parse(localStorage.getItem("tournaments")) || [
  { id: 1, name: "Тестовый турнир", date: "2025-04-10", hashtag: "#Test1", registrations: [], grid: null },
];
let rating = JSON.parse(localStorage.getItem("rating")) || [{ id: user.id, fullName, wins: 0 }];

// Сохранение данных
function saveData() {
  localStorage.setItem("posts", JSON.stringify(posts));
  localStorage.setItem("tournaments", JSON.stringify(tournaments));
  localStorage.setItem("rating", JSON.stringify(rating));
}

// Лента
function showFeed() {
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>Лента</h2>
    <textarea id="newPost" placeholder="Напишите сообщение..."></textarea>
    <button onclick="submitPost()">Опубликовать</button>
    ${posts.map(post => `
      <div class="post">
        <strong>${post.fullName} @${post.username}</strong>: ${post.text}
        <br><small>${new Date(post.timestamp).toLocaleString()}</small>
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
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>Турниры</h2>
    ${tournaments.map(t => `
      <div class="tournament">
        <strong>${t.name}</strong> - ${t.date}
        <button onclick="showTournament(${t.id})">Подробнее</button>
      </div>
    `).join("")}
    <button onclick="createTournament()">Создать турнир</button>
  `;
}

function createTournament() {
  const name = prompt("Название турнира:");
  const date = prompt("Дата (гггг-мм-дд):");
  const hashtag = prompt("Хештег (например, #Test1):");
  if (name && date && hashtag) {
    const id = tournaments.length + 1;
    tournaments.push({ id, name, date, hashtag, registrations: [], grid: null });
    saveData();
    showTournaments();
  }
}

function showTournament(id) {
  const tournament = tournaments.find(t => t.id === id);
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>${tournament.name}</h2>
    <p>Дата: ${tournament.date}</p>
    <h3>Посты</h3>
    ${posts.filter(p => p.text.includes(tournament.hashtag)).map(p => `
      <div class="post">${p.fullName}: ${p.text}</div>
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
  const now = new Date();
  if (now.getDate() === 1 && now.getDay() === 1) { // Первый понедельник месяца
    rating.sort((a, b) => b.wins - a.wins);
  }
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>Рейтинг</h2>
    ${rating.map((r, i) => `<div class="rating-item">${i + 1}. ${r.fullName} - ${r.wins} побед</div>`).join("")}
    <button onclick="addWin()">Добавить победу (тест)</button>
  `;
}

function addWin() { // Для теста, потом данные будут браться из турниров
  const player = rating.find(r => r.id === user.id) || { id: user.id, fullName, wins: 0 };
  player.wins++;
  if (!rating.some(r => r.id === user.id)) rating.push(player);
  saveData();
  showRating();
}

// Личный кабинет
function showProfile() {
  const player = rating.find(r => r.id === user.id) || { wins: 0 };
  const userTournaments = tournaments.filter(t => t.registrations.some(r => r.userId === user.id)).map(t => t.name);
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>Личный кабинет</h2>
    <p>Имя: ${fullName}</p>
    <p>Побед: ${player.wins}</p>
    <p>Турниры: ${userTournaments.join(", ") || "Нет"}</p>
  `;
}

// PKR EDU
function showEdu() {
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>PKR EDU</h2>
    <p>Как играть в АПФ: [текст или ссылка]</p>
    <p>Правила БПФ: [текст или ссылка]</p>
  `;
}

// Начальная загрузка
showFeed();
