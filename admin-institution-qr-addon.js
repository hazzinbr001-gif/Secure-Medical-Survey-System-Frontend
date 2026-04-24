// ============================================================
// admin-institution-qr-addon.js — MSS v7.0
// NEW PANELS for institution admin dashboard:
//   1. Session Management (create/end session)
//   2. Student Registration
//   3. Student QR Generator
//   4. Admin Notifications
//
// HOW TO USE:
//   Include AFTER admin-institution.js in index.html:
//   <script src="admin-institution-qr-addon.js"></script>
//
//   Then call _iaPatchDashboard() once after initInstAdminDashboard().
//   This adds new nav cards and panel handlers to the existing dashboard.
//
// BACKEND ROUTES USED:
//   POST /api/session/session-create
//   POST /api/session/session-end
//   POST /api/session/session-status
//   GET  /api/session/session-list
//   POST /api/auth/student-register
//   GET  /api/auth/students-list
//   POST /api/auth/student-deactivate
//   POST /api/auth/qr-generate-student
//   POST /api/auth/qr-revoke
//   GET  /api/auth/admin-notifications
//   POST /api/auth/admin-notification-read
// ============================================================

const API = window.HS_API_BASE || '';

// ── JWT helper ───────────────────────────────────────────────
function _addonJWT() {
  try {
    const t = localStorage.getItem('mss-token') || '';
    if (!t) return null;
    return JSON.parse(atob(t.split('.')[1]));
  } catch { return null; }
}

function _addonHeaders() {
  const t = localStorage.getItem('mss-token') || '';
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t };
}

async function _addonFetch(path, opts = {}) {
  const r = await fetch(API + path, { headers: _addonHeaders(), ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

// ── Inject addon styles ──────────────────────────────────────
function _injectAddonStyles() {
  if (document.getElementById('ia-addon-styles')) return;
  const s = document.createElement('style');
  s.id = 'ia-addon-styles';
  s.textContent = `
    .ia-addon-view { position:absolute;inset:0;background:var(--ia-bg,#0b0f1a);z-index:100;display:flex;flex-direction:column;overflow:hidden; }
    .ia-addon-body { flex:1;overflow-y:auto;padding:16px; }
    .ia-addon-card { background:var(--ia-card,#1a2236);border:1px solid var(--ia-border,rgba(255,255,255,.07));border-radius:14px;padding:16px;margin-bottom:12px; }
    .ia-addon-card-title { font-size:.8rem;font-weight:800;margin-bottom:12px;display:flex;align-items:center;gap:8px; }
    .ia-addon-input {
      width:100%;padding:10px 13px;background:rgba(255,255,255,.05);
      border:1px solid rgba(255,255,255,.1);border-radius:10px;
      color:#fff;font-family:inherit;font-size:.85rem;outline:none;
      margin-bottom:10px;box-sizing:border-box;transition:border-color .15s;
    }
    .ia-addon-input:focus { border-color:var(--ia-accent,#0ea572); }
    .ia-addon-btn {
      width:100%;padding:12px;border:none;border-radius:10px;
      font-family:inherit;font-size:.88rem;font-weight:700;cursor:pointer;
      transition:opacity .15s;
    }
    .ia-addon-btn:disabled { opacity:.4;cursor:not-allowed; }
    .ia-addon-btn.primary { background:linear-gradient(135deg,#0ea572,#0d9488);color:#fff; }
    .ia-addon-btn.danger  { background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff; }
    .ia-addon-btn.outline { background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.7); }
    .ia-addon-btn.primary:hover { opacity:.88; }
    .ia-addon-btn.danger:hover  { opacity:.88; }
    .ia-addon-msg { font-size:.75rem;padding:8px 12px;border-radius:8px;margin-bottom:10px; }
    .ia-addon-msg.ok  { background:rgba(14,165,114,.1);color:#34d399;border:1px solid rgba(14,165,114,.2); }
    .ia-addon-msg.err { background:rgba(220,38,38,.1);color:#fca5a5;border:1px solid rgba(220,38,38,.2); }
    .ia-session-status {
      padding:12px 14px;border-radius:10px;margin-bottom:12px;
      display:flex;align-items:center;gap:10px;
    }
    .ia-session-status.active { background:rgba(14,165,114,.1);border:1px solid rgba(14,165,114,.2); }
    .ia-session-status.none   { background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15); }
    .ia-session-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
    .ia-session-dot.active { background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.6); }
    .ia-session-dot.none   { background:#ef4444; }
    .ia-session-info { flex:1; }
    .ia-session-name { font-size:.82rem;font-weight:700; }
    .ia-session-sub  { font-size:.68rem;color:rgba(255,255,255,.45);margin-top:2px; }
    .ia-qr-box {
      background:#fff;border-radius:14px;padding:16px;text-align:center;
      margin:12px 0;display:none;
    }
    .ia-qr-box.show { display:block; }
    .ia-qr-token {
      font-size:1.4rem;font-weight:900;letter-spacing:3px;color:#0b0f1a;
      margin-top:8px;font-family:monospace;
    }
    .ia-qr-label { font-size:.7rem;color:#666;margin-top:4px; }
    .ia-qr-actions { display:flex;gap:8px;margin-top:10px; }
    .ia-qr-actions button {
      flex:1;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
      background:rgba(255,255,255,.06);color:#fff;font-family:inherit;font-size:.75rem;font-weight:700;cursor:pointer;
    }
    .ia-student-row {
      display:flex;align-items:center;gap:10px;
      padding:10px 12px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.06);border-radius:10px;
      margin-bottom:8px;
    }
    .ia-student-avatar {
      width:36px;height:36px;border-radius:50%;
      background:linear-gradient(135deg,#0ea572,#0d9488);
      color:#fff;display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:.9rem;flex-shrink:0;
    }
    .ia-student-avatar.inactive { background:rgba(255,255,255,.1); }
    .ia-student-name { font-size:.82rem;font-weight:700;color:#fff; }
    .ia-student-adm  { font-size:.68rem;color:rgba(255,255,255,.4);margin-top:1px; }
    .ia-student-actions { margin-left:auto;display:flex;gap:6px; }
    .ia-student-btn {
      padding:5px 10px;border-radius:6px;font-family:inherit;font-size:.65rem;font-weight:700;cursor:pointer;
    }
    .ia-student-btn.qr      { background:rgba(37,99,235,.15);border:1px solid rgba(37,99,235,.3);color:#93c5fd; }
    .ia-student-btn.deact   { background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#fca5a5; }
    .ia-student-btn:hover   { opacity:.8; }
    .ia-notif-row {
      padding:11px 13px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:8px;
    }
    .ia-notif-row.unread { border-color:rgba(14,165,114,.2);background:rgba(14,165,114,.04); }
    .ia-notif-title { font-size:.8rem;font-weight:700;margin-bottom:3px; }
    .ia-notif-body  { font-size:.72rem;color:rgba(255,255,255,.5);line-height:1.5; }
    .ia-notif-time  { font-size:.62rem;color:rgba(255,255,255,.25);margin-top:5px; }
    .ia-tabs { display:flex;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:14px; }
    .ia-tab {
      padding:9px 14px;font-size:.74rem;font-weight:700;cursor:pointer;
      border-bottom:2px solid transparent;color:rgba(255,255,255,.4);
      background:none;border-top:none;border-left:none;border-right:none;
      font-family:inherit;transition:color .15s;
    }
    .ia-tab.active { color:#0ea572;border-bottom-color:#0ea572; }
    .ia-session-list-row {
      padding:10px 12px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:8px;
    }
    .ia-session-badge {
      display:inline-block;padding:2px 8px;border-radius:5px;font-size:.62rem;font-weight:700;margin-left:6px;
    }
    .ia-session-badge.active { background:rgba(34,197,94,.15);color:#86efac; }
    .ia-session-badge.closed { background:rgba(255,255,255,.08);color:rgba(255,255,255,.4); }
  `;
  document.head.appendChild(s);
}

// ============================================================
// PATCH — adds new nav cards to existing dashboard home
// Call once after initInstAdminDashboard()
// ============================================================
function _iaPatchDashboard() {
  _injectAddonStyles();

  // Find the nav shelf grid in the rendered dashboard
  setTimeout(() => {
    const dash = document.getElementById('inst-admin-dashboard');
    if (!dash) return;

    const mainContent = dash.querySelector('#ia-main-content');
    if (!mainContent) return;

    // Find shelf grid (the 2-col card grid)
    const shelf = mainContent.querySelector('.ia-shelf-grid');
    if (shelf) {
      // Insert new nav cards
      shelf.insertAdjacentHTML('beforeend', `
        <button class="ia-nav-card" onclick="iaShowSessionPanel()">
          <div class="ia-nav-card-icon" style="background:rgba(245,158,11,.15);color:#f59e0b;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><polyline points="10,6 10,10 13,12"/></svg>
          </div>
          <div class="ia-nav-card-title">Sessions</div>
          <div class="ia-nav-card-sub">Open &amp; close survey sessions</div>
          <span class="ia-nav-card-badge" id="ia-session-badge-nav">Check status</span>
        </button>

        <button class="ia-nav-card" onclick="iaShowStudentsPanel()">
          <div class="ia-nav-card-icon" style="background:rgba(14,165,114,.15);color:#0ea572;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="6" r="3"/><path d="M2 18v-2a5 5 0 0 1 10 0v2"/><line x1="14" y1="8" x2="18" y2="8"/><line x1="16" y1="6" x2="16" y2="10"/></svg>
          </div>
          <div class="ia-nav-card-title">Students</div>
          <div class="ia-nav-card-sub">Register &amp; manage students</div>
          <span class="ia-nav-card-badge" id="ia-students-badge-nav">View list</span>
        </button>

        <button class="ia-nav-card" onclick="iaShowQRPanel()">
          <div class="ia-nav-card-icon" style="background:rgba(46,124,246,.15);color:#60a5fa;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="13" y="13" width="5" height="5" rx="1"/><rect x="4" y="4" width="3" height="3" fill="currentColor"/><rect x="13" y="4" width="3" height="3" fill="currentColor"/><rect x="4" y="13" width="3" height="3" fill="currentColor"/></svg>
          </div>
          <div class="ia-nav-card-title">QR Codes</div>
          <div class="ia-nav-card-sub">Generate &amp; manage access tokens</div>
          <span class="ia-nav-card-badge" id="ia-qr-badge-nav">Manage</span>
        </button>

        <button class="ia-nav-card" onclick="iaShowAdminNotifications()">
          <div class="ia-nav-card-icon" style="background:rgba(167,139,250,.15);color:#a78bfa;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a6 6 0 0 1 6 6v3l2 3H2l2-3V8a6 6 0 0 1 6-6z"/><path d="M8 17a2 2 0 0 0 4 0"/></svg>
          </div>
          <div class="ia-nav-card-title">Notifications</div>
          <div class="ia-nav-card-sub">Admin alerts &amp; messages</div>
          <span class="ia-nav-card-badge alert" id="ia-notif-badge-nav" style="display:none">New</span>
        </button>
      `);
    }

    // Load session status for badge
    _iaLoadSessionBadge();
    // Load notification count
    _iaLoadNotifBadge();
    // Load student count
    _iaLoadStudentsBadge();
  }, 300);
}

// ── Badge loaders ────────────────────────────────────────────
async function _iaLoadSessionBadge() {
  try {
    const d = await _addonFetch('/api/session/session-status', { method: 'POST' });
    const badge = document.getElementById('ia-session-badge-nav');
    if (!badge) return;
    if (d.active) {
      badge.textContent = '● Active';
      badge.style.background = 'rgba(34,197,94,.12)';
      badge.style.color = '#86efac';
    } else {
      badge.textContent = '○ Closed';
      badge.style.background = 'rgba(239,68,68,.1)';
      badge.style.color = '#fca5a5';
    }
  } catch {}
}

async function _iaLoadNotifBadge() {
  try {
    const d = await _addonFetch('/api/auth/admin-notifications');
    const unread = (d.notifications || []).filter(n => !n.read).length;
    const badge = document.getElementById('ia-notif-badge-nav');
    if (badge && unread > 0) {
      badge.textContent = unread + ' New';
      badge.style.display = 'inline-block';
    }
  } catch {}
}

async function _iaLoadStudentsBadge() {
  try {
    const d = await _addonFetch('/api/auth/students-list');
    const badge = document.getElementById('ia-students-badge-nav');
    if (badge) badge.textContent = (d.students || []).length + ' students';
  } catch {}
}

// ============================================================
// PANEL HELPER — creates a full-screen panel over the dashboard
// ============================================================
function _iaCreatePanel(id, title) {
  // Remove existing
  const old = document.getElementById(id);
  if (old) old.remove();

  const dash = document.getElementById('inst-admin-dashboard');
  const panel = document.createElement('div');
  panel.id = id;
  panel.className = 'ia-addon-view';
  panel.innerHTML = `
    <div class="ia-view-header">
      <button class="ia-back-btn" onclick="document.getElementById('${id}').remove()">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13,4 7,10 13,16"/></svg>
        Back
      </button>
      <div class="ia-view-title">${title}</div>
    </div>
    <div class="ia-addon-body" id="${id}-body"></div>
  `;
  dash.appendChild(panel);
  return panel.querySelector('#' + id + '-body');
}

function _showMsg(containerId, msg, type = 'ok') {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = `<div class="ia-addon-msg ${type}">${msg}</div>`;
  setTimeout(() => { if (c) c.innerHTML = ''; }, 4000);
}

// ============================================================
// 1. SESSION MANAGEMENT PANEL
// ============================================================
async function iaShowSessionPanel() {
  const body = _iaCreatePanel('ia-session-panel', 'Session Management');
  body.innerHTML = `<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);">Loading…</div>`;

  try {
    const [statusRes, listRes] = await Promise.all([
      _addonFetch('/api/session/session-status', { method: 'POST' }),
      _addonFetch('/api/session/session-list'),
    ]);

    const active  = statusRes.active ? statusRes.session : null;
    const sessions = listRes.sessions || [];

    body.innerHTML = `
      <!-- Current status -->
      <div class="ia-addon-card">
        <div class="ia-addon-card-title">⏱ Current Status</div>
        <div class="ia-session-status ${active ? 'active' : 'none'}">
          <div class="ia-session-dot ${active ? 'active' : 'none'}"></div>
          <div class="ia-session-info">
            <div class="ia-session-name">${active ? active.name : 'No active session'}</div>
            <div class="ia-session-sub">${active ? 'Started: ' + new Date(active.start_time).toLocaleString('en-KE') : 'System is locked — students cannot submit surveys'}</div>
          </div>
        </div>

        ${!active ? `
          <!-- Create session -->
          <div class="ia-addon-card-title" style="margin-top:14px;">🆕 Open New Session</div>
          <input class="ia-addon-input" id="ia-session-name-input" placeholder="Session name e.g. May 2026 Health Survey" maxlength="80">
          <div id="ia-session-create-msg"></div>
          <button class="ia-addon-btn primary" onclick="iaCreateSession()">Open Session</button>
        ` : `
          <!-- End session -->
          <div class="ia-addon-card-title" style="margin-top:14px;color:#fca5a5;">🔒 End Session</div>
          <div style="font-size:.74rem;color:rgba(255,255,255,.4);margin-bottom:10px;line-height:1.6;">
            Ending the session will:<br>
            • Lock the system — no more survey submissions<br>
            • Revoke all student QR codes<br>
            • Generate the session report<br><br>
            Enter your password to confirm.
          </div>
          <input class="ia-addon-input" id="ia-session-end-pass" type="password" placeholder="Your admin password">
          <div id="ia-session-end-msg"></div>
          <button class="ia-addon-btn danger" onclick="iaEndSession('${active.id}')">End Session &amp; Lock System</button>
        `}
      </div>

      <!-- Session history -->
      <div class="ia-addon-card">
        <div class="ia-addon-card-title">📋 Session History</div>
        ${sessions.length === 0 ? `<div style="color:rgba(255,255,255,.3);font-size:.78rem;text-align:center;padding:16px;">No sessions yet</div>` :
          sessions.map(s => `
            <div class="ia-session-list-row">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="font-size:.8rem;font-weight:700;">${s.name}
                  <span class="ia-session-badge ${s.status}">${s.status}</span>
                </div>
                ${s.session_reports && s.session_reports[0] ? `
                  <div style="font-size:.68rem;color:#0ea572;font-weight:700;">
                    ${s.session_reports[0].completion_rate}% complete
                  </div>` : ''}
              </div>
              <div style="font-size:.65rem;color:rgba(255,255,255,.3);margin-top:3px;">
                ${new Date(s.start_time).toLocaleDateString('en-KE')}
                ${s.end_time ? ' → ' + new Date(s.end_time).toLocaleDateString('en-KE') : ''}
              </div>
              ${s.session_reports && s.session_reports[0] ? `
                <div style="margin-top:8px;display:flex;gap:8px;font-size:.7rem;">
                  <span style="color:rgba(255,255,255,.4);">${s.session_reports[0].total_submitted} / ${s.session_reports[0].total_students} submitted</span>
                </div>` : ''}
            </div>
          `).join('')}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="ia-addon-msg err">Failed to load sessions: ${err.message}</div>`;
  }
}

async function iaCreateSession() {
  const name = (document.getElementById('ia-session-name-input')?.value || '').trim();
  if (!name) { _showMsg('ia-session-create-msg', 'Enter a session name', 'err'); return; }
  const btn = document.querySelector('#ia-session-panel .ia-addon-btn.primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Opening…'; }
  try {
    await _addonFetch('/api/session/session-create', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    _showMsg('ia-session-create-msg', '✅ Session opened! Students can now scan QR codes.', 'ok');
    setTimeout(() => iaShowSessionPanel(), 1500);
    _iaLoadSessionBadge();
  } catch (err) {
    _showMsg('ia-session-create-msg', err.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Open Session'; }
  }
}

async function iaEndSession(sessionId) {
  const pass = (document.getElementById('ia-session-end-pass')?.value || '').trim();
  if (!pass) { _showMsg('ia-session-end-msg', 'Enter your password to confirm', 'err'); return; }
  if (!confirm('⚠ End this session?\n\nThis will lock the system and revoke all student QR codes. This cannot be undone.')) return;
  const btn = document.querySelector('#ia-session-panel .ia-addon-btn.danger');
  if (btn) { btn.disabled = true; btn.textContent = 'Ending session…'; }
  try {
    const d = await _addonFetch('/api/session/session-end', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, password: pass })
    });
    _showMsg('ia-session-end-msg', '✅ Session closed. Report generated.', 'ok');
    setTimeout(() => iaShowSessionPanel(), 1800);
    _iaLoadSessionBadge();
    // Lock UI if session guard is loaded
    if (window.MSS && window.MSS.SessionGuard) {
      window.MSS.SessionGuard.lockUI('Session has ended. System is now locked.');
    }
  } catch (err) {
    _showMsg('ia-session-end-msg', err.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'End Session & Lock System'; }
  }
}

// ============================================================
// 2. STUDENTS PANEL
// ============================================================
async function iaShowStudentsPanel() {
  const body = _iaCreatePanel('ia-students-panel', 'Students');
  body.innerHTML = `<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);">Loading…</div>`;
  await _iaRenderStudentsPanel(body);
}

async function _iaRenderStudentsPanel(body) {
  try {
    const d = await _addonFetch('/api/auth/students-list');
    const students = d.students || [];
    const active   = students.filter(s => s.active);
    const inactive = students.filter(s => !s.active);

    body.innerHTML = `
      <!-- Register new student -->
      <div class="ia-addon-card">
        <div class="ia-addon-card-title">➕ Register Student</div>
        <input class="ia-addon-input" id="ia-reg-name" placeholder="Full Name" maxlength="100">
        <input class="ia-addon-input" id="ia-reg-adm"  placeholder="Admission Number e.g. ADM/2024/001" maxlength="50" style="text-transform:uppercase;">
        <div id="ia-reg-msg"></div>
        <button class="ia-addon-btn primary" onclick="iaRegisterStudent()">Register Student</button>
      </div>

      <!-- Student list -->
      <div class="ia-addon-card">
        <div class="ia-addon-card-title">👥 Students (${active.length} active)</div>
        ${active.length === 0 ? `<div style="color:rgba(255,255,255,.3);font-size:.78rem;text-align:center;padding:16px;">No students registered yet</div>` :
          active.map(s => _iaStudentRow(s, true)).join('')}

        ${inactive.length > 0 ? `
          <div style="font-size:.65rem;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.8px;margin:14px 0 8px;">Deactivated (${inactive.length})</div>
          ${inactive.map(s => _iaStudentRow(s, false)).join('')}
        ` : ''}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="ia-addon-msg err">Failed to load students: ${err.message}</div>`;
  }
}

function _iaStudentRow(s, active) {
  const initials = (s.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `
    <div class="ia-student-row" id="ia-student-${s.id}">
      <div class="ia-student-avatar ${active ? '' : 'inactive'}">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div class="ia-student-name">${s.name}</div>
        <div class="ia-student-adm">${s.admission_no}</div>
      </div>
      <div class="ia-student-actions">
        ${active ? `
          <button class="ia-student-btn qr" onclick="iaGenerateStudentQR('${s.id}','${s.name.replace(/'/g,'')}','${s.admission_no}')">QR</button>
          <button class="ia-student-btn deact" onclick="iaDeactivateStudent('${s.id}')">✕</button>
        ` : `<span style="font-size:.65rem;color:rgba(255,255,255,.25);">Inactive</span>`}
      </div>
    </div>
  `;
}

async function iaRegisterStudent() {
  const name = (document.getElementById('ia-reg-name')?.value || '').trim();
  const adm  = (document.getElementById('ia-reg-adm')?.value  || '').trim().toUpperCase();
  if (!name) { _showMsg('ia-reg-msg', 'Enter student name', 'err'); return; }
  if (!adm)  { _showMsg('ia-reg-msg', 'Enter admission number', 'err'); return; }
  const btn = document.querySelector('#ia-students-panel .ia-addon-btn.primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Registering…'; }
  try {
    await _addonFetch('/api/auth/student-register', {
      method: 'POST',
      body: JSON.stringify({ name, admission_no: adm })
    });
    _showMsg('ia-reg-msg', `✅ ${name} registered successfully`, 'ok');
    document.getElementById('ia-reg-name').value = '';
    document.getElementById('ia-reg-adm').value  = '';
    // Reload panel
    const body = document.getElementById('ia-students-panel-body');
    if (body) await _iaRenderStudentsPanel(body);
    _iaLoadStudentsBadge();
  } catch (err) {
    _showMsg('ia-reg-msg', err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Register Student'; }
  }
}

async function iaDeactivateStudent(studentId) {
  if (!confirm('Deactivate this student? Their QR code will stop working.')) return;
  try {
    await _addonFetch('/api/auth/student-deactivate', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId })
    });
    const row = document.getElementById('ia-student-' + studentId);
    if (row) row.style.opacity = '0.35';
    showToast('Student deactivated');
  } catch (err) {
    showToast('Failed: ' + err.message, true);
  }
}

// ============================================================
// 3. QR CODES PANEL
// ============================================================
async function iaShowQRPanel() {
  const body = _iaCreatePanel('ia-qr-panel', 'QR Codes');
  body.innerHTML = `<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);">Loading…</div>`;

  try {
    const [studentsRes, tokensRes] = await Promise.all([
      _addonFetch('/api/auth/students-list'),
      _addonFetch('/api/auth/qr-list'),
    ]);

    const students = (studentsRes.students || []).filter(s => s.active);
    const tokens   = tokensRes.tokens || [];

    body.innerHTML = `
      <!-- Generate QR for student -->
      <div class="ia-addon-card">
        <div class="ia-addon-card-title">🔑 Generate Student QR</div>
        <select class="ia-addon-input" id="ia-qr-student-select" style="cursor:pointer;">
          <option value="">— Select a student —</option>
          ${students.map(s => `<option value="${s.id}">${s.name} (${s.admission_no})</option>`).join('')}
        </select>
        <div id="ia-qr-gen-msg"></div>
        <button class="ia-addon-btn primary" onclick="iaGenerateQRFromSelect()">Generate QR Code</button>

        <!-- QR display box -->
        <div class="ia-qr-box" id="ia-qr-display">
          <div id="ia-qr-img-wrap"></div>
          <div class="ia-qr-token" id="ia-qr-token-text"></div>
          <div class="ia-qr-label">Student can type this token on desktop</div>
          <div class="ia-qr-actions">
            <button onclick="iaCopyToken()">📋 Copy Token</button>
            <button onclick="iaDownloadQR()">⬇ Download QR</button>
          </div>
        </div>
      </div>

      <!-- Active tokens -->
      <div class="ia-addon-card">
        <div class="ia-addon-card-title">🗂 Active Tokens (${tokens.filter(t=>!t.revoked).length})</div>
        ${tokens.length === 0 ? `<div style="color:rgba(255,255,255,.3);font-size:.78rem;text-align:center;padding:16px;">No tokens generated yet</div>` :
          tokens.map(t => `
            <div style="padding:9px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:8px;${t.revoked ? 'opacity:.4;' : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                  <div style="font-size:.78rem;font-weight:700;font-family:monospace;letter-spacing:1px;">${t.token}</div>
                  <div style="font-size:.65rem;color:rgba(255,255,255,.35);margin-top:2px;">${t.label || t.token_type} · Expires ${new Date(t.expires_at).toLocaleDateString('en-KE')}</div>
                </div>
                ${!t.revoked ? `
                  <button onclick="iaRevokeToken('${t.id}')"
                    style="padding:4px 9px;border-radius:6px;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#fca5a5;font-size:.63rem;font-weight:700;cursor:pointer;font-family:inherit;">
                    Revoke
                  </button>` : `<span style="font-size:.65rem;color:rgba(255,255,255,.25);">Revoked</span>`}
              </div>
            </div>
          `).join('')}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="ia-addon-msg err">Failed to load QR panel: ${err.message}</div>`;
  }
}

let _lastGeneratedToken = '';
let _lastGeneratedURL   = '';

async function iaGenerateQRFromSelect() {
  const sel = document.getElementById('ia-qr-student-select');
  if (!sel || !sel.value) { _showMsg('ia-qr-gen-msg', 'Select a student first', 'err'); return; }
  await iaGenerateStudentQR(sel.value, sel.options[sel.selectedIndex].text, '');
}

async function iaGenerateStudentQR(studentId, name, admNo) {
  const btn = document.querySelector('#ia-qr-panel .ia-addon-btn.primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    const d = await _addonFetch('/api/auth/qr-generate-student', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId })
    });

    _lastGeneratedToken = d.token;
    _lastGeneratedURL   = d.qr_url;

    // Show QR box
    const box = document.getElementById('ia-qr-display');
    if (box) box.classList.add('show');

    // Token text
    const tokenEl = document.getElementById('ia-qr-token-text');
    if (tokenEl) tokenEl.textContent = d.token;

    // Generate QR image using qrcode.js CDN (loaded if not already)
    await _iaRenderQRImage(d.qr_url);

    _showMsg('ia-qr-gen-msg', `✅ QR generated for ${name || d.student?.name}`, 'ok');
    // Reload tokens list
    setTimeout(iaShowQRPanel, 2000);
  } catch (err) {
    _showMsg('ia-qr-gen-msg', err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate QR Code'; }
  }
}

async function _iaRenderQRImage(url) {
  const wrap = document.getElementById('ia-qr-img-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  // Load qrcode.js from CDN if not available
  if (typeof QRCode === 'undefined') {
    await new Promise((res, rej) => {
      const s  = document.createElement('script');
      s.src    = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const canvas = document.createElement('div');
  canvas.id = 'ia-qr-canvas-' + Date.now();
  canvas.style.display = 'flex';
  canvas.style.justifyContent = 'center';
  wrap.appendChild(canvas);

  new QRCode(canvas, {
    text:           url,
    width:          200,
    height:         200,
    colorDark:      '#000000',
    colorLight:     '#ffffff',
    correctLevel:   QRCode.CorrectLevel.M,
  });
}

function iaCopyToken() {
  if (!_lastGeneratedToken) return;
  navigator.clipboard.writeText(_lastGeneratedToken)
    .then(() => showToast('Token copied: ' + _lastGeneratedToken))
    .catch(() => { prompt('Copy this token:', _lastGeneratedToken); });
}

function iaDownloadQR() {
  const canvas = document.querySelector('#ia-qr-img-wrap canvas');
  if (!canvas) { showToast('QR image not ready', true); return; }
  const a = document.createElement('a');
  a.download = 'MSS-QR-' + _lastGeneratedToken + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

async function iaRevokeToken(tokenId) {
  if (!confirm('Revoke this token? The student will be logged out.')) return;
  try {
    await _addonFetch('/api/auth/qr-revoke', {
      method: 'POST',
      body: JSON.stringify({ token_id: tokenId })
    });
    showToast('Token revoked');
    iaShowQRPanel();
  } catch (err) {
    showToast('Failed: ' + err.message, true);
  }
}

// ============================================================
// 4. ADMIN NOTIFICATIONS PANEL
//    Strictly admin-only. Student notifications are separate.
// ============================================================
async function iaShowAdminNotifications() {
  const body = _iaCreatePanel('ia-notif-panel', 'Notifications');
  body.innerHTML = `<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);">Loading…</div>`;

  try {
    const d = await _addonFetch('/api/auth/admin-notifications');
    const notifications = d.notifications || [];

    if (notifications.length === 0) {
      body.innerHTML = `
        <div style="text-align:center;padding:48px 20px;">
          <div style="font-size:36px;margin-bottom:12px;">🔔</div>
          <div style="color:rgba(255,255,255,.3);font-size:.82rem;">No notifications yet</div>
        </div>`;
      return;
    }

    body.innerHTML = notifications.map(n => `
      <div class="ia-notif-row ${n.read ? '' : 'unread'}" id="ia-notif-${n.id}"
        onclick="iaMarkNotifRead('${n.id}')">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
          <div class="ia-notif-title">
            ${n.type === 'success' ? '✅' : n.type === 'warning' ? '⚠️' : n.type === 'error' ? '❌' : 'ℹ️'}
            ${n.title}
          </div>
          ${!n.read ? `<span style="width:7px;height:7px;border-radius:50%;background:#0ea572;flex-shrink:0;"></span>` : ''}
        </div>
        <div class="ia-notif-body">${n.body}</div>
        <div class="ia-notif-time">${new Date(n.created_at).toLocaleString('en-KE')}</div>
      </div>
    `).join('');

    // Update badge
    const badge = document.getElementById('ia-notif-badge-nav');
    if (badge) badge.style.display = 'none';
  } catch (err) {
    body.innerHTML = `<div class="ia-addon-msg err">Failed to load notifications: ${err.message}</div>`;
  }
}

async function iaMarkNotifRead(notifId) {
  try {
    await _addonFetch('/api/auth/admin-notification-read', {
      method: 'POST',
      body: JSON.stringify({ notification_id: notifId })
    });
    const row = document.getElementById('ia-notif-' + notifId);
    if (row) row.classList.remove('unread');
  } catch {}
}

// ============================================================
// AUTO-PATCH — runs after initInstAdminDashboard is called
// ============================================================
// Override initInstAdminDashboard to auto-patch after init
const _origInitInstAdmin = window.initInstAdminDashboard;
window.initInstAdminDashboard = function() {
  if (typeof _origInitInstAdmin === 'function') _origInitInstAdmin();
  // Patch after a short delay to let dashboard render
  setTimeout(_iaPatchDashboard, 400);
};
