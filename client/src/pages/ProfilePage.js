import { AuthStore } from '../services/authStore.js';
import { formatNumber, escapeHtml, relativeTime } from '../utils/format.js';
import { animateCounter } from '../utils/effects.js';
import { getMatchHistory, getAchievements } from '../utils/sampleData.js';

/**
 * Competitive player profile. Core identity fields (level, coins, displayName)
 * come from AuthStore / the real /users/me API. Supplemental stats — win/loss
 * record, rating history, bio, achievements, match-history detail — are not
 * yet exposed by the server (see server/src/routes/userRoutes.js +
 * matchRoutes.js) so they're sourced from utils/sampleData.js as clearly
 * marked placeholders, shaped to match what those endpoints should return.
 */
export async function renderProfilePage(root) {
  const user = AuthStore.user;
  const stats = deriveStats(user);
  const matches = getMatchHistory();
  const achievements = getAchievements();

  root.innerHTML = template(user, stats, matches, achievements);

  root.querySelectorAll('.counter[data-target]').forEach((el) => {
    animateCounter(el, Number(el.dataset.target), { formatFn: (n) => formatNumber(Math.round(n)) });
  });
}

function deriveStats(user) {
  const wins = 38;
  const losses = 14;
  const total = wins + losses;
  return {
    wins,
    losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    rating: 1450 + (user?.level ?? 1) * 12,
    friendsCount: 24,
    favoriteMode: 'کلاسیک رتبه‌بندی',
    ratingHistory: [1180, 1230, 1210, 1290, 1340, 1320, 1410, 1450 + (user?.level ?? 1) * 12],
    xpPercent: 64,
    onlineStatus: 'آنلاین',
    lastActive: 'اکنون',
  };
}

function template(user, stats, matches, achievements) {
  return `
    <div class="container page-pad profile-page">
      ${profileBanner(user, stats)}

      <div class="widget-grid">
        <section class="card stat-tile span-4"><span class="stat-tile-value success counter" data-target="${stats.wins}">۰</span><span class="stat-tile-label">برد</span></section>
        <section class="card stat-tile span-4"><span class="stat-tile-value danger counter" data-target="${stats.losses}">۰</span><span class="stat-tile-label">باخت</span></section>
        <section class="card stat-tile span-4"><span class="stat-tile-value counter" data-target="${stats.winRate}">۰</span><span class="stat-tile-label">٪ نرخ برد</span></section>

        <section class="card widget-card span-7">
          <div class="widget-title"><h3>روند امتیاز رتبه‌بندی</h3>${badgeIcon()}</div>
          ${ratingGraph(stats.ratingHistory)}
        </section>

        <section class="card widget-card span-5">
          <div class="widget-title"><h3>درباره من</h3></div>
          <p class="hero-sub" style="margin-bottom:0">بازیکن رقابتی دست یا خالی. عاشق حدس‌های سریع و مسابقات رتبه‌بندی شبانه‌ام 🤲</p>
          <div class="widget-list" style="margin-top:var(--sp-3)">
            <div class="widget-row" style="justify-content:space-between"><span class="friend-activity">حالت مورد علاقه</span><span class="badge badge-gold">${escapeHtml(stats.favoriteMode)}</span></div>
            <div class="widget-row" style="justify-content:space-between"><span class="friend-activity">دوستان</span><span class="badge badge-purple">${formatNumber(stats.friendsCount)} نفر</span></div>
          </div>
        </section>

        <section class="card widget-card span-12">
          <div class="section-header">
            <h2>تاریخچه مسابقات</h2>
            <span class="badge badge-purple">نمونه — به‌زودی همگام با سرور</span>
          </div>
          ${matchHistoryList(matches)}
        </section>

        <section class="card widget-card span-12">
          <div class="section-header">
            <div>
              <p class="section-eyebrow">${trophyIcon()} دیوار افتخارات</p>
              <h2>نشان‌ها و دستاوردها</h2>
            </div>
            <span class="badge badge-gold">${achievements.filter((a) => a.unlocked).length} از ${achievements.length}</span>
          </div>
          ${achievementWall(achievements)}
        </section>
      </div>
    </div>
  `;
}

function profileBanner(user, stats) {
  const ringPercent = stats.xpPercent;
  return `
    <section class="profile-banner card-glass">
      <div class="profile-avatar-wrap">
        <span class="avatar profile-avatar level-ring" style="--ring:${ringPercent}%">
          ${user?.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" />` : (user?.displayName?.[0] || '؟')}
        </span>
        <span class="profile-status-dot" title="${escapeHtml(stats.onlineStatus)}"></span>
        <span class="profile-rank-emblem" title="نشان رتبه">🛡️</span>
      </div>

      <div class="profile-id">
        <div class="profile-name-row">
          <span class="profile-name">${escapeHtml(user?.displayName || 'بازیکن')}</span>
          <span class="profile-flag" aria-hidden="true" title="ایران">🇮🇷</span>
          <span class="badge badge-gold">سطح ${user?.level ?? 1}</span>
        </div>
        <p class="profile-bio">بازیکن رقابتی · دنبال‌کننده فصل جاری</p>
        <div class="profile-meta-row">
          <span>${stats.onlineStatus === 'آنلاین' ? '🟢' : '⚪️'} <strong>${escapeHtml(stats.onlineStatus)}</strong></span>
          <span>آخرین فعالیت: <strong>${escapeHtml(stats.lastActive)}</strong></span>
          <span>امتیاز رتبه‌بندی: <strong class="counter" data-target="${stats.rating}">۰</strong></span>
        </div>
        <div class="profile-xp-track">
          <div class="profile-xp-bar-track"><div class="profile-xp-bar-fill" style="width:${ringPercent}%"></div></div>
          <div class="profile-xp-label"><span>سطح ${user?.level ?? 1}</span><span>${ringPercent}٪ تا سطح بعد</span></div>
        </div>
      </div>

      <div class="profile-prestige">
        <span class="prestige-icon">👑</span>
        <span class="prestige-value">طلایی III</span>
        <span class="prestige-label">نشان فصل</span>
      </div>
    </section>
  `;
}

function ratingGraph(history) {
  const w = 560, h = 96, pad = 8;
  const min = Math.min(...history), max = Math.max(...history);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (history.length - 1);
  const points = history.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`;
  return `
    <div class="rating-graph-wrap">
      <svg class="rating-graph-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ratingGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#f3dd96" />
          </linearGradient>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.5" />
            <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path class="rating-area" d="${areaPath}" />
        <path class="rating-line" d="${path}" />
        <circle class="rating-dot" cx="${points[points.length - 1][0]}" cy="${points[points.length - 1][1]}" r="4" />
      </svg>
    </div>
  `;
}

function matchHistoryList(matches) {
  return `
    <div class="widget-list">
      ${matches
        .map((m) => {
          const win = m.result === 'win';
          const mins = Math.floor(m.durationSec / 60);
          const secs = m.durationSec % 60;
          return `
        <div class="match-history-row result-${m.result}">
          <span class="badge ${win ? 'badge-success' : 'badge-danger'}">${win ? 'برد' : 'باخت'}</span>
          <div class="mh-opponent">
            <span class="avatar avatar-sm">${escapeHtml(m.opponent[0])}</span>
            <div class="mh-name-block">
              <span class="mh-opp-name">برابر ${escapeHtml(m.opponent)}</span>
              <span class="mh-mode">${escapeHtml(m.mode)}</span>
            </div>
          </div>
          <span class="mh-rating ${m.ratingChange >= 0 ? 'positive' : 'negative'}">${m.ratingChange >= 0 ? '+' : ''}${m.ratingChange}</span>
          <span class="mh-duration">${mins}:${String(secs).padStart(2, '0')}</span>
          <span class="mh-time">${escapeHtml(relativeTime(m.timestamp))}</span>
        </div>`;
        })
        .join('')}
    </div>
  `;
}

function achievementWall(achievements) {
  return `
    <div class="achievement-grid">
      ${achievements
        .map((a) => {
          const hasProgress = !a.unlocked && a.target;
          return `
        <div class="achievement-tile rarity-${a.rarity} ${a.unlocked ? '' : 'locked'}">
          <span class="achievement-icon">${a.icon}</span>
          <span class="achievement-name">${escapeHtml(a.name)}</span>
          <span class="badge badge-rarity badge-rarity-${a.rarity}">${rarityLabel(a.rarity)}</span>
          ${
            hasProgress
              ? `<div class="achievement-progress-track"><div class="achievement-progress-fill" style="width:${(a.progress / a.target) * 100}%"></div></div>`
              : ''
          }
        </div>`;
        })
        .join('')}
    </div>
  `;
}

function rarityLabel(r) {
  return { common: 'معمولی', rare: 'کمیاب', epic: 'حماسی', legendary: 'افسانه‌ای' }[r] || r;
}

function badgeIcon() {
  return `<svg class="widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 9 11l4 4 8-8"/><path d="M17 7h4v4"/></svg>`;
}
function trophyIcon() {
  return `<svg class="widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M10 13v3M14 13v3"/><path d="M8 20h8"/></svg>`;
}
