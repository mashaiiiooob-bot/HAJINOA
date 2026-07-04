import { api } from '../services/api.js';
import { AuthStore } from '../services/authStore.js';
import { formatNumber, escapeHtml } from '../utils/format.js';

const PAGE_SIZE = 25;

export async function renderLeaderboardPage(root) {
  let offset = 0;
  let rows = [];
  let exhausted = false;

  async function loadPage() {
    const page = await api.get(`/users/leaderboard?limit=${PAGE_SIZE}&offset=${offset}`);
    if (page.length < PAGE_SIZE) exhausted = true;
    rows = rows.concat(page);
    offset += page.length;
  }

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <h1>جدول رتبه‌بندی</h1>
        </div>
        <section class="card leaderboard-preview" id="lb-card"></section>
      </div>
    `;
  }

  function renderRows() {
    const card = root.querySelector('#lb-card');
    if (!card) return;
    const myId = AuthStore.user?.id;

    card.innerHTML = rows.length
      ? `
        <ol class="lb-list">
          ${rows
            .map(
              (r, i) => `
            <li class="lb-row${r.id === myId ? ' lb-row-self' : ''}">
              <span class="lb-rank ${i < 3 ? 'lb-rank-top' : ''}">${i + 1}</span>
              <span class="avatar avatar-sm">${escapeHtml(r.displayName?.[0] || '؟')}</span>
              <span class="lb-name">${escapeHtml(r.displayName)}</span>
              <span class="badge badge-gold">سطح ${r.level}</span>
              <span class="lb-points">${formatNumber(r.rankPoints)}</span>
            </li>`
            )
            .join('')}
        </ol>
        ${
          exhausted
            ? ''
            : `<div class="leaderboard-more"><button class="btn btn-secondary btn-sm" id="lb-load-more">نمایش بیشتر</button></div>`
        }
      `
      : `
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🏅</span>
          <p>هنوز رتبه‌بندی ثبت نشده — اولین بازی را شروع کنید!</p>
        </div>
      `;

    card.querySelector('#lb-load-more')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'در حال بارگذاری…';
      try {
        await loadPage();
        renderRows();
      } finally {
        e.target.disabled = false;
      }
    });
  }

  function skeleton() {
    const card = root.querySelector('#lb-card');
    if (card) card.innerHTML = `<div class="skeleton" style="height:360px;border-radius:20px"></div>`;
  }

  shell();
  skeleton();
  try {
    await loadPage();
    renderRows();
  } catch {
    const card = root.querySelector('#lb-card');
    if (card) {
      card.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">⚠</span>
          <p>بارگذاری جدول رتبه‌بندی ناموفق بود. لطفاً دوباره تلاش کنید.</p>
        </div>
      `;
    }
  }
}
