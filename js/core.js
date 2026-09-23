/* =========================================================
   CORE — database, storage, helpers, icons, theme
   ========================================================= */

function getUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(NDOO_CONFIG.LS_USERS) || '[]');
    let changed = false;
    users.forEach(user => {
      if (user && !user.uid) {
        user.uid = `NDOO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
        changed = true;
      }
      if (user && !Array.isArray(user.notifications)) { user.notifications = []; changed = true; }
      if (user && !Array.isArray(user.followers)) { user.followers = []; changed = true; }
      if (user && !Array.isArray(user.following)) { user.following = []; changed = true; }
    });
    if (changed) localStorage.setItem(NDOO_CONFIG.LS_USERS, JSON.stringify(users));
    return users;
  } catch { return []; }
}

function saveUsers(users) {
  localStorage.setItem(NDOO_CONFIG.LS_USERS, JSON.stringify(users));
}

function currentUser() {
  return sessionStorage.getItem(NDOO_CONFIG.SS_LOGIN);
}

function getMe() {
  const username = currentUser();
  return username ? getUserByName(username) : null;
}

function getUserByName(name) {
  const needle = String(name ?? '').trim().toLowerCase();
  return getUsers().find(user => String(user.username ?? '').trim().toLowerCase() === needle) || null;
}

function getBanInfo(user) {
  if (!user?.bannedUntil) return null;
  const until = Number(user.bannedUntil);
  if (!Number.isFinite(until) || until <= Date.now()) return null;
  return { until, reason: user.banReason || 'Tidak ada alasan yang dicantumkan.' };
}

function isAdmin() {
  const me = getMe();
  return String(me?.role || '').toLowerCase() === 'admin' || String(currentUser() || '').toLowerCase() === String(NDOO_CONFIG.ADMIN_USER).toLowerCase();
}

function simpleHash(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('uiToast');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2800);
}

function showConfirm(message) {
  return new Promise(resolve => {
    const modal = document.getElementById('uiConfirm');
    const text = document.getElementById('uiConfirmText');
    const ok = document.getElementById('uiConfirmOk');
    const cancel = document.getElementById('uiConfirmCancel');
    if (!modal || !text || !ok || !cancel) { resolve(false); return; }
    text.textContent = message;
    modal.classList.remove('hidden');
    const finish = value => { modal.classList.add('hidden'); ok.onclick = null; cancel.onclick = null; resolve(value); };
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
  });
}

function timeAgo(timestamp) {
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'baru saja';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return `${Math.floor(seconds / 86400)} hari lalu`;
}

function timeLeft(timestamp) {
  const left = NDOO_CONFIG.STORY_TTL - (Date.now() - timestamp);
  if (left <= 0) return '0j';
  return `${Math.floor(left / 3600000)}j`;
}

function requireDb() {
  if (!db) throw new Error('Database belum siap');
  return db;
}

function isRetryableDbError(error) {
  const name = error?.name || '';
  return ['InvalidStateError', 'TransactionInactiveError', 'AbortError', 'NotFoundError'].includes(name)
    || /Database belum siap|database.*closed|transaction.*inactive/i.test(error?.message || '');
}

function openDatabase(force = false) {
  if (!force && db) return Promise.resolve(db);
  if (!force && dbOpenPromise) return dbOpenPromise;

  dbOpenPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(NDOO_CONFIG.DB_NAME, NDOO_CONFIG.DB_VERSION);
    } catch (error) {
      dbOpenPromise = null;
      reject(error);
      return;
    }

    request.onupgradeneeded = event => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(NDOO_CONFIG.STORE_POSTS)) {
        const store = database.createObjectStore(NDOO_CONFIG.STORE_POSTS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('created', 'created');
        store.createIndex('user', 'user');
      }
      if (!database.objectStoreNames.contains(NDOO_CONFIG.STORE_DMS)) {
        const store = database.createObjectStore(NDOO_CONFIG.STORE_DMS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('pair', 'pair');
        store.createIndex('created', 'created');
      }
      if (!database.objectStoreNames.contains(NDOO_CONFIG.STORE_STORIES)) {
        const store = database.createObjectStore(NDOO_CONFIG.STORE_STORIES, { keyPath: 'id', autoIncrement: true });
        store.createIndex('user', 'user');
        store.createIndex('created', 'created');
      }
      if (!database.objectStoreNames.contains(NDOO_CONFIG.STORE_MUSIC)) {
        const store = database.createObjectStore(NDOO_CONFIG.STORE_MUSIC, { keyPath: 'id', autoIncrement: true });
        store.createIndex('user', 'user');
        store.createIndex('created', 'created');
      }
    };

    request.onsuccess = event => {
      db = event.target.result;
      db.onversionchange = () => {
        try { db?.close(); } catch {}
        db = null;
        dbOpenPromise = null;
      };
      db.onerror = event => console.warn('IndexedDB:', event.target?.error || 'error');
      resolve(db);
    };
    request.onerror = () => {
      dbOpenPromise = null;
      reject(request.error || new Error('Gagal membuka database'));
    };
    request.onblocked = () => {
      console.warn('IndexedDB masih diblokir tab lain.');
      // Jangan reject hanya karena blocked; browser akan menyelesaikan request
      // setelah koneksi lama dilepas.
    };
  });

  dbOpenPromise.catch(() => { dbOpenPromise = null; });
  return dbOpenPromise;
}

async function withDbRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const database = await openDatabase(attempt > 0);
      return await operation(database);
    } catch (error) {
      lastError = error;
      if (!isRetryableDbError(error) || attempt === 1) throw error;
      try { db?.close(); } catch {}
      db = null;
      dbOpenPromise = null;
    }
  }
  throw lastError || new Error('Operasi database gagal');
}

function dbRequest(storeName, mode, operation) {
  return withDbRetry(database => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = database.transaction(storeName, mode);
      const request = operation(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Operasi database gagal'));
      tx.onerror = () => reject(tx.error || new Error('Transaksi database gagal'));
      tx.onabort = () => reject(tx.error || new Error('Transaksi database dibatalkan'));
    } catch (error) { reject(error); }
  }));
}

function dbTransaction(storeName, mode, operation) {
  return withDbRetry(database => new Promise((resolve, reject) => {
    try {
      const tx = database.transaction(storeName, mode);
      operation(tx.objectStore(storeName));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaksi database gagal'));
      tx.onabort = () => reject(tx.error || new Error('Transaksi database dibatalkan'));
    } catch (error) { reject(error); }
  }));
}

function dbPutMany(storeName, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return Promise.resolve();
  return dbTransaction(storeName, 'readwrite', store => list.forEach(item => { if (item && typeof item === 'object') store.put(item); }));
}

function getAllMusic() {
  return dbRequest(NDOO_CONFIG.STORE_MUSIC, 'readonly', store => store.getAll());
}

function addMusic(track) {
  return dbRequest(NDOO_CONFIG.STORE_MUSIC, 'readwrite', store => store.add(track));
}

function deleteMusic(id) {
  return dbTransaction(NDOO_CONFIG.STORE_MUSIC, 'readwrite', store => store.delete(Number(id)));
}

function getAllPosts() {
  return dbRequest(NDOO_CONFIG.STORE_POSTS, 'readonly', store => store.getAll());
}

function getPostById(id) {
  return dbRequest(NDOO_CONFIG.STORE_POSTS, 'readonly', store => store.get(Number(id)));
}

function savePost(post) {
  return dbTransaction(NDOO_CONFIG.STORE_POSTS, 'readwrite', store => store.put(post));
}

function deletePost(id) {
  return dbTransaction(NDOO_CONFIG.STORE_POSTS, 'readwrite', store => store.delete(Number(id)));
}

async function getActiveStories() {
  const all = await dbRequest(NDOO_CONFIG.STORE_STORIES, 'readonly', store => store.getAll());
  const now = Date.now();
  const active = [];
  const expired = [];
  (all || []).forEach(story => {
    if (now - story.created < NDOO_CONFIG.STORY_TTL) active.push(story);
    else expired.push(story.id);
  });
  if (expired.length) {
    await dbTransaction(NDOO_CONFIG.STORE_STORIES, 'readwrite', store => expired.forEach(id => store.delete(id)));
  }
  return active;
}

function saveStory(story) {
  return dbTransaction(NDOO_CONFIG.STORE_STORIES, 'readwrite', store => store.add(story));
}

async function getStoriesByUser(username) {
  const stories = await getActiveStories();
  return stories.filter(story => story.user === username).sort((a, b) => a.created - b.created);
}

function getSavedIds() {
  try { return JSON.parse(localStorage.getItem(NDOO_CONFIG.LS_SAVED) || '[]'); }
  catch { return []; }
}

function savePostId(id) {
  const ids = getSavedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(NDOO_CONFIG.LS_SAVED, JSON.stringify(ids));
  }
}

function unsavePostId(id) {
  localStorage.setItem(NDOO_CONFIG.LS_SAVED, JSON.stringify(getSavedIds().filter(item => item !== id)));
}

function isSaved(id) { return getSavedIds().includes(id); }

function avatarHtml(username, size = 38) {
  const user = getUserByName(username);
  const px = `${size}px`;
  const fontSize = `${Math.floor(size * 0.4)}px`;
  if (user?.avatar) {
    return `<div class="post-avatar" style="width:${px};height:${px};background-image:url('${user.avatar}')"></div>`;
  }
  return `<div class="post-avatar" style="width:${px};height:${px};font-size:${fontSize}">${escapeHtml((username || '?')[0].toUpperCase())}</div>`;
}

const ICONS = Object.freeze({
  heart: filled => filled
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 4h16v12H7l-5 5z"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 2h12v20l-6-5-6 5z"/></svg>'
});

function initTheme() {
  const saved = localStorage.getItem(NDOO_CONFIG.LS_THEME) || 'dark';
  applyTheme(saved === 'dark' ? 'dark' : 'light');
  document.getElementById('themeDark')?.addEventListener('click', () => applyTheme('dark'));
  document.getElementById('themeLight')?.addEventListener('click', () => applyTheme('light'));
}

function applyTheme(mode) {
  const theme = mode === 'dark' ? 'dark' : 'light';
  localStorage.setItem(NDOO_CONFIG.LS_THEME, theme);
  document.body.classList.toggle('light', theme === 'light');
  document.getElementById('themeDark')?.classList.toggle('active', theme === 'dark');
  document.getElementById('themeLight')?.classList.toggle('active', theme === 'light');
}

function formatUploadError(error, label = 'File') {
  const raw = String(error?.cause?.message || error?.message || '').trim();
  if (/row-level security|not authorized|permission|403/i.test(raw)) return `${label} gagal: izin Storage ditolak. Cek policy bucket di Supabase.`;
  if (/bucket.*not found|not found.*bucket/i.test(raw)) return `${label} gagal: bucket Storage tidak ditemukan.`;
  if (/payload too large|too large|exceeded|size/i.test(raw)) return `${label} gagal: ukuran file terlalu besar.`;
  if (/duplicate|already exists/i.test(raw)) return `${label} gagal: file bentrok, coba pilih file lagi.`;
  if (/session|jwt|unauthorized/i.test(raw)) return `${label} gagal: sesi login kedaluwarsa. Login ulang.`;
  if (raw) return `${label} gagal: ${raw}`;
  if (error?.name === 'QuotaExceededError') return 'Penyimpanan perangkat penuh. Hapus data lama lalu coba lagi.';
  return `${label} gagal disimpan. Coba lagi.`;
}

function validateMedia(file, maxBytes) {
  if (!file) return { ok: false, message: 'Pilih foto/video dulu.' };
  const image = file.type.startsWith('image/');
  const video = file.type.startsWith('video/');
  if (!image && !video) return { ok: false, message: 'Format tidak didukung.' };
  if (file.size > maxBytes) return { ok: false, message: `Maksimal ${Math.round(maxBytes / 1024 / 1024)}MB.` };
  return { ok: true, type: image ? 'image' : 'video' };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

function markStorySeen(id) {
  const key = 'ndoo_story_seen';
  const seen = getLocalArray(key);
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem(key, JSON.stringify(seen));
  }
}

function isStorySeen(id) { return getLocalArray('ndoo_story_seen').includes(id); }
function getLocalArray(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function createNotification(toUser, type, text, postId = null) {
  const users = getUsers();
  const target = users.find(user => String(user.username).toLowerCase() === String(toUser).toLowerCase());
  if (!target) return;
  target.notifications ||= [];
  target.notifications.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type, text, postId, from: currentUser(), read: false, created: Date.now()
  });
  saveUsers(users);
  updateNotifBadge();
  updateDMBadge();
}

function updateNotifBadge() {
  const me = getMe();
  const badge = document.getElementById('notifCount');
  if (!badge) return;
  const unread = me?.notifications?.filter(item => !item.read).length || 0;
  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);
}

function updateDMBadge() {
  const badge = document.getElementById('dmCount');
  if (!badge) return;
  const me = getMe();
  const count = me?.notifications?.filter(item => item.type === 'dm' && !item.read).length || 0;
  badge.textContent = count > 99 ? '99+' : String(count); badge.classList.toggle('hidden', count === 0);
}

function loadNotifications() {
  const me = getMe();
  const list = document.getElementById('notifList');
  if (!me || !list) return;
  const notifications = [...(me.notifications || [])].sort((a, b) => b.created - a.created);
  if (!notifications.length) {
    list.innerHTML = '<p class="empty-state">Belum ada notifikasi.</p>';
  } else {
    list.innerHTML = notifications.map(item => `
      <div class="notif ${item.read ? '' : 'unread'}">
        ${item.from ? avatarHtml(item.from, 36) : ''}
        <div class="notif-body"><p>${escapeHtml(item.text)}</p><small>${timeAgo(item.created)}</small></div>
      </div>
    `).join('');
  }
  const users = getUsers();
  const target = users.find(user => user.username === me.username);
  if (target?.notifications) target.notifications.forEach(item => item.read = true);
  saveUsers(users);
  updateNotifBadge();
  updateDMBadge();
}

function toggleLike(postId) {
  const me = currentUser();
  return getPostById(postId).then(async post => {
    if (!post) return null;
    post.likes ||= [];
    const index = post.likes.findIndex(name => String(name).toLowerCase() === String(me).toLowerCase());
    const liked = index < 0;
    if (liked) post.likes.push(me); else post.likes.splice(index, 1);
    await savePost(post);
    if (liked && post.user !== me) createNotification(post.user, 'like', `${me} menyukai postinganmu`, postId);
    return { liked, count: post.likes.length };
  });
}

function renderLikeButton(post) {
  const liked = post.likes?.some(name => String(name).toLowerCase() === String(currentUser()).toLowerCase());
  return `<button class="like-btn ${liked ? 'liked' : ''}" data-id="${post.id}" data-action="like">${ICONS.heart(liked)} <span class="like-count">${post.likes?.length || 0}</span></button>`;
}

let currentCommentPostId = null;
let replyTargetId = null;

function commentId() { return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

function normalizeCommentNode(node, parentId = null) {
  const normalized = {
    id: node.id || commentId(),
    parentId: node.parentId ?? parentId,
    user: node.user || 'user',
    text: node.text || '',
    created: node.created || Date.now(),
    replies: []
  };
  const children = Array.isArray(node.replies) ? node.replies : [];
  normalized.replies = children.map(child => normalizeCommentNode(child, normalized.id));
  return normalized;
}

function normalizeComments(post) {
  post.comments = Array.isArray(post.comments) ? post.comments.map(item => normalizeCommentNode(item, null)) : [];
  return post.comments;
}

function countCommentTree(nodes = []) {
  return nodes.reduce((sum, node) => sum + 1 + countCommentTree(node.replies || []), 0);
}

function findCommentById(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;
    const found = findCommentById(node.replies, id);
    if (found) return found;
  }
  return null;
}

function removeCommentById(nodes, id) {
  const index = nodes.findIndex(node => node.id === id);
  if (index >= 0) { nodes.splice(index, 1); return true; }
  return nodes.some(node => removeCommentById(node.replies || [], id));
}

async function openCommentPage(postId) {
  currentCommentPostId = postId;
  replyTargetId = null;
  document.getElementById('replyInfo')?.classList.add('hidden');
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('commentPage')?.classList.remove('hidden');
  const post = await getPostById(postId);
  const preview = document.getElementById('commentPostPreview');
  if (!preview) return;
  preview.innerHTML = post ? `
    <div class="comment-preview-head user-link" data-user="${escapeHtml(post.user)}">${avatarHtml(post.user, 38)}<div><b>@${escapeHtml(post.user)}</b><small>${timeAgo(post.created)}</small></div></div>
    ${post.mediaType === 'image' ? `<img src="${post.media}" alt="Postingan" loading="lazy" decoding="async">` : `<video controls preload="metadata" playsinline src="${post.media}"></video>`}
    <p>${escapeHtml(post.caption)}</p>` : '';
  await renderComments(postId);
}

function renderCommentNode(node, depth = 0, replyToUser = '') {
  const canDelete = String(node.user).toLowerCase() === String(currentUser()).toLowerCase();
  const level = depth > 0 ? 1 : 0;
  const replyTag = replyToUser ? `<div class="comment-reply-tag">↪ Membalas <b>@${escapeHtml(replyToUser)}</b></div>` : '';
  return `<div class="comment ${level ? 'comment-reply-row' : 'comment-root-row'}" data-comment-id="${node.id}" style="--reply-level:${level}">
    <div class="comment-main">
      ${avatarHtml(node.user, level ? 32 : 38)}
      <div class="comment-body">
        <div class="comment-author-row user-link" data-user="${escapeHtml(node.user)}"><b>@${escapeHtml(node.user)}</b><small>${timeAgo(node.created)}</small></div>
        ${replyTag}<p>${escapeHtml(node.text).replace(/\n/g, '<br>')}</p>
        <div class="comment-actions">
          <button class="ui-action-btn" type="button" data-action="reply-comment" data-id="${node.id}" data-user="${escapeHtml(node.user)}">↩ Balas</button>
          ${canDelete ? `<button class="ui-action-btn danger-soft" type="button" data-action="delete-comment" data-id="${node.id}">Hapus</button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

function flattenCommentReplies(nodes = [], depth = 0, parentUser = '') {
  const output = [];
  for (const node of nodes) {
    output.push({ node, depth, parentUser });
    if (node.replies?.length) output.push(...flattenCommentReplies(node.replies, depth + 1, node.user));
  }
  return output;
}

async function renderComments(postId) {
  const post = await getPostById(postId);
  const list = document.getElementById('commentList');
  if (!list) return;
  if (!post) { list.innerHTML = '<div class="empty-state">Postingan tidak ditemukan.</div>'; return; }
  normalizeComments(post);
  if (!post.comments.length) {
    list.innerHTML = '<div class="empty-state modern-empty"><strong>Belum ada komentar</strong><span>Jadilah yang pertama berkomentar.</span></div>';
    return;
  }
  // Semua balasan dirender sebagai baris sejajar dengan indentasi tetap.
  // Ini mencegah nested reply makin mengecil seperti pada versi sebelumnya.
  const rows = flattenCommentReplies(post.comments).map(({node, depth, parentUser}) => renderCommentNode(node, depth, parentUser)).join('');
  list.innerHTML = `<div class="comment-thread-list">${rows}</div>`;
  bindCommentEvents();
}

function bindCommentEvents() {
  document.querySelectorAll('[data-action="reply-comment"]').forEach(button => button.addEventListener('click', () => {
    replyTargetId = button.dataset.id;
    document.getElementById('replyInfo')?.classList.remove('hidden');
    const target = document.getElementById('replyToName');
    if (target) target.textContent = `Membalas @${button.dataset.user}`;
    document.getElementById('commentInput')?.focus();
  }));
  document.querySelectorAll('.comment-author-row[data-user]').forEach(element => element.addEventListener('click', () => openOtherProfile(element.dataset.user)));
  document.querySelectorAll('.comment-preview-head.user-link').forEach(element => element.addEventListener('click', () => openOtherProfile(element.dataset.user)));
  document.querySelectorAll('[data-action="delete-comment"]').forEach(button => button.addEventListener('click', async () => {
    if (!(await showConfirm('Hapus komentar ini beserta balasannya?'))) return;
    const post = await getPostById(currentCommentPostId);
    if (!post) return;
    const target = findCommentById(post.comments || [], button.dataset.id);
    if (!target || String(target.user).toLowerCase() !== String(currentUser()).toLowerCase()) return;
    if (typeof deleteOnlineComment === 'function') await deleteOnlineComment(button.dataset.id);
    else { normalizeComments(post); removeCommentById(post.comments, button.dataset.id); await savePost(post); }
    await renderComments(currentCommentPostId);
  }));
}

function renderCommentButton(post) {
  const count = countCommentTree(post.comments || []);
  return `<button class="ui-action-btn" data-id="${post.id}" data-action="comment">${ICONS.comment} <span>${count}</span></button>`;
}

document.getElementById('commentForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.getElementById('commentInput');
  const text = input?.value.trim();
  if (!text || currentCommentPostId == null) return;

  const formButton = event.currentTarget.querySelector('button[type="submit"]');
  if (formButton) formButton.disabled = true;
  try {
    const post = await getPostById(currentCommentPostId);
    if (!post) throw new Error('Postingan tidak ditemukan');
    if (typeof addOnlineComment === 'function') {
      await addOnlineComment(currentCommentPostId, text, replyTargetId || null);
    } else {
      normalizeComments(post);
      const node = { id: commentId(), parentId: replyTargetId || null, user: currentUser(), text, created: Date.now(), replies: [] };
      if (replyTargetId) {
        const parent = findCommentById(post.comments, replyTargetId);
        if (parent) parent.replies.push(node);
        else post.comments.push(node);
      } else post.comments.push(node);
      await savePost(post);
    }
    if (post.user !== currentUser()) await createNotification(post.user, 'comment', `${currentUser()} berkomentar di postinganmu`, post.id);
    input.value = '';
    replyTargetId = null;
    document.getElementById('replyInfo')?.classList.add('hidden');
    await renderComments(currentCommentPostId);
  } catch (error) {
    console.error('Komentar gagal:', error);
    showToast('Komentar gagal dikirim. Coba lagi.', 'error');
  } finally {
    if (formButton) formButton.disabled = false;
  }
});

document.getElementById('cancelReply')?.addEventListener('click', () => {
  replyTargetId = null;
  document.getElementById('replyInfo')?.classList.add('hidden');
});

document.getElementById('commentStickerBtn')?.addEventListener('click', () => document.getElementById('commentStickerTray')?.classList.toggle('hidden'));
document.querySelectorAll('[data-sticker]').forEach(button => button.addEventListener('click', () => {
  const input = document.getElementById('commentInput'); if (!input) return;
  input.value = `${input.value}${input.value ? ' ' : ''}${button.dataset.sticker}`; input.focus();
  document.getElementById('commentStickerTray')?.classList.add('hidden');
}));

document.getElementById('commentBack')?.addEventListener('click', () => {
  document.getElementById('commentPage')?.classList.add('hidden');
  showTab('tabPublic');
  currentCommentPostId = null;
  replyTargetId = null;
});
