/* api-client.js — v5.0 Premium Health Survey
 * Central API client. Replaces all direct Supabase calls in the frontend.
 * All requests go through the secure Vercel API layer with JWT auth.
 *
 * SETUP: Set your Vercel deployment URL below, or it defaults to same origin.
 */

const API_BASE = window.HS_API_BASE || '';
console.log('[HS] API_BASE =', API_BASE || '(same origin)');

//  Token management 
const Auth = {
  setToken(token) { localStorage.setItem('hs_jwt_token', token); },
  getToken() {
    return localStorage.getItem('hs_jwt_token')
        || sessionStorage.getItem('hs_jwt_token')
        // Fallback: token embedded in session objects (both keys written by authSaveSession)
        || (() => { try { return JSON.parse(localStorage.getItem('chsa_session') || '{}').token || ''; } catch { return ''; } })()
        || (() => { try { return JSON.parse(localStorage.getItem('chsa_auth')    || '{}').token || ''; } catch { return ''; } })()
        || '';
  },
  clearToken() {
    localStorage.removeItem('hs_jwt_token');
    // Also wipe the token from both session stores so logout is complete
    ['chsa_session', 'chsa_auth'].forEach(key => {
      try {
        const s = JSON.parse(localStorage.getItem(key) || '{}');
        if (s.token) { delete s.token; localStorage.setItem(key, JSON.stringify(s)); }
      } catch {}
    });
  },
  isLoggedIn()    { return !!this.getToken(); },
  getPayload() {
    try { return JSON.parse(atob(this.getToken().split('.')[1])); }
    catch { return null; }
  },
  getInstitutionId() {
    // Try JWT payload first, then fall back to either session key
    const fromJWT = this.getPayload()?.institution_id || null;
    if (fromJWT) return fromJWT;
    try { const v = JSON.parse(localStorage.getItem('chsa_session') || '{}').institution_id; if (v) return v; } catch {}
    try { return JSON.parse(localStorage.getItem('chsa_auth') || '{}').institution_id || null; } catch { return null; }
  },
  getRole() {
    // Try JWT payload first, then either session key
    const fromJWT = this.getPayload()?.role || null;
    if (fromJWT) return fromJWT;
    try { const v = JSON.parse(localStorage.getItem('chsa_session') || '{}').role; if (v) return v; } catch {}
    try { return JSON.parse(localStorage.getItem('chsa_auth') || '{}').role || 'user'; } catch { return 'user'; }
  },
  isAdmin()      { return ['institution_admin','super_admin'].includes(this.getRole()); },
  isSuperAdmin() { return this.getRole() === 'super_admin' || localStorage.getItem('chsa_is_admin_bypass') === '1'; },
};

//  Base fetch wrapper 
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  let res;
  try {
    res = await fetch(API_BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (networkErr) {
    // Network error — server unreachable or CORS blocked
    console.error('[HS] Network error:', API_BASE + path, networkErr);
    throw Object.assign(new Error('Network error — check your connection or try again'), { status: 0 });
  }

  if (res.status === 401) {
    // Only treat as session-expired if user was already logged in (had a token)
    if (token) {
      Auth.clearToken();
      window.dispatchEvent(new CustomEvent('hs:session-expired'));
    }
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

//  Auth endpoints 
const HSAuth = {
  async register(payload) {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    if (data.token) Auth.setToken(data.token);
    return data;
  },

  async login(email, password) {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.token) Auth.setToken(data.token);
    return data;
  },

  async superLogin(code) {
    const data = await apiFetch('/api/auth/superlogin', { method: 'POST', body: JSON.stringify({ code }) });
    if (data.token) Auth.setToken(data.token);
    return data;
  },

  logout() {
    Auth.clearToken();
    window.location.reload();
  },

  getSSOUrl(provider) {
    return `${API_BASE}/api/auth/sso?provider=${provider}`;
  },

  // Call this on the /auth/callback page after SSO redirect
  handleSSOCallback() {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    if (token) {
      Auth.setToken(token);
      // Remove token from URL
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
      return { token, isNew: params.get('new') === 'true', provider: params.get('provider') };
    }
    return null;
  },
};

//  Survey endpoints 
const HSSurvey = {
  async submit(payload) {
    return apiFetch('/api/survey/submit', { method: 'POST', body: JSON.stringify(payload) });
  },

  async get(id) {
    return apiFetch(`/api/survey/${id}`);
  },
};

//  Report endpoints 
const HSReport = {
  async generate(record_id) {
    return apiFetch('/api/report/generate', { method: 'POST', body: JSON.stringify({ record_id }) });
  },

  async get(id) {
    return apiFetch(`/api/report/${id}`);
  },

  async sendAlert(record_id, channels = ['email', 'sms']) {
    return apiFetch('/api/report/alert', { method: 'POST', body: JSON.stringify({ record_id, channels }) });
  },

  getPDFUrl(insight_id) {
    return `${API_BASE}/api/report/pdf/${insight_id}`;
  },

  async downloadPDF(insight_id) {
    const token    = Auth.getToken();
    const res      = await fetch(`${API_BASE}/api/report/pdf/${insight_id}`, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    });
    if (!res.ok) throw new Error('PDF download failed');
    const blob     = await res.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `health-report-${insight_id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

//  AI endpoints 
const HSAI = {
  async score(record_id, survey_data) {
    return apiFetch('/api/ai/score', { method: 'POST', body: JSON.stringify({ record_id, survey_data }) });
  },

  async batchScore(force = false) {
    return apiFetch('/api/ai/batch-score', { method: 'POST', body: JSON.stringify({ force }) });
  },
};

//  Analytics endpoints 
const HSAnalytics = {
  async summary(institution_id) {
    const qs = institution_id ? `?institution_id=${institution_id}` : '';
    return apiFetch(`/api/analytics/summary${qs}`);
  },
};

//  Geo endpoints 
const HSInsights = {
  async map(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return apiFetch(`/api/insights/map${qs ? '?' + qs : ''}`);
  },

  async hotspots(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return apiFetch(`/api/insights/hotspots${qs ? '?' + qs : ''}`);
  },
};

//  ML endpoints 
// ML merged into HSInsights
const HSML = {
  async predict(household_id, weeks = 12) {
    return apiFetch(`/api/insights/predict?household_id=${encodeURIComponent(household_id)}&weeks=${weeks}`);
  },

  async trends(days = 180) {
    return apiFetch(`/api/insights/trends?days=${days}`);
  },
};

//  Admin endpoints 
const HSAdmin = {
  async dashboard() {
    return apiFetch('/api/admin/dashboard');
  },

  async getInterventions(status) {
    const qs = status ? `?status=${status}` : '';
    return apiFetch(`/api/admin/interventions${qs}`);
  },

  async updateIntervention(id, patch) {
    return apiFetch(`/api/admin/interventions?id=${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  // Records management — replaces direct Supabase calls in survey-admin.js
  async getRecords(institution_id) {
    const qs = institution_id ? `?institution_id=${encodeURIComponent(institution_id)}` : '';
    return apiFetch(`/api/admin/records${qs}`);
  },

  async updateRecord(id, patch) {
    return apiFetch(`/api/admin/records?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async deleteRecord(id) {
    return apiFetch(`/api/admin/records?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // Students management — replaces direct Supabase calls in survey-admin.js
  async getStudents(institution_id) {
    const qs = institution_id ? `?institution_id=${encodeURIComponent(institution_id)}` : '';
    return apiFetch(`/api/admin/students${qs}`);
  },

  async updateStudent(reg_number, patch) {
    return apiFetch(`/api/admin/students?reg_number=${encodeURIComponent(reg_number)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async deleteStudent(reg_number) {
    return apiFetch(`/api/admin/students?reg_number=${encodeURIComponent(reg_number)}`, { method: 'DELETE' });
  },

  // Institutions — public GET (no auth), POST requires super_admin
  async getInstitutions() {
    return apiFetch('/api/admin/institutions');
  },

  async addInstitution(name, code) {
    return apiFetch('/api/admin/institutions', { method: 'POST', body: JSON.stringify({ name, code }) });
  },

  // Institution Profile — GET reads profile, POST upserts it
  // Both are scoped to the caller's institution_id (or a specific one for super_admin).
  async getInstitutionProfile(institution_id) {
    const qs = institution_id ? `?institution_id=${encodeURIComponent(institution_id)}` : '';
    return apiFetch(`/api/admin/profile${qs}`);
  },

  async updateInstitutionProfile(institution_id, data) {
    return apiFetch(`/api/admin/profile?institution_id=${encodeURIComponent(institution_id)}`, {
      method: 'POST',
      body: JSON.stringify({ institution_id, ...data }),
    });
  },

  // Image upload — sends base64 image through the secure backend (avoids exposing Supabase service key)
  async uploadImage(image_base64, folder = 'evidence', filename) {
    return apiFetch('/api/admin/upload-image', {
      method: 'POST',
      body: JSON.stringify({ image_base64, folder, ...(filename ? { filename } : {}) }),
    });
  },
};

//  Survey Builder endpoints 
const HSBuilder = {
  async list() {
    return apiFetch('/api/builder/questionnaires');
  },

  async create(payload) {
    return apiFetch('/api/builder/questionnaires', { method: 'POST', body: JSON.stringify(payload) });
  },

  async get(id) {
    return apiFetch(`/api/builder/${id}`);
  },

  async update(id, patch) {
    return apiFetch(`/api/builder/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async deactivate(id) {
    return apiFetch(`/api/builder/${id}`, { method: 'DELETE' });
  },
};

//  Push Notifications 
const HSPush = {
  async getVapidKey() {
    const data = await apiFetch('/api/push/vapid-public-key');
    return data.vapid_public_key;
  },

  async subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications not supported in this browser');
    }
    const vapidKey = await this.getVapidKey();
    const reg      = await navigator.serviceWorker.ready;
    const sub      = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: vapidKey,
    });
    return apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON(), type: 'web' }),
    });
  },

  async send(title, message, risk_level = 'medium') {
    return apiFetch('/api/push/send', {
      method: 'POST',
      body: JSON.stringify({ title, message, risk_level }),
    });
  },
};

//  Expose globally 
window.HS = {
  Auth, HSAuth, HSSurvey, HSReport, HSAI,
  HSAnalytics, HSInsights, HSML, HSAdmin, HSBuilder, HSPush,
};

// Listen for session expiry
window.addEventListener('hs:session-expired', () => {
  console.warn('[HS] Session expired — redirecting to login');
  Auth.clearToken();
  // Don't reload if user is on the welcome/auth screen already
  const ws = document.getElementById('welcome-screen');
  const onAuthScreen = ws && ws.style.display !== 'none';
  if (onAuthScreen) return;
  window.location.reload();
});
