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
  { id: 1, name: "ATU CUP VIII", date: "Караганда 11, 2023 - Караганда 12, 2023", hashtag: "#ATUCup", registrations: [], grid: null, level: "Альматы | Худые коры: Бериксия" },
  { id: 2, name: "DOSTYQ CUP", date: "Караганда 18, 2023 - Караганда 19, 2023", hashtag: "#DostyqCup", registrations: [], grid: null, level: "Альматы | Худые коры: Бериксия" },
  { id: 3, name: "Би-Бараб шашлыкпери VIII", date: "Караганда 25, 2023 - Караганда 26, 2023", hashtag: "#BiBarab", registrations: [], grid: null, level: "Альматы | Худые коры: Бериксия" },
  { id: 4, name: "ENERGO CUP VII", date: "Кентау 2, 2023 - Кентау 3, 2023", hashtag: "#EnergoCup", registrations: [], grid: null, level: "Альматы | Худые коры: Бериксия" },
  { id: 5, name: "ICE Scream X", date: "Кентау 2, 2023 - Кентау 3, 2023", hashtag: "#IceScream", registrations: [], grid: null, level: "Альматы | Худые коры: Бериксия" },
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

// Турниры
function showTournaments() {
  setActiveButton("tournaments-btn");
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>Актуальные турниры</h2>
    ${tournaments.map(t => `
      <div class="tournament fade-in">
        <img src="https://via.placeholder.com/50" alt="Logo">
        <div>
          <h3>${t.name}</h3>
          <p>${t.date}</p>
          <p>${t.level}</p>
          <button onclick="showTournament(${t.id})">Подробнее</button>
        </div>
      </div>
    `).join("")}
    <h2>Добавить турнир</h2>
    <button onclick="createTournament()">Создать турнир</button>
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
      <h2>${tournament.name}</h2>
      <p>Дата: ${tournament.date}</p>
      <p>Уровень: ${tournament.level}</p>
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

// Лента
function showFeed() {
  setActiveButton("feed-btn");
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>Лента</h2>
    <textarea id="newPost" placeholder="Напишите сообщение..."></textarea>
    <button onclick="submitPost()">Опубликовать</button>
    ${posts.map(post => `
      <div class="post fade-in">
        <strong>${post.fullName} @${post.username}</strong>
        <p>${post.text}</p>
        <small>${new Date(post.timestamp).toLocaleString()}</small>
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

// Рейтинг
function showRating() {
  setActiveButton("rating-btn");
  const now = new Date();
  if (now.getDate() === 1 && now.getDay() === 1) { // Первый понедельник месяца
    rating.sort((a, b) => b.wins - a.wins);
  }
  const content = document.getElementById("content");
  content.innerHTML = `
    <h2>Рейтинг</h2>
    ${rating.map((r, i) => `
      <div class="rating-item fade-in">${i + 1}. ${r.fullName} - ${r.wins} побед</div>
    `).join("")}
    <button onclick="addWin()">Добавить победу (тест)</button>
  `;
}
