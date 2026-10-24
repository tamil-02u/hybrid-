/* ============================================================
   main.js – SmartHarvest shared utilities
   Used across all pages (index, booking, dashboard)
   ============================================================ */

// API base URL: set by config.js (auto-detects local vs production).
// We read it as a getter so it always uses the latest value from config.js
// even if config.js loads slightly after main.js on some browsers.
function _getApiBase() {
    return window.SMARTHARVEST_API_BASE !== undefined
        ? window.SMARTHARVEST_API_BASE
        : 'http://localhost:5000';
}
// Keep a legacy const for any scripts that reference API_BASE directly
Object.defineProperty(window, 'API_BASE', {
    get: _getApiBase, configurable: true
});

/* ----------------------------------------------------------
   API Helper – fetch wrapper with session credentials
   ---------------------------------------------------------- */
async function apiCall(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    try {
        const base = _getApiBase();
        const res = await fetch(base + endpoint, opts);
        let data;
        try {
            data = await res.json();
        } catch {
            data = {};
        }
        return { status: res.status, data };
    } catch (err) {
        console.error('apiCall error:', err);
        return { status: 0, data: { message: 'Network error – could not reach server.' } };
    }
}

/* ----------------------------------------------------------
   Toast Notification System (bottom-right)
   type: 'success' | 'error' | 'warning' | 'info'
   ---------------------------------------------------------- */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = [
            'position:fixed', 'bottom:1.5rem', 'right:1.5rem',
            'z-index:99999', 'display:flex', 'flex-direction:column', 'gap:0.6rem'
        ].join(';');
        document.body.appendChild(container);
    }

    const icons = {
        success: '✅',
        error:   '❌',
        warning: '⚠️',
        info:    'ℹ️'
    };
    const colors = {
        success: '#2D7D46',
        error:   '#c0392b',
        warning: '#e67e22',
        info:    '#2980b9'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = [
        `background:${colors[type] ?? colors.info}`,
        'color:#fff',
        'padding:0.75rem 1.1rem',
        'border-radius:0.5rem',
        'font-size:0.9rem',
        'max-width:320px',
        'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
        'display:flex',
        'align-items:center',
        'gap:0.5rem',
        'opacity:0',
        'transform:translateX(60px)',
        'transition:opacity 0.3s ease, transform 0.3s ease',
        'cursor:pointer'
    ].join(';');
    toast.innerHTML = `<span>${icons[type] ?? icons.info}</span><span>${message}</span>`;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });
    });

    const dismiss = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(60px)';
        setTimeout(() => toast.remove(), 320);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, 4000);
}

/* ----------------------------------------------------------
   Date / Time Formatters
   ---------------------------------------------------------- */

/**
 * Format ISO date string → "23 Oct 2026"
 */
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Format ISO datetime → "23 Oct 2026, 14:30"
 */
function formatDatetime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d)) return isoStr;
    return d.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

/**
 * Calculate days remaining until endDateStr
 * Returns negative value if past, 0 if today
 */
function daysRemaining(endDateStr) {
    if (!endDateStr) return null;
    const end  = new Date(endDateStr);
    const now  = new Date();
    // Strip time component
    end.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diff = Math.round((end - now) / (1000 * 60 * 60 * 24));
    return diff;
}

/* ----------------------------------------------------------
   Auth helpers
   ---------------------------------------------------------- */

/**
 * Ensure user is authenticated; redirect to index.html if not.
 * Returns the user object on success.
 */
async function requireAuth() {
    const { status, data } = await apiCall('/auth/me');
    if (status !== 200) {
        window.location.href = 'index.html';
        return null;
    }
    return data;
}

/**
 * Log out the current user and redirect to index.html
 */
async function logout() {
    try {
        await apiCall('/auth/logout', 'POST');
    } catch { /* ignore */ }
    window.location.href = 'index.html';
}

/* ----------------------------------------------------------
   Counter Animation (IntersectionObserver)
   Targets elements with data-target="<number>" attribute
   ---------------------------------------------------------- */
function animateCounters() {
    const counters = document.querySelectorAll('[data-target]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);

            const el     = entry.target;
            const target = parseFloat(el.dataset.target);
            const isInt  = Number.isInteger(target);
            const duration = 1800; // ms
            const steps    = 60;
            const step     = duration / steps;
            let current    = 0;
            let frame      = 0;

            const tick = () => {
                frame++;
                const progress = frame / steps;
                // Ease-out
                current = target * (1 - Math.pow(1 - progress, 3));
                el.textContent = isInt
                    ? Math.round(current).toLocaleString()
                    : current.toFixed(1);
                if (frame < steps) {
                    setTimeout(tick, step);
                } else {
                    el.textContent = isInt
                        ? target.toLocaleString()
                        : target.toFixed(1);
                }
            };
            tick();
        });
    }, { threshold: 0.4 });

    counters.forEach(el => observer.observe(el));
}

/* ----------------------------------------------------------
   Navbar helpers
   ---------------------------------------------------------- */

function initNavbar() {
    // Hamburger toggle
    const hamburger = document.querySelector('.hamburger, .navbar-toggler, [data-toggle="hamburger"]');
    const navMenu   = document.querySelector('.nav-links, .navbar-menu, .nav-menu');
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('open');
            hamburger.classList.toggle('active');
            hamburger.setAttribute('aria-expanded',
                hamburger.classList.contains('active') ? 'true' : 'false'
            );
        });

        // Close on nav link click (mobile)
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('open');
                hamburger.classList.remove('active');
            });
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Active link highlight based on current path
    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-links a, .navbar-menu a, .nav-menu a').forEach(link => {
        const linkPath = link.getAttribute('href');
        if (linkPath && linkPath === currentPath) {
            link.classList.add('active');
        }
    });

    // Logout buttons
    document.querySelectorAll('[data-action="logout"], #logout-btn, .logout-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    });
}

/* ----------------------------------------------------------
   DOMContentLoaded – initialize shared things
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    animateCounters();
});
