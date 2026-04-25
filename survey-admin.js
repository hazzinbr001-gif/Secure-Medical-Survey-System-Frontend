
// 
// CENTRALIZED ERROR HANDLER
// 
window._mssErrors = [];
function mssHandleError(context, err, silent) {
  const entry = { context, message: err?.message || String(err), time: new Date().toISOString(), stack: err?.stack };
  window._mssErrors.push(entry);
  if (window._mssErrors.length > 50) window._mssErrors.shift(); // keep last 50
  console.error('[MSS]', context, err);
  if (!silent && typeof showToast === 'function') {
    showToast('Error: ' + (err?.message || 'Unknown error'), true);
  }
}
window.addEventListener('unhandledrejection', function(e) {
  mssHandleError('UnhandledPromise', e.reason, false);
});

/* Community Health Survey — Admin Panel © 2026 HazzinBR */

// 
//  ADMIN GATE — 8 taps on logo
// 
//  SECURITY: Change ADMIN_PW before deploying. Do not commit the real password to a public repo.
//  SECURITY: Admin gate password is NEVER stored in frontend code.
// It is retrieved only from localStorage after set by super admin via backend.
// Default: force super admin to set it first.
const ADMIN_PW_PLACEHOLDER = '__NOT_SET__';
let _tapCount=0, _tapTimer=null, _gateAttempts=0;

function adminTap(){
  var isAdminBypass = localStorage.getItem('chsa_is_admin_bypass')==='1';
  var alreadyVerified = sessionStorage.getItem('adm_ok')==='1';
  if(!isAdminBypass && !alreadyVerified){
    showToast('Admin access restricted', true); return;
  }
  if(isAdminBypass){ if(typeof openAdminDash==='function') openAdminDash(); return; }
  _tapCount++;
  clearTimeout(_tapTimer);
  if(_tapCount>=8){ _tapCount=0; openAdminGate(); }
  else{ _tapTimer=setTimeout(()=>_tapCount=0,3000); }
}function openAdminGate(){
  if(sessionStorage.getItem('adm_ok')==='1'){ openAdminDash(); return; }
  showScreen('gate');
  setTimeout(()=>document.getElementById('gate-pass')?.focus(),200);
}
function closeAdminGate(){
  if(typeof showHomePage==='function') showHomePage();
}
function checkGate(){
  const entered = (document.getElementById('gate-pass').value || '').trim();
  const pw = localStorage.getItem('chsa_admin_pass') || ADMIN_PW_PLACEHOLDER;

  // Lockout: prevent brute force
  const lockKey = 'chsa_gate_lock';
  const lockUntil = parseInt(localStorage.getItem(lockKey) || '0');
  if (Date.now() < lockUntil) {
    const secs = Math.ceil((lockUntil - Date.now()) / 1000);
    document.getElementById('gate-err').textContent = ' Too many attempts. Wait ' + secs + 's';
    return;
  }

  if (pw === ADMIN_PW_PLACEHOLDER || !pw) {
    document.getElementById('gate-err').textContent = ' Admin password not configured. Contact super admin.';
    return;
  }
  if (!entered) {
    document.getElementById('gate-err').textContent = ' Enter password';
    return;
  }

  if (entered === pw) {
    _gateAttempts = 0;
    localStorage.removeItem('chsa_gate_lock');
    sessionStorage.setItem('adm_ok', '1');
    document.getElementById('gate-pass').value = '';
    closeAdminGate(); openAdminDash();
  } else {
    _gateAttempts++;
    if (_gateAttempts >= 5) {
      const lockDuration = Math.min(30000 * Math.pow(2, _gateAttempts - 5), 300000); // exponential up to 5min
      localStorage.setItem(lockKey, String(Date.now() + lockDuration));
      document.getElementById('gate-err').textContent = ' Too many attempts. Locked for ' + Math.ceil(lockDuration/1000) + 's';
      setTimeout(closeAdminGate, 1000);
      _gateAttempts = 0;
    } else {
      document.getElementById('gate-err').textContent = _gateAttempts >= 3 ? ' ' + (5 - _gateAttempts) + ' attempts remaining' : ' Wrong password';
    }
    document.getElementById('gate-pass').value = '';
  }
}
//  Admin debug/logging helper 
const admDebug = {
  log: (msg, data) => console.log('[ADMIN]', msg, data || ''),
  warn: (msg, data) => console.warn('[ADMIN]', msg, data || ''),
  error: (msg, err) => {
    console.error('[ADMIN ERROR]', msg, err || '');
    if (typeof showToast === 'function') showToast('Admin error: ' + msg, true);
  },
};

function _wireAdminButton(id, handler) {
  const btn = document.getElementById(id);
  if (!btn) { admDebug.warn('Button not found: ' + id); return; }
  // Remove previous listener to avoid stacking
  if (btn._admHandler) btn.removeEventListener('click', btn._admHandler);
  btn._admHandler = function(e) {
    e.preventDefault();
    try {
      if (typeof handler !== 'function') throw new Error('Handler missing: ' + id);
      handler();
    } catch(err) {
      mssHandleError('AdminButton:' + id, err, false);
    }
  };
  btn.addEventListener('click', btn._admHandler);
}

function _updateAdminCloseButton() {
  const closeBtn = document.querySelector('.adm-close');
  if (!closeBtn) { admDebug.warn('Close button (.adm-close) not found'); return; }
  if (closeBtn._admCloseHandler) closeBtn.removeEventListener('click', closeBtn._admCloseHandler);
  const isBypass = localStorage.getItem('chsa_is_admin_bypass') === '1';
  var isInstAdm = localStorage.getItem('chsa_is_inst_admin')==='1';
  if (isBypass) {
    closeBtn.textContent = '⏻ Sign Out';
    closeBtn._admCloseHandler = function(){ if(typeof authSignOut==='function') authSignOut(); };
  } else if (isInstAdm) {
    closeBtn.textContent = ' Close';
    closeBtn._admCloseHandler = function(){
      var overlay = document.getElementById('admin-overlay');
      if(overlay) overlay.style.display = 'none';
      if(typeof showInstAdminHome==='function') showInstAdminHome();
    };
  } else {
    closeBtn.textContent = ' Close';
    closeBtn._admCloseHandler = closeAdmin;
  }
  closeBtn.addEventListener('click', closeBtn._admCloseHandler);
}

function openAdminDash(){
  showScreen('admin');
  // Wire report buttons with error-safe handlers
  _wireAdminButton('btn-ind-reports', function(){ openAllInterviewerReports(); });
  _wireAdminButton('btn-grp-report',  function(){ openGroupReport(); });
  // Update close button
  _updateAdminCloseButton();
  admLoad();
}
function closeAdmin(){
  // Always hide admin overlay first
  var overlay = document.getElementById('admin-overlay');
  if(overlay) overlay.style.display = 'none';

  var isBypass   = localStorage.getItem('chsa_is_admin_bypass')==='1';
  var isInstAdm  = localStorage.getItem('chsa_is_inst_admin')==='1';
  var role       = '';
  try{ var s=JSON.parse(localStorage.getItem('chsa_session')||'{}'); role=s.role||''; }catch(e){}

  if(isBypass || role==='super_admin'){
    // Super admin → go to super admin dashboard
    if(typeof initSuperAdminDashboard==='function') initSuperAdminDashboard();
    else { if(overlay) overlay.style.display='block'; }
  } else if(isInstAdm || role==='institution_admin'){
    // Institution admin → return to their dashboard
    if(typeof showInstAdminHome==='function') showInstAdminHome();
  } else {
    // Student enumerator → go back to home
    if(typeof showScreen==='function') showScreen('home');
    if(typeof goBackHome==='function') goBackHome();
  }
}

// 
//  ADMIN DATA
// 
// _admRecs declared globally in survey-sync.js
_admRecs=[]; _admFilter='all'; _admDetail=null; _admDetailIdx=-1;
const _admToday=new Date().toISOString().split('T')[0];
const SURVEY_START_DATE='2026-03-23';
const PIE_COLS=['#4CAF72','#1a4f6e','#f39c12','#c0392b','#8e44ad','#16a085','#d35400','#2980b9'];

function admSetConn(s){
  const dot=document.getElementById('adm-conn-dot');
  const txt=document.getElementById('adm-conn-txt');
  const cols={ok:'#4CAF72',error:'#c0392b',loading:'#f39c12',offline:'#888'};
  if(dot) dot.style.background=cols[s]||'#f39c12';
  const count=Array.isArray(_admRecs)?_admRecs.length:0;
  if(txt){
    if(s==='ok')      txt.textContent=count+' record'+(count!==1?'s':'');
    else if(s==='loading') txt.textContent=count?count+' records (updating…)':'Loading…';
    else if(s==='offline') txt.textContent=count+' records (offline cache)';
    else if(s==='error')   txt.textContent='Connection error';
    else txt.textContent='Loading…';
  }
}

function _toTitleCase(str){
  return (str||'').trim().toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();});
}

function _admEnrich(recs){
  if(!Array.isArray(_admStudents)||!_admStudents.length) return;
  recs.forEach(function(rec){
    // Normalize interviewer name to Title Case in memory
    if(rec.interviewer) rec.interviewer = _toTitleCase(rec.interviewer);
    if(!rec.interviewer||rec.interviewer.includes(' ')) return;
    // Upgrade first-name-only to full name
    const fn=rec.interviewer.toLowerCase();
    const match=_admStudents.find(function(s){
      return s.full_name&&s.full_name.trim().toLowerCase().startsWith(fn+' ');
    });
    if(match) rec.interviewer=_toTitleCase(match.full_name);
  });
  // Also normalize student names
  _admStudents.forEach(function(s){
    if(s.full_name) s.full_name = _toTitleCase(s.full_name);
  });
}

function _admSaveCache(recs){
  try{ localStorage.setItem('chsa_adm_cache', JSON.stringify({ts:Date.now(),recs:recs})); }catch(e){}
}

function _admLoadCache(){
  try{
    const raw=localStorage.getItem('chsa_adm_cache');
    if(!raw) return null;
    const obj=JSON.parse(raw);
    // Cache valid for 5 minutes
    if(Date.now()-obj.ts < 5*60*1000) return obj.recs;
  }catch(e){}
  return null;
}

function admLoad(){
  //  Step 1: Show cached data instantly 
  const cached = _admLoadCache();
  if(cached && cached.length){
    _admRecs = cached;
    _admEnrich(_admRecs);
    admSetConn('ok');
    admRenderAll();
    admSetConn('loading');
    admDebug.log('Showing cached data', { count: cached.length });
  } else {
    admSetConn('loading');
  }

  const isSuperAdm = (window.HS && window.HS.Auth)
    ? window.HS.Auth.isSuperAdmin()
    : (localStorage.getItem('chsa_is_admin_bypass') === '1' ||
       (() => { try { return JSON.parse(localStorage.getItem('chsa_session') || '{}').role === 'super_admin'; } catch { return false; } })());
  const instId = (window.HS && window.HS.Auth) ? window.HS.Auth.getInstitutionId() : null;

  admDebug.log('Fetching data via API', { isSuperAdm });

  //  Step 2: Fetch records AND students through the secure JWT API 
  const recsFetch    = window.HS.HSAdmin.getRecords(instId).then(function(d){ return d.records || []; }).catch(function(e){ admDebug.error('Records fetch failed', e); return []; });
  const studentsFetch = window.HS.HSAdmin.getStudents(instId).then(function(d){ return d.students || []; }).catch(function(){ return []; });

  Promise.all([recsFetch, studentsFetch])
  .then(function(results){
    _admRecs     = results[0];
    _admStudents = results[1];
    admDebug.log('Data loaded', { records: _admRecs.length, students: _admStudents.length });
    _admEnrich(_admRecs);
    _admSaveCache(_admRecs);
    admSetConn('ok');
    admRenderAll();
    admRenderStudents();
    // Show institution name in admin header
    const instName = (typeof getSessionInstitutionName==='function') ? getSessionInstitutionName() : '';
    const hdr = document.getElementById('adm-inst-label');
    if(hdr) hdr.textContent = isSuperAdm ? ' Super Admin — All Institutions' : (instName || 'My Institution');
    // Show institutions tab only for super admin
    const instTab = document.getElementById('adm-tab-institutions');
    if(instTab) instTab.style.display = isSuperAdm ? '' : 'none';
    // Show/hide super admin exclusive toolbar
    const superToolbar = document.getElementById('adm-toolbar-super');
    if(superToolbar) superToolbar.style.display = isSuperAdm ? '' : 'none';
    // Institution admin can't add institution — hide that button if present
    const addInstBtn = document.getElementById('adm-add-institution-btn');
    if(addInstBtn) addInstBtn.style.display = isSuperAdm ? '' : 'none';
  })
  .catch(function(e){
    admDebug.error('Data fetch failed', e);
    if(!cached || !cached.length){
      admSetConn('error');
      const tbody = document.getElementById('adm-tbody');
      if(tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#c0392b"> '+e.message+' — check connection and retry</td></tr>';
    } else {
      admSetConn('offline');
    }
  });
}

const APPROVED_LOCATIONS = ['Nyamebondo 1','Riakerongo','Nyakweri 1','Nyakweri 2','Nyamebondo 2','Masanga','Kiombacha','Nyakeobiri 1','Nyakeobiri 2','Kenyoro','Bomobasi','Igare','Mosasa'];

function admGetFlags(r){
  const raw=typeof r.raw_json==='string'?JSON.parse(r.raw_json||'{}'):(r.raw_json||{});
  const fl=[];

  //  LOCATION FLAG 
  const loc = r.location || raw.interview_location || raw.interview_location_custom || '';
  if(!loc){
    fl.push('Location missing — interviewer must re-open and select a location');
  } else if(!APPROVED_LOCATIONS.includes(loc)){
    fl.push('Invalid location "'+loc+'" — must be one of: '+APPROVED_LOCATIONS.join(', '));
  }

  //  DATE FLAG 
  const dv = r.interview_date||'';
  if(!dv){ fl.push('Date missing'); }
  else if(dv < SURVEY_START_DATE){ fl.push('Wrong date "'+dv+'" — before survey start ('+SURVEY_START_DATE+'). Must be corrected.'); }

  if(r.latrine==='No') fl.push('No pit latrine');
  if(r.water_treated==='No') fl.push('Water not treated');
  if(r.hiv_heard==='No') fl.push('Never heard of HIV/AIDS');
  if(r.house_type==='Permanent'&&raw.b_roof==='Grass Thatched') fl.push('Permanent house + grass roof');
  if(raw.b_cook==='Inside'&&(raw.b_fuel==='Firewood'||raw.b_fuel==='Charcoal')&&raw.b_ventil==='Poor') fl.push('Indoor cooking + poor ventilation');
  if(raw.i_circ==='Female'||raw.i_circ==='Both') fl.push('FGM reported');
  return fl;
}

function admGetFiltered(){
  const q=(document.getElementById('adm-search')?.value||'').toLowerCase();
  return _admRecs.filter(r=>{
    if(q&&![r.interviewer,r.location,r.respondent_gender,r.house_type].join(' ').toLowerCase().includes(q)) return false;
    const fl=admGetFlags(r);
    if(_admFilter==='flags'&&!fl.length) return false;
    if(_admFilter==='no-latrine'&&r.latrine!=='No') return false;
    if(_admFilter==='no-water'&&r.water_treated!=='No') return false;
    if(_admFilter==='hiv-no'&&r.hiv_heard!=='No') return false;
    if(_admFilter==='today'&&r.interview_date!==_admToday) return false;
    if(_admFilter==='bad-data'){
      const hasBadDate=fl.some(f=>f.includes('Wrong date')||f.includes('Date missing'));
      const hasBadLoc=fl.some(f=>f.includes('Invalid location')||f.includes('Location missing'));
      if(!hasBadDate&&!hasBadLoc) return false;
    }
    return true;
  });
}

function admFilter(f,el){
  _admFilter=f;
  document.querySelectorAll('.adm-chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  admRenderTable();
}

function admRenderAll(){
  admUpdateStats();
  admRenderFlags();
  admRenderCharts();
  admRenderTable();
}

function admUpdateStats(){
  document.getElementById('adm-stat-total').textContent=_admRecs.length;
  document.getElementById('adm-stat-today').textContent=_admRecs.filter(r=>r.interview_date===_admToday).length;
  document.getElementById('adm-stat-flags').textContent=_admRecs.filter(r=>admGetFlags(r).some(f=>f.includes('Wrong date')||f.includes('Date missing')||f.includes('Invalid location')||f.includes('Location missing'))).length;
  document.getElementById('adm-stat-iv').textContent=new Set(_admRecs.map(r=>r.interviewer)).size;
}

function admRenderFlags(){
  const panel=document.getElementById('adm-flags-panel');
  const list=document.getElementById('adm-flags-list');
  const all=[];
  // Only show date and location flags in the panel
  _admRecs.forEach(r=>admGetFlags(r).filter(f=>
    f.includes('Wrong date')||f.includes('Date missing')||
    f.includes('Invalid location')||f.includes('Location missing')
  ).forEach(f=>all.push({who:r.interviewer||'?',date:r.interview_date||'?',flag:f})));
  if(!all.length){panel.style.display='none';return;}
  panel.style.display='block';
  document.getElementById('adm-flags-count').textContent=all.length+' total';
  list.innerHTML=all.slice(0,20).map(f=>`<div class="adm-flag-item"><div class="adm-flag-who">${f.who}<br><span style="font-weight:400;color:#aaa;font-size:0.68rem">${f.date}</span></div><div class="adm-flag-what"> ${f.flag}</div></div>`).join('');
}

function admMakePie(data,size=110){
  const entries=Object.entries(data).filter(([k])=>k&&k!=='Unknown').sort((a,b)=>b[1]-a[1]).slice(0,6);
  const total=entries.reduce((s,[,v])=>s+v,0);
  if(!total) return '<div style="color:#aaa;font-size:0.75rem;text-align:center;padding:10px">No data</div>';
  let ang=0;
  const slices=entries.map(([k,v],i)=>{
    const pct=v/total,a=pct*2*Math.PI;
    const x1=Math.cos(ang),y1=Math.sin(ang),x2=Math.cos(ang+a),y2=Math.sin(ang+a);
    const path=`M0,0 L${x1},${y1} A1,1,0,${a>Math.PI?1:0},1,${x2},${y2} Z`;
    const col=PIE_COLS[i%PIE_COLS.length];
    ang+=a;
    return {path,k,v,pct,col};
  });
  const svg=`<svg viewBox="-1.1 -1.1 2.2 2.2" width="${size}" height="${size}" style="display:block;margin:0 auto 10px">
    ${slices.map(s=>`<path d="${s.path}" fill="${s.col}" stroke="#fff" stroke-width="0.03"/>`).join('')}
    <circle cx="0" cy="0" r="0.42" fill="#fff"/>
    <text x="0" y="0.1" text-anchor="middle" font-size="0.28" font-weight="bold" fill="#1e5c38">${total}</text>
  </svg>`;
  const legend=slices.map(s=>`<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;font-size:0.67rem"><div style="width:9px;height:9px;border-radius:2px;background:${s.col};flex-shrink:0"></div><div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.k.length>14?s.k.slice(0,13)+'…':s.k}</div><div style="color:#6b8a74;font-weight:700">${s.v}</div></div>`).join('');
  return svg+`<div style="padding:0 4px">${legend}</div>`;
}

function admMakeBar(data){
  const s=Object.entries(data).filter(([k])=>k&&k!=='Unknown').sort((a,b)=>b[1]-a[1]).slice(0,5);
  const mx=s[0]?.[1]||1;
  if(!s.length) return '<div style="color:#aaa;font-size:.75rem;padding:8px">No data</div>';
  return s.map(([k,v],i)=>`<div class="adm-bar-row"><div class="adm-bar-lbl">${k.length>12?k.slice(0,11)+'…':k}</div><div class="adm-bar-track"><div class="adm-bar-fill" style="width:0%;background:${PIE_COLS[i%PIE_COLS.length]}" data-w="${Math.round(v/mx*100)}"></div></div><div class="adm-bar-cnt">${v}</div></div>`).join('');
}

function admRenderCharts(){
  const countBy=(field,split=false)=>{
    const c={};
    _admRecs.forEach(r=>{
      const raw = typeof r.raw_json==='string' ? JSON.parse(r.raw_json||'{}') : (r.raw_json||{});
      const v = r[field] || raw[field] || 'Unknown';
      if(split)[].concat(v).forEach(x=>String(x).split(',').forEach(p=>{const k=p.trim();if(k)c[k]=(c[k]||0)+1;}));
      else c[String(v).trim()]=(c[String(v).trim()]||0)+1;
    });
    return c;
  };

  const pctField=(field,trueVals=['Yes','yes','YES'])=>{
    const total=_admRecs.length; if(!total) return {Yes:0,No:0};
    const yes=_admRecs.filter(r=>{
      const raw=typeof r.raw_json==='string'?JSON.parse(r.raw_json||'{}'):(r.raw_json||{});
      return trueVals.includes(r[field]||raw[field]);
    }).length;
    return {[` Yes (${Math.round(yes/total*100)}%)`]:yes,[` No (${Math.round((total-yes)/total*100)}%)`]:total-yes};
  };

  const rawField=(field)=>{
    const c={};
    _admRecs.forEach(r=>{
      const raw=typeof r.raw_json==='string'?JSON.parse(r.raw_json||'{}'):(r.raw_json||{});
      const v=String(r[field]||raw[field]||'Unknown').trim();
      c[v]=(c[v]||0)+1;
    });
    return c;
  };

  // Illnesses from stored field
  const ill={};
  _admRecs.forEach(r=>{(r.illnesses||'').split(',').forEach(x=>{const k=x.trim();if(k)ill[k]=(ill[k]||0)+1;});});

  //  SECTION 1: Demographics & Overview 
  const pies=document.getElementById('adm-pies');
  if(pies) pies.innerHTML=`
    <div class="adm-chart-card"><div class="adm-chart-title"> House Types</div>${admMakePie(countBy('house_type'))}</div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Water Sources</div>${admMakePie(countBy('water_source',true))}</div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Common Illnesses</div>${admMakePie(ill)}</div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Gender</div>${admMakePie(countBy('respondent_gender'))}</div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Education Level</div>${admMakePie(countBy('education'))}</div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Lighting Source</div>${admMakePie(rawField('b_light'))}</div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Cooking Fuel</div>${admMakePie(rawField('b_fuel'))}</div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Marital Status</div>${admMakePie(rawField('a_marital'))}</div>`;

  //  SECTION 2: Water, Sanitation & Hygiene 
  const bars=document.getElementById('adm-bars');
  if(bars) bars.innerHTML=`
    <div class="adm-chart-card"><div class="adm-chart-title"> Surveys by Interviewer</div><div class="adm-bar-chart">${admMakeBar(countBy('interviewer'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Surveys by Location</div><div class="adm-bar-chart">${admMakeBar(countBy('location'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Latrine Access</div><div class="adm-bar-chart">${admMakeBar(pctField('latrine'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Water Treatment</div><div class="adm-bar-chart">${admMakeBar(pctField('h_treat'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Waste Disposal</div><div class="adm-bar-chart">${admMakeBar(rawField('h_waste_disp'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Drainage Issues</div><div class="adm-bar-chart">${admMakeBar(pctField('h_drainage'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> HIV Awareness</div><div class="adm-bar-chart">${admMakeBar(pctField('hiv_heard'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> HIV Testing</div><div class="adm-bar-chart">${admMakeBar(pctField('f_tested'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Food Sufficient</div><div class="adm-bar-chart">${admMakeBar(pctField('e_enough'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Skipping Meals</div><div class="adm-bar-chart">${admMakeBar(pctField('e_skip'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Mosquito Net Owned</div><div class="adm-bar-chart">${admMakeBar(pctField('k_mosquito_net'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Mosquito Net Used</div><div class="adm-bar-chart">${admMakeBar(pctField('k_net_used'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Chronic Illness</div><div class="adm-bar-chart">${admMakeBar(pctField('c_chronic'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Pregnancies Found</div><div class="adm-bar-chart">${admMakeBar(pctField('d_pregn'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Immunisation</div><div class="adm-bar-chart">${admMakeBar(pctField('d_immun'))}</div></div>
    <div class="adm-chart-card"><div class="adm-chart-title"> Roof Material</div><div class="adm-bar-chart">${admMakeBar(rawField('b_roof'))}</div></div>`;

  setTimeout(()=>document.querySelectorAll('.adm-bar-fill[data-w]').forEach(el=>{el.style.width=el.getAttribute('data-w')+'%';el.removeAttribute('data-w');}),80);
}

function admRenderTable(){
  const filtered=admGetFiltered();
  const tbody=document.getElementById('adm-tbody');
  const empty=document.getElementById('adm-empty');
  document.getElementById('adm-tbl-count').textContent=filtered.length+' record(s)';
  if(!filtered.length){tbody.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  tbody.innerHTML=filtered.map((r,i)=>{
    const fl=admGetFlags(r);
    const idx=_admRecs.indexOf(r);
    const hasLocFlag = fl.some(f=>f.includes('location')||f.includes('Location'));
    return `<tr onclick="admOpenDetail(${idx})" style="${hasLocFlag?'background:rgba(211,47,47,0.08);border-left:3px solid #d32f2f':''}">
      <td style="color:#aaa;font-size:.7rem">${i+1}</td>
      <td class="adm-td-name">${r.interviewer||'—'}</td>
      <td class="adm-td-date">${r.interview_date||'—'}</td>
      <td style="font-size:.75rem;${hasLocFlag?'color:#d32f2f;font-weight:700':''}">${hasLocFlag?' ':''} ${r.location||'—'}</td>
      <td style="font-size:.75rem">${r.respondent_age||'?'} · ${r.respondent_gender||'?'}</td>
      <td><span class="adm-badge grey">${r.house_type||'—'}</span></td>
      <td><span class="adm-badge ${r.latrine==='Yes'?'ok':'red'}">${r.latrine||'—'}</span></td>
      <td><span class="adm-badge ${r.water_treated==='Yes'?'ok':'red'}">${r.water_treated||'—'}</span></td>
      <td><span class="adm-badge ${r.hiv_heard==='Yes'?'ok':'red'}">${r.hiv_heard||'—'}</span></td>
      <td>${fl.length?`<span class="adm-badge red"> ${fl.length}</span>`:`<span class="adm-badge ok"></span>`}</td>
      <td style="white-space:nowrap">
        <button class="adm-row-btn" onclick="event.stopPropagation();openInterviewerReport('${r.interviewer}')" style="background:#e8f0fd;color:#1a4f6e"></button>
      </td>
      <td style="white-space:nowrap">
        <button class="adm-row-btn view" onclick="event.stopPropagation();admOpenDetail(${idx})">View</button>
        <button class="adm-row-btn del" onclick="event.stopPropagation();admDelete(${idx})"></button>
      </td>
    </tr>`;
  }).join('');
}

function admOpenDetail(idx){
  _admDetail=_admRecs[idx]; _admDetailIdx=idx;
  const r=_admDetail;
  const fl=admGetFlags(r);
  document.getElementById('adm-detail-title').textContent=`${r.interviewer||'?'} · ${r.interview_date||'?'}`;
  document.getElementById('adm-detail-body').innerHTML=`
    <div class="adm-detail-sec-title"> Interview Details</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">Interviewer</div><div class="adm-detail-val">${r.interviewer||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Date</div><div class="adm-detail-val">${r.interview_date||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Location</div><div class="adm-detail-val">${r.location||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Consent</div><div class="adm-detail-val">${r.consent||'—'}</div></div>
    </div>
    <div class="adm-detail-sec-title"> A: Demography</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">Age</div><div class="adm-detail-val">${r.respondent_age||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Gender</div><div class="adm-detail-val">${r.respondent_gender||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Marital Status</div><div class="adm-detail-val">${r.marital_status||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Position in HH</div><div class="adm-detail-val">${r.hh_position||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Total Males</div><div class="adm-detail-val">${r.total_males||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Total Females</div><div class="adm-detail-val">${r.total_females||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Education</div><div class="adm-detail-val">${r.education||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Occupation</div><div class="adm-detail-val">${r.occupation||'—'}</div></div>
    </div>
    <div class="adm-detail-sec-title"> B: Housing</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">House Type</div><div class="adm-detail-val">${r.house_type||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Roof</div><div class="adm-detail-val">${r.roof_type||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Floor</div><div class="adm-detail-val">${r.floor_type||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Walls</div><div class="adm-detail-val">${r.wall_type||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Lighting</div><div class="adm-detail-val">${r.lighting||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Fuel</div><div class="adm-detail-val">${r.fuel||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Rooms</div><div class="adm-detail-val">${r.rooms||'—'}</div></div>
    </div>
    <div class="adm-detail-sec-title"> C: Medical History</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">Illnesses (6m)</div><div class="adm-detail-val">${r.illnesses||'None'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Chronic Illness</div><div class="adm-detail-val">${r.chronic_illness||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Consultation</div><div class="adm-detail-val">${r.consultation||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Where</div><div class="adm-detail-val">${r.consult_where||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Deaths (5yr)</div><div class="adm-detail-val">${r.deaths_5yr==='Yes'?(r.deaths_count||'?')+' death(s)':'No'}</div></div>
    </div>
    <div class="adm-detail-sec-title"> D: Maternal & Child / E: Nutrition</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">Pregnancy</div><div class="adm-detail-val">${r.pregnancy_status||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">ANC Visits</div><div class="adm-detail-val">${r.anc_visits||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Delivery Place</div><div class="adm-detail-val">${r.delivery_place||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Children U5</div><div class="adm-detail-val">${r.children_under5||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Immunisation</div><div class="adm-detail-val">${r.immunisation||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Meals/Day</div><div class="adm-detail-val">${r.meals_per_day||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Skips Meals</div><div class="adm-detail-val">${r.skips_meals||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Food Enough</div><div class="adm-detail-val">${r.food_enough||'—'}</div></div>
    </div>
    <div class="adm-detail-sec-title"> F: HIV/AIDS</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">HIV Aware</div><div class="adm-detail-val">${r.hiv_heard||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Ever Tested</div><div class="adm-detail-val">${r.hiv_tested||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Uses Protection</div><div class="adm-detail-val">${r.hiv_protect||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Partner Tested</div><div class="adm-detail-val">${r.hiv_partner_test||'—'}</div></div>
    </div>
    <div class="adm-detail-sec-title"> G: Sanitation /  H: Water</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">Pit Latrine</div><div class="adm-detail-val">${r.latrine||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Latrine Type</div><div class="adm-detail-val">${r.latrine_type||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Latrine Count</div><div class="adm-detail-val">${r.latrine_count||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Handwashing</div><div class="adm-detail-val">${r.handwashing||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Water Source</div><div class="adm-detail-val">${r.water_source||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Water Treated</div><div class="adm-detail-val">${r.water_treated||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Safe Container</div><div class="adm-detail-val">${r.water_container||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Waste Disposal</div><div class="adm-detail-val">${r.waste_disposal||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Drainage</div><div class="adm-detail-val">${r.drainage||'—'}</div></div>
    </div>
    <div class="adm-detail-sec-title"> I: Cultural / J: Health Problems / K: Pests</div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><div class="adm-detail-key">Circumcision</div><div class="adm-detail-val">${r.circumcision||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Traditional Med</div><div class="adm-detail-val">${r.traditional_med||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Health Problems</div><div class="adm-detail-val">${r.health_problems||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Mosquito Net</div><div class="adm-detail-val">${r.mosquito_net||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Net Used</div><div class="adm-detail-val">${r.net_used||'—'}</div></div>
      <div class="adm-detail-item"><div class="adm-detail-key">Rodents</div><div class="adm-detail-val">${r.rodents||'—'}</div></div>
    </div>
    ${(()=>{
      const chs=[1,2,3,4,5,6,7,8,9,10].map(n=>r['challenge_'+n]).filter(Boolean);
      if(!chs.length && !r.interview_summary && !r.k_notes) return '';
      let html='<div class="adm-detail-sec-title"> L: Challenges & Observations</div><div style="padding:8px 0">';
      if(chs.length){
        html+='<ol style="padding-left:18px;margin:0 0 8px">';
        chs.forEach(c=>{ html+='<li style="font-size:.78rem;color:#fff;margin-bottom:3px">'+c+'</li>'; });
        html+='</ol>';
      }
      if(r.k_notes) html+='<div style="font-size:.75rem;color:rgba(255,255,255,.6);margin-bottom:6px"><strong>Observations:</strong> '+r.k_notes+'</div>';
      if(r.interview_summary) html+='<div style="font-size:.75rem;color:rgba(255,255,255,.6)"><strong>Summary:</strong> '+r.interview_summary+'</div>';
      html+='</div>';
      return html;
    })()}
    <div class="adm-detail-sec-title"> Red Flags</div>
    ${fl.length?fl.map(f=>{
      const isLocFlag = f.includes('location')||f.includes('Location')||f.includes('Invalid location');
      return isLocFlag
        ? `<div class="adm-df-red" style="background:#fdecea;border:1.5px solid #d32f2f;padding:10px 12px;border-radius:8px;margin-bottom:6px;font-weight:700"> WRONG LOCATION — Record needs correction<br><span style="font-size:0.75rem;font-weight:400;color:#555">${f}</span><br><span style="font-size:0.72rem;color:#c62828;font-weight:600">The interviewer must re-open this record and select a valid location before it can be trusted.</span></div>`
        : `<div class="adm-df-red"> ${f}</div>`;
    }).join(''):'<div class="adm-df-ok"> No red flags</div>'}`;
  document.getElementById('adm-detail-ov').classList.add('open');
}
function admCloseDetail(){ document.getElementById('adm-detail-ov').classList.remove('open'); }

function admDeleteFromDetail(){
  if(_admDetailIdx<0) return;
  admCloseDetail();
  admDelete(_admDetailIdx);
}

async function admDelete(idx){
  const r=_admRecs[idx];
  if(!r) return;
  if(!confirm(` Delete this record from the server?\n\n${r.interviewer||'?'} · ${r.interview_date||'?'} · ${r.location||'?'}\n\nThis cannot be undone.`)) return;
  if(!navigator.onLine){ showToast(' No internet — cannot delete',true); return; }
  try{
    await window.HS.HSAdmin.deleteRecord(r.id || r.record_id);
    showToast(' Record deleted');
    await admLoad();
  }catch(e){
    showToast(' Delete failed — '+((e&&e.message)||'network error'),true);
  }
}

async function admNotifyInterviewer(idx){
  const r=_admRecs[idx!==undefined?idx:_admDetailIdx];
  if(!r){showToast('No record',true);return;}
  const fl=admGetFlags(r);
  const bad=fl.filter(f=>f.includes('Wrong date')||f.includes('Date missing')||f.includes('Invalid location')||f.includes('Location missing'));
  if(!bad.length){showToast('No date/location issues on this record');return;}
  if(!navigator.onLine){showToast('No internet — cannot notify',true);return;}
  const notes=bad.join(' | ');
  try{
    await window.HS.HSAdmin.updateRecord(r.id || r.record_id, {needs_correction:true,correction_notes:notes});
    r.needs_correction=true;r.correction_notes=notes;
    showToast(' '+(r.interviewer||'Interviewer')+' notified — will see prompt on next login');
    admRenderAll();
  }catch(e){showToast(' Notify failed: '+(e&&e.message||'error'),true);}
}

async function admNotifyAllBadRecords(){
  if(!navigator.onLine){showToast('No internet — cannot notify',true);return;}
  const bad=_admRecs.filter(r=>{
    const fl=admGetFlags(r);
    return fl.some(f=>f.includes('Wrong date')||f.includes('Date missing')||f.includes('Invalid location')||f.includes('Location missing'))&&!r.needs_correction;
  });
  if(!bad.length){showToast(' No unnotified bad records found');return;}
  if(!confirm('Send correction notice to '+bad.length+' record(s)?\n\nInterviewers will see a blocking prompt on their next login listing exactly what to fix.')) return;
  let okCount=0,fail=0;
  for(const r of bad){
    const notes=admGetFlags(r).filter(f=>f.includes('Wrong date')||f.includes('Date missing')||f.includes('Invalid location')||f.includes('Location missing')).join(' | ');
    try{
      await window.HS.HSAdmin.updateRecord(r.id || r.record_id, {needs_correction:true,correction_notes:notes});
      r.needs_correction=true;r.correction_notes=notes;okCount++;
    }catch(e){fail++;}
  }
  showToast(' Notified '+okCount+' record(s)'+(fail?' — '+fail+' failed':''));
  admRenderAll();
}

function admExportCSV(){
  if(!_admRecs.length){ alert('No records'); return; }
  const cols=['record_id','interviewer','interview_date','location','respondent_age','respondent_gender','house_type','water_source','water_treated','latrine','hiv_heard','hiv_tested','illnesses','deaths_5yr','deaths_count','fuel','education','occupation','consent','synced_at'];
  const csv=[cols.join(','),..._admRecs.map(r=>cols.map(c=>{const v=String(r[c]||'').replace(/"/g,'""');return v.includes(',')||v.includes('"')?`"${v}"`:v;}).join(','))].join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`health_survey_${_admToday}.csv`;
  a.click();
}

function admExportJSON(){
  if(!_admRecs.length){ alert('No records'); return; }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(_admRecs,null,2)],{type:'application/json'}));
  a.download=`health_survey_full_${_admToday}.json`;
  a.click();
}

function admForceSyncAll(){
  if(!confirm('Force re-upload ALL local records?\nThis re-syncs even already-synced records.')) return;
  if(typeof forceSyncAll === 'function') forceSyncAll();
  else syncAll();
}

//  BIN / INSIGHTS / STUDENTS 
const BIN_KEY='chsa_recycle_bin';
function admTab(name,el){
  document.querySelectorAll('.adm-tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.adm-tab-panel').forEach(p=>p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('adm-panel-'+name).classList.add('on');
  if(name==='bin') admRenderBin();
  if(name==='insights') admRenderInsights();
  if(name==='students') admLoadStudents();
}
function admGetBin(){try{return JSON.parse(localStorage.getItem(BIN_KEY)||'[]');}catch{return[];}}
function admSaveBin(b){localStorage.setItem(BIN_KEY,JSON.stringify(b));}
function admUpdateBinBadge(){
  const bin=admGetBin();
  const badge=document.getElementById('adm-bin-badge');
  if(!badge)return;
  if(bin.length>0){badge.style.display='inline';badge.textContent=bin.length;}
  else badge.style.display='none';
}
function admRenderBin(){
  const bin=admGetBin();
  const list=document.getElementById('adm-bin-list');
  const perma=document.getElementById('adm-bin-empty-perma');
  if(!bin.length){
    list.innerHTML='<div class="adm-empty"><div style="font-size:36px;margin-bottom:8px"></div><div style="font-weight:700">Bin is empty</div><div style="font-size:.78rem;margin-top:4px">Deleted records will appear here</div></div>';
    if(perma)perma.style.display='none';
    return;
  }
  if(perma)perma.style.display='block';
  list.innerHTML=bin.map((r,i)=>`
    <div class="bin-item">
      <div class="bin-item-info">
        <div class="bin-item-name">${r.interviewer||'Unknown'} · ${r.interview_date||'?'}</div>
        <div class="bin-item-meta">${r.location||'?'} · ${r.respondent_age||'?'} yrs · ${r.respondent_gender||'?'}</div>
        <div class="bin-item-meta" style="color:#c0392b;font-size:.65rem">Binned: ${new Date(r._binned_at).toLocaleDateString()}</div>
      </div>
      <div class="bin-item-btns">
        <button class="adm-btn g" style="padding:7px 11px;font-size:.72rem" onclick="admRestoreFromBin(${i})">↩ Restore</button>
        <button class="adm-btn r" style="padding:7px 11px;font-size:.72rem" onclick="admPermDelete(${i})"></button>
      </div>
    </div>`).join('');
}
function admMoveToBinByIdx(idx){
  const r=_admRecs[idx];
  if(!r)return;
  if(!confirm(`Move this record to the recycle bin?\n\n${r.interviewer||'?'} · ${r.interview_date||'?'} · ${r.location||'?'}\n\nYou can restore it later from the Bin tab.`))return;
  const bin=admGetBin();
  bin.push({...r, _binned_at: new Date().toISOString()});
  admSaveBin(bin);
  _admRecs.splice(idx,1);
  admRenderAll();
  admUpdateBinBadge();
  showToast('Moved to recycle bin — restore anytime from  Bin tab');
}
function admMoveTobin(){
  if(_admDetailIdx<0)return;
  admCloseDetail();
  admMoveToBinByIdx(_admDetailIdx);
}
function admRestoreFromBin(i){
  const bin=admGetBin();
  const r=bin[i];
  if(!r)return;
  // Remove _binned_at before restoring
  const {_binned_at,...rec}=r;
  _admRecs.unshift(rec);
  bin.splice(i,1);
  admSaveBin(bin);
  admRenderAll();
  admRenderBin();
  admUpdateBinBadge();
  showToast(' Record restored to main list');
}
async function admPermDelete(i){
  const bin=admGetBin();
  const r=bin[i];
  if(!r)return;
  if(!confirm(` PERMANENTLY delete this record?\n\n${r.interviewer||'?'} · ${r.interview_date||'?'}\n\nThis will remove it from the server and cannot be undone.`))return;
  if(!navigator.onLine){showToast(' No internet — cannot delete from server',true);return;}
  try{
    await window.HS.HSAdmin.deleteRecord(r.id || r.record_id);
    bin.splice(i,1);admSaveBin(bin);
    admRenderBin();admUpdateBinBadge();
    showToast(' Permanently deleted from server');
  }catch(e){showToast(' Server delete failed: '+(e&&e.message||'error'),true);}
}
async function admEmptyBin(){
  const bin=admGetBin();
  if(!bin.length)return;
  if(!confirm(` Permanently delete ALL ${bin.length} records in the bin?\n\nThis cannot be undone.`))return;
  if(!navigator.onLine){showToast(' No internet',true);return;}
  let okCount=0,fail=0;
  for(const r of bin){
    try{
      await window.HS.HSAdmin.deleteRecord(r.id || r.record_id);
      okCount++;
    }catch{fail++;}
  }
  admSaveBin([]);admRenderBin();admUpdateBinBadge();
  showToast(fail>0?` ${okCount} deleted, ${fail} failed`:` All ${okCount} records permanently deleted`);
}
function admConfirmRemove(regNumber, name){
  if(!confirm(`Remove access for ${name}?\n\nThey will not be able to sign in. You can restore them anytime.`)) return;
  admSetStudentStatus(regNumber, 'removed');
}
function admRenderInsights(){
  const n=_admRecs.length;
  if(!n){document.getElementById('adm-insights-body').innerHTML='<div class="adm-empty"><div style="font-size:36px;margin-bottom:8px"></div><div>No records loaded yet</div></div>';return;}

  //  Compute all metrics 
  const pct=(num,den)=>den>0?Math.round(num/den*100):0;
  const count=(field,val)=>_admRecs.filter(r=>r[field]===val).length;

  // HIV
  const hivHeardY=count('hiv_heard','Yes'), hivHeardN=count('hiv_heard','No');
  const hivTestedY=count('hiv_tested','Yes'), hivTestedN=count('hiv_tested','No');
  const hivPct=pct(hivHeardY,n), testedPct=pct(hivTestedY,n);

  // Water & Sanitation
  const waterTreated=count('water_treated','Yes');
  const latrine=count('latrine','Yes');
  const waterPct=pct(waterTreated,n), latrinePct=pct(latrine,n);

  // Deaths
  const deathsY=count('deaths_5yr','Yes');
  const totalDeaths=_admRecs.reduce((s,r)=>s+(parseInt(r.deaths_count)||0),0);

  // Illnesses
  const illCount={};
  _admRecs.forEach(r=>{(r.illnesses||'').split(',').forEach(x=>{const k=x.trim();if(k&&k!=='None')illCount[k]=(illCount[k]||0)+1;});});
  const topIll=Object.entries(illCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const illMax=topIll[0]?.[1]||1;

  // House types
  const permanent=count('house_type','Permanent'), temp=count('house_type','Temporary'), semi=count('house_type','Semi-permanent');

  // Gender
  const male=count('respondent_gender','Male'), female=count('respondent_gender','Female');

  //  Progress bar helper 
  const prog=(label,val,max,col,sublabel='')=>`
    <div class="ins-progress">
      <div class="ins-progress-label"><span>${label}</span><span>${val}/${max} (${pct(val,max)}%)</span></div>
      ${sublabel?`<div style="font-size:.68rem;color:#6b8a74;margin-bottom:3px">${sublabel}</div>`:''}
      <div class="ins-progress-bar"><div class="ins-progress-fill" style="width:${pct(val,max)}%;background:${col}"></div></div>
    </div>`;

  //  Generate recommendations 
  const recs=[];
  if(pct(latrine,n)<50) recs.push({lvl:'critical',title:'Critical: Low Latrine Coverage',body:`Only ${latrinePct}% of households have a pit latrine. This is a major public health risk — open defecation leads to diarrhoeal disease, cholera, and typhoid. <strong>Immediate action:</strong> Community latrine construction programme, health education on sanitation.`});
  if(pct(waterTreated,n)<60) recs.push({lvl:'critical',title:'Critical: Water Treatment Gap',body:`Only ${waterPct}% of households treat their water before drinking. Untreated water is the primary driver of waterborne diseases. <strong>Immediate action:</strong> Mass distribution of water treatment tablets (WaterGuard), boiling promotion, safe storage campaign.`});
  if(pct(hivHeardY,n)<70) recs.push({lvl:'critical',title:'Critical: Low HIV Awareness',body:`${hivHeardN} (${pct(hivHeardN,n)}%) respondents have never heard of HIV/AIDS. This represents a serious gap. <strong>Immediate action:</strong> Door-to-door HIV education, community health worker deployment, VCT outreach.`});
  if(pct(hivTestedY,n)<50) recs.push({lvl:'warning',title:'Warning: Low HIV Testing Rate',body:`Only ${testedPct}% have ever been tested for HIV. Early detection is critical for treatment and prevention. <strong>Action needed:</strong> Mobile VCT campaigns, integrate testing into routine health facility visits.`});
  if(deathsY>n*0.1) recs.push({lvl:'warning',title:'Warning: Elevated Household Deaths',body:`${deathsY} households (${pct(deathsY,n)}%) reported a death in the past 5 years (${totalDeaths} deaths total). <strong>Investigation needed:</strong> Identify leading causes — malaria, pneumonia, and maternal mortality are most preventable.`});
  if(pct(permanent,n)<30) recs.push({lvl:'warning',title:'Warning: Poor Housing Quality',body:`Only ${pct(permanent,n)}% of households live in permanent housing. Temporary structures are associated with respiratory infections, insect infestations, and poor sanitation. <strong>Action:</strong> Link households to county housing programmes.`});
  if(topIll.length>0&&topIll[0][1]>n*0.2) recs.push({lvl:'warning',title:`High Disease Burden: ${topIll[0][0]}`,body:`${topIll[0][0]} is the most reported illness affecting ${topIll[0][1]} households (${pct(topIll[0][1],n)}%). ${topIll[0][0]==='Malaria'?'Malaria prevention: promote ITN use, indoor residual spraying, drainage of stagnant water.':topIll[0][0].includes('Diarrh')?'Diarrhoea prevention tied directly to water treatment and sanitation improvements.':'Community health education and treatment access should be prioritised.'}`});
  if(pct(latrine,n)>=70&&pct(waterTreated,n)>=70) recs.push({lvl:'good',title:'Good: Basic Sanitation Coverage',body:`${latrinePct}% latrine coverage and ${waterPct}% water treatment is above average for rural Kenya. Maintain this through regular community hygiene sensitisation.`});
  if(pct(hivHeardY,n)>=80) recs.push({lvl:'good',title:'Good: High HIV Awareness',body:`${hivPct}% of the community has heard of HIV/AIDS. Continue health education to reach the remaining ${hivHeardN} unaware individuals.`});

  document.getElementById('adm-insights-body').innerHTML=`

    <!-- HIV/AIDS Section -->
    <div class="ins-section">
      <div class="ins-hdr"><div class="ins-hdr-icon"></div><div><div class="ins-hdr-title">HIV/AIDS Status</div><div class="ins-hdr-sub">Awareness, testing and knowledge in the community</div></div></div>
      <div class="ins-body">
        <div class="ins-metric-row">
          <div class="ins-metric ${hivPct>=80?'ok':hivPct>=50?'warn':'bad'}"><div class="ins-metric-n">${hivPct}%</div><div class="ins-metric-l">Aware of HIV</div></div>
          <div class="ins-metric ${testedPct>=70?'ok':testedPct>=40?'warn':'bad'}"><div class="ins-metric-n">${testedPct}%</div><div class="ins-metric-l">Ever Tested</div></div>
          <div class="ins-metric bad"><div class="ins-metric-n">${hivHeardN}</div><div class="ins-metric-l">Never Heard of HIV</div></div>
        </div>
        ${prog('HIV Awareness',hivHeardY,n,'#4CAF72','Households who have heard of HIV/AIDS')}
        ${prog('HIV Testing Rate',hivTestedY,n,'#1a4f6e','Households where someone was tested')}
        <div style="font-size:.75rem;color:#6b8a74;margin-top:8px;line-height:1.5">
          WHO target: ≥90% awareness, ≥90% of those aware should know their status.
          ${hivPct<90?`<strong style="color:#c0392b">  Current awareness (${hivPct}%) is below the 90% target.</strong>`:''}
        </div>
      </div>
    </div>

    <!-- Disease Burden Section -->
    <div class="ins-section">
      <div class="ins-hdr"><div class="ins-hdr-icon"></div><div><div class="ins-hdr-title">Disease Burden</div><div class="ins-hdr-sub">Illnesses reported in the past 6 months</div></div></div>
      <div class="ins-body">
        <div class="ins-metric-row">
          <div class="ins-metric bad"><div class="ins-metric-n">${Object.values(illCount).reduce((a,b)=>a+b,0)}</div><div class="ins-metric-l">Total Cases</div></div>
          <div class="ins-metric warn"><div class="ins-metric-n">${Object.keys(illCount).length}</div><div class="ins-metric-l">Diseases Reported</div></div>
          <div class="ins-metric bad"><div class="ins-metric-n">${deathsY}</div><div class="ins-metric-l">Deaths (5yr)</div></div>
        </div>
        <div style="margin-top:4px">
          ${topIll.map(([k,v])=>`
            <div class="ins-disease-item">
              <div class="ins-disease-name">${k}</div>
              <div class="ins-disease-bar"><div class="ins-disease-fill" style="width:${Math.round(v/illMax*100)}%"></div></div>
              <div class="ins-disease-count">${v}</div>
            </div>`).join('')||'<div style="color:#aaa;font-size:.78rem">No illness data</div>'}
        </div>
        ${totalDeaths>0?`<div style="margin-top:10px;padding:9px 11px;background:#fdecea;border-radius:9px;font-size:.75rem;color:#c0392b;line-height:1.5"> <strong>${totalDeaths} total deaths</strong> reported across ${deathsY} households in the past 5 years. Cause investigation and verbal autopsy recommended.</div>`:''}
      </div>
    </div>

    <!-- Water & Sanitation Section -->
    <div class="ins-section">
      <div class="ins-hdr"><div class="ins-hdr-icon"></div><div><div class="ins-hdr-title">Water & Sanitation</div><div class="ins-hdr-sub">Coverage and safety indicators</div></div></div>
      <div class="ins-body">
        <div class="ins-metric-row">
          <div class="ins-metric ${waterPct>=80?'ok':waterPct>=50?'warn':'bad'}"><div class="ins-metric-n">${waterPct}%</div><div class="ins-metric-l">Treat Water</div></div>
          <div class="ins-metric ${latrinePct>=80?'ok':latrinePct>=50?'warn':'bad'}"><div class="ins-metric-n">${latrinePct}%</div><div class="ins-metric-l">Have Latrine</div></div>
          <div class="ins-metric bad"><div class="ins-metric-n">${n-latrine}</div><div class="ins-metric-l">No Latrine</div></div>
        </div>
        ${prog('Water Treatment',waterTreated,n,'#2980b9','Households treating water before drinking')}
        ${prog('Latrine Coverage',latrine,n,'#16a085','Households with a pit latrine')}
        <div style="font-size:.75rem;color:#6b8a74;margin-top:8px;line-height:1.5">
          Kenya National Target: ≥80% latrine coverage. ${latrinePct<80?`<strong style="color:#c0392b"> Current coverage (${latrinePct}%) is below target.</strong>`:`<strong style="color:#1e5c38"> Above national target.</strong>`}
        </div>
      </div>
    </div>

    <!-- Housing Section -->
    <div class="ins-section">
      <div class="ins-hdr"><div class="ins-hdr-icon"></div><div><div class="ins-hdr-title">Housing & Demographics</div><div class="ins-hdr-sub">Household composition and structure quality</div></div></div>
      <div class="ins-body">
        <div class="ins-metric-row">
          <div class="ins-metric ok"><div class="ins-metric-n">${pct(permanent,n)}%</div><div class="ins-metric-l">Permanent</div></div>
          <div class="ins-metric warn"><div class="ins-metric-n">${pct(semi,n)}%</div><div class="ins-metric-l">Semi-Perm</div></div>
          <div class="ins-metric bad"><div class="ins-metric-n">${pct(temp,n)}%</div><div class="ins-metric-l">Temporary</div></div>
        </div>
        ${prog('Permanent Housing',permanent,n,'#1e5c38')}
        <div class="ins-metric-row" style="margin-top:10px">
          <div class="ins-metric n"><div class="ins-metric-n">${male}</div><div class="ins-metric-l">Male</div></div>
          <div class="ins-metric a"><div class="ins-metric-n">${female}</div><div class="ins-metric-l">Female</div></div>
          <div class="ins-metric g"><div class="ins-metric-n">${n}</div><div class="ins-metric-l">Total</div></div>
        </div>
      </div>
    </div>

    <!-- Recommendations -->
    <div class="ins-section">
      <div class="ins-hdr"><div class="ins-hdr-icon"></div><div><div class="ins-hdr-title">Public Health Recommendations</div><div class="ins-hdr-sub">Based on ${n} survey records</div></div></div>
      <div class="ins-body">
        ${recs.length?recs.map(r=>`<div class="rec-card ${r.lvl}"><div class="rec-card-title">${r.lvl==='critical'?'':r.lvl==='warning'?'':''} ${r.title}</div><div class="rec-card-body">${r.body}</div></div>`).join('')
        :'<div class="rec-card good"><div class="rec-card-title"> No Critical Issues Detected</div><div class="rec-card-body">All key indicators are within acceptable ranges. Continue monitoring and maintain community health education programmes.</div></div>'}
        <div style="margin-top:14px;padding:10px 12px;background:#f4f6f8;border-radius:10px;font-size:.72rem;color:#6b8a74;line-height:1.6">
          <strong>Report generated:</strong> ${new Date().toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · HazzinBR Community Health Survey · Based on ${n} household interviews.
        </div>
      </div>
    </div>`;

  // Animate progress bars
  setTimeout(()=>document.querySelectorAll('.ins-progress-fill').forEach(el=>{
    const target=el.style.width;el.style.width='0';setTimeout(()=>el.style.width=target,50);
  }),100);
}
async function admLoadStudents(){
  const empty = document.getElementById('adm-students-empty');
  if(empty) empty.style.display='none';
  const instId = (window.HS && window.HS.Auth) ? window.HS.Auth.getInstitutionId() : null;
  try{
    const data = await window.HS.HSAdmin.getStudents(instId);
    _admStudents = data.students || [];
    // Re-enrich any loaded records now that we have student data
    if(Array.isArray(_admRecs) && _admRecs.length){
      _admRecs.forEach(function(rec){
        if(!rec.interviewer || rec.interviewer.includes(' ')) return;
        const fn = rec.interviewer.toLowerCase();
        const match = _admStudents.find(function(s){
          return s.full_name && s.full_name.trim().toLowerCase().startsWith(fn+' ');
        });
        if(match) rec.interviewer = match.full_name;
      });
    }
    admRenderStudents();
  }catch(e){
    if(empty){ empty.style.display='block'; const p=empty.querySelector('div:nth-child(2)'); if(p) p.textContent=' '+e.message; }
  }
}
function admRenderStudents(){
  const list  = document.getElementById('adm-students-list');
  const empty = document.getElementById('adm-students-empty');
  const badge = document.getElementById('adm-students-badge');

  const active  = _admStudents.filter(s=>s.status!=='removed');
  const removed = _admStudents.filter(s=>s.status==='removed');

  // Badge: show count of active users
  if(badge){ badge.style.display='inline'; badge.textContent=active.length; }

  if(!_admStudents.length){
    if(list)  list.innerHTML='';
    if(empty) empty.style.display='block';
    return;
  }
  if(empty) empty.style.display='none';

  const userCard = (s) => `
    <div style="background:#fff;border-radius:12px;border:1px solid #dde8e2;padding:13px 14px;margin-bottom:9px;display:flex;align-items:center;gap:12px;">
      <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#1a5c35,#1a4060);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;flex-shrink:0">
        ${s.full_name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:0.85rem;color:#0f1f18;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.full_name}</div>
        <div style="font-size:0.7rem;color:#6b8a74;margin-top:1px">${s.reg_number}</div>
        ${s.email?`<div style="font-size:0.66rem;color:#1a4f6e;margin-top:1px"> ${s.email}</div>`:''}
        <div style="font-size:0.62rem;color:#aaa;margin-top:1px">${s.requested_at?'Joined '+new Date(s.requested_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}):''}</div>
      </div>
      <div>
        ${s.status==='removed'
          ? `<button class="adm-btn g" style="padding:7px 12px;font-size:.72rem" onclick="admSetStudentStatus('${s.reg_number}','active')">↩ Restore</button>`
          : `<button class="adm-btn r" style="padding:7px 12px;font-size:.72rem" onclick="admConfirmRemove('${s.reg_number}','${s.full_name.replace(/'/g,"\\'").replace(/"/g,'\\"')}')"> Remove</button>`
        }
      </div>
    </div>`;

  let html = '';
  if(active.length){
    html += `<div style="font-size:0.7rem;font-weight:700;color:#1e5c38;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;"> Active Users (${active.length})</div>`;
    html += active.map(userCard).join('');
  }
  if(removed.length){
    html += `<div style="font-size:0.7rem;font-weight:700;color:#c0392b;text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px;"> Removed (${removed.length})</div>`;
    html += removed.map(userCard).join('');
  }
  if(list) list.innerHTML = html;
}
async function admSetStudentStatus(regNumber, status){
  try{
    const patch = { status };
    if (status === 'approved') patch.approved_at = new Date().toISOString();
    await window.HS.HSAdmin.updateStudent(regNumber, patch);
    showToast(status==='removed'?' User removed':' User restored');
    admLoadStudents();
  }catch(e){
    showToast(' Update failed: '+(e&&e.message||'error'),true);
  }
}

