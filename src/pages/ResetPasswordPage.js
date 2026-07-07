import { supabase } from '../services/supabaseClient.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { spawnGlyphDrift } from '../utils/effects.js';

/** renderResetPasswordPage() — reached via the link in the password-recovery
 *  email (Supabase redirects back to SITE_URL with recovery tokens in the
 *  URL fragment; supabase-js auto-detects this since detectSessionInUrl is
 *  true in supabaseClient.js, then fires a PASSWORD_RECOVERY auth event). */
export function renderResetPasswordPage(root) {
  function template() {
    return `
      <div class="auth-screen">
        <div class="arcane-seal" aria-hidden="true" style="top:-180px; inset-inline-end:-180px;"></div>
        <div class="glyph-drift" id="auth-glyphs" aria-hidden="true"></div>

        <div class="card card-glass card-arcane-sweep spotlight auth-card enter-stagger" style="--i:0">
          <span class="auth-logo-mark" aria-hidden="true">
            <span class="coin-mark auth-coin"><span class="coin-face">🔑</span></span>
          </span>
          <h1 class="auth-title text-shimmer">تنظیم رمز عبور جدید</h1>
          <p class="auth-sub">رمز عبور جدید خود را وارد کنید.</p>

          <form id="reset-form" novalidate>
            <div class="field enter-stagger" style="--i:1">
              <label for="f-new-password">رمز عبور جدید</label>
              <input id="f-new-password" name="password" type="password" autocomplete="new-password" minlength="6" required />
            </div>
            <div class="field enter-stagger" style="--i:2">
              <label for="f-new-password-confirm">تکرار رمز عبور جدید</label>
              <input id="f-new-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="6" required />
            </div>
            <p class="field-error" id="reset-error" role="alert"></p>
            <button type="submit" class="btn btn-primary btn-block btn-magnetic enter-stagger" style="--i:3" id="reset-submit">
              ثبت رمز عبور جدید
            </button>
          </form>
        </div>
      </div>
    `;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const password = form.get('password');
    const passwordConfirm = form.get('passwordConfirm');
    const errorEl = document.getElementById('reset-error');
    const submitBtn = document.getElementById('reset-submit');
    errorEl.textContent = '';

    if (password !== passwordConfirm) {
      errorEl.textContent = 'رمز عبور و تکرار آن یکسان نیستند';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'رمز عبور باید حداقل ۶ کاراکتر باشد';
      return;
    }

    submitBtn.disabled = true;
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast('رمز عبور با موفقیت تغییر کرد', 'success');
      navigate('/');
    } catch (err) {
      errorEl.textContent = err.message || 'تغییر رمز عبور ناموفق بود';
      submitBtn.disabled = false;
    }
  }

  root.innerHTML = template();
  document.getElementById('reset-form').addEventListener('submit', onSubmit);
  spawnGlyphDrift(document.getElementById('auth-glyphs'), 8);
}
