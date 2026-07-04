import { AuthStore } from '../services/authStore.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { spawnGlyphDrift } from '../utils/effects.js';

export function renderLoginPage(root) {
  let mode = 'login'; // 'login' | 'register'

  function template() {
    return `
      <div class="auth-screen">
        <div class="arcane-seal" aria-hidden="true" style="top:-180px; inset-inline-end:-180px;"></div>
        <div class="arcane-seal arcane-seal--reverse" aria-hidden="true" style="bottom:-220px; inset-inline-start:-220px;"></div>
        <div class="glyph-drift" id="auth-glyphs" aria-hidden="true"></div>

        <div class="card card-glass card-arcane-sweep spotlight auth-card enter-stagger" style="--i:0">
          <span class="auth-logo-mark" aria-hidden="true">
            <span class="coin-mark auth-coin"><span class="coin-face">🤲</span></span>
          </span>
          <h1 class="auth-title text-shimmer">دست یا خالی</h1>
          <p class="auth-sub">پلتفرم بازی آنلاین — شانس، مهارت و هیجان</p>

          <div class="auth-tabs" role="tablist">
            <button role="tab" aria-selected="${mode === 'login'}" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">ورود</button>
            <button role="tab" aria-selected="${mode === 'register'}" class="auth-tab ${mode === 'register' ? 'active' : ''}" data-mode="register">ثبت‌نام</button>
          </div>

          <form id="auth-form" novalidate>
            ${mode === 'register' ? `
              <div class="field enter-stagger" style="--i:1">
                <label for="f-username">نام کاربری</label>
                <input id="f-username" name="username" type="text" autocomplete="username" required />
              </div>
              <div class="field enter-stagger" style="--i:2">
                <label for="f-email">ایمیل</label>
                <input id="f-email" name="email" type="email" autocomplete="email" required />
              </div>
            ` : `
              <div class="field enter-stagger" style="--i:1">
                <label for="f-identifier">نام کاربری یا ایمیل</label>
                <input id="f-identifier" name="identifier" type="text" autocomplete="username" required />
              </div>
            `}
            <div class="field enter-stagger" style="--i:3">
              <label for="f-password">رمز عبور</label>
              <input id="f-password" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required />
            </div>
            <p class="field-error" id="auth-error" role="alert"></p>
            <button type="submit" class="btn btn-primary btn-block btn-magnetic enter-stagger" style="--i:4" id="auth-submit">
              ${mode === 'login' ? 'ورود به حساب کاربری' : 'ساخت حساب کاربری'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function render() {
    root.innerHTML = template();
    root.querySelectorAll('.auth-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        render();
      });
    });
    document.getElementById('auth-form').addEventListener('submit', onSubmit);
    spawnGlyphDrift(document.getElementById('auth-glyphs'), 8);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');
    errorEl.textContent = '';
    submitBtn.disabled = true;

    try {
      if (mode === 'login') {
        await AuthStore.login({ identifier: form.get('identifier'), password: form.get('password') });
        toast('خوش آمدید!', 'success');
        navigate('/');
      } else {
        await AuthStore.register({
          username: form.get('username'),
          email: form.get('email'),
          password: form.get('password'),
        });
        toast('حساب کاربری ساخته شد، اکنون وارد شوید', 'success');
        mode = 'login';
        render();
      }
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  render();
}
