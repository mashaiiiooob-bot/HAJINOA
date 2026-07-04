const API_BASE = window.__ENV__?.API_URL || 'http://localhost:4000/api';

let accessToken = null;
let refreshPromise = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function rawRequest(path, { method = 'GET', body, skipAuth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken && !skipAuth) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include', // send the httpOnly refresh-token cookie
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* empty body, e.g. 204 */
  }

  if (!res.ok) {
    const error = new Error(payload?.error?.message || 'خطای ناشناخته');
    error.code = payload?.error?.code;
    error.status = res.status;
    throw error;
  }
  return payload?.data;
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST', skipAuth: true })
      .then((data) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Public request function — transparently retries once after a silent token refresh on 401. */
export async function apiRequest(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (err) {
    if (err.status === 401 && !options.skipAuth && path !== '/auth/refresh') {
      try {
        await refreshAccessToken();
        return await rawRequest(path, options);
      } catch {
        setAccessToken(null);
        document.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    throw err;
  }
}

export const api = {
  get: (path) => apiRequest(path),
  post: (path, body, opts) => apiRequest(path, { method: 'POST', body, ...opts }),
  put: (path, body, opts) => apiRequest(path, { method: 'PUT', body, ...opts }),
  del: (path, opts) => apiRequest(path, { method: 'DELETE', ...opts }),
};

export { refreshAccessToken };
