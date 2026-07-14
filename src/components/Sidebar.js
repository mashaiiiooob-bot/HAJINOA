import { formatNumber, escapeHtml } from '../utils/format.js';

const NAV_ITEMS = [
  { route: '/', label: 'خانه', icon: 'home' },
  { route: '/game', label: 'بازی', icon: 'play' },
  { route: '/hokm', label: 'حکم', icon: 'cards' },
  { route: '/tournaments', label: 'مسابقات', icon: 'medal' },
  { route: '/marketplace', label: 'بازار', icon: 'cart' },
  { route: '/clan', label: 'کلن', icon: 'shield' },
  { route: '/friends', label: 'دوستان', icon: 'friends' },
  { route: '/chat', label: 'گفتگو', icon: 'chat' },
  { route: '/leaderboard', label: 'رتبه‌بندی', icon: 'trophy' },
  { route: '/profile', label: 'پروفایل', icon: 'user' },
];

const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"/>',
  play: '<path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z"/>',
  cards: '<rect x="4" y="7" width="10" height="14" rx="1.5" transform="rotate(-8 9 14)"/><rect x="10" y="5" width="10" height="14" rx="1.5"/>',
  trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5a2 2 0 0 0 2 4"/><path d="M16 5h3a2 2 0 0 1-2 4"/><path d="M10 13v3M14 13v3"/><path d="M8 20h8M9 16.5h6l.6 3.5H8.4l.6-3.5Z"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M12 12.5 13 16h-2l1-3.5Z"/><path d="M8 4h3l1 6.5M16 4h-3l-1 6.5"/>',
  cart: '<path d="M4 5h2l1.2 10.2A2 2 0 0 0 9.2 17H18a2 2 0 0 0 2-1.6L21 8H6.2"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 3 7.3 7 9 4-1.7 7-4.8 7-9V6l-7-2.5Z"/>',
  friends: '<circle cx="9" cy="8" r="3"/><path d="M2.5 19c1-3 3.3-4.6 6.5-4.6s5.5 1.6 6.5 4.6"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15.5 14.6c2.4.3 4 1.8 4.8 4.4"/>',
  chat: '<path d="M4 5.5h16v10H9l-4 3.5v-3.5H4v-10Z"/>',
  logo: '<path d="M7 14c0-3 1.5-6 5-6s5 3 5 6-1.5 5-5 5-5-2-5-5Z"/><path d="M9 9c.5-2 1.5-3 3-3s2.5 1 3 3"/>',
  collapse: '<path d="M15 5 8 12l7 7"/>',
  admin: '<path d="M12 3.5 5 6v5.5c0 4.2 3 7.3 7 9 4-1.7 7-4.8 7-9V6l-7-2.5Z"/><path d="M9.5 12l1.8 1.8 3.2-3.6"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0v5l1.6 2.5H4.4L6 14V9Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M9 12h6M12 9v6"/>',
};

function icon(name, extra = '') {
  return `<svg class="nav-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

let collapsed = localStorage.getItem('dyk:sidebar-collapsed') === '1';

export function renderSidebar(user) {
  const aside = document.getElementById('app-sidebar');
  if (!aside) return;

  const navItems = user?.role === 'admin' ? [...NAV_ITEMS, { route: '/admin', label: 'مدیریت', icon: 'admin' }] : NAV_ITEMS;

  aside.classList.toggle('collapsed', collapsed);
  aside.innerHTML = `
    <div class="sidebar-brand">
      <span class="coin-mark" aria-hidden="true"><span class="coin-face">${icon('logo')}</span></span>
      <span class="brand-wordmark">دست یا خالی</span>
    </div>

    <nav class="sidebar-nav" aria-label="پیمایش اصلی">
      <span class="nav-active-glow" aria-hidden="true"></span>
      ${navItems.map(
        (item) => `
        <a href="#${item.route}" class="nav-item main-nav-item" data-route="${item.route}" data-tooltip="${item.label}">
          ${icon(item.icon)}
          <span class="nav-label">${item.label}</span>
        </a>`
      ).join('')}
    </nav>

    <div class="sidebar-footer">
      <button class="icon-btn js-notif-bell sidebar-notif-btn" aria-label="اعلان‌ها">
        ${icon('bell')}
        <span class="notif-badge js-notif-badge hidden">0</span>
      </button>
      <div class="coin-pill" title="موجودی سکه">
        ${icon('coin', 'coin-dot')}
        <span class="counter">${formatNumber(user?.coins)}</span>
      </div>
      <button class="sidebar-user" id="user-menu-btn" aria-haspopup="true" aria-label="منوی کاربر">
        <span class="avatar avatar-sm level-ring" style="--ring:${Math.min(100, ((user?.level ?? 1) % 10) * 10)}%">
          ${user?.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" />` : (user?.displayName?.[0] || '؟')}
        </span>
        <span class="sidebar-user-info">
          <span class="sidebar-user-name">${escapeHtml(user?.displayName || '')}</span>
          <span class="sidebar-user-level">سطح ${user?.level ?? 1}</span>
        </span>
      </button>
      <button class="sidebar-collapse-btn" id="sidebar-toggle" aria-label="${collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'}">
        ${icon('collapse')}
      </button>
    </div>
  `;

  document.getElementById('user-menu-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('ui:open-user-menu'));
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    collapsed = !collapsed;
    localStorage.setItem('dyk:sidebar-collapsed', collapsed ? '1' : '0');
    renderSidebar(user);
  });

  renderMobileNav(user, navItems);
  highlightActiveRoute();
}

/** Mobile bottom nav bar — the sidebar is hidden entirely under 880px (see
 *  sidebar.css), which previously left mobile users with NO way to reach
 *  game/tournaments/marketplace/clan/friends/chat/leaderboard/profile at
 *  all. This renders a fixed bottom bar with the same NAV_ITEMS, plus a
 *  "more" sheet for items that don't fit in the 5 primary slots. */
function renderMobileNav(user, navItems) {
  let bar = document.getElementById('app-mobile-nav');
  if (!bar) {
    bar = document.createElement('nav');
    bar.id = 'app-mobile-nav';
    bar.setAttribute('aria-label', 'پیمایش موبایل');
    document.body.appendChild(bar);
  }

  // 4 primary slots + a "more" button covering the rest, so the bar never
  // overflows on small screens regardless of how many routes exist.
  const PRIMARY_COUNT = 4;
  const primary = navItems.slice(0, PRIMARY_COUNT);
  const overflow = navItems.slice(PRIMARY_COUNT);

  bar.innerHTML = `
    ${primary.map((item) => `
      <a href="#${item.route}" class="mobile-nav-item main-nav-item" data-route="${item.route}">
        ${icon(item.icon)}
        <span class="mobile-nav-label">${item.label}</span>
      </a>`).join('')}
    ${overflow.length ? `
      <button class="mobile-nav-item mobile-nav-more" id="mobile-nav-more-btn" aria-haspopup="true" aria-expanded="false">
        ${icon('collapse', 'mobile-nav-more-icon')}
        <span class="mobile-nav-label">بیشتر</span>
      </button>` : ''}
  `;

  let sheet = document.getElementById('mobile-nav-sheet');
  if (overflow.length) {
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'mobile-nav-sheet';
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = `
      <div class="mobile-nav-sheet-backdrop"></div>
      <div class="mobile-nav-sheet-panel">
        <span class="mobile-nav-sheet-handle" aria-hidden="true"></span>
        ${overflow.map((item) => `
          <a href="#${item.route}" class="mobile-nav-sheet-item main-nav-item" data-route="${item.route}">
            ${icon(item.icon)}
            <span>${item.label}</span>
          </a>`).join('')}
      </div>
    `;
    const closeSheet = () => {
      sheet.classList.remove('open');
      document.getElementById('mobile-nav-more-btn')?.setAttribute('aria-expanded', 'false');
    };
    sheet.querySelector('.mobile-nav-sheet-backdrop')?.addEventListener('click', closeSheet);
    sheet.querySelectorAll('.mobile-nav-sheet-item').forEach((a) => a.addEventListener('click', closeSheet));
    document.getElementById('mobile-nav-more-btn')?.addEventListener('click', () => {
      const willOpen = !sheet.classList.contains('open');
      sheet.classList.toggle('open', willOpen);
      document.getElementById('mobile-nav-more-btn')?.setAttribute('aria-expanded', String(willOpen));
    });
  } else {
    sheet?.remove();
  }
}

document.addEventListener('router:active-route', () => highlightActiveRoute());
window.addEventListener('resize', () => highlightActiveRoute());

export function highlightActiveRoute() {
  const path = window.location.hash.replace(/^#/, '') || '/';
  const items = [...document.querySelectorAll('.main-nav-item')];
  const activeEl = items.find((a) => a.dataset.route === path);
  items.forEach((a) => a.classList.toggle('active', a === activeEl));

  const glow = document.querySelector('.nav-active-glow');
  if (glow && activeEl && document.getElementById('app-sidebar')?.contains(activeEl)) {
    glow.style.transform = `translateY(${activeEl.offsetTop}px)`;
    glow.style.height = `${activeEl.offsetHeight}px`;
    glow.style.opacity = '1';
  } else if (glow) {
    glow.style.opacity = '0';
  }

  // If the active route is one of the "more" sheet items, mark the mobile
  // "more" button itself as active so mobile users can still see they're on
  // e.g. Clans/Chat/Profile even though those live in the overflow sheet.
  const moreBtn = document.getElementById('mobile-nav-more-btn');
  const sheetHasActive = document.querySelector('#mobile-nav-sheet .mobile-nav-sheet-item.active');
  moreBtn?.classList.toggle('active', !!sheetHasActive);
}
