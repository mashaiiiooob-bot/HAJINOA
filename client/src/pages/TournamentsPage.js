import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { escapeHtml, formatNumber, relativeTime } from '../utils/format.js';
import { spawnParticles } from '../utils/effects.js';

const ROUND_LABEL = { 1: 'یک‌چهارم نهایی', 2: 'نیمه‌نهایی', 3: 'فینال' };
const STATUS_LABEL = { waiting: 'در انتظار', active: 'در جریان', finished: 'پایان‌یافته' };

/** renderTournaments() — the tournaments page: join queue, live bracket, in-line arena, history. */
export async function renderTournaments(root) {
  let socket = null;
  let phase = 'idle'; // idle | queued | arena | finished
  let queueInfo = null; // { tournamentId, seed, maxPlayers }
  let activeTournament = null; // full bracket payload from GET /:id
  let currentMatch = null; // { matchId, round, roundName, opponentId, scores }
  let lastChoice = null;
  let roundFlash = null;
  let championEvent = null;
  let history = [];
  let openTournaments = [];

  async function loadLists() {
    const [open, hist] = await Promise.all([
      api.get('/tournaments').catch(() => []),
      api.get('/tournaments/history/me').catch(() => []),
    ]);
    openTournaments = open;
    history = hist;
  }

  async function loadBracket(tournamentId) {
    try {
      activeTournament = await api.get(`/tournaments/${tournamentId}`);
    } catch {
      activeTournament = null;
    }
  }

  function ensureSocket() {
    if (socket) return socket;
    socket = getSocket();
    attachListeners();
    return socket;
  }

  function isChampion() {
    return championEvent?.championId === AuthStore.user.id;
  }

  function attachListeners() {
    socket.off('tournament:queue:joined');
    socket.off('tournament:queue:status');
    socket.off('tournament:match:ready');
    socket.off('tournament:bracket:updated');
    socket.off('tournament:finished');
    socket.off('tournament:error');
    socket.off('match:round:result');
    socket.off('match:finished');
    socket.off('match:error');

    socket.on('tournament:queue:joined', ({ tournamentId, seed, maxPlayers }) => {
      queueInfo = { tournamentId, seed, maxPlayers };
      phase = 'queued';
      loadBracket(tournamentId).then(render);
      render();
    });

    socket.on('tournament:queue:status', ({ tournamentId, playerCount, maxPlayers }) => {
      if (queueInfo && queueInfo.tournamentId === tournamentId) {
        queueInfo = { ...queueInfo, seed: playerCount, maxPlayers };
        render();
      }
    });

    socket.on('tournament:match:ready', ({ tournamentId, matchId, round, players }) => {
      const opponentId = players.find((id) => id !== AuthStore.user.id);
      currentMatch = { tournamentId, matchId, round, opponentId, scores: {} };
      lastChoice = null;
      roundFlash = null;
      phase = 'arena';
      loadBracket(tournamentId).then(render);
      toast(`دور ${ROUND_LABEL[round] || round} آغاز شد!`, 'info');
      render();
    });

    socket.on('tournament:bracket:updated', ({ tournamentId }) => {
      if (activeTournament?.id === tournamentId || queueInfo?.tournamentId === tournamentId) {
        loadBracket(tournamentId).then(render);
      }
    });

    socket.on('tournament:finished', ({ tournamentId, championId, runnerUpId }) => {
      championEvent = { tournamentId, championId, runnerUpId };
      phase = 'finished';
      loadBracket(tournamentId).then(() => loadLists().then(render));
      render();
    });

    socket.on('tournament:error', ({ message }) => toast(message, 'error'));

    socket.on('match:round:result', ({ hidden, scores }) => {
      if (!currentMatch) return;
      const prevMine = currentMatch.scores?.[AuthStore.user.id] || 0;
      const prevOpp = currentMatch.scores?.[currentMatch.opponentId] || 0;
      const newMine = scores[AuthStore.user.id] || 0;
      const newOpp = scores[currentMatch.opponentId] || 0;
      roundFlash = {
        guessedHand: lastChoice,
        hidden,
        correct: lastChoice === hidden,
        whoScored: newMine > prevMine ? 'me' : newOpp > prevOpp ? 'opp' : null,
      };
      currentMatch.scores = scores;
      render();
      setTimeout(() => {
        roundFlash = null;
        lastChoice = null;
        render();
      }, 1100);
    });

    socket.on('match:finished', ({ winnerId }) => {
      if (!currentMatch) return;
      const won = winnerId === AuthStore.user.id;
      toast(won ? 'این راند را بردید! منتظر دور بعد باشید…' : 'در این دور حذف شدید', won ? 'win' : 'loss');
      if (!won) {
        phase = 'idle';
        currentMatch = null;
        queueInfo = null;
        loadLists().then(render);
      } else {
        currentMatch = { ...currentMatch, waitingNextRound: true };
        phase = 'arena';
      }
      render();
    });

    socket.on('match:error', ({ message }) => toast(message, 'error'));
  }

  function joinQueue() {
    ensureSocket();
    socket.emit('tournament:queue:join');
    phase = 'queued';
    render();
  }

  function leaveQueue() {
    if (!queueInfo) return;
    socket?.emit('tournament:queue:leave', { tournamentId: queueInfo.tournamentId });
    queueInfo = null;
    phase = 'idle';
    render();
  }

  function playHand(hand) {
    if (!currentMatch || lastChoice || roundFlash) return;
    lastChoice = hand;
    socket.emit('match:round:play', { matchId: currentMatch.matchId, guess: hand });
    render();
  }

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">🏆 مسابقات قهرمانی</p>
            <h1>مسابقات هشت‌نفره حذفی</h1>
          </div>
        </div>
        <div id="tournaments-content"><div class="skeleton" style="height:220px;border-radius:var(--r-lg)"></div></div>
      </div>
    `;
  }

  function bracketSlot(id, name, winnerId) {
    if (!id) return `<div class="bracket-slot bracket-slot-empty">در انتظار</div>`;
    const isWinner = winnerId === id;
    const isMe = id === AuthStore.user.id;
    return `<div class="bracket-slot${isWinner ? ' bracket-slot-winner' : ''}${isMe ? ' bracket-slot-me' : ''}">${escapeHtml(name || '؟')}</div>`;
  }

  function bracketTemplate(t) {
    if (!t) return '';
    const rounds = [1, 2, 3].map((r) => t.bracket.filter((m) => m.roundNumber === r));
    const championName = t.participants?.find((p) => p.userId === t.championId)?.displayName;
    return `
      <section class="card widget-card">
        <div class="widget-title">
          <h3>جدول مسابقه — ${escapeHtml(t.name)}</h3>
          <span class="badge ${t.displayStatus === 'finished' ? 'badge-gold' : 'badge-purple'}">${STATUS_LABEL[t.displayStatus] || t.displayStatus}</span>
        </div>
        <div class="bracket-grid">
          ${rounds
            .map(
              (matches, i) => `
            <div class="bracket-col">
              <p class="bracket-round-label">${ROUND_LABEL[i + 1]}</p>
              ${
                matches.length
                  ? matches
                      .map(
                        (m) => `
                <div class="bracket-match${m.status === 'completed' ? ' bracket-match-done' : ''}">
                  ${bracketSlot(m.player1Id, m.player1Name, m.winnerId)}
                  <span class="bracket-vs">vs</span>
                  ${bracketSlot(m.player2Id, m.player2Name, m.winnerId)}
                </div>`
                      )
                      .join('')
                  : `<div class="bracket-match bracket-match-empty">—</div>`
              }
            </div>`
            )
            .join('')}
        </div>
        ${championName ? `<div class="tournament-champion-banner"><span aria-hidden="true">👑</span> قهرمان: ${escapeHtml(championName)}</div>` : ''}
      </section>
    `;
  }

  function arenaTemplate() {
    if (currentMatch?.waitingNextRound) {
      return `
        <section class="card arena-idle">
          <div class="loader-ring" aria-hidden="true"></div>
          <p>در انتظار حریف دور بعد…</p>
        </section>
      `;
    }
    const myScore = currentMatch.scores?.[AuthStore.user.id] || 0;
    const oppScore = currentMatch.scores?.[currentMatch.opponentId] || 0;
    const flashingMe = roundFlash?.whoScored === 'me';
    const flashingOpp = roundFlash?.whoScored === 'opp';
    const disabled = !!lastChoice || !!roundFlash;
    return `
      <section class="card match-card your-turn">
        <p class="section-eyebrow">${ROUND_LABEL[currentMatch.round] || ''}</p>
        <div class="match-players">
          <div class="match-player active">
            <span class="avatar">${escapeHtml(AuthStore.user.displayName[0])}</span>
            <span>${escapeHtml(AuthStore.user.displayName)}</span>
            <span class="match-score${flashingMe ? ' score-bump' : ''}">${myScore}</span>
          </div>
          <span class="match-vs">VS</span>
          <div class="match-player">
            <span class="avatar">؟</span>
            <span>حریف</span>
            <span class="match-score${flashingOpp ? ' score-bump' : ''}">${oppScore}</span>
          </div>
        </div>
        <p class="match-status">${roundFlash ? `توکن در دست ${roundFlash.hidden === 'left' ? 'چپ' : 'راست'} بود.` : 'دست چپ یا راست؟'}</p>
        <div class="hand-choices">
          <button class="hand-btn${lastChoice === 'left' ? ' chosen' : ''}${roundFlash?.guessedHand === 'left' ? (roundFlash.correct ? ' correct' : ' wrong') : ''}" data-hand="left" ${disabled ? 'disabled' : ''}>✋ چپ</button>
          <button class="hand-btn${lastChoice === 'right' ? ' chosen' : ''}${roundFlash?.guessedHand === 'right' ? (roundFlash.correct ? ' correct' : ' wrong') : ''}" data-hand="right" ${disabled ? 'disabled' : ''}>🤚 راست</button>
        </div>
      </section>
    `;
  }

  function historyTemplate() {
    if (!history.length) return '';
    return `
      <section class="card widget-card" style="margin-top:var(--sp-4)">
        <div class="widget-title"><h3>تاریخچه مسابقات من</h3></div>
        <ul class="lb-list">
          ${history
            .map(
              (h) => `
            <li class="lb-row">
              <span class="lb-name">${escapeHtml(h.name)}</span>
              <span class="badge ${h.placement === 1 ? 'badge-gold' : 'badge-purple'}">${h.placement ? `رتبه ${h.placement}` : STATUS_LABEL[h.status === 'completed' ? 'finished' : 'waiting']}</span>
              <span class="lb-points">🪙 ${formatNumber(h.coinsAwarded)}</span>
              <span class="lb-points">${relativeTime(h.createdAt)}</span>
            </li>`
            )
            .join('')}
        </ul>
      </section>
    `;
  }

  function lobbyTemplate() {
    return `
      <section class="card widget-card">
        <div class="widget-title"><h3>ورود به صف مسابقه</h3></div>
        <p class="hero-sub">با ۷ بازیکن دیگر در یک مسابقه هشت‌نفره حذفی رقابت کنید. جوایز: سکه، XP و امتیاز رتبه.</p>
        <button class="btn btn-primary btn-block" id="btn-join-queue">پیوستن به صف مسابقه</button>
      </section>
      ${
        openTournaments.length
          ? `<section class="card widget-card" style="margin-top:var(--sp-4)">
              <div class="widget-title"><h3>مسابقات فعال</h3></div>
              <ul class="lb-list">
                ${openTournaments
                  .map(
                    (t) => `
                  <li class="lb-row">
                    <span class="lb-name">${escapeHtml(t.name)}</span>
                    <span class="badge ${t.displayStatus === 'active' ? 'badge-purple' : 'badge-gold'}">${STATUS_LABEL[t.displayStatus]}</span>
                    <span class="lb-points">${t.playerCount ?? ''}/${t.maxPlayers}</span>
                  </li>`
                  )
                  .join('')}
              </ul>
            </section>`
          : ''
      }
      ${historyTemplate()}
    `;
  }

  function queuedTemplate() {
    return `
      <section class="card arena-idle">
        <div class="loader-ring" aria-hidden="true"></div>
        <p>در انتظار بازیکنان دیگر…</p>
        <p class="hero-sub">${formatNumber(queueInfo.seed)} / ${formatNumber(queueInfo.maxPlayers)} بازیکن</p>
        <button class="btn btn-secondary" id="btn-leave-queue">لغو</button>
      </section>
      ${bracketTemplate(activeTournament)}
    `;
  }

  function finishedTemplate() {
    const won = isChampion();
    return `
      <section class="card arena-idle result-burst">
        <span class="empty-icon result-icon ${won ? 'win' : ''}" aria-hidden="true">${won ? '🏆' : '🏁'}</span>
        <h2>${won ? 'شما قهرمان شدید!' : 'مسابقه به پایان رسید'}</h2>
        <button class="btn btn-primary btn-block" id="btn-back-lobby">بازگشت به صف</button>
      </section>
      ${bracketTemplate(activeTournament)}
      ${historyTemplate()}
    `;
  }

  function render() {
    const content = document.getElementById('tournaments-content');
    if (!content) return;

    if (phase === 'queued' && queueInfo) content.innerHTML = queuedTemplate();
    else if (phase === 'arena' && currentMatch) content.innerHTML = arenaTemplate();
    else if (phase === 'finished') content.innerHTML = finishedTemplate();
    else content.innerHTML = lobbyTemplate();

    document.getElementById('btn-join-queue')?.addEventListener('click', joinQueue);
    document.getElementById('btn-leave-queue')?.addEventListener('click', leaveQueue);
    document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
      phase = 'idle';
      currentMatch = null;
      queueInfo = null;
      championEvent = null;
      render();
    });
    content.querySelectorAll('.hand-btn').forEach((btn) => {
      btn.addEventListener('click', () => playHand(btn.dataset.hand));
    });

    if (phase === 'finished' && isChampion()) {
      spawnParticles(content.querySelector('.result-burst'), 26, { className: 'celebrate-particle', burst: true });
    }
  }

  shell();
  ensureSocket();
  try {
    await loadLists();
  } catch {
    /* history/open list are non-critical */
  }
  render();
}
