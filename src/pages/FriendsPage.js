import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { escapeHtml, relativeTime } from '../utils/format.js';

/** renderFriends() — search users, manage friend requests, live online status, invite to game. */
export async function renderFriends(root) {
  let tab = 'friends'; // friends | requests | search
  let friends = [];
  let requests = { incoming: [], outgoing: [] };
  let searchResults = [];
  let searchTerm = '';
  let loading = true;
  let socket = null;

  function ensureSocket() {
    if (socket) return socket;
    socket = getSocket();
    socket.off('friend:presence');
    socket.on('friend:presence', ({ userId, online }) => {
      const f = friends.find((x) => x.id === userId);
      if (f) {
        f.isOnline = online;
        f.lastSeenAt = online ? f.lastSeenAt : new Date().toISOString();
        if (tab === 'friends') renderContent();
      }
    });
    return socket;
  }

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">🤝 دوستان</p>
            <h1>دوستان من</h1>
          </div>
        </div>
        <div class="mp-tabs" role="tablist">
          <button class="mp-tab-btn" data-tab="friends" role="tab">دوستان (<span id="friends-count">0</span>)</button>
          <button class="mp-tab-btn" data-tab="requests" role="tab">درخواست‌ها (<span id="requests-count">0</span>)</button>
          <button class="mp-tab-btn" data-tab="search" role="tab">جستجوی کاربر</button>
        </div>
        <div id="friends-content"></div>
      </div>
    `;
    root.querySelectorAll('.mp-tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  }

  function updateTabButtons() {
    root.querySelectorAll('.mp-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const fc = document.getElementById('friends-count');
    const rc = document.getElementById('requests-count');
    if (fc) fc.textContent = friends.length;
    if (rc) rc.textContent = requests.incoming.length;
  }

  async function switchTab(next) {
    tab = next;
    updateTabButtons();
    if (tab === 'search') {
      renderContent();
      return;
    }
    await loadCurrentTab();
    renderContent();
  }

  async function loadCurrentTab() {
    loading = true;
    renderContent();
    try {
      if (tab === 'friends') friends = await api.get('/friends');
      else if (tab === 'requests') requests = await api.get('/friends/requests');
    } catch (err) {
      toast(err.message || 'خطا در بارگذاری اطلاعات', 'error');
    } finally {
      loading = false;
      updateTabButtons();
    }
  }

  /* ------------------------------------------------------------- Friends */

  function friendsTemplate() {
    if (loading) return `<div class="skeleton" style="height:300px;border-radius:var(--r-lg)"></div>`;
    if (!friends.length) {
      return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🤝</span><p>هنوز دوستی اضافه نکرده‌اید.</p></div>`;
    }
    return `
      <div class="mp-grid">
        ${friends
          .map(
            (f) => `
          <div class="mp-item-card card friend-card">
            <span class="friend-status-dot ${f.isOnline ? 'online' : 'offline'}" aria-hidden="true"></span>
            <div class="mp-item-icon" aria-hidden="true">${f.avatarUrl ? `<img class="clan-avatar-img" src="${escapeHtml(f.avatarUrl)}" alt="" />` : (f.displayName?.[0] || '؟')}</div>
            <h4 class="mp-item-name">${escapeHtml(f.displayName)}</h4>
            <p class="mp-item-cat">${f.isOnline ? 'برخط' : `آخرین بازدید: ${relativeTime(f.lastSeenAt)}`}</p>
            <div class="mp-item-footer" style="flex-direction:column;gap:6px;">
              <button class="btn btn-primary btn-sm btn-block" data-invite="${f.id}">دعوت به بازی</button>
              <button class="btn btn-ghost btn-sm btn-block" data-remove-friend="${f.id}">حذف دوست</button>
            </div>
          </div>`
          )
          .join('')}
      </div>
    `;
  }

  /* ------------------------------------------------------------ Requests */

  function requestsTemplate() {
    if (loading) return `<div class="skeleton" style="height:260px;border-radius:var(--r-lg)"></div>`;
    return `
      <div class="widget-title"><h3>درخواست‌های دریافتی</h3></div>
      ${
        requests.incoming.length
          ? `<ul class="lb-list">
              ${requests.incoming
                .map(
                  (r) => `
                <li class="lb-row">
                  <span class="lb-name">${escapeHtml(r.displayName)}</span>
                  <span class="lb-points">${relativeTime(r.createdAt)}</span>
                  <button class="btn btn-primary btn-sm" data-accept="${r.friendshipId}">پذیرفتن</button>
                  <button class="btn btn-ghost btn-sm" data-reject="${r.friendshipId}">رد کردن</button>
                </li>`
                )
                .join('')}
            </ul>`
          : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">📭</span><p>درخواست دریافتی وجود ندارد.</p></div>`
      }

      <div class="widget-title" style="margin-top:var(--sp-5)"><h3>درخواست‌های ارسالی</h3></div>
      ${
        requests.outgoing.length
          ? `<ul class="lb-list">
              ${requests.outgoing
                .map(
                  (r) => `
                <li class="lb-row">
                  <span class="lb-name">${escapeHtml(r.displayName)}</span>
                  <span class="lb-points">${relativeTime(r.createdAt)}</span>
                  <button class="btn btn-ghost btn-sm" data-cancel="${r.friendshipId}">لغو درخواست</button>
                </li>`
                )
                .join('')}
            </ul>`
          : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">📤</span><p>درخواست ارسالی وجود ندارد.</p></div>`
      }
    `;
  }

  /* -------------------------------------------------------------- Search */

  function searchTemplate() {
    return `
      <div class="mp-toolbar" style="grid-template-columns:1fr;">
        <input class="mp-search" id="friend-search-input" type="search" placeholder="جستجوی نام کاربری…" value="${escapeHtml(searchTerm)}" />
      </div>
      ${
        searchResults.length
          ? `<div class="mp-grid">
              ${searchResults
                .map(
                  (u) => `
                <div class="mp-item-card card friend-card">
                  <span class="friend-status-dot ${u.isOnline ? 'online' : 'offline'}" aria-hidden="true"></span>
                  <div class="mp-item-icon" aria-hidden="true">${u.avatarUrl ? `<img class="clan-avatar-img" src="${escapeHtml(u.avatarUrl)}" alt="" />` : (u.displayName?.[0] || '؟')}</div>
                  <h4 class="mp-item-name">${escapeHtml(u.displayName)}</h4>
                  <p class="mp-item-cat">@${escapeHtml(u.username)}</p>
                  <button class="btn btn-primary btn-sm btn-block" data-send-request="${u.id}">ارسال درخواست دوستی</button>
                </div>`
                )
                .join('')}
            </div>`
          : searchTerm.length >= 2
          ? `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🔍</span><p>کاربری یافت نشد.</p></div>`
          : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🔎</span><p>حداقل ۲ حرف وارد کنید.</p></div>`
      }
    `;
  }

  function renderContent() {
    const content = document.getElementById('friends-content');
    if (!content) return;
    if (tab === 'friends') content.innerHTML = friendsTemplate();
    else if (tab === 'requests') content.innerHTML = requestsTemplate();
    else content.innerHTML = searchTemplate();
    bindEvents();
  }

  function bindEvents() {
    const content = document.getElementById('friends-content');
    if (!content) return;

    content.querySelectorAll('[data-invite]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toast('حریف خود را در صفحه بازی پیدا کنید یا لینک دعوت را برایش ارسال کنید', 'info');
        navigate('/game');
      });
    });
    content.querySelectorAll('[data-remove-friend]').forEach((btn) => {
      btn.addEventListener('click', () => removeFriend(btn.dataset.removeFriend));
    });
    content.querySelectorAll('[data-accept]').forEach((btn) => {
      btn.addEventListener('click', () => respondRequest(btn.dataset.accept, 'accept'));
    });
    content.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => respondRequest(btn.dataset.reject, 'reject'));
    });
    content.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => respondRequest(btn.dataset.cancel, 'cancel'));
    });
    content.querySelectorAll('[data-send-request]').forEach((btn) => {
      btn.addEventListener('click', () => sendRequest(btn.dataset.sendRequest));
    });

    content.querySelector('#friend-search-input')?.addEventListener(
      'input',
      debounce(async (e) => {
        searchTerm = e.target.value;
        if (searchTerm.trim().length < 2) {
          searchResults = [];
          renderContent();
          return;
        }
        try {
          searchResults = await api.get(`/friends/search?q=${encodeURIComponent(searchTerm.trim())}`);
        } catch (err) {
          toast(err.message || 'جستجو ناموفق بود', 'error');
        }
        renderContent();
        document.getElementById('friend-search-input')?.focus();
      }, 400)
    );
  }

  async function sendRequest(addresseeId) {
    try {
      await api.post('/friends/requests', { addresseeId });
      toast('درخواست دوستی ارسال شد', 'success');
      searchResults = searchResults.filter((u) => u.id !== addresseeId);
      renderContent();
    } catch (err) {
      toast(err.message || 'ارسال درخواست ناموفق بود', 'error');
    }
  }

  async function respondRequest(friendshipId, action) {
    const endpoints = { accept: 'accept', reject: 'reject', cancel: 'cancel' };
    try {
      await api.post(`/friends/requests/${friendshipId}/${endpoints[action]}`, {});
      toast(
        action === 'accept' ? 'درخواست دوستی پذیرفته شد' : action === 'reject' ? 'درخواست رد شد' : 'درخواست لغو شد',
        'success'
      );
      await loadCurrentTab();
      renderContent();
    } catch (err) {
      toast(err.message || 'عملیات ناموفق بود', 'error');
    }
  }

  async function removeFriend(friendId) {
    if (!confirm('آیا از حذف این دوست مطمئن هستید؟')) return;
    try {
      await api.del(`/friends/${friendId}`);
      toast('دوست حذف شد', 'success');
      friends = friends.filter((f) => f.id !== friendId);
      renderContent();
      updateTabButtons();
    } catch (err) {
      toast(err.message || 'حذف ناموفق بود', 'error');
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
  ensureSocket();
  await Promise.all([
    api
      .get('/friends')
      .then((f) => (friends = f))
      .catch(() => {}),
    api
      .get('/friends/requests')
      .then((r) => (requests = r))
      .catch(() => {}),
  ]);
  loading = false;
  updateTabButtons();
  renderContent();
}
