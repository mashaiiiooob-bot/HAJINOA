import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { escapeHtml, relativeTime } from '../utils/format.js';

/** renderChat() — global chat, backed directly by Supabase (chat_messages table + Realtime).
 *  Direct messages / online presence will move to Supabase Realtime presence channels
 *  in a follow-up pass; for now this page focuses on making global chat actually work. */
export async function renderChat(root) {
  let globalMessages = [];
  let channel = null;

  function template() {
    return `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">💬 گفتگو</p>
            <h1>گفتگوی عمومی</h1>
          </div>
        </div>
        <div class="chat-layout">
          <section class="card widget-card chat-main-card">
            <div class="widget-title"><h3>گفتگوی عمومی</h3></div>
            <div class="chat-messages chat-messages-lg" id="global-chat-messages">${renderList()}</div>
            <form class="chat-input-row" id="global-chat-form">
              <input type="text" id="global-chat-input" class="mp-search" placeholder="پیام خود را بنویسید…" maxlength="500" autocomplete="off" />
              <button class="btn btn-primary btn-sm" type="submit">ارسال</button>
            </form>
          </section>
        </div>
      </div>
    `;
  }

  function renderList() {
    if (!globalMessages.length) return `<p class="chat-empty">هنوز پیامی ارسال نشده است.</p>`;
    return globalMessages
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

  function renderMessages() {
    const el = document.getElementById('global-chat-messages');
    if (el) {
      el.innerHTML = renderList();
      el.scrollTop = el.scrollHeight;
    }
  }

  /** chat_messages doesn't store a display name, so we join it against users
   *  in the initial history load, then patch in the sender's own name locally
   *  for messages we send ourselves, and re-fetch the sender's name for
   *  messages arriving from others via realtime (cheap, since we cache it). */
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

  async function loadHistory() {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, user_id, body, created_at, users(display_name)')
      .eq('scope', 'global')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    globalMessages = (data || [])
      .map((m) => ({ ...m, author_name: m.users?.display_name }))
      .reverse();
  }

  function subscribeRealtime() {
    channel = supabase
      .channel('global-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'scope=eq.global' },
        async (payload) => {
          const row = payload.new;
          const author_name = await nameFor(row.user_id);
          globalMessages = [...globalMessages, { ...row, author_name }].slice(-150);
          renderMessages();
        }
      )
      .subscribe();
  }

  function bindEvents() {
    const form = document.getElementById('global-chat-form');
    const input = document.getElementById('global-chat-input');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      const { error } = await supabase
        .from('chat_messages')
        .insert({ scope: 'global', user_id: AuthStore.user.id, body: text });

      if (error) {
        toast('ارسال پیام ناموفق بود: ' + error.message, 'error');
        input.value = text; // give the message back so the user doesn't lose it
      }
      // No optimistic local append here — the INSERT above triggers the
      // postgres_changes realtime event above, which appends it for everyone
      // (including us) exactly once.
    });
  }

  root.innerHTML = template();
  bindEvents();

  try {
    await loadHistory();
    renderMessages();
  } catch (err) {
    toast(err.message || 'خطا در بارگذاری گفتگو', 'error');
  }

  subscribeRealtime();
}

