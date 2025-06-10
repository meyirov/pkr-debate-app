console.log('script.js loaded, version: 2025-05-02');

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const tg = window.Telegram.WebApp;
tg.ready();

const registrationModal = document.getElementById('registration-modal');
const appContainer = document.getElementById('app-container');
const regFullname = document.getElementById('reg-fullname');
const submitProfileRegBtn = document.getElementById('submit-profile-reg-btn');
let userData = {};
let postsCache = [];
let lastPostId = null;
let currentTournamentId = null;
let isPostsLoaded = false;
let isLoadingMore = false;
let newPostsCount = 0;
let channel = null;
let commentChannels = new Map();
let reactionChannels = new Map();
let commentsCache = new Map();
let lastCommentIds = new Map();
let newCommentsCount = new Map();
let allTournaments = []; // Кэш для всех турниров
let profilesCache = new Map(); // Кэш для профилей

const ratingData = [
  { name: "Олжас Сейтов", points: 948, rank: 1, club: "Дербес" },
  { name: "Мұхаммедәлі Әлішбаев", points: 936, rank: 2, club: "TЭО" },
  { name: "Нұрболат Тілеубай", points: 872, rank: 3, club: "КБТУ" },
  { name: "Темірлан Есенов", points: 785, rank: 4, club: "TЭО" },
  { name: "Нұрхан Жакен", points: 733, rank: 5, club: "Алтын Сапа" },
  { name: "Динара Әукенова", points: 671.5, rank: 6, club: "TЭО" },
  { name: "Ерасыл Шаймурадов", points: 665, rank: 7, club: "SDU" },
  { name: "Алтынай Қалдыбай", points: 600.5, rank: 8, club: "Дербес" },
  { name: "Жандос Әмре", points: 558, rank: 9, club: "UIB" },
  { name: "Ердаулет Қалмұрат", points: 462, rank: 10, club: "SDU" },
  { name: "Арайлым Абдукаримова", points: 460, rank: 11, club: "TЭО" },
  { name: "Ақылжан Итегулов", points: 440.5, rank: 12, club: "Дербес" },
  { name: "Ерғалым Айтжанов", points: 430.5, rank: 13, club: "ТЭО" },
  { name: "Еламан Әбдіманапов", points: 421, rank: 14, club: "Зиялы Қазақ" },
  { name: "Жансерік Жолшыбек", points: 411, rank: 15, club: "Сириус" },
  { name: "Регина Жардемгалиева", points: 400, rank: 16, club: "ТЭО" },
  { name: "Айдана Мухамет", points: 396, rank: 17, club: "НЛО" },
  { name: "Азамат Арынов", points: 377, rank: 18, club: "SDU" },
  { name: "Адема Сералиева", points: 373.5, rank: 19, club: "ТЭО" },
  { name: "Әлібек Сұлтанов", points: 351, rank: 20, club: "Алтын Сапа" },
  { name: "Гаухар Төлебай", points: 345, rank: 21, club: "SDU" },
  { name: "Әсет Оразғали", points: 336, rank: 22, club: "SDU" },
  { name: "Ислам Аманқос", points: 326.5, rank: 23, club: "SDU" },
  { name: "Арсен Сәуірбай", points: 322.5, rank: 24, club: "SDU" },
  { name: "Дәулет Мырзакулов", points: 282, rank: 25, club: "Алтын Сапа" },
  { name: "Димаш Әшірбек", points: 274, rank: 26, club: "SDU" },
  { name: "Ерлан Бөлекбаев", points: 268, rank: 27, club: "ТЭО" },
  { name: "Ахансері Амиреев", points: 263, rank: 28, club: "Сириус" },
  { name: "Айша Қуандық", points: 255.5, rank: 29, club: "SDU" },
  { name: "Диас Мухамет", points: 254, rank: 30, club: "Технократ" }
];

async function supabaseFetch(endpoint, method, body = null, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': method === 'POST' || method === 'PATCH' ? 'return=representation' : undefined
        },
        body: body ? JSON.stringify(body) : null
      });
      if (!response.ok) throw new Error(`Supabase error: ${response.status}`);
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function uploadImage(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const { data, error } = await supabaseClient.storage.from('post-images').upload(fileName, file);
  if (error) throw new Error(`Image upload error: ${error.message}`);
  const { data: urlData } = supabaseClient.storage.from('post-images').getPublicUrl(fileName);
  return urlData.publicUrl;
}

async function saveChatId(userId) {
  if (tg.initDataUnsafe.user?.id) {
    try {
      const { error } = await supabaseClient.from('profiles').update({ chat_id: tg.initDataUnsafe.user.id.toString() }).eq('telegram_username', userData.telegramUsername);
      if (error) throw error;
      showProfile();
    } catch (error) {
      alert('Ошибка привязки Telegram: ' + error.message);
    }
  } else {
    tg.openTelegramLink(`https://t.me/MyPKRBot?start=${userId}`);
  }
}

async function showProfile() {
  const profileSection = document.getElementById('profile');
  try {
    const profiles = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
    if (profiles?.length > 0) {
      const profile = profiles[0];
      const chatIdStatus = profile.chat_id ? `Привязан (ID: ${profile.chat_id})` : 'Не привязан';
      profileSection.innerHTML = `
        <h2>Профиль</h2>
        ${!profile.chat_id ? '<p style="color: #ff4d4d;">📢 Привяжите Telegram!</p>' : ''}
        <p>Username: <span>${userData.telegramUsername}</span></p>
        <p>Chat ID: <span>${chatIdStatus}</span></p>
        <input id="fullname" type="text" value="${profile.fullname || ''}">
        <button id="update-profile">Изменить имя</button>
        ${!profile.chat_id ? '<button id="link-telegram">Привязать Telegram</button>' : ''}
      `;
      document.getElementById('update-profile').addEventListener('click', async () => {
        const newFullname = document.getElementById('fullname').value.trim();
        if (!newFullname) return alert('Введите новое имя!');
        userData.fullname = newFullname;
        try {
          await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'PATCH', { fullname: newFullname });
          alert('Имя обновлено!');
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
      if (!profile.chat_id) {
        document.getElementById('link-telegram').addEventListener('click', () => saveChatId(profiles[0].id));
      }
    }
  } catch (error) {
    profileSection.innerHTML += '<p>Ошибка загрузки профиля</p>';
  }
}

async function checkProfile() {
  const telegramUsername = tg.initDataUnsafe.user?.username;
  if (!telegramUsername) return alert('Укажите username в Telegram!');
  userData.telegramUsername = telegramUsername;
  try {
    const profiles = await supabaseFetch(`profiles?telegram_username=eq.${telegramUsername}`, 'GET');
    if (profiles?.length > 0) {
      userData.fullname = profiles[0].fullname;
      profilesCache.set(profiles[0].telegram_username, profiles[0].fullname);
      showApp();
      await saveChatId(profiles[0].id);
    } else {
      registrationModal.style.display = 'flex';
    }
  } catch (error) {
    registrationModal.style.display = 'flex';
  }
}

submitProfileRegBtn.addEventListener('click', async () => {
  if (!regFullname.value.trim()) return alert('Введите имя!');
  userData.fullname = regFullname.value.trim();
  try {
    await supabaseFetch('profiles', 'POST', {
      telegram_username: userData.telegramUsername,
      fullname: userData.fullname,
      chat_id: tg.initDataUnsafe.user?.id?.toString() || null
    });
    registrationModal.style.display = 'none';
    showApp();
  } catch (error) {
    alert('Ошибка: ' + error.message);
  }
});

function showApp() {
  appContainer.style.display = 'flex';
  initAppEventListeners();
  document.getElementById('feed-btn').click();
}

const sections = document.querySelectorAll('.content');
const buttons = document.querySelectorAll('.nav-btn');

function initAppEventListeners() {
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            sections.forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(button.id.replace('-btn', ''));
            targetSection.classList.add('active');

            if (button.id === 'tournaments-btn' && allTournaments.length === 0) {
                 loadTournaments();
            } else if (button.id === 'profile-btn') {
                showProfile();
            }
        });
    });

    initTournaments();
    initRating();
    loadPosts(); 
}

function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const debouncedLoadPosts = debounce(() => {
    if(!isPostsLoaded) loadPosts();
}, 300);

const postText = document.getElementById('post-text');
const postImage = document.getElementById('post-image');
const submitPost = document.getElementById('submit-post');
const postsDiv = document.getElementById('posts');
const newPostsBtn = document.createElement('button');
newPostsBtn.id = 'new-posts-btn';
newPostsBtn.className = 'new-posts-btn';
newPostsBtn.style.display = 'none';
newPostsBtn.innerHTML = 'Новые посты';
newPostsBtn.addEventListener('click', () => {
  loadNewPosts();
  newPostsBtn.style.display = 'none';
  newPostsCount = 0;
});
document.getElementById('feed').prepend(newPostsBtn);

const loadMoreBtn = document.createElement('button');
loadMoreBtn.id = 'load-more-btn';
loadMoreBtn.className = 'load-more-btn';
loadMoreBtn.innerHTML = 'Загрузить ещё';
loadMoreBtn.style.display = 'block';
loadMoreBtn.addEventListener('click', () => loadMorePosts());

async function processTags(text, postId) {
  const tagRegex = /@([a-zA-Z0-9_]+)/g;
  const tags = text.match(tagRegex) || [];
  for (const tag of tags) {
    const username = tag.slice(1);
    await supabaseFetch('tag_notifications', 'POST', {
      tagged_username: username,
      post_id: postId,
      user_id: userData.telegramUsername,
      text: text,
      timestamp: new Date().toISOString()
    });
  }
}

submitPost.addEventListener('click', async () => {
  if (submitPost.disabled) return;
  submitPost.disabled = true;
  const postContent = postText.value.trim();
  if (!postContent) {
    alert('Введите текст поста!');
    submitPost.disabled = false;
    return;
  }
  const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
  const post = {
    text,
    timestamp: new Date().toISOString(),
    user_id: userData.telegramUsername
  };
  try {
    if (postImage.files.length > 0) post.image_url = await uploadImage(postImage.files[0]);
    const newPost = await supabaseFetch('posts', 'POST', post);
    postText.value = '';
    postImage.value = '';
    if (!postsCache.some(p => p.id === newPost[0].id)) {
      postsCache.unshift(newPost[0]);
      sortPostsCache();
      if (isUserAtTop()) renderNewPost(newPost[0], true);
      else {
        newPostsCount++;
        newPostsBtn.style.display = 'block';
      }
      lastPostId = postsCache[0]?.id;
      await processTags(postContent, newPost[0].id);
    }
  } catch (error) {
    alert('Ошибка: ' + error.message);
  } finally {
    submitPost.disabled = false;
  }
});

async function loadPosts() {
  if (isPostsLoaded) {
    renderPosts();
    return;
  }
  const loadingIndicator = document.getElementById('posts-loading');
  loadingIndicator.style.display = 'block';
  try {
    postsCache = [];
    const posts = await supabaseFetch('posts?order=id.desc&limit=20', 'GET');
    if (posts) {
      postsCache = posts;
      sortPostsCache();
      renderPosts();
      if (postsCache.length > 0) lastPostId = postsCache[0].id;
      isPostsLoaded = true;
      const totalPosts = await supabaseFetch('posts?select=id', 'GET');
      loadMoreBtn.style.display = totalPosts?.length > 20 ? 'block' : 'none';
    }
  } catch (error) {
    alert('Ошибка загрузки постов: ' + error.message);
  } finally {
    loadingIndicator.style.display = 'none';
  }
  setupInfiniteScroll();
}

async function loadMorePosts() {
  if (isLoadingMore || postsCache.length === 0) return;
  isLoadingMore = true;
  const oldestPostId = postsCache[postsCache.length - 1].id;
  try {
    const morePosts = await supabaseFetch(`posts?id=lt.${oldestPostId}&order=id.desc&limit=20`, 'GET');
    if (morePosts?.length > 0) {
      const newPosts = morePosts.filter(post => !postsCache.some(p => p.id === post.id));
      if (newPosts.length > 0) {
        postsCache.push(...newPosts);
        sortPostsCache();
        renderMorePosts(newPosts);
        loadMoreBtn.style.display = 'block';
      } else loadMoreBtn.style.display = 'none';
    } else loadMoreBtn.style.display = 'none';
  } catch (error) {
    console.error('Error in loadMorePosts:', error);
  } finally {
    isLoadingMore = false;
  }
}

async function loadNewPosts() {
  try {
    const newPosts = await supabaseFetch(`posts?id=gt.${lastPostId}&order=id.desc`, 'GET');
    if (newPosts?.length > 0) {
      const uniqueNewPosts = newPosts.filter(post => !postsCache.some(p => p.id === post.id));
      if (uniqueNewPosts.length > 0) {
        postsCache.unshift(...uniqueNewPosts);
        sortPostsCache();
        renderNewPosts(uniqueNewPosts, true);
        lastPostId = postsCache[0].id;
      }
    }
  } catch (error) {
    console.error('Error loading new posts:', error);
  }
}

function subscribeToNewPosts() {
  if (channel) supabaseClient.removeChannel(channel);
  channel = supabaseClient
    .channel('posts-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
      const newPost = payload.new;
      if (!postsCache.some(post => post.id === newPost.id)) {
        postsCache.unshift(newPost);
        sortPostsCache();
        if (isUserAtTop()) {
          renderNewPost(newPost, true);
          lastPostId = postsCache[0].id;
        } else {
          newPostsCount++;
          newPostsBtn.style.display = 'block';
        }
      }
    })
    .subscribe();
}

function isUserAtTop() {
  return document.getElementById('feed').scrollTop <= 50;
}

function setupInfiniteScroll() {
  const feedSection = document.getElementById('feed');
  feedSection.style.overflowY = 'auto';
  feedSection.removeEventListener('scroll', debouncedLoadMorePosts);
  feedSection.addEventListener('scroll', debouncedLoadMorePosts);
}

const debouncedLoadMorePosts = debounce(() => {
  const feedSection = document.getElementById('feed');
  const scrollBottom = feedSection.scrollHeight - feedSection.scrollTop - feedSection.clientHeight;
  if (scrollBottom <= 200) loadMorePosts();
}, 300);

function sortPostsCache() {
  postsCache.sort((a, b) => b.id - a.id);
}

function renderPosts() {
  postsDiv.innerHTML = '';
  postsCache.forEach(post => renderNewPost(post, false));
  postsDiv.appendChild(loadMoreBtn);
}

function renderNewPosts(newPosts, prepend = false) {
  for (const post of newPosts) renderNewPost(post, prepend);
}

function formatPostContent(content) {
  let formatted = content.replace(/\n/g, '<br>');
  const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]\}])/g;
  formatted = formatted.replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
  const tagRegex = /@([a-zA-Z0-9_]+)/g;
  formatted = formatted.replace(tagRegex, tag => `<span class="tag">${tag}</span>`);
  return formatted;
}

function renderNewPost(post, prepend = false) {
  const postDiv = document.createElement('div');
  postDiv.classList.add('post');
  postDiv.setAttribute('data-post-id', post.id);
  const [userInfo, ...contentParts] = post.text.split(':\n');
  const [fullname, username] = userInfo.split(' (@');
  const cleanUsername = username ? username.replace(')', '') : '';
  const content = contentParts.join(':\n');
  const formattedContent = formatPostContent(content);
  const timeAgo = getTimeAgo(new Date(post.timestamp));
  postDiv.innerHTML = `
    <div class="post-header">
      <div class="post-user"><strong>${fullname}</strong><span>@${cleanUsername}</span></div>
      <div class="post-time">${timeAgo}</div>
    </div>
    <div class="post-content">${formattedContent}</div>
    ${post.image_url ? `<img src="${post.image_url}" class="post-image">` : ''}
    <div class="post-actions">
      <button class="reaction-btn like-btn" onclick="toggleReaction(${post.id}, 'like')">👍 0</button>
      <button class="reaction-btn dislike-btn" onclick="toggleReaction(${post.id}, 'dislike')">👎 0</button>
      <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">💬 Комментарии (0)</button>
    </div>
    <div class="comment-section" id="comments-${post.id}" style="display: none;">
      <button id="new-comments-btn-${post.id}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
      <div class="comment-list" id="comment-list-${post.id}" style="max-height: 200px; overflow-y: auto;"></div>
      <form class="comment-form">
        <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий..."></textarea>
        <button type="submit" onclick="addComment(event, ${post.id})">Отправить</button>
      </form>
    </div>
  `;
  if (prepend) postsDiv.prepend(postDiv);
  else {
    const loadMoreContainer = postsDiv.querySelector('#load-more-btn');
    if(loadMoreContainer) {
        postsDiv.insertBefore(postDiv, loadMoreContainer);
    } else {
        postsDiv.appendChild(postDiv);
    }
  }
  loadReactionsAndComments(post.id);
  subscribeToReactions(post.id);
}

async function renderMorePosts(newPosts) {
  for (const post of newPosts) {
    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    postDiv.setAttribute('data-post-id', post.id);
    const [userInfo, ...contentParts] = post.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    const timeAgo = getTimeAgo(new Date(post.timestamp));
    postDiv.innerHTML = `
      <div class="post-header">
        <div class="post-user"><strong>${fullname}</strong><span>@${cleanUsername}</span></div>
        <div class="post-time">${timeAgo}</div>
      </div>
      <div class="post-content">${formattedContent}</div>
      ${post.image_url ? `<img src="${post.image_url}" class="post-image">` : ''}
      <div class="post-actions">
        <button class="reaction-btn like-btn" onclick="toggleReaction(${post.id}, 'like')">👍 0</button>
        <button class="reaction-btn dislike-btn" onclick="toggleReaction(${post.id}, 'dislike')">👎 0</button>
        <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">💬 Комментарии (0)</button>
      </div>
      <div class="comment-section" id="comments-${post.id}" style="display: none;">
        <button id="new-comments-btn-${post.id}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
        <div class="comment-list" id="comment-list-${post.id}" style="max-height: 200px; overflow-y: auto;"></div>
        <form class="comment-form">
          <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий..."></textarea>
          <button type="submit" onclick="addComment(event, ${post.id})">Отправить</button>
        </form>
      </div>
    `;
    const loadMoreContainer = postsDiv.querySelector('#load-more-btn');
    postsDiv.insertBefore(postDiv, loadMoreContainer);
    loadReactionsAndComments(post.id);
    subscribeToReactions(post.id);
  }
}

async function loadReactionsAndComments(postId) {
  try {
    const reactions = await loadReactions(postId);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction?.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction?.type === 'dislike' ? 'active' : '';
    const comments = await loadComments(postId);
    const commentCount = comments?.length || 0;
    const postDiv = postsDiv.querySelector(`[data-post-id="${postId}"]`);
    if (postDiv) {
      const likeBtn = postDiv.querySelector('.like-btn');
      const dislikeBtn = postDiv.querySelector('.dislike-btn');
      const commentBtn = postDiv.querySelector('.comment-toggle-btn');
      likeBtn.className = `reaction-btn like-btn ${likeClass}`;
      likeBtn.innerHTML = `👍 ${likes}`;
      dislikeBtn.className = `reaction-btn dislike-btn ${dislikeClass}`;
      dislikeBtn.innerHTML = `👎 ${dislikes}`;
      commentBtn.innerHTML = `💬 Комментарии (${commentCount})`;
      if (comments) await renderComments(postId, comments);
      setupCommentInfiniteScroll(postId);
    }
  } catch (error) {
    console.error('Error loading reactions/comments:', error);
  }
}

async function updatePost(postId) {
    const postIndex = postsCache.findIndex(post => post.id === postId);
    if (postIndex === -1) return;
    const postData = await supabaseFetch(`posts?id=eq.${postId}&select=*`, 'GET');
    if (!postData || postData.length === 0) return;

    postsCache[postIndex] = postData[0];
    const postDiv = document.querySelector(`.post[data-post-id="${postId}"]`);
    if (!postDiv) return;

    const [userInfo, ...contentParts] = postData[0].text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    const timeAgo = getTimeAgo(new Date(postData[0].timestamp));

    const reactions = await loadReactions(postId);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction?.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction?.type === 'dislike' ? 'active' : '';
    const comments = commentsCache.get(postId) || [];
    const commentCount = comments.length;

    postDiv.querySelector('.post-user').innerHTML = `<strong>${fullname}</strong><span>@${cleanUsername}</span>`;
    postDiv.querySelector('.post-time').textContent = timeAgo;
    postDiv.querySelector('.post-content').innerHTML = formattedContent;
    
    const likeBtn = postDiv.querySelector('.like-btn');
    likeBtn.className = `reaction-btn like-btn ${likeClass}`;
    likeBtn.innerHTML = `👍 ${likes}`;

    const dislikeBtn = postDiv.querySelector('.dislike-btn');
    dislikeBtn.className = `reaction-btn dislike-btn ${dislikeClass}`;
    dislikeBtn.innerHTML = `👎 ${dislikes}`;

    postDiv.querySelector('.comment-toggle-btn').innerHTML = `💬 Комментарии (${commentCount})`;
}


function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 60) return `${diffInSeconds}s`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h`;
  return `${Math.floor(diffInHours / 24)}d`;
}

async function loadReactions(postId) {
  try {
    const reactions = await supabaseFetch(`reactions?post_id=eq.${postId}`, 'GET');
    return reactions || [];
  } catch (error) {
    return [];
  }
}

function subscribeToReactions(postId) {
  if (reactionChannels.has(postId)) supabaseClient.removeChannel(reactionChannels.get(postId));
  const channel = supabaseClient
    .channel(`reactions-channel-${postId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `post_id=eq.${postId}` }, () => updatePost(postId))
    .subscribe();
  reactionChannels.set(postId, channel);
}

async function toggleReaction(postId, type) {
  postId = parseInt(postId);
  try {
    const userExists = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
    if (!userExists?.length) throw new Error('Пользователь не найден!');
    const userReaction = await supabaseFetch(`reactions?post_id=eq.${postId}&user_id=eq.${userData.telegramUsername}`, 'GET');
    if (userReaction?.length > 0) {
      const currentReaction = userReaction[0];
      if (currentReaction.type === type) await supabaseFetch(`reactions?id=eq.${currentReaction.id}`, 'DELETE');
      else await supabaseFetch(`reactions?id=eq.${currentReaction.id}`, 'PATCH', { type });
    } else {
      await supabaseFetch('reactions', 'POST', {
        post_id: postId,
        user_id: userData.telegramUsername,
        type,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    alert('Ошибка: ' + error.message);
  }
}

async function loadComments(postId) {
  try {
    if (!commentsCache.has(postId)) {
      commentsCache.set(postId, []);
      lastCommentIds.set(postId, null);
      newCommentsCount.set(postId, 0);
    }
    const comments = await supabaseFetch(`comments?post_id=eq.${postId}&order=id.asc&limit=10`, 'GET');
    if (comments?.length > 0) {
      const currentComments = commentsCache.get(postId) || [];
      const newComments = comments.filter(comment => !currentComments.some(c => c.id === comment.id));
      commentsCache.set(postId, [...newComments, ...currentComments]);
      sortCommentsCache(postId);
      if (newComments.length > 0) lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
    }
    return commentsCache.get(postId);
  } catch (error) {
    return [];
  }
}

async function loadMoreComments(postId) {
  const commentList = document.getElementById(`comment-list-${postId}`);
  if (!commentList || commentList.dataset.isLoadingMore === 'true') return;
  commentList.dataset.isLoadingMore = 'true';
  const oldestCommentId = commentsCache.get(postId).length > 0 ? commentsCache.get(postId)[0].id : null;
  try {
    const moreComments = await supabaseFetch(`comments?post_id=eq.${postId}&id=lt.${oldestCommentId}&order=id.asc&limit=10`, 'GET');
    if (moreComments?.length > 0) {
      const currentComments = commentsCache.get(postId);
      const newComments = moreComments.filter(comment => !currentComments.some(c => c.id === comment.id));
      if (newComments.length > 0) {
        commentsCache.set(postId, [...newComments, ...currentComments]);
        sortCommentsCache(postId);
        renderMoreComments(postId, newComments);
      }
    }
  } catch (error) {
    console.error('Error loading more comments:', error);
  } finally {
    commentList.dataset.isLoadingMore = 'false';
  }
}

async function loadNewComments(postId) {
  const lastCommentId = lastCommentIds.get(postId);
  if (!lastCommentId) return;
  try {
    const newComments = await supabaseFetch(`comments?post_id=eq.${postId}&id=gt.${lastCommentId}&order=id.asc`, 'GET');
    if (newComments?.length > 0) {
      const currentComments = commentsCache.get(postId);
      const uniqueNewComments = newComments.filter(comment => !currentComments.some(c => c.id === comment.id));
      if (uniqueNewComments.length > 0) {
        commentsCache.set(postId, [...currentComments, ...uniqueNewComments]);
        sortCommentsCache(postId);
        renderNewComments(postId, uniqueNewComments, true);
        lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
      }
    }
  } catch (error) {
    console.error('Error loading new comments:', error);
  }
}

function subscribeToNewComments(postId) {
  if (commentChannels.has(postId)) supabaseClient.removeChannel(commentChannels.get(postId));
  const channel = supabaseClient
    .channel(`comments-channel-${postId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, payload => {
      const newComment = payload.new;
      const currentComments = commentsCache.get(postId) || [];
      if (!currentComments.some(comment => comment.id === newComment.id)) {
        commentsCache.set(postId, [...currentComments, newComment]);
        sortCommentsCache(postId);
        if (isUserAtBottom(postId)) {
          renderNewComment(postId, newComment, true);
          lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
        } else {
          const currentCount = newCommentsCount.get(postId) || 0;
          newCommentsCount.set(postId, currentCount + 1);
          const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
          if (newCommentsBtn) {
            newCommentsBtn.style.display = 'block';
            newCommentsBtn.textContent = `Новые комментарии (${newCommentsCount.get(postId)})`;
          }
        }
      }
    })
    .subscribe();
  commentChannels.set(postId, channel);
}

function isUserAtBottom(postId) {
  const commentList = document.getElementById(`comment-list-${postId}`);
  return commentList ? commentList.scrollHeight - commentList.scrollTop <= commentList.clientHeight + 50 : false;
}

function setupCommentInfiniteScroll(postId) {
  const commentList = document.getElementById(`comment-list-${postId}`);
  if (!commentList) return;
  if (commentChannels.has(postId)) {
    supabaseClient.removeChannel(commentChannels.get(postId));
    commentChannels.delete(postId);
  }
  const debouncedLoadMoreComments = debounce(() => {
    if (commentList.scrollTop <= 50) loadMoreComments(postId);
  }, 300);
  commentList.removeEventListener('scroll', debouncedLoadMoreComments);
  commentList.addEventListener('scroll', debouncedLoadMoreComments);
  subscribeToNewComments(postId);
  const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
  if (newCommentsBtn) {
    newCommentsBtn.onclick = () => {
      loadNewComments(postId);
      newCommentsBtn.style.display = 'none';
      newCommentsCount.set(postId, 0);
    };
  }
}

function sortCommentsCache(postId) {
  const comments = commentsCache.get(postId);
  if (comments) {
    comments.sort((a, b) => a.id - b.id);
    commentsCache.set(postId, comments);
  }
}

async function renderComments(postId, comments) {
  const commentList = document.getElementById(`comment-list-${postId}`);
  if (!commentList) return;
  commentList.innerHTML = '';
  comments.forEach(comment => renderNewComment(postId, comment, true));
}

async function renderNewComments(postId, newComments, append = true) {
  for (const comment of newComments) renderNewComment(postId, comment, append);
}

function renderNewComment(postId, comment, append = true) {
  const commentList = document.getElementById(`comment-list-${postId}`);
  if (!commentList) return;
  const commentDiv = document.createElement('div');
  commentDiv.classList.add('comment');
  const [userInfo, ...contentParts] = comment.text.split(':\n');
  const [fullname, username] = userInfo.split(' (@');
  const cleanUsername = username ? username.replace(')', '') : '';
  const content = contentParts.join(':\n');
  const formattedContent = formatPostContent(content);
  commentDiv.innerHTML = `
    <div class="comment-user"><strong>${fullname}</strong><span>@${cleanUsername}</span></div>
    <div class="comment-content">${formattedContent}</div>
  `;
  if (append) {
    commentList.appendChild(commentDiv);
    if (isUserAtBottom(postId)) commentList.scrollTop = commentList.scrollHeight;
  } else commentList.prepend(commentDiv);
}

async function renderMoreComments(postId, newComments) {
  const commentList = document.getElementById(`comment-list-${postId}`);
  if (!commentList) return;
  for (const comment of newComments) {
    const commentDiv = document.createElement('div');
    commentDiv.classList.add('comment');
    const [userInfo, ...contentParts] = comment.text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);
    commentDiv.innerHTML = `
      <div class="comment-user"><strong>${fullname}</strong><span>@${cleanUsername}</span></div>
      <div class="comment-content">${formattedContent}</div>
    `;
    commentList.appendChild(commentDiv);
  }
}

async function addComment(event, postId) {
  event.preventDefault(); 
  postId = parseInt(postId);
  const commentInput = document.getElementById(`comment-input-${postId}`);
  const commentButton = commentInput.parentElement.querySelector('button');
  if (!commentInput || !commentButton || commentButton.disabled) return;
  commentButton.disabled = true;
  const text = commentInput.value.trim();
  if (!text) {
    alert('Введите текст комментария!');
    commentButton.disabled = false;
    return;
  }
  try {
    const postExists = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
    if (!postExists?.length) throw new Error('Пост не найден!');
    const userExists = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
    if (!userExists?.length) throw new Error('Пользователь не найден!');
    const comment = {
      post_id: postId,
      user_id: userData.telegramUsername,
      text: `${userData.fullname} (@${userData.telegramUsername}):\n${text}`,
      timestamp: new Date().toISOString()
    };
    const newComment = await supabaseFetch('comments', 'POST', comment);
    commentInput.value = '';
    const currentComments = commentsCache.get(postId) || [];
    if (!currentComments.some(c => c.id === newComment[0].id)) {
      commentsCache.set(postId, [...currentComments, newComment[0]]);
      sortCommentsCache(postId);
      if (isUserAtBottom(postId)) {
        renderNewComment(postId, newComment[0], true);
        lastCommentIds.set(postId, commentsCache.get(postId)[commentsCache.get(postId).length - 1].id);
      } else {
        const currentCount = newCommentsCount.get(postId) || 0;
        newCommentsCount.set(postId, currentCount + 1);
        const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
        if (newCommentsBtn) {
          newCommentsBtn.style.display = 'block';
          newCommentsBtn.textContent = `Новые комментарии (${newCommentsCount.get(postId)})`;
        }
      }
      await processTags(text, null);
    }
    await updatePost(postId);
  } catch (error) {
    alert('Ошибка: ' + error.message);
  } finally {
    commentButton.disabled = false;
  }
}

function toggleComments(postId) {
  const commentSection = document.getElementById(`comments-${postId}`);
  if (commentSection) {
    const isVisible = commentSection.style.display === 'block';
    commentSection.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      loadComments(postId).then(comments => renderComments(postId, comments));
      setupCommentInfiniteScroll(postId);
    } else if (commentChannels.has(postId)) {
      supabaseClient.removeChannel(commentChannels.get(postId));
      commentChannels.delete(postId);
    }
  }
}

// === ЛОГИКА ТУРНИРОВ ===

function initTournaments() {
    const createTournamentBtn = document.getElementById('create-tournament-btn');
    const createTournamentForm = document.getElementById('create-tournament-form');
    const activeTab = document.getElementById('active-tournaments-tab');
    const archiveTab = document.getElementById('archive-tournaments-tab');
    const filterCity = document.getElementById('filter-city');
    const filterScale = document.getElementById('filter-scale');

    createTournamentBtn.addEventListener('click', () => {
        createTournamentForm.classList.toggle('form-hidden');
    });

    createTournamentForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const submitTournamentBtn = document.getElementById('submit-tournament');
        submitTournamentBtn.disabled = true;

        const tournament = {
            name: document.getElementById('tournament-name').value.trim(),
            date: document.getElementById('tournament-date').value.trim(),
            city: document.getElementById('tournament-city').value,
            scale: document.getElementById('tournament-scale').value,
            logo: document.getElementById('tournament-logo').value.trim(),
            desc: document.getElementById('tournament-desc').value.trim(),
            address: document.getElementById('tournament-address').value.trim(),
            deadline: document.getElementById('tournament-deadline').value.trim(),
            creator_id: userData.telegramUsername,
            timestamp: new Date().toISOString(),
            tab_published: false
        };

        if (!tournament.name || !tournament.date || !tournament.city || !tournament.scale) {
            alert('Пожалуйста, заполните все обязательные поля: Название, Дата, Город и Масштаб.');
            submitTournamentBtn.disabled = false;
            return;
        }

        try {
            await supabaseFetch('tournaments', 'POST', tournament);
            alert('Турнир создан!');
            createTournamentForm.classList.add('form-hidden');
            createTournamentForm.reset(); 
            loadTournaments(true);
        } catch (error) {
            alert('Ошибка создания турнира: ' + error.message);
        } finally {
            submitTournamentBtn.disabled = false;
        }
    });

    activeTab.addEventListener('click', () => {
        activeTab.classList.add('active');
        archiveTab.classList.remove('active');
        renderFilteredTournaments();
    });

    archiveTab.addEventListener('click', () => {
        archiveTab.classList.add('active');
        activeTab.classList.remove('active');
        renderFilteredTournaments();
    });

    filterCity.addEventListener('change', renderFilteredTournaments);
    filterScale.addEventListener('change', renderFilteredTournaments);
}

function parseDate(dateString) {
    if (!dateString || !/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) return null;
    const [day, month, year] = dateString.split('.');
    return new Date(year, month - 1, day);
}

async function loadTournaments(forceReload = false) {
    if (allTournaments.length > 0 && !forceReload) {
        renderFilteredTournaments();
        return;
    }
    try {
        const tournaments = await supabaseFetch('tournaments?order=timestamp.desc', 'GET');
        allTournaments = tournaments || [];
        renderFilteredTournaments();
    } catch (error) {
        alert('Ошибка загрузки турниров: ' + error.message);
    }
}

function renderFilteredTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    const selectedCity = document.getElementById('filter-city').value;
    const selectedScale = document.getElementById('filter-scale').value;
    const isArchive = document.getElementById('archive-tournaments-tab').classList.contains('active');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = allTournaments.filter(t => {
        const tournamentDate = parseDate(t.date);
        return tournamentDate ? (isArchive ? tournamentDate < today : tournamentDate >= today) : false;
    });

    if (selectedCity !== 'all') filtered = filtered.filter(t => t.city === selectedCity);
    if (selectedScale !== 'all') filtered = filtered.filter(t => t.scale === selectedScale);
    
    filtered.sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        if (!dateA || !dateB) return 0;
        return isArchive ? dateB - dateA : dateA - dateB;
    });

    tournamentList.innerHTML = '';
    if (filtered.length > 0) {
        filtered.forEach(tournament => {
            const card = document.createElement('div');
            card.className = `tournament-card ${isArchive ? 'archived' : ''}`;
            card.dataset.tournamentId = tournament.id;
            card.innerHTML = `
              <img src="${tournament.logo || 'https://via.placeholder.com/64'}" class="tournament-logo" alt="Логотип">
              <div class="tournament-info">
                <strong>${tournament.name}</strong>
                <span>${tournament.scale} | ${tournament.city}</span>
                <span>Дата: ${tournament.date}</span>
              </div>`;
            card.addEventListener('click', () => showTournamentDetails(tournament.id));
            tournamentList.appendChild(card);
        });
    } else {
        tournamentList.innerHTML = '<p>Турниры не найдены.</p>';
    }
}

async function showTournamentDetails(tournamentId) {
    try {
        const tournamentData = await supabaseFetch(`tournaments?id=eq.${tournamentId}&select=*`, 'GET');
        if (!tournamentData || tournamentData.length === 0) return;
        
        currentTournamentId = tournamentId;
        const tournament = tournamentData[0];
        const isCreator = tournament.creator_id === userData.telegramUsername;
        
        const header = document.getElementById('tournament-header');
        header.innerHTML = `
          <img src="${tournament.logo || 'https://via.placeholder.com/180'}" alt="Логотип турнира">
          <strong>${tournament.name}</strong>
          <p>Дата: ${tournament.date}</p>
          <p>Масштаб: ${tournament.scale || 'Не указан'}</p>
          <p>Город: ${tournament.city || 'Не указан'}</p>
        `;

        document.getElementById('tournament-description').innerHTML = `<p>${tournament.desc || 'Описание отсутствует.'}</p>`;
        document.getElementById('toggle-description-btn').onclick = () => {
            document.getElementById('tournament-description').classList.toggle('description-hidden');
        };
        
        document.querySelectorAll('.content').forEach(section => section.classList.remove('active'));
        document.getElementById('tournament-details').classList.add('active');

        const tabsContainer = document.getElementById('tournament-nav-tabs');
        const contentContainer = document.getElementById('tournament-future-content');
        
        if (!contentContainer) {
            console.error('Critical error: contentContainer not found!');
            return;
        }

        tabsContainer.innerHTML = '<button id="posts-tab" class="tab-btn">Посты</button>';
        
        contentContainer.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        
        loadTournamentPosts(tournamentId, isCreator, tournament.name);

        const regTabBtn = document.createElement('button');
        regTabBtn.id = 'registration-tab';
        regTabBtn.className = 'tab-btn';
        regTabBtn.textContent = 'Регистрация';
        tabsContainer.appendChild(regTabBtn);
        initRegistration();
        loadRegistrations(tournamentId, isCreator);
        
        if (isCreator) {
            const tabManagementBtn = document.createElement('button');
            tabManagementBtn.id = 'tab-management-tab';
            tabManagementBtn.className = 'tab-btn';
            tabManagementBtn.textContent = 'ТЭБ';
            tabsContainer.appendChild(tabManagementBtn);
            loadTabManagement(tournamentId, isCreator);
        } else if (tournament.tab_published) {
            const participantsBtn = document.createElement('button');
            participantsBtn.id = 'participants-tab';
            participantsBtn.className = 'tab-btn';
            participantsBtn.textContent = 'Участники';
            tabsContainer.appendChild(participantsBtn);
            loadParticipants(tournamentId);
        }

        const bracketTabBtn = document.createElement('button');
        bracketTabBtn.id = 'bracket-tab';
        bracketTabBtn.className = 'tab-btn';
        bracketTabBtn.textContent = 'Сетка';
        tabsContainer.appendChild(bracketTabBtn);
        initBracket(isCreator);
        loadBracket(tournamentId, isCreator);
        
        const allTabs = tabsContainer.querySelectorAll('.tab-btn');
        const allContent = contentContainer.querySelectorAll('.tab-content');

        allTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = e.target.id.replace('-tab', '');
                let activeContentId = `tournament-${tabId}`;
                if (tabId === 'tab-management') activeContentId = 'tournament-tab-management';
                if (tabId === 'participants') activeContentId = 'tournament-participants';

                allContent.forEach(el => el.classList.remove('active'));
                allTabs.forEach(el => el.classList.remove('active'));
                
                const activeContentElement = document.getElementById(activeContentId);
                if (activeContentElement) {
                    activeContentElement.classList.add('active');
                }
                e.target.classList.add('active');
            });
        });

        tabsContainer.querySelector('.tab-btn').click();

    } catch (error) {
        console.error('Ошибка при показе деталей турнира:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function loadTournamentPosts(tournamentId, isCreator, tournamentName) {
    const postsSection = document.getElementById('tournament-posts');
    postsSection.innerHTML = '';
    if (isCreator) {
        postsSection.innerHTML = `
            <div id="new-tournament-post">
                <textarea id="tournament-post-text" placeholder="Создать пост от имени турнира"></textarea>
                <button id="submit-tournament-post">Опубликовать</button>
            </div>
            <div id="tournament-posts-list"></div>
        `;
        document.getElementById('submit-tournament-post').onclick = async () => {
            const postText = document.getElementById('tournament-post-text').value.trim();
            if (!postText) {
                alert('Введите текст поста!');
                return;
            }
            const post = {
                tournament_id: tournamentId,
                text: postText,
                timestamp: new Date().toISOString()
            };
            try {
                await supabaseFetch('tournament_posts', 'POST', post);
                document.getElementById('tournament-post-text').value = '';
                loadTournamentPosts(tournamentId, isCreator, tournamentName); 
            } catch (error) {
                alert('Ошибка при публикации поста: ' + error.message);
            }
        };
    } else {
        postsSection.innerHTML = `<div id="tournament-posts-list"></div>`;
    }
    const postsList = document.getElementById('tournament-posts-list');
    postsList.innerHTML = '<p>Загрузка постов...</p>';
    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=timestamp.desc`, 'GET');
        postsList.innerHTML = '';
        if (posts?.length > 0) {
            posts.forEach(post => {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post'); 
                const formattedContent = formatPostContent(post.text);
                const timeAgo = getTimeAgo(new Date(post.timestamp));
                postDiv.innerHTML = `
                    <div class="post-header">
                        <div class="post-user"><strong>Турнир: ${tournamentName}</strong></div>
                        <div class="post-time">${timeAgo}</div>
                    </div>
                    <div class="post-content">${formattedContent}</div>`;
                postsList.appendChild(postDiv);
            });
        } else {
            postsList.innerHTML = '<p>Пока нет постов от турнира.</p>';
        }
    } catch (error) {
        postsList.innerHTML = '<p>Ошибка загрузки постов.</p>';
    }
}


function initRegistration() {
    const registerBtn = document.getElementById('register-tournament-btn');
    const registrationForm = document.getElementById('registration-form');
    
    registerBtn.onclick = () => registrationForm.classList.toggle('form-hidden');

    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitRegistrationBtn = document.getElementById('submit-registration-btn');
        if (submitRegistrationBtn.disabled) return;
        submitRegistrationBtn.disabled = true;

        const registrationData = {
            tournament_id: currentTournamentId,
            faction_name: document.getElementById('reg-faction-name').value.trim(),
            speaker1_username: document.getElementById('reg-username1').value.trim(),
            speaker2_username: document.getElementById('reg-username2').value.trim(),
            club: document.getElementById('reg-club').value.trim(),
            city: document.getElementById('reg-city').value.trim(),
            contacts: document.getElementById('reg-contacts').value.trim(),
            extra: document.getElementById('reg-extra').value.trim(),
            timestamp: new Date().toISOString()
        };
        
        if (!registrationData.faction_name || !registrationData.speaker1_username || !registrationData.speaker2_username || !registrationData.club) {
            alert('Пожалуйста, заполните поля: Название фракции, Username обоих спикеров и Клуб.');
            submitRegistrationBtn.disabled = false;
            return;
        }

        try {
            const usernamesToCheck = [registrationData.speaker1_username, registrationData.speaker2_username];
            const profiles = await supabaseFetch(`profiles?telegram_username=in.(${usernamesToCheck.join(',')})`, 'GET');
            
            if (profiles.length < 2) {
                alert('Один или оба указанных username не найдены в системе. Убедитесь, что спикеры зарегистрированы в приложении.');
                submitRegistrationBtn.disabled = false;
                return;
            }

            await supabaseFetch('registrations', 'POST', registrationData);

            const currentUser = userData.telegramUsername;
            const teammate = registrationData.speaker1_username === currentUser ? registrationData.speaker2_username : registrationData.speaker1_username;
            const tournamentInfo = allTournaments.find(t => t.id === currentTournamentId);

            const { error: invokeError } = await supabaseClient.functions.invoke('send-telegram-notification', {
              body: JSON.stringify({
                type: 'registration',
                data: {
                  registered_by: currentUser,
                  teammate_username: teammate,
                  faction_name: registrationData.faction_name,
                  tournament_id: currentTournamentId,
                  tournament_name: tournamentInfo ? tournamentInfo.name : 'Неизвестный турнир'
                }
              })
            });

            if (invokeError) throw new Error(`Ошибка вызова функции уведомлений: ${invokeError.message}`);

            alert('Регистрация отправлена! Ваш напарник получит уведомление.');
            registrationForm.classList.add('form-hidden');
            registrationForm.reset();
            loadRegistrations(currentTournamentId, true);
        } catch (error) {
            alert('Ошибка: ' + error.message);
        } finally {
            submitRegistrationBtn.disabled = false;
        }
    });
}

async function loadRegistrations(tournamentId, isCreator) {
    const registrationList = document.getElementById('registration-list');
    registrationList.innerHTML = '<p>Загрузка регистраций...</p>';
    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&order=timestamp.asc`, 'GET');
        if (!registrations || registrations.length === 0) {
            registrationList.innerHTML = '<p>Пока нет зарегистрированных команд.</p>';
            return;
        }
        const usernames = new Set(registrations.flatMap(r => [r.speaker1_username, r.speaker2_username].filter(Boolean)));
        await getSpeakerFullNames([...usernames]); 
        
        registrationList.innerHTML = '';
        registrations.forEach(reg => {
            const speaker1_fullname = profilesCache.get(reg.speaker1_username) || `(${reg.speaker1_username})`;
            const speaker2_fullname = profilesCache.get(reg.speaker2_username) || `(${reg.speaker2_username})`;
            
            const card = document.createElement('div');
            card.className = `registration-card status-${reg.status}`;
            
            let actionsHtml = '';
            if (isCreator) {
                actionsHtml = '<div class="registration-actions">';
                if (reg.status === 'pending') {
                    actionsHtml += `<button class="action-btn accept" data-id="${reg.id}" data-status="accepted">✅ В ТЭБ</button>`;
                    actionsHtml += `<button class="action-btn reserve" data-id="${reg.id}" data-status="reserve">🔄 В резерв</button>`;
                }
                actionsHtml += `<button class="delete-registration-btn" data-id="${reg.id}">❌ Удалить</button>`;
                actionsHtml += '</div>';
            }

            card.innerHTML = `
                <div class="registration-card-header">
                    <strong>${reg.faction_name}</strong>
                    <span>Статус: ${reg.status}</span>
                </div>
                <div class="registration-card-body">
                    <p>Спикеры: ${speaker1_fullname} & ${speaker2_fullname}</p>
                    <p>Клуб: ${reg.club}</p>
                </div>
                ${actionsHtml}
            `;
            registrationList.appendChild(card);
        });

        if (isCreator) {
            registrationList.querySelectorAll('.action-btn, .delete-registration-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    const regId = e.target.dataset.id;
                    if (e.target.classList.contains('delete-registration-btn')) {
                        if (confirm('Вы уверены, что хотите удалить эту регистрацию?')) {
                            deleteRegistration(regId, tournamentId, isCreator);
                        }
                    } else {
                        const newStatus = e.target.dataset.status;
                        updateRegistrationStatus(regId, newStatus);
                    }
                });
            });
        }
    } catch (error) {
        registrationList.innerHTML = '<p>Ошибка загрузки регистраций.</p>';
        console.error('Ошибка загрузки регистраций:', error);
    }
}

async function deleteRegistration(registrationId, tournamentId, isCreator) {
  try {
    await supabaseFetch(`registrations?id=eq.${registrationId}`, 'DELETE');
    alert('Команда удалена!');
    await loadRegistrations(tournamentId, isCreator);
    await loadTabManagement(tournamentId, isCreator);
  } catch (error) {
    alert('Ошибка при удалении: ' + error.message);
  }
}

async function updateRegistrationStatus(registrationId, newStatus) {
    const isCreator = true; 
    try {
        await supabaseFetch(`registrations?id=eq.${registrationId}`, 'PATCH', { status: newStatus });
        loadRegistrations(currentTournamentId, isCreator);
        loadTabManagement(currentTournamentId, isCreator);
    } catch (error) {
        alert('Ошибка обновления статуса: ' + error.message);
    }
}

async function loadTabManagement(tournamentId, isCreator) {
    if (!isCreator) return;
    const mainList = document.getElementById('tab-main-list');
    const reserveList = document.getElementById('tab-reserve-list');
    const statsDiv = document.getElementById('tab-stats');
    const publishBtn = document.getElementById('publish-tab-btn');
    
    const [registrations, tournament] = await Promise.all([
        supabaseFetch(`registrations?tournament_id=eq.${tournamentId}`, 'GET'),
        supabaseFetch(`tournaments?id=eq.${tournamentId}&select=tab_published`, 'GET')
    ]);

    if(!registrations || !tournament.length) return;

    const isPublished = tournament[0].tab_published;
    const acceptedTeams = registrations.filter(r => r.status === 'accepted');
    const reserveTeams = registrations.filter(r => r.status === 'reserve');

    statsDiv.textContent = `Зарегистрировано: ${registrations.length} | В ТЭБе: ${acceptedTeams.length}`;
    publishBtn.textContent = isPublished ? 'Скрыть ТЭБ' : 'Опубликовать ТЭБ';
    publishBtn.className = `publish-btn ${isPublished ? 'unpublish' : 'publish'}`;
    publishBtn.onclick = () => publishTab(tournamentId, !isPublished);
    
    const usernames = new Set(registrations.flatMap(r => [r.speaker1_username, r.speaker2_username].filter(Boolean)));
    await getSpeakerFullNames([...usernames]);

    const renderList = (list, teams) => {
        list.innerHTML = '';
        if (teams.length === 0) {
            list.innerHTML = '<p>Список пуст.</p>';
            return;
        }
        teams.forEach(reg => {
            const speaker1_fullname = profilesCache.get(reg.speaker1_username) || `(${reg.speaker1_username})`;
            const speaker2_fullname = profilesCache.get(reg.speaker2_username) || `(${reg.speaker2_username})`;
            const card = document.createElement('div');
            card.className = `registration-card status-${reg.status}`;
            let actionsHtml = '<div class="registration-actions">';
            if (reg.status === 'accepted') {
                actionsHtml += `<button class="action-btn reserve" data-id="${reg.id}" data-status="reserve">🔄 В резерв</button>`;
            } else if (reg.status === 'reserve') {
                actionsHtml += `<button class="action-btn accept" data-id="${reg.id}" data-status="accepted">✅ В осн. состав</button>`;
            }
            actionsHtml += `<button class="action-btn remove" data-id="${reg.id}" data-status="pending">❌ Убрать</button></div>`;
            card.innerHTML = `<div class="registration-card-header"><strong>${reg.faction_name}</strong></div>
                              <div class="registration-card-body"><p>${speaker1_fullname} & ${speaker2_fullname}</p></div>
                              ${actionsHtml}`;
            list.appendChild(card);
        });
        list.querySelectorAll('.action-btn').forEach(btn => btn.addEventListener('click', e => updateRegistrationStatus(e.target.dataset.id, e.target.dataset.status)));
    };

    renderList(mainList, acceptedTeams);
    renderList(reserveList, reserveTeams);
}

async function publishTab(tournamentId, publishState) {
    try {
        await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'PATCH', { tab_published: publishState });
        alert(`ТЭБ успешно ${publishState ? 'опубликован' : 'скрыт'}!`);
        loadTabManagement(tournamentId, true);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

async function loadParticipants(tournamentId) {
    const mainList = document.getElementById('participants-main-list');
    const reserveList = document.getElementById('participants-reserve-list');
    mainList.innerHTML = '<p>Загрузка...</p>';
    reserveList.innerHTML = '<p>Загрузка...</p>';
    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&status=in.(accepted,reserve)`, 'GET');
        const acceptedTeams = registrations.filter(r => r.status === 'accepted');
        const reserveTeams = registrations.filter(r => r.status === 'reserve');
        
        const usernames = new Set(registrations.flatMap(r => [r.speaker1_username, r.speaker2_username].filter(Boolean)));
        await getSpeakerFullNames([...usernames]);

        const renderReadonlyList = (list, teams, title) => {
            list.innerHTML = '';
            if (teams.length === 0) {
                list.innerHTML = `<p>${title} пуст.</p>`;
                return;
            }
            teams.forEach(reg => {
                const speaker1_fullname = profilesCache.get(reg.speaker1_username) || `(${reg.speaker1_username})`;
                const speaker2_fullname = profilesCache.get(reg.speaker2_username) || `(${reg.speaker2_username})`;
                const card = document.createElement('div');
                card.className = `registration-card status-${reg.status}`;
                card.innerHTML = `<div class="registration-card-header"><strong>${reg.faction_name}</strong></div>
                                  <div class="registration-card-body"><p>${speaker1_fullname} & ${speaker2_fullname}</p></div>`;
                list.appendChild(card);
            });
        };
        renderReadonlyList(mainList, acceptedTeams, 'Основной состав');
        renderReadonlyList(reserveList, reserveTeams, 'Резерв');
    } catch(error) {
        mainList.innerHTML = '<p>Ошибка загрузки.</p>';
        reserveList.innerHTML = '';
    }
}

// --- БЛОК УПРАВЛЕНИЯ СЕТКОЙ ---

function initBracket(isCreator) {
  const bracketSection = document.getElementById('tournament-bracket');
  bracketSection.innerHTML = '';
  if (isCreator) {
    bracketSection.innerHTML = `
      <div id="bracket-form">
        <h4>Управление сеткой отборочных раундов</h4>
        <select id="bracket-format">
          <option value="АПФ">АПФ</option>
          <option value="БПФ">БПФ</option>
        </select>
        <input id="bracket-faction-count" type="number" placeholder="Количество фракций" required>
        <input id="bracket-round-count" type="number" placeholder="Количество раундов" required>
        <button id="generate-bracket-btn">Сгенерировать 1-й раунд</button>
      </div>
      <div id="bracket-display"></div>
    `;
    document.getElementById('generate-bracket-btn').onclick = generateBracket;
  } else {
    bracketSection.innerHTML = `<div id="bracket-display"></div>`;
  }
}

// Найдите эту функцию в script.js
async function generateBracket() {
  if (!confirm("Вы уверены, что хотите сгенерировать новую сетку? Это действие удалит существующую сетку для этого турнира.")) {
      return;
  }

  const format = document.getElementById('bracket-format').value;
  const factionCount = parseInt(document.getElementById('bracket-faction-count').value);
  const roundCountValue = document.getElementById('bracket-round-count').value;

  if (!roundCountValue || isNaN(parseInt(roundCountValue)) || parseInt(roundCountValue) < 1) {
    alert('Пожалуйста, введите корректное количество раундов (целое число больше 0).');
    return;
  }
  const roundCount = parseInt(roundCountValue);

  if (isNaN(factionCount) || factionCount < 2 || (format === 'АПФ' && factionCount % 2 !== 0) || (format === 'БПФ' && factionCount % 4 !== 0)) {
    alert('Количество фракций не соответствует требованиям формата!');
    return;
  }
  
  const registrations = await supabaseFetch(`registrations?tournament_id=eq.${currentTournamentId}&status=eq.accepted&order=timestamp.asc`, 'GET');
  
  if (!registrations || registrations.length < factionCount) {
    alert(`Недостаточно принятых команд для формирования сетки! В ТЭБе ${registrations.length}, а требуется ${factionCount}.`);
    return;
  }
  
  let teams = registrations.slice(0, factionCount).map(reg => ({
    faction_name: reg.faction_name,
    club: reg.club,
    speakers: [{ username: reg.speaker1_username, points: 0 }, { username: reg.speaker2_username, points: 0 }]
  }));
  
  teams.sort(() => Math.random() - 0.5);

  const positions = format === 'АПФ' ? ['Правительство', 'Оппозиция'] : ['ОП', 'ОО', 'ЗП', 'ЗО'];
  const teamsPerMatch = format === 'АПФ' ? 2 : 4;
  
  const roundMatches = [];
  let availableTeams = [...teams];
  while(availableTeams.length >= teamsPerMatch) {
      const matchTeams = availableTeams.splice(0, teamsPerMatch);
      roundMatches.push({
          teams: matchTeams.map((team, idx) => ({ ...team, position: positions[idx] })),
          room: '', judge: '', winner: null
      });
  }

  const bracket = {
    tournament_id: currentTournamentId,
    format, faction_count: factionCount, round_count: roundCount,
    matches: [{ round: 1, matches: roundMatches }],
    published: false,
    results_published: false,
    timestamp: new Date().toISOString()
  };

  // --- ДОБАВЬТЕ СТРОКУ НИЖЕ ---
  console.log("Отправка в Supabase:", JSON.stringify(bracket, null, 2));

  try {
    const existingBrackets = await supabaseFetch(`brackets?tournament_id=eq.${currentTournamentId}`, 'GET');
    if (existingBrackets && existingBrackets.length > 0) {
      await supabaseFetch(`brackets?id=eq.${existingBrackets[0].id}`, 'DELETE');
    }
    await supabaseFetch('brackets', 'POST', bracket);
    loadBracket(currentTournamentId, true);
  } catch (error) {
    alert('Ошибка: ' + error.message);
    console.error(error);
  }
}

async function generateNextRound() {
    const bracket = window.currentBracketData;
    if (!bracket) return;

    const currentRoundNumber = bracket.matches.length;
    const lastRound = bracket.matches[currentRoundNumber - 1];

    const allResultsEntered = lastRound.matches.every(match => match.winner);
    if (!allResultsEntered) {
        alert(`Сначала введите все результаты для раунда ${currentRoundNumber}.`);
        return;
    }

    if (!confirm(`Вы уверены, что хотите сгенерировать раунд ${currentRoundNumber + 1}?`)) return;

    let teamWins = {};
    let pastOpponents = {};

    bracket.matches.forEach(round => {
        round.matches.forEach(match => {
            const teamNames = match.teams.map(t => t.faction_name);
            teamNames.forEach(name => {
                if (!teamWins[name]) teamWins[name] = 0;
                if (!pastOpponents[name]) pastOpponents[name] = new Set();
                teamNames.forEach(opp => { if (opp !== name) pastOpponents[name].add(opp); });
            });
            if (match.winner) {
                teamWins[match.winner]++;
            }
        });
    });

    const allTeamsFromBracket = bracket.matches[0].matches.flatMap(m => m.teams.map(t => ({faction_name: t.faction_name, club: t.club, speakers: t.speakers})));
    
    let teamsByWins = {};
    Object.keys(teamWins).forEach(name => {
        const winCount = teamWins[name];
        if (!teamsByWins[winCount]) teamsByWins[winCount] = [];
        const teamData = allTeamsFromBracket.find(t => t.faction_name === name);
        if (teamData) teamsByWins[winCount].push(teamData);
    });

    const newRoundMatches = [];
    const teamsPerMatch = bracket.format === 'АПФ' ? 2 : 4;

    const sortedWinBrackets = Object.keys(teamsByWins).sort((a, b) => b - a);
    for (const winCount of sortedWinBrackets) {
        let bucket = teamsByWins[winCount].sort(() => Math.random() - 0.5);

        while (bucket.length >= teamsPerMatch) {
            let i = 0, j = 1;
            while (j < bucket.length) {
                const teamA = bucket[i];
                const teamB = bucket[j];
                if (!pastOpponents[teamA.faction_name].has(teamB.faction_name)) {
                    const matchTeams = [teamA, teamB];
                    newRoundMatches.push({ teams: matchTeams, room:'', judge:'', winner: null });
                    bucket.splice(j, 1); 
                    bucket.splice(i, 1);
                    i = 0; j = 1; // reset
                } else {
                    j++;
                }
            }
        }
    }
    
    const positions = bracket.format === 'АПФ' ? ['Правительство', 'Оппозиция'] : ['ОП', 'ОО', 'ЗП', 'ЗО'];
    newRoundMatches.forEach(match => {
        match.teams.forEach((team, idx) => team.position = positions[idx]);
    });

    bracket.matches.push({ round: currentRoundNumber + 1, matches: newRoundMatches });
    
    try {
        await supabaseFetch(`brackets?id=eq.${bracket.id}`, 'PATCH', { matches: bracket.matches });
        loadBracket(bracket.tournament_id, true);
    } catch (error) {
        alert('Ошибка при генерации следующего раунда: ' + error.message);
    }
}


async function getSpeakerFullNames(usernames) {
    const usernamesToFetch = usernames.filter(u => u && !profilesCache.has(u));
    if (usernamesToFetch.length > 0) {
        const fetchedProfiles = await supabaseFetch(`profiles?telegram_username=in.(${[...new Set(usernamesToFetch)].join(',')})`, 'GET');
        if (fetchedProfiles) {
            fetchedProfiles.forEach(p => profilesCache.set(p.telegram_username, p.fullname));
        }
    }
}

async function openResultsModal(roundIndex, matchIndex) {
    const modal = document.getElementById('results-modal');
    const modalBody = document.getElementById('results-modal-body');
    const saveBtn = document.getElementById('save-results-btn');
    const cancelBtn = document.getElementById('cancel-results-btn');

    const bracket = window.currentBracketData;
    const match = bracket.matches[roundIndex].matches[matchIndex];

    const allUsernames = match.teams.flatMap(team => team.speakers.map(s => s.username));
    await getSpeakerFullNames(allUsernames);

    let modalHtml = '<h4>Выберите победителя:</h4>';
    match.teams.forEach(team => {
        const isChecked = match.winner === team.faction_name ? 'checked' : '';
        modalHtml += `
            <div class="team-header">
                <input type="radio" id="winner-${team.faction_name.replace(/\s+/g, '-')}" name="winner" value="${team.faction_name}" ${isChecked}>
                <label for="winner-${team.faction_name.replace(/\s+/g, '-')}"><strong>${team.faction_name}</strong></label>
            </div>
        `;
    });

    modalHtml += '<hr><h4>Введите баллы спикеров:</h4>';

    match.teams.forEach(team => {
        modalHtml += `<div class="team-block"><h5>${team.faction_name}</h5>`;
        team.speakers.forEach(speaker => {
            const fullName = profilesCache.get(speaker.username) || speaker.username;
            modalHtml += `
                <div class="speaker-score">
                    <label for="score-${speaker.username}">${fullName}</label>
                    <input type="number" id="score-${speaker.username}" value="${speaker.points || 0}" min="0">
                </div>
            `;
        });
        modalHtml += '</div>';
    });

    modalBody.innerHTML = modalHtml;

    saveBtn.onclick = () => saveMatchResults(roundIndex, matchIndex);
    cancelBtn.onclick = () => modal.style.display = 'none';

    modal.style.display = 'flex';
}

async function saveMatchResults(roundIndex, matchIndex) {
    const modal = document.getElementById('results-modal');
    const bracket = window.currentBracketData;
    const match = bracket.matches[roundIndex].matches[matchIndex];

    match.teams.forEach(team => {
        team.speakers.forEach(speaker => {
            const input = document.getElementById(`score-${speaker.username}`);
            speaker.points = parseInt(input.value) || 0;
        });
    });

    const winnerInput = document.querySelector('input[name="winner"]:checked');
    match.winner = winnerInput ? winnerInput.value : null;

    await saveBracketSetup(true); 
    modal.style.display = 'none';
}


async function saveBracketSetup(isCalledFromModal = false) {
    const bracket = window.currentBracketData;
    if (!bracket) return;

    if (!isCalledFromModal) {
         bracket.matches.forEach((round, roundIndex) => {
            round.matches.forEach((match, matchIndex) => {
                const roomInput = document.querySelector(`input[data-round-index="${roundIndex}"][data-match-index="${matchIndex}"][data-field="room"]`);
                const judgeInput = document.querySelector(`input[data-round-index="${roundIndex}"][data-match-index="${matchIndex}"][data-field="judge"]`);
                if(roomInput) match.room = roomInput.value;
                if(judgeInput) match.judge = judgeInput.value;
            });
        });
    }
    
    try {
        await supabaseFetch(`brackets?id=eq.${bracket.id}`, 'PATCH', {
            matches: bracket.matches
        });
        if (!isCalledFromModal) alert('Изменения сохранены!');
        loadBracket(bracket.tournament_id, true);
    } catch (error) {
        alert('Ошибка сохранения: ' + error.message);
    }
}

async function toggleBracketPublication(publishState) {
    const bracket = window.currentBracketData;
    if (!bracket) return;
    
    const action = publishState ? "опубликовать" : "снять с публикации";
    if (!confirm(`Вы уверены, что хотите ${action} сетку?`)) return;

    try {
        await supabaseFetch(`brackets?id=eq.${bracket.id}`, 'PATCH', {
            published: publishState
        });
        alert(`Сетка успешно ${publishState ? "опубликована" : "скрыта"}.`);
        loadBracket(bracket.tournament_id, true);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

async function toggleResultsPublication(publishState) {
    const bracket = window.currentBracketData;
    if (!bracket) return;

    const action = publishState ? "опубликовать результаты" : "скрыть результаты";
     if (!confirm(`Вы уверены, что хотите ${action}? Это действие будет видно всем участникам.`)) return;

    try {
        await supabaseFetch(`brackets?id=eq.${bracket.id}`, 'PATCH', {
            results_published: publishState
        });
        alert(`Результаты успешно ${publishState ? "опубликованы" : "скрыты"}.`);
        loadBracket(bracket.tournament_id, true);
    } catch(error) {
        alert('Ошибка: ' + error.message);
    }
}

async function loadBracket(tournamentId, isCreator) {
  const bracketDisplay = document.getElementById('bracket-display');
  try {
    const brackets = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}&order=timestamp.desc&limit=1`, 'GET');
    bracketDisplay.innerHTML = '';

    if (brackets?.length > 0) {
      const bracket = brackets[0];
      window.currentBracketData = bracket;

      // --- Панель управления сеткой для организатора ---
      if(isCreator) {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'bracket-controls';
        
        const currentRoundNumber = bracket.matches.length;
        const totalRounds = bracket.round_count;
        const allResultsEnteredForLastRound = bracket.matches[currentRoundNumber - 1].matches.every(match => match.winner);

        let buttonsHtml = '';

        if (!bracket.published) {
            buttonsHtml += `<button id="save-bracket-setup-btn" onclick="saveBracketSetup()">Сохранить кабинеты/судей</button>`;
            buttonsHtml += `<button id="publish-bracket-btn" onclick="toggleBracketPublication(true)">Опубликовать сетку</button>`;
        } else {
            buttonsHtml += `<button id="unpublish-bracket-btn" onclick="toggleBracketPublication(false)">Снять с публикации</button>`;
        }

        if (currentRoundNumber < totalRounds && allResultsEnteredForLastRound && bracket.published) {
            buttonsHtml += `<button id="generate-next-round-btn" onclick="generateNextRound()">Сгенерировать ${currentRoundNumber + 1}-й раунд</button>`;
        }
        
        if (currentRoundNumber === totalRounds && allResultsEnteredForLastRound) {
            if (!bracket.results_published) {
                buttonsHtml += `<button id="publish-results-btn" onclick="toggleResultsPublication(true)">Опубликовать результаты</button>`;
            } else {
                buttonsHtml += `<button id="publish-results-btn" onclick="toggleResultsPublication(false)">Скрыть результаты</button>`;
            }
        }
        controlsDiv.innerHTML = buttonsHtml;
        bracketDisplay.appendChild(controlsDiv);
      }

      // --- Отображение раундов ---
      bracket.matches.forEach((round, roundIndex) => {
        const roundDiv = document.createElement('div');
        roundDiv.classList.add('bracket-round');
        roundDiv.innerHTML = `<h3>Раунд ${round.round}</h3>`;

        round.matches.forEach((match, matchIndex) => {
          const matchDiv = document.createElement('div');
          matchDiv.classList.add('bracket-match');
          
          const roomInfo = (!bracket.published && isCreator)
            ? `<input type="text" class="inline-bracket-input" data-round-index="${roundIndex}" data-match-index="${matchIndex}" data-field="room" value="${match.room || ''}" placeholder="Кабинет">`
            : `<span>Кабинет: ${match.room || 'Не указан'}</span>`;

          const judgeInfo = (!bracket.published && isCreator)
            ? `<input type="text" class="inline-bracket-input" data-round-index="${roundIndex}" data-match-index="${matchIndex}" data-field="judge" value="${match.judge || ''}" placeholder="Судья">`
            : `<span>Судья: ${match.judge || 'Не указан'}</span>`;

          let teamsHtml = match.teams.map(team => {
            const isWinner = match.winner === team.faction_name;
            const showResults = bracket.results_published || isCreator;
            const winnerClass = (isWinner && showResults) ? 'class="match-winner"' : '';
            
            // Проверка на наличие speakers
            const totalScore = team.speakers ? team.speakers.reduce((sum, s) => sum + (s.points || 0), 0) : 0;
            const scoreHtml = (totalScore > 0 && showResults) ? `<span class="team-total-score">(${totalScore})</span>` : '';

            return `<li ${winnerClass}>
                        <div class="team-name-wrapper">
                            <span>${team.position}: <strong>${team.faction_name}</strong></span>
                            ${scoreHtml}
                        </div>
                    </li>`;
          }).join('');

          const resultButton = (isCreator && bracket.published) ? `<button class="result-btn" onclick="openResultsModal(${roundIndex}, ${matchIndex})">Ввести / Изменить результат</button>` : '';

          matchDiv.innerHTML = `
            <h4>Матч ${matchIndex + 1}</h4>
            <div class="match-details">${roomInfo} ${judgeInfo}</div>
            <ul>${teamsHtml}</ul>
            ${resultButton}
          `;
          roundDiv.appendChild(matchDiv);
        });
        bracketDisplay.appendChild(roundDiv);
      });
    } else {
      bracketDisplay.innerHTML = '<p>Сетка не сформирована.</p>';
    }
  } catch (error) {
    bracketDisplay.innerHTML = '<p>Ошибка загрузки сетки.</p>';
    console.error("Error loading bracket:", error);
  }
}

function initRating() {
    const cityView = document.getElementById('rating-city-view');
    const seasonView = document.getElementById('rating-season-view');
    const tableView = document.getElementById('rating-table-view');

    const cityList = document.getElementById('rating-city-list');
    const seasonList = document.getElementById('rating-season-list');
    const seasonTitle = document.getElementById('rating-season-title');

    const backToCitiesBtn = document.getElementById('rating-back-to-cities');
    const backToSeasonsBtn = document.getElementById('rating-back-to-seasons');

    const cities = [
        { id: 'almaty', name: 'Алматы', icon: '🏔️', hasData: true },
        { id: 'astana', name: 'Астана', icon: '🏛️', hasData: false },
        { id: 'shymkent', name: 'Шымкент', icon: '☀️', hasData: false }
    ];

    function showView(viewToShow) {
        cityView.classList.add('selector-hidden');
        seasonView.classList.add('selector-hidden');
        tableView.classList.add('selector-hidden');
        viewToShow.classList.remove('selector-hidden');
    }

    function renderCities() {
        cityList.innerHTML = '';
        cities.forEach(city => {
            const card = document.createElement('div');
            card.className = 'rating-card';
            card.innerHTML = `<span class="rating-icon">${city.icon}</span> <span>${city.name}</span>`;
            card.onclick = () => showSeasonsForCity(city);
            cityList.appendChild(card);
        });
        showView(cityView);
    }
    
    function showSeasonsForCity(city) {
        seasonList.innerHTML = '';
        seasonTitle.textContent = city.name;
        
        if (city.hasData) {
            const card = document.createElement('div');
            card.className = 'rating-card';
            card.innerHTML = `<span class="rating-icon">📅</span> <span>2024-2025</span>`;
            card.onclick = () => {
                renderRatingTable();
                showView(tableView);
            };
            seasonList.appendChild(card);
        } else {
            seasonList.innerHTML = `<p class="rating-placeholder">Рейтинги не предоставлены</p>`;
        }
        showView(seasonView);
    }
    
    backToCitiesBtn.onclick = () => showView(cityView);
    backToSeasonsBtn.onclick = () => showView(seasonView);

    renderCities();
}

function renderRatingTable() {
    const tableBody = document.getElementById('rating-list-tbody');
    tableBody.innerHTML = '';
    tableBody.innerHTML = ratingData.map(player => `
        <tr class="rank-${player.rank}">
            <td>${player.rank}</td>
            <td>${player.name}</td>
            <td>${player.points}</td>
            <td>${player.club}</td>
        </tr>
    `).join('');
}

checkProfile();
