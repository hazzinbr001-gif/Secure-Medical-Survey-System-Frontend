// 
// INPUT VALIDATION & SANITIZATION LAYER
// 
const MSSSanitize = {
  // Strip HTML/script injection attempts
  text(s) {
    if (!s) return '';
    return String(s).trim()
      .replace(/[<>]/g, '')           // no HTML tags
      .replace(/javascript:/gi, '')   // no JS URLs
      .replace(/on\w+=/gi, '')        // no event handlers
      .slice(0, 500);                 // max length
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
    return String(s).slice(0, 128); // don't strip password chars, just limit length
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
    if (!s) return true; // email is optional
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

// Rate limiting for auth actions
const MSSRateLimit = {
  _attempts: {},
  check(key, maxAttempts, windowMs) {
    const now = Date.now();
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

// 
// survey-auth.js — v5.1 COMPLETE MIGRATION
// All auth now routes through the secure Vercel backend via api-client.js.
// NO direct Supabase calls remain in this file.
// Requires: api-client.js (window.HS) loaded before this file.
// 

//  ADMISSION NUMBER VALIDATION 
// Accepts ANY non-empty admission number — institutions have different formats.
// Examples: B11/GLUK/S53K/2022  |  ADM/2023/001  |  CS/001/2021  |  12345  |  SCT/221/0005/2022
const ADMISSION_REGEX = /^[A-Z0-9][A-Z0-9\/\-\.]{2,}$/;

function toTitleCase(str){
  return (str||'').trim().toLowerCase().replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}

function isValidAdmission(reg){
  if(!reg) return false;
  const clean = reg.trim().toUpperCase().replace(/\s+/g,'');
  return ADMISSION_REGEX.test(clean);
}

//  Admin bypass — uses dedicated superlogin endpoint 
// Super admin enters only a secret code. No email needed.
// Backend checks it against super_admin_auth table (bcrypt).
async function isAdminBypass(code){
  // Try new dedicated superlogin endpoint first
  try {
    const data = await window.HS.HSAuth.superLogin(code);
    if (data && data.user && data.user.role === 'super_admin') return true;
  } catch(e) {
    // superlogin endpoint not deployed yet — fall through to legacy check
  }
  // Legacy fallback: try login(code, code) for old super_admin accounts in chsa_students
  try {
    const data = await window.HS.HSAuth.login(code, code);
    return !!(data && data.user && data.user.role === 'super_admin');
  } catch(e) {
    return false;
  }
}


// 
//  SCREEN ROUTER
// 
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

/* Patch _doShowScreen to handle welcome/loader display types correctly */

/*  Loading overlay for page transitions  */
function _showTransitionLoader(msg, cb){
  var existing = document.getElementById('mss-page-loader');
  if(existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'mss-page-loader';
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:16px;">'
    +'<div style="width:44px;height:44px;border:3px solid rgba(37,99,235,.25);border-top-color:#2563eb;border-radius:50%;animation:mssSpinLoad 0.8s linear infinite;"></div>'
    +'<div style="font-size:.82rem;font-weight:600;color:rgba(255,255,255,.7);letter-spacing:.5px;">'+(msg||'Loading...')+'</div>'
    +'</div>';
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(4,8,15,.92);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .22s ease;backdrop-filter:blur(6px);';
  document.body.appendChild(el);
  if(!document.getElementById('mss-spin-style')){
    var s = document.createElement('style');
    s.id = 'mss-spin-style';
    s.textContent = '@keyframes mssSpinLoad{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
  requestAnimationFrame(function(){ el.style.opacity='1'; });
  var delay = (typeof cb === 'function') ? 320 : 0;
  if(typeof cb === 'function') setTimeout(cb, delay);
  return el;
}

function _hideTransitionLoader(){
  var el = document.getElementById('mss-page-loader');
  if(!el) return;
  el.style.opacity = '0';
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 280);
}

function showScreen(name, animated){
  if(animated){
    _showTransitionLoader(null, function(){
      _doShowScreen(name);
      _hideTransitionLoader();
    });
  } else {
    _doShowScreen(name);
  }
}

function _doShowScreen(name){
  Object.keys(SCREENS).forEach(function(k){
    var el = document.querySelector(SCREENS[k]);
    if(!el) return;
    el.style.display = 'none';
    el.style.opacity = '1';
  });
  var target = document.querySelector(SCREENS[name]);
  if(!target) return;
  var displayType = 'block';
  if(name==='home')    displayType='flex';
  if(name==='loader')  displayType='flex';
  if(name==='welcome') displayType='flex';
  if(name==='report')  displayType='flex';
  target.style.display = displayType;
  // Fade in
  target.style.opacity = '0';
  requestAnimationFrame(function(){
    target.style.transition = 'opacity .3s ease';
    target.style.opacity = '1';
    setTimeout(function(){ target.style.transition = ''; }, 320);
  });
}

function _currentScreen(){
  var found = null;
  Object.keys(SCREENS).forEach(function(k){
    var el = document.querySelector(SCREENS[k]);
    if(el && el.style.display!=='none' && el.style.display!=='') found=k;
  });
  return found;
}


/* Medical Survey System (MSS) — Auth & Home Page © 2026 Ministry of Health Kenya */

// 
//  USER PROFILE
// 
function getUserName(){ return localStorage.getItem('chsa_user_name')||''; }
function forgetUser(){ showChangeNameOverlay(); }

function showChangeNameOverlay(){
  const old = document.getElementById('change-name-overlay');
  if(old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'change-name-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;';
  const currentName = getUserName() || '';
  const session = authGetSession();
  const isAuthSession = !!(session && session.reg_number);
  overlay.innerHTML = isAuthSession ? `
    <div style="background:#fff;border-radius:20px;padding:28px 22px;max-width:340px;width:100%;box-shadow:0 12px 50px rgba(0,0,0,.25);text-align:center;">
      <div style="font-size:36px;margin-bottom:10px">&#128100;</div>
      <div style="font-weight:800;font-size:1rem;color:var(--text);margin-bottom:6px">Change Interviewer</div>
      <div style="font-size:0.8rem;color:var(--muted);line-height:1.5;margin-bottom:20px">
        You are signed in as <strong>${session.full_name||currentName}</strong>.<br>
        To switch accounts, sign out and sign in with a different ID.
      </div>
      <button onclick="authSignOut()" style="width:100%;padding:13px;background:linear-gradient(135deg,var(--red),#c0392b);color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;margin-bottom:10px;">
        &#128682; Sign Out &amp; Switch Account
      </button>
      <button onclick="document.getElementById('change-name-overlay').remove()" style="width:100%;padding:11px;background:var(--cream);color:var(--muted);border:1.5px solid var(--border);border-radius:12px;font-family:inherit;font-size:0.88rem;font-weight:600;cursor:pointer;">
        Cancel
      </button>
    </div>
  ` : `
    <div style="background:#fff;border-radius:20px;padding:28px 22px;max-width:340px;width:100%;box-shadow:0 12px 50px rgba(0,0,0,.25);">
      <div style="font-size:36px;text-align:center;margin-bottom:10px">&#9999;</div>
      <div style="font-weight:800;font-size:1rem;color:var(--text);margin-bottom:4px;text-align:center">Change Your Name</div>
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:18px;text-align:center">Updates your interviewer name on all new records.</div>
      <input id="change-name-input" type="text" value="${currentName}"
        style="width:100%;padding:13px 15px;border:1.5px solid var(--border);border-radius:12px;font-family:inherit;font-size:0.95rem;color:var(--text);outline:none;margin-bottom:14px;"
        onfocus="this.style.borderColor='var(--green-light)'"
        onblur="this.style.borderColor='var(--border)'"
        onkeydown="if(event.key==='Enter')saveChangedName()">
      <button onclick="saveChangedName()" style="width:100%;padding:13px;background:linear-gradient(135deg,var(--green),#1a4060);color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:0.92rem;font-weight:700;cursor:pointer;margin-bottom:10px;">
        &#10003; Save Name
      </button>
      <button onclick="document.getElementById('change-name-overlay').remove()" style="width:100%;padding:11px;background:var(--cream);color:var(--muted);border:1.5px solid var(--border);border-radius:12px;font-family:inherit;font-size:0.88rem;font-weight:600;cursor:pointer;">
        Cancel
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(()=>{ const inp=document.getElementById('change-name-input'); if(inp){inp.focus();inp.select();} }, 80);
}

function saveChangedName(){
  const inp = document.getElementById('change-name-input');
  if(!inp) return;
  const raw = inp.value.trim();
  if(!raw){ inp.style.borderColor='var(--red)'; return; }
  const niceName = raw.charAt(0).toUpperCase() + raw.slice(1);
  localStorage.setItem('chsa_user_name', niceName);
  fillInterviewerFields(niceName);
  if(recId && recs[recId]){ recs[recId].interviewer_name = niceName; ss(); }
  document.getElementById('change-name-overlay').remove();
  showToast('Name updated to ' + niceName);
}

function authSignOut(){
  if(!confirm('Sign out and return to the login screen?\n\nLocal records are kept safely.')) return;
  if(window.HS && window.HS.Auth) window.HS.Auth.clearToken();
  authClearSession();
  localStorage.removeItem('chsa_user_name');
  localStorage.removeItem('chsa_is_admin_bypass');
  localStorage.removeItem('chsa_is_inst_admin');
  const ov = document.getElementById('change-name-overlay');
  if(ov) ov.remove();
  location.reload();
}

function saveUserName(){
  const inp = document.getElementById('wc-name-input');
  if(!inp || !inp.value.trim()){
    inp && (inp.style.borderColor='rgba(255,100,100,.7)');
    return;
  }
  const name = inp.value.trim();
  const niceName = name.charAt(0).toUpperCase() + name.slice(1);
  localStorage.setItem('chsa_user_name', niceName);
  fillInterviewerFields(niceName);
  showToast('Welcome, ' + niceName);
  const setup = document.getElementById('wc-name-setup');
  if(setup) setup.style.display='none';
  applyWelcome();
  const btn = document.getElementById('wc-enter');
  if(btn) btn.style.display='flex';
  setTimeout(enterApp, 1100);
}

function fillInterviewerFields(name){
  const hn = document.getElementById('h_interviewer_name');
  if(hn) hn.value = name;
  const card = document.getElementById('consent_interviewer_card');
  if(card) card.textContent = name;
  const disp = document.getElementById('consent_name_display');
  if(disp) disp.textContent = name;
}

function applyWelcome(){
  const h = new Date().getHours();
  let g = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  const name = getUserName();
  const greetEl = document.getElementById('wc-greeting');
  const titleEl = document.getElementById('wc-name-title');
  const subEl   = document.getElementById('wc-subtitle');
  const instName = (typeof getSessionInstitutionName === 'function') ? getSessionInstitutionName() : 'Community Health Survey';
  if(name){
    if(greetEl) greetEl.textContent = g + ', ' + name;
    if(titleEl) titleEl.innerHTML = 'Welcome back!';
    if(subEl)   subEl.innerHTML = instName + '<br><span style="opacity:.7;font-size:0.75rem">Community Health Situation Analysis</span>';
    setTimeout(()=> fillInterviewerFields(name), 400);
  } else {
    if(greetEl) greetEl.textContent = g;
    if(titleEl) titleEl.innerHTML = 'Community Health<br>Survey';
    if(subEl)   subEl.innerHTML = instName + '<br><span style="opacity:.7;font-size:0.75rem">Situation Analysis Tool</span>';
  }
}

// 
//  AUTHENTICATION SYSTEM
// 
const AUTH_KEY       = 'chsa_auth';
const TEACHER_EMAIL  = 'hazzinbr001@gmail.com';
const EMAILJS_SERVICE  = 'service_748pr28';
const EMAILJS_TEMPLATE = 'template_vebhc8t';
const EMAILJS_PUBLIC   = 'uuUQcmG7gRRyZTqty';
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

function authGetSession(){ try{ return JSON.parse(localStorage.getItem(AUTH_KEY)||'null'); }catch{return null;} }
function authSaveSession(s){
  // Always attach the current JWT token into the session object so that
  // api-client.js Auth.getToken() can find it via the chsa_session fallback.
  const token = localStorage.getItem('hs_jwt_token') || sessionStorage.getItem('hs_jwt_token') || '';
  const withToken = token ? { ...s, token } : s;
  // Write to both keys so every consumer (api-client, admin-institution, etc.) finds it.
  localStorage.setItem(AUTH_KEY, JSON.stringify(withToken));          // chsa_auth
  localStorage.setItem('chsa_session', JSON.stringify(withToken));    // chsa_session (legacy)
}
function authClearSession(){
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('chsa_session');
}
function getSessionInstitutionId(){
  // 1. Primary: read from session object
  const sess = authGetSession();
  if (sess?.institution_id) return sess.institution_id;

  // 2. Fallback: decode from JWT token (always has institution_id if user belongs to one)
  try {
    const token = localStorage.getItem('hs_jwt_token') || sessionStorage.getItem('hs_jwt_token')
      || sess?.token || '';
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.institution_id) {
        // Patch session so future calls don't need the fallback
        if (sess) { sess.institution_id = payload.institution_id; authSaveSession(sess); }
        return payload.institution_id;
      }
    }
  } catch(e) {}

  console.error('[MSS] institution_id not found in session or JWT — upload will fail. User must log out and log back in.');
  return null;
}
function getSessionInstitutionName(){ return authGetSession()?.institution_name || null; }
function getUserName(){ return localStorage.getItem('chsa_user_name') || authGetSession()?.full_name || ''; }

// 
//  ENTRANCE SEQUENCE
//  Auth card shows immediately over the animation — no tap needed
// 
let _lampOn    = true;  // always "on" — no tap-to-reveal
let _autoTimer = null;

document.addEventListener('DOMContentLoaded', ()=>{
  // Show auth card immediately — animation keeps running behind it
  const auth = document.getElementById('lamp-auth');
  if(auth){
    auth.classList.add('open');
    setTimeout(()=>{ const inp=document.getElementById('auth-reg-login'); if(inp) inp.focus(); }, 400);
    setTimeout(_restoreRegDraft, 300);
  }
  // pull-btn kept in HTML for skip-ahead on tap (already logged-in resume)
  const btn = document.getElementById('pull-btn');
  if(btn){
    btn.addEventListener('click', ()=>{
      const a = document.getElementById('lamp-auth');
      if(a && !a.classList.contains('open')) a.classList.add('open');
    });
  }
});

// lampPull kept as no-op so any remaining callers don't crash
function lampPull(){
  const auth = document.getElementById('lamp-auth');
  if(auth && !auth.classList.contains('open')){
    auth.classList.add('open');
    setTimeout(()=>{ const inp=document.getElementById('auth-reg-login'); if(inp) inp.focus(); }, 400);
    setTimeout(_restoreRegDraft, 300);
  }
}

//  PHASE 2: AUTH INIT 
async function authInit(){
  //  Super admin bypass — validate JWT still holds super_admin role 
  if(localStorage.getItem('chsa_is_admin_bypass')==='1'){
    const payload = window.HS && window.HS.Auth ? window.HS.Auth.getPayload() : null;
    const now = Math.floor(Date.now()/1000);
    if(payload && payload.role === 'super_admin' && (!payload.exp || payload.exp > now)){
      var ls = document.getElementById('loader-screen');
      var ws0 = document.getElementById('welcome-screen');
      if(ws0) ws0.style.display='none';
      if(ls) ls.style.display='none';
      var topbar=document.querySelector('.topbar'), botnav=document.querySelector('.bot-nav'), secs=document.getElementById('secsWrap');
      if(topbar) topbar.style.visibility='hidden';
      if(botnav) botnav.style.visibility='hidden';
      if(secs)   secs.style.visibility='hidden';
      if(typeof initSuperAdminDashboard==='function') initSuperAdminDashboard();
      else setTimeout(function(){ initSuperAdminDashboard(); }, 400);
      return;
    } else {
      localStorage.removeItem('chsa_is_admin_bypass');
      if(window.HS && window.HS.Auth) window.HS.Auth.clearToken();
    }
  }

  //  Institution admin session 
  if(localStorage.getItem('chsa_is_inst_admin')==='1'){
    const payload = window.HS && window.HS.Auth ? window.HS.Auth.getPayload() : null;
    const now = Math.floor(Date.now()/1000);
    if(payload && ['institution_admin','super_admin'].includes(payload.role) && (!payload.exp || payload.exp > now)){
      var ls2=document.getElementById('loader-screen'), ws1=document.getElementById('welcome-screen');
      if(ws1) ws1.style.display='none';
      if(ls2) ls2.style.display='none';
      var tb=document.querySelector('.topbar'),bn=document.querySelector('.bot-nav'),sw=document.getElementById('secsWrap');
      if(tb) tb.style.visibility='hidden'; if(bn) bn.style.visibility='hidden'; if(sw) sw.style.visibility='hidden';
      if(typeof initInstAdminDashboard==='function') initInstAdminDashboard();
      else setTimeout(function(){ initInstAdminDashboard(); }, 400);
      return;
    } else {
      localStorage.removeItem('chsa_is_inst_admin');
      if(window.HS && window.HS.Auth) window.HS.Auth.clearToken();
    }
  }

  const session = authGetSession();

  if(session && session.full_name){
    const stored = localStorage.getItem('chsa_user_name')||'';
    const full   = session.full_name.trim();
    if(full.includes(' ') && !stored.includes(' ')) localStorage.setItem('chsa_user_name', full);
    if(!stored) localStorage.setItem('chsa_user_name', full);
  }

  if(session && session.full_name){
    // Validate JWT token is not expired
    if(window.HS && window.HS.Auth.isLoggedIn()){
      const payload = window.HS.Auth.getPayload();
      const now = Math.floor(Date.now()/1000);
      if(!payload || (payload.exp && payload.exp < now)){
        authClearSession();
        window.HS.Auth.clearToken();
        return; // expired — fall through to lamp login
      }
    }

    const hasReg = session.reg_number && session.reg_number !== '—' && session.reg_number.trim() !== '';
    if(!hasReg){
      const ws = document.getElementById('welcome-screen');
      if(ws) ws.style.display='none';
      localStorage.setItem('chsa_user_name', session.full_name);
      fillInterviewerFields(session.full_name);
      showUpdateAdmissionOverlay(function(){
        showReturningGreeting(session.full_name.split(' ')[0]);
      });
      return;
    }
    const first = session.full_name.split(' ')[0];
    localStorage.setItem('chsa_user_name', session.full_name);
    fillInterviewerFields(session.full_name);
    showReturningGreeting(first);
  }
}


function authShowAuthCard(){
  const auth = document.getElementById('lamp-auth');
  if(auth && !auth.classList.contains('open')) auth.classList.add('open');
  authShowTab('login');
}

//  Admission update overlay 
function showUpdateAdmissionOverlay(onSuccess){
  var existing = document.getElementById('update-reg-overlay');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'update-reg-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9800;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;font-family:"Plus Jakarta Sans",sans-serif;';
  ov.innerHTML = '<div style="background:linear-gradient(160deg,#0b1e14,#071018);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:28px 24px;width:100%;max-width:380px;text-align:center">'
    +'<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-3);margin-bottom:12px">Survey</div>'
    +'<div style="color:#fff;font-size:1rem;font-weight:800;margin-bottom:6px">Admission Number Required</div>'
    +'<div style="color:rgba(255,255,255,.5);font-size:.78rem;line-height:1.6;margin-bottom:20px">Your account needs your admission number to continue.</div>'
    +'<input id="update-reg-input" type="text" autocapitalize="characters" placeholder="Your admission number" style="width:100%;padding:13px 14px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;color:#fff;font-family:inherit;font-size:.88rem;outline:none;margin-bottom:8px;letter-spacing:.5px;">'
    +'<div id="update-reg-err" style="color:#ff8a8a;font-size:.72rem;min-height:18px;margin-bottom:10px;text-align:left;padding:0 2px"></div>'
    +'<button onclick="submitUpdateAdmission()" style="width:100%;padding:13px;background:linear-gradient(135deg,#1a5c35,#1a4060);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer;margin-bottom:8px">Save &amp; Continue →</button>'
    +'<div style="color:rgba(255,255,255,.25);font-size:.68rem;margin-top:4px">Contact your coordinator if you do not know your admission number</div>'
    +'</div>';
  document.body.appendChild(ov);
  window._updateRegCallback = onSuccess;
  setTimeout(function(){
    var inp = document.getElementById('update-reg-input');
    if(inp){ inp.focus(); inp.addEventListener('keydown', function(e){ if(e.key==='Enter') submitUpdateAdmission(); }); }
  }, 300);
}

async function submitUpdateAdmission(){
  var inp = document.getElementById('update-reg-input');
  var err = document.getElementById('update-reg-err');
  if(!inp) return;
  var rawReg = inp.value.trim();
  var reg    = rawReg.toUpperCase();
  if(!rawReg){ if(err) err.textContent='Please enter your admission number'; inp.focus(); return; }
  if(!isValidAdmission(rawReg)){ if(err) err.textContent='Invalid format — use e.g. B11/GLUK/S53K/2022'; inp.focus(); return; }
  if(err) err.textContent='';
  inp.disabled = true;
  var session = authGetSession();
  if(session){ session.reg_number = reg; authSaveSession(session); }
  var ov = document.getElementById('update-reg-overlay');
  if(ov) ov.remove();
  showToast('Admission number saved');
  if(typeof window._updateRegCallback==='function'){ window._updateRegCallback(); window._updateRegCallback=null; }
}

function authEnterApp(){
  const s    = authGetSession();
  const fullN = s?.full_name || getUserName();
  const role  = s?.role || 'user';
  if(fullN){ localStorage.setItem('chsa_user_name', fullN); fillInterviewerFields(fullN); }

  // Fade out auth card
  const auth = document.getElementById('lamp-auth');
  if(auth){ auth.style.transition='opacity .45s ease'; auth.style.opacity='0'; setTimeout(()=>{ auth.style.pointerEvents='none'; },470); }

  // Helper: hide welcome screen before opening a panel
  function _hideWelcome(){
    const ws=document.getElementById('welcome-screen');
    if(ws) ws.style.display='none';
  }

  //  SUPER ADMIN → super admin dashboard only 
  if(role==='super_admin' || localStorage.getItem('chsa_is_admin_bypass')==='1'){
    _hideWelcome();
    setTimeout(function(){
      if(typeof initSuperAdminDashboard==='function') initSuperAdminDashboard();
      else openAdminDash();
    }, 600);
    return;
  }

  //  INSTITUTION ADMIN → institution admin dashboard only, never survey home 
  if(role==='institution_admin' || localStorage.getItem('chsa_is_inst_admin')==='1'){
    _hideWelcome();
    setTimeout(function(){
      if(typeof initInstAdminDashboard==='function') initInstAdminDashboard();
    }, 400);
    return;
  }

  //  ENUMERATOR (role=user) → loader → enumerator home 
  const hasReg = s && s.reg_number && s.reg_number !== '—' && s.reg_number.trim() !== '';
  if(!hasReg){
    setTimeout(function(){ showUpdateAdmissionOverlay(function(){ setTimeout(showLoader,300); }); }, 600);
    return;
  }
  setTimeout(showLoader, 500);
}

//  PHASE 3 & 4: LOADER 
function showLoader(){
  // Skip loader animation — go straight to home page
  const ws=document.getElementById('welcome-screen');
  const auth=document.getElementById('lamp-auth');
  const ls=document.getElementById('loader-screen');
  if(ws)   ws.style.display='none';
  if(auth){ auth.style.display='none'; auth.style.opacity='0'; }
  if(ls)   ls.style.display='none';
  // Go directly to home
  showEnumeratorHome();
  setTimeout(function(){ if(typeof checkAppVersion==='function') checkAppVersion(); }, 2000);
}

function runProgress(){
  const bar=document.getElementById('ls-bar'), txt=document.getElementById('ls-percent'), lbl=document.getElementById('ls-loading'),
        btn=document.getElementById('ls-begin'), ecg=document.getElementById('ls-ecg-path'), cd=document.getElementById('ls-countdown');
  const STEPS=[
    [0,  'Initialising system…',                   0],
    [10, 'Loading questionnaire modules…',          600],
    [22, 'Compiling Section A — Demography…',       600],
    [34, 'Compiling Section B — Housing…',          600],
    [44, 'Compiling Section C — Medical History…',  600],
    [54, 'Compiling Section D — Maternal & Child…', 600],
    [63, 'Compiling Section E — Nutrition…',        600],
    [72, 'Compiling Section F — HIV/AIDS…',         600],
    [80, 'Compiling Sections G–K — Environment…',  700],
    [88, 'Checking integrity rules…',               700],
    [93, 'Verifying offline database…',             700],
    [97, 'Adjusting progress…',                     600],
    [99, 'Finalising…',                             500],
    [100,'Survey ready',               0],
  ];
  let currentPct=0;
  if(lbl) lbl.textContent=STEPS[0][1];
  function animateTo(targetPct,afterDelay,done){
    const tickMs=targetPct<=80?28:22;
    const iv=setInterval(()=>{
      currentPct++;
      if(txt) txt.textContent=currentPct+'%';
      if(bar) bar.style.width=currentPct+'%';
      if(currentPct>=targetPct){ clearInterval(iv); setTimeout(done,afterDelay); }
    },tickMs);
  }
  function runStep(i){
    if(i>=STEPS.length) return;
    const [targetPct,msg,holdMs]=STEPS[i];
    if(lbl) lbl.textContent=msg;
    if(targetPct===100){
      if(ecg){ ecg.classList.remove('running'); ecg.classList.add('stopped'); }
      if(lbl) lbl.style.color='#1DB954';
      if(btn) btn.style.display='block';
      let secs=5;
      if(cd){ cd.style.display='block'; cd.textContent='Opening in '+secs+'s…'; }
      _autoTimer=setInterval(()=>{
        secs--;
        if(cd) cd.textContent=secs>0?'Opening in '+secs+'s…':'Opening…';
        if(secs<=0){ clearInterval(_autoTimer); _autoTimer=null; loaderBegin(); }
      },1000);
      return;
    }
    animateTo(targetPct,holdMs,()=>runStep(i+1));
  }
  runStep(1);
}

function loaderBegin(){
  if(_autoTimer){ clearInterval(_autoTimer); _autoTimer=null; }
  const ls=document.getElementById('loader-screen');
  const ws=document.getElementById('welcome-screen');
  if(ws) ws.style.display='none';
  if(ls) ls.style.display='none';
  showEnumeratorHome();
  enterApp();
  setTimeout(checkAppVersion, 2000);
}

function enterApp(){
  const ws=document.getElementById('welcome-screen');
  if(ws){ ws.classList.add('hiding'); setTimeout(()=>{ ws.style.display='none'; },400); }
}

function showSplash(cb){ if(cb) cb(); }
function showWelcomeInterstitial(n,r,cb){ loaderBegin(); }
function wciEnterSurvey(){ loaderBegin(); }
function showHeartScreen(){ loaderBegin(); }
function hsEnterSurvey(){ loaderBegin(); }


//  RETURNING USER GREETING 
function showReturningGreeting(name){
  const ws=document.getElementById('welcome-screen');
  const h=new Date().getHours();
  const tod=h<12?'Good Morning':h<17?'Good Afternoon':'Good Evening';
  if(!document.getElementById('ret-greet-style')){
    const st=document.createElement('style');
    st.id='ret-greet-style';
    st.textContent=`
      @keyframes rgLogoIn{from{opacity:0;transform:scale(.5) translateY(-20px);}to{opacity:1;transform:scale(1) translateY(0);}}
      @keyframes rgRise{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
      @keyframes rgOrb{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(18px,-24px) scale(1.1);}}
      @keyframes rgOut{from{opacity:1;transform:translateY(0);}to{opacity:0;transform:translateY(-28px);}}
    `;
    document.head.appendChild(st);
  }
  const ov=document.createElement('div');
  ov.id='return-greet';
  ov.style.cssText='position:fixed;inset:0;z-index:9000;background:linear-gradient(160deg,#04080f 0%,#080f1a 50%,#04080f 100%);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:0;overflow:hidden;opacity:0;transition:opacity .55s ease;';
  ov.innerHTML=`
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
      <div style="color:rgba(255,255,255,.2);font-size:.62rem;letter-spacing:.3px;">Medical Survey System <strong style="color:rgba(255,255,255,.4);">v6.1</strong> &nbsp;·&nbsp; Ministry of Health Kenya</div>
    </div>
  `;
  // Append to body so it's truly fullscreen above everything
  document.body.appendChild(ov);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ ov.style.opacity='1'; }));
  setTimeout(()=>{
    // Hide welcome-screen FIRST so there's no black flash underneath
    if(ws){ ws.style.display='none'; }
    ov.style.animation='rgOut .55s ease forwards';
    setTimeout(()=>{ ov.remove(); }, 560);
    const _role=(authGetSession()?.role)||'user';
    if(_role==='super_admin'||localStorage.getItem('chsa_is_admin_bypass')==='1'){
      if(typeof initSuperAdminDashboard==='function') initSuperAdminDashboard();
      else openAdminDash();
    } else if(_role==='institution_admin'||localStorage.getItem('chsa_is_inst_admin')==='1'){
      if(typeof initInstAdminDashboard==='function') initInstAdminDashboard();
    } else {
      showEnumeratorHome();
    }
  }, 3500);
}


let _authCurrentTab = 'login';

function authShowTab(tab){
  _authCurrentTab = tab;
  const track=document.getElementById('auth-track'), tLogin=document.getElementById('auth-tab-login'), tReg=document.getElementById('auth-tab-register');
  if(tab==='login'){
    if(track) track.style.transform='translateX(0)';
    if(tLogin){ tLogin.style.background='rgba(61,184,106,.15)'; tLogin.style.color='#3db86a'; tLogin.style.borderTopColor='#3db86a'; }
    if(tReg)  { tReg.style.background='transparent'; tReg.style.color='rgba(255,255,255,.3)'; tReg.style.borderTopColor='transparent'; }
  } else {
    if(track) track.style.transform='translateX(-50%)';
    if(tReg)  { tReg.style.background='rgba(61,184,106,.15)'; tReg.style.color='#3db86a'; tReg.style.borderTopColor='#3db86a'; }
    if(tLogin){ tLogin.style.background='transparent'; tLogin.style.color='rgba(255,255,255,.3)'; tLogin.style.borderTopColor='transparent'; }
    // Load institution dropdown whenever register tab opens
    if(window.HS && window.HS.HSAdmin) loadInstitutionDropdown();
  }
}

function authShowPanel(name){
  const cardWrap=document.getElementById('auth-card-wrap'), pending=document.getElementById('auth-panel-pending'), rejected=document.getElementById('auth-panel-rejected');
  if(pending)  pending.style.display='none';
  if(rejected) rejected.style.display='none';
  if(name==='login'||name==='register'){
    if(cardWrap) cardWrap.style.display='';
    _authCurrentTab=null;
    authShowTab(name);
  } else {
    if(cardWrap) cardWrap.style.display='none';
    const panel=(name==='pending')?pending:rejected;
    if(panel) panel.style.display='';
  }
}

function authMsg(panel, msg, color='rgba(255,200,100,.9)'){
  const el=document.getElementById('auth-'+panel+'-msg');
  if(el){ el.textContent=msg; el.style.color=color; }
}

//  Student login — reg_number used as credential 
async function authLogin(){
  const rawReg=document.getElementById('auth-reg-login').value.trim();
  if(!rawReg){ authMsg('login','Enter your admission number or admin code'); return; }

  const loginBtn=document.getElementById('auth-login-btn')||document.querySelector('[onclick*="authLogin"]');
  const origText=loginBtn?loginBtn.textContent:'';
  if(loginBtn){ loginBtn.disabled=true; loginBtn.textContent='Verifying…'; }

  // Check super_admin bypass first
  const bypassOk = await isAdminBypass(rawReg);
  if(loginBtn){ loginBtn.disabled=false; loginBtn.textContent=origText; }

  if(bypassOk){
    const payload=window.HS.Auth.getPayload();
    // Token is already stored by HSAuth.superLogin → Auth.setToken. Mirror it so
    // authSaveSession (which reads hs_jwt_token) can embed it in the session object.
    authSaveSession({ reg_number:'ADMIN', full_name:payload?.full_name||'Administrator', status:'super_admin', role:'super_admin', email:payload?.email||rawReg, institution_id: null });
    localStorage.setItem('chsa_user_name', payload?.full_name||'Administrator');
    localStorage.setItem('chsa_is_admin_bypass','1');
    authEnterApp();
    return;
  }

  const reg=rawReg.toUpperCase();
  // Skip admission format check if input contains special characters (could be admin code
  // where superlogin endpoint isn't deployed yet) — let the backend reject it properly
  const looksLikeAdminCode = /[^A-Z0-9\/\-\.\s]/.test(reg) || reg.length > 20;
  if(!looksLikeAdminCode && !isValidAdmission(reg)){ authMsg('login','Invalid admission number format'); return; }
  if(!navigator.onLine){ authMsg('login','No internet — register first when online.','rgba(255,200,100,.9)'); return; }
  authMsg('login','Signing in…','rgba(255,255,255,.5)');

  try{
    // Students use their reg_number as both email and password (backend maps this)
    const data=await window.HS.HSAuth.login(reg, reg);
    const user=data.user;
    if(user.status==='removed'){ authMsg('login','Your access has been removed. Contact the coordinator.','rgba(255,150,100,.9)'); window.HS.Auth.clearToken(); return; }
    // Resolve institution name AND profile data (county, sub_county, village_list) from API
    let _instNameResolved = '';
    let _instCounty = '', _instSubCounty = '', _instWard = '', _instVillageList = [];
    let _instAdminName = '', _instContactEmail = '';
    if(user.institution_id){
      try{
        const _instData = await window.HS.HSAdmin.getInstitutions();
        const _found = (_instData.institutions||[]).find(i=>i.id===user.institution_id);
        if(_found){
          _instNameResolved  = _found.name;
          _instCounty        = _found.county       || '';
          _instSubCounty     = _found.sub_county    || '';
          _instWard          = _found.ward          || '';
          _instVillageList   = _found.village_list  || [];
          _instAdminName     = _found.admin_name    || '';
          _instContactEmail  = _found.contact_email || '';
        }
      }catch(e){}
    }
    authSaveSession({ reg_number:reg, full_name:user.full_name, status:'active', role:user.role, institution_id:user.institution_id, institution_name:_instNameResolved||null, county:_instCounty||null, sub_county:_instSubCounty||null, ward:_instWard||null, village_list:_instVillageList, admin_name:_instAdminName||null, contact_email:_instContactEmail||null });
    localStorage.setItem('chsa_user_name', user.full_name);
    if(user.role==='institution_admin') localStorage.setItem('chsa_is_inst_admin','1');
    authEnterApp();
  } catch(e){
    const msg=e?.data?.error||e.message||'';
    if(msg.toLowerCase().includes('invalid')||msg.toLowerCase().includes('not found')){
      authMsg('login','Not found — please register below.');
      setTimeout(function(){
        authShowTab('register');
        var regInput=document.getElementById('auth-reg-num');
        if(regInput) regInput.value=reg;
        authMsg('register','Enter your full name to complete registration');
      }, 800);
    } else {
      authMsg('login','Connection error — try again');
    }
  }
}

//  Email notification to teacher via EmailJS 
async function authNotifyTeacher(studentName, regNumber, email){
  try{
    await fetch('https://api.emailjs.com/api/v1.0/email/send',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        service_id:EMAILJS_SERVICE, template_id:EMAILJS_TEMPLATE, user_id:EMAILJS_PUBLIC,
        template_params:{ to_email:TEACHER_EMAIL, student_name:studentName, reg_number:regNumber, student_email:email||'not provided', time:new Date().toLocaleString('en-KE'), approve_link:'Access already granted. Open Admin → Students tab to manage.' }
      })
    });
  }catch(e){}
}

//  Google Sign-In 
function authGoogleSignIn(){
  if(GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID')){ authMsg('login','Google Sign-In not configured. Use your admission number.','rgba(255,200,100,.9)'); return; }
  if(typeof google==='undefined'){ authMsg('login','Google Sign-In not available.','rgba(255,200,100,.9)'); return; }
  google.accounts.id.initialize({ client_id:GOOGLE_CLIENT_ID, callback:(r)=>handleGoogleCredential(r,'login'), context:'signin', ux_mode:'popup' });
  google.accounts.id.prompt();
}

function authGoogleRegister(){
  if(typeof google==='undefined'){ authMsg('register','Google Sign-In not available.','rgba(255,200,100,.9)'); return; }
  google.accounts.id.initialize({ client_id:GOOGLE_CLIENT_ID, callback:(r)=>handleGoogleCredential(r,'register'), context:'signup', ux_mode:'popup' });
  google.accounts.id.prompt();
}

async function handleGoogleCredential(response, mode){
  try{
    const payload=JSON.parse(atob(response.credential.split('.')[1]));
    const googleName=payload.name||'', googleEmail=payload.email||'';
    const regNumber='G-'+googleEmail.split('@')[0].toUpperCase();
    authMsg('login','Signing in…','rgba(255,255,255,.5)');
    await authSubmitRegistration(regNumber, googleName, googleEmail, true);
  }catch(e){ authMsg('login','Google sign-in error','rgba(255,100,100,.9)'); }
}

//  Core registration — routes through backend via api-client.js 
async function authSubmitRegistration(reg, name, email, isGoogle=false, institutionId=null, institutionName=''){
  const panel=isGoogle?'login':'register';
  try{
    // Try login first — user may already exist
    try{
      const loginData=await window.HS.HSAuth.login(reg, reg);
      const user=loginData.user;
      if(user.status==='removed'){ authMsg(panel,'Your access was removed. Contact the coordinator.','rgba(255,150,100,.9)'); window.HS.Auth.clearToken(); return; }
      // Resolve institution name so consent form is correct
      let _rInstName = institutionName || '';
      if(!_rInstName && user.institution_id){
        try{
          const _rd = await window.HS.HSAdmin.getInstitutions();
          const _rf = (_rd.institutions||[]).find(i=>i.id===user.institution_id);
          if(_rf) _rInstName = _rf.name;
        }catch(e){}
      }
      authSaveSession({ reg_number:reg, full_name:user.full_name, status:'active', role:user.role, email:email||user.email, institution_id:user.institution_id, institution_name:_rInstName||null });
      localStorage.setItem('chsa_user_name', user.full_name);
      authEnterApp();
      return;
    }catch(loginErr){ /* not found — register */ }

    // Register new user
    const data=await window.HS.HSAuth.register({
      full_name:      name,
      email:          email||undefined,
      password:       reg,  // reg_number as password for student accounts
      role:           'user',
      institution_id: institutionId||undefined,
      reg_number:     reg,
    });
    authSaveSession({ reg_number:reg, full_name:name, status:'active', role:'user', email:email||null, institution_id:institutionId||null, institution_name:institutionName||null });
    localStorage.setItem('chsa_user_name', name);
    authNotifyTeacher(name, reg, email);
    authEnterApp();
  }catch(e){
    // Re-enable register button so user can retry without refreshing
    const regBtn = document.querySelector('#reg-student-fields button');
    if(regBtn){ regBtn.disabled=false; regBtn.textContent='Register'; }
    // Show a clear, specific error
    let errMsg = e?.data?.error || e?.message || '';
    let display;
    if(!navigator.onLine){
      display = 'No internet — register first when online';
    } else if(e?.status===0 || errMsg.toLowerCase().includes('network') || errMsg.toLowerCase().includes('fetch')){
      display = 'Could not reach the server — check your connection and try again';
    } else if(e?.status===409 || errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('exists')){
      display = 'That admission number is already registered — try signing in instead';
    } else if(e?.status===401 || e?.status===403){
      display = 'Registration rejected — contact your coordinator';
    } else if(e?.status===400){
      display = '' + (errMsg || 'Invalid details — check your admission number and name');
    } else if(errMsg){
      display = '' + errMsg.slice(0, 120);
    } else {
      display = 'Registration failed — please try again';
    }
    authMsg(panel, display, 'rgba(255,120,100,.95)');
  }
}

//  Institution Admin Registration 
async function authRegisterAdmin(){
  const rawName=(document.getElementById('auth-admin-name')?.value||'').trim();
  const name=toTitleCase(rawName);
  const rawInstName=(document.getElementById('auth-admin-institution-name')?.value||'').trim();
  const rawInstCode=(document.getElementById('auth-admin-institution-code')?.value||'').trim().toUpperCase();
  const rawId=(document.getElementById('auth-admin-id-number')?.value||'').trim();
  const password=(document.getElementById('auth-admin-password')?.value||'').trim();

  if(!rawName){ authMsg('register','Enter your full name'); document.getElementById('auth-admin-name')?.focus(); return; }
  if(name.trim().split(/\s+/).length<2){ authMsg('register','Enter first and last name'); return; }
  if(!rawInstName){ authMsg('register','Enter your institution name'); document.getElementById('auth-admin-institution-name')?.focus(); return; }
  if(!rawInstCode || rawInstCode.length < 2){ authMsg('register','Enter a short code for your institution (e.g. GLUK)'); document.getElementById('auth-admin-institution-code')?.focus(); return; }
  if(!rawId){ authMsg('register','Enter your National ID Number'); document.getElementById('auth-admin-id-number')?.focus(); return; }
  if(!MSSValidate.password(password)){ authMsg('register','Password must be 4–128 characters'); document.getElementById('auth-admin-password')?.focus(); return; }
  if(!navigator.onLine){ authMsg('register','No internet — register first when online'); return; }

  const admBtn = document.querySelector('#reg-admin-fields button');
  if(admBtn){ admBtn.disabled=true; admBtn.textContent='Registering…'; }
  authMsg('register','Creating institution and admin account…','rgba(255,255,255,.5)');

  try{
    // Single atomic call — backend creates institution + user together (no pre-auth needed)
    const data = await window.HS.HSAuth.register({
      full_name:        name,
      email:            rawId+'@admin.local',
      password:         password,
      role:             'institution_admin',
      id_number:        rawId,
      institution_name: rawInstName,
      institution_code: rawInstCode,
      reg_number:       'ADMIN-'+rawId.replace(/\s+/g,''),
    });

    authSaveSession({
      reg_number:       'ADMIN-'+rawId.replace(/\s+/g,''),
      full_name:        name,
      status:           'active',
      role:             'institution_admin',
      id_number:        rawId,
      institution_id:   data.user?.institution_id,
      institution_name: rawInstName,
    });
    localStorage.setItem('chsa_user_name', name);
    localStorage.setItem('chsa_is_inst_admin', '1');
    // Reset dropdown cache so students see the new institution
    _institutionsLoaded = false;
    authEnterApp();
  }catch(e){
    if(admBtn){ admBtn.disabled=false; admBtn.textContent='Register Institution'; }
    let errMsg = e?.data?.error || e?.message || '';
    let display;
    if(!navigator.onLine){ display = 'No internet — register first when online'; }
    else if(e?.status===0 || errMsg.toLowerCase().includes('network')){ display = 'Could not reach the server — check your connection and try again'; }
    else if(e?.status===409 || errMsg.toLowerCase().includes('already')){ display = 'That ID is already registered — try signing in'; }
    else if(errMsg){ display = '' + errMsg.slice(0,120); }
    else { display = 'Registration failed — please try again'; }
    authMsg('register', display, 'rgba(255,120,100,.95)');
  }
}

async function authRegister(){
  const rawReg=document.getElementById('auth-reg-num').value.trim();
  const reg=rawReg.toUpperCase();
  const rawName=document.getElementById('auth-full-name').value.trim();
  const name=toTitleCase(rawName);
  const email=document.getElementById('auth-email').value.trim().toLowerCase();

  //  Institution selection (required) 
  const instSel  = document.getElementById('auth-institution-select');
  const instId   = instSel ? instSel.value : null;
  const instName = instSel && instSel.selectedIndex > 0 ? instSel.options[instSel.selectedIndex].text : '';

  if(!rawReg){ authMsg('register','Admission number is required'); document.getElementById('auth-reg-num').focus(); return; }
  if(!isValidAdmission(rawReg)){ authMsg('register','Invalid admission number format'); document.getElementById('auth-reg-num').focus(); return; }
  if(!rawName){ authMsg('register','Full name is required'); document.getElementById('auth-full-name').focus(); return; }
  if(name.trim().split(/\s+/).length<2){ authMsg('register','Enter your full name — first and last name'); document.getElementById('auth-full-name').focus(); return; }
  if(!instId){ authMsg('register','Please select your institution'); instSel && instSel.focus(); return; }
  document.getElementById('auth-full-name').value=name;
  if(!navigator.onLine){ authMsg('register','No internet — register first when online'); return; }
  // Save form data before async call in case something triggers a page reload
  try{ sessionStorage.setItem('_reg_draft', JSON.stringify({reg, name, email, instId, instName})); }catch(e){}
  // Disable button to prevent double-submit
  const regBtn = document.querySelector('#reg-student-fields button');
  if(regBtn){ regBtn.disabled=true; regBtn.textContent='Registering…'; }
  authMsg('register','Registering…','rgba(255,255,255,.5)');
  try{
    await authSubmitRegistration(reg,name,email,false,instId,instName);
    sessionStorage.removeItem('_reg_draft');
  } catch(e){
    // authSubmitRegistration handles its own error display and re-enables button
  }
}

// Restore saved draft if page reloaded mid-registration
function _restoreRegDraft(){
  try{
    const raw = sessionStorage.getItem('_reg_draft');
    if(!raw) return;
    const d = JSON.parse(raw);
    // Only restore if we're back on the auth screen (not logged in)
    if(authGetSession()) { sessionStorage.removeItem('_reg_draft'); return; }
    const regEl   = document.getElementById('auth-reg-num');
    const nameEl  = document.getElementById('auth-full-name');
    const emailEl = document.getElementById('auth-email');
    if(regEl   && d.reg)   regEl.value   = d.reg;
    if(nameEl  && d.name)  nameEl.value  = d.name;
    if(emailEl && d.email) emailEl.value = d.email;
    // Restore institution selection after dropdown has loaded
    if(d.instId){
      const restoreInst = function(){
        const sel = document.getElementById('auth-institution-select');
        if(sel && sel.options.length > 1) sel.value = d.instId;
      };
      restoreInst();
      setTimeout(restoreInst, 1500);
    }
    // Switch to register tab so user sees their data
    if(typeof authShowTab==='function') authShowTab('register');
    if(typeof switchRegTab==='function') switchRegTab('student');
    authMsg('register','Your details were restored — tap Register to continue.','rgba(29,185,84,.9)');
    sessionStorage.removeItem('_reg_draft');
  }catch(e){}
}

async function authCheckStatus(){
  const session=authGetSession();
  if(session&&session.full_name) authEnterApp();
}

function authClearAndRetry(){
  authClearSession();
  if(window.HS&&window.HS.Auth) window.HS.Auth.clearToken();
  authShowPanel('login');
  document.getElementById('auth-tabs').style.display='';
}

//  Login tab switcher 
function switchLoginTab(tab){
  const sf=document.getElementById('login-student-fields'), af=document.getElementById('login-admin-fields'),
        st=document.getElementById('login-tab-student'), at=document.getElementById('login-tab-admin'),
        btn=document.getElementById('login-submit-btn');
  const activeStyle='flex:1;padding:7px 4px;border-radius:8px;font-family:inherit;font-size:.68rem;font-weight:700;cursor:pointer;';
  if(tab==='student'){
    if(sf) sf.style.display=''; if(af) af.style.display='none';
    if(st) st.style.cssText=activeStyle+'background:rgba(29,185,84,.15);border:1px solid rgba(29,185,84,.4);color:#1DB954;';
    if(at) at.style.cssText=activeStyle+'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);';
    if(btn){ btn.onclick=function(){authLogin();}; btn.style.background='linear-gradient(135deg,#1DB954,#0f7a35)'; }
  } else {
    if(sf) sf.style.display='none'; if(af) af.style.display='';
    if(at) at.style.cssText=activeStyle+'background:rgba(255,200,80,.15);border:1px solid rgba(255,200,80,.4);color:#f0c040;';
    if(st) st.style.cssText=activeStyle+'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);';
    if(btn){ btn.onclick=function(){authAdminLogin();}; btn.style.background='linear-gradient(135deg,#b8860b,#1a4060)'; }
  }
}

//  Register tab switcher 
//  Load institutions into registration dropdown 
// Called when the user opens the Register tab so the dropdown is always fresh.
let _institutionsLoaded = false;
async function loadInstitutionDropdown(){
  const sel = document.getElementById('auth-institution-select');
  if(!sel) return;
  if(_institutionsLoaded && sel.options.length > 1) return; // already loaded
  sel.innerHTML = '<option value="">Loading institutions…</option>';
  try{
    const data = await window.HS.HSAdmin.getInstitutions();
    const list = data.institutions || [];
    if(!list.length){
      sel.innerHTML = '<option value="">No institutions found — contact admin</option>';
      return;
    }
    sel.innerHTML = '<option value="">— Select your institution —</option>';
    list.forEach(function(inst){
      const opt = document.createElement('option');
      opt.value = inst.id;
      opt.textContent = inst.name;
      sel.appendChild(opt);
    });
    _institutionsLoaded = true;
  }catch(e){
    sel.innerHTML = '<option value="">Could not load — check connection</option>';
    _institutionsLoaded = false;
  }
}

function switchRegTab(tab){
  const sf=document.getElementById('reg-student-fields'), af=document.getElementById('reg-admin-fields'),
        st=document.getElementById('reg-tab-student'), at=document.getElementById('reg-tab-admin');
  const activeStyle='flex:1;padding:7px 4px;border-radius:8px;font-family:inherit;font-size:.65rem;font-weight:700;cursor:pointer;';
  if(tab==='student'){
    if(sf) sf.style.display=''; if(af) af.style.display='none';
    if(st) st.style.cssText=activeStyle+'background:rgba(29,185,84,.15);border:1px solid rgba(29,185,84,.4);color:#1DB954;';
    if(at) at.style.cssText=activeStyle+'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);';
    if(btn){ btn.onclick=function(){ authLogin(); }; btn.style.background='linear-gradient(135deg,#1DB954,#0f7a35)'; btn.textContent='Sign In'; }
  } else {
    if(sf) sf.style.display='none'; if(af) af.style.display='';
    if(at) at.style.cssText=activeStyle+'background:rgba(255,200,80,.15);border:1px solid rgba(255,200,80,.4);color:#f0c040;';
    if(st) st.style.cssText=activeStyle+'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);';
    if(btn){ btn.onclick=function(){ authAdminLogin(); }; btn.style.background='linear-gradient(135deg,#f0c040,#c8960a)'; btn.textContent='Sign In as Admin'; }
  }
}

//  Institution Admin Login — JWT backend 
async function authAdminLogin(){
  const rawId=(document.getElementById('auth-admin-login-id')?.value||'').trim();
  const pass=(document.getElementById('auth-admin-login-pass')?.value||'').trim();
  if(!rawId){ authMsg('login','Enter your National ID Number'); return; }
  if(!pass){  authMsg('login','Enter your password'); return; }
  if(!navigator.onLine){ authMsg('login','No internet — register first when online','rgba(255,200,100,.9)'); return; }
  authMsg('login','Signing in…','rgba(255,255,255,.5)');
  try{
    const data=await window.HS.HSAuth.login(rawId+'@admin.local', pass);
    const user=data.user;
    if(user.status==='removed'){ authMsg('login','Your access has been removed.','rgba(255,150,100,.9)'); window.HS.Auth.clearToken(); return; }
    if(!['institution_admin','super_admin'].includes(user.role)){ authMsg('login','No institution admin found with that ID.','rgba(255,150,100,.9)'); window.HS.Auth.clearToken(); return; }
    // Resolve institution name AND profile data from API
    let _iaInstName = '', _iaCounty = '', _iaSubCounty = '', _iaWard = '', _iaVillageList = [];
    if(user.institution_id){
      try{
        const _iaInstData = await window.HS.HSAdmin.getInstitutions();
        const _iaFound = (_iaInstData.institutions||[]).find(i=>i.id===user.institution_id);
        if(_iaFound){
          _iaInstName     = _iaFound.name;
          _iaCounty       = _iaFound.county      || '';
          _iaSubCounty    = _iaFound.sub_county   || '';
          _iaWard         = _iaFound.ward         || '';
          _iaVillageList  = _iaFound.village_list || [];
        }
      }catch(e){}
      // Write login_date to institution_profiles (fire-and-forget)
      try{
        const _today = new Date().toISOString().slice(0,10);
        await window.HS.HSAdmin.updateInstitutionProfile(user.institution_id, { login_date: _today });
      }catch(e){}
    }
    authSaveSession({ reg_number:user.id||rawId, full_name:user.full_name, status:'active', role:user.role, institution_id:user.institution_id, institution_name:_iaInstName||null, county:_iaCounty||null, sub_county:_iaSubCounty||null, ward:_iaWard||null, village_list:_iaVillageList, id_number:rawId });
    localStorage.setItem('chsa_user_name',user.full_name);
    localStorage.setItem('chsa_is_inst_admin','1');
    authEnterApp();
  }catch(e){
    const msg=e?.data?.error||e.message||'';
    authMsg('login', msg.toLowerCase().includes('invalid')||msg.toLowerCase().includes('not found') ? 'Wrong ID or password' : 'Connection error — try again');
  }
}

//  Admin password recovery 
function showAdminPasswordRecovery(){
  const rawId=(document.getElementById('auth-admin-login-id')?.value||'').trim();
  const ov=document.createElement('div');
  ov.id='admin-recovery-overlay';
  ov.style.cssText='position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Plus Jakarta Sans",sans-serif;';
  ov.innerHTML=`
    <div style="background:linear-gradient(160deg,#0b1e14,#071018);border:1px solid rgba(255,200,80,.2);border-radius:22px;padding:28px 22px;width:100%;max-width:340px;text-align:center;">
      <div style="font-size:2rem;margin-bottom:10px"></div>
      <div style="color:#fff;font-size:.95rem;font-weight:800;margin-bottom:6px">Recover Password</div>
      <div style="color:rgba(255,255,255,.45);font-size:.75rem;margin-bottom:18px;line-height:1.5">Enter your National ID and a new password. Contact your system admin if needed.</div>
      <input id="recovery-id-input" type="text" value="${rawId}" placeholder="National ID Number" style="width:100%;padding:12px 14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,200,80,.25);border-radius:12px;color:#fff;font-family:inherit;font-size:.88rem;outline:none;margin-bottom:8px;box-sizing:border-box;">
      <input id="recovery-new-pass" type="password" placeholder="New password (min 4 chars)" style="width:100%;padding:12px 14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,200,80,.25);border-radius:12px;color:#fff;font-family:inherit;font-size:.88rem;outline:none;margin-bottom:8px;box-sizing:border-box;">
      <div id="recovery-msg" style="color:#ff8a8a;font-size:.72rem;min-height:16px;margin-bottom:10px;text-align:left;padding:0 2px"></div>
      <button onclick="submitAdminPasswordRecovery()" style="width:100%;padding:12px;background:linear-gradient(135deg,#b8860b,#1a4060);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:.88rem;font-weight:700;cursor:pointer;margin-bottom:8px">Reset Password</button>
      <button onclick="document.getElementById('admin-recovery-overlay').remove()" style="width:100%;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:rgba(255,255,255,.4);font-family:inherit;font-size:.82rem;cursor:pointer;">Cancel</button>
    </div>`;
  document.body.appendChild(ov);
}

async function submitAdminPasswordRecovery(){
  const idInput=document.getElementById('recovery-id-input'), passInput=document.getElementById('recovery-new-pass'), msg=document.getElementById('recovery-msg');
  const rawId=(idInput?.value||'').trim(), newPass=(passInput?.value||'').trim();
  if(!rawId){ if(msg) msg.textContent='Enter your ID number'; return; }
  if(!newPass||newPass.length<4){ if(msg) msg.textContent='Password must be at least 4 characters'; return; }
  if(!navigator.onLine){ if(msg) msg.textContent='No internet — register first when online'; return; }
  if(msg) msg.textContent='Updating…';
  try{
    await window.HS.HSAuth.register({ email:rawId+'@admin.local', password:newPass, full_name:'Admin', role:'institution_admin', id_number:rawId });
    document.getElementById('admin-recovery-overlay').remove();
    showToast('Password updated — sign in now');
  }catch(e){
    const errMsg=e?.data?.error||e.message||'';
    if(msg) msg.textContent=errMsg.toLowerCase().includes('conflict')||errMsg.toLowerCase().includes('already')
      ? 'Contact your system administrator to reset your password'
      : 'ID number not found or not an admin account';
  }
}

function showPremiumModal(){ /* payment removed */ }

function spawnParticles(){
  const container=document.getElementById('wc-particles');
  if(!container) return;
  for(let i=0;i<18;i++){
    const p=document.createElement('div');
    p.className='wc-particle';
    p.style.left=Math.random()*100+'%';
    p.style.width=p.style.height=(1+Math.random()*2.5)+'px';
    p.style.animationDuration=(6+Math.random()*10)+'s';
    p.style.animationDelay=(Math.random()*8)+'s';
    p.style.opacity=0.2+Math.random()*0.5;
    container.appendChild(p);
  }
}

spawnParticles();
authInit();

(function hideGoogleIfUnconfigured(){
  if(GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID')){
    document.addEventListener('DOMContentLoaded', function(){
      document.querySelectorAll('[onclick*="authGoogleSignIn"],[onclick*="authGoogleRegister"]').forEach(function(btn){ btn.style.display='none'; });
      document.querySelectorAll('.auth-divider,.google-divider').forEach(function(el){ el.style.display='none'; });
    });
  }
})();


//  Service Worker 
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
    console.log(' SW registered:',reg.scope);
    if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    reg.addEventListener('updatefound',()=>{
      const nw=reg.installing; if(!nw) return;
      nw.addEventListener('statechange',()=>{ if(nw.state==='installed') nw.postMessage({type:'SKIP_WAITING'}); });
    });
    if(navigator.onLine) reg.update().catch(()=>{});
  }).catch(err=>console.warn('SW failed:',err));
  // Only reload on SW update if the user is NOT on the auth/login screen
  function _swSafeReload(){
    const ws = document.getElementById('welcome-screen');
    const authVisible = ws && ws.style.display !== 'none' && getComputedStyle(ws).display !== 'none';
    if(authVisible){
      // Auth screen is showing — user may be mid-registration. Skip reload silently.
      console.log('SW update deferred — user on auth screen');
      return;
    }
    window.location.reload();
  }
  navigator.serviceWorker.addEventListener('message',event=>{ if(event.data&&event.data.type==='SW_UPDATED'&&navigator.onLine) _swSafeReload(); });
  let _swRefreshing=false;
  const _hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!_swRefreshing&&navigator.onLine&&_hadController){ _swRefreshing=true; _swSafeReload(); } });
}

//  Version check 
const _APP_VER_KEY='chsa_app_version';
function checkAppVersion(){
  if(!navigator.onLine) return;
  fetch('./version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(data=>{
    const latest=String(data.version||''), current=localStorage.getItem(_APP_VER_KEY)||'';
    if(!current){ localStorage.setItem(_APP_VER_KEY,latest); return; }
    if(latest&&current!==latest){
      console.log('[Version] '+current+' → '+latest);
      localStorage.setItem(_APP_VER_KEY,latest);
      // Never reload while user is on auth/welcome screen (mid-login or mid-register)
      const ws = document.getElementById('welcome-screen');
      const onAuthScreen = !ws || ws.style.display !== 'none';
      if(onAuthScreen) return;
      const lastReload = parseInt(localStorage.getItem('chsa_last_reload')||'0');
      if(Date.now()-lastReload < 30000) return;
      localStorage.setItem('chsa_last_reload', String(Date.now()));
      if('caches' in window){ caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>window.location.reload(true)); }
      else window.location.reload(true);
    }
  }).catch(()=>{});
}
// checkAppVersion() is now called from loaderBegin() after user enters app

//  PWA Install 
let deferredPrompt=null;
const isIOS=/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
const isAndroid=/android/.test(navigator.userAgent.toLowerCase());
const isStandalone=window.navigator.standalone||window.matchMedia('(display-mode: standalone)').matches;

window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredPrompt=e; const b=document.getElementById('pwa-banner'); if(b) b.style.display='flex'; });
function doInstall(){
  const banner=document.getElementById('pwa-banner'); if(banner) banner.style.display='none';
  if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.then(c=>{ showToast(c.outcome==='accepted'?'App installed':'Installation cancelled'); deferredPrompt=null; }); }
  else showInstallGuide();
}
window.addEventListener('appinstalled',()=>{ showToast('Health Survey app installed'); const b=document.getElementById('pwa-banner'); if(b) b.style.display='none'; });

function showInstallGuide(){
  if(isStandalone){ showToast('Already installed as an app'); return; }
  const modal=document.getElementById('installModal'), android=document.getElementById('installStepsAndroid'),
        ios=document.getElementById('installStepsIOS'), desktop=document.getElementById('installStepsChromebook'), note=document.getElementById('installNote');
  if(android) android.style.display=isAndroid?'block':'none';
  if(ios)     ios.style.display=isIOS?'block':'none';
  if(desktop) desktop.style.display=(!isAndroid&&!isIOS)?'block':'none';
  if(!isAndroid&&!isIOS){ if(android) android.style.display='block'; if(ios) ios.style.display='block'; if(desktop) desktop.style.display='block'; }
  const isHTTPS=location.protocol==='https:'||location.hostname==='localhost';
  if(note){
    if(deferredPrompt){ note.innerHTML=' <strong>Ready to install!</strong>'; note.style.background='#e8f5ed'; }
    else if(isHTTPS){ note.innerHTML=' Use the browser menu to install.'; note.style.background='#e8f5ed'; }
    else { note.innerHTML='Host on HTTPS for full install support.'; note.style.background='#fff8e1'; }
  }
  if(modal) modal.style.display='flex';
}

//  Sync modal 
function openSyncModal(){
  const stored=JSON.parse(localStorage.getItem('chsa4')||'{}');
  const all=Object.entries(stored).filter(([id,r])=>typeof r==='object'&&r!==null&&!id.startsWith('_'));
  const confirmed=all.filter(([,r])=>r._synced===true), pending=all.filter(([,r])=>!r._synced);
  document.getElementById('syncModalStatus').textContent=navigator.onLine?' Online — ready to sync':' Offline — connect to sync';
  document.getElementById('syncModalInfo').innerHTML=`<strong>${all.length}</strong> total record(s)<br><span style="color:#1e5c38;font-weight:600"> ${confirmed.length} uploaded</span><br><span style="color:${pending.length>0?'#d35400':'#1e5c38'};font-weight:600">${pending.length>0?''+pending.length+' not uploaded — tap Sync':' All uploaded'}</span>`;
  document.getElementById('syncModal').style.display='flex';
}
function closeSyncModal(){ document.getElementById('syncModal').style.display='none'; }

if(isIOS&&!isStandalone){ setTimeout(()=>{ const n=document.getElementById('installNote'); if(n) n.innerHTML=' Open in Safari → tap Share  → Add to Home Screen'; },100); }

//  MY REPORTS 
function homeOpenMyReports(){
  try{
    var recs=JSON.parse(localStorage.getItem('chsa4')||'{}');
    var keys=Object.keys(recs).filter(function(k){return !k.startsWith('_');});
    var finished=keys.filter(function(k){return recs[k]._finished;});
    if(finished.length===0){ showToast('No completed interviews yet', true); return; }
    homeGoSurvey();
    setTimeout(function(){ if(typeof openDrawer==='function') openDrawer(); showToast(' '+finished.length+' completed interview'+(finished.length!==1?'s':'')); },450);
  }catch(e){ homeGoSurvey(); setTimeout(function(){ if(typeof openDrawer==='function') openDrawer(); },450); }
}

//  MY PROGRESS 
function homeOpenProgress(){
  try{
    var recs=JSON.parse(localStorage.getItem('chsa4')||'{}');
    var myName=getUserName()||'';
    var keys=Object.keys(recs).filter(function(k){return !k.startsWith('_');});
    var total=keys.length, finished=keys.filter(function(k){return recs[k]._finished;}).length,
        synced=keys.filter(function(k){return recs[k]._synced;}).length,
        today=new Date().toISOString().split('T')[0],
        todayCount=keys.filter(function(k){return recs[k].interview_date===today;}).length;
    var existing=document.getElementById('hp-progress-modal'); if(existing) existing.remove();
    var modal=document.createElement('div');
    modal.id='hp-progress-modal';
    modal.style.cssText='position:fixed;inset:0;z-index:7500;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML='<div style="background:linear-gradient(160deg,#071510,#0b1e14);border-radius:24px 24px 0 0;padding:28px 24px calc(28px + env(safe-area-inset-bottom));width:100%;max-width:480px;border:1px solid rgba(255,255,255,.08)">'
      +'<div style="text-align:center;margin-bottom:20px"><div style="font-size:2rem;margin-bottom:6px"></div><div style="color:#fff;font-size:1.1rem;font-weight:800">My Progress</div><div style="color:rgba(29,185,84,.7);font-size:.65rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:4px">'+myName+'</div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">'
      +_hpStatCard(total,'Total Interviews','#1a5c35')+_hpStatCard(todayCount,'Today','#1a4060')
      +_hpStatCard(finished,'Completed','#1a5c35')+_hpStatCard(synced,'Synced ',total>0&&synced===total?'#1a5c35':'#e67e22')
      +'</div>'
      +(total-synced>0?'<div style="background:rgba(230,126,34,.12);border:1px solid rgba(230,126,34,.25);border-radius:12px;padding:11px 14px;font-size:.75rem;color:rgba(255,255,255,.7);margin-bottom:14px"> '+(total-synced)+' record'+(total-synced!==1?'s':'')+' not yet synced.</div>':'')
      +(finished>0?'<button onclick="var m=document.getElementById(\'hp-progress-modal\');if(m)m.remove();homeOpenMyReports();" style="width:100%;padding:13px;background:linear-gradient(135deg,#1a5c35,#1a4060);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:.88rem;font-weight:700;cursor:pointer;margin-bottom:8px">&#128209; View My Reports</button>':'')
      +'<button onclick="var m=document.getElementById(\'hp-progress-modal\');if(m)m.remove();" style="width:100%;padding:12px;background:rgba(255,255,255,.07);border:none;border-radius:12px;color:rgba(255,255,255,.5);font-family:inherit;font-size:.85rem;cursor:pointer">Close</button>'
      +'</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',function(e){ if(e.target===modal) modal.remove(); });
  }catch(err){ showToast('Could not load progress',true); }
}

function _hpStatCard(val,label,color){
  return '<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 10px;text-align:center;border-top:2px solid '+color+'"><div style="color:#fff;font-size:1.6rem;font-weight:800;line-height:1">'+val+'</div><div style="color:rgba(255,255,255,.4);font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">'+label+'</div></div>';
}

//  HOME PAGE 
//  showEnumeratorHome — ENUMERATORS ONLY (role=user) 
// Admins are never routed here; they go directly to their own panels.
function showEnumeratorHome(){
  const s    = authGetSession();
  const role = s?.role || 'user';

  // Safety guard — if somehow an admin hits this, redirect to their panel
  if(role==='super_admin' || localStorage.getItem('chsa_is_admin_bypass')==='1'){
    if(typeof initSuperAdminDashboard==='function') initSuperAdminDashboard();
    return;
  }
  if(role==='institution_admin' || localStorage.getItem('chsa_is_inst_admin')==='1'){
    if(typeof initInstAdminDashboard==='function') initInstAdminDashboard();
    return;
  }

  showScreen('home', true);
  if(typeof fabHide==='function') fabHide();
  var fullN=getUserName()||'Interviewer', h=new Date().getHours();
  var g=h<12?'Good Morning':h<17?'Good Afternoon':'Good Evening';
  var ne=document.getElementById('hp-name'), ge=document.getElementById('hp-greeting');
  if(ne) ne.textContent=fullN; if(ge) ge.textContent=g;
  const instName=(typeof getSessionInstitutionName==='function')?getSessionInstitutionName():'Community Health Survey';
  ['hp-inst-name','ls-inst-name','auth-hdr-inst'].forEach(function(id){ const el=document.getElementById(id); if(el) el.textContent=instName; });

  // Show ALL enumerator buttons (no admin note)
  var hp=document.getElementById('home-page');
  if(hp) hp.querySelectorAll('[data-role="survey-only"]').forEach(function(b){ b.style.display=''; });
  var adminNote=document.getElementById('hp-admin-note'); if(adminNote) adminNote.style.display='none';

  _hpStats();
  if(typeof checkCorrectionNotifications==='function') checkCorrectionNotifications();
}

// Keep showHomePage as alias so any other callers don't break
function showHomePage(){ showEnumeratorHome(); }
function _hpStats(){
  try{
    var recs=JSON.parse(localStorage.getItem('chsa4')||'{}');
    var keys=Object.keys(recs).filter(function(k){return !k.startsWith('_');});
    var today=new Date().toISOString().split('T')[0];
    var t=keys.filter(function(k){return recs[k].interview_date===today;}).length;
    var s=keys.filter(function(k){return recs[k]._synced;}).length;
    var te=document.getElementById('hp-stat-total'), td=document.getElementById('hp-stat-today'), sy=document.getElementById('hp-stat-synced');
    if(te) te.textContent=keys.length; if(td) td.textContent=t; if(sy) sy.textContent=s;
  }catch(e){}
}
function goBackHome(){ _hpStats(); showScreen('home', true); if(typeof fabHide==='function') fabHide(); setTimeout(showEnumeratorHome, 50); }
function _showAdminSurveyLock(show){ var lock=document.getElementById('admin-survey-lock'); if(lock){ if(show) lock.classList.add('active'); else lock.classList.remove('active'); } }

//  homeGoSurvey — enumerators only 
function homeGoSurvey(){
  var role=(authGetSession()?.role)||'user';
  // Admins should never reach survey; guard just in case
  if(role==='super_admin'||localStorage.getItem('chsa_is_admin_bypass')==='1'){
    if(typeof initSuperAdminDashboard==='function') initSuperAdminDashboard();
    return;
  }
  if(role==='institution_admin'||localStorage.getItem('chsa_is_inst_admin')==='1'){
    if(typeof initInstAdminDashboard==='function') initInstAdminDashboard();
    return;
  }
  //  INSTITUTION GUARD: student must belong to an institution 
  var sess = authGetSession();
  var hasInstitution = sess && (sess.institution_id || sess.institution_name);
  if(!hasInstitution){
    var modal = document.createElement('div');
    modal.id = 'mss-no-inst-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9800;background:rgba(4,8,15,.92);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = '<div style="background:#0d1826;border:1.5px solid rgba(37,99,235,.35);border-radius:22px;padding:30px 24px;max-width:340px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6);">'
      +'<div style="font-size:2.6rem;margin-bottom:12px;""><svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg></div>'
      +'<div style="color:#fff;font-size:1.05rem;font-weight:800;margin-bottom:8px;">No Institution Linked</div>'
      +'<div style="color:rgba(255,255,255,.55);font-size:.82rem;line-height:1.65;margin-bottom:20px;">'
      +'Your account is not linked to an institution yet. You can add one now without signing out.'
      +'</div>'
      // Institution picker
      +'<div id="mss-ni-pick" style="display:none;margin-bottom:14px;">'
      +'<select id="mss-ni-select" style="width:100%;padding:11px 12px;background:#080f1a;border:1.5px solid rgba(37,99,235,.4);color:#fff;border-radius:10px;font-family:inherit;font-size:.84rem;outline:none;cursor:pointer;margin-bottom:10px;">'
      +'<option value="">Loading institutions…</option>'
      +'</select>'
      +'<button onclick="mssNoInstSave()" style="width:100%;padding:12px;background:linear-gradient(135deg,#1d4ed8,#0d9488);border:none;color:#fff;border-radius:10px;font-family:inherit;font-size:.88rem;font-weight:800;cursor:pointer;margin-bottom:8px;">Save &amp; Continue</button>'
      +'<button onclick="document.getElementById(\'mss-ni-pick\').style.display=\'none\';document.getElementById(\'mss-ni-btns\').style.display=\'block\';" style="width:100%;padding:9px;background:transparent;border:none;color:rgba(255,255,255,.35);font-family:inherit;font-size:.78rem;cursor:pointer;">Cancel</button>'
      +'</div>'
      // Action buttons
      +'<div id="mss-ni-btns">'
      +'<button onclick="mssNoInstShowPicker()" style="width:100%;padding:13px;background:linear-gradient(135deg,#1d4ed8,#0d9488);border:none;color:#fff;border-radius:10px;font-family:inherit;font-size:.88rem;font-weight:800;cursor:pointer;margin-bottom:10px;"> Add Institution</button>'
      +'<button onclick="authSignOut()" style="width:100%;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);border-radius:10px;font-family:inherit;font-size:.8rem;cursor:pointer;">Sign Out &amp; Re-register</button>'
      +'</div>'
      +'</div>';
    document.body.appendChild(modal);

    // Load institutions async
    (async function(){
      var sel = document.getElementById('mss-ni-select');
      if(!sel) return;
      try{
        var data = await window.HS.HSAdmin.getInstitutions();
        var list = (data && data.institutions) || [];
        if(!list.length){ sel.innerHTML='<option value="">No institutions available — contact admin</option>'; return; }
        sel.innerHTML='<option value="">— Select your institution —</option>';
        list.forEach(function(inst){ var o=document.createElement('option'); o.value=inst.id; o.textContent=inst.name; sel.appendChild(o); });
      }catch(e){ sel.innerHTML='<option value="">Could not load — check connection</option>'; }
    })();
    return;
  }
  if(typeof _autoTimer!=='undefined'&&_autoTimer){clearInterval(_autoTimer);_autoTimer=null;}
  // Guard: if secsWrap is empty (init() failed on load), rebuild sections now
  var _sw = document.getElementById('secsWrap');
  if(_sw && _sw.querySelectorAll('.sec-card').length === 0 && typeof init === 'function'){
    init();
  }
  // Start a fresh interview record, reset to section 0, and show survey screen
  if(typeof newRec === 'function'){
    newRec();
  } else {
    showScreen('survey', true);
    if(typeof fabShow==='function') fabShow();
  }
  // Update home→back button state after transition
  setTimeout(function(){ if(typeof _updateSurveyNavBtns==='function') _updateSurveyNavBtns(); }, 380);
}

//  No-Institution helpers 
function mssNoInstShowPicker(){
  var btns = document.getElementById('mss-ni-btns');
  var pick = document.getElementById('mss-ni-pick');
  if(btns) btns.style.display='none';
  if(pick) pick.style.display='block';
}
async function mssNoInstSave(){
  var sel = document.getElementById('mss-ni-select');
  if(!sel || !sel.value){ showToast('Please select an institution', true); return; }
  var instId = sel.value;
  var instName = sel.options[sel.selectedIndex].textContent;
  // Patch the session
  var sess = authGetSession();
  if(sess){
    sess.institution_id = instId;
    sess.institution_name = instName;
    authSaveSession(sess);
  }
  // Also try to update on server if online
  try{
    if(window.HS && window.HS.Auth && typeof window.HS.Auth.updateUserInstitution === 'function'){
      await window.HS.Auth.updateUserInstitution(instId);
    }
  }catch(e){ /* offline — local save is enough */ }
  var modal = document.getElementById('mss-no-inst-modal');
  if(modal) modal.remove();
  showToast('Institution saved — you can now start a survey ');
  // Refresh home page stats
  if(typeof _hpStats === 'function') _hpStats();
}

//  homeGoAdmin — routes to correct admin panel based on role 
function homeGoAdmin(){
  const role=(authGetSession()?.role)||'user';
  if(role==='super_admin'||localStorage.getItem('chsa_is_admin_bypass')==='1'){
    if(typeof _autoTimer!=='undefined'&&_autoTimer){clearInterval(_autoTimer);_autoTimer=null;}
    if(typeof initSuperAdminDashboard==='function') initSuperAdminDashboard();
    return;
  }
  if(role==='institution_admin'||localStorage.getItem('chsa_is_inst_admin')==='1'){
    if(typeof _autoTimer!=='undefined'&&_autoTimer){clearInterval(_autoTimer);_autoTimer=null;}
    if(typeof initInstAdminDashboard==='function') initInstAdminDashboard();
    return;
  }
  // Enumerator — check session gate
  var alreadyVerified=sessionStorage.getItem('adm_ok')==='1';
  if(!alreadyVerified){ showToast('Admin access restricted to authorised personnel',true); return; }
  if(typeof openAdminGate==='function') openAdminGate();
}

/* 
   MSS ERROR NOTIFICATION SYSTEM v6.2
   Surfaces silent failures with context + actionable steps.
    */
(function mssErrors() {
  'use strict';

  /*  Classify errors into human-readable messages  */
  function classify(err, context) {
    const msg = (err?.message || err?.data?.error || String(err) || '').toLowerCase();
    const status = err?.status || err?.code || 0;

    if (msg.includes('networkerror') || msg.includes('failed to fetch') || msg.includes('network request failed'))
      return { title: 'No internet connection', detail: 'Check your network and try again.', action: 'Retry when online — your data is saved locally.', type: 'network' };
    if (msg.includes('jwt') || msg.includes('invalid token') || msg.includes('unauthorized') || status === 401)
      return { title: 'Session expired', detail: 'Your login session has ended.', action: 'Sign out and sign back in.', type: 'auth' };
    if (msg.includes('forbidden') || status === 403)
      return { title: 'Access denied', detail: 'You do not have permission for this action.', action: 'Contact your coordinator or sign in with a different account.', type: 'auth' };
    if (msg.includes('not found') || status === 404)
      return { title: 'Record not found', detail: context ? `Could not find: ${context}` : 'The requested item does not exist.', action: 'Refresh the page or check that the record has not been deleted.', type: 'notfound' };
    if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('unique') || status === 409)
      return { title: 'Duplicate entry', detail: 'This record already exists in the system.', action: 'Try signing in instead of registering.', type: 'duplicate' };
    if (msg.includes('timeout') || msg.includes('aborted'))
      return { title: 'Request timed out', detail: 'The server took too long to respond.', action: 'Check your connection and try again.', type: 'network' };
    if (msg.includes('storage') || msg.includes('quota'))
      return { title: 'Storage full', detail: 'Device storage is full — cannot save data.', action: 'Free up device storage and retry.', type: 'storage' };
    if (msg.includes('service worker') || msg.includes('sw'))
      return { title: 'App cache issue', detail: 'Background sync failed.', action: 'Reload the app. If the problem persists, clear cache and reload.', type: 'sw' };
    if (status >= 500)
      return { title: 'Server error', detail: `Server responded with error ${status}.`, action: 'Wait a moment and try again. If it persists, contact support.', type: 'server' };
    return { title: 'Something went wrong', detail: err?.message || 'An unexpected error occurred.', action: 'Try again. If the problem continues, reload the page.', type: 'unknown' };
  }

  /*  Show an error banner above the form  */
  function showErrorBanner(title, detail, action, type) {
    // Remove existing banner if any
    const old = document.getElementById('mss-err-banner');
    if (old) old.remove();

    const colours = {
      network: '#d97706', auth: '#dc2626', server: '#dc2626',
      duplicate: '#2563eb', notfound: '#8b5cf6', storage: '#dc2626',
      sw: '#d97706', unknown: '#dc2626'
    };
    const color = colours[type] || colours.unknown;

    const banner = document.createElement('div');
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
        <button class="mss-err-close" aria-label="Dismiss" onclick="this.closest('#mss-err-banner').remove()">x</button>
      </div>
      <div class="mss-err-detail">${detail}</div>
      <div class="mss-err-action">${action}</div>
    `;

    document.body.appendChild(banner);

    // Auto-dismiss after 8 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
  }

  /*  Public API  */
  window.MSSError = {
    show(err, context) {
      const info = classify(err, context);
      showErrorBanner(info.title, info.detail, info.action, info.type);
      // Also log to console with full context for debugging
      console.error('[MSS Error]', context || '', err);
    },
    network(context) {
      showErrorBanner(
        'No internet connection',
        context ? `Failed: ${context}` : 'Cannot reach the server.',
        'Check your network. Data is saved locally and will sync when online.',
        'network'
      );
    },
    auth() {
      showErrorBanner(
        'Session expired',
        'Your login session has ended.',
        'Sign out and sign back in.',
        'auth'
      );
    },
    storage(context) {
      showErrorBanner(
        'Could not save data',
        context || 'Failed to write to local storage.',
        'Free up device storage, then try again.',
        'storage'
      );
    }
  };

  /*  Catch unhandled promise rejections and JS errors  */
  window.addEventListener('unhandledrejection', function(event) {
    const err = event.reason;
    // Ignore benign SW-related rejections
    if (!err) return;
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('service worker') || msg.includes('sw')) return;
    if (msg.includes('abortcontroller') || msg.includes('abort')) return;
    window.MSSError.show(err, 'Unhandled error');
    event.preventDefault();
  });

  window.addEventListener('error', function(event) {
    // Only show banner for resource load errors (img, script, link)
    const el = event.target;
    if (el && (el.tagName === 'IMG' || el.tagName === 'LINK')) {
      const src = el.src || el.href || 'unknown resource';
      console.warn('[MSS] Resource failed to load:', src);
    }
  }, true);

  console.log('[MSS] Error notification system active');
})();
