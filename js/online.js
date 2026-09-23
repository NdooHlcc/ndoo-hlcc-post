/* =========================================================
   ONLINE DATA — Supabase posts + likes
   V3.7 foundation: feed data is shared across users.
   ========================================================= */

function requireSupabase() {
  return initSupabase();
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) throw new Error('Media tidak valid.');
  const mime = (parts[0].match(/data:([^;]+);base64/i) || [])[1] || 'application/octet-stream';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function mediaExtension(mediaType, dataUrl) {
  const mime = String(dataUrl || '').slice(5).split(';')[0].toLowerCase();
  const map = { 'image/jpeg':'jpg', 'image/jpg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif', 'video/mp4':'mp4', 'video/webm':'webm', 'video/quicktime':'mov' };
  return map[mime] || (mediaType === 'video' ? 'mp4' : 'jpg');
}

async function uploadPostMedia(media, mediaType) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi Supabase tidak ditemukan. Silakan login ulang.');
  const client = requireSupabase();
  const isFile = media instanceof Blob;
  const ext = isFile
    ? mediaExtension(mediaType, `data:${media.type || ''};base64,`)
    : mediaExtension(mediaType, media);
  const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
  const blob = isFile ? media : dataUrlToBlob(media);
  const { error } = await client.storage.from('posts').upload(path, blob, {
    contentType: blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
    upsert: false,
    cacheControl: '31536000'
  });
  if (error) {
    const detail = new Error(`Upload media post gagal: ${error.message || 'Storage error'}`);
    detail.name = error.name || 'StorageError';
    detail.cause = error;
    throw detail;
  }
  const { data } = client.storage.from('posts').getPublicUrl(path);
  return data.publicUrl;
}

async function createOnlinePost({ caption, media, mediaFile, mediaType }) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const mediaUrl = await uploadPostMedia(mediaFile || media, mediaType);
  const { data, error } = await requireSupabase().from('posts').insert({
    user_id: session.user.id,
    content: caption || '',
    media_url: mediaUrl,
    media_type: mediaType
  }).select('id').single();
  if (error) throw error;
  return data;
}

async function savePost(post) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const { error } = await requireSupabase().from('posts')
    .update({ content: post.caption || '' })
    .eq('id', Number(post.id))
    .eq('user_id', session.user.id);
  if (error) throw error;
}

async function deletePost(id) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const { error } = await requireSupabase().from('posts')
    .delete().eq('id', Number(id)).eq('user_id', session.user.id);
  if (error) throw error;
}

async function toggleLike(postId) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const client = requireSupabase();
  const { data: existing, error: readError } = await client
    .from('likes').select('post_id,user_id').eq('post_id', Number(postId)).eq('user_id', session.user.id).maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await client.from('likes').delete().eq('post_id', Number(postId)).eq('user_id', session.user.id);
    if (error) throw error;
    return { liked: false };
  }

  const { error } = await client.from('likes').insert({ post_id: Number(postId), user_id: session.user.id });
  if (error) throw error;
  return { liked: true };
}

function renderOnlineLikeButton(post) {
  const meIdPromise = getSupabaseSession();
  return meIdPromise.then(session => {
    const liked = !!post.likes?.includes(session?.user?.id);
    return `<button class="like-btn ${liked ? 'liked' : ''}" data-id="${post.id}" data-action="like">${ICONS.heart(liked)} <span class="like-count">${post.likes?.length || 0}</span></button>`;
  });
}


/* =========================================================
   V3.8 — ONLINE SOCIAL LAYER
   Comments, follows, favorites, notifications, DMs,
   profiles, stories. Local IndexedDB remains only as a
   compatibility fallback for features not yet migrated.
   ========================================================= */

let onlineFavoriteIds = new Set();
let onlineProfileCache = new Map();

async function refreshOnlineProfiles() {
  const client = requireSupabase();
  const { data, error } = await client.from('profiles')
    .select('id,uid,username,bio,avatar_url,role,banned_until,ban_reason,created_at')
    .order('username', { ascending: true });
  if (error) throw error;
  const profiles = data || [];
  onlineProfileCache = new Map(profiles.map(p => [String(p.username).toLowerCase(), p]));
  const users = getUsers();
  for (const profile of profiles) {
    const i = users.findIndex(u => String(u.username).toLowerCase() === String(profile.username).toLowerCase());
    const old = i >= 0 ? users[i] : {};
    const shadow = {
      ...old,
      username: profile.username,
      uid: profile.uid,
      bio: profile.bio || '',
      avatar: profile.avatar_url || '',
      role: profile.role || 'user',
      bannedUntil: profile.banned_until ? new Date(profile.banned_until).getTime() : 0,
      banReason: profile.ban_reason || '',
      followers: Array.isArray(old.followers) ? old.followers : [],
      following: Array.isArray(old.following) ? old.following : [],
      notifications: Array.isArray(old.notifications) ? old.notifications : [],
      password: ''
    };
    if (i >= 0) users[i] = shadow; else users.push(shadow);
  }
  saveUsers(users);
  return profiles;
}

function onlineProfileByName(name) {
  return onlineProfileCache.get(String(name || '').toLowerCase()) || null;
}

async function syncFollowShadows() {
  const session = await getSupabaseSession();
  if (!session?.user) return;
  const client = requireSupabase();
  const { data, error } = await client.from('follows').select('follower_id,following_id');
  if (error) throw error;
  const profiles = await refreshOnlineProfiles();
  const byId = new Map(profiles.map(p => [p.id, p]));
  const users = getUsers();
  users.forEach(u => { u.followers = []; u.following = []; });
  (data || []).forEach(row => {
    const follower = byId.get(row.follower_id);
    const following = byId.get(row.following_id);
    if (!follower || !following) return;
    const fu = users.find(u => u.username.toLowerCase() === follower.username.toLowerCase());
    const tu = users.find(u => u.username.toLowerCase() === following.username.toLowerCase());
    if (fu && !fu.following.includes(following.username)) fu.following.push(following.username);
    if (tu && !tu.followers.includes(follower.username)) tu.followers.push(follower.username);
  });
  saveUsers(users);
}

async function loadOnlineFavorites() {
  const session = await getSupabaseSession();
  if (!session?.user) return;
  const { data, error } = await requireSupabase().from('favorites')
    .select('post_id').eq('user_id', session.user.id);
  if (error) throw error;
  onlineFavoriteIds = new Set((data || []).map(x => Number(x.post_id)));
}

async function loadOnlineComments(postIds) {
  if (!postIds.length) return [];
  const client = requireSupabase();
  const { data, error } = await client.from('comments')
    .select('id,post_id,user_id,parent_id,content,created_at')
    .in('post_id', postIds).order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data || [];
  const ids = [...new Set(rows.map(r => r.user_id))];
  let profiles = [];
  if (ids.length) {
    const result = await client.from('profiles').select('id,username,avatar_url,bio').in('id', ids);
    if (result.error) throw result.error;
    profiles = result.data || [];
  }
  const byId = new Map(profiles.map(p => [p.id, p]));
  const grouped = new Map();
  rows.forEach(r => {
    const profile = byId.get(r.user_id);
    const node = {
      id: String(r.id), parentId: r.parent_id == null ? null : String(r.parent_id),
      user: profile?.username || 'user', text: r.content || '',
      created: new Date(r.created_at).getTime(), replies: []
    };
    if (!grouped.has(r.post_id)) grouped.set(r.post_id, []);
    grouped.get(r.post_id).push(node);
  });
  grouped.forEach(nodes => {
    const map = new Map(nodes.map(n => [String(n.id), n]));
    const roots = [];
    nodes.forEach(n => {
      const parent = n.parentId ? map.get(String(n.parentId)) : null;
      if (parent) parent.replies.push(n); else roots.push(n);
    });
    grouped.set('__tree__' + String(nodes[0]?.postId || ''), roots);
  });
  return { rows, grouped, profilesById: byId };
}

async function getAllPosts() {
  const client = requireSupabase();
  const { data, error } = await client.from('posts')
    .select('id,user_id,content,media_url,media_type,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const posts = data || [];
  const ids = posts.map(p => Number(p.id));
  let likes = [], comments = [], favorites = [];
  if (ids.length) {
    const [lr, cr, fr] = await Promise.all([
      client.from('likes').select('post_id,user_id').in('post_id', ids),
      client.from('comments').select('id,post_id,user_id,parent_id,content,created_at').in('post_id', ids).order('created_at', { ascending: true }),
      client.from('favorites').select('post_id,user_id').in('post_id', ids)
    ]);
    if (lr.error) throw lr.error;
    if (cr.error) throw cr.error;
    if (fr.error) throw fr.error;
    likes = lr.data || []; comments = cr.data || []; favorites = fr.data || [];
  }
  const userIds = [...new Set([...comments.map(x => x.user_id), ...posts.map(x => x.user_id)])];
  const profileRows = userIds.length
    ? await client.from('profiles').select('id,username,uid,avatar_url,bio,role,banned_until,ban_reason').in('id', userIds)
    : { data: [], error: null };
  if (profileRows.error) throw profileRows.error;
  const profileById = new Map((profileRows.data || []).map(p => [p.id, p]));
  const likeMap = new Map(), nodeMap = new Map(), rootMap = new Map();
  likes.forEach(x => { if (!likeMap.has(x.post_id)) likeMap.set(x.post_id, []); likeMap.get(x.post_id).push(x.user_id); });
  comments.forEach(r => {
    const profile = profileById.get(r.user_id);
    const node = { id: String(r.id), parentId: r.parent_id == null ? null : String(r.parent_id), user: profile?.username || 'user', text: r.content || '', created: new Date(r.created_at).getTime(), replies: [] };
    nodeMap.set(node.id, node);
    if (!rootMap.has(r.post_id)) rootMap.set(r.post_id, []);
  });
  comments.forEach(r => {
    const node = nodeMap.get(String(r.id));
    const parent = r.parent_id == null ? null : nodeMap.get(String(r.parent_id));
    if (parent) parent.replies.push(node); else rootMap.get(r.post_id).push(node);
  });
  const session = await getSupabaseSession().catch(() => null);
  onlineFavoriteIds = new Set(favorites.filter(x => x.user_id === session?.user?.id).map(x => Number(x.post_id)));
  const postUserIds = [...new Set(posts.map(p => p.user_id))];
  if (postUserIds.some(id => !profileById.has(id))) {
    const extra = await client.from('profiles').select('id,username,uid,avatar_url,bio,role,banned_until,ban_reason').in('id', postUserIds);
    if (!extra.error) (extra.data || []).forEach(p => profileById.set(p.id, p));
  }
  await refreshOnlineProfiles().catch(() => {});
  return posts.map(item => {
    const profile = profileById.get(item.user_id) || null;
    return {
      id: item.id, user: profile?.username || 'user', userId: item.user_id,
      caption: item.content || '', media: item.media_url || '', mediaType: item.media_type || 'image',
      isVip: false, likes: likeMap.get(item.id) || [], comments: rootMap.get(item.id) || [],
      created: new Date(item.created_at).getTime(), profile, online: true,
      saved: onlineFavoriteIds.has(Number(item.id))
    };
  });
}

async function getPostById(id) {
  const posts = await getAllPosts();
  return posts.find(post => Number(post.id) === Number(id)) || null;
}

async function addOnlineComment(postId, content, parentId = null) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const { data, error } = await requireSupabase().from('comments').insert({
    post_id: Number(postId), user_id: session.user.id, parent_id: parentId ? Number(parentId) : null, content
  }).select('id').single();
  if (error) throw error;
  return data;
}

async function deleteOnlineComment(commentId) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const { error } = await requireSupabase().from('comments').delete().eq('id', Number(commentId)).eq('user_id', session.user.id);
  if (error) throw error;
}

async function toggleFollowOnlineData(targetUser) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const target = onlineProfileByName(targetUser) || getUserByName(targetUser);
  if (!target || target.id === session.user.id) return;
  const client = requireSupabase();
  const { data: existing, error: readError } = await client.from('follows').select('follower_id,following_id')
    .eq('follower_id', session.user.id).eq('following_id', target.id).maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await client.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', target.id);
    if (error) throw error;
  } else {
    const { error } = await client.from('follows').insert({ follower_id: session.user.id, following_id: target.id });
    if (error) throw error;
    await createNotification(target.username, 'follow', `${currentUser()} mulai mengikuti kamu`, null);
  }
  await syncFollowShadows();
  await openOtherProfile(target.username);
}

async function savePostId(id) {
  const session = await getSupabaseSession();
  if (!session?.user) return;
  if (onlineFavoriteIds.has(Number(id))) return;
  const { error } = await requireSupabase().from('favorites').insert({ post_id: Number(id), user_id: session.user.id });
  if (error) throw error;
  onlineFavoriteIds.add(Number(id));
}

async function unsavePostId(id) {
  const session = await getSupabaseSession();
  if (!session?.user) return;
  const { error } = await requireSupabase().from('favorites').delete().eq('post_id', Number(id)).eq('user_id', session.user.id);
  if (error) throw error;
  onlineFavoriteIds.delete(Number(id));
}

function isSaved(id) { return onlineFavoriteIds.has(Number(id)); }
function getSavedIds() { return [...onlineFavoriteIds]; }

async function createNotification(toUser, type, text, postId = null) {
  const session = await getSupabaseSession();
  if (!session?.user) return;
  const target = onlineProfileByName(toUser) || getUserByName(toUser);
  if (!target?.id || target.id === session.user.id) return;
  const { error } = await requireSupabase().from('notifications').insert({
    user_id: target.id, type, actor_id: session.user.id, post_id: postId ? Number(postId) : null, message: text, read: false
  });
  if (error) console.warn('Notifikasi online:', error);
  updateNotifBadge(); updateDMBadge();
}

async function loadNotifications() {
  const session = await getSupabaseSession();
  const list = document.getElementById('notifList');
  if (!session?.user || !list) return;
  const client = requireSupabase();
  const { data, error } = await client.from('notifications').select('id,type,actor_id,post_id,message,read,created_at')
    .eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const rows = data || [];
  const actorIds = [...new Set(rows.map(x => x.actor_id).filter(Boolean))];
  let actors = [];
  if (actorIds.length) {
    const r = await client.from('profiles').select('id,username,avatar_url').in('id', actorIds);
    if (!r.error) actors = r.data || [];
  }
  const byId = new Map(actors.map(a => [a.id, a]));
  list.innerHTML = rows.length ? rows.map(item => {
    const actor = byId.get(item.actor_id);
    return `<div class="notif ${item.read ? '' : 'unread'}">${actor ? avatarHtml(actor.username,36) : ''}<div class="notif-body"><p>${escapeHtml(item.message || '')}</p><small>${timeAgo(new Date(item.created_at).getTime())}</small></div></div>`;
  }).join('') : '<p class="empty-state">Belum ada notifikasi.</p>';
  if (rows.length) await client.from('notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false);
  updateNotifBadge(); updateDMBadge();
}

async function updateNotifBadge() {
  const session = await getSupabaseSession().catch(() => null);
  const badge = document.getElementById('notifCount');
  if (!badge || !session?.user) return;
  const { count } = await requireSupabase().from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id).eq('read', false);
  const value = Number(count || 0);
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.classList.toggle('hidden', value === 0);
}

async function updateDMBadge() {
  const session = await getSupabaseSession().catch(() => null);
  const badge = document.getElementById('dmCount');
  if (!badge || !session?.user) return;
  const { data, error } = await requireSupabase().from('messages').select('sender_id')
    .eq('receiver_id', session.user.id).eq('read', false);
  if (error) { console.warn('DM badge:', error); return; }
  const uniqueSenders = new Set((data || []).map(row => row.sender_id));
  const value = uniqueSenders.size;
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.classList.toggle('hidden', value === 0);
}

async function uploadDMImage(file) {
  const session = await getSupabaseSession();
  if (!session?.user || !file) throw new Error('Sesi login atau file tidak valid.');
  if (!/^image\//i.test(file.type)) throw new Error('Chat hanya menerima foto.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Ukuran foto chat maksimal 8 MB.');
  const ext = mediaExtension('image', `data:${file.type};base64,`);
  const path = `messages/${session.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await requireSupabase().storage.from('posts').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(`Upload foto chat gagal: ${error.message}`);
  return requireSupabase().storage.from('posts').getPublicUrl(path).data.publicUrl;
}

async function sendDM(to, text = '', replyTo = null, mediaFile = null) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi login online tidak valid.');
  const target = onlineProfileByName(to) || getUserByName(to);
  if (!target?.id) throw new Error('User tidak ditemukan.');
  let mediaUrl = '';
  let mediaType = '';
  if (mediaFile) { mediaUrl = await uploadDMImage(mediaFile); mediaType = mediaFile.type; }
  if (!String(text || '').trim() && !mediaUrl) throw new Error('Pesan kosong.');
  const payload = { text: String(text || '').trim(), replyTo, mediaUrl, mediaType };
  const { data, error } = await requireSupabase().from('messages').insert({
    sender_id: session.user.id, receiver_id: target.id, content: JSON.stringify(payload)
  }).select('id').single();
  if (error) throw error;
  await createNotification(target.username, 'dm', `${currentUser()} mengirim pesan`, null);
  return data;
}

function decodeOnlineMessage(row, profileMap) {
  let payload = { text: row.content || '', replyTo: null, mediaUrl: '', mediaType: '' };
  try { const parsed = JSON.parse(row.content); if (parsed && typeof parsed === 'object') payload = { ...payload, ...parsed }; } catch {}
  return {
    id: Number(row.id), from: profileMap.get(row.sender_id)?.username || 'user',
    to: profileMap.get(row.receiver_id)?.username || 'user', text: payload.text || '',
    mediaUrl: payload.mediaUrl || '', mediaType: payload.mediaType || '',
    replyTo: payload.replyTo || null, created: new Date(row.created_at).getTime(),
    senderId: row.sender_id, receiverId: row.receiver_id, read: !!row.read
  };
}

async function getAllOnlineMessages() {
  const session = await getSupabaseSession();
  if (!session?.user) return [];
  const client = requireSupabase();
  const { data, error } = await client.from('messages').select('id,sender_id,receiver_id,content,read,created_at')
    .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`).order('created_at', { ascending: true });
  if (error) throw error;
  const ids = [...new Set((data || []).flatMap(x => [x.sender_id, x.receiver_id]))];
  const r = ids.length ? await client.from('profiles').select('id,username,avatar_url,bio,role,banned_until,ban_reason').in('id', ids) : { data: [], error: null };
  if (r.error) throw r.error;
  const map = new Map((r.data || []).map(p => [p.id, p]));
  return (data || []).map(row => decodeOnlineMessage(row, map));
}

async function getConversations() {
  const all = await getAllOnlineMessages();
  const meId = (await getSupabaseSession())?.user?.id;
  const map = new Map();
  all.forEach(message => {
    const partnerId = message.senderId === meId ? message.receiverId : message.senderId;
    const partner = message.senderId === meId ? message.to : message.from;
    if (!map.has(partnerId) || message.created > map.get(partnerId).last.created) map.set(partnerId, { partner, last: message });
  });
  return [...map.values()].sort((a,b) => b.last.created - a.last.created);
}

async function getMessagesWith(partner) {
  const all = await getAllOnlineMessages();
  const me = String(currentUser()).toLowerCase();
  const p = String(partner).toLowerCase();
  return all.filter(m => (String(m.from).toLowerCase() === me && String(m.to).toLowerCase() === p) || (String(m.to).toLowerCase() === me && String(m.from).toLowerCase() === p));
}

async function markDMRead(partner) {
  const session = await getSupabaseSession(); if (!session?.user) return;
  const target = onlineProfileByName(partner) || getUserByName(partner); if (!target?.id) return;
  await requireSupabase().from('messages').update({ read: true })
    .eq('receiver_id', session.user.id).eq('sender_id', target.id).eq('read', false);
  await updateDMBadge();
}

let onlineSyncTimer = null;
let onlineSyncChannel = null;
async function initOnlineSync() {
  if (onlineSyncTimer) clearInterval(onlineSyncTimer);
  onlineSyncTimer = setInterval(async () => {
    if (document.hidden || !currentUser()) return;
    try {
      await updateDMBadge();
      await updateNotifBadge();
      await syncFollowShadows();
      if (currentDMPartner) await renderDMMessagesOnline();
      if (document.getElementById('tabDM') && !document.getElementById('tabDM').classList.contains('hidden')) await loadDMListOnline();
    } catch (error) { console.warn('Online sync:', error); }
  }, 2500);
  try {
    const client = requireSupabase();
    onlineSyncChannel?.unsubscribe?.();
    onlineSyncChannel = client.channel('ndoo-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async () => {
        await updateDMBadge();
        if (currentDMPartner) await renderDMMessagesOnline();
        await loadDMListOnline().catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, async () => { await syncFollowShadows(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, async () => {
        const active = document.querySelector('.nav-btn.active')?.dataset.tab;
        if (active === 'tabPublic') await loadFeed().catch(() => {});
        if (active === 'tabProfile') await loadMyProfile().catch(() => {});
      })
      .subscribe();
  } catch (error) { console.warn('Realtime channel:', error); }
}

async function loadDMListOnline() {
  const list = document.getElementById('dmList');
  if (!list) return;
  const conversations = await getConversations();
  if (!conversations.length) { list.innerHTML = '<div class="empty-state modern-empty"><strong>Belum ada percakapan</strong><span>Cari user lalu mulai ngobrol.</span></div>'; return; }
  const all = await getAllOnlineMessages();
  const session = await getSupabaseSession();
  const unreadByPartner = new Map();
  (all || []).forEach(m => {
    if (m.receiverId === session?.user?.id && !m.read) unreadByPartner.set(m.senderId, (unreadByPartner.get(m.senderId) || 0) + 1);
  });
  list.innerHTML = conversations.map(item => {
    const partner = item.partner;
    const unread = unreadByPartner.get(item.last.senderId === session?.user?.id ? item.last.receiverId : item.last.senderId) || 0;
    const preview = item.last.mediaUrl ? '📷 Foto' : (item.last.replyTo ? `↩ ${item.last.text}` : item.last.text);
    return `<div class="dm-item" data-user="${escapeHtml(partner)}">${avatarHtml(partner,46)}<div class="dm-item-body"><b>@${escapeHtml(partner)}</b><p>${escapeHtml(preview).substring(0,48)}</p><small>${timeAgo(item.last.created)}</small></div>${unread ? `<span class="dm-conv-badge">${unread > 99 ? '99+' : unread}</span>` : ''}<span class="dm-chevron">›</span></div>`;
  }).join('');
  list.querySelectorAll('.dm-item').forEach(item => item.addEventListener('click', () => openDMChatOnline(item.dataset.user)));
}

async function openDMChatOnline(partner) {
  const target = onlineProfileByName(partner) || getUserByName(partner);
  if (!target) { showToast('User tidak ditemukan.', 'error'); return; }
  currentDMPartner = target.username;
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('dmChatPage')?.classList.remove('hidden');
  const me = getMe();
  const user = target;
  const avatar = document.getElementById('dmWithAvatar');
  if (avatar) { avatar.textContent = user.avatar ? '' : (user.username?.[0] || '?').toUpperCase(); avatar.style.backgroundImage = user.avatar ? `url("${user.avatar}")` : ''; }
  document.getElementById('dmWith').textContent = `@${user.username}`;
  document.getElementById('dmWithBio').textContent = user.bio || 'Siap ngobrol ✨';
  clearDmReply();
  await markDMRead(user.username);
  await renderDMMessagesOnline();
}

async function renderDMMessagesOnline() {
  if (!currentDMPartner) return;
  const messages = await getMessagesWith(currentDMPartner);
  const box = document.getElementById('dmMessages');
  const meId = (await getSupabaseSession())?.user?.id;
  if (!box) return;
  box.innerHTML = messages.map(message => {
    const mine = message.senderId === meId;
    const reply = message.replyTo;
    const tick = mine ? (message.read ? '✓✓' : '✓') : '';
    const media = message.mediaUrl ? `<button type="button" class="dm-photo-btn" data-photo="${escapeHtml(message.mediaUrl)}"><img class="dm-photo" src="${escapeHtml(message.mediaUrl)}" alt="Foto pesan" loading="lazy"></button>` : '';
    return `<div class="dm-msg-row ${mine ? 'mine' : ''}">${!mine ? avatarHtml(message.from,28) : ''}<div class="dm-msg ${mine ? 'mine' : ''}">${reply ? `<div class="dm-reply-quote">↩ ${escapeHtml(reply.from || '')}<br>${escapeHtml(reply.text || 'Foto')}</div>` : ''}${media}${message.text ? `<p>${escapeHtml(message.text)}</p>` : ''}<small>${new Date(message.created).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} ${mine ? `<span class="dm-ticks ${message.read ? 'read' : ''}">${tick}</span>` : ''}</small></div></div>`;
  }).join('') || '<div class="empty-state modern-empty"><strong>Belum ada pesan</strong><span>Mulai percakapan sekarang.</span></div>';
  box.querySelectorAll('.dm-photo-btn').forEach(btn => btn.addEventListener('click', () => openDMPhoto(btn.dataset.photo)));
  box.querySelectorAll('.dm-msg').forEach(el => {
    let startX = null;
    el.addEventListener('touchstart', e => { startX = e.touches?.[0]?.clientX ?? null; }, {passive:true});
    el.addEventListener('touchend', e => {
      if (startX == null || !e.changedTouches?.[0]) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (dx > 55) {
        const row = el.closest('.dm-msg-row');
        const idx = [...box.querySelectorAll('.dm-msg-row')].indexOf(row);
        const msg = messages[idx];
        if (msg) setDmReply({ id: msg.id, from: msg.from, text: msg.text || 'Foto', mediaUrl: msg.mediaUrl });
      }
      startX = null;
    }, {passive:true});
  });
  box.scrollTop = box.scrollHeight;
}

function openDMPhoto(url) {
  let modal = document.getElementById('dmPhotoViewer');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'dmPhotoViewer'; modal.className = 'dm-photo-viewer';
    modal.innerHTML = `<button type="button" class="dm-photo-close">×</button><img id="dmPhotoViewerImg" alt="Foto pesan"><a id="dmPhotoDownload" class="ui-action-btn" download>Simpan ke galeri</a>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal || e.target.classList.contains('dm-photo-close')) modal.classList.remove('open'); });
  }
  document.getElementById('dmPhotoViewerImg').src = url;
  const download = document.getElementById('dmPhotoDownload'); download.href = url; download.setAttribute('download','ndoo-chat-photo');
  modal.classList.add('open');
}

async function loadOnlineStories() {
  const client = requireSupabase();
  const { data, error } = await client.from('stories')
    .select('id,user_id,media_url,media_type,caption,created_at').order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data || [];
  const ids = [...new Set(rows.map(x => x.user_id))];
  const r = ids.length ? await client.from('profiles').select('id,username,avatar_url').in('id', ids) : { data: [] };
  if (r.error) throw r.error;
  const map = new Map((r.data || []).map(p => [p.id, p]));
  return rows.map(x => ({ id: x.id, user: map.get(x.user_id)?.username || 'user', userId: x.user_id, media: x.media_url, mediaType: x.media_type, caption: x.caption || '', created: new Date(x.created_at).getTime() }));
}

async function uploadStoryMedia(media, mediaType) {
  const session = await getSupabaseSession();
  if (!session?.user) throw new Error('Sesi Supabase tidak ditemukan. Silakan login ulang.');
  const client = requireSupabase();
  const isFile = media instanceof Blob;
  const ext = isFile
    ? mediaExtension(mediaType, `data:${media.type || ''};base64,`)
    : mediaExtension(mediaType, media);
  const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
  const blob = isFile ? media : dataUrlToBlob(media);
  const { error } = await client.storage.from('stories').upload(path, blob, {
    contentType: blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
    upsert: false,
    cacheControl: '31536000'
  });
  if (error) {
    const detail = new Error(`Upload media story gagal: ${error.message || 'Storage error'}`);
    detail.name = error.name || 'StorageError';
    detail.cause = error;
    throw detail;
  }
  return client.storage.from('stories').getPublicUrl(path).data.publicUrl;
}

async function saveStory(story) {
  try {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sesi login online tidak valid.');
    const url = await uploadStoryMedia(story.mediaFile || story.media, story.mediaType);
    const { error } = await requireSupabase().from('stories').insert({ user_id: session.user.id, media_url: url, media_type: story.mediaType, caption: story.caption || '' });
    if (error) throw error;
  } catch (error) {
    if (/relation .*stories.*does not exist/i.test(String(error?.message || ''))) return dbTransaction(NDOO_CONFIG.STORE_STORIES, 'readwrite', store => store.add(story));
    throw error;
  }
}

async function getActiveStories() {
  try {
    const rows = await loadOnlineStories();
    const cutoff = Date.now() - NDOO_CONFIG.STORY_TTL;
    return rows.filter(x => x.created >= cutoff);
  } catch (error) {
    console.warn('Story online belum siap, fallback lokal:', error);
    return dbRequest(NDOO_CONFIG.STORE_STORIES, 'readonly', store => store.getAll()).then(rows => (rows || []).filter(x => Date.now() - x.created < NDOO_CONFIG.STORY_TTL));
  }
}

async function getStoriesByUser(username) {
  const stories = await getActiveStories();
  return stories.filter(s => String(s.user).toLowerCase() === String(username).toLowerCase()).sort((a,b) => a.created-b.created);
}

async function syncOnlineProfileToLocal() {
  const profile = await getOnlineProfile();
  if (profile) syncLocalShadow(profile);
  await refreshOnlineProfiles().catch(() => {});
  await syncFollowShadows().catch(() => {});
  await initOnlineSync().catch(() => {});
  return profile;
}
