/* 
   PREMIUM UPGRADES v4.2 — Medisync UX Enhancement Layer
   Brian Atandi · GLUK
   Features: Dark mode · Smart forms · Better toasts · Resume survey
             Button loading · Trust layer · Page transitions
    */

(function(){
'use strict';

/*  1. DARK MODE  */
const DM_KEY = 'chsa_dark_mode';

function initDarkMode(){
  // Default is dark. Light = '0' in localStorage
  const saved = localStorage.getItem(DM_KEY);
  if(saved === '0'){
    document.documentElement.setAttribute('data-theme','light');
  } else {
    document.documentElement.setAttribute('data-theme','dark');
  }
  _syncAllThemeBtns();
}

function isDark(){ return document.documentElement.getAttribute('data-theme') !== 'light'; }

function toggleDark(){
  const goLight = isDark(); // if currently dark, go light
  document.documentElement.setAttribute('data-theme', goLight ? 'light' : 'dark');
  localStorage.setItem(DM_KEY, goLight ? '0' : '1');
  _syncAllThemeBtns();
  showToastUpgrade(goLight ? 'Light mode on' : 'Dark mode on', 'info');
}

function _syncAllThemeBtns(){
  const dark = isDark();
  const icon = dark ? 'Dark' : 'Light';
  ['dm-emoji','sa-theme-btn','inst-theme-btn'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.textContent = icon;
  });
}

// Expose for admin panels
window._mssToggleTheme = function(){
  toggleDark();
};

/*  2. ENHANCED TOAST  */
let _toastTimer = null;

function showToastUpgrade(msg, type='ok', duration=2800){
  let t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  const icons = { ok:'OK', err:'Error', info:'Info', warn:'Warning' };
  t.innerHTML = `<span class="toast-icon">${icons[type]||''}</span>${msg}`;
  t.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>{ t.className = 'toast'; }, duration);
}

// Override the global showToast to use the enhanced version
window._origShowToast = window.showToast;
window.showToast = function(m, err=false){
  showToastUpgrade(m, err ? 'err' : 'ok');
};

/*  3. BUTTON LOADING STATE  */
function setButtonLoading(btn, loading, originalText){
  if(!btn) return;
  if(loading){
    btn.dataset.origText = btn.textContent;
    btn.textContent = originalText || 'Please wait…';
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.origText || btn.textContent;
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}
window.setButtonLoading = setButtonLoading;

/*  4. MEDICAL TRUST LAYER  */
function injectTrustBadges(){
  // Add trust row before finish button area
  const finishBtns = document.querySelectorAll('.btn-finish');
  finishBtns.forEach(btn => {
    if(btn.dataset.trustAdded) return;
    btn.dataset.trustAdded = '1';
    const row = document.createElement('div');
    row.className = 'submit-trust-row';
    row.innerHTML = `
      <span class="trust-lock"><span>End-to-end encrypted</span></span>
      <span class="trust-badge">Offline-ready</span>
    `;
    btn.parentNode.insertBefore(row, btn.nextSibling);
  });
}

/*  5. SMART FORM — auto-advance on radio  */
function initSmartForms(){
  // Auto-advance: when a radio chip is selected, briefly highlight then move on
  document.addEventListener('change', function(e){
    const input = e.target;
    if(input.type !== 'radio') return;
    const card = input.closest('.q-card');
    if(!card) return;
    // Visual pulse on selected chip
    const label = input.nextElementSibling;
    if(label){
      label.style.transition = 'transform .15s ease';
      label.style.transform = 'scale(1.04)';
      setTimeout(()=>{ label.style.transform = ''; }, 150);
    }
    // Auto-save progress on every radio change
    autoSaveProgress();
  });

  // Auto-save on text input after pause
  let _saveTimer;
  document.addEventListener('input', function(e){
    if(e.target.matches('.form-input,.form-textarea,.form-select')){
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(autoSaveProgress, 1200);
    }
  });
}

/*  6. SMART FORM — conditional question skip  */
function initConditionalLogic(){
  // Any q-group with data-show-if="fieldId:value" will show/hide
  document.addEventListener('change', evalConditionals);
  document.addEventListener('input',  evalConditionals);
}

function evalConditionals(){
  document.querySelectorAll('.q-group[data-show-if]').forEach(group => {
    const [fieldId, expectedVal] = group.dataset.showIf.split(':');
    const field = document.getElementById(fieldId) ||
                  document.querySelector(`[name="${fieldId}"]:checked`);
    if(!field) return;
    const val = field.value || '';
    const shouldShow = val.toLowerCase().includes(expectedVal.toLowerCase());
    group.classList.toggle('hidden', !shouldShow);
  });
}

/*  7. AUTO-SAVE & RESUME SURVEY  */
const DRAFT_KEY = 'chsa_survey_draft';

function autoSaveProgress(){
  try{
    const data = {};
    document.querySelectorAll('[id]').forEach(el => {
      if(el.tagName === 'INPUT'){
        if(el.type === 'checkbox' || el.type === 'radio'){
          if(el.checked) data[el.id || el.name] = el.value;
        } else {
          if(el.value) data[el.id] = el.value;
        }
      } else if(el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'){
        if(el.value) data[el.id] = el.value;
      }
    });
    // Get current step
    const active = document.querySelector('.sec-card.active');
    if(active) data.__step = active.id;
    data.__ts = Date.now();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  }catch(e){}
}

function checkResumeBanner(){
  try{
    // Never show resume banner when admin/login screens are active
    const adminOpen = document.getElementById('admin-overlay')?.style.display !== 'none' ||
                      document.getElementById('admin-gate')?.style.display !== 'none' ||
                      document.getElementById('welcome-screen')?.style.display !== 'none';
    if(adminOpen) return;

    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return;
    const draft = JSON.parse(raw);
    const age = Date.now() - (draft.__ts || 0);
    if(age < 1000 || age > 86400000 * 3) return; // ignore <1s or >3 days old
    const minAgo = Math.round(age / 60000);
    const timeStr = minAgo < 60 ? `${minAgo}m ago` : `${Math.round(minAgo/60)}h ago`;

    const banner = document.getElementById('resume-banner');
    if(!banner) return;
    banner.querySelector('.resume-sub').textContent = `Saved ${timeStr} · Tap to continue`;
    banner.classList.add('show');

    document.getElementById('resume-yes').addEventListener('click', ()=>{
      restoreDraft(draft);
      banner.classList.remove('show');
      showToastUpgrade(' Survey restored — continue where you left off', 'ok', 3500);
    });
    document.getElementById('resume-no').addEventListener('click', ()=>{
      localStorage.removeItem(DRAFT_KEY);
      banner.classList.remove('show');
    });
  }catch(e){}
}

function restoreDraft(draft){
  try{
    Object.keys(draft).forEach(k => {
      if(k.startsWith('__')) return;
      const el = document.getElementById(k);
      if(!el) return;
      if(el.type === 'checkbox' || el.type === 'radio'){
        if(el.value === draft[k]) el.checked = true;
      } else {
        el.value = draft[k];
      }
    });
    // Navigate to saved step
    if(draft.__step && typeof goToSection === 'function'){
      goToSection(draft.__step);
    }
  }catch(e){}
}

/*  8. SPLASH → HOME TRANSITION  */
function smoothHideWelcome(){
  const ws = document.getElementById('welcome-screen');
  if(!ws) return;
  ws.classList.add('fade-out');
  setTimeout(()=>{ ws.style.display = 'none'; ws.classList.remove('fade-out'); }, 520);
}
window._smoothHideWelcome = smoothHideWelcome;

/*  9. PAGE TRANSITION HELPER  */
function animatePageTransition(fromCard, toCard, direction='forward'){
  if(!fromCard || !toCard) return;
  const enterClass = direction === 'forward' ? 'page-enter-right' : 'page-enter-left';

  fromCard.classList.add(direction === 'forward' ? 'page-exit-left' : 'page-exit-right');
  fromCard.addEventListener('animationend', ()=>{
    fromCard.classList.remove('active','page-exit-left','page-exit-right');
  }, {once:true});

  toCard.classList.add('active', enterClass);
  toCard.addEventListener('animationend', ()=>{
    toCard.classList.remove(enterClass);
  }, {once:true});
}
window.animatePageTransition = animatePageTransition;

/*  10. TOPBAR CONSISTENT SCROLL BEHAVIOUR  */
function initStickyHeader(){
  let lastScroll = 0;
  const topbar = document.querySelector('.topbar');
  if(!topbar) return;
  const scroller = document.getElementById('secsWrap') || document.documentElement;
  scroller.addEventListener('scroll', ()=>{
    const now = scroller.scrollTop || window.scrollY;
    if(now < 40){ topbar.style.transform = ''; return; }
    if(now > lastScroll + 4){
      topbar.style.transform = 'translateY(-100%)';
      topbar.style.transition = 'transform .3s ease';
    } else if(now < lastScroll - 4){
      topbar.style.transform = 'translateY(0)';
    }
    lastScroll = now;
  }, {passive:true});
}

/*  INIT  */
// Apply theme immediately before DOMContentLoaded to avoid flash
(function(){
  const saved = localStorage.getItem('chsa_dark_mode');
  document.documentElement.setAttribute('data-theme', saved === '0' ? 'light' : 'dark');
})();

document.addEventListener('DOMContentLoaded', ()=>{
  initDarkMode();
  initSmartForms();
  initConditionalLogic();

  // Inject resume banner into DOM if not present
  if(!document.getElementById('resume-banner')){
    const banner = document.createElement('div');
    banner.id = 'resume-banner';
    banner.innerHTML = `
      <div class="resume-row">
        <div class="resume-icon"></div>
        <div class="resume-text">
          <div class="resume-title">Resume your survey?</div>
          <div class="resume-sub">Saved recently · Tap to continue</div>
        </div>
      </div>
      <div class="resume-actions">
        <button class="resume-btn-yes" id="resume-yes"> Resume</button>
        <button class="resume-btn-no"  id="resume-no"> Start fresh</button>
      </div>
    `;
    // Insert inside survey-wrap so it never overlaps admin/login screens
    const surveyWrap = document.getElementById('survey-wrap') || document.body;
    surveyWrap.insertBefore(banner, surveyWrap.firstChild);
  }

  injectTrustBadges();
  initStickyHeader();

  // Check resume after short delay (auth might still be resolving)
  setTimeout(checkResumeBanner, 3000);
});

// Re-check trust badges after sections render
window.addEventListener('hashchange', ()=> setTimeout(injectTrustBadges, 500));

// Expose for external use
window.PremiumUX = {
  showToast: showToastUpgrade,
  setButtonLoading,
  autoSaveProgress,
  smoothHideWelcome,
  toggleDark,
};

})();
