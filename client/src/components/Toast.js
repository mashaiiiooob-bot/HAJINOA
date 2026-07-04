import { escapeHtml } from '../utils/format.js';

const ICONS = { success: '✓', win: '🏆', loss: '✕', info: 'ℹ', error: '⚠' };

let region = null;

function ensureRegion() {
  if (region) return region;
  region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  return region;
}

/** Shows a toast. type: 'success' | 'win' | 'loss' | 'info' | 'error' */
export function toast(message, type = 'info', duration = 3200) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconHtml =
    type === 'win'
      ? `<span class="coin-mark toast-coin"><span class="coin-face">🏆</span></span>`
      : `<span class="toast-icon">${ICONS[type] || ICONS.info}</span>`;
  el.innerHTML = `${iconHtml}<span>${escapeHtml(message)}</span>`;
  ensureRegion().appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}
