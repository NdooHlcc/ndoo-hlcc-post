/* =========================================================
   SUPABASE — online auth foundation
   ========================================================= */

let supabaseClient = null;

function initSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase?.createClient) throw new Error('Supabase Client belum termuat.');
  supabaseClient = window.supabase.createClient(
    NDOO_SUPABASE.URL,
    NDOO_SUPABASE.PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
  return supabaseClient;
}

function usernameAuthEmail(username) {
  return `${String(username).trim().toLowerCase()}@auth.ndoohlcc.local`;
}

async function getSupabaseSession() {
  const client = initSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function getOnlineProfile() {
  const session = await getSupabaseSession();
  if (!session?.user) return null;
  window.__NDOO_AUTH_USER_ID = session.user.id;
  const { data, error } = await initSupabase()
    .from('profiles')
    .select('id,uid,username,bio,avatar_url,created_at')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureOnlineProfile(authUser, username) {
  const client = initSupabase();
  const { data: existing, error: readError } = await client
    .from('profiles')
    .select('id,uid,username,bio,avatar_url,created_at')
    .eq('id', authUser.id)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;

  const uid = authUser.user_metadata?.uid || `NDOO-${authUser.id.slice(0, 8).toUpperCase()}`;
  const { data, error } = await client
    .from('profiles')
    .insert({ id: authUser.id, uid, username, bio: '' })
    .select('id,uid,username,bio,avatar_url,created_at')
    .single();
  if (error) throw error;
  return data;
}

async function signUpOnline(username, password) {
  const client = initSupabase();
  const email = usernameAuthEmail(username);
  const uid = `NDOO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { username, uid } }
  });
  if (error) throw error;
  if (!data.user) throw new Error('Akun Supabase gagal dibuat.');
  if (!data.session) {
    return { user: data.user, profile: null, needsConfirmation: true };
  }
  const profile = await ensureOnlineProfile(data.user, username);
  return { user: data.user, profile, needsConfirmation: false };
}

async function signInOnline(username, password) {
  const client = initSupabase();
  const email = usernameAuthEmail(username);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const profile = await ensureOnlineProfile(data.user, username);
  return { user: data.user, profile };
}

async function signOutOnline() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

function bindSupabaseAuthState() {
  const client = initSupabase();
  client.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) return;
    setTimeout(async () => {
      try {
        const profile = await getOnlineProfile();
        if (profile?.username) sessionStorage.setItem(NDOO_CONFIG.SS_LOGIN, profile.username);
      } catch (error) {
        console.warn('Supabase profile sync:', error);
      }
    }, 0);
  });
}
