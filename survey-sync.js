/* Medical Survey System (MSS) — Sync Engine v7.0 © 2026 Ministry of Health Kenya
 * PHASE 7 UPDATE: QR chain architecture.
 * - Token read from single key: 'mss-token'
 * - institution_id decoded from JWT only (never from session keys)
 * - session_id attached to every submit payload
 * - Device validation before every sync
 * - No Supabase calls. All data goes through /api/survey/submit
 */

const API_BASE_URL = window.HS_API_BASE || '';

// ─── AUTH ─────────────────────────────────────────────────────
// Single source of truth: JWT stored as 'mss-token' after QR validation
function getAuthToken() {
  return localStorage.getItem('mss-token') || '';
}

function authHeaders() {
  const token = getAuthToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

function isSupabaseReady() { return !!getAuthToken(); }

// ─── JWT DECODE ───────────────────────────────────────────────
// All identity comes from JWT payload — no localStorage session keys
function _decodeJWT() {
  try {
    const token = getAuthToken();
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

function getSessionInstitutionId() {
  const payload = _decodeJWT();
  if (payload?.institution_id) return payload.institution_id;
  console.error('[MSS] institution_id missing from JWT — user must re-scan QR');
  return null;
}

function getSessionInstitutionName() {
  const payload = _decodeJWT();
  return payload?.institution_name || null;
}

function getSessionId() {
  // Set by session-guard.js after session check
  return sessionStorage.getItem('mss-session-id') || null;
}

// ─── SYNC STATE ───────────────────────────────────────────────
let _syncBusy = false;

// ─── FIELD MAPPER ─────────────────────────────────────────────
// Translates short form field names → DB column names
// raw_json holds everything — nothing is ever lost
function mapRecordToDBPayload(record) {
  const pick = (...keys) => { for (const k of keys) { if (record[k] !== undefined && record[k] !== null && record[k] !== '') return record[k]; } return null; };
  const str  = (v) => Array.isArray(v) ? v.join(', ') : (v || null);

  return {
    interviewer:        pick('interviewer_name'),
    interview_date:     pick('interview_date'),
    location:           pick('interview_location'),
    consent:            pick('consent_given'),

    respondent_age:     pick('a_age'),
    respondent_gender:  pick('a_gender'),
    hh_position:        pick('a_pos'),
    marital_status:     pick('a_marital'),
    education:          pick('a_edu'),
    occupation:         pick('a_occ'),
    total_males:        pick('a_tot_m'),
    total_females:      pick('a_tot_f'),
    hh_size:            (() => { const m = parseInt(record.a_tot_m)||0; const f = parseInt(record.a_tot_f)||0; return (m+f) || null; })(),
    disability:         pick('c_disab'),

    house_type:         pick('b_type'),
    roof_type:          pick('b_roof'),
    floor_type:         pick('b_floor'),
    wall_type:          pick('b_wall'),
    lighting:           pick('b_light'),
    fuel:               pick('b_fuel'),
    rooms:              pick('b_proom'),
    cooking_location:   pick('b_smoke_in'),
    windows:            pick('b_win'),
    animals_in_house:   pick('b_animals'),

    illnesses:          str(pick('c_ill')),
    chronic_illness:    pick('c_chronic'),
    consultation:       pick('c_consult'),
    consult_where:      pick('c_no_r'),
    deaths_5yr:         pick('c_deaths'),
    deaths_count:       pick('c_deaths_n'),
    death_cause:        str(pick('c_dcause')),
    death_age:          pick('c_dage'),

    pregnancy_status:   pick('d_preg'),
    anc_visits:         pick('d_anc'),
    anc_where:          pick('d_anc_w'),
    anc_start:          pick('d_anc_s'),
    delivery_place:     pick('d_ct'),
    children_under5:    pick('d_u5'),
    immunisation:       pick('d_immun'),
    fp_aware:           pick('d_fp'),
    fp_method:          str(pick('d_fp_m')),
    fp_challenges:      str(pick('d_fp_c')),
    breastfeeding:      pick('e_bf'),
    bf_duration:        pick('e_bf_d'),
    bf_stopped:         pick('e_bf_s'),

    meals_per_day:      pick('e_meals'),
    skips_meals:        pick('e_skip'),
    skip_reason:        pick('e_skip_r'),
    food_enough:        pick('e_enough'),
    food_shortage:      pick('e_short'),
    food_shortage_months: pick('e_skip_m'),
    food_shortage_why:  pick('e_skip_w'),
    has_garden:         pick('e_garden'),
    crops_food:         str(pick('e_crop_f')),
    crops_cash:         str(pick('e_crop_c')),
    crops_livestock:    str(pick('e_crop_l')),
    crops_vegetables:   str(pick('e_crop_v')),
    nutrition_info:     pick('e_ninfo_d'),
    food_taboo:         pick('e_taboo_d'),
    youngest_child_age: pick('e_yng'),
    supplement:         pick('e_supp_d'),

    hiv_heard:          pick('f_heard'),
    hiv_tested:         pick('f_tested'),
    hiv_test_date:      pick('f_test_d'),
    hiv_protect:        pick('f_protect'),
    hiv_partner_test:   pick('f_partner'),
    hiv_arv:            pick('f_arv_r'),
    hiv_info_source:    str(pick('f_info')),

    latrine:            pick('g_latrine'),
    latrine_type:       pick('g_lat_td'),
    latrine_count:      pick('g_lat_n'),
    handwashing:        pick('g_hand'),
    waste_disposal:     pick('g_waste'),
    drainage:           pick('g_drain'),
    alternate_latrine:  pick('g_alt'),

    water_source:       str(pick('h_wsrc')),
    water_treated:      pick('h_treat'),
    water_treatment_method: pick('h_tm'),
    water_container:    pick('h_wcon'),
    water_distance:     pick('h_wp'),

    circumcision:       pick('i_circ'),
    traditional_med:    pick('i_trad'),
    rite_of_passage:    pick('i_rite'),
    burial_practices:   pick('i_bur_o'),
    wife_inheritance:   pick('i_winh_h'),
    wife_inh_behaviour: pick('i_winh_b'),
    wife_inh_no_reason: pick('i_winh_n'),
    birth_practices:    pick('i_birth_d'),
    death_practices:    pick('i_death_d'),

    health_problems:    str(pick('j_problems')),

    mosquito_net:       pick('k_mosquito_net'),
    net_used:           pick('k_mosquito_net_c'),
    rodents:            pick('k_rats'),
    cockroaches:        pick('k_cockroaches'),
    flies:              pick('k_flies'),
    fleas:              pick('k_fleas'),
    k_notes:            pick('k_notes'),

    challenge_1:        pick('l_challenge_1'),
    challenge_2:        pick('l_challenge_2'),
    challenge_3:        pick('l_challenge_3'),
    challenge_4:        pick('l_challenge_4'),
    challenge_5:        pick('l_challenge_5'),
    challenge_6:        pick('l_challenge_6'),
    challenge_7:        pick('l_challenge_7'),
    challenge_8:        pick('l_challenge_8'),
    challenge_9:        pick('l_challenge_9'),
    challenge_10:       pick('l_challenge_10'),
    interview_summary:  pick('l_summary'),

    // Full raw record — nothing is ever lost
    raw_json: JSON.stringify(record),
  };
}

// ─── SYNC STATUS UI ───────────────────────────────────────────
function setSyncStatus(status, detail) {
  const btn    = document.getElementById('sync-btn');
  const dot    = document.getElementById('sync-dot');
  const lbl    = document.getElementById('sync-lbl');
  const colors = { idle:'rgba(255,255,255,.25)', syncing:'#2563eb', ok:'#059669', offline:'rgba(255,255,255,.15)', error:'#dc2626' };
  const labels = { idle:'Sync', syncing:'Syncing…', ok:'Synced ✓', offline:'Offline', error:'Sync Failed' };
  if (dot) dot.style.background = colors[status] || colors.idle;
  if (lbl) lbl.textContent = labels[status] || status;
  if (btn) btn.disabled = (status === 'syncing');

  const syncBar    = document.getElementById('sync-bar');
  const syncBarMsg = document.getElementById('sync-bar-msg');
  if (syncBar && syncBarMsg) {
    if (status === 'syncing') {
      syncBarMsg.textContent = detail || 'Syncing records…';
      syncBar.classList.add('show');
      syncBar.style.background = '';
      syncBar.style.color = '';
    } else if (status === 'error') {
      syncBarMsg.textContent = '⚠ Sync failed' + (detail ? ': ' + detail : '') + ' — tap sync to retry.';
      syncBar.classList.add('show');
      syncBar.style.background = 'rgba(220,38,38,.15)';
      syncBar.style.color = '#f87171';
      clearTimeout(syncBar._hideTimer);
      syncBar._hideTimer = setTimeout(() => {
        syncBar.classList.remove('show');
        syncBar.style.background = '';
        syncBar.style.color = '';
      }, 8000);
    } else {
      syncBar.classList.remove('show');
      syncBar.style.background = '';
      syncBar.style.color = '';
    }
  }
}

// ─── MAIN SYNC ────────────────────────────────────────────────
async function syncAll() {
  if (_syncBusy) return;
  _syncBusy = true;
  setSyncStatus('syncing');

  const token = getAuthToken();
  if (!token) {
    setSyncStatus('error', 'Not logged in — please scan your QR code again');
    _syncBusy = false;
    _showSyncResultModal({ notLoggedIn: true });
    return;
  }

  // ── Device + session validation before sync ──────────────────
  // If session has ended → lock UI, do not sync
  if (window.MSS && window.MSS.SessionGuard) {
    const deviceOk = await window.MSS.SessionGuard.validateDevice();
    if (deviceOk === false) {
      // SessionGuard already locked the UI
      setSyncStatus('error', 'Session ended — sync blocked');
      _syncBusy = false;
      return;
    }
    // deviceOk === null means offline — allow sync attempt (will fail at network, not here)
  }

  const instId    = getSessionInstitutionId();
  const sessionId = getSessionId();

  try {
    let allPending = await _collectPendingRecords();

    if (!allPending.length) {
      setSyncStatus('ok', 'Nothing to sync');
      _syncBusy = false;
      return;
    }

    let synced = 0;
    const incompleteRecords = [];
    const failedRecords     = [];

    for (const record of allPending) {
      // Patch missing location from fallback
      const recData = record.survey_data || record;
      if (!recData.interview_location && recData.interview_location_custom) {
        recData.interview_location = recData.interview_location_custom;
        if (record.survey_data) record.survey_data.interview_location = recData.interview_location;
        else record.interview_location = recData.interview_location;
      }

      // Validate — report missing fields, never silently skip
      if (typeof validateFullRecord === 'function') {
        const check = validateFullRecord(recData);
        if (!check.valid) {
          const recLabel = record.a_age
            ? `Age ${record.a_age}, ${record.a_gender || '?'} — ${record.interview_location || 'unknown location'}`
            : (record.interview_location || record.offline_id || 'Unknown record');
          incompleteRecords.push({ label: recLabel, missing: check.missing });
          continue;
        }
      }

      try {
        // institution_id strictly from JWT — never from record body
        const _instId = instId;
        if (!_instId) {
          failedRecords.push('Missing institution ID — please re-scan your QR code and try again.');
          continue;
        }

        // Build household_id — valid UUID required by backend
        const _rawKey = record.household_id || record.id
          || (record._chsa4_key ? record._chsa4_key.replace(/^rec-/, '') : null)
          || record.offline_id || record.record_id;
        const _hhId = _rawKey && /^[0-9a-f\-]{32,}$/i.test(_rawKey.replace(/-/g, ''))
          ? _rawKey
          : crypto.randomUUID();

        const mapped = mapRecordToDBPayload(record);

        const res = await fetch(`${API_BASE_URL}/api/survey/submit`, {
          method:  'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            household_id:    _hhId,
            institution_id:  _instId,              // from JWT only
            session_id:      sessionId || null,    // from sessionStorage (set by session-guard)
            respondent_name: record.respondent_name || record.full_name || 'Unknown',
            survey_data:     mapped,
            offline_id:      record.offline_id || record.record_id || record.id || record._chsa4_key,
            submitted_at:    record.created_at || new Date().toISOString(),
          }),
        });

        if (res.ok || res.status === 409) {
          await markSynced(record.id || record.offline_id || record._chsa4_key);
          synced++;
          try {
            const stored = JSON.parse(localStorage.getItem('chsa4') || '{}');
            if (window.recs) Object.assign(window.recs, stored);
            if (typeof renDrw === 'function') renDrw();
          } catch {}
        } else {
          let reason = `HTTP ${res.status}`;
          try {
            const errBody = await res.json();
            reason = errBody.error || errBody.message || reason;
          } catch { try { reason = await res.text() || reason; } catch {} }

          // Session ended during sync — lock and abort
          if (res.status === 403 && reason === 'session_closed') {
            setSyncStatus('error', 'Session ended during sync');
            if (window.MSS && window.MSS.SessionGuard) {
              window.MSS.SessionGuard.lockUI('Session has ended. No further submissions accepted.');
            }
            _syncBusy = false;
            return;
          }
          failedRecords.push(reason);
        }
      } catch (err) {
        failedRecords.push('Network error: ' + err.message);
      }
    }

    const totalFailed = incompleteRecords.length + failedRecords.length;
    const statusMsg   = `Synced ${synced}/${allPending.length}` + (totalFailed ? ` (${totalFailed} need attention)` : '');
    setSyncStatus(totalFailed === 0 ? 'ok' : 'error', statusMsg);

    if (totalFailed > 0 || synced > 0) {
      _showSyncResultModal({ synced, total: allPending.length, incompleteRecords, failedRecords });
    }
  } catch (err) {
    setSyncStatus('error', err.message);
    _showSyncResultModal({ fatalError: err.message });
  } finally {
    _syncBusy = false;
  }
}

// ─── COLLECT PENDING RECORDS ──────────────────────────────────
async function _collectPendingRecords() {
  const unsyncedFromIDB = await getUnsyncedRecords();
  let allPending = [...unsyncedFromIDB];

  try {
    const stored  = JSON.parse(localStorage.getItem('chsa4') || '{}');
    const chsa4Keys = new Set(Object.keys(stored).filter(k => !k.startsWith('_')));

    const extra = Object.entries(stored)
      .filter(([k, r]) => !k.startsWith('_') && r && typeof r === 'object' && !r._synced
        && (r._finished || r.a_age || r.interview_location || r.interview_date))
      .map(([k, r]) => ({ ...r, _chsa4_key: k }));

    allPending = [...allPending, ...extra];

    // Deduplicate
    const seen = new Set();
    allPending = allPending.filter(r => {
      const id = r.offline_id || r.record_id || r.id || r._chsa4_key;
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Remove records deleted from device
    allPending = allPending.filter(r => {
      if (r._chsa4_key) return true;
      const bareId   = (r.offline_id || r.record_id || r.id || '').replace(/^rec-/, '');
      const prefixId = 'rec-' + bareId;
      return chsa4Keys.has(bareId) || chsa4Keys.has(prefixId)
          || chsa4Keys.has(r.offline_id || '') || chsa4Keys.has(r.id || '');
    });
  } catch {}

  return allPending;
}

// ─── SYNC RESULT MODAL ────────────────────────────────────────
function _showSyncResultModal({ synced = 0, total = 0, incompleteRecords = [], failedRecords = [], fatalError = null, notLoggedIn = false } = {}) {
  const existing = document.getElementById('mss-sync-result-modal');
  if (existing) existing.remove();

  let icon, title, bodyHtml;

  if (notLoggedIn) {
    icon  = '🔒'; title = 'Not Logged In';
    bodyHtml = '<p style="color:#dc2626">Scan your QR code or enter your access token to sync.</p>';
  } else if (fatalError) {
    icon  = '❌'; title = 'Sync Error';
    bodyHtml = `<p style="color:#dc2626">${fatalError}</p>`;
  } else {
    const allGood = incompleteRecords.length === 0 && failedRecords.length === 0;
    icon  = allGood ? '✅' : '⚠️';
    title = allGood ? `${synced} Record${synced !== 1 ? 's' : ''} Uploaded` : 'Sync Needs Attention';

    bodyHtml = '';
    if (synced > 0) {
      bodyHtml += `<div style="background:#e8f5ed;border-radius:10px;padding:10px 13px;margin-bottom:10px;font-size:.82rem;color:#1e5c38;font-weight:600">✅ ${synced} of ${total} record${total !== 1 ? 's' : ''} uploaded successfully.</div>`;
    }

    if (incompleteRecords.length > 0) {
      bodyHtml += `<div style="background:#fff8e1;border-radius:10px;padding:10px 13px;margin-bottom:10px;font-size:.8rem;color:#7c4a00">`;
      bodyHtml += `<div style="font-weight:700;margin-bottom:6px">⚠ ${incompleteRecords.length} record${incompleteRecords.length !== 1 ? 's' : ''} not uploaded — incomplete answers:</div>`;
      incompleteRecords.slice(0, 3).forEach(rec => {
        bodyHtml += `<div style="margin-bottom:8px;padding:7px 10px;background:rgba(0,0,0,.06);border-radius:7px">`;
        bodyHtml += `<div style="font-weight:700;margin-bottom:3px">📋 ${rec.label}</div>`;
        bodyHtml += `<div style="color:#b45309">Missing: ${rec.missing.slice(0, 3).join(', ')}${rec.missing.length > 3 ? ` + ${rec.missing.length - 3} more` : ''}</div>`;
        bodyHtml += `</div>`;
      });
      if (incompleteRecords.length > 3) bodyHtml += `<div style="font-size:.74rem;opacity:.7">…and ${incompleteRecords.length - 3} more. Open each record and fill in missing fields.</div>`;
      bodyHtml += `</div>`;
    }

    if (failedRecords.length > 0) {
      const unique = [...new Set(failedRecords)];
      bodyHtml += `<div style="background:#fdecea;border-radius:10px;padding:10px 13px;font-size:.8rem;color:#b91c1c">`;
      bodyHtml += `<div style="font-weight:700;margin-bottom:5px">❌ ${failedRecords.length} record${failedRecords.length !== 1 ? 's' : ''} failed to upload:</div>`;
      bodyHtml += `<div style="line-height:1.6">${unique.slice(0, 3).join('<br>')}${unique.length > 3 ? `<br>…and ${unique.length - 3} more` : ''}</div>`;
      bodyHtml += `<div style="margin-top:6px;font-size:.75rem">Check your internet connection and try again.</div>`;
      bodyHtml += `</div>`;
    }
  }

  const modal = document.createElement('div');
  modal.id = 'mss-sync-result-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;';
  modal.innerHTML = `<div style="background:var(--bg-base,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -8px 40px rgba(0,0,0,.4);max-height:85vh;overflow-y:auto;">
    <div style="font-size:2rem;text-align:center;margin-bottom:8px">${icon}</div>
    <div style="font-size:1.05rem;font-weight:800;color:var(--text-1,#0d3b66);text-align:center;margin-bottom:14px">${title}</div>
    <div style="font-size:.82rem;color:var(--text-2,#5d7a8a);line-height:1.6;margin-bottom:16px">${bodyHtml}</div>
    <button id="mss-sync-result-close" style="width:100%;padding:13px;background:var(--grad-brand,linear-gradient(135deg,#2563eb,#0d9488));color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:.92rem;font-weight:700;cursor:pointer">OK</button>
  </div>`;
  document.body.appendChild(modal);
  document.getElementById('mss-sync-result-close').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ─── INDEXEDDB HELPERS ────────────────────────────────────────
async function getUnsyncedRecords() {
  try {
    const db = await openDB();
    return await getAllUnsynced(db);
  } catch {
    try {
      const stored = JSON.parse(localStorage.getItem('chsa4') || '{}');
      return Object.entries(stored)
        .filter(([k, r]) => !k.startsWith('_') && r && typeof r === 'object' && !r._synced
          && (r._finished || r.a_age || r.interview_location || r.interview_date))
        .map(([id, r]) => ({ ...r, _chsa4_key: id }));
    } catch { return []; }
  }
}

async function markSynced(id) {
  try {
    const stored  = JSON.parse(localStorage.getItem('chsa4') || '{}');
    let   matched = false;
    for (const [k, r] of Object.entries(stored)) {
      if (k.startsWith('_') || !r) continue;
      if (k === id || r.offline_id === id || r.record_id === id || r.id === id
          || ('rec-' + id) === k || k.replace(/^rec-/, '') === id) {
        stored[k]._synced = true;
        matched = true;
      }
    }
    if (matched) localStorage.setItem('chsa4', JSON.stringify(stored));
  } catch {}

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx     = db.transaction('records', 'readwrite');
      const store  = tx.objectStore('records');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          getReq.result._synced = true;
          const putReq = store.put(getReq.result);
          putReq.onsuccess = () => resolve();
          putReq.onerror   = () => reject(putReq.error);
        } else resolve();
      };
      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('HealthSurveyDB', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
    };
  });
}

function getAllUnsynced(db) {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('records', 'readonly');
    const results = [];
    const req     = tx.objectStore('records').openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { if (!cursor.value._synced) results.push(cursor.value); cursor.continue(); }
      else resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── FORCE SYNC (re-upload all records) ───────────────────────
async function forceSyncAll() {
  if (_syncBusy) return;
  _syncBusy = true;
  setSyncStatus('syncing');

  if (!getAuthToken()) {
    setSyncStatus('error', 'Not logged in');
    _syncBusy = false;
    _showSyncResultModal({ notLoggedIn: true });
    return;
  }

  // Device + session check
  if (window.MSS && window.MSS.SessionGuard) {
    const deviceOk = await window.MSS.SessionGuard.validateDevice();
    if (deviceOk === false) {
      setSyncStatus('error', 'Session ended');
      _syncBusy = false;
      return;
    }
  }

  const instId    = getSessionInstitutionId();
  const sessionId = getSessionId();

  try {
    let allRecords = [];
    try {
      const db = await openDB();
      allRecords = await new Promise((resolve, reject) => {
        const tx      = db.transaction('records', 'readonly');
        const results = [];
        const req     = tx.objectStore('records').openCursor();
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) { results.push(cursor.value); cursor.continue(); }
          else resolve(results);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {}

    try {
      const stored = JSON.parse(localStorage.getItem('chsa4') || '{}');
      for (const [k, r] of Object.entries(stored)) {
        if (!k.startsWith('_') && r && typeof r === 'object') allRecords.push({ ...r, _chsa4_key: k });
      }
    } catch {}

    if (!allRecords.length) {
      setSyncStatus('ok', 'No records to force-sync');
      _syncBusy = false;
      alert('No records found on this device.');
      return;
    }

    // Deduplicate
    const seen = new Set();
    allRecords = allRecords.filter(r => {
      const id = r.offline_id || r.record_id || r.id;
      if (!id || seen.has(id)) return false;
      seen.add(id); return true;
    });

    let synced = 0, failed = 0;
    const _forceErrors = [];

    for (const record of allRecords) {
      if (!record.interview_location && record.interview_location_custom) {
        record.interview_location = record.interview_location_custom;
      }
      try {
        if (!instId) { _forceErrors.push('Missing institution ID — re-scan QR'); continue; }
        const _rawKey2 = record.household_id || record.id
          || (record._chsa4_key ? record._chsa4_key.replace(/^rec-/, '') : null)
          || record.offline_id || record.record_id;
        const _hhId2 = _rawKey2 && /^[0-9a-f\-]{32,}$/i.test(_rawKey2.replace(/-/g, ''))
          ? _rawKey2 : crypto.randomUUID();
        const mapped = mapRecordToDBPayload(record);
        const res = await fetch(`${API_BASE_URL}/api/survey/submit`, {
          method:  'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            household_id:    _hhId2,
            institution_id:  instId,
            session_id:      sessionId || null,
            respondent_name: record.respondent_name || record.full_name || 'Unknown',
            survey_data:     mapped,
            offline_id:      record.offline_id || record.record_id || record.id,
            submitted_at:    record.created_at || new Date().toISOString(),
          }),
        });
        if (res.ok || res.status === 409) {
          await markSynced(record.id || record.offline_id);
          synced++;
        } else {
          let reason = `HTTP ${res.status}`;
          try { const b = await res.json(); reason = b.error || b.message || reason; } catch {}
          _forceErrors.push(reason);
          failed++;
        }
      } catch (err) {
        _forceErrors.push('Network error: ' + err.message);
        failed++;
      }
    }

    setSyncStatus(failed === 0 ? 'ok' : 'error',
      `Force-synced ${synced}/${allRecords.length}${failed ? ` (${failed} failed)` : ''}`);

    if (failed > 0 && _forceErrors.length) {
      const unique  = [...new Set(_forceErrors)];
      const summary = unique.slice(0, 3).join('\n');
      alert(`Force sync complete.\n✅ ${synced} uploaded\n❌ ${failed} failed\n\nReason:\n${summary}`);
    } else {
      alert(`Force sync complete.\n✅ ${synced} uploaded`);
    }
  } catch (err) {
    setSyncStatus('error', err.message);
    alert('Force sync error: ' + err.message);
  } finally {
    _syncBusy = false;
  }
}

// ─── NETWORK + INIT ───────────────────────────────────────────
function updateNetworkStatus() { setSyncStatus(navigator.onLine ? 'idle' : 'offline'); }
window.addEventListener('online',  () => { updateNetworkStatus(); syncAll(); });
window.addEventListener('offline', updateNetworkStatus);
document.addEventListener('DOMContentLoaded', () => {
  updateNetworkStatus();
  const btn = document.getElementById('sync-btn');
  if (btn) btn.addEventListener('click', syncAll);
});

// ─── SYNC MODAL ───────────────────────────────────────────────
function openSyncModal() {
  const stored    = JSON.parse(localStorage.getItem('chsa4') || '{}');
  const all       = Object.entries(stored).filter(([id, r]) => typeof r === 'object' && r !== null && !id.startsWith('_'));
  const confirmed = all.filter(([, r]) => r._synced === true);
  const pending   = all.filter(([, r]) => !r._synced);
  const sessionName = sessionStorage.getItem('mss-session-name') || '';
  document.getElementById('syncModalStatus').textContent = navigator.onLine ? ' Online — ready to sync' : ' Offline — connect to sync';
  document.getElementById('syncModalInfo').innerHTML = `
    ${sessionName ? `<div style="color:rgba(255,255,255,.5);font-size:.72rem;margin-bottom:6px">Session: <strong>${sessionName}</strong></div>` : ''}
    <strong>${all.length}</strong> total record(s)<br>
    <span style="color:#1e5c38;font-weight:600">✅ ${confirmed.length} uploaded</span><br>
    <span style="color:${pending.length > 0 ? '#d35400' : '#1e5c38'};font-weight:600">
      ${pending.length > 0 ? `${pending.length} not uploaded — tap Sync` : '✅ All uploaded'}
    </span>`;
  document.getElementById('syncModal').style.display = 'flex';
}
function closeSyncModal() { document.getElementById('syncModal').style.display = 'none'; }
