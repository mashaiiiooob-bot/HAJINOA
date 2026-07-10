import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/format.js';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR_CLASS = { S: 'card-black', C: 'card-black', H: 'card-red', D: 'card-red' };
const RANK_LABEL = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const SUIT_NAME_FA = { hearts: 'دل', diamonds: 'خشت', clubs: 'گشنیز', spades: 'پیک' };

function cardRank(card) { return card[0]; }
function cardSuit(card) { return card[1]; }
function rankLabel(r) { return RANK_LABEL[r] || r; }

/** renderHokmTable(root, roomId) - the live table: top-down 4-seat layout,
 *  own hand face-up at the bottom, opponents' hands face-down, trick cards
 *  animated into the center, trump/turn indicators, score panel, room chat.
 *  Realtime-driven via hokm_seats/hokm_rounds/hokm_tricks/hokm_room_messages
 *  subscriptions; all game actions go through Supabase RPCs (anti-cheat logic
 *  lives entirely server-side, see migrations 026-037). */
export async function renderHokmTable(root, roomId) {
  let channel = null;
  let room = null;
  let seats = []; // [{seat, user_id, display_name, is_connected}, ...]
  let mySeat = null;
  let round = null; // current hokm_rounds row (metadata only, no hands)
  let myHand = [];
  let currentTrick = null; // current open hokm_tricks row
  let lastCompletedTrick = null;
  let chatMessages = [];
  let loading = true;

  function teardown() {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  /* -------------------------------------------------------------- Loading */

  async function loadRoom() {
    const { data: roomData, error: roomErr } = await supabase.from('hokm_rooms').select('*').eq('id', roomId).single();
    if (roomErr || !roomData) throw new Error('اتاق یافت نشد');
    room = roomData;

    const { data: seatData, error: seatErr } = await supabase
      .from('hokm_seats')
      .select('seat, user_id, is_connected, users(display_name)')
      .eq('room_id', roomId)
      .order('seat');
    if (seatErr) throw new Error(seatErr.message);
    seats = (seatData || []).map((s) => ({ seat: s.seat, user_id: s.user_id, display_name: s.users?.display_name, is_connected: s.is_connected }));
    mySeat = seats.find((s) => s.user_id === AuthStore.user.id)?.seat ?? null;

    if (mySeat === null) {
      throw new Error('شما در این اتاق نیستید');
    }

    if (room.status === 'active') {
      await loadCurrentRound();
    }

    const { data: msgs } = await supabase
      .from('hokm_room_messages')
      .select('id, user_id, body, created_at, users(display_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(50);
    chatMessages = (msgs || []).map((m) => ({ ...m, author_name: m.users?.display_name })).reverse();
  }

  async function loadCurrentRound() {
    const { data: roundData } = await supabase
      .from('hokm_rounds')
      .select('id, round_number, hakem_seat, trump_suit, status, team_a_tricks, team_b_tricks, winner_team, is_kot, is_hakem_kot')
      .eq('room_id', roomId)
      .order('round_number', { ascending: false })
      .limit(1)
      .single();
    round = roundData || null;
    if (!round) return;

    if (round.status !== 'completed') {
      const { data: handData, error: handErr } = await supabase.rpc('get_my_hokm_hand', { p_round_id: round.id });
      if (!handErr) myHand = sortHand(handData || []);
    }

    const { data: trickData } = await supabase
      .from('hokm_tricks')
      .select('*')
      .eq('round_id', round.id)
      .order('trick_number', { ascending: false })
      .limit(1)
      .single();
    if (trickData) {
      if (trickData.winner_seat === null) {
        currentTrick = trickData;
        lastCompletedTrick = null;
      } else {
        currentTrick = null;
        lastCompletedTrick = trickData;
      }
    }
  }

  function sortHand(cards) {
    const suitOrder = { S: 0, H: 1, C: 2, D: 3 };
    const rankOrder = '23456789TJQKA';
    return [...cards].sort((a, b) => {
      const s = suitOrder[cardSuit(a)] - suitOrder[cardSuit(b)];
      if (s !== 0) return s;
      return rankOrder.indexOf(cardRank(a)) - rankOrder.indexOf(cardRank(b));
    });
  }

  /* ------------------------------------------------------------- Realtime */

  function subscribe() {
    teardown();
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
    });
    channel = supabase
      .channel(`hokm-room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hokm_rooms', filter: `id=eq.${roomId}` }, handleRoomChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hokm_seats', filter: `room_id=eq.${roomId}` }, handleSeatsChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hokm_rounds', filter: `room_id=eq.${roomId}` }, handleRoundChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hokm_tricks' }, handleTrickChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hokm_room_messages', filter: `room_id=eq.${roomId}` }, handleNewMessage)
      .subscribe();
  }

  async function handleRoomChange(payload) {
    room = payload.new;
    if (room.status === 'completed') {
      render();
      return;
    }
    render();
  }

  async function handleSeatsChange() {
    const { data } = await supabase
      .from('hokm_seats')
      .select('seat, user_id, is_connected, users(display_name)')
      .eq('room_id', roomId)
      .order('seat');
    seats = (data || []).map((s) => ({ seat: s.seat, user_id: s.user_id, display_name: s.users?.display_name, is_connected: s.is_connected }));
    render();
  }

  async function handleRoundChange(payload) {
    if (payload.new.room_id !== roomId) return;
    const isNewRound = !round || round.id !== payload.new.id;
    round = payload.new;
    if (isNewRound || round.status !== 'completed') {
      const { data: handData, error } = await supabase.rpc('get_my_hokm_hand', { p_round_id: round.id });
      if (!error) myHand = sortHand(handData || []);
    }
    if (isNewRound) {
      currentTrick = null;
      lastCompletedTrick = null;
    }
    render();
  }

  async function handleTrickChange(payload) {
    if (!round || payload.new?.round_id !== round.id) return;
    if (payload.new.winner_seat === null) {
      currentTrick = payload.new;
      render();
    } else {
      lastCompletedTrick = payload.new;
      currentTrick = null;
      render();
      // Re-sync hand (a card was just removed) and briefly show the
      // completed trick before the next one's UI takes over.
      const { data: handData } = await supabase.rpc('get_my_hokm_hand', { p_round_id: round.id });
      if (handData) myHand = sortHand(handData);
      setTimeout(() => {
        if (lastCompletedTrick?.id === payload.new.id) {
          lastCompletedTrick = null;
          render();
        }
      }, 1800);
    }
  }

  function handleNewMessage(payload) {
    chatMessages = [...chatMessages, { ...payload.new, author_name: seats.find((s) => s.user_id === payload.new.user_id)?.display_name }].slice(-100);
    renderChat();
  }

  /* ----------------------------------------------------------- Rendering */

  function seatAt(offset) {
    // offset 0 = me (bottom), 1 = left, 2 = partner (top), 3 = right —
    // rotated so "me" always renders at the bottom regardless of my actual seat number.
    const seatNum = (mySeat + offset) % 4;
    return seats.find((s) => s.seat === seatNum) || { seat: seatNum, display_name: 'در انتظار…' };
  }

  function isMyTurn() {
    if (!currentTrick || !round || round.status !== 'playing') return false;
    const expectedSeat = (currentTrick.leader_seat + (currentTrick.plays?.length || 0)) % 4;
    return expectedSeat === mySeat;
  }

  function playedCardFor(seatNum) {
    const plays = currentTrick?.plays || lastCompletedTrick?.plays || [];
    return plays.find((p) => p.seat === seatNum)?.card || null;
  }

  function cardFaceHtml(card, size = 'md') {
    const suit = cardSuit(card);
    const rank = cardRank(card);
    return `
      <div class="hokm-card hokm-card-${size} ${SUIT_COLOR_CLASS[suit]}">
        <span class="hokm-card-corner hokm-card-corner-tl">${rankLabel(rank)}<br/>${SUIT_SYMBOL[suit]}</span>
        <span class="hokm-card-center">${SUIT_SYMBOL[suit]}</span>
        <span class="hokm-card-corner hokm-card-corner-br">${rankLabel(rank)}<br/>${SUIT_SYMBOL[suit]}</span>
      </div>
    `;
  }

  function cardBackHtml(size = 'md') {
    return `<div class="hokm-card hokm-card-back hokm-card-${size}"><span class="hokm-card-back-pattern">🃏</span></div>`;
  }

  function waitingRoomTemplate() {
    return `
      <div class="card card-glass arena-idle">
        <h2>در انتظار بازیکنان</h2>
        <p class="hero-sub">${seats.length}/4 نفر در اتاق</p>
        ${room.code ? `<div class="hokm-room-code">کد اتاق: <strong>${escapeHtml(room.code)}</strong></div>` : ''}
        <ul class="lb-list" style="margin-top:var(--sp-4)">
          ${[0, 1, 2, 3]
            .map((s) => {
              const seat = seats.find((x) => x.seat === s);
              return `<li class="lb-row"><span class="lb-name">صندلی ${s + 1}</span><span>${seat ? escapeHtml(seat.display_name || 'بازیکن') : 'خالی…'}</span></li>`;
            })
            .join('')}
        </ul>
        <button class="btn btn-secondary btn-block" id="btn-leave-hokm-room" style="margin-top:var(--sp-4)">ترک اتاق</button>
      </div>
    `;
  }

  function chooseTrumpTemplate() {
    const suits = [
      { code: 'spades', label: 'پیک', symbol: '♠' },
      { code: 'hearts', label: 'دل', symbol: '♥' },
      { code: 'diamonds', label: 'خشت', symbol: '♦' },
      { code: 'clubs', label: 'گشنیز', symbol: '♣' },
    ];
    return `
      <div class="card card-glass arena-idle">
        <h2 class="text-shimmer">انتخاب خال حکم</h2>
        <p class="hero-sub">به‌عنوان حاکم، خال حکم را انتخاب کنید.</p>
        <div class="hokm-trump-picker">
          ${suits
            .map(
              (s) => `
            <button class="hokm-trump-btn ${SUIT_COLOR_CLASS[s.code[0].toUpperCase()] || ''}" data-trump="${s.code}">
              <span class="hokm-trump-symbol">${s.symbol}</span><span>${s.label}</span>
            </button>`
            )
            .join('')}
        </div>
      </div>
    `;
  }

  function waitingForTrumpTemplate() {
    const hakemSeatInfo = seats.find((s) => s.seat === round.hakem_seat);
    return `
      <div class="card arena-idle">
        <p class="turn-banner"><span class="pulse-dot pulse-ring"></span>${escapeHtml(hakemSeatInfo?.display_name || 'حاکم')} در حال انتخاب خال حکم است…</p>
      </div>
    `;
  }

  function tableTemplate() {
    const partner = seatAt(2);
    const left = seatAt(1);
    const right = seatAt(3);
    const me = seatAt(0);
    const myTurn = isMyTurn();

    return `
      <div class="hokm-table-wrap">
        <div class="hokm-scoreboard">
          <div class="hokm-score-team">
            <span class="hokm-score-label">تیم شما</span>
            <span class="hokm-score-value">${room.team_a_sets ?? 0}</span>
          </div>
          <div class="hokm-trump-display">
            ${round?.trump_suit ? `<span class="hokm-trump-chip ${SUIT_COLOR_CLASS[round.trump_suit[0].toUpperCase() === 'H' ? 'H' : round.trump_suit === 'diamonds' ? 'D' : round.trump_suit === 'clubs' ? 'C' : 'S']}">${SUIT_SYMBOL[{hearts:'H',diamonds:'D',clubs:'C',spades:'S'}[round.trump_suit]]} ${SUIT_NAME_FA[round.trump_suit]}</span>` : ''}
            <span class="hokm-tricks-display">${round?.team_a_tricks ?? 0} — ${round?.team_b_tricks ?? 0}</span>
          </div>
          <div class="hokm-score-team">
            <span class="hokm-score-label">حریف</span>
            <span class="hokm-score-value">${room.team_b_sets ?? 0}</span>
          </div>
        </div>

        <div class="hokm-table">
          <div class="hokm-seat hokm-seat-top ${partner.seat === round?.hakem_seat ? 'hokm-seat-hakem' : ''}">
            <div class="hokm-opponent-hand hokm-opponent-hand-top">${Array(myHand.length ? 13 : 0).fill(0).map(() => cardBackHtml('sm')).join('')}</div>
            <div class="hokm-seat-badge ${!partner.is_connected && partner.user_id ? 'hokm-seat-disconnected' : ''}">${escapeHtml(partner.display_name || 'در انتظار…')}</div>
          </div>

          <div class="hokm-seat hokm-seat-left ${left.seat === round?.hakem_seat ? 'hokm-seat-hakem' : ''}">
            <div class="hokm-opponent-hand hokm-opponent-hand-side">${Array(myHand.length ? 13 : 0).fill(0).map(() => cardBackHtml('sm')).join('')}</div>
            <div class="hokm-seat-badge ${!left.is_connected && left.user_id ? 'hokm-seat-disconnected' : ''}">${escapeHtml(left.display_name || 'در انتظار…')}</div>
          </div>

          <div class="hokm-seat hokm-seat-right ${right.seat === round?.hakem_seat ? 'hokm-seat-hakem' : ''}">
            <div class="hokm-opponent-hand hokm-opponent-hand-side">${Array(myHand.length ? 13 : 0).fill(0).map(() => cardBackHtml('sm')).join('')}</div>
            <div class="hokm-seat-badge ${!right.is_connected && right.user_id ? 'hokm-seat-disconnected' : ''}">${escapeHtml(right.display_name || 'در انتظار…')}</div>
          </div>

          <div class="hokm-trick-center">
            ${[0, 1, 2, 3]
              .map((offset) => {
                const seatNum = (mySeat + offset) % 4;
                const card = playedCardFor(seatNum);
                const pos = ['bottom', 'left', 'top', 'right'][offset];
                return card ? `<div class="hokm-trick-card hokm-trick-card-${pos}">${cardFaceHtml(card, 'sm')}</div>` : '';
              })
              .join('')}
          </div>

          <div class="hokm-seat hokm-seat-bottom ${me.seat === round?.hakem_seat ? 'hokm-seat-hakem' : ''}">
            <div class="hokm-seat-badge hokm-seat-badge-me ${myTurn ? 'hokm-seat-badge-turn' : ''}">${escapeHtml(AuthStore.user.displayName)}</div>
          </div>
        </div>

        <div class="hokm-my-hand${myTurn ? ' hokm-my-hand-turn' : ''}">
          ${myHand
            .map(
              (card, i) => `
            <button class="hokm-hand-card" data-card="${card}" style="--i:${i}" ${myTurn ? '' : 'disabled'}>
              ${cardFaceHtml(card, 'lg')}
            </button>`
            )
            .join('')}
        </div>

        <div style="text-align:center">
          <button class="btn btn-ghost btn-sm" id="btn-forfeit-hokm">تسلیم و ترک بازی</button>
        </div>
      </div>
    `;
  }

  function roundCompleteBanner() {
    if (!round || round.status !== 'completed') return '';
    const iWon = (round.winner_team === 0) === (mySeat % 2 === 0);
    const label = round.is_hakem_kot ? 'حاکم‌کت! (۳ امتیاز)' : round.is_kot ? 'کت! (۲ امتیاز)' : 'برد دور';
    return `
      <div class="hokm-round-banner ${iWon ? 'hokm-round-banner-win' : 'hokm-round-banner-lose'}">
        ${iWon ? '🎉 تیم شما این دور را برد!' : '😔 تیم حریف این دور را برد.'} — ${label}
      </div>
    `;
  }

  function matchCompleteTemplate() {
    const iWon = (room.winner_team === 0) === (mySeat % 2 === 0);
    return `
      <div class="card card-glass ${iWon ? 'card-arcane-sweep' : ''} arena-idle result-burst">
        <span class="empty-icon result-icon ${iWon ? 'win' : ''}" aria-hidden="true">${iWon ? '🏆' : '😔'}</span>
        <h2 class="${iWon ? 'text-shimmer' : ''}">${iWon ? 'تیم شما مسابقه را برد!' : 'تیم حریف مسابقه را برد.'}</h2>
        <p class="hero-sub">امتیاز نهایی: ${room.team_a_sets} — ${room.team_b_sets}</p>
        <button class="btn btn-primary btn-block" id="btn-back-to-hokm-lobby">بازگشت به لابی</button>
      </div>
    `;
  }

  function chatTemplate() {
    return `
      <section class="card widget-card hokm-chat-card">
        <div class="widget-title"><h3>گفتگوی اتاق</h3></div>
        <div class="chat-messages" id="hokm-chat-messages">${renderChatList()}</div>
        <form class="chat-input-row" id="hokm-chat-form">
          <input type="text" id="hokm-chat-input" class="mp-search" placeholder="پیام…" maxlength="300" autocomplete="off" />
          <button class="btn btn-primary btn-sm" type="submit">ارسال</button>
        </form>
      </section>
    `;
  }

  function renderChatList() {
    if (!chatMessages.length) return `<p class="chat-empty">هنوز پیامی ارسال نشده است.</p>`;
    return chatMessages
      .map((m) => {
        const mine = m.user_id === AuthStore.user.id;
        return `<div class="chat-msg${mine ? ' chat-msg-mine' : ''}"><span class="chat-msg-author">${escapeHtml(m.author_name || '')}</span><span class="chat-msg-body">${escapeHtml(m.body)}</span></div>`;
      })
      .join('');
  }

  function renderChat() {
    const el = document.getElementById('hokm-chat-messages');
    if (el) {
      el.innerHTML = renderChatList();
      el.scrollTop = el.scrollHeight;
    }
  }

  function render() {
    if (loading) {
      root.innerHTML = `<div class="container page-pad"><div class="skeleton" style="height:480px;border-radius:var(--r-lg)"></div></div>`;
      return;
    }

    let mainContent;
    if (room.status === 'waiting') {
      mainContent = waitingRoomTemplate();
    } else if (room.status === 'completed') {
      mainContent = matchCompleteTemplate();
    } else if (!round || round.status === 'choosing_trump') {
      const amHakem = round && round.hakem_seat === mySeat;
      mainContent = `${roundCompleteBanner()}${amHakem ? chooseTrumpTemplate() : waitingForTrumpTemplate()}`;
    } else {
      mainContent = `${roundCompleteBanner()}${tableTemplate()}`;
    }

    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">🃏 حکم</p>
            <h1>میز بازی</h1>
          </div>
        </div>
        <div class="hokm-layout">
          <div class="hokm-main">${mainContent}</div>
          ${room.status === 'active' ? chatTemplate() : ''}
        </div>
      </div>
    `;
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('btn-leave-hokm-room')?.addEventListener('click', leaveRoom);
    document.getElementById('btn-forfeit-hokm')?.addEventListener('click', forfeitHokm);
    document.getElementById('btn-back-to-hokm-lobby')?.addEventListener('click', () => navigate('/hokm'));
    document.querySelectorAll('[data-trump]').forEach((btn) => {
      btn.addEventListener('click', () => chooseTrump(btn.dataset.trump));
    });
    document.querySelectorAll('.hokm-hand-card').forEach((btn) => {
      btn.addEventListener('click', () => playCard(btn.dataset.card));
    });
    const form = document.getElementById('hokm-chat-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('hokm-chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendMessage(text);
    });
  }

  async function chooseTrump(suit) {
    try {
      const { error } = await supabase.rpc('choose_hokm_trump', { p_round_id: round.id, p_suit: suit });
      if (error) throw new Error(error.message);
    } catch (err) {
      toast(err.message || 'انتخاب خال ناموفق بود', 'error');
    }
  }

  async function playCard(card) {
    try {
      const { error } = await supabase.rpc('play_hokm_card', { p_round_id: round.id, p_card: card });
      if (error) throw new Error(error.message);
      myHand = myHand.filter((c) => c !== card);
      render();
    } catch (err) {
      toast(err.message || 'این حرکت مجاز نیست', 'error');
    }
  }

  async function sendMessage(text) {
    const { error } = await supabase.from('hokm_room_messages').insert({ room_id: roomId, user_id: AuthStore.user.id, body: text });
    if (error) toast('ارسال پیام ناموفق بود', 'error');
  }

  async function leaveRoom() {
    if (!confirm('آیا از ترک اتاق مطمئن هستید؟')) return;
    try {
      const { error } = await supabase.rpc('leave_hokm_room', { p_room_id: roomId });
      if (error) throw new Error(error.message);
    } catch (err) {
      toast(err.message || 'خروج ناموفق بود', 'error');
    }
    teardown();
    navigate('/hokm');
  }

  async function forfeitHokm() {
    if (!confirm('آیا از تسلیم شدن مطمئن هستید؟ تیم شما این مسابقه را می‌بازد.')) return;
    try {
      const { error } = await supabase.rpc('forfeit_hokm_room', { p_room_id: roomId });
      if (error) throw new Error(error.message);
    } catch (err) {
      toast(err.message || 'تسلیم ناموفق بود', 'error');
    }
    // room's realtime UPDATE subscription (handleRoomChange) picks up the
    // status flip to 'completed' and re-renders into matchCompleteTemplate.
  }

  render();
  try {
    await loadRoom();
    if (room.status === 'active') {
      await supabase.rpc('rejoin_hokm_room', { p_room_id: roomId }).catch(() => {});
    }
  } catch (err) {
    toast(err.message || 'خطا در بارگذاری اتاق', 'error');
    navigate('/hokm');
    return;
  }
  loading = false;
  render();
  subscribe();

  return teardown; // returned so the router can clean up the channel on navigation, if it chooses to call it
}
