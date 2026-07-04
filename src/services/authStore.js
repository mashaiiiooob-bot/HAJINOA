import { api, setAccessToken, refreshAccessToken } from './api.js';

const listeners = new Set();
let currentUser = null;

function emit() {
  listeners.forEach((fn) => fn(currentUser));
}

export const AuthStore = {
  get user() {
    return currentUser;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async register({ username, email, password, displayName }) {
    return api.post('/auth/register', { username, email, password, displayName });
  },

  async login({ identifier, password }) {
    const { user, accessToken } = await api.post('/auth/login', { identifier, password });
    setAccessToken(accessToken);
    currentUser = user;
    emit();
    return user;
  },

  async logout() {
    await api.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    currentUser = null;
    emit();
  },

  /** Attempts to restore a session on page load using the httpOnly refresh cookie. */
  async restoreSession() {
    try {
      await refreshAccessToken();
      currentUser = await api.get('/users/me');
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

document.addEventListener('auth:expired', () => {
  currentUser = null;
  emit();
});
