import { supabase } from './supabaseClient.js';

const listeners = new Set();
let currentUser = null; // shape: { id, username, email, displayName, avatarUrl, role, level, xp, coins, gems, ... } — merged from auth + public.users row

function emit() {
  listeners.forEach((fn) => fn(currentUser));
}

/** Loads the full player profile row (stats, coins, etc.) that lives in public.users,
 *  keyed by the auth.users id (same UUID — see the handle_new_user trigger). */
async function loadProfile(authUser) {
  if (!authUser) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, display_name, avatar_url, role, level, xp, coins, gems, status')
    .eq('id', authUser.id)
    .single();

  if (error || !data) return null;
  if (data.status !== 'active') {
    // Suspended/banned accounts are signed out client-side; RLS also blocks their writes server-side.
    await supabase.auth.signOut();
    throw new Error('این حساب کاربری مسدود شده است');
  }

  return {
    id: data.id,
    username: data.username,
    email: data.email,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    role: data.role,
    level: data.level,
    xp: data.xp,
    coins: data.coins,
    gems: data.gems,
  };
}

export const AuthStore = {
  get user() {
    return currentUser;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Supabase Auth signup. A DB trigger (handle_new_user) mirrors the new
   *  auth.users row into public.users with the username/displayName passed
   *  via options.data, so no separate insert call is needed here. */
  async register({ username, email, password, displayName }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName || username },
      },
    });
    if (error) throw new Error(translateAuthError(error));
    return data.user;
  },

  /** identifier is treated as an email; Supabase Auth is email-based.
   *  (Username login would require a lookup RPC to map username -> email first.) */
  async login({ identifier, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });
    if (error) throw new Error(translateAuthError(error));

    currentUser = await loadProfile(data.user);
    emit();
    return currentUser;
  },

  async logout() {
    await supabase.auth.signOut();
    currentUser = null;
    emit();
  },

  /** Attempts to restore a session on page load from Supabase's persisted session. */
  async restoreSession() {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        currentUser = null;
        return null;
      }
      currentUser = await loadProfile(data.session.user);
      emit();
      return currentUser;
    } catch {
      currentUser = null;
      return null;
    }
  },

  setUser(user) {
    currentUser = user;
    emit();
  },
};

function translateAuthError(error) {
  const map = {
    'Invalid login credentials': 'ایمیل یا رمز عبور اشتباه است',
    'User already registered': 'این ایمیل قبلاً ثبت شده است',
    'Email not confirmed': 'ایمیل شما هنوز تأیید نشده است',
  };
  return map[error.message] || error.message;
}

// Keep currentUser in sync with token refresh / cross-tab sign-out.
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    emit();
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    currentUser = await loadProfile(session.user);
    emit();
  }
});
