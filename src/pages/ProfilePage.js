import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { formatNumber, escapeHtml, relativeTime } from '../utils/format.js';
import { animateCounter } from '../utils/effects.js';
import { getMatchHistory } from '../utils/sampleData.js';
import { navigate } from '../router.js';
import { toast } from '../components/Toast.js';

/**
 * Competitive player profile. Identity (level/xp/coins) comes from AuthStore.
 * Win/loss stats come from player_stats. Achievements come from
 * achievements + user_achievements (real data, no more sampleData mock).
 * Match-history detail has no backing table yet, so it's still sourced from
 * utils/sampleData.js as a clearly marked placeholder.
 */
export async function renderProfilePage(root) {
  root.innerHTML = `
    <div class="container page-pad">
      <div class="skeleton" style="height:180px;border-radius:var(--r-lg);margin-bottom:var(--sp-5)"></div>
      <div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>
    </div>
  `;

  const user = AuthStore.user;
  let stats, achievements;
  try {
    [stats, achievements] = await Promise.all([loadStats(user), loadAchievements(user)]);
  } catch (err) {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">⚠</span>
          <p>${escapeHtml(err.message || 'خطا در بارگذاری پروفایل')}</p>
          <button class="btn btn-secondary btn-sm" id="profile-retry">تلاش دوباره</button>
        </div>
      </div>
    `;
    root.querySelector('#profile-retry')?.addEventListener('click', () => renderProfilePage(root));
    return;
  }
  const matches = getMatchHistory();

  root.innerHTML = template(user, stats, matches, achievements);

  root.querySelectorAll('.counter[data-target]').forEach((el) => {
    animateCounter(el, Number(el.dataset.target), { formatFn: (n) => formatNumber(Math.round(n)) });
  });

  bindAvatarUpload(root, user);
  bindAccountSettings(root, user);
}

async function loadStats(user) {
  const fallback = {
    wins: 0, losses: 0, winRate: 0, rating: 1000, friendsCount: 0,
    favoriteMode: 'کلاسیک رتبه‌بندی', ratingHistory: [1000], xpPercent: 0,
    onlineStatus: 'آنلاین', lastActive: 'اکنون',
  };
  if (!user?.id) return fallback;

  const { data: ps } = await supabase
    .from('player_stats')
    .select('games_won, games_lost, rank_points')
    .eq('user_id', user.id)
    .single();

  const { count: friendsCount } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const wins = ps?.games_won ?? 0;
  const losses = ps?.games_lost ?? 0;
  const total = wins + losses;
  const rating = ps?.rank_points ?? 1000;

  // Level progress ring: recompute from level_thresholds directly (read-only,
  // matches recalc_level()'s own math) rather than trusting a stale client value.
  const { data: thresholds } = await supabase
    .from('level_thresholds')
    .select('level, total_xp_required')
    .in('level', [user?.level ?? 1, (user?.level ?? 1) + 1]);
  const current = thresholds?.find((t) => t.level === (user?.level ?? 1));
  const next = thresholds?.find((t) => t.level === (user?.level ?? 1) + 1);
  const xpPercent = next
    ? Math.min(100, Math.round((((user?.xp ?? 0) - (current?.total_xp_required ?? 0)) /
        (next.total_xp_required - (current?.total_xp_required ?? 0))) * 100))
    : 100;

  return {
    wins,
    losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    rating,
    friendsCount: friendsCount ?? 0,
    favoriteMode: 'کلاسیک رتبه‌بندی',
    ratingHistory: [rating - 120, rating - 80, rating - 100, rating - 40, rating - 10, rating - 30, rating],
    xpPercent,
    onlineStatus: 'آنلاین',
    lastActive: 'اکنون',
  };
}

/** Maps achievements + user_achievements (LEFT JOIN via two queries — this
 *  project has no bundler/ORM, so a manual join keeps the query simple) into
 *  the shape achievementWall() already expects. */
async function loadAchievements(user) {
  const { data: catalog } = await supabase
    .from('achievements')
    .select('id, code, name_fa, icon, rarity, target_count, reward_xp, reward_coins')
    .order('sort_order', { ascending: true });
  if (!catalog) return [];

  let progressById = new Map();
  if (user?.id) {
    const { data: progress } = await supabase
      .from('user_achievements')
      .select('achievement_id, progress, unlocked_at')
      .eq('user_id', user.id);
    progressById = new Map((progress || []).map((p) => [p.achievement_id, p]));
  }

  return catalog.map((a) => {
    const p = progressById.get(a.id);
    return {
      icon: a.icon,
      name: a.name_fa,
      rarity: a.rarity,
      unlocked: !!p?.unlocked_at,
      progress: p?.progress ?? 0,
      target: a.target_count,
    };
  });
}

function bindAccountSettings(root, user) {
  const renameForm = root.querySelector('#rename-form');
  renameForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = root.querySelector('#rename-input');
    const newName = input.value.trim();
    if (!newName || newName === user.displayName) return;

    const btn = renameForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'در حال ذخیره…';
    try {
      const { error } = await supabase.rpc('update_my_display_name', { p_display_name: newName });
      if (error) throw new Error(error.message);
      user.displayName = newName;
      AuthStore.setUser({ ...user });
      toast('نام نمایشی با موفقیت تغییر کرد', 'success');
      root.querySelector('.profile-name').textContent = newName;
    } catch (err) {
      toast(err.message || 'تغییر نام ناموفق بود', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'ذخیره';
    }
  });

  root.querySelector('#btn-logout')?.addEventListener('click', async () => {
    if (!confirm('آیا مطمئن هستید که می‌خواهید از حساب خود خارج شوید؟')) return;
    await AuthStore.logout();
    navigate('/login');
  });
}

function accountSettingsSection(user) {
  return `
    <section class="card widget-card span-12">
      <div class="widget-title"><h3>تنظیمات حساب</h3></div>
      <form class="account-settings-form" id="rename-form">
        <div class="field" style="flex:1">
          <label for="rename-input">نام نمایشی</label>
          <input id="rename-input" class="mp-search" maxlength="60" value="${escapeHtml(user?.displayName || '')}" />
        </div>
        <button class="btn btn-primary" type="submit">ذخیره</button>
      </form>
      <button class="btn btn-secondary btn-block" id="btn-logout" style="margin-top:var(--sp-4)">خروج از حساب کاربری</button>
    </section>
  `;
}

function bindAvatarUpload(root, user) {
  const input = root.querySelector('#avatar-file-input');
  if (!input || !user?.id) return;
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, cacheControl: '3600' });
    if (uploadError) {
      alert('آپلود آواتار ناموفق بود: ' + uploadError.message);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', user.id);
    if (updateError) {
      alert('ذخیره آدرس آواتار ناموفق بود: ' + updateError.message);
      return;
    }
    const avatarEl = root.querySelector('.profile-avatar');
    if (avatarEl) avatarEl.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="" />`;
    user.avatarUrl = avatarUrl;
  });
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

        ${accountSettingsSection(user)}
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
        <label class="avatar-edit-btn" title="تغییر آواتار" style="position:absolute;bottom:0;left:0;width:28px;height:28px;border-radius:50%;background:var(--c-bg-elevated);display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--c-border,rgba(255,255,255,.15))">
          ✏️<input id="avatar-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none" />
        </label>
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
  const stepX = (w - pad * 2) / (history.length - 1 || 1);
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
  if (!achievements.length) {
    return `<p class="hero-sub">هنوز دستاوردی تعریف نشده است.</p>`;
  }
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
              ? `<div class="achievement-progress-track"><div class="achievement-progress-fill" style="width:${Math.min(100, (a.progress / a.target) * 100)}%"></div></div>`
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
