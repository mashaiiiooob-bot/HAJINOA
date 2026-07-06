import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { openModal, closeModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { escapeHtml, formatNumber, relativeTime } from '../utils/format.js';

const ROLE_LABEL = { leader: 'مالک', officer: 'افسر', member: 'عضو' };

/** renderClans() — the clan page: create/browse/join, live profile with chat, roster, and leaderboard.
 *  Backed by Supabase RPCs (create_clan, list_clans, get_clan_detail, join_clan,
 *  leave_clan, kick_clan_member, transfer_clan_ownership, update_clan_announcement)
 *  and chat_messages + Realtime for clan chat (scope='clan', scope_ref_id=clanId) —
 *  no Express/Socket.io server involved. Member join/leave/kick updates are
 *  picked up by re-fetching on a Realtime subscription to clan_members, since
 *  there's no equivalent of the old socket 'clan:member:*' broadcast events. */
export async function renderClans(root) {
  let channel = null;
  let view = 'loading'; // loading | browse | profile
  let myClanId = null;
  let clan = null; // full clan detail (members, statistics)
  let browseResult = { clans: [], totalCount: 0 };
  let leaderboard = [];
  let search = '';
  let page = 1;
  let chatMessages = [];
  let showLeaderboard = false;

  const nameCache = new Map();
  async function nameFor(userId) {
    if (nameCache.has(userId)) return nameCache.get(userId);
    if (userId === AuthStore.user.id) {
      nameCache.set(userId, AuthStore.user.displayName);
      return AuthStore.user.displayName;
    }
    const { data } = await supabase.from('users').select('display_name').eq('id', userId).single();
    const name = data?.display_name || 'کاربر';
    nameCache.set(userId, name);
    return name;
  }

  function teardownChannel() {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  function subscribeToClan(clanId) {
    teardownChannel();
    channel = supabase
      .channel(`clan-${clanId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `scope_ref_id=eq.${clanId}` },
        async (payload) => {
          if (payload.new.scope !== 'clan') return;
          const author_name = await nameFor(payload.new.user_id);
          chatMessages = [...chatMessages, { ...payload.new, author_name }].slice(-150);
          renderChatMessages();
          scrollChatToBottom();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clan_members', filter: `clan_id=eq.${clanId}` },
        () => refreshClan()
      )
      .subscribe();
  }

  async function refreshClan() {
    if (!myClanId) return;
    try {
      const { data, error } = await supabase.rpc('get_clan_detail', { p_clan_id: myClanId });
      if (error) throw new Error(error.message);
      clan = data;
      render();
    } catch {
      /* ignore transient errors */
    }
  }

  async function loadBrowse() {
    const { data, error } = await supabase.rpc('list_clans', { p_search: search || null, p_page: page, p_page_size: 12 });
    if (error) throw new Error(error.message);
    browseResult = {
      clans: (data || []).map((c) => ({
        id: c.id, name: c.name, tag: c.tag, avatarUrl: c.avatar_url,
        level: c.level, trophies: c.trophies, memberCount: Number(c.member_count),
      })),
      totalCount: data?.[0]?.total_count ? Number(data[0].total_count) : 0,
    };
    if (showLeaderboard) {
      const { data: lb, error: lbErr } = await supabase.rpc('list_clan_leaderboard', { p_limit: 20 });
      if (lbErr) throw new Error(lbErr.message);
      leaderboard = (lb || []).map((c) => ({
        name: c.name, tag: c.tag, trophies: c.trophies,
        memberCount: Number(c.member_count), totalWins: Number(c.total_wins),
      }));
    }
  }

  async function loadInitial() {
    try {
      const { data: mine, error } = await supabase.rpc('get_my_clan');
      if (error) throw new Error(error.message);
      const myClan = mine?.[0];

      if (myClan) {
        myClanId = myClan.clan_id;
        const { data: detail, error: detailErr } = await supabase.rpc('get_clan_detail', { p_clan_id: myClanId });
        if (detailErr) throw new Error(detailErr.message);
        clan = detail;
        view = 'profile';

        const { data: history, error: histErr } = await supabase
          .from('chat_messages')
          .select('id, user_id, body, created_at, users(display_name)')
          .eq('scope', 'clan')
          .eq('scope_ref_id', myClanId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (histErr) throw new Error(histErr.message);
        chatMessages = (history || []).map((m) => ({ ...m, author_name: m.users?.display_name })).reverse();

        subscribeToClan(myClanId);
      } else {
        view = 'browse';
        await loadBrowse();
      }
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری کلن', 'error');
      view = 'browse';
    }
  }

  /* ------------------------------------------------------------------ Chat */

  function chatTemplate() {
    return `
      <section class="card widget-card clan-chat-card">
        <div class="widget-title"><h3>گفتگوی کلن</h3></div>
        <div class="chat-messages" id="clan-chat-messages">${renderMessageList()}</div>
        <form class="chat-input-row" id="clan-chat-form">
          <input type="text" id="clan-chat-input" class="mp-search" placeholder="پیام خود را بنویسید…" maxlength="500" autocomplete="off" />
          <button class="btn btn-primary btn-sm" type="submit">ارسال</button>
        </form>
      </section>
    `;
  }

  function renderMessageList() {
    if (!chatMessages.length) return `<p class="chat-empty">هنوز پیامی ارسال نشده است.</p>`;
    return chatMessages
      .map((m) => {
        const mine = m.user_id === AuthStore.user.id;
        return `
        <div class="chat-msg${mine ? ' chat-msg-mine' : ''}">
          <span class="chat-msg-author">${escapeHtml(m.author_name || '')}</span>
          <span class="chat-msg-body">${escapeHtml(m.body)}</span>
          <span class="chat-msg-time">${relativeTime(m.created_at)}</span>
        </div>`;
      })
      .join('');
  }

  function renderChatMessages() {
    const el = document.getElementById('clan-chat-messages');
    if (el) el.innerHTML = renderMessageList();
  }

  function scrollChatToBottom() {
    const el = document.getElementById('clan-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  async function sendClanMessage(text) {
    if (!text.trim() || !clan) return;
    const { error } = await supabase
      .from('chat_messages')
      .insert({ scope: 'clan', scope_ref_id: clan.id, user_id: AuthStore.user.id, body: text.trim() });
    if (error) toast('ارسال پیام ناموفق بود: ' + error.message, 'error');
  }

  /* --------------------------------------------------------------- Browse */

  function browseTemplate() {
    return `
      <section class="card widget-card">
        <div class="widget-title">
          <h3>ایجاد کلن جدید</h3>
        </div>
        <p class="hero-sub">یک کلن بسازید و دوستان خود را دعوت کنید تا با هم رشد کنید.</p>
        <button class="btn btn-primary btn-block" id="btn-create-clan">ایجاد کلن</button>
      </section>

      <div class="mp-tabs" role="tablist" style="margin-top:var(--sp-5)">
        <button class="mp-tab-btn${!showLeaderboard ? ' active' : ''}" id="tab-browse-clans">مرور کلن‌ها</button>
        <button class="mp-tab-btn${showLeaderboard ? ' active' : ''}" id="tab-leaderboard-clans">رتبه‌بندی کلن‌ها</button>
      </div>

      ${showLeaderboard ? clanLeaderboardTemplate() : clanBrowseListTemplate()}
    `;
  }

  function clanBrowseListTemplate() {
    return `
      <div class="mp-toolbar" style="grid-template-columns:1fr;">
        <input class="mp-search" id="clan-search" type="search" placeholder="جستجوی نام یا تگ کلن…" value="${escapeHtml(search)}" />
      </div>
      ${
        browseResult.clans.length
          ? `<div class="mp-grid">${browseResult.clans.map(clanCardTemplate).join('')}</div>`
          : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🛡️</span><p>کلنی یافت نشد.</p></div>`
      }
    `;
  }

  function clanCardTemplate(c) {
    return `
      <div class="mp-item-card card">
        <div class="mp-item-icon" aria-hidden="true">${c.avatarUrl ? `<img class="clan-avatar-img" src="${escapeHtml(c.avatarUrl)}" alt="" />` : '🛡️'}</div>
        <h4 class="mp-item-name">${escapeHtml(c.name)} <span class="clan-tag">[${escapeHtml(c.tag)}]</span></h4>
        <p class="mp-item-cat">سطح ${formatNumber(c.level)} · 🏆 ${formatNumber(c.trophies)}</p>
        <p class="mp-item-seller">${formatNumber(c.memberCount)}/30 عضو</p>
        <div class="mp-item-footer">
          <span></span>
          <button class="btn btn-primary btn-sm" data-join-clan="${c.id}">پیوستن</button>
        </div>
      </div>
    `;
  }

  function clanLeaderboardTemplate() {
    if (!leaderboard.length) return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🏆</span><p>هنوز رتبه‌بندی موجود نیست.</p></div>`;
    return `
      <ul class="lb-list">
        ${leaderboard
          .map(
            (c, i) => `
          <li class="lb-row">
            <span class="lb-rank">#${formatNumber(i + 1)}</span>
            <span class="lb-name">${escapeHtml(c.name)} [${escapeHtml(c.tag)}]</span>
            <span class="lb-points">🏆 ${formatNumber(c.trophies)}</span>
            <span class="lb-points">${formatNumber(c.memberCount)} عضو</span>
            <span class="lb-points">${formatNumber(c.totalWins)} برد</span>
          </li>`
          )
          .join('')}
      </ul>
    `;
  }

  /* -------------------------------------------------------------- Profile */

  function profileTemplate() {
    const isOwner = clan.ownerId === AuthStore.user.id;
    const xpIntoLevel = clan.xp % 500;
    return `
      <section class="card widget-card clan-header-card">
        <div class="clan-header-top">
          <div class="mp-item-icon clan-avatar" aria-hidden="true">${clan.avatarUrl ? `<img class="clan-avatar-img" src="${escapeHtml(clan.avatarUrl)}" alt="" />` : '🛡️'}</div>
          <div>
            <h2>${escapeHtml(clan.name)} <span class="clan-tag">[${escapeHtml(clan.tag)}]</span></h2>
            <p class="hero-sub">${escapeHtml(clan.description || 'بدون توضیحات')}</p>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-leave-clan">خروج از کلن</button>
        </div>
        <div class="clan-level-bar">
          <span>سطح ${formatNumber(clan.level)}</span>
          <div class="clan-xp-track"><div class="clan-xp-fill" style="width:${(xpIntoLevel / 500) * 100}%"></div></div>
          <span>${formatNumber(xpIntoLevel)}/500 XP</span>
        </div>
        <div class="clan-stats-row">
          <div><strong>${formatNumber(clan.statistics.memberCount)}</strong><span>عضو</span></div>
          <div><strong>${formatNumber(clan.trophies)}</strong><span>🏆 جام</span></div>
          <div><strong>${formatNumber(clan.statistics.totalWins)}</strong><span>برد</span></div>
          <div><strong>${formatNumber(clan.statistics.avgRankPoints)}</strong><span>میانگین امتیاز</span></div>
        </div>
      </section>

      <section class="card widget-card">
        <div class="widget-title"><h3>اعلامیه کلن</h3></div>
        <p class="clan-announcement">${clan.announcement ? escapeHtml(clan.announcement) : 'اعلامیه‌ای ثبت نشده است.'}</p>
        ${isOwner ? `<button class="btn btn-ghost btn-sm" id="btn-edit-announcement">ویرایش اعلامیه</button>` : ''}
      </section>

      <section class="card widget-card">
        <div class="widget-title"><h3>اعضا (${formatNumber(clan.members.length)})</h3></div>
        <ul class="lb-list">
          ${clan.members
            .map(
              (m) => `
            <li class="lb-row">
              <span class="lb-name">${escapeHtml(m.displayName)} ${m.userId === AuthStore.user.id ? '(شما)' : ''}</span>
              <span class="badge ${m.role === 'leader' ? 'badge-gold' : 'badge-purple'}">${ROLE_LABEL[m.role] || m.role}</span>
              <span class="lb-points">🏅 ${formatNumber(m.rankPoints ?? 0)}</span>
              ${
                isOwner && m.userId !== AuthStore.user.id
                  ? `<button class="btn btn-ghost btn-sm" data-kick="${m.userId}">اخراج</button>
                     <button class="btn btn-ghost btn-sm" data-transfer="${m.userId}">انتقال مالکیت</button>`
                  : ''
              }
            </li>`
            )
            .join('')}
        </ul>
      </section>

      ${chatTemplate()}
    `;
  }

  /* ---------------------------------------------------------------- Shell */

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">🛡️ کلن</p>
            <h1>${view === 'profile' && clan ? escapeHtml(clan.name) : 'کلن‌ها'}</h1>
          </div>
        </div>
        <div id="clan-content"><div class="skeleton" style="height:260px;border-radius:var(--r-lg)"></div></div>
      </div>
    `;
  }

  function render() {
    const content = document.getElementById('clan-content');
    if (!content) return;
    content.innerHTML = view === 'profile' && clan ? profileTemplate() : browseTemplate();
    bindEvents();
    if (view === 'profile') scrollChatToBottom();
  }

  function bindEvents() {
    const content = document.getElementById('clan-content');
    if (!content) return;

    content.querySelector('#btn-create-clan')?.addEventListener('click', openCreateClanModal);
    content.querySelector('#clan-search')?.addEventListener(
      'input',
      debounce(async (e) => {
        search = e.target.value;
        page = 1;
        await loadBrowse();
        render();
        document.getElementById('clan-search')?.focus();
      }, 400)
    );
    content.querySelector('#tab-browse-clans')?.addEventListener('click', async () => {
      showLeaderboard = false;
      await loadBrowse();
      render();
    });
    content.querySelector('#tab-leaderboard-clans')?.addEventListener('click', async () => {
      showLeaderboard = true;
      await loadBrowse();
      render();
    });
    content.querySelectorAll('[data-join-clan]').forEach((btn) => {
      btn.addEventListener('click', () => joinClanHandler(btn.dataset.joinClan));
    });

    content.querySelector('#btn-leave-clan')?.addEventListener('click', leaveClanHandler);
    content.querySelector('#btn-edit-announcement')?.addEventListener('click', openAnnouncementModal);
    content.querySelectorAll('[data-kick]').forEach((btn) => {
      btn.addEventListener('click', () => kickMember(btn.dataset.kick));
    });
    content.querySelectorAll('[data-transfer]').forEach((btn) => {
      btn.addEventListener('click', () => transferOwnership(btn.dataset.transfer));
    });

    const form = content.querySelector('#clan-chat-form');
    const input = content.querySelector('#clan-chat-input');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value;
      input.value = '';
      sendClanMessage(text);
    });
  }

  /* --------------------------------------------------------------- Actions */

  async function joinClanHandler(clanId) {
    try {
      const { error } = await supabase.rpc('join_clan', { p_clan_id: clanId });
      if (error) throw new Error(error.message);
      toast('با موفقیت به کلن پیوستید', 'success');
      await loadInitial();
      render();
    } catch (err) {
      toast(err.message || 'پیوستن به کلن ناموفق بود', 'error');
    }
  }

  async function leaveClanHandler() {
    if (!confirm('آیا مطمئن هستید که می‌خواهید از کلن خارج شوید؟')) return;
    try {
      const { error } = await supabase.rpc('leave_clan', { p_clan_id: clan.id });
      if (error) throw new Error(error.message);
      toast('از کلن خارج شدید', 'success');
      teardownChannel();
      myClanId = null;
      clan = null;
      view = 'browse';
      await loadBrowse();
      render();
    } catch (err) {
      toast(err.message || 'خروج ناموفق بود', 'error');
    }
  }

  async function kickMember(userId) {
    if (!confirm('آیا از اخراج این عضو مطمئن هستید؟')) return;
    try {
      const { error } = await supabase.rpc('kick_clan_member', { p_clan_id: clan.id, p_user_id: userId });
      if (error) throw new Error(error.message);
      toast('عضو اخراج شد', 'success');
      await refreshClan();
    } catch (err) {
      toast(err.message || 'اخراج ناموفق بود', 'error');
    }
  }

  async function transferOwnership(userId) {
    if (!confirm('آیا از انتقال مالکیت کلن مطمئن هستید؟')) return;
    try {
      const { error } = await supabase.rpc('transfer_clan_ownership', { p_clan_id: clan.id, p_user_id: userId });
      if (error) throw new Error(error.message);
      toast('مالکیت کلن منتقل شد', 'success');
      await refreshClan();
    } catch (err) {
      toast(err.message || 'انتقال مالکیت ناموفق بود', 'error');
    }
  }

  function openCreateClanModal() {
    openModal({
      title: 'ایجاد کلن جدید',
      bodyHtml: `
        <div class="mp-sell-form">
          <div class="field"><label for="clan-name">نام کلن</label><input id="clan-name" maxlength="60" placeholder="مثلاً شیرهای طلایی" /></div>
          <div class="field"><label for="clan-tag">تگ (۲ تا ۴ کاراکتر)</label><input id="clan-tag" maxlength="4" placeholder="GOLD" /></div>
          <div class="field"><label for="clan-desc">توضیحات (اختیاری)</label><input id="clan-desc" maxlength="500" placeholder="درباره کلن خود بنویسید" /></div>
          <p class="field-error" id="clan-create-error"></p>
        </div>
      `,
      actionsHtml: `
        <button class="btn btn-secondary" id="clan-create-cancel">انصراف</button>
        <button class="btn btn-primary" id="clan-create-confirm">ایجاد کلن</button>
      `,
    });
    document.getElementById('clan-create-cancel')?.addEventListener('click', closeModal);
    document.getElementById('clan-create-confirm')?.addEventListener('click', async (e) => {
      const name = document.getElementById('clan-name').value.trim();
      const tag = document.getElementById('clan-tag').value.trim();
      const description = document.getElementById('clan-desc').value.trim();
      const errorEl = document.getElementById('clan-create-error');
      if (!name || !tag) {
        errorEl.textContent = 'نام و تگ کلن الزامی است.';
        return;
      }
      e.target.disabled = true;
      e.target.textContent = 'در حال ایجاد…';
      try {
        const { error } = await supabase.rpc('create_clan', { p_name: name, p_tag: tag, p_description: description || null });
        if (error) throw new Error(error.message);
        toast('کلن با موفقیت ایجاد شد', 'success');
        closeModal();
        await loadInitial();
        render();
      } catch (err) {
        errorEl.textContent = err.message || 'ایجاد کلن ناموفق بود';
        e.target.disabled = false;
        e.target.textContent = 'ایجاد کلن';
      }
    });
  }

  function openAnnouncementModal() {
    openModal({
      title: 'ویرایش اعلامیه کلن',
      bodyHtml: `
        <div class="mp-sell-form">
          <div class="field" style="width:100%">
            <label for="clan-announcement-input">متن اعلامیه</label>
            <input id="clan-announcement-input" maxlength="500" value="${escapeHtml(clan.announcement || '')}" />
          </div>
        </div>
      `,
      actionsHtml: `
        <button class="btn btn-secondary" id="ann-cancel">انصراف</button>
        <button class="btn btn-primary" id="ann-confirm">ذخیره</button>
      `,
    });
    document.getElementById('ann-cancel')?.addEventListener('click', closeModal);
    document.getElementById('ann-confirm')?.addEventListener('click', async (e) => {
      const text = document.getElementById('clan-announcement-input').value;
      e.target.disabled = true;
      try {
        const { error } = await supabase.rpc('update_clan_announcement', { p_clan_id: clan.id, p_announcement: text });
        if (error) throw new Error(error.message);
        toast('اعلامیه ثبت شد', 'success');
        closeModal();
        await refreshClan();
      } catch (err) {
        toast(err.message || 'ثبت اعلامیه ناموفق بود', 'error');
        e.target.disabled = false;
      }
    });
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  shell();
  await loadInitial();
  render();
}
