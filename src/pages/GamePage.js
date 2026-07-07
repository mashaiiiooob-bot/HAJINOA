import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { escapeHtml } from '../utils/format.js';
import { spawnParticles, animateCounter } from '../utils/effects.js';

export function renderGamePage(root) {
  let state = 'idle'; // idle | searching | starting | matched | finished
  let selectedMode = 'classic'; // classic only for now — rps has no backend support yet
  let match = null; // { matchId, opponent, scores, mode, roundNumber }
  let lastChoice = null;
  let roundFlash = null; // { guessedHand, hidden, correct, whoScored }
  let countdown = 3;
  let queueChannel = null;
  let matchChannel = null;
  let roundsChannel = null;
  let processedRoundNumbers = new Set();

  function render() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="arena-wrap">${stateTemplate()}</div>
      </div>
    `;
    bindEvents();
    afterRenderEffects();
  }

  function afterRenderEffects() {
    root.querySelectorAll('.counter[data-target]').forEach((el) => {
      animateCounter(el, Number(el.dataset.target), { formatFn: (n) => Math.round(n).toLocaleString('fa-IR') });
    });
    if (state === 'finished' && match?.winnerId === AuthStore.user.id) {
      spawnParticles(root.querySelector('.result-burst'), 26, { className: 'celebrate-particle', burst: true });
      triggerScreenFlash('win');
    }
  }

  function triggerScreenFlash(kind) {
    const flash = document.createElement('div');
    flash.className = `screen-flash screen-flash-${kind}`;
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
  }

  function isMyTurn() {
    return state === 'matched' && !lastChoice && !roundFlash;
  }

  function stateTemplate() {
    if (state === 'idle') {
      return `
        <div class="card card-glass card-arcane-sweep spotlight arena-idle arena-hero">
          <div class="arcane-seal" aria-hidden="true" style="top:-140px; inset-inline-end:-160px; width:420px; height:420px;"></div>
          <span class="coin-mark arena-hero-coin" aria-hidden="true"><span class="coin-face">🤲</span></span>
          <h2 class="text-shimmer">آماده بازی هستید؟</h2>
          <p class="hero-sub">یک بازی انتخاب کنید و با یک حریف آنلاین رقابت کنید.</p>
          <div class="mode-picker">
            <button class="mode-pick-card${selectedMode === 'classic' ? ' active' : ''}" data-pick-mode="classic">
              <span class="mode-pick-icon" aria-hidden="true">🤲</span>
              <span class="mode-pick-name">دست یا خالی</span>
              <span class="mode-pick-desc">توکن پنهان را حدس بزنید</span>
            </button>
            <button class="mode-pick-card disabled" data-pick-mode="rps" disabled title="به‌زودی">
              <span class="mode-pick-icon" aria-hidden="true">✂️</span>
              <span class="mode-pick-name">سنگ کاغذ قیچی</span>
              <span class="mode-pick-desc">به‌زودی</span>
            </button>
          </div>
          <button class="btn btn-primary btn-block btn-magnetic" id="btn-find-match">یافتن حریف</button>
        </div>
      `;
    }
    if (state === 'searching') {
      return `
        <div class="card arena-idle">
          <div class="radar-scan" aria-hidden="true">
            <span class="radar-ring"></span><span class="radar-ring"></span><span class="radar-ring"></span>
            <span class="radar-core">🤲</span>
          </div>
          <p>در حال یافتن حریف…</p>
          <button class="btn btn-secondary" id="btn-cancel-queue">لغو</button>
        </div>
      `;
    }
    if (state === 'starting') {
      return `
        <div class="card arena-idle">
          <p class="turn-banner"><span class="pulse-dot pulse-ring"></span>حریف پیدا شد!</p>
          <span class="countdown-num" key="${countdown}">${countdown > 0 ? countdown : 'شروع!'}</span>
        </div>
      `;
    }
    if (state === 'matched') {
      const youScore = match.scores?.[AuthStore.user.id] || 0;
      const oppId = match.opponent.id;
      const oppScore = match.scores?.[oppId] || 0;
      const myTurn = isMyTurn();
      const flashingMe = roundFlash?.whoScored === 'me';
      const flashingOpp = roundFlash?.whoScored === 'opp';

      return `
        <div class="card match-card${myTurn ? ' your-turn' : ''}">
          <div class="match-players">
            <div class="match-player${myTurn ? ' active' : ''}">
              <span class="avatar">${escapeHtml(AuthStore.user.displayName[0])}</span>
              <span>${escapeHtml(AuthStore.user.displayName)}</span>
              <span class="match-score${flashingMe ? ' score-bump' : ''}">${youScore}</span>
            </div>
            <span class="match-vs">VS</span>
            <div class="match-player">
              <span class="avatar">${escapeHtml(match.opponent.displayName[0])}</span>
              <span>${escapeHtml(match.opponent.displayName)}</span>
              <span class="match-score${flashingOpp ? ' score-bump' : ''}">${oppScore}</span>
            </div>
          </div>

          ${myTurn ? `<p class="turn-banner"><span class="pulse-dot pulse-ring"></span>نوبت شماست — حدس بزنید!</p>` : ''}
          <p class="match-status" id="match-status">${statusText()}</p>

          <div class="hand-choices">
            ${handButton('left', '✋ چپ')}${handButton('right', '🤚 راست')}
          </div>
        </div>
      `;
    }
    if (state === 'finished') {
      const won = match.winnerId === AuthStore.user.id;
      return `
        <div class="card card-glass ${won ? 'card-arcane-sweep' : ''} arena-idle result-burst">
          <span class="empty-icon result-icon ${won ? 'win' : ''}" aria-hidden="true">${won ? '🏆' : '😔'}</span>
          <h2 class="${won ? 'text-shimmer' : ''}">${won ? 'شما برنده شدید!' : 'باختید — دفعه بعد بهتر!'}</h2>
          ${
            won
              ? `<div class="gain-row">
                  <div class="gain-pill"><span class="gain-value gold counter" data-target="${match.coinGain || 0}">۰</span><span class="gain-label">سکه</span></div>
                  <div class="gain-pill"><span class="gain-value purple counter" data-target="${match.xpGain || 0}">۰</span><span class="gain-label">XP</span></div>
                </div>`
              : ''
          }
          <button class="btn btn-primary btn-block btn-magnetic" id="btn-rematch">بازی دوباره</button>
        </div>
      `;
    }
    return '';
  }

  function statusText() {
    return roundFlash
      ? `توکن در دست ${roundFlash.hidden === 'left' ? 'چپ' : 'راست'} بود.`
      : 'دست چپ یا راست؟ توکن در یکی از دست‌هاست.';
  }

  function handButton(hand, label) {
    const disabled = !!lastChoice || !!roundFlash;
    const isChosen = lastChoice === hand;
    const isWaiting = isChosen && !roundFlash;
    let cls = 'hand-btn';
    let revealIcon = hand === 'left' ? '✋' : '🤚';
    let stateCls = '';

    if (roundFlash) {
      const wasHidden = roundFlash.hidden === hand;
      stateCls = wasHidden ? ' revealed-hit' : ' revealed-miss';
      revealIcon = wasHidden ? '🪙' : '💨';
      if (roundFlash.guessedHand === hand) cls += roundFlash.correct ? ' chosen correct' : ' chosen wrong';
    } else if (isWaiting) {
      stateCls = ' waiting-fist';
      revealIcon = '✊';
      cls += ' chosen';
    }

    return `
      <button class="${cls}${stateCls}" data-hand="${hand}" ${disabled ? 'disabled' : ''}>
        <span class="hand-reveal-icon" aria-hidden="true">${revealIcon}</span>
        <span class="hand-btn-label">${label}</span>
      </button>
    `;
  }

  function bindEvents() {
    root.querySelectorAll('[data-pick-mode]').forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => {
        selectedMode = btn.dataset.pickMode;
        render();
      });
    });
    document.getElementById('btn-find-match')?.addEventListener('click', joinQueue);
    document.getElementById('btn-cancel-queue')?.addEventListener('click', cancelQueue);
    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      state = 'idle';
      match = null;
      lastChoice = null;
      roundFlash = null;
      processedRoundNumbers = new Set();
      render();
    });
    root.querySelectorAll('.hand-btn').forEach((btn) => {
      btn.addEventListener('click', () => playRound(btn.dataset.hand));
    });
  }

  /* ---------------------------------------------------------- Matchmaking */

  async function joinQueue() {
    state = 'searching';
    render();
    try {
      const { data: ticket, error } = await supabase.rpc('join_matchmaking_queue', {
        p_mode_code: selectedMode,
        p_is_ranked: true,
      });
      if (error) throw error;

      if (ticket.status === 'matched' && ticket.match_id) {
        await enterMatch(ticket.match_id);
      } else {
        subscribeToQueueTicket(ticket.id);
      }
    } catch (err) {
      toast(err.message || 'خطا در جستجوی حریف', 'error');
      state = 'idle';
      render();
    }
  }

  function subscribeToQueueTicket(ticketId) {
    queueChannel?.unsubscribe();

    // Explicitly (re)apply the current session's access token to the realtime
    // connection before subscribing. In some client-SDK/session-timing edge
    // cases the websocket auth can lag behind a fresh sign-in, which silently
    // blocks postgres_changes delivery for RLS-protected tables like this one.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
    });

    queueChannel = supabase
      .channel(`queue:${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matchmaking_queue', filter: `id=eq.${ticketId}` },
        (payload) => {
          const row = payload.new;
          if (row.status === 'matched' && row.match_id) {
            stopQueuePolling();
            queueChannel?.unsubscribe();
            queueChannel = null;
            enterMatch(row.match_id);
          }
        }
      )
      .subscribe();

    // Fallback: if realtime ever fails to deliver the UPDATE (dropped
    // connection, auth race, etc.), a lightweight poll still finds the match
    // within ~2s instead of leaving the player stuck on "finding opponent"
    // forever.
    startQueuePolling(ticketId);
  }

  let queuePollInterval = null;
  function startQueuePolling(ticketId) {
    stopQueuePolling();
    queuePollInterval = setInterval(async () => {
      const { data, error } = await supabase
        .from('matchmaking_queue')
        .select('status, match_id')
        .eq('id', ticketId)
        .single();
      if (!error && data?.status === 'matched' && data.match_id) {
        stopQueuePolling();
        queueChannel?.unsubscribe();
        queueChannel = null;
        enterMatch(data.match_id);
      }
    }, 2000);
  }
  function stopQueuePolling() {
    if (queuePollInterval) {
      clearInterval(queuePollInterval);
      queuePollInterval = null;
    }
  }

  async function cancelQueue() {
    stopQueuePolling();
    queueChannel?.unsubscribe();
    queueChannel = null;
    try {
      await supabase.rpc('leave_matchmaking_queue', { p_mode_code: selectedMode, p_is_ranked: true });
    } catch {
      /* best-effort — the queue row will simply sit unmatched otherwise */
    }
    state = 'idle';
    render();
  }

  /* --------------------------------------------------------------- Match */

  async function enterMatch(matchId) {
    const { data: participants, error } = await supabase
      .from('match_participants')
      .select('user_id, users(display_name)')
      .eq('match_id', matchId);
    if (error || !participants) {
      toast('خطا در بارگذاری اطلاعات مسابقه', 'error');
      state = 'idle';
      render();
      return;
    }
    const opponentRow = participants.find((p) => p.user_id !== AuthStore.user.id);

    const { data: myUserRow } = await supabase.from('users').select('coins, xp').eq('id', AuthStore.user.id).single();

    match = {
      matchId,
      opponent: { id: opponentRow.user_id, displayName: opponentRow.users?.display_name || 'حریف' },
      scores: {},
      mode: 'classic',
      roundNumber: 1,
      coinsBefore: myUserRow?.coins ?? AuthStore.user.coins ?? 0,
      xpBefore: myUserRow?.xp ?? AuthStore.user.xp ?? 0,
    };
    lastChoice = null;
    roundFlash = null;
    processedRoundNumbers = new Set();
    subscribeToMatch(matchId);
    state = 'starting';
    runStartingCountdown();
  }

  function subscribeToMatch(matchId) {
    matchChannel?.unsubscribe();
    matchChannel = supabase
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          if (payload.new.status === 'completed') handleMatchFinished(payload.new);
        }
      )
      .subscribe();

    roundsChannel?.unsubscribe();
    roundsChannel = supabase
      .channel(`match-rounds:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_rounds', filter: `match_id=eq.${matchId}` },
        (payload) => handleRoundResolved(payload.new)
      )
      .subscribe();
  }

  async function handleRoundResolved(roundRow) {
    if (processedRoundNumbers.has(roundRow.round_number)) return;
    processedRoundNumbers.add(roundRow.round_number);

    const hidden = roundRow.moves?.hidden;
    const roundWinnerId = roundRow.round_winner_id;
    const prevYou = match.scores?.[AuthStore.user.id] || 0;
    const prevOpp = match.scores?.[match.opponent.id] || 0;
    const newYou = roundWinnerId === AuthStore.user.id ? prevYou + 1 : prevYou;
    const newOpp = roundWinnerId === match.opponent.id ? prevOpp + 1 : prevOpp;
    const whoScored = roundWinnerId === AuthStore.user.id ? 'me' : roundWinnerId === match.opponent.id ? 'opp' : null;

    roundFlash = {
      guessedHand: lastChoice,
      hidden,
      correct: lastChoice === hidden,
      whoScored,
    };
    match.scores = { ...match.scores, [AuthStore.user.id]: newYou, [match.opponent.id]: newOpp };
    match.roundNumber = roundRow.round_number + 1;
    render();
    triggerScreenFlash(roundFlash.correct ? 'hit' : 'miss');
    setTimeout(() => {
      if (state !== 'matched') return; // match may have already finished
      roundFlash = null;
      lastChoice = null;
      render();
    }, 1200);
  }

  async function handleMatchFinished(matchRow) {
    matchChannel?.unsubscribe();
    roundsChannel?.unsubscribe();
    matchChannel = null;
    roundsChannel = null;

    const won = matchRow.winner_id === AuthStore.user.id;
    let coinGain = 0;
    let xpGain = 0;
    if (won) {
      const { data: myUserRow } = await supabase.from('users').select('coins, xp').eq('id', AuthStore.user.id).single();
      if (myUserRow) {
        coinGain = myUserRow.coins - (match.coinsBefore ?? myUserRow.coins);
        xpGain = myUserRow.xp - (match.xpBefore ?? myUserRow.xp);
        AuthStore.user.coins = myUserRow.coins;
        AuthStore.user.xp = myUserRow.xp;
      }
    }

    match = { ...match, winnerId: matchRow.winner_id, coinGain, xpGain };
    state = 'finished';
    toast(won ? 'پیروزی! 🎉' : 'باخت — دوباره تلاش کنید', won ? 'win' : 'loss');
    render();
  }

  function runStartingCountdown() {
    countdown = 3;
    render();
    const interval = setInterval(() => {
      countdown -= 1;
      if (countdown < 0) {
        clearInterval(interval);
        state = 'matched';
        render();
        return;
      }
      render();
    }, 550);
  }

  async function playRound(hand) {
    if (lastChoice || roundFlash) return;
    lastChoice = hand;
    render();
    const statusEl = document.getElementById('match-status');
    if (statusEl) statusEl.textContent = 'در انتظار حریف…';

    try {
      await supabase.rpc('submit_round_pick', {
        p_match_id: match.matchId,
        p_round_number: match.roundNumber,
        p_guess: hand,
      });
    } catch (err) {
      toast(err.message || 'خطا در ثبت حدس', 'error');
      lastChoice = null;
      render();
    }
  }

  render();
}
