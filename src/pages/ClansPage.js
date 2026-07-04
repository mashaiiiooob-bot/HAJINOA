import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { AuthStore } from '../services/authStore.js';
import { openModal, closeModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { escapeHtml, formatNumber, relativeTime } from '../utils/format.js';

const ROLE_LABEL = { leader: 'مالک', officer: 'افسر', member: 'عضو' };

/** renderClans() — the clan page: create/browse/join, live profile with chat, roster, and leaderboard. */
export async function renderClans(root) {
  let socket = null;
  let view = 'loading'; // loading | browse | profile
  let myClan = null; // { clanId, role } | null
  let clan = null; // full clan detail (members, statistics)
  let browseResult = { clans: [], total: 0, totalPages: 1 };
  let leaderboard = [];
  let search = '';
  let page = 1;
  let chatMessages = [];
  let typingUsers = new Set();
  let showLeaderboard = false;

  function ensureSocket() {
    if (socket) return socket;
    socket = getSocket();
    attachListeners();
    return socket;
  }

  function attachListeners() {
    socket.off('chat:message', onChatMessage);
    socket.off('chat:typing', onTyping);
    socket.off('chat:typing:stop', onTypingStop);
    socket.off('clan:member:joined');
    socket.off('clan:member:left');
    socket.off('clan:member:kicked');
    socket.off('clan:ownership:transferred');
    socket.off('clan:announcement:updated');

    socket.on('chat:message', onChatMessage);
    socket.on('chat:typing', onTyping);
    socket.on('chat:typing:stop', onTypingStop);

    socket.on('clan:member:joined', (evt) => {
      if (clan && evt.clanId === clan.id) refreshClan();
    });
    socket.on('clan:member:left', (evt) => {
      if (clan && evt.clanId === clan.id) refreshClan();
    });
    socket.on('clan:member:kicked', (evt) => {
      if (clan && evt.clanId === clan.id) {
        if (evt.userId === AuthStore.user.id) {
          toast('شما از کلن اخراج شدید', 'error');
          myClan = null;
          clan = null;
          view = 'browse';
          loadBrowse().then(render);
        } else {
          refreshClan();
        }
      }
    });
    socket.on('clan:ownership:transferred', (evt) => {
      if (clan && evt.clanId === clan.id) refreshClan();
    });
    socket.on('clan:announcement:updated', (evt) => {
      if (clan && evt.clanId === clan.id) refreshClan();
    });
  }

  function onChatMessage(payload) {
    if (payload.scope !== 'clan' || !clan || payload.scopeRefId !== clan.id) return;
    chatMessages = [...chatMessages, payload].slice(-100);
    renderChatMessages();
    scrollChatToBottom();
  }

  function onTyping({ scope, scopeRefId, userId }) {
    if (scope !== 'clan' || !clan || scopeRefId !== clan.id || userId === AuthStore.user.id) return;
    typingUsers.add(userId);
    renderTypingIndicator();
  }

  function onTypingStop({ scope, scopeRefId, userId }) {
    if (scope !== 'clan' || !clan || scopeRefId !== clan.id) return;
    typingUsers.delete(userId);
    renderTypingIndicator();
  }

  async function refreshClan() {
    if (!myClan) return;
    try {
      clan = await api.get(`/clans/${myClan.clanId}`);
      render();
    } catch {
      /* ignore transient errors */
    }
  }

  async function loadBrowse() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('pageSize', '12');
    const [clans, board] = await Promise.all([
      api.get(`/clans?${params.toString()}`),
      showLeaderboard ? api.get('/clans/leaderboard') : Promise.resolve(leaderboard),
    ]);
    browseResult = clans;
    if (showLeaderboard) leaderboard = board;
  }

  async function loadInitial() {
    try {
      myClan = await api.get('/clans/mine');
      if (myClan) {
        clan = await api.get(`/clans/${myClan.clanId}`);
        view = 'profile';
        const socketRef = ensureSocket();
        socketRef.emit('clan:watch', { clanId: clan.id });
        socketRef.emit('chat:watch', { scope: 'clan', scopeRefId: clan.id });
        const history = await api.get(`/clans/${clan.id}/chat`);
        chatMessages = history.map((m) => ({
          id: m.id,
          scope: 'clan',
          scopeRefId: clan.id,
          body: m.body,
          user: { id: m.userId, username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl },
          createdAt: m.createdAt,
        }));
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
        <p class="chat-typing" id="clan-typing-indicator"></p>
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
        const mine = m.user?.id === AuthStore.user.id;
        return `
        <div class="chat-msg${mine ? ' chat-msg-mine' : ''}">
          <span class="chat-msg-author">${escapeHtml(m.user?.displayName || '')}</span>
          <span class="chat-msg-body">${escapeHtml(m.body)}</span>
          <span class="chat-msg-time">${relativeTime(m.createdAt)}</span>
        </div>`;
      })
      .join('');
  }

  function renderChatMessages() {
    const el = document.getElementById('clan-chat-messages');
    if (el) el.innerHTML = renderMessageList();
  }

  function renderTypingIndicator() {
    const el = document.getElementById('clan-typing-indicator');
    if (!el) return;
    const names = [...typingUsers]
      .map((id) => clan.members.find((m) => m.userId === id)?.displayName)
      .filter(Boolean);
    el.textContent = names.length ? `${names.join('، ')} در حال تایپ...` : '';
  }

  function scrollChatToBottom() {
    const el = document.getElementById('clan-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function sendClanMessage(text) {
    if (!text.trim()) return;
    ensureSocket().emit('chat:send', { scope: 'clan', scopeRefId: clan.id, body: text.trim() });
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
    if (view === 'profile') {
      scrollChatToBottom();
      renderTypingIndicator();
    }
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
      btn.addEventListener('click', () => joinClan(btn.dataset.joinClan));
    });

    content.querySelector('#btn-leave-clan')?.addEventListener('click', leaveClan);
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
      sendClanMessage(input.value);
      input.value = '';
    });
    input?.addEventListener('input', () => {
      ensureSocket().emit('chat:typing', { scope: 'clan', scopeRefId: clan.id });
    });
  }

  /* --------------------------------------------------------------- Actions */

  async function joinClan(clanId) {
    try {
      await api.post(`/clans/${clanId}/join`, {});
      toast('با موفقیت به کلن پیوستید', 'success');
      await loadInitial();
      render();
    } catch (err) {
      toast(err.message || 'پیوستن به کلن ناموفق بود', 'error');
    }
  }

  async function leaveClan() {
    if (!confirm('آیا مطمئن هستید که می‌خواهید از کلن خارج شوید؟')) return;
    try {
      await api.post(`/clans/${clan.id}/leave`, {});
      toast('از کلن خارج شدید', 'success');
      myClan = null;
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
      await api.post(`/clans/${clan.id}/kick`, { userId });
      toast('عضو اخراج شد', 'success');
      await refreshClan();
    } catch (err) {
      toast(err.message || 'اخراج ناموفق بود', 'error');
    }
  }

  async function transferOwnership(userId) {
    if (!confirm('آیا از انتقال مالکیت کلن مطمئن هستید؟')) return;
    try {
      await api.post(`/clans/${clan.id}/transfer-ownership`, { userId });
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
        await api.post('/clans', { name, tag, description: description || undefined });
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
        await api.post(`/clans/${clan.id}/announcement`, { announcement: text });
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
  ensureSocket();
  await loadInitial();
  render();
}
