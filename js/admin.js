/* =========================================================
   ADMIN — local moderation, bans, appeals, info drawer, favorites
   ========================================================= */

const NDOO_CONTACT_LINKS = Object.freeze({
  contact: 'https://wa.me/6282228032167',
  feedback: 'https://wa.me/6282228032167',
  report: 'https://wa.me/6282228032167',
  donate: 'https://wa.me/6282228032167'
});

function formatBanUntil(ts) {
  try { return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return '-'; }
}

function getBanDurationMs(value, unit) {
  const n = Math.max(1, Number(value) || 1);
  const map = { hour: 3600000, day: 86400000, month: 30 * 86400000, year: 365 * 86400000 };
  return n * (map[unit] || map.day);
}

async function banUser(username, value, unit, reason) {
  if (!isAdmin()) return false;
  await refreshOnlineProfiles();
  const target = onlineProfileByName(username);
  if (!target || String(target.id) === String((await getSupabaseSession())?.user?.id)) return false;
  const until = new Date(Date.now() + getBanDurationMs(value, unit)).toISOString();
  const { error } = await requireSupabase().rpc('admin_set_ban', { target_user: target.id, until_at: until, reason_text: reason?.trim() || 'Pelanggaran aturan komunitas.' });
  if (error) throw error;
  return true;
}

async function unbanUser(username) {
  if (!isAdmin()) return false;
  await refreshOnlineProfiles();
  const target = onlineProfileByName(username);
  if (!target) return false;
  const { error } = await requireSupabase().rpc('admin_unban', { target_user: target.id });
  if (error) throw error;
  return true;
}

async function renderAdminUsers() {
  const box = document.getElementById('adminUserList');
  if (!box) return;
  if (!isAdmin()) { box.innerHTML = '<div class="empty-state">Akses admin diperlukan.</div>'; return; }
  try {
    await refreshOnlineProfiles();
    const client = requireSupabase();
    const { data, error } = await client.from('profiles').select('id,username,bio,avatar_url,role,banned_until,ban_reason').order('username', { ascending: true });
    if (error) throw error;
    const users = data || [];
    box.innerHTML = users.map(user => {
      const until = user.banned_until ? new Date(user.banned_until).getTime() : 0;
      const ban = until > Date.now() ? { until, reason: user.ban_reason || 'Pelanggaran aturan komunitas.' } : null;
      const isSelf = String(user.id) === String(window.__NDOO_AUTH_USER_ID);
      return `<article class="admin-user-card" data-admin-user="${escapeHtml(user.username)}"><div class="admin-user-head">${avatarHtml(user.username,42)}<div><b>@${escapeHtml(user.username)}</b><small>${user.role === 'admin' ? 'Admin' : (ban ? `Diblokir sampai ${formatBanUntil(ban.until)}` : 'Aktif')}</small></div></div>${ban ? `<div class="ban-state"><b>Alasan:</b> ${escapeHtml(ban.reason)}<br><small>Berakhir: ${escapeHtml(formatBanUntil(ban.until))}</small></div>` : ''}<div class="admin-controls"><input type="number" min="1" value="1" data-ban-value aria-label="Durasi ban"><select data-ban-unit aria-label="Satuan durasi"><option value="hour">Jam</option><option value="day" selected>Hari</option><option value="month">Bulan</option><option value="year">Tahun</option></select><input type="text" data-ban-reason placeholder="Alasan pelanggaran" value="${ban ? escapeHtml(ban.reason) : ''}"><div class="admin-control-actions"><button type="button" class="ui-action-btn admin-ban-btn" ${isSelf || user.role === 'admin' ? 'disabled' : ''}>Ban</button><button type="button" class="ui-action-btn admin-unban-btn" ${isSelf ? 'disabled' : ''}>Unban</button></div></div></article>`;
    }).join('');
    box.querySelectorAll('.admin-user-card').forEach(card => {
      const username = card.dataset.adminUser;
      card.querySelector('.admin-ban-btn')?.addEventListener('click', async () => {
        const value = card.querySelector('[data-ban-value]')?.value;
        const unit = card.querySelector('[data-ban-unit]')?.value;
        const reason = card.querySelector('[data-ban-reason]')?.value;
        if (!reason?.trim()) { showToast('Isi alasan pelanggaran terlebih dahulu.', 'error'); return; }
        try { if (await banUser(username, value, unit, reason)) { showToast(`@${username} diblokir.`, 'success'); await renderAdminUsers(); } }
        catch (error) { console.error(error); showToast(error?.message || 'Ban gagal.', 'error'); }
      });
      card.querySelector('.admin-unban-btn')?.addEventListener('click', async () => {
        try { if (await unbanUser(username)) { showToast(`@${username} sudah di-unban.`, 'success'); await renderAdminUsers(); } }
        catch (error) { console.error(error); showToast(error?.message || 'Unban gagal.', 'error'); }
      });
    });
  } catch (error) { console.error('Admin users:', error); box.innerHTML = `<div class="empty-state">Data admin gagal dimuat: ${escapeHtml(error?.message || 'error')}</div>`; }
}

function openAdminPage() {
  if (!isAdmin()) { showToast('Menu admin hanya untuk admin.', 'error'); return; }
  closeInfoDrawer();
  closeTransientPages();
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('adminPage')?.classList.remove('hidden');
  renderAdminUsers();
}

function renderFavoritePage() {
  const box = document.getElementById('favoriteList');
  if (!box) return;
  getAllPosts().then(posts => {
    const ids = getSavedIds();
    const list = posts.filter(post => ids.includes(post.id)).sort((a,b) => b.created - a.created);
    box.innerHTML = list.length ? list.map(post => renderPost(post, currentUser())).join('') : '<div class="empty-state modern-empty"><strong>Belum ada favorit</strong><span>Simpan postingan dari menu titik tiga atau tombol Simpan.</span></div>';
    if (list.length) bindPostEvents(box);
  }).catch(error => { console.error(error); box.innerHTML = '<div class="empty-state">Favorit gagal dimuat.</div>'; });
}

function openFavoritePage() {
  closeInfoDrawer(); closeTransientPages();
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById('favoritePage')?.classList.remove('hidden');
  renderFavoritePage();
}

function openInfoDrawer() {
  const drawer = document.getElementById('infoDrawer'); const overlay = document.getElementById('infoDrawerOverlay');
  if (!drawer || !overlay) return;
  drawer.classList.add('open'); overlay.classList.remove('hidden'); drawer.setAttribute('aria-hidden','false');
  document.getElementById('adminPanelBtn')?.classList.toggle('hidden', !isAdmin());
}
function closeInfoDrawer() {
  document.getElementById('infoDrawer')?.classList.remove('open');
  document.getElementById('infoDrawerOverlay')?.classList.add('hidden');
  document.getElementById('infoDrawer')?.setAttribute('aria-hidden','true');
}

function runContactAction(type) {
  const url = NDOO_CONTACT_LINKS[type];
  if (url) window.open(url, '_blank', 'noopener');
  else showToast('Tautan admin belum diatur. Isi NDOO_CONTACT_LINKS di admin.js terlebih dahulu.', 'info');
}

function initAdminUI() {
  document.getElementById('infoBtn')?.addEventListener('click', openInfoDrawer);
  document.getElementById('infoClose')?.addEventListener('click', closeInfoDrawer);
  document.getElementById('infoDrawerOverlay')?.addEventListener('click', closeInfoDrawer);
  document.getElementById('favoriteBtn')?.addEventListener('click', openFavoritePage);
  document.getElementById('adminPanelBtn')?.addEventListener('click', openAdminPage);
  document.getElementById('favoriteBack')?.addEventListener('click', () => { document.getElementById('favoritePage')?.classList.add('hidden'); showTab('tabPublic'); });
  document.getElementById('adminBack')?.addEventListener('click', () => { document.getElementById('adminPage')?.classList.add('hidden'); showTab('tabPublic'); });
  document.querySelectorAll('[data-contact-action]').forEach(btn => btn.addEventListener('click', () => runContactAction(btn.dataset.contactAction)));

  let startX = null;
  document.addEventListener('touchstart', e => { if (e.touches?.[0] && e.touches[0].clientX > window.innerWidth - 28) startX = e.touches[0].clientX; }, {passive:true});
  document.addEventListener('touchend', e => { if (startX != null && e.changedTouches?.[0] && startX - e.changedTouches[0].clientX > 70) openInfoDrawer(); startX = null; }, {passive:true});
}

initAdminUI();
