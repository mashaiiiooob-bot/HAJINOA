import { api } from '../services/api.js';
import { openModal, closeModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { escapeHtml, formatNumber, relativeTime } from '../utils/format.js';

const ROLE_LABEL = { player: 'بازیکن', moderator: 'ناظر', admin: 'مدیر' };
const STATUS_LABEL = { active: 'فعال', suspended: 'معلق', banned: 'مسدود', deleted: 'حذف‌شده' };

const TABS = [
  { id: 'dashboard', label: 'داشبورد' },
  { id: 'users', label: 'کاربران' },
  { id: 'tournaments', label: 'مسابقات' },
  { id: 'marketplace', label: 'بازار' },
  { id: 'clans', label: 'کلن‌ها' },
  { id: 'games', label: 'بازی‌ها' },
  { id: 'announcements', label: 'اعلانیه‌ها' },
  { id: 'logs', label: 'گزارش‌ها' },
  { id: 'settings', label: 'تنظیمات' },
];

/** renderAdmin() — the full admin dashboard shell: overview, users, tournaments, marketplace, clans, games, announcements, logs, and settings. */
export async function renderAdmin(root) {
  let tab = 'dashboard';

  // --- Users tab state ---
  let usersLoading = true;
  let usersResult = { users: [], page: 1, totalPages: 1, total: 0 };
  let userFilters = { search: '', role: '', status: '', sort: 'newest' };
  let userPage = 1;

  // --- Dashboard tab state ---
  let overview = null;
  let overviewLoading = true;

  // --- Tournaments tab state ---
  let tLoading = true;
  let tResult = { tournaments: [], page: 1, totalPages: 1, total: 0 };
  let tFilters = { search: '', status: '' };
  let tPage = 1;

  // --- Marketplace tab state ---
  let mLoading = true;
  let mResult = { listings: [], page: 1, totalPages: 1, total: 0 };
  let mFilters = { search: '', status: '', category: '' };
  let mPage = 1;
  let mStats = null;

  // --- Clans tab state ---
  let cLoading = true;
  let cResult = { clans: [], page: 1, totalPages: 1, total: 0 };
  let cFilters = { search: '' };
  let cPage = 1;

  // --- Games tab state ---
  let gLoading = true;
  let activeMatches = [];
  let matchHistory = { matches: [], page: 1, totalPages: 1, total: 0 };
  let gFilters = { search: '', status: '' };
  let gPage = 1;
  let gView = 'active'; // active | history

  // --- Announcements tab state ---
  let aLoading = true;
  let announcementsResult = { announcements: [], page: 1, totalPages: 1, total: 0 };

  // --- Logs tab state ---
  let logsLoading = true;
  let logsResult = { logs: [], page: 1, totalPages: 1, total: 0 };
  let logFilters = { category: '' };
  let logPage = 1;

  // --- Settings tab state ---
  let settingsLoading = true;
  let settingsData = null;

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">🛠️ پنل مدیریت</p>
            <h1>مدیریت هجینو</h1>
          </div>
        </div>
        <div class="admin-tabs" role="tablist">
          ${TABS.map((t) => `<button class="admin-tab-btn" data-tab="${t.id}" role="tab">${t.label}</button>`).join('')}
        </div>
        <div id="admin-content"><div class="skeleton" style="height:300px;border-radius:var(--r-lg)"></div></div>
      </div>
    `;
    root.querySelectorAll('.admin-tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    updateTabButtons();
  }

  function updateTabButtons() {
    root.querySelectorAll('.admin-tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  }

  async function switchTab(next) {
    tab = next;
    updateTabButtons();
    if (tab === 'dashboard' && !overview) await loadOverview();
    if (tab === 'users' && !usersResult.users.length) await loadUsers();
    if (tab === 'tournaments' && !tResult.tournaments.length) await loadTournaments();
    if (tab === 'marketplace' && !mResult.listings.length) await loadListings();
    if (tab === 'clans' && !cResult.clans.length) await loadClans();
    if (tab === 'games' && !activeMatches.length) await loadGames();
    if (tab === 'announcements' && !announcementsResult.announcements.length) await loadAnnouncements();
    if (tab === 'logs' && !logsResult.logs.length) await loadLogs();
    if (tab === 'settings' && !settingsData) await loadSettings();
    renderContent();
  }

  /* ------------------------------------------------------------ Dashboard */

  async function loadOverview() {
    overviewLoading = true;
    try {
      overview = await api.get('/admin/dashboard/overview');
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری آمار', 'error');
    } finally {
      overviewLoading = false;
    }
  }

  function statCard(icon, label, value) {
    return `
      <div class="card admin-stat-card">
        <span class="admin-stat-icon" aria-hidden="true">${icon}</span>
        <div>
          <strong>${formatNumber(value ?? 0)}</strong>
          <span>${label}</span>
        </div>
      </div>
    `;
  }

  function dashboardTemplate() {
    if (overviewLoading) return `<div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>`;
    if (!overview) return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⚠</span><p>آمار در دسترس نیست.</p></div>`;

    const { users, games, tournaments, marketplace, clans, economy } = overview;
    return `
      <div class="admin-stats-grid">
        ${statCard('👥', 'کل کاربران', users.totalUsers)}
        ${statCard('🟢', 'کاربران آنلاین', users.onlineUsers)}
        ${statCard('🆕', 'کاربران جدید (۷ روز)', users.newUsersThisWeek)}
        ${statCard('🚫', 'کاربران مسدود', users.bannedUsers)}
        ${statCard('🎮', 'بازی‌های فعال', games.activeMatches)}
        ${statCard('📊', 'بازی‌های ۲۴ ساعت اخیر', games.matchesLast24h)}
        ${statCard('🏆', 'مسابقات فعال', tournaments.activeTournaments)}
        ${statCard('⏳', 'مسابقات در انتظار', tournaments.openTournaments)}
        ${statCard('🛒', 'آگهی‌های فعال بازار', marketplace.activeListings)}
        ${statCard('💰', 'حجم معاملات بازار', marketplace.totalVolumeCoins)}
        ${statCard('🛡️', 'کل کلن‌ها', clans.totalClans)}
        ${statCard('🪙', 'کل سکه در گردش', economy.totalCoinsInCirculation)}
      </div>
    `;
  }

  /* ----------------------------------------------------------------- Users */

  async function loadUsers() {
    usersLoading = true;
    renderContent();
    try {
      const params = new URLSearchParams();
      if (userFilters.search) params.set('search', userFilters.search);
      if (userFilters.role) params.set('role', userFilters.role);
      if (userFilters.status) params.set('status', userFilters.status);
      if (userFilters.sort) params.set('sort', userFilters.sort);
      params.set('page', String(userPage));
      params.set('pageSize', '15');
      usersResult = await api.get(`/admin/users?${params.toString()}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری کاربران', 'error');
    } finally {
      usersLoading = false;
    }
  }

  function usersToolbarTemplate() {
    return `
      <div class="mp-toolbar" style="grid-template-columns:2fr 1fr 1fr 1fr;">
        <input class="mp-search" id="admin-user-search" type="search" placeholder="جستجوی نام کاربری، ایمیل یا نام…" aria-label="جستجوی کاربران" value="${escapeHtml(userFilters.search)}" />
        <select class="mp-select" id="admin-user-role">
          <option value="">همه نقش‌ها</option>
          ${Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${userFilters.role === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="mp-select" id="admin-user-status">
          <option value="">همه وضعیت‌ها</option>
          ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${userFilters.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="mp-select" id="admin-user-sort">
          <option value="newest" ${userFilters.sort === 'newest' ? 'selected' : ''}>جدیدترین</option>
          <option value="oldest" ${userFilters.sort === 'oldest' ? 'selected' : ''}>قدیمی‌ترین</option>
          <option value="coins_desc" ${userFilters.sort === 'coins_desc' ? 'selected' : ''}>بیشترین سکه</option>
          <option value="level_desc" ${userFilters.sort === 'level_desc' ? 'selected' : ''}>بالاترین سطح</option>
          <option value="last_seen" ${userFilters.sort === 'last_seen' ? 'selected' : ''}>آخرین بازدید</option>
        </select>
      </div>
    `;
  }

  function usersTableTemplate() {
    if (!usersResult.users.length) {
      return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">👤</span><p>کاربری یافت نشد.</p></div>`;
    }
    return `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>کاربر</th><th>نقش</th><th>وضعیت</th><th>سطح</th><th>سکه</th><th>آخرین بازدید</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${usersResult.users
              .map(
                (u) => `
              <tr>
                <td>
                  <div class="admin-user-cell">
                    <span class="mp-item-icon admin-user-avatar" aria-hidden="true">${u.avatarUrl ? `<img class="clan-avatar-img" src="${escapeHtml(u.avatarUrl)}" alt="" />` : (u.displayName?.[0] || '؟')}</span>
                    <div><strong>${escapeHtml(u.displayName)}</strong><span>@${escapeHtml(u.username)}</span></div>
                  </div>
                </td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-gold' : 'badge-purple'}">${ROLE_LABEL[u.role]}</span></td>
                <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${STATUS_LABEL[u.status]}</span></td>
                <td>${formatNumber(u.level)}</td>
                <td>🪙 ${formatNumber(u.coins)}</td>
                <td>${relativeTime(u.lastSeenAt)}</td>
                <td><button class="btn btn-ghost btn-sm" data-view-user="${u.id}">مشاهده</button></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="mp-pagination">
        <button class="btn btn-secondary btn-sm" id="admin-users-prev" ${usersResult.page <= 1 ? 'disabled' : ''}>قبلی</button>
        <span>صفحه ${formatNumber(usersResult.page)} از ${formatNumber(usersResult.totalPages)} (${formatNumber(usersResult.total)} کاربر)</span>
        <button class="btn btn-secondary btn-sm" id="admin-users-next" ${usersResult.page >= usersResult.totalPages ? 'disabled' : ''}>بعدی</button>
      </div>
    `;
  }

  function usersTemplate() {
    if (usersLoading) return `${usersToolbarTemplate()}<div class="skeleton" style="height:360px;border-radius:var(--r-lg)"></div>`;
    return `${usersToolbarTemplate()}${usersTableTemplate()}`;
  }

  /* ------------------------------------------------------------ Tournaments */

  async function loadTournaments() {
    tLoading = true;
    renderContent();
    try {
      const params = new URLSearchParams();
      if (tFilters.search) params.set('search', tFilters.search);
      if (tFilters.status) params.set('status', tFilters.status);
      params.set('page', String(tPage));
      params.set('pageSize', '15');
      tResult = await api.get(`/admin/tournaments?${params.toString()}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری مسابقات', 'error');
    } finally {
      tLoading = false;
    }
  }

  function tournamentsToolbarTemplate() {
    return `
      <div class="mp-toolbar" style="grid-template-columns:2fr 1fr;">
        <input class="mp-search" id="admin-t-search" type="search" placeholder="جستجوی نام مسابقه…" aria-label="جستجوی مسابقات" value="${escapeHtml(tFilters.search)}" />
        <select class="mp-select" id="admin-t-status">
          <option value="">همه وضعیت‌ها</option>
          <option value="registration" ${tFilters.status === 'registration' ? 'selected' : ''}>در انتظار</option>
          <option value="active" ${tFilters.status === 'active' ? 'selected' : ''}>در جریان</option>
          <option value="completed" ${tFilters.status === 'completed' ? 'selected' : ''}>پایان‌یافته</option>
          <option value="cancelled" ${tFilters.status === 'cancelled' ? 'selected' : ''}>لغوشده</option>
        </select>
      </div>
    `;
  }

  const T_STATUS_LABEL = { registration: 'در انتظار', active: 'در جریان', completed: 'پایان‌یافته', cancelled: 'لغوشده' };

  function tournamentsTableTemplate() {
    if (!tResult.tournaments.length) {
      return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🏆</span><p>مسابقه‌ای یافت نشد.</p></div>`;
    }
    return `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>نام</th><th>وضعیت</th><th>بازیکنان</th><th>جایزه</th><th>ایجاد شده</th><th></th></tr></thead>
          <tbody>
            ${tResult.tournaments
              .map(
                (t) => `
              <tr>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td><span class="badge ${t.status === 'active' ? 'badge-purple' : t.status === 'completed' ? 'badge-gold' : t.status === 'cancelled' ? 'badge-danger' : 'badge'}">${T_STATUS_LABEL[t.status]}</span></td>
                <td>${formatNumber(t.participantCount)}/${formatNumber(t.maxPlayers)}</td>
                <td>🪙 ${formatNumber(t.prizeCoins)}</td>
                <td>${relativeTime(t.createdAt)}</td>
                <td><button class="btn btn-ghost btn-sm" data-view-tournament="${t.id}">مشاهده</button></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="mp-pagination">
        <button class="btn btn-secondary btn-sm" id="admin-t-prev" ${tResult.page <= 1 ? 'disabled' : ''}>قبلی</button>
        <span>صفحه ${formatNumber(tResult.page)} از ${formatNumber(tResult.totalPages)} (${formatNumber(tResult.total)} مسابقه)</span>
        <button class="btn btn-secondary btn-sm" id="admin-t-next" ${tResult.page >= tResult.totalPages ? 'disabled' : ''}>بعدی</button>
      </div>
    `;
  }

  function tournamentsTemplate() {
    if (tLoading) return `${tournamentsToolbarTemplate()}<div class="skeleton" style="height:360px;border-radius:var(--r-lg)"></div>`;
    return `${tournamentsToolbarTemplate()}${tournamentsTableTemplate()}`;
  }

  async function openTournamentModal(tournamentId) {
    let t;
    try {
      t = await api.get(`/admin/tournaments/${tournamentId}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری مسابقه', 'error');
      return;
    }
    renderTournamentModal(t);
  }

  function renderTournamentModal(t) {
    const bracketByRound = [1, 2, 3].map((r) => t.bracket.filter((m) => m.roundNumber === r));
    openModal({
      title: t.name,
      bodyHtml: `
        <div class="admin-profile-modal">
          <p class="hero-sub">وضعیت: ${T_STATUS_LABEL[t.status]} · جایزه: 🪙 ${formatNumber(t.prizeCoins)} · دور فعلی: ${formatNumber(t.currentRound)}</p>
          <div class="clan-stats-row" style="grid-template-columns:repeat(4,1fr);">
            <div><strong>${formatNumber(t.adminStatistics.participantCount)}</strong><span>شرکت‌کننده</span></div>
            <div><strong>${formatNumber(t.adminStatistics.coinsAwarded)}</strong><span>سکه پرداختی</span></div>
            <div><strong>${formatNumber(t.adminStatistics.xpAwarded)}</strong><span>XP پرداختی</span></div>
            <div><strong>${formatNumber(t.adminStatistics.rankPointsAwarded)}</strong><span>امتیاز پرداختی</span></div>
          </div>

          <div class="widget-title"><h3>شرکت‌کنندگان</h3></div>
          <ul class="lb-list">
            ${t.participants
              .map(
                (p) => `<li class="lb-row"><span class="lb-name">${escapeHtml(p.displayName)}</span><span class="badge ${p.status === 'champion' ? 'badge-gold' : p.status === 'eliminated' ? 'badge-danger' : 'badge-purple'}">${p.status === 'champion' ? 'قهرمان' : p.status === 'eliminated' ? 'حذف‌شده' : 'ثبت‌نامی'}</span></li>`
              )
              .join('') || '<li class="chat-empty">شرکت‌کننده‌ای نیست.</li>'}
          </ul>

          <div class="widget-title"><h3>جدول مسابقه</h3></div>
          <div class="bracket-grid">
            ${bracketByRound
              .map(
                (matches) => `
              <div class="bracket-col">
                ${
                  matches
                    .map(
                      (m) => `
                  <div class="bracket-match${m.status === 'completed' ? ' bracket-match-done' : ''}">
                    <div class="bracket-slot${m.winnerId === m.player1Id ? ' bracket-slot-winner' : ''}">${escapeHtml(m.player1Name || 'در انتظار')}</div>
                    <span class="bracket-vs">vs</span>
                    <div class="bracket-slot${m.winnerId === m.player2Id ? ' bracket-slot-winner' : ''}">${escapeHtml(m.player2Name || 'در انتظار')}</div>
                  </div>`
                    )
                    .join('') || '<div class="bracket-match bracket-match-empty">—</div>'
                }
              </div>`
              )
              .join('')}
          </div>

          <div class="admin-action-grid">
            <button class="btn btn-secondary btn-sm" id="admin-t-force-start" ${t.status !== 'registration' ? 'disabled' : ''}>شروع اجباری</button>
            <button class="btn btn-secondary btn-sm" id="admin-t-force-end" ${t.status !== 'active' ? 'disabled' : ''}>پایان اجباری</button>
            <button class="btn btn-danger btn-sm" id="admin-t-cancel" ${!['registration', 'active'].includes(t.status) ? 'disabled' : ''}>لغو مسابقه</button>
            <button class="btn btn-ghost btn-sm" id="admin-t-delete" ${t.status === 'active' ? 'disabled' : ''}>حذف مسابقه</button>
          </div>
        </div>
      `,
      actionsHtml: `<button class="btn btn-secondary" id="admin-t-close">بستن</button>`,
    });

    document.getElementById('admin-t-close')?.addEventListener('click', closeModal);
    document.getElementById('admin-t-force-start')?.addEventListener('click', async () => {
      if (!confirm('این مسابقه به‌صورت اجباری شروع شود؟')) return;
      await runTournamentAction(() => api.post(`/admin/tournaments/${t.id}/force-start`, {}), 'مسابقه شروع شد');
    });
    document.getElementById('admin-t-force-end')?.addEventListener('click', async () => {
      if (!confirm('این مسابقه به‌صورت اجباری پایان یابد؟')) return;
      await runTournamentAction(() => api.post(`/admin/tournaments/${t.id}/force-end`, {}), 'مسابقه پایان یافت');
    });
    document.getElementById('admin-t-cancel')?.addEventListener('click', async () => {
      if (!confirm('این مسابقه لغو شود؟')) return;
      await runTournamentAction(() => api.post(`/admin/tournaments/${t.id}/cancel`, {}), 'مسابقه لغو شد');
    });
    document.getElementById('admin-t-delete')?.addEventListener('click', async () => {
      if (!confirm('این مسابقه برای همیشه حذف شود؟')) return;
      try {
        await api.del(`/admin/tournaments/${t.id}`);
        toast('مسابقه حذف شد', 'success');
        closeModal();
        await loadTournaments();
        renderContent();
      } catch (err) {
        toast(err.message || 'حذف ناموفق بود', 'error');
      }
    });
  }

  async function runTournamentAction(fn, successMessage) {
    try {
      await fn();
      toast(successMessage, 'success');
      closeModal();
      await loadTournaments();
      renderContent();
    } catch (err) {
      toast(err.message || 'عملیات ناموفق بود', 'error');
    }
  }

  /* ------------------------------------------------------------ Marketplace */

  async function loadListings() {
    mLoading = true;
    renderContent();
    try {
      const params = new URLSearchParams();
      if (mFilters.search) params.set('search', mFilters.search);
      if (mFilters.status) params.set('status', mFilters.status);
      if (mFilters.category) params.set('category', mFilters.category);
      params.set('page', String(mPage));
      params.set('pageSize', '15');
      const [listings, stats] = await Promise.all([
        api.get(`/admin/marketplace?${params.toString()}`),
        api.get('/admin/marketplace/statistics'),
      ]);
      mResult = listings;
      mStats = stats;
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری بازار', 'error');
    } finally {
      mLoading = false;
    }
  }

  const M_STATUS_LABEL = { active: 'فعال', sold: 'فروخته‌شده', cancelled: 'لغوشده', expired: 'منقضی' };

  function marketplaceStatsTemplate() {
    if (!mStats) return '';
    return `
      <div class="admin-stats-grid" style="margin-bottom:var(--sp-4)">
        ${statCard('🛒', 'آگهی‌های فعال', mStats.marketplace.activeListings)}
        ${statCard('✅', 'کل فروش‌ها', mStats.marketplace.totalSold)}
        ${statCard('📈', 'فروش ۲۴ ساعت اخیر', mStats.marketplace.soldLast24h)}
        ${statCard('💰', 'حجم کل معاملات', mStats.marketplace.totalVolumeCoins)}
        ${statCard('🪙', 'سکه در گردش', mStats.economy.totalCoinsInCirculation)}
        ${statCard('📊', 'میانگین سکه هر کاربر', mStats.economy.avgCoinsPerUser)}
      </div>
    `;
  }

  function marketplaceToolbarTemplate() {
    return `
      <div class="mp-toolbar" style="grid-template-columns:2fr 1fr;">
        <input class="mp-search" id="admin-m-search" type="search" placeholder="جستجوی آیتم یا فروشنده…" aria-label="جستجوی آگهی‌های بازار" value="${escapeHtml(mFilters.search)}" />
        <select class="mp-select" id="admin-m-status">
          <option value="">همه وضعیت‌ها</option>
          ${Object.entries(M_STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${mFilters.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function marketplaceTableTemplate() {
    if (!mResult.listings.length) {
      return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🛒</span><p>آگهی‌ای یافت نشد.</p></div>`;
    }
    return `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>آیتم</th><th>فروشنده</th><th>خریدار</th><th>قیمت</th><th>وضعیت</th><th>تاریخ</th><th></th></tr></thead>
          <tbody>
            ${mResult.listings
              .map(
                (l) => `
              <tr>
                <td><strong>${escapeHtml(l.itemName)}</strong></td>
                <td>${escapeHtml(l.sellerDisplayName)}</td>
                <td>${l.buyerDisplayName ? escapeHtml(l.buyerDisplayName) : '—'}</td>
                <td>🪙 ${formatNumber(l.priceCoins)}</td>
                <td><span class="badge ${l.status === 'active' ? 'badge-purple' : l.status === 'sold' ? 'badge-success' : 'badge-danger'}">${M_STATUS_LABEL[l.status]}</span></td>
                <td>${relativeTime(l.createdAt)}</td>
                <td><button class="btn btn-ghost btn-sm" data-view-listing="${l.id}">مشاهده</button></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="mp-pagination">
        <button class="btn btn-secondary btn-sm" id="admin-m-prev" ${mResult.page <= 1 ? 'disabled' : ''}>قبلی</button>
        <span>صفحه ${formatNumber(mResult.page)} از ${formatNumber(mResult.totalPages)} (${formatNumber(mResult.total)} آگهی)</span>
        <button class="btn btn-secondary btn-sm" id="admin-m-next" ${mResult.page >= mResult.totalPages ? 'disabled' : ''}>بعدی</button>
      </div>
    `;
  }

  function marketplaceTemplate() {
    if (mLoading) return `${marketplaceStatsTemplate()}${marketplaceToolbarTemplate()}<div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>`;
    return `${marketplaceStatsTemplate()}${marketplaceToolbarTemplate()}${marketplaceTableTemplate()}`;
  }

  async function openListingModal(listingId) {
    let l;
    try {
      l = await api.get(`/admin/marketplace/${listingId}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری آگهی', 'error');
      return;
    }
    renderListingModal(l);
  }

  function renderListingModal(l) {
    openModal({
      title: l.itemName,
      bodyHtml: `
        <div class="admin-profile-modal">
          <p class="hero-sub">فروشنده: ${escapeHtml(l.sellerDisplayName)} (@${escapeHtml(l.sellerUsername)})</p>
          ${l.buyerDisplayName ? `<p class="hero-sub">خریدار: ${escapeHtml(l.buyerDisplayName)}</p>` : ''}
          <p class="hero-sub">قیمت: 🪙 ${formatNumber(l.priceCoins)} · وضعیت: ${M_STATUS_LABEL[l.status]}</p>

          ${
            l.status === 'active'
              ? `
            <div class="widget-title"><h3>تکمیل اجباری فروش</h3></div>
            <div class="field"><label for="admin-force-buyer">شناسه کاربری خریدار (UUID)</label><input id="admin-force-buyer" placeholder="00000000-0000-0000-0000-000000000000" /></div>
            <button class="btn btn-secondary btn-sm btn-block" id="admin-m-force-complete">تکمیل فروش</button>
            <button class="btn btn-danger btn-sm btn-block" id="admin-m-remove" style="margin-top:8px">حذف آگهی</button>`
              : ''
          }
        </div>
      `,
      actionsHtml: `<button class="btn btn-secondary" id="admin-m-close">بستن</button>`,
    });

    document.getElementById('admin-m-close')?.addEventListener('click', closeModal);
    document.getElementById('admin-m-remove')?.addEventListener('click', async () => {
      if (!confirm('این آگهی حذف شود؟')) return;
      try {
        await api.post(`/admin/marketplace/${l.id}/remove`, {});
        toast('آگهی حذف شد', 'success');
        closeModal();
        await loadListings();
        renderContent();
      } catch (err) {
        toast(err.message || 'حذف ناموفق بود', 'error');
      }
    });
    document.getElementById('admin-m-force-complete')?.addEventListener('click', async () => {
      const buyerId = document.getElementById('admin-force-buyer').value.trim();
      if (!buyerId) {
        toast('شناسه خریدار را وارد کنید', 'error');
        return;
      }
      try {
        await api.post(`/admin/marketplace/${l.id}/force-complete`, { buyerId });
        toast('فروش با موفقیت تکمیل شد', 'success');
        closeModal();
        await loadListings();
        renderContent();
      } catch (err) {
        toast(err.message || 'تکمیل فروش ناموفق بود', 'error');
      }
    });
  }

  /* ------------------------------------------------------------------ Clans */

  async function loadClans() {
    cLoading = true;
    renderContent();
    try {
      const params = new URLSearchParams();
      if (cFilters.search) params.set('search', cFilters.search);
      params.set('page', String(cPage));
      params.set('pageSize', '15');
      cResult = await api.get(`/admin/clans?${params.toString()}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری کلن‌ها', 'error');
    } finally {
      cLoading = false;
    }
  }

  function clansTemplate() {
    if (cLoading) return `<div class="mp-toolbar" style="grid-template-columns:1fr;"><input class="mp-search" id="admin-c-search" type="search" placeholder="جستجوی نام یا تگ کلن…" aria-label="جستجوی کلن‌ها" value="${escapeHtml(cFilters.search)}" /></div><div class="skeleton" style="height:340px;border-radius:var(--r-lg)"></div>`;
    const toolbar = `<div class="mp-toolbar" style="grid-template-columns:1fr;"><input class="mp-search" id="admin-c-search" type="search" placeholder="جستجوی نام یا تگ کلن…" aria-label="جستجوی کلن‌ها" value="${escapeHtml(cFilters.search)}" /></div>`;
    if (!cResult.clans.length) return `${toolbar}<div class="empty-state"><span class="empty-icon" aria-hidden="true">🛡️</span><p>کلنی یافت نشد.</p></div>`;
    return `
      ${toolbar}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>نام</th><th>مالک</th><th>اعضا</th><th>سطح</th><th>جام</th><th></th></tr></thead>
          <tbody>
            ${cResult.clans
              .map(
                (c) => `
              <tr>
                <td><strong>${escapeHtml(c.name)}</strong> <span class="clan-tag">[${escapeHtml(c.tag)}]</span></td>
                <td>${escapeHtml(c.ownerDisplayName)}</td>
                <td>${formatNumber(c.memberCount)}/30</td>
                <td>${formatNumber(c.level)}</td>
                <td>🏆 ${formatNumber(c.trophies)}</td>
                <td><button class="btn btn-ghost btn-sm" data-view-clan="${c.id}">مشاهده</button></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="mp-pagination">
        <button class="btn btn-secondary btn-sm" id="admin-c-prev" ${cResult.page <= 1 ? 'disabled' : ''}>قبلی</button>
        <span>صفحه ${formatNumber(cResult.page)} از ${formatNumber(cResult.totalPages)} (${formatNumber(cResult.total)} کلن)</span>
        <button class="btn btn-secondary btn-sm" id="admin-c-next" ${cResult.page >= cResult.totalPages ? 'disabled' : ''}>بعدی</button>
      </div>
    `;
  }

  async function openClanModal(clanId) {
    let c;
    try {
      c = await api.get(`/admin/clans/${clanId}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری کلن', 'error');
      return;
    }
    renderClanModal(c);
  }

  function renderClanModal(c) {
    openModal({
      title: `${c.name} [${c.tag}]`,
      bodyHtml: `
        <div class="admin-profile-modal">
          <div class="clan-stats-row" style="grid-template-columns:repeat(3,1fr);">
            <div><strong>${formatNumber(c.statistics.memberCount)}</strong><span>عضو</span></div>
            <div><strong>${formatNumber(c.trophies)}</strong><span>🏆 جام</span></div>
            <div><strong>${formatNumber(c.statistics.totalWins)}</strong><span>برد</span></div>
          </div>
          <div class="widget-title"><h3>اعضا</h3></div>
          <ul class="lb-list">
            ${c.members
              .map(
                (m) => `
              <li class="lb-row">
                <span class="lb-name">${escapeHtml(m.displayName)}</span>
                <span class="badge ${m.role === 'leader' ? 'badge-gold' : 'badge-purple'}">${m.role === 'leader' ? 'مالک' : 'عضو'}</span>
                ${m.role !== 'leader' ? `<button class="btn btn-ghost btn-sm" data-admin-kick="${m.userId}">اخراج</button><button class="btn btn-ghost btn-sm" data-admin-transfer="${m.userId}">انتقال مالکیت</button>` : ''}
              </li>`
              )
              .join('')}
          </ul>
          <div class="admin-action-grid">
            <button class="btn btn-danger btn-sm" id="admin-c-delete" style="grid-column:1/-1">حذف کلن</button>
          </div>
        </div>
      `,
      actionsHtml: `<button class="btn btn-secondary" id="admin-c-close">بستن</button>`,
    });

    document.getElementById('admin-c-close')?.addEventListener('click', closeModal);
    document.querySelectorAll('[data-admin-kick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('این عضو از کلن اخراج شود؟')) return;
        await runClanAction(() => api.post(`/admin/clans/${c.id}/kick`, { userId: btn.dataset.adminKick }), 'عضو اخراج شد', c.id);
      });
    });
    document.querySelectorAll('[data-admin-transfer]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('مالکیت کلن به این کاربر منتقل شود؟')) return;
        await runClanAction(
          () => api.post(`/admin/clans/${c.id}/transfer-ownership`, { userId: btn.dataset.adminTransfer }),
          'مالکیت منتقل شد',
          c.id
        );
      });
    });
    document.getElementById('admin-c-delete')?.addEventListener('click', async () => {
      if (!confirm('این کلن برای همیشه حذف شود؟')) return;
      try {
        await api.del(`/admin/clans/${c.id}`);
        toast('کلن حذف شد', 'success');
        closeModal();
        await loadClans();
        renderContent();
      } catch (err) {
        toast(err.message || 'حذف ناموفق بود', 'error');
      }
    });
  }

  async function runClanAction(fn, successMessage, clanId) {
    try {
      await fn();
      toast(successMessage, 'success');
      closeModal();
      await loadClans();
      renderContent();
      const refreshed = await api.get(`/admin/clans/${clanId}`);
      renderClanModal(refreshed);
    } catch (err) {
      toast(err.message || 'عملیات ناموفق بود', 'error');
    }
  }

  /* ------------------------------------------------------------------ Games */

  async function loadGames() {
    gLoading = true;
    renderContent();
    try {
      if (gView === 'active') {
        activeMatches = await api.get('/admin/games/active');
      } else {
        const params = new URLSearchParams();
        if (gFilters.search) params.set('search', gFilters.search);
        if (gFilters.status) params.set('status', gFilters.status);
        params.set('page', String(gPage));
        params.set('pageSize', '15');
        matchHistory = await api.get(`/admin/games/history?${params.toString()}`);
      }
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری بازی‌ها', 'error');
    } finally {
      gLoading = false;
    }
  }

  const G_STATUS_LABEL = { pending: 'در انتظار', active: 'در جریان', completed: 'پایان‌یافته', aborted: 'لغوشده' };

  function matchRowTemplate(m, showActions) {
    const [p1, p2] = m.players || [];
    return `
      <tr>
        <td>${escapeHtml(p1?.displayName || '؟')} <span class="lb-points">در برابر</span> ${escapeHtml(p2?.displayName || '؟')}</td>
        <td>${escapeHtml(m.modeName)}</td>
        <td><span class="badge ${m.status === 'active' ? 'badge-purple' : m.status === 'completed' ? 'badge-success' : 'badge-danger'}">${G_STATUS_LABEL[m.status]}</span></td>
        <td>${relativeTime(m.createdAt)}</td>
        <td>
          ${
            showActions
              ? `<button class="btn btn-ghost btn-sm" data-force-winner="${m.id}" data-p1="${p1?.userId}" data-p1-name="${escapeHtml(p1?.displayName || '')}" data-p2="${p2?.userId}" data-p2-name="${escapeHtml(p2?.displayName || '')}">تعیین برنده</button>
                 <button class="btn btn-ghost btn-sm" data-end-match="${m.id}">پایان</button>
                 <button class="btn btn-ghost btn-sm" data-cancel-match="${m.id}">لغو</button>`
              : ''
          }
        </td>
      </tr>
    `;
  }

  function gamesTemplate() {
    const tabs = `
      <div class="mp-tabs" role="tablist" style="margin-bottom:var(--sp-3)">
        <button class="mp-tab-btn${gView === 'active' ? ' active' : ''}" id="admin-g-active-tab">بازی‌های فعال</button>
        <button class="mp-tab-btn${gView === 'history' ? ' active' : ''}" id="admin-g-history-tab">تاریخچه</button>
      </div>
    `;
    if (gLoading) return `${tabs}<div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>`;

    if (gView === 'active') {
      if (!activeMatches.length) return `${tabs}<div class="empty-state"><span class="empty-icon" aria-hidden="true">🎮</span><p>بازی فعالی وجود ندارد.</p></div>`;
      return `
        ${tabs}
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>بازیکنان</th><th>حالت</th><th>وضعیت</th><th>شروع</th><th></th></tr></thead>
            <tbody>${activeMatches.map((m) => matchRowTemplate(m, true)).join('')}</tbody>
          </table>
        </div>
      `;
    }

    const toolbar = `
      <div class="mp-toolbar" style="grid-template-columns:2fr 1fr;">
        <input class="mp-search" id="admin-g-search" type="search" placeholder="جستجوی نام کاربری بازیکن…" aria-label="جستجوی بازیکنان" value="${escapeHtml(gFilters.search)}" />
        <select class="mp-select" id="admin-g-status">
          <option value="">همه وضعیت‌ها</option>
          ${Object.entries(G_STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${gFilters.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    `;
    if (!matchHistory.matches.length) return `${tabs}${toolbar}<div class="empty-state"><span class="empty-icon" aria-hidden="true">📜</span><p>بازی‌ای یافت نشد.</p></div>`;
    return `
      ${tabs}${toolbar}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>بازیکنان</th><th>حالت</th><th>وضعیت</th><th>تاریخ</th><th></th></tr></thead>
          <tbody>${matchHistory.matches.map((m) => matchRowTemplate(m, false)).join('')}</tbody>
        </table>
      </div>
      <div class="mp-pagination">
        <button class="btn btn-secondary btn-sm" id="admin-g-prev" ${matchHistory.page <= 1 ? 'disabled' : ''}>قبلی</button>
        <span>صفحه ${formatNumber(matchHistory.page)} از ${formatNumber(matchHistory.totalPages)}</span>
        <button class="btn btn-secondary btn-sm" id="admin-g-next" ${matchHistory.page >= matchHistory.totalPages ? 'disabled' : ''}>بعدی</button>
      </div>
    `;
  }

  async function forceWinnerPrompt(matchId, p1Id, p1Name, p2Id, p2Name) {
    const choice = prompt(`برنده را انتخاب کنید:\n1) ${p1Name}\n2) ${p2Name}\n\nعدد ۱ یا ۲ را وارد کنید:`);
    const winnerId = choice === '1' ? p1Id : choice === '2' ? p2Id : null;
    if (!winnerId) return;
    try {
      await api.post(`/admin/games/${matchId}/force-winner`, { winnerId });
      toast('برنده با موفقیت ثبت شد', 'success');
      await loadGames();
      renderContent();
    } catch (err) {
      toast(err.message || 'ثبت برنده ناموفق بود', 'error');
    }
  }

  /* --------------------------------------------------------- Announcements */

  async function loadAnnouncements() {
    aLoading = true;
    renderContent();
    try {
      announcementsResult = await api.get('/admin/announcements');
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری اعلانیه‌ها', 'error');
    } finally {
      aLoading = false;
    }
  }

  const ANNOUNCEMENT_TYPE_LABEL = { announcement: 'اطلاعیه', maintenance: 'تعمیرات', event: 'رویداد', tournament: 'مسابقه' };

  function announcementsTemplate() {
    if (aLoading) return `<div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>`;
    return `
      <section class="card widget-card">
        <div class="widget-title"><h3>ارسال اعلانیه جدید</h3></div>
        <div class="mp-sell-form">
          <div class="field"><label for="ann-title">عنوان</label><input id="ann-title" maxlength="120" /></div>
          <div class="field"><label for="ann-body">متن</label><input id="ann-body" maxlength="1000" /></div>
          <div class="field"><label for="ann-type">نوع</label>
            <select id="ann-type" class="mp-select">
              ${Object.entries(ANNOUNCEMENT_TYPE_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label for="ann-schedule">زمان‌بندی (اختیاری)</label><input id="ann-schedule" type="datetime-local" /></div>
          <button class="btn btn-primary btn-block" id="ann-send">ارسال اعلانیه</button>
        </div>
      </section>

      <div class="widget-title" style="margin-top:var(--sp-5)"><h3>تاریخچه اعلانیه‌ها</h3></div>
      ${
        announcementsResult.announcements.length
          ? `<ul class="lb-list">
              ${announcementsResult.announcements
                .map(
                  (a) => `
                <li class="lb-row">
                  <span class="badge badge-purple">${ANNOUNCEMENT_TYPE_LABEL[a.type]}</span>
                  <span class="lb-name">${escapeHtml(a.title)}</span>
                  <span class="lb-points">${a.sentAt ? 'ارسال‌شده' : 'زمان‌بندی‌شده'}</span>
                  <span class="lb-points">${relativeTime(a.sentAt || a.scheduledAt || a.createdAt)}</span>
                  ${!a.sentAt ? `<button class="btn btn-ghost btn-sm" data-delete-announcement="${a.id}">حذف</button>` : ''}
                </li>`
                )
                .join('')}
            </ul>`
          : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">📢</span><p>اعلانیه‌ای ثبت نشده است.</p></div>`
      }
    `;
  }

  /* --------------------------------------------------------------- Logs */

  async function loadLogs() {
    logsLoading = true;
    renderContent();
    try {
      const params = new URLSearchParams();
      if (logFilters.category) params.set('category', logFilters.category);
      params.set('page', String(logPage));
      params.set('pageSize', '25');
      logsResult = await api.get(`/admin/dashboard/logs?${params.toString()}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری گزارش‌ها', 'error');
    } finally {
      logsLoading = false;
    }
  }

  const LOG_CATEGORY_LABEL = {
    login: 'ورود',
    admin_action: 'اقدام مدیریتی',
    economy: 'اقتصاد',
    marketplace: 'بازار',
    clan: 'کلن',
    match: 'بازی',
  };

  function logsTemplate() {
    const toolbar = `
      <div class="mp-toolbar" style="grid-template-columns:1fr;">
        <select class="mp-select" id="admin-log-category">
          <option value="">همه دسته‌ها</option>
          ${Object.entries(LOG_CATEGORY_LABEL).map(([v, l]) => `<option value="${v}" ${logFilters.category === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    `;
    if (logsLoading) return `${toolbar}<div class="skeleton" style="height:340px;border-radius:var(--r-lg)"></div>`;
    if (!logsResult.logs.length) return `${toolbar}<div class="empty-state"><span class="empty-icon" aria-hidden="true">🗒️</span><p>گزارشی یافت نشد.</p></div>`;
    return `
      ${toolbar}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>دسته</th><th>عملیات</th><th>عامل</th><th>هدف</th><th>زمان</th></tr></thead>
          <tbody>
            ${logsResult.logs
              .map(
                (l) => `
              <tr>
                <td><span class="badge badge-purple">${LOG_CATEGORY_LABEL[l.category] || l.category}</span></td>
                <td>${escapeHtml(l.action)}</td>
                <td>${l.actorDisplayName ? escapeHtml(l.actorDisplayName) : '—'}</td>
                <td>${l.targetDisplayName ? escapeHtml(l.targetDisplayName) : '—'}</td>
                <td>${relativeTime(l.createdAt)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="mp-pagination">
        <button class="btn btn-secondary btn-sm" id="admin-log-prev" ${logsResult.page <= 1 ? 'disabled' : ''}>قبلی</button>
        <span>صفحه ${formatNumber(logsResult.page)} از ${formatNumber(logsResult.totalPages)} (${formatNumber(logsResult.total)} مورد)</span>
        <button class="btn btn-secondary btn-sm" id="admin-log-next" ${logsResult.page >= logsResult.totalPages ? 'disabled' : ''}>بعدی</button>
      </div>
    `;
  }

  /* ----------------------------------------------------------------- Settings */

  async function loadSettings() {
    settingsLoading = true;
    renderContent();
    try {
      settingsData = await api.get('/admin/settings');
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری تنظیمات', 'error');
    } finally {
      settingsLoading = false;
    }
  }

  const SETTINGS_LABEL = {
    economy: 'اقتصاد',
    xp: 'تجربه (XP)',
    rewards: 'جوایز',
    matchmaking: 'همتاسازی',
    tournament: 'مسابقات',
    marketplace: 'بازار',
  };

  function settingsTemplate() {
    if (settingsLoading) return `<div class="skeleton" style="height:400px;border-radius:var(--r-lg)"></div>`;
    return `
      <p class="hero-sub" style="margin-bottom:var(--sp-4)">این مقادیر برای مرجع و پیکربندی آینده ذخیره می‌شوند؛ اعمال زنده آن‌ها روی منطق بازی، مسابقات و بازار نیازمند توسعه در همان سیستم‌هاست.</p>
      <div class="admin-stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));align-items:start;">
        ${Object.entries(SETTINGS_LABEL)
          .map(
            ([category, label]) => `
          <div class="card admin-settings-card">
            <div class="widget-title"><h3>${label}</h3></div>
            <textarea class="admin-settings-textarea" id="settings-${category}" rows="6">${escapeHtml(
              JSON.stringify(settingsData[category]?.settings || {}, null, 2)
            )}</textarea>
            <button class="btn btn-secondary btn-sm btn-block" data-save-settings="${category}">ذخیره</button>
          </div>`
          )
          .join('')}
      </div>
    `;
  }

  async function saveSettings(category) {
    const textarea = document.getElementById(`settings-${category}`);
    let parsed;
    try {
      parsed = JSON.parse(textarea.value || '{}');
    } catch {
      toast('فرمت JSON نامعتبر است', 'error');
      return;
    }
    try {
      await api.put(`/admin/settings/${category}`, { settings: parsed });
      toast('تنظیمات ذخیره شد', 'success');
      await loadSettings();
      renderContent();
    } catch (err) {
      toast(err.message || 'ذخیره ناموفق بود', 'error');
    }
  }

  /* --------------------------------------------------------------- Render */

  function comingSoonTemplate(label) {
    return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🚧</span><p>بخش «${escapeHtml(label)}» به‌زودی اضافه می‌شود.</p></div>`;
  }

  function renderContent() {
    const content = document.getElementById('admin-content');
    if (!content) return;
    if (tab === 'dashboard') content.innerHTML = dashboardTemplate();
    else if (tab === 'users') content.innerHTML = usersTemplate();
    else if (tab === 'tournaments') content.innerHTML = tournamentsTemplate();
    else if (tab === 'marketplace') content.innerHTML = marketplaceTemplate();
    else if (tab === 'clans') content.innerHTML = clansTemplate();
    else if (tab === 'games') content.innerHTML = gamesTemplate();
    else if (tab === 'announcements') content.innerHTML = announcementsTemplate();
    else if (tab === 'logs') content.innerHTML = logsTemplate();
    else if (tab === 'settings') content.innerHTML = settingsTemplate();
    else content.innerHTML = comingSoonTemplate(TABS.find((t) => t.id === tab)?.label || '');
    bindEvents();
  }

  function bindEvents() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.querySelector('#admin-user-search')?.addEventListener(
      'input',
      debounce(async (e) => {
        userFilters.search = e.target.value;
        userPage = 1;
        await loadUsers();
        renderContent();
        document.getElementById('admin-user-search')?.focus();
      }, 400)
    );
    content.querySelector('#admin-user-role')?.addEventListener('change', async (e) => {
      userFilters.role = e.target.value;
      userPage = 1;
      await loadUsers();
      renderContent();
    });
    content.querySelector('#admin-user-status')?.addEventListener('change', async (e) => {
      userFilters.status = e.target.value;
      userPage = 1;
      await loadUsers();
      renderContent();
    });
    content.querySelector('#admin-user-sort')?.addEventListener('change', async (e) => {
      userFilters.sort = e.target.value;
      userPage = 1;
      await loadUsers();
      renderContent();
    });
    content.querySelector('#admin-users-prev')?.addEventListener('click', async () => {
      userPage = Math.max(1, userPage - 1);
      await loadUsers();
      renderContent();
    });
    content.querySelector('#admin-users-next')?.addEventListener('click', async () => {
      userPage = Math.min(usersResult.totalPages, userPage + 1);
      await loadUsers();
      renderContent();
    });
    content.querySelectorAll('[data-view-user]').forEach((btn) => {
      btn.addEventListener('click', () => openUserProfileModal(btn.dataset.viewUser));
    });

    /* --- Tournaments tab --- */
    content.querySelector('#admin-t-search')?.addEventListener(
      'input',
      debounce(async (e) => {
        tFilters.search = e.target.value;
        tPage = 1;
        await loadTournaments();
        renderContent();
        document.getElementById('admin-t-search')?.focus();
      }, 400)
    );
    content.querySelector('#admin-t-status')?.addEventListener('change', async (e) => {
      tFilters.status = e.target.value;
      tPage = 1;
      await loadTournaments();
      renderContent();
    });
    content.querySelector('#admin-t-prev')?.addEventListener('click', async () => {
      tPage = Math.max(1, tPage - 1);
      await loadTournaments();
      renderContent();
    });
    content.querySelector('#admin-t-next')?.addEventListener('click', async () => {
      tPage = Math.min(tResult.totalPages, tPage + 1);
      await loadTournaments();
      renderContent();
    });
    content.querySelectorAll('[data-view-tournament]').forEach((btn) => {
      btn.addEventListener('click', () => openTournamentModal(btn.dataset.viewTournament));
    });

    /* --- Marketplace tab --- */
    content.querySelector('#admin-m-search')?.addEventListener(
      'input',
      debounce(async (e) => {
        mFilters.search = e.target.value;
        mPage = 1;
        await loadListings();
        renderContent();
        document.getElementById('admin-m-search')?.focus();
      }, 400)
    );
    content.querySelector('#admin-m-status')?.addEventListener('change', async (e) => {
      mFilters.status = e.target.value;
      mPage = 1;
      await loadListings();
      renderContent();
    });
    content.querySelector('#admin-m-prev')?.addEventListener('click', async () => {
      mPage = Math.max(1, mPage - 1);
      await loadListings();
      renderContent();
    });
    content.querySelector('#admin-m-next')?.addEventListener('click', async () => {
      mPage = Math.min(mResult.totalPages, mPage + 1);
      await loadListings();
      renderContent();
    });
    content.querySelectorAll('[data-view-listing]').forEach((btn) => {
      btn.addEventListener('click', () => openListingModal(btn.dataset.viewListing));
    });

    /* --- Clans tab --- */
    content.querySelector('#admin-c-search')?.addEventListener(
      'input',
      debounce(async (e) => {
        cFilters.search = e.target.value;
        cPage = 1;
        await loadClans();
        renderContent();
        document.getElementById('admin-c-search')?.focus();
      }, 400)
    );
    content.querySelector('#admin-c-prev')?.addEventListener('click', async () => {
      cPage = Math.max(1, cPage - 1);
      await loadClans();
      renderContent();
    });
    content.querySelector('#admin-c-next')?.addEventListener('click', async () => {
      cPage = Math.min(cResult.totalPages, cPage + 1);
      await loadClans();
      renderContent();
    });
    content.querySelectorAll('[data-view-clan]').forEach((btn) => {
      btn.addEventListener('click', () => openClanModal(btn.dataset.viewClan));
    });

    /* --- Games tab --- */
    content.querySelector('#admin-g-active-tab')?.addEventListener('click', async () => {
      gView = 'active';
      await loadGames();
      renderContent();
    });
    content.querySelector('#admin-g-history-tab')?.addEventListener('click', async () => {
      gView = 'history';
      await loadGames();
      renderContent();
    });
    content.querySelector('#admin-g-search')?.addEventListener(
      'input',
      debounce(async (e) => {
        gFilters.search = e.target.value;
        gPage = 1;
        await loadGames();
        renderContent();
        document.getElementById('admin-g-search')?.focus();
      }, 400)
    );
    content.querySelector('#admin-g-status')?.addEventListener('change', async (e) => {
      gFilters.status = e.target.value;
      gPage = 1;
      await loadGames();
      renderContent();
    });
    content.querySelector('#admin-g-prev')?.addEventListener('click', async () => {
      gPage = Math.max(1, gPage - 1);
      await loadGames();
      renderContent();
    });
    content.querySelector('#admin-g-next')?.addEventListener('click', async () => {
      gPage = Math.min(matchHistory.totalPages, gPage + 1);
      await loadGames();
      renderContent();
    });
    content.querySelectorAll('[data-force-winner]').forEach((btn) => {
      btn.addEventListener('click', () =>
        forceWinnerPrompt(btn.dataset.forceWinner, btn.dataset.p1, btn.dataset.p1Name, btn.dataset.p2, btn.dataset.p2Name)
      );
    });
    content.querySelectorAll('[data-end-match]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('این بازی بدون برنده پایان یابد؟')) return;
        try {
          await api.post(`/admin/games/${btn.dataset.endMatch}/end`, {});
          toast('بازی پایان یافت', 'success');
          await loadGames();
          renderContent();
        } catch (err) {
          toast(err.message || 'عملیات ناموفق بود', 'error');
        }
      });
    });
    content.querySelectorAll('[data-cancel-match]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('این بازی لغو شود؟')) return;
        try {
          await api.post(`/admin/games/${btn.dataset.cancelMatch}/cancel`, {});
          toast('بازی لغو شد', 'success');
          await loadGames();
          renderContent();
        } catch (err) {
          toast(err.message || 'عملیات ناموفق بود', 'error');
        }
      });
    });

    /* --- Announcements tab --- */
    content.querySelector('#ann-send')?.addEventListener('click', async (e) => {
      const title = document.getElementById('ann-title').value.trim();
      const body = document.getElementById('ann-body').value.trim();
      const type = document.getElementById('ann-type').value;
      const scheduleVal = document.getElementById('ann-schedule').value;
      if (!title || !body) {
        toast('عنوان و متن الزامی است', 'error');
        return;
      }
      e.target.disabled = true;
      try {
        await api.post('/admin/announcements', {
          title,
          body,
          type,
          scheduledAt: scheduleVal ? new Date(scheduleVal).toISOString() : undefined,
        });
        toast('اعلانیه ثبت شد', 'success');
        await loadAnnouncements();
        renderContent();
      } catch (err) {
        toast(err.message || 'ارسال ناموفق بود', 'error');
        e.target.disabled = false;
      }
    });
    content.querySelectorAll('[data-delete-announcement]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('این اعلانیه حذف شود؟')) return;
        try {
          await api.del(`/admin/announcements/${btn.dataset.deleteAnnouncement}`);
          toast('اعلانیه حذف شد', 'success');
          await loadAnnouncements();
          renderContent();
        } catch (err) {
          toast(err.message || 'حذف ناموفق بود', 'error');
        }
      });
    });

    /* --- Logs tab --- */
    content.querySelector('#admin-log-category')?.addEventListener('change', async (e) => {
      logFilters.category = e.target.value;
      logPage = 1;
      await loadLogs();
      renderContent();
    });
    content.querySelector('#admin-log-prev')?.addEventListener('click', async () => {
      logPage = Math.max(1, logPage - 1);
      await loadLogs();
      renderContent();
    });
    content.querySelector('#admin-log-next')?.addEventListener('click', async () => {
      logPage = Math.min(logsResult.totalPages, logPage + 1);
      await loadLogs();
      renderContent();
    });

    /* --- Settings tab --- */
    content.querySelectorAll('[data-save-settings]').forEach((btn) => {
      btn.addEventListener('click', () => saveSettings(btn.dataset.saveSettings));
    });
  }

  /* ------------------------------------------------------- User profile modal */

  async function openUserProfileModal(userId) {
    let profile;
    try {
      profile = await api.get(`/admin/users/${userId}`);
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری پروفایل', 'error');
      return;
    }
    renderUserProfileModal(profile);
  }

  function renderUserProfileModal(u) {
    const isBanned = u.status === 'banned';
    const isMuted = u.mutedUntil && new Date(u.mutedUntil) > new Date();

    openModal({
      title: `پروفایل ${u.displayName}`,
      bodyHtml: `
        <div class="admin-profile-modal">
          <div class="clan-stats-row" style="grid-template-columns:repeat(3,1fr);">
            <div><strong>${formatNumber(u.stats?.gamesPlayed ?? 0)}</strong><span>بازی</span></div>
            <div><strong>${formatNumber(u.stats?.gamesWon ?? 0)}</strong><span>برد</span></div>
            <div><strong>${formatNumber(u.stats?.rankPoints ?? 0)}</strong><span>امتیاز رتبه</span></div>
          </div>
          <p class="hero-sub">@${escapeHtml(u.username)} · ${escapeHtml(u.email)}</p>
          <p class="hero-sub">کلن: ${u.clan ? escapeHtml(u.clan.name) : 'ندارد'} · اقلام انبار: ${formatNumber(u.inventoryCount)}</p>

          <div class="admin-action-grid">
            <div class="field"><label>نقش</label>
              <select id="admin-role-select" class="mp-select">
                ${Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-secondary btn-sm" id="admin-role-save">ذخیره نقش</button>

            <button class="btn ${isBanned ? 'btn-primary' : 'btn-danger'} btn-sm" id="admin-ban-toggle">${isBanned ? 'رفع مسدودیت' : 'مسدود کردن'}</button>
            <button class="btn ${isMuted ? 'btn-primary' : 'btn-secondary'} btn-sm" id="admin-mute-toggle">${isMuted ? 'رفع بی‌صدایی' : 'بی‌صدا کردن (۶۰ دقیقه)'}</button>

            <button class="btn btn-ghost btn-sm" id="admin-reset-coins">ریست سکه (۱۰۰۰)</button>
            <button class="btn btn-ghost btn-sm" id="admin-reset-xp">ریست XP</button>
            <button class="btn btn-ghost btn-sm" id="admin-reset-inventory">ریست انبار</button>
            <button class="btn btn-ghost btn-sm" id="admin-reset-stats">ریست آمار</button>
          </div>
        </div>
      `,
      actionsHtml: `<button class="btn btn-secondary" id="admin-profile-close">بستن</button>`,
    });

    document.getElementById('admin-profile-close')?.addEventListener('click', closeModal);

    document.getElementById('admin-role-save')?.addEventListener('click', async () => {
      const role = document.getElementById('admin-role-select').value;
      await runAction(() => api.post(`/admin/users/${u.id}/role`, { role }), 'نقش کاربر به‌روزرسانی شد', u.id);
    });

    document.getElementById('admin-ban-toggle')?.addEventListener('click', async () => {
      if (!confirm(isBanned ? 'رفع مسدودیت این کاربر؟' : 'مسدود کردن این کاربر؟')) return;
      await runAction(
        () => (isBanned ? api.post(`/admin/users/${u.id}/unban`, {}) : api.post(`/admin/users/${u.id}/ban`, {})),
        isBanned ? 'کاربر رفع مسدودیت شد' : 'کاربر مسدود شد',
        u.id
      );
    });

    document.getElementById('admin-mute-toggle')?.addEventListener('click', async () => {
      await runAction(
        () => (isMuted ? api.post(`/admin/users/${u.id}/unmute`, {}) : api.post(`/admin/users/${u.id}/mute`, { minutes: 60 })),
        isMuted ? 'بی‌صدایی کاربر برداشته شد' : 'کاربر به مدت ۶۰ دقیقه بی‌صدا شد',
        u.id
      );
    });

    document.getElementById('admin-reset-coins')?.addEventListener('click', async () => {
      if (!confirm('سکه‌های این کاربر به ۱۰۰۰ بازنشانی شود؟')) return;
      await runAction(() => api.post(`/admin/users/${u.id}/reset/coins`, {}), 'سکه‌ها بازنشانی شد', u.id);
    });
    document.getElementById('admin-reset-xp')?.addEventListener('click', async () => {
      if (!confirm('XP و سطح این کاربر بازنشانی شود؟')) return;
      await runAction(() => api.post(`/admin/users/${u.id}/reset/xp`, {}), 'XP بازنشانی شد', u.id);
    });
    document.getElementById('admin-reset-inventory')?.addEventListener('click', async () => {
      if (!confirm('همه اقلام انبار این کاربر حذف شود؟ این عملیات قابل بازگشت نیست.')) return;
      await runAction(() => api.post(`/admin/users/${u.id}/reset/inventory`, {}), 'انبار بازنشانی شد', u.id);
    });
    document.getElementById('admin-reset-stats')?.addEventListener('click', async () => {
      if (!confirm('آمار بازی این کاربر بازنشانی شود؟')) return;
      await runAction(() => api.post(`/admin/users/${u.id}/reset/statistics`, {}), 'آمار بازنشانی شد', u.id);
    });
  }

  async function runAction(fn, successMessage, userId) {
    try {
      await fn();
      toast(successMessage, 'success');
      closeModal();
      await loadUsers();
      renderContent();
      const refreshed = await api.get(`/admin/users/${userId}`);
      renderUserProfileModal(refreshed);
    } catch (err) {
      toast(err.message || 'عملیات ناموفق بود', 'error');
    }
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  shell();
  await loadOverview();
  renderContent();
}
