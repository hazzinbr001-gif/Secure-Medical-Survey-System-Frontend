/**
 * survey-identity.js  v1.0
 * Media & Identity Layer — Medical Survey System (MSS)
 *
 * DATA MODELS
 * ─────────────────────────────────────────────────────
 * Student profile  (localStorage key: "mss_identity_student")
 * {
 *   studentId, name, institutionId,
 *   profilePhotoUrl,   ← stored as IndexedDB blob key (NOT base64)
 *   fieldPhotoUrl
 * }
 *
 * Institution context  (localStorage key: "mss_identity_institution")
 * {
 *   institutionId, name,
 *   county, subcounty,
 *   groupPhotoUrl,
 *   mapScreenshotUrl
 * }
 *
 * Images are stored in IndexedDB ("mssMediaDB", store "photos")
 * Keys are UUIDs generated at upload time.
 * Survey records never store images directly — they link via studentId/institutionId.
 *
 * SYNC STRATEGY
 * ─────────────────────────────────────────────────────
 * On sync:  read blob from IDB → upload to Supabase Storage → write back public URL.
 * While offline: blobs are read from IDB and displayed via createObjectURL.
 */

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

const MSS_MEDIA_DB   = 'mssMediaDB';
const MSS_MEDIA_STORE = 'photos';

function _openMediaDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MSS_MEDIA_DB, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(MSS_MEDIA_STORE);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _saveBlob(key, blob) {
  const db = await _openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MSS_MEDIA_STORE, 'readwrite');
    tx.objectStore(MSS_MEDIA_STORE).put(blob, key);
    tx.oncomplete = () => resolve(key);
    tx.onerror    = e  => reject(e.target.error);
  });
}

async function _getBlob(key) {
  if (!key) return null;
  // If it's already a remote URL, return as-is
  if (key.startsWith('http')) return key;
  const db = await _openMediaDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(MSS_MEDIA_STORE).objectStore(MSS_MEDIA_STORE).get(key);
    req.onsuccess = e => {
      const blob = e.target.result;
      resolve(blob ? URL.createObjectURL(blob) : null);
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function _deleteBlob(key) {
  if (!key || key.startsWith('http')) return;
  const db = await _openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MSS_MEDIA_STORE, 'readwrite');
    tx.objectStore(MSS_MEDIA_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = e  => reject(e.target.error);
  });
}

function _uuid() {
  return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

// ─── Data accessors ──────────────────────────────────────────────────────────

function getStudentIdentity() {
  try { return JSON.parse(localStorage.getItem('mss_identity_student') || 'null'); }
  catch { return null; }
}
function saveStudentIdentity(data) {
  localStorage.setItem('mss_identity_student', JSON.stringify(data));
  // Push to backend so reports always have current profile data
  _pushStudentProfileToServer(data);
}

/**
 * Pushes student profile fields to the backend (non-blocking, best-effort).
 * Only sends URL fields — never sends raw base64 blobs.
 * Called automatically on every saveStudentIdentity().
 */
async function _pushStudentProfileToServer(data) {
  try {
    const token = localStorage.getItem('hs_jwt_token')
      || sessionStorage.getItem('hs_jwt_token')
      || (() => { try { return JSON.parse(localStorage.getItem('chsa_auth') || '{}').token || ''; } catch { return ''; } })()
      || '';
    if (!token) return;

    const isUrl = v => typeof v === 'string' && v.startsWith('http');
    const patch = {};
    if (data.name)                   patch.full_name         = data.name;
    if (isUrl(data.profilePhotoUrl)) patch.profile_photo_url = data.profilePhotoUrl;
    if (isUrl(data.fieldPhotoUrl))   patch.field_photo_1_url = data.fieldPhotoUrl;

    if (!Object.keys(patch).length) return;

    const API_BASE = window.HS_API_BASE || '';
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

    // 1. Save to server
    const saveRes = await fetch(`${API_BASE}/api/admin?action=student-profile`, {
      method: 'PATCH', headers, body: JSON.stringify(patch),
    });

    if (!saveRes.ok) {
      console.warn('[identity] profile push failed HTTP', saveRes.status);
      if (typeof showToast === 'function') showToast('Warning: Profile not saved to server', true);
      return;
    }

    // 2. Verify — read back from server and confirm key fields match
    const verifyRes = await fetch(`${API_BASE}/api/admin?action=student-profile`, { headers });
    if (!verifyRes.ok) {
      if (typeof showToast === 'function') showToast('Profile saved');
      return;
    }

    const serverData = await verifyRes.json();
    const nameMatch = !patch.full_name || serverData.full_name === patch.full_name;

    if (nameMatch) {
      console.log('[identity] profile verified on server');
      if (typeof showToast === 'function') showToast('Profile saved and verified');
    } else {
      console.warn('[identity] profile save mismatch — server:', serverData.full_name, 'expected:', patch.full_name);
      if (typeof showToast === 'function') showToast('Warning: Profile may not have saved correctly', true);
    }
  } catch (e) {
    console.warn('[identity] profile push failed (non-fatal):', e.message);
    if (typeof showToast === 'function') showToast('Profile saved locally only (offline)', true);
  }
}

function getInstitutionIdentity() {
  try { return JSON.parse(localStorage.getItem('mss_identity_institution') || 'null'); }
  catch { return null; }
}
function saveInstitutionIdentity(data) {
  localStorage.setItem('mss_identity_institution', JSON.stringify(data));
}

// ─── Photo upload helper ──────────────────────────────────────────────────────

/**
 * Opens a file picker, saves the selected image to IDB, returns the IDB key.
 * @param {string} accept  e.g. "image/*"
 * @param {number} maxSizeMB  soft warn threshold
 * @returns {Promise<string|null>} IDB key
 */
function _pickAndSavePhoto(accept, maxSizeMB = 5) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = accept || 'image/*';
    input.capture = 'environment'; // prefer rear camera on mobile

    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);

      if (file.size > maxSizeMB * 1024 * 1024) {
        if (!confirm(`This image is ${(file.size / 1024 / 1024).toFixed(1)} MB.\nLarge images may slow down the app.\nContinue anyway?`)) {
          return resolve(null);
        }
      }

      const key = _uuid();
      await _saveBlob(key, file);
      resolve(key);
    };

    input.click();
  });
}

// ─── Student Profile Modal ───────────────────────────────────────────────────

async function openStudentProfileModal() {
  const existing = getStudentIdentity() || {};

  const overlay = document.createElement('div');
  overlay.id = 'mss-identity-modal';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);
    display:flex;align-items:flex-end;justify-content:center;
    font-family:'Sora',sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      width:100%;max-width:480px;background:#0d1826;border-radius:24px 24px 0 0;
      padding:24px 20px calc(24px + env(safe-area-inset-bottom));
      max-height:92vh;overflow-y:auto;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="color:#fff;font-size:1.1rem;font-weight:800">🎓 Student Profile</div>
        <button onclick="document.getElementById('mss-identity-modal').remove()"
          style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:50%;
                 width:32px;height:32px;font-size:1.1rem;cursor:pointer;font-family:inherit">✕</button>
      </div>

      <div style="color:rgba(255,255,255,.45);font-size:.72rem;margin-bottom:16px;line-height:1.5">
        Add your photos to make reports credible. Images are stored locally and synced securely.
      </div>

      <!-- Profile photo -->
      <div style="margin-bottom:16px">
        <div style="color:rgba(255,255,255,.6);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
          Profile Photo (square)
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div id="sp-profile-preview" style="
            width:72px;height:72px;border-radius:12px;
            background:rgba(255,255,255,.08);border:2px dashed rgba(255,255,255,.2);
            overflow:hidden;display:flex;align-items:center;justify-content:center;
            font-size:28px;flex-shrink:0;
          ">📷</div>
          <div style="flex:1">
            <button id="sp-profile-btn"
              style="width:100%;padding:10px 14px;background:rgba(29,185,84,.15);
                     border:1.5px solid rgba(29,185,84,.4);border-radius:10px;
                     color:#1db954;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit">
              Choose Photo
            </button>
            <div id="sp-profile-label" style="color:rgba(255,255,255,.25);font-size:.65rem;margin-top:4px">
              No photo selected
            </div>
          </div>
        </div>
      </div>

      <!-- Field photo -->
      <div style="margin-bottom:20px">
        <div style="color:rgba(255,255,255,.6);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
          Field Activity Photo (doing interviews)
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div id="sp-field-preview" style="
            width:72px;height:72px;border-radius:12px;
            background:rgba(255,255,255,.08);border:2px dashed rgba(255,255,255,.2);
            overflow:hidden;display:flex;align-items:center;justify-content:center;
            font-size:28px;flex-shrink:0;
          ">🏘️</div>
          <div style="flex:1">
            <button id="sp-field-btn"
              style="width:100%;padding:10px 14px;background:rgba(96,165,250,.12);
                     border:1.5px solid rgba(96,165,250,.35);border-radius:10px;
                     color:#60a5fa;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit">
              Choose Photo
            </button>
            <div id="sp-field-label" style="color:rgba(255,255,255,.25);font-size:.65rem;margin-top:4px">
              No photo selected
            </div>
          </div>
        </div>
      </div>

      <button id="sp-save-btn" style="
        width:100%;padding:16px;background:linear-gradient(135deg,#1d4ed8,#0d9488);
        border:none;border-radius:14px;color:#fff;font-size:.95rem;font-weight:800;
        cursor:pointer;font-family:inherit;
      ">Save Profile Photos</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // State
  let profileKey = existing.profilePhotoUrl || null;
  let fieldKey   = existing.fieldPhotoUrl   || null;

  // Load existing previews
  async function loadPreview(key, imgEl, label) {
    if (!key) return;
    const url = await _getBlob(key);
    if (url) {
      imgEl.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
      label.textContent = 'Photo loaded ✓';
      label.style.color = '#1db954';
    }
  }

  await loadPreview(profileKey, document.getElementById('sp-profile-preview'), document.getElementById('sp-profile-label'));
  await loadPreview(fieldKey,   document.getElementById('sp-field-preview'),   document.getElementById('sp-field-label'));

  document.getElementById('sp-profile-btn').onclick = async () => {
    const key = await _pickAndSavePhoto('image/*');
    if (!key) return;
    if (profileKey && !profileKey.startsWith('http')) await _deleteBlob(profileKey);
    profileKey = key;
    await loadPreview(key, document.getElementById('sp-profile-preview'), document.getElementById('sp-profile-label'));
  };

  document.getElementById('sp-field-btn').onclick = async () => {
    const key = await _pickAndSavePhoto('image/*');
    if (!key) return;
    if (fieldKey && !fieldKey.startsWith('http')) await _deleteBlob(fieldKey);
    fieldKey = key;
    await loadPreview(key, document.getElementById('sp-field-preview'), document.getElementById('sp-field-label'));
  };

  document.getElementById('sp-save-btn').onclick = () => {
    const updated = { ...existing, profilePhotoUrl: profileKey, fieldPhotoUrl: fieldKey };
    saveStudentIdentity(updated);
    overlay.remove();
    if (typeof showToast === 'function') showToast('✅ Profile photos saved');
  };
}

// ─── Institution Context Modal ───────────────────────────────────────────────

async function openInstitutionIdentityModal() {
  const existing = getInstitutionIdentity() || {};

  const overlay = document.createElement('div');
  overlay.id = 'mss-inst-modal';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);
    display:flex;align-items:flex-end;justify-content:center;
    font-family:'Sora',sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      width:100%;max-width:480px;background:#0d1826;border-radius:24px 24px 0 0;
      padding:24px 20px calc(24px + env(safe-area-inset-bottom));
      max-height:92vh;overflow-y:auto;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="color:#fff;font-size:1.1rem;font-weight:800">🏢 Institution Photos</div>
        <button onclick="document.getElementById('mss-inst-modal').remove()"
          style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:50%;
                 width:32px;height:32px;font-size:1.1rem;cursor:pointer;font-family:inherit">✕</button>
      </div>

      <div style="color:rgba(255,255,255,.45);font-size:.72rem;margin-bottom:16px;line-height:1.5">
        Institution photos appear in group reports to establish credibility and context.
      </div>

      <!-- Group photo -->
      <div style="margin-bottom:16px">
        <div style="color:rgba(255,255,255,.6);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
          Group Photo (team photo)
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div id="ip-group-preview" style="
            width:72px;height:72px;border-radius:12px;
            background:rgba(255,255,255,.08);border:2px dashed rgba(255,255,255,.2);
            overflow:hidden;display:flex;align-items:center;justify-content:center;
            font-size:28px;flex-shrink:0;
          ">👥</div>
          <div style="flex:1">
            <button id="ip-group-btn"
              style="width:100%;padding:10px 14px;background:rgba(124,58,237,.15);
                     border:1.5px solid rgba(124,58,237,.4);border-radius:10px;
                     color:#a78bfa;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit">
              Choose Photo
            </button>
            <div id="ip-group-label" style="color:rgba(255,255,255,.25);font-size:.65rem;margin-top:4px">
              No photo selected
            </div>
          </div>
        </div>
      </div>

      <!-- Map screenshot -->
      <div style="margin-bottom:20px">
        <div style="color:rgba(255,255,255,.6);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
          Google Maps Screenshot (coverage area)
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div id="ip-map-preview" style="
            width:72px;height:72px;border-radius:12px;
            background:rgba(255,255,255,.08);border:2px dashed rgba(255,255,255,.2);
            overflow:hidden;display:flex;align-items:center;justify-content:center;
            font-size:28px;flex-shrink:0;
          ">🗺️</div>
          <div style="flex:1">
            <button id="ip-map-btn"
              style="width:100%;padding:10px 14px;background:rgba(16,185,129,.12);
                     border:1.5px solid rgba(16,185,129,.35);border-radius:10px;
                     color:#34d399;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit">
              Choose Screenshot
            </button>
            <div id="ip-map-label" style="color:rgba(255,255,255,.25);font-size:.65rem;margin-top:4px">
              No screenshot selected
            </div>
          </div>
        </div>
      </div>

      <button id="ip-save-btn" style="
        width:100%;padding:16px;background:linear-gradient(135deg,#7c3aed,#4f46e5);
        border:none;border-radius:14px;color:#fff;font-size:.95rem;font-weight:800;
        cursor:pointer;font-family:inherit;
      ">Save Institution Photos</button>
    </div>
  `;

  document.body.appendChild(overlay);

  let groupKey = existing.groupPhotoUrl       || null;
  let mapKey   = existing.mapScreenshotUrl    || null;

  async function loadPreview(key, imgEl, label) {
    if (!key) return;
    const url = await _getBlob(key);
    if (url) {
      imgEl.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
      label.textContent = 'Photo loaded ✓';
      label.style.color = '#1db954';
    }
  }

  await loadPreview(groupKey, document.getElementById('ip-group-preview'), document.getElementById('ip-group-label'));
  await loadPreview(mapKey,   document.getElementById('ip-map-preview'),   document.getElementById('ip-map-label'));

  document.getElementById('ip-group-btn').onclick = async () => {
    const key = await _pickAndSavePhoto('image/*');
    if (!key) return;
    if (groupKey && !groupKey.startsWith('http')) await _deleteBlob(groupKey);
    groupKey = key;
    await loadPreview(key, document.getElementById('ip-group-preview'), document.getElementById('ip-group-label'));
  };

  document.getElementById('ip-map-btn').onclick = async () => {
    const key = await _pickAndSavePhoto('image/*');
    if (!key) return;
    if (mapKey && !mapKey.startsWith('http')) await _deleteBlob(mapKey);
    mapKey = key;
    await loadPreview(key, document.getElementById('ip-map-preview'), document.getElementById('ip-map-label'));
  };

  document.getElementById('ip-save-btn').onclick = () => {
    const updated = { ...existing, groupPhotoUrl: groupKey, mapScreenshotUrl: mapKey };
    saveInstitutionIdentity(updated);
    overlay.remove();
    if (typeof showToast === 'function') showToast('✅ Institution photos saved');
  };
}

// ─── Report render helper ────────────────────────────────────────────────────
/**
 * Returns an HTML snippet to embed at the top of a report.
 * Call this from survey-reports.js when building any report page.
 *
 * Usage example:
 *   const header = await buildIdentityReportHeader();
 *   reportHtml = header + coreReportHtml;
 */
async function buildIdentityReportHeader() {
  const student = getStudentIdentity()     || {};
  const inst    = getInstitutionIdentity() || {};

  const profileUrl = await _getBlob(student.profilePhotoUrl);
  const fieldUrl   = await _getBlob(student.fieldPhotoUrl);
  const groupUrl   = await _getBlob(inst.groupPhotoUrl);
  const mapUrl     = await _getBlob(inst.mapScreenshotUrl);

  const imgBox = (url, label, emoji) => url
    ? `<div style="text-align:center">
         <img src="${url}" style="width:100%;max-width:200px;border-radius:10px;object-fit:cover;display:block;margin:0 auto 4px">
         <div style="font-size:.65rem;color:#555">${label}</div>
       </div>`
    : `<div style="text-align:center;padding:20px;background:#f5f5f5;border-radius:10px;color:#aaa;font-size:.75rem">${emoji}<br>${label}<br><em>not uploaded</em></div>`;

  const instSection = (groupUrl || mapUrl) ? `
    <div style="margin-bottom:20px;padding:16px;background:#f0f4ff;border-radius:14px">
      <div style="font-weight:800;font-size:.85rem;margin-bottom:10px;color:#1e3a8a">🏢 ${inst.name || 'Institution'}</div>
      <div style="font-size:.75rem;color:#555;margin-bottom:12px">
        ${inst.county ? inst.county : ''}${inst.county && inst.subcounty ? ' → ' : ''}${inst.subcounty || ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${imgBox(groupUrl, 'Group Photo', '👥')}
        ${imgBox(mapUrl,   'Survey Area Map', '🗺️')}
      </div>
    </div>
  ` : '';

  const studentSection = (profileUrl || fieldUrl) ? `
    <div style="margin-bottom:20px;padding:16px;background:#f0fff4;border-radius:14px">
      <div style="font-weight:800;font-size:.85rem;margin-bottom:10px;color:#065f46">🎓 ${student.name || 'Interviewer'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${imgBox(profileUrl, 'Profile Photo', '📷')}
        ${imgBox(fieldUrl,   'Field Activity', '🏘️')}
      </div>
    </div>
  ` : '';

  if (!instSection && !studentSection) return '';

  return `
    <div style="font-family:'Sora',sans-serif;margin-bottom:24px">
      <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;
                  color:#888;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px">
        Field Identity & Verification
      </div>
      ${instSection}
      ${studentSection}
    </div>
  `;
}

// ─── Storage size check ──────────────────────────────────────────────────────

async function getMediaStorageInfo() {
  try {
    const db = await _openMediaDB();
    return new Promise((resolve) => {
      const req = db.transaction(MSS_MEDIA_STORE).objectStore(MSS_MEDIA_STORE).getAll();
      req.onsuccess = e => {
        const blobs = e.target.result || [];
        const totalBytes = blobs.reduce((sum, b) => sum + (b.size || 0), 0);
        resolve({ count: blobs.length, totalMB: (totalBytes / 1024 / 1024).toFixed(2) });
      };
      req.onerror = () => resolve({ count: 0, totalMB: '0.00' });
    });
  } catch {
    return { count: 0, totalMB: '0.00' };
  }
}

// ─── Clear all media ─────────────────────────────────────────────────────────

async function clearAllMedia() {
  if (!confirm('Delete all stored photos? This cannot be undone.')) return;
  const db = await _openMediaDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MSS_MEDIA_STORE, 'readwrite');
    tx.objectStore(MSS_MEDIA_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
  if (typeof showToast === 'function') showToast('🗑️ All photos cleared');
}

// ─── Supabase photo upload (call during sync) ────────────────────────────────
/**
 * Uploads a photo blob to the backend /api/admin/upload-image endpoint (secure —
 * never exposes the Supabase service key to the browser) and returns the public URL.
 * Returns null if upload fails (no crash — offline-first).
 *
 * @param {string} idbKey    IDB key of the photo (or an existing http URL)
 * @param {string} bucket    Ignored — kept for API compatibility; backend uses 'survey-images'
 * @param {string} path      Path hint used to derive folder: 'profiles/...' → folder='profiles'
 */
async function uploadPhotoToSupabase(idbKey, bucket, path) {
  // Already a remote URL — nothing to upload
  if (!idbKey || idbKey.startsWith('http')) return idbKey || null;

  // Read blob from IndexedDB
  const db   = await _openMediaDB();
  const blob = await new Promise((resolve) => {
    const req = db.transaction(MSS_MEDIA_STORE).objectStore(MSS_MEDIA_STORE).get(idbKey);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => resolve(null);
  });

  if (!blob) return null;

  // Derive folder from path hint (e.g. 'profiles/foo.jpg' → 'profiles')
  const folder   = (path || '').split('/')[0] || 'evidence';
  const ext      = blob.type ? blob.type.split('/')[1] || 'jpg' : 'jpg';
  const filename = path ? path.split('/').pop() : `${idbKey}.${ext}`;

  // Convert blob to base64 data URI
  const base64DataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });

  // Primary: route through secure backend (avoids exposing Supabase service key in browser)
  try {
    if (window.HS?.HSAdmin?.uploadImage) {
      const result = await window.HS.HSAdmin.uploadImage(base64DataUrl, folder, filename);
      if (result?.url) return result.url;
    }
  } catch (e) {
    console.warn('[uploadPhotoToSupabase] backend upload failed, trying direct fallback:', e.message);
  }

  // Fallback: direct Supabase upload only if backend helper is unavailable
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_KEY = window.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const bucketName = bucket || 'mss-media';
  const uploadPath = path   || `photos/${idbKey}`;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketName}/${uploadPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  blob.type || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: blob,
    });
    if (!res.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${uploadPath}`;
  } catch {
    return null;
  }
}

// ─── Quick-access buttons (inject into Settings sheet) ──────────────────────
/**
 * Call this inside openStudentSettings() or wherever your settings sheet is built.
 * Returns an HTML string with two buttons.
 */
 
function renderIdentitySettingButtons() {
  return ``; // removed buttons from settings
}

setTimeout(() => {

  // Load profile on start
  const name = localStorage.getItem("name");
  const email = localStorage.getItem("email");
  const img = localStorage.getItem("profileImage");

  if (name && document.getElementById("profileName"))
    document.getElementById("profileName").value = name;

  if (email && document.getElementById("profileEmail"))
    document.getElementById("profileEmail").value = email;

  if (img && document.getElementById("profileImage"))
    document.getElementById("profileImage").src = img;

  // Save name
  const nameInput = document.getElementById("profileName");
  if (nameInput) {
    nameInput.addEventListener("input", (e) => {
      localStorage.setItem("name", e.target.value);
    });
  }

  // Save email
  const emailInput = document.getElementById("profileEmail");
  if (emailInput) {
    emailInput.addEventListener("input", (e) => {
      localStorage.setItem("email", e.target.value);
    });
  }

  // Save image
  const upload = document.getElementById("profileUpload");
  if (upload) {
    upload.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        localStorage.setItem("profileImage", reader.result);

        const imgTag = document.getElementById("profileImage");
        if (imgTag) imgTag.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

}, 300);
