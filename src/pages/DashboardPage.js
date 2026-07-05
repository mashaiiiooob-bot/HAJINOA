import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { formatNumber, escapeHtml } from '../utils/format.js';
import { navigate } from '../router.js';
import { spawnParticles, animateCounter } from '../utils/effects.js';
import {
  getDailyChallenges,
  getLiveActivity,
  getFriendsOnline,
  getSeasonProgress,
  getUpcomingTournaments,
  getRecommendedModes,
} from '../utils/sampleData.js';

export async function renderDashboardPage(root) {
  root.innerHTML = skeletonTemplate();

  const user = AuthStore.user;
  let leaderboard = [];
  let dailyReward = null;
  try {
    leaderboard = await loadLeaderboard();
  } catch {
    /* leaderboard is non-critical — page still renders without it */
  }
  try {
    const { data, error } = await supabase.rpc('daily_reward_status');
    if (!error && data?.[0]) {
      const r = data[0];
      dailyReward = {
        claimedToday: r.out_claimed_today,
        currentStreak: r.out_current_streak,
        coinsPerDay: r.out_coins_per_day,
        xpPerDay: r.out_xp_per_day,
      };
    }
  } catch {
    /* daily reward widget falls back to sample data below if this fails */
  }

  root.innerHTML = template(user, leaderboard, dailyReward);
  root.querySelector('#cta-play')?.addEventListener('click', () => navigate('/game'));
  root.querySelector('#claim-daily-reward')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const { data, error } = await supabase.rpc('claim_daily_reward');
    if (error) {
      btn.disabled = false;
      btn.textContent = error.message || 'خطا در دریافت پاداش';
      return;
    }
    const result = data?.[0];
    btn.outerHTML = `<span class="badge badge-success">دریافت شد! +${formatNumber(result?.out_coins_awarded ?? 0)} سکه</span>`;
    if (user) user.coins = (user.coins ?? 0) + (result?.out_coins_awarded ?? 0);
  });

  spawnParticles(root.querySelector('.hero-particle-field'), 16);
  root.querySelectorAll('.counter[data-target]').forEach((el) => {
    animateCounter(el, Number(el.dataset.target), { formatFn: (n) => formatNumber(Math.round(n)) });
  });
}

/** loadLeaderboard() — top players by rank_points, replacing the old
 *  /users/leaderboard Express endpoint with a direct Supabase query. */
async function loadLeaderboard() {
  const { data, error } = await supabase
    .from('player_stats')
    .select('user_id, rank_points, users(display_name, level)')
    .order('rank_points', { ascending: false })
    .limit(6);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    displayName: row.users?.display_name || 'بازیکن',
    level: row.users?.level ?? 1,
    rankPoints: row.rank_points,
  }));
}

function skeletonTemplate() {
  return `
    <div class="container page-pad">
      <div class="skeleton" style="height:300px;border-radius:var(--r-xl);margin-bottom:24px"></div>
      <div class="widget-grid">
        <div class="skeleton" style="height:220px;border-radius:var(--r-lg);grid-column:span 8"></div>
        <div class="skeleton" style="height:220px;border-radius:var(--r-lg);grid-column:span 4"></div>
      </div>
    </div>
  `;
}

function template(user, leaderboard, dailyReward) {
  return `
    <div class="container page-pad dashboard">
      ${heroScene(user)}

      <div class="widget-grid">
        <section class="card widget-card span-8 enter-stagger" style="--i:1">
          <div class="section-header">
            <div>
              <p class="section-eyebrow">${neuralDot()} وضعیت زنده</p>
              <h2>فعالیت دوستان و انجمن</h2>
            </div>
          </div>
          ${friendsAndActivity()}
        </section>

        <section class="card widget-card span-4 enter-stagger" style="--i:2">
          <div class="widget-title"><h3>چالش‌های روزانه</h3>${targetIcon()}</div>
          ${dailyChallenges(dailyReward)}
        </section>

        <section class="card widget-card span-4 enter-stagger" style="--i:3">
          <div class="widget-title"><h3>پیشرفت فصل</h3>${seasonIcon()}</div>
          ${seasonProgress(user)}
        </section>

        <section class="card widget-card span-4 enter-stagger" style="--i:4">
          <div class="widget-title"><h3>تورنمنت‌های پیش رو</h3>${tourneyIcon()}</div>
          ${upcomingTournaments()}
        </section>

        <section class="card widget-card span-4 enter-stagger" style="--i:5">
          <div class="widget-title"><h3>حالت‌های پیشنهادی</h3>${modeIcon()}</div>
          ${recommendedModes()}
        </section>

        <section class="card widget-card span-12 leaderboard-preview card-arcane-sweep enter-stagger" style="--i:6">
          <div class="section-header">
            <h2>جدول رتبه‌بندی برتر</h2>
            <a href="#/leaderboard" class="btn-ghost btn-sm">مشاهده همه</a>
          </div>
          ${leaderboard.length ? renderLeaderboardRows(leaderboard) : renderEmptyLeaderboard()}
        </section>
      </div>
    </div>
  `;
}

/* ---- Hero: living animated "competitive intelligence arena" scene ---- */
function heroScene(user) {
  return `
    <section class="hero-scene card-glass shimmer-sweep spotlight">
      <div class="arcane-seal arcane-seal--reverse" aria-hidden="true" style="bottom:-260px; inset-inline-start:-200px; opacity:0.25;"></div>
      <div class="hero-neural" aria-hidden="true">
        <svg viewBox="0 0 700 300" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="neuralGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f3dd96" />
              <stop offset="100%" stop-color="#8b5cf6" />
            </linearGradient>
          </defs>
          ${neuralLines()}
        </svg>
      </div>
      <div class="hero-particle-field" aria-hidden="true"></div>

      <div class="hero-brain" aria-hidden="true">
        <div class="hero-brain-glow"></div>
        <svg class="hero-brain-icon" viewBox="0 0 100 100" fill="none" stroke="url(#neuralGrad2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <defs>
            <linearGradient id="neuralGrad2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f3dd96" />
              <stop offset="100%" stop-color="#c4b1ff" />
            </linearGradient>
          </defs>
          <path d="M38 22c-14 0-22 11-22 24 0 8 4 13 4 13s-6 6-6 15c0 11 9 18 19 18 6 0 10-3 10-3s6 5 14 5c11 0 20-8 20-19 0-5-2-8-2-8s7-5 7-15c0-13-9-22-21-22-4 0-7 1-7 1s-4-9-16-9Z" />
          <path d="M50 22v54M38 35c4 2 8 6 8 12M38 60c4-2 8-6 8-12M62 35c-4 2-8 6-8 12M62 60c-4-2-8-6-8-12" />
        </svg>
      </div>

      <div class="hero-content">
        <p class="eyebrow">${neuralDot()} میدان هوش رقابتی</p>
        <h1>${escapeHtml(user?.displayName || 'بازیکن')} عزیز، آماده نبرد بعدی هستید؟ 👋</h1>
        <p class="hero-sub">حریف، توکن را پنهان می‌کند — تیزهوشی شما تصمیم می‌گیرد. در صف رتبه‌بندی شرکت کنید و جایگاهتان را بالا ببرید.</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg btn-magnetic" id="cta-play">شروع بازی کلاسیک</button>
          <a href="#/leaderboard" class="btn btn-secondary btn-lg btn-magnetic">مشاهده رتبه‌بندی</a>
        </div>
        <div class="hero-stats">
          <div class="hero-stat">
            <span class="hero-stat-value counter" data-target="${user?.level ?? 1}">۰</span>
            <span class="hero-stat-label">سطح</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value counter" data-target="${user?.coins ?? 0}">۰</span>
            <span class="hero-stat-label">سکه</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function neuralDot() {
  return `<span class="live-dot" style="background:var(--c-purple-light)"></span>`;
}

function neuralLines() {
  const points = [
    [60, 60], [140, 110], [230, 50], [310, 140], [400, 70],
    [480, 150], [560, 90], [620, 160], [180, 200], [340, 220],
  ];
  const lines = [
    [0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [3, 9], [8, 1], [9, 4],
  ];
  const lineSvg = lines
    .map(([a, b], i) => {
      const [x1, y1] = points[a];
      const [x2, y2] = points[b];
      return `<line class="neural-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="animation-delay:${(i * 0.3).toFixed(1)}s" />`;
    })
    .join('');
  const nodeSvg = points
    .map(([x, y], i) => `<circle class="neural-node" cx="${x}" cy="${y}" r="2.4" style="animation-delay:${(i * 0.25).toFixed(1)}s" />`)
    .join('');
  return lineSvg + nodeSvg;
}

/* ---- Widgets ---- */
function dailyChallenges(dailyReward) {
  const items = getDailyChallenges();
  return `
    <div class="widget-list">
      ${dailyReward ? dailyRewardRow(dailyReward) : ''}
      ${items
        .map(
          (c) => `
        <div class="widget-row challenge-row">
          <div class="challenge-meta">
            <span class="challenge-name">${escapeHtml(c.name)}</span>
            <div class="challenge-progress-track"><div class="challenge-progress-fill" style="width:${Math.min(100, (c.progress / c.target) * 100)}%"></div></div>
          </div>
          <span class="challenge-reward">${escapeHtml(c.reward)}</span>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function dailyRewardRow(reward) {
  return `
    <div class="widget-row challenge-row">
      <div class="challenge-meta">
        <span class="challenge-name">پاداش روزانه ورود ${reward.currentStreak > 1 ? `· ${reward.currentStreak} روز متوالی` : ''}</span>
        <div class="challenge-progress-track"><div class="challenge-progress-fill" style="width:${reward.claimedToday ? 100 : 0}%"></div></div>
      </div>
      ${
        reward.claimedToday
          ? `<span class="badge badge-success">دریافت شد</span>`
          : `<button id="claim-daily-reward" class="btn btn-sm btn-primary">دریافت ${formatNumber(reward.coinsPerDay)} سکه</button>`
      }
    </div>
  `;
}

function friendsAndActivity() {
  const friends = getFriendsOnline();
  const activity = getLiveActivity();
  return `
    <div class="widget-grid" style="gap:var(--sp-5)">
      <div class="span-6">
        <p class="section-eyebrow" style="margin-bottom:var(--sp-2)">دوستان آنلاین · ${friends.length}</p>
        <div class="widget-list">
          ${friends
            .map(
              (f) => `
            <div class="widget-row friend-row">
              <span class="avatar avatar-sm">${escapeHtml(f.name[0])}</span>
              <span class="friend-name">${escapeHtml(f.name)}</span>
              <span class="friend-activity">${escapeHtml(f.activity)}</span>
              <span class="friend-status-dot friend-status-${f.status}"></span>
            </div>`
            )
            .join('')}
        </div>
      </div>
      <div class="span-6">
        <p class="section-eyebrow" style="margin-bottom:var(--sp-2)">رویدادهای اخیر</p>
        <div class="widget-list">
          ${activity
            .map(
              (a) => `
            <div class="widget-row activity-row">
              <span class="activity-icon">${a.icon}</span>
              <span class="activity-text">${escapeHtml(a.text)}</span>
              <span class="activity-time">${escapeHtml(a.time)}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

function seasonProgress(user) {
  const s = getSeasonProgress(user);
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c - (s.percent / 100) * c;
  return `
    <div class="season-progress-ring-wrap">
      <svg class="season-ring" viewBox="0 0 76 76">
        <defs>
          <linearGradient id="seasonGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f3dd96" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--c-bg-elevated)" stroke-width="7" />
        <circle cx="38" cy="38" r="${r}" fill="none" stroke="url(#seasonGrad)" stroke-width="7"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
          transform="rotate(-90 38 38)" />
      </svg>
      <div class="season-info">
        <span class="season-tier text-gradient-gold">${escapeHtml(s.tier)}</span>
        <span class="season-tier-sub">${s.daysLeft} روز تا پایان فصل</span>
      </div>
    </div>
  `;
}

function upcomingTournaments() {
  const items = getUpcomingTournaments();
  return `
    <div class="widget-list">
      ${items
        .map(
          (t) => `
        <div class="tournament-card">
          <div>
            <div class="tournament-name">${escapeHtml(t.name)}</div>
            <div class="tournament-meta">جایزه: ${escapeHtml(t.prizePool)}</div>
          </div>
          <span class="tournament-countdown">${formatCountdown(t.startsInMin)}</span>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function formatCountdown(min) {
  if (min < 60) return `${min} د`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} س`;
  return `${Math.floor(h / 24)} روز`;
}

function recommendedModes() {
  const items = getRecommendedModes();
  return `
    <div class="mode-grid">
      ${items
        .map(
          (m) => `
        <div class="mode-tile">
          <span class="mode-tile-icon">${m.icon}</span>
          <span class="mode-tile-name">${escapeHtml(m.name)}</span>
          <span class="mode-tile-desc">${escapeHtml(m.desc)}</span>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function targetIcon() { return svgIcon('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/>'); }
function seasonIcon() { return svgIcon('<path d="M12 2 9 9l-7 1 5 5-1 7 6-3 6 3-1-7 5-5-7-1Z"/>'); }
function tourneyIcon() { return svgIcon('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M10 13v3M14 13v3"/><path d="M8 20h8"/>'); }
function modeIcon() { return svgIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'); }

function svgIcon(paths) {
  return `<svg class="widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function renderLeaderboardRows(rows) {
  return `
    <ol class="lb-list">
      ${rows
        .map(
          (r, i) => `
        <li class="lb-row">
          <span class="lb-rank ${i < 3 ? 'lb-rank-top' : ''}">${i + 1}</span>
          <span class="avatar avatar-sm">${escapeHtml(r.displayName?.[0] || '؟')}</span>
          <span class="lb-name">${escapeHtml(r.displayName)}</span>
          <span class="badge badge-gold">سطح ${r.level}</span>
          <span class="lb-points">${formatNumber(r.rankPoints)}</span>
        </li>`
        )
        .join('')}
    </ol>
  `;
}

function renderEmptyLeaderboard() {
  return `
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">🏅</span>
      <p>هنوز رتبه‌بندی ثبت نشده — اولین بازی را شروع کنید!</p>
    </div>
  `;
}
