/* =========================================================
   ROUTER — tab & transient page navigation
   ========================================================= */

const TRANSIENT_PAGES = Object.freeze([
  'postPage', 'commentPage', 'settingsPage', 'dmChatPage',
  'searchPage', 'storyViewPage', 'storyAddPage', 'musicPage', 'aiPage', 'peoplePage', 'favoritePage', 'adminPage', 'postMenu'
]);

let tabLoadToken = 0;

function closeTransientPages() {
  TRANSIENT_PAGES.forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

function showTab(tabId) {
  closeTransientPages();
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');
  document.querySelectorAll('.nav-btn[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tabId));
  loadTab(tabId);
}

async function loadTab(tabId) {
  const token = ++tabLoadToken;
  try {
    if (tabId === 'tabPublic') {
      await loadStoryBar();
      if (token !== tabLoadToken) return;
      await loadFeed();
    } else if (tabId === 'tabVip') await loadVipFeed();
    else if (tabId === 'tabProfile') await loadMyProfile();
    else if (tabId === 'tabDM') await loadDMList();
    else if (tabId === 'tabNotif') loadNotifications();
  } catch (error) { console.error(`Gagal memuat ${tabId}:`, error); }
}

function initRouter() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(button => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });
  document.getElementById('notifBtn')?.addEventListener('click', () => showTab('tabNotif'));
}
