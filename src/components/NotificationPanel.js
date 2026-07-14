import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { toast } from './Toast.js';
import { escapeHtml, relativeTime } from '../utils/format.js';
import { navigate } from '../router.js';

const NOTIF_ICONS = {
  handshake: '<circle cx="9" cy="8" r="3"/><path d="M2.5 19c1-3 3.3-4.6 6.5-4.6s5.5 1.6 6.5 4.6"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15.5 14.6c2.4.3 4 1.8 4.8 4.4"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 3 7.3 7 9 4-1.7 7-4.8 7-9V6l-7-2.5Z"/>',
  users: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6M13.5 14.6c1.9.3 3.7 1.7 4.5 4.4"/>',
  exit: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M15 16l5-4-5-4M20 12H9"/>',
  star: '<path d="M12 3.5 14.5 9l6 .8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 6-.8L12 3.5Z"/>',
  crown: '<path d="M4 8l4 3 4-6 4 6 4-3-1.5 10h-13L4 8Z"/><path d="M6.5 18h11"/>',
  mail: '<path d="M4 6h16v12H4V6Z"/><path d="M4 6l8 7 8-7"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0v5l1.6 2.5H4.4L6 14V9Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
};
function notifIcon(name) {
  return `<svg class="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NOTIF_ICONS[name] || NOTIF_ICONS.bell}</svg>`;
}

const TYPE_META = {
  friend_request: { icon: notifIcon('handshake'), label: (p) => `${p.fromDisplayName || 'یک کاربر'} برای شما درخواست دوستی فرستاد` },
  friend_accepted: { icon: notifIcon('check'), label: (p) => `${p.byDisplayName || 'یک کاربر'} درخواست دوستی شما را پذیرفت` },
  clan_invite: { icon: notifIcon('shield'), label: (p) => `به کلن ${p.clanName || ''} دعوت شدید` },
  clan_join: { icon: notifIcon('users'), label: () => `یک عضو جدید به کلن شما پیوست` },
  clan_kicked: { icon: notifIcon('exit'), label: (p) => `از کلن ${p.clanName || ''} اخراج شدید` },
  clan_promotion: { icon: notifIcon('star'), label: (p) => `نقش شما در کلن ${p.clanName || ''} ارتقا یافت` },
  clan_ownership_transferred: { icon: notifIcon('crown'), label: () => 'مالکیت کلن به شما منتقل شد' },
  direct_message: { icon: notifIcon('mail'), label: (p) => `پیام جدید: ${p.preview || ''}` },
};

let state = { items: [], unreadCount: 0, open: false, loaded: false };
let initialized = false;

function typeMeta(type) {
  return TYPE_META[type] || { icon: notifIcon('bell'), label: () => 'اعلان جدید' };
}

function updateBadges() {
  document.querySelectorAll('.js-notif-badge').forEach((el) => {
    el.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
    el.classList.toggle('hidden', state.unreadCount === 0);
  });
}

async function loadInitial() {
  try {
    const { items, unreadCount } = await api.get('/notifications');
    state.items = items;
    state.unreadCount = unreadCount;
    state.loaded = true;
    updateBadges();
  } catch {
    /* non-critical */
  }
}

function routeFor(notification) {
  switch (notification.type) {
    case 'friend_request':
    case 'friend_accepted':
      return '/friends';
    case 'clan_invite':
    case 'clan_join':
    case 'clan_kicked':
    case 'clan_promotion':
    case 'clan_ownership_transferred':
      return '/clan';
    case 'direct_message':
      return '/chat';
    default:
      return null;
  }
}

function panelTemplate() {
  if (!state.items.length) {
    return `<div class="notif-empty">${notifIcon('bell')}<p>اعلانی وجود ندارد</p></div>`;
  }
  return `
    <div class="notif-list">
      ${state.items
        .map((n) => {
          const meta = typeMeta(n.type);
          return `
          <button class="notif-item${n.readAt ? '' : ' unread'}" data-notif-id="${n.id}">
            <span class="notif-icon" aria-hidden="true">${meta.icon}</span>
            <span class="notif-body">
              <span class="notif-text">${escapeHtml(meta.label(n.payload || {}))}</span>
              <span class="notif-time">${relativeTime(n.createdAt)}</span>
            </span>
            ${!n.readAt ? '<span class="notif-dot" aria-hidden="true"></span>' : ''}
          </button>`;
        })
        .join('')}
    </div>
  `;
}

function closePanel() {
  document.getElementById('notif-panel')?.remove();
  state.open = false;
}

async function openPanel(anchor) {
  closePanel();
  state.open = true;

  if (!state.loaded) await loadInitial();

  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-panel-header">
      <h3>اعلان‌ها</h3>
      <button class="btn btn-ghost btn-sm" id="notif-mark-all">علامت‌گذاری همه به‌عنوان خوانده‌شده</button>
    </div>
    <div id="notif-panel-body">${panelTemplate()}</div>
  `;
  document.body.appendChild(panel);
  positionPanel(panel, anchor);

  panel.querySelector('#notif-mark-all')?.addEventListener('click', async () => {
    try {
      await api.post('/notifications/read-all', {});
      state.items = state.items.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }));
      state.unreadCount = 0;
      updateBadges();
      panel.querySelector('#notif-panel-body').innerHTML = panelTemplate();
    } catch (err) {
      toast(err.message || 'خطا در به‌روزرسانی اعلان‌ها', 'error');
    }
  });

  panel.querySelectorAll('[data-notif-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.notifId;
      const notification = state.items.find((n) => n.id === id);
      if (notification && !notification.readAt) {
        notification.readAt = new Date().toISOString();
        state.unreadCount = Math.max(0, state.unreadCount - 1);
        updateBadges();
        api.post(`/notifications/${id}/read`, {}).catch(() => {});
      }
      closePanel();
      const target = routeFor(notification);
      if (target) navigate(target);
    });
  });

  setTimeout(() => document.addEventListener('click', outsideClickHandler), 0);
}

function positionPanel(panel, anchor) {
  const rect = anchor?.getBoundingClientRect();
  if (!rect) {
    panel.style.top = '70px';
    panel.style.left = '16px';
    return;
  }
  const top = Math.min(rect.bottom + 8, window.innerHeight - 420);
  let left = rect.left - 260;
  if (left < 12) left = 12;
  if (left + 320 > window.innerWidth) left = window.innerWidth - 332;
  panel.style.top = `${Math.max(top, 12)}px`;
  panel.style.left = `${left}px`;
}

function outsideClickHandler(e) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (panel.contains(e.target) || e.target.closest('.js-notif-bell')) return;
  closePanel();
  document.removeEventListener('click', outsideClickHandler);
}

/** Called once at boot: hydrates unread count and starts listening for realtime pushes. */
export function initNotificationPanel() {
  if (initialized) return;
  initialized = true;

  loadInitial();

  document.addEventListener('click', (e) => {
    const bellBtn = e.target.closest('.js-notif-bell');
    if (!bellBtn) return;
    if (state.open) closePanel();
    else openPanel(bellBtn);
  });

  document.addEventListener('socket:ready', attachSocketListener);
}

export function attachSocketListener() {
  try {
    const socket = getSocket();
    socket.off('notification:new');
    socket.on('notification:new', (notification) => {
      state.items = [notification, ...state.items].slice(0, 30);
      state.unreadCount += 1;
      updateBadges();
      const meta = typeMeta(notification.type);
      toast(meta.label(notification.payload || {}), 'info');
      if (state.open) {
        const body = document.getElementById('notif-panel-body');
        if (body) body.innerHTML = panelTemplate();
        document.querySelectorAll('[data-notif-id]').forEach((btn) => {
          btn.addEventListener('click', () => {}, { once: true });
        });
      }
    });
  } catch {
    /* socket not ready yet — safe to ignore, chat/game pages will connect it */
  }
}

export function resetNotificationState() {
  state = { items: [], unreadCount: 0, open: false, loaded: false };
  initialized = false;
  closePanel();
}
