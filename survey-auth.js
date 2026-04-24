// ============================================================
// survey-auth.js — MSS v7.0 QR Chain Architecture
// © 2026 Ministry of Health Kenya
//
// WHAT CHANGED FROM v5.x:
//   REMOVED: authLogin(), authRegister(), authAdminLogin(),
//            authRegisterAdmin(), authSubmitRegistration(),
//            authCheckStatus(), loadInstitutionDropdown(),
//            switchLoginTab(), switchRegTab(), authNotifyTeacher()
//   REASON:  Students and admins no longer self-register or
//            log in with passwords. Entry is via QR token only.
//
//   KEPT:    isAdminBypass() — super admin secret code (unchanged)
//            authSignOut() — simplified
//            showScreen(), showReturningGreeting() — UI routing
//            homeGoAdmin() — now reads role from JWT
//            authSaveSession() / authGetSession() — simplified
//            MSSSanitize, MSSValidate, MSSRateLimit — unchanged
//            MSSError — unchanged
//            PWA, service worker, version check — unchanged
//            showEnumeratorHome() — unchanged
// ============================================================


// ============================================================
// 1. INPUT VALIDATION & SANITIZATION (unchanged)
// ============================================================
const MSSSanitize = {
  text(s) {
    if (!s) return '';
    return String(s).trim()
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .slice(0, 500);
  },
  admissionNumber(s) {
    if (!s) return '';
    return String(s).trim().toUpperCase().replace(/[^A-Z0-9/\-.]/g, '').slice(0, 50);
  },
  name(s) {
    if (!s) return '';
    return String(s).trim().replace(/[^a-zA-Z \-\']/g, '').slice(0, 100);
  },
  email(s) {
    if (!s) return '';
    return String(s).trim().toLowerCase().slice(0, 254);
  },
  password(s) {
    if (!s) return '';
    return String(s).slice(0, 128);
  },
  idNumber(s) {
    if (!s) return '';
    return String(s).trim().replace(/[^A-Z0-9]/gi, '').slice(0, 20);
  },
};

const MSSValidate = {
  admissionNumber(s) {
    const clean = MSSSanitize.admissionNumber(s);
    return clean.length >= 3 && /^[A-Z0-9][A-Z0-9\/\-.]{2,}$/.test(clean);
  },
  name(s) {
    const clean = MSSSanitize.name(s);
    return clean.length >= 2 && clean.length <= 100;
  },
  email(s) {
    if (!s) return true;
    const clean = MSSSanitize.email(s);
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean);
  },
  password(s) {
    return s && String(s).length >= 4 && String(s).length <= 128;
  },
  idNumber(s) {
    const clean = MSSSanitize.idNumber(s);
    return clean.length >= 4 && clean.length <= 20;
  },
};

const MSSRateLimit = {
  _attempts: {},
  check(key, maxAttempts, windowMs) {
    const now   = Date.now();
    const entry = this._attempts[key] || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    this._attempts[key] = entry;
    if (entry.count > maxAttempts) {
      const wait = Math.ceil((entry.resetAt - now) / 1000);
      throw new Error('Too many attempts. Please wait ' + wait + ' seconds.');
    }
  },
  reset(key) { delete this._attempts[key]; },
};


// ============================================================
// 2. SESSION — reads from JWT only
//    Single source of truth: localStorage('mss-token')
//    No more chsa_auth, chsa_session, hs_session, etc.
// ============================================================

function _decodeJWTPayload() {
  try {
    const token = localStorage.getItem('mss-token') || '';
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

// Legacy shim — other files still call authGetSession()
// Returns a session-like object derived from the JWT
function authGetSession() {
  const p = _decodeJWTPayload();
  if (!p) return null;
  return {
    role:             p.role           || 'enumerator',
    full_name:        p.name           || '',
    reg_number:       p.admission_no   || '',
    institution_id:   p.institution_id || null,
    institution_name: p.institution_name || null,
    id:               p.id             || null,
    user_type:        p.user_type      || null,
  };
}

// Legacy shim — other files call authSaveSession()
// In QR chain, session is set by QR validation, not here.
// This is kept as a no-op shim to avoid breaking other files.
function authSaveSession(data) {
  // Session is now embedded in JWT — nothing to save manually.
  // If name is provided, mirror it to localStorage for UI display.
  if (data && data.full_name) {
    localStorage.setItem('chsa_user_name', data.full_name);
  }
}

function authClearSession() {
  localStorage.removeItem('mss-token');
  localStorage.removeItem('chsa_user_name');
  localStorage.removeItem('chsa_is_admin_bypass');
  localStorage.removeItem('chsa_is_inst_admin');
  sessionStorage.removeItem('mss-session-id');
  sessionStorage.removeItem('mss-session-name');
  sessionStorage.removeItem('adm_ok');
}

function getUserName() {
  const p = _decodeJWTPayload();
  if (p && p.name) return p.name;
  return localStorage.getItem('chsa_user_name') || '';
}

function getSessionInstitutionName() {
  const p = _decodeJWTPayload();
  return (p && p.institution_name) || null;
}


// ============================================================
// 3. SUPER ADMIN — unchanged, still uses secret code
// ============================================================
async function isAdminBypass(code) {
  try {
    const data = await window.HS.HSAuth.superLogin(code);
    if (data && data.user && data.user.role === 'super_admin') {
      // Store JWT as mss-token (consistent with QR flow)
      localStorage.setItem('mss-token', window.HS.Auth.getToken());
      return true;
    }
  } catch(e) {
    // superlogin not deployed — legacy fallback
    try {
      const data = await window.HS.HSAuth.login(code, code);
      if (data && data.user && data.user.role === 'super_admin') {
        localStorage.setItem('mss-token', window.HS.Auth.getToken());
        return true;
      }
    } catch(e2) { return false; }
  }
  return false;
}

// Super admin entry point — called from home screen secret code field
async function authSuperAdminLogin() {
  const inp = document.getElementById('auth-super-code') || document.getElementById('auth-reg-login');
  if (!inp || !inp.value.trim()) {
    authMsg('login', 'Enter your admin code');
    return;
  }
  const code = inp.value.trim();
  authMsg('login', 'Verifying…', 'rgba(255,255,255,.5)');

  try {
    MSSRateLimit.check('superlogin', 5, 60000);
  } catch(e) {
    authMsg('login', e.message, 'rgba(255,150,100,.9)');
    return;
  }

  const ok = await isAdminBypass(code);
  if (ok) {
    const payload = _decodeJWTPayload();
    localStorage.setItem('chsa_user_name', payload?.name || 'Administrator');
    localStorage.setItem('chsa_is_admin_bypass', '1');
    authEnterApp();
  } else {
    authMsg('login', 'Invalid code', 'rgba(255,100,100,.9)');
  }
}


// ============================================================
// 4. SIGN OUT
// ============================================================
function authSignOut() {
  if (!confirm('Sign out?\n\nLocal survey records are kept safely on this device.')) return;
  if (window.HS && window.HS.Auth) window.HS.Auth.clearToken();
  authClearSession();
  const ov = document.getElementById('change-name-overlay');
  if (ov) ov.remove();
  location.reload();
}

function authClearAndRetry() {
  authClearSession();
  if (window.HS && window.HS.Auth) window.HS.Auth.clearToken();
  // Show QR entry panel instead of old login panel
  const cardWrap = document.getElementById('auth-card-wrap');
  const qrPanel  = document.getElementById('auth-panel-qr');
  if (cardWrap) cardWrap.style.display = 'none';
  if (qrPanel)  qrPanel.style.display  = 'block';
}


// ============================================================
// 5. ENTER APP — routes to correct dashboard from JWT role
// ============================================================
function authEnterApp() {
  const payload = _decodeJWTPayload();
  const role    = payload?.role || 'enumerator';

  const ws = document.getElementById('welcome-screen');
  const ls = document.getElementById('loader-screen');
  if (ws) ws.style.display = 'none';
  if (ls) ls.style.display = 'none';

  const name = payload?.name || getUserName() || 'there';

  // Show branded greeting, then route
  showReturningGreeting(name);
}

function routeByRole(role, userType) {
  if (role === 'super_admin') {
    localStorage.setItem('chsa_is_admin_bypass', '1');
    if (typeof initSuperAdminDashboard === 'function') initSuperAdminDashboard();
    else if (typeof openAdminDash === 'function') openAdminDash();
    return;
  }
  if (role === 'institution_admin') {
    localStorage.setItem('chsa_is_inst_admin', '1');
    if (typeof initInstAdminDashboard === 'function') initInstAdminDashboard();
    return;
  }
  // enumerator / student
  showEnumeratorHome();
}

function homeGoAdmin() {
  const payload = _decodeJWTPayload();
  const role = payload?.role || 'enumerator';

  if (role === 'super_admin' || localStorage.getItem('chsa_is_admin_bypass') === '1') {
    if (typeof _autoTimer !== 'undefined' && _autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
    if (typeof initSuperAdminDashboard === 'function') initSuperAdminDashboard();
    return;
  }
  if (role === 'institution_admin' || localStorage.getItem('chsa_is_inst_admin') === '1') {
    if (typeof _autoTimer !== 'undefined' && _autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
    if (typeof initInstAdminDashboard === 'function') initInstAdminDashboard();
    return;
  }
  showToast('Admin access restricted to authorised personnel', true);
}


// ============================================================
// 6. SCREEN ROUTER (unchanged)
// ============================================================
var SCREENS = {
  welcome: '#welcome-screen',
  loader:  '#loader-screen',
  home:    '#home-page',
  survey:  '#survey-wrap',
  admin:   '#admin-overlay',
  gate:    '#admin-gate',
  report:  '#report-overlay',
  lock:    '#admin-survey-lock',
};

function _showTransitionLoader(msg, cb) {
  var existing = document.getElementById('mss-page-loader');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'mss-page-loader';
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:16px;">'
    + '<div style="width:44px;height:44px;border:3px solid rgba(37,99,235,.25);border-top-color:#2563eb;border-radius:50%;animation:mssSpinLoad 0.8s linear infinite;"></div>'
    + '<div style="font-size:.82rem;font-weight:600;color:rgba(255,255,255,.7);letter-spacing:.5px;">' + (msg || 'Loading...') + '</div>'
    + '</div>';
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(4,8,15,.92);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .22s ease;backdrop-filter:blur(6px);';
  document.body.appendChild(el);
  if (!document.getElementById('mss-spin-style')) {
    var s = document.createElement('style');
    s.id = 'mss-spin-style';
    s.textContent = '@keyframes mssSpinLoad{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
  requestAnimationFrame(function() { el.style.opacity = '1'; });
  if (typeof cb === 'function') setTimeout(cb, 320);
  return el;
}

function _hideTransitionLoader() {
  var el = document.getElementById('mss-page-loader');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
}

function showScreen(name, animated) {
  if (animated) {
    _showTransitionLoader(null, function() { _doShowScreen(name); _hideTransitionLoader(); });
  } else {
    _doShowScreen(name);
  }
}

function _doShowScreen(name) {
  Object.keys(SCREENS).forEach(function(k) {
    var el = document.querySelector(SCREENS[k]);
    if (!el) return;
    el.style.display = 'none';
    el.style.opacity = '1';
  });
  var target = document.querySelector(SCREENS[name]);
  if (!target) return;
  var displayType = 'block';
  if (name === 'home')    displayType = 'flex';
  if (name === 'loader')  displayType = 'flex';
  if (name === 'welcome') displayType = 'flex';
  if (name === 'report')  displayType = 'flex';
  target.style.display = displayType;
  target.style.opacity = '0';
  requestAnimationFrame(function() {
    target.style.transition = 'opacity .3s ease';
    target.style.opacity = '1';
    setTimeout(function() { target.style.transition = ''; }, 320);
  });
}

function _currentScreen() {
  var found = null;
  Object.keys(SCREENS).forEach(function(k) {
    var el = document.querySelector(SCREENS[k]);
    if (el && el.style.display !== 'none' && el.style.display !== '') found = k;
  });
  return found;
}


// ============================================================
// 7. RETURNING USER GREETING (unchanged — UI only)
// ============================================================
function showReturningGreeting(name) {
  const ws  = document.getElementById('welcome-screen');
  const h   = new Date().getHours();
  const tod = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';

  if (!document.getElementById('ret-greet-style')) {
    const st = document.createElement('style');
    st.id = 'ret-greet-style';
    st.textContent = `
      @keyframes rgLogoIn{from{opacity:0;transform:scale(.5) translateY(-20px);}to{opacity:1;transform:scale(1) translateY(0);}}
      @keyframes rgRise{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
      @keyframes rgOrb{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(18px,-24px) scale(1.1);}}
      @keyframes rgOut{from{opacity:1;transform:translateY(0);}to{opacity:0;transform:translateY(-28px);}}
    `;
    document.head.appendChild(st);
  }

  const ov = document.createElement('div');
  ov.id = 'return-greet';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:linear-gradient(160deg,#04080f 0%,#080f1a 50%,#04080f 100%);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:0;overflow:hidden;opacity:0;transition:opacity .55s ease;';
  ov.innerHTML = `
    <div style="position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(37,99,235,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.03) 1px,transparent 1px);background-size:40px 40px;"></div>
    <div style="position:absolute;width:320px;height:320px;border-radius:50%;background:rgba(37,99,235,.2);filter:blur(70px);top:-80px;right:-80px;pointer-events:none;animation:rgOrb 9s ease-in-out infinite alternate;"></div>
    <div style="position:absolute;width:240px;height:240px;border-radius:50%;background:rgba(13,148,136,.15);filter:blur(60px);bottom:-60px;left:-60px;pointer-events:none;animation:rgOrb 12s ease-in-out infinite alternate;animation-delay:-4s;"></div>
    <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;padding:0 28px;width:100%;max-width:380px;margin:0 auto;">
      <div style="width:90px;height:90px;border-radius:26px;background:linear-gradient(145deg,rgba(37,99,235,.18),rgba(13,148,136,.15));border:1px solid rgba(255,255,255,.13);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(37,99,235,.2),0 10px 40px rgba(0,0,0,.45);margin-bottom:20px;opacity:0;animation:rgLogoIn .65s cubic-bezier(.34,1.56,.64,1) .15s both;"><img src="./medisync-logo.png" alt="MSS" style="width:60px;height:60px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(37,99,235,.4));"></div>
      <div style="color:rgba(96,165,250,.9);font-size:.65rem;font-weight:800;letter-spacing:3.5px;text-transform:uppercase;text-align:center;margin-bottom:16px;opacity:0;animation:rgRise .5s ease .5s both;">Medical Survey System</div>
      <div style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:28px 24px 24px;text-align:center;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 8px 40px rgba(0,0,0,.28);">
        <div style="color:rgba(255,255,255,.7);font-size:1.5rem;font-weight:700;margin-bottom:4px;opacity:0;animation:rgRise .55s ease .7s both;">${tod}</div>
        <div style="color:#fff;font-size:2.8rem;font-weight:800;letter-spacing:-.04em;line-height:1.05;text-shadow:0 3px 24px rgba(0,0,0,.7);opacity:0;animation:rgRise .6s ease .88s both;">${name}!</div>
        <div style="width:44px;height:2px;margin:14px auto;border-radius:99px;background:linear-gradient(90deg,transparent,rgba(37,99,235,.8),rgba(13,148,136,.8),transparent);opacity:0;animation:rgRise .45s ease 1.05s both;"></div>
        <div style="color:rgba(255,255,255,.5);font-size:.82rem;line-height:1.55;opacity:0;animation:rgRise .5s ease 1.2s both;">Welcome back<br><span style="background:linear-gradient(90deg,#2563eb,#0d9488);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:.72rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Ministry of Health · Kenya</span></div>
      </div>
    </div>
    <div style="position:relative;z-index:2;width:100%;padding:10px 20px calc(10px + env(safe-area-inset-bottom));text-align:center;background:rgba(0,0,0,.3);border-top:1px solid rgba(255,255,255,.05);opacity:0;animation:rgRise .45s ease 1.5s both;">
      <div style="color:rgba(255,255,255,.2);font-size:.62rem;letter-spacing:.3px;">Medical Survey System <strong style="color:rgba(255,255,255,.4);">v7.0</strong> &nbsp;·&nbsp; Ministry of Health Kenya</div>
    </div>
  `;

  document.body.appendChild(ov);
  requestAnimationFrame(() => requestAnimationFrame(() => { ov.style.opacity = '1'; }));

  setTimeout(() => {
    if (ws) ws.style.display = 'none';
    ov.style.animation = 'rgOut .55s ease forwards';
    setTimeout(() => { ov.remove(); }, 560);
    // Route by JWT role — no localStorage flags as source of truth
    const payload = _decodeJWTPayload();
    const role = payload?.role || 'enumerator';
    routeByRole(role, payload?.user_type);
  }, 3500);
}


// ============================================================
// 8. ENUMERATOR HOME (unchanged — UI only)
// ============================================================
function showEnumeratorHome() {
  const ws = document.getElementById('welcome-screen');
  const ls = document.getElementById('loader-screen');
  if (ws) ws.style.display = 'none';
  if (ls) ls.style.display = 'none';
  showScreen('home');
  enterApp();
  setTimeout(checkAppVersion, 2000);
}

function enterApp() {
  const ws = document.getElementById('welcome-screen');
  if (ws) { ws.classList.add('hiding'); setTimeout(() => { ws.style.display = 'none'; }, 400); }
}

function showSplash(cb)            { if (cb) cb(); }
function showWelcomeInterstitial() { loaderBegin(); }
function wciEnterSurvey()          { loaderBegin(); }
function showHeartScreen()         { loaderBegin(); }
function hsEnterSurvey()           { loaderBegin(); }


// ============================================================
// 9. USER PROFILE — name management (unchanged — UI only)
// ============================================================
function toTitleCase(str) {
  return (str || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function fillInterviewerFields(name) {
  const hn   = document.getElementById('h_interviewer_name');
  const card = document.getElementById('consent_interviewer_card');
  const disp = document.getElementById('consent_name_display');
  if (hn)   hn.value = name;
  if (card) card.textContent = name;
  if (disp) disp.textContent = name;
}

function applyWelcome() {
  const h    = new Date().getHours();
  const g    = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  const name = getUserName();
  const greetEl = document.getElementById('wc-greeting');
  const titleEl = document.getElementById('wc-name-title');
  const subEl   = document.getElementById('wc-subtitle');
  const instName = getSessionInstitutionName() || 'Community Health Survey';
  if (name) {
    if (greetEl) greetEl.textContent = g + ', ' + name;
    if (titleEl) titleEl.innerHTML   = 'Welcome back!';
    if (subEl)   subEl.innerHTML     = instName + '<br><span style="opacity:.7;font-size:0.75rem">Community Health Situation Analysis</span>';
    setTimeout(() => fillInterviewerFields(name), 400);
  } else {
    if (greetEl) greetEl.textContent = g;
    if (titleEl) titleEl.innerHTML   = 'Hello!';
    if (subEl)   subEl.textContent   = instName;
  }
}

function showChangeNameOverlay() {
  const old = document.getElementById('change-name-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'change-name-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;';
  const payload = _decodeJWTPayload();
  const isQRSession = !!(payload && payload.role);

  overlay.innerHTML = isQRSession ? `
    <div style="background:#fff;border-radius:20px;padding:28px 22px;max-width:340px;width:100%;box-shadow:0 12px 50px rgba(0,0,0,.25);text-align:center;">
      <div style="font-size:36px;margin-bottom:10px">&#128100;</div>
      <div style="font-weight:800;font-size:1rem;color:var(--text);margin-bottom:6px">Your Account</div>
      <div style="font-size:0.8rem;color:var(--muted);line-height:1.5;margin-bottom:20px">
        Signed in as <strong>${payload.name || 'Unknown'}</strong>.<br>
        ${payload.admission_no ? 'Admission: ' + payload.admission_no + '<br>' : ''}
        To switch accounts, sign out and scan your QR code again.
      </div>
      <button onclick="authSignOut()" style="width:100%;padding:13px;background:linear-gradient(135deg,#dc2626,#c0392b);color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;margin-bottom:10px;">
        &#128682; Sign Out
      </button>
      <button onclick="document.getElementById('change-name-overlay').remove()" style="width:100%;padding:11px;background:var(--cream,#f8f9fa);color:var(--muted,#666);border:1.5px solid var(--border,#ddd);border-radius:12px;font-family:inherit;font-size:0.88rem;font-weight:600;cursor:pointer;">
        Cancel
      </button>
    </div>
  ` : `
    <div style="background:#fff;border-radius:20px;padding:28px 22px;max-width:340px;width:100%;box-shadow:0 12px 50px rgba(0,0,0,.25);">
      <div style="font-size:36px;text-align:center;margin-bottom:10px">&#9999;</div>
      <div style="font-weight:800;font-size:1rem;color:var(--text);margin-bottom:4px;text-align:center">Change Your Name</div>
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:18px;text-align:center">Updates your interviewer name on all new records.</div>
      <input id="change-name-input" type="text" value="${getUserName()}"
        style="width:100%;padding:13px 15px;border:1.5px solid var(--border,#ddd);border-radius:12px;font-family:inherit;font-size:0.95rem;color:var(--text,#333);outline:none;margin-bottom:14px;"
        onkeydown="if(event.key==='Enter')saveChangedName()">
      <button onclick="saveChangedName()" style="width:100%;padding:13px;background:linear-gradient(135deg,#2563eb,#0d9488);color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:0.92rem;font-weight:700;cursor:pointer;margin-bottom:10px;">
        &#10003; Save Name
      </button>
      <button onclick="document.getElementById('change-name-overlay').remove()" style="width:100%;padding:11px;background:var(--cream,#f8f9fa);color:var(--muted,#666);border:1.5px solid var(--border,#ddd);border-radius:12px;font-family:inherit;font-size:0.88rem;font-weight:600;cursor:pointer;">
        Cancel
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { const inp = document.getElementById('change-name-input'); if (inp) { inp.focus(); inp.select(); } }, 80);
}

function forgetUser() { showChangeNameOverlay(); }

function saveChangedName() {
  const inp = document.getElementById('change-name-input');
  if (!inp) return;
  const raw = inp.value.trim();
  if (!raw) { inp.style.borderColor = 'var(--red,#dc2626)'; return; }
  const niceName = raw.charAt(0).toUpperCase() + raw.slice(1);
  localStorage.setItem('chsa_user_name', niceName);
  fillInterviewerFields(niceName);
  if (typeof recId !== 'undefined' && typeof recs !== 'undefined' && recs[recId]) {
    recs[recId].interviewer_name = niceName;
    if (typeof ss === 'function') ss();
  }
  document.getElementById('change-name-overlay').remove();
  showToast('Name updated to ' + niceName);
}

function saveUserName() {
  const inp = document.getElementById('wc-name-input');
  if (!inp || !inp.value.trim()) {
    if (inp) inp.style.borderColor = 'rgba(255,100,100,.7)';
    return;
  }
  const niceName = toTitleCase(inp.value.trim());
  localStorage.setItem('chsa_user_name', niceName);
  fillInterviewerFields(niceName);
  showToast('Welcome, ' + niceName);
  const setup = document.getElementById('wc-name-setup');
  if (setup) setup.style.display = 'none';
  applyWelcome();
  const btn = document.getElementById('wc-enter');
  if (btn) btn.style.display = 'flex';
  setTimeout(enterApp, 1100);
}


// ============================================================
// 10. AUTH MESSAGE HELPERS (kept for compatibility)
// ============================================================
function authMsg(panel, msg, color) {
  const el = document.getElementById('auth-' + panel + '-msg');
  if (el) { el.textContent = msg; el.style.color = color || 'rgba(255,200,100,.9)'; }
}

function authShowPanel(name) {
  const cardWrap = document.getElementById('auth-card-wrap');
  const pending  = document.getElementById('auth-panel-pending');
  const rejected = document.getElementById('auth-panel-rejected');
  const qrPanel  = document.getElementById('auth-panel-qr');
  [pending, rejected, qrPanel].forEach(el => { if (el) el.style.display = 'none'; });
  if (name === 'qr') {
    if (cardWrap) cardWrap.style.display = 'none';
    if (qrPanel)  qrPanel.style.display  = 'block';
  } else if (name === 'pending' || name === 'rejected') {
    if (cardWrap) cardWrap.style.display = 'none';
    const panel = name === 'pending' ? pending : rejected;
    if (panel) panel.style.display = '';
  } else {
    // Default: show QR panel (no more login/register tabs)
    if (cardWrap) cardWrap.style.display = 'none';
    if (qrPanel)  qrPanel.style.display  = 'block';
  }
}

// No-institution helpers (kept as shims — edge cases)
function mssNoInstShowPicker() {
  const btns = document.getElementById('mss-ni-btns');
  const pick = document.getElementById('mss-ni-pick');
  if (btns) btns.style.display = 'none';
  if (pick) pick.style.display = 'block';
}

async function mssNoInstSave() {
  const sel = document.getElementById('mss-ni-select');
  if (!sel || !sel.value) { showToast('Please select an institution', true); return; }
  const modal = document.getElementById('mss-no-inst-modal');
  if (modal) modal.remove();
  showToast('Institution saved — you can now start a survey');
  if (typeof _hpStats === 'function') _hpStats();
}


// ============================================================
// 11. APP INIT — runs on page load
//     Checks for existing JWT and routes accordingly.
//     QR scan entry is handled by session-guard.js
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  const payload = _decodeJWTPayload();

  if (payload) {
    // Already have a valid JWT — check if expired
    const exp = payload.exp || 0;
    if (Date.now() / 1000 > exp) {
      // JWT expired — clear and show QR panel
      authClearSession();
      authShowPanel('qr');
      return;
    }
    // Valid JWT — fill name fields, init session guard
    const name = payload.name || '';
    if (name) {
      localStorage.setItem('chsa_user_name', name);
      fillInterviewerFields(name);
    }
    // session-guard.js init() will check session status
    // authEnterApp() is called after session-guard confirms active session
    if (window.MSS && window.MSS.SessionGuard) {
      window.MSS.SessionGuard.init().then(sessionOk => {
        if (sessionOk !== false) {
          authEnterApp();
        }
        // sessionOk === false means locked (no active session)
        // SessionGuard already showed lock screen
      });
    } else {
      // session-guard not loaded — proceed anyway (fallback)
      authEnterApp();
    }
  } else {
    // No JWT — show QR entry panel
    authShowPanel('qr');
  }

  // Restore interviewer name
  const savedName = getUserName();
  if (savedName) fillInterviewerFields(savedName);

  // Apply welcome greeting to any visible elements
  setTimeout(applyWelcome, 200);
});


// ============================================================
// 12. VERSION CHECK (unchanged)
// ============================================================
async function checkAppVersion() {
  try {
    const r = await fetch('/version.json?t=' + Date.now());
    if (!r.ok) return;
    const data = await r.json();
    const current = data.version || '';
    const stored  = localStorage.getItem('mss_app_version') || '';
    if (current && stored && current !== stored) {
      localStorage.setItem('mss_app_version', current);
      const bar = document.getElementById('update-bar');
      if (bar) bar.style.display = 'flex';
    } else if (current) {
      localStorage.setItem('mss_app_version', current);
    }
  } catch {}
}


// ============================================================
// 13. MSS ERROR NOTIFICATION SYSTEM (unchanged)
// ============================================================
(function mssErrors() {
  'use strict';

  function classify(err, context) {
    const msg    = (err?.message || err?.data?.error || String(err) || '').toLowerCase();
    const status = err?.status || err?.code || 0;
    if (msg.includes('networkerror') || msg.includes('failed to fetch') || msg.includes('network request failed'))
      return { title: 'No internet connection', detail: 'Check your network and try again.', action: 'Retry when online — your data is saved locally.', type: 'network' };
    if (msg.includes('session_closed') || msg.includes('session has ended'))
      return { title: 'Session closed', detail: 'The survey session has ended.', action: 'Contact your institution admin to open a new session.', type: 'auth' };
    if (msg.includes('device mismatch'))
      return { title: 'Device not recognised', detail: 'This token is bound to another device.', action: 'Scan your QR code again on this device.', type: 'auth' };
    if (msg.includes('jwt') || msg.includes('invalid token') || msg.includes('unauthorized') || status === 401)
      return { title: 'Session expired', detail: 'Your login session has ended.', action: 'Scan your QR code or enter your access token again.', type: 'auth' };
    if (msg.includes('forbidden') || status === 403)
      return { title: 'Access denied', detail: 'You do not have permission for this action.', action: 'Contact your coordinator or scan your QR code again.', type: 'auth' };
    if (msg.includes('not found') || status === 404)
      return { title: 'Record not found', detail: context ? `Could not find: ${context}` : 'The requested item does not exist.', action: 'Refresh the page or check that the record has not been deleted.', type: 'notfound' };
    if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('unique') || status === 409)
      return { title: 'Duplicate entry', detail: 'This record already exists in the system.', action: 'This survey has already been submitted.', type: 'duplicate' };
    if (msg.includes('timeout') || msg.includes('aborted'))
      return { title: 'Request timed out', detail: 'The server took too long to respond.', action: 'Check your connection and try again.', type: 'network' };
    if (msg.includes('storage') || msg.includes('quota'))
      return { title: 'Storage full', detail: 'Device storage is full — cannot save data.', action: 'Free up device storage and retry.', type: 'storage' };
    if (status >= 500)
      return { title: 'Server error', detail: `Server responded with error ${status}.`, action: 'Wait a moment and try again.', type: 'server' };
    return { title: 'Something went wrong', detail: err?.message || 'An unexpected error occurred.', action: 'Try again. If the problem continues, reload the page.', type: 'unknown' };
  }

  function showErrorBanner(title, detail, action, type) {
    const old = document.getElementById('mss-err-banner');
    if (old) old.remove();
    const colours = { network: '#d97706', auth: '#dc2626', server: '#dc2626', duplicate: '#2563eb', notfound: '#8b5cf6', storage: '#dc2626', unknown: '#dc2626' };
    const color   = colours[type] || colours.unknown;
    const banner  = document.createElement('div');
    banner.id = 'mss-err-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = [
      'position:fixed', 'top:60px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99998', 'width:calc(100% - 32px)', 'max-width:480px',
      'background:var(--bg-card,#0d1826)', `border:1.5px solid ${color}`,
      'border-radius:14px', 'padding:14px 16px',
      'box-shadow:0 8px 32px rgba(0,0,0,.5)',
      'font-family:var(--font-body,Sora,sans-serif)',
      'animation:mssErrSlideDown .28s cubic-bezier(.32,0,.15,1) both',
    ].join(';');
    banner.innerHTML = `
      <style>
        @keyframes mssErrSlideDown{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        #mss-err-banner .mss-err-hdr{display:flex;align-items:flex-start;gap:10px;margin-bottom:6px}
        #mss-err-banner .mss-err-dot{width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;margin-top:4px}
        #mss-err-banner .mss-err-title{font-size:.82rem;font-weight:700;color:var(--text-1,#e8f0fe);flex:1}
        #mss-err-banner .mss-err-close{background:none;border:none;color:var(--text-3,rgba(255,255,255,.3));cursor:pointer;font-size:.9rem;flex-shrink:0;padding:0;line-height:1}
        #mss-err-banner .mss-err-detail{font-size:.72rem;color:var(--text-2,rgba(255,255,255,.5));margin-bottom:6px;line-height:1.5}
        #mss-err-banner .mss-err-action{font-size:.7rem;color:${color};font-weight:600;line-height:1.5;padding:6px 10px;background:rgba(0,0,0,.2);border-radius:8px;border-left:2px solid ${color}}
      </style>
      <div class="mss-err-hdr">
        <div class="mss-err-dot"></div>
        <div class="mss-err-title">${title}</div>
        <button class="mss-err-close" aria-label="Dismiss" onclick="this.closest('#mss-err-banner').remove()">✕</button>
      </div>
      <div class="mss-err-detail">${detail}</div>
      <div class="mss-err-action">${action}</div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
  }

  window.MSSError = {
    show(err, context) {
      const info = classify(err, context);
      showErrorBanner(info.title, info.detail, info.action, info.type);
      console.error('[MSS Error]', context || '', err);
    },
    network(context) {
      showErrorBanner('No internet connection', context ? `Failed: ${context}` : 'Cannot reach the server.', 'Check your network. Data is saved locally and will sync when online.', 'network');
    },
    auth() {
      showErrorBanner('Session expired', 'Your login session has ended.', 'Scan your QR code or enter your access token again.', 'auth');
    },
    storage(context) {
      showErrorBanner('Could not save data', context || 'Failed to write to local storage.', 'Free up device storage, then try again.', 'storage');
    }
  };

  window.addEventListener('unhandledrejection', function(event) {
    const err = event.reason;
    if (!err) return;
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('service worker') || msg.includes('abortcontroller') || msg.includes('abort')) return;
    window.MSSError.show(err, 'Unhandled error');
    event.preventDefault();
  });

  window.addEventListener('error', function(event) {
    const el = event.target;
    if (el && (el.tagName === 'IMG' || el.tagName === 'LINK')) {
      console.warn('[MSS] Resource failed to load:', el.src || el.href || 'unknown');
    }
  }, true);

  console.log('[MSS] Error notification system v7.0 active');
})();
