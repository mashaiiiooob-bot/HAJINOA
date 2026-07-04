import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { escapeHtml, relativeTime } from '../utils/format.js';

/** renderChat() — global chat + direct messages (clan chat lives on the Clan page, match chat inside an active game). */
export async function renderChat(root) {
  let socket = null;
  let tab = 'global'; // global | direct
  let globalMessages = [];
  let conversations = [];
  let activeConversationUserId = null;
  let activeMessages = [];
  let onlineUsers = [];
  let typingInGlobal = new Set();
  let loading = true;

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
    socket.off('dm:message', onDirectMessage);

    socket.on('chat:message', onChatMessage);
    socket.on('chat:typing', onTyping);
    socket.on('chat:typing:stop', onTypingStop);
    socket.on('dm:message', onDirectMessage);
  }

  function onChatMessage(payload) {
    if (payload.scope !== 'global') return;
    globalMessages = [...globalMessages, payload].slice(-150);
    if (tab === 'global') {
      renderMessages();
      scrollToBottom('global-chat-messages');
    }
  }

  function onTyping({ scope, userId }) {
    if (scope !== 'global' || userId === AuthStore.user.id) return;
    typingInGlobal.add(userId);
    renderTyping();
  }

  function onTypingStop({ scope, userId }) {
    if (scope !== 'global') return;
    typingInGlobal.delete(userId);
    renderTyping();
  }

  function onDirectMessage(message) {
    const otherId = message.senderId === AuthStore.user.id ? message.recipientId : message.senderId;
    const existing = conversations.find((c) => c.userId === otherId);
    if (existing) {
      existing.lastMessage = message.body;
      existing.lastMessageAt = message.createdAt;
      if (tab !== 'direct' || activeConversationUserId !== otherId) existing.unreadCount = (existing.unreadCount || 0) + 1;
    } else {
      loadConversations();
    }
    if (tab === 'direct' && activeConversationUserId === otherId) {
      activeMessages = [...activeMessages, message];
      renderDirectThread();
      scrollToBottom('dm-thread-messages');
    } else {
      renderContent();
    }
  }

  async function loadGlobalHistory() {
    globalMessages = await api.get('/chat/global');
  }

  async function loadConversations() {
    conversations = await api.get('/chat/direct');
  }

  async function loadThread(userId) {
    activeConversationUserId = userId;
    activeMessages = await api.get(`/chat/direct/${userId}`);
    const conv = conversations.find((c) => c.userId === userId);
    if (conv) conv.unreadCount = 0;
  }

  /* ------------------------------------------------------------- Global */

  function globalTemplate() {
    return `
      <div class="chat-layout">
        <section class="card widget-card chat-main-card">
          <div class="widget-title"><h3>گفتگوی عمومی</h3></div>
          <div class="chat-messages chat-messages-lg" id="global-chat-messages">${renderGlobalList()}</div>
          <p class="chat-typing" id="global-typing-indicator"></p>
          <form class="chat-input-row" id="global-chat-form">
            <input type="text" id="global-chat-input" class="mp-search" placeholder="پیام خود را بنویسید…" maxlength="500" autocomplete="off" />
            <button class="btn btn-primary btn-sm" type="submit">ارسال</button>
          </form>
        </section>
        <aside class="card widget-card chat-online-card">
          <div class="widget-title"><h3>کاربران آنلاین (${onlineUsers.length})</h3></div>
          <ul class="lb-list">
            ${onlineUsers
              .map(
                (u) => `
              <li class="lb-row">
                <span class="friend-status-dot online" aria-hidden="true"></span>
                <span class="lb-name">${escapeHtml(u.displayName)}</span>
              </li>`
              )
              .join('') || `<li class="chat-empty">کاربر آنلاینی نیست.</li>`}
          </ul>
        </aside>
      </div>
    `;
  }

  function renderGlobalList() {
    if (!globalMessages.length) return `<p class="chat-empty">هنوز پیامی ارسال نشده است.</p>`;
    return globalMessages
      .map((m) => {
        const user = m.user || { id: m.userId, displayName: m.displayName };
        const mine = user.id === AuthStore.user.id;
        return `
        <div class="chat-msg${mine ? ' chat-msg-mine' : ''}">
          <span class="chat-msg-author">${escapeHtml(user.displayName || '')}</span>
          <span class="chat-msg-body">${escapeHtml(m.body)}</span>
          <span class="chat-msg-time">${relativeTime(m.createdAt)}</span>
        </div>`;
      })
      .join('');
  }

  function renderMessages() {
    const el = document.getElementById('global-chat-messages');
    if (el) el.innerHTML = renderGlobalList();
  }

  function renderTyping() {
    const el = document.getElementById('global-typing-indicator');
    if (el) el.textContent = typingInGlobal.size ? 'در حال تایپ...' : '';
  }

  /* ------------------------------------------------------------- Direct */

  function directTemplate() {
    return `
      <div class="chat-layout">
        <aside class="card widget-card chat-conv-list">
          <div class="widget-title"><h3>گفتگوها</h3></div>
          ${
            conversations.length
              ? `<ul class="lb-list">
                  ${conversations
                    .map(
                      (c) => `
                    <li class="lb-row chat-conv-item${c.userId === activeConversationUserId ? ' active' : ''}" data-conv="${c.userId}">
                      <span class="friend-status-dot ${c.isOnline ? 'online' : 'offline'}" aria-hidden="true"></span>
                      <span class="lb-name">${escapeHtml(c.displayName)}</span>
                      ${c.unreadCount ? `<span class="notif-badge">${c.unreadCount}</span>` : ''}
                    </li>`
                    )
                    .join('')}
                </ul>`
              : `<p class="chat-empty">هنوز گفتگویی ندارید. از صفحه دوستان شروع کنید.</p>`
          }
        </aside>
        <section class="card widget-card chat-main-card">
          ${
            activeConversationUserId
              ? `
            <div class="widget-title"><h3>${escapeHtml(conversations.find((c) => c.userId === activeConversationUserId)?.displayName || '')}</h3></div>
            <div class="chat-messages chat-messages-lg" id="dm-thread-messages">${renderThreadList()}</div>
            <form class="chat-input-row" id="dm-chat-form">
              <input type="text" id="dm-chat-input" class="mp-search" placeholder="پیام خود را بنویسید…" maxlength="1000" autocomplete="off" />
              <button class="btn btn-primary btn-sm" type="submit">ارسال</button>
            </form>`
              : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">✉️</span><p>یک گفتگو را انتخاب کنید.</p></div>`
          }
        </section>
      </div>
    `;
  }

  function renderThreadList() {
    if (!activeMessages.length) return `<p class="chat-empty">هنوز پیامی رد و بدل نشده است.</p>`;
    return activeMessages
      .map((m) => {
        const mine = m.senderId === AuthStore.user.id;
        return `
        <div class="chat-msg${mine ? ' chat-msg-mine' : ''}">
          <span class="chat-msg-body">${escapeHtml(m.body)}</span>
          <span class="chat-msg-time">${relativeTime(m.createdAt)}</span>
        </div>`;
      })
      .join('');
  }

  function renderDirectThread() {
    const el = document.getElementById('dm-thread-messages');
    if (el) el.innerHTML = renderThreadList();
  }

  function scrollToBottom(id) {
    const el = document.getElementById(id);
    if (el) el.scrollTop = el.scrollHeight;
  }

  /* --------------------------------------------------------------- Shell */

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">💬 گفتگو</p>
            <h1>گفتگو</h1>
          </div>
        </div>
        <div class="mp-tabs" role="tablist">
          <button class="mp-tab-btn" data-tab="global" role="tab">گفتگوی عمومی</button>
          <button class="mp-tab-btn" data-tab="direct" role="tab">پیام‌های خصوصی <span id="dm-unread-badge" class="notif-badge hidden">0</span></button>
        </div>
        <p class="hero-sub" style="margin-top:var(--sp-2)">گفتگوی کلن در صفحه کلن و گفتگوی مسابقه داخل بازی فعال در دسترس است.</p>
        <div id="chat-content"></div>
      </div>
    `;
    root.querySelectorAll('.mp-tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  }

  function updateTabButtons() {
    root.querySelectorAll('.mp-tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    const badge = document.getElementById('dm-unread-badge');
    if (badge) {
      badge.textContent = totalUnread;
      badge.classList.toggle('hidden', totalUnread === 0);
    }
  }

  async function switchTab(next) {
    tab = next;
    updateTabButtons();
    if (tab === 'direct' && !conversations.length) await loadConversations();
    renderContent();
  }

  function renderContent() {
    const content = document.getElementById('chat-content');
    if (!content) return;
    content.innerHTML = tab === 'global' ? globalTemplate() : directTemplate();
    bindEvents();
    if (tab === 'global') scrollToBottom('global-chat-messages');
    else if (activeConversationUserId) scrollToBottom('dm-thread-messages');
    updateTabButtons();
  }

  function bindEvents() {
    const content = document.getElementById('chat-content');
    if (!content) return;

    const globalForm = content.querySelector('#global-chat-form');
    const globalInput = content.querySelector('#global-chat-input');
    globalForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = globalInput.value.trim();
      if (!text) return;
      ensureSocket().emit('chat:send', { scope: 'global', body: text });
      globalInput.value = '';
    });
    globalInput?.addEventListener('input', () => ensureSocket().emit('chat:typing', { scope: 'global' }));

    content.querySelectorAll('[data-conv]').forEach((li) => {
      li.addEventListener('click', async () => {
        await loadThread(li.dataset.conv);
        renderContent();
      });
    });

    const dmForm = content.querySelector('#dm-chat-form');
    const dmInput = content.querySelector('#dm-chat-input');
    dmForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = dmInput.value.trim();
      if (!text || !activeConversationUserId) return;
      ensureSocket().emit('dm:send', { recipientId: activeConversationUserId, body: text });
      dmInput.value = '';
    });
  }

  shell();
  ensureSocket();
  try {
    const [, online] = await Promise.all([loadGlobalHistory(), api.get('/chat/online')]);
    onlineUsers = online;
  } catch (err) {
    toast(err.message || 'خطا در بارگذاری گفتگو', 'error');
  }
  loading = false;
  updateTabButtons();
  renderContent();
}
