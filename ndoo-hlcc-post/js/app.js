/* =========================================================
   APP — startup, session gate, dashboard refresh
   ========================================================= */

function hideDashboard() {
  document.getElementById('dashPage')?.classList.add('hidden');
}

function showAuth() {
  closeTransientPages();
  closeInfoDrawer?.();
  hideDashboard();
  document.getElementById('authPage')?.classList.remove('hidden');
  setAuthMode('login');
  hideBanPanel?.();
  document.getElementById('password').value = '';
}

function showDashboard() {
  const username = currentUser();
  const me = username ? getUserByName(username) : null;
  if (!username || !me || getBanInfo(me)) {
    sessionStorage.removeItem(NDOO_CONFIG.SS_LOGIN);
    showAuth();
    return;
  }
  document.getElementById('authPage')?.classList.add('hidden');
  document.getElementById('dashPage')?.classList.remove('hidden');
  showTab('tabPublic');
  updateNotifBadge();
  updateDMBadge?.();
}

function refreshAll() {
  const active = document.querySelector('.nav-btn.active')?.dataset.tab || 'tabPublic';
  return loadTab(active);
}

window.addEventListener('error', event => {
  console.error('NdooHlcc error:', event.error || event.message);
});
window.addEventListener('unhandledrejection', event => {
  console.error('NdooHlcc promise error:', event.reason);
  event.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && sessionStorage.getItem(NDOO_CONFIG.SS_LOGIN)) {
    openDatabase().catch(error => console.warn('DB resume:', error));
  }
});

async function boot() {
  try {
    initTheme();
    initSupabase();
    initAuth();
    initSettings();
    initRouter();
    if (typeof initAI === 'function') initAI();
    await openDatabase();
    const onlineSession = await getSupabaseSession().catch(() => null);
    if (onlineSession?.user) {
      const profile = await getOnlineProfile().catch(() => null);
      if (profile?.username) {
        syncLocalShadow(profile);
        await syncOnlineProfileToLocal().catch(() => {});
        sessionStorage.setItem(NDOO_CONFIG.SS_LOGIN, profile.username);
      }
    }
    await syncOnlineProfileToLocal().catch(() => {});
    await loadOnlineFavorites().catch(() => {});
    await updateNotifBadge().catch(() => {});
    await updateDMBadge().catch(() => {});
    showDashboard();
  } catch (error) {
    console.error('Startup gagal:', error);
    showAuth();
  }
}

boot();
