console.log('script.js loaded, version: 2025-05-02');

// Инициализация Supabase
if (typeof supabase === 'undefined') {
    console.error('Supabase library failed to load. Please check the script URL and your network connection.');
} else {
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized');

    // Глобальные переменные
    const tg = window.Telegram.WebApp;
    tg.expand();
    const user = tg.initDataUnsafe.user;
    const postsPerPage = 20;
    let postsOffset = 0;
    let postsCache = new Map();
    let commentsCache = new Map();
    let lastScrollTop = 0;
    let selectedPostId = null;

    // Элементы DOM
    const appContainer = document.getElementById('app-container');
    const registrationModal = document.getElementById('registration-modal');
    const regFullnameInput = document.getElementById('reg-fullname');
    const submitProfileRegBtn = document.getElementById('submit-profile-reg-btn');
    const postsContainer = document.getElementById('posts');
    const postTextInput = document.getElementById('post-text');
    const postImageInput = document.getElementById('post-image');
    const submitPostBtn = document.getElementById('submit-post');
    const newPostsBtn = document.querySelector('.new-posts-btn');
    const feedSection = document.getElementById('feed');
    const postDetailsSection = document.getElementById('post-details');
    const backToFeedBtn = document.getElementById('back-to-feed-btn');
    const postDetailContent = document.getElementById('post-detail-content');
    const postCommentsList = document.getElementById('post-comments-list');
    const newCommentInput = document.getElementById('new-comment-input');
    const submitCommentBtn = document.getElementById('submit-comment-btn');
    const tournamentsSection = document.getElementById('tournaments');
    const createTournamentBtn = document.getElementById('create-tournament-btn');
    const createTournamentForm = document.getElementById('create-tournament-form');
    const tournamentList = document.getElementById('tournament-list');
    const tournamentDetailsSection = document.getElementById('tournament-details');
    const tournamentHeader = document.getElementById('tournament-header');
    const tournamentDescription = document.getElementById('tournament-description');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');
    const postsTab = document.getElementById('posts-tab');
    const registrationTab = document.getElementById('registration-tab');
    const bracketTab = document.getElementById('bracket-tab');
    const tournamentPosts = document.getElementById('tournament-posts');
    const tournamentRegistration = document.getElementById('tournament-registration');
    const tournamentBracket = document.getElementById('tournament-bracket');
    const registerTournamentBtn = document.getElementById('register-tournament-btn');
    const registrationForm = document.getElementById('registration-form');
    const registrationList = document.getElementById('registration-list');
    const ratingSection = document.getElementById('rating');
    const profileSection = document.getElementById('profile');
    const eduSection = document.getElementById('edu');
    const usernameSpan = document.getElementById('username');
    const fullnameInput = document.getElementById('fullname');
    const updateProfileBtn = document.getElementById('update-profile');
    const feedBtn = document.getElementById('feed-btn');
    const tournamentsBtn = document.getElementById('tournaments-btn');
    const ratingBtn = document.getElementById('rating-btn');
    const profileBtn = document.getElementById('profile-btn');
    const eduBtn = document.getElementById('edu-btn');

    // Проверка профиля пользователя
    async function checkUserProfile() {
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('telegram_username', user.username)
            .single();

        if (error || !profile) {
            registrationModal.style.display = 'flex';
            appContainer.style.display = 'none';
        } else {
            registrationModal.style.display = 'none';
            appContainer.style.display = 'flex';
            usernameSpan.textContent = profile.telegram_username;
            fullnameInput.value = profile.fullname || '';
            await loadPosts();
        }
    }

    // Регистрация пользователя
    submitProfileRegBtn.addEventListener('click', async () => {
        const fullname = regFullnameInput.value.trim();
        if (!fullname) {
            alert('Пожалуйста, введите ваше имя');
            return;
        }

        const { error } = await supabaseClient
            .from('profiles')
            .insert({
                telegram_username: user.username,
                telegram_id: user.id,
                fullname: fullname,
            });

        if (error) {
            console.error('Ошибка регистрации:', error);
            alert('Ошибка регистрации. Попробуйте снова.');
        } else {
            registrationModal.style.display = 'none';
            appContainer.style.display = 'flex';
            usernameSpan.textContent = user.username;
            fullnameInput.value = fullname;
            await loadPosts();
        }
    });

    // Обновление профиля
    updateProfileBtn.addEventListener('click', async () => {
        const fullname = fullnameInput.value.trim();
        if (!fullname) {
            alert('Пожалуйста, введите ваше имя');
            return;
        }

        const { error } = await supabaseClient
            .from('profiles')
            .update({ fullname: fullname })
            .eq('telegram_username', user.username);

        if (error) {
            console.error('Ошибка обновления профиля:', error);
            alert('Ошибка обновления профиля. Попробуйте снова.');
        } else {
            alert('Профиль успешно обновлен!');
        }
    });

    // Загрузка постов
    async function loadPosts() {
        const { data: posts, error } = await supabaseClient
            .from('posts')
            .select(`
                *,
                profiles!posts_user_id_fkey(fullname, telegram_username)
            `)
            .order('created_at', { ascending: false })
            .range(postsOffset, postsOffset + postsPerPage - 1);

        if (error) {
            console.error('Ошибка загрузки постов:', error);
            return;
        }

        posts.forEach(post => {
            postsCache.set(post.id, post);
            renderPost(post);
        });

        postsOffset += posts.length;

        if (posts.length === postsPerPage) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = 'load-more-btn';
            loadMoreBtn.textContent = 'Загрузить ещё';
            loadMoreBtn.addEventListener('click', async () => {
                loadMoreBtn.remove();
                await loadPosts();
            });
            postsContainer.appendChild(loadMoreBtn);
        }

        // Подписка на новые посты
        supabaseClient
            .channel('posts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
                const newPost = payload.new;
                if (!postsCache.has(newPost.id)) {
                    supabaseClient
                        .from('profiles')
                        .select('fullname, telegram_username')
                        .eq('id', newPost.user_id)
                        .single()
                        .then(({ data: profile }) => {
                            newPost.profiles = profile;
                            postsCache.set(newPost.id, newPost);
                            renderPost(newPost, true);
                            newPostsBtn.style.display = 'block';
                            newPostsBtn.classList.add('visible');
                        });
                }
            })
            .subscribe();
    }

    // Рендеринг поста
    function renderPost(post, prepend = false) {
        const postElement = document.createElement('div');
        postElement.className = 'post';
        postElement.dataset.postId = post.id;

        const createdAt = new Date(post.created_at);
        const timeString = createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = createdAt.toLocaleDateString();

        postElement.innerHTML = `
            <div class="post-header">
                <div class="avatar-placeholder"></div>
                <div class="post-user">
                    <strong>${post.profiles.fullname}</strong>
                    <span>@${post.profiles.telegram_username}</span>
                </div>
                <div class="post-time">${dateString} ${timeString}</div>
            </div>
            <div class="post-content">${processPostContent(post.content)}</div>
            ${post.image_url ? `<img src="${post.image_url}" alt="Post image" class="post-image">` : ''}
            <div class="post-actions">
                <button class="reaction-btn like-btn" data-type="like">
                    👍 <span class="reaction-count">${post.likes || 0}</span>
                </button>
                <button class="reaction-btn dislike-btn" data-type="dislike">
                    👎 <span class="reaction-count">${post.dislikes || 0}</span>
                </button>
            </div>
        `;

        postElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('reaction-btn') || e.target.closest('.reaction-btn')) return;
            selectedPostId = post.id;
            showPostDetails(post);
        });

        if (prepend) {
            postsContainer.insertBefore(postElement, postsContainer.firstChild);
        } else {
            postsContainer.appendChild(postElement);
        }

        // Загрузка реакций
        loadReactions(post.id, postElement);
    }

    // Показ деталей поста
    async function showPostDetails(post) {
        feedSection.classList.remove('active');
        postDetailsSection.classList.add('active');

        const createdAt = new Date(post.created_at);
        const timeString = createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = createdAt.toLocaleDateString();

        postDetailContent.innerHTML = `
            <div class="post-header">
                <div class="avatar-placeholder"></div>
                <div class="post-user">
                    <strong>${post.profiles.fullname}</strong>
                    <span>@${post.profiles.telegram_username}</span>
                </div>
                <div class="post-time">${dateString} ${timeString}</div>
            </div>
            <div class="post-content">${processPostContent(post.content)}</div>
            ${post.image_url ? `<img src="${post.image_url}" alt="Post image" class="post-image">` : ''}
            <div class="post-actions">
                <button class="reaction-btn like-btn" data-type="like">
                    👍 <span class="reaction-count">${post.likes || 0}</span>
                </button>
                <button class="reaction-btn dislike-btn" data-type="dislike">
                    👎 <span class="reaction-count">${post.dislikes || 0}</span>
                </button>
            </div>
        `;

        postCommentsList.innerHTML = '';
        await loadComments(post.id);
        subscribeToComments(post.id);

        loadReactions(post.id, postDetailContent);
    }

    // Назад к ленте
    backToFeedBtn.addEventListener('click', () => {
        postDetailsSection.classList.remove('active');
        feedSection.classList.add('active');
        selectedPostId = null;
        supabaseClient.channel('comments').unsubscribe();
    });

    // Загрузка комментариев
    async function loadComments(postId) {
        const { data: comments, error } = await supabaseClient
            .from('comments')
            .select(`
                *,
                profiles!comments_user_id_fkey(fullname, telegram_username)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Ошибка загрузки комментариев:', error);
            return;
        }

        comments.forEach(comment => {
            commentsCache.set(comment.id, comment);
            renderComment(comment, postCommentsList);
        });
    }

    // Подписка на комментарии
    function subscribeToComments(postId) {
        supabaseClient
            .channel('comments')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, payload => {
                const newComment = payload.new;
                if (!commentsCache.has(newComment.id)) {
                    supabaseClient
                        .from('profiles')
                        .select('fullname, telegram_username')
                        .eq('id', newComment.user_id)
                        .single()
                        .then(({ data: profile }) => {
                            newComment.profiles = profile;
                            commentsCache.set(newComment.id, newComment);
                            renderComment(newComment, postCommentsList);
                        });
                }
            })
            .subscribe();
    }

    // Рендеринг комментария
    function renderComment(comment, container) {
        const commentElement = document.createElement('div');
        commentElement.className = 'comment';
        commentElement.dataset.commentId = comment.id;

        const createdAt = new Date(comment.created_at);
        const timeString = createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = createdAt.toLocaleDateString();

        commentElement.innerHTML = `
            <div class="avatar-placeholder"></div>
            <div>
                <div class="comment-user">
                    <strong>${comment.profiles.fullname}</strong>
                    <span>@${comment.profiles.telegram_username}</span> • ${dateString} ${timeString}
                </div>
                <div class="comment-content">${processPostContent(comment.content)}</div>
            </div>
        `;

        container.appendChild(commentElement);
    }

    // Отправка нового комментария
    submitCommentBtn.addEventListener('click', async () => {
        const content = newCommentInput.value.trim();
        if (!content) {
            alert('Пожалуйста, введите комментарий');
            return;
        }

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('telegram_username', user.username)
            .single();

        const { error } = await supabaseClient
            .from('comments')
            .insert({
                post_id: selectedPostId,
                user_id: profile.id,
                content: content,
            });

        if (error) {
            console.error('Ошибка отправки комментария:', error);
            alert('Ошибка отправки комментария. Попробуйте снова.');
        } else {
            newCommentInput.value = '';
        }
    });

    // Обработка контента поста (упоминания)
    function processPostContent(content) {
        return content.replace(/@(\w+)/g, '<a href="#" class="mention">@$1</a>');
    }

    // Загрузка реакций
    async function loadReactions(postId, postElement) {
        const { data: reactions, error } = await supabaseClient
            .from('reactions')
            .select('reaction_type')
            .eq('post_id', postId);

        if (error) {
            console.error('Ошибка загрузки реакций:', error);
            return;
        }

        const likes = reactions.filter(r => r.reaction_type === 'like').length;
        const dislikes = reactions.filter(r => r.reaction_type === 'dislike').length;

        const likeBtn = postElement.querySelector('.like-btn .reaction-count');
        const dislikeBtn = postElement.querySelector('.dislike-btn .reaction-count');

        likeBtn.textContent = likes;
        dislikeBtn.textContent = dislikes;

        const { data: userReaction } = await supabaseClient
            .from('reactions')
            .select('reaction_type')
            .eq('post_id', postId)
            .eq('user_id', (await supabaseClient.from('profiles').select('id').eq('telegram_username', user.username).single()).data.id)
            .single();

        if (userReaction) {
            const btn = userReaction.reaction_type === 'like' ? postElement.querySelector('.like-btn') : postElement.querySelector('.dislike-btn');
            btn.classList.add('active');
        }

        postElement.querySelectorAll('.reaction-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const type = btn.dataset.type;
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('id')
                    .eq('telegram_username', user.username)
                    .single();

                const { data: existingReaction } = await supabaseClient
                    .from('reactions')
                    .select('id, reaction_type')
                    .eq('post_id', postId)
                    .eq('user_id', profile.id)
                    .single();

                if (existingReaction) {
                    if (existingReaction.reaction_type === type) {
                        await supabaseClient
                            .from('reactions')
                            .delete()
                            .eq('id', existingReaction.id);
                        btn.classList.remove('active');
                    } else {
                        await supabaseClient
                            .from('reactions')
                            .update({ reaction_type: type })
                            .eq('id', existingReaction.id);
                        postElement.querySelector('.reaction-btn.active')?.classList.remove('active');
                        btn.classList.add('active');
                    }
                } else {
                    await supabaseClient
                        .from('reactions')
                        .insert({
                            post_id: postId,
                            user_id: profile.id,
                            reaction_type: type,
                        });
                    btn.classList.add('active');
                }

                const { data: updatedReactions } = await supabaseClient
                    .from('reactions')
                    .select('reaction_type')
                    .eq('post_id', postId);

                const updatedLikes = updatedReactions.filter(r => r.reaction_type === 'like').length;
                const updatedDislikes = updatedReactions.filter(r => r.reaction_type === 'dislike').length;

                postElement.querySelector('.like-btn .reaction-count').textContent = updatedLikes;
                postElement.querySelector('.dislike-btn .reaction-count').textContent = updatedDislikes;

                const cachedPost = postsCache.get(postId);
                cachedPost.likes = updatedLikes;
                cachedPost.dislikes = updatedDislikes;
                postsCache.set(postId, cachedPost);

                if (postDetailsSection.classList.contains('active') && selectedPostId === postId) {
                    postDetailContent.querySelector('.like-btn .reaction-count').textContent = updatedLikes;
                    postDetailContent.querySelector('.dislike-btn .reaction-count').textContent = updatedDislikes;
                }
            });
        });
    }

    // Публикация нового поста
    submitPostBtn.addEventListener('click', async () => {
        const content = postTextInput.value.trim();
        const imageFile = postImageInput.files[0];

        if (!content && !imageFile) {
            alert('Пожалуйста, добавьте текст или изображение');
            return;
        }

        let imageUrl = null;
        if (imageFile) {
            const fileName = `${Date.now()}_${imageFile.name}`;
            const { error: uploadError } = await supabaseClient.storage
                .from('post-images')
                .upload(fileName, imageFile);

            if (uploadError) {
                console.error('Ошибка загрузки изображения:', uploadError);
                alert('Ошибка загрузки изображения. Попробуйте снова.');
                return;
            }

            const { data: publicUrl } = supabaseClient.storage
                .from('post-images')
                .getPublicUrl(fileName);

            imageUrl = publicUrl.publicUrl;
        }

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('telegram_username', user.username)
            .single();

        const { error } = await supabaseClient
            .from('posts')
            .insert({
                user_id: profile.id,
                content: content,
                image_url: imageUrl,
            });

        if (error) {
            console.error('Ошибка публикации поста:', error);
            alert('Ошибка публикации поста. Попробуйте снова.');
        } else {
            postTextInput.value = '';
            postImageInput.value = '';
        }
    });

    // Переключение вкладок
    function switchTab(activeSection, activeBtn) {
        [feedSection, postDetailsSection, tournamentsSection, tournamentDetailsSection, ratingSection, profileSection, eduSection].forEach(section => {
            section.classList.remove('active');
        });
        [feedBtn, tournamentsBtn, ratingBtn, profileBtn, eduBtn].forEach(btn => {
            btn.classList.remove('active');
        });

        activeSection.classList.add('active');
        activeBtn.classList.add('active');
        if (activeSection !== postDetailsSection) {
            selectedPostId = null;
            supabaseClient.channel('comments').unsubscribe();
        }
    }

    feedBtn.addEventListener('click', () => switchTab(feedSection, feedBtn));
    tournamentsBtn.addEventListener('click', () => switchTab(tournamentsSection, tournamentsBtn));
    ratingBtn.addEventListener('click', () => switchTab(ratingSection, ratingBtn));
    profileBtn.addEventListener('click', () => switchTab(profileSection, profileBtn));
    eduBtn.addEventListener('click', () => switchTab(eduSection, eduBtn));

    // Турниры
    createTournamentBtn.addEventListener('click', () => {
        createTournamentForm.classList.toggle('form-hidden');
    });

    document.getElementById('submit-tournament').addEventListener('click', async () => {
        const name = document.getElementById('tournament-name').value.trim();
        const date = document.getElementById('tournament-date').value;
        const logo = document.getElementById('tournament-logo').value.trim();
        const description = document.getElementById('tournament-desc').value.trim();
        const address = document.getElementById('tournament-address').value.trim();
        const deadline = document.getElementById('tournament-deadline').value;

        if (!name || !date || !address || !deadline) {
            alert('Пожалуйста, заполните все обязательные поля');
            return;
        }

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('telegram_username', user.username)
            .single();

        const { error } = await supabaseClient
            .from('tournaments')
            .insert({
                name,
                date,
                logo_url: logo || null,
                description,
                address,
                deadline,
                creator_id: profile.id,
            });

        if (error) {
            console.error('Ошибка создания турнира:', error);
            alert('Ошибка создания турнира. Попробуйте снова.');
        } else {
            createTournamentForm.classList.add('form-hidden');
            loadTournaments();
        }
    });

    async function loadTournaments() {
        const { data: tournaments, error } = await supabaseClient
            .from('tournaments')
            .select(`
                *,
                profiles!tournaments_creator_id_fkey(fullname, telegram_username)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Ошибка загрузки турниров:', error);
            return;
        }

        tournamentList.innerHTML = '';
        tournaments.forEach(tournament => {
            const tournamentElement = document.createElement('div');
            tournamentElement.className = 'tournament-card';
            tournamentElement.dataset.tournamentId = tournament.id;

            const date = new Date(tournament.date).toLocaleDateString();
            tournamentElement.innerHTML = `
                <img src="${tournament.logo_url || 'https://via.placeholder.com/48'}" alt="Tournament logo" class="tournament-logo">
                <div class="tournament-info">
                    <strong>${tournament.name}</strong>
                    <span>Дата: ${date}</span>
                    <span>Город: ${tournament.address}</span>
                </div>
            `;

            tournamentElement.addEventListener('click', () => showTournamentDetails(tournament));
            tournamentList.appendChild(tournamentElement);
        });
    }

    async function showTournamentDetails(tournament) {
        tournamentsSection.classList.remove('active');
        tournamentDetailsSection.classList.add('active');

        const date = new Date(tournament.date).toLocaleDateString();
        const deadline = new Date(tournament.deadline).toLocaleDateString();

        tournamentHeader.innerHTML = `
            <img src="${tournament.logo_url || 'https://via.placeholder.com/150'}" alt="Tournament logo">
            <strong>${tournament.name}</strong>
            <p>Создатель: ${tournament.profiles.fullname} (@${tournament.profiles.telegram_username})</p>
            <p>Дата: ${date}</p>
            <p>Город: ${tournament.address}</p>
            <p>Дедлайн: ${deadline}</p>
        `;

        tournamentDescription.textContent = tournament.description || 'Описание отсутствует';
        tournamentDescription.classList.add('description-hidden');

        toggleDescriptionBtn.addEventListener('click', () => {
            tournamentDescription.classList.toggle('description-hidden');
            toggleDescriptionBtn.textContent = tournamentDescription.classList.contains('description-hidden') ? 'Развернуть описание' : 'Свернуть описание';
        });

        const { data: creatorProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('telegram_username', user.username)
            .single();

        const isCreator = tournament.creator_id === creatorProfile.id;

        // Посты турнира
        tournamentPosts.innerHTML = '';
        if (isCreator) {
            const newPostForm = document.createElement('div');
            newPostForm.id = 'new-tournament-post';
            newPostForm.innerHTML = `
                <textarea id="tournament-post-text" placeholder="Написать пост от имени турнира..."></textarea>
                <button id="submit-tournament-post">Опубликовать</button>
            `;
            tournamentPosts.appendChild(newPostForm);

            document.getElementById('submit-tournament-post').addEventListener('click', async () => {
                const content = document.getElementById('tournament-post-text').value.trim();
                if (!content) {
                    alert('Пожалуйста, введите текст поста');
                    return;
                }

                const { error } = await supabaseClient
                    .from('posts')
                    .insert({
                        user_id: tournament.creator_id,
                        content: content,
                        tournament_id: tournament.id,
                    });

                if (error) {
                    console.error('Ошибка публикации поста:', error);
                    alert('Ошибка публикации поста. Попробуйте снова.');
                } else {
                    document.getElementById('tournament-post-text').value = '';
                }
            });
        }

        const postsList = document.createElement('div');
        postsList.id = 'tournament-posts-list';
        tournamentPosts.appendChild(postsList);

        const { data: tournamentPostsData } = await supabaseClient
            .from('posts')
            .select(`
                *,
                profiles!posts_user_id_fkey(fullname, telegram_username)
            `)
            .eq('tournament_id', tournament.id)
            .order('created_at', { ascending: false });

        tournamentPostsData.forEach(post => renderPost(post));

        // Регистрация
        registrationList.innerHTML = '';
        const { data: registrations } = await supabaseClient
            .from('registrations')
            .select('*')
            .eq('tournament_id', tournament.id);

        registrations.forEach(reg => {
            const regElement = document.createElement('div');
            regElement.className = 'registration-card';
            regElement.innerHTML = `
                <strong>${reg.faction_name}</strong>
                <p>Спикер 1: ${reg.speaker1}</p>
                <p>Спикер 2: ${reg.speaker2}</p>
                <p>Клуб: ${reg.club}</p>
                <p>Город: ${reg.city}</p>
                <p>Контакты: ${reg.contacts}</p>
                ${reg.extra ? `<p>Дополнительно: ${reg.extra}</p>` : ''}
                ${isCreator ? `<button class="delete-registration-btn" data-reg-id="${reg.id}">Удалить</button>` : ''}
            `;
            registrationList.appendChild(regElement);

            if (isCreator) {
                regElement.querySelector('.delete-registration-btn').addEventListener('click', async () => {
                    await supabaseClient
                        .from('registrations')
                        .delete()
                        .eq('id', reg.id);
                    regElement.remove();
                });
            }
        });

        // Сетка
        tournamentBracket.innerHTML = '';
        if (isCreator) {
            const bracketForm = document.createElement('div');
            bracketForm.id = 'bracket-form';
            bracketForm.innerHTML = `
                <select id="bracket-format">
                    <option value="APF">АПФ (2 команды)</option>
                    <option value="BPF">БПФ (4 команды)</option>
                </select>
                <input id="bracket-round" type="text" placeholder="Раунд (например, 1/8 финала)">
                <button id="generate-bracket">Сгенерировать</button>
            `;
            tournamentBracket.appendChild(bracketForm);

            document.getElementById('generate-bracket').addEventListener('click', async () => {
                const format = document.getElementById('bracket-format').value;
                const round = document.getElementById('bracket-round').value.trim();

                if (!round) {
                    alert('Пожалуйста, укажите раунд');
                    return;
                }

                const teams = registrations.map(reg => reg.faction_name);
                if (format === 'APF' && teams.length < 2) {
                    alert('Недостаточно команд для АПФ (нужно минимум 2)');
                    return;
                }
                if (format === 'BPF' && teams.length < 4) {
                    alert('Недостаточно команд для БПФ (нужно минимум 4)');
                    return;
                }

                const shuffledTeams = teams.sort(() => Math.random() - 0.5);
                const matches = [];
                if (format === 'APF') {
                    for (let i = 0; i < shuffledTeams.length; i += 2) {
                        if (i + 1 < shuffledTeams.length) {
                            matches.push({
                                team1: shuffledTeams[i],
                                team2: shuffledTeams[i + 1],
                                role1: 'Правительство',
                                role2: 'Оппозиция',
                            });
                        }
                    }
                } else {
                    for (let i = 0; i < shuffledTeams.length; i += 4) {
                        if (i + 3 < shuffledTeams.length) {
                            matches.push({
                                team1: shuffledTeams[i],
                                team2: shuffledTeams[i + 1],
                                team3: shuffledTeams[i + 2],
                                team4: shuffledTeams[i + 3],
                                role1: 'ОП',
                                role2: 'ОО',
                                role3: 'ЗП',
                                role4: 'ЗО',
                            });
                        }
                    }
                }

                const { error } = await supabaseClient
                    .from('brackets')
                    .insert({
                        tournament_id: tournament.id,
                        round: round,
                        format: format,
                        matches: matches,
                    });

                if (error) {
                    console.error('Ошибка генерации сетки:', error);
                    alert('Ошибка генерации сетки. Попробуйте снова.');
                } else {
                    loadBracket(tournament.id);
                }
            });
        }

        await loadBracket(tournament.id);
    }

    async function loadBracket(tournamentId) {
        const { data: brackets } = await supabaseClient
            .from('brackets')
            .select('*')
            .eq('tournament_id', tournamentId)
            .order('created_at', { ascending: false });

        const bracketList = document.createElement('div');
        bracketList.id = 'bracket-list';
        brackets.forEach(bracket => {
            const roundElement = document.createElement('div');
            roundElement.className = 'bracket-round';
            roundElement.innerHTML = `<h3>${bracket.round}</h3>`;
            bracket.matches.forEach(match => {
                const matchElement = document.createElement('div');
                matchElement.className = 'bracket-match';
                if (bracket.format === 'APF') {
                    matchElement.innerHTML = `
                        <p>${match.role1}: ${match.team1}</p>
                        <p>${match.role2}: ${match.team2}</p>
                        <input type="text" placeholder="Результат" value="${match.result || ''}">
                    `;
                } else {
                    matchElement.innerHTML = `
                        <p>${match.role1}: ${match.team1}</p>
                        <p>${match.role2}: ${match.team2}</p>
                        <p>${match.role3}: ${match.team3}</p>
                        <p>${match.role4}: ${match.team4}</p>
                        <input type="text" placeholder="Результат" value="${match.result || ''}">
                    `;
                }
                roundElement.appendChild(matchElement);
            });
            bracketList.appendChild(roundElement);
        });

        tournamentBracket.appendChild(bracketList);
        const publishBtn = document.createElement('button');
        publishBtn.id = 'publish-bracket-btn';
        publishBtn.textContent = 'Опубликовать результаты';
        publishBtn.addEventListener('click', async () => {
            const matches = [];
            bracketList.querySelectorAll('.bracket-match').forEach(matchElement => {
                const inputs = matchElement.querySelectorAll('input');
                const result = inputs[0].value.trim();
                const match = brackets[0].matches[Array.from(matchElement.parentElement.children).indexOf(matchElement)];
                match.result = result;
                matches.push(match);
            });

            await supabaseClient
                .from('brackets')
                .update({ matches: matches })
                .eq('id', brackets[0].id);
        });
        tournamentBracket.appendChild(publishBtn);
    }

    postsTab.addEventListener('click', () => {
        [postsTab, registrationTab, bracketTab].forEach(tab => tab.classList.remove('active'));
        [tournamentPosts, tournamentRegistration, tournamentBracket].forEach(content => content.classList.remove('active'));
        postsTab.classList.add('active');
        tournamentPosts.classList.add('active');
    });

    registrationTab.addEventListener('click', () => {
        [postsTab, registrationTab, bracketTab].forEach(tab => tab.classList.remove('active'));
        [tournamentPosts, tournamentRegistration, tournamentBracket].forEach(content => content.classList.remove('active'));
        registrationTab.classList.add('active');
        tournamentRegistration.classList.add('active');
    });

    bracketTab.addEventListener('click', () => {
        [postsTab, registrationTab, bracketTab].forEach(tab => tab.classList.remove('active'));
        [tournamentPosts, tournamentRegistration, tournamentBracket].forEach(content => content.classList.remove('active'));
        bracketTab.classList.add('active');
        tournamentBracket.classList.add('active');
    });

    registerTournamentBtn.addEventListener('click', () => {
        registrationForm.classList.toggle('form-hidden');
    });

    document.getElementById('submit-registration-btn').addEventListener('click', async () => {
        const factionName = document.getElementById('reg-faction-name').value.trim();
        const speaker1 = document.getElementById('reg-speaker1').value.trim();
        const speaker2 = document.getElementById('reg-speaker2').value.trim();
        const club = document.getElementById('reg-club').value.trim();
        const city = document.getElementById('reg-city').value.trim();
        const contacts = document.getElementById('reg-contacts').value.trim();
        const extra = document.getElementById('reg-extra').value.trim();

        if (!factionName || !speaker1 || !speaker2 || !club || !city || !contacts) {
            alert('Пожалуйста, заполните все обязательные поля');
            return;
        }

        const tournamentId = tournamentList.querySelector('.tournament-card:last-child').dataset.tournamentId;
        const { error } = await supabaseClient
            .from('registrations')
            .insert({
                tournament_id: tournamentId,
                faction_name: factionName,
                speaker1,
                speaker2,
                club,
                city,
                contacts,
                extra: extra || null,
            });

        if (error) {
            console.error('Ошибка регистрации на турнир:', error);
            alert('Ошибка регистрации на турнир. Попробуйте снова.');
        } else {
            registrationForm.classList.add('form-hidden');
            showTournamentDetails(await supabaseClient.from('tournaments').select('*').eq('id', tournamentId).single().then(res => res.data));
        }
    });

    // Рейтинг
    const ratingData = [
        { rank: 1, name: 'Олжас Сейтов', points: 948, club: 'Дербес' },
        { rank: 2, name: 'Мұхаммедәлі Әлішбаев', points: 936, club: 'TЭО' },
        { rank: 3, name: 'Нұрболат Тілеубай', points: 872, club: 'КБТУ' },
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

    document.querySelectorAll('.city-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.city-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('season-selector').classList.remove('selector-hidden');
        });
    });

    document.querySelectorAll('.season-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tbody = document.querySelector('#rating-table tbody');
            tbody.innerHTML = '';
            ratingData.forEach(player => {
                const row = document.createElement('tr');
                row.className = `rank-${player.rank}`;
                row.innerHTML = `
                    <td>${player.rank}</td>
                    <td>${player.name}</td>
                    <td>${player.points}</td>
                    <td>${player.club}</td>
                `;
                tbody.appendChild(row);
            });
        });
    });

    // Инициализация приложения
    checkUserProfile();
    loadTournaments();
}
