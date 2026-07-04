import { AuthStore } from './services/authStore.js';
import { renderHeader } from './components/Header.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderLoginPage } from './pages/LoginPage.js';
import { renderDashboardPage } from './pages/DashboardPage.js';
import { renderGamePage } from './pages/GamePage.js';
import { renderLeaderboardPage } from './pages/LeaderboardPage.js';
import { renderTournaments } from './pages/TournamentsPage.js';
import { renderMarketplace } from './pages/MarketplacePage.js';
import { renderClans } from './pages/ClansPage.js';
import { renderFriends } from './pages/FriendsPage.js';
import { renderChat } from './pages/ChatPage.js';
import { initNotificationPanel, attachSocketListener } from './components/NotificationPanel.js';
import { renderAdmin } from './pages/AdminPage.js';
import { renderProfilePage } from './pages/ProfilePage.js';
import { registerRoute, setRouteGuard, startRouter, navigate } from './router.js';
import { toast } from './components/Toast.js';
import { initRipples, initSpotlight, initMagnetic } from './utils/effects.js';
import { getSocket } from './services/socket.js';

const PUBLIC_ROUTES = new Set(['/login']);
let notificationsBooted = false;

function setShellVisibility() {
  const isAuthed = !!AuthStore.user;
  document.getElementById('app-header')?.classList.toggle('visible', isAuthed);
  document.getElementById('app-sidebar')?.classList.toggle('visible', isAuthed);
  document.body.classList.toggle('authed', isAuthed);
}

function bootNotifications() {
  if (notificationsBooted) return;
  notificationsBooted = true;
  initNotificationPanel();
  try {
    getSocket();
    attachSocketListener();
  } catch {
    /* socket.io CDN not ready yet — pages that use sockets will retry via getSocket() */
  }
}

AuthStore.subscribe((user) => {
  if (user) {
    renderHeader(user);
    renderSidebar(user);
    bootNotifications();
  }
  setShellVisibility();
});

document.addEventListener('auth:expired', () => {
  toast('نشست شما منقضی شد، دوباره وارد شوید', 'info');
  navigate('/login');
});

function boot() {
  const root = document.getElementById('app-root');

  registerRoute('/login', renderLoginPage);
  registerRoute('/', renderDashboardPage);
  registerRoute('/game', renderGamePage);
  registerRoute('/leaderboard', renderLeaderboardPage);
  registerRoute('/tournaments', renderTournaments);
  registerRoute('/marketplace', renderMarketplace);
  registerRoute('/clan', renderClans);
  registerRoute('/friends', renderFriends);
  registerRoute('/chat', renderChat);
  registerRoute('/profile', renderProfilePage);
  registerRoute('/admin', renderAdmin);
  registerRoute('/404', (r) => {
    r.innerHTML = `<div class="container page-pad"><div class="empty-state"><span class="empty-icon">🔍</span><p>صفحه یافت نشد</p></div></div>`;
  });

  setRouteGuard((path) => {
    const isPublic = PUBLIC_ROUTES.has(path);
    if (!AuthStore.user && !isPublic) {
      navigate('/login');
      return false;
    }
    if (AuthStore.user && isPublic) {
      navigate('/');
      return false;
    }
    if (path === '/admin' && AuthStore.user?.role !== 'admin') {
      toast('دسترسی به این بخش نیاز به مجوز مدیریت دارد', 'error');
      navigate('/');
      return false;
    }
    return true;
  });

  startRouter(root);
  initRipples(document.body);
  initSpotlight(document.body);
  initMagnetic(document.body);
}

document.getElementById('loading-screen')?.classList.add('hidden');

AuthStore.restoreSession().finally(() => {
  setShellVisibility();
  if (AuthStore.user) {
    renderHeader(AuthStore.user);
    renderSidebar(AuthStore.user);
  }
  boot();
});
