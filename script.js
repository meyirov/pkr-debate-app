const tg = window.Telegram.WebApp;
tg.expand(); // Развернуть приложение на весь экран

// Данные (временные, позже заменим на базу данных)
let tournaments = [
  { name: "UIB CUP", date: "2025-03-29" },
  { name: "SDU CUP", date: "2025-04-20" }
];

let ratings = [
  { name: "Линкольн Авраам", score: 100 },
  { name: "Уинстон Черчиль", score: 95 },
  { name: "Трамп Дональд", score: 55 }
];

// Функция для отображения турниров
function renderTournaments() {
  const list = document.getElementById("tournament-list");
  list.innerHTML = tournaments.map(t => `
    <li>${t.name} (${t.date})</li>
  `).join("");
}

// Функция для отображения рейтинга
function renderRatings() {
  const list = document.getElementById("rating-list");
  list.innerHTML = ratings.map(r => `
    <li>${r.name} - ${r.score} балл</li>
  `).join("");
}

// Регистрация нового турнира
document.getElementById("register-button").addEventListener("click", () => {
  const name = document.getElementById("tournament-name").value;
  const date = document.getElementById("tournament-date").value;
  if (name && date) {
    tournaments.push({ name, date });
    renderTournaments();
    alert("Турнир тіркелді!");
  } else {
    alert("Барлық форманы толтырыңыз!");
  }
});

// Инициализация
renderTournaments();
renderRatings();
