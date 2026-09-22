/* =========================================================
   AUTH — Supabase online login/register + local UI compatibility
   ========================================================= */

let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('authTitle').textContent = mode === 'login' ? 'Login' : 'Daftar Akun';
  document.getElementById('authBtn').textContent = mode === 'login' ? 'Masuk' : 'Daftar';
  document.getElementById('switchText').innerHTML = mode === 'login'
    ? 'Belum punya akun? <a href="#" id="switchBtn">Daftar</a>'
    : 'Sudah punya akun? <a href="#" id="switchBtn">Login</a>';
  document.getElementById('authMsg').textContent = '';
  hideBanPanel();
  bindAuthSwitch();
}

function bindAuthSwitch() {
  document.getElementById('switchBtn')?.addEventListener('click', event => {
    event.preventDefault();
    setAuthMode(authMode === 'login' ? 'register' : 'login');
  });
}

function showBanPanel(user, ban) {
  const panel = document.getElementById('banPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  document.getElementById('banPanelTitle').textContent = `Akun @${user.username} dibatasi`;
  document.getElementById('banPanelReason').textContent = `Alasan: ${ban.reason}`;
  document.getElementById('banPanelUntil').textContent = `Berlaku sampai ${formatBanUntil(ban.until)}`;
  const input = document.getElementById('banAppealInput');
  if (input) input.value = '';
  const btn = document.getElementById('banAppealBtn');
  if (btn) btn.onclick = () => {
    const text = input?.value.trim();
    if (!text) { showToast('Tulis alasan banding terlebih dahulu.', 'error'); return; }
    const users = getUsers();
    const target = users.find(item => String(item.username).toLowerCase() === String(user.username).toLowerCase());
    if (target) {
      target.appeal = { text, created: Date.now(), read: false };
      saveUsers(users);
    }
    if (input) input.value = '';
    showToast('Banding berhasil dikirim.', 'success');
  };
}

function hideBanPanel() { document.getElementById('banPanel')?.classList.add('hidden'); }

function syncLocalShadow(profile) {
  if (!profile?.username) return;
  const users = getUsers();
  const index = users.findIndex(u => String(u.username).toLowerCase() === String(profile.username).toLowerCase());
  const shadow = {
    ...(index >= 0 ? users[index] : {}),
    username: profile.username,
    password: '',
    bio: profile.bio || '',
    avatar: profile.avatar_url || '',
    uid: profile.uid || `NDOO-${String(profile.id).slice(0, 8).toUpperCase()}`,
    notifications: index >= 0 && Array.isArray(users[index].notifications) ? users[index].notifications : [],
    followers: index >= 0 && Array.isArray(users[index].followers) ? users[index].followers : [],
    following: index >= 0 && Array.isArray(users[index].following) ? users[index].following : [],
    bannedUntil: 0,
    banReason: '',
    appeal: null,
    created: index >= 0 ? users[index].created : Date.now()
  };
  if (index >= 0) users[index] = shadow; else users.push(shadow);
  saveUsers(users);
}

async function initAuth() {
  bindAuthSwitch();
  try {
    initSupabase();
    bindSupabaseAuthState();
  } catch (error) {
    console.error(error);
  }

  document.getElementById('authForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const message = document.getElementById('authMsg');
    const button = document.getElementById('authBtn');
    message.textContent = '';

    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username) || password.length < 6) {
      message.textContent = 'Username 3–24 karakter (huruf/angka/._-) dan password minimal 6 karakter.';
      return;
    }

    button.disabled = true;
    button.textContent = authMode === 'login' ? 'Memuat...' : 'Membuat...';

    try {
      if (authMode === 'register') {
        const result = await signUpOnline(username, password);
        if (result.needsConfirmation) {
          message.textContent = 'Akun dibuat. Konfirmasi email Supabase diperlukan sebelum login.';
          setAuthMode('login');
          return;
        }
        syncLocalShadow(result.profile);
        sessionStorage.setItem(NDOO_CONFIG.SS_LOGIN, result.profile.username);
        showToast('Akun online berhasil dibuat.', 'success');
        showDashboard();
        return;
      }

      const result = await signInOnline(username, password);
      syncLocalShadow(result.profile);
      sessionStorage.setItem(NDOO_CONFIG.SS_LOGIN, result.profile.username);
      hideBanPanel();
      showDashboard();
    } catch (error) {
      console.error('Supabase auth:', error);
      const msg = String(error?.message || 'Login gagal.');
      message.textContent = /Invalid login credentials/i.test(msg)
        ? 'Username / password salah.'
        : msg;
    } finally {
      button.disabled = false;
      button.textContent = authMode === 'login' ? 'Masuk' : 'Daftar';
    }
  });
}
