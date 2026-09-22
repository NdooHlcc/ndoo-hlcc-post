/* =========================================================
   SETTINGS — profile, theme, export/import, logout
   ========================================================= */

let newAvatarData = null;

function openSettings() {
  const me = getMe();
  if (!me) return;
  document.getElementById('settingsPage')?.classList.remove('hidden');
  document.getElementById('editBio').value = me.bio || '';
  newAvatarData = null;
  setProfileAvatar(document.getElementById('editAvatarPreview'), me);
  const theme = localStorage.getItem(NDOO_CONFIG.LS_THEME) || 'dark';
  document.getElementById('themeDark').classList.toggle('active', theme === 'dark');
  document.getElementById('themeLight').classList.toggle('active', theme === 'light');
}

function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const max = 768;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar')); };
    img.src = url;
  });
}

function initSettings() {
  document.getElementById('settingsBtn')?.addEventListener('click', openSettings);
  document.getElementById('settingsBack')?.addEventListener('click', () => document.getElementById('settingsPage')?.classList.add('hidden'));

  document.getElementById('editAvatarFile')?.addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > NDOO_CONFIG.MAX_AVATAR) { showToast('Foto profil harus berupa gambar maksimal 3MB.', 'error'); return; }
    try {
      newAvatarData = await compressAvatar(file);
      const preview = document.getElementById('editAvatarPreview');
      preview.style.backgroundImage = `url(${newAvatarData})`;
      preview.textContent = '';
    } catch { showToast('Gagal membaca foto profil.', 'error'); }
  });

  document.getElementById('saveProfile')?.addEventListener('click', async () => {
    try {
      const session = await getSupabaseSession();
      if (!session?.user) throw new Error('Sesi online tidak ditemukan.');
      const bio = document.getElementById('editBio').value.trim().slice(0, 160);
      let avatarUrl = getMe()?.avatar || '';
      if (newAvatarData) {
        const blob = dataUrlToBlob(newAvatarData);
        const path = `${session.user.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await requireSupabase().storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
        if (error) throw error;
        avatarUrl = requireSupabase().storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }
      const { data: profile, error } = await requireSupabase().from('profiles').update({ bio, avatar_url: avatarUrl || null }).eq('id', session.user.id).select().single();
      if (error) throw error;
      syncLocalShadow(profile);
      newAvatarData = null;
      document.getElementById('settingsPage').classList.add('hidden');
      showToast('Profil berhasil disimpan online.', 'success');
      refreshAll();
    } catch (error) {
      console.error('Simpan profil gagal:', error);
      showToast('Profil gagal disimpan. Coba lagi.', 'error');
    }
  });

  document.getElementById('themeDark')?.addEventListener('click', () => { localStorage.setItem(NDOO_CONFIG.LS_THEME, 'dark'); applyTheme('dark'); openSettings(); });
  document.getElementById('themeLight')?.addEventListener('click', () => { localStorage.setItem(NDOO_CONFIG.LS_THEME, 'light'); applyTheme('light'); openSettings(); });

  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('exportData')?.addEventListener('click', exportData);
  document.getElementById('importDataBtn')?.addEventListener('click', () => document.getElementById('importDataFile').click());
  document.getElementById('importDataFile')?.addEventListener('change', importData);
}

async function logout() {
  try { await signOutOnline(); } catch (error) { console.warn('Logout Supabase:', error); }
  sessionStorage.removeItem(NDOO_CONFIG.SS_LOGIN);
  showAuth();
}

async function exportData() {
  try {
    const [posts, stories, dms] = await Promise.all([
      getAllPosts(), getActiveStories(), dbRequest(NDOO_CONFIG.STORE_DMS, 'readonly', store => store.getAll())
    ]);
    const payload = { users: getUsers(), posts, stories, dms, exported: Date.now() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ndoohlcc-backup-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error(error);
    showToast('Export data gagal.', 'error');
  }
}

async function importData(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object') throw new Error('Format invalid');
    if (Array.isArray(data.users)) saveUsers(data.users);
    await Promise.all([
      dbPutMany(NDOO_CONFIG.STORE_POSTS, data.posts),
      dbPutMany(NDOO_CONFIG.STORE_STORIES, data.stories),
      dbPutMany(NDOO_CONFIG.STORE_DMS, data.dms)
    ]);
    showToast('Data berhasil diimport.', 'success');
    refreshAll();
    updateNotifBadge();
  } catch (error) {
    console.error(error);
    showToast('File backup tidak valid atau gagal diimport.', 'error');
  }
}
