const SUPABASE_URL = 'https://dwkbptqrblyiqymnqjiv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2JwdHFyYmx5aXF5bW5xaml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MzA3NTcsImV4cCI6MjA1OTAwNjc1N30.QIHms9_kllO7SMxxUlu2U_ugICz1q_cr2-fO61092N4';

console.log('script.js loaded, version: 2025-05-15');

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

// Данные рейтинга
const ratingData = [
    { name: "Олжас Сейтов", points: 948, rank: 1, club: "derbes" },
    { name: "Мұхаммедәлі Әлішбаев", points: 936, rank: 2, club: "TEO" },
    { name: "Нұрболат Тілеубай", points: 872, rank: 3, club: "KBTU" },
    { name: "Темірлан Есенов", points: 785, rank: 4, club: "TEO" },
    { name: "Нұрхан Жакен", points: 733, rank: 5, club: "AS" },
    { name: "Динара Әукенова", points: 671.5, rank: 6, club: "TEO" },
    { name: "Ерасыл Шаймурадов", points: 665, rank: 7, club: "СДУ" },
    { name: "Алтынай Қалдыбай", points: 600.5, rank: 8, club: "ДЕРБЕС" },
    { name: "Жандос Әмре", points: 558, rank: 9, club: "ЮАЙБИ" },
    { name: "Ердаулет Қалмұрат", points: 462, rank: 10, club: "СДУ" },
    { name: "Арайлым Абдукаримова", points: 460, rank: 11, club: "ТЭО" },
    { name: "Ақылжан Итегулов", points: 440.5, rank: 12, club: "ДЕРБЕС" },
    { name: "Ерғалым Айтжанов", points: 430.5, rank: 13, club: "ТЭО" },
    { name: "Еламан Әбдіманапов", points: 421, rank: 14, club: "ЗИЯЛЫ" },
    { name: "Жансерік Жолшыбек", points: 411, rank: 15, club: "СИРИУС" },
    { name: "Регина Жардемгалиева", points: 400, rank: 16, club: "ТЭО" },
    { name: "Айдана Мухамет", points: 396, rank: 17, club: "НЛО" },
    { name: "Азамат Арынов", points: 377, rank: 18, club: "СДУ" },
    { name: "Адема Сералиева", points: 373.5, rank: 19, club: "ТЭО" },
    { name: "Әлібек Сұлтанов", points: 351, rank: 20, club: "АС" },
    { name: "Гаухар Төлебай", points: 345, rank: 21, club: "СДУ" },
    { name: "Әсет Оразғали", points: 336, rank: 22, club: "СДУ" },
    { name: "Ислам Аманқос", points: 326.5, rank: 23, club: "СДУ" },
    { name: "Арсен Сәуірбай", points: 322.5, rank: 24, club: "СДУ" },
    { name: "Дәулет Мырзакулов", points: 282, rank: 25, club: "АС" },
    { name: "Димаш Әшірбек", points: 274, rank: 26, club: "СДУ" },
    { name: "Ерлан Бөлекбаев", points: 268, rank: 27, club: "ТЭО" },
    { name: "Ахансері Амиреев", points: 263, rank: 28, club: "СИРИУС" },
    { name: "Айша Қуандық", points: 255.5, rank: 29, club: "СДУ" },
    { name: "Диас Мухамет", points: 254, rank: 30, club: "ТЕХНО" }
];

async function supabaseFetch(endpoint, method, body = null, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
                method: method,
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': method === 'POST' || method === 'PATCH' ? 'return=representation' : undefined
                },
                body: body ? JSON.stringify(body) : null
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Supabase error: ${response.status} - ${errorText}`);
            }
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } catch (error) {
            if (attempt === retries) throw error;
            console.warn(`Retrying request (${attempt}/${retries})...`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

async function uploadImage(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { data, error } = await supabaseClient.storage
        .from('post-images')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });
    
    if (error) {
        throw new Error(`Ошибка загрузки изображения: ${error.message}`);
    }
    
    const { data: urlData } = supabaseClient.storage
        .from('post-images')
        .getPublicUrl(fileName);
    
    return urlData.publicUrl;
}

async function saveChatId(userId) {
    if (tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ chat_id: tg.initDataUnsafe.user.id.toString() })
                .eq('telegram_username', userData.telegramUsername);
            if (error) throw error;
            console.log('Chat ID saved:', tg.initDataUnsafe.user.id);
            showProfile();
        } catch (error) {
            console.error('Error saving chat_id:', error);
            alert('Ошибка привязки Telegram: ' + error.message);
        }
    } else {
        const botLink = `https://t.me/MyPKRBot?start=${userId}`;
        tg.openTelegramLink(botLink);
    }
}

async function showProfile() {
    const profileSection = document.getElementById('profile');
    try {
        const profiles = await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'GET');
        if (profiles && profiles.length > 0) {
            const profile = profiles[0];
            const chatIdStatus = profile.chat_id ? `Привязан (ID: ${profile.chat_id})` : 'Не привязан';
            profileSection.innerHTML = `
                <h2>Профиль</h2>
                ${!profile.chat_id ? '<p style="color: #ff4d4d;">📢 Привяжите Telegram для уведомлений!</p>' : ''}
                <p>Username: <span>${userData.telegramUsername}</span></p>
                <p>Chat ID: <span>${chatIdStatus}</span></p>
                <input id="fullname" type="text" placeholder="Имя и фамилия" value="${profile.fullname || ''}">
                <button id="update-profile">Изменить имя</button>
                ${!profile.chat_id ? '<button id="link-telegram">Привязать Telegram</button>' : ''}
                <h2>PKR EDU</h2>
                <p>Обучающий контент скоро появится!</p>
            `;
            const updateProfileBtn = document.getElementById('update-profile');
            updateProfileBtn.addEventListener('click', async () => {
                const newFullname = document.getElementById('fullname').value.trim();
                if (!newFullname) {
                    alert('Пожалуйста, введите новое имя!');
                    return;
                }
                userData.fullname = newFullname;
                try {
                    await supabaseFetch(`profiles?telegram_username=eq.${userData.telegramUsername}`, 'PATCH', {
                        fullname: userData.fullname
                    });
                    alert('Имя обновлено!');
                } catch (error) {
                    console.error('Error updating profile:', error);
                    alert('Ошибка: ' + error.message);
                }
            });
            if (!profile.chat_id) {
                document.getElementById('link-telegram').addEventListener('click', () => saveChatId(profiles[0].id));
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        profileSection.innerHTML += '<p>Ошибка загрузки профиля</p>';
    }
}

async function checkProfile() {
    console.log('checkProfile started');
    const telegramUsername = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.username : null;
    if (!telegramUsername) {
        alert('Telegram username недоступен! Укажите username в настройках Telegram.');
        return;
    }
    userData.telegramUsername = telegramUsername;

    try {
        const profiles = await supabaseFetch(`profiles?telegram_username=eq.${telegramUsername}`, 'GET');
        console.log('Profiles fetched:', profiles);
        if (profiles && profiles.length > 0) {
            userData.fullname = profiles[0].fullname;
            showApp();
            await saveChatId(profiles[0].id);
        } else {
            registrationModal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking profile:', error);
        registrationModal.style.display = 'block';
    }
}

submitProfileRegBtn.addEventListener('click', async () => {
    if (!regFullname.value.trim()) {
        alert('Пожалуйста, введите имя!');
        return;
    }
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
        console.error('Error saving profile:', error);
        alert('Ошибка: ' + error.message);
    }
});

function showApp() {
    console.log('showApp called, userData:', userData);
    appContainer.style.display = 'block';
    document.getElementById('username').textContent = userData.telegramUsername;
    document.getElementById('fullname').value = userData.fullname;
    console.log('Calling loadPosts');
    loadPosts();
    console.log('Calling subscribeToNewPosts');
    subscribeToNewPosts();
}

const sections = document.querySelectorAll('.content');
const buttons = document.querySelectorAll('.nav-btn');

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

buttons.forEach(button => {
    button.addEventListener('click', () => {
        buttons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        sections.forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(button.id.replace('-btn', ''));
        targetSection.classList.add('active');
        if (button.id === 'feed-btn') {
            debouncedLoadPosts();
        }
        if (button.id === 'tournaments-btn') {
            loadTournaments();
        }
        if (button.id === 'rating-btn') {
            loadRating();
        }
        if (button.id === 'profile-btn') {
            showProfile();
        }
    });
});

function loadRating() {
    const citySection = document.getElementById('city-section');
    const yearSection = document.getElementById('year-section');
    const rankingSection = document.getElementById('ranking-section');
    const rankingTableBody = document.getElementById('ranking-table-body');

    citySection.classList.add('active');
    yearSection.classList.remove('active');
    rankingSection.classList.remove('active');

    document.querySelectorAll('.city-item').forEach(item => {
        item.addEventListener('click', () => {
            citySection.classList.remove('active');
            yearSection.classList.add('active');
        });
    });

    document.querySelectorAll('.year-item').forEach(item => {
        item.addEventListener('click', () => {
            yearSection.classList.remove('active');
            rankingSection.classList.add('active');
            rankingTableBody.innerHTML = '';
            ratingData.forEach(speaker => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${speaker.rank}</td>
                    <td>${speaker.name}</td>
                    <td>${speaker.points}</td>
                    <td>${speaker.club}</td>
                `;
                rankingTableBody.appendChild(row);
            });
        });
    });
}

const debouncedLoadPosts = debounce(loadPosts, 300);

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
loadMoreBtn.addEventListener('click', () => {
    console.log('Load more button clicked');
    loadMorePosts();
});
postsDiv.appendChild(loadMoreBtn);

async function processTags(text, postId) {
    const tagRegex = /@([a-zA-Z0-9_]+)/g;
    const tags = text.match(tagRegex) || [];
    for (const tag of tags) {
        const username = tag.slice(1);
        try {
            await supabaseFetch('tag_notifications', 'POST', {
                tagged_username: username,
                post_id: postId,
                user_id: userData.telegramUsername,
                text: text,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error sending tag notification:', error);
        }
    }
}

submitPost.addEventListener('click', async () => {
    if (submitPost.disabled) return;
    submitPost.disabled = true;

    const postContent = postText.value.trim();
    if (!postContent) {
        alert('Пожалуйста, введите текст поста! Пустые посты не допускаются.');
        submitPost.disabled = false;
        return;
    }
    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${postContent}`;
    const post = {
        text: text,
        timestamp: new Date().toISOString(),
        user_id: userData.telegramUsername
    };
    try {
        if (postImage.files.length > 0) {
            const imageUrl = await uploadImage(postImage.files[0]);
            post.image_url = imageUrl;
        }
        const newPost = await supabaseFetch('posts', 'POST', post);
        postText.value = '';
        postImage.value = '';
        if (!postsCache.some(p => p.id === newPost[0].id)) {
            postsCache.unshift(newPost[0]);
            sortPostsCache();
            if (isUserAtTop()) {
                renderNewPost(newPost[0], true);
            } else {
                newPostsCount++;
                newPostsBtn.style.display = 'block';
                newPostsBtn.classList.add('visible');
            }
            lastPostId = postsCache[0].id;
            await processTags(postContent, newPost[0].id);
        }
    } catch (error) {
        console.error('Error saving post:', error);
        alert('Ошибка: ' + error.message);
    } finally {
        submitPost.disabled = false;
    }
});

async function loadPosts() {
    console.log('loadPosts started, isPostsLoaded:', isPostsLoaded);
    if (isPostsLoaded) {
        console.log('Posts already loaded, rendering from cache');
        renderPosts();
        return;
    }

    const loadingIndicator = document.getElementById('posts-loading');
    console.log('Loading indicator:', loadingIndicator);
    loadingIndicator.style.display = 'block';

    try {
        postsCache = [];
        console.log('Fetching initial posts from Supabase');
        const posts = await supabaseFetch('posts?order=id.desc&limit=20', 'GET');
        console.log('Initial posts loaded:', posts);
        if (posts) {
            postsCache = posts;
            sortPostsCache();
            renderPosts();
            if (postsCache.length > 0) {
                lastPostId = postsCache[0].id;
                console.log('lastPostId set to:', lastPostId);
            }
            isPostsLoaded = true;
            console.log('Fetching total posts count');
            const totalPosts = await supabaseFetch('posts?select=id', 'GET');
            console.log('Total posts in database:', totalPosts ? totalPosts.length : 'undefined');
            loadMoreBtn.style.display = totalPosts && totalPosts.length > 20 ? 'block' : 'block';
            console.log('loadMoreBtn display set to:', loadMoreBtn.style.display);
            if (posts.length === 20) {
                console.log('Loaded 20 posts, triggering loadMorePosts');
                loadMorePosts();
            }
        } else {
            console.log('No posts returned from Supabase');
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        alert('Ошибка загрузки постов: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
        console.log('loadPosts finished');
    }

    console.log('Setting up infinite scroll');
    setupInfiniteScroll();
}

async function loadMorePosts() {
    if (isLoadingMore || postsCache.length === 0) {
        console.log('Skipping loadMorePosts: isLoadingMore=', isLoadingMore, 'postsCache.length=', postsCache.length);
        return;
    }

    isLoadingMore = true;
    const oldestPostId = postsCache[postsCache.length - 1].id;
    console.log('Attempting to load more posts, oldestPostId:', oldestPostId);

    try {
        const query = `posts?id=lt.${oldestPostId}&order=id.desc&limit=20`;
        console.log('Supabase query:', query);
        const morePosts = await supabaseFetch(query, 'GET');
        console.log('Raw response from Supabase:', morePosts);

        if (morePosts && morePosts.length > 0) {
            const newPosts = morePosts.filter(post => !postsCache.some(p => p.id === post.id));
            console.log('Filtered new posts:', newPosts);
            if (newPosts.length > 0) {
                postsCache.push(...newPosts);
                sortPostsCache();
                renderMorePosts(newPosts);
                loadMoreBtn.style.display = 'block';
                console.log('Added new posts, total in cache:', postsCache.length);
            } else {
                loadMoreBtn.style.display = 'none';
                console.log('No new posts after filtering');
            }
        } else {
            loadMoreBtn.style.display = 'none';
            console.log('No more posts returned from Supabase');
        }
    } catch (error) {
        console.error('Error in loadMorePosts:', error);
    } finally {
        isLoadingMore = false;
        console.log('Finished loadMorePosts, isLoadingMore:', isLoadingMore);
    }
}

async function loadNewPosts() {
    try {
        const newPosts = await supabaseFetch(`posts?id=gt.${lastPostId}&order=id.desc`, 'GET');
        console.log('New posts loaded:', newPosts);
        if (newPosts && newPosts.length > 0) {
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
    if (channel) {
        supabaseClient.removeChannel(channel);
    }

    channel = supabaseClient
        .channel('posts-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
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
                    newPostsBtn.classList.add('visible');
                }
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Subscribed to posts channel');
            } else {
                console.error('Failed to subscribe to posts channel:', status);
            }
        });
}

function isUserAtTop() {
    const feedSection = document.getElementById('feed');
    return feedSection.scrollTop <= 50;
}

function setupInfiniteScroll() {
    const feedSection = document.getElementById('feed');
    if (!feedSection) {
        console.error('Feed section not found!');
        return;
    }
    console.log('Setting up infinite scroll');
    console.log('Feed CSS height:', feedSection.style.maxHeight);
    console.log('Feed scrollHeight:', feedSection.scrollHeight, 'clientHeight:', feedSection.clientHeight);
    feedSection.style.overflowY = 'auto';
    feedSection.removeEventListener('scroll', debouncedLoadMorePosts);
    feedSection.addEventListener('scroll', debouncedLoadMorePosts);
}

const debouncedLoadMorePosts = debounce(() => {
    const feedSection = document.getElementById('feed');
    if (!feedSection) {
        console.error('Feed section not found in debouncedLoadMorePosts');
        return;
    }
    const scrollBottom = feedSection.scrollHeight - feedSection.scrollTop - feedSection.clientHeight;
    console.log('Scroll event - scrollTop:', feedSection.scrollTop, 'scrollHeight:', feedSection.scrollHeight, 'clientHeight:', feedSection.clientHeight, 'scrollBottom:', scrollBottom);
    if (scrollBottom <= 200) {
        console.log('Near bottom, triggering loadMorePosts');
        loadMorePosts();
    }
}, 300);

function sortPostsCache() {
    postsCache.sort((a, b) => b.id - a.id);
}

function renderPosts() {
    postsDiv.innerHTML = '';
    for (const post of postsCache) {
        renderNewPost(post, false);
    }
    console.log('Rendered posts, count:', postsCache.length);
    postsDiv.appendChild(loadMoreBtn);
}

function renderNewPosts(newPosts, prepend = false) {
    for (const post of newPosts) {
        renderNewPost(post, prepend);
    }
}

function formatPostContent(content) {
    let formattedContent = content.replace(/\n/g, '<br>');
    const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]\}])/g;
    formattedContent = formattedContent.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    const tagRegex = /@([a-zA-Z0-9_]+)/g;
    formattedContent = formattedContent.replace(tagRegex, (tag) => {
        return `<span class="tag">${tag}</span>`;
    });
    return formattedContent;
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
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${formattedContent}</div>
        ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post image">` : ''}
        <div class="post-actions">
            <button class="reaction-btn like-btn" onclick="toggleReaction(${post.id}, 'like')">👍 0</button>
            <button class="reaction-btn dislike-btn" onclick="toggleReaction(${post.id}, 'dislike')">👎 0</button>
            <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">💬 Комментарии (0)</button>
        </div>
        <div class="comment-section" id="comments-${post.id}" style="display: none;">
            <button id="new-comments-btn-${post.id}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${post.id}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий..."></textarea>
                <button onclick="addComment(${post.id})">Отправить</button>
            </div>
        </div>
    `;

    if (prepend) {
        postsDiv.prepend(postDiv);
    } else {
        postsDiv.appendChild(postDiv);
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
                <div class="post-user">
                    <strong>${fullname}</strong>
                    <span>@${cleanUsername}</span>
                </div>
                <div class="post-time">${timeAgo}</div>
            </div>
            <div class="post-content">${formattedContent}</div>
            ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post image">` : ''}
            <div class="post-actions">
                <button class="reaction-btn like-btn" onclick="toggleReaction(${post.id}, 'like')">👍 0</button>
                <button class="reaction-btn dislike-btn" onclick="toggleReaction(${post.id}, 'dislike')">👎 0</button>
                <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">💬 Комментарии (0)</button>
            </div>
            <div class="comment-section" id="comments-${post.id}" style="display: none;">
                <button id="new-comments-btn-${post.id}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
                <div class="comment-list" id="comment-list-${post.id}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${post.id}" placeholder="Написать комментарий..."></textarea>
                <button onclick="addComment(${post.id})">Отправить</button>
            </div>
        </div>
    `;

        postsDiv.appendChild(postDiv);

        loadReactionsAndComments(post.id);
        subscribeToReactions(post.id);
    }
    console.log('Rendered more posts, count:', newPosts.length);
    postsDiv.appendChild(loadMoreBtn);
}

async function loadReactionsAndComments(postId) {
    try {
        const reactions = await loadReactions(postId);
        const likes = reactions.filter(r => r.type === 'like').length;
        const dislikes = reactions.filter(r => r.type === 'dislike').length;
        const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
        const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
        const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';

        const comments = await loadComments(postId);
        const commentCount = comments ? comments.length : 0;

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

            if (comments) {
                await renderComments(postId, comments);
            }

            setupCommentInfiniteScroll(postId);
        }
    } catch (error) {
        console.error('Error loading reactions and comments:', error);
    }
}

async function updatePost(postId) {
    const postIndex = postsCache.findIndex(post => post.id === postId);
    if (postIndex === -1) return;

    const post = await supabaseFetch(`posts?id=eq.${postId}`, 'GET');
    if (!post || post.length === 0) return;

    const reactions = await loadReactions(postId);
    const likes = reactions.filter(r => r.type === 'like').length;
    const dislikes = reactions.filter(r => r.type === 'dislike').length;
    const userReaction = reactions.find(r => r.user_id === userData.telegramUsername);
    const likeClass = userReaction && userReaction.type === 'like' ? 'active' : '';
    const dislikeClass = userReaction && userReaction.type === 'dislike' ? 'active' : '';

    const comments = await loadComments(postId);
    const commentCount = comments ? comments.length : 0;

    postsCache[postIndex] = post[0];
    const postDiv = postsDiv.querySelector(`[data-post-id="${postId}"]`);
    if (!postDiv) return;

    const [userInfo, ...contentParts] = post[0].text.split(':\n');
    const [fullname, username] = userInfo.split(' (@');
    const cleanUsername = username ? username.replace(')', '') : '';
    const content = contentParts.join(':\n');
    const formattedContent = formatPostContent(content);

    const timeAgo = getTimeAgo(new Date(post[0].timestamp));

    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
            </div>
            <div class="post-time">${timeAgo}</div>
        </div>
        <div class="post-content">${formattedContent}</div>
        ${post[0].image_url ? `<img src="${post[0].image_url}" class="post-image" alt="Post image">` : ''}
        <div class="post-actions">
            <button class="reaction-btn like-btn ${likeClass}" onclick="toggleReaction(${postId}, 'like')">👍 ${likes}</button>
            <button class="reaction-btn dislike-btn ${dislikeClass}" onclick="toggleReaction(${postId}, 'dislike')">👎 ${dislikes}</button>
            <button class="comment-toggle-btn" onclick="toggleComments(${postId})">💬 Комментарии (${commentCount})</button>
        </div>
        <div class="comment-section" id="comments-${postId}" style="display: none;">
            <button id="new-comments-btn-${postId}" class="new-posts-btn" style="display: none;">Новые комментарии</button>
            <div class="comment-list" id="comment-list-${postId}" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="comment-form">
                <textarea class="comment-input" id="comment-input-${postId}" placeholder="Написать комментарий..."></textarea>
                <button onclick="addComment(${postId})">Отправить</button>
            </div>
        </div>
    `;

    if (comments) {
        await renderComments(postId, comments);
    }
}

async function loadReactions(postId) {
    try {
        const reactions = await supabaseFetch(`reactions?post_id=eq.${postId}`, 'GET');
        return reactions || [];
    } catch (error) {
        console.error('Error loading reactions:', error);
        return [];
    }
}

async function toggleReaction(postId, type) {
    try {
        const existingReaction = await supabaseFetch(`reactions?post_id=eq.${postId}&user_id=eq.${userData.telegramUsername}`, 'GET');
        if (existingReaction && existingReaction.length > 0) {
            if (existingReaction[0].type === type) {
                await supabaseFetch(`reactions?post_id=eq.${postId}&user_id=eq.${userData.telegramUsername}`, 'DELETE');
            } else {
                await supabaseFetch(`reactions?post_id=eq.${postId}&user_id=eq.${userData.telegramUsername}`, 'PATCH', { type });
            }
        } else {
            await supabaseFetch('reactions', 'POST', {
                post_id: postId,
                user_id: userData.telegramUsername,
                type
            });
        }
        await updatePost(postId);
    } catch (error) {
        console.error('Error toggling reaction:', error);
        alert('Ошибка: ' + error.message);
    }
}

function subscribeToReactions(postId) {
    if (reactionChannels.has(postId)) {
        supabaseClient.removeChannel(reactionChannels.get(postId));
    }

    const channel = supabaseClient
        .channel(`reactions-post-${postId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `post_id=eq.${postId}` }, () => {
            updatePost(postId);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to reactions for post ${postId}`);
            }
        });

    reactionChannels.set(postId, channel);
}

async function loadComments(postId) {
    try {
        const comments = await supabaseFetch(`comments?post_id=eq.${postId}&order=id.desc&limit=20`, 'GET');
        commentsCache.set(postId, comments || []);
        if (comments && comments.length > 0) {
            lastCommentIds.set(postId, comments[0].id);
        }
        return comments || [];
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

async function renderComments(postId, comments) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    commentList.innerHTML = '';
    for (const comment of comments) {
        const commentDiv = document.createElement('div');
        commentDiv.classList.add('comment');

        const timeAgo = getTimeAgo(new Date(comment.timestamp));
        const [userInfo, content] = comment.text.split(':\n');
        const [fullname, username] = userInfo.split(' (@');
        const cleanUsername = username ? username.replace(')', '') : '';

        commentDiv.innerHTML = `
            <div class="comment-user">
                <strong>${fullname}</strong>
                <span>@${cleanUsername}</span>
                <span>${timeAgo}</span>
            </div>
            <div class="comment-content">${content}</div>
        `;
        commentList.appendChild(commentDiv);
    }
}

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const content = commentInput.value.trim();
    if (!content) {
        alert('Пожалуйста, введите комментарий!');
        return;
    }

    const text = `${userData.fullname} (@${userData.telegramUsername}):\n${content}`;
    try {
        const newComment = await supabaseFetch('comments', 'POST', {
            post_id: postId,
            text: text,
            user_id: userData.telegramUsername,
            timestamp: new Date().toISOString()
        });
        commentInput.value = '';
        const comments = await loadComments(postId);
        await renderComments(postId, comments);
        updatePost(postId);
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Ошибка: ' + error.message);
    }
}

function toggleComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    const isHidden = commentSection.style.display === 'none';
    commentSection.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        loadComments(postId).then(comments => renderComments(postId, comments));
        subscribeToComments(postId);
    } else {
        if (commentChannels.has(postId)) {
            supabaseClient.removeChannel(commentChannels.get(postId));
            commentChannels.delete(postId);
        }
    }
}

function subscribeToComments(postId) {
    if (commentChannels.has(postId)) {
        supabaseClient.removeChannel(commentChannels.get(postId));
    }

    const channel = supabaseClient
        .channel(`comments-post-${postId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, (payload) => {
            const newComment = payload.new;
            let comments = commentsCache.get(postId) || [];
            if (!comments.some(c => c.id === newComment.id)) {
                comments.unshift(newComment);
                commentsCache.set(postId, comments);
                lastCommentIds.set(postId, newComment.id);
                if (isCommentSectionAtTop(postId)) {
                    renderComments(postId, comments);
                    updatePost(postId);
                } else {
                    newCommentsCount.set(postId, (newCommentsCount.get(postId) || 0) + 1);
                    const newCommentsBtn = document.getElementById(`new-comments-btn-${postId}`);
                    newCommentsBtn.style.display = 'block';
                    newCommentsBtn.classList.add('visible');
                    newCommentsBtn.onclick = () => {
                        renderComments(postId, comments);
                        updatePost(postId);
                        newCommentsBtn.style.display = 'none';
                        newCommentsCount.set(postId, 0);
                    };
                }
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to comments for post ${postId}`);
            }
        });

    commentChannels.set(postId, channel);
}

function isCommentSectionAtTop(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    return commentList.scrollTop <= 50;
}

function setupCommentInfiniteScroll(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    commentList.addEventListener('scroll', debounce(() => {
        const scrollBottom = commentList.scrollHeight - commentList.scrollTop - commentList.clientHeight;
        if (scrollBottom <= 200) {
            loadMoreComments(postId);
        }
    }, 300));
}

async function loadMoreComments(postId) {
    const lastCommentId = lastCommentIds.get(postId);
    if (!lastCommentId) return;

    try {
        const moreComments = await supabaseFetch(`comments?post_id=eq.${postId}&id=lt.${lastCommentId}&order=id.desc&limit=20`, 'GET');
        if (moreComments && moreComments.length > 0) {
            let comments = commentsCache.get(postId) || [];
            const newComments = moreComments.filter(comment => !comments.some(c => c.id === comment.id));
            if (newComments.length > 0) {
                comments.push(...newComments);
                commentsCache.set(postId, comments);
                lastCommentIds.set(postId, newComments[newComments.length - 1].id);
                await renderComments(postId, comments);
            }
        }
    } catch (error) {
        console.error('Error loading more comments:', error);
    }
}

function getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return `${seconds} сек. назад`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин. назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч. назад`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} дн. назад`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} мес. назад`;
    const years = Math.floor(months / 12);
    return `${years} г. назад`;
}

async function loadTournaments() {
    const tournamentList = document.getElementById('tournament-list');
    tournamentList.innerHTML = '<div>Загрузка...</div>';
    try {
        const tournaments = await supabaseFetch('tournaments?order=created_at.desc', 'GET');
        tournamentList.innerHTML = '';
        if (tournaments && tournaments.length > 0) {
            tournaments.forEach(tournament => {
                const tournamentCard = document.createElement('div');
                tournamentCard.classList.add('tournament-card');
                tournamentCard.innerHTML = `
                    <img src="${tournament.logo_url || 'https://via.placeholder.com/64'}" class="tournament-logo" alt="Tournament logo">
                    <div class="tournament-info">
                        <strong>${tournament.name}</strong>
                        <span>📅 ${new Date(tournament.date).toLocaleDateString()}</span>
                        <span>📍 ${tournament.address}</span>
                    </div>
                `;
                tournamentCard.addEventListener('click', () => showTournamentDetails(tournament.id));
                tournamentList.appendChild(tournamentCard);
            });
        } else {
            tournamentList.innerHTML = '<p>Турниры не найдены.</p>';
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        tournamentList.innerHTML = '<p>Ошибка загрузки турниров</p>';
    }
}

const createTournamentBtn = document.getElementById('create-tournament-btn');
const createTournamentForm = document.getElementById('create-tournament-form');
const submitTournamentBtn = document.getElementById('submit-tournament');

createTournamentBtn.addEventListener('click', () => {
    createTournamentForm.classList.toggle('form-hidden');
});

submitTournamentBtn.addEventListener('click', async () => {
    const tournamentData = {
        name: document.getElementById('tournament-name').value.trim(),
        date: document.getElementById('tournament-date').value,
        logo_url: document.getElementById('tournament-logo').value.trim(),
        description: document.getElementById('tournament-desc').value.trim(),
        address: document.getElementById('tournament-address').value.trim(),
        registration_deadline: document.getElementById('tournament-deadline').value,
        created_by: userData.telegramUsername
    };

    if (!tournamentData.name || !tournamentData.date || !tournamentData.address) {
        alert('Пожалуйста, заполните обязательные поля: название, дата и адрес!');
        return;
    }

    try {
        await supabaseFetch('tournaments', 'POST', tournamentData);
        createTournamentForm.classList.add('form-hidden');
        document.getElementById('tournament-name').value = '';
        document.getElementById('tournament-date').value = '';
        document.getElementById('tournament-logo').value = '';
        document.getElementById('tournament-desc').value = '';
        document.getElementById('tournament-address').value = '';
        document.getElementById('tournament-deadline').value = '';
        loadTournaments();
        alert('Турнир успешно создан!');
    } catch (error) {
        console.error('Error creating tournament:', error);
        alert('Ошибка: ' + error.message);
    }
});

async function showTournamentDetails(tournamentId) {
    currentTournamentId = tournamentId;
    sections.forEach(section => section.classList.remove('active'));
    const tournamentDetails = document.getElementById('tournament-details');
    tournamentDetails.classList.add('active');

    buttons.forEach(btn => btn.classList.remove('active'));
    document.getElementById('tournaments-btn').classList.add('active');

    const tournamentHeader = document.getElementById('tournament-header');
    const tournamentDescription = document.getElementById('tournament-description');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');

    try {
        const tournament = await supabaseFetch(`tournaments?id=eq.${tournamentId}`, 'GET');
        if (tournament && tournament.length > 0) {
            const t = tournament[0];
            tournamentHeader.innerHTML = `
                <img src="${t.logo_url || 'https://via.placeholder.com/150'}" alt="Tournament logo">
                <strong>${t.name}</strong>
                <p>📅 ${new Date(t.date).toLocaleDateString()}</p>
                <p>📍 <a href="${t.address}" target="_blank">${t.address}</a></p>
                <p>⏰ Дедлайн регистрации: ${new Date(t.registration_deadline).toLocaleString()}</p>
                <p>👤 Организатор: @${t.created_by}</p>
            `;
            tournamentDescription.innerHTML = `<p>${t.description || 'Описание отсутствует'}</p>`;
            tournamentDescription.classList.add('description-hidden');
            toggleDescriptionBtn.textContent = 'Развернуть описание';
            toggleDescriptionBtn.onclick = () => {
                const isHidden = tournamentDescription.classList.contains('description-hidden');
                tournamentDescription.classList.toggle('description-hidden');
                toggleDescriptionBtn.textContent = isHidden ? 'Свернуть описание' : 'Развернуть описание';
            };

            setupTournamentTabs(tournamentId);
            loadTournamentPosts(tournamentId);
        } else {
            tournamentHeader.innerHTML = '<p>Турнир не найден</p>';
        }
    } catch (error) {
        console.error('Error loading tournament details:', error);
        tournamentHeader.innerHTML = '<p>Ошибка загрузки данных турнира</p>';
    }
}

function setupTournamentTabs(tournamentId) {
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');
    const postsContent = document.getElementById('tournament-posts');
    const registrationContent = document.getElementById('tournament-registration');
    const bracketContent = document.getElementById('tournament-bracket');

    const tabs = [postsTab, registrationTab, bracketTab];
    const contents = [postsContent, registrationContent, bracketContent];

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const contentId = tab.id.replace('-tab', '');
            document.getElementById(`tournament-${contentId}`).classList.add('active');

            if (tab.id === 'posts-tab') {
                loadTournamentPosts(tournamentId);
            } else if (tab.id === 'registration-tab') {
                loadRegistrations(tournamentId);
            } else if (tab.id === 'bracket-tab') {
                loadBracket(tournamentId);
            }
        });
    });

    postsTab.classList.add('active');
    postsContent.classList.add('active');
}

async function loadTournamentPosts(tournamentId) {
    const postsContainer = document.getElementById('tournament-posts');
    postsContainer.innerHTML = `
        <div id="new-tournament-post">
            <textarea id="tournament-post-text" placeholder="Написать пост для турнира..."></textarea>
            <button id="submit-tournament-post">Опубликовать</button>
        </div>
        <div id="tournament-posts-list"></div>
    `;

    const submitTournamentPost = document.getElementById('submit-tournament-post');
    const tournamentPostText = document.getElementById('tournament-post-text');

    submitTournamentPost.addEventListener('click', async () => {
        const content = tournamentPostText.value.trim();
        if (!content) {
            alert('Пожалуйста, введите текст поста!');
            return;
        }
        const text = `${userData.fullname} (@${userData.telegramUsername}):\n${content}`;
        try {
            await supabaseFetch('tournament_posts', 'POST', {
                tournament_id: tournamentId,
                text: text,
                user_id: userData.telegramUsername,
                timestamp: new Date().toISOString()
            });
            tournamentPostText.value = '';
            loadTournamentPostsList(tournamentId);
        } catch (error) {
            console.error('Error posting tournament post:', error);
            alert('Ошибка: ' + error.message);
        }
    });

    loadTournamentPostsList(tournamentId);
}

async function loadTournamentPostsList(tournamentId) {
    const postsList = document.getElementById('tournament-posts-list');
    postsList.innerHTML = '<div>Загрузка...</div>';
    try {
        const posts = await supabaseFetch(`tournament_posts?tournament_id=eq.${tournamentId}&order=id.desc`, 'GET');
        postsList.innerHTML = '';
        if (posts && posts.length > 0) {
            posts.forEach(post => {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post');
                const [userInfo, ...contentParts] = post.text.split(':\n');
                const [fullname, username] = userInfo.split(' (@');
                const cleanUsername = username ? username.replace(')', '') : '';
                const content = contentParts.join(':\n');
                const formattedContent = formatPostContent(content);
                const timeAgo = getTimeAgo(new Date(post.timestamp));
                postDiv.innerHTML = `
                    <div class="post-header">
                        <div class="post-user">
                            <strong>${fullname}</strong>
                            <span>@${cleanUsername}</span>
                        </div>
                        <div class="post-time">${timeAgo}</div>
                    </div>
                    <div class="post-content">${formattedContent}</div>
                `;
                postsList.appendChild(postDiv);
            });
        } else {
            postsList.innerHTML = '<p>Посты отсутствуют</p>';
        }
    } catch (error) {
        console.error('Error loading tournament posts:', error);
        postsList.innerHTML = '<p>Ошибка загрузки постов</p>';
    }
}

async function loadRegistrations(tournamentId) {
    const registrationContainer = document.getElementById('tournament-registration');
    const registrationList = document.getElementById('registration-list');
    const registerBtn = document.getElementById('register-tournament-btn');
    const registrationForm = document.getElementById('registration-form');

    registerBtn.onclick = () => {
        registrationForm.classList.toggle('form-hidden');
    };

    const submitRegistration = document.getElementById('submit-registration-btn');
    submitRegistration.onclick = async () => {
        const registrationData = {
            tournament_id: tournamentId,
            faction_name: document.getElementById('reg-faction-name').value.trim(),
            speaker1: document.getElementById('reg-speaker1').value.trim(),
            speaker2: document.getElementById('reg-speaker2').value.trim(),
            club: document.getElementById('reg-club').value.trim(),
            city: document.getElementById('reg-city').value.trim(),
            contacts: document.getElementById('reg-contacts').value.trim(),
            extra_info: document.getElementById('reg-extra').value.trim(),
            user_id: userData.telegramUsername,
            created_at: new Date().toISOString()
        };

        if (!registrationData.faction_name || !registrationData.speaker1 || !registrationData.speaker2) {
            alert('Пожалуйста, заполните обязательные поля: название фракции, спикер 1 и спикер 2!');
            return;
        }

        try {
            await supabaseFetch('registrations', 'POST', registrationData);
            registrationForm.classList.add('form-hidden');
            document.getElementById('reg-faction-name').value = '';
            document.getElementById('reg-speaker1').value = '';
            document.getElementById('reg-speaker2').value = '';
            document.getElementById('reg-club').value = '';
            document.getElementById('reg-city').value = '';
            document.getElementById('reg-contacts').value = '';
            document.getElementById('reg-extra').value = '';
            loadRegistrations(tournamentId);
            alert('Регистрация успешна!');
        } catch (error) {
            console.error('Error submitting registration:', error);
            alert('Ошибка: ' + error.message);
        }
    };

    registrationList.innerHTML = '<div>Загрузка...</div>';
    try {
        const registrations = await supabaseFetch(`registrations?tournament_id=eq.${tournamentId}&order=created_at.desc`, 'GET');
        registrationList.innerHTML = '';
        if (registrations && registrations.length > 0) {
            registrations.forEach(reg => {
                const regCard = document.createElement('div');
                regCard.classList.add('registration-card');
                regCard.innerHTML = `
                    <strong>${reg.faction_name}</strong>
                    <p>Спикер 1: ${reg.speaker1}</p>
                    <p>Спикер 2: ${reg.speaker2}</p>
                    <p>Клуб: ${reg.club || 'Не указан'}</p>
                    <p>Город: ${reg.city || 'Не указан'}</p>
                    <p>Контакты: ${reg.contacts || 'Не указаны'}</p>
                    <p>Доп. инфо: ${reg.extra_info || 'Отсутствует'}</p>
                    <p>Зарегистрировал: @${reg.user_id}</p>
                    ${reg.user_id === userData.telegramUsername ? `<button class="delete-registration-btn" onclick="deleteRegistration(${reg.id}, ${tournamentId})">Удалить</button>` : ''}
                `;
                registrationList.appendChild(regCard);
            });
        } else {
            registrationList.innerHTML = '<p>Регистрации отсутствуют</p>';
        }
    } catch (error) {
        console.error('Error loading registrations:', error);
        registrationList.innerHTML = '<p>Ошибка загрузки регистраций</p>';
    }
}

async function deleteRegistration(registrationId, tournamentId) {
    if (!confirm('Вы уверены, что хотите удалить регистрацию?')) return;
    try {
        await supabaseFetch(`registrations?id=eq.${registrationId}`, 'DELETE');
        loadRegistrations(tournamentId);
        alert('Регистрация удалена!');
    } catch (error) {
        console.error('Error deleting registration:', error);
        alert('Ошибка: ' + error.message);
    }
}

async function loadBracket(tournamentId) {
    const bracketContainer = document.getElementById('tournament-bracket');
    bracketContainer.innerHTML = `
        <div id="bracket-form" class="form-hidden">
            <select id="bracket-round">
                <option value="1">Раунд 1</option>
                <option value="2">Раунд 2</option>
                <option value="3">Раунд 3</option>
                <option value="4">Полуфинал</option>
                <option value="5">Финал</option>
            </select>
            <input id="bracket-team1" type="text" placeholder="Команда 1">
            <input id="bracket-team2" type="text" placeholder="Команда 2">
            <input id="bracket-score1" type="number" placeholder="Счёт 1">
            <input id="bracket-score2" type="number" placeholder="Счёт 2">
            <button id="add-match-btn">Добавить матч</button>
        </div>
        <button id="toggle-bracket-form">Добавить матч</button>
        <div id="bracket-list"></div>
    `;

    const toggleBracketForm = document.getElementById('toggle-bracket-form');
    const bracketForm = document.getElementById('bracket-form');
    toggleBracketForm.onclick = () => {
        bracketForm.classList.toggle('form-hidden');
    };

    const addMatchBtn = document.getElementById('add-match-btn');
    addMatchBtn.onclick = async () => {
        const matchData = {
            tournament_id: tournamentId,
            round: document.getElementById('bracket-round').value,
            team1: document.getElementById('bracket-team1').value.trim(),
            team2: document.getElementById('bracket-team2').value.trim(),
            score1: parseInt(document.getElementById('bracket-score1').value) || 0,
            score2: parseInt(document.getElementById('bracket-score2').value) || 0
        };

        if (!matchData.team1 || !matchData.team2) {
            alert('Пожалуйста, укажите обе команды!');
            return;
        }

        try {
            await supabaseFetch('brackets', 'POST', matchData);
            bracketForm.classList.add('form-hidden');
            document.getElementById('bracket-team1').value = '';
            document.getElementById('bracket-team2').value = '';
            document.getElementById('bracket-score1').value = '';
            document.getElementById('bracket-score2').value = '';
            loadBracketList(tournamentId);
            alert('Матч добавлен!');
        } catch (error) {
            console.error('Error adding match:', error);
            alert('Ошибка: ' + error.message);
        }
    };

    loadBracketList(tournamentId);
}

async function loadBracketList(tournamentId) {
    const bracketList = document.getElementById('bracket-list');
    bracketList.innerHTML = '<div>Загрузка...</div>';
    try {
        const brackets = await supabaseFetch(`brackets?tournament_id=eq.${tournamentId}&order=round.asc`, 'GET');
        bracketList.innerHTML = '';
        if (brackets && brackets.length > 0) {
            const rounds = [...new Set(brackets.map(b => b.round))];
            rounds.forEach(round => {
                const roundDiv = document.createElement('div');
                roundDiv.classList.add('bracket-round');
                roundDiv.innerHTML = `<h3>Раунд ${round}</h3>`;
                const matches = brackets.filter(b => b.round === round);
                matches.forEach(match => {
                    const matchDiv = document.createElement('div');
                    matchDiv.classList.add('bracket-match');
                    matchDiv.innerHTML = `
                        <p>${match.team1} vs ${match.team2}</p>
                        <p>Счёт: ${match.score1} - ${match.score2}</p>
                    `;
                    roundDiv.appendChild(matchDiv);
                });
                bracketList.appendChild(roundDiv);
            });
        } else {
            bracketList.innerHTML = '<p>Сетка отсутствует</p>';
        }
    } catch (error) {
        console.error('Error loading bracket:', error);
        bracketList.innerHTML = '<p>Ошибка загрузки сетки</p>';
    }
}

checkProfile();
