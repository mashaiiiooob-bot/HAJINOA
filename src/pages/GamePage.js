import { supabase } from '../services/supabaseClient.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { escapeHtml } from '../utils/format.js';
import { spawnParticles, animateCounter } from '../utils/effects.js';

/** renderGamePage() — matchmaking + live round play.
 *  Backed entirely by Postgres (no Socket.io/Express):
 *  - join_matchmaking_queue()/leave_matchmaking_queue() RPCs pair two waiting
 *    players atomically (FOR UPDATE SKIP LOCKED, see migration 013).
 *  - We watch our own matchmaking_queue row via Realtime; when it flips to
 *    'matched' we have a match_id and move to the starting countdown.
 *  - submit_round_pick() RPC resolves a round once both players have picked
 *    (server-side coin flip — never trust a client-declared result), and
 *    finishes the match + grants rewards on the 3rd round won.
 *  - We watch match_rounds (for round results) and matches (for the finish
 *    event) via Realtime.
 *
 *  NOTE: only the 'classic' hand-guess mode is wired up. The 'rps' (rock-
 *  paper-scissors) mode referenced in the old frontend was never actually
 *  implemented server-side (checked: submit_round_pick only ever accepted
 *  left/right), so it's shown as "coming soon" rather than left silently
 *  broken. */
export function renderGamePage(root) {
  let state = 'idle'; // idle | searching | starting | matched | finished
  let selectedMode = 'classic';
  let match = null; // { matchId, opponentId, opponentName, scores, mode }
  let lastChoice = null;
  let roundFlash = null; // { guessedHand, hidden, correct, whoScored }
  let countdown = 3;
  let queueChannel = null;
  let matchChannel = null;
  let queueTicketId = null;

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
            <button class="mode-pick-card mode-pick-disabled" data-pick-mode="rps" disabled>
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
      const oppScore = match.scores?.[match.opponentId] || 0;
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
              <span class="avatar">${escapeHtml(match.opponentName[0])}</span>
              <span>${escapeHtml(match.opponentName)}</span>
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
    return roundFlash ? `توکن در دست ${roundFlash.hidden === 'left' ? 'چپ' : 'راست'} بود.` : 'دست چپ یا راست؟ توکن در یکی از دست‌هاست.';
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
    document.getElementById('btn-cancel-queue')?.addEventListener('click', leaveQueue);
    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      teardownChannels();
      state = 'idle';
      match = null;
      lastChoice = null;
      roundFlash = null;
      render();
    });
    root.querySelectorAll('.hand-btn').forEach((btn) => {
      btn.addEventListener('click', () => playHand(btn.dataset.hand));
    });
  }

  /* ------------------------------------------------------------ Matchmaking */

  async function joinQueue() {
    state = 'searching';
    render();
    try {
      const { data, error } = await supabase.rpc('join_matchmaking_queue', {
        p_mode_code: selectedMode,
        p_is_ranked: true,
      });
      if (error) throw new Error(error.message);

      queueTicketId = data.id;
      if (data.status === 'matched' && data.match_id) {
        await enterMatch(data.match_id);
      } else {
        subscribeToQueueTicket(data.id);
      }
    } catch (err) {
      toast(err.message || 'یافتن حریف ناموفق بود', 'error');
      state = 'idle';
      render();
    }
  }

  function subscribeToQueueTicket(ticketId) {
    teardownQueueChannel();
    queueChannel = supabase
      .channel(`queue-ticket-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matchmaking_queue', filter: `id=eq.${ticketId}` },
        async (payload) => {
          if (payload.new.status === 'matched' && payload.new.match_id) {
            teardownQueueChannel();
            await enterMatch(payload.new.match_id);
          }
        }
      )
      .subscribe();
  }

  async function leaveQueue() {
    teardownQueueChannel();
    try {
      await supabase.rpc('leave_matchmaking_queue', { p_mode_code: selectedMode, p_is_ranked: true });
    } catch {
      /* best-effort */
    }
    state = 'idle';
    render();
  }

  function teardownQueueChannel() {
    if (queueChannel) {
      supabase.removeChannel(queueChannel);
      queueChannel = null;
    }
  }

  /* ------------------------------------------------------------------ Match */

  async function enterMatch(matchId) {
    const { data: participants, error } = await supabase
      .from('match_participants')
      .select('user_id, users(display_name)')
      .eq('match_id', matchId);
    if (error) {
      toast('خطا در بارگذاری بازی: ' + error.message, 'error');
      state = 'idle';
      render();
      return;
    }

    const opponentRow = participants.find((p) => p.user_id !== AuthStore.user.id);
    const { data: myBalance } = await supabase.from('users').select('coins, xp').eq('id', AuthStore.user.id).single();

    match = {
      matchId,
      opponentId: opponentRow?.user_id,
      opponentName: opponentRow?.users?.display_name || 'حریف',
      scores: { [AuthStore.user.id]: 0, [opponentRow?.user_id]: 0 },
      mode: selectedMode,
      coinsBefore: myBalance?.coins ?? 0,
      xpBefore: myBalance?.xp ?? 0,
    };
    lastChoice = null;
    roundFlash = null;
    state = 'starting';
    subscribeToMatch(matchId);
    runStartingCountdown();
  }

  function subscribeToMatch(matchId) {
    teardownMatchChannel();
    matchChannel = supabase
      .channel(`match-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_rounds', filter: `match_id=eq.${matchId}` },
        (payload) => handleRoundResult(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          if (payload.new.status === 'completed') handleMatchFinished(payload.new);
        }
      )
      .subscribe();
  }

  function teardownMatchChannel() {
    if (matchChannel) {
      supabase.removeChannel(matchChannel);
      matchChannel = null;
    }
  }

  function teardownChannels() {
    teardownQueueChannel();
    teardownMatchChannel();
  }

  function runStartingCountdown() {
    countdown = 3;
    render();
    const interval = setInterval(() => {
      countdown -= 1;
      if (countdown < 0) {
        clearInterval(interval);
        if (state === 'starting') {
          state = 'matched';
          render();
        }
        return;
      }
      render();
    }, 550);
  }

  async function playHand(hand) {
    if (lastChoice || roundFlash || !match) return;
    lastChoice = hand;
    render();
    const statusEl = document.getElementById('match-status');
    if (statusEl) statusEl.textContent = 'در انتظار حریف…';

    // Round number = rounds already resolved so far + 1 (moves stored in match_rounds).
    const { count } = await supabase
      .from('match_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', match.matchId);
    const roundNumber = (count || 0) + 1;

    const { error } = await supabase.rpc('submit_round_pick', {
      p_match_id: match.matchId,
      p_round_number: roundNumber,
      p_guess: hand,
    });
    if (error) {
      toast(error.message || 'ثبت حرکت ناموفق بود', 'error');
      lastChoice = null;
      render();
    }
    // Resolution (if both players have now picked) arrives via the
    // match_rounds Realtime INSERT handled in handleRoundResult — including
    // for the OTHER player's own submission, since Postgres resolves the
    // round exactly once and both clients are subscribed to the same row.
  }

  function handleRoundResult(round) {
    if (!match || round.match_id !== match.matchId) return;
    const moves = round.moves || {};
    const hidden = moves.hidden;
    const myGuess = moves[AuthStore.user.id];
    if (!myGuess) return; // shouldn't happen, but guards against a stray event

    const whoScored = round.round_winner_id === AuthStore.user.id ? 'me' : round.round_winner_id === match.opponentId ? 'opp' : null;

    match.scores = { ...match.scores };
    if (whoScored === 'me') match.scores[AuthStore.user.id] = (match.scores[AuthStore.user.id] || 0) + 1;
    if (whoScored === 'opp') match.scores[match.opponentId] = (match.scores[match.opponentId] || 0) + 1;

    roundFlash = { guessedHand: lastChoice, hidden, correct: lastChoice === hidden, whoScored };
    render();
    triggerScreenFlash(roundFlash.correct ? 'hit' : 'miss');
    setTimeout(() => {
      roundFlash = null;
      lastChoice = null;
      if (state === 'matched') render();
    }, 1200);
  }

  async function handleMatchFinished(row) {
    teardownMatchChannel();
    const won = row.winner_id === AuthStore.user.id;
    let coinGain = 0, xpGain = 0;
    if (won) {
      const { data } = await supabase.from('users').select('coins, xp').eq('id', AuthStore.user.id).single();
      if (data) {
        coinGain = Math.max(0, (data.coins ?? 0) - (match.coinsBefore ?? 0));
        xpGain = Math.max(0, (data.xp ?? 0) - (match.xpBefore ?? 0));
      }
    }
    match = { ...match, winnerId: row.winner_id, coinGain, xpGain };
    state = 'finished';
    toast(won ? 'پیروزی! 🎉' : 'باخت — دوباره تلاش کنید', won ? 'success' : 'error');
    render();
  }

  render();
}
