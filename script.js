const tg = window.Telegram.WebApp;
tg.expand(); // Развернуть приложение на весь экран

// Данные (временные, позже заменим на базу данных)
let tournaments = [
  { name: "Дебаты в Москве", date: "2023-12-15" },
  { name: "Чемпионат по дебатам", date: "2023-12-20" }
];

let ratings = [
  { name: "Иван Иванов", score: 100 },
  { name: "Мария Петрова", score: 95 },
  { name: "Алексей Сидоров", score: 90 }
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
    <li>${r.name} - ${r.score} баллов</li>
  `).join("");
}

// Регистрация нового турнира
document.getElementById("register-button").addEventListener("click", () => {
  const name = document.getElementById("tournament-name").value;
  const date = document.getElementById("tournament-date").value;
  if (name && date) {
    tournaments.push({ name, date });
    renderTournaments();
    alert("Турнир зарегистрирован!");
  } else {
    alert("Заполните все поля!");
  }
});

// Инициализация
renderTournaments();
renderRatings();
