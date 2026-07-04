import { getSocket } from '../services/socket.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { escapeHtml } from '../utils/format.js';
import { spawnParticles, animateCounter } from '../utils/effects.js';

export function renderGamePage(root) {
  let state = 'idle'; // idle | searching | starting | matched | finished
  let selectedMode = 'classic'; // classic | rps
  let match = null; // { matchId, opponent, scores, mode }
  let lastChoice = null;
  let roundFlash = null; // classic: { guessedHand, hidden, correct, whoScored } | rps: { myMove, oppMove, outcome, whoScored }
  let countdown = 3;
  let socket;

  const RPS_MOVES = [
    { key: 'rock', label: 'سنگ', emoji: '🪨' },
    { key: 'paper', label: 'کاغذ', emoji: '📄' },
    { key: 'scissors', label: 'قیچی', emoji: '✂️' },
  ];

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
            <button class="mode-pick-card${selectedMode === 'rps' ? ' active' : ''}" data-pick-mode="rps">
              <span class="mode-pick-icon" aria-hidden="true">✂️</span>
              <span class="mode-pick-name">سنگ کاغذ قیچی</span>
              <span class="mode-pick-desc">حریف را رودررو شکست دهید</span>
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
      const isRps = match.mode === 'rps';

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
          <p class="match-status" id="match-status">${statusText(isRps)}</p>

          <div class="hand-choices">
            ${isRps ? RPS_MOVES.map((m) => rpsButton(m)).join('') : `${handButton('left', '✋ چپ')}${handButton('right', '🤚 راست')}`}
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

  function statusText(isRps) {
    if (isRps) {
      if (roundFlash) {
        const oppMoveLabel = RPS_MOVES.find((m) => m.key === roundFlash.oppMove)?.label || '';
        if (roundFlash.outcome === 'draw') return `هر دو ${oppMoveLabel} انتخاب کردید — مساوی!`;
        return `حریف ${oppMoveLabel} انتخاب کرد.`;
      }
      return 'سنگ، کاغذ یا قیچی؟';
    }
    return roundFlash ? `توکن در دست ${roundFlash.hidden === 'left' ? 'چپ' : 'راست'} بود.` : 'دست چپ یا راست؟ توکن در یکی از دست‌هاست.';
  }

  function rpsButton(moveDef) {
    const { key, label, emoji } = moveDef;
    const disabled = !!lastChoice || !!roundFlash;
    const isChosen = lastChoice === key;
    let cls = 'hand-btn';
    let stateCls = '';

    if (roundFlash?.myMove === key) {
      stateCls = roundFlash.outcome === 'win' ? ' revealed-hit chosen correct' : roundFlash.outcome === 'lose' ? ' chosen wrong' : ' chosen';
    } else if (isChosen && !roundFlash) {
      stateCls = ' waiting-fist chosen';
    }

    return `
      <button class="${cls}${stateCls}" data-hand="${key}" ${disabled ? 'disabled' : ''}>
        <span class="hand-reveal-icon" aria-hidden="true">${emoji}</span>
        <span class="hand-btn-label">${label}</span>
      </button>
    `;
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
      btn.addEventListener('click', () => {
        selectedMode = btn.dataset.pickMode;
        render();
      });
    });
    document.getElementById('btn-find-match')?.addEventListener('click', () => {
      socket = getSocket();
      attachSocketListeners();
      socket.emit('queue:join', { mode: selectedMode, ranked: true });
      state = 'searching';
      render();
    });
    document.getElementById('btn-cancel-queue')?.addEventListener('click', () => {
      socket?.emit('queue:leave', { mode: selectedMode, ranked: true });
      state = 'idle';
      render();
    });
    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      state = 'idle';
      match = null;
      lastChoice = null;
      roundFlash = null;
      render();
    });
    root.querySelectorAll('.hand-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (lastChoice || roundFlash) return;
        lastChoice = btn.dataset.hand;
        socket.emit('match:round:play', { matchId: match.matchId, guess: lastChoice });
        render();
        const statusEl = document.getElementById('match-status');
        if (statusEl) statusEl.textContent = 'در انتظار حریف…';
      });
    });
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

  function attachSocketListeners() {
    socket.off('queue:matched');
    socket.off('match:round:result');
    socket.off('match:finished');
    socket.off('queue:error');
    socket.off('match:error');

    socket.on('queue:matched', ({ matchId, opponent, mode }) => {
      match = { matchId, opponent, scores: {}, mode: mode || 'classic' };
      lastChoice = null;
      roundFlash = null;
      state = 'starting';
      runStartingCountdown();
    });

    socket.on('match:round:result', ({ hidden, moves, results, scores }) => {
      const prevYou = match.scores?.[AuthStore.user.id] || 0;
      const prevOpp = match.scores?.[match.opponent.id] || 0;
      const newYou = scores[AuthStore.user.id] || 0;
      const newOpp = scores[match.opponent.id] || 0;
      const whoScored = newYou > prevYou ? 'me' : newOpp > prevOpp ? 'opp' : null;

      if (match.mode === 'rps') {
        const myMove = moves?.[AuthStore.user.id];
        const oppMove = moves?.[match.opponent.id];
        const myResult = results?.[AuthStore.user.id]; // 'win' | 'lose' | 'draw'
        roundFlash = { myMove, oppMove, outcome: myResult, correct: myResult === 'win', whoScored };
      } else {
        roundFlash = {
          guessedHand: lastChoice,
          hidden,
          correct: lastChoice === hidden,
          whoScored,
        };
      }
      match.scores = scores;
      render();
      triggerScreenFlash(roundFlash.correct ? 'hit' : 'miss');
      setTimeout(() => {
        roundFlash = null;
        lastChoice = null;
        render();
      }, 1200);
    });

    socket.on('match:finished', ({ winnerId, coinGain, xpGain, scores }) => {
      match = { ...match, winnerId, coinGain, xpGain, scores };
      state = 'finished';
      toast(winnerId === AuthStore.user.id ? 'پیروزی! 🎉' : 'باخت — دوباره تلاش کنید', winnerId === AuthStore.user.id ? 'win' : 'loss');
      render();
    });

    socket.on('queue:error', ({ message }) => toast(message, 'error'));
    socket.on('match:error', ({ message }) => toast(message, 'error'));
  }

  render();
}
