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
  let matchPollInterval = null;
  let lastKnownRoundCount = 0;
  let choiceMadeAt = null;

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

          <button class="btn btn-ghost btn-sm" id="btn-forfeit-match" style="margin-top:var(--sp-4)">ترک بازی</button>
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
      choiceMadeAt = null;
      roundFlash = null;
      processedRoundNumbers = new Set();
      render();
    });
    root.querySelectorAll('.hand-btn').forEach((btn) => {
      btn.addEventListener('click', () => playRound(btn.dataset.hand));
    });
    document.getElementById('btn-forfeit-match')?.addEventListener('click', forfeitMatch);
  }

  async function forfeitMatch() {
    if (!match?.matchId) return;
    if (!confirm('آیا از ترک بازی مطمئن هستید؟ این مسابقه به‌عنوان باخت شما ثبت می‌شود.')) return;
    try {
      const { error } = await supabase.rpc('forfeit_match', { p_match_id: match.matchId });
      if (error) throw new Error(error.message);
    } catch (err) {
      toast(err.message || 'ترک بازی ناموفق بود', 'error');
    }
    // The 'matches' UPDATE subscription already handles transitioning to the
    // 'finished' state once status flips to completed — no need to duplicate
    // that logic here.
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

  async function ensureRealtimeAuth() {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      supabase.realtime.setAuth(data.session.access_token);
    }
  }

  function subscribeToQueueTicket(ticketId) {
    queueChannel?.unsubscribe();
    ensureRealtimeAuth();

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
    }, 500);
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
    lastKnownRoundCount = 0;
    subscribeToMatch(matchId);
    state = 'starting';
    runStartingCountdown();
  }

  function subscribeToMatch(matchId) {
    ensureRealtimeAuth();

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

    // Fallback: realtime for matchmaking_queue previously silently stopped
    // delivering events after being (re)added to the publication — the same
    // class of failure can happen here (dropped websocket, auth timing,
    // browser tab throttling, etc.). Poll every 500ms for any round this
    // client hasn't processed yet, and for the match having finished, so
    // play never gets permanently stuck even if the realtime channel goes
    // silent — and stays responsive/near-instant even when it does.
    startMatchPolling(matchId);
  }

  function startMatchPolling(matchId) {
    stopMatchPolling();
    matchPollInterval = setInterval(async () => {
      // Check for match completion first.
      const { data: matchRow } = await supabase
        .from('matches')
        .select('status, winner_id')
        .eq('id', matchId)
        .single();
      if (matchRow?.status === 'completed') {
        handleMatchFinished(matchRow);
        return;
      }

      // Check for any round this client hasn't rendered yet.
      const { data: rounds } = await supabase
        .from('match_rounds')
        .select('round_number, moves, round_winner_id')
        .eq('match_id', matchId)
        .order('round_number', { ascending: true });
      if (!rounds) return;
      for (const r of rounds) {
        if (!processedRoundNumbers.has(r.round_number)) {
          handleRoundResolved({ round_number: r.round_number, moves: r.moves, round_winner_id: r.round_winner_id });
        }
      }

      // Stuck-state recovery: if a choice was made 6+ seconds ago and we're
      // still waiting (no new round appeared above), something silently
      // failed. Clear the local choice so the player can act again — worst
      // case this costs one wasted round rather than leaving them frozen
      // for the rest of the match.
      if (lastChoice && !roundFlash && choiceMadeAt && Date.now() - choiceMadeAt > 6000) {
        lastChoice = null;
        choiceMadeAt = null;
        toast('اتصال کند بود — دوباره تلاش کنید', 'info');
        render();
      }
    }, 500);
  }
  function stopMatchPolling() {
    if (matchPollInterval) {
      clearInterval(matchPollInterval);
      matchPollInterval = null;
    }
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
    match.roundNumber = Math.max(match.roundNumber, roundRow.round_number + 1);
    render();
    triggerScreenFlash(roundFlash.correct ? 'hit' : 'miss');
    const clearFlash = () => {
      if (state !== 'matched') return; // match may have already finished
      roundFlash = null;
      lastChoice = null;
      choiceMadeAt = null;
      render();
    };
    setTimeout(clearFlash, 1200);
  }

  async function handleMatchFinished(matchRow) {
    // Guard against double-handling: both the realtime channel and the
    // polling fallback can independently detect the finish.
    if (state === 'finished') return;

    stopMatchPolling();
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
    choiceMadeAt = Date.now();
    render();
    const statusEl = document.getElementById('match-status');
    if (statusEl) statusEl.textContent = 'در انتظار حریف…';

    try {
      // Re-derive the true current round number from the database instead
      // of trusting the client's local match.roundNumber — if that ever
      // desyncs (e.g. a stale closure, a race between polling and a
      // render), submitting the wrong round_number gets silently swallowed
      // by ON CONFLICT DO NOTHING server-side, leaving the player stuck
      // forever with no error. Asking the DB "what's the next round?" right
      // before submitting removes that whole failure class.
      const { count } = await supabase
        .from('match_rounds')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', match.matchId);
      const currentRoundNumber = (count ?? 0) + 1;
      match.roundNumber = currentRoundNumber;

      await supabase.rpc('submit_round_pick', {
        p_match_id: match.matchId,
        p_round_number: currentRoundNumber,
        p_guess: hand,
      });
    } catch (err) {
      toast(err.message || 'خطا در ثبت حدس', 'error');
      lastChoice = null;
      choiceMadeAt = null;
      render();
    }
  }

  render();

  return function teardown() {
    if (queueChannel) supabase.removeChannel(queueChannel);
    if (matchChannel) supabase.removeChannel(matchChannel);
    if (roundsChannel) supabase.removeChannel(roundsChannel);
  };
}
