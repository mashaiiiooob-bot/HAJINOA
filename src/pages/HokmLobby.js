import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { relativeTime } from '../utils/format.js';

/** renderHokmLobby() - entry point for Hokm: create a private room (get an
 *  invite code), join by code, browse+join public rooms, or matchmake for a
 *  random 4-player table. All via Supabase RPCs (create_hokm_room,
 *  join_hokm_room, list_public_hokm_rooms, join/leave_hokm_matchmaking). */
export async function renderHokmLobby(root) {
  let tab = 'quick'; // quick | private | browse
  let publicRooms = [];
  let inQueue = false;
  let queueChannel = null;
  let queueTicketId = null;

  async function checkActiveRoom() {
    const { data } = await supabase
      .from('hokm_seats')
      .select('room_id, hokm_rooms!inner(status)')
      .eq('user_id', AuthStore.user.id)
      .in('hokm_rooms.status', ['waiting', 'active']);
    if (data && data.length) {
      navigate(`/hokm/${data[0].room_id}`);
      return true;
    }
    return false;
  }

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">🃏 حکم</p>
            <h1>بازی حکم چهارنفره</h1>
          </div>
        </div>
        <div class="mp-tabs" role="tablist">
          <button class="mp-tab-btn" data-tab="quick" role="tab">بازی سریع</button>
          <button class="mp-tab-btn" data-tab="private" role="tab">اتاق خصوصی</button>
          <button class="mp-tab-btn" data-tab="browse" role="tab">اتاق‌های عمومی</button>
        </div>
        <div id="hokm-lobby-content"></div>
      </div>
    `;
    root.querySelectorAll('.mp-tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  }

  function updateTabButtons() {
    root.querySelectorAll('.mp-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  }

  async function switchTab(next) {
    if (inQueue) await leaveQueue();
    tab = next;
    updateTabButtons();
    if (tab === 'browse') await loadPublicRooms();
    renderContent();
  }

  async function loadPublicRooms() {
    const { data, error } = await supabase.rpc('list_public_hokm_rooms');
    if (error) {
      toast(error.message, 'error');
      return;
    }
    publicRooms = data || [];
  }

  function quickTemplate() {
    if (inQueue) {
      return `
        <div class="card arena-idle">
          <div class="radar-scan" aria-hidden="true">
            <span class="radar-ring"></span><span class="radar-ring"></span><span class="radar-ring"></span>
            <span class="radar-core">🃏</span>
          </div>
          <p>در حال یافتن ۳ حریف دیگر…</p>
          <button class="btn btn-secondary" id="btn-cancel-hokm-queue">لغو</button>
        </div>
      `;
    }
    return `
      <div class="card card-glass card-arcane-sweep spotlight arena-idle arena-hero">
        <span class="coin-mark arena-hero-coin" aria-hidden="true"><span class="coin-face">🃏</span></span>
        <h2 class="text-shimmer">بازی سریع حکم</h2>
        <p class="hero-sub">در صف بازی سریع قرار بگیرید تا با ۳ بازیکن دیگر یک میز چهارنفره تشکیل شود.</p>
        <button class="btn btn-primary btn-block btn-magnetic" id="btn-join-hokm-queue">یافتن بازیکنان</button>
      </div>
    `;
  }

  function privateTemplate() {
    return `
      <div class="card widget-card">
        <div class="widget-title"><h3>ایجاد اتاق خصوصی</h3></div>
        <p class="hero-sub">یک اتاق بسازید و کد آن را با دوستانتان به اشتراک بگذارید.</p>
        <button class="btn btn-primary btn-block" id="btn-create-private-room">ایجاد اتاق</button>
      </div>
      <div class="card widget-card" style="margin-top:var(--sp-4)">
        <div class="widget-title"><h3>پیوستن با کد دعوت</h3></div>
        <form class="chat-input-row" id="join-code-form">
          <input type="text" id="join-code-input" class="mp-search" placeholder="کد اتاق را وارد کنید…" maxlength="8" autocomplete="off" style="text-transform:uppercase" />
          <button class="btn btn-primary btn-sm" type="submit">پیوستن</button>
        </form>
      </div>
    `;
  }

  function browseTemplate() {
    if (!publicRooms.length) {
      return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🃏</span><p>اتاق عمومی فعالی وجود ندارد.</p></div>`;
    }
    return `
      <div class="mp-grid">
        ${publicRooms
          .map(
            (r) => `
          <div class="mp-item-card card">
            <div class="mp-item-icon" aria-hidden="true">🃏</div>
            <h4 class="mp-item-name">اتاق حکم</h4>
            <p class="mp-item-cat">${Number(r.seated_count)}/4 بازیکن</p>
            <p class="mp-item-seller">${relativeTime(r.created_at)}</p>
            <div class="mp-item-footer">
              <span></span>
              <button class="btn btn-primary btn-sm" data-join-room="${r.id}">پیوستن</button>
            </div>
          </div>`
          )
          .join('')}
      </div>
    `;
  }

  function renderContent() {
    const content = document.getElementById('hokm-lobby-content');
    if (!content) return;
    if (tab === 'quick') content.innerHTML = quickTemplate();
    else if (tab === 'private') content.innerHTML = privateTemplate();
    else content.innerHTML = browseTemplate();
    bindEvents();
  }

  function bindEvents() {
    const content = document.getElementById('hokm-lobby-content');
    if (!content) return;

    content.querySelector('#btn-join-hokm-queue')?.addEventListener('click', joinQueue);
    content.querySelector('#btn-cancel-hokm-queue')?.addEventListener('click', leaveQueue);
    content.querySelector('#btn-create-private-room')?.addEventListener('click', createPrivateRoom);
    content.querySelector('#join-code-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = content.querySelector('#join-code-input').value.trim();
      if (code) joinByCode(code);
    });
    content.querySelectorAll('[data-join-room]').forEach((btn) => {
      btn.addEventListener('click', () => joinRoom(btn.dataset.joinRoom));
    });
  }

  async function createPrivateRoom() {
    try {
      const { data, error } = await supabase.rpc('create_hokm_room', { p_is_public: false });
      if (error) throw new Error(error.message);
      toast(`اتاق ساخته شد! کد دعوت: ${data[0].code}`, 'success');
      navigate(`/hokm/${data[0].room_id}`);
    } catch (err) {
      toast(err.message || 'ایجاد اتاق ناموفق بود', 'error');
    }
  }

  async function joinByCode(code) {
    try {
      const { data, error } = await supabase.rpc('join_hokm_room', { p_room_id: null, p_code: code });
      if (error) throw new Error(error.message);
      navigate(`/hokm/${data}`);
    } catch (err) {
      toast(err.message || 'پیوستن ناموفق بود', 'error');
    }
  }

  async function joinRoom(roomId) {
    try {
      const { data, error } = await supabase.rpc('join_hokm_room', { p_room_id: roomId, p_code: null });
      if (error) throw new Error(error.message);
      navigate(`/hokm/${data}`);
    } catch (err) {
      toast(err.message || 'پیوستن ناموفق بود', 'error');
    }
  }

  async function joinQueue() {
    inQueue = true;
    renderContent();
    try {
      const { data, error } = await supabase.rpc('join_hokm_matchmaking');
      if (error) throw new Error(error.message);
      queueTicketId = data[0].ticket_id;
      if (data[0].ticket_status === 'matched' && data[0].room_id) {
        navigate(`/hokm/${data[0].room_id}`);
        return;
      }
      subscribeQueue(queueTicketId);
    } catch (err) {
      toast(err.message || 'ورود به صف ناموفق بود', 'error');
      inQueue = false;
      renderContent();
    }
  }

  function subscribeQueue(ticketId) {
    queueChannel?.unsubscribe();
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
    });
    queueChannel = supabase
      .channel(`hokm-queue-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hokm_matchmaking_queue', filter: `id=eq.${ticketId}` },
        (payload) => {
          if (payload.new.status === 'matched' && payload.new.room_id) {
            navigate(`/hokm/${payload.new.room_id}`);
          }
        }
      )
      .subscribe();

    const poll = setInterval(async () => {
      if (!inQueue) return clearInterval(poll);
      const { data } = await supabase.from('hokm_matchmaking_queue').select('status, room_id').eq('id', ticketId).single();
      if (data?.status === 'matched' && data.room_id) {
        clearInterval(poll);
        navigate(`/hokm/${data.room_id}`);
      }
    }, 2500);
  }

  async function leaveQueue() {
    inQueue = false;
    queueChannel?.unsubscribe();
    queueChannel = null;
    try {
      await supabase.rpc('leave_hokm_matchmaking');
    } catch {
      /* best-effort */
    }
    renderContent();
  }

  shell();
  updateTabButtons();
  if (await checkActiveRoom()) return;
  renderContent();

  return function teardown() {
    queueChannel?.unsubscribe();
  };
}
