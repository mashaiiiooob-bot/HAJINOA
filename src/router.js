const routes = new Map();
let rootEl = null;
let guard = null;

/* Maps each route to one of four color moods (see tokens.css):
   - theme-tropical (default) — dashboard, home, leaderboard
   - theme-sunset             — marketplace, profile
   - theme-garden             — clans, friends, chat
   - theme-blaze              — game, tournaments (live competition) */
const ROUTE_THEME = {
  '/': 'theme-tropical',
  '/login': 'theme-tropical',
  '/reset-password': 'theme-tropical',
  '/leaderboard': 'theme-tropical',
  '/marketplace': 'theme-sunset',
  '/profile': 'theme-sunset',
  '/clan': 'theme-garden',
  '/friends': 'theme-garden',
  '/chat': 'theme-garden',
  '/game': 'theme-blaze',
  '/tournaments': 'theme-blaze',
  '/admin': 'theme-tropical',
};
const ALL_THEME_CLASSES = ['theme-tropical', 'theme-sunset', 'theme-garden', 'theme-blaze'];

function applyRouteTheme(path) {
  const theme = ROUTE_THEME[path] || 'theme-tropical';
  document.body.classList.remove(...ALL_THEME_CLASSES);
  document.body.classList.add(theme);
}

export function registerRoute(path, handler) {
  routes.set(path, handler);
}

export function setRouteGuard(fn) {
  guard = fn; // return true to allow navigation, false to block (guard handles redirect itself)
}

export function navigate(path) {
  window.location.hash = `#${path}`;
}

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/';
}

async function render() {
  const path = currentPath();
  if (guard && !guard(path)) return;

  applyRouteTheme(path);

  document.querySelectorAll('.main-nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === path);
  });
  document.dispatchEvent(new CustomEvent('router:active-route', { detail: { path } }));

  const handler = routes.get(path) || routes.get('/404');
  if (!handler) return;
  await handler(rootEl);
  // restart the fade/rise entrance animation on every navigation
  requestAnimationFrame(() => {
    rootEl?.classList.remove('route-enter');
    void rootEl?.offsetWidth;
    rootEl?.classList.add('route-enter');
  });
}

export function startRouter(root) {
  rootEl = root;
  window.addEventListener('hashchange', render);
  render();
}
