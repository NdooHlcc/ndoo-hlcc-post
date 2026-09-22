/* =========================================================
   POST — create, edit, delete, save menu
   ========================================================= */

let postMediaData = null;
let postMediaType = null;
let editingPostId = null;
let menuPostId = null;

function resetPostComposer() {
  postMediaData = null;
  postMediaType = null;
  document.getElementById('postCaption').value = '';
  document.getElementById('postMedia').value = '';
  document.getElementById('postPreview').innerHTML = '';
  document.getElementById('vipPostCheck').checked = false;
  document.getElementById('postMsg').textContent = '';
}

function openPostPage() {
  document.getElementById('postPage')?.classList.remove('hidden');
  document.getElementById('postMsg').textContent = '';
  if (!editingPostId) resetPostComposer();
  const vipWrap = document.getElementById('vipPostWrap');
  vipWrap?.classList.toggle('hidden', !isAdmin());
}

document.getElementById('plusBtn')?.addEventListener('click', () => {
  editingPostId = null;
  document.getElementById('postPageTitle').textContent = 'Buat Postingan';
  document.getElementById('postSubmit').textContent = 'Unggah';
  openPostPage();
});

document.getElementById('postBack')?.addEventListener('click', () => {
  document.getElementById('postPage')?.classList.add('hidden');
  editingPostId = null;
});

document.getElementById('postMedia')?.addEventListener('change', async event => {
  const file = event.target.files[0];
  const msg = document.getElementById('postMsg');
  const result = validateMedia(file, NDOO_CONFIG.MAX_POST_MEDIA);
  msg.textContent = result.ok ? '' : result.message;
  if (!result.ok) return;
  try {
    postMediaData = await readFileAsDataURL(file);
    postMediaType = result.type;
    document.getElementById('postPreview').innerHTML = result.type === 'image'
      ? `<img src="${postMediaData}" alt="Preview postingan">`
      : `<video controls src="${postMediaData}"></video>`;
  } catch { msg.textContent = 'Gagal membaca file.'; }
});

document.getElementById('postSubmit')?.addEventListener('click', async () => {
  const button = document.getElementById('postSubmit');
  const caption = document.getElementById('postCaption').value.trim();
  const vip = document.getElementById('vipPostCheck').checked;
  const msg = document.getElementById('postMsg');
  msg.textContent = '';
  if (!currentUser() || !getMe()) { msg.textContent = 'Sesi login tidak valid. Silakan login lagi.'; showAuth(); return; }
  if (button) button.disabled = true;

  try {
    if (editingPostId) {
      const post = await getPostById(editingPostId);
      if (!post || post.user !== currentUser()) return;
      post.caption = caption;
      await savePost(post);
      msg.style.color = 'var(--accent2)';
      msg.textContent = 'Caption diperbarui!';
      setTimeout(() => {
        document.getElementById('postPage').classList.add('hidden');
        msg.style.color = '';
        editingPostId = null;
        refreshAll();
      }, 700);
      return;
    }

    if (!postMediaData) { msg.textContent = 'Pilih foto/video dulu.'; return; }
    if (vip && !isAdmin()) { msg.textContent = 'Hanya admin yang bisa posting VIP.'; return; }

    await createOnlinePost({ caption, media: postMediaData, mediaType: postMediaType });

    msg.style.color = 'var(--accent2)';
    msg.textContent = 'Postingan berhasil diunggah!';
    setTimeout(() => {
      document.getElementById('postPage').classList.add('hidden');
      msg.style.color = '';
      editingPostId = null;
      showTab('tabPublic');
      refreshAll();
    }, 700);
  } catch (error) {
    console.error('Post gagal:', error);
    msg.textContent = error?.name === 'QuotaExceededError' ? 'Penyimpanan perangkat penuh. Hapus data lama lalu coba lagi.' : 'Postingan gagal disimpan. Coba lagi.';
  } finally {
    if (button) button.disabled = false;
  }
});

function openPostMenu(postId) {
  menuPostId = postId;
  getPostById(postId).then(post => {
    if (!post) return;
    const mine = post.user === currentUser();
    document.getElementById('menuEditPost').classList.toggle('hidden', !mine);
    document.getElementById('menuDeletePost').classList.toggle('hidden', !mine);
    document.getElementById('postMenu').classList.remove('hidden');
  });
}

document.getElementById('menuCancel')?.addEventListener('click', () => document.getElementById('postMenu')?.classList.add('hidden'));

document.getElementById('menuEditPost')?.addEventListener('click', async () => {
  const post = await getPostById(menuPostId);
  if (!post || post.user !== currentUser()) return;
  editingPostId = menuPostId;
  document.getElementById('postMenu').classList.add('hidden');
  document.getElementById('postPageTitle').textContent = 'Edit Caption';
  document.getElementById('postSubmit').textContent = 'Simpan';
  document.getElementById('postPage').classList.remove('hidden');
  document.getElementById('postCaption').value = post.caption || '';
  document.getElementById('postMedia').value = '';
  document.getElementById('postPreview').innerHTML = post.mediaType === 'image'
    ? `<img src="${post.media}" alt="Postingan">`
    : `<video controls src="${post.media}"></video>`;
  document.getElementById('postMsg').textContent = '';
});

document.getElementById('menuDeletePost')?.addEventListener('click', async () => {
  if (!(await showConfirm('Yakin ingin hapus postingan ini?'))) return;
  try { await deletePost(menuPostId); document.getElementById('postMenu').classList.add('hidden'); refreshAll(); }
  catch (error) { console.error(error); showToast('Postingan gagal dihapus.', 'error'); }
});

document.getElementById('menuSavePost')?.addEventListener('click', async () => {
  try { if (isSaved(menuPostId)) await unsavePostId(menuPostId); else await savePostId(menuPostId); }
  catch (error) { console.error(error); showToast('Favorit gagal disimpan.', 'error'); }
  document.getElementById('postMenu').classList.add('hidden');
  refreshAll();
});
