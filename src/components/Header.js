import { formatNumber, escapeHtml } from '../utils/format.js';

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
          <span aria-hidden="true">🔔</span>
          <span class="notif-badge js-notif-badge hidden">0</span>
        </button>
        <div class="coin-pill coin-pill-header" title="موجودی سکه">
          <span aria-hidden="true">🪙</span>
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
