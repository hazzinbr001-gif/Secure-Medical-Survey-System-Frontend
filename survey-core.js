
// 
// MSS CORE — Error Handling & Input Validation
// 
function mssSafeRun(fn, context) {
  try {
    return fn();
  } catch (err) {
    console.error('[MSS Core]', context || 'Error', err);
    if (typeof showToast === 'function') showToast(' ' + (context || 'Error'), true);
    return null;
  }
}

// Input sanitizer for survey text fields — prevents XSS in reports
function mssSanitizeInput(val) {
  if (!val) return '';
  return String(val).trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .slice(0, 1000);
}


// ─────────────────────────────────────────────────────────────────────────────
//  MSS GUIDANCE TICKER — type + pause + slide-up engine
//  Called from init() after sections are built.
// ─────────────────────────────────────────────────────────────────────────────
function MSS_initTickers() {
  const MESSAGES = [
    "All responses are confidential.",
    "You may stop the interview at any time.",
    "No names appear in any report.",
    "Your honesty helps your community.",
    "There are no right or wrong answers.",
    "Recall actual numbers, not estimates.",
    "Answer for your own household only.",
    "It is fine to say I do not know.",
    "Think carefully before answering.",
    "Even small health issues matter here.",
    "This data improves services near you.",
    "Count all people sleeping in this house.",
    "Include infants and the elderly.",
    "Describe the house as it is today.",
    "Note the main building materials used.",
    "Include illnesses in the past 12 months.",
    "Mention any chronic conditions.",
    "Answer for all children under 5.",
    "Include children no longer living.",
    "Count meals eaten yesterday.",
    "Include snacks and drinks.",
    "All HIV answers are strictly private.",
    "No result is shared without consent.",
    "Describe the latrine actually used.",
    "Note if shared with other households.",
    "State the water source used most often.",
    "Note if water is treated at home.",
    "Answer based on your own experience.",
    "Cultural practices are important data.",
    "Note pests seen in the last month.",
    "Include inside and outside the home.",
    "Share any concerns freely.",
    "Your observations guide local policy.",
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const TYPE_DELAY = 72;
  const PAUSE_MS   = 3600;
  const SLIDE_MS   = 480;

  function runTicker(ticker) {
    const textEl   = document.createElement('div');
    textEl.className = 'sec-ticker-text';
    const textNode = document.createTextNode('');
    const cursor   = document.createElement('span');
    cursor.className = 'sec-ticker-cursor';
    textEl.appendChild(textNode);
    textEl.appendChild(cursor);
    ticker.appendChild(textEl);

    let msgs   = shuffle(MESSAGES);
    let msgIdx = Math.floor(Math.random() * msgs.length);
    let paused = false;

    ticker.addEventListener('mouseenter', () => { paused = true; });
    ticker.addEventListener('mouseleave',  () => { paused = false; });

    function typeMessage(msg) {
      let i = 0;
      textNode.textContent = '';
      function step() {
        if (i <= msg.length) {
          textNode.textContent = msg.slice(0, i++);
          setTimeout(step, paused ? TYPE_DELAY * 4 : TYPE_DELAY);
        } else {
          setTimeout(slideOut, PAUSE_MS);
        }
      }
      step();
    }

    function slideOut() {
      textEl.classList.add('ticker-exit');
      setTimeout(slideIn, SLIDE_MS);
    }

    function slideIn() {
      textEl.classList.remove('ticker-exit');
      textEl.classList.add('ticker-enter');
      msgIdx = (msgIdx + 1) % msgs.length;
      if (msgIdx === 0) msgs = shuffle(MESSAGES);
      const nextMsg = msgs[msgIdx];
      void textEl.offsetWidth;
      textEl.classList.remove('ticker-enter');
      textEl.classList.add('ticker-enter-active');
      setTimeout(() => {
        textEl.classList.remove('ticker-enter-active');
        typeMessage(nextMsg);
      }, SLIDE_MS);
    }

    typeMessage(msgs[msgIdx]);
  }

  document.querySelectorAll('.sec-hdr').forEach(hdr => {
    if (hdr.querySelector('.sec-ticker')) return;
    const ticker = document.createElement('div');
    ticker.className = 'sec-ticker';
    hdr.appendChild(ticker);
    runTicker(ticker);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MSS CHIP SYNC — ensures all radio/checkbox chips show correct visual state
//  on tap, regardless of CSS sibling selector support on the device browser.
// ─────────────────────────────────────────────────────────────────────────────
function MSS_syncChips(root) {
  var container = root || document;

  function syncGroup(input) {
    var name = input.name;
    var type = input.type;
    if (type === 'radio') {
      // Deselect all chips in this radio group
      container.querySelectorAll('input[type="radio"][name="' + name + '"]')
        .forEach(function(inp) {
          var chip = inp.closest('.chip');
          if (chip) chip.setAttribute('data-checked', 'false');
        });
    }
    // Select this chip
    var chip = input.closest('.chip');
    if (chip) chip.setAttribute('data-checked', input.checked ? 'true' : 'false');
  }

  // Listen for changes on all chips in the container
  container.querySelectorAll('.chip input[type="radio"], .chip input[type="checkbox"]')
    .forEach(function(inp) {
      inp.addEventListener('change', function() { syncGroup(this); });
      // Also handle tap on the label (label click triggers change, but just in case)
      var lbl = inp.nextElementSibling;
      if (lbl && lbl.tagName === 'LABEL') {
        lbl.addEventListener('click', function() {
          setTimeout(function() { syncGroup(inp); }, 0);
        });
      }
    });

  // Sync current state on init (e.g. when loading saved record)
  container.querySelectorAll('.chip input[type="radio"]:checked, .chip input[type="checkbox"]:checked')
    .forEach(function(inp) { syncGroup(inp); });
}




// ─────────────────────────────────────────────────────────────────────────────
//  mssValidateSection — logic-driven, NOT CSS-driven.
//  Uses getRequiredFields() which filters BASE_REQS through FIELD_DEPS
//  so only fields applicable to this respondent are enforced.
// ─────────────────────────────────────────────────────────────────────────────
function mssValidateSection(secIndex) {
  const record = (typeof collectAll === 'function') ? collectAll() : {};
  const reqs = getRequiredFields(secIndex, record);
  if (!reqs.length) return { valid: true, errors: [] };
  const errors = [];
  reqs.forEach(function([name, type, label]) {
    if (type === 'radio' || type === 'checkbox') {
      const checked = document.querySelector('[name="' + name + '"]:checked');
      if (!checked) errors.push(label + (type === 'checkbox' ? ' — select at least one option' : ' is required'));
    } else {
      const el = document.querySelector('[name="' + name + '"]');
      const val = (el && el.value) ? el.value.trim() : '';
      if (!val) errors.push(label + ' is required');
    }
  });
  return { valid: errors.length === 0, errors };
}

/* Medical Survey System (MSS) — Core JS © 2026 Ministry of Health Kenya */

const SECS=[{label:'Consent Form'},{label:'A: Demography'},{label:'B: Housing'},{label:'C: Medical History'},{label:'D: Maternal & Child'},{label:'E: Nutrition'},{label:'F: HIV/AIDS'},{label:'G: Sanitation'},{label:'H: Environment & Water'},{label:'I: Cultural Practices'},{label:'J: Health Problems'},{label:'K: Pests & Vectors'},{label:'L: Challenges & Observations'}];

// ─────────────────────────────────────────────────────────────────────────────
//  BASE_REQS — static list of potentially required fields per section.
//  DO NOT use directly for validation. Use getRequiredFields() which filters
//  through FIELD_DEPS so only applicable fields are enforced.
// ─────────────────────────────────────────────────────────────────────────────
const BASE_REQS={
  0:[['consent_given','radio','Respondent Consent'],['interviewer_name','text','Interviewer Name'],['interview_date','text','Interview Date'],['interview_location','text','Village / Location']],
  1:[['a_age','text','Age of Respondent'],['a_gender','radio','Gender'],['a_tot_m','text','Total Males'],['a_tot_f','text','Total Females']],
  2:[['b_type','radio','Type of House'],['b_roof','radio','Roofing Material']],
  3:[['c_consult','radio','Consultation Sought']],
  4:[['d_preg','radio','Ever Pregnant (D1)']],
  5:[['e_meals','radio','Meals Per Day (E1)'],['e_enough','radio','Enough Food (E19)']],
  6:[['f_heard','radio','Heard about HIV/AIDS'],['f_tested','radio','HIV Test']],
  7:[['g_latrine','radio','Pit Latrine']],
  8:[['h_wsrc','checkbox','Water Source'],['h_treat','radio','Water Treatment']],
  9:[['i_rite','radio','Rite of Passage (I1)']],
  // Sections 10 (J), 11 (K), 12 (L) — observational, no hard-required fields
};

// ─────────────────────────────────────────────────────────────────────────────
//  FIELD_DEPS — declarative dependency graph.
//  Each entry is: fieldName → function(record) → boolean (true = applicable)
//  Fields NOT listed here are always applicable (unconditional).
//  This is the single source of truth for conditional logic.
// ─────────────────────────────────────────────────────────────────────────────
const FIELD_DEPS = {
  // ── Section A ──────────────────────────────────────────────────────────────
  'a_move_r':   r => r.a_move === 'Yes',

  // ── Section B ──────────────────────────────────────────────────────────────
  'b_sep':      r => r.b_rooms !== '1',
  'b_smoke_in': r => r.b_smoke === 'Yes',

  // ── Section C ──────────────────────────────────────────────────────────────
  'c_ill_age':  r => _hasValue(r, 'c_ill'),
  'c_where':    r => _hasValue(r, 'c_ill') && r.c_consult === 'Yes',
  'c_no_r':     r => _hasValue(r, 'c_ill') && r.c_consult === 'No',
  'c_who':      r => _hasValue(r, 'c_ill'),
  'c_accomp':   r => _hasValue(r, 'c_ill'),
  'c_meds':     r => _hasValue(r, 'c_ill'),
  'c_drug_d':   r => _hasValue(r, 'c_ill'),
  'c_preg':     r => r.a_gender !== 'Male',
  'c_deaths_n': r => r.c_deaths === 'Yes',
  'c_dage':     r => r.c_deaths === 'Yes',
  'c_dcause':   r => r.c_deaths === 'Yes',
  'c_disab':    r => r.c_spec === 'Yes',
  'c_disab_c':  r => r.c_spec === 'Yes',

  // ── Section D — Maternal & Child (entire section N/A for Male) ─────────────
  'd_preg':     r => r.a_gender !== 'Male',
  'd_preg_age': r => r.a_gender !== 'Male' && r.d_preg === 'Yes',
  'd_preg_n':   r => r.a_gender !== 'Male' && r.d_preg === 'Yes',
  'd_anc':      r => r.a_gender !== 'Male' && r.d_preg !== 'No',
  'd_anc_s':    r => r.a_gender !== 'Male' && r.d_anc === 'Yes',
  'd_anc_w':    r => r.a_gender !== 'Male' && r.d_anc === 'Yes',
  'd_anc_r':    r => r.a_gender !== 'Male' && r.d_anc === 'Yes',
  'd_del':      r => r.a_gender !== 'Male' && r.d_preg !== 'No',
  'd_del_r':    r => r.a_gender !== 'Male' && r.d_preg !== 'No',
  'd_contra':   r => r.a_gender !== 'Male' && r.d_fp !== 'No',
  'd_ct':       r => r.a_gender !== 'Male' && r.d_contra === 'Yes' && r.d_fp !== 'No',
  'd_fp_c':     r => r.a_gender !== 'Male' && r.d_fp !== 'No',

  // ── Section E — Nutrition & Lifestyle ──────────────────────────────────────
  'e_skip_m':   r => r.e_skip === 'Yes',
  'e_skip_w':   r => r.e_skip === 'Yes',
  'e_short':    r => r.e_skip === 'Yes',
  'e_pft':      r => r.e_pref === 'Yes',
  'e_pr':       r => r.e_pref === 'Yes',
  'e_prod':     r => r.e_garden === 'Yes',
  'e_crops':    r => r.e_garden === 'Yes',
  'e_taboo_d':  r => r.e_taboo === 'Yes',
  'e_exer_f':   r => r.e_exer === 'Yes',
  'e_yng':      r => r.e_kids === 'Yes',
  'e_bf':       r => r.e_kids === 'Yes',
  'e_bf_d':     r => r.e_kids === 'Yes',
  'e_bf_s':     r => r.e_kids === 'Yes' && r.e_bf === 'No',
  'e_wean':     r => r.e_kids === 'Yes',
  'e_wf2':      r => r.e_kids === 'Yes',
  'e_supp':     r => r.e_kids === 'Yes',
  'e_supp_d':   r => r.e_kids === 'Yes' && r.e_supp === 'Yes',
  'e_ninfo':    r => r.e_kids === 'Yes',
  'e_ninfo_d':  r => r.e_kids === 'Yes' && r.e_ninfo === 'Yes',

  // ── Section F — HIV/AIDS ────────────────────────────────────────────────────
  'f_info':     r => r.f_heard !== 'No',
  'f_screen':   r => r.f_heard !== 'No',
  'f_trans':    r => r.f_heard !== 'No',
  'f_prev':     r => r.f_heard !== 'No',
  'f_treat':    r => r.f_heard !== 'No',
  'f_aware':    r => r.f_heard !== 'No',
  'f_test_d':   r => r.f_tested === 'Yes',
  'f_arv':      r => r.f_fam_hiv === 'Yes',
  'f_arv_r':    r => r.f_fam_hiv === 'Yes' && r.f_arv === 'No',
  'f_afford':   r => r.f_pay === 'Yes',
  'f_pay_m':    r => r.f_pay === 'Yes',
  'f_out_f':    r => r.f_out === 'Yes',

  // ── Section G — Sanitation ──────────────────────────────────────────────────
  'g_lat_n':    r => r.g_latrine === 'Yes',
  'g_lat_u':    r => r.g_latrine === 'Yes',
  'g_lat_d':    r => r.g_latrine === 'Yes',
  'g_lat_wd':   r => r.g_latrine === 'Yes',
  'g_lat_p':    r => r.g_latrine === 'Yes',
  'g_lat_s':    r => r.g_latrine === 'Yes',
  'g_lat_c':    r => r.g_latrine === 'Yes',
  'g_lat_t':    r => r.g_latrine === 'Yes',
  'g_lat_td':   r => r.g_latrine === 'Yes' && r.g_lat_t === 'Yes',
  'g_alt':      r => r.g_latrine === 'No',
  'g_oral_a':   r => r.g_oral === 'Yes',

  // ── Section H — Environment & Water ────────────────────────────────────────
  'h_tm':       r => r.h_treat === 'Yes',

  // ── Section I — Cultural Practices ─────────────────────────────────────────
  'i_circ':     r => r.i_rite === 'Circumcision',
  'i_age':      r => r.i_rite === 'Circumcision',
  'i_circ_w':   r => r.i_rite === 'Circumcision',
  'i_edu_c':    r => r.i_edu === 'Yes',
  'i_birth_d':  r => r.i_birth === 'Yes',
  'i_death_d':  r => r.i_death === 'Yes',
  'i_bur_o':    r => r.i_bur === 'Other',
  'i_winh_h':   r => r.i_winh === 'Yes',
  'i_winh_b':   r => r.i_winh === 'Yes',
  'i_winh_n':   r => r.i_winh === 'Yes',
};

// ─────────────────────────────────────────────────────────────────────────────
//  LOGIC ENGINE — pure data-driven helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if a record field has a meaningful value (not empty/null/[]). */
function _hasValue(record, name) {
  const v = record[name];
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Returns true if fieldName is applicable given the current record state.
 * Uses FIELD_DEPS as the single source of truth — NO CSS/DOM dependency.
 */
function isFieldApplicable(name, record) {
  const dep = FIELD_DEPS[name];
  if (!dep) return true; // no dependency = always applicable
  try { return !!dep(record); } catch(e) { return true; }
}

/**
 * Returns the list of required fields for a section, filtered by applicability.
 * Replaces the old static REQS lookup — validation is now data-driven.
 */
function getRequiredFields(secIndex, record) {
  const base = BASE_REQS[secIndex] || [];
  return base.filter(function([name]) { return isFieldApplicable(name, record); });
}

/**
 * Strips N/A fields from a collected record so inapplicable data is never saved.
 * Always call this before persisting — use collectAll() only for UI population.
 */
function collectClean() {
  const raw = collectAll();
  const clean = { schema_version: raw.schema_version || '1.0.0' };
  Object.keys(raw).forEach(function(k) {
    // Always keep meta/identity fields
    if (k.startsWith('_') || ['schema_version','interviewer_name','interview_date',
        'interview_location','interview_location_custom','consent_given'].includes(k)) {
      clean[k] = raw[k];
      return;
    }
    if (isFieldApplicable(k, raw)) clean[k] = raw[k];
  });
  return clean;
}

// Keep REQS as an alias so any external code that still references it doesn't crash
const REQS = BASE_REQS;

// 
//  STATE
// 
let cur=0, recId=null, recs={};

function generateRecordId(){
  if(typeof crypto !== 'undefined' && crypto.randomUUID){
    return 'rec-' + crypto.randomUUID();
  }
  return 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}
function ls(){try{recs=JSON.parse(localStorage.getItem('chsa4')||'{}');}catch(e){recs={};}}
function ss(){localStorage.setItem('chsa4',JSON.stringify(recs));}
function cRec(){return recs[recId]||{};}
function pRec(p){
  if(!recId) recId=generateRecordId();
  // Merge then strip N/A fields so inapplicable data never persists
  const merged = {...cRec(),...p,_u:new Date().toLocaleString()};
  const clean = {};
  const meta = ['_u','_c','_synced','_finished','schema_version',
    'interviewer_name','interview_date','interview_location',
    'interview_location_custom','consent_given'];
  Object.keys(merged).forEach(k=>{
    if(k.startsWith('_') || meta.includes(k) || isFieldApplicable(k,merged)){
      clean[k]=merged[k];
    }
  });
  recs[recId]=clean;
  ss();
}

function collectAll(){
  const r={ schema_version: '1.0.0' };
  // Include hidden inputs (interviewer_name etc) + all form fields
  document.querySelectorAll('.sec-card input,.sec-card select,.sec-card textarea, input[type=hidden]').forEach(el=>{
    if(!el.name)return;
    if(el.type==='radio'||el.type==='checkbox'){
      if(el.checked){
        // Build unique arrays for checkboxes (multi-select fields like c_ill, h_wsrc)
        if(el.type==='radio'){
          r[el.name]=el.value; // radio: last checked wins
        } else {
          const existing=[].concat(r[el.name]||[]).filter(Boolean);
          if(!existing.includes(el.value)) existing.push(el.value);
          r[el.name]=existing.length===1?existing[0]:existing;
        }
      }
    } else if(el.value){
      // Sanitize free-text inputs to prevent XSS in generated reports
      r[el.name]= (el.type==='text'||el.tagName==='TEXTAREA') ? mssSanitizeInput(el.value) : el.value;
    }
  });
  // Always capture interviewer name from localStorage as backup
  if(!r.interviewer_name){
    const n=localStorage.getItem('chsa_user_name');
    if(n) r.interviewer_name=n;
  }
  return r;
}
function loadInto(d){
  if(!d)return;
  document.querySelectorAll('.sec-card input,.sec-card select,.sec-card textarea').forEach(el=>{
    if(!el.name)return;
    if(el.type==='radio'||el.type==='checkbox')el.checked=false;
    else el.value='';
  });
  Object.entries(d).forEach(([k,v])=>{
    if(k.startsWith('_'))return;
    [].concat(v).forEach(val=>{
      document.querySelectorAll(`[name="${k}"]`).forEach(el=>{
        if(el.type==='radio'||el.type==='checkbox'){if(el.value===val)el.checked=true;}
        else el.value=val;
      });
    });
  });
  setTimeout(() => runSectionRules(cur), 100);
  setTimeout(() => MSS_syncChips(document), 150);
}
function saveCur(){
  // Guard: never create/restore a record that was just deleted or has no context.
  // recId is set to null by delRec() before this can fire, so we only
  // generate a new ID when the user explicitly starts or resumes a record.
  if(!recId) return;
  // Always save current state — validation errors are warnings only.
  // Validation blocks Next/Submit but must NEVER block Save Progress,
  // so interviewers can save drafts mid-section without losing data.
  // (Errors are still shown via validate() when pressing Next.)
  pRec(collectAll());
}
function gv(name){const el=document.querySelector(`[name="${name}"]`);return el?el.value:'';}
function gvn(name){return parseInt(gv(name))||0;}
function gvRadio(name){const el=document.querySelector(`[name="${name}"]:checked`);return el?el.value:'';}

// 
//  VAX TABLE QUICK-FILL HELPERS
// 
function vaxQuickFillAll(){
  const today = new Date().toISOString().split('T')[0];
  for(let i=1;i<=5;i++){
    const dob = document.querySelector(`[name="dc${i}d"]`);
    const sex = document.querySelector(`[name="dc${i}s"]`);
    if(dob && !dob.value) dob.value = today;
    if(sex && !sex.value) sex.value = 'M';
    for(let j=0;j<10;j++){
      const sel = document.querySelector(`[name="dc${i}v${j}"]`);
      if(sel) sel.value = '';
    }
  }
  showToast(' All 5 children filled with ');
}
function vaxQuickFillNone(){
  for(let i=1;i<=5;i++){
    const dob = document.querySelector(`[name="dc${i}d"]`);
    const sex = document.querySelector(`[name="dc${i}s"]`);
    if(dob) dob.value = '';
    if(sex) sex.value = '';
    for(let j=0;j<10;j++){
      const sel = document.querySelector(`[name="dc${i}v${j}"]`);
      if(sel) sel.value = '';
    }
  }
  showToast(' Vaccination table cleared');
}
function vaxQuickFill1Child(){
  const today = new Date().toISOString().split('T')[0];
  const dob = document.querySelector('[name="dc1d"]');
  const sex = document.querySelector('[name="dc1s"]');
  if(dob && !dob.value) dob.value = today;
  if(sex && !sex.value) sex.value = 'M';
  for(let j=0;j<10;j++){
    const sel = document.querySelector(`[name="dc1v${j}"]`);
    if(sel) sel.value = '';
  }
  showToast(' Row 1 filled with ');
}





// ─────────────────────────────────────────────────────────────────────────────
//  validateFullRecord — data-driven final validation.
//  Skips fields that are not applicable for this respondent via isFieldApplicable.
//  Also strips N/A values from the record before persisting (via collectClean).
// ─────────────────────────────────────────────────────────────────────────────
function validateFullRecord(record){
  const missing = [];
  Object.entries(BASE_REQS).forEach(([secIdx, fields]) => {
    fields.forEach(([name, type, label]) => {
      // Skip fields not applicable to this respondent (e.g. pregnancy for Male)
      if (!isFieldApplicable(name, record)) return;
      const val = record[name];
      const empty = !val || (Array.isArray(val) && val.length === 0) || val === '';
      if(empty) missing.push('Section ' + SECS[parseInt(secIdx)]?.label + ' — ' + label);
    });
  });
  return { valid: missing.length === 0, missing };
}

function finalSubmit(){
  const record = collectAll();
  const check = validateFullRecord(record);
  if(!check.valid){
    alert('Cannot submit. Missing:\n' + check.missing.join('\n'));
    return;
  }
  pRec(record);
}

const RULE_REGISTRY = {
  global: [
    runInferenceRules,
    ruleConsentAge, ruleHouseholdTotals, ruleAgeBracketsVsTotal,
    ruleGenderPosition, rulePregnancyGender, ruleConsentBlock,
    ruleLocation, ruleSkipMeals, ruleMoveAway, ruleDeaths,
    ruleLatrine, ruleWaterTreatment, ruleSmoking, ruleBedrooms,
    ruleDisability, ruleBreastfeed, ruleHIVFamily, ruleWifeInherit,
    ruleFoodShortage,
    ruleHouseTypeVsRoof, ruleHouseTypeVsFloor, ruleHouseTypeVsWindows,
    ruleHouseTypeVsLighting, ruleFuelVsCooking, ruleRoomsVsAnimals,
    ruleEducationVsOccupation, ruleMaritalVsAge, ruleANCVsPregnancy,
    ruleContraVsFP, ruleWeightHeightPlausibility, ruleLandSizeVsAnimals,
    ruleWaterDistanceVsPollution, ruleCircumcisionGender,
    ruleDeathCauseAutoSuggest, ruleIllnessTreatmentChain,
    ruleHIVHeard, ruleVaxTable,
  ],
  section: {
    1:[ruleSecA], 2:[ruleSecB], 3:[ruleSecC], 4:[ruleSecD],
    5:[ruleSecE], 6:[ruleSecF], 7:[ruleSecG], 8:[ruleSecH], 9:[ruleSecI],
    10:[ruleSecJ], 11:[ruleSecK], 12:[ruleSecL],
  }
};

function runSectionRules(secIdx){
  (RULE_REGISTRY.global || []).forEach(fn => { try { fn(); } catch(e){} });
  const secFns = RULE_REGISTRY.section[secIdx] || [];
  secFns.forEach(fn => { try { fn(); } catch(e){} });
  if(typeof updateIntegrityScore === 'function') updateIntegrityScore();
}

// runAllRules() removed — was dead code never called anywhere.
// Use runSectionRules(secIdx) which delegates to RULE_REGISTRY for all global + section rules.

function updateIntegrityScore(){
  const warnings = document.querySelectorAll('.dyn-msg[style*="var(--red)"]').length;
  const infos = document.querySelectorAll('.dyn-msg[style*="var(--green)"]').length;
  const badge = document.getElementById('integrityBadge');
  if(!badge) return;
  if(warnings > 0){
    badge.style.display='inline-block';
    badge.style.background='rgba(211,47,47,0.85)';
    badge.textContent=` ${warnings} issue${warnings>1?'s':''}`;
  } else if(infos > 0){
    badge.style.display='inline-block';
    badge.style.background='rgba(76,175,114,0.7)';
    badge.textContent=` ${infos} note${infos>1?'s':''}`;
  } else {
    badge.style.display='none';
  }
}

// 
//  HOUSING LOGIC RULES
// 

// RULE: Permanent house CANNOT have grass-thatched roof
function ruleHouseTypeVsRoof(){
  const type = gvRadio('b_type');
  const roof = gvRadio('b_roof');
  const roofGrp = document.querySelector('[name="b_roof"]')?.closest('.form-group');
  const typeGrp = document.querySelector('[name="b_type"]')?.closest('.form-group');

  if(type === 'Permanent' && roof === 'Grass Thatched'){
    showFieldMsg(roofGrp,' A Permanent house cannot have a Grass Thatched roof — please correct','warn');
    showFieldMsg(typeGrp,' Grass thatched roof is inconsistent with Permanent house type','warn');
  } else if(type === 'Temporary' && roof === 'Tiles'){
    showFieldMsg(roofGrp,' A Temporary house cannot have Tile roofing — please verify','warn');
  } else if(type === 'Semi-permanent' && roof === 'Tiles'){
    showFieldMsg(roofGrp,' Tiles are unusual for Semi-permanent structures — please verify','info');
  } else {
    clearFieldMsg(roofGrp);
    clearFieldMsg(typeGrp);
  }

  // Auto-suggest valid roofs based on house type
  const roofHints = {
    'Permanent': ['Iron Sheets','Tiles'],
    'Semi-permanent': ['Iron Sheets','Grass Thatched'],
    'Temporary': ['Grass Thatched','Iron Sheets']
  };
  if(type){
    const valid = roofHints[type]||[];
    document.querySelectorAll('[name="b_roof"]').forEach(el=>{
      const lbl = el.nextElementSibling||el.closest('.chip')?.querySelector('label');
      if(!lbl) return;
      if(valid.length && !valid.includes(el.value)){
        lbl.style.opacity='0.45';
        lbl.title=`Unusual for ${type} house`;
      } else {
        lbl.style.opacity='1';
        lbl.title='';
      }
    });
  }
}

// RULE: Permanent house cannot have earthen floor
function ruleHouseTypeVsFloor(){
  const type = gvRadio('b_type');
  const floor = gvRadio('b_floor');
  const floorGrp = document.querySelector('[name="b_floor"]')?.closest('.form-group');
  if(type === 'Permanent' && floor === 'Earthen'){
    showFieldMsg(floorGrp,' A Permanent house should not have an Earthen floor — please verify','warn');
  } else if(type === 'Temporary' && floor === 'Cemented'){
    showFieldMsg(floorGrp,' Cemented floor is unusual for a Temporary house — please verify','info');
  } else {
    clearFieldMsg(floorGrp);
  }
  // Dim incompatible options
  document.querySelectorAll('[name="b_floor"]').forEach(el=>{
    const lbl = el.closest('.chip')?.querySelector('label');
    if(!lbl) return;
    const incompatible = (type==='Permanent' && el.value==='Earthen') || (type==='Temporary' && el.value==='Cemented');
    lbl.style.opacity = incompatible ? '0.4' : '1';
  });
}

// RULE: Permanent house should have windows
function ruleHouseTypeVsWindows(){
  const type = gvRadio('b_type');
  const wins = gvRadio('b_win');
  const winGrp = document.querySelector('[name="b_win"]')?.closest('.form-group');
  if(type === 'Permanent' && wins === 'None'){
    showFieldMsg(winGrp,' A Permanent house with no windows is unusual — please verify','warn');
  } else { clearFieldMsg(winGrp); }
}

// RULE: Permanent house can't use paraffin as primary lighting
function ruleHouseTypeVsLighting(){
  const type = gvRadio('b_type');
  const light = gvRadio('b_light');
  const lightGrp = document.querySelector('[name="b_light"]')?.closest('.form-group');
  if(type === 'Permanent' && light === 'Paraffin Lamp'){
    showFieldMsg(lightGrp,' Paraffin lamp unusual for Permanent house — consider verifying','info');
  } else { clearFieldMsg(lightGrp); }
}

// RULE: If cooking inside + charcoal/firewood → flag ventilation concern
function ruleFuelVsCooking(){
  const cook = gvRadio('b_cook');
  const fuel = gvRadio('b_fuel');
  const vent = gvRadio('b_ventil');
  const fuelGrp = document.querySelector('[name="b_fuel"]')?.closest('.form-group');
  if(cook === 'Inside' && (fuel === 'Firewood' || fuel === 'Charcoal') && vent === 'Poor'){
    showFieldMsg(fuelGrp,' Indoor cooking with '+fuel+' and poor ventilation — HIGH health risk. Note for intervention.','warn');
  } else if(cook === 'Inside' && (fuel === 'Firewood' || fuel === 'Charcoal')){
    showFieldMsg(fuelGrp,' Indoor cooking with '+fuel+' — check ventilation for respiratory risk','info');
  } else { clearFieldMsg(fuelGrp); }
}

// RULE: Sharing house with animals + no. bedrooms vs people — crowding x animals
function ruleRoomsVsAnimals(){
  const animals = gvRadio('b_animals');
  const rooms = gvRadio('b_rooms');
  const proom = gvRadio('b_proom');
  const animalsGrp = document.querySelector('[name="b_animals"]')?.closest('.form-group');
  if(animals === 'Yes' && proom === 'More than 4'){
    showFieldMsg(animalsGrp,' Sharing house with animals AND >4 people/bedroom — high disease transmission risk','warn');
  } else if(animals === 'Yes'){
    showFieldMsg(animalsGrp,' Sharing house with animals — potential zoonotic disease risk, note for health education','info');
  } else { clearFieldMsg(animalsGrp); }
}

// 
//  ENHANCED CROSS-FIELD LOGIC
// 

// RULE: Education vs Occupation plausibility
function ruleEducationVsOccupation(){
  const edu = gvRadio('a_edu');
  const occ = gvRadio('a_occ');
  const occGrp = document.querySelector('[name="a_occ"]')?.closest('.form-group');
  if(edu === 'None' && occ === 'Government'){
    showFieldMsg(occGrp,' Government employment with no formal education — please verify','warn');
  } else { clearFieldMsg(occGrp); }
}

// RULE: Marital status plausibility vs age
function ruleMaritalVsAge(){
  const age = gvn('a_age');
  const marital = gvRadio('a_marital');
  const marGrp = document.querySelector('[name="a_marital"]')?.closest('.form-group');
  if(!age || !marital) return;
  if(age < 18 && (marital === 'Married' || marital === 'Divorced/Separated' || marital === 'Widowed/Widower')){
    showFieldMsg(marGrp,` Age ${age} with marital status "${marital}" — respondents must be 18+`,'warn');
  } else if(age < 20 && marital === 'Widowed/Widower'){
    showFieldMsg(marGrp,` Age ${age} recorded as widowed — verify`,'info');
  } else { clearFieldMsg(marGrp); }
}

// RULE: ANC only relevant if pregnant/ever pregnant
function ruleANCVsPregnancy(){
  const preg = gvRadio('d_preg');
  const ancGrp = document.querySelector('[name="d_anc"]')?.closest('.form-group');
  const ancWGrp = document.querySelector('[name="d_anc_w"]')?.closest('.form-group');
  const ancSGrp = document.querySelector('[name="d_anc_s"]')?.closest('.form-group');
  if(preg === 'No'){
    [ancGrp,ancWGrp,ancSGrp].forEach(g=>{ if(g){ g.style.opacity='0.35'; g.style.pointerEvents='none'; }});
  } else {
    [ancGrp,ancWGrp,ancSGrp].forEach(g=>{ if(g){ g.style.opacity='1'; g.style.pointerEvents=''; }});
  }
}

// RULE: Contraceptive type only if ever used
function ruleContraVsFP(){
  const used = gvRadio('d_contra');
  const typeGrp = document.querySelector('[name="d_ct"]')?.closest('.form-group');
  if(used === 'No'){
    if(typeGrp){ typeGrp.style.opacity='0.35'; typeGrp.style.pointerEvents='none'; }
  } else {
    if(typeGrp){ typeGrp.style.opacity='1'; typeGrp.style.pointerEvents=''; }
  }
}

// RULE: Child weight/height plausibility for age
function ruleWeightHeightPlausibility(){
  for(let i=1;i<=7;i++){
    const ht = parseFloat(document.querySelector(`[name="ea${i}h"]`)?.value)||0;
    const wt = parseFloat(document.querySelector(`[name="ea${i}w"]`)?.value)||0;
    const dob = document.querySelector(`[name="ea${i}d"]`)?.value;
    const htEl = document.querySelector(`[name="ea${i}h"]`);
    const wtEl = document.querySelector(`[name="ea${i}w"]`);
    if(!ht && !wt) continue;
    // Basic plausibility: weight shouldn't exceed height/3 for young children
    if(ht > 0 && wt > 0){
      if(wt > ht){ htEl && (htEl.style.borderColor='var(--red)'); wtEl && (wtEl.style.borderColor='var(--red)'); }
      else { htEl && (htEl.style.borderColor=''); wtEl && (wtEl.style.borderColor=''); }
    }
    // MUAC for malnourishment flag
    const muac = parseFloat(document.querySelector(`[name="ea${i}m"]`)?.value)||0;
    const muacEl = document.querySelector(`[name="ea${i}m"]`);
    if(muac > 0 && muac < 12.5){ if(muacEl){ muacEl.style.borderColor='var(--red)'; muacEl.title=' MUAC < 12.5 cm — SAM (Severe Acute Malnutrition) threshold'; } }
    else if(muac > 0 && muac < 13.5){ if(muacEl){ muacEl.style.borderColor='orange'; muacEl.title=' MUAC < 13.5 cm — MAM (Moderate Acute Malnutrition) threshold'; } }
    else if(muacEl){ muacEl.style.borderColor=''; muacEl.title=''; }
  }
}

// RULE: Large land but no garden?
function ruleLandSizeVsAnimals(){
  const land = gvRadio('b_land');
  const garden = gvRadio('e_garden');
  const gardenGrp = document.querySelector('[name="e_garden"]')?.closest('.form-group');
  if(!land || !garden) return;
  if(land === 'More than 4 acres' && garden === 'No'){
    showFieldMsg(gardenGrp,' More than 4 acres of land but no garden — please verify','info');
  } else { clearFieldMsg(gardenGrp); }
}

// RULE: Water source near latrine → pollution risk
function ruleWaterDistanceVsPollution(){
  const wlDist = gvRadio('h_wld');
  const wProt = gvRadio('h_wprot');
  const pollGrp = document.querySelector('[name="h_wp"]')?.closest('.form-group');
  if((wlDist === '0–5 m' || wlDist === '5–10 m') && wProt === 'No'){
    showFieldMsg(pollGrp,' Water source is very close to latrine AND unprotected — HIGH contamination risk. Flag for intervention.','warn');
  } else { clearFieldMsg(pollGrp); }
}

// RULE: Female circumcision → flag for FGM awareness
function ruleCircumcisionGender(){
  const circ = gvRadio('i_circ');
  const circGrp = document.querySelector('[name="i_circ"]')?.closest('.form-group');
  if(circ === 'Female' || circ === 'Both'){
    showFieldMsg(circGrp,' Female circumcision (FGM) reported — this is a health risk. Record for follow-up intervention.','warn');
  } else { clearFieldMsg(circGrp); }
}

// RULE: Death cause auto-suggest based on illness history
function ruleDeathCauseAutoSuggest(){
  // If malaria was ticked in illness section, pre-highlight malaria in death causes
  const malariaTick = document.querySelector('[name="c_ill"][value="Malaria"]:checked');
  const malariaDeath = document.querySelector('[name="c_dcause"][value="Malaria"]');
  if(malariaTick && malariaDeath && !malariaDeath.checked){
    const lbl = malariaDeath.closest('.chip')?.querySelector('label');
    if(lbl){ lbl.style.boxShadow='0 0 0 2px var(--green-light)'; lbl.title='Malaria was reported as illness — consider checking this'; }
  }
}

// RULE: Illness with no consultation → explain why or flag
function ruleIllnessTreatmentChain(){
  const ill = document.querySelector('[name="c_ill"]:checked');
  const consult = gvRadio('c_consult');
  const grp = document.querySelector('[name="c_no_r"]')?.closest('.form-group');
  if(ill && consult === 'No'){
    if(grp){ grp.style.border='2px solid var(--red)'; grp.style.borderRadius='8px'; grp.style.padding='10px'; }
    showFieldMsg(grp,' Illness reported but no consultation sought — reasons must be documented','warn');
  } else {
    if(grp){ grp.style.border=''; grp.style.padding=''; }
    clearFieldMsg(grp);
  }
}

//  RULE: Consent must be Yes AND age 18–85 to proceed 
function ruleConsentAge(){
  const consent = gvRadio('consent_given');
  const age = gvn('a_age');
  const ageEl = document.querySelector('[name="a_age"]');
  const ageGrp = ageEl?.closest('.form-group');

  // Age must be 18–85 (enforced in HTML input min/max and validate())
  // Show age warning
  if(age && (age < 18 || age > 85)){
    showFieldMsg(ageGrp,' Respondent must be 18–85 years old to participate','warn');
  } else {
    clearFieldMsg(ageGrp);
  }
}

//  RULE: consent=No blocks going forward (hard gate) 
function ruleConsentBlock(){
  // Handled in validate() — if consent=No, block
}

// Sanitize village name: strip special chars, convert spaces to hyphens (e.g. south-nyamebondo or nyamebondo-2)
// Rules: hyphen must be between two words/numbers — trailing hyphens like "Moro-" are not accepted
function sanitizeLocationInput(el){
  const pos = el.selectionStart;
  let v = el.value;
  // Remove anything that's not a letter, digit, space or hyphen
  v = v.replace(/[^a-zA-Z0-9 \-]/g, '');
  // Convert spaces to hyphens
  v = v.replace(/ /g, '-');
  // Collapse multiple hyphens
  v = v.replace(/-{2,}/g, '-');
  // Remove leading hyphen
  v = v.replace(/^-/, '');
  // Capitalise first character, lowercase the rest
  if(v.length > 0) v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  el.value = v;
  try{ el.setSelectionRange(pos, pos); } catch(e){}
}

// RULE: Village / Location must be non-empty, at least 2 chars, and hyphen must be followed by a letter or digit
function ruleLocation(){
  const el  = document.getElementById('interview_location_input');
  const grp = el?.closest('.form-group');
  if(!grp) return;
  const loc = (el?.value || '').trim();
  if(!loc){
    showFieldMsg(grp,'⚠ Village name required — type the village where this interview is taking place','warn');
  } else if(loc.length < 2){
    showFieldMsg(grp,'⚠ Village name too short — please enter the full name','warn');
  } else if(/^-|-$/.test(loc)){
    showFieldMsg(grp,'⚠ Village name cannot start or end with a hyphen — e.g. use Nyamebondo-2 not Nyamebondo-','warn');
  } else if(/-[^a-zA-Z0-9]/.test(loc)){
    showFieldMsg(grp,'⚠ A hyphen must be followed by a letter or number — e.g. South-Nyamebondo or Moro-2','warn');
  } else if(!/^[a-zA-Z]/.test(loc)){
    showFieldMsg(grp,'⚠ Village name must start with a letter','warn');
  } else {
    clearFieldMsg(grp);
  }
}


// Utility: given an array of location strings, return the majority-normalised form
// Used by report system to resolve spelling variants (e.g. "nyamebondo" vs "Nyamebondo")
function resolveMajorityLocation(locations){
  if(!locations || !locations.length) return 'Unknown';
  // Normalise to lowercase-trimmed key, track counts and canonical forms
  const counts = {};
  const canonical = {};
  locations.forEach(raw => {
    if(!raw) return;
    const key = raw.trim().toLowerCase().replace(/\s+/g,' ');
    counts[key] = (counts[key]||0) + 1;
    // Keep the most-seen raw form as canonical
    if(!canonical[key] || counts[key] === 1) canonical[key] = raw.trim();
  });
  // Return the key with highest count, using its canonical form
  const topKey = Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  return canonical[topKey] || locations[0];
}

//  RULE: Total males + females must equal sum of age brackets 
function ruleHouseholdTotals(){
  const totM = gvn('a_tot_m');
  const totF = gvn('a_tot_f');
  if(!totM && !totF) return;

  // Auto-fill age bracket max based on totals
  const ageKeys=['a_01','a_23','a_45','a_610','a_1115','a_1620','a_2159','a_60p'];
  ageKeys.forEach(k=>{
    const mEl=document.querySelector(`[name="${k}_m"]`);
    const fEl=document.querySelector(`[name="${k}_f"]`);
    if(mEl){ mEl.max=totM||50; }
    if(fEl){ fEl.max=totF||50; }
  });

  // Check if bracket sums exceed totals
  let sumM=0,sumF=0;
  ageKeys.forEach(k=>{sumM+=gvn(k+'_m');sumF+=gvn(k+'_f');});

  const grpM=document.querySelector('[name="a_tot_m"]')?.closest('.form-group');
  const grpF=document.querySelector('[name="a_tot_f"]')?.closest('.form-group');

  if(totM>0 && sumM>totM){
    showFieldMsg(grpM,` Age bracket males total (${sumM}) exceeds household males (${totM})`, 'warn');
  } else { clearFieldMsg(grpM); }

  if(totF>0 && sumF>totF){
    showFieldMsg(grpF,` Age bracket females total (${sumF}) exceeds household females (${totF})`, 'warn');
  } else { clearFieldMsg(grpF); }
}

//  RULE: Age bracket numbers can't exceed household total 
function ruleAgeBracketsVsTotal(){
  const totM=gvn('a_tot_m'), totF=gvn('a_tot_f');
  if(!totM && !totF) return;
  const keys=['a_01','a_23','a_45','a_610','a_1115','a_1620','a_2159','a_60p'];
  let sumM=0, sumF=0;
  keys.forEach(k=>{
    const mEl=document.querySelector(`[name="${k}_m"]`);
    const fEl=document.querySelector(`[name="${k}_f"]`);
    const mv=gvn(k+'_m'), fv=gvn(k+'_f');
    sumM+=mv; sumF+=fv;
    // Clamp individual fields
    if(mEl && totM && mv>totM){ mEl.value=totM; showToast(` Males in bracket capped at household total (${totM})`,true); }
    if(fEl && totF && fv>totF){ fEl.value=totF; showToast(` Females in bracket capped at household total (${totF})`,true); }
  });
  // Running sum warning
  const sumEl=document.getElementById('age_bracket_sum');
  if(sumEl){
    sumEl.textContent=`Running total: ${sumM} M / ${sumF} F  |  Household: ${totM} M / ${totF} F`;
    sumEl.style.color=(sumM>totM||sumF>totF)?'var(--red)':'var(--green)';
  }
}

//  RULE: Gender + Position logic 
function ruleGenderPosition(){
  const gender=gvRadio('a_gender');
  const pos=gvRadio('a_pos');
  const marital=gvRadio('a_marital');
  const grp=document.querySelector('[name="a_pos"]')?.closest('.form-group');
  if(!gender||!pos) return;
  if(gender==='Male' && (pos==='Mother'||pos==='Daughter in-law')){
    showFieldMsg(grp,' Male respondent cannot have position "'+pos+'" — please check','warn');
  } else if(gender==='Female' && pos==='Father'){
    showFieldMsg(grp,' Female respondent cannot have position "Father" — please check','warn');
  } else { clearFieldMsg(grp); }

  // Marital x Position: Son/Daughter usually single
  const marGrp=document.querySelector('[name="a_marital"]')?.closest('.form-group');
  if((pos==='Son'||pos==='Daughter') && marital==='Married'){
    showFieldMsg(marGrp,' Note: Son/Daughter recorded as Married — verify age','info');
  } else { clearFieldMsg(marGrp); }

  // Pregnancy section dimming is owned by inferPregnancySectionFromGender (via runInferenceRules).
  // Do NOT duplicate it here — inferPregnancySectionFromGender runs on every rules pass.
}

//  RULE: Pregnancy only valid for Female 
function rulePregnancyGender(){
  const gender=gvRadio('a_gender');
  // In Section C: if pregnancy = Yes but gender = Male → warn and auto-correct
  const pregEl=document.querySelector('[name="c_preg"]:checked');
  if(!pregEl) return;
  const pregGrp=pregEl.closest('.form-group');
  if(gender==='Male' && pregEl.value==='Yes'){
    showFieldMsg(pregGrp,' Respondent is Male — pregnancy response should be No','warn');
    // Auto-correct c_preg → No
    document.querySelectorAll('[name="c_preg"]').forEach(el=>{ if(el.value==='No') el.checked=true; });
    // Re-run Section D rules so pregnancy sub-fields dim immediately
    try{ ruleSecD(); } catch(e){}
  }
}

//  RULE: Skip meal reasons auto-fill 
// NOTE: e_meals is a radio group — must use gvRadio(), not gvn().
// gvn() reads the value attribute as text so parseInt gives NaN; === 1 can never be true.
function ruleSkipMeals(){
  const skip=gvRadio('e_skip');
  const meals=gvRadio('e_meals'); // radio value is a string e.g. '1', '2', '3'
  const skipGrp=document.querySelector('[name="e_skip"]')?.closest('.form-group');
  if(meals==='1' && skip!=='Yes'){
    showFieldMsg(skipGrp,' Only 1 meal/day — consider checking if meals are being skipped','info');
  } else { clearFieldMsg(skipGrp); }
}

//  RULE: Move away requires reason 
function ruleMoveAway(){
  const move=gvRadio('a_move');
  const reasonChecked=document.querySelector('[name="a_move_r"]:checked');
  const grp=document.querySelector('[name="a_move_r"]')?.closest('.form-group');
  if(move==='Yes' && !reasonChecked){
    showFieldMsg(grp,' Please tick the reason for moving away','info');
  } else { clearFieldMsg(grp); }
}

//  RULE: Deaths number vs age bracket 
function ruleDeaths(){
  const deathsY=gvRadio('c_deaths');
  const deathsN=gvn('c_deaths_n');
  const grpN=document.querySelector('[name="c_deaths_n"]')?.closest('.form-group');
  const grpAge=document.querySelector('[name="c_dage"]')?.closest('.form-group');
  const grpCause=document.querySelector('[name="c_dcause"]')?.closest('.form-group');

  if(deathsY==='No'){
    [grpN,grpAge,grpCause].forEach(g=>{if(!g)return;g.style.opacity='0.35';g.style.pointerEvents='none';});
    // Warn but do NOT auto-clear — let interviewer consciously fix it
    if(deathsN>0){ showFieldMsg(grpN,' Deaths = No but a number is entered — please clear or correct','warn'); }
    else { clearFieldMsg(grpN); }
  } else if(deathsY==='Yes'){
    [grpN,grpAge,grpCause].forEach(g=>{if(!g)return;g.style.opacity='1';g.style.pointerEvents='';});
    if(deathsN===0){ showFieldMsg(grpN,' Please enter number of deaths','info'); }
    else {
      const totPeople=gvn('a_tot_m')+gvn('a_tot_f');
      if(totPeople>0 && deathsN>totPeople){ showFieldMsg(grpN,` Deaths (${deathsN}) exceed household members (${totPeople}) — verify`,'warn'); }
      else { clearFieldMsg(grpN); }
    }
  } else {
    // Unanswered — dim gently
    [grpN,grpAge,grpCause].forEach(g=>{if(!g)return;g.style.opacity='0.5';g.style.pointerEvents='none';});
  }
}

//  RULE: Latrine use logic 
function ruleLatrine(){
  const lat=gvRadio('g_latrine');
  const altGrp=document.querySelector('[name="g_alt"]')?.closest('.form-group');
  const numGrp=document.querySelector('[name="g_lat_n"]')?.closest('.form-group');
  if(lat==='No'){
    // No latrine — show alternative field prominently, dim number
    if(altGrp){
      altGrp.style.borderLeft='3px solid var(--red)';
      altGrp.style.opacity='1';
      altGrp.style.pointerEvents='';
      showFieldMsg(altGrp,' No pit latrine — please record the alternative method used','warn');
    }
    if(numGrp){ numGrp.style.opacity='0.35'; numGrp.style.pointerEvents='none'; }
  } else if(lat==='Yes'){
    if(altGrp){ altGrp.style.borderLeft=''; altGrp.style.opacity='0.35'; altGrp.style.pointerEvents='none'; clearFieldMsg(altGrp); }
    if(numGrp){ numGrp.style.opacity='1'; numGrp.style.pointerEvents=''; }
  } else {
    // Unanswered — neutral
    if(altGrp){ altGrp.style.borderLeft=''; clearFieldMsg(altGrp); }
    if(numGrp){ numGrp.style.opacity='1'; numGrp.style.pointerEvents=''; }
  }
}

//  RULE: Water treatment method required if treat=Yes 
function ruleWaterTreatment(){
  const treat=gvRadio('h_treat');
  const methodChecked=document.querySelector('[name="h_tm"]:checked');
  const grp=document.querySelector('[name="h_tm"]')?.closest('.form-group');
  if(treat==='Yes' && !methodChecked){
    showFieldMsg(grp,' Please select the treatment method used','info');
  } else { clearFieldMsg(grp); }
}

//  RULE: Smoking inside only relevant if smoke=Yes 
function ruleSmoking(){
  const smoke=gvRadio('b_smoke');
  const insideGrp=document.querySelector('[name="b_smoke_in"]')?.closest('.form-group');
  if(!insideGrp) return;
  if(smoke==='No'){
    insideGrp.style.opacity='0.35';
    insideGrp.style.pointerEvents='none';
    document.querySelectorAll('[name="b_smoke_in"]').forEach(el=>el.checked=false);
  } else {
    insideGrp.style.opacity='1';
    insideGrp.style.pointerEvents='';
  }
}

//  RULE: Bedroom count vs people per bedroom 
function ruleBedrooms(){
  const rooms=gvRadio('b_rooms');
  const sep=gvRadio('b_sep');
  const proom=gvRadio('b_proom');
  const totM=gvn('a_tot_m'), totF=gvn('a_tot_f'), totPeople=totM+totF;
  const grp=document.querySelector('[name="b_proom"]')?.closest('.form-group');
  if(!rooms||!proom||!totPeople) return;
  const roomNum={'1':1,'2':2,'3':3,'More than 3':4}[rooms]||1;
  const perRoom={'1':1,'2–3':2.5,'4':4,'More than 4':5}[proom]||1;
  const maxCapacity = roomNum * perRoom;
  if(totPeople > maxCapacity + 2){ // +2 tolerance
    showFieldMsg(grp,` ${totPeople} people in ~${roomNum} room(s) at ${proom}/room — high density flagged`,'info');
  } else { clearFieldMsg(grp); }
}

//  RULE: Disability cause only if disability exists 
function ruleDisability(){
  const spec=gvRadio('c_spec');
  const disGrp=document.querySelector('[name="c_disab"]')?.closest('.form-group');
  const causeGrp=document.querySelector('[name="c_disab_c"]')?.closest('.form-group');
  if(spec==='No'){
    if(disGrp){ disGrp.style.opacity='0.35'; disGrp.style.pointerEvents='none'; }
    if(causeGrp){ causeGrp.style.opacity='0.35'; causeGrp.style.pointerEvents='none'; }
  } else {
    if(disGrp){ disGrp.style.opacity='1'; disGrp.style.pointerEvents=''; }
    if(causeGrp){ causeGrp.style.opacity='1'; causeGrp.style.pointerEvents=''; }
  }
}

//  RULE: Breastfeed stop reason only if bf=No 
function ruleBreastfeed(){
  const bf=gvRadio('e_bf');
  const stopGrp=document.querySelector('[name="e_bf_s"]')?.closest('.form-group');
  const durGrp=document.querySelector('[name="e_bf_d"]')?.closest('.form-group');
  const kids=gvRadio('e_kids');
  // If no kids 0–5 gray out all — ruleSecE handles this too, just guard here
  const yngGrp=document.querySelector('[name="e_yng"]')?.closest('.form-group');
  const bfGrp=document.querySelector('[name="e_bf"]')?.closest('.form-group');
  if(kids==='No'){
    [yngGrp,bfGrp,stopGrp,durGrp].forEach(g=>{ if(g){ g.style.opacity='0.35'; g.style.pointerEvents='none'; } });
    return;
  }
  // Kids present — unlock breastfeeding questions
  [yngGrp,bfGrp].forEach(g=>{ if(g){ g.style.opacity='1'; g.style.pointerEvents=''; } });
  // Stop reason only if stopped (bf=No), duration only if had bf at all
  if(bf==='Yes'){
    if(stopGrp){ stopGrp.style.opacity='0.35'; stopGrp.style.pointerEvents='none'; }
    if(durGrp){ durGrp.style.opacity='1'; durGrp.style.pointerEvents=''; }
  } else if(bf==='No'){
    if(stopGrp){ stopGrp.style.opacity='1'; stopGrp.style.pointerEvents=''; }
    if(durGrp){ durGrp.style.opacity='1'; durGrp.style.pointerEvents=''; }
  } else {
    // Not yet answered
    if(stopGrp){ stopGrp.style.opacity='0.5'; stopGrp.style.pointerEvents='none'; }
    if(durGrp){ durGrp.style.opacity='0.5'; durGrp.style.pointerEvents='none'; }
  }
}

//  RULE: If never heard of HIV, skip information source question 
function ruleHIVHeard(){
  const heard = gvRadio('f_heard');
  const infoGrp = document.querySelector('[name="f_info"]')?.closest('.form-group');
  const noteEl = document.getElementById('hiv_no_note');
  if(heard === 'No'){
    if(infoGrp){ infoGrp.style.opacity='0.35'; infoGrp.style.pointerEvents='none'; }
    if(noteEl) noteEl.style.display='block';
  } else {
    if(infoGrp){ infoGrp.style.opacity='1'; infoGrp.style.pointerEvents=''; }
    if(noteEl) noteEl.style.display='none';
  }
}

//  RULE: Vaccination table only relevant if children under 5 exist 
// Uses D8 (delivery = had a child) OR e_kids=Yes. If neither answered, show table open.
function ruleVaxTable(){
  const vaxWrap = document.getElementById('vax-table-wrap');
  if(!vaxWrap) return;
  const kids   = gvRadio('e_kids');   // Section E — explicit 0-5 flag
  const dDel   = gvRadio('d_del');    // Section D — had a delivery = likely has children
  const dPreg  = gvRadio('d_preg');   // Section D — ever pregnant

  // Dim only when we are certain there are no children:
  // e_kids explicitly No, OR never been pregnant (d_preg=No)
  const definitelyNoKids = kids === 'No' || dPreg === 'No';

  if(definitelyNoKids){
    vaxWrap.style.opacity='0.3';
    vaxWrap.style.pointerEvents='none';
    vaxWrap.style.position='relative';
    let overlay = document.getElementById('vax-dim-overlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'vax-dim-overlay';
      overlay.style.cssText='position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(247,248,250,.7);border-radius:12px;';
      overlay.innerHTML='<div style="background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:10px 16px;font-size:0.78rem;font-weight:700;color:var(--muted);box-shadow:var(--shadow-sm)"> No children under 5 in household</div>';
      vaxWrap.appendChild(overlay);
    }
    overlay.style.display='flex';
  } else {
    vaxWrap.style.opacity='1';
    vaxWrap.style.pointerEvents='';
    const overlay = document.getElementById('vax-dim-overlay');
    if(overlay) overlay.style.display='none';
  }
}

//  RULE: HIV treatment only if family member positive 
// NOTE: ruleSecF also handles f_arv/f_arv_r and runs after — it takes final precedence.
// This rule only adds the warning messages; dimming is owned by ruleSecF.
function ruleHIVFamily(){
  const pos=gvRadio('f_fam_hiv');
  const arv=gvRadio('f_arv');
  const arvRGrp=document.querySelector('[name="f_arv_r"]')?.closest('.form-group');
  // ARV reason message
  if(pos==='Yes' && arv==='No' && arvRGrp){
    showFieldMsg(arvRGrp,' Please document reasons for not being on ARV treatment','info');
  } else {
    clearFieldMsg(arvRGrp);
  }
}

//  RULE: Wife inheritance details only if practiced 
function ruleWifeInherit(){
  const inh=gvRadio('i_winh');
  const howGrp=document.querySelector('[name="i_winh_h"]')?.closest('.form-group');
  const benGrp=document.querySelector('[name="i_winh_b"]')?.closest('.form-group');
  const negGrp=document.querySelector('[name="i_winh_n"]')?.closest('.form-group');
  if(inh==='No'){
    [howGrp,benGrp,negGrp].forEach(g=>{ if(g){ g.style.opacity='0.35'; g.style.pointerEvents='none'; } });
  } else {
    [howGrp,benGrp,negGrp].forEach(g=>{ if(g){ g.style.opacity='1'; g.style.pointerEvents=''; } });
  }
}

//  RULE: Food shortage actions only if skip=Yes 
function ruleFoodShortage(){
  const skip=gvRadio('e_skip');
  const grp=document.querySelector('[name="e_short"]')?.closest('.form-group');
  const whyGrp=document.querySelector('[name="e_skip_w"]')?.closest('.form-group');
  const whichGrp=document.querySelector('[name="e_skip_m"]')?.closest('.form-group');
  if(skip==='No'){
    [grp,whyGrp,whichGrp].forEach(g=>{ if(g){ g.style.opacity='0.35'; g.style.pointerEvents='none'; } });
  } else {
    [grp,whyGrp,whichGrp].forEach(g=>{ if(g){ g.style.opacity='1'; g.style.pointerEvents=''; } });
  }
}

// 
//  HELPER: dim/unlock a group by name
// 
function dimGrp(name, dim){
  const el = document.querySelector(`[name="${name}"]`);
  const grp = el?.closest('.form-group');
  if(!grp) return;
  grp.style.opacity = dim ? '0.35' : '1';
  grp.style.pointerEvents = dim ? 'none' : '';
  if(dim){
    // Clear values when dimming
    grp.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(i=>i.checked=false);
    grp.querySelectorAll('input[type=text],input[type=number],textarea,select').forEach(i=>{
      if(i.tagName==='SELECT') i.value=''; else i.value='';
    });
  }
}
function dimGrpSoft(name, dim){
  // Soft dim — no value clearing
  const el = document.querySelector(`[name="${name}"]`);
  const grp = el?.closest('.form-group');
  if(!grp) return;
  grp.style.opacity = dim ? '0.35' : '1';
  grp.style.pointerEvents = dim ? 'none' : '';
}

function clearDependentFields(names){
  names.forEach(name => {
    document.querySelectorAll(`[name="${name}"]`).forEach(el => {
      if(el.type === 'radio' || el.type === 'checkbox') el.checked = false;
      else el.value = '';
    });
  });
}

// 
//  INFERENCE ENGINE — auto-fill/pre-populate fields from earlier answers
// 
function runInferenceRules(){
  inferAgeBracketFromRespondent();
  inferHouseholdTotalFromGender();
  inferDeathsFromMaritalStatus();
  inferPositionFromGender();
  inferPregnancySectionFromGender();
}

// INFERENCE: Respondent age + gender → pre-fill the correct age bracket cell with at least 1
// e.g. Male, 35 → a_2159_m gets 1 if empty
// Also clears the opposite-gender bracket that was previously auto-filled, so switching
// Male→Female (or vice versa) doesn't leave a stale '1' that inflates household totals.
function inferAgeBracketFromRespondent(){
  const age    = gvn('a_age');
  const gender = gvRadio('a_gender');
  if(!age || !gender) return;

  // Map age → bracket field key
  const bracket =
    age <= 1  ? 'a_01'   :
    age <= 3  ? 'a_23'   :
    age <= 5  ? 'a_45'   :
    age <= 10 ? 'a_610'  :
    age <= 15 ? 'a_1115' :
    age <= 20 ? 'a_1620' :
    age <= 59 ? 'a_2159' : 'a_60p';

  // Clear the opposite bracket ONLY if it was auto-filled by this inference
  // (identified by the title tag we set) — never touch deliberate entries
  const oppSuffix = gender === 'Male' ? '_f' : '_m';
  const oppEl = document.querySelector(`[name="${bracket}${oppSuffix}"]`);
  if(oppEl && oppEl.title === 'Auto-filled: respondent counted here'){
    oppEl.value = '0';
    oppEl.style.background = '';
    oppEl.title = '';
  }

  const suffix = gender === 'Male' ? '_m' : '_f';
  const fieldName = bracket + suffix;
  const el = document.querySelector(`[name="${fieldName}"]`);
  if(!el) return;

  // Only pre-fill if the cell is still 0 or empty — don't overwrite deliberate entries
  const current = parseInt(el.value) || 0;
  if(current === 0){
    el.value = '1';
    el.style.background = 'rgba(76,175,114,0.12)';
    el.title = 'Auto-filled: respondent counted here';
  }
}

// INFERENCE: Gender → auto-increment total M or F by 1 if not yet set.
// Also clears the opposite total if it was previously auto-filled so that
// switching Male→Female (or back) doesn't leave a stale 1 in the wrong column.
function inferHouseholdTotalFromGender(){
  const gender = gvRadio('a_gender');
  if(!gender) return;

  const oppField = gender === 'Male' ? 'a_tot_f' : 'a_tot_m';
  const ownField = gender === 'Male' ? 'a_tot_m' : 'a_tot_f';
  const oppEl = document.querySelector(`[name="${oppField}"]`);
  const ownEl = document.querySelector(`[name="${ownField}"]`);

  // Clear the opposite total ONLY if this code auto-filled it
  if(oppEl && oppEl.title === 'Auto-filled: at least 1 (the respondent)'){
    oppEl.value = '0';
    oppEl.style.background = '';
    oppEl.title = '';
  }

  // Nudge own total to 1 if still 0/empty and not deliberately set
  if(ownEl){
    const cur = parseInt(ownEl.value) || 0;
    if(cur === 0){
      ownEl.value = '1';
      ownEl.style.background = 'rgba(76,175,114,0.12)';
      ownEl.title = 'Auto-filled: at least 1 (the respondent)';
    }
  }
}

// INFERENCE: Marital status = Widowed → deaths must be at least 1
// Pre-set c_deaths = Yes and c_deaths_n = 1 if not already filled
function inferDeathsFromMaritalStatus(){
  const marital = gvRadio('a_marital');
  if(marital !== 'Widowed/Widower') return;

  // Auto-tick c_deaths = Yes
  const deathsYes = document.querySelector('[name="c_deaths"][value="Yes"]');
  if(deathsYes && !deathsYes.checked){
    deathsYes.checked = true;
    deathsYes.dispatchEvent(new Event('change', {bubbles:true}));
  }

  // Set minimum deaths to 1 if currently 0 or empty
  const deathsN = document.querySelector('[name="c_deaths_n"]');
  if(deathsN){
    const current = parseInt(deathsN.value) || 0;
    if(current === 0){
      deathsN.value = '1';
      deathsN.min   = '1'; // enforce minimum going forward
      deathsN.style.background = 'rgba(76,175,114,0.12)';
      deathsN.title = 'Auto-filled: widowed status implies at least 1 death';
      showFieldMsg(
        deathsN.closest('.form-group'),
        '↑ Pre-filled: respondent is widowed — at least 1 death expected',
        'info'
      );
    } else {
      // Already has a value — just enforce the minimum
      deathsN.min = '1';
    }
  }
}

// INFERENCE: Gender → auto-select a sensible default position if not yet answered
// Male → suggest Father; Female → suggest Mother (only if age ≥ 25 and field empty)
function inferPositionFromGender(){
  const gender = gvRadio('a_gender');
  const age    = gvn('a_age');
  const pos    = gvRadio('a_pos');
  if(!gender || pos) return; // don't overwrite if already answered

  if(age >= 25){
    const suggest = gender === 'Male' ? 'Father' : 'Mother';
    const el = document.querySelector(`[name="a_pos"][value="${suggest}"]`);
    if(el && !el.checked){
      el.checked = true;
      const lbl = el.closest('.chip')?.querySelector('label');
      if(lbl){ lbl.style.outline = '2px dashed var(--green)'; lbl.title = 'Auto-suggested from gender/age — change if needed'; }
    }
  }
}

// INFERENCE: Gender = Male → dim entire pregnancy section (Section D) early
// Gender = Female → unlock it (ruleSecD then fine-tunes per d_preg answer)
function inferPregnancySectionFromGender(){
  const gender = gvRadio('a_gender');
  if(!gender) return;
  const pregFields = ['d_preg','d_preg_age','d_preg_n','d_anc','d_anc_s','d_anc_w','d_anc_r','d_del','d_del_r','d_contra','d_ct','d_fp','d_fp_c'];
  const isMale = gender === 'Male';
  pregFields.forEach(n => dimGrpSoft(n, isMale));
}

// 
//  SECTION A — DEMOGRAPHY
// 
function ruleSecA(){
  // A6=No or unanswered → dim A7 (move reason)
  const move = gvRadio('a_move');
  dimGrpSoft('a_move_r', move !== 'Yes');

  // Run inference whenever section A fields change
  runInferenceRules();
}

// 
//  SECTION B — HOUSING
// 
function ruleSecB(){
  // B5 (bedrooms)=1 → B6 (separate bedrooms) is irrelevant
  const rooms = gvRadio('b_rooms');
  dimGrpSoft('b_sep', rooms === '1');

  // B15 (smokes)=No → dim B16 (smokes inside)
  const smoke = gvRadio('b_smoke');
  dimGrpSoft('b_smoke_in', smoke !== 'Yes');
}

// 
//  SECTION C — MEDICAL HISTORY
// 
function ruleSecC(){
  const hasIll  = !!document.querySelector('[name="c_ill"]:checked');
  const consult = gvRadio('c_consult');

  // C1: no illness → dim C2 (age affected) only
  // NOTE: c_consult (C3) stays active — it is a required field regardless
  dimGrpSoft('c_ill_age', !hasIll);

  // C3 consult logic: dim/show C4 and C5 based on yes/no answer
  // If no illness yet — dim both (nothing to consult about)
  if(!hasIll){
    dimGrpSoft('c_where', true);
    dimGrpSoft('c_no_r',  true);
  } else {
    // Illness present — show C4 only if consulted Yes, C5 only if No
    dimGrpSoft('c_where', consult !== 'Yes');
    dimGrpSoft('c_no_r',  consult !== 'No');
  }

  // C6–C9 irrelevant if no illness
  dimGrpSoft('c_who',    !hasIll);
  dimGrpSoft('c_accomp', !hasIll);
  dimGrpSoft('c_meds',   !hasIll);
  dimGrpSoft('c_drug_d', !hasIll);

  // C10/C11/C12/C13 — fully managed by ruleDeaths() (nuanced limbo handling)
  // Do NOT duplicate dims here — ruleDeaths() owns these fields.

  // C14=No → dim C15 (nature), C16 (cause)
  const spec = gvRadio('c_spec');
  dimGrpSoft('c_disab',   spec !== 'Yes');
  dimGrpSoft('c_disab_c', spec !== 'Yes');
}

// 
//  SECTION D — MATERNAL & CHILD HEALTH
// 
function ruleSecD(){
  const preg   = gvRadio('d_preg');
  const anc    = gvRadio('d_anc');
  const contra = gvRadio('d_contra');
  const fp     = gvRadio('d_fp');

  // D1=No (never pregnant) → dim D2–D9 (soft dim, no confirm dialog)
  const noPreg = preg === 'No';
  ['d_preg_age','d_preg_n','d_anc','d_anc_s','d_anc_w','d_anc_r','d_del','d_del_r'].forEach(n=>dimGrpSoft(n, noPreg));

  // D4=No ANC → dim D5, D6, D7 (only if pregnant)
  if(!noPreg){
    dimGrpSoft('d_anc_s', anc !== 'Yes');
    dimGrpSoft('d_anc_w', anc !== 'Yes');
    dimGrpSoft('d_anc_r', anc !== 'Yes');
  }

  // D11=No (not aware of FP) → dim D12, D14 (challenges irrelevant)
  // D12 (ever used contraceptive) kept active if FP not answered yet
  dimGrpSoft('d_contra', fp === 'No');
  dimGrpSoft('d_fp_c',   fp === 'No');

  // D12=No → dim D13 (method type)
  const noContra = contra === 'No' || fp === 'No';
  dimGrpSoft('d_ct', noContra);
}

// 
//  SECTION E — NUTRITION & LIFESTYLE
// 
function ruleSecE(){
  const skip   = gvRadio('e_skip');
  const garden = gvRadio('e_garden');
  const pref   = gvRadio('e_pref');
  const taboo  = gvRadio('e_taboo');
  const exer   = gvRadio('e_exer');
  const kids   = gvRadio('e_kids');
  const bf     = gvRadio('e_bf');
  const ninfo  = gvRadio('e_ninfo');
  const supp   = gvRadio('e_supp');

  // E2=No → dim E3 (meals skipped), E4 (why), E5 (shortage actions)
  dimGrpSoft('e_skip_m', skip !== 'Yes');
  dimGrpSoft('e_skip_w', skip !== 'Yes');
  dimGrpSoft('e_short',  skip !== 'Yes');

  // E9=No → dim E10 (preferred foods), E11 (reason)
  dimGrpSoft('e_pft', pref !== 'Yes');
  dimGrpSoft('e_pr',  pref !== 'Yes');

  // E14=No → dim E15 (productivity), E16 (crops last), E16b crop table
  dimGrpSoft('e_prod',  garden !== 'Yes');
  dimGrpSoft('e_crops', garden !== 'Yes');
  const cropWrap = document.getElementById('crop-table-wrap');
  if(cropWrap){
    const dim = garden !== 'Yes';
    cropWrap.style.transition    = 'opacity .3s,filter .3s';
    cropWrap.style.opacity       = dim ? '0.28' : '1';
    cropWrap.style.pointerEvents = dim ? 'none' : '';
    cropWrap.style.filter        = dim ? 'grayscale(60%)' : 'none';
  }
  const cropSub = document.getElementById('crop-table-wrap')?.previousElementSibling;
  if(cropSub){ cropSub.style.opacity = garden !== 'Yes' ? '0.28' : '1'; cropSub.style.transition='opacity .3s'; }

  // E21=No → dim taboo detail field (soft — text input)
  const tabooGrp = document.querySelector('[name="e_taboo_d"]')?.closest('.form-group');
  if(tabooGrp){ tabooGrp.style.opacity = taboo === 'Yes' ? '1' : '0.35'; tabooGrp.style.pointerEvents = taboo === 'Yes' ? '' : 'none'; }

  // E23=No → dim E24 (exercise frequency)
  dimGrpSoft('e_exer_f', exer !== 'Yes');

  // E27=No → dim E28–E35 and detail fields
  const noKids = kids === 'No';
  ['e_yng','e_bf','e_bf_d','e_wean','e_wf2','e_supp','e_ninfo'].forEach(n=>dimGrpSoft(n, noKids));

  // E29 breastfeeding stop reason: only relevant when kids present AND bf=No
  dimGrpSoft('e_bf_s', noKids || bf !== 'No');

  const suppGrp = document.querySelector('[name="e_supp_d"]')?.closest('.form-group');
  const ninfoGrp = document.querySelector('[name="e_ninfo_d"]')?.closest('.form-group');
  if(suppGrp){ suppGrp.style.opacity = (!noKids && supp==='Yes') ? '1' : '0.35'; suppGrp.style.pointerEvents = (!noKids && supp==='Yes') ? '' : 'none'; }
  if(ninfoGrp){ ninfoGrp.style.opacity = (!noKids && ninfo==='Yes') ? '1' : '0.35'; ninfoGrp.style.pointerEvents = (!noKids && ninfo==='Yes') ? '' : 'none'; }

  // Anthropometry table — dim if no kids under 5
  const antTable = document.getElementById('anthro-table-wrap');
  if(antTable){
    antTable.style.opacity = noKids ? '0.3' : '1';
    antTable.style.pointerEvents = noKids ? 'none' : '';
  }
}

// 
//  SECTION F — HIV/AIDS
// 
function ruleSecF(){
  const heard   = gvRadio('f_heard');
  const tested  = gvRadio('f_tested');
  const pay     = gvRadio('f_pay');
  const outreach= gvRadio('f_out');
  const famHIV  = gvRadio('f_fam_hiv');
  const arv     = gvRadio('f_arv');

  // F1=No → dim F3–F7 (knowledge questions irrelevant if never heard of HIV)
  const neverHeard = heard === 'No';
  ['f_screen','f_trans','f_prev','f_treat','f_aware'].forEach(n => dimGrpSoft(n, neverHeard));

  // F8=No → dim F9 (test date)
  dimGrpSoft('f_test_d', tested !== 'Yes');

  // F10=No → dim F11, F12
  dimGrpSoft('f_arv',   famHIV !== 'Yes');
  dimGrpSoft('f_arv_r', famHIV !== 'Yes' || arv !== 'No');

  // F17=No → dim F18 (affordable), F19 (payment method)
  dimGrpSoft('f_afford', pay !== 'Yes');
  dimGrpSoft('f_pay_m',  pay !== 'Yes');

  // F21=No → dim F22 (outreach frequency)
  dimGrpSoft('f_out_f', outreach !== 'Yes');
}

// 
//  SECTION G — SANITATION
// 
function ruleSecG(){
  const latrine = gvRadio('g_latrine');
  const oral    = gvRadio('g_oral');
  const latTab  = gvRadio('g_lat_t');

  // G1=No → dim latrine detail questions (g_lat_n handled by ruleLatrine)
  const noLatrine = latrine === 'No';
  const hasLatrine = latrine === 'Yes';
  // dim latrine-detail fields only when no latrine
  ['g_lat_u','g_lat_d','g_lat_wd','g_lat_p','g_lat_s','g_lat_c','g_lat_t'].forEach(n=>dimGrpSoft(n, noLatrine));

  // G10 taboo detail text — dim if G10=No or no latrine
  const tabooDetailEl = document.querySelector('[name="g_lat_td"]');
  const tabooDetailGrp = tabooDetailEl?.closest('.form-group');
  if(tabooDetailGrp){
    const dimDetail = noLatrine || latTab !== 'Yes';
    tabooDetailGrp.style.opacity = dimDetail ? '0.35' : '1';
    tabooDetailGrp.style.pointerEvents = dimDetail ? 'none' : '';
  }

  // H5 (oral problems)=No → dim H6 (what was done)
  dimGrpSoft('g_oral_a', oral !== 'Yes');
}

// 
//  SECTION H — ENVIRONMENT & WATER
// 
function ruleSecH(){
  const treat   = gvRadio('h_treat');
  const wprot   = gvRadio('h_wprot');
  const wlDist  = gvRadio('h_wld');

  // H6 (treat)=No → dim H7 (treatment method)
  dimGrpSoft('h_tm', treat !== 'Yes');

  // NOTE: h_wp is the water pollution causes checkbox group (H11) — do NOT dim it here.
  // There is no separate "why unprotected" field in the form.

  // H11 (latrine-water distance) cross-check is handled by ruleWaterDistanceVsPollution
  // H12 (waste disposal) — always active, no skip needed

  // Water distance advisory: if very close to latrine, add info note
  const distGrp = document.querySelector('[name="h_wld"]')?.closest('.form-group');
  if(wlDist === '0–5 m'){
    showFieldMsg(distGrp,' Water source within 5 m of latrine — HIGH contamination risk. Recommend boiling or treatment.','warn');
  } else if(wlDist === '5–10 m'){
    showFieldMsg(distGrp,' Water source within 10 m of latrine — moderate contamination risk. Verify treatment practice.','info');
  } else {
    clearFieldMsg(distGrp);
  }
}

// 
//  SECTION I — CULTURAL PRACTICES
// 
function ruleSecI(){
  const rite    = gvRadio('i_rite');
  const edu     = gvRadio('i_edu');
  const birth   = gvRadio('i_birth');
  const death   = gvRadio('i_death');
  const bur     = gvRadio('i_bur');

  // I1 ≠ Circumcision → dim I2 (who), I3 (age), I4 (where)
  const noCirc = rite !== 'Circumcision';
  dimGrpSoft('i_circ',   noCirc);
  dimGrpSoft('i_age',    noCirc);  // I3: age of rite only relevant for circumcision
  dimGrpSoft('i_circ_w', noCirc);

  // I5=No → dim I6 (education content)
  dimGrpSoft('i_edu_c', edu !== 'Yes');

  // I13=No → dim birth detail
  const birthGrp = document.querySelector('[name="i_birth_d"]')?.closest('.form-group');
  if(birthGrp){ birthGrp.style.opacity = birth==='Yes'?'1':'0.35'; birthGrp.style.pointerEvents = birth==='Yes'?'':'none'; }

  // I14=No → dim death ritual detail
  const deathGrp = document.querySelector('[name="i_death_d"]')?.closest('.form-group');
  if(deathGrp){ deathGrp.style.opacity = death==='Yes'?'1':'0.35'; deathGrp.style.pointerEvents = death==='Yes'?'':'none'; }

  // I15 ≠ Other → dim other specify
  const burGrp = document.querySelector('[name="i_bur_o"]')?.closest('.form-group');
  if(burGrp){ burGrp.style.opacity = bur==='Other'?'1':'0.35'; burGrp.style.pointerEvents = bur==='Other'?'':'none'; }

  // I9–I12: wife inheritance details — delegate to dedicated rule to avoid duplication gap
  ruleWifeInherit();
}


// 
//  SECTION J — COMMON HEALTH PROBLEMS IN COMMUNITY
// 
function ruleSecJ(){
  // J is a community disease prevalence table — all fields optional (observational).
  // No conditional dimming needed. Run integrity check: flag if NOTHING is ticked.
  const anyTicked = !!document.querySelector('[name^="j_"]:checked');
  const otherGrp  = document.querySelector('[name="j_other"]')?.closest('.form-group');
  if(!anyTicked){
    showFieldMsg(otherGrp || document.querySelector('[data-sec="10"] .form-group'),
      ' No diseases ticked yet — please mark all conditions common in this community','info');
  } else {
    clearFieldMsg(otherGrp);
  }
}

// 
//  SECTION K — PESTS & VECTORS
// 
function ruleSecK(){
  // K is a pest observation table — Present/Absent radios.
  // Flag if a pest is marked Present but control method is blank.
  const pests = ['rats','cockroaches','bedbugs','houseflies','ticks','jiggers','mosquitoes','fleas','tsetse_flies','others'];
  pests.forEach(p => {
    const present = document.querySelector(`[name="k_${p}"][value="Present"]:checked`);
    const ctrl    = document.querySelector(`[name="k_${p}_c"]`);
    if(!ctrl) return;
    const ctrlGrp = ctrl.closest('tr') || ctrl.closest('.form-group');
    if(present && !ctrl.value.trim()){
      ctrl.style.borderColor = 'var(--red)';
      ctrl.title = 'Please record the control method used for this pest';
    } else {
      ctrl.style.borderColor = '';
      ctrl.title = '';
    }
  });
}

// 
//  SECTION L — INTERVIEWER CHALLENGES & OBSERVATIONS
// 
function ruleSecL(){
  // All fields optional — no conditional logic needed.
  // Just a placeholder so the registry doesn't throw on section 12.
}

function showFieldMsg(grp, msg, type='warn'){
  if(!grp) return;
  let el=grp.querySelector('.dyn-msg');
  if(!el){ el=document.createElement('div'); el.className='dyn-msg'; grp.appendChild(el); }
  el.textContent=msg;
  el.style.cssText=`display:block;font-size:0.74rem;font-weight:500;margin-top:5px;padding:6px 9px;border-radius:6px;
    color:${type==='warn'?'var(--red)':type==='info'?'var(--green)':'#855'};
    background:${type==='warn'?'var(--red-pale)':type==='info'?'var(--green-pale)':'#fdf'};`;
}
function clearFieldMsg(grp){
  if(!grp) return;
  const el=grp.querySelector('.dyn-msg');
  if(el) el.style.display='none';
}

// 
//  VALIDATION (required + integrity)
// 
function validate(idx){
  clearErr();
  let ok=true;
  const errors=[];

  //  Consent gate: if No, hard block 
  if(idx===0){
    const consent=gvRadio('consent_given');
    if(consent==='No'){
      showBlockedModal(' Interview Declined','The respondent has declined consent. You cannot proceed with the interview. Please close this form or start a new record.','Cannot Proceed');
      return false;
    }
  }

  //  Age gate — section 1 (Demography) 
  if(idx===1){
    const age=gvn('a_age');
    if(!age){ errors.push(['a_age','Age of Respondent']); }
    else if(age<18){ addErr('a_age',` Respondent must be at least 18 years old (entered: ${age})`); ok=false; }
    else if(age>85){ addErr('a_age',` Respondent age above 85 — please verify (entered: ${age})`); ok=false; }
  }

  //  Household total integrity 
  if(idx===1){
    const totM=gvn('a_tot_m'), totF=gvn('a_tot_f');
    if(totM===0 && totF===0){
      addErr('a_tot_m',' Total household members cannot be zero'); ok=false;
    }
    const keys=['a_01','a_23','a_45','a_610','a_1115','a_1620','a_2159','a_60p'];
    let sumM=0,sumF=0;
    keys.forEach(k=>{sumM+=gvn(k+'_m');sumF+=gvn(k+'_f');});
    if(totM>0 && sumM>totM){
      addErr('a_tot_m',` Age bracket males (${sumM}) exceed total males (${totM}) — reduce bracket numbers`); ok=false;
    }
    if(totF>0 && sumF>totF){
      addErr('a_tot_f',` Age bracket females (${sumF}) exceed total females (${totF}) — reduce bracket numbers`); ok=false;
    }
  }

  //  Standard required fields — logic-driven via FIELD_DEPS, no CSS dependency 
  const _record = collectAll();
  const reqs = getRequiredFields(idx, _record);
  reqs.forEach(([name,type,label])=>{
    const _el=document.querySelector(`[name="${name}"]`);
    const filled=type==='radio'||type==='checkbox'
      ?!!document.querySelector(`[name="${name}"]:checked`)
      :(_el?.value.trim()!=='');
    if(!filled) errors.push([name,label]);
  });
  errors.forEach(([name,label])=>{ addErr(name,` "${label}" is required`); ok=false; });

  if(!ok){
    document.querySelector('.val-banner')?.classList.add('show');
    document.querySelector('.has-err')?.scrollIntoView({behavior:'smooth',block:'center'});
    showToast('Please fix errors before continuing',true);
  }
  return ok;
}

function addErr(name, msg){
  const el=document.querySelector(`[name="${name}"]`);
  const grp=el?.closest('.form-group');
  if(grp){
    grp.classList.add('has-err');
    let e=grp.querySelector('.field-err');
    if(!e){e=document.createElement('div');e.className='field-err';grp.appendChild(e);}
    e.textContent=msg; e.classList.add('show');
  }
}
function clearErr(){
  document.querySelectorAll('.has-err').forEach(e=>e.classList.remove('has-err'));
  document.querySelectorAll('.field-err').forEach(e=>{e.textContent='';e.classList.remove('show');});
  document.querySelectorAll('.val-banner').forEach(e=>e.classList.remove('show'));
}

// 
//  BLOCKED MODAL (consent refused / hard stop)
// 
function showBlockedModal(title, body, btn){
  const m=document.getElementById('finModal');
  m.querySelector('.modal-icon').textContent='';
  m.querySelector('.modal-title').textContent=title;
  m.querySelector('.modal-body').textContent=body;
  const btns=m.querySelector('.modal-btns');
  // Location block — show a direct "Go to Page 1" button
  const isLocBlock = title.includes('Location') || title.includes('location');
  btns.innerHTML = isLocBlock ? `
    <button class="mbtn mbtn-p" onclick="closeFinish();goSec(0);" style="background:#c0392b;color:#fff">
      \u{1F6AB} Go to Page 1 — Fix Location
    </button>
    <button class="mbtn mbtn-s" onclick="closeFinish()">
      Cancel
    </button>` : `
    <button class="mbtn mbtn-p" onclick="closeFinish()" style="background:var(--green)">
      ← Go Back &amp; Change Answer
    </button>
    <button class="mbtn mbtn-s" onclick="closeFinish();newRec()">
      Start New Record
    </button>`;
  m.classList.add('open');
}

// 
//  NAVIGATION
// 
function goSec(i, dir){
  clearErr();
  const cards = document.querySelectorAll('.sec-card');
  const prev  = cards[cur];
  const goingForward = dir ? dir==='forward' : i > cur;
  cur = i;
  const next  = cards[i];
  if(!next) return;

  // Same card (e.g. reset to section 0 when already on 0) — skip animation entirely
  if(prev && prev === next){
    cards.forEach(c=>{ c.classList.remove('active','slide-in-right','slide-in-left','slide-out-left','slide-out-right'); c.style.transition=''; });
    next.classList.add('active');
    updUI();
    setTimeout(() => runSectionRules(cur), 100);
    setTimeout(() => MSS_syncChips(document), 150);
    return;
  }

  //  Outgoing card: slide out horizontally 
  if(prev && prev !== next){
    prev.classList.remove('active');
    prev.classList.add(goingForward ? 'slide-out-left' : 'slide-out-right');
    // Clean up after transition
    setTimeout(()=>{
      prev.classList.remove('slide-out-left','slide-out-right');
    }, 340);
  }

  //  Incoming card: start off-screen then slide in 
  // 1. Position it off screen instantly (no transition)
  next.classList.remove('active','slide-out-left','slide-out-right','slide-in-left','slide-in-right');
  next.classList.add(goingForward ? 'slide-in-right' : 'slide-in-left');

  // 2. Force reflow so browser registers the off-screen position
  void next.offsetWidth;

  // 3. Add transition back and slide to active position
  next.style.transition = 'transform .32s cubic-bezier(.4,0,.2,1), opacity .32s ease';
  next.classList.remove('slide-in-right','slide-in-left');
  next.classList.add('active');

  // 4. Clean up inline transition after it completes
  setTimeout(()=>{ next.style.transition=''; }, 340);

  updUI();
  // Scroll the page to top so section header is visible — but only if needed
  const wrap = document.getElementById('secsWrap');
  if(wrap){
    const top = wrap.getBoundingClientRect().top + window.scrollY - 4;
    if(window.scrollY > top) window.scrollTo({top:top,behavior:'smooth'});
  }
  setTimeout(() => runSectionRules(cur), 100);
  setTimeout(() => MSS_syncChips(document), 150);
}
function nextSec(){
  if(!validate(cur))return;
  saveCur();
  showToast('✅ Section saved');
  if(cur<SECS.length-1) goSec(cur+1,'forward');
}
function prevSec(){saveCur();if(cur>0)goSec(cur-1,'back');}
function updUI(){
  const t=SECS.length,p=Math.round((cur/(t-1))*100);
  document.getElementById('pFill').style.width=p+'%';
  document.getElementById('sLbl').textContent=SECS[cur].label;
  document.getElementById('sCnt').textContent=(cur+1)+' / '+t;
  // Expose current section index globally for nav button logic
  window._curSec = cur;
  //  Smart footer nav: first step shows Home, others show Back 
  var bPrev    = document.getElementById('bPrev');
  var bHomeNav = document.getElementById('bHomeNav');
  if(bPrev && bHomeNav){
    if(cur === 0){
      bPrev.style.display    = 'none';
      bHomeNav.style.display = '';
    } else {
      bPrev.style.display    = '';
      bHomeNav.style.display = 'none';
    }
  } else if(bPrev){
    // Fallback: old single-button behaviour
    bPrev.style.visibility = cur===0?'hidden':'visible';
  }
  const last=cur===t-1;
  document.getElementById('bNext').style.display=last?'none':'flex';
  document.getElementById('bFin').style.display=last?'flex':'none';
  // Fire event so external listeners can react
  document.dispatchEvent(new CustomEvent('mss-sec-changed', {detail:{sec:cur, total:t}}));
}

// 
//  RECORDS
// 
function newRec(){
  // Save current record first without any validation block
  if(recId) pRec(collectAll());
  // Generate fresh ID and initialise clean empty record
  recId = generateRecordId();
  recs[recId] = {_c: new Date().toLocaleString(), _u: new Date().toLocaleString()};
  ss();
  // Clear ALL form inputs — radios, checkboxes, text, selects
  document.querySelectorAll('.sec-card input,.sec-card select,.sec-card textarea').forEach(function(el){
    if(!el.name) return;
    if(el.type==='radio'||el.type==='checkbox') el.checked = false;
    else el.value = '';
  });
  // Reset chip visual states
  document.querySelectorAll('.chip').forEach(function(c){
    c.setAttribute('data-checked','false');
    c.classList.remove('sel','selected','active');
  });
  // Clear auto-fill markers so inference engine starts clean
  document.querySelectorAll('[title^="Auto-filled"]').forEach(function(el){
    el.value = '';
    el.style.background = '';
    el.title = '';
  });
  // Reset opacity/pointer-events on all form-groups (rules will re-apply)
  document.querySelectorAll('.form-group').forEach(function(g){
    g.style.opacity = '';
    g.style.pointerEvents = '';
    g.style.border = '';
  });
  // loadInto({}) triggers chip sync and re-runs rules on blank state
  loadInto({});
  // Force cur to -1 so goSec(0) treats it as a fresh navigation (prev !== next)
  cur = -1;
  goSec(0);
  renDrw();
  // Make sure survey screen is visible
  if(typeof showScreen==='function') showScreen('survey');
  // Show FAB
  if(typeof fabShow==='function') fabShow();
  // Re-fill interviewer name so consent form is not empty
  var name = typeof getUserName==='function' ? getUserName() : (localStorage.getItem('chsa_user_name')||'');
  if(name && typeof fillInterviewerFields==='function') fillInterviewerFields(name);
  showToast('✅ New interview started — form cleared');
}
function loadRec(id){saveCur();recId=id;loadInto(recs[id]||{});goSec(0);closeDrw();if(typeof fabShow==='function') fabShow();showToast('Record loaded');}
function delRec(id){
  // Native confirm() is blocked in many mobile PWA/WebView contexts — use inline modal
  var existing = document.getElementById('mss-del-modal');
  if(existing) existing.remove();
  var r = recs[id] || {};
  var label = r.a_age ? ('Age ' + r.a_age + ', ' + (r.a_gender||'?') + (r.interview_location ? ' — ' + r.interview_location : '')) : (r.interview_location || 'New Record');
  var modal = document.createElement('div');
  modal.id = 'mss-del-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;';
  modal.innerHTML = '<div style="background:var(--bg-base,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -8px 40px rgba(0,0,0,.4);">'
    + '<div style="font-size:1.8rem;text-align:center;margin-bottom:10px">🗑️</div>'
    + '<div style="font-size:1rem;font-weight:800;color:var(--text-1,#0d3b66);text-align:center;margin-bottom:6px">Delete Record?</div>'
    + '<div style="font-size:.8rem;color:var(--text-2,#5d7a8a);text-align:center;margin-bottom:20px;line-height:1.5">'
    + '<strong>' + label + '</strong><br>This cannot be undone. The record will be removed from this device.'
    + (r._synced ? '<br><span style="color:#1e5c38;font-size:.75rem">✓ Already uploaded to server — data is safe.</span>' : '')
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:9px">'
    + '<button id="mss-del-confirm" style="padding:14px;background:#dc2626;color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:.92rem;font-weight:700;cursor:pointer">🗑️ Yes, Delete</button>'
    + '<button id="mss-del-cancel" style="padding:13px;background:var(--bg-raised,#f0f4f8);color:var(--text-2,#5d7a8a);border:1.5px solid var(--border-1,#dde8f0);border-radius:12px;font-family:inherit;font-size:.88rem;font-weight:600;cursor:pointer">Cancel</button>'
    + '</div></div>';
  document.body.appendChild(modal);
  document.getElementById('mss-del-confirm').onclick = function(){
    modal.remove();
    // Clear active record reference FIRST — before ss() — so any autosave
    // triggered during or after this tick cannot resurrect the deleted record.
    if(recId===id){ recId=null; loadInto({}); }
    delete recs[id];
    ss();
    renDrw();
    showToast('Record deleted');
  };
  document.getElementById('mss-del-cancel').onclick = function(){ modal.remove(); };
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
}
function renDrw(){
  var el = document.getElementById('drwList');
  if(!el) return;
  // Always re-read from localStorage so the list is never stale
  ls();
  var keys = Object.keys(recs);

  // Update count badge
  var badge = document.getElementById('drw-count');

  // Filter: only show records with real content
  var listKeys = keys.filter(function(id){
    var r = recs[id] || {};
    return r._finished || r._synced || r.a_age || r.interview_location || r.interview_date;
  });

  if(badge) badge.textContent = listKeys.length ? listKeys.length + ' record' + (listKeys.length===1?'':'s') : '';

  if(!listKeys.length){
    el.innerHTML = '<div style="text-align:center;padding:32px 16px;color:rgba(255,255,255,.3);font-size:.84rem;">No saved records yet.<br><span style="font-size:.72rem;opacity:.6;">Complete at least one section and tap Save Progress.</span></div>';
    return;
  }

  el.innerHTML = listKeys.slice().reverse().map(function(id){
    var r = recs[id] || {};
    var age  = r.a_age  ? 'Age ' + r.a_age : '';
    var gen  = r.a_gender || '';
    var loc  = r.interview_location || r.interview_location_custom || '';
    var date = r.interview_date || r._u || '';
    var nm   = (age || gen)
      ? [age, gen].filter(Boolean).join(', ') + (loc ? ' — ' + loc : '')
      : (loc || 'New Record');

    var isActive = (id === recId);

    var syncBadge = r._synced
      ? '<span style="font-size:.62rem;background:rgba(30,92,56,.5);color:#4ade80;padding:2px 8px;border-radius:99px;font-weight:700;">Uploaded</span>'
      : r._finished
        ? '<span style="font-size:.62rem;background:rgba(211,84,0,.3);color:#fb923c;padding:2px 8px;border-radius:99px;font-weight:700;">Pending sync</span>'
        : '<span style="font-size:.62rem;background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);padding:2px 8px;border-radius:99px;font-weight:600;">In progress</span>';

    var flagBadges = '';
    if(r.consent_given==='No') flagBadges += '<span style="font-size:.62rem;background:rgba(220,38,38,.3);color:#f87171;padding:2px 8px;border-radius:99px;font-weight:700;">No Consent</span>';
    if(r.a_age && (r.a_age<18||r.a_age>85)) flagBadges += '<span style="font-size:.62rem;background:rgba(220,38,38,.3);color:#f87171;padding:2px 8px;border-radius:99px;font-weight:700;">Age Flag</span>';

    var deleteSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';

    return '<div style="'
      + 'background:' + (isActive ? 'rgba(37,99,235,.15)' : 'rgba(255,255,255,.05)') + ';'
      + 'border:1px solid ' + (isActive ? 'rgba(37,99,235,.4)' : 'rgba(255,255,255,.07)') + ';'
      + 'border-radius:12px;padding:12px 14px;'
      + 'display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;">'

      + '<div onclick="loadRec(\'' + id + '\')" style="flex:1;min-width:0;">'
        + '<div style="color:#e2e8f0;font-size:.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px;">' + nm + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">'
          + syncBadge + flagBadges
          + (date ? '<span style="font-size:.62rem;color:rgba(255,255,255,.28);margin-left:2px;">' + date + '</span>' : '')
        + '</div>'
      + '</div>'

      + '<button onclick="event.stopPropagation();delRec(\'' + id + '\')" '
        + 'style="width:32px;height:32px;border-radius:8px;background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.2);color:#f87171;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;" '
        + 'aria-label="Delete">'
        + deleteSvg
      + '</button>'
    + '</div>';
  }).join('');
}


function openDrawer(){
  renDrw();
  var ov  = document.getElementById('ov');
  var drw = document.getElementById('drawer');
  if(ov)  { ov.style.display = 'block'; }
  if(drw) { drw.style.display = 'flex'; }
}
function closeDrw(){
  var ov  = document.getElementById('ov');
  var drw = document.getElementById('drawer');
  if(ov)  { ov.style.display = 'none'; }
  if(drw) { drw.style.display = 'none'; }
}

// 
//  TOAST
// 
let toastT;
function showToast(m,e=false){const t=document.getElementById('toast');t.textContent=m;t.className='toast show'+(e?' err':'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='toast',2500);}

// 
//  FINISH / PRINT
// 
async function showFinish(){
  if(!validate(cur))return;

  //  HARD BLOCK: village name must be present, valid length, and no bad hyphens
  const _loc = (document.getElementById('interview_location_input')?.value || '').trim();
  const _locBadHyphen = /^-|-$|-[^a-zA-Z0-9]/.test(_loc) || !/^[a-zA-Z]/.test(_loc);
  if(!_loc || _loc.length < 2){
    showBlockedModal(
      '⚠ Village Name Missing — Cannot Submit',
      `No village name was entered.\n\nGo back to Page 1 and type the name of the village where this interview is taking place.\n\nThe record will NOT be uploaded until this is filled in.`,
      'Go Back & Fix'
    );
    return;
  }
  if(_locBadHyphen){
    showBlockedModal(
      '⚠ Invalid Village Name — Cannot Submit',
      `The village name "${_loc}" is not valid.\n\nA hyphen must connect two parts, e.g. South-Nyamebondo or Moro-2.\n\nNames cannot start or end with a hyphen.\n\nGo back to Page 1 and correct the village name.`,
      'Go Back & Fix'
    );
    return;
  }

  saveCur();
  // Mark this record as finished — only finished records are uploaded
  if(recId && recs[recId]){ recs[recId]._finished=true; ss(); }

  const m=document.getElementById('finModal');
  m.querySelector('.modal-icon').textContent='⏳';
  m.querySelector('.modal-title').textContent='Saving & Uploading…';
  m.querySelector('.modal-body').textContent='Please wait while your record is uploaded to the admin dashboard.';
  m.querySelector('.modal-btns').innerHTML='';
  m.classList.add('open');

  //  Record saved locally — trigger background sync, never crash
  if(typeof syncAll === 'function') setTimeout(syncAll, 500);
  const isOnline = navigator.onLine;

  m.querySelector('.modal-icon').textContent = '✅';
  m.querySelector('.modal-title').textContent = 'Interview Saved!';
  m.querySelector('.modal-body').innerHTML = isOnline
    ? '<span style="color:#1e5c38;font-weight:700">✓ Record saved.</span><br><br>Uploading to admin dashboard in the background. You can start the next interview now.'
    : '<span style="color:#d35400;font-weight:700">📵 Saved locally — you are offline.</span><br><br>The record will upload automatically when you reconnect. Tap Sync from the top bar at any time.';

  m.querySelector('.modal-btns').innerHTML=`
    <button class="mbtn mbtn-p" onclick="startNewSurveyFromReport ? startNewSurveyFromReport() : (closeFinish(), newRec && newRec())" style="background:linear-gradient(135deg,#1a5c35,#1a4060)">
      ➕ Start New Interview
    </button>
    <button class="mbtn mbtn-p" onclick="openBriefReport()" style="background:#1e5c38">
       Brief Report <span style="font-size:0.72rem;opacity:.75;display:block;font-weight:400;margin-top:2px">Summary · Key findings</span>
    </button>
    <button class="mbtn mbtn-p" onclick="openFullReport()" style="background:#1a4f6e">
       Full Report <span style="font-size:0.72rem;opacity:.75;display:block;font-weight:400;margin-top:2px">Complete answers</span>
    </button>
    <button class="mbtn mbtn-s" onclick="closeFinish()">Close</button>`;
}

function closeFinish(){
  document.getElementById('finModal').classList.remove('open');
  // Make sure survey screen is still visible after closing modal
  if(typeof showScreen==='function') showScreen('survey');
  // Re-fill interviewer name in case it got wiped
  var name = typeof getUserName==='function' ? getUserName() : (localStorage.getItem('chsa_user_name')||'');
  if(name && typeof fillInterviewerFields==='function') fillInterviewerFields(name);
}

function openBriefReport(){
  closeFinish();
  const rec = cRec();
  const html = buildBriefReport(rec);
  openReportWindow(html,'brief');
}
function openFullReport(){
  closeFinish();
  const html = buildFullReport();
  openReportWindow(html,'full');
}
function openReportWindow(html, type){
  const overlay = document.getElementById('report-overlay');
  const frame   = document.getElementById('report-frame');
  const titleEl = document.getElementById('report-title');
  if(!overlay || !frame){ showToast('Report error — try again',true); return; }

  // Write the FULL HTML document into iframe — all fonts, colours and layout preserved
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  if(titleEl) titleEl.textContent = type==='brief' ? ' Brief Report' : ' Full Report';
  overlay.classList.add('open');
  // Support prompt removed — Ministry of Health deployment
}

function printReport(){
  const frame = document.getElementById('report-frame');
  if(frame && frame.contentWindow){
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } else {
    window.print();
  }
}

// closeReportOverlay is defined in survey-reports.js (authoritative version)
// Stub here so any early calls don't crash before survey-reports loads
if(typeof closeReportOverlay === 'undefined'){
  window.closeReportOverlay = function(){
    const overlay = document.getElementById('report-overlay');
    if(overlay){ overlay.classList.remove('open'); overlay.style.display='none'; }
  };
}

function startNewSurveyFromReport(){
  if(typeof closeReportOverlay==='function') closeReportOverlay();
  newRec();
  showToast(' New survey started');
}

function goHomeFromReport(){
  if(typeof closeReportOverlay==='function') closeReportOverlay();
  if(typeof goBackHome==='function') goBackHome(); else goSec(0,'back');
  showToast('Returned to home');
}

function showSupportPrompt(){
  // Show as a toast-style bottom notification, not a blocking modal
  const existing = document.getElementById('support-prompt');
  if(existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'support-prompt';
  el.style.cssText = `
    position:fixed;bottom:calc(92px + env(safe-area-inset-bottom));left:12px;right:12px;
    z-index:490;
    background:linear-gradient(135deg,#0f1f18ee,#0a1a2eee);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border:1px solid rgba(255,255,255,.1);
    border-radius:16px;padding:14px 16px;
    display:flex;align-items:center;gap:12px;
    box-shadow:0 8px 32px rgba(0,0,0,.3);
    animation:slideUpPrompt .35s cubic-bezier(.4,0,.2,1) both;
  `;
  el.innerHTML = `
    <div style="font-size:26px;flex-shrink:0"></div>
    <div style="flex:1;min-width:0">
      <div style="color:#fff;font-size:0.8rem;font-weight:700;margin-bottom:2px">Psst… can I get a coffee? </div>
      <div style="color:rgba(255,255,255,.5);font-size:0.7rem;line-height:1.4">This app is free and always will be — but a small M-Pesa treat keeps the code warm </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
      <button onclick="document.getElementById('support-prompt').remove();showDonateModal()" style="padding:7px 13px;background:linear-gradient(135deg,#3db86a,#2a9054);color:#fff;border:none;border-radius:8px;font-family:inherit;font-size:0.74rem;font-weight:700;cursor:pointer;white-space:nowrap">Buy me a coffee </button>
      <button onclick="document.getElementById('support-prompt').remove()" style="padding:5px 13px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);border:none;border-radius:8px;font-family:inherit;font-size:0.7rem;cursor:pointer">Maybe later</button>
    </div>`;
  document.body.appendChild(el);
  // Auto-dismiss after 12 seconds
  setTimeout(()=>{ if(document.getElementById('support-prompt')) el.remove(); }, 12000);
}
function exportJSON(){
  closeFinish();
  const rec = cRec();
  const blob = new Blob([JSON.stringify(rec, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = (rec.interviewer_name||'record').replace(/\s/g,'_');
  const date = (rec.interview_date||new Date().toISOString().split('T')[0]);
  a.href=url; a.download=`health_survey_${name}_${date}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast(' JSON saved to Downloads');
}

// 
//  BRIEF REPORT BUILDER
// 
function buildBriefReport(r){
  const flags=[], concerns=[], notes=[];

  //  Detect red flags 
  if(r.b_type==='Permanent'&&r.b_roof==='Grass Thatched') flags.push('Permanent house with grass-thatched roof');
  if(r.b_type==='Permanent'&&r.b_floor==='Earthen') flags.push('Permanent house with earthen floor');
  if(r.b_cook==='Inside'&&(r.b_fuel==='Firewood'||r.b_fuel==='Charcoal')&&r.b_ventil==='Poor') flags.push('Indoor cooking with '+r.b_fuel+' — POOR ventilation (respiratory risk)');
  if(r.b_animals==='Yes') concerns.push('Household shares living space with domestic animals');
  if(r.b_smoke==='Yes'&&r.b_smoke_in==='Yes') flags.push('Smoking inside the house — health risk to household members');
  if(r.g_latrine==='No') flags.push('No pit latrine — open defecation risk');
  if((r.h_wld==='0–5 m'||r.h_wld==='5–10 m')&&r.h_wprot==='No') flags.push('Water source very close to latrine AND unprotected — HIGH contamination risk');
  if(r.h_treat==='No') concerns.push('Water not treated before drinking');
  if(r.f_heard==='No') flags.push('Respondent has NEVER heard of HIV/AIDS — needs health education');
  if(r.c_preg==='Yes'&&r.a_gender==='Male') flags.push('Data inconsistency: Male respondent recorded as pregnant');
  if([].concat(r.c_ill||[]).length>0&&r.c_consult==='No') concerns.push('Illness reported but no medical consultation sought');
  if(r.i_circ==='Female'||r.i_circ==='Both') flags.push('Female genital mutilation (FGM) reported — needs follow-up');
  if(r.e_skip==='Yes'&&r.e_skip_w==='Not enough food') concerns.push('Household skipping meals due to food shortage');
  if(r.e_enough==='No') concerns.push('Food cooked is not enough for the household');
  if(r.a_edu==='None'&&r.a_occ==='Government') flags.push('No formal education but Government employment — verify');

  // Check MUAC flags
  for(let i=1;i<=7;i++){
    const muac=parseFloat(r['ea'+i+'m']||0);
    const dob=r['ea'+i+'d']||'';
    if(muac>0&&muac<12.5) flags.push(`Child ${i}: MUAC ${muac}cm — SEVERE ACUTE MALNUTRITION (SAM)`);
    else if(muac>0&&muac<13.5) concerns.push(`Child ${i}: MUAC ${muac}cm — Moderate Acute Malnutrition (MAM)`);
  }

  //  Key stats 
  const totPeople=(parseInt(r.a_tot_m)||0)+(parseInt(r.a_tot_f)||0);
  const houseType=r.b_type||'—';
  const water=[].concat(r.h_wsrc||[]).join(', ')||'—';
  const illness=[].concat(r.c_ill||[]).join(', ')||'None reported';
  const deaths=r.c_deaths==='Yes'?`Yes (${r.c_deaths_n||'?'} deaths in 5 years)`:'None reported';
  const latrine=r.g_latrine==='Yes'?`Yes (${r.g_lat_u||'—'})`:r.g_latrine==='No'?'NO LATRINE':'—';

  const now = new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});

  const flagHTML = flags.length
    ? flags.map(f=>`<div class="rf-item rf-red"> ${f}</div>`).join('')
    : '<div class="rf-item rf-ok"> No critical red flags identified</div>';

  const concernHTML = concerns.length
    ? concerns.map(c=>`<div class="rf-item rf-amber"> ${c}</div>`).join('')
    : '<div class="rf-item rf-ok"> No significant concerns</div>';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Brief Health Report</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#f5f5f5;color:#1a2b22;font-size:14px;}
.page{max-width:720px;margin:0 auto;background:#fff;min-height:100vh;}
.report-header{background:linear-gradient(135deg,#1e5c38,#1a4f6e);color:#fff;padding:24px 28px;}
.report-logo{font-size:32px;margin-bottom:8px;}
.report-title{font-size:1.3rem;font-weight:700;margin-bottom:2px;}
.report-sub{font-size:0.78rem;opacity:.7;}
.report-meta{background:#e8f5ed;padding:14px 28px;border-bottom:1px solid #cce0d4;display:flex;flex-wrap:wrap;gap:16px;}
.meta-item{font-size:0.78rem;} .meta-label{color:#6b8a74;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:1px;}
.meta-value{color:#1a2b22;font-weight:600;}
.body{padding:20px 28px;}
.section{margin-bottom:20px;}
.sec-head{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b8a74;border-bottom:2px solid #e8f5ed;padding-bottom:5px;margin-bottom:10px;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.stat-box{background:#f9f7f4;border-radius:8px;padding:10px 12px;border-left:3px solid #cce0d4;}
.stat-label{font-size:0.68rem;color:#6b8a74;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;}
.stat-value{font-size:0.9rem;font-weight:700;color:#1a2b22;}
.rf-item{padding:9px 12px;border-radius:8px;font-size:0.82rem;font-weight:500;margin-bottom:6px;line-height:1.4;}
.rf-red{background:#fdecea;color:#c0392b;border-left:3px solid #c0392b;}
.rf-amber{background:#fff8e1;color:#e65100;border-left:3px solid #f39c12;}
.rf-ok{background:#e8f5ed;color:#1e5c38;border-left:3px solid #4CAF72;}
.rf-red strong,.rf-amber strong{font-weight:700;}
.summary-box{background:linear-gradient(135deg,#f9f7f4,#e8f5ed);border:1px solid #cce0d4;border-radius:12px;padding:14px 16px;margin-bottom:16px;}
.summary-text{font-size:0.85rem;line-height:1.7;color:#1a2b22;}
.summary-text b{color:#1e5c38;}
.summary-text .red{color:#c0392b;font-weight:700;}
.print-btn{position:fixed;bottom:20px;right:20px;background:#1e5c38;color:#fff;border:none;border-radius:12px;padding:13px 22px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);display:flex;align-items:center;gap:7px;}
.sig{text-align:center;padding:20px;color:#aaa;font-size:0.7rem;border-top:1px solid #eee;margin-top:20px;}
@media print{.print-btn{display:none!important;}.page{box-shadow:none;}}
</style></head><body>
<div class="page">

<div class="report-header">
  <div class="report-logo"></div>
  <div class="report-title">Community Health Brief Report</div>
  <div class="report-sub">${(typeof authGetSession==='function'&&authGetSession()?.institution_name)||'Community Health Survey'} · ${now}</div>
</div>

<div class="report-meta">
  <div class="meta-item"><div class="meta-label">Interviewer</div><div class="meta-value">${r.interviewer_name||getUserName()||'—'}</div></div>
  <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${r.interview_date||now}</div></div>
  <div class="meta-item"><div class="meta-label">Location</div><div class="meta-value">${r.interview_location||r.interview_location_custom||'—'}</div></div>
  <div class="meta-item"><div class="meta-label">Respondent</div><div class="meta-value">${r.a_age||'?'} yrs, ${r.a_gender||'?'}, ${r.a_marital||'?'}</div></div>
</div>

<div class="body">

  <!-- NARRATIVE SUMMARY -->
  <div class="section">
    <div class="sec-head"> Summary</div>
    <div class="summary-box">
      <div class="summary-text">
        This interview was conducted with a <b>${r.a_age||'?'}-year-old ${r.a_gender||'person'}</b>
        ${r.a_marital?`(${r.a_marital})`:''}
        ${r.a_pos?`, the <b>${r.a_pos}</b> of the household`:''}
        in <b>${r.interview_location||r.interview_location_custom||'the community'}</b>.
        The household has <b>${totPeople} member${totPeople!==1?'s':''}</b>
        (${r.a_tot_m||0} male, ${r.a_tot_f||0} female).
        They live in a <b>${r.b_type||'?'} house</b>
        with <b>${r.b_roof||'?'} roofing</b> and <b>${r.b_floor||'?'} floor</b>.
        Primary water source is <b>${water}</b>
        ${r.h_treat==='Yes'?'(treated before drinking)':r.h_treat==='No'?'<span class="red">(NOT treated — risk)</span>':''}. 
        ${r.g_latrine==='Yes'?'The household has a pit latrine.':'<span class="red">There is NO pit latrine.</span>'}
        ${r.f_heard==='No'?'<span class="red">Respondent has never heard of HIV/AIDS.</span>':r.f_tested==='Yes'?'Respondent has been tested for HIV.':'Respondent has NOT been tested for HIV.'}
        ${[].concat(r.c_ill||[]).length>0?`Illnesses reported in past 6 months: <b>${illness}</b>.`:'No illnesses reported in past 6 months.'}
      </div>
    </div>
  </div>

  <!-- KEY STATS GRID -->
  <div class="section">
    <div class="sec-head"> Key Household Data</div>
    <div class="grid2">
      <div class="stat-box"><div class="stat-label">House Type</div><div class="stat-value">${houseType}</div></div>
      <div class="stat-box"><div class="stat-label">Household Size</div><div class="stat-value">${totPeople} people</div></div>
      <div class="stat-box"><div class="stat-label">Bedrooms</div><div class="stat-value">${r.b_rooms||'—'}</div></div>
      <div class="stat-box"><div class="stat-label">Per Bedroom</div><div class="stat-value">${r.b_proom||'—'} people</div></div>
      <div class="stat-box"><div class="stat-label">Water Source</div><div class="stat-value">${water}</div></div>
      <div class="stat-box"><div class="stat-label">Water Treated</div><div class="stat-value">${r.h_treat||'—'}</div></div>
      <div class="stat-box"><div class="stat-label">Pit Latrine</div><div class="stat-value">${latrine}</div></div>
      <div class="stat-box"><div class="stat-label">Main Fuel</div><div class="stat-value">${r.b_fuel||'—'}</div></div>
      <div class="stat-box"><div class="stat-label">Deaths (5 yrs)</div><div class="stat-value">${deaths}</div></div>
      <div class="stat-box"><div class="stat-label">HIV Tested</div><div class="stat-value">${r.f_tested||'—'}</div></div>
      <div class="stat-box"><div class="stat-label">Education</div><div class="stat-value">${r.a_edu||'—'}</div></div>
      <div class="stat-box"><div class="stat-label">Occupation</div><div class="stat-value">${r.a_occ||'—'}</div></div>
    </div>
  </div>

  <!-- RED FLAGS -->
  <div class="section">
    <div class="sec-head"> Red Flags — Requires Immediate Attention</div>
    ${flagHTML}
  </div>

  <!-- CONCERNS -->
  <div class="section">
    <div class="sec-head"> Concerns — Follow Up Recommended</div>
    ${concernHTML}
  </div>

  <!-- ILLNESSES -->
  <div class="section">
    <div class="sec-head"> Health — Illnesses Reported</div>
    <div class="rf-item ${[].concat(r.c_ill||[]).length>0?'rf-amber':'rf-ok'}">${illness}</div>
    ${r.c_consult?`<div class="rf-item ${r.c_consult==='Yes'?'rf-ok':'rf-amber'}">Consultation sought: <b>${r.c_consult}</b>${r.c_where?' — at '+r.c_where:''}</div>`:''}
  </div>

  <!-- PESTS OBSERVED -->
  ${['rats','cockroaches','mosquitoes','jiggers','bedbugs'].some(p=>r['k_'+p]==='Present')?`
  <div class="section">
    <div class="sec-head"> Pests Observed (Present)</div>
    ${['Rats','Cockroaches','Mosquitoes','Jiggers','Bedbugs','Houseflies','Ticks','Fleas','Tsetse_flies'].filter(p=>r['k_'+p.toLowerCase()]==='Present').map(p=>`<div class="rf-item rf-amber"> ${p.replace('_',' ')} — present</div>`).join('')}
  </div>`:''}

  <!-- OBSERVER NOTES -->
  ${r.k_notes?`<div class="section"><div class="sec-head"> Interviewer Notes</div><div class="summary-box"><div class="summary-text">${r.k_notes}</div></div></div>`:''}

</div>

<div class="sig">© 2026 Ministry of Health Kenya · Medical Survey System (MSS) · ${(typeof authGetSession==='function'&&authGetSession()?.institution_name)||'Community Health Survey'} · Free to use · No copyright restrictions</div>
</div>
<button class="print-btn" onclick="window.print()"> Print / Save PDF</button>
</body></html>`;
}

// 
//  FULL REPORT BUILDER
// 
function buildFullReport(){
  // Temporarily show all sections, capture their content, then restore
  const cards = document.querySelectorAll('.sec-card');
  cards.forEach(c=>c.style.display='block');

  const now = new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const r = cRec();
  const name = r.interviewer_name||getUserName()||'—';
  const loc  = r.interview_location||r.interview_location_custom||'—';

  // Capture rendered section HTML
  let sectionsHTML = '';
  document.querySelectorAll('.sec-card').forEach((card,i)=>{
    const hdr = card.querySelector('.sec-hdr');
    const body = card.querySelector('.sec-body');
    if(!hdr||!body) return;
    const title = hdr.querySelector('.sec-title')?.textContent||'Section '+(i+1);
    const badge = hdr.querySelector('.sec-badge')?.textContent||'';
    const color = hdr.style.background||'linear-gradient(135deg,#1e5c38,#27764a)';
    // Collect all answered fields in this section — skip dimmed groups (gender-gated etc.)
    let rows='';
    body.querySelectorAll('.form-group').forEach(grp=>{
      // Skip fields dimmed/disabled by conditional rules (use <= 0.5 to catch 0.5 exactly)
      const grpOp = parseFloat(grp.style.opacity);
      if((!isNaN(grpOp) && grpOp <= 0.5) || grp.style.pointerEvents === 'none') return;
      const lbl = grp.querySelector('.ql')?.textContent?.replace('*','').trim();
      if(!lbl) return;
      // Get value
      const checked = [...grp.querySelectorAll('input:checked,select')].map(el=>{
        if(el.type==='radio'||el.type==='checkbox') return el.checked?el.value:'';
        return el.value;
      }).filter(Boolean).join(', ');
      const text = [...grp.querySelectorAll('input[type=text],input[type=number],input[type=date],textarea')].map(el=>el.value).filter(Boolean).join(' ');
      const val = checked||text;
      if(!val) return;
      rows+=`<tr><td class="q-cell">${lbl}</td><td class="a-cell">${val}</td></tr>`;
    });
    if(!rows) return;
    sectionsHTML+=`
    <div class="full-section">
      <div class="full-sec-hdr" style="${color}">
        <span class="full-badge">${badge}</span> ${title}
      </div>
      <table class="full-table"><tbody>${rows}</tbody></table>
    </div>`;
  });

  // Restore
  cards.forEach((c,i)=>c.style.display=i===cur?'block':'none');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Full Health Survey Report</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#f5f5f5;color:#1a2b22;font-size:13px;}
.page{max-width:760px;margin:0 auto;background:#fff;min-height:100vh;}
.report-header{background:linear-gradient(135deg,#1a4f6e,#1e5c38);color:#fff;padding:22px 28px;}
.report-title{font-size:1.2rem;font-weight:700;margin-bottom:2px;}
.report-sub{font-size:0.76rem;opacity:.7;}
.report-meta{background:#e8f5ed;padding:12px 28px;border-bottom:1px solid #cce0d4;display:flex;flex-wrap:wrap;gap:14px;}
.meta-item{font-size:0.76rem;} .meta-label{color:#6b8a74;font-weight:600;text-transform:uppercase;letter-spacing:.4px;}
.meta-value{color:#1a2b22;font-weight:600;}
.body{padding:16px 28px 40px;}
.full-section{margin-bottom:18px;border-radius:10px;overflow:hidden;border:1px solid #e0e0e0;}
.full-sec-hdr{color:#fff;padding:9px 14px;font-size:0.82rem;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.full-badge{background:rgba(255,255,255,.2);padding:2px 8px;border-radius:99px;font-size:0.65rem;margin-right:6px;letter-spacing:.5px;}
.full-table{width:100%;border-collapse:collapse;}
.full-table tr:nth-child(even){background:#f9f9f9;}
.q-cell{padding:7px 12px;color:#666;width:45%;font-size:0.76rem;vertical-align:top;border-bottom:1px solid #f0f0f0;}
.a-cell{padding:7px 12px;font-weight:600;color:#1a2b22;font-size:0.82rem;border-bottom:1px solid #f0f0f0;}
.print-btn{position:fixed;bottom:20px;right:20px;background:#1a4f6e;color:#fff;border:none;border-radius:12px;padding:13px 22px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);}
.sig{text-align:center;padding:20px;color:#aaa;font-size:0.7rem;border-top:1px solid #eee;}
@media print{.print-btn{display:none!important;}}
</style></head><body>
<div class="page">
<div class="report-header">
  <div style="font-size:28px;margin-bottom:6px"></div>
  <div class="report-title">Full Medical Survey System (MSS) Report</div>
  <div class="report-sub">${(typeof authGetSession==='function'&&authGetSession()?.institution_name)||'Community Health Survey'} · ${now}</div>
</div>
<div class="report-meta">
  <div class="meta-item"><div class="meta-label">Interviewer</div><div class="meta-value">${name}</div></div>
  <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${r.interview_date||now}</div></div>
  <div class="meta-item"><div class="meta-label">Location</div><div class="meta-value">${loc}</div></div>
  <div class="meta-item"><div class="meta-label">Respondent</div><div class="meta-value">${r.a_age||'?'} yrs · ${r.a_gender||'?'} · ${r.a_marital||'?'}</div></div>
</div>
<div class="body">${sectionsHTML}</div>
<div class="sig">© 2026 Ministry of Health Kenya · Medical Survey System (MSS) · ${(typeof authGetSession==='function'&&authGetSession()?.institution_name)||'Community Health Survey'} · Free to use · No copyright restrictions</div>
</div>
<button class="print-btn" onclick="window.print()"> Print / Save PDF</button>
</body></html>`;
}

// 
//  LIVE INPUT LISTENER — auto-save + run rules
// 
document.addEventListener('change',e=>{
  if(!e.target.matches('input,select,textarea')) return;
  // Always do a full collectAll save — guarantees arrays for checkboxes are correct
  if(recId) saveCur();
  setTimeout(() => runSectionRules(cur), 100);
  setTimeout(() => MSS_syncChips(document), 150);
});

// Also run rules on text/numeric input (not just on change)
document.addEventListener('input',e=>{
  if(e.target.type==='number' || e.target.type==='text' || e.target.tagName==='TEXTAREA'){
    setTimeout(() => runSectionRules(cur), 100);
  }
});

//  FORM HELPERS 
function q(n,l,r=false){return `<label class="ql"><span class="qn">${n}.</span>${l}${r?'<span class="req">*</span>':''}</label>`;}
function radio(nm,v,l){const id=`${nm}_${v}`.replace(/[^a-z0-9_]/gi,'_');return `<div class="chip"><input type="radio" name="${nm}" id="${id}" value="${v}"><label for="${id}">${l}</label></div>`;}
function cb(nm,v,l){const id=`${nm}_${v}`.replace(/[^a-z0-9_]/gi,'_');return `<div class="chip"><input type="checkbox" name="${nm}" id="${id}" value="${v}"><label for="${id}">${l}</label></div>`;}
function ti(nm,ph='',type='text'){return `<input class="form-input" type="${type}" name="${nm}" placeholder="${ph}" autocomplete="off">`;}
function ni(nm,min=0,max=999,ph='0'){return `<input class="form-input" type="number" name="${nm}" min="${min}" max="${max}" placeholder="${ph}" inputmode="numeric">`;}
function ta(nm,ph=''){return `<textarea class="form-textarea" name="${nm}" placeholder="${ph}"></textarea>`;}
function chips(c){return `<div class="chips">${c}</div>`;}
function fg(c){return `<div class="form-group">${c}</div>`;}
function vb(){return `<div class="val-banner"> Please fill in all required fields before going to next section.</div>`;}
function sub(t){return `<div class="sub-ttl">${t}</div>`;}
function sec(badge,title,body,color1='#1e5c38',color2='#27764a'){
  return `<div class="sec-hdr"><div class="sec-badge">${badge}</div><div class="sec-title">${title}</div></div><div class="sec-body">${vb()}${body}</div>`;
}

//  SECTIONS 
function bConsent(){
// Pre-fill today's date
const today = new Date().toISOString().split('T')[0];
// Get institution name dynamically from session
const _sess = (typeof authGetSession === 'function') ? authGetSession() : null;
const _instName = (_sess && _sess.institution_name) ? _sess.institution_name : (_sess && _sess.institution_id ? 'your institution' : 'the Ministry of Health');
return sec('Introduction','Consent Form',`
<div class="consent-box" style="font-size:.92rem;line-height:1.8;padding:18px 16px;">
<p style="margin-bottom:12px;">Good morning/afternoon, my name is <strong id="consent_name_display">___</strong>. I am a health worker from <strong id="consent_inst_name">${_instName}</strong>, conducting a community health situation analysis. We are collecting data on factors that contribute to ill health in your area.</p>
<p>The data will be shared with the area chief and county health director. Your responses are completely confidential. You may withdraw at any time.</p>
</div>

<!-- Interviewer card — auto-filled from profile, read-only -->
<div style="background:var(--green-pale);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
  <div style="font-size:28px">👤</div>
  <div style="flex:1">
    <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Interviewer</div>
    <div style="font-weight:700;font-size:0.95rem;color:var(--text)" id="consent_interviewer_card">Loading...</div>
    <div style="font-size:0.75rem;color:var(--muted)" id="consent_inst_sub">${_instName}</div>
  </div>
  <a onclick="forgetUser()" style="font-size:0.68rem;color:var(--muted);text-decoration:underline;cursor:pointer;white-space:nowrap">Not me?</a>
</div>

<!-- Hidden fields auto-filled -->
<input type="hidden" name="interviewer_name" id="h_interviewer_name">
<input type="hidden" name="interviewer_school" id="h_interviewer_school" value="${_instName}">

${fg(q('Q1','Interview Date','req')+`<input class="form-input" type="date" name="interview_date" value="${today}">`)}

${fg(q('Q2','Village / Location','req')+`
<select class="form-input" name="interview_location" id="interview_location_input"
  onchange="if(typeof ruleLocation==='function')ruleLocation()">
  <option value="">— Select village —</option>
</select>
<p class="info-note" id="village-load-hint">Loading villages…</p>`)}

${fg(q('Q3','Does respondent consent to this interview?','req')+chips(radio('consent_given','Yes',' Yes — Consents')+radio('consent_given','No',' No — Declines'))+'<p class="info-note">If respondent declines, stop the interview.</p>')}
`,'#1a5276','#1f618d');}

function bSecA(){
const ab=[['0–1 yrs','a_01'],['2–3 yrs','a_23'],['4–5 yrs','a_45'],['6–10 yrs','a_610'],['11–15 yrs','a_1115'],['16–20 yrs','a_1620'],['21–59 yrs','a_2159'],['60+ yrs','a_60p']];
return sec('Section A','Demography Profile',`
${fg(q('A1','Age of Respondent (Years)','req')+ni('a_age',18,85,'e.g. 35'))}
${fg(q('A2','Gender','req')+chips(radio('a_gender','Male','Male')+radio('a_gender','Female','Female')))}
${fg(q('A3','Position in Family')+chips(radio('a_pos','Father','Father')+radio('a_pos','Mother','Mother')+radio('a_pos','Son','Son')+radio('a_pos','Daughter','Daughter')+radio('a_pos','Daughter in-law','Daughter in-law')+radio('a_pos','Grandchild','Grandchild')+radio('a_pos','Other','Other'))+ti('a_pos_other','Other — specify...'))}
${fg(q('A4','Marital Status')+chips(radio('a_marital','Single','Single')+radio('a_marital','Married','Married')+radio('a_marital','Divorced/Separated','Divorced')+radio('a_marital','Widowed/Widower','Widowed')))}
${fg(q('A5','Total people in household')+`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="ql">Male</label>${ni('a_tot_m',0,50)}</div><div><label class="ql">Female</label>${ni('a_tot_f',0,50)}</div></div>`)}
${fg(q('A6','Members who sometimes move away?')+chips(radio('a_move','Yes','Yes')+radio('a_move','No','No')))}
${fg(q('A7','If Yes — reason for moving')+chips(cb('a_move_r','Work','Work')+cb('a_move_r','Another family','Another family')+cb('a_move_r','Another farm','Another farm')+cb('a_move_r','Help grandma','Help grandma')+cb('a_move_r','Other','Other')))}
${sub('A8. Household Members by Age Bracket')}
<p class="info-note" style="margin-bottom:6px">Total must not exceed household totals above. Live sum shown below.</p>
<div class="tbl-wrap"><table class="dt">
<tr><th>Age Bracket</th><th>Male</th><th>Female</th></tr>
${ab.map(([l,k])=>`<tr><td class="ltd">${l}</td><td><input type="number" name="${k}_m" min="0" max="50" placeholder="0" inputmode="numeric"></td><td><input type="number" name="${k}_f" min="0" max="50" placeholder="0" inputmode="numeric"></td></tr>`).join('')} 
</table></div>
<div id="age_bracket_sum" style="font-size:0.75rem;font-weight:600;padding:7px 10px;background:var(--green-pale);border-radius:6px;margin-top:4px;color:var(--green)">Bracket totals: 0 M / 0 F u00a0|u00a0 Household: u2014 M / u2014 F</div>
${fg(q('A9','Household head')+chips(radio('a_head','Grandfather','Grandfather')+radio('a_head','Grandmother','Grandmother')+radio('a_head','Father','Father')+radio('a_head','Mother','Mother')+radio('a_head','Other','Other'))+ti('a_head_other','Other — specify...'))}
${fg(q('A10','Highest Education Level')+chips(radio('a_edu','None','None')+radio('a_edu','Primary','Primary')+radio('a_edu','Secondary','Secondary')+radio('a_edu','Tertiary','Tertiary')))}
${fg(q('A11','Occupation')+chips(radio('a_occ','Farming','Farming')+radio('a_occ','Government','Government')+radio('a_occ','Business','Business')+radio('a_occ','Other','Other'))+ti('a_occ_other','Other — specify...'))}
${fg(q('A12','Religion')+chips(radio('a_rel','Christian','Christian')+radio('a_rel','Muslim','Muslim')+radio('a_rel','Hindu','Hindu')+radio('a_rel','Atheist','Atheist')+radio('a_rel','Other','Other')))}
`,'#1e5c38','#27764a');}

function bSecB(){return sec('Section B','Housing',`
${fg(q('B1','Type of House (Observe)','req')+chips(radio('b_type','Permanent','Permanent')+radio('b_type','Semi-permanent','Semi-permanent')+radio('b_type','Temporary','Temporary')))}
${fg(q('B2','Roofing Material')+chips(radio('b_roof','Iron Sheets','Iron Sheets')+radio('b_roof','Grass Thatched','Grass Thatched')+radio('b_roof','Tiles','Tiles')+radio('b_roof','Other','Other')))}
${fg(q('B3','Number of Windows')+chips(radio('b_win','None','None')+radio('b_win','1–3','1–3')+radio('b_win','4','4')+radio('b_win','More than 4','>4')))}
${fg(q('B4','Ventilation (Observe)')+chips(radio('b_ventil','Good','Good')+radio('b_ventil','Poor','Poor'))+ti('b_vent_note','Observer comments...'))}
${fg(q('B5','Number of Bedrooms')+chips(radio('b_rooms','1','1')+radio('b_rooms','2','2')+radio('b_rooms','3','3')+radio('b_rooms','More than 3','>3')))}
${fg(q('B6','Separate Bedrooms for Children?')+chips(radio('b_sep','Yes','Yes')+radio('b_sep','No','No')))}
${fg(q('B7','People Per Bedroom')+chips(radio('b_proom','1','1')+radio('b_proom','2–3','2–3')+radio('b_proom','4','4')+radio('b_proom','More than 4','>4')))}
${fg(q('B8','Food Preparation Location')+chips(radio('b_cook','Inside','Inside main house')+radio('b_cook','Outside','Outside main house')))}
${fg(q('B9','Main Fuel Source')+chips(radio('b_fuel','Firewood','Firewood')+radio('b_fuel','Charcoal','Charcoal')+radio('b_fuel','Kerosene','Kerosene')+radio('b_fuel','Gas','Gas')+radio('b_fuel','Other','Other')))}
${fg(q('B10','Lighting Type')+chips(radio('b_light','Electricity','Electricity')+radio('b_light','Paraffin Lamp','Paraffin')+radio('b_light','Solar','Solar')+radio('b_light','Other','Other')))}
${fg(q('B11','Washroom/Bathroom Location')+chips(radio('b_wash','Inside','Inside main house')+radio('b_wash','Outside','Outside main house')))}
${fg(q('B12','Floor Type (Observe)')+chips(radio('b_floor','Cemented','Cemented')+radio('b_floor','Earthen','Earthen')+radio('b_floor','Other','Other')))}
${fg(q('B13','Land Size')+chips(radio('b_land','0–1 acres','0–1 acres')+radio('b_land','2–4 acres','2–4 acres')+radio('b_land','More than 4 acres','>4 acres')))}
${fg(q('B14','Share House with Animals?')+chips(radio('b_animals','Yes','Yes')+radio('b_animals','No','No')))}
${fg(q('B15','Any Household Member Smokes?')+chips(radio('b_smoke','Yes','Yes')+radio('b_smoke','No','No')))}
${fg(q('B16','If Yes — Smokes Inside House?')+chips(radio('b_smoke_in','Yes','Yes')+radio('b_smoke_in','No','No')))}
`,'#6e4c1e','#8b6220');}

function bSecC(){return sec('Section C','Family Medical History',`
${fg(q('C1','Illnesses in last 6 months (tick all)')+chips(cb('c_ill','Diarrhoea','Diarrhoea')+cb('c_ill','Cough/Colds','Cough/Colds')+cb('c_ill','Breathing difficulty','Breathing difficulty')+cb('c_ill','Fever','Fever')+cb('c_ill','Convulsions','Convulsions')+cb('c_ill','Abdominal pains','Abdominal pains')+cb('c_ill','Vomiting','Vomiting')+cb('c_ill','Headache','Headache')+cb('c_ill','Loss of consciousness','Loss of consciousness')+cb('c_ill','Dizziness','Dizziness')+cb('c_ill','Other','Other'))+ti('c_ill_other','Other — specify...'))}
${fg(q('C2','Age of affected person')+chips(radio('c_ill_age','0–2 yrs','0–2 yrs')+radio('c_ill_age','3–5 yrs','3–5 yrs')+radio('c_ill_age','6–10 yrs','6–10 yrs')+radio('c_ill_age','11–15 yrs','11–15 yrs')+radio('c_ill_age','16–20 yrs','16–20 yrs')+radio('c_ill_age','21–59 yrs','21–59 yrs')+radio('c_ill_age','60+','60+')))}
${fg(q('C3','Was consultation sought?','req')+chips(radio('c_consult','Yes','Yes')+radio('c_consult','No','No')+radio('c_consult','Don\'t Know','Don\'t Know')))}
${fg(q('C4','If Yes — where consulted?')+chips(radio('c_where','Dispensary','Dispensary')+radio('c_where','Govt Health Centre','Govt Health Centre')+radio('c_where','Private Clinic','Private Clinic')+radio('c_where','Hospital','Hospital')+radio('c_where','Traditional Healer','Traditional Healer')+radio('c_where','Other','Other')))}
${fg(q('C5','If No — reason for not seeking help')+chips(cb('c_no_r','Not necessary','Not necessary')+cb('c_no_r','Staff unfriendly','Staff unfriendly')+cb('c_no_r','Long wait','Long wait')+cb('c_no_r','Too many patients','Too many patients')+cb('c_no_r','Facility far','Facility far')+cb('c_no_r','No drugs','No drugs')+cb('c_no_r','Other','Other')))}
${fg(q('C6','Who do you consult when sick?')+chips(cb('c_who','Doctor','Doctor')+cb('c_who','Nurse','Nurse')+cb('c_who','Clinical Officer','Clinical Officer')+cb('c_who','Chemist','Chemist')+cb('c_who','CHW','CHW')+cb('c_who','Traditional Healer','Traditional Healer')+cb('c_who','Other','Other')))}
${fg(q('C7','Who accompanies sick person?')+chips(radio('c_accomp','Mother','Mother')+radio('c_accomp','Father','Father')+radio('c_accomp','Sibling','Sibling')+radio('c_accomp','Grandparent','Grandparent')+radio('c_accomp','Other','Other')))}
${fg(q('C8','Buy medicines on your own?')+chips(radio('c_meds','Yes','Yes')+radio('c_meds','No','No')))}
${fg(q('C9','Distance to drug store')+chips(radio('c_drug_d','Walking distance','Walking')+radio('c_drug_d','Motor bicycle','Motor bicycle')+radio('c_drug_d','Matatu','Matatu')+radio('c_drug_d','Home delivery','Home delivery')))}
${fg(q('C10','Deaths in household in last 5 years?')+chips(radio('c_deaths','Yes','Yes')+radio('c_deaths','No','No')))}
${fg(q('C11','If Yes — number of deaths')+ni('c_deaths_n',0,30,'Number'))}
${fg(q('C12','Age of member(s) who died')+chips(cb('c_dage','0–1 yr','0–1 yr')+cb('c_dage','2–3 yrs','2–3 yrs')+cb('c_dage','4–5 yrs','4–5 yrs')+cb('c_dage','6–10 yrs','6–10 yrs')+cb('c_dage','11–15 yrs','11–15 yrs')+cb('c_dage','16–20 yrs','16–20 yrs')+cb('c_dage','21–59 yrs','21–59 yrs')+cb('c_dage','60+','60+')))}
${fg(q('C13','Cause of death')+chips(cb('c_dcause','Malaria','Malaria')+cb('c_dcause','Pneumonia','Pneumonia')+cb('c_dcause','Heart Problem','Heart Problem')+cb('c_dcause','Accident','Accident')+cb('c_dcause','Stroke','Stroke')+cb('c_dcause','Other','Other'))+ti('c_dcause_other','Other — specify...'))}
${fg(q('C14','Family member with special needs?')+chips(radio('c_spec','Yes','Yes')+radio('c_spec','No','No')))}
${fg(q('C15','Nature of disability')+chips(cb('c_disab','Visual','Visual impairment')+cb('c_disab','Hearing','Hearing impairment')+cb('c_disab','Mental','Mentally challenged')+cb('c_disab','Physical','Physically challenged')+cb('c_disab','Other','Other')))}
${fg(q('C16','Cause of disability')+chips(radio('c_disab_c','By birth','By birth')+radio('c_disab_c','Severe illness','Severe illness')+radio('c_disab_c','Accident','Accident')+radio('c_disab_c','Other','Other')))}
${fg(q('C17','Pregnant female in household?')+chips(radio('c_preg','Yes','Yes — go to Section D')+radio('c_preg','No','No')))}
`,'#922b21','#b03a2e');}

function bSecD(){
const vax=['BCG','OPV0','OPV1','OPV2','OPV3','PV1','PV2','PV3','Rota','Measles'];
return sec('Section D','Maternal & Child Health (Women Only)',`
${fg(q('D1','Ever been pregnant?')+chips(radio('d_preg','Yes','Yes')+radio('d_preg','No','No')))}
${fg(q('D2','Age at first pregnancy')+chips(radio('d_preg_age','10–15 yrs','10–15 yrs')+radio('d_preg_age','16–20 yrs','16–20 yrs')+radio('d_preg_age','21–25 yrs','21–25 yrs')+radio('d_preg_age','Over 25 yrs','Over 25 yrs')))}
${fg(q('D3','Current pregnancy number')+chips(radio('d_preg_n','1st','1st')+radio('d_preg_n','2nd','2nd')+radio('d_preg_n','3rd','3rd')+radio('d_preg_n','4th','4th')+radio('d_preg_n','5th+','5th+')))}
${fg(q('D4','Attended Antenatal Clinic (ANC)?')+chips(radio('d_anc','Yes','Yes')+radio('d_anc','No','No')))}
${fg(q('D5','Stage of first ANC visit')+chips(radio('d_anc_s','1st Trimester','1st Trimester')+radio('d_anc_s','2nd Trimester','2nd Trimester')+radio('d_anc_s','3rd Trimester','3rd Trimester')))}
${fg(q('D6','Where attended ANC?')+chips(radio('d_anc_w','Health Centre','Health Centre')+radio('d_anc_w','Hospital','Hospital')+radio('d_anc_w','Private Clinic','Private Clinic')+radio('d_anc_w','Home w/ TBA','Home w/ TBA')+radio('d_anc_w','Home w/o TBA','Home w/o TBA')+radio('d_anc_w','Other','Other')))}
${fg(q('D7','Reason for ANC location choice')+chips(cb('d_anc_r','Nearest facility','Nearest')+cb('d_anc_r','Spouse preferred','Spouse preferred')+cb('d_anc_r','Friendly staff','Friendly staff')+cb('d_anc_r','Other','Other')))}
${fg(q('D8','Where was last child delivered?')+chips(radio('d_del','Health Centre','Health Centre')+radio('d_del','Hospital','Hospital')+radio('d_del','Private Clinic','Private Clinic')+radio('d_del','Home w/ TBA','Home w/ TBA')+radio('d_del','Home w/o TBA','Home w/o TBA')+radio('d_del','Other','Other')))}
${fg(q('D9','Reason for delivery location')+chips(cb('d_del_r','Safe delivery','Safe delivery')+cb('d_del_r','Staff friendly','Staff friendly')+cb('d_del_r','Distance','Distance')+cb('d_del_r','Previous exp.','Previous exp.')+cb('d_del_r','ANC advice','ANC advice')+cb('d_del_r','Mother\'s advice','Mother\'s advice')+cb('d_del_r','Spouse advice','Spouse advice')+cb('d_del_r','Other','Other')))}
${sub('D10. Immunization Record (Children under 5)')}
<p class="info-note" style="margin-bottom:7px">Ask for hospital booklet and verify. PV=Pentavalent, OPV=Oral Polio Vaccine</p>
<div id="vax-table-wrap" style="position:relative;">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;flex-wrap:wrap;gap:6px;">
  <span style="font-size:0.72rem;color:var(--muted);font-weight:600">Fill verified vaccinations from booklet</span>
  <div style="display:flex;gap:6px;flex-wrap:wrap;">
    <button type="button" onclick="vaxQuickFillAll()" style="background:linear-gradient(135deg,var(--green),#1a4060);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:inherit;font-size:0.74rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(26,92,53,.25);"> All  (Full)</button>
    <button type="button" onclick="vaxQuickFillNone()" style="background:var(--cream);color:var(--muted);border:1.5px solid var(--border);border-radius:8px;padding:6px 12px;font-family:inherit;font-size:0.74rem;font-weight:700;cursor:pointer;"> Clear All</button>
    <button type="button" onclick="vaxQuickFill1Child()" style="background:rgba(26,92,53,.1);color:var(--green);border:1.5px solid var(--green-light);border-radius:8px;padding:6px 12px;font-family:inherit;font-size:0.74rem;font-weight:700;cursor:pointer;"> 1 Child </button>
  </div>
</div>
<div class="tbl-wrap"><table class="dt">
<tr><th>#</th><th>Sex</th><th>DOB</th>${vax.map(v=>`<th>${v}</th>`).join('')}</tr>
${[1,2,3,4,5].map(i=>`<tr><td>${i}</td><td><select name="dc${i}s"><option value="">-</option><option>M</option><option>F</option></select></td><td><input type="date" name="dc${i}d"></td>${vax.map((_,j)=>`<td><select name="dc${i}v${j}"><option value="">-</option><option></option><option></option></select></td>`).join('')}</tr>`).join('')}
</table></div>
</div>
${fg(q('D11','Aware of family planning methods?')+chips(radio('d_fp','Yes','Yes')+radio('d_fp','No','No')))}
${fg(q('D12','Ever used contraceptives?')+chips(radio('d_contra','Yes','Yes')+radio('d_contra','No','No')))}
${fg(q('D13','Contraceptive method used')+chips(cb('d_ct','Pills','Pills')+cb('d_ct','Depo Provera','Depo Provera')+cb('d_ct','IUD','IUD')+cb('d_ct','Norplant','Norplant')+cb('d_ct','Tubal ligation','Tubal ligation')+cb('d_ct','Condoms','Condoms')+cb('d_ct','Abstinence','Abstinence')+cb('d_ct','Other','Other')))}
${fg(q('D14','Family planning challenges')+chips(cb('d_fp_c','Spouse disapproval','Spouse disapproval')+cb('d_fp_c','Religion','Religion')+cb('d_fp_c','Side effects','Side effects')+cb('d_fp_c','Adherence','Adherence')+cb('d_fp_c','Culture','Culture')+cb('d_fp_c','Other','Other')))}
`,'#6c3483','#884ea0');}

function bSecE(){return sec('Section E','Nutrition & Lifestyle',`
${fg(q('E1','Meals per day at home')+chips(radio('e_meals','1','1')+radio('e_meals','2','2')+radio('e_meals','3','3')+radio('e_meals','4','4')+radio('e_meals','More than 4','>4')))}
${fg(q('E2','Does family skip meals?')+chips(radio('e_skip','Yes','Yes')+radio('e_skip','No','No')))}
${fg(q('E3','Meals usually skipped')+chips(cb('e_skip_m','Breakfast','Breakfast')+cb('e_skip_m','Lunch','Lunch')+cb('e_skip_m','Supper','Supper')))}
${fg(q('E4','Why meals are skipped')+chips(radio('e_skip_w','Not enough food','Not enough food')+radio('e_skip_w','No one to cook','No one to cook')+radio('e_skip_w','No one at home','No one at home')))}
${fg(q('E5','If food shortage — what do you do?')+chips(cb('e_short','Reduce portions','Reduce portions')+cb('e_short','Reduce for some','Reduce for some')+cb('e_short','Eat at neighbour\'s','Eat at neighbour\'s')+cb('e_short','Skip meals','Skip meals')+cb('e_short','Other','Other')))}
${fg(q('E6','Who prepares meals?')+chips(radio('e_cook','Grandmother','Grandmother')+radio('e_cook','Mother','Mother')+radio('e_cook','Daughter','Daughter')+radio('e_cook','House help','House help')+radio('e_cook','Other','Other')))}
${fg(q('E7','Meal intervals')+chips(radio('e_int','Random','Random')+radio('e_int','24 hrs','24 hrs')+radio('e_int','12 hrs','12 hrs')+radio('e_int','8 hrs','8 hrs')+radio('e_int','6 hrs','6 hrs')+radio('e_int','< 6 hrs','< 6 hrs')))}
${fg(q('E8','Food consumed most last month')+chips(cb('e_ftype','Proteins','Proteins')+cb('e_ftype','Carbohydrates','Carbohydrates')+cb('e_ftype','Vegetables','Vegetables')+cb('e_ftype','Fruits','Fruits')+cb('e_ftype','Other','Other')))}
${fg(q('E9','Food preferences in family?')+chips(radio('e_pref','Yes','Yes')+radio('e_pref','No','No')))}
${fg(q('E10','Preferred food types')+chips(cb('e_pft','Proteins','Proteins')+cb('e_pft','Carbohydrates','Carbohydrates')+cb('e_pft','Vegetables','Vegetables')+cb('e_pft','Fruits','Fruits')+cb('e_pft','Other','Other')))}
${fg(q('E11','Reason for preference')+chips(cb('e_pr','Cheap','Cheap')+cb('e_pr','Readily available','Readily available')+cb('e_pr','Easy to cook','Easy to cook')+cb('e_pr','Other','Other')))}
${fg(q('E12','Food sources')+chips(cb('e_fsrc','Farm','Farm')+cb('e_fsrc','Shop','Shop')+cb('e_fsrc','Hotel','Hotel')+cb('e_fsrc','Famine relief','Famine relief')+cb('e_fsrc','Other','Other')))}
${fg(q('E13','Foods bought from shop/hotel')+ta('e_shop','List types of foods purchased...'))}
${fg(q('E14','Do you have a garden?')+chips(radio('e_garden','Yes','Yes')+radio('e_garden','No','No')))}
${fg(q('E15','Garden productivity')+chips(radio('e_prod','Very good','Very good')+radio('e_prod','Good','Good')+radio('e_prod','Fair','Fair')+radio('e_prod','Poor','Poor')))}
${fg(q('E16','Do crops last to next harvest?')+chips(radio('e_crops','Yes','Yes')+radio('e_crops','No','No')))}
${sub('E16b. Which food crops do you grow? (tick all that apply)')}
<div id="crop-table-wrap" class="tbl-wrap"><table class="dt" style="font-size:0.78rem;table-layout:fixed;width:100%;">
<colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%"></colgroup>
<tr>
  <th style="text-align:left;padding:7px 8px;background:linear-gradient(135deg,#1a5c35,#1a4060);">Carbohydrates</th>
  <th style="text-align:left;padding:7px 8px;background:linear-gradient(135deg,#1a5c35,#1a4060);">Legumes</th>
  <th style="text-align:left;padding:7px 8px;background:linear-gradient(135deg,#1a5c35,#1a4060);">Vegetables</th>
  <th style="text-align:left;padding:7px 8px;background:linear-gradient(135deg,#1a5c35,#1a4060);">Fruits</th>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Wheat"> Wheat</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_l" value="Beans"> Beans</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Sukuma wiki"> Sukuma wiki</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Bananas"> Bananas</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Maize"> Maize</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_l" value="Peas"> Peas</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Cabbage"> Cabbage</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Oranges"> Oranges</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Millet"> Millet</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_l" value="Dengue"> Dengue</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Spinach"> Spinach</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Pineapples"> Pineapples</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Sweet potatoes"> Sweet potatoes</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_l" value="Ground nuts"> Ground nuts</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Managu"> Managu</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Mangoes"> Mangoes</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Irish potatoes"> Irish potatoes</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_l" value="Others (Legumes)"> Others</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Saga"> Saga</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Passion fruits"> Passion fruits</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Cassava"> Cassava</label></td>
  <td></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Mchicha (Amarantha)"> Mchicha</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Pawpaw"> Pawpaw</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Bananas"> Bananas</label></td>
  <td></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Mrenda"> Mrenda</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Guavas"> Guavas</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Yams"> Yams</label></td>
  <td></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Kunde (Cow peas)"> Kunde</label></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_f" value="Others (Fruits)"> Others</label></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Arrow roots"> Arrow roots</label></td>
  <td></td>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_v" value="Others (Vegetables)"> Others</label></td>
  <td></td>
</tr>
<tr>
  <td style="padding:5px 8px;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" name="e_crop_c" value="Others (Specify)"> Others (Specify)</label></td>
  <td></td>
  <td></td>
  <td></td>
</tr>
</table></div>
${fg(q('E17','Food preservation methods')+chips(cb('e_pres','Drying','Drying')+cb('e_pres','Smoking','Smoking')+cb('e_pres','Chemicals','Chemicals')+cb('e_pres','Ash','Ash')+cb('e_pres','Airtight containers','Airtight containers')+cb('e_pres','Other','Other')))}
${fg(q('E18','Food storage')+chips(radio('e_store','House','House')+radio('e_store','Granary','Granary')+radio('e_store','Other','Other')))}
${fg(q('E19','Enough food cooked for family?')+chips(radio('e_enough','Yes','Yes')+radio('e_enough','No','No')))}
${fg(q('E20','Fruit consumption frequency')+chips(radio('e_fruit','Daily','Daily')+radio('e_fruit','Weekly','Weekly')+radio('e_fruit','Monthly','Monthly')+radio('e_fruit','Rarely','Rarely')))}
${fg(q('E21','Food taboos?')+chips(radio('e_taboo','Yes','Yes')+radio('e_taboo','No','No'))+ti('e_taboo_d','If yes — specify foods...'))}
${fg(q('E22','Animal products in last week')+chips(cb('e_anm','Milk','Milk')+cb('e_anm','Meat','Meat')+cb('e_anm','Chicken','Chicken')+cb('e_anm','Fish','Fish')+cb('e_anm','Other','Other')))}
${fg(q('E23','Do you exercise?')+chips(radio('e_exer','Yes','Yes')+radio('e_exer','No','No')))}
${fg(q('E24','Exercise frequency')+chips(radio('e_exer_f','Regularly','Regularly')+radio('e_exer_f','Irregularly','Irregularly')))}
${fg(q('E25','Water intake frequency per day')+chips(radio('e_wf','Once','Once')+radio('e_wf','Twice','Twice')+radio('e_wf','Thrice','Thrice')+radio('e_wf','Other','Other')))}
${fg(q('E26','Average daily water intake')+chips(radio('e_wml','0–500 ml','0–500 ml')+radio('e_wml','500–1500 ml','500–1500 ml')+radio('e_wml','1500–3000 ml','1500–3000 ml')+radio('e_wml','>3000 ml','>3000 ml')))}
${fg(q('E27','Children aged 0–5 in home?')+chips(radio('e_kids','Yes','Yes')+radio('e_kids','No','No')))}
${fg(q('E28','Age of youngest child')+chips(radio('e_yng','0–1 yr','0–1 yr')+radio('e_yng','2–3 yrs','2–3 yrs')+radio('e_yng','4–5 yrs','4–5 yrs')+radio('e_yng','5+ yrs','5+ yrs')))}
${fg(q('E29','Is youngest child (0–2) breastfeeding?')+chips(radio('e_bf','Yes','Yes')+radio('e_bf','No','No')))}
${fg(q('E30','Reason for stopping breastfeeding')+chips(radio('e_bf_s','Child refused','Child refused')+radio('e_bf_s','No breast milk','No breast milk')+radio('e_bf_s','Went to work','Went to work')+radio('e_bf_s','Other','Other')))}
${fg(q('E31','Duration of breastfeeding')+chips(radio('e_bf_d','Not at all','Not at all')+radio('e_bf_d','< 6 months','< 6 months')+radio('e_bf_d','7–12 months','7–12 months')+radio('e_bf_d','13–24 months','13–24 months')+radio('e_bf_d','> 2 years','> 2 years')))}
${fg(q('E32','Age started weaning')+chips(radio('e_wean','< 2 months','< 2 months')+radio('e_wean','3–6 months','3–6 months')+radio('e_wean','7–12 months','7–12 months')+radio('e_wean','> 12 months','> 12 months')))}
${fg(q('E33','Weaning foods used')+chips(cb('e_wf2','Formula','Formula (Nan/Cerelac)')+cb('e_wf2','Porridge','Porridge')+cb('e_wf2','Mashed potatoes','Mashed potatoes')+cb('e_wf2','Fruit juices','Fruit juices')+cb('e_wf2','Other','Other')))}
${fg(q('E34','Clinic supplements for baby?')+chips(radio('e_supp','Yes','Yes')+radio('e_supp','No','No'))+ti('e_supp_d','If yes — specify...'))}
${fg(q('E35','Access to infant nutrition info?')+chips(radio('e_ninfo','Yes','Yes')+radio('e_ninfo','No','No'))+ti('e_ninfo_d','If yes — specify source...'))}
${sub('E36. Anthropometry — Children 0–5 Years')}
<div id="anthro-table-wrap" class="tbl-wrap"><table class="dt">
<tr><th>#</th><th>Sex</th><th>DOB</th><th>Ht(cm)</th><th>Wt(kg)</th><th>MUAC</th></tr>
${[1,2,3,4,5,6,7].map(i=>`<tr><td>${i}</td><td><select name="ea${i}s"><option value="">-</option><option>M</option><option>F</option></select></td><td><input type="date" name="ea${i}d"></td><td><input type="number" name="ea${i}h" min="30" max="130" step="0.1" placeholder="cm"></td><td><input type="number" name="ea${i}w" min="1" max="40" step="0.1" placeholder="kg"></td><td><input type="number" name="ea${i}m" min="5" max="30" step="0.1" placeholder="cm"></td></tr>`).join('')}
</table></div>
`,'#a04000','#ca6f1e');}

function bSecF(){return sec('Section F','HIV/AIDS',`
${fg(q('F1','Have you heard about HIV/AIDS?','req')+chips(radio('f_heard','Yes','Yes')+radio('f_heard','No','No'))+'<p class="info-note" id="hiv_no_note" style="display:none;color:var(--red);font-weight:600"> Respondent has NOT heard of HIV/AIDS — skip F2, go straight to F3. Flag for health education.</p>')}
${fg(q('F2','Where did you get HIV/AIDS information?')+`<p class="info-note" style="margin-bottom:6px">Only answer if Yes to F1 above</p>`+chips(cb('f_info','Health Centre','Health Centre')+cb('f_info','Health Worker','Health Worker')+cb('f_info','Church','Church')+cb('f_info','Workshops','Workshops')+cb('f_info','Media','Media')+cb('f_info','Other','Other')))}
${fg(q('F3','Aware of HIV screening?')+chips(radio('f_screen','Yes','Yes')+radio('f_screen','No','No')))}
${fg(q('F4','How is HIV transmitted?')+chips(cb('f_trans','Sex','Sex')+cb('f_trans','Blood transfusion','Blood transfusion')+cb('f_trans','Sharing needles/razors','Sharing needles/razors')+cb('f_trans','Mother to child','Mother to child')+cb('f_trans','Other','Other')))}
${fg(q('F5','How can HIV be prevented?')+chips(cb('f_prev','Condoms','Condoms')+cb('f_prev','ARVs (PMTCT)','ARVs (PMTCT)')+cb('f_prev','Abstinence','Abstinence')+cb('f_prev','Faithfulness','Faithfulness')+cb('f_prev','Other','Other')))}
${fg(q('F6','How is HIV treated?')+chips(cb('f_treat','Herbs','Herbs')+cb('f_treat','ARVs','ARVs')+cb('f_treat','Healthy diet','Healthy diet')+cb('f_treat','Other','Other')))}
${fg(q('F7','Awareness level (Interviewer assessment)')+chips(radio('f_aware','Poor','Poor')+radio('f_aware','Fair','Fair')+radio('f_aware','Good','Good')+radio('f_aware','Very good','Very good')))}
${fg(q('F8','Have you ever been tested for HIV?','req')+chips(radio('f_tested','Yes','Yes')+radio('f_tested','No','No')))}
${fg(q('F9','If Yes — date of last test')+`<input class="form-input" type="date" name="f_test_d">`)}
${fg(q('F10','Family member living with HIV?')+chips(radio('f_fam_hiv','Yes','Yes')+radio('f_fam_hiv','No','No')))}
${fg(q('F11','If Yes — on treatment?')+chips(radio('f_arv','Yes','Yes')+radio('f_arv','No','No')))}
${fg(q('F12','If not on treatment — reasons')+ta('f_arv_r','Explain reasons...'))}
${fg(q('F13','Institution visited when ill')+chips(cb('f_inst','Health Centre','Health Centre')+cb('f_inst','Herbalist','Herbalist')+cb('f_inst','Magician','Magician')+cb('f_inst','Religious Leader','Religious Leader')+cb('f_inst','Other','Other')))}
${fg(q('F14','Distance to nearest Govt Health Centre')+chips(radio('f_hc_d','< 1 km','< 1 km')+radio('f_hc_d','1–2 km','1–2 km')+radio('f_hc_d','2–3 km','2–3 km')+radio('f_hc_d','> 3 km','> 3 km')))}
${fg(q('F15','Waiting time at Health Centre')+chips(radio('f_wait','Immediately','Immediately')+radio('f_wait','~30 min','~30 min')+radio('f_wait','~1 hour','~1 hour')+radio('f_wait','> 1 hour','> 1 hour')))}
${fg(q('F16','Get all prescribed drugs?')+chips(radio('f_drugs','Always','Always')+radio('f_drugs','Often','Often')+radio('f_drugs','Rarely','Rarely')+radio('f_drugs','Never','Never')))}
${fg(q('F17','Do you pay for health services?')+chips(radio('f_pay','Yes','Yes')+radio('f_pay','No','No')))}
${fg(q('F18','Is cost affordable?')+chips(radio('f_afford','Yes','Yes')+radio('f_afford','No','No')))}
${fg(q('F19','Payment method')+chips(radio('f_pay_m','Cash','Cash')+radio('f_pay_m','SHA','SHA')+radio('f_pay_m','Private Insurance','Private Insurance')+radio('f_pay_m','Other','Other')))}
${fg(q('F20','Experience at health center')+ta('f_hc_exp','Describe experience (good or bad)...'))}
${fg(q('F21','Door-to-door outreach in community?')+chips(radio('f_out','Yes','Yes')+radio('f_out','No','No')))}
${fg(q('F22','If Yes — outreach frequency per month')+chips(radio('f_out_f','Once','Once')+radio('f_out_f','Twice','Twice')+radio('f_out_f','Thrice','Thrice')+radio('f_out_f','Every week','Every week')))}
${fg(q('F23','Quality of healthcare at nearest facility')+chips(radio('f_qual','Excellent','Excellent')+radio('f_qual','Good','Good')+radio('f_qual','Average','Average')+radio('f_qual','Poor','Poor')))}
${fg(q('F24','Other facilities used when unwell')+chips(cb('f_of','Sub-county Hospital','Sub-county Hosp.')+cb('f_of','County Hospital','County Hosp.')+cb('f_of','Chemist','Chemist')+cb('f_of','Dispensary','Dispensary')+cb('f_of','Other','Other')))}
`,'#154360','#1a5276');}

function bSecG(){
const dm=['Pouring or dumping','Pit','Burning','Compost pit','Animal feeds','Manure','Other'];
return sec('Section G','Sanitation & Waste Disposal',`
${sub('I. Waste Disposal Methods')}
<div class="tbl-wrap"><table class="dt">
<tr><th>Method</th><th colspan="2">Kitchen</th><th colspan="2">Farm</th><th colspan="2">General Litter</th></tr>
<tr><th></th><th>Solid</th><th>Liquid</th><th>Solid</th><th>Liquid</th><th>Solid</th><th>Liquid</th></tr>
${dm.map(m=>{const k=m.replace(/\s/g,'_').toLowerCase();return `<tr><td class="ltd">${m}</td>${['ks','kl','fs','fl','ls','ll'].map(s=>`<td><input type="checkbox" name="gw_${k}_${s}" style="width:18px;height:18px"></td>`).join('')}</tr>`;}).join('')}
</table></div>
${sub('II. Human Waste')}
${fg(q('G1','Do you have a pit latrine?','req')+chips(radio('g_latrine','Yes','Yes')+radio('g_latrine','No','No')))}
${fg(q('G2','Number of pit latrines')+chips(radio('g_lat_n','1','1')+radio('g_lat_n','2–3','2–3')+radio('g_lat_n','More than 3','More than 3')))}
${fg(q('G3','How often is latrine used?')+chips(radio('g_lat_u','Always','Always')+radio('g_lat_u','Sometimes','Sometimes')+radio('g_lat_u','Rarely','Rarely')+radio('g_lat_u','Not at all','Not at all')))}
${fg(q('G4','If not used — alternative')+chips(radio('g_alt','Flying toilet','Flying toilet')+radio('g_alt','Bush','Bush')+radio('g_alt','Into water source','Into water source')+radio('g_alt','Other','Other')))}
${fg(q('G5','Latrine distance from homestead')+chips(radio('g_lat_d','< 10 m','< 10 m')+radio('g_lat_d','> 10 m','> 10 m')))}
${fg(q('G6','Latrine distance from water source')+chips(radio('g_lat_wd','< 30 m','< 30 m')+radio('g_lat_wd','> 30 m','> 30 m')+radio('g_lat_wd','Cannot tell','Cannot tell')))}
${fg(q('G7','Position of latrine from water source')+chips(radio('g_lat_p','Downhill','Downhill')+radio('g_lat_p','Same level','Same level')+radio('g_lat_p','Uphill','Uphill')))}
${fg(q('G8','Latrine structure')+chips(radio('g_lat_s','Permanent (cement)','Permanent')+radio('g_lat_s','Semi-permanent','Semi-permanent')))}
${fg(q('G9','Latrine cleaning method')+chips(cb('g_lat_c','Chemicals','Chemicals')+cb('g_lat_c','Ash','Ash')+cb('g_lat_c','Other','Other')))}
${fg(q('G10','Taboos around sharing latrines?')+chips(radio('g_lat_t','Yes','Yes')+radio('g_lat_t','No','No'))+ti('g_lat_td','If yes — specify...'))}
${fg(q('G11','General compound cleanliness (Observe)')+chips(radio('g_comp','Well-kept','Well-kept')+radio('g_comp','Marshy','Marshy')+radio('g_comp','Bushy','Bushy')+radio('g_comp','Littered','Littered')))}
${sub('III. Hygiene Practices')}
${fg(q('H1','Wash fruits before eating?')+chips(radio('g_wfruit','Yes','Yes')+radio('g_wfruit','No','No')))}
${fg(q('H2','Wash vegetables before cooking?')+chips(radio('g_wveg','Yes','Yes')+radio('g_wveg','No','No')))}
${fg(q('H3a','Wash hands before eating?')+chips(radio('g_heat','Yes','Yes')+radio('g_heat','No','No')))}
${fg(q('H3b','Wash hands before food prep?')+chips(radio('g_hcook','Yes','Yes')+radio('g_hcook','No','No')))}
${fg(q('H3c','Wash hands after toilet?')+chips(radio('g_htoil','Yes','Yes')+radio('g_htoil','No','No')))}
${fg(q('H4','Teeth brushing frequency per day')+chips(radio('g_brush','Never','Never')+radio('g_brush','Once','Once')+radio('g_brush','Twice','Twice')+radio('g_brush','More than twice','More than twice')))}
${fg(q('H5','Ever had oral health problems?')+chips(radio('g_oral','Yes','Yes')+radio('g_oral','No','No')))}
${fg(q('H6','If Yes — what was done?')+chips(radio('g_oral_a','Dental clinic','Dental clinic')+radio('g_oral_a','Herbs','Herbs')+radio('g_oral_a','Other','Other')))}
${fg(q('H7','Dental check-up frequency per year')+chips(radio('g_dent','Never','Never')+radio('g_dent','Once','Once')+radio('g_dent','Twice','Twice')+radio('g_dent','More than twice','More than twice')))}
`,'#0e6655','#148f77');}

function bSecH(){return sec('Section H','Environment & Water Supply',`
${fg(q('H1','Source of water','req')+chips(cb('h_wsrc','Spring','Spring')+cb('h_wsrc','River','River')+cb('h_wsrc','Well','Well')+cb('h_wsrc','Borehole','Borehole')+cb('h_wsrc','Lake','Lake')+cb('h_wsrc','Rain water','Rain water')+cb('h_wsrc','Other','Other')))}
${fg(q('H2','Distance to water source')+chips(radio('h_wdist','0–50 m','0–50 m')+radio('h_wdist','50–200 m','50–200 m')+radio('h_wdist','200–500 m','200–500 m')+radio('h_wdist','500 m–1 km','500 m–1 km')+radio('h_wdist','> 1 km','> 1 km')))}
${fg(q('H3','Is water source protected?')+chips(radio('h_wprot','Yes','Yes')+radio('h_wprot','No','No')))}
${fg(q('H4','Water storage method')+chips(cb('h_wstore','Drums','Drums')+cb('h_wstore','Buckets','Buckets')+cb('h_wstore','Tanks','Tanks')+cb('h_wstore','Pots/sufurias','Pots/sufurias')+cb('h_wstore','Other','Other')))}
${fg(q('H5','Containers for transporting water')+chips(cb('h_wtrans','Jerricans','Jerricans')+cb('h_wtrans','Buckets','Buckets')+cb('h_wtrans','Earthen pots','Earthen pots')+cb('h_wtrans','Other','Other')))}
${fg(q('H6','Do you treat water?','req')+chips(radio('h_treat','Yes','Yes')+radio('h_treat','No','No')))}
${fg(q('H7','Treatment method')+chips(cb('h_tm','Filtration','Filtration')+cb('h_tm','Boiling','Boiling')+cb('h_tm','Chlorination','Chlorination')+cb('h_tm','Sedimentation','Sedimentation')+cb('h_tm','Other','Other')))}
${fg(q('H8','Distance of water source from latrine')+chips(radio('h_wld','0–5 m','0–5 m')+radio('h_wld','5–10 m','5–10 m')+radio('h_wld','10–50 m','10–50 m')+radio('h_wld','50–100 m','50–100 m')+radio('h_wld','> 100 m','> 100 m')))}
${fg(q('H9','Garbage disposal method')+chips(cb('h_garb','Burning','Burning')+cb('h_garb','Open disposal','Open disposal')+cb('h_garb','Burying','Burying')+cb('h_garb','Landfill','Landfill')+cb('h_garb','Other','Other')))}
${fg(q('H10','Causes of air pollution')+chips(cb('h_air','None','None')+cb('h_air','Dust','Dust')+cb('h_air','Noise','Noise')+cb('h_air','Other','Other'))+ti('h_air_o','Specify other...'))}
${fg(q('H11','Causes of water pollution')+chips(cb('h_wp','None','None')+cb('h_wp','Domestic waste','Domestic waste')+cb('h_wp','Agrochemicals','Agrochemicals')+cb('h_wp','Other','Other')))}
${fg(q('H12','Causes of soil pollution')+chips(cb('h_sp','None','None')+cb('h_sp','General litter','General litter')+cb('h_sp','Human waste','Human waste')+cb('h_sp','Other','Other')))}
`,'#1a237e','#283593');}

function bSecI(){return sec('Section I','Cultural Practices & Traditions',`
${sub('Rites of Passage')}
${fg(q('I1','Rite of passage in community')+chips(radio('i_rite','Circumcision','Circumcision')+radio('i_rite','Removal of teeth','Removal of teeth')+radio('i_rite','Other','Other'))+ti('i_rite_o','Other — specify...'))}
${fg(q('I2','If circumcision — for whom?')+chips(radio('i_circ','Male','Male')+radio('i_circ','Female','Female')+radio('i_circ','Both','Both')))}
${fg(q('I3','Age when rite is conducted')+ti('i_age','Specify age or range...'))}
${fg(q('I4','Where is circumcision conducted?')+chips(radio('i_circ_w','Home','Home')+radio('i_circ_w','Health Centre','Health Centre')))}
${fg(q('I5','Education given during rite of passage?')+chips(radio('i_edu','Yes','Yes')+radio('i_edu','No','No')))}
${fg(q('I6','Education content')+chips(cb('i_edu_c','Cultural values','Cultural values')+cb('i_edu_c','Sex education','Sex education')+cb('i_edu_c','Drugs/substances','Drugs/substances')+cb('i_edu_c','Other','Other')))}
${sub('Marriage')}
${fg(q('I7','Type of marriage practiced')+chips(radio('i_mar','Religious','Religious')+radio('i_mar','Traditional','Traditional')+radio('i_mar','Cohabiting','Cohabiting')))}
${fg(q('I8','Form of marriage')+chips(radio('i_mar_f','Monogamous','Monogamous')+radio('i_mar_f','Polygamous','Polygamous')))}
${fg(q('I9','Is wife inheritance practiced?')+chips(radio('i_winh','Yes','Yes')+radio('i_winh','No','No')))}
${fg(q('I10','If Yes — how done?')+chips(radio('i_winh_h','By brothers','By brothers')+radio('i_winh_h','Church member','Church member')+radio('i_winh_h','Other','Other')))}
${fg(q('I11','Benefits of wife inheritance')+chips(cb('i_winh_b','Financial','Financial')+cb('i_winh_b','Emotional','Emotional')+cb('i_winh_b','Social stability','Social stability')+cb('i_winh_b','Other','Other')))}
${fg(q('I12','Negative implications of wife inheritance')+chips(cb('i_winh_n','Social instability','Social instability')+cb('i_winh_n','Economic exploitation','Economic exploitation')+cb('i_winh_n','Disease transmission','Disease transmission')+cb('i_winh_n','Other','Other')))}
${fg(q('I13','Rituals after childbirth?')+chips(radio('i_birth','Yes','Yes')+radio('i_birth','No','No'))+ti('i_birth_d','If yes — specify...'))}
${fg(q('I14','Rituals after death?')+chips(radio('i_death','Yes','Yes')+radio('i_death','No','No'))+ti('i_death_d','If yes — specify...'))}
${fg(q('I15','How are burials conducted?')+chips(radio('i_bur','Traditionally','Traditionally')+radio('i_bur','Religiously','Religiously')+radio('i_bur','Other','Other'))+ti('i_bur_o','Other — specify...'))}
`,'#4a235a','#6c3483');}

function bSecJ(){
const dis=['Diarrhoeal diseases','Malaria','Organophosphate poisoning','Upper Respiratory Tract Infections','Eye infections','Tuberculosis','Common Cold','Pneumonia','Skin infections','STIs','Malnutrition','Jiggers','Intestinal worms','Others'];
return sec('Section J','Common Health Problems in Community',`
<p class="info-note" style="margin-bottom:10px">Tick all diseases commonly affecting children and/or adults in this community.</p>
<div class="tbl-wrap"><table class="dt">
<tr><th>Disease / Condition</th><th>Children</th><th>Adults</th></tr>
${dis.map(d=>{const k=d.replace(/[\s\/\(\)&]/g,'_').toLowerCase();return `<tr><td class="ltd">${d}</td><td><input type="checkbox" name="j_${k}_c" value="Yes" style="width:20px;height:20px"></td><td><input type="checkbox" name="j_${k}_a" value="Yes" style="width:20px;height:20px"></td></tr>`;}).join('')}
</table></div>
${fg(q('J_other','Other health problems not listed')+ta('j_other','List any other diseases in this community...'))}
`,'#7b241c','#943126');}

function bSecK(){
const pests=['Rats','Cockroaches','Bedbugs','Houseflies','Ticks','Jiggers','Mosquitoes','Fleas','Tsetse flies','Others'];
return sec('Section K','Pests & Vectors',`
<p class="info-note" style="margin-bottom:8px">Observe and record presence/absence and control methods used.</p>
<div class="tbl-wrap"><table class="dt">
<tr><th>Pest / Vector</th><th>Present</th><th>Absent</th><th>Control Method</th></tr>
${pests.map(p=>{const k=p.replace(/\s/g,'_').toLowerCase();return `<tr><td class="ltd">${p}</td><td><input type="radio" name="k_${k}" value="Present" style="width:18px;height:18px"></td><td><input type="radio" name="k_${k}" value="Absent" style="width:18px;height:18px"></td><td><input type="text" name="k_${k}_c" placeholder="Method..."></td></tr>`;}).join('')}
</table></div>
${fg(q('K_notes','Interviewer Observations & Notes')+ta('k_notes','Record any additional observations about the household, environment, or health conditions observed...'))}
`,'#4d5a27','#6b7a34');}

function bSecL(){
return sec('Section L','Interviewer Challenges & Field Observations',`
<p class="info-note" style="margin-bottom:12px">Record any challenges or key observations from this interview. All fields are optional — fill as many as needed.</p>
${[1,2,3,4,5,6,7,8,9,10].map(n=>`
<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
  <div style="min-width:26px;height:26px;background:linear-gradient(135deg,#4d5a27,#6b7a34);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.75rem;font-weight:800;flex-shrink:0;margin-top:2px;">${n}</div>
  <input type="text" name="l_challenge_${n}" placeholder="Challenge / observation ${n}..."
    style="flex:1;padding:10px 13px;border:1.5px solid rgba(255,255,255,.15);border-radius:10px;background:rgba(255,255,255,.07);color:#fff;font-family:inherit;font-size:0.84rem;outline:none;"
    onfocus="this.style.borderColor='rgba(107,122,52,.8)'"
    onblur="this.style.borderColor='rgba(255,255,255,.15)'">
</div>`).join('')}
<div style="margin-top:6px">
${fg(q('L_summary','Overall Interview Summary')+ta('l_summary','Summarise the overall health situation of this household in 2–3 sentences...'))}
</div>
`,'#3d4a1e','#4d5a27');}

const BUILDERS=[bConsent,bSecA,bSecB,bSecC,bSecD,bSecE,bSecF,bSecG,bSecH,bSecI,bSecJ,bSecK,bSecL];

function init(){
  ls();
  const w=document.getElementById('secsWrap');
  BUILDERS.forEach((fn,i)=>{
    const d=document.createElement('div');
    d.className='sec-card'+(i===0?' active':'');
    d.setAttribute('data-sec', String(i+1));
    d.innerHTML=fn();
    w.appendChild(d);
  });
  // Start with a fresh blank record but keep all existing saved records.
  // ls() already loaded recs from localStorage above — just add the new entry.
  // Do NOT call ls() again here; that would discard the already-loaded recs object.
  recId = generateRecordId();
  recs[recId] = {_c: new Date().toLocaleString(), _u: new Date().toLocaleString()};
  ss(); // writes all existing records + new blank one back to localStorage
  updUI();renDrw();
  MSS_initTickers();
  MSS_syncChips(document);
  // Fill interviewer name now that the consent card DOM exists
  const name=getUserName();
  if(name) fillInterviewerFields(name);
  setTimeout(() => runSectionRules(cur), 100);
  // Load villages for the dropdown (institution-specific)
  _loadVillageDropdown();
}
document.addEventListener('DOMContentLoaded',init);

// ── VILLAGE DROPDOWN LOADER ──────────────────────────────────────────────────
async function _loadVillageDropdown() {
  const sel  = document.getElementById('interview_location_input');
  const hint = document.getElementById('village-load-hint');
  if (!sel) return;

  // Get institution_id from session
  let institution_id = '';
  try {
    const sess = (typeof authGetSession === 'function') ? authGetSession() : null;
    institution_id = (sess && (sess.institution_id || sess.institutionId)) || '';
    if (!institution_id) {
      // fallback: try localStorage
      const raw = localStorage.getItem('chsa_session') || localStorage.getItem('chsa_auth') || '{}';
      const s = JSON.parse(raw);
      institution_id = s.institution_id || s.institutionId || '';
    }
  } catch (_) {}

  if (!institution_id) {
    if (hint) hint.textContent = 'Could not determine institution. Contact admin.';
    return;
  }

  try {
    // Fetch village_list via the JWT-authenticated profile API.
    // village_list is the canonical jsonb column; village is a legacy plain-text fallback.
    let villages = [];

    // Zero-th try: session cache written at login — instant, works offline
    try {
      const _s = (typeof authGetSession === 'function') ? authGetSession() : null;
      if (Array.isArray(_s?.village_list) && _s.village_list.length) villages = _s.village_list;
    } catch (_) {}

    // First try: profile API (requires HS to be loaded)
    if (!villages.length && window.HS && window.HS.HSAdmin && window.HS.HSAdmin.getInstitutionProfile) {
      try {
        const prof = await window.HS.HSAdmin.getInstitutionProfile(institution_id);
        if (Array.isArray(prof?.village_list) && prof.village_list.length) {
          villages = prof.village_list;
        } else if (typeof prof?.village === 'string' && prof.village.trim()) {
          villages = prof.village.split(',').map(v => v.trim()).filter(Boolean);
        }
      } catch (_) { /* fall through */ }
    }

    // Second try: raw fetch in case HS is not yet initialised
    if (!villages.length) {
      const token = localStorage.getItem('hs_jwt_token')
                 || (() => { try { return JSON.parse(localStorage.getItem('chsa_session')||'{}').token||''; } catch { return ''; } })()
                 || (() => { try { return JSON.parse(localStorage.getItem('chsa_auth')||'{}').token||''; } catch { return ''; } })();
      const res = await fetch(
        `/api/admin/profile?institution_id=${encodeURIComponent(institution_id)}`,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body?.village_list) && body.village_list.length) {
          villages = body.village_list;
        } else if (typeof body?.village === 'string' && body.village.trim()) {
          villages = body.village.split(',').map(v => v.trim()).filter(Boolean);
        }
      }
    }

    // Clear and repopulate
    sel.innerHTML = '<option value="">— Select village —</option>';
    villages.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });

    if (hint) {
      hint.textContent = villages.length
        ? `${villages.length} village${villages.length > 1 ? 's' : ''} available`
        : 'No villages set up yet — contact your institution admin.';
    }
  } catch (err) {
    console.warn('[village dropdown]', err);
    if (hint) hint.textContent = 'Could not load villages — check connection.';
  }
}


// 

//  KEYBOARD-PROOF BOTTOM NAV 
(function(){
  var nav=document.querySelector('.bot-nav');
  if(!nav)return;
  var ih=window.innerHeight;
  window.addEventListener('resize',function(){
    nav.style.transform=window.innerHeight<ih*0.75?'translateY(200%)':'translateZ(0)';
  });
  document.addEventListener('focusout',function(){
    setTimeout(function(){nav.style.transform='translateZ(0)';},150);
  });
})();

// 
//  CORRECTION NOTIFICATIONS — interviewer side
//  Called from showHomePage in survey-auth.js after login.
//  Fetches any records the admin has flagged for this user
//  and shows a prompt with the exact error messages.
// 
async function checkCorrectionNotifications(){
  try{
    var name = localStorage.getItem('chsa_user_name');
    if(!name) return;
    var nameEncoded = encodeURIComponent(name.trim());
    var token = localStorage.getItem('hs_jwt_token') || sessionStorage.getItem('hs_jwt_token') || '';
    var apiBase = window.HS_API_BASE || '';
    var headers = {'Content-Type':'application/json'};
    if(token) headers['Authorization'] = 'Bearer '+token;
    var res = await fetch(
      apiBase+'/api/survey/mine?needs_correction=true&interviewer='+nameEncoded,
      {headers:headers}
    );
    if(!res.ok) return;
    var flagged = await res.json();
    if(!Array.isArray(flagged)||!flagged.length) return;
    // Exact name match — ilike can be too loose and pull other people's records
    var nameLower = name.trim().toLowerCase();
    flagged = flagged.filter(function(r){
      return r.interviewer && r.interviewer.trim().toLowerCase() === nameLower;
    });
    if(!flagged.length) return;
    // Only show date/location correction notes — ignore any old or unrelated flags
    flagged = flagged.map(function(r){
      var relevantNotes = (r.correction_notes||'').split('|').map(function(n){ return n.trim(); }).filter(function(n){
        return n && (
          n.toLowerCase().includes('date') ||
          n.toLowerCase().includes('location')
        );
      }).join(' | ');
      return Object.assign({}, r, {correction_notes: relevantNotes});
    }).filter(function(r){ return r.correction_notes; });
    if(!flagged.length) return;
    showCorrectionPrompt(flagged);
  }catch(e){
    console.warn('Correction check failed:',e);
  }
}

function showCorrectionPrompt(records){
  document.getElementById('correction-prompt')?.remove();
  var items = records.map(function(r){
    return '<div style="background:#fff3f3;border:1px solid #e57373;border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:0.78rem;line-height:1.6">'+
      '<strong> '+(r.interview_date||'Unknown date')+' &nbsp;·&nbsp;  '+(r.location||'Unknown location')+'</strong><br>'+
      '<span style="color:#c62828">'+(r.correction_notes||'Admin has flagged this record — please re-open and correct it.')+'</span>'+
    '</div>';
  }).join('');
  var el = document.createElement('div');
  el.id = 'correction-prompt';
  el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;'+
    'background:linear-gradient(135deg,#b71c1c,#c0392b);color:#fff;'+
    'padding:16px 18px 22px;border-radius:18px 18px 0 0;'+
    'box-shadow:0 -4px 24px rgba(0,0,0,.3);font-family:inherit;'+
    'max-height:65vh;overflow-y:auto;';
  el.innerHTML =
    '<div style="font-size:1rem;font-weight:800;margin-bottom:3px"> Admin: Correction Required</div>'+
    '<div style="font-size:0.74rem;opacity:.85;margin-bottom:12px">'+records.length+' of your record(s) have been flagged and must be corrected.</div>'+
    items+
    '<div style="display:flex;gap:10px;margin-top:14px">'+
      '<button onclick="document.getElementById(\'correction-prompt\').remove()" '+
        'style="flex:1;padding:10px;background:rgba(255,255,255,.15);color:#fff;border:1.5px solid rgba(255,255,255,.4);border-radius:10px;font-weight:700;font-size:.8rem;cursor:pointer;font-family:inherit">'+
        ' Dismiss'+
      '</button>'+
      '<button onclick="document.getElementById(\'correction-prompt\').remove();if(typeof showScreen===\'function\')showScreen(\'list\')" '+
        'style="flex:2;padding:10px;background:#fff;color:#c0392b;border:none;border-radius:10px;font-weight:800;font-size:.8rem;cursor:pointer;font-family:inherit">'+
        ' Go to My Records'+
      '</button>'+
    '</div>';
  document.body.appendChild(el);
}

// ── Student FAB ──
(function () {
  'use strict';
  var fab, fabTimer;

  function collapse() {
    if (!fab) return;
    fab.classList.remove('fab-active');
    fab.classList.add('fab-inactive');
  }

  function initFab() {
    fab = document.getElementById('fab-container');
    var fabMain = document.getElementById('fab-main');
    if (!fab || !fabMain) return;

    // Global helpers — called by newRec, loadRec, and survey-auth.js (homeGoSurvey)
    window.fabShow = function () {
      fab.classList.add('fab-visible');
    };
    window.fabHide = function () {
      fab.classList.remove('fab-visible', 'fab-active');
      fab.classList.add('fab-inactive');
    };

    // If survey screen is already visible on load (returning user skips home page),
    // show the FAB immediately instead of waiting for a nav event.
    setTimeout(function () {
      var surveyWrap = document.getElementById('survey-wrap');
      if (surveyWrap && surveyWrap.style.display !== 'none' && surveyWrap.style.display !== '') {
        window.fabShow();
      }
    }, 800);

    fabMain.addEventListener('click', function () {
      var open = fab.classList.contains('fab-active');
      fab.classList.toggle('fab-active',  !open);
      fab.classList.toggle('fab-inactive', open);
      clearTimeout(fabTimer);
      if (!open) fabTimer = setTimeout(collapse, 4000);
    });

    document.getElementById('btn-fab-save').addEventListener('click', function () {
      saveCur();
      showToast('✅ Progress saved');
      collapse();
    });

    document.getElementById('btn-fab-sync').addEventListener('click', function () {
      collapse();
      if (typeof openSyncModal === 'function') openSyncModal();
      else if (typeof syncAll === 'function') syncAll();
    });

    document.getElementById('btn-fab-restore').addEventListener('click', function () {
      collapse();
      openRestoreModal();
    });
  }

  window.openRestoreModal = function () {
    var modal  = document.getElementById('restore-modal');
    var status = document.getElementById('restore-status');
    var list   = document.getElementById('restore-list');
    modal.style.display = 'flex';
    list.innerHTML = '';
    status.textContent = 'Fetching your records from server\u2026';

    var userName = localStorage.getItem('chsa_user_name');
    if (!userName) { status.textContent = 'Not logged in.'; return; }
    if (!navigator.onLine) { status.textContent = 'You are offline \u2014 connect to restore records.'; return; }

    // Use secure API layer if HS_API_BASE is configured, otherwise fall back to direct Supabase
    var apiBase = window.HS_API_BASE || '';
    var token = localStorage.getItem('hs_jwt_token') || sessionStorage.getItem('hs_jwt_token') || '';
    var fetchPromise;
    if (apiBase) {
      // Use query param so the backend doesn't confuse "my-records" with a UUID record id
      fetchPromise = fetch(apiBase + '/api/survey/mine', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        }
      });
    } else {
      var table = window.SYNC_TABLE || 'health_surveys';
      fetchPromise = fetch(window.SUPABASE_URL + '/rest/v1/' + table +
        '?interviewer=ilike.' + encodeURIComponent(userName.trim()) +
        '&select=*&order=interview_date.desc&limit=50', {
        headers: { apikey: window.SUPABASE_KEY, Authorization: 'Bearer ' + window.SUPABASE_KEY }
      });
    }

    fetchPromise
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) {
        status.textContent = 'No records found on the server for "' + userName + '".';
        return;
      }
      var nameLower = userName.trim().toLowerCase();
      rows = rows.filter(function (r) {
        return r.interviewer && r.interviewer.trim().toLowerCase() === nameLower;
      });
      if (!rows.length) { status.textContent = 'No matching records found.'; return; }

      status.textContent = rows.length + ' record(s) — tap one to load it back into the form.';

      rows.forEach(function (row) {
        var card = document.createElement('button');
        card.style.cssText = 'display:block;width:100%;text-align:left;padding:13px 15px;margin-bottom:9px;background:#f0f6ff;border:1.5px solid #c5d9f7;border-radius:13px;font-family:inherit;cursor:pointer;';
        card.innerHTML =
          '<div style="font-weight:800;color:#0d3b66;font-size:.9rem">📋 ' + (row.interview_date || 'Unknown date') + '</div>' +
          '<div style="font-size:.74rem;color:#5d7a8a;margin-top:3px">📍 ' + (row.location || 'Unknown location') + '</div>';

        card.addEventListener('click', function () {
          // detect which column holds the full form JSON
          var dataKeys = ['data','record_data','form_data','payload','raw'];
          var formData = null;
          for (var i = 0; i < dataKeys.length; i++) {
            var v = row[dataKeys[i]];
            if (v && typeof v === 'object') { formData = v; break; }
            if (v && typeof v === 'string') {
              try { formData = JSON.parse(v); break; } catch(e){}
            }
          }
          // fallback: use all non-meta columns as the form data
          if (!formData) {
            var skip = ['id','created_at','updated_at','synced_at','needs_correction','correction_notes','_synced','record_id'];
            formData = {};
            Object.keys(row).forEach(function (k) { if (skip.indexOf(k) === -1) formData[k] = row[k]; });
          }

          if (typeof loadInto === 'function') {
            if (row.record_id) recId = row.record_id;
            loadInto(formData);
            pRec(formData); // save back to localStorage for offline use
            closeRestoreModal();
            showToast('📥 Record restored — continue filling it in');
          }
        });
        list.appendChild(card);
      });
    })
    .catch(function (err) {
      status.textContent = 'Could not reach server. Check connection. (' + err.message + ')';
    });
  };

  window.closeRestoreModal = function () {
    document.getElementById('restore-modal').style.display = 'none';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFab);
  } else {
    initFab();
  }
})();
