import { api } from '../services/api.js';
import { AuthStore } from '../services/authStore.js';
import { openModal, closeModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { escapeHtml, formatNumber, relativeTime } from '../utils/format.js';

const CATEGORY_LABELS = {
  avatar: 'آواتار',
  frame: 'قاب',
  emote: 'ایموجی',
  theme: 'تم',
  booster: 'تقویت‌کننده',
  border: 'حاشیه',
  name_color: 'رنگ نام',
  badge: 'نشان',
};
const RARITY_LABELS = { common: 'معمولی', rare: 'کمیاب', epic: 'حماسی', legendary: 'افسانه‌ای' };
const EXPIRY_OPTIONS = [
  { value: '', label: 'بدون انقضا' },
  { value: '24', label: '۱ روز' },
  { value: '72', label: '۳ روز' },
  { value: '168', label: '۷ روز' },
  { value: '336', label: '۱۴ روز' },
];

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** renderMarketplace() — browse/search/sort/filter listings, manage inventory, buy & sell. */
export async function renderMarketplace(root) {
  let tab = 'browse'; // browse | inventory | history
  let loading = true;
  let errorMsg = null;

  let filters = { search: '', category: '', rarity: '', sort: 'newest', minPrice: '', maxPrice: '' };
  let page = 1;
  let listingsResult = { listings: [], total: 0, totalPages: 1 };

  let inventory = [];
  let history = [];

  function shell() {
    root.innerHTML = `
      <div class="container page-pad">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">🛒 بازار</p>
            <h1>بازار آیتم‌ها</h1>
          </div>
          <div class="mp-balance">🪙 <span id="mp-balance">${formatNumber(AuthStore.user.coins)}</span></div>
        </div>
        <div class="mp-tabs" role="tablist">
          <button class="mp-tab-btn" data-tab="browse" role="tab">مرور بازار</button>
          <button class="mp-tab-btn" data-tab="inventory" role="tab">انبار من</button>
          <button class="mp-tab-btn" data-tab="history" role="tab">تاریخچه</button>
        </div>
        <div id="mp-content"></div>
      </div>
    `;
    root.querySelectorAll('.mp-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function updateTabButtons() {
    root.querySelectorAll('.mp-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
    });
  }

  async function switchTab(next) {
    tab = next;
    updateTabButtons();
    await loadCurrentTab();
    renderContent();
  }

  async function loadCurrentTab() {
    loading = true;
    errorMsg = null;
    renderContent();
    try {
      if (tab === 'browse') {
        listingsResult = await api.get(`/marketplace/listings?${buildQuery()}`);
      } else if (tab === 'inventory') {
        [inventory, history] = await Promise.all([api.get('/marketplace/inventory'), api.get('/marketplace/history/me')]);
      } else {
        history = await api.get('/marketplace/history/me');
      }
    } catch (err) {
      errorMsg = err.message || 'بارگذاری اطلاعات ناموفق بود';
    } finally {
      loading = false;
    }
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.category) params.set('category', filters.category);
    if (filters.rarity) params.set('rarity', filters.rarity);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    params.set('page', String(page));
    params.set('pageSize', '12');
    return params.toString();
  }

  /* ---------------------------------------------------------------- Browse */

  function toolbarTemplate() {
    return `
      <div class="mp-toolbar">
        <input class="mp-search" id="mp-search" type="search" placeholder="جستجوی آیتم…" value="${escapeHtml(filters.search)}" />
        <select class="mp-select" id="mp-category">
          <option value="">همه دسته‌ها</option>
          ${Object.entries(CATEGORY_LABELS)
            .map(([v, l]) => `<option value="${v}" ${filters.category === v ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
        <select class="mp-select" id="mp-rarity">
          <option value="">همه کیفیت‌ها</option>
          ${Object.entries(RARITY_LABELS)
            .map(([v, l]) => `<option value="${v}" ${filters.rarity === v ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
        <input class="mp-price-input" id="mp-min-price" type="number" min="0" placeholder="حداقل قیمت" value="${escapeHtml(filters.minPrice)}" />
        <input class="mp-price-input" id="mp-max-price" type="number" min="0" placeholder="حداکثر قیمت" value="${escapeHtml(filters.maxPrice)}" />
        <select class="mp-select" id="mp-sort">
          <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>جدیدترین</option>
          <option value="oldest" ${filters.sort === 'oldest' ? 'selected' : ''}>قدیمی‌ترین</option>
          <option value="price_asc" ${filters.sort === 'price_asc' ? 'selected' : ''}>ارزان‌ترین</option>
          <option value="price_desc" ${filters.sort === 'price_desc' ? 'selected' : ''}>گران‌ترین</option>
        </select>
      </div>
    `;
  }

  function listingCardTemplate(l) {
    const isMine = l.sellerId === AuthStore.user.id;
    return `
      <div class="mp-item-card card">
        <div class="mp-item-rarity badge badge-rarity badge-rarity-${l.rarity}">${RARITY_LABELS[l.rarity] || l.rarity}</div>
        <div class="mp-item-icon" aria-hidden="true">${itemIcon(l.category)}</div>
        <h4 class="mp-item-name">${escapeHtml(l.itemName)}</h4>
        <p class="mp-item-cat">${CATEGORY_LABELS[l.category] || l.category}</p>
        <p class="mp-item-seller">فروشنده: ${escapeHtml(l.sellerDisplayName || l.sellerUsername)}</p>
        <div class="mp-item-footer">
          <span class="mp-price">🪙 ${formatNumber(l.priceCoins)}</span>
          ${
            isMine
              ? `<span class="badge badge-purple">آگهی شما</span>`
              : `<button class="btn btn-primary btn-sm" data-buy="${l.id}">خرید</button>`
          }
        </div>
      </div>
    `;
  }

  function itemIcon(category) {
    const icons = {
      avatar: '🧑',
      frame: '🖼️',
      emote: '😄',
      theme: '🎨',
      booster: '⚡',
      border: '⭕',
      name_color: '🔤',
      badge: '🎖️',
    };
    return icons[category] || '✨';
  }

  function browseTemplate() {
    if (loading) return `${toolbarTemplate()}<div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>`;
    if (errorMsg) return `${toolbarTemplate()}${errorStateTemplate()}`;
    if (!listingsResult.listings.length) {
      return `${toolbarTemplate()}
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🛍️</span>
          <p>آگهی‌ای با این مشخصات یافت نشد.</p>
        </div>`;
    }
    return `
      ${toolbarTemplate()}
      <div class="mp-grid">${listingsResult.listings.map(listingCardTemplate).join('')}</div>
      ${paginationTemplate()}
    `;
  }

  function paginationTemplate() {
    if (listingsResult.totalPages <= 1) return '';
    return `
      <div class="mp-pagination">
        <button class="btn btn-secondary btn-sm" id="mp-prev-page" ${page <= 1 ? 'disabled' : ''}>قبلی</button>
        <span>صفحه ${formatNumber(page)} از ${formatNumber(listingsResult.totalPages)}</span>
        <button class="btn btn-secondary btn-sm" id="mp-next-page" ${page >= listingsResult.totalPages ? 'disabled' : ''}>بعدی</button>
      </div>
    `;
  }

  /* -------------------------------------------------------------- Inventory */

  function inventoryTemplate() {
    if (loading) return `<div class="skeleton" style="height:320px;border-radius:var(--r-lg)"></div>`;
    if (errorMsg) return errorStateTemplate();

    const myActiveListings = history.filter((h) => h.role === 'sell' && h.status === 'active');

    const invSection = inventory.length
      ? `<div class="mp-grid">
          ${inventory
            .map(
              (item) => `
            <div class="mp-item-card card">
              <div class="mp-item-rarity badge badge-rarity badge-rarity-${item.rarity}">${RARITY_LABELS[item.rarity] || item.rarity}</div>
              <div class="mp-item-icon" aria-hidden="true">${itemIcon(item.category)}</div>
              <h4 class="mp-item-name">${escapeHtml(item.itemName)}</h4>
              <p class="mp-item-cat">${CATEGORY_LABELS[item.category] || item.category}${item.equipped ? ' · فعال' : ''}</p>
              <div class="mp-item-footer">
                <span></span>
                ${
                  item.isListed
                    ? `<span class="badge badge-purple">در بازار</span>`
                    : `<button class="btn btn-primary btn-sm" data-sell="${item.id}">فروش</button>`
                }
              </div>
            </div>`
            )
            .join('')}
        </div>`
      : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🎒</span><p>انبار شما خالی است.</p></div>`;

    const listingsSection = myActiveListings.length
      ? `<div class="mp-my-listings">
          <div class="widget-title"><h3>آگهی‌های فعال من</h3></div>
          <ul class="lb-list">
            ${myActiveListings
              .map(
                (h) => `
              <li class="lb-row">
                <span class="lb-name">${escapeHtml(h.itemName)}</span>
                <span class="lb-points">🪙 ${formatNumber(h.priceCoins)}</span>
                <button class="btn btn-ghost btn-sm" data-cancel-listing="${h.id}">لغو آگهی</button>
              </li>`
              )
              .join('')}
          </ul>
        </div>`
      : '';

    return `
      <div class="widget-title"><h3>آیتم‌های من</h3></div>
      ${invSection}
      ${listingsSection}
    `;
  }

  /* ---------------------------------------------------------------- History */

  function historyTemplate() {
    if (loading) return `<div class="skeleton" style="height:280px;border-radius:var(--r-lg)"></div>`;
    if (errorMsg) return errorStateTemplate();
    if (!history.length) {
      return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">📜</span><p>هنوز معامله‌ای ثبت نشده است.</p></div>`;
    }
    const statusLabel = { active: 'در حال فروش', sold: 'فروخته شد', cancelled: 'لغو شده', expired: 'منقضی شده' };
    return `
      <ul class="lb-list">
        ${history
          .map(
            (h) => `
          <li class="lb-row">
            <span class="badge ${h.role === 'sell' ? 'badge-gold' : 'badge-purple'}">${h.role === 'sell' ? 'فروش' : 'خرید'}</span>
            <span class="lb-name">${escapeHtml(h.itemName)}</span>
            <span class="lb-points">🪙 ${formatNumber(h.priceCoins)}</span>
            <span class="badge">${statusLabel[h.status] || h.status}</span>
            <span class="lb-points">${relativeTime(h.createdAt)}</span>
          </li>`
          )
          .join('')}
      </ul>
    `;
  }

  function errorStateTemplate() {
    return `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">⚠</span>
        <p>${escapeHtml(errorMsg)}</p>
        <button class="btn btn-secondary btn-sm" id="mp-retry">تلاش دوباره</button>
      </div>
    `;
  }

  function renderContent() {
    const content = document.getElementById('mp-content');
    if (!content) return;
    if (tab === 'browse') content.innerHTML = browseTemplate();
    else if (tab === 'inventory') content.innerHTML = inventoryTemplate();
    else content.innerHTML = historyTemplate();
    bindContentEvents();
  }

  function bindContentEvents() {
    const content = document.getElementById('mp-content');
    if (!content) return;

    content.querySelector('#mp-retry')?.addEventListener('click', async () => {
      await loadCurrentTab();
      renderContent();
    });

    if (tab === 'browse') {
      const searchInput = content.querySelector('#mp-search');
      searchInput?.addEventListener(
        'input',
        debounce(async (e) => {
          filters.search = e.target.value;
          page = 1;
          await loadCurrentTab();
          renderContent();
          document.getElementById('mp-search')?.focus();
        }, 400)
      );
      content.querySelector('#mp-category')?.addEventListener('change', async (e) => {
        filters.category = e.target.value;
        page = 1;
        await loadCurrentTab();
        renderContent();
      });
      content.querySelector('#mp-rarity')?.addEventListener('change', async (e) => {
        filters.rarity = e.target.value;
        page = 1;
        await loadCurrentTab();
        renderContent();
      });
      content.querySelector('#mp-sort')?.addEventListener('change', async (e) => {
        filters.sort = e.target.value;
        page = 1;
        await loadCurrentTab();
        renderContent();
      });
      const priceHandler = debounce(async () => {
        page = 1;
        await loadCurrentTab();
        renderContent();
      }, 500);
      content.querySelector('#mp-min-price')?.addEventListener('input', (e) => {
        filters.minPrice = e.target.value;
        priceHandler();
      });
      content.querySelector('#mp-max-price')?.addEventListener('input', (e) => {
        filters.maxPrice = e.target.value;
        priceHandler();
      });
      content.querySelector('#mp-prev-page')?.addEventListener('click', async () => {
        page = Math.max(1, page - 1);
        await loadCurrentTab();
        renderContent();
      });
      content.querySelector('#mp-next-page')?.addEventListener('click', async () => {
        page = Math.min(listingsResult.totalPages, page + 1);
        await loadCurrentTab();
        renderContent();
      });
      content.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', () => openBuyModal(btn.dataset.buy));
      });
    }

    if (tab === 'inventory') {
      content.querySelectorAll('[data-sell]').forEach((btn) => {
        btn.addEventListener('click', () => openSellModal(btn.dataset.sell));
      });
      content.querySelectorAll('[data-cancel-listing]').forEach((btn) => {
        btn.addEventListener('click', () => cancelListing(btn.dataset.cancelListing));
      });
    }
  }

  /* ------------------------------------------------------------------ Buy */

  function openBuyModal(listingId) {
    const listing = listingsResult.listings.find((l) => l.id === listingId);
    if (!listing) return;

    const canAfford = AuthStore.user.coins >= listing.priceCoins;
    openModal({
      title: 'تایید خرید',
      bodyHtml: `
        <div class="mp-confirm">
          <div class="mp-item-icon" aria-hidden="true">${itemIcon(listing.category)}</div>
          <h3>${escapeHtml(listing.itemName)}</h3>
          <p>از فروشنده: ${escapeHtml(listing.sellerDisplayName || listing.sellerUsername)}</p>
          <p class="mp-price">🪙 ${formatNumber(listing.priceCoins)}</p>
          ${!canAfford ? `<p class="field-error">موجودی سکه شما کافی نیست.</p>` : ''}
        </div>
      `,
      actionsHtml: `
        <button class="btn btn-secondary" id="mp-buy-cancel">انصراف</button>
        <button class="btn btn-primary" id="mp-buy-confirm" ${canAfford ? '' : 'disabled'}>تایید و پرداخت</button>
      `,
    });
    document.getElementById('mp-buy-cancel')?.addEventListener('click', closeModal);
    document.getElementById('mp-buy-confirm')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'در حال پردازش…';
      try {
        const result = await api.post(`/marketplace/listings/${listingId}/buy`, {});
        AuthStore.setUser({ ...AuthStore.user, coins: AuthStore.user.coins - result.priceCoins });
        document.getElementById('mp-balance').textContent = formatNumber(AuthStore.user.coins);
        toast('خرید با موفقیت انجام شد!', 'success');
        closeModal();
        await loadCurrentTab();
        renderContent();
      } catch (err) {
        toast(err.message || 'خرید ناموفق بود', 'error');
        e.target.disabled = false;
        e.target.textContent = 'تایید و پرداخت';
      }
    });
  }

  /* ----------------------------------------------------------------- Sell */

  function openSellModal(inventoryId) {
    const item = inventory.find((i) => i.id === inventoryId);
    if (!item) return;

    openModal({
      title: 'فروش آیتم',
      bodyHtml: `
        <div class="mp-sell-form">
          <div class="mp-item-icon" aria-hidden="true">${itemIcon(item.category)}</div>
          <h3>${escapeHtml(item.itemName)}</h3>
          <div class="field">
            <label for="mp-sell-price">قیمت (سکه)</label>
            <input id="mp-sell-price" type="number" min="1" max="1000000000" placeholder="مثلاً ۵۰۰۰" />
          </div>
          <div class="field">
            <label for="mp-sell-expiry">مدت زمان آگهی</label>
            <select id="mp-sell-expiry" class="mp-select">
              ${EXPIRY_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
          </div>
          <p class="field-error" id="mp-sell-error"></p>
        </div>
      `,
      actionsHtml: `
        <button class="btn btn-secondary" id="mp-sell-cancel">انصراف</button>
        <button class="btn btn-primary" id="mp-sell-confirm">ثبت آگهی</button>
      `,
    });
    document.getElementById('mp-sell-cancel')?.addEventListener('click', closeModal);
    document.getElementById('mp-sell-confirm')?.addEventListener('click', async (e) => {
      const priceInput = document.getElementById('mp-sell-price');
      const expiryInput = document.getElementById('mp-sell-expiry');
      const errorEl = document.getElementById('mp-sell-error');
      const priceCoins = parseInt(priceInput.value, 10);

      if (!Number.isInteger(priceCoins) || priceCoins < 1) {
        errorEl.textContent = 'قیمت معتبری وارد کنید.';
        return;
      }

      e.target.disabled = true;
      e.target.textContent = 'در حال ثبت…';
      try {
        await api.post('/marketplace/listings', {
          inventoryId,
          priceCoins,
          expiresInHours: expiryInput.value ? Number(expiryInput.value) : undefined,
        });
        toast('آگهی با موفقیت ثبت شد', 'success');
        closeModal();
        await loadCurrentTab();
        renderContent();
      } catch (err) {
        errorEl.textContent = err.message || 'ثبت آگهی ناموفق بود';
        e.target.disabled = false;
        e.target.textContent = 'ثبت آگهی';
      }
    });
  }

  async function cancelListing(listingId) {
    try {
      await api.del(`/marketplace/listings/${listingId}`);
      toast('آگهی لغو شد', 'success');
      await loadCurrentTab();
      renderContent();
    } catch (err) {
      toast(err.message || 'لغو آگهی ناموفق بود', 'error');
    }
  }

  shell();
  updateTabButtons();
  await loadCurrentTab();
  renderContent();
}
