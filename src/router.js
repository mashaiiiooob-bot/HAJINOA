const routes = new Map();
let rootEl = null;
let guard = null;

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
