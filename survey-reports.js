/* 
   Medical Survey System (MSS) — Official Report System
   HazzinBR Medical Survey System (MSS)
   © 2026 Ministry of Health Kenya
    */

'use strict';

// 
//  STUDENT DETAILS — fetch from Supabase by full name
//  Returns { full_name, reg_number, email }
// 
async function _getStudentDetails(fullName){
  const name = (fullName||'').trim().toLowerCase();

  // Helper: check if two names match (exact or one starts with the other)
  function matches(a,b){
    if(!a||!b) return false;
    a=a.trim().toLowerCase(); b=b.trim().toLowerCase();
    return a===b || a.startsWith(b+' ') || b.startsWith(a+' ') || a.split(' ')[0]===b || b.split(' ')[0]===a;
  }

  // 1. Check _admStudents cache
  if(typeof _admStudents!=='undefined' && Array.isArray(_admStudents)){
    // Try exact match first
    let hit = _admStudents.find(s=>s.full_name && s.full_name.trim().toLowerCase()===name);
    // Fall back to partial match
    if(!hit) hit = _admStudents.find(s=>matches(s.full_name, fullName));
    if(hit) return hit;
  }

  // 2. Check session
  try{
    const sess = JSON.parse(localStorage.getItem('chsa_auth')||'null');
    if(sess && sess.full_name && matches(sess.full_name, fullName))
      return sess;
  }catch(e){ console.error('[_getStudentDetails] session parse error:', e); }

  // 3. Live fetch via secure API — try loading all students and filtering
  try{
    if(window.HS && window.HS.HSAdmin){
      const data = await window.HS.HSAdmin.getStudents(null);
      const students = data.students || [];
      // Try exact match first, then partial
      const hit = students.find(s=>s.full_name && s.full_name.trim().toLowerCase()===name)
               || students.find(s=>matches(s.full_name, fullName));
      if(hit) return hit;
    }
  }catch(e){ console.error('[_getStudentDetails] HSAdmin.getStudents error:', e); }

  return {full_name: fullName||'Unknown', reg_number:'—', email:'—'};
}

// 
//  AI NARRATIVE — fetch Claude-generated narrative from backend
//  Falls back to null if API key not configured (frontend uses static text)
// 
async function _fetchNarrative(report_type, metrics, context) {
  try {
    const API_BASE = window.HS_API_BASE || '';
    const token = window.HS?.Auth?.getToken() || localStorage.getItem('hs_jwt_token') || '';
    const res = await fetch(API_BASE + '/api/report/narrate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ report_type, metrics, context }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.narrative || null;  // null = use fallback
  } catch(e) {
    console.warn('[narrate] failed, using static fallback:', e.message);
    return null;
  }
}





// 
//  SHARED CSS
//  Letter 8.5×11in fixed-height pages.
//  All print via browser\u2019s native Print → Save as PDF.
//  No double-scroll. No gaps. Fits 15-20 cases cleanly.
// 
const RPT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:wght@400;600;700:wght@400;600;700;800&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{
  background:linear-gradient(160deg,#0d1b2a 0%,#1a2e44 50%,#0d2233 100%) !important;
  min-height:100%;
}
body{
  font-family:'DM Sans','Arial',sans-serif;
  font-size:9pt;
  color:#111;
  background:linear-gradient(160deg,#0d1b2a 0%,#1a2e44 50%,#0d2233 100%);
  min-height:100vh;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}

/* 
   EACH .pg = ONE LETTER PAGE (8.5 × 11in)
   overflow:hidden keeps it fixed.
   flex-column lets header/content/footer
   divide the vertical space cleanly.
    */
.pg{
  width:8.5in;
  height:11in;
  display:flex;
  flex-direction:column;
  background:#fff;
  margin:0 auto 0.15in;
  box-shadow:0 2px 10px rgba(0,0,0,.14);
  overflow:hidden;
  position:relative;
}

/*  TOP STRIPE on every page  */
.pg-stripe{
  height:4px;
  background:linear-gradient(90deg,#1a5c35,#1a4060);
  flex-shrink:0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/*  RUNNING HEADER  */
.pg-hdr{
  flex-shrink:0;
  padding:6pt 0.7in 5pt;
  display:flex;align-items:center;justify-content:space-between;
  border-bottom:1.5px solid #1a5c35;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.pg-hdr-l{display:flex;align-items:center;gap:5pt;}
.pg-hdr-icon{
  width:13pt;height:13pt;background:#1a5c35;border-radius:2pt;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.pg-hdr-icon svg{width:8pt;height:8pt;}
.pg-hdr-org{font-weight:700;color:#1a5c35;font-size:6pt;text-transform:uppercase;letter-spacing:.3px;}
.pg-hdr-doc{font-size:5.5pt;color:#666;margin-top:1px;}
.pg-hdr-r{font-size:5.5pt;color:#888;text-align:right;line-height:1.8;}

/*  CONTENT  */
.pg-body{
  flex:1;
  padding:8pt 0.7in 0;
  overflow:hidden;
  /* Two-column layout helper */
}
.pg-body.cols2{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10pt;
}
.pg-body.cols2-3{
  display:grid;
  grid-template-columns:1.4fr 1fr;
  gap:10pt;
}

/*  RUNNING FOOTER  */
.pg-ftr{
  flex-shrink:0;
  padding:4pt 0.7in 6pt;
  display:flex;align-items:center;justify-content:space-between;
  border-top:1px solid #cce0d4;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.pg-ftr-c{flex:1;text-align:center;font-size:5.5pt;color:#bbb;}
.pg-ftr-r{font-size:6pt;font-weight:700;color:#555;min-width:46pt;text-align:right;}
.pg-ftr-l{font-size:5.5pt;color:#aaa;}

/* 
   COVER PAGE — full bleed, no stripe
    */
.cover{
  width:8.5in;height:11in;
  display:flex;flex-direction:column;
  background:#fff;
  margin:0 auto 0.15in;
  box-shadow:0 2px 10px rgba(0,0,0,.14);
  overflow:hidden;
}
.cov-band{height:0.26in;background:linear-gradient(135deg,#0a3d1f,#1a5c35,#1a4060);flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cov-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0.3in 0.9in 0.2in;text-align:center;}
.cov-emb{width:52pt;height:52pt;border-radius:50%;background:linear-gradient(145deg,#1a5c35,#1a4060);display:flex;align-items:center;justify-content:center;margin:0 auto 9pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cov-emb svg{width:27pt;height:27pt;}
.cov-min{font-size:6.5pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b8a74;margin-bottom:2pt;}
.cov-uni{font-size:11pt;font-weight:800;color:#1a5c35;margin-bottom:8pt;}
.cov-rule{width:32pt;height:2pt;background:linear-gradient(90deg,#1a5c35,#1a4060);margin:0 auto 8pt;border-radius:2pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cov-rtype{font-size:6.5pt;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#888;margin-bottom:6pt;}
.cov-title{font-size:17pt;font-weight:800;color:#0f1f18;line-height:1.2;margin-bottom:4pt;}
.cov-sub{font-size:9.5pt;color:#3a5a4a;margin-bottom:14pt;line-height:1.4;}
.cov-box{background:#f4f8f5;border:1px solid #cce0d4;border-radius:4pt;padding:8pt 13pt;width:100%;max-width:3.3in;text-align:left;margin-bottom:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cov-row{display:flex;justify-content:space-between;align-items:flex-start;padding:2.5pt 0;border-bottom:1px solid #e0ede5;font-size:7pt;}
.cov-row:last-child{border-bottom:none;}
.cov-k{color:#6b8a74;font-weight:700;flex-shrink:0;margin-right:5pt;}
.cov-v{color:#1a2b22;font-weight:600;text-align:right;word-break:break-word;max-width:58%;}
.cov-note{font-size:6pt;color:#999;max-width:3.4in;line-height:1.5;margin-bottom:8pt;}
/* Interviewer ID card */
.cov-id{background:linear-gradient(135deg,#0d3b66,#1a5fa8);border-radius:8pt;padding:10pt 14pt;width:100%;max-width:3.3in;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cov-id-name{color:#fff;font-size:13pt;font-weight:800;letter-spacing:-.02em;}
.cov-id-reg{color:rgba(255,255,255,.75);font-size:7.5pt;font-weight:600;margin-top:2pt;letter-spacing:.5px;}
.cov-id-email{color:rgba(255,255,255,.55);font-size:6.5pt;margin-top:1pt;}
.cov-id-badge{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:99pt;padding:2pt 8pt;font-size:6pt;color:rgba(255,255,255,.8);margin-top:5pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;}
.cov-bot{height:0.42in;background:#f4f8f5;border-top:2px solid #1a5c35;display:flex;align-items:center;justify-content:space-between;padding:0 0.7in;font-size:5.5pt;color:#6b8a74;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

/* 
   CONTENT ELEMENTS
    */
h2.sec{
  font-size:7.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.6px;
  color:#fff;background:linear-gradient(135deg,#0d3b66,#1a5fa8);
  padding:3.5pt 8pt;margin:7pt 0 5pt;border-radius:2pt;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
h2.sec:first-child{margin-top:0;}
h3.sub{
  font-size:7.5pt;font-weight:700;color:#1a5c35;
  border-left:2.5pt solid #1a5c35;padding-left:5pt;
  margin:5pt 0 3pt;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
p.bt{font-size:7.5pt;line-height:1.6;color:#1a2b22;margin-bottom:4pt;}
p.note{font-size:6.5pt;color:#6b8a74;font-style:italic;margin-bottom:3pt;}
.divider{height:1px;background:#e8f0e8;margin:5pt 0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

/* Table */
table.dt{width:100%;border-collapse:collapse;font-size:6.5pt;margin-bottom:5pt;}
table.dt thead{display:table-header-group;}
table.dt thead th{
  background:#1a5c35;color:#fff;
  padding:3pt 4.5pt;text-align:left;font-weight:700;font-size:6pt;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
table.dt thead th.c{text-align:center;}
table.dt tbody td{padding:2.5pt 4.5pt;border-bottom:1px solid #e0ede0;font-size:6.5pt;vertical-align:top;}
table.dt tbody tr:nth-child(even) td{background:#f6fbf6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
table.dt tbody td.lbl{font-weight:600;color:#1a5c35;white-space:nowrap;}
table.dt tbody td.c{text-align:center;}
table.dt tfoot td{
  font-weight:800;background:#e8f5ed;padding:3pt 4.5pt;
  border-top:1.5px solid #1a5c35;font-size:6.5pt;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* Bars */
.ir{display:flex;align-items:center;gap:5pt;margin-bottom:3pt;}
.il{font-size:6.5pt;font-weight:600;width:90pt;flex-shrink:0;}
.it{flex:1;height:6pt;background:#e8f0e8;border-radius:99pt;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.if{height:100%;border-radius:99pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.ip{font-size:6pt;font-weight:700;min-width:44pt;text-align:right;}

/* Stat boxes */
.sr{display:flex;gap:3pt;margin-bottom:5pt;}
.sb{
  flex:1;background:#f4f8f5;border:1px solid #cce0d4;
  border-radius:3pt;padding:4pt 3pt;text-align:center;
  border-top:2pt solid #1a5c35;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.sb.red{border-top-color:#c0392b;background:#fdf4f4;}
.sb.amb{border-top-color:#e67e22;background:#fefbf4;}
.sb.blu{border-top-color:#1a4060;background:#f4f6fb;}
.sn{font-size:11pt;font-weight:800;line-height:1;color:#1a5c35;}
.sb.red .sn{color:#c0392b;}.sb.amb .sn{color:#e67e22;}.sb.blu .sn{color:#1a4060;}
.sl{font-size:5pt;font-weight:700;text-transform:uppercase;letter-spacing:.2px;color:#888;margin-top:1.5pt;}

/* Flag boxes */
.fc,.fw,.fg{padding:3.5pt 7pt;margin-bottom:3pt;font-size:7pt;border-radius:0 2pt 2pt 0;}
.fc{background:#fdf4f4;border-left:2.5pt solid #c0392b;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.fw{background:#fefbf4;border-left:2.5pt solid #e67e22;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.fg{background:#f4fbf4;border-left:2.5pt solid #1a5c35;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.ft{font-weight:700;margin-bottom:1pt;}
.fc .ft{color:#c0392b;}.fw .ft{color:#e67e22;}.fg .ft{color:#1a5c35;}
.fb{color:#333;line-height:1.45;font-size:6.5pt;}

/* Signatures */
.sigs{display:flex;gap:10pt;margin-top:8pt;padding-top:6pt;border-top:1px solid #cce0d4;}
.sig{flex:1;}
.sig-l{border-bottom:1px solid #333;height:16pt;margin-bottom:2pt;}
.sig-n{font-size:6.5pt;font-weight:700;color:#1a2b22;}
.sig-s{font-size:5.5pt;color:#888;margin-top:1pt;}

/* 
   PRINT
   Browser handles pagination.
   Each .pg / .cover = one sheet.
    */
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  html,body{background:#fff!important;margin:0!important;padding:0!important;}
  .cover,.pg{
    box-shadow:none!important;
    margin:0!important;
    page-break-after:always!important;
  }
  .cover:last-child,.pg:last-child{page-break-after:auto!important;}
  /* Group report — parchment background must survive print */
  .pg.grp,.cover.grp-cover{background:#FDF8EC!important;}
}
@page{size:letter portrait;margin:0;}
`;


// 
//  HELPERS
// 
function _pct(a,b){return b>0?Math.round(a/b*100):0;}
// _rfield: reads from flat record OR raw_json (handles both storage formats)
function _rfield(r,f){
  if(r[f]!==undefined&&r[f]!==null) return r[f];
  try{
    const raw=r._rawParsed||(r._rawParsed=typeof r.raw_json==='string'?JSON.parse(r.raw_json||'{}'):(r.raw_json||{}));
    return raw[f]??null;
  }catch(e){return null;}
}
// Field name aliases: flat export names → raw_json field names
const _FIELD_MAP={
  latrine:'g_latrine', water_treated:'h_treat', hiv_heard:'f_heard',
  hiv_tested:'f_tested', deaths_5yr:'c_deaths', deaths_count:'c_deaths_n',
  house_type:'b_type', respondent_gender:'a_gender', respondent_age:'a_age',
  illnesses:'c_ill', location:'interview_location'
};
function _rget(r,f){
  const v=_rfield(r,f);
  if(v!==null&&v!==undefined) return v;
  const alt=_FIELD_MAP[f];
  return alt?_rfield(r,alt):null;
}
function _cnt(arr,f,v){return arr.filter(r=>_rget(r,f)===v).length;}
function _avg(arr,f){const v=arr.map(r=>parseInt(_rget(r,f))||0).filter(x=>x>0);return v.length?Math.round(v.reduce((a,b)=>a+b)/v.length):0;}
function _ills(arr){
  const c={};
  arr.forEach(r=>{
    const val=_rget(r,'illnesses')||_rget(r,'c_ill')||'';
    [].concat(val).forEach(x=>String(x).split(',').forEach(seg=>{const k=seg.trim();if(k&&k.toLowerCase()!=='none'&&k.length>1)c[k]=(c[k]||0)+1;}));
  });
  return Object.entries(c).sort((a,b)=>b[1]-a[1]);
}
function _flags(r){
  const f=[];
  const lat=_rget(r,'g_latrine')||_rget(r,'latrine');
  const wat=_rget(r,'h_treat')||_rget(r,'water_treated');
  const hiv=_rget(r,'f_heard')||_rget(r,'hiv_heard');
  if(lat==='No')  f.push('No pit latrine — open defecation risk');
  if(wat==='No')  f.push('Untreated drinking water');
  if(hiv==='No')  f.push('No HIV/AIDS awareness');
  try{
    const raw=r._rawParsed||(r._rawParsed=typeof r.raw_json==='string'?JSON.parse(r.raw_json||'{}'):(r.raw_json||{}));
    if(raw.i_circ==='Female'||raw.i_circ==='Both') f.push('FGM reported — requires referral');
    if(raw.b_smoke_in==='Yes') f.push('Indoor smoking — passive smoke risk');
  }catch(e){ console.error('[_riskFlags] raw_json parse error:', e); }
  return f;
}
const S=(p,t)=>p>=t
  ?'<span style="color:#1a5c35;font-weight:700">&#10003;</span>'
  :'<span style="color:#c0392b;font-weight:700">&#10007;</span>';

// Page header
function _getInstName(){
  try{ return JSON.parse(localStorage.getItem('chsa_auth')||'null')?.institution_name || 'Medical Survey System (MSS)'; }catch(e){ return 'Medical Survey System (MSS)'; }
}

// Cached institution profile — fetched once per report session from institution_profiles table.
// Returns { inst_name, admin_name, contact_email, contact_phone, county, sub_county, ward,
//           village_list, login_date, survey_enabled, logo_url, banner_url, group_photo_url } or {} on failure.
let _instProfileCache = null;
async function _fetchInstProfile() {
  if (_instProfileCache) return _instProfileCache;
  try {
    const sess = JSON.parse(localStorage.getItem('chsa_auth') || 'null');
    const institution_id = sess?.institution_id;
    if (!institution_id) return {};
    if (window.HS?.HSAdmin?.getInstitutionProfile) {
      const prof = await window.HS.HSAdmin.getInstitutionProfile(institution_id);
      const raw = prof || {};
      // Alias stored field names to the names expected by cover/header renderers.
      // Admin saves the institution logo as logo_image; reports look for logo_url.
      // Admin saves the interviewers group photo as group_photo; group report looks for group_photo_url.
      // cover_image is a legacy banner field — kept for backward compat.
      if (raw.logo_image  && !raw.logo_url)         raw.logo_url         = raw.logo_image;
      if (raw.group_photo && !raw.group_photo_url)   raw.group_photo_url  = raw.group_photo;
      if (raw.cover_image && !raw.banner_url)        raw.banner_url       = raw.cover_image;
      // If no dedicated group_photo, fall back to cover_image for group_photo_url
      if (!raw.group_photo_url && raw.cover_image)   raw.group_photo_url  = raw.cover_image;
      _instProfileCache = raw;
      return _instProfileCache;
    }
  } catch (e) { console.error('[_fetchInstProfile] error:', e); }
  return {};
}
function _hdr(docName, type, date){
  const org = _getInstName();
  return '<div class="pg-stripe"></div>'
    +'<div class="pg-hdr">'
    +'<div class="pg-hdr-l">'
    +'<div class="pg-hdr-icon"><svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="6" fill="#1a5c35"/><path d="M24 10L24 38M10 24L38 24" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg></div>'
    +'<div><div class="pg-hdr-org">'+org+'</div>'
    +'<div class="pg-hdr-doc">'+docName+'</div></div>'
    +'</div>'
    +'<div class="pg-hdr-r">'+type+'<br>'+date+'</div>'
    +'</div>';
}
// Page footer
function _ftr(num, total, note){
  const org = _getInstName();
  return '<div class="pg-ftr">'
    +'<div class="pg-ftr-l">'+(note||'Medical Survey System (MSS) &middot; '+org)+'</div>'
    +'<div class="pg-ftr-c">Confidential &mdash; For Official Use Only</div>'
    +'<div class="pg-ftr-r">Page '+num+' of '+total+'</div>'
    +'</div>';
}
// Assemble one page
function _pg(header, footer, bodyClass, content){
  return '<div class="pg">'
    +header
    +'<div class="pg-body'+(bodyClass?' '+bodyClass:'')+'">'
    +content
    +'</div>'
    +footer
    +'</div>';
}
// Indicator bar
function _bar(label, val, max, col){
  const p=_pct(val,max);
  const c=col||(p>=70?'#1a5c35':p>=50?'#e67e22':'#c0392b');
  return '<div class="ir">'
    +'<div class="il">'+label+'</div>'
    +'<div class="it"><div class="if" style="width:'+p+'%;background:'+c+'"></div></div>'
    +'<div class="ip" style="color:'+(p>=70?'#1a5c35':p>=50?'#e67e22':'#c0392b')+'">'+val+'/'+max+' ('+p+'%)</div>'
    +'</div>';
}
// Stat box
function _sb(n,l,cls){
  return '<div class="sb'+(cls?' '+cls:'')+'">'
    +'<div class="sn">'+n+'</div>'
    +'<div class="sl">'+l+'</div>'
    +'</div>';
}
// Flag box
function _fl(lvl, title, body){
  const cls=lvl==='critical'?'fc':lvl==='warning'?'fw':'fg';
  const ico=lvl==='good'?'&#10003;':'&#9888;';
  return '<div class="'+cls+'"><div class="ft">'+ico+' '+title+'</div><div class="fb">'+body+'</div></div>';
}
// Cover page
// prof: optional institution profile object { logo_url, banner_url, group_photo_url, county, sub_county, ward, village_list }
function _cover(title, subtitle, metaRows, reportType, idCard, prof){
  const now=new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const org = _getInstName();
  prof = prof || {};

  // Banner image (top strip of cover body) — institution banner or group photo
  const bannerImg = prof.banner_url || prof.group_photo_url || '';
  const bannerBlock = bannerImg
    ? '<div style="width:100%;max-width:3.5in;height:72pt;border-radius:6pt;overflow:hidden;margin-bottom:10pt;border:1.5px solid #cce0d4;-webkit-print-color-adjust:exact;print-color-adjust:exact">'
      +'<img src="'+bannerImg+'" style="width:100%;height:100%;object-fit:cover" crossorigin="anonymous"/>'
      +'</div>'
    : '';

  // Logo — left of emblem circle
  const logoBlock = prof.logo_url
    ? '<div style="width:50pt;height:50pt;border-radius:10pt;overflow:hidden;margin-bottom:8pt;border:2px solid #cce0d4;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact">'
      +'<img src="'+prof.logo_url+'" style="width:100%;height:100%;object-fit:contain" crossorigin="anonymous"/>'
      +'</div>'
    : '<div class="cov-emb"><svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M24 10L24 38M10 24L38 24" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="24" r="14" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/></svg></div>';

  // Location rows from profile
  const locRows=[];
  if(prof.county)      locRows.push(['County', prof.county]);
  if(prof.sub_county)  locRows.push(['Sub-County', prof.sub_county]);
  if(prof.ward)        locRows.push(['Ward', prof.ward]);
  if(prof.village_list){
    const vl=Array.isArray(prof.village_list)?prof.village_list.join(', '):String(prof.village_list);
    if(vl) locRows.push(['Villages / Areas', vl]);
  }

  const allMeta=[...metaRows, ...locRows];

  return '<div class="cover">'
    +'<div class="cov-band"></div>'
    +'<div class="cov-body">'
    +bannerBlock
    +logoBlock
    +'<div class="cov-min">Republic of Kenya &nbsp;&middot;&nbsp; Ministry of Health</div>'
    +'<div class="cov-uni">'+org+'</div>'
    +'<div class="cov-rule"></div>'
    +'<div class="cov-rtype">'+reportType+'</div>'
    +'<div class="cov-title">'+title+'</div>'
    +'<div class="cov-sub">'+subtitle+'</div>'
    +(idCard||'')
    +'<div class="cov-box" style="margin-top:10pt">'
    +allMeta.map(([k,v])=>'<div class="cov-row"><span class="cov-k">'+k+'</span><span class="cov-v">'+(v||'&mdash;')+'</span></div>').join('')
    +'<div class="cov-row"><span class="cov-k">Date Generated</span><span class="cov-v">'+now+'</span></div>'
    +'</div>'
    +'<p class="cov-note">Produced under the Community Health Situation Analysis programme at '+org+'.</p>'
    +'</div>'
    +'<div class="cov-bot">'
    +'<div style="display:flex;align-items:center;gap:5px"><svg width="14" height="14" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="7" fill="#1a5c35"/><path d="M24 10L24 38M10 24L38 24" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg><strong style="color:#1a5c35;font-size:6pt">Medical Survey System (MSS) v3.1</strong></div>'
    +'<div>Built by HazzinBR &middot; '+org+'</div>'
    +'<div>Confidential &mdash; For Official Use Only</div>'
    +'</div>'
    +'</div>';
}
// Document wrapper
function _doc(title, pages){
  return '<!DOCTYPE html><html lang="en"><head>'
    +'<meta charset="UTF-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>'+title+'</title>'
    +'<style>'+RPT_CSS+'</style>'
    +'<style>html,body{background:linear-gradient(160deg,#0d1b2a 0%,#1a2e44 50%,#0d2233 100%)!important;}</style>'
    +'</head><body style="background:linear-gradient(160deg,#0d1b2a 0%,#1a2e44 50%,#0d2233 100%);padding:0.25in 0;">'
    +pages
    +'</body></html>';
}
// Signatures
function _sigs(people){
  return '<div class="sigs">'
    +people.map(([name,label])=>'<div class="sig"><div class="sig-l"></div><div class="sig-n">'+name+'</div><div class="sig-s">'+label+'</div></div>').join('')
    +'</div>';
}


// ─── STUDENT REPORT HELPERS ───────────────────────────────────────────────────
// Used by buildBriefReport / buildFullReport / buildIMRaDReport.
// These were referenced throughout but never defined — root cause of all three
// student report types silently producing "X is not defined" runtime errors.
// ─────────────────────────────────────────────────────────────────────────────

// Shared base CSS injected into every student report <style> block.
// Includes @page (A4 portrait) and full @media print rules.
const RPT_BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Merriweather:wght@400;700&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{background:linear-gradient(160deg,#0d1b2a 0%,#1a2e44 50%,#0d2233 100%)!important;min-height:100%;}
body{
  font-family:'DM Sans',Arial,sans-serif;
  font-size:9.5pt;color:#111;
  background:linear-gradient(160deg,#0d1b2a 0%,#1a2e44 50%,#0d2233 100%);
  padding:0.2in 0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ── COVER PAGE ─────────────────────────────── */
.rpt-cover{
  width:210mm;min-height:297mm;
  display:flex;flex-direction:column;
  background:#fff;margin:0 auto 0.15in;
  box-shadow:0 4px 20px rgba(0,0,0,.22);
  overflow:hidden;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.rpt-cov-band{
  height:0.28in;
  background:linear-gradient(90deg,#0a3d1f,#1a5c35,#1a4060);
  flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.rpt-cov-body{
  flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:0.35in 1in 0.25in;text-align:center;
}
.rpt-cov-emblem{
  width:58pt;height:58pt;border-radius:50%;
  background:linear-gradient(145deg,#1a5c35,#1a4060);
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 10pt;
  box-shadow:0 4px 18px rgba(26,92,53,.4);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.rpt-cov-emblem svg{width:30pt;height:30pt;}
.rpt-cov-ministry{font-size:6.5pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b8a74;margin-bottom:3pt;}
.rpt-cov-inst{font-size:12pt;font-weight:800;color:#1a5c35;margin-bottom:9pt;line-height:1.2;}
.rpt-cov-rule{width:36pt;height:2.5pt;background:linear-gradient(90deg,#1a5c35,#1a4060);margin:0 auto 10pt;border-radius:99pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.rpt-cov-rtype{font-size:6.5pt;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#999;margin-bottom:7pt;}
.rpt-cov-title{font-size:19pt;font-weight:800;color:#0f1f18;line-height:1.15;margin-bottom:5pt;}
.rpt-cov-sub{font-size:10pt;color:#3a5a4a;margin-bottom:16pt;line-height:1.45;}
.rpt-cov-idcard{
  background:linear-gradient(135deg,#0d3b66,#1a5fa8);
  border-radius:10pt;padding:12pt 18pt;width:100%;max-width:3.5in;
  text-align:center;margin-bottom:12pt;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.rpt-cov-idcard-name{color:#fff;font-size:14pt;font-weight:800;letter-spacing:-.02em;}
.rpt-cov-idcard-reg{color:rgba(255,255,255,.8);font-size:8pt;font-weight:600;margin-top:3pt;letter-spacing:.5px;}
.rpt-cov-idcard-role{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:99pt;padding:2.5pt 9pt;font-size:6pt;color:rgba(255,255,255,.85);margin-top:6pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.rpt-cov-meta{background:#f4f8f5;border:1px solid #cce0d4;border-radius:5pt;padding:9pt 14pt;width:100%;max-width:3.5in;text-align:left;margin-bottom:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.rpt-cov-row{display:flex;justify-content:space-between;align-items:flex-start;padding:3pt 0;border-bottom:1px solid #e0ede5;font-size:7pt;}
.rpt-cov-row:last-child{border-bottom:none;}
.rpt-cov-k{color:#6b8a74;font-weight:700;flex-shrink:0;margin-right:6pt;}
.rpt-cov-v{color:#1a2b22;font-weight:600;text-align:right;word-break:break-word;max-width:60%;}
.rpt-cov-note{font-size:6pt;color:#aaa;max-width:3.5in;line-height:1.6;margin-bottom:8pt;}
.rpt-cov-bot{
  height:0.46in;background:#f4f8f5;border-top:2px solid #1a5c35;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 0.6in;font-size:5.5pt;color:#6b8a74;flex-shrink:0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ── CONTENT PAGE ───────────────────────────── */
.page{
  width:210mm;min-height:297mm;
  background:#fff;margin:0 auto 0.15in;
  box-shadow:0 4px 20px rgba(0,0,0,.18);
  overflow:hidden;display:flex;flex-direction:column;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.page-stripe{height:4px;background:linear-gradient(90deg,#1a5c35,#1a4060);flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

/* Running header */
.rpt-hdr{
  background:linear-gradient(135deg,#0a3d1f,#1a5c35);color:#fff;
  padding:11px 28px 9px;
  display:flex;align-items:flex-start;justify-content:space-between;
  flex-shrink:0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.rpt-hdr-left{flex:1;}
.rpt-hdr-org{font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;opacity:.75;margin-bottom:2px;}
.rpt-hdr-title{font-size:12pt;font-weight:800;line-height:1.2;margin-bottom:2px;}
.rpt-hdr-sub{font-size:7pt;opacity:.7;}
.rpt-hdr-badge{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:99px;padding:4px 12px;font-size:6.5pt;font-weight:700;letter-spacing:.5px;white-space:nowrap;margin-left:14px;margin-top:4px;}

/* Metadata strip */
.rpt-meta{background:#f4f8f5;border-bottom:1.5px solid #cce0d4;padding:7px 28px;flex-shrink:0;}
.rpt-meta table{width:100%;border-collapse:collapse;font-size:7.5pt;}
.rpt-meta td{padding:2.5px 8px 2.5px 0;color:#555;}
.rpt-meta td:first-child{font-weight:700;color:#1a5c35;width:28%;white-space:nowrap;}

/* Body */
.body{flex:1;padding:14px 28px 10px;overflow:hidden;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;}

/* Section bar */
.rpt-sec{
  font-size:7pt;font-weight:800;text-transform:uppercase;letter-spacing:.7px;
  color:#fff;background:linear-gradient(135deg,#1a5c35,#1a4060);
  padding:4.5px 11px;margin:14px 0 8px;border-radius:3px;
  display:flex;align-items:center;gap:6px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* Stat tiles */
.rpt-stat{background:#f9fafb;border:1px solid #e5e7eb;border-top:2.5px solid #1a5c35;border-radius:6px;padding:7px 10px;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.rpt-stat-lbl{color:#6b7280;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px;}
.rpt-stat-val{font-weight:700;color:#1a2b22;font-size:9.5pt;}
.rpt-stat.red{border-top-color:#c0392b;background:#fdf4f4;}
.rpt-stat.amber{border-top-color:#e67e22;background:#fefbf4;}

/* Flag boxes */
.rpt-flag{padding:8px 12px;border-radius:6px;font-size:8pt;margin-bottom:6px;line-height:1.5;}
.rpt-flag-red  {background:#fdecea;border-left:3.5px solid #c0392b;color:#7b241c;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.rpt-flag-amber{background:#fff8e1;border-left:3.5px solid #f39c12;color:#7d4e00;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.rpt-flag-ok   {background:#e8f5ed;border-left:3.5px solid #1a5c35;color:#1a5c35;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

/* Data table */
table.rpt-tbl{width:100%;border-collapse:collapse;font-size:7.5pt;margin-bottom:8px;}
table.rpt-tbl thead th{background:#1a5c35;color:#fff;padding:4pt 6pt;font-weight:700;font-size:7pt;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
table.rpt-tbl tbody td{padding:3.5pt 6pt;border-bottom:1px solid #e8f0e8;vertical-align:top;}
table.rpt-tbl tbody tr:nth-child(even) td{background:#f6fbf6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
table.rpt-tbl tbody td.lbl{font-weight:600;color:#1a5c35;}
table.rpt-tbl tbody td.c{text-align:center;}

/* Narrative body text */
p.rpt-p{font-size:8.5pt;line-height:1.65;color:#1a2b22;margin-bottom:6pt;}
p.rpt-note{font-size:7pt;color:#6b8a74;font-style:italic;margin-bottom:4pt;}

/* Summary box */
.summary-box{background:linear-gradient(135deg,#f9f7f4,#edf5ee);border:1px solid #cce0d4;border-radius:10px;padding:13px 16px;margin-bottom:14px;}
.summary-text{font-size:8.5pt;line-height:1.72;color:#1a2b22;}
.summary-text b{color:#1a5c35;}
.summary-text .red{color:#c0392b;font-weight:700;}

/* Signatures */
.rpt-sigs{display:flex;gap:20px;margin:18px 0 8px;padding-top:12px;border-top:1px solid #cce0d4;}
.rpt-sig{flex:1;}
.rpt-sig-line{border-bottom:1px solid #333;height:20px;margin-bottom:3px;}
.rpt-sig-name{font-size:7pt;font-weight:700;color:#1a2b22;}
.rpt-sig-role{font-size:6pt;color:#888;margin-top:1px;}

/* Print button */
.rpt-print-bar{text-align:center;padding:16px 0 20px;background:#f4f8f5;border-top:1px solid #cce0d4;flex-shrink:0;}
.rpt-print-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 30px;background:linear-gradient(135deg,#1a5c35,#1a4060);color:#fff;border:none;border-radius:9px;font-family:inherit;font-size:.88rem;font-weight:700;cursor:pointer;box-shadow:0 3px 12px rgba(26,92,53,.3);}

@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  html,body{background:#fff!important;margin:0!important;padding:0!important;}
  .rpt-cover,.page{
    width:100%!important;min-height:unset!important;
    margin:0!important;padding:0!important;
    border-radius:0!important;box-shadow:none!important;
    page-break-after:always!important;
  }
  .rpt-cover:last-child,.page:last-child{page-break-after:auto!important;}
  .rpt-print-bar{display:none!important;}
}
@page{size:A4 portrait;margin:0;}
`;

// Page header banner
function rptHeader(org, title, sub, accentLeft, accentRight){
  const _org = org || _getInstName();
  const _acL = accentLeft  || '#0a3d1f';
  const _acR = accentRight || '#1a5c35';
  return `<div class="rpt-hdr" style="background:linear-gradient(135deg,${_acL},${_acR})">
    <div class="rpt-hdr-left">
      <div class="rpt-hdr-org">${_org} &nbsp;&middot;&nbsp; Ministry of Health Kenya</div>
      <div class="rpt-hdr-title">${title||'Health Report'}</div>
      <div class="rpt-hdr-sub">${sub||''}</div>
    </div>
    <div class="rpt-hdr-badge">CONFIDENTIAL</div>
  </div>`;
}

// Metadata strip — key/value table
function rptMeta(rows){
  return `<div class="rpt-meta"><table><tbody>${
    rows.map(([k,v])=>`<tr><td>${k}</td><td>${v||'&mdash;'}</td></tr>`).join('')
  }</tbody></table></div>`;
}

// Bold section heading bar
function rptSec(label){
  return `<div class="rpt-sec">${label}</div>`;
}

// Single key-value stat tile
function rptStat(label, value){
  const v = (value===undefined||value===null||value==='')?'&mdash;':value;
  return `<div class="rpt-stat"><div class="rpt-stat-lbl">${label}</div><div class="rpt-stat-val">${v}</div></div>`;
}

// Coloured flag/alert box  level: 'red' | 'amber' | 'ok'
function rptFlag(text, level){
  const cls = level==='red'?'rpt-flag-red':level==='amber'?'rpt-flag-amber':'rpt-flag-ok';
  return `<div class="rpt-flag ${cls}">${text}</div>`;
}

// Signature block
function rptSig(){
  const org = _getInstName();
  return `<div class="rpt-sigs">
    <div class="rpt-sig"><div class="rpt-sig-line"></div><div class="rpt-sig-name">Interviewer</div><div class="rpt-sig-role">Community Health Interviewer &middot; ${org}</div></div>
    <div class="rpt-sig"><div class="rpt-sig-line"></div><div class="rpt-sig-name">Supervisor</div><div class="rpt-sig-role">Faculty Supervisor &middot; ${org}</div></div>
    <div class="rpt-sig"><div class="rpt-sig-line"></div><div class="rpt-sig-name">Course Coordinator</div><div class="rpt-sig-role">Community Health &middot; ${org}</div></div>
  </div>`;
}

// Print button bar at bottom of every student report
function rptPrintBtn(){
  return `<div class="rpt-print-bar">
    <button class="rpt-print-btn" onclick="window.print()">&#128438; Print / Save as PDF</button>
    <div style="font-size:7pt;color:#888;margin-top:6px;">Browser Print &rarr; Save as PDF &rarr; A4 Portrait</div>
  </div>`;
}

// ── STUDENT REPORT COVER PAGE ─────────────────────────────────────────────
// Generates a full A4 cover page for Brief / Full / IMRaD student reports.
// reportType: 'BRIEF REPORT' | 'FULL REPORT' | 'IMRaD REPORT'
// accentA/B: gradient colours for the ID card
function buildStudentCoverPage(r, reportType, accentA, accentB){
  const now   = new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const inst  = _getInstName();
  const name  = r.interviewer_name || getUserName() || '—';
  const date  = r.interview_date   || now;
  const loc   = r.interview_location || r.interview_location_custom || '—';
  const resp  = `${r.a_age||'?'} yrs · ${r.a_gender||'?'} · ${r.a_marital||'?'}`;
  accentA = accentA||'#0d3b66'; accentB = accentB||'#1a5fa8';
  return `
<div class="rpt-cover">
  <div class="rpt-cov-band"></div>
  <div class="rpt-cov-body">
    <div class="rpt-cov-emblem">
      <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 10L24 38M10 24L38 24" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
        <circle cx="24" cy="24" r="14" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
      </svg>
    </div>
    <div class="rpt-cov-ministry">Republic of Kenya &nbsp;&middot;&nbsp; Ministry of Health</div>
    <div class="rpt-cov-inst">${inst}</div>
    <div class="rpt-cov-rule"></div>
    <div class="rpt-cov-rtype">${reportType}</div>
    <div class="rpt-cov-title">Community Health<br>Situation Analysis</div>
    <div class="rpt-cov-sub">Household Interview Report</div>
    <div class="rpt-cov-idcard" style="background:linear-gradient(135deg,${accentA},${accentB})">
      <div class="rpt-cov-idcard-name">${name}</div>
      <div class="rpt-cov-idcard-reg">Community Health Interviewer</div>
      <div class="rpt-cov-idcard-role">${inst}</div>
    </div>
    <div class="rpt-cov-meta">
      <div class="rpt-cov-row"><span class="rpt-cov-k">Interview Date</span><span class="rpt-cov-v">${date}</span></div>
      <div class="rpt-cov-row"><span class="rpt-cov-k">Location</span><span class="rpt-cov-v">${loc}</span></div>
      <div class="rpt-cov-row"><span class="rpt-cov-k">Respondent</span><span class="rpt-cov-v">${resp}</span></div>
      <div class="rpt-cov-row"><span class="rpt-cov-k">Date Generated</span><span class="rpt-cov-v">${now}</span></div>
    </div>
    <p class="rpt-cov-note">Produced under the Community Health Situation Analysis programme at ${inst}.<br>CONFIDENTIAL — For Official Use Only</p>
  </div>
  <div class="rpt-cov-bot">
    <div style="display:flex;align-items:center;gap:5px">
      <svg width="13" height="13" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="7" fill="#1a5c35"/><path d="M24 10L24 38M10 24L38 24" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>
      <strong style="color:#1a5c35;font-size:6pt">Medical Survey System (MSS) v3.1</strong>
    </div>
    <div>Built by HazzinBR &middot; ${inst}</div>
    <div>Confidential &mdash; For Official Use Only</div>
  </div>
</div>`;
}

// Extract red flags and amber concerns from a raw survey record
function extractFlags(r){
  const flags=[], concerns=[];
  if(r.g_latrine==='No')                      flags.push('No pit latrine — open defecation risk');
  if(r.h_treat==='No')                        flags.push('Untreated drinking water');
  if(r.f_heard==='No')                        flags.push('No HIV/AIDS awareness');
  if(r.i_circ==='Female'||r.i_circ==='Both') flags.push('FGM reported — requires referral');
  if(r.b_smoke_in==='Yes')                    flags.push('Indoor smoking — passive smoke risk');
  if(r.c_deaths==='Yes')                      concerns.push('Household deaths in past 5 years reported');
  if(r.e_enough==='No')                       concerns.push('Food insufficiency — possible malnutrition risk');
  if(r.e_skip==='Yes')                        concerns.push('Household skips meals');
  if(r.f_tested!=='Yes')                      concerns.push('Respondent has not been tested for HIV');
  if(r.b_type==='Temporary')                  concerns.push('Temporary housing — environmental health risk');
  const ills=[].concat(r.c_ill||[]).filter(Boolean);
  if(ills.length)                             concerns.push('Illness reported: '+ills.join(', '));
  return {flags, concerns};
}

// SVG pie/donut chart — items: [{label, val, col}], size: px
function _pie(items, size){
  const sz = size||100;
  const total = items.reduce((s,x)=>s+(x.val||0),0);
  if(!total) return '<div style="font-size:7pt;color:#aaa">No data</div>';
  const r=sz*0.38, cx=sz/2, cy=sz/2;
  let svgParts='', legendParts='', angle=-Math.PI/2;
  items.forEach(item=>{
    const pct=(item.val||0)/total;
    const sweep=pct*2*Math.PI;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    angle+=sweep;
    const x2=cx+r*Math.cos(angle), y2=cy+r*Math.sin(angle);
    const large=sweep>Math.PI?1:0;
    svgParts+=`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${item.col||'#888'}" stroke="#fff" stroke-width="1"/>`;
    legendParts+=`<div style="display:flex;align-items:center;gap:4px;font-size:6pt;margin-bottom:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${item.col||'#888'};flex-shrink:0"></span>${item.label} (${Math.round(pct*100)}%)</div>`;
  });
  return `<div style="display:flex;align-items:flex-start;gap:10px">
    <svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" style="flex-shrink:0">${svgParts}</svg>
    <div style="padding-top:4px">${legendParts}</div>
  </div>`;
}

// Inline horizontal bar chart (used in group report extended section)
function _barChart(items){
  if(!items||!items.length) return '';
  const max=Math.max(...items.map(x=>x.val||0))||1;
  return items.map(item=>{
    const pct=Math.round((item.val||0)/max*100);
    return `<div class="ir"><div class="il">${item.label}</div><div class="it"><div class="if" style="width:${pct}%;background:${item.col||'#1a5c35'}"></div></div><div class="ip">${item.val}</div></div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────

// 
//  REPORT 1 — INDIVIDUAL INTERVIEWER
//  Pages: Cover · Body (flows to as many pages as needed)
//  The body is ONE continuous .pg with overflow:hidden per page.
//  For 15-20 cases the Results page has a compact case table.
//  Extra cases flow naturally — browser handles extra pages.
// 
async function buildInterviewerReport(interviewer, records, student){
  student = student||{full_name:interviewer, reg_number:'—', email:'—'};
  const n = records.length;
  if(!n) return _doc('No_Records','<p style="padding:1in">No records found for '+interviewer+'.</p>');

  const now     = new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const dates   = records.map(r=>r.interview_date||'').filter(Boolean).sort();
  const period  = dates.length>1?dates[0]+' to '+dates[dates.length-1]:dates[0]||now;
  const locs    = [...new Set(records.map(r=>r.location||'').filter(Boolean))];
  const locStr  = locs.join(', ')||'';
  const fullName= student.full_name||interviewer;
  const regNo   = student.reg_number||'—';
  const email   = student.email||'—';

  // Student photos
  const profilePhoto   = student.profile_photo_url   || '';
  const evidencePhoto1 = student.field_photo_1_url   || '';
  const evidencePhoto2 = student.field_photo_2_url   || '';

  // Metrics
  const lat  = _cnt(records,'latrine','Yes');
  const wat  = _cnt(records,'water_treated','Yes');
  const hiv  = _cnt(records,'hiv_heard','Yes');
  const tst  = _cnt(records,'hiv_tested','Yes');
  const dHH  = _cnt(records,'deaths_5yr','Yes');
  const dTot = records.reduce((s,r)=>s+(parseInt(r.deaths_count)||0),0);
  const perm = _cnt(records,'house_type','Permanent');
  const semi = _cnt(records,'house_type','Semi-permanent');
  const tmp  = _cnt(records,'house_type','Temporary');
  const fem  = _cnt(records,'respondent_gender','Female');
  const mal  = _cnt(records,'respondent_gender','Male');
  const aAge = _avg(records,'respondent_age');
  const ills = _ills(records);
  const allF = [];
  records.forEach(r=>_flags(r).forEach(f=>allF.push({r,f})));

  // Recommendations
  const recomList = [];
  if(_pct(lat,n)<80)  recomList.push({l:'critical',t:'Sanitation: Latrine Programme',b:'Coverage '+_pct(lat,n)+'% below 80% national target. The '+(n-lat)+' household'+(n-lat!==1?'s':'')+' without latrines require immediate CLTS follow-up. Escalate to Sub-County Sanitation Officer within 30 days.'});
  if(_pct(wat,n)<80)  recomList.push({l:'critical',t:'Safe Water Intervention',b:'Only '+_pct(wat,n)+'% treat drinking water. Distribute WaterGuard chlorine solution; conduct community demonstrations on safe water storage and handling.'});
  if(_pct(hiv,n)<90)  recomList.push({l:'critical',t:'HIV/AIDS Health Education',b:'Awareness at '+_pct(hiv,n)+'% falls below the UNAIDS 90% target. Deploy Community Health Workers for door-to-door education. Establish mobile VCT outreach in '+locStr+'.'});
  if(_pct(tst,n)<50)  recomList.push({l:'warning',t:'HIV Testing Uptake',b:'Only '+_pct(tst,n)+'% have been tested for HIV. Integrate routine testing into all community health visits and facility-based services.'});
  if(ills.length&&ills[0][1]>n*0.2) recomList.push({l:'warning',t:ills[0][0]+' Prevention',b:ills[0][0]+' affects '+ills[0][1]+' households ('+_pct(ills[0][1],n)+'%). Targeted prevention, early diagnosis and treatment access recommended.'});
  if(dHH>0)           recomList.push({l:'warning',t:'Mortality Follow-Up',b:dHH+' household'+(dHH!==1?'s':'')+' reported '+dTot+' death'+(dTot!==1?'s':'')+' in 5 years. Conduct verbal autopsy to determine cause-specific mortality.'});
  if(!recomList.length) recomList.push({l:'good',t:'Maintain Surveillance',b:'All key indicators are within acceptable ranges. Continue routine community health surveillance and household follow-up visits every 6 months.'});
  if(allF.filter(x=>x.f.includes('FGM')).length) recomList.push({l:'critical',t:'FGM Case Referral',b:'FGM reported in '+allF.filter(x=>x.f.includes('FGM')).length+' household'+(allF.filter(x=>x.f.includes('FGM')).length!==1?'s':'')+'. Refer immediately to GBV response team and Sub-County Anti-FGM Coordinator.'});

  const H = (pg,tot)=>_hdr(fullName+' — Field Report','Interviewer Report · Pg '+pg+'/'+tot, period);
  const F = (pg,tot)=>_ftr(pg,tot,regNo+' · '+fullName+' · '+_instN);

  //  ESTIMATE TOTAL PAGES 
  // Page 1: cover
  // Page 2: summary + intro + methods
  // Page 3: results (WASH, HIV, disease, demography)
  // Page 4+: case table (20 rows ≈ 1 page), then discussion/conclusion/recs/sigs
  const casePages = Math.ceil(n/18); // ~18 cases per table page
  const TOTAL = 3 + casePages + 1;   // cover + summary + results + cases + disc/recs

  const _instN    = _getInstName();
  const _instProf = await _fetchInstProfile();

  // Fetch AI narrative (null = use static fallback)
  const _narrative = await _fetchNarrative('individual', {
    total_households: n,
    infrastructure:   { pct_pit_latrine: _pct(lat,n), pct_water_treated: _pct(wat,n) },
    health:           { pct_hiv_aware: _pct(hiv,n), pct_hiv_tested: _pct(tst,n) },
    nutrition:        {},
    maternal_child:   {},
    data_quality:     {},
  }, {
    institution_name: _instN,
    county:    _instProf.county     || '',
    sub_county:_instProf.sub_county || '',
    locations: locStr,
    period,
  });
  const _county     = _instProf.county      || '';
  const _subCounty  = _instProf.sub_county  || '';
  const _ward       = _instProf.ward        || '';
  const _adminName  = _instProf.admin_name  || '';
  const _contactEmail = _instProf.contact_email || '';
  //  PAGE 1: COVER 
  const p1 = _cover(
    'Community Health Situation Analysis',
    'Interviewer Field Report',
    [
      ['Survey Area',    locStr],
      ['Survey Period',  period],
      ['Households',     n+' interviewed'],
      ['Institution',    _instN],
    ],
    'OFFICIAL FIELD REPORT',
    '<div class="cov-id">'
    +(profilePhoto?'<div style="width:64pt;height:64pt;border-radius:50%;overflow:hidden;border:2.5px solid #cce0d4;margin:0 auto 8pt;background:#f4f8f5;-webkit-print-color-adjust:exact;print-color-adjust:exact"><img src="'+profilePhoto+'" style="width:100%;height:100%;object-fit:cover" crossorigin="anonymous"/></div>':'')
    +'<div class="cov-id-name">'+fullName+'</div>'
    +'<div class="cov-id-reg">Reg / Admission No: '+regNo+'</div>'
    +(email!=='—'?'<div class="cov-id-email">'+email+'</div>':'')
    +'<div class="cov-id-badge">'+_instN+'</div>'
    +'</div>',
    _instProf  // ← pass profile for logo/banner/location
  );

  //  PAGE 2: Executive Summary + Intro + Methods (single column, fluent prose) 
  const p2 = _pg(H(2,TOTAL), F(2,TOTAL), '',
    '<h2 class="sec">Executive Summary</h2>'
    +'<p class="bt">This report presents findings from <strong>'+n+' household interview'+(n!==1?'s':'')+
      '</strong> conducted by <strong>'+fullName+'</strong> in <strong>'+locStr+
      '</strong> during the survey period of <strong>'+period+'</strong>. The assessment was carried out as part of the Community Health Situation Analysis programme at the Community Health Situation Analysis programme. The primary objective was to systematically document the prevailing health conditions, identify risk factors, and generate actionable evidence to inform health planning at the sub-county level.</p>'
    +'<p class="bt">Key indicators recorded during this assessment are as follows: latrine coverage stood at <strong>'+_pct(lat,n)+'%</strong>, water treatment coverage at <strong>'+_pct(wat,n)+'%</strong>, and HIV/AIDS awareness at <strong>'+_pct(hiv,n)+'%</strong> among surveyed households. '
      +(ills.length?'The most prevalent illness reported was <strong>'+ills[0][0]+'</strong>, affecting '+ills[0][1]+' out of '+n+' households surveyed ('+_pct(ills[0][1],n)+'%). ':'No illnesses were reported across the surveyed households. ')
      +(dHH>0?'A total of <strong>'+dTot+' death'+(dTot!==1?'s':'')+' in the past five years</strong> were reported across '+dHH+' household'+(dHH!==1?'s':'')+', underscoring the need for mortality surveillance and verbal autopsy investigations. ':'')
      +'Overall, <strong>'+allF.length+' red flag'+(allF.length!==1?'s were':' was')+' identified</strong> across the surveyed households, each requiring documented follow-up and intervention.</p>'
    +'<div class="sr">'
      +_sb(n,'Households','blu')
      +_sb(_pct(lat,n)+'%','Latrine',_pct(lat,n)<60?'red':_pct(lat,n)<80?'amb':'')
      +_sb(_pct(wat,n)+'%','Water',_pct(wat,n)<60?'red':_pct(wat,n)<80?'amb':'')
      +_sb(_pct(hiv,n)+'%','HIV Aware',_pct(hiv,n)<70?'red':_pct(hiv,n)<90?'amb':'')
      +_sb(allF.length,'Red Flags',allF.length?'red':'')
      +_sb(dTot,'Deaths 5yr',dTot?'amb':'')
    +'</div>'
    +'<h2 class="sec">1. Introduction</h2>'
    +'<p class="bt"><strong>'+fullName+'</strong> (Admission No: <strong>'+regNo+'</strong>'+(email!=='—'?' · '+email:'')+') conducted this community health assessment under the community health situation analysis programme at \'+_instN+\'. This work forms part of the practical training requirement in Community Health.</p>'
    +'<p class="bt">The survey was conducted in <strong>'+locStr+'</strong>, covering <strong>'+n+' household'+(n!==1?'s':'')+
      '</strong> during the period <strong>'+period+'</strong>. The specific objectives of this assessment were: (i) to document the prevailing health conditions and disease burden within the surveyed community; (ii) to identify social, environmental, and behavioural health determinants; (iii) to assess coverage of essential health services including water, sanitation, and HIV/AIDS programmes; and (iv) to generate evidence-based recommendations for health improvement that can be acted upon by the sub-county health authorities.</p>'
    +'<h2 class="sec">2. Methods</h2>'
    +'<p class="bt">A descriptive cross-sectional household survey design was employed, using a structured 12-section questionnaire developed by the Medical Survey System (MSS) programme. The questionnaire covered the following thematic areas: Consent, Demography, Housing &amp; Environment, Medical History, Maternal &amp; Child Health, Nutrition, HIV/AIDS Awareness and Testing, Sanitation, Water &amp; Environment, Cultural Practices, Community Health Problems, and Pests &amp; Vectors.</p>'
    +'<p class="bt">Data was captured digitally using the Medical Survey System (MSS) Progressive Web Application (PWA) and synchronised to a secure cloud database in real time. Verbal informed consent was obtained from each household respondent prior to the commencement of the interview. Each respondent was fully informed of the purpose of the survey, their right to decline or withdraw participation at any point, and the confidentiality of their responses. Households were selected through purposive community sampling, coordinated in collaboration with the local sub-county health office.</p>'
    +'<h2 class="sec">Socio-Demographic Profile</h2>'
    +'<div class="sr">'+_sb(n,'Households','blu')+_sb(fem,'Female','blu')+_sb(mal,'Male','blu')+_sb(aAge,'Avg Age','blu')+_sb(perm,'Permanent','')+_sb(locs.length,'Locations','blu')+'</div>'
    +'<table class="dt"><thead><tr><th>Housing Type</th><th class="c">Count</th><th class="c">%</th></tr></thead>'
    +'<tbody>'
    +'<tr><td class="lbl">Permanent</td><td class="c">'+perm+'</td><td class="c">'+_pct(perm,n)+'%</td></tr>'
    +'<tr><td class="lbl">Semi-permanent</td><td class="c">'+semi+'</td><td class="c">'+_pct(semi,n)+'%</td></tr>'
    +'<tr><td class="lbl">Temporary</td><td class="c">'+tmp+'</td><td class="c">'+_pct(tmp,n)+'%</td></tr>'
    +'</tbody></table>'
  );

  //  PAGE 3: Results — WASH + HIV + Disease (single column, fluent prose) 
  const p3 = _pg(H(3,TOTAL), F(3,TOTAL), '',
    '<h2 class="sec">3. Results — WASH Indicators</h2>'
    +'<p class="bt">Water, Sanitation and Hygiene (WASH) indicators are among the most critical determinants of community health outcomes, particularly in rural settings. The following results were recorded across the '+n+' households surveyed in '+locStr+'.</p>'
    +'<p class="bt"><strong>Pit Latrine Coverage:</strong> Out of '+n+' households, <strong>'+lat+'</strong> ('+ _pct(lat,n)+'%) reported having a pit latrine. '
      +(_pct(lat,n)>=80?'This meets the national target of ≥80% latrine coverage, which is an encouraging achievement for this community. Continued efforts should focus on maintaining and improving existing sanitation infrastructure.':'This falls below the national target of ≥80%, meaning that <strong>'+(n-lat)+' household'+(n-lat!==1?'s':'')+' still practise open defecation</strong>. Open defecation is a significant public health risk, directly linked to the transmission of diarrhoeal diseases, cholera, and typhoid fever, particularly among children under five years of age. Immediate action is required under the Community-Led Total Sanitation (CLTS) programme.')
    +'</p>'
    +_bar('Pit Latrine Coverage', lat, n)
    +'<p class="bt"><strong>Water Treatment:</strong> Only <strong>'+wat+'</strong> out of '+n+' households ('+_pct(wat,n)+'%) reported treating their drinking water before consumption. '
      +(_pct(wat,n)>=80?'This is above the recommended threshold, indicating strong community uptake of safe water practices.':'This is significantly below the recommended threshold of ≥80%. Untreated water is one of the leading causes of waterborne disease in Kenya, including diarrhoea, dysentery, and typhoid. The remaining <strong>'+(n-wat)+' household'+(n-wat!==1?'s':'')+
      '</strong> require urgent access to point-of-use water treatment products such as WaterGuard chlorine solution, alongside community education on safe water storage and handling.')
    +'</p>'
    +_bar('Water Treatment', wat, n)
    +'<table class="dt" style="margin-top:4pt">'
    +'<thead><tr><th>WASH Indicator</th><th class="c">Yes</th><th class="c">No</th><th class="c">%</th><th class="c">Target</th><th class="c">Met</th></tr></thead>'
    +'<tbody>'
    +'<tr><td class="lbl">Pit latrine</td><td class="c">'+lat+'</td><td class="c">'+(n-lat)+'</td><td class="c">'+_pct(lat,n)+'%</td><td class="c">&ge;80%</td><td class="c">'+S(_pct(lat,n),80)+'</td></tr>'
    +'<tr><td class="lbl">Water treatment</td><td class="c">'+wat+'</td><td class="c">'+(n-wat)+'</td><td class="c">'+_pct(wat,n)+'%</td><td class="c">&ge;80%</td><td class="c">'+S(_pct(wat,n),80)+'</td></tr>'
    +'</tbody></table>'
    +'<h2 class="sec">HIV/AIDS Indicators</h2>'
    +'<p class="bt">HIV/AIDS awareness and testing coverage are key benchmarks under the UNAIDS 95-95-95 targets and Kenya\u2019s national HIV response strategy. The following levels of awareness and testing uptake were recorded in this survey.</p>'
    +'<p class="bt"><strong>HIV/AIDS Awareness:</strong> <strong>'+hiv+'</strong> out of '+n+' respondents ('+_pct(hiv,n)+'%) reported having heard of HIV/AIDS. '
      +(_pct(hiv,n)>=90?'This meets the UNAIDS 90% awareness benchmark, which is commendable.':'This falls below the UNAIDS 90% target. The <strong>'+(n-hiv)+' respondent'+(n-hiv!==1?'s':'')+' who '+( (n-hiv)===1?'has':'have')+' never heard of HIV/AIDS</strong> represent a particularly vulnerable group who are unable to protect themselves or access testing and treatment services. Targeted outreach by Community Health Workers is urgently required.')
    +'</p>'
    +'<p class="bt"><strong>HIV Testing:</strong> <strong>'+tst+'</strong> out of '+n+' respondents ('+_pct(tst,n)+'%) reported having ever been tested for HIV. '
      +(_pct(tst,n)>=95?'Testing coverage meets the UNAIDS 95% target.':'Testing coverage of '+_pct(tst,n)+'% falls short of the 95% target. The <strong>'+(n-tst)+' untested respondent'+(n-tst!==1?'s':'')+
      '</strong> should be actively linked to voluntary counselling and testing (VCT) services at the nearest health facility, where testing is free and confidential.')
    +'</p>'
    +_bar('HIV/AIDS Awareness', hiv, n)
    +_bar('Ever Tested for HIV', tst, n)
    +'<table class="dt" style="margin-top:4pt">'
    +'<thead><tr><th>HIV Indicator</th><th class="c">Yes</th><th class="c">No</th><th class="c">%</th><th class="c">Target</th><th class="c">Met</th></tr></thead>'
    +'<tbody>'
    +'<tr><td class="lbl">HIV awareness</td><td class="c">'+hiv+'</td><td class="c">'+(n-hiv)+'</td><td class="c">'+_pct(hiv,n)+'%</td><td class="c">&ge;90%</td><td class="c">'+S(_pct(hiv,n),90)+'</td></tr>'
    +'<tr><td class="lbl">Ever tested</td><td class="c">'+tst+'</td><td class="c">'+(n-tst)+'</td><td class="c">'+_pct(tst,n)+'%</td><td class="c">&ge;95%</td><td class="c">'+S(_pct(tst,n),95)+'</td></tr>'
    +'</tbody></table>'
    +(evidencePhoto1||evidencePhoto2
      ?'<h2 class="sec">Field Evidence</h2>'
       +'<div style="display:flex;gap:10pt;margin-bottom:8pt;flex-wrap:wrap">'
       +(evidencePhoto1?'<div style="flex:1;min-width:120pt;max-width:180pt"><img src="'+evidencePhoto1+'" style="width:100%;height:110pt;object-fit:cover;border-radius:5pt;border:1.5px solid #cce0d4" crossorigin="anonymous"/><div style="font-size:6pt;color:#6b8a74;text-align:center;margin-top:3pt">Field Evidence Photo 1</div></div>':'')
       +(evidencePhoto2?'<div style="flex:1;min-width:120pt;max-width:180pt"><img src="'+evidencePhoto2+'" style="width:100%;height:110pt;object-fit:cover;border-radius:5pt;border:1.5px solid #cce0d4" crossorigin="anonymous"/><div style="font-size:6pt;color:#6b8a74;text-align:center;margin-top:3pt">Field Evidence Photo 2</div></div>':'')
       +'</div>'
      :'')
    +'<h2 class="sec">Disease Burden</h2>'
    +(ills.length
      ?'<p class="bt">The following illnesses and health conditions were reported by respondents as having affected household members in the six months preceding this survey. It should be noted that these figures are based on self-reported data and do not constitute clinical diagnoses.</p>'
        +'<table class="dt"><thead><tr><th>Illness / Condition</th><th class="c">Cases</th><th class="c">% HHs</th><th class="c">Rank</th></tr></thead>'
        +'<tbody>'+ills.map(([k,v],i)=>'<tr><td class="lbl">'+k+'</td><td class="c">'+v+'</td><td class="c">'+_pct(v,n)+'%</td><td class="c">#'+(i+1)+'</td></tr>').join('')+'</tbody></table>'
        +(ills.length?'<p class="bt">The most prevalent condition reported was <strong>'+ills[0][0]+'</strong>, affecting '+ills[0][1]+' household'+(ills[0][1]!==1?'s':'')+' ('+_pct(ills[0][1],n)+'%). '+(ills[0][0]==='Malaria'?'Malaria remains the leading cause of morbidity in Kisii County and is directly associated with stagnant water, inadequate bed net usage, and poor housing. Vector control interventions are urgently needed.':ills[0][0].includes('Diarrh')||ills[0][0].includes('diarrh')?'The prevalence of diarrhoeal disease is closely linked to the low water treatment coverage identified above. Improving household water safety practices would be expected to reduce this burden significantly.':'This finding highlights a need for targeted community health education and improved access to treatment at the nearest health facility.')+'</p>':'')
      :'<p class="note">No illness data was recorded across the surveyed households during this assessment period.</p>')
    +(dHH>0?_fl('warning','Mortality Reported',dHH+' household'+(dHH!==1?'s':'')+' reported a total of '+dTot+' death'+(dTot!==1?'s':'')+' in the past five years. While the cause of death has not been clinically verified, verbal autopsy investigations are strongly recommended to determine cause-specific mortality and inform targeted interventions.'):'')
    +'<h2 class="sec">Red Flags Identified</h2>'
    +(allF.length
      ?allF.slice(0,10).map(({r,f})=>'<div class="fc"><div class="ft">&#9888; '+f+'</div>'
          +'<div class="fb">'+(r.location||'?')+' &middot; '+(r.interview_date||'?')+'</div></div>').join('')
        +(allF.length>10?'<p class="note">+' +(allF.length-10)+' more flags — see full case table.</p>':'')
      :_fl('good','No Critical Red Flags','No critical issues identified across all surveyed households.'))
    +'</div>'
  );

  //  CASE TABLE PAGES: one page per ~18 records 
  const casePageArr = [];
  const chunkSize = 18;
  for(let ci=0; ci<records.length; ci+=chunkSize){
    const chunk = records.slice(ci, ci+chunkSize);
    const pgNum = 4 + Math.floor(ci/chunkSize);
    const rows = chunk.map((rec,i)=>{
      const f=_flags(rec);
      return '<tr>'
        +'<td class="c lbl">'+(ci+i+1)+'</td>'
        +'<td>'+(rec.interview_date||'—')+'</td>'
        +'<td>'+(rec.location||'—')+'</td>'
        +'<td class="c">'+(rec.respondent_age||'?')+'/'+(rec.respondent_gender||'?').charAt(0)+'</td>'
        +'<td>'+(rec.house_type||'—')+'</td>'
        +'<td class="c" style="color:'+(rec.latrine==='Yes'?'#1a5c35':'#c0392b')+';font-weight:700">'+(rec.latrine==='Yes'?'Y':'N')+'</td>'
        +'<td class="c" style="color:'+(rec.water_treated==='Yes'?'#1a5c35':'#c0392b')+';font-weight:700">'+(rec.water_treated==='Yes'?'Y':'N')+'</td>'
        +'<td class="c" style="color:'+(rec.hiv_heard==='Yes'?'#1a5c35':'#c0392b')+';font-weight:700">'+(rec.hiv_heard==='Yes'?'Y':'N')+'</td>'
        +'<td style="font-size:6pt">'+(rec.illnesses||'None')+'</td>'
        +'<td class="c" style="color:'+(f.length?'#c0392b':'#1a5c35')+';font-weight:700">'+(f.length||'&#10003;')+'</td>'
        +'</tr>';
    }).join('');
    const isFirst = ci===0;
    casePageArr.push(_pg(H(pgNum,TOTAL), F(pgNum,TOTAL), '',
      (isFirst?'<h2 class="sec">4. All Interviews — Case Summary Table</h2><p class="note">Y=Yes, N=No for Latrine / Water Treated / HIV Aware. Flags = number of critical issues per household. Cases '+(ci+1)+'–'+(Math.min(ci+chunkSize,n))+' of '+n+'.</p>':'<p class="note" style="margin-top:0">Cases '+(ci+1)+'–'+(Math.min(ci+chunkSize,n))+' of '+n+' (continued)</p>')
      +'<table class="dt"><thead><tr>'
      +'<th class="c">#</th><th>Date</th><th>Location</th><th class="c">Age/Sex</th>'
      +'<th>House Type</th><th class="c">Lat</th><th class="c">Water</th><th class="c">HIV</th>'
      +'<th>Illnesses Reported</th><th class="c">Flags</th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table>'
    ));
  }

  //  LAST PAGE: Discussion + Conclusion + Recommendations + Signatures 
  const lastPg = TOTAL;
  const pLast = _pg(H(lastPg,TOTAL), F(lastPg,TOTAL), 'cols2',
    '<div>'
    +'<h2 class="sec">5. Discussion</h2>'
    +'<p class="bt">'+(_pct(lat,n)<80
      ?'Latrine coverage of '+_pct(lat,n)+'% falls '+(80-_pct(lat,n))+'pts below the 80% national target. Open defecation in '+(n-lat)+' household'+(n-lat!==1?'s':'')+' creates direct risk of faecal-oral disease transmission, particularly for children under five.'
      :'Latrine coverage of '+_pct(lat,n)+'% meets the national target — a commendable achievement. Efforts should be maintained to sustain and improve this coverage.')+'</p>'
    +'<p class="bt">'+(_pct(wat,n)<80
      ?'Water treatment at '+_pct(wat,n)+'% is below the recommended threshold. Distribution of point-of-use treatment products (WaterGuard) and hygiene promotion are urgently required.'
      :'Water treatment at '+_pct(wat,n)+'% is satisfactory, indicating community uptake of safe water practices.')+'</p>'
    +'<p class="bt">'+(_pct(hiv,n)<90
      ?'HIV awareness at '+_pct(hiv,n)+'% falls below the UNAIDS 90% target. The '+(n-hiv)+' respondent'+(n-hiv!==1?'s':'')+' unaware of HIV/AIDS are a vulnerable population requiring immediate outreach.'
      :'HIV awareness at '+_pct(hiv,n)+'% meets the benchmark. Focus should shift to ensuring 95% testing coverage.')+'</p>'
    +(ills.length?'<p class="bt">'+ills[0][0]+' is the most prevalent illness ('+ills[0][1]+' cases, '+_pct(ills[0][1],n)+'%), consistent with environmental and behavioural risk factors identified in this survey.</p>':'')
    +'<h2 class="sec">6. Conclusion</h2>'
    +'<p class="bt">This assessment by <strong>'+fullName+'</strong> ('+regNo+') provides systematic evidence on '+n+' household'+(n!==1?'s':'')+' in '+locStr+'. '
      +(_pct(lat,n)<60||_pct(wat,n)<60?'Significant health coverage gaps require urgent intervention.':'Key indicators are within acceptable ranges with targeted areas for improvement.')
      +(allF.length?' '+allF.length+' red flag'+(allF.length!==1?'s':'')+' identified, each requiring documented follow-up.':'')+'</p>'
    +'<p class="bt">Submitted to the course coordinator and institutional health management team for review, action planning, and integration into the health planning cycle.</p>'
    +'</div>'
    +'<div>'
    +'<h2 class="sec">7. Recommendations</h2>'
    +recomList.map(r=>_fl(r.l,r.t,r.b)).join('')
    +'</div>'
  );

  // Declaration + signatures — last page, single column, full fluent prose
  const pLastFull = '<div class="pg">'
    +H(lastPg,TOTAL)
    +'<div class="pg-body">'
    +'<h2 class="sec">5. Discussion</h2>'
    +(_narrative?.discussion
      ? _narrative.discussion.split('\n\n').map(p=>'<p class="bt">'+p+'</p>').join('')
      :'<p class="bt">The findings of this assessment reflect health conditions that are broadly consistent with patterns documented across rural communities in Kisii County and sub-Saharan Africa more widely. Each of the key indicators recorded during this survey is discussed below in relation to national targets and established public health evidence.</p>')
    +'<p class="bt"><strong>Sanitation:</strong> '+(_pct(lat,n)<80
      ?'Latrine coverage of <strong>'+_pct(lat,n)+'%</strong> falls <strong>'+(80-_pct(lat,n))+' percentage points below</strong> the national target of 80%. The <strong>'+(n-lat)+' household'+(n-lat!==1?'s':'')+' without pit latrines</strong> represent a direct and ongoing risk of faecal-oral disease transmission. In densely settled communities, open defecation is one of the most significant contributors to child mortality through diarrhoeal disease, cholera, and soil-transmitted helminth infections. This finding requires urgent follow-up under the Community-Led Total Sanitation (CLTS) programme.'
      :'Latrine coverage of <strong>'+_pct(lat,n)+'%</strong> meets the national target of 80%. This is a commendable achievement that reflects positive community behaviour change. Continued engagement is necessary to maintain and improve upon this coverage, particularly ensuring that latrines are functional, hygienic, and accessible to all household members including the elderly and persons with disabilities.')+'</p>'
    +'<p class="bt"><strong>Water Safety:</strong> '+(_pct(wat,n)<80
      ?'Water treatment coverage of <strong>'+_pct(wat,n)+'%</strong> is critically below the recommended threshold. The majority of households are consuming untreated water, exposing themselves to a range of preventable waterborne illnesses. This finding is particularly alarming given '+(ills.some(([k])=>k.toLowerCase().includes('diarrh'))?'the prevalence of diarrhoeal disease identified in this survey, which is directly linked to unsafe drinking water practices.':'the known relationship between untreated water and diarrhoeal disease, which remains a leading cause of child mortality in Kenya.')+' Urgent distribution of WaterGuard chlorine solution and community education on safe water handling is strongly recommended.'
      :'Water treatment coverage of <strong>'+_pct(wat,n)+'%</strong> is satisfactory, demonstrating good community uptake of safe water practices. Health education should be maintained to sustain this coverage and address any remaining gaps.')+'</p>'
    +'<p class="bt"><strong>HIV/AIDS:</strong> '+(_pct(hiv,n)<90
      ?'HIV/AIDS awareness at <strong>'+_pct(hiv,n)+'%</strong> falls below the UNAIDS 90% target. The <strong>'+(n-hiv)+' respondent'+(n-hiv!==1?'s':'')+' who '+((n-hiv)===1?'has':'have')+' never heard of HIV/AIDS</strong> cannot be expected to adopt protective behaviours, seek testing, or access treatment. Targeted door-to-door outreach by Community Health Workers and mobile VCT campaigns are necessary to close this awareness gap.'
      :'HIV/AIDS awareness at <strong>'+_pct(hiv,n)+'%</strong> meets the UNAIDS benchmark, which is an encouraging result. The focus should now shift to ensuring that awareness translates into testing uptake and, for those who test positive, timely enrolment onto antiretroviral therapy.')+'</p>'
    +(ills.length?'<p class="bt"><strong>Disease Burden:</strong> <strong>'+ills[0][0]+'</strong> emerged as the most prevalent health condition, reported in <strong>'+ills[0][1]+' household'+(ills[0][1]!==1?'s':'')+' ('+_pct(ills[0][1],n)+'%)</strong>. '+(ills[0][0]==='Malaria'?'Malaria remains the leading cause of morbidity in Kisii County. The risk is heightened by inadequate use of insecticide-treated bed nets (ITNs), poor housing structures that allow mosquito entry, and the presence of stagnant water near homesteads. Targeted vector control and ITN distribution are recommended.':ills[0][0].includes('Cough')||ills[0][0].includes('Cold')?'Respiratory conditions such as coughs and colds are often associated with poor housing, indoor cooking with solid fuels, and inadequate ventilation. These findings point to the need for both housing improvement and health education targeting respiratory hygiene.':'This warrants targeted preventive health education and improved access to treatment at the nearest health facility.')+'</p>':'')
    +(dHH>0?'<p class="bt"><strong>Mortality:</strong> A total of <strong>'+dTot+' death'+(dTot!==1?'s':'')+' over the past five years</strong> were reported across '+dHH+' household'+(dHH!==1?'s':'')+'. These deaths have not been clinically verified, but their occurrence highlights the need for systematic verbal autopsy investigations to determine cause-specific mortality. Understanding the leading causes of death in this community is essential for directing preventive interventions and health resource allocation at the sub-county level.</p>':'')
    +'<h2 class="sec">6. Conclusion</h2>'
    +(_narrative?.conclusion
      ? _narrative.conclusion.split('\n\n').map(p=>'<p class="bt">'+p+'</p>').join('')
      :'<p class="bt">This assessment by <strong>'+fullName+'</strong> (Admission No: '+regNo+') provides systematic, community-level evidence on the health situation of <strong>'+n+' household'+(n!==1?'s':'')+' in '+locStr+'</strong>. The data gathered through this structured household survey offers a clear picture of the major health challenges facing this community, including gaps in water treatment, sanitation infrastructure, and HIV/AIDS awareness and testing coverage.</p>'
       +'<p class="bt">'+(_pct(lat,n)<60||_pct(wat,n)<60
         ?'The findings reveal significant health coverage gaps that pose an immediate and serious risk to the wellbeing of community members. These gaps require urgent intervention from the sub-county health authorities, including community mobilisation, resource allocation, and targeted health promotion activities.'
         :'While key indicators are within acceptable ranges in several areas, the findings reveal targeted gaps that — if left unaddressed — have the potential to deteriorate. A proactive, preventive approach is recommended to maintain and improve current health coverage levels.')
       +(allF.length?' In total, <strong>'+allF.length+' red flag'+(allF.length!==1?'s were':' was')+' identified</strong> across the surveyed households, each of which requires documented follow-up, referral, or targeted intervention to prevent further deterioration.':'')
       +' This report is submitted to the course coordinator and institutional health management team for review, integration into the health planning cycle, and action as appropriate.</p>')
    +'<h2 class="sec">7. Recommendations</h2>'
    +recomList.map(rc=>_fl(rc.l,rc.t,rc.b)).join('')
    +'</div>'
    +'<div style="padding:0 0.7in">'
    +'<h2 class="sec">Declaration &amp; Signatures</h2>'
    +'<p class="bt">I, <strong>'+fullName+'</strong> (Admission No: '+regNo+'), hereby declare that the data presented in this report was collected personally, accurately, and in accordance with the ethical guidelines and academic standards of \'+_instN+\'. Verbal informed consent was obtained from all respondents prior to the commencement of each interview, and the confidentiality of all responses has been strictly maintained throughout this process.</p>'
    +_sigs([
      [fullName, regNo+(email!=='—'?' · '+email:'')+' · Student, GLU Kisumu'],
      ['Course Supervisor','Faculty · Community Health · GLU Kisumu'],
      ['Institution Supervisor',_instN],
    ])
    +'<p class="note" style="margin-top:6pt;text-align:center">Generated '+now+' · Medical Survey System (MSS) System v3.1 · \'+_instN+\' · © 2026 Ministry of Health Kenya</p>'
    +'</div>'
    +F(lastPg,TOTAL)
    +'</div>';

  return _doc('Report_'+fullName.replace(/\s+/g,'_'), p1+p2+p3+casePageArr.join('')+pLastFull);
}


// 
//  REPORT 2 — CLASS GROUP REPORT
//  15 interviewers × 20 cases = 300 rows
//  Approach: summary pages first, then a per-interviewer section
//  with a compact one-line-per-case table for each interviewer.
// 
async function buildGroupReport(records, students){
  students = students||{};
  const n  = records.length;
  if(!n) return _doc('Group_Report','<p style="padding:1in">No records loaded.</p>');

  const now    = new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const ivs    = [...new Set(records.map(r=>r.interviewer||'Unknown'))].sort();
  const dates  = records.map(r=>r.interview_date||'').filter(Boolean).sort();
  const period = dates.length>1?dates[0]+' to '+dates[dates.length-1]:dates[0]||now;
  const locs   = [...new Set(records.map(r=>r.location||'').filter(Boolean))];
  const locStr = locs.join(', ')||'';

  const _instN    = _getInstName();
  const _instProf = await _fetchInstProfile();
  const _county     = _instProf.county     || '';
  const _subCounty  = _instProf.sub_county || '';
  const _ward       = _instProf.ward       || '';
  const _adminName  = _instProf.admin_name || '';
  const _contactEmail = _instProf.contact_email || '';

  const lat  = _cnt(records,'latrine','Yes');
  const wat  = _cnt(records,'water_treated','Yes');
  const hiv  = _cnt(records,'hiv_heard','Yes');
  const tst  = _cnt(records,'hiv_tested','Yes');
  const dHH  = _cnt(records,'deaths_5yr','Yes');
  const dTot = records.reduce((s,r)=>s+(parseInt(r.deaths_count)||0),0);
  const perm = _cnt(records,'house_type','Permanent');
  const fem  = _cnt(records,'respondent_gender','Female');
  const mal  = _cnt(records,'respondent_gender','Male');
  const ills = _ills(records);
  const allF = records.reduce((a,r)=>a+_flags(r).length,0);

  // Fetch AI narrative
  const _narrative = await _fetchNarrative('group', {
    total_households:    n,
    total_interviewers:  ivs.length,
    infrastructure:  { pct_pit_latrine: _pct(lat,n), pct_water_treated: _pct(wat,n) },
    health:          { pct_hiv_aware: _pct(hiv,n), pct_hiv_tested: _pct(tst,n) },
    nutrition:       {},
    maternal_child:  {},
    data_quality:    {},
  }, {
    institution_name: _instN,
    county:     _county,
    sub_county: _subCounty,
    locations:  locStr,
    period,
  });

  //  GROUP REPORT PREMIUM CSS (navy + gold theme) 
  const GRP_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600;700;800&display=swap');
  /*  COLOUR TOKENS  */
  /* Primary: Deep Navy  #12274F */
  /* Accent:  Warm Gold  #B8902A */
  /* Light:   Ivory      #FAFAF7 */
  /* Surface: Pale Slate #F0F2F7 */

  /* override shared header/footer colours for group pages */
  .grp .pg-stripe{background:linear-gradient(90deg,#12274F,#B8902A,#12274F) !important;}
  .grp .pg-hdr{border-bottom:1.5px solid #B8902A !important;}
  .grp .pg-hdr-org{color:#12274F !important;}
  .grp .pg-hdr-icon{background:#12274F !important;}
  .grp .pg-ftr{border-top:1px solid #d4c49a !important;}
  .grp h2.sec{
    background:linear-gradient(135deg,#12274F 0%,#1a3a6b 100%) !important;
    color:#fff !important;
    border-left:4pt solid #B8902A !important;
    letter-spacing:.5px;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  .grp h3.sub{color:#12274F !important; border-left-color:#B8902A !important;}
  .grp p.bt{color:#1a1e2e !important; line-height:1.65;}

  /* Stat boxes */
  .grp .sb{background:#F0F2F7 !important; border:1px solid #c9d0e3 !important; border-top:2.5pt solid #12274F !important;}
  .grp .sb.red{border-top-color:#b91c1c !important; background:#fef2f2 !important;}
  .grp .sb.amb{border-top-color:#c2760a !important; background:#fffbeb !important;}
  .grp .sb.blu{border-top-color:#B8902A !important; background:#fdf8ec !important;}
  .grp .sn{color:#12274F !important;}
  .grp .sb.red .sn{color:#b91c1c !important;}
  .grp .sb.amb .sn{color:#c2760a !important;}
  .grp .sb.blu .sn{color:#B8902A !important;}

  /* Tables */
  .grp table.dt thead th{background:#12274F !important; color:#fff !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp table.dt tbody tr:nth-child(even) td{background:#f5f6fb !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp table.dt tbody td.lbl{color:#12274F !important;}
  .grp table.dt tfoot td{background:#e8ebf5 !important; border-top:1.5px solid #12274F !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}

  /* Indicator bars */
  .grp .it{background:#e3e6f0 !important;}

  /* Flag boxes */
  .grp .fc{background:#fff1f1 !important; border-left-color:#b91c1c !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp .fw{background:#fffbeb !important; border-left-color:#c2760a !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp .fg{background:#f0f4ff !important; border-left-color:#12274F !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp .fc .ft{color:#b91c1c !important;}
  .grp .fw .ft{color:#c2760a !important;}
  .grp .fg .ft{color:#12274F !important;}

  /* Signature lines */
  .grp .sigs{border-top:1px solid #d4c49a !important;}

  /* IV detail header bar */
  .grp .iv-hdr{border-bottom:2.5px solid #B8902A !important;}
  .grp .iv-hdr-name{color:#12274F !important;}
  .grp .iv-hdr-sub{color:#B8902A !important;}

  /* Parchment page background for all group pages — screen + print */
  .grp{background:#FDF8EC !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp-cover{background:#FDF8EC !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  /* Absolute-positioned layer guarantees background survives PDF export */
  .grp::before,.grp-cover::before{
    content:'';
    position:absolute;
    inset:0;
    background:#FDF8EC;
    z-index:0;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  .grp>*,.grp-cover>*{position:relative;z-index:1;}
  @media print{
    .grp,.grp-cover{background:#FDF8EC !important; -webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
    .grp::before,.grp-cover::before{background:#FDF8EC !important; -webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  }

  /* Cover overrides */
  .grp-cover .cov-band{background:linear-gradient(135deg,#0b1b3a,#12274F,#B8902A) !important; height:0.32in !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp-cover .cov-uni{color:#12274F !important;}
  .grp-cover .cov-rule{background:linear-gradient(90deg,#12274F,#B8902A) !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp-cover .cov-emb{background:linear-gradient(145deg,#12274F,#1e3f7a) !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp-cover .cov-box{background:#FAFAF7 !important; border:1px solid #d4c49a !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp-cover .cov-row{border-bottom:1px solid #e8e2d0 !important;}
  .grp-cover .cov-k{color:#8a7340 !important;}
  .grp-cover .cov-v{color:#12274F !important;}
  .grp-cover .cov-id{background:linear-gradient(135deg,#12274F 0%,#1e3f7a 60%,#B8902A 100%) !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp-cover .cov-id-badge{background:rgba(184,144,42,.25) !important; border:1px solid rgba(184,144,42,.5) !important; color:rgba(255,255,255,.9) !important;}
  .grp-cover .cov-bot{background:#F0F2F7 !important; border-top:2px solid #B8902A !important; color:#12274F !important; -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .grp-cover .cov-bot strong{color:#12274F !important;}
  `;

  // Helpers that emit navy+gold colours instead of green
  const GS=(p,t)=>p>=t
    ?'<span style="color:#12274F;font-weight:700">&#10003;</span>'
    :'<span style="color:#b91c1c;font-weight:700">&#10007;</span>';

  const ivColor=(p,target)=>p>=target?'#12274F':'#b91c1c';
  const ivColorAmb=(p,target,warn)=>p>=target?'#12274F':p>=warn?'#c2760a':'#b91c1c';

  // Wrap a _pg in grp class
  const GP=(header,footer,bodyClass,content)=>{
    const inner=_pg(header,footer,bodyClass,content);
    return inner.replace('<div class="pg">','<div class="pg grp">');
  };

  const H=(pg,tot)=>_hdr('Class Group Report — All Interviewers','Group Report · Pg '+pg+'/'+tot,period);
  const F=(pg,tot)=>_ftr(pg,tot,ivs.length+' Interviewers · '+n+' Total Records');

  // Per-interviewer summary rows
  const ivSummaryRows = ivs.map(iv=>{
    const recs=records.filter(r=>r.interviewer===iv);
    const m=recs.length;
    const st=students[iv]||{};
    const lp=_pct(_cnt(recs,'latrine','Yes'),m);
    const wp=_pct(_cnt(recs,'water_treated','Yes'),m);
    const hp=_pct(_cnt(recs,'hiv_heard','Yes'),m);
    const tp=_pct(_cnt(recs,'hiv_tested','Yes'),m);
    const fl=recs.reduce((a,r)=>a+_flags(r).length,0);
    const top=(()=>{const t=_ills(recs);return t[0]?t[0][0]:'—';})();
    return '<tr>'
      +'<td class="lbl">'+iv+'<br><span style="font-size:5.5pt;color:#8a7340;font-weight:400">'+(st.reg_number||'—')+'</span></td>'
      +'<td class="c">'+m+'</td>'
      +'<td class="c" style="color:'+ivColor(lp,80)+';font-weight:700">'+lp+'%</td>'
      +'<td class="c" style="color:'+ivColor(wp,80)+';font-weight:700">'+wp+'%</td>'
      +'<td class="c" style="color:'+ivColor(hp,90)+';font-weight:700">'+hp+'%</td>'
      +'<td class="c" style="color:'+ivColorAmb(tp,50,30)+';font-weight:700">'+tp+'%</td>'
      +'<td class="c" style="color:'+(fl>0?'#b91c1c':'#12274F')+';font-weight:700">'+fl+'</td>'
      +'<td style="font-size:6pt">'+top+'</td>'
      +'</tr>';
  }).join('');

  // Recommendations
  const grecs=[];
  if(_pct(lat,n)<80)  grecs.push({l:'critical',t:'Priority 1 — Sanitation: Latrine Construction Programme',b:'Pit latrine coverage across the class stands at '+_pct(lat,n)+'%, which is '+(80-_pct(lat,n))+' percentage points below the national target of 80%. This means that '+(n-lat)+' household'+(n-lat!==1?'s remain':' remains')+' without a latrine and without any safe alternative to open defecation — a situation that places entire families, and especially young children, at serious and preventable risk. The Sub-County Sanitation Officer should be formally notified, and all affected households must be fast-tracked through the Community-Led Total Sanitation (CLTS) programme without delay.'});
  if(_pct(wat,n)<80)  grecs.push({l:'critical',t:'Priority 2 — Safe Water: Community Chlorination Campaign',b:'Water treatment coverage of '+_pct(wat,n)+'% falls significantly below the recommended threshold of 80%. The majority of households surveyed are consuming water that has not been treated in any way, exposing themselves to a range of entirely preventable waterborne diseases. An immediate, coordinated distribution of WaterGuard chlorine solution is required, supported by community demonstrations on proper water treatment, safe storage, and hygiene at the household level.'});
  if(_pct(hiv,n)<90)  grecs.push({l:'critical',t:'Priority 3 — HIV/AIDS: Community Outreach and VCT Access',b:'HIV/AIDS awareness at '+_pct(hiv,n)+'% falls short of the UNAIDS 90% benchmark. The '+(n-hiv)+' respondent'+(n-hiv!==1?'s':'')+' who '+((n-hiv)===1?'has':'have')+' never heard of HIV/AIDS cannot take protective steps, seek testing, or support family members who may be living with the virus. Door-to-door outreach by Community Health Workers and a mobile Voluntary Counselling and Testing (VCT) campaign in '+locStr+' are urgently required to address this awareness gap.'});
  if(ills.length&&ills[0][1]>n*0.15) grecs.push({l:'warning',t:'Disease Burden: '+ills[0][0]+' — Targeted Prevention Required',b:ills[0][0]+' is the single most commonly reported health condition across all class records, affecting '+ills[0][1]+' of the '+n+' households surveyed ('+_pct(ills[0][1],n)+'%). This level of prevalence warrants a coordinated response, including targeted health education, early diagnosis pathways, and ensured access to treatment at the nearest health facility. Prevention strategies should be tailored to the specific risk factors associated with this condition in the local context.'});
  if(dHH>n*0.1) grecs.push({l:'warning',t:'Mortality Surveillance — Verbal Autopsy Investigation',b:dHH+' household'+(dHH!==1?'s':'')+' ('+_pct(dHH,n)+'%) reported a combined total of '+dTot+' deaths occurring within the past five years. While these deaths have not been clinically verified, their frequency and distribution across the surveyed area underscores the need for a structured verbal autopsy programme. Understanding cause-specific mortality is essential for directing preventive interventions and informing the allocation of health resources at the sub-county level.'});
  grecs.push({l:'good',t:'Routine Follow-Up and Continuous Surveillance',b:'Each household identified with one or more red flags during this survey must receive a targeted follow-up visit within 30 days of this report being submitted. Beyond that, a full repeat household survey should be scheduled within six months to measure progress against the indicators recorded here, reinforce health education messages, and ensure that the improvements initiated through this assessment are sustained over time.'});

  // Page count
  let ivDetailPages = 0;
  ivs.forEach(iv=>{
    const m = records.filter(r=>r.interviewer===iv).length;
    ivDetailPages += Math.ceil(m/22);
  });
  const TOTAL = 1 + 3 + ivDetailPages;

  //  COVER PAGE (navy+gold) 
  const rawCover = _cover(
    'Community Health Situation Analysis',
    'Class Aggregated Group Report',
    [
      ['Institution',    _instN],
      ['Supervised at',  _instN],
      ['Survey Area',    locStr],
      ['Survey Period',  period],
      ['Total Households', n+''],
      ['No. of Interviewers', ivs.length+''],
    ],
    'OFFICIAL CLASS GROUP REPORT',
    '<div class="cov-id" style="margin-bottom:8pt">'
    +'<div style="color:rgba(255,255,255,.65);font-size:5.5pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6pt">Student Interviewers</div>'
    +ivs.map(iv=>{
      const st=students[iv]||{};
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:2.5pt 0;border-bottom:1px solid rgba(255,255,255,.12)">'
        +'<div style="color:#fff;font-size:7pt;font-weight:700">'+iv+'</div>'
        +'<div style="color:rgba(255,255,255,.6);font-size:6pt">'+(st.reg_number||'—')+'</div>'
        +'</div>';
    }).join('')
    +'<div class="cov-id-badge" style="margin-top:7pt">'+ivs.length+' Interviewers &middot; '+n+' Household Records</div>'
    +'</div>',
    _instProf  // ← pass profile for logo/banner/location
  );
  const p1 = rawCover.replace('<div class="cover">','<div class="cover grp-cover">');

  //  PAGE 2: Executive Summary + Introduction + Key Indicators 
  const p2 = GP(H(2,TOTAL), F(2,TOTAL), 'cols2',
    '<div>'
    +'<h2 class="sec">Executive Summary</h2>'
    +'<p class="bt">This report brings together the findings of <strong>'+n+' household health interviews</strong> carried out by <strong>'+ivs.length+' student interviewer'+(ivs.length!==1?'s':'')+
      '</strong> — '+ivs.join(', ')+' — across communities in <strong>'+locStr+'</strong> during the period <strong>'+period+'</strong>. Working under the community health situation analysis programme of \'+_instN+\', each interviewer conducted structured face-to-face assessments to build a detailed, ground-level picture of household health.</p>'
    +'<p class="bt">Taken together, the data reveals the following class-wide health picture: pit latrine coverage stands at <strong>'+_pct(lat,n)+'%</strong>, safe water treatment at <strong>'+_pct(wat,n)+'%</strong>, and HIV/AIDS awareness at <strong>'+_pct(hiv,n)+'%</strong> among all surveyed households.'
      +(ills.length?' <strong>'+ills[0][0]+'</strong> emerged as the most commonly reported illness across the class dataset, affecting '+ills[0][1]+' out of '+n+' households surveyed ('+_pct(ills[0][1],n)+'%).':'')
      +' In total, <strong>'+allF+' red flag'+(allF!==1?'s were':' was')+' identified</strong> across all interviews, each of which requires documented follow-up, targeted intervention, or referral to the appropriate health authority.</p>'
    +'<div class="sr">'
      +_sb(n,'Total HHs','blu')
      +_sb(ivs.length,'Interviewers','blu')
      +_sb(_pct(lat,n)+'%','Latrine',_pct(lat,n)<60?'red':_pct(lat,n)<80?'amb':'')
      +_sb(_pct(wat,n)+'%','Water',_pct(wat,n)<60?'red':_pct(wat,n)<80?'amb':'')
      +_sb(_pct(hiv,n)+'%','HIV Aware',_pct(hiv,n)<70?'red':_pct(hiv,n)<90?'amb':'')
      +_sb(allF,'Red Flags',allF>0?'red':'')
    +'</div>'
    +'<h2 class="sec">1. Introduction</h2>'
    +'<p class="bt">This class group report consolidates the community health situation analysis practicum conducted under \'+_instN+\'. The programme equips health workers with the skills to assess, document, and respond to community health needs in real-world settings.</p>'
    +'<p class="bt">The assessment is conducted in alignment with <strong>Kenya Health Policy 2014–2030</strong> and contributes directly to the objectives of <strong>Sustainable Development Goal 3: Good Health and Well-Being</strong>. By situating the findings within the broader national and global health policy context, this report aims not only to document current conditions but to generate actionable, evidence-based recommendations that sub-county health authorities can act upon with confidence.</p>'
    +'<h2 class="sec">2. Methods</h2>'
    +'<p class="bt">A descriptive cross-sectional household survey design was employed across all '+ivs.length+' interviewers. A structured 12-section questionnaire — covering consent, demographics, housing, medical history, maternal and child health, nutrition, HIV/AIDS, sanitation, water and environment, cultural practices, community health problems, and pests and vectors — was administered face-to-face to a consenting adult representative in each household. Verbal informed consent was obtained from every respondent prior to commencing the interview, and all responses were treated with strict confidentiality throughout. Data were captured digitally via the Medical Survey System (MSS) Progressive Web Application (PWA) and synchronised in real time to a secure, cloud-hosted database for central analysis and reporting.</p>'
    +'<h2 class="sec">Survey Area</h2>'
    +(_instProf.area_description
      ?'<p class="bt">'+_instProf.area_description+'</p>'
      :(_narrative?.executive_summary
        ?'<p class="bt">'+_narrative.executive_summary+'</p>'
        :'<p class="bt">The survey was conducted in <strong>'+locStr+'</strong>, '+(_subCounty?_subCounty+', ':'')+(_county?_county+' County, ':'')+'Kenya. A total of <strong>'+n+' households</strong> were systematically assessed across <strong>'+locs.length+' location'+(locs.length!==1?'s':'')+
          '</strong> during the period '+period+'. The assessment was coordinated under the community health situation analysis programme of '+_instN+'.</p>'))
    +(_instProf.gps?(()=>{
      const parts=(_instProf.gps||'').split(',').map(s=>s.trim());
      const lat=parts[0],lng=parts[1];
      if(!lat||!lng) return '';
      const mapUrl='https://staticmap.openstreetmap.de/staticmap.php?center='+lat+','+lng+'&zoom=13&size=380x180&markers='+lat+','+lng+',red-pushpin';
      return '<div style="margin-top:6pt"><img src="'+mapUrl+'" style="width:100%;border-radius:5pt;border:1px solid #cce0d4;-webkit-print-color-adjust:exact;print-color-adjust:exact" crossorigin="anonymous" alt="Survey Area Map" onerror="this.style.display=&quot;none&quot;"/>'
        +'<div style="font-size:6pt;color:#888;text-align:center;margin-top:2pt">Survey Area Map — GPS: '+lat+', '+lng+'</div></div>';
    })():'')
    +'</div>'
    +'<div>'
    +'<h2 class="sec">3. Key Health Indicators</h2>'
    +'<p class="note" style="margin-bottom:4pt">Class-wide summary across all '+n+' households. Targets per Kenya Health Policy and UNAIDS benchmarks.</p>'
    +_bar('Pit Latrine Coverage', lat, n)
    +_bar('Water Treatment', wat, n)
    +_bar('HIV/AIDS Awareness', hiv, n)
    +_bar('HIV Testing Uptake', tst, n)
    +'<table class="dt" style="margin-top:5pt">'
    +'<thead><tr><th>Health Indicator</th><th class="c">Yes</th><th class="c">No</th><th class="c">%</th><th class="c">Target</th><th class="c">Met</th></tr></thead>'
    +'<tbody>'
    +'<tr><td class="lbl">Pit latrine access</td><td class="c">'+lat+'</td><td class="c">'+(n-lat)+'</td><td class="c">'+_pct(lat,n)+'%</td><td class="c">&ge;80%</td><td class="c">'+GS(_pct(lat,n),80)+'</td></tr>'
    +'<tr><td class="lbl">Water treatment</td><td class="c">'+wat+'</td><td class="c">'+(n-wat)+'</td><td class="c">'+_pct(wat,n)+'%</td><td class="c">&ge;80%</td><td class="c">'+GS(_pct(wat,n),80)+'</td></tr>'
    +'<tr><td class="lbl">HIV/AIDS awareness</td><td class="c">'+hiv+'</td><td class="c">'+(n-hiv)+'</td><td class="c">'+_pct(hiv,n)+'%</td><td class="c">&ge;90%</td><td class="c">'+GS(_pct(hiv,n),90)+'</td></tr>'
    +'<tr><td class="lbl">Ever tested for HIV</td><td class="c">'+tst+'</td><td class="c">'+(n-tst)+'</td><td class="c">'+_pct(tst,n)+'%</td><td class="c">&ge;95%</td><td class="c">'+GS(_pct(tst,n),95)+'</td></tr>'
    +'<tr><td class="lbl">Permanent housing</td><td class="c">'+perm+'</td><td class="c">'+(n-perm)+'</td><td class="c">'+_pct(perm,n)+'%</td><td class="c">&ge;50%</td><td class="c">'+GS(_pct(perm,n),50)+'</td></tr>'
    +'</tbody></table>'
    +(ills.length
      ?'<h2 class="sec" style="margin-top:6pt">Disease Burden — Top Conditions</h2>'
        +'<table class="dt"><thead><tr><th>Illness / Condition Reported</th><th class="c">Cases</th><th class="c">% Households</th></tr></thead>'
        +'<tbody>'+ills.slice(0,6).map(([k,v])=>'<tr><td class="lbl">'+k+'</td><td class="c">'+v+'</td><td class="c">'+_pct(v,n)+'%</td></tr>').join('')+'</tbody></table>':'')
    +(dHH>0?'<div class="fw" style="margin-top:4pt"><div class="ft">&#9888; Mortality Reported — '+dTot+' Deaths in Five Years</div><div class="fb">'+dHH+' household'+(dHH!==1?'s':'')+' ('+_pct(dHH,n)+'%) reported a combined total of '+dTot+' death'+(dTot!==1?'s':'')+' occurring within the past five years. These figures are based on self-reported data and have not been clinically verified. A structured verbal autopsy investigation is strongly recommended to determine cause-specific mortality and support evidence-based resource allocation at the sub-county level.</div></div>':'')
    +'</div>'
  );

  //  PAGE 2b: Full data — Nutrition, Maternal, Housing, Sanitation, Water, Cultural, Pests, Challenges 
  // Compute all new aggregates
  const nutrition_3meals = records.filter(r=>parseInt(r.meals_per_day)>=3).length;
  const nutrition_skip   = _cnt(records,'skips_meals','Yes');
  const nutrition_enough = _cnt(records,'food_enough','Yes');
  const preg_yes         = _cnt(records,'pregnancy_status','Yes');
  const delivery_facility= records.filter(r=>(r.delivery_place||'').toLowerCase().includes('hospital')||( r.delivery_place||'').toLowerCase().includes('clinic')||( r.delivery_place||'').toLowerCase().includes('health')).length;
  const anc_4plus        = records.filter(r=>parseInt(r.anc_visits)>=4).length;
  const hiv_protect      = _cnt(records,'hiv_protect','Yes');
  const handwash_facility= _cnt(records,'handwashing','Yes');
  const safe_container   = _cnt(records,'water_container','Yes');
  const mosquito_net     = _cnt(records,'mosquito_net','Yes');
  const net_used         = _cnt(records,'net_used','Yes');
  const trad_med         = _cnt(records,'traditional_med','Yes');

  // House type breakdown
  const hTypes = {};
  records.forEach(r=>{ const k=r.house_type||'Unknown'; hTypes[k]=(hTypes[k]||0)+1; });
  const hTypeCols = {'Permanent':'#1a5c35','Semi-permanent':'#f39c12','Temporary':'#c0392b','Unknown':'#aaa'};

  // Water source breakdown
  const wSources = {};
  records.forEach(r=>{ (r.water_source||'').split(',').forEach(s=>{ const k=s.trim(); if(k) wSources[k]=(wSources[k]||0)+1; }); });

  // Community health problems (J section)
  const disList = [['diarrhoeal_diseases','Diarrhoeal diseases'],['malaria','Malaria'],['upper_respiratory_tract_infections','Upper RTI'],['eye_infections','Eye infections'],['tuberculosis','TB'],['pneumonia','Pneumonia'],['skin_infections','Skin infections'],['malnutrition','Malnutrition'],['intestinal_worms','Intestinal worms'],['stis','STIs']];
  const disData = disList.map(([k,l])=>({
    label:l,
    children: records.filter(r=>r.raw_json && (()=>{try{const d=typeof r.raw_json==='string'?JSON.parse(r.raw_json):r.raw_json; return d['j_'+k+'_c']==='Yes';}catch(e){return false;}})()).length,
    adults:   records.filter(r=>r.raw_json && (()=>{try{const d=typeof r.raw_json==='string'?JSON.parse(r.raw_json):r.raw_json; return d['j_'+k+'_a']==='Yes';}catch(e){return false;}})()).length,
  })).filter(d=>d.children+d.adults>0).sort((a,b)=>(b.children+b.adults)-(a.children+a.adults));

  // Pests
  const pestList = ['rats','cockroaches','bedbugs','houseflies','mosquitoes','jiggers','ticks','fleas'];
  const pestData = pestList.map(p=>({
    label: p.charAt(0).toUpperCase()+p.slice(1),
    val: records.filter(r=>r.raw_json && (()=>{try{const d=typeof r.raw_json==='string'?JSON.parse(r.raw_json):r.raw_json; return d['k_'+p]==='Present';}catch(e){return false;}})()).length,
    col: '#7b241c'
  })).filter(d=>d.val>0).sort((a,b)=>b.val-a.val);

  // All challenges from Section L
  const allChallenges = [];
  records.forEach(r=>{
    const src = r.raw_json ? (typeof r.raw_json==='string'?JSON.parse(r.raw_json):r.raw_json) : r;
    for(let i=1;i<=10;i++){
      const c = src['l_challenge_'+i] || r['challenge_'+i];
      if(c && c.trim()) allChallenges.push({interviewer:r.interviewer||'Unknown', text:c.trim()});
    }
  });

  const p2b = GP(H('2b',TOTAL), F('2b',TOTAL), '',
    '<h2 class="sec">3. Extended Results — All Survey Sections</h2>'

    //  Maternal & Child Health 
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8pt;margin-bottom:8pt">'
    +'<div>'
    +'<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5pt">D: Maternal &amp; Child Health</h3>'
    +'<table class="dt"><thead><tr><th>Indicator</th><th class="c">Count</th><th class="c">%</th><th class="c">Target</th></tr></thead><tbody>'
    +'<tr><td class="lbl">4+ ANC visits</td><td class="c">'+anc_4plus+'</td><td class="c">'+_pct(anc_4plus,n)+'%</td><td class="c">≥90%</td></tr>'
    +'<tr><td class="lbl">Facility delivery</td><td class="c">'+delivery_facility+'</td><td class="c">'+_pct(delivery_facility,n)+'%</td><td class="c">≥90%</td></tr>'
    +'<tr><td class="lbl">Active pregnancy</td><td class="c">'+preg_yes+'</td><td class="c">'+_pct(preg_yes,n)+'%</td><td class="c">—</td></tr>'
    +'</tbody></table>'
    +'</div>'

    //  Nutrition 
    +'<div>'
    +'<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5pt">E: Nutrition</h3>'
    +'<table class="dt"><thead><tr><th>Indicator</th><th class="c">Count</th><th class="c">%</th></tr></thead><tbody>'
    +'<tr><td class="lbl">≥3 meals/day</td><td class="c">'+nutrition_3meals+'</td><td class="c">'+_pct(nutrition_3meals,n)+'%</td></tr>'
    +'<tr><td class="lbl">Skips meals</td><td class="c">'+nutrition_skip+'</td><td class="c">'+_pct(nutrition_skip,n)+'%</td></tr>'
    +'<tr><td class="lbl">Food sufficient</td><td class="c">'+nutrition_enough+'</td><td class="c">'+_pct(nutrition_enough,n)+'%</td></tr>'
    +'</tbody></table>'
    +'</div></div>'

    //  Housing pie + WASH 
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8pt;margin-bottom:8pt">'
    +'<div>'
    +'<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4pt">B: Housing Type Distribution</h3>'
    +_pie(Object.entries(hTypes).map(([k,v])=>({label:k,val:v,col:hTypeCols[k]||'#888'})),100)
    +'</div>'
    +'<div>'
    +'<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4pt">H: Water Sources</h3>'
    +_pie(Object.entries(wSources).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v],i)=>({label:k,val:v,col:['#1a5c35','#1a4060','#f39c12','#8e44ad','#16a085','#d35400'][i]})),100)
    +'</div></div>'

    //  WASH extended 
    +'<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4pt">G+H: Sanitation &amp; Hygiene Extended</h3>'
    +'<table class="dt" style="margin-bottom:8pt"><thead><tr><th>Indicator</th><th class="c">Yes</th><th class="c">No</th><th class="c">%</th></tr></thead><tbody>'
    +'<tr><td class="lbl">Handwashing facility</td><td class="c">'+handwash_facility+'</td><td class="c">'+(n-handwash_facility)+'</td><td class="c">'+_pct(handwash_facility,n)+'%</td></tr>'
    +'<tr><td class="lbl">Safe water container</td><td class="c">'+safe_container+'</td><td class="c">'+(n-safe_container)+'</td><td class="c">'+_pct(safe_container,n)+'%</td></tr>'
    +'<tr><td class="lbl">HIV uses protection</td><td class="c">'+hiv_protect+'</td><td class="c">'+(n-hiv_protect)+'</td><td class="c">'+_pct(hiv_protect,n)+'%</td></tr>'
    +'<tr><td class="lbl">Uses mosquito net</td><td class="c">'+mosquito_net+'</td><td class="c">'+(n-mosquito_net)+'</td><td class="c">'+_pct(mosquito_net,n)+'%</td></tr>'
    +'<tr><td class="lbl">Net used last night</td><td class="c">'+net_used+'</td><td class="c">'+(n-net_used)+'</td><td class="c">'+_pct(net_used,n)+'%</td></tr>'
    +'<tr><td class="lbl">Uses traditional medicine</td><td class="c">'+trad_med+'</td><td class="c">'+(n-trad_med)+'</td><td class="c">'+_pct(trad_med,n)+'%</td></tr>'
    +'</tbody></table>'

    //  J: Disease table + bar chart 
    +(disData.length
      ? '<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4pt">J: Community Health Problems — Full Breakdown</h3>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8pt;margin-bottom:8pt">'
        +'<table class="dt"><thead><tr><th>Condition</th><th class="c">Children</th><th class="c">Adults</th><th class="c">Total</th><th class="c">%</th></tr></thead><tbody>'
        +disData.map((d,i)=>'<tr><td class="lbl">'+d.label+'</td><td class="c">'+d.children+'</td><td class="c">'+d.adults+'</td><td class="c">'+(d.children+d.adults)+'</td><td class="c">'+_pct(d.children+d.adults,n)+'%</td></tr>').join('')
        +'</tbody></table>'
        +'<div>'+_barChart(disData.map(d=>({label:d.label,val:d.children+d.adults,col:'#7b241c'})))+'</div>'
        +'</div>'
      : '')

    //  K: Pests 
    +(pestData.length
      ? '<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4pt">K: Pests &amp; Vectors Present</h3>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8pt;margin-bottom:8pt">'
        +'<table class="dt"><thead><tr><th>Pest</th><th class="c">Households</th><th class="c">%</th></tr></thead><tbody>'
        +pestData.map(d=>'<tr><td class="lbl">'+d.label+'</td><td class="c">'+d.val+'</td><td class="c">'+_pct(d.val,n)+'%</td></tr>').join('')
        +'</tbody></table>'
        +'<div>'+_pie(pestData.slice(0,6).map((d,i)=>({label:d.label,val:d.val,col:['#7b241c','#c0392b','#e67e22','#d35400','#8e44ad','#1a4060'][i]})),100)+'</div>'
        +'</div>'
      : '')

    //  L: Interviewer Challenges 
    +(allChallenges.length
      ? '<h3 style="font-size:7pt;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4pt">L: Interviewer Challenges &amp; Field Observations ('+allChallenges.length+' recorded)</h3>'
        +'<table class="dt"><thead><tr><th>#</th><th>Interviewer</th><th>Challenge / Observation</th></tr></thead><tbody>'
        +allChallenges.map((c,i)=>'<tr><td class="c lbl">'+(i+1)+'</td><td>'+c.interviewer+'</td><td>'+c.text+'</td></tr>').join('')
        +'</tbody></table>'
      : '')
  );

  const p3 = GP(H(3,TOTAL), F(3,TOTAL), '',
    '<h2 class="sec">4. Per-Interviewer Comparison</h2>'
    +'<p class="note">Colour coding: <span style="color:#12274F;font-weight:700">Navy</span> = at or above target &nbsp;|&nbsp; <span style="color:#b91c1c;font-weight:700">Red</span> = below target. &nbsp; Latrine &amp; Water target: &ge;80% &nbsp;|&nbsp; HIV Awareness target: &ge;90%.</p>'
    +'<table class="dt">'
    +'<thead><tr><th>Interviewer &amp; Reg No.</th><th class="c">HHs</th><th class="c">Latrine %</th><th class="c">Water %</th><th class="c">HIV Aware %</th><th class="c">Tested %</th><th class="c">Flags</th><th>Top Illness</th></tr></thead>'
    +'<tbody>'+ivSummaryRows+'</tbody>'
    +'<tfoot><tr>'
    +'<td class="lbl">CLASS TOTAL / AVERAGE</td>'
    +'<td class="c">'+n+'</td>'
    +'<td class="c" style="color:'+ivColor(_pct(lat,n),80)+';font-weight:700">'+_pct(lat,n)+'%</td>'
    +'<td class="c" style="color:'+ivColor(_pct(wat,n),80)+';font-weight:700">'+_pct(wat,n)+'%</td>'
    +'<td class="c" style="color:'+ivColor(_pct(hiv,n),90)+';font-weight:700">'+_pct(hiv,n)+'%</td>'
    +'<td class="c" style="color:'+ivColorAmb(_pct(tst,n),50,30)+';font-weight:700">'+_pct(tst,n)+'%</td>'
    +'<td class="c" style="color:'+(allF>0?'#b91c1c':'#12274F')+';font-weight:700">'+allF+'</td>'
    +'<td class="lbl">'+(ills[0]?ills[0][0]:'—')+'</td>'
    +'</tr></tfoot></table>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10pt;margin-top:5pt">'
    +'<div>'
    +'<h2 class="sec">5. Discussion</h2>'
    +(_narrative?.discussion
      ? _narrative.discussion.split('\n\n').map(p=>'<p class="bt">'+p+'</p>').join('')
      :'<p class="bt">The findings presented in this report reflect health conditions that are broadly consistent with patterns documented across rural communities in Kisii County and comparable sub-Saharan African settings. Each of the key indicators is discussed below in relation to national targets and the public health evidence base.</p>'
       +'<p class="bt"><strong>Sanitation:</strong> '+(_pct(lat,n)<80?'At <strong>'+_pct(lat,n)+'%</strong>, class-wide pit latrine coverage falls <strong>'+(80-_pct(lat,n))+' percentage points below</strong> the national target of 80%. This demands immediate action under the Community-Led Total Sanitation (CLTS) programme.':'Latrine coverage of <strong>'+_pct(lat,n)+'%</strong> meets the national 80% target — a commendable result.')+'</p>'
       +'<p class="bt"><strong>Water Safety:</strong> '+(_pct(wat,n)<80?'Water treatment coverage of <strong>'+_pct(wat,n)+'%</strong> falls below threshold. Distribute WaterGuard and conduct community education on safe water practices.':'Water treatment coverage of <strong>'+_pct(wat,n)+'%</strong> is satisfactory.')+'</p>'
       +'<p class="bt">Differences in scores between interviewers reflect genuine community-level variation. Lower-scoring areas should be designated as priority zones for targeted health promotion.</p>')
    +'<h2 class="sec">6. Conclusion</h2>'
    +(_narrative?.conclusion
      ? _narrative.conclusion.split('\n\n').map(p=>'<p class="bt">'+p+'</p>').join('')
      :'<p class="bt">This class-wide assessment provides systematic, community-level evidence on the health situation of <strong>'+n+' households in '+locStr+'</strong>. The data gathered through this structured survey paints a clear picture of the primary health challenges facing these communities and identifies the specific areas where coordinated, evidence-based interventions are most urgently needed.</p>'
       +'<p class="bt">'+(_pct(lat,n)<60||_pct(wat,n)<60?'The findings reveal coverage gaps of a magnitude that pose an immediate and serious risk to community wellbeing. Swift, well-resourced intervention — in coordination with sub-county health authorities — is essential.':'While a number of indicators fall within acceptable ranges, the findings point to targeted gaps that require a proactive, preventive approach.')
       +(allF?' In total, <strong>'+allF+' red flag'+(allF!==1?'s were':' was')+' identified</strong> across the surveyed households.':'')
       +' This report is submitted to the course coordinator and institutional health management team for review, integration into the health planning cycle, and action as appropriate.</p>')
    +'</div>'
    +'<div>'
    +'<h2 class="sec">7. Recommendations</h2>'
    +grecs.map(rc=>_fl(rc.l,rc.t,rc.b)).join('')
    +'</div>'
    +'</div>'
  );

  //  PAGE 4+: Per-Interviewer Detail Sections 
  let pgNum = 4;
  const detailPages = [];

  ivs.forEach(iv=>{
    const recs = records.filter(r=>r.interviewer===iv);
    const m    = recs.length;
    const st   = students[iv]||{};
    const chunks = [];
    const chunkSz = 22;
    for(let ci=0; ci<recs.length; ci+=chunkSz){
      chunks.push(recs.slice(ci,ci+chunkSz));
    }

    chunks.forEach((chunk,ci)=>{
      const isFirst = ci===0;
      const ivLat  = _cnt(recs,'latrine','Yes');
      const ivWat  = _cnt(recs,'water_treated','Yes');
      const ivHiv  = _cnt(recs,'hiv_heard','Yes');
      const ivFlags= recs.reduce((a,r)=>a+_flags(r).length,0);
      const ivIll  = _ills(recs);

      const rows = chunk.map((rec,i)=>{
        const f=_flags(rec);
        return '<tr>'
          +'<td class="c lbl">'+(ci*chunkSz+i+1)+'</td>'
          +'<td>'+(rec.interview_date||'—')+'</td>'
          +'<td>'+(rec.location||'—')+'</td>'
          +'<td class="c">'+(rec.respondent_age||'?')+'/'+(rec.respondent_gender||'?').charAt(0)+'</td>'
          +'<td>'+(rec.house_type||'—')+'</td>'
          +'<td class="c" style="color:'+(rec.latrine==='Yes'?'#12274F':'#b91c1c')+';font-weight:700">'+(rec.latrine==='Yes'?'Y':'N')+'</td>'
          +'<td class="c" style="color:'+(rec.water_treated==='Yes'?'#12274F':'#b91c1c')+';font-weight:700">'+(rec.water_treated==='Yes'?'Y':'N')+'</td>'
          +'<td class="c" style="color:'+(rec.hiv_heard==='Yes'?'#12274F':'#b91c1c')+';font-weight:700">'+(rec.hiv_heard==='Yes'?'Y':'N')+'</td>'
          +'<td style="font-size:5.5pt">'+(rec.illnesses||'None')+'</td>'
          +'<td class="c" style="color:'+(f.length?'#b91c1c':'#12274F')+';font-weight:700">'+(f.length||'&#10003;')+'</td>'
          +'</tr>';
      }).join('');

      detailPages.push(GP(H(pgNum,TOTAL),F(pgNum,TOTAL),'',
        (isFirst
          ? '<div class="iv-hdr" style="display:flex;justify-content:space-between;align-items:center;padding:0 0 4pt;border-bottom:2.5px solid #B8902A;margin-bottom:5pt">'
            +'<div><div class="iv-hdr-name" style="font-size:8.5pt;font-weight:800;color:#12274F">'+iv+'</div>'
            +'<div class="iv-hdr-sub" style="font-size:6pt;color:#B8902A;font-weight:700">'+(st.reg_number||'—')+(st.email&&st.email!=='—'?' &middot; '+st.email:'')+'</div></div>'
            +'<div style="display:flex;gap:3pt">'
            +_sb(m,'HHs','blu')
            +_sb(_pct(ivLat,m)+'%','Latrine',_pct(ivLat,m)<80?'red':'')
            +_sb(_pct(ivWat,m)+'%','Water',_pct(ivWat,m)<80?'red':'')
            +_sb(_pct(ivHiv,m)+'%','HIV',_pct(ivHiv,m)<90?'red':'')
            +_sb(ivFlags,'Flags',ivFlags?'red':'')
            +'</div></div>'
            +(ivIll.length?'<p class="note" style="margin-bottom:4pt">Top illness: <strong>'+ivIll[0][0]+'</strong> ('+ivIll[0][1]+' cases). Showing cases 1–'+Math.min(chunkSz,m)+' of '+m+'.</p>':'<p class="note" style="margin-bottom:4pt">Showing cases 1–'+Math.min(chunkSz,m)+' of '+m+'.</p>')
          : '<p class="note" style="margin-bottom:4pt">'+iv+' &nbsp;('+( st.reg_number||'—')+') &nbsp;— Cases '+(ci*chunkSz+1)+'–'+Math.min((ci+1)*chunkSz,m)+' of '+m+' (continued)</p>')
        +'<table class="dt"><thead><tr>'
        +'<th class="c">#</th><th>Date</th><th>Location</th><th class="c">Age/Sex</th>'
        +'<th>House</th><th class="c">Lat</th><th class="c">Water</th><th class="c">HIV</th>'
        +'<th>Illnesses</th><th class="c">Flags</th>'
        +'</tr></thead><tbody>'+rows+'</tbody></table>'
      ));
      pgNum++;
    });
  });

  //  FINAL PAGE: Submission + Signatures 
  const pSig = GP(H(pgNum,TOTAL),F(pgNum,TOTAL),'',
    '<h2 class="sec">8. Submission &amp; Approval</h2>'
    +'<p class="bt">This report is submitted on behalf of the <strong>Community Health Practical Group</strong>, \'+_instN+\'. All household data was independently collected by '+ivs.join(', ')+', under faculty supervision. Each interviewer worked in accordance with the ethical guidelines and academic standards of the university, obtaining verbal informed consent from every respondent and maintaining strict confidentiality throughout the data collection process.</p>'
    +'<p class="bt">The findings presented in this report are submitted in fulfilment of the community health situation analysis practical requirements of \'+_instN+\'. It is respectfully requested that the course coordinator and the institutional health management team consider these findings as a basis for targeted health action in the communities surveyed.</p>'
    +'<table class="dt" style="margin-bottom:8pt">'
    +'<thead><tr><th>Interviewer</th><th>Admission / Reg No.</th><th>Email Address</th><th class="c">HHs Interviewed</th></tr></thead>'
    +'<tbody>'+ivs.map(iv=>{
      const st=students[iv]||{};
      return '<tr><td class="lbl">'+iv+'</td><td class="c">'+(st.reg_number||'—')+'</td><td>'+(st.email&&st.email!=='—'?st.email:'—')+'</td><td class="c">'+records.filter(r=>r.interviewer===iv).length+'</td></tr>';
    }).join('')+'</tbody></table>'
    +_sigs([
      ['Group Leader / Coordinator','Community Health Practical Group · GLU Kisumu'],
      ['Course Coordinator','Faculty · Community Health · GLU Kisumu'],
      ['Institution Supervisor',_instN],
    ])
    +'<p class="note" style="margin-top:8pt;text-align:center">Generated '+now+' &nbsp;&middot;&nbsp; Medical Survey System (MSS) System v3.1 &nbsp;&middot;&nbsp; &copy; 2026 HazzinBR</p>'
  );

  // Build doc with injected group CSS
  const rawDoc = _doc('Group_Report_'+now.replace(/\s+/g,'_'), p1+p2+p2b+p3+detailPages.join('')+pSig);
  return rawDoc.replace('</style>\n<style>html,body', GRP_CSS+'</style>\n<style>html,body');
}


// 
//  ADMIN ENTRY POINTS
//  Support both super-admin (_admRecs) and institution admin (_iaData.records)
// 
function _activeRecs(){
  // Institution admin takes priority; fall back to super-admin variable
  if(typeof _iaData!=='undefined'&&_iaData&&Array.isArray(_iaData.records)&&_iaData.records.length)
    return _iaData.records;
  if(typeof _admRecs!=='undefined'&&Array.isArray(_admRecs)&&_admRecs.length)
    return _admRecs;
  return null;
}
function _ivName(r){ return r.interviewer_name||r.interviewer||'Unknown'; }

async function openInterviewerReport(interviewer){
  const allRecs=_activeRecs();
  if(!allRecs){showToast('No records — tap Refresh',true);return;}
  const recs=allRecs.filter(r=>_ivName(r)===interviewer);
  if(!recs.length){showToast('No records for '+interviewer,true);return;}
  showToast('Building report…');
  const student=await _getStudentDetails(interviewer);
  const html=await buildInterviewerReport(interviewer,recs,student);
  _openReportFrame(html,' '+interviewer+' — Report');
}

function openAllInterviewerReports(){
  const allRecs=_activeRecs();
  if(!allRecs){showToast('No records — tap Refresh',true);return;}
  const ivNames=[...new Set(allRecs.map(_ivName))].filter(Boolean).sort();
  if(ivNames.length===1){openInterviewerReport(ivNames[0]);return;}

  var ex=document.getElementById('rpt-menu');if(ex)ex.remove();
  var menu=document.createElement('div');
  menu.id='rpt-menu';
  menu.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;';
  var btns='';
  ivNames.forEach(function(iv){
    var cnt=allRecs.filter(function(r){return _ivName(r)===iv;}).length;
    btns+='<button class="rpt-iv-btn" data-iv="'+encodeURIComponent(iv)+'" style="width:100%;padding:11px 14px;background:#f4f8f5;border:1.5px solid #cce0d4;border-radius:10px;font-family:inherit;font-size:.86rem;font-weight:700;color:#1a5c35;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center"> '+iv+'<span style="font-size:.68rem;font-weight:400;color:#6b8a74">'+cnt+' record'+(cnt!==1?'s':'')+'</span></button>';
  });
  menu.innerHTML='<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom))">'
    +'<div style="font-weight:800;font-size:1rem;color:#1a5c35;margin-bottom:3px"> Select Report</div>'
    +'<div style="font-size:.72rem;color:#6b8a74;margin-bottom:13px">Individual interviewer or full class group report</div>'
    +'<div style="display:flex;flex-direction:column;gap:7px">'+btns
    +'<button id="rpt-grp" style="width:100%;padding:11px 14px;background:linear-gradient(135deg,#0d3b66,#1a5fa8);border:none;border-radius:10px;font-family:inherit;font-size:.86rem;font-weight:700;color:#fff;cursor:pointer;display:flex;justify-content:space-between;align-items:center"> Class Group Report<span style="font-size:.68rem;opacity:.7">'+allRecs.length+' records</span></button>'
    +'<button id="rpt-cancel" style="width:100%;padding:10px;background:#f0f0f0;border:none;border-radius:10px;font-family:inherit;font-size:.82rem;cursor:pointer;color:#888">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(menu);
  menu.querySelectorAll('.rpt-iv-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      menu.remove();
      openInterviewerReport(decodeURIComponent(btn.getAttribute('data-iv')));
    });
  });
  document.getElementById('rpt-grp').addEventListener('click',function(){menu.remove();openGroupReport();});
  document.getElementById('rpt-cancel').addEventListener('click',function(){menu.remove();});
  menu.addEventListener('click',function(e){if(e.target===menu)menu.remove();});
}

async function openGroupReport(){
  const allRecs=_activeRecs();
  if(!allRecs){showToast('No records — tap Refresh',true);return;}
  showToast('Building group report… this may take a moment');
  const ivNames=[...new Set(allRecs.map(_ivName))].sort();
  const students={};
  for(const iv of ivNames){ students[iv]=await _getStudentDetails(iv); }
  const html=await buildGroupReport(allRecs,students);
  _openReportFrame(html,' Class Group Report');
}

function _openReportFrame(html, title){
  // Always use Blob URL + window.open — works on Android without iframe/overlay dependency
  try{
    const blob = new Blob([html], {type:'text/html;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if(win){
      if(typeof showToast==='function') showToast('Report opened — use Print to save as PDF');
      setTimeout(()=>URL.revokeObjectURL(url), 120000);
      return;
    }
    URL.revokeObjectURL(url);
  }catch(e){}

  // Fallback: in-app iframe overlay (super admin only)
  const ov=document.getElementById('report-overlay');
  const fr=document.getElementById('report-frame');
  const ti=document.getElementById('report-title');
  if(!ov||!fr){if(typeof showToast==='function') showToast('Allow popups for this site then try again',true);return;}
  const doc=fr.contentDocument||fr.contentWindow.document;
  doc.open();doc.write(html);doc.close();
  if(ti)ti.textContent=title;
  const isAdmin = localStorage.getItem('chsa_is_admin_bypass')==='1';
  const closeBtn = document.getElementById('report-close-btn');
  if(closeBtn) closeBtn.textContent = isAdmin ? '← Dashboard' : '❌ Close';
  // Set display:flex directly — NEVER use showScreen() here.
  // showScreen() hides ALL registered screens first (including report-overlay)
  // before showing the target, killing the report we just opened.
  ov.style.display='flex';
}

// 
//  PRINT — opens report in new tab, browser prints natively as PDF
//  This is the ONLY print/download trigger. No download inside report.
// 
function printReport(){
  const fr=document.getElementById('report-frame');
  if(!fr){showToast('No report open',true);return;}
  const ti=document.getElementById('report-title');
  const name=(ti?ti.textContent:'Health-Report').replace(/[^a-zA-Z0-9\s\-]/g,'').trim().replace(/\s+/g,'_')||'Health-Report';
  try{
    const innerDoc=fr.contentDocument||fr.contentWindow.document;
    // Extract the full HTML — CSS is embedded inside already
    const fullHTML='<!DOCTYPE html>'+innerDoc.documentElement.outerHTML;
    // Open in a new tab as a blob — same origin, no cross-frame issues
    const blob=new Blob([fullHTML],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const win=window.open(url,'_blank');
    if(win){
      showToast('Report opened — use browser Print to save as PDF');
      setTimeout(()=>URL.revokeObjectURL(url),120000);
    } else {
      // Popup blocked — trigger download instead
      const a=document.createElement('a');
      a.href=url;
      a.download=name+'_'+new Date().toISOString().split('T')[0]+'.html';
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      showToast('Downloaded — open file then Print → Save as PDF');
    }
  }catch(e){showToast('Error: '+e.message,true);}
}

function closeReportOverlay(){
  const ov=document.getElementById('report-overlay');
  if(ov){ ov.classList.remove('open'); ov.style.display='none'; }
  // If opened from My Reports panel, return there
  if(window._reportFromMyReports){
    window._reportFromMyReports=false;
    if(typeof openMyReportsPanel==='function'){ setTimeout(openMyReportsPanel,200); return; }
  }
  // Return each role to their correct home
  const session = (typeof authGetSession==='function') ? authGetSession() : null;
  const role = session?.role || 'user';
  if(role==='super_admin' || localStorage.getItem('chsa_is_admin_bypass')==='1'){
    if(typeof openAdminDash==='function') setTimeout(openAdminDash, 200);
  } else if(role==='institution_admin' || localStorage.getItem('chsa_is_inst_admin')==='1'){
    if(typeof showInstAdminHome==='function') setTimeout(showInstAdminHome, 200);
  } else {
    if(typeof goBackHome==='function') setTimeout(goBackHome, 200);
  }
}
function startNewSurveyFromReport(){ closeReportOverlay(); newRec(); showToast(' New survey started'); }
function goHomeFromReport(){ closeReportOverlay(); }

// 
//  SURVEY FINISH MODAL REPORTS
// 
async function openBriefReport(){
  // Close finish modal UI only — do NOT call closeFinish() which calls showScreen('survey')
  // and navigates away from the report before it renders.
  const fm = document.getElementById('finModal');
  if(fm) fm.classList.remove('open');
  const r = cRec();
  if(!r || (!r.a_age && !r.interview_date && !r.interviewer_name)){
    showToast('No record data — please fill in the survey first', true); return;
  }
  const metrics = (typeof computeSurveyMetrics === 'function') ? computeSurveyMetrics([r]) : null;
  const idHeader = (typeof buildIdentityReportHeader === 'function') ? await buildIdentityReportHeader() : '';
  _openReportFrame(_injectIdentityHeader(buildBriefReport(r, metrics), idHeader), ' Brief Report');
}
async function openFullReport(){
  const fm = document.getElementById('finModal');
  if(fm) fm.classList.remove('open');
  const r = cRec();
  if(!r || (!r.a_age && !r.interview_date && !r.interviewer_name)){
    showToast('No record data — please fill in the survey first', true); return;
  }
  const idHeader = (typeof buildIdentityReportHeader === 'function') ? await buildIdentityReportHeader() : '';
  _openReportFrame(_injectIdentityHeader(buildFullReport(), idHeader), ' Full Report');
}
async function openIMRaDReport(){
  const fm = document.getElementById('finModal');
  if(fm) fm.classList.remove('open');
  const r = cRec();
  if(!r || (!r.a_age && !r.interview_date && !r.interviewer_name)){
    showToast('No record data — please fill in the survey first', true); return;
  }
  const metrics = (typeof computeSurveyMetrics === 'function') ? computeSurveyMetrics([r]) : null;
  const idHeader = (typeof buildIdentityReportHeader === 'function') ? await buildIdentityReportHeader() : '';
  _openReportFrame(_injectIdentityHeader(buildIMRaDReport(r, metrics), idHeader), ' IMRaD Report');
}

function _injectIdentityHeader(html, idHeader){
  if(!idHeader) return html;
  // Try to inject after the meta table, before .body div
  const injected = html.replace(/(<\/table>(\s*)<div class="body">)/, '$2' + idHeader + '$1');
  if(injected !== html) return injected;
  // Fallback: inject at first .body div
  return html.replace(/(<div class="body">)/, idHeader + '$1');
}
function exportJSON(){
  closeFinish();
  const rec=cRec();
  const blob=new Blob([JSON.stringify(rec,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='survey_'+(rec.interviewer_name||'record').replace(/\s/g,'_')+'_'+(rec.interview_date||new Date().toISOString().split('T')[0])+'.json';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast(' JSON exported');
}


//  BRIEF / FULL / IMRAD builders 

function buildBriefReport(r, metrics){
  const {flags,concerns}=extractFlags(r);
  const totPeople=(parseInt(r.a_tot_m)||0)+(parseInt(r.a_tot_f)||0);
  const water=[].concat(r.h_wsrc||[]).join(', ')||'None recorded';
  const illness=[].concat(r.c_ill||[]).join(', ')||'None reported';
  const deaths=r.c_deaths==='Yes'?`Yes (${r.c_deaths_n||'?'} deaths in 5 years)`:'None reported';
  const latrine=r.g_latrine==='Yes'?`Yes (${r.g_lat_u||'—'})`:r.g_latrine==='No'?'NO LATRINE':'—';
  const now=new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const flagHTML=flags.length?flags.map(f=>rptFlag(' '+f,'red')).join(''):rptFlag(' No critical red flags identified','ok');
  const concernHTML=concerns.length?concerns.map(c=>rptFlag(' '+c,'amber')).join(''):rptFlag(' No significant concerns','ok');

  // Processed metrics from data-processor
  const mInfra  = metrics && metrics.infrastructure  || {};
  const mHealth  = metrics && metrics.health         || {};
  const mNutr   = metrics && metrics.nutrition       || {};
  const mMCH    = metrics && metrics.maternal_child  || {};
  const mEnv    = metrics && metrics.environmental   || {};
  const mRisk   = metrics && metrics.risk_profiles   || [];
  const mRec    = metrics && metrics.recommendations || [];

  const _pctBadge=(label,pct)=>{
    if(pct===undefined||pct===null) return '';
    const col=pct>=80?'#1e5c38':pct>=60?'#b45309':'#c0392b';
    const bg =pct>=80?'#e8f5ed':pct>=60?'#fff8e1':'#fdecea';
    return `<div style="background:${bg};border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:.74rem;color:#333">${label}</span><span style="font-size:.9rem;font-weight:800;color:${col}">${pct}%</span></div>`;
  };

  const processedMetricsHTML = metrics ? `
  <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#1d4ed8;margin-bottom:10px;"> Processed Health Indicators</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px;">
      ${_pctBadge('Pit Latrine Coverage',mInfra.pct_pit_latrine)}
      ${_pctBadge('Water Treated',mInfra.pct_water_treated)}
      ${_pctBadge('HIV Awareness',mHealth.pct_hiv_aware)}
      ${_pctBadge('HIV Tested',mHealth.pct_hiv_tested)}
      ${_pctBadge('Food Sufficient',mNutr.pct_food_sufficient)}
      ${_pctBadge('Children Immunised',mMCH.pct_immunised)}
      ${_pctBadge('Mosquito Net',mEnv.pct_mosquito_net)}
      ${_pctBadge('Permanent House',mInfra.pct_permanent_house)}
    </div>
    ${mRisk.length ? `<div style="font-size:.72rem;font-weight:700;color:#c0392b;margin-bottom:5px;"> Risk Profile: ${mRisk[0].level||''}</div>
    <div style="font-size:.73rem;color:#555;">${mRisk[0].factors ? mRisk[0].factors.slice(0,3).join(' · ') : ''}</div>` : ''}
    ${mRec.length ? `<div style="margin-top:10px;"><div style="font-size:.72rem;font-weight:800;color:#b45309;margin-bottom:5px;"> Top Recommendations</div>
    ${mRec.slice(0,3).map(rec=>`<div style="background:${rec.priority==='CRITICAL'?'#fce4ec':rec.priority==='HIGH'?'#fff3e0':'#e8f5ed'};border-radius:7px;padding:7px 10px;margin-bottom:5px;font-size:.73rem;"><strong style="color:${rec.priority==='CRITICAL'?'#c0392b':rec.priority==='HIGH'?'#e65100':'#1e5c38'}">${rec.priority} · ${rec.category}</strong><br>${rec.action||rec.issue||''}</div>`).join('')}
    </div>` : ''}
  </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Brief Health Report</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${RPT_BASE_CSS}
</style></head><body>
${buildStudentCoverPage(r,'BRIEF REPORT','#0a3d1f','#1a5c35')}
<div class="page">
<div class="page-stripe"></div>
${rptHeader('','Community Health Brief Report',`${_getInstName()} · ${now}`)}
${rptMeta([['Interviewer',r.interviewer_name||getUserName()],['Date',r.interview_date||now],['Location',r.interview_location||r.interview_location_custom],['Respondent',(r.a_age||'?')+' yrs, '+(r.a_gender||'?')+', '+(r.a_marital||'?')]])}
<div class="body">
  ${rptSec('📝 Narrative Summary')}
  <div class="summary-box"><div class="summary-text">
    This interview was conducted with a <b>${r.a_age||'?'}-year-old ${r.a_gender||'person'}</b>
    ${r.a_marital?`(${r.a_marital})`:''}${r.a_pos?`, the <b>${r.a_pos}</b> of the household`:''}
    in <b>${r.interview_location||r.interview_location_custom||'the community'}</b>.
    The household has <b>${totPeople} member${totPeople!==1?'s':''}</b> (${r.a_tot_m||0} male, ${r.a_tot_f||0} female).
    They live in a <b>${r.b_type||'?'} house</b> with <b>${r.b_roof||'?'} roofing</b> and <b>${r.b_floor||'?'} floor</b>.
    Primary water source is <b>${water}</b> ${r.h_treat==='Yes'?'(treated before drinking)':r.h_treat==='No'?'<span class="red">(NOT treated — risk)</span>':''}.
    ${r.g_latrine==='Yes'?'The household has a pit latrine.':'<span class="red">There is NO pit latrine.</span>'}
    ${r.f_heard==='No'?'<span class="red">Respondent has never heard of HIV/AIDS.</span>':r.f_tested==='Yes'?'Respondent has been tested for HIV.':'Respondent has NOT been tested for HIV.'}
    ${[].concat(r.c_ill||[]).length>0?`Illnesses reported in past 6 months: <b>${illness}</b>.`:'No illnesses reported in past 6 months.'}
  </div></div>
  ${rptSec('🏠 Key Household Data')}
  <div class="grid2">
    ${rptStat('House Type',r.b_type)}${rptStat('Household Size',totPeople+' people')}
    ${rptStat('Bedrooms',r.b_rooms)}${rptStat('Per Bedroom',r.b_proom+' people')}
    ${rptStat('Water Source',water)}${rptStat('Water Treated',r.h_treat)}
    ${rptStat('Pit Latrine',latrine)}${rptStat('Main Fuel',r.b_fuel)}
    ${rptStat('Deaths (5 yrs)',deaths)}${rptStat('HIV Tested',r.f_tested)}
    ${rptStat('Education',r.a_edu)}${rptStat('Occupation',r.a_occ)}
  </div>
  ${rptSec('🚨 Red Flags — Requires Immediate Attention')}${flagHTML}
  ${processedMetricsHTML}
  ${rptSec('⚠️ Concerns — Follow Up Recommended')}${concernHTML}
  ${rptSec(' Illnesses Reported')}
  ${rptFlag([].concat(r.c_ill||[]).length>0?' '+illness:'No illnesses recorded',[].concat(r.c_ill||[]).length>0?'amber':'ok')}
  ${r.c_consult?rptFlag('Consultation sought: '+r.c_consult+(r.c_where?' — at '+r.c_where:''),r.c_consult==='Yes'?'ok':'amber'):''}
  ${['rats','cockroaches','mosquitoes','jiggers','bedbugs'].some(p=>r['k_'+p]==='Present')?rptSec(' Pests Observed')+''+['Rats','Cockroaches','Mosquitoes','Jiggers','Bedbugs','Houseflies','Ticks','Fleas','Tsetse_flies'].filter(p=>r['k_'+p.toLowerCase()]==='Present').map(p=>rptFlag(' '+p.replace('_',' ')+' — present','amber')).join(''):''}
  ${r.k_notes?rptSec(' Interviewer Notes')+'<div class="summary-box"><div class="summary-text">'+r.k_notes+'</div></div>':''}
  ${(()=>{
    const _chs=[1,2,3,4,5,6,7,8,9,10].map(n=>r['l_challenge_'+n]).filter(Boolean);
    if(!_chs.length && !r.l_summary) return '';
    let html=rptSec(' Interviewer Challenges');
    html+='<ol style="margin:0 0 8px;padding-left:18px;">';
    _chs.forEach((c,i)=>{ html+='<li style="font-size:0.78rem;margin-bottom:3px;">'+c+'</li>'; });
    html+='</ol>';
    if(r.l_summary) html+='<div class="summary-box"><div class="summary-text">'+r.l_summary+'</div></div>';
    return html;
  })()}
</div>
${rptSig()}${rptPrintBtn()}</div></div></body></html>`;
}

function buildFullReport(){
  const cards=document.querySelectorAll('.sec-card');
  cards.forEach(c=>c.style.display='block');
  const now=new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const r=cRec();
  const name=r.interviewer_name||getUserName()||'—';
  const loc=r.interview_location||r.interview_location_custom||'—';
  let sectionsHTML='';
  document.querySelectorAll('.sec-card').forEach((card,i)=>{
    const hdr=card.querySelector('.sec-hdr');
    const body=card.querySelector('.sec-body');
    if(!hdr||!body)return;
    const title=hdr.querySelector('.sec-title')?.textContent||'Section '+(i+1);
    const badge=hdr.querySelector('.sec-badge')?.textContent||'';
    const color=hdr.style.background||'linear-gradient(135deg,#1e5c38,#27764a)';
    let rows='';
    body.querySelectorAll('.form-group').forEach(grp=>{
      const lbl=grp.querySelector('.ql')?.textContent?.replace('*','').trim();
      if(!lbl)return;
      const checked=[...grp.querySelectorAll('input:checked,select')].map(el=>{if(el.type==='radio'||el.type==='checkbox')return el.checked?el.value:'';return el.value;}).filter(Boolean).join(', ');
      const text=[...grp.querySelectorAll('input[type=text],input[type=number],input[type=date],textarea')].map(el=>el.value).filter(Boolean).join(' ');
      const val=checked||text;
      if(!val)return;
      rows+=`<tr><td style="padding:7px 12px;color:#666;width:45%;font-size:0.76rem;vertical-align:top;border-bottom:1px solid #f0f0f0">${lbl}</td><td style="padding:7px 12px;font-weight:600;color:#1a2b22;font-size:0.82rem;border-bottom:1px solid #f0f0f0">${val}</td></tr>`;
    });
    if(!rows)return;
    sectionsHTML+=`<div style="margin-bottom:18px;border-radius:10px;overflow:hidden;border:1px solid #e0e0e0"><div style="${color};color:#fff;padding:9px 14px;font-size:0.82rem;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact"><span style="background:rgba(255,255,255,.2);padding:2px 8px;border-radius:99px;font-size:0.65rem;margin-right:6px;letter-spacing:.5px">${badge}</span>${title}</div><table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
  });
  cards.forEach((c,i)=>c.style.display=i===cur?'block':'none');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Full Health Survey Report</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${RPT_BASE_CSS}</style></head><body>
${buildStudentCoverPage(r,'FULL REPORT','#1a4f6e','#1e5c38')}
<div class="page">
<div class="page-stripe"></div>
${rptHeader('','Full Medical Survey System (MSS) Report',`${_getInstName()} · ${now}`,'#1a4f6e','#1e5c38')}
${rptMeta([['Interviewer',name],['Date',r.interview_date||now],['Location',loc],['Respondent',(r.a_age||'?')+' yrs · '+(r.a_gender||'?')+' · '+(r.a_marital||'?')]])}
<div class="body">${sectionsHTML}</div>
${rptSig()}${rptPrintBtn()}</div></div></body></html>`;
}

function buildIMRaDReport(r, metrics){
  const {flags,concerns}=extractFlags(r);
  const now=new Date().toLocaleDateString('en-KE',{year:'numeric',month:'long',day:'numeric'});
  const totPeople=(parseInt(r.a_tot_m)||0)+(parseInt(r.a_tot_f)||0);
  const water=[].concat(r.h_wsrc||[]).join(', ')||'not specified';
  const illnesses=[].concat(r.c_ill||[]);
  const name=r.interviewer_name||getUserName()||'Unknown Interviewer';
  const loc=r.interview_location||r.interview_location_custom||'';

  // Processed metrics from data-processor
  const mInfra = metrics && metrics.infrastructure  || {};
  const mHealth = metrics && metrics.health         || {};
  const mNutr  = metrics && metrics.nutrition       || {};
  const mMCH   = metrics && metrics.maternal_child  || {};
  const mEnv   = metrics && metrics.environmental   || {};
  const mQual  = metrics && metrics.data_quality    || {};
  const mRisk  = metrics && metrics.risk_profiles   || [];
  const mRec   = metrics && metrics.recommendations || [];

  //  Dynamic discussion: pick most critical finding 
  let keyFinding='';
  if(flags.includes('No pit latrine — open defecation risk'))
    keyFinding='The absence of a pit latrine is the most critical finding in this household, directly increasing the risk of diarrhoeal disease transmission.';
  else if(r.f_heard==='No')
    keyFinding='The respondent\'s complete lack of awareness of HIV/AIDS highlights a significant health education gap that requires immediate follow-up.';
  else if(r.h_treat==='No')
    keyFinding='The household\'s failure to treat drinking water is the primary concern, presenting an ongoing risk of waterborne disease.';
  else if(illnesses.length>0)
    keyFinding=`Reported illness (${illnesses.join(', ')}) in the past 6 months signals active disease burden in this household requiring clinical follow-up.`;
  else if(flags.length>0)
    keyFinding=flags[0]+' — this was the primary red flag identified during the interview.';
  else
    keyFinding='No critical red flags were identified. This household demonstrates relatively good health indicators for the community setting.';

  //  Mortality 
  const deathsText=r.c_deaths==='Yes'?`${r.c_deaths_n||'an unspecified number of'} death(s) in the past 5 years`:'no deaths in the past 5 years';

  //  Section scores (0–5 scale) 
  const scores={
    housing: (r.b_type==='Permanent'?2:r.b_type==='Semi-permanent'?1:0)+(r.b_floor==='Cemented'?1:0)+(r.b_light==='Electricity'?1:0)+(r.b_win!=='None'?1:0),
    water:   (r.h_treat==='Yes'?2:0)+([].concat(r.h_wsrc||[]).some(s=>s.includes('Piped')||s.includes('Borehole'))?2:0)+(r.h_wc==='Yes'?1:0),
    sanit:   (r.g_latrine==='Yes'?3:0)+(r.g_lat_u==='Family'?1:0)+(r.g_lat_n>1?1:0),
    hiv:     (r.f_heard==='Yes'?2:0)+(r.f_tested==='Yes'?2:0)+(r.f_protect==='Yes'?1:0),
    nutr:    (r.e_meals>=3?2:r.e_meals>=2?1:0)+(r.e_skip==='No'?2:0)+(r.e_enough==='Yes'?1:0),
  };
  const scoreBar=(val,max=5,col='#1e5c38')=>{
    const pct=Math.round((Math.min(val,max)/max)*100);
    const col2=pct<40?'#c0392b':pct<70?'#f39c12':col;
    return `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;background:#f0f0f0;border-radius:99px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${col2};border-radius:99px"></div></div><span style="font-size:0.7rem;font-weight:700;color:${col2};min-width:28px">${val}/${max}</span></div>`;
  };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>IMRaD Health Report — ${name}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${RPT_BASE_CSS}
h1{font-family:'Merriweather',Georgia,serif;font-size:1.15rem;font-weight:700;color:#0f1f18;line-height:1.35;margin-bottom:8px;}
h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#6b8a74;border-bottom:2px solid #e8f5ed;padding-bottom:5px;margin:20px 0 10px;}
h3{font-size:0.85rem;font-weight:700;color:#1a5c35;margin:12px 0 5px;}
p{font-size:0.84rem;line-height:1.75;color:#1a2b22;margin-bottom:10px;}
.abstract-box{background:linear-gradient(135deg,#e8f5ed,#edf4fb);border:1.5px solid #cce0d4;border-radius:12px;padding:14px 18px;margin-bottom:4px;}
.abstract-box p{font-style:italic;font-size:0.82rem;}
.kw{display:inline-block;background:#e8f5ed;color:#1a5c35;border:1px solid #cce0d4;border-radius:99px;padding:2px 10px;font-size:0.68rem;font-weight:600;margin:2px;}
.score-row{display:grid;grid-template-columns:130px 1fr;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f5f5f5;}
.score-row:last-child{border-bottom:none;}
.score-lbl{font-size:0.76rem;font-weight:600;color:#1a2b22;}
.data-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;}
.flag-item{padding:8px 12px;border-radius:8px;font-size:0.8rem;margin-bottom:5px;line-height:1.4;}
.flag-red{background:#fdecea;color:#c0392b;border-left:3px solid #c0392b;}
.flag-amber{background:#fff8e1;color:#e65100;border-left:3px solid #f39c12;}
.flag-ok{background:#e8f5ed;color:#1e5c38;border-left:3px solid #4CAF72;}
</style></head><body>
${buildStudentCoverPage(r,'IMRaD REPORT','#4a235a','#7b3fa0')}
<div class="page">
<div class="page-stripe"></div>
${rptHeader('','Community Health Situation Analysis — Individual Report',`${_getInstName()} · ${now}`)}
${rptMeta([['Interviewer',name],['Date',r.interview_date||now],['Location',loc],['Respondent',(r.a_age||'?')+' yrs, '+(r.a_gender||'?')],['Record ID',r._id||'—']])}
<div class="body">

  <!-- TITLE -->
  <h1>Health Situation Analysis: A Household Survey Report from ${loc}</h1>
  <p style="font-size:.75rem;color:#6b8a74">Submitted by: <strong>${name}</strong> &nbsp;·&nbsp; \'+_getInstName()+' &nbsp;·&nbsp; Date: ${r.interview_date||now}</p>
  <div style="margin-bottom:6px">${['Community Health','Sanitation','HIV/AIDS','Housing','Kenya'].map(k=>`<span class="kw">${k}</span>`).join('')}</div>

  <!-- ABSTRACT -->
  <h2>Abstract</h2>
  <div class="abstract-box">
    <p>This report presents findings from a household health situation analysis conducted at <strong>${loc}</strong> under the \'+_getInstName()+' community health programme. The interview was carried out with a <strong>${r.a_age||'?'}-year-old ${r.a_gender||'respondent'}</strong>, ${r.a_marital||''}${r.a_pos?', serving as the '+r.a_pos+' of the household':''}. The household comprises <strong>${totPeople} member${totPeople!==1?'s':''}</strong>. Key findings include ${r.g_latrine==='No'?'<strong>absence of a pit latrine</strong>, ':''}${r.h_treat==='No'?'<strong>untreated drinking water</strong>, ':''}${r.f_heard==='No'?'<strong>no awareness of HIV/AIDS</strong>, ':''}${illnesses.length>0?'reported illnesses including <strong>'+illnesses.slice(0,2).join(' and ')+'</strong>, ':''}<strong>${flags.length} red flag${flags.length!==1?'s':''}</strong> and <strong>${concerns.length} concern${concerns.length!==1?'s':''}</strong> were identified. ${keyFinding}</p>
  </div>

  <!-- INTRODUCTION -->
  <h2>1. Introduction</h2>
  <p>This household visit was conducted as part of the community health situation analysis programme. The programme aims to assess the prevailing health conditions, identify risk factors, and generate actionable recommendations for improving community health outcomes in line with Kenya\u2019s Health Policy 2014–2030 and the Sustainable Development Goals (SDGs), particularly SDG 3 (Good Health and Well-Being).</p>
  <p>Consent was obtained from the respondent prior to commencing the interview. ${r.consent_given==='Yes'?'The respondent willingly agreed to participate and was informed of their right to withdraw.':'The interview status requires verification.'} The respondent is the <strong>${r.a_pos||'household member'}</strong>, aged <strong>${r.a_age||'?'} years</strong>, ${r.a_gender||''}, ${r.a_marital||''}, with an education level of <strong>${r.a_edu||'not specified'}</strong> and occupation of <strong>${r.a_occ||'not specified'}</strong>.</p>

  <!-- METHODS -->
  <h2>2. Methods</h2>
  <p>A structured household questionnaire was administered face-to-face by the interviewer on <strong>${r.interview_date||now}</strong> at <strong>${loc}</strong>. The tool covers 12 thematic sections: Consent, Demography, Housing, Medical History, Maternal &amp; Child Health, Nutrition, HIV/AIDS, Sanitation, Environment &amp; Water, Cultural Practices, Community Health Problems, and Pests &amp; Vectors. Data was recorded digitally on the Medical Survey System (MSS) Progressive Web Application (PWA) and synchronised to a secure cloud database. The household was selected through purposive community sampling coordinated by the local sub-county health office.</p>

  <!-- RESULTS -->
  <h2>3. Results</h2>

  <h3>3.1 Household Composition &amp; Demographics</h3>
  <div class="data-grid">
    ${rptStat('Total Members',totPeople+' ('+r.a_tot_m+' M / '+r.a_tot_f+' F)')}
    ${rptStat('House Type',r.b_type)}
    ${rptStat('Roofing',r.b_roof)}
    ${rptStat('Floor Type',r.b_floor)}
    ${rptStat('Bedrooms',r.b_rooms)}
    ${rptStat('Persons/Bedroom',r.b_proom)}
    ${rptStat('Lighting',r.b_light)}
    ${rptStat('Cooking Fuel',r.b_fuel)}
  </div>

  <h3>3.2 Health Indicator Scores &amp; Visual Summary</h3>
  <div style="background:#f9f7f4;border-radius:10px;padding:14px 16px;margin-bottom:8px">
    <div class="score-row"><span class="score-lbl"> Housing Quality</span>${scoreBar(scores.housing,5)}</div>
    <div class="score-row"><span class="score-lbl"> Water Safety</span>${scoreBar(scores.water,5)}</div>
    <div class="score-row"><span class="score-lbl"> Sanitation</span>${scoreBar(scores.sanit,5)}</div>
    <div class="score-row"><span class="score-lbl"> HIV Awareness</span>${scoreBar(scores.hiv,5)}</div>
    <div class="score-row"><span class="score-lbl"> Nutrition</span>${scoreBar(scores.nutr,5)}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px">
    <div style="background:#f9f7f4;border-radius:10px;padding:12px">
      <div style="font-size:0.72rem;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Key Indicators (This Household)</div>
      ${(()=>{
        const _yes='#1a5c35', _no='#c0392b', _na='#aaa';
        return _pie([
          {label:'Latrine: '+(r.g_latrine||'?'), val:1, col:r.g_latrine==='Yes'?_yes:_no},
          {label:'Water Treated: '+(r.h_treat||'?'), val:1, col:r.h_treat==='Yes'?_yes:_no},
          {label:'HIV Aware: '+(r.f_heard||'?'), val:1, col:r.f_heard==='Yes'?_yes:_no},
          {label:'HIV Tested: '+(r.f_tested||'?'), val:1, col:r.f_tested==='Yes'?_yes:_no},
          {label:'Food Enough: '+(r.e_enough||'?'), val:1, col:r.e_enough==='Yes'?_yes:r.e_enough==='No'?_no:_na},
        ], 80);
      })()}
    </div>
    <div style="background:#f9f7f4;border-radius:10px;padding:12px">
      <div style="font-size:0.72rem;font-weight:800;color:#1a5c35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Household Composition</div>
      ${(()=>{
        const m=parseInt(r.a_tot_m)||0, f2=parseInt(r.a_tot_f)||0;
        if(!m&&!f2) return '<div style="font-size:0.72rem;color:#aaa">No data</div>';
        return _pie([{label:'Male',val:m,col:'#1a4060'},{label:'Female',val:f2,col:'#8e44ad'}],80);
      })()}
    </div>
  </div>

  <h3>3.3 Water &amp; Sanitation</h3>
  <div class="data-grid">
    ${rptStat('Water Source',water)}
    ${rptStat('Water Treated',r.h_treat)}
    ${rptStat('Treatment Method',[].concat(r.h_tm||[]).join(', ')||'—')}
    ${rptStat('Pit Latrine',r.g_latrine)}
    ${rptStat('Latrine Ownership',r.g_lat_u||'—')}
    ${rptStat('No. of Latrines',r.g_lat_n||'—')}
  </div>

  <h3>3.4 Maternal, Child Health &amp; Nutrition</h3>
  <div class="data-grid">
    ${rptStat('Pregnancy Status',r.d_preg||'—')}
    ${rptStat('ANC Visits',r.d_anc||'—')}
    ${rptStat('Delivery Place',r.d_del||'—')}
    ${rptStat('Children Under 5',r.d_ch5||'—')}
    ${rptStat('Immunisation',r.d_imm||'—')}
    ${rptStat('Meals per Day',r.e_meals||'—')}
    ${rptStat('Skips Meals',r.e_skip||'—')}
    ${rptStat('Food Enough',r.e_enough||'—')}
  </div>
  ${r.e_food?`<p>Food sources: <strong>${[].concat(r.e_food||[]).join(', ')}</strong>.</p>`:''}

  <h3>3.5 Illness &amp; Mortality</h3>
  <p>Illnesses reported in the past 6 months: <strong>${illnesses.length>0?illnesses.join(', '):'None reported'}</strong>. Medical consultation was ${r.c_consult==='Yes'?'sought':'NOT sought'}${r.c_where?' at '+r.c_where:''}. The household reported ${deathsText}${r.c_deaths==='Yes'&&r.c_dage?', age group affected: '+r.c_dage:''}${r.c_deaths==='Yes'&&r.c_dcause?', probable cause: '+[].concat(r.c_dcause||[]).join(', '):''}.</p>
  ${r.c_chronic?`<p>Chronic illness: <strong>${r.c_chronic}</strong>.</p>`:''}

  <h3>3.6 HIV/AIDS &amp; Reproductive Health</h3>
  <div class="data-grid">
    ${rptStat('Heard of HIV/AIDS',r.f_heard)}
    ${rptStat('Ever Tested',r.f_tested)}
    ${rptStat('Knows Transmission',r.f_know_t||'—')}
    ${rptStat('Uses Protection',r.f_protect||'—')}
    ${rptStat('Partner Tested',r.f_partner||'—')}
  </div>

  <h3>3.7 Sanitation &amp; Hygiene</h3>
  <div class="data-grid">
    ${rptStat('Pit Latrine',r.g_latrine)}
    ${rptStat('Latrine Ownership',r.g_lat_u||'—')}
    ${rptStat('No. of Latrines',r.g_lat_n||'—')}
    ${rptStat('Handwashing Facility',r.g_hand||'—')}
    ${rptStat('Washes Hands When',[].concat(r.g_wash||[]).join(', ')||'—')}
  </div>

  <h3>3.8 Water &amp; Environment</h3>
  <div class="data-grid">
    ${rptStat('Water Source',water)}
    ${rptStat('Water Treated',r.h_treat)}
    ${rptStat('Safe Container',r.h_wc||'—')}
    ${rptStat('Waste Disposal',r.h_waste||'—')}
    ${rptStat('Drainage',r.h_drain||'—')}
  </div>

  <h3>3.9 Cultural Practices</h3>
  <div class="data-grid">
    ${rptStat('Circumcision Practised',r.i_circ||'—')}
    ${rptStat('Where Conducted',r.i_circ_w||'—')}
    ${rptStat('Traditional Medicine',r.i_trad||'—')}
    ${rptStat('Burial Customs',r.i_bur||'—')}
  </div>

  <h3>3.10 Community Health Problems</h3>
  ${(()=>{
    const _dis=[['diarrhoeal_diseases','Diarrhoeal diseases'],['malaria','Malaria'],['organophosphate_poisoning','Organophosphate poisoning'],['upper_respiratory_tract_infections','Upper RTI'],['eye_infections','Eye infections'],['tuberculosis','Tuberculosis'],['common_cold','Common Cold'],['pneumonia','Pneumonia'],['skin_infections','Skin infections'],['stis','STIs'],['malnutrition','Malnutrition'],['jiggers','Jiggers'],['intestinal_worms','Intestinal worms']];
    const childDis=_dis.filter(([k])=>r['j_'+k+'_c']==='Yes').map(([,l])=>l);
    const adultDis=_dis.filter(([k])=>r['j_'+k+'_a']==='Yes').map(([,l])=>l);
    let html='';
    if(childDis.length) html+=`<p><strong>Affecting Children:</strong> ${childDis.join(', ')}</p>`;
    if(adultDis.length) html+=`<p><strong>Affecting Adults:</strong> ${adultDis.join(', ')}</p>`;
    if(r.j_other) html+=`<p><strong>Other:</strong> ${r.j_other}</p>`;
    return html||'<p>No specific community health problems recorded.</p>';
  })()}

  <h3>3.11 Pests &amp; Vectors</h3>
  ${(()=>{
    const _pests=['rats','cockroaches','bedbugs','houseflies','ticks','jiggers','mosquitoes','fleas','tsetse_flies','others'];
    const present=_pests.filter(p=>r['k_'+p]==='Present').map(p=>p.replace('_',' '));
    let html=present.length?`<p>Pests present: <strong>${present.join(', ')}</strong>.</p>`:'<p>No pests observed in this household.</p>';
    if(r.k_notes) html+=`<p><em>Observations: ${r.k_notes}</em></p>`;
    return html;
  })()}

  <h3>3.12 Red Flags &amp; Concerns</h3>
  ${flags.length?flags.map(f=>`<div class="flag-item flag-red"> ${f}</div>`).join(''):`<div class="flag-item flag-ok"> No critical red flags identified</div>`}
  ${concerns.length?concerns.map(c=>`<div class="flag-item flag-amber"> ${c}</div>`).join(''):''}

  ${(()=>{
    const _chs=[1,2,3,4,5,6,7,8,9,10].map(n=>r['l_challenge_'+n]).filter(Boolean);
    if(!_chs.length && !r.l_summary) return '';
    let html='<h2>4. Interviewer Challenges &amp; Field Observations</h2>';
    if(_chs.length){
      html+='<ol style="padding-left:20px;margin-bottom:12px;">';
      _chs.forEach(c=>{ html+=`<li style="font-size:0.84rem;line-height:1.75;color:#1a2b22;margin-bottom:4px;">${c}</li>`; });
      html+='</ol>';
    }
    if(r.l_summary) html+=`<div class="abstract-box" style="margin-top:8px;margin-bottom:4px"><p><strong>Overall Summary:</strong> ${r.l_summary}</p></div>`;
    return html;
  })()}

  ${metrics ? `
  <h2>4b. Deep Analytics — Processed by Data Processor</h2>
  <div style="background:#eef6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:16px 18px;margin-bottom:12px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      ${[
        ['Pit Latrine',mInfra.pct_pit_latrine],
        ['Water Treated',mInfra.pct_water_treated],
        ['Permanent House',mInfra.pct_permanent_house],
        ['Electricity',mInfra.pct_electricity],
        ['HIV Aware',mHealth.pct_hiv_aware],
        ['HIV Tested',mHealth.pct_hiv_tested],
        ['Food Sufficient',mNutr.pct_food_sufficient],
        ['Children Immunised',mMCH.pct_immunised],
        ['Mosquito Net',mEnv.pct_mosquito_net],
        ['Data Quality',mQual.overall_quality_score],
      ].filter(([,v])=>v!==undefined&&v!==null).map(([lbl,pct])=>{
        const col=pct>=80?'#1e5c38':pct>=60?'#b45309':'#c0392b';
        const bg=pct>=80?'#e8f5ed':pct>=60?'#fff8e1':'#fdecea';
        return `<div style="background:${bg};border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;"><span style="font-size:.73rem;color:#333">${lbl}</span><strong style="color:${col}">${pct}%</strong></div>`;
      }).join('')}
    </div>
    ${mRisk.length ? `<div style="background:#fff0f0;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:.78rem;"><strong style="color:#c0392b"> Risk Level: ${mRisk[0].level||'—'}</strong>${mRisk[0].factors?'<br><span style="color:#555">'+mRisk[0].factors.slice(0,4).join(' · ')+'</span>':''}</div>` : ''}
    ${mNutr.top_deficiencies && mNutr.top_deficiencies.length ? `<p style="font-size:.78rem;"><strong>Nutrition gaps:</strong> ${mNutr.top_deficiencies.slice(0,3).join(', ')}</p>` : ''}
    ${mHealth.top_illnesses && mHealth.top_illnesses.length ? `<p style="font-size:.78rem;"><strong>Top illnesses (processed):</strong> ${mHealth.top_illnesses.slice(0,3).map(x=>x.name+' ('+x.pct+'%)').join(', ')}</p>` : ''}
  </div>` : ''}

    <!-- DISCUSSION -->
  <h2>5. Discussion</h2>
  <p>${keyFinding}</p>
  <p>The household\u2019s overall health situation reflects patterns common to rural sub-Saharan Africa: ${r.b_type==='Temporary'?'substandard housing increases exposure to environmental hazards and vector-borne diseases; ':''}${r.h_treat==='No'?'lack of water treatment is a well-documented driver of diarrhoeal diseases, which remain a leading cause of mortality in children under five in Kenya; ':''}${r.g_latrine==='No'?'open defecation contributes to faecal-oral disease transmission cycles, particularly affecting children; ':''}${illnesses.includes('Malaria')?'malaria remains the leading cause of morbidity in Kisii County and requires targeted vector control; ':''}the data aligns with the Kenya Demographic Health Survey (KDHS) findings for rural Kisii County.</p>
  ${flags.length===0&&concerns.length===0?'<p>This household demonstrates positive health practices. The absence of red flags suggests that targeted health education efforts in this community may be yielding results. However, continued surveillance and routine household visits remain essential.</p>':''}
  ${r.i_circ==='Female'||r.i_circ==='Both'?'<p>Female Genital Mutilation (FGM) was reported. This is a human rights violation associated with serious health complications including haemorrhage, infection, obstetric fistula, and psychological trauma. The case must be handled with sensitivity and referred to the appropriate gender-based violence response team.</p>':''}

  <!-- RECOMMENDATIONS -->
  <h2>6. Recommendations</h2>
  ${mRec.length ? mRec.map(rec=>`
    <div style="background:${rec.priority==='CRITICAL'?'#fce4ec':rec.priority==='HIGH'?'#fff3e0':'#e8f5ed'};border-radius:9px;padding:10px 14px;margin-bottom:8px;">
      <div style="font-size:.72rem;font-weight:800;color:${rec.priority==='CRITICAL'?'#c0392b':rec.priority==='HIGH'?'#e65100':'#1e5c38'};margin-bottom:3px">${rec.priority} · ${rec.category||''}</div>
      <div style="font-size:.8rem;font-weight:600;color:#1a2b22;margin-bottom:2px">${rec.issue||''}</div>
      <div style="font-size:.76rem;color:#555">→ ${rec.action||''}</div>
    </div>`).join('') : `
  ${r.g_latrine==='No'?'<p><strong> Sanitation:</strong> This household must be prioritised for latrine construction assistance under the Community-Led Total Sanitation (CLTS) programme. Follow-up within 30 days is recommended.</p>':''}
  ${r.h_treat==='No'?'<p><strong> Water Safety:</strong> Provide household with WaterGuard chlorine solution and a safe storage container. Demonstrate proper water treatment and conduct a follow-up visit to verify uptake.</p>':''}
  ${r.f_heard==='No'?'<p><strong> HIV/AIDS Education:</strong> This respondent has never heard of HIV/AIDS. Referral to the nearest VCT centre and enrolment in a community health education programme is strongly recommended.</p>':''}
  ${r.f_tested!=='Yes'?'<p><strong> HIV Testing:</strong> Encourage and facilitate HIV testing at the nearest health facility. Testing is free and confidential.</p>':''}
  ${illnesses.includes('Malaria')?'<p><strong> Malaria:</strong> Promote consistent use of insecticide-treated bed nets (ITNs). Inspect home for stagnant water sources. Ensure household has access to malaria rapid diagnostic tests (RDTs) at the nearest health facility.</p>':''}
  ${r.e_enough==='No'||r.e_skip==='Yes'?'<p><strong> Nutrition:</strong> Household is experiencing food insecurity. Refer to the County Nutrition Programme and explore eligibility for the Hunger Safety Net Programme (HSNP).</p>':''}
  ${r.b_type==='Temporary'?'<p><strong> Housing:</strong> Temporary housing poses ongoing health risks. Link household with county low-cost housing programmes and provide information on locally available durable materials.</p>':''}
  `}
  <p><strong> Follow-Up:</strong> A revisit is recommended within <strong>${flags.length>0?'2 weeks':'6 months'}</strong> to assess progress on identified health issues and reinforce health education messages.</p>

</div>
${rptSig()}${rptPrintBtn()}</div></div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN BRIDGE FUNCTIONS
//  Called by index.html buttons — wire to the actual report entry points
// ─────────────────────────────────────────────────────────────────────────────
function admShowIndividualReports(){
  if(!_activeRecs()){
    showToast('No records loaded — tap Refresh first',true);
    return;
  }
  openAllInterviewerReports();
}

function admShowGroupReport(){
  if(!_activeRecs()){
    showToast('No records loaded — tap Refresh first',true);
    return;
  }
  openGroupReport();
}
