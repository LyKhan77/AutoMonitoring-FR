// Common helpers and page bootstrap
(function(){
  window.App = window.App || {};
  const App = window.App;

  // Helpers
  function safe(val){ return val == null ? '' : String(val); }
  function formatTs(val){
    if (!val) return '';
    let d;
    if (typeof val === 'number') d = new Date(val); else { const tryNum = Number(val); d = isNaN(tryNum) ? new Date(String(val)) : new Date(tryNum); }
    if (isNaN(d.getTime())) return safe(val);
    const pad = n => String(n).padStart(2,'0');
    const yyyy = d.getFullYear(); const mm = pad(d.getMonth()+1); const dd = pad(d.getDate());
    const hh = pad(d.getHours()); const mi = pad(d.getMinutes()); const ss = pad(d.getSeconds());
    return `${yyyy}-${mm}-${dd} | ${hh}:${mi}:${ss}`;
  }
  function formatTimeOnly(val){
    if (!val) return '';
    let d;
    if (typeof val === 'number') d = new Date(val); else { const tryNum = Number(val); d = isNaN(tryNum) ? new Date(String(val)) : new Date(tryNum); }
    if (isNaN(d.getTime())) return safe(val);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function parseForSort(val, key){
    if (val == null) return null;
    if (key === 'date' || key === 'first_in_ts' || key === 'last_out_ts' || key === 'timestamp'){
      const d = new Date(String(val));
      return isNaN(d.getTime()) ? String(val) : d.getTime();
    }
    if (key === 'violation_count'){
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    }
    return String(val).toLowerCase();
  }
  function sortRows(rows, key, dir){
    const sign = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = parseForSort(a[key], key);
      const vb = parseForSort(b[key], key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls last
      if (vb == null) return -1;
      if (va < vb) return -sign;
      if (va > vb) return sign;
      return 0;
    });
  }
  function mapAlertType(t){ if (!t) return ''; const u = String(t).toUpperCase(); if (u === 'RESOLVED') return 'ENTER'; if (u === 'BACK_TO_AREA') return 'EXIT'; return t; }
  function updateSortIndicators(tableEl, current){
    if (!tableEl) return;
    const ths = tableEl.querySelectorAll('thead th[data-sort-key]');
    ths.forEach(th => {
      const key = th.getAttribute('data-sort-key');
      if (!th.dataset.label){ th.dataset.label = th.textContent.trim(); }
      const label = th.dataset.label;
      if (current && key === current.key){ const arrow = current.dir === 'asc' ? '▲' : '▼'; th.innerHTML = `${label} <span class="text-xs text-gray-400">${arrow}</span>`; }
      else { th.innerHTML = label; }
    });
  }
  App.safe = safe; App.formatTs = formatTs; App.formatTimeOnly = formatTimeOnly; App.parseForSort = parseForSort; App.sortRows = sortRows; App.mapAlertType = mapAlertType; App.updateSortIndicators = updateSortIndicators;

  // Debounce helper
  function debounce(fn, wait){
    let t = null; return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this, args), wait); };
  }
  App.debounce = debounce;

  // Create or get a container after a table for controls (e.g., Load more)
  App.getOrCreateAfter = function(refEl, id){
    if (!refEl || !refEl.parentElement) return null;
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div'); el.id = id; el.className = 'mt-2';
    // Insert after closest table container
    const parent = refEl.closest('.overflow-x-auto') || refEl.parentElement;
    parent.parentElement.insertBefore(el, parent.nextSibling);
    return el;
  }

  // Clock
  const timeEl = document.getElementById('current-time');
  const dateEl = document.getElementById('current-date');
  function pad(n){ return n.toString().padStart(2,'0'); }
  function updateClock(){
    if (!timeEl && !dateEl) return;
    const now = new Date();
    const hh = pad(now.getHours()); const mm = pad(now.getMinutes()); const ss = pad(now.getSeconds());
    if (timeEl) timeEl.textContent = `${hh}:${mm}:${ss}`;
    if (dateEl) dateEl.textContent = now.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  }
  updateClock(); setInterval(updateClock, 1000);

  // Page navigation helpers
  function showPage(id){ document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden')); const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
  App.showPage = showPage;
  // Sidebar links
  document.querySelectorAll('aside [data-page]').forEach(a=>{
    a.addEventListener('click', (e)=>{ e.preventDefault(); const page = a.getAttribute('data-page'); if (page === 'cctv') showPage('cctv-page'); else if (page === 'report') showPage('report-page'); });
  });

  // Reusable confirmation dialog
  // Usage: App.confirmDialog({
  //   title: 'Delete Employee',
  //   message: 'This action cannot be undone.',
  //   confirmText: 'Delete', cancelText: 'Cancel',
  //   requireText: 'Type code to confirm', expectedText: 'EMP001' // optional
  // }).then(ok => { if (ok) ... })
  App.confirmDialog = function(opts){
    return new Promise((resolve)=>{
      try{
        const o = opts || {};
        const wrap = document.createElement('div');
        wrap.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[1100]';
        const box = document.createElement('div');
        box.className = 'bg-white rounded-lg w-[520px] max-w-[95vw] shadow-xl';
        box.innerHTML = `
          <div class="px-4 py-3 border-b">
            <div class="text-base font-semibold text-gray-800">${App.safe(o.title)||'Confirm'}</div>
          </div>
          <div class="p-4 space-y-3">
            <div class="text-sm text-gray-700">${App.safe(o.message)||''}</div>
            ${o.expectedText ? `<div>
              <label class="block text-xs text-gray-600 mb-1">${App.safe(o.requireText)||'Type to confirm'}</label>
              <input id="cd-input" type="text" class="w-full border rounded px-2 py-1 text-sm" placeholder="${App.safe(o.expectedText)}" />
              <div id="cd-help" class="text-[11px] text-gray-500 mt-1">Must match: ${App.safe(o.expectedText)}</div>
            </div>` : ''}
          </div>
          <div class="px-4 py-3 border-t flex justify-end gap-2">
            <button id="cd-cancel" class="px-3 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded">${App.safe(o.cancelText)||'Cancel'}</button>
            <button id="cd-ok" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded">${App.safe(o.confirmText)||'Confirm'}</button>
          </div>`;
        wrap.appendChild(box); document.body.appendChild(wrap);
        const input = box.querySelector('#cd-input');
        const btnOk = box.querySelector('#cd-ok');
        const btnCancel = box.querySelector('#cd-cancel');
        function close(v){ try{ document.body.removeChild(wrap); }catch(_){} resolve(!!v); }
        wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(false); });
        btnCancel.addEventListener('click', ()=> close(false));
        btnOk.addEventListener('click', ()=>{
          if (o.expectedText){ const val = (input && input.value || '').trim(); if (val !== String(o.expectedText).trim()){ input && input.focus(); return; } }
          close(true);
        });
        setTimeout(()=>{ if (input) input.focus(); }, 50);
        document.addEventListener('keydown', function onKey(e){ if (!document.body.contains(wrap)){ document.removeEventListener('keydown', onKey); return; } if (e.key==='Escape'){ close(false); } });
      }catch(_){ resolve(false); }
    });
  };
})();
