const tg = window.Telegram.WebApp;
tg.expand(); // Развернуть приложение на весь экран

// Конфигурация Firebase (замени на свои данные)
  const firebaseConfig = {
    apiKey: "AIzaSyB7RjZd1kEIZ8WbZ1qMeEyWJGltS-Fnh2s",
    authDomain: "pkr-debate-app.firebaseapp.com",
    projectId: "pkr-debate-app",
    storageBucket: "pkr-debate-app.firebasestorage.app",
    messagingSenderId: "446621567916",
    appId: "1:446621567916:web:e77c4b23832f109fc08809",
    measurementId: "G-6EN0T8BHH3"
  };

// Инициализация Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Получение данных пользователя
const user = tg.initDataUnsafe.user;
if (user) {
  console.log("User ID:", user.id);
  console.log("Username:", user.username);

  // Сохраняем пользователя в Firebase
  auth.signInAnonymously().then(() => {
    const userRef = db.collection("users").doc(String(user.id));
    userRef.set({
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name
    }, { merge: true });
  });
}

// Функция для отображения секций
function showSection(section) {
  const content = document.getElementById("content");
  content.innerHTML = ""; // Очищаем контент

  switch (section) {
    case "feed":
      loadFeed();
      break;
    case "tournaments":
      loadTournaments();
      break;
    case "rating":
      loadRating();
      break;
    case "profile":
      loadProfile();
      break;
    case "edu":
      loadEdu();
      break;
    default:
      content.innerHTML = "<p>Выберите раздел</p>";
  }
}

// Лента
function loadFeed() {
  const content = document.getElementById("content");
  content.innerHTML = `
    <div id="feed-section">
      <h2>📰 Лента</h2>
      <div id="feed-posts"></div>
      <form id="post-form">
        <textarea id="post-text" placeholder="Напишите что-нибудь..." required></textarea>
        <button type="submit">Опубликовать</button>
      </form>
    </div>
  `;

  // Загрузка постов
  db.collection("posts").orderBy("createdAt", "desc").onSnapshot(snapshot => {
    const posts = [];
    snapshot.forEach(doc => {
      posts.push(doc.data());
    });
    renderFeed(posts);
  });

  // Публикация поста
  document.getElementById("post-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = document.getElementById("post-text").value;
    const user = tg.initDataUnsafe.user;

    if (text && user) {
      db.collection("posts").add({
        text,
        username: user.username || "Аноним",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        document.getElementById("post-text").value = ""; // Очищаем поле ввода
      });
    } else {
      alert("Ошибка: пользователь не авторизован или текст пуст.");
    }
  });
}

// Отображение ленты
function renderFeed(posts) {
  const feedPosts = document.getElementById("feed-posts");
  feedPosts.innerHTML = posts.map(post => `
    <div class="post">
      <strong>${post.username}</strong>
      <p>${post.text}</p>
      <small>${new Date(post.createdAt?.toDate()).toLocaleString()}</small>
    </div>
  `).join("");
}

// Заглушки для других разделов
function loadTournaments() {
  const content = document.getElementById("content");
  content.innerHTML = "<h2>🏆 Турниры</h2><p>Список турниров...</p>";
}

function loadRating() {
  const content = document.getElementById("content");
  content.innerHTML = "<h2>📊 Рейтинг</h2><p>Рейтинг участников...</p>";
}

function loadProfile() {
  const content = document.getElementById("content");
  content.innerHTML = "<h2>👤 Личный кабинет</h2><p>Информация о пользователе...</p>";
}

function loadEdu() {
  const content = document.getElementById("content");
  content.innerHTML = "<h2>🎓 PKR EDU</h2><p>Образовательные материалы...</p>";
}

// Загружаем ленту по умолчанию
showSection("feed");
