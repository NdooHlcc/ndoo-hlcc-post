/* =========================================================
   SOCIAL — feed, profile, story, DM, search, VIP
   ========================================================= */

async function loadFeed() {
  if (!db) return;
  const me = getMe();
  const homeName = document.getElementById('homeProfileName');
  const homeBio = document.getElementById('homeProfileBio');
  const homeAvatar = document.getElementById('homeProfileAvatar');
  const activeName = me?.username || currentUser();
  if (homeName) homeName.textContent = activeName ? `@${activeName}` : 'Profil';
  if (homeBio) homeBio.textContent = me?.bio || 'Bagikan sesuatu hari ini.';
  if (homeAvatar) {
    homeAvatar.textContent = me?.avatar ? '' : (activeName?.[0] || '?').toUpperCase();
    homeAvatar.style.backgroundImage = me?.avatar ? `url("${me.avatar}")` : '';
  }
  const list = (await getAllPosts()).filter(post => !post.isVip).sort((a, b) => b.created - a.created);
  const feed = document.getElementById('feedList');
  if (!feed) return;
  if (!list.length) {
    feed.innerHTML = '<div class="empty-state modern-empty"><strong>Belum ada postingan</strong><span>Jadilah yang pertama membagikan sesuatu ✨</span></div>';
    return;
  }
  feed.innerHTML = list.map(post => renderPost(post, currentUser())).join('');
  bindPostEvents(feed);
  document.getElementById('homeProfileBtn')?.addEventListener('click', () => showTab('tabProfile'), { once: true });
}

function renderPost(post, me) {
  const saved = isSaved(post.id);
  const profileAvatar = post.profile?.avatar_url || '';
  const avatar = profileAvatar
    ? `<div class="post-avatar" style="width:38px;height:38px;background-image:url('${profileAvatar}')"></div>`
    : avatarHtml(post.user, 38);
  const liked = post.likes?.some(value => String(value) === String(window.__NDOO_AUTH_USER_ID || ''));
  return `
    <div class="post ${post.isVip ? 'vip-post' : ''}" data-id="${post.id}">
      <div class="post-head">
        <div class="post-user user-link" data-user="${escapeHtml(post.user)}">
          ${avatar}
          <div class="post-user-info">
            <b>@${escapeHtml(post.user)}</b>
            <small>${timeAgo(post.created)} ${post.isVip ? '· VIP' : ''}</small>
          </div>
        </div>
        <button class="post-menu-btn" data-id="${post.id}" data-action="menu">⋮</button>
      </div>
      ${post.mediaType === 'image' ? `<img src="${post.media}" alt="Post media" loading="lazy" decoding="async">` : `<video controls preload="metadata" playsinline src="${post.media}"></video>`}
      <p>${escapeHtml(post.caption).replace(/\n/g, '<br>')}</p>
      <div class="post-actions">
        <button class="like-btn ${liked ? 'liked' : ''}" data-id="${post.id}" data-action="like">${ICONS.heart(liked)} <span class="like-count">${post.likes?.length || 0}</span></button>
        ${renderCommentButton(post)}
        <button class="save-btn ${saved ? 'saved' : ''}" data-id="${post.id}" data-action="save">${ICONS.bookmark} <span>${saved ? 'Tersimpan' : 'Simpan'}</span></button>
      </div>
    </div>`;
}

function bindPostEvents(container) {
  container.querySelectorAll('[data-action="like"]').forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation();
    try { await toggleLike(Number(button.dataset.id)); refreshAll(); }
    catch (error) { console.error(error); }
  }));

  container.querySelectorAll('[data-action="comment"]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    openCommentPage(Number(button.dataset.id));
  }));

  container.querySelectorAll('[data-action="save"]').forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation();
    const id = Number(button.dataset.id);
    try { if (isSaved(id)) await unsavePostId(id); else await savePostId(id); refreshAll(); }
    catch (error) { console.error(error); showToast('Favorit gagal disimpan.', 'error'); }
  }));

  container.querySelectorAll('[data-action="menu"]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    openPostMenu(Number(button.dataset.id));
  }));

  container.querySelectorAll('.user-link').forEach(element => element.addEventListener('click', () => openOtherProfile(element.dataset.user)));
}

/* -------------------- PROFILE -------------------- */
async function loadMyProfile() {
  const me = getMe();
  if (!me) return;
  document.getElementById('profName').textContent = `@${me.username}`;
  document.getElementById('profBio').textContent = me.bio || 'Belum ada bio.';
  const avatar = document.getElementById('avatar');
  setProfileAvatar(avatar, me);
  document.getElementById('statFollowers').textContent = me.followers?.length || 0;
  document.getElementById('statFollowing').textContent = me.following?.length || 0;

  const mine = (await getAllPosts()).filter(post => post.user === me.username).sort((a, b) => b.created - a.created);
  document.getElementById('statPosts').textContent = mine.length;
  document.getElementById('statLikes').textContent = mine.reduce((total, post) => total + (post.likes?.length || 0), 0);
  const list = document.getElementById('myPostsList');
  if (!mine.length) { list.innerHTML = '<div class="grid-empty">Belum ada postingan. Tekan tombol <b>+</b> untuk membuat post pertamamu.</div>'; return; }
  list.innerHTML = renderProfileGrid(mine);
  bindProfileGridEvents(list);
}

function renderProfileGrid(posts) {
  return `<div class="profile-post-grid">${posts.map(post => `
    <div class="profile-post-tile" role="button" tabindex="0" data-action="profile-post" data-id="${post.id}">
      ${post.mediaType === 'image' ? `<img src="${post.media}" alt="Postingan" loading="lazy" decoding="async">` : `<video muted preload="metadata" playsinline src="${post.media}"></video>`}
      <span class="tile-meta">♡ ${post.likes?.length || 0} · 💬 ${countCommentTree(post.comments || [])}</span>
    </div>`).join('')}</div>`;
}

function bindProfileGridEvents(container) {
  container.querySelectorAll('[data-action="profile-post"]').forEach(tile => { const open = () => openCommentPage(Number(tile.dataset.id)); tile.addEventListener('click', open); tile.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }); });
}

function setProfileAvatar(element, user) {
  if (!element || !user) return;
  if (user.avatar) { element.style.backgroundImage = `url(${user.avatar})`; element.textContent = ''; }
  else { element.style.backgroundImage = ''; element.textContent = user.username?.[0]?.toUpperCase() || '?'; }
}

let viewingUser = null;

async function openOtherProfile(username) {
  closeTransientPages();
  const me = currentUser();
  if (!me || String(username).toLowerCase() === String(me).toLowerCase()) {
    document.querySelector('.nav-btn[data-tab="tabProfile"]')?.click();
    return;
  }
  const target = getUserByName(username);
  const self = getUserByName(me);
  if (!target || !self) return;
  username = target.username;
  viewingUser = username;
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('tabOtherProfile')?.classList.remove('hidden');

  document.getElementById('oName').textContent = `@${target.username}`;
  document.getElementById('oName2').textContent = target.username;
  document.getElementById('oBio').textContent = target.bio || 'Belum ada bio.';
  setProfileAvatar(document.getElementById('oAvatar'), target);
  document.getElementById('oFollowers').textContent = target.followers?.length || 0;
  document.getElementById('oFollowing').textContent = target.following?.length || 0;

  const followButton = document.getElementById('followBtn');
  const following = self.following?.some(name => String(name).toLowerCase() === String(username).toLowerCase());
  followButton.textContent = following ? 'Unfollow' : 'Follow';
  followButton.onclick = () => toggleFollow(username);
  document.getElementById('dmBtn').onclick = () => {
    showTab('tabDM');
    openDMChat(username);
  };

  const posts = (await getAllPosts()).filter(post => post.user === username).sort((a, b) => b.created - a.created);
  document.getElementById('oPosts').textContent = posts.length;
  document.getElementById('oLikes').textContent = posts.reduce((total, post) => total + (post.likes?.length || 0), 0);
  const list = document.getElementById('oPostList');
  list.innerHTML = posts.length ? renderProfileGrid(posts) : '<div class="grid-empty">Belum ada postingan.</div>';
  bindProfileGridEvents(list);
}

function toggleFollow(targetUser) {
  const me = currentUser();
  const users = getUsers();
  const self = users.find(user => user.username === me);
  const target = users.find(user => user.username === targetUser);
  if (!self || !target || targetUser === me) return;
  self.following ||= [];
  target.followers ||= [];
  const index = self.following.findIndex(name => String(name).toLowerCase() === String(targetUser).toLowerCase());
  if (index >= 0) {
    self.following.splice(index, 1);
    const followerIndex = target.followers.findIndex(name => String(name).toLowerCase() === String(me).toLowerCase());
    if (followerIndex >= 0) target.followers.splice(followerIndex, 1);
  } else {
    self.following.push(targetUser);
    if (!target.followers.includes(me)) target.followers.push(me);
    createNotification(targetUser, 'follow', `${me} mulai mengikuti kamu`, null);
  }
  saveUsers(users);
  openOtherProfile(targetUser);
}

function openPeoplePage(type, username) {
  const target = username === 'me' ? getMe() : getUserByName(viewingUser);
  if (!target) return;
  closeTransientPages();
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  const page = document.getElementById('peoplePage'); page?.classList.remove('hidden');
  const title = document.getElementById('peopleTitle');
  title.textContent = type === 'followers' ? `Pengikut @${target.username}` : `Mengikuti @${target.username}`;
  const names = type === 'followers' ? (target.followers || []) : (target.following || []);
  const list = document.getElementById('peopleList');
  list.innerHTML = names.length ? names.map(name => `<div class="search-user" data-user="${escapeHtml(name)}">${avatarHtml(name,44)}<div class="search-user-info"><b>@${escapeHtml(name)}</b><p>${escapeHtml(getUserByName(name)?.bio || 'Belum ada bio')}</p></div></div>`).join('') : '<div class="empty-state">Belum ada data.</div>';
  list.querySelectorAll('[data-user]').forEach(item => item.addEventListener('click', () => { page?.classList.add('hidden'); openOtherProfile(item.dataset.user); }));
}

document.querySelectorAll('.stat-click').forEach(button => button.addEventListener('click', () => openPeoplePage(button.dataset.peopleType, button.dataset.peopleUser)));
document.getElementById('peopleBack')?.addEventListener('click', () => { document.getElementById('peoplePage')?.classList.add('hidden'); showTab('tabPublic'); });

document.getElementById('backToFeed')?.addEventListener('click', () => showTab('tabPublic'));

/* -------------------- DM -------------------- */
let currentDMPartner = null;
let dmReplyTarget = null;
function dmPair(a, b) { return [a, b].sort().join('|'); }

function sendDM(to, text, replyTo = null) {
  const from = currentUser();
  return dbTransaction(NDOO_CONFIG.STORE_DMS, 'readwrite', store => {
    store.add({ pair: dmPair(from, to), from, to, text, replyTo, created: Date.now() });
  }).then(() => createNotification(to, 'dm', `${from} mengirim pesan`, null));
}

async function getConversations() {
  const all = await dbRequest(NDOO_CONFIG.STORE_DMS, 'readonly', store => store.getAll());
  const me = currentUser();
  const map = {};
  (all || []).filter(message => String(message.from).toLowerCase() === String(me).toLowerCase() || String(message.to).toLowerCase() === String(me).toLowerCase()).forEach(message => {
    const partner = String(message.from).toLowerCase() === String(me).toLowerCase() ? message.to : message.from;
    if (!map[partner] || message.created > map[partner].last.created) map[partner] = { partner, last: message };
  });
  return Object.values(map).sort((a, b) => b.last.created - a.last.created);
}

function getMessagesWith(partner) {
  return dbRequest(NDOO_CONFIG.STORE_DMS, 'readonly', store => store.index('pair').getAll(dmPair(currentUser(), partner)))
    .then(messages => (messages || []).sort((a, b) => a.created - b.created));
}

async function loadDMList() {
  const list = document.getElementById('dmList');
  const me = getMe();
  const myAvatar = document.getElementById('dmMyProfile');
  if (myAvatar && me) { myAvatar.textContent = me.avatar ? '' : (me.username?.[0] || '?').toUpperCase(); myAvatar.style.backgroundImage = me.avatar ? `url("${me.avatar}")` : ''; }
  if (!list) return;
  const conversations = await getConversations();
  if (!conversations.length) { list.innerHTML = '<div class="empty-state modern-empty"><strong>Belum ada percakapan</strong><span>Cari user lalu mulai ngobrol.</span></div>'; return; }
  list.innerHTML = conversations.map(item => {
    const partner = getUserByName(item.partner);
    const preview = item.last.replyTo ? `↩ ${item.last.text}` : item.last.text;
    return `<div class="dm-item" data-user="${escapeHtml(item.partner)}">
      ${avatarHtml(item.partner, 46)}
      <div class="dm-item-body"><b>@${escapeHtml(item.partner)}</b><p>${escapeHtml(preview).substring(0, 48)}</p><small>${timeAgo(item.last.created)}</small></div>
      <span class="dm-chevron">›</span>
    </div>`;
  }).join('');
  list.querySelectorAll('.dm-item').forEach(item => item.addEventListener('click', () => openDMChat(item.dataset.user)));
}

async function openDMChat(partner) {
  if (!getUserByName(partner)) return;
  currentDMPartner = partner;
  const users = getUsers(); const meUser = users.find(u => String(u.username).toLowerCase() === String(currentUser()).toLowerCase());
  if (meUser?.notifications) meUser.notifications.forEach(n => { if (n.type === 'dm' && String(n.from).toLowerCase() === String(partner).toLowerCase()) n.read = true; });
  saveUsers(users); updateNotifBadge(); updateDMBadge();
  dmReplyTarget = null;
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('dmChatPage')?.classList.remove('hidden');
  const user = getUserByName(partner);
  const avatar = document.getElementById('dmWithAvatar');
  if (avatar) { avatar.textContent = user?.avatar ? '' : (partner[0] || '?').toUpperCase(); avatar.style.backgroundImage = user?.avatar ? `url("${user.avatar}")` : ''; }
  document.getElementById('dmWith').textContent = `@${partner}`;
  document.getElementById('dmWithBio').textContent = user?.bio || 'Siap ngobrol ✨';
  clearDmReply();
  await renderDMMessages();
}

async function renderDMMessages() {
  if (!currentDMPartner) return;
  const messages = await getMessagesWith(currentDMPartner);
  const box = document.getElementById('dmMessages');
  const me = currentUser();
  box.innerHTML = messages.map(message => {
    const mine = String(message.from).toLowerCase() === String(me).toLowerCase();
    const reply = message.replyTo;
    return `<div class="dm-msg-row ${mine ? 'mine' : ''}">
      ${avatarHtml(message.from, 28)}
      <div class="dm-msg ${mine ? 'mine' : ''}">
        ${reply ? `<div class="dm-reply-quote">↩ @${escapeHtml(reply.from)}<br>${escapeHtml(reply.text)}</div>` : ''}
        <p>${escapeHtml(message.text)}</p>
        <small>${timeAgo(message.created)}</small>
        <div class="dm-msg-actions"><button class="ui-action-btn" type="button" data-action="reply-dm" data-id="${message.id}" data-from="${escapeHtml(message.from)}" data-text="${escapeHtml(message.text)}">↩ Balas</button></div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state modern-empty"><strong>Belum ada pesan</strong><span>Mulai percakapan sekarang.</span></div>';
  box.querySelectorAll('[data-action="reply-dm"]').forEach(button => button.addEventListener('click', () => setDmReply({ id: Number(button.dataset.id), from: button.dataset.from, text: button.dataset.text })));
  box.scrollTop = box.scrollHeight;
}

function setDmReply(message) {
  dmReplyTarget = message;
  const info = document.getElementById('dmReplyInfo');
  const text = document.getElementById('dmReplyText');
  if (info) info.classList.remove('hidden');
  if (text) text.textContent = `Membalas @${message.from}: ${message.text}`;
  document.getElementById('dmInput')?.focus();
}

function clearDmReply() {
  dmReplyTarget = null;
  document.getElementById('dmReplyInfo')?.classList.add('hidden');
}

document.getElementById('cancelDmReply')?.addEventListener('click', clearDmReply);

document.getElementById('dmForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.getElementById('dmInput');
  const sendButton = event.currentTarget.querySelector('button[type=submit]');
  const text = input.value.trim();
  if (!text || !currentDMPartner) return;
  if (!getUserByName(currentDMPartner)) { showToast('User tidak ditemukan.', 'error'); return; }
  if (sendButton) sendButton.disabled = true;
  try {
    await sendDM(currentDMPartner, text, dmReplyTarget ? { id: dmReplyTarget.id, from: dmReplyTarget.from, text: dmReplyTarget.text } : null);
    input.value = ''; clearDmReply(); await renderDMMessages();
  } catch (error) { console.error('DM gagal:', error); showToast(error?.name === 'QuotaExceededError' ? 'Penyimpanan perangkat penuh.' : 'Pesan gagal dikirim.', 'error'); }
  finally { if (sendButton) sendButton.disabled = false; }
});

document.getElementById('dmBack')?.addEventListener('click', () => {
  document.getElementById('dmChatPage')?.classList.add('hidden');
  currentDMPartner = null; clearDmReply(); showTab('tabDM');
});
document.getElementById('dmProfileBtn')?.addEventListener('click', () => {
  if (currentDMPartner) openOtherProfile(currentDMPartner);
});

/* -------------------- STORY -------------------- */
let currentStoryUser = null;
let currentStoryIndex = 0;
let storyProgressTimer = null;
let storyMediaData = null;
let storyMediaType = null;

async function loadStoryBar() {
  const bar = document.getElementById('storyBar');
  if (!bar) return;
  const stories = await getActiveStories();
  const grouped = {};
  stories.forEach(story => (grouped[story.user] ||= []).push(story));
  const me = currentUser();
  const users = Object.keys(grouped).sort((a, b) => a === me ? -1 : b === me ? 1 : 0);
  let html = `<div class="story-item story-add" id="addStoryBtn"><div class="story-avatar"><div class="story-avatar-inner">+</div></div><div class="story-name">Story</div></div>`;
  users.forEach(user => {
    const list = grouped[user];
    const allSeen = list.every(story => isStorySeen(story.id));
    const profile = getUserByName(user);
    const style = profile?.avatar ? `style="background-image:url('${profile.avatar}');background-size:cover;background-position:center;color:transparent"` : '';
    html += `<div class="story-item" data-user="${escapeHtml(user)}"><div class="story-avatar ${allSeen ? 'seen' : ''}"><div class="story-avatar-inner" ${style}>${profile?.avatar ? '' : escapeHtml(user[0].toUpperCase())}</div></div><div class="story-name">${user === me ? 'Kamu' : escapeHtml(user)}</div></div>`;
  });
  bar.innerHTML = html;
  document.getElementById('addStoryBtn')?.addEventListener('click', openStoryComposer);
  bar.querySelectorAll('.story-item[data-user]').forEach(item => item.addEventListener('click', () => openStoryView(item.dataset.user)));
}

function openStoryComposer() {
  storyMediaData = null;
  storyMediaType = null;
  document.getElementById('storyAddPage')?.classList.remove('hidden');
  document.getElementById('storyMsg').textContent = '';
  document.getElementById('storyPreview').innerHTML = '';
  document.getElementById('storyCaption').value = '';
  document.getElementById('storyMedia').value = '';
}

async function openStoryView(username) {
  currentStoryUser = username;
  currentStoryIndex = 0;
  document.getElementById('storyViewPage')?.classList.remove('hidden');
  document.getElementById('storyViewUser').textContent = `@${username}`;
  await playStory();
}

async function playStory() {
  if (storyProgressTimer) cancelAnimationFrame(storyProgressTimer);
  if (!currentStoryUser) return;
  const stories = await getStoriesByUser(currentStoryUser);
  if (!stories.length || currentStoryIndex >= stories.length) { closeStoryView(); return; }
  const story = stories[currentStoryIndex];
  markStorySeen(story.id);
  const content = document.getElementById('storyViewContent');
  content.innerHTML = `${story.mediaType === 'image' ? `<img src="${story.media}" alt="Story">` : `<video autoplay controls src="${story.media}"></video>`}${story.caption ? `<div class="story-caption">${escapeHtml(story.caption)}</div>` : ''}`;

  const left = NDOO_CONFIG.STORY_TTL - (Date.now() - story.created);
  const duration = Math.max(1, Math.min(15000, left));
  document.getElementById('storyTimer').textContent = timeLeft(story.created);
  const progress = document.getElementById('storyProgressBar');
  const start = Date.now();
  progress.style.width = '0%';
  const tick = () => {
    const percent = Math.min(100, ((Date.now() - start) / duration) * 100);
    progress.style.width = `${percent}%`;
    if (percent < 100) storyProgressTimer = requestAnimationFrame(tick);
    else { currentStoryIndex += 1; playStory(); }
  };
  tick();
}

function closeStoryView() {
  if (storyProgressTimer) cancelAnimationFrame(storyProgressTimer);
  storyProgressTimer = null;
  currentStoryUser = null;
  document.getElementById('storyViewPage')?.classList.add('hidden');
  loadStoryBar();
}

document.getElementById('storyViewBack')?.addEventListener('click', closeStoryView);
document.getElementById('storyAddBack')?.addEventListener('click', () => document.getElementById('storyAddPage')?.classList.add('hidden'));

document.getElementById('storyMedia')?.addEventListener('change', async event => {
  const file = event.target.files[0];
  const msg = document.getElementById('storyMsg');
  const result = validateMedia(file, NDOO_CONFIG.MAX_STORY_MEDIA);
  msg.textContent = result.ok ? '' : result.message;
  if (!result.ok) return;
  try {
    storyMediaData = await readFileAsDataURL(file);
    storyMediaType = result.type;
    document.getElementById('storyPreview').innerHTML = result.type === 'image'
      ? `<img src="${storyMediaData}" alt="Preview story">`
      : `<video controls src="${storyMediaData}"></video>`;
  } catch { msg.textContent = 'Gagal membaca file.'; }
});

document.getElementById('storySubmit')?.addEventListener('click', async () => {
  const msg = document.getElementById('storyMsg');
  if (!storyMediaData) { msg.textContent = 'Pilih foto/video dulu.'; return; }
  try {
    await saveStory({ user: currentUser(), media: storyMediaData, mediaType: storyMediaType, caption: document.getElementById('storyCaption').value.trim(), created: Date.now() });
    msg.style.color = 'var(--accent2)';
    msg.textContent = 'Story berhasil diunggah!';
    setTimeout(() => { msg.style.color = ''; document.getElementById('storyAddPage')?.classList.add('hidden'); loadStoryBar(); }, 700);
  } catch { msg.textContent = 'Story gagal disimpan.'; }
});

/* -------------------- SEARCH -------------------- */
document.getElementById('searchBtn')?.addEventListener('click', async () => {
  try { await refreshOnlineProfiles(); } catch {}
  document.getElementById('searchPage')?.classList.remove('hidden');
  const input = document.getElementById('searchInput');
  input.value = '';
  document.getElementById('searchResults').innerHTML = '';
  input.focus();
});

document.getElementById('searchBack')?.addEventListener('click', () => document.getElementById('searchPage')?.classList.add('hidden'));
document.getElementById('searchInput')?.addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  const results = document.getElementById('searchResults');
  if (!query) { results.innerHTML = ''; return; }
  const users = getUsers().filter(user => user.username.toLowerCase().includes(query));
  if (!users.length) { results.innerHTML = '<p class="empty-state">Tidak ada user ditemukan.</p>'; return; }
  results.innerHTML = users.map(user => `<div class="search-user" data-user="${escapeHtml(user.username)}">${avatarHtml(user.username, 48)}<div class="search-user-info"><b>@${escapeHtml(user.username)}</b><p>${escapeHtml(user.bio || 'Belum ada bio')}</p></div></div>`).join('');
  results.querySelectorAll('.search-user').forEach(item => item.addEventListener('click', () => { document.getElementById('searchPage').classList.add('hidden'); openOtherProfile(item.dataset.user); }));
});

/* -------------------- VIP -------------------- */
async function loadVipFeed() {
  if (!db) return;
  const me = getMe();
  const status = document.getElementById('vipStatusText');
  const upgrade = document.getElementById('upgradeBtn');
  const list = document.getElementById('vipList');
  if (me?.vip) { status.textContent = 'Kamu member VIP. Nikmati video premium!'; upgrade.classList.add('hidden'); }
  else { status.textContent = 'Upgrade ke VIP untuk akses semua video premium.'; upgrade.classList.remove('hidden'); }
  const posts = (await getAllPosts()).filter(post => post.isVip).sort((a, b) => b.created - a.created);
  if (!me?.vip) { list.innerHTML = '<p class="empty-state">Video premium terkunci.</p>'; return; }
  if (!posts.length) { list.innerHTML = '<p class="empty-state">Belum ada video VIP.</p>'; return; }
  list.innerHTML = posts.map(post => renderPost(post, currentUser())).join('');
  bindPostEvents(list);
}

document.getElementById('upgradeBtn')?.addEventListener('click', () => showToast('Fitur upgrade VIP belum terhubung ke sistem pembayaran.', 'info'));


/* -------------------- AI NDOOHLCC -------------------- */
const NDOO_AI_ENDPOINT = window.NDOO_AI_ENDPOINT || 'https://gen.pollinations.ai/v1/chat/completions';
const NDOO_AI_API_KEY = window.NDOO_AI_API_KEY || sessionStorage.getItem('ndoo_ai_api_key') || '';
const AI_CHAT_KEY_PREFIX = 'ndoo_ai_chats_';
let aiBusy = false;
let aiChats = [];
let aiCurrentChatId = null;
let aiHistory = [];
let aiEventsBound = false;

function aiStorageKey() { return `${AI_CHAT_KEY_PREFIX}${currentUser() || 'guest'}`; }
function makeId(prefix = 'id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

function loadAIChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(aiStorageKey()) || '[]');
    aiChats = Array.isArray(saved) ? saved : [];
  } catch { aiChats = []; }
  if (!aiChats.length) createAIChat(false);
  if (!aiCurrentChatId || !aiChats.some(chat => chat.id === aiCurrentChatId)) aiCurrentChatId = aiChats[0]?.id || null;
  const current = aiChats.find(chat => chat.id === aiCurrentChatId);
  aiHistory = Array.isArray(current?.messages) ? current.messages.slice() : [];
}

function saveAIChats() {
  try { localStorage.setItem(aiStorageKey(), JSON.stringify(aiChats.slice(0, 20))); } catch (error) { console.warn('AI history gagal disimpan:', error); }
}

function persistCurrentAIChat() {
  const chat = aiChats.find(item => item.id === aiCurrentChatId);
  if (!chat) return;
  chat.messages = aiHistory.slice(-40);
  const firstUser = chat.messages.find(item => item.role === 'user');
  chat.title = chat.title === 'Obrolan baru' && firstUser ? firstUser.text.slice(0, 34) : (chat.title || 'Obrolan baru');
  chat.updated = Date.now();
  aiChats.sort((a, b) => b.updated - a.updated);
  saveAIChats();
}

function createAIChat(activate = true) {
  const chat = { id: makeId('chat'), title: 'Obrolan baru', messages: [], created: Date.now(), updated: Date.now() };
  aiChats.unshift(chat);
  if (aiChats.length > 20) aiChats.length = 20;
  if (activate) { aiCurrentChatId = chat.id; aiHistory = []; renderAIChat(); }
  saveAIChats();
  return chat;
}

function renderAIChat() {
  const box = document.getElementById('aiMessages');
  if (!box) return;
  box.innerHTML = '';
  if (!aiHistory.length) {
    box.innerHTML = '<div class="ai-message ai-message-bot"><div class="ai-avatar">N</div><div class="ai-bubble"><strong>AI NdooHlcc</strong><p>Yo Bos 👋 Mau ngerjain apa hari ini?</p></div></div>';
    return;
  }
  aiHistory.forEach(item => appendAIMessage(item.role, item.text, false));
}

function renderAIHistory() {
  const panel = document.getElementById('aiHistoryPanel');
  if (!panel) return;
  panel.innerHTML = `<div class="ai-history-head"><b>Riwayat obrolan</b><button type="button" class="ui-action-btn" id="aiHistoryHide">Sembunyikan</button></div>` + (aiChats.length ? aiChats.map(chat => `
    <button type="button" class="ai-history-item ${chat.id === aiCurrentChatId ? 'active' : ''}" data-ai-chat="${chat.id}">
      <span>${escapeHtml(chat.title || 'Obrolan baru')}</span><small>${timeAgo(chat.updated)}</small>
    </button>`).join('') : '<div class="ai-history-empty">Belum ada obrolan.</div>');
  panel.querySelector('#aiHistoryHide')?.addEventListener('click', () => panel.classList.add('hidden'));
  panel.querySelectorAll('[data-ai-chat]').forEach(button => button.addEventListener('click', () => {
    const chat = aiChats.find(item => item.id === button.dataset.aiChat);
    if (!chat) return;
    aiCurrentChatId = chat.id;
    aiHistory = Array.isArray(chat.messages) ? chat.messages.slice() : [];
    renderAIChat();
    renderAIHistory();
    panel.classList.add('hidden');
  }));
}

function openAIPage() {
  closeTransientPages();
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('aiPage')?.classList.remove('hidden');
  document.querySelectorAll('.nav-btn[data-tab]').forEach(button => button.classList.remove('active'));
  loadAIChats();
  renderAIChat();
  renderAIHistory();
  document.getElementById('aiInput')?.focus();
}

function appendAIMessage(role, text, scroll = true) {
  const box = document.getElementById('aiMessages');
  if (!box) return;
  const safe = escapeHtml(text).replace(/\n/g, '<br>');
  const isUser = role === 'user';
  const node = document.createElement('div');
  node.className = `ai-message ${isUser ? 'ai-message-user' : 'ai-message-bot'}`;
  node.innerHTML = isUser
    ? `<div class="ai-bubble"><strong>Kamu</strong><p>${safe}</p></div>`
    : `<div class="ai-avatar">N</div><div class="ai-bubble"><strong>AI NdooHlcc</strong><p>${safe}</p></div>`;
  box.appendChild(node);
  if (scroll) box.scrollTop = box.scrollHeight;
}

function setAILoading(loading) {
  const button = document.getElementById('aiSend');
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle('is-loading', loading);
  button.innerHTML = loading ? '<span class="ai-spinner"></span>' : '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>';
}

async function askNdooAI(prompt) {
  const system = 'Kamu adalah AI NdooHlcc. Jawab dalam Bahasa Indonesia kasual, hangat, kreatif, ringkas tapi berguna. Panggil pengguna Bos. Jika diminta coding, berikan solusi praktis. Jangan mengaku sebagai pembuat aplikasi atau menambahkan klaim promosi yang tidak diminta.';
  const messages = [{ role: 'system', content: system }, ...aiHistory.slice(-12).map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: item.text }))];

  // Jalur utama browser: Puter.js, tanpa API key aplikasi. Pengguna akan diminta
  // autentikasi oleh Puter bila diperlukan.
  if (window.puter?.ai?.chat) {
    const result = await puter.ai.chat(messages, false, { model: 'gpt-5.6-luna' });
    const text = typeof result === 'string' ? result : (result?.message?.content || result?.content || result?.text || '');
    if (text?.trim()) return text.trim();
  }

  // Fallback opsional untuk deployment yang sudah menyediakan API key Pollinations.
  if (!NDOO_AI_API_KEY) throw new Error('Puter.js tidak tersedia dan API AI belum dikonfigurasi.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    response = await fetch(NDOO_AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${NDOO_AI_API_KEY}` },
      body: JSON.stringify({ model: 'openai/gpt-5.4-nano', messages, temperature: 0.7, max_tokens: 700 }),
      signal: controller.signal
    });
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || data?.content?.trim() || '';
  if (!text) throw new Error('AI mengembalikan jawaban kosong');
  return text;
}

function initAI() {
  if (aiEventsBound) return;
  const aiButton = document.getElementById('aiBtn');
  const aiBack = document.getElementById('aiBack');
  const aiForm = document.getElementById('aiForm');
  if (!aiButton || !aiBack || !aiForm) return;
  aiEventsBound = true;
  aiButton.addEventListener('click', openAIPage);
  aiBack.addEventListener('click', () => { document.getElementById('aiPage')?.classList.add('hidden'); showTab('tabPublic'); });
  document.getElementById('aiNewChat')?.addEventListener('click', () => { persistCurrentAIChat(); createAIChat(true); renderAIHistory(); });
  document.getElementById('aiHistoryBtn')?.addEventListener('click', () => { renderAIHistory(); document.getElementById('aiHistoryPanel')?.classList.toggle('hidden'); });
  document.querySelectorAll('[data-ai-prompt]').forEach(chip => chip.addEventListener('click', () => {
    const input = document.getElementById('aiInput');
    if (!input) return;
    input.value = chip.dataset.aiPrompt || '';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }));
  aiForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (aiBusy) return;
    const input = document.getElementById('aiInput');
    const prompt = input?.value.trim();
    if (!prompt) return;
    if (!aiCurrentChatId) createAIChat(false);
    aiBusy = true;
    appendAIMessage('user', prompt);
    aiHistory.push({ role: 'user', text: prompt, created: Date.now() });
    persistCurrentAIChat();
    input.value = '';
    setAILoading(true);
    try {
      const answer = await askNdooAI(prompt);
      appendAIMessage('assistant', answer);
      aiHistory.push({ role: 'assistant', text: answer, created: Date.now() });
      persistCurrentAIChat();
      renderAIHistory();
    } catch (error) {
      console.error('AI error:', error);
      appendAIMessage('assistant', 'Koneksi AI sedang bermasalah. Coba lagi beberapa saat.');
    } finally { aiBusy = false; setAILoading(false); input?.focus(); }
  });
}

/* -------------------- MUSIC -------------------- */
let musicObjectUrls = new Map();
let musicTracks = [];
let currentMusicId = null;
let musicEventsBound = false;
let musicFloatEnabled = localStorage.getItem('ndoo_music_float') === '1';

function formatMusicTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function musicUrl(track) {
  if (!track?.blob) return track?.url || '';
  if (!musicObjectUrls.has(track.id)) musicObjectUrls.set(track.id, URL.createObjectURL(track.blob));
  return musicObjectUrls.get(track.id);
}

async function loadMusicList() {
  const list = document.getElementById('musicList');
  if (!list || !db) return;
  musicTracks = (await getAllMusic()).filter(track => track.user === currentUser()).sort((a, b) => b.created - a.created);
  list.innerHTML = musicTracks.length ? musicTracks.map((track, index) => `
    <div class="music-track" data-music-id="${track.id}">
      <button class="music-track-play" type="button" data-music-play="${track.id}">${currentMusicId === track.id && !document.getElementById('globalAudio')?.paused ? '❚❚' : '▶'}</button>
      <div class="music-track-cover">${index + 1}</div>
      <div class="music-track-info"><b>${escapeHtml(track.title || 'Tanpa judul')}</b><small>${formatMusicTime(track.duration)} · Musik kamu</small></div>
      <button class="music-track-delete" type="button" data-music-delete="${track.id}" title="Hapus">×</button>
    </div>`).join('') : '<div class="empty-state modern-empty"><strong>Belum ada musik</strong><span>Tambahkan file audio dari perangkatmu.</span></div>';
  list.querySelectorAll('[data-music-play]').forEach(button => button.addEventListener('click', () => playMusic(Number(button.dataset.musicPlay))));
  list.querySelectorAll('[data-music-delete]').forEach(button => button.addEventListener('click', () => removeMusic(Number(button.dataset.musicDelete))));
}

async function playMusic(id) {
  const track = musicTracks.find(item => item.id === id) || (await getAllMusic()).find(item => item.id === id);
  if (!track) return;
  const audio = document.getElementById('globalAudio');
  if (!audio) return;
  currentMusicId = track.id;
  audio.src = musicUrl(track);
  audio.dataset.musicId = String(track.id);
  document.getElementById('musicPlayerTitle').textContent = track.title || 'Tanpa judul';
  document.getElementById('musicPlayerMeta').textContent = 'Musik kamu';
  document.getElementById('musicPlayerCover').textContent = '♫';
  if (musicFloatEnabled) document.getElementById('musicPlayer')?.classList.remove('hidden'); else document.getElementById('musicPlayer')?.classList.add('hidden');
  try { await audio.play(); } catch (error) { console.warn('Playback menunggu interaksi:', error); }
  loadMusicList();
}

async function removeMusic(id) {
  if (!(await showConfirm('Hapus musik ini dari koleksi?'))) return;
  if (currentMusicId === id) {
    const audio = document.getElementById('globalAudio'); audio?.pause(); if (audio) audio.removeAttribute('src');
    currentMusicId = null; document.getElementById('musicPlayer')?.classList.add('hidden');
  }
  const url = musicObjectUrls.get(id); if (url) URL.revokeObjectURL(url); musicObjectUrls.delete(id);
  await deleteMusic(id); await loadMusicList();
}

function openMusicPage() {
  closeTransientPages();
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('musicPage')?.classList.remove('hidden');
  loadMusicList().catch(error => console.error('Music load:', error));
}

function initMusic() {
  if (musicEventsBound) return;
  const button = document.getElementById('musicBtn');
  const file = document.getElementById('musicFile');
  if (!button || !file) return;
  musicEventsBound = true;
  button.addEventListener('click', openMusicPage);
  document.getElementById('musicBack')?.addEventListener('click', () => { document.getElementById('musicPage')?.classList.add('hidden'); showTab('tabPublic'); });
  document.getElementById('musicAddBtn')?.addEventListener('click', () => file.click());
  const floatBtn = document.getElementById('musicFloatBtn');
  const syncMusicFloatButton = () => { if (floatBtn) floatBtn.textContent = musicFloatEnabled ? 'Pemutar: Mengambang' : 'Pemutar: Tidak Mengambang'; };
  syncMusicFloatButton();
  floatBtn?.addEventListener('click', () => {
    musicFloatEnabled = !musicFloatEnabled; localStorage.setItem('ndoo_music_float', musicFloatEnabled ? '1' : '0');
    syncMusicFloatButton();
    if (musicFloatEnabled && currentMusicId != null) document.getElementById('musicPlayer')?.classList.remove('hidden');
    else document.getElementById('musicPlayer')?.classList.add('hidden');
  });
  file.addEventListener('change', async event => {
    const files = [...(event.target.files || [])]; event.target.value = '';
    for (const audioFile of files) {
      if (!audioFile.type.startsWith('audio/')) continue;
      try {
        await addMusic({ user: currentUser(), title: audioFile.name.replace(/\.[^/.]+$/, ''), blob: audioFile, duration: 0, created: Date.now() });
      } catch (error) { console.error('Tambah musik gagal:', error); }
    }
    await loadMusicList();
  });
  document.getElementById('musicClearBtn')?.addEventListener('click', async () => {
    if (!musicTracks.length || !(await showConfirm('Hapus semua musik di koleksi?'))) return;
    const ids = musicTracks.map(track => track.id);
    const audio = document.getElementById('globalAudio');
    audio?.pause();
    if (currentMusicId != null && ids.includes(currentMusicId)) { currentMusicId = null; audio?.removeAttribute('src'); document.getElementById('musicPlayer')?.classList.add('hidden'); }
    for (const id of ids) { const url = musicObjectUrls.get(id); if (url) URL.revokeObjectURL(url); musicObjectUrls.delete(id); await deleteMusic(id); }
    await loadMusicList();
  });
  document.getElementById('musicPlayPause')?.addEventListener('click', () => {
    const audio = document.getElementById('globalAudio'); if (!audio?.src) return;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  });
  document.getElementById('musicPlayerClose')?.addEventListener('click', () => { const audio = document.getElementById('globalAudio'); audio?.pause(); document.getElementById('musicPlayer')?.classList.add('hidden'); });
  document.getElementById('globalAudio')?.addEventListener('play', () => { document.getElementById('musicPlayPause').textContent = '❚❚'; loadMusicList(); });
  document.getElementById('globalAudio')?.addEventListener('pause', () => { document.getElementById('musicPlayPause').textContent = '▶'; loadMusicList(); });
  document.getElementById('globalAudio')?.addEventListener('ended', () => { document.getElementById('musicPlayPause').textContent = '▶'; });
}

initAI();
initMusic();
