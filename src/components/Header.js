import { formatNumber, escapeHtml } from '../utils/format.js';

const HEADER_ICONS = {
  bell: '<path d="M6 9a6 6 0 0 1 12 0v5l1.6 2.5H4.4L6 14V9Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M9 12h6M12 9v6"/>',
};
function headerIcon(name, extra = '') {
  return `<svg class="nav-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HEADER_ICONS[name] || ''}</svg>`;
}

/**
 * Slim top bar — used for mobile brand/coin display and page context.
 * Primary navigation lives in Sidebar.js (components/Sidebar.js).
 */
export function renderHeader(user) {
  const header = document.getElementById('app-header');
  if (!header) return;

  header.innerHTML = `
    <div class="container header-inner">
      <a href="#/" class="brand brand-mobile" aria-label="دست یا خالی — صفحه اصلی">
        <span class="coin-mark" aria-hidden="true"><span class="coin-face">🤲</span></span>
        <span class="brand-name">دست یا خالی</span>
      </a>
      <div class="header-user">
        <button class="icon-btn js-notif-bell" aria-label="اعلان‌ها">
          ${headerIcon('bell')}
          <span class="notif-badge js-notif-badge hidden">0</span>
        </button>
        <div class="coin-pill coin-pill-header" title="موجودی سکه">
          ${headerIcon('coin', 'coin-dot')}
          <span class="counter">${formatNumber(user?.coins)}</span>
        </div>
        <button class="avatar avatar-sm" id="user-menu-btn-mobile" aria-haspopup="true" aria-label="منوی کاربر">
          ${user?.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" />` : (user?.displayName?.[0] || '؟')}
        </button>
      </div>
    </div>
  `;

  document.getElementById('user-menu-btn-mobile')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('ui:open-user-menu'));
  });
}
