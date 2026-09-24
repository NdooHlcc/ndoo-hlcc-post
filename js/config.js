const NDOO_SUPABASE = Object.freeze({
  URL: 'https://rckjkqacnfjatzsswech.supabase.co',
  PUBLISHABLE_KEY: 'sb_publishable_9yF1zV5TPW5T9LWQhq2UTQ_SUAePQmB'
});

const NDOO_CONFIG = Object.freeze({
  DB_NAME: 'ndoo_db_v5',
  DB_VERSION: 6,
  STORE_POSTS: 'posts',
  STORE_DMS: 'dms',
  STORE_STORIES: 'stories',
  STORE_MUSIC: 'music',
  LS_USERS: 'ndoo_users',
  LS_THEME: 'ndoo_theme',
  LS_SAVED: 'ndoo_saved',
  SS_LOGIN: 'ndoo_login',
  ADMIN_USER: 'admin',
  STORY_TTL: 24 * 60 * 60 * 1000,
  MAX_POST_MEDIA: 50 * 1024 * 1024,
  MAX_STORY_MEDIA: 30 * 1024 * 1024,
  MAX_AVATAR: 3 * 1024 * 1024,
  AUDIO_ONLINE_APP_NAME: 'NdooHlccPost'
});

let db = null;
let dbOpenPromise = null;
