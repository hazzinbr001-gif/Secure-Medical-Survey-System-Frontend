/* Medical Survey System (MSS) — Sync Engine v6.0 © 2026 Ministry of Health Kenya
 * PHASE 5 UPDATE: All data flows through the secure API layer.
 * Direct Supabase calls removed. JWT token used for auth.
 */

const API_BASE_URL = window.HS_API_BASE || '';
const SYNC_TABLE   = 'health_survey_records';

function getAuthToken() {
  // Primary: JWT token set by api-client.js login flow
  return localStorage.getItem('hs_jwt_token')
      || sessionStorage.getItem('hs_jwt_token')
      // Fallback: token embedded in chsa_auth session by survey-auth.js
      || (() => { try { return JSON.parse(localStorage.getItem('chsa_auth') || '{}').token || ''; } catch { return ''; } })()
      // Fallback: token stored inside chsa_session (legacy/institution admin path)
      || (() => { try { return JSON.parse(localStorage.getItem('chsa_session') || '{}').token || ''; } catch { return ''; } })()
      || '';
}

function authHeaders() {
  const token = getAuthToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

function isSupabaseReady() { return !!getAuthToken(); }

let _syncBusy = false;

// ─────────────────────────────────────────────────────────────────────────────
//  FIELD MAPPER
//  Translates short form field names (a_age, b_type…) → DB column names
//  AND keeps the full raw record inside raw_json so nothing is ever lost.
//  The DB flat columns give admin dashboard quick access to key fields.
//  raw_json holds everything — all 200+ fields across sections A–L.
// ─────────────────────────────────────────────────────────────────────────────
function mapRecordToDBPayload(record) {

  // Helper: pick first truthy value from a list of keys
  const pick = (...keys) => { for (const k of keys) { if (record[k] !== undefined && record[k] !== null && record[k] !== '') return record[k]; } return null; };

  // Checkboxes/multi-select come as arrays or comma strings — normalise to string
  const str = (v) => Array.isArray(v) ? v.join(', ') : (v || null);

  return {
    // ── Meta ──────────────────────────────────────────────────────────────
    interviewer:        pick('interviewer_name'),
    interview_date:     pick('interview_date'),
    location:           pick('interview_location'),
    consent:            pick('consent_given'),

    // ── Section A: Demography ─────────────────────────────────────────────
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

    // ── Section B: Housing ────────────────────────────────────────────────
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

    // ── Section C: Medical History ────────────────────────────────────────
    illnesses:          str(pick('c_ill')),
    chronic_illness:    pick('c_chronic'),
    consultation:       pick('c_consult'),
    consult_where:      pick('c_no_r'),
    deaths_5yr:         pick('c_deaths'),
    deaths_count:       pick('c_deaths_n'),
    death_cause:        str(pick('c_dcause')),
    death_age:          pick('c_dage'),

    // ── Section D: Maternal & Child ───────────────────────────────────────
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

    // ── Section E: Nutrition & Lifestyle ─────────────────────────────────
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

    // ── Section F: HIV/AIDS ───────────────────────────────────────────────
    hiv_heard:          pick('f_heard'),
    hiv_tested:         pick('f_tested'),
    hiv_test_date:      pick('f_test_d'),
    hiv_protect:        pick('f_protect'),
    hiv_partner_test:   pick('f_partner'),
    hiv_arv:            pick('f_arv_r'),
    hiv_info_source:    str(pick('f_info')),

    // ── Section G: Sanitation ─────────────────────────────────────────────
    latrine:            pick('g_latrine'),
    latrine_type:       pick('g_lat_td'),
    latrine_count:      pick('g_lat_n'),
    handwashing:        pick('g_hand'),
    waste_disposal:     pick('g_waste'),
    drainage:           pick('g_drain'),
    alternate_latrine:  pick('g_alt'),

    // ── Section H: Environment & Water ────────────────────────────────────
    water_source:       str(pick('h_wsrc')),
    water_treated:      pick('h_treat'),
    water_treatment_method: pick('h_tm'),
    water_container:    pick('h_wcon'),
    water_distance:     pick('h_wp'),

    // ── Section I: Cultural Practices ─────────────────────────────────────
    circumcision:       pick('i_circ'),
    traditional_med:    pick('i_trad'),
    rite_of_passage:    pick('i_rite'),
    burial_practices:   pick('i_bur_o'),
    wife_inheritance:   pick('i_winh_h'),
    wife_inh_behaviour: pick('i_winh_b'),
    wife_inh_no_reason: pick('i_winh_n'),
    birth_practices:    pick('i_birth_d'),
    death_practices:    pick('i_death_d'),

    // ── Section J: Community Health Problems ──────────────────────────────
    health_problems:    str(pick('j_problems')),

    // ── Section K: Pests & Vectors ────────────────────────────────────────
    mosquito_net:       pick('k_mosquito_net'),
    net_used:           pick('k_mosquito_net_c'),
    rodents:            pick('k_rats'),
    cockroaches:        pick('k_cockroaches'),
    flies:              pick('k_flies'),
    fleas:              pick('k_fleas'),
    k_notes:            pick('k_notes'),

    // ── Section L: Interviewer Challenges ────────────────────────────────
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

    // ── Full raw record — NOTHING IS LOST ────────────────────────────────
    // data-processor.js and survey-reports.js read from raw_json as fallback
    // so even fields not mapped above are always accessible
    raw_json: JSON.stringify(record),
  };
}

function setSyncStatus(status, detail) {
  const btn    = document.getElementById('sync-btn');
  const dot    = document.getElementById('sync-dot');
  const lbl    = document.getElementById('sync-lbl');
  const colors = { idle:'rgba(255,255,255,.25)', syncing:'#2563eb', ok:'#059669', offline:'rgba(255,255,255,.15)', error:'#dc2626' };
  const labels = { idle:'Sync', syncing:'Syncing…', ok:'Synced ✓', offline:'Offline', error:'Sync Failed' };
  if (dot) dot.style.background = colors[status] || colors.idle;
  if (lbl) lbl.textContent = labels[status] || status;
  if (btn) btn.disabled = (status === 'syncing');
  // debug logging removed

  // Show/hide the sync-bar with status info so the user can see what's happening
  const syncBar    = document.getElementById('sync-bar');
  const syncBarMsg = document.getElementById('sync-bar-msg');
  if (syncBar && syncBarMsg) {
    if (status === 'syncing') {
      syncBarMsg.textContent = detail || 'Syncing records…';
      syncBar.classList.add('show');
      syncBar.style.background = '';
      syncBar.style.color = '';
    } else if (status === 'error') {
      syncBarMsg.textContent = '⚠ Sync failed' + (detail ? ': ' + detail : '') + ' — tap the sync button to retry.';
      syncBar.classList.add('show');
      syncBar.style.background = 'rgba(220,38,38,.15)';
      syncBar.style.color = '#f87171';
      // Auto-hide after 8s
      clearTimeout(syncBar._hideTimer);
      syncBar._hideTimer = setTimeout(() => { syncBar.classList.remove('show'); syncBar.style.background=''; syncBar.style.color=''; }, 8000);
    } else {
      syncBar.classList.remove('show');
      syncBar.style.background = '';
      syncBar.style.color = '';
    }
  }
}

async function syncAll() {
  if (_syncBusy) return;
  _syncBusy = true;
  setSyncStatus('syncing');

  // Debug overlay removed — all sync feedback shown via modal and status bar only
  function _dbg() {}
  _dbg('syncAll() started');
  // ── END DEBUG ──────────────────────────────────────────────────

  const token = getAuthToken();
  _dbg('token: ' + (token ? token.slice(0,20)+'…' : 'NONE'), token ? '#4ade80' : '#f87171');

  if (!token) {
    setSyncStatus('error', 'Not logged in — please sign in again');
    _syncBusy = false;
    _dbg('EXIT: no auth token', '#f87171');
    _showSyncResultModal({ notLoggedIn: true });
    return;
  }

  const instId = getSessionInstitutionId();
  _dbg('institution_id: ' + (instId || 'MISSING'), instId ? '#4ade80' : '#f87171');

  try {
    const unsyncedRecords = await getUnsyncedRecords();
    _dbg('IndexedDB unsynced: ' + unsyncedRecords.length);

    // Also pick up records that were saved but never had _finished set
    let allPending;
    try {
      const stored = JSON.parse(localStorage.getItem('chsa4') || '{}');
      const allKeys = Object.keys(stored).filter(k => !k.startsWith('_'));
      _dbg('chsa4 total keys: ' + allKeys.length);
      // Attach the chsa4 key as _chsa4_key so dedup can use it
      // Only include records with real content — exclude blank ghost records
      const extra = Object.entries(stored)
        .filter(([k, r]) => !k.startsWith('_') && r && typeof r === 'object' && !r._synced
          && (r._finished || r.a_age || r.interview_location || r.interview_date))
        .map(([k, r]) => ({ ...r, _chsa4_key: k }));
      _dbg('chsa4 unsynced: ' + extra.length);
      // Log what IDs the records actually have
      extra.forEach((r, i) => {
        _dbg('  chsa4[' + i + '] key:' + r._chsa4_key + ' offline_id:' + (r.offline_id||'–') + ' id:' + (r.id||'–'));
      });
      allPending = [...unsyncedRecords, ...extra];
      // Deduplicate — use chsa4 key as final fallback so records are never dropped
      const seen = new Set();
      allPending = allPending.filter(r => {
        const id = r.offline_id || r.record_id || r.id || r._chsa4_key;
        if (!id) return true; // no id at all — keep it, don't silently drop
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      // Cross-check: if a record came from IndexedDB but no longer exists in
      // chsa4, the user deleted it — drop it from the pending list so sync
      // doesn't report phantom "not uploaded" counts.
      const chsa4Keys = new Set(Object.keys(stored).filter(k => !k.startsWith('_')));
      allPending = allPending.filter(r => {
        // Records that came from chsa4 directly always have _chsa4_key set — keep them.
        if (r._chsa4_key) return true;
        // IDB-only record: check whether its id (with or without "rec-" prefix)
        // still exists in chsa4. If not, it was deleted — skip it.
        const bareId  = (r.offline_id || r.record_id || r.id || '').replace(/^rec-/, '');
        const prefixId = 'rec-' + bareId;
        const stillExists = chsa4Keys.has(bareId) || chsa4Keys.has(prefixId)
                         || chsa4Keys.has(r.offline_id||'') || chsa4Keys.has(r.id||'');
        if (!stillExists) {
          _dbg('  SKIP (deleted from device): ' + (r.id || r.offline_id || '?'), '#f59e0b');
        }
        return stillExists;
      });
      _dbg('allPending after dedup: ' + allPending.length, allPending.length ? '#4ade80' : '#f87171');
      // Show each pending record
      allPending.forEach((r, i) => {
        const loc = r.interview_location || r.location || '?';
        const age = r.a_age || '?';
        const fin = r._finished ? '✓fin' : 'nofin';
        const syn = r._synced ? 'synced' : 'unsynced';
        _dbg('  [' + i + '] age:' + age + ' loc:' + loc + ' ' + fin + ' ' + syn);
      });
    } catch(e) {
      _dbg('chsa4 parse error: ' + e.message, '#f87171');
      allPending = unsyncedRecords;
    }

    if (!allPending.length) {
      setSyncStatus('ok', 'Nothing to sync');
      _syncBusy = false;
      _dbg('EXIT: nothing to sync — check records above', '#f59e0b');
      return;
    }

    let synced = 0;
    const incompleteRecords = []; // records that fail validation — not silently dropped
    const failedRecords = [];     // records that fail API call

    for (const record of allPending) {
      // Patch missing interview_location from fallback fields before validation
      // (happens when app is closed/resumed and the select element wasn't re-populated)
      const recData = record.survey_data || record;
      if (!recData.interview_location && recData.interview_location_custom) {
        recData.interview_location = recData.interview_location_custom;
        if (record.survey_data) record.survey_data.interview_location = recData.interview_location;
        else record.interview_location = recData.interview_location;
      }

      // Validate — but tell user EXACTLY what is missing, never silently skip
      if (typeof validateFullRecord === 'function') {
        const check = validateFullRecord(recData);
        if (!check.valid) {
          const recLabel = record.a_age
            ? `Age ${record.a_age}, ${record.a_gender || '?'} — ${record.interview_location || 'unknown location'}`
            : (record.interview_location || record.offline_id || 'Unknown record');
          incompleteRecords.push({ label: recLabel, missing: check.missing });
          _dbg('SKIP validation fail: ' + recLabel + ' missing: ' + check.missing.slice(0,2).join(', '), '#f59e0b');
          continue;
        }
      } else {
        _dbg('validateFullRecord not available — skipping validation');
      }
      try {
        const _instId = record.institution_id || getSessionInstitutionId();
        if (!_instId) {
          _dbg('SKIP: institution_id missing for record age:' + (record.a_age||'?'), '#f87171');
          failedRecords.push('Missing institution ID — please log out and log in again, then retry sync.');
          continue;
        }
        // Generate household_id — backend requires a valid UUID.
        // _chsa4_key is stored as "rec-<uuid>" so strip the prefix before use.
        const _rawKey = record.household_id || record.id
                     || (record._chsa4_key ? record._chsa4_key.replace(/^rec-/, '') : null)
                     || record.offline_id   || record.record_id;
        const _hhId = _rawKey && /^[0-9a-f\-]{32,}$/i.test(_rawKey.replace(/-/g,''))
          ? _rawKey
          : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }));
        _dbg('Uploading record age:' + (record.a_age||'?') + ' hhid:' + _hhId.slice(0,16) + ' inst:' + _instId.slice(0,8)+'…', '#60a5fa');
        const mapped = mapRecordToDBPayload(record);
        const res = await fetch(`${API_BASE_URL}/api/survey/submit`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            household_id:    _hhId,
            institution_id:  _instId,
            respondent_name: record.respondent_name || record.full_name || 'Unknown',
            survey_data:     mapped,
            offline_id:      record.offline_id || record.record_id || record.id || record._chsa4_key,
            submitted_at:    record.created_at || new Date().toISOString(),
          }),
        });

        if (res.ok || res.status === 409) {
          await markSynced(record.id || record.offline_id || record._chsa4_key);
          synced++;
          _dbg('✅ Upload OK age:' + (record.a_age||'?'), '#4ade80');
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
          _dbg('❌ Upload FAILED: ' + reason, '#f87171');
          failedRecords.push(reason);
        }
      } catch (err) {
        _dbg('❌ Network error: ' + err.message, '#f87171');
        failedRecords.push('Network error: ' + err.message);
      }
    }

    const totalFailed = incompleteRecords.length + failedRecords.length;
    const statusMsg = `Synced ${synced}/${allPending.length}` + (totalFailed ? ` (${totalFailed} need attention)` : '');
    setSyncStatus(totalFailed === 0 ? 'ok' : 'error', statusMsg);

    // Show ONE clear modal explaining everything — no stacked alerts
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

// Shows a single clear modal after sync with all results — replaces stacked alert() calls
function _showSyncResultModal({ synced = 0, total = 0, incompleteRecords = [], failedRecords = [], fatalError = null, notLoggedIn = false } = {}) {
  const existing = document.getElementById('mss-sync-result-modal');
  if (existing) existing.remove();

  let icon, title, bodyHtml;

  if (notLoggedIn) {
    icon = '🔒'; title = 'Not Logged In';
    bodyHtml = '<p style="color:#dc2626">You must be logged in to sync records.<br>Please sign in and try again.</p>';
  } else if (fatalError) {
    icon = '❌'; title = 'Sync Error';
    bodyHtml = `<p style="color:#dc2626">${fatalError}</p>`;
  } else {
    const allGood = incompleteRecords.length === 0 && failedRecords.length === 0;
    icon = allGood ? '✅' : '⚠️';
    title = allGood ? `${synced} Record${synced !== 1 ? 's' : ''} Uploaded` : 'Sync Needs Attention';

    bodyHtml = '';
    if (synced > 0) {
      bodyHtml += `<div style="background:#e8f5ed;border-radius:10px;padding:10px 13px;margin-bottom:10px;font-size:.82rem;color:#1e5c38;font-weight:600">✅ ${synced} of ${total} record${total!==1?'s':''} uploaded successfully.</div>`;
    }

    if (incompleteRecords.length > 0) {
      bodyHtml += `<div style="background:#fff8e1;border-radius:10px;padding:10px 13px;margin-bottom:10px;font-size:.8rem;color:#7c4a00">`;
      bodyHtml += `<div style="font-weight:700;margin-bottom:6px">⚠ ${incompleteRecords.length} record${incompleteRecords.length!==1?'s':''} not uploaded — incomplete answers:</div>`;
      incompleteRecords.slice(0, 3).forEach(rec => {
        bodyHtml += `<div style="margin-bottom:8px;padding:7px 10px;background:rgba(0,0,0,.06);border-radius:7px">`;
        bodyHtml += `<div style="font-weight:700;margin-bottom:3px">📋 ${rec.label}</div>`;
        bodyHtml += `<div style="color:#b45309">Missing: ${rec.missing.slice(0, 3).join(', ')}${rec.missing.length > 3 ? ` + ${rec.missing.length - 3} more` : ''}</div>`;
        bodyHtml += `</div>`;
      });
      if (incompleteRecords.length > 3) bodyHtml += `<div style="font-size:.74rem;opacity:.7">…and ${incompleteRecords.length - 3} more. Open the record and fill in the missing sections.</div>`;
      bodyHtml += `<div style="margin-top:6px;font-size:.75rem">Open each record from Saved Records and complete the missing fields, then sync again.</div>`;
      bodyHtml += `</div>`;
    }

    if (failedRecords.length > 0) {
      const unique = [...new Set(failedRecords)];
      bodyHtml += `<div style="background:#fdecea;border-radius:10px;padding:10px 13px;font-size:.8rem;color:#b91c1c">`;
      bodyHtml += `<div style="font-weight:700;margin-bottom:5px">❌ ${failedRecords.length} record${failedRecords.length!==1?'s':''} failed to upload:</div>`;
      bodyHtml += `<div style="line-height:1.6">${unique.slice(0,3).join('<br>')}${unique.length>3?`<br>…and ${unique.length-3} more`:''}</div>`;
      bodyHtml += `<div style="margin-top:6px;font-size:.75rem">Check your internet connection and try again. If this keeps happening, contact your supervisor.</div>`;
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

async function getUnsyncedRecords() {
  try {
    const db = await openDB();
    return await getAllUnsynced(db);
  } catch {
    // survey-core.js saves all records into a single 'chsa4' localStorage object
    // keyed by record ID — this is the actual storage used on device.
    // NOTE: _finished filter removed — records fully filled but closed before showFinish()
    // were silently invisible to sync. validateFullRecord in syncAll reports them clearly.
    // Blank ghost records (no real content) are excluded so they are never uploaded.
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
  // Always update chsa4 (localStorage) — this is what openSyncModal reads for
  // the uploaded/not-uploaded counts. IDB is updated separately below.
  try {
    const stored = JSON.parse(localStorage.getItem('chsa4') || '{}');
    let matched = false;
    for (const [k, r] of Object.entries(stored)) {
      if (k.startsWith('_') || !r) continue;
      // Match by chsa4 key directly, or by any of the id fields the record may carry
      if (k === id || r.offline_id === id || r.record_id === id || r.id === id
          || ('rec-' + id) === k || k.replace(/^rec-/, '') === id) {
        stored[k]._synced = true;
        matched = true;
      }
    }
    if (matched) localStorage.setItem('chsa4', JSON.stringify(stored));
  } catch {}

  // Also update IndexedDB (best-effort)
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if(getReq.result){
          getReq.result._synced = true;
          const putReq = store.put(getReq.result);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        } else {
          resolve();
        }
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
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
    };
  });
}

function getAllUnsynced(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const results = [];
    const req = tx.objectStore('records').openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { if (!cursor.value._synced) results.push(cursor.value); cursor.continue(); }
      else resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

function getSessionInstitutionId() {
  // 1. Decode from JWT
  try {
    const token = getAuthToken();
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.institution_id) return payload.institution_id;
    }
  } catch {}
  // 2. chsa_auth (survey-auth.js login)
  try {
    const v = JSON.parse(localStorage.getItem('chsa_auth') || '{}').institution_id;
    if (v) return v;
  } catch {}
  // 3. chsa_session (institution admin login path)
  try {
    const s = JSON.parse(localStorage.getItem('chsa_session') || '{}');
    const v = s.institution_id || s.institutionId;
    if (v) return v;
  } catch {}
  // 4. hs_session (legacy key)
  try {
    const v = JSON.parse(localStorage.getItem('hs_session') || '{}').institution_id;
    if (v) return v;
  } catch {}
  // institution_id missing — upload will fail schema validation
  return null;
}

function getSessionInstitutionName() {
  // Primary: chsa_auth session (survey-auth.js saves institution_name here on login)
  try {
    const sess = JSON.parse(localStorage.getItem('chsa_auth') || '{}');
    if (sess.institution_name) return sess.institution_name;
  } catch {}
  // Fallback: JWT payload
  try {
    const token = getAuthToken();
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.institution_name) return payload.institution_name;
    }
  } catch {}
  return null;
}

function updateNetworkStatus() { setSyncStatus(navigator.onLine ? 'idle' : 'offline'); }
window.addEventListener('online', () => { updateNetworkStatus(); syncAll(); });
window.addEventListener('offline', updateNetworkStatus);
document.addEventListener('DOMContentLoaded', () => {
  updateNetworkStatus();
  const btn = document.getElementById('sync-btn');
  if (btn) btn.addEventListener('click', syncAll);
});

// Force re-upload of ALL records (even already-synced ones), used by the Sync modal
async function forceSyncAll() {
  if (_syncBusy) return;
  _syncBusy = true;
  setSyncStatus('syncing');

  if (!getAuthToken()) {
    setSyncStatus('error', 'Not logged in');
    _syncBusy = false;
    alert('You must be logged in to sync records.');
    return;
  }

  try {
    // Get ALL records from IndexedDB + localStorage (including already-synced)
    let allRecords = [];
    try {
      const db = await openDB();
      allRecords = await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const results = [];
        const req = tx.objectStore('records').openCursor();
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) { results.push(cursor.value); cursor.continue(); }
          else resolve(results);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {}

    // Also check chsa4 (the actual storage used by survey-core.js)
    try {
      const stored = JSON.parse(localStorage.getItem('chsa4') || '{}');
      for (const [k, r] of Object.entries(stored)) {
        if (!k.startsWith('_') && r && typeof r === 'object') {
          allRecords.push({ ...r, _chsa4_key: k });
        }
      }
    } catch {}

    // Legacy: also check hs_record_* keys for any older records
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('hs_record_')) continue;
      try { const r = JSON.parse(localStorage.getItem(key)); if (r) allRecords.push(r); } catch {}
    }

    if (!allRecords.length) {
      setSyncStatus('ok', 'No records found to force-sync');
      _syncBusy = false;
      alert('No records found on this device to upload.');
      return;
    }

    // Deduplicate by offline_id before upload loop
    const seen = new Set();
    allRecords = allRecords.filter(r => {
      const id = r.offline_id || r.record_id || r.id;
      if(!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    let synced = 0, failed = 0;
    const _forceErrors = [];
    for (const record of allRecords) {
      // Patch missing interview_location from fallback fields
      if (!record.interview_location && record.interview_location_custom) {
        record.interview_location = record.interview_location_custom;
      }
      try {
        const _instId = record.institution_id || getSessionInstitutionId();
        if (!_instId) {
          // institution_id missing — skip record
          failedRecords.push('Missing institution ID — please log out and log in again, then retry sync.');
          continue;
        }
        const _rawKey2 = record.household_id || record.id
                      || (record._chsa4_key ? record._chsa4_key.replace(/^rec-/, '') : null)
                      || record.offline_id  || record.record_id;
        const _hhId2 = _rawKey2 && /^[0-9a-f\-]{32,}$/i.test(_rawKey2.replace(/-/g,''))
          ? _rawKey2
          : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }));
        const mapped = mapRecordToDBPayload(record);
        const res = await fetch(`${API_BASE_URL}/api/survey/submit`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            household_id:    _hhId2,
            institution_id:  _instId,
            respondent_name: record.respondent_name || record.full_name || 'Unknown',
            survey_data:     mapped,
            offline_id:      record.offline_id || record.record_id || record.id,
            submitted_at:    record.created_at || new Date().toISOString(),
          }),
        });
        if (res.ok || res.status === 409) {
          await markSynced(record.id || record.offline_id);
          synced++;
          try {
            const stored = JSON.parse(localStorage.getItem('chsa4') || '{}');
            if (window.recs) Object.assign(window.recs, stored);
            if (typeof renDrw === 'function') renDrw();
          } catch {}
        } else {
          let reason = `HTTP ${res.status}`;
          try { const b = await res.json(); reason = b.error || b.message || reason; } catch { try { reason = await res.text() || reason; } catch {} }
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
      const unique = [...new Set(_forceErrors)];
      const summary = unique.slice(0, 3).join('\n');
      const more = unique.length > 3 ? `\n…and ${unique.length - 3} more` : '';
      alert(`Force sync complete.\n✅ ${synced} uploaded\n❌ ${failed} failed\n\nReason:\n${summary}${more}`);
    } else {
      alert(`Force sync complete.\n✅ ${synced} uploaded${failed ? `\n❌ ${failed} failed` : ''}`);
    }
  } catch (err) {
    setSyncStatus('error', err.message);
    alert('Force sync error: ' + err.message);
  } finally {
    _syncBusy = false;
  }
}
