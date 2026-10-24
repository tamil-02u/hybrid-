/* ============================================================
   auth.js – SmartHarvest Authentication Logic  (fixed v2)
   Handles: Login, Signup, Forgot Password, Reset Password
   ============================================================ */

/* ----------------------------------------------------------
   GLOBAL modal helpers — exposed immediately so inline
   onclick="openModal('...')" in HTML always works,
   even before DOMContentLoaded fires.
   ---------------------------------------------------------- */
function openModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay) { console.warn('Modal not found:', modalId); return; }
    // Support both .open (CSS) and .active (programmatic)
    overlay.classList.add('open');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const firstInput = overlay.querySelector('input:not([type="hidden"]), select, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 80);
}

function closeModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    const anyOpen = document.querySelector('.modal-overlay.open, .modal-overlay.active');
    if (!anyOpen) document.body.style.overflow = '';
    _clearModalMessages(modalId);
}

function switchModal(fromId, toId) {
    closeModal(fromId);
    setTimeout(() => openModal(toId), 80);
}

function togglePw(inputId, iconSpan) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const icon = iconSpan ? iconSpan.querySelector('i') : null;
    if (inp.type === 'password') {
        inp.type = 'text';
        if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
    } else {
        inp.type = 'password';
        if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
    }
}

/* ----------------------------------------------------------
   Internal helpers
   ---------------------------------------------------------- */
function _clearModalMessages(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;
    overlay.querySelectorAll('.error-msg, .success-msg, .alert-box').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
        el.classList.remove('show', 'error', 'success');
    });
}

function _showMsg(elementId, message, type = 'error') {
    const el = document.getElementById(elementId);
    if (!el) { console.warn('Message element not found:', elementId); return; }
    el.textContent = message;
    el.style.display = 'flex';
    // Support both alert-box class system and simple spans
    el.classList.remove('error', 'success', 'show');
    el.classList.add(type, 'show');
}

function _showError(elementId, message) { _showMsg(elementId, message, 'error'); }
function _showSuccess(elementId, message) { _showMsg(elementId, message, 'success'); }

function _btnLoad(btn, loading, idleText) {
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn._idle = btn.innerHTML;
        btn.innerHTML = `<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span>${idleText || 'Loading…'}`;
    } else {
        btn.disabled = false;
        btn.innerHTML = btn._idle || idleText || 'Submit';
    }
}

function _isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function _passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: 'Weak',   color: '#e74c3c', width: '25%'  };
    if (score <= 3) return { label: 'Medium', color: '#e67e22', width: '60%'  };
    return              { label: 'Strong', color: '#27ae60', width: '100%' };
}

/* ----------------------------------------------------------
   Backend health check — shown once if backend is unreachable
   ---------------------------------------------------------- */
let _backendWarningShown = false;
async function _checkBackend() {
    if (_backendWarningShown) return;
    try {
        const r = await fetch((window.SMARTHARVEST_API_BASE || '') + '/health', {
            method: 'GET', credentials: 'include', signal: AbortSignal.timeout(4000)
        });
        if (!r.ok) throw new Error('non-ok');
    } catch {
        _backendWarningShown = true;
        // Inject a visible banner at top of page
        const banner = document.createElement('div');
        banner.style.cssText = [
            'position:fixed', 'top:70px', 'left:0', 'right:0', 'z-index:5000',
            'background:#7B341E', 'color:#fff', 'text-align:center',
            'padding:0.75rem 1rem', 'font-size:0.9rem', 'font-weight:600'
        ].join(';');
        const apiUrl = window.SMARTHARVEST_API_BASE || '(same origin)';
        banner.innerHTML = `⚠️ Backend server is not reachable at <code style="background:rgba(0,0,0,0.3);padding:0 6px;border-radius:4px;">${apiUrl}</code>. Login and registration will not work until the Flask backend is deployed. <a href="https://render.com" target="_blank" style="color:#fbd38d;text-decoration:underline;">Deploy on Render →</a>`;
        document.body.prepend(banner);
        console.error('[SmartHarvest] Backend unreachable at', apiUrl);
    }
}

/* ----------------------------------------------------------
   DOMContentLoaded — wire up forms and check auth state
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
    // Show backend warning if unreachable
    _checkBackend();

    // Redirect to booking.html if already logged in
    try {
        const r = await fetch((window.SMARTHARVEST_API_BASE || '') + '/auth/me', {
            credentials: 'include', signal: AbortSignal.timeout(3000)
        });
        if (r.ok) { window.location.href = 'booking.html'; return; }
    } catch { /* not logged in or backend down */ }

    // Wire up modal backdrop click + Escape
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open, .modal-overlay.active').forEach(o => closeModal(o.id));
        }
    });

    _initLoginForm();
    _initSignupForm();
    _initForgotForm();
    _initResetForm();
});

/* ----------------------------------------------------------
   Login Form
   ---------------------------------------------------------- */
function _initLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        _showMsg('login-error', '', 'error'); // clear
        document.getElementById('login-error').style.display = 'none';

        const email    = (document.getElementById('login-email')?.value   || '').trim();
        const password = (document.getElementById('login-password')?.value || '');
        const btn      = form.querySelector('button[type="submit"]');

        if (!email || !password) {
            _showError('login-error', 'Please enter both email and password.');
            return;
        }

        _btnLoad(btn, true, 'Signing in…');
        try {
            const res  = await fetch((window.SMARTHARVEST_API_BASE || '') + '/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 200) {
                showToast('Logged in! Redirecting…', 'success');
                setTimeout(() => { window.location.href = 'booking.html'; }, 800);
            } else if (res.status === 404) {
                _showError('login-error', 'Sorry, registered ID not found. Please sign up to continue.');
            } else if (res.status === 401) {
                _showError('login-error', 'Incorrect password. Please try again.');
            } else if (res.status === 0 || !res.status) {
                _showError('login-error', 'Cannot reach the server. Please check your internet connection.');
            } else {
                _showError('login-error', data.error || data.message || 'Login failed. Please try again.');
            }
        } catch {
            _showError('login-error', 'Network error — the backend server is not running or not reachable.');
        } finally {
            _btnLoad(btn, false, '<i class="fas fa-sign-in-alt"></i> Login');
        }
    });
}

/* ----------------------------------------------------------
   Signup Form
   ---------------------------------------------------------- */
function _initSignupForm() {
    const form = document.getElementById('signup-form');
    if (!form) return;

    // Password strength indicator
    const pwInput = document.getElementById('signup-password');
    const pwFill  = document.getElementById('pw-fill');
    const pwLabel = document.getElementById('pw-label');
    if (pwInput && pwFill) {
        pwInput.addEventListener('input', () => {
            const s = _passwordStrength(pwInput.value);
            if (pwFill)  { pwFill.style.width = s.width; pwFill.style.background = s.color; }
            if (pwLabel) { pwLabel.textContent = s.label; pwLabel.style.color = s.color; }
        });
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        document.getElementById('signup-error').style.display   = 'none';
        document.getElementById('signup-success').style.display = 'none';

        const name    = (document.getElementById('signup-name')?.value    || '').trim();
        const phone   = (document.getElementById('signup-phone')?.value   || '').trim();
        const email   = (document.getElementById('signup-email')?.value   || '').trim();
        const pw      = (document.getElementById('signup-password')?.value || '');
        // Accept both IDs for confirm field
        const cpw     = (document.getElementById('signup-confirm')?.value ||
                         document.getElementById('signup-confirm-password')?.value || '');
        const btn     = form.querySelector('button[type="submit"]');

        // Validation
        if (!name)               return _showError('signup-error', 'Full name is required.');
        if (!phone)              return _showError('signup-error', 'Phone number is required.');
        if (!email)              return _showError('signup-error', 'Email address is required.');
        if (!_isValidEmail(email)) return _showError('signup-error', 'Please enter a valid email address.');
        if (pw.length < 8)       return _showError('signup-error', 'Password must be at least 8 characters.');
        if (pw !== cpw)          return _showError('signup-error', 'Passwords do not match.');

        _btnLoad(btn, true, 'Creating account…');
        try {
            const res  = await fetch((window.SMARTHARVEST_API_BASE || '') + '/auth/register', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, email, password: pw, confirm_password: cpw })
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 200 || res.status === 201) {
                _showSuccess('signup-success', 'Account created! Redirecting to login…');
                document.getElementById('signup-error').style.display = 'none';
                setTimeout(() => switchModal('signup-modal', 'login-modal'), 2000);
            } else {
                _showError('signup-error', data.error || data.message || 'Registration failed. Please try again.');
            }
        } catch {
            _showError('signup-error', 'Network error — backend server is not reachable.');
        } finally {
            _btnLoad(btn, false, '<i class="fas fa-user-plus"></i> Create Account');
        }
    });
}

/* ----------------------------------------------------------
   Forgot Password Form
   ---------------------------------------------------------- */
function _initForgotForm() {
    const form = document.getElementById('forgot-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        document.getElementById('forgot-error').style.display   = 'none';
        document.getElementById('forgot-success').style.display = 'none';

        const email = (document.getElementById('forgot-email')?.value || '').trim();
        const btn   = form.querySelector('button[type="submit"]');

        if (!email || !_isValidEmail(email)) {
            _showError('forgot-error', 'Please enter a valid email address.');
            return;
        }

        _btnLoad(btn, true, 'Sending…');
        try {
            const res  = await fetch((window.SMARTHARVEST_API_BASE || '') + '/auth/forgot-password', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                const token = data.data?.token || '';
                _showSuccess('forgot-success',
                    'Reset token sent! ' + (token ? `Demo token: ${token}` : 'Check your email.'));
                // Pre-fill token in reset modal
                const tokenInput = document.getElementById('reset-token');
                if (tokenInput && token) tokenInput.value = token;
            } else {
                _showError('forgot-error', data.error || 'Could not find that email. Please check and retry.');
            }
        } catch {
            _showError('forgot-error', 'Network error — backend is not reachable.');
        } finally {
            _btnLoad(btn, false, '<i class="fas fa-paper-plane"></i> Send Reset Token');
        }
    });
}

/* ----------------------------------------------------------
   Reset Password Form
   ---------------------------------------------------------- */
function _initResetForm() {
    const form = document.getElementById('reset-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        document.getElementById('reset-error').style.display   = 'none';
        document.getElementById('reset-success').style.display = 'none';

        const token   = (document.getElementById('reset-token')?.value   || '').trim();
        const pw      = (document.getElementById('reset-pw')?.value       || '');
        const confirm = (document.getElementById('reset-confirm')?.value  || '');
        const btn     = form.querySelector('button[type="submit"]');

        if (!token)       return _showError('reset-error', 'Please enter the reset token.');
        if (pw.length < 8) return _showError('reset-error', 'New password must be at least 8 characters.');
        if (pw !== confirm) return _showError('reset-error', 'Passwords do not match.');

        _btnLoad(btn, true, 'Resetting…');
        try {
            const res  = await fetch((window.SMARTHARVEST_API_BASE || '') + '/auth/reset-password', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, new_password: pw, confirm_password: confirm })
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                _showSuccess('reset-success', 'Password reset successful! Redirecting to login…');
                setTimeout(() => switchModal('reset-modal', 'login-modal'), 2000);
            } else {
                _showError('reset-error', data.error || 'Reset failed. Token may be invalid or expired.');
            }
        } catch {
            _showError('reset-error', 'Network error — backend is not reachable.');
        } finally {
            _btnLoad(btn, false, '<i class="fas fa-lock"></i> Reset Password');
        }
    });
}
