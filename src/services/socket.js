import { getAccessToken } from './api.js';

const SOCKET_URL = window.__ENV__?.SOCKET_URL || 'http://localhost:4000';

let socket = null;

/** Lazily creates a single authenticated socket connection per session. */
export function getSocket() {
  if (socket?.connected) return socket;
  if (typeof io === 'undefined') {
    throw new Error('socket.io-client failed to load — check the CDN script tag in index.html');
  }
  socket = io(SOCKET_URL, {
    auth: { token: getAccessToken() },
    transports: ['websocket'],
    autoConnect: true,
    reconnectionAttempts: 5,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
