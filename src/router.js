const routes = new Map();
let rootEl = null;
let guard = null;

/* Maps each route to one of four color moods (see tokens.css):
   - theme-tropical (default) — dashboard, home, leaderboard
   - theme-sunset             — marketplace, profile
   - theme-garden             — clans, friends, chat
   - theme-blaze              — game, tournaments, hokm (live competition) */
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
  '/hokm': 'theme-blaze',
  '/admin': 'theme-tropical',
};
const ALL_THEME_CLASSES = ['theme-tropical', 'theme-sunset', 'theme-garden', 'theme-blaze'];

function applyRouteTheme(path) {
  const base = '/' + (path.split('/')[1] || '');
  const theme = ROUTE_THEME[path] || ROUTE_THEME[base] || 'theme-tropical';
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

/** Matches a registered pattern like '/hokm/:roomId' against the current
 *  path. Returns { handler, params } for the first match, exact routes
 *  (registered without ':') taking priority so nothing already registered
 *  changes behavior. */
function matchRoute(path) {
  if (routes.has(path)) return { handler: routes.get(path), params: {} };

  const pathParts = path.split('/').filter(Boolean);
  for (const [pattern, handler] of routes.entries()) {
    if (!pattern.includes(':')) continue;
    const patternParts = pattern.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    const isMatch = patternParts.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = pathParts[i];
        return true;
      }
      return part === pathParts[i];
    });
    if (isMatch) return { handler, params };
  }
  return { handler: null, params: {} };
}

async function render() {
  const path = currentPath();
  if (guard && !guard(path)) return;

  applyRouteTheme(path);

  document.querySelectorAll('.main-nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === path || a.dataset.route === '/' + path.split('/')[1]);
  });
  document.dispatchEvent(new CustomEvent('router:active-route', { detail: { path } }));

  const { handler, params } = matchRoute(path);
  const finalHandler = handler || routes.get('/404');
  if (!finalHandler) return;
  await finalHandler(rootEl, params);
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
