import { AuthStore } from '../services/authStore.js';
import { supabase } from '../services/supabaseClient.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { spawnGlyphDrift } from '../utils/effects.js';

export function renderLoginPage(root) {
  let mode = 'login'; // 'login' | 'register' | 'forgot'

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

          ${mode !== 'forgot' ? `
            <div class="auth-tabs" role="tablist">
              <button role="tab" aria-selected="${mode === 'login'}" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">ورود</button>
              <button role="tab" aria-selected="${mode === 'register'}" class="auth-tab ${mode === 'register' ? 'active' : ''}" data-mode="register">ثبت‌نام</button>
            </div>
          ` : ''}

          ${mode === 'forgot' ? forgotPasswordTemplate() : authFormTemplate()}

          ${
            mode === 'login'
              ? `
            <div class="auth-divider"><span>یا</span></div>
            <button type="button" class="btn btn-secondary btn-block" id="btn-guest-login">ورود به عنوان مهمان</button>
            <button type="button" class="btn btn-ghost btn-sm btn-block" id="btn-forgot-password" style="margin-top:8px">رمز عبور را فراموش کرده‌اید؟</button>
          `
              : ''
          }
          ${
            mode === 'forgot'
              ? `<button type="button" class="btn btn-ghost btn-sm btn-block" id="btn-back-to-login" style="margin-top:8px">بازگشت به ورود</button>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function authFormTemplate() {
    return `
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
    `;
  }

  function forgotPasswordTemplate() {
    return `
      <form id="forgot-form" novalidate>
        <p class="auth-sub" style="margin-bottom:var(--sp-3)">ایمیل حساب خود را وارد کنید تا لینک بازیابی رمز عبور برایتان ارسال شود.</p>
        <div class="field enter-stagger" style="--i:1">
          <label for="f-forgot-email">ایمیل</label>
          <input id="f-forgot-email" name="email" type="email" autocomplete="email" required />
        </div>
        <p class="field-error" id="forgot-error" role="alert"></p>
        <p class="field-success" id="forgot-success" style="color:var(--c-success); font-size:var(--fs-xs); min-height:1em;"></p>
        <button type="submit" class="btn btn-primary btn-block btn-magnetic enter-stagger" style="--i:2" id="forgot-submit">
          ارسال لینک بازیابی
        </button>
      </form>
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
    document.getElementById('auth-form')?.addEventListener('submit', onSubmit);
    document.getElementById('forgot-form')?.addEventListener('submit', onForgotSubmit);
    document.getElementById('btn-guest-login')?.addEventListener('click', onGuestLogin);
    document.getElementById('btn-forgot-password')?.addEventListener('click', () => {
      mode = 'forgot';
      render();
    });
    document.getElementById('btn-back-to-login')?.addEventListener('click', () => {
      mode = 'login';
      render();
    });
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

  /** onGuestLogin() — creates a temporary anonymous Supabase Auth user (no
   *  email/password). Requires "Anonymous Sign-Ins" enabled in the Supabase
   *  dashboard (Authentication → Providers). The handle_new_auth_user
   *  trigger gives them a generated guest_<id> username/display name since
   *  anonymous users have no email to derive one from. */
  async function onGuestLogin() {
    const btn = document.getElementById('btn-guest-login');
    btn.disabled = true;
    btn.textContent = 'در حال ورود…';
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      // Give the DB trigger a moment to create the public.users row before
      // loadProfile() (triggered by onAuthStateChange) tries to read it.
      await new Promise((r) => setTimeout(r, 300));
      const profile = await AuthStore.restoreSession();
      if (!profile) throw new Error('ساخت حساب مهمان ناموفق بود، دوباره تلاش کنید');
      toast('به عنوان مهمان وارد شدید', 'success');
      navigate('/');
    } catch (err) {
      toast(err.message || 'ورود مهمان ناموفق بود', 'error');
      btn.disabled = false;
      btn.textContent = 'ورود به عنوان مهمان';
    }
  }

  /** onForgotSubmit() — sends a Supabase Auth password-recovery email. The
   *  link in that email redirects back to this same origin; Supabase Auth
   *  then fires a PASSWORD_RECOVERY event that a future dedicated
   *  reset-password screen would listen for. Wiring that follow-up screen
   *  is a separate step — this only covers requesting the email. */
  async function onForgotSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById('forgot-error');
    const successEl = document.getElementById('forgot-success');
    const submitBtn = document.getElementById('forgot-submit');
    errorEl.textContent = '';
    successEl.textContent = '';
    submitBtn.disabled = true;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(form.get('email'), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      successEl.textContent = 'در صورت وجود حساب با این ایمیل، لینک بازیابی ارسال شد.';
    } catch (err) {
      errorEl.textContent = err.message || 'ارسال لینک بازیابی ناموفق بود';
    } finally {
      submitBtn.disabled = false;
    }
  }

  render();
}
