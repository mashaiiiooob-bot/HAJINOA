let activeOverlay = null;
let lastFocused = null;

/**
 * Opens an accessible modal: traps focus, closes on Escape/overlay click,
 * and restores focus to the trigger element on close.
 */
export function openModal({ title, bodyHtml, actionsHtml = '' }) {
  closeModal();
  lastFocused = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 class="modal-title" id="modal-title">${title}</h2>
        <button class="modal-close" aria-label="بستن">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${actionsHtml ? `<div class="modal-actions">${actionsHtml}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  activeOverlay = overlay;
  requestAnimationFrame(() => overlay.classList.add('open'));

  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', trapKeydown);

  const focusable = overlay.querySelectorAll('button, input, a, select, textarea, [tabindex]');
  focusable[0]?.focus();

  return overlay;
}

function trapKeydown(e) {
  if (!activeOverlay) return;
  if (e.key === 'Escape') return closeModal();
  if (e.key !== 'Tab') return;

  const focusable = [...activeOverlay.querySelectorAll('button, input, a, select, textarea, [tabindex]')];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function closeModal() {
  if (!activeOverlay) return;
  activeOverlay.classList.remove('open');
  document.removeEventListener('keydown', trapKeydown);
  const overlay = activeOverlay;
  setTimeout(() => overlay.remove(), 250);
  activeOverlay = null;
  lastFocused?.focus?.();
}
