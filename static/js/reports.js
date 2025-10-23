// Reports page: Attendance and Alert Logs tables, export links, and Reset Logs modal
(function(){
  const App = window.App || (window.App = {});
  const elRepFrom = document.getElementById('rep-from');
  const elRepTo = document.getElementById('rep-to');
  const elRepEmp = document.getElementById('rep-emp');
  const elAttTable = document.getElementById('att-table');
  const elAlertsTable = document.getElementById('alerts-table');
  const btnLoadAtt = document.getElementById('btn-load-att');
  const btnLoadAlerts = document.getElementById('btn-load-alerts');
  // Top export buttons removed; bottom export links will be created dynamically
  let bottomExportAtt = null;
  let bottomExportAlerts = null;
  const btnResetLogs = document.getElementById('btn-reset-logs');

  if (!document.getElementById('report-page')) return; // not on Report page

  // Status banner for alert suppression / off-hours
  const reportPage = document.getElementById('report-page');
  let bannerEl = null;
  function ensureBanner(){
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement('div');
    bannerEl.id = 'report-suppress-banner';
    bannerEl.className = 'hidden mb-3';
    // Insert at top of page
    try{ reportPage.insertBefore(bannerEl, reportPage.firstChild); }catch(_){ }
    return bannerEl;
  }
  // Attendance Preview Modal behavior
  function openAttPreviewModal(row){
    const modal = document.getElementById('att-preview-modal');
    if (!modal) return;
    const title = modal.querySelector('#att-preview-title');
    const firstImg = modal.querySelector('#att-first-img');
    const firstPh = modal.querySelector('#att-first-ph');
    const lastImg = modal.querySelector('#att-last-img');
    const lastPh = modal.querySelector('#att-last-ph');
    const firstTime = modal.querySelector('#att-first-time');
    const lastTime = modal.querySelector('#att-last-time');
    const firstMeta = modal.querySelector('#att-first-meta');
    const lastMeta = modal.querySelector('#att-last-meta');
    // Reset view
    firstImg.classList.add('hidden'); firstImg.removeAttribute('src'); firstPh.classList.remove('hidden');
    lastImg.classList.add('hidden'); lastImg.removeAttribute('src'); lastPh.classList.remove('hidden');
    firstTime.textContent = row && row.first_in_ts ? `(${App.formatTimeOnly(row.first_in_ts)})` : '';
    lastTime.textContent = row && row.last_out_ts ? `(${App.formatTimeOnly(row.last_out_ts)})` : '';
    if (title){ title.textContent = `Attendance Preview — ${row.employee_code} ${row.employee_name} — ${row.date}`; }
    if (firstMeta) firstMeta.textContent = '';
    if (lastMeta) lastMeta.textContent = '';
    modal.classList.remove('hidden');
    // Close behavior
    const closeBtn = modal.querySelector('#att-preview-close');
    const onClose = ()=>{ modal.classList.add('hidden'); closeBtn && closeBtn.removeEventListener('click', onClose); };
    if (closeBtn){ closeBtn.addEventListener('click', onClose); }
    modal.addEventListener('click', (e)=>{ if (e.target === modal) onClose(); }, { once: true });
    // Fetch images
    (async ()=>{
      try{
        const url = `/api/report/attendance_captures?employee_id=${encodeURIComponent(row.employee_id)}&date=${encodeURIComponent(row.date)}`;
        const res = await fetch(url, { cache: 'no-store' });
        const j = await res.json();
        if (j && j.first_in_url){ firstImg.src = j.first_in_url; firstImg.classList.remove('hidden'); firstPh.classList.add('hidden'); }
        if (j && j.last_out_url){ lastImg.src = j.last_out_url; lastImg.classList.remove('hidden'); lastPh.classList.add('hidden'); }
        if (j && j.first_in_ts){ firstTime.textContent = `(${App.formatTimeOnly(j.first_in_ts)})`; }
        if (j && j.last_out_ts){ lastTime.textContent = `(${App.formatTimeOnly(j.last_out_ts)})`; }
        if (firstMeta && j && j.first_in_cam){
          const area = j.first_in_cam.area || '';
          const name = j.first_in_cam.name || (j.first_in_cam.id ? `CAM ${j.first_in_cam.id}` : '');
          firstMeta.textContent = [area, name].filter(Boolean).join(' - ');
        }
        if (lastMeta && j && j.last_out_cam){
          const area = j.last_out_cam.area || '';
          const name = j.last_out_cam.name || (j.last_out_cam.id ? `CAM ${j.last_out_cam.id}` : '');
          lastMeta.textContent = [area, name].filter(Boolean).join(' - ');
        }
      }catch(_e){ /* ignore */ }
    })();
  }
  function setBanner(kind, msg){
    const el = ensureBanner();
    if (!kind){ el.className = 'hidden mb-3'; el.innerHTML=''; return; }
    const baseClass = 'mb-3 rounded border px-3 py-2 text-sm';
    if (kind === 'pause'){
      el.className = baseClass + ' bg-yellow-50 border-yellow-200 text-yellow-800';
    } else if (kind === 'offhours'){
      el.className = baseClass + ' bg-gray-100 border-gray-200 text-gray-700';
    } else {
      el.className = baseClass + ' bg-blue-50 border-blue-200 text-blue-800';
    }
    el.innerHTML = msg || '';
  }
  async function refreshScheduleBanner(){
    try{
      const res = await fetch('/api/schedule/state');
      const st = await res.json();
      const trackingActive = !!(st && st.tracking_active);
      const suppressed = !!(st && st.suppress_alerts);
      if (suppressed){
        setBanner('pause', 'Alerts are temporarily paused (Lunch/Pause). New alerts will not be logged until resumed.');
      } else if (!trackingActive){
        setBanner('offhours', 'Off-hours: Alerts are paused until work hours resume.');
      } else {
        setBanner(null, '');
      }
    }catch(_e){ /* keep previous state */ }
  }
  refreshScheduleBanner(); setInterval(refreshScheduleBanner, 20000);

  // Build query from filters
  function buildQuery(base){
    const params = new URLSearchParams();
    if (elRepFrom && elRepFrom.value) params.set('from', elRepFrom.value);
    if (elRepTo && elRepTo.value) params.set('to', elRepTo.value);
    if (elRepEmp && elRepEmp.value) params.set('employee_id', elRepEmp.value);
    const q = params.toString();
    return base + (q ? ('?' + q) : '');
  }
  function updateExportLinks(){
    const baseA = buildQuery('/api/report/attendance');
    const hrefA = baseA + (baseA.includes('?') ? '&' : '?') + 'format=csv';
    if (bottomExportAtt) bottomExportAtt.href = hrefA;
    const baseB = buildQuery('/api/report/alerts');
    const hrefB = baseB + (baseB.includes('?') ? '&' : '?') + 'format=csv';
    if (bottomExportAlerts) bottomExportAlerts.href = hrefB;
  }

  async function loadEmployeesForReport(){
    if (!elRepEmp) return;
    try{
      const res = await fetch('/api/employees');
      const data = await res.json();
      elRepEmp.innerHTML = '<option value="">All Employees</option>';
      (Array.isArray(data) ? data : []).forEach(e => {
        const opt = document.createElement('option');
        opt.value = String(e.id);
        opt.textContent = `${e.employee_code || 'EMP'} - ${e.name || ''}`;
        elRepEmp.appendChild(opt);
      });
    }catch(e){ console.warn('loadEmployeesForReport error', e); }
  }

  let _attRows = []; let _attSort = { key: 'date', dir: 'desc' }; let _attPage = 0;
  let _alertRows = []; let _alertSort = { key: 'timestamp', dir: 'desc' }; let _alertPage = 0;
  const ATT_PAGE_SIZE = 20; // per request
  const ALERT_PAGE_SIZE = 50; // per request

  async function ensureAttendanceLoaded(){ if (_attRows && _attRows.length) return; await loadAttendance(); }
  async function ensureAlertsLoaded(){ if (_alertRows && _alertRows.length) return; await loadAlerts(); }

  function renderAttendance(){
    if (!elAttTable) return;
    const rows = App.sortRows(_attRows, _attSort.key, _attSort.dir);
    App.updateSortIndicators(elAttTable.closest('table'), _attSort);
    if (!Array.isArray(rows) || rows.length === 0){ elAttTable.innerHTML = '<tr><td colspan="5" class="px-3 py-2 text-sm text-gray-500">No data</td></tr>'; const afterNone = App.getOrCreateAfter(elAttTable, 'att-controls'); if (afterNone) afterNone.innerHTML = ''; return; }
    elAttTable.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(rows.length / ATT_PAGE_SIZE));
    if (_attPage >= totalPages) _attPage = totalPages - 1;
    const start = _attPage * ATT_PAGE_SIZE;
    const end = Math.min(rows.length, start + ATT_PAGE_SIZE);
    for (let i=start; i<end; i++){
      const r = rows[i];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-3 py-2">${App.safe(r.employee_code)}</td>
        <td class="px-3 py-2">${App.safe(r.employee_name)}</td>
        <td class="px-3 py-2">${App.safe(r.date)}</td>
        <td class="px-3 py-2">${App.formatTimeOnly(r.first_in_ts)}</td>
        <td class="px-3 py-2">${App.formatTimeOnly(r.last_out_ts)}</td>
        <td class="px-3 py-2">${App.safe(r.status)}</td>
        <td class="px-3 py-2">${App.safe(r.violation_count)}</td>
        <td class="px-3 py-2">
          <button class="px-2 py-1 border rounded hover:bg-gray-50" data-action="preview" title="Preview First In / Last Out" aria-label="Preview">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </td>`;
      elAttTable.appendChild(tr);
      const btn = tr.querySelector('button[data-action="preview"]');
      if (btn){
        btn.addEventListener('click', ()=> openAttPreviewModal(r));
      }
    }
    const after = App.getOrCreateAfter(elAttTable, 'att-controls');
    if (after){
      after.innerHTML = '';
      const ctrls = document.createElement('div');
      ctrls.className = 'mt-2 flex items-center gap-3 justify-between';
      // Left: pagination
      const left = document.createElement('div'); left.className = 'flex items-center gap-2';
      const prev = document.createElement('button'); prev.className = 'px-2 py-1 text-sm border rounded'; prev.textContent = 'Prev'; prev.disabled = (_attPage <= 0);
      const next = document.createElement('button'); next.className = 'px-2 py-1 text-sm border rounded'; next.textContent = 'Next'; next.disabled = (_attPage >= totalPages-1);
      const info = document.createElement('span'); info.className = 'text-xs text-gray-500'; info.textContent = `Page ${_attPage+1} / ${totalPages} (${rows.length} rows)`;
      prev.addEventListener('click', ()=>{ if (_attPage>0){ _attPage--; renderAttendance(); } });
      next.addEventListener('click', ()=>{ if (_attPage<totalPages-1){ _attPage++; renderAttendance(); } });
      left.append(prev, next, info);
      // Right: export
      const right = document.createElement('div');
      bottomExportAtt = document.createElement('a'); bottomExportAtt.id = 'btn-export-att-bottom'; bottomExportAtt.className = 'px-3 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded'; bottomExportAtt.textContent = 'Export CSV'; bottomExportAtt.href = '#';
      right.appendChild(bottomExportAtt);
      ctrls.append(left, right);
      after.appendChild(ctrls);
      updateExportLinks();
    }
  }
  async function loadAttendance(){
    if (!elAttTable) return;
    try{ const url = buildQuery('/api/report/attendance'); updateExportLinks(); const res = await fetch(url); _attRows = await res.json(); if (!Array.isArray(_attRows)) _attRows = []; if (_attPage === 0) {/* keep */} else { _attPage = 0; } renderAttendance(); }
    catch(e){ console.warn('loadAttendance error', e); elAttTable.innerHTML = '<tr><td colspan="7" class="px-3 py-2 text-sm text-red-600">Failed to load</td></tr>'; }
  }

  function renderAlerts(){
    if (!elAlertsTable) return;
    const rows = App.sortRows(_alertRows, _alertSort.key, _alertSort.dir);
    App.updateSortIndicators(elAlertsTable.closest('table'), _alertSort);
    if (!Array.isArray(rows) || rows.length === 0){ elAlertsTable.innerHTML = '<tr><td colspan="5" class="px-3 py-2 text-sm text-gray-500">No data</td></tr>'; const afterNone = App.getOrCreateAfter(elAlertsTable, 'alerts-control'); if (afterNone) afterNone.innerHTML = ''; return; }
    elAlertsTable.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(rows.length / ALERT_PAGE_SIZE));
    if (_alertPage >= totalPages) _alertPage = totalPages - 1;
    const start = _alertPage * ALERT_PAGE_SIZE;
    const end = Math.min(rows.length, start + ALERT_PAGE_SIZE);
    for (let i=start; i<end; i++){
      const r = rows[i];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-3 py-2">${App.formatTs(r.timestamp)}</td>
        <td class="px-3 py-2">${App.safe(r.employee_code)}</td>
        <td class="px-3 py-2">${App.safe(r.employee_name)}</td>
        <td class="px-3 py-2">${App.safe(App.mapAlertType(r.alert_type))}</td>
        <td class="px-3 py-2">${App.safe(r.message)}</td>`;
      elAlertsTable.appendChild(tr);
    }
    const after = App.getOrCreateAfter(elAlertsTable, 'alerts-control');
    if (after){
      after.innerHTML = '';
      const ctrls = document.createElement('div');
      ctrls.className = 'mt-2 flex items-center gap-3 justify-between';
      // Left: pagination
      const left = document.createElement('div'); left.className = 'flex items-center gap-2';
      const prev = document.createElement('button'); prev.className = 'px-2 py-1 text-sm border rounded'; prev.textContent = 'Prev'; prev.disabled = (_alertPage <= 0);
      const next = document.createElement('button'); next.className = 'px-2 py-1 text-sm border rounded'; next.textContent = 'Next'; next.disabled = (_alertPage >= totalPages-1);
      const info = document.createElement('span'); info.className = 'text-xs text-gray-500'; info.textContent = `Page ${_alertPage+1} / ${totalPages} (${rows.length} rows)`;
      prev.addEventListener('click', ()=>{ if (_alertPage>0){ _alertPage--; renderAlerts(); } });
      next.addEventListener('click', ()=>{ if (_alertPage<totalPages-1){ _alertPage++; renderAlerts(); } });
      left.append(prev, next, info);
      // Right: export
      const right = document.createElement('div');
      bottomExportAlerts = document.createElement('a'); bottomExportAlerts.id = 'btn-export-alerts-bottom'; bottomExportAlerts.className = 'px-3 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded'; bottomExportAlerts.textContent = 'Export CSV'; bottomExportAlerts.href = '#';
      right.appendChild(bottomExportAlerts);
      ctrls.append(left, right);
      after.appendChild(ctrls);
      updateExportLinks();
    }
  }
  async function loadAlerts(){
    if (!elAlertsTable) return;
    try{ const url = buildQuery('/api/report/alerts'); updateExportLinks(); const res = await fetch(url); _alertRows = await res.json(); if (!Array.isArray(_alertRows)) _alertRows = []; if (_alertPage === 0) {/* keep */} else { _alertPage = 0; } renderAlerts(); }
    catch(e){ console.warn('loadAlerts error', e); elAlertsTable.innerHTML = '<tr><td colspan="5" class="px-3 py-2 text-sm text-red-600">Failed to load</td></tr>'; }
  }

  // Near real-time: respond to alert events emitted by CCTV module
  const onAlertEventReload = App.debounce(()=>{ try{ updateExportLinks(); loadAlerts(); }catch(_e){} }, 300);
  document.addEventListener('app:alert-log', onAlertEventReload);

  function attachSorting(){
    const attTableEl = elAttTable ? elAttTable.closest('table') : null;
    if (attTableEl){ attTableEl.querySelectorAll('thead th[data-sort-key]')?.forEach(th => { th.style.cursor = 'pointer'; th.addEventListener('click', async () => { const key = th.getAttribute('data-sort-key'); if (!key) return; if (!_attRows || !_attRows.length){ await ensureAttendanceLoaded(); } if (_attSort.key === key){ _attSort.dir = (_attSort.dir === 'asc') ? 'desc' : 'asc'; } else { _attSort.key = key; _attSort.dir = (key === 'date' || key === 'first_in_ts' || key === 'last_out_ts' || key === 'violation_count') ? 'desc' : 'asc'; } _attPage = 0; renderAttendance(); }); }); }
    const alertsTableEl = elAlertsTable ? elAlertsTable.closest('table') : null;
    if (alertsTableEl){ alertsTableEl.querySelectorAll('thead th[data-sort-key]')?.forEach(th => { th.style.cursor = 'pointer'; th.addEventListener('click', async () => { const key = th.getAttribute('data-sort-key'); if (!key) return; if (!_alertRows || !_alertRows.length){ await ensureAlertsLoaded(); } if (_alertSort.key === key){ _alertSort.dir = (_alertSort.dir === 'asc') ? 'desc' : 'asc'; } else { _alertSort.key = key; _alertSort.dir = (key === 'timestamp') ? 'desc' : 'asc'; } _alertPage = 0; renderAlerts(); }); }); }
  }

  // Reset Logs modal (admin)
  let resetModal = null;
  function ensureResetModal(){
    if (resetModal) return resetModal;
    resetModal = document.createElement('div');
    resetModal.id = 'reset-logs-modal';
    resetModal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 hidden';
    resetModal.innerHTML = `
      <div class="bg-white rounded w-[520px] max-w-[95vw]">
        <div class="px-3 py-2 border-b text-sm font-medium">Reset Logs</div>
        <div class="p-3 space-y-3">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Table</label>
            <select id="reset-table" class="w-full border rounded px-2 py-1">
              <option value="both" selected>Events + Alert Logs</option>
              <option value="events">Events only</option>
              <option value="alert_logs">Alert Logs only</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-600 mb-1">From Date (optional)</label>
              <input id="reset-from" type="date" class="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label class="block text-xs text-gray-600 mb-1">To Date (optional)</label>
              <input id="reset-to" type="date" class="w-full border rounded px-2 py-1" />
            </div>
          </div>
          <div class="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded p-2">
            This action will permanently delete data. Leave the date blank to delete ALL data in the selected table.
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2 p-3">
          <button id="reset-cancel" class="px-3 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded">Cancel</button>
          <button id="reset-confirm" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded">Confirm Reset</button>
        </div>
      </div>`;
    document.body.appendChild(resetModal);
    resetModal.addEventListener('click', (e)=>{ if (e.target === resetModal){ resetModal.classList.add('hidden'); } });
    resetModal.querySelector('#reset-cancel').addEventListener('click', ()=> resetModal.classList.add('hidden'));
    resetModal.querySelector('#reset-confirm').addEventListener('click', async ()=>{
      const table = resetModal.querySelector('#reset-table').value;
      const from_date = resetModal.querySelector('#reset-from').value || null;
      const to_date = resetModal.querySelector('#reset-to').value || null;
      const ok = await (window.App && App.confirmDialog ? App.confirmDialog({
        title: 'Confirm Reset',
        message: 'Are you sure you want to delete data according to the selection? This action cannot be undone.',
        confirmText: 'Reset',
        cancelText: 'Cancel'
      }) : Promise.resolve(confirm('Are you sure you want to delete data according to the selection?')));
      if (!ok) return;
      try{
        const res = await fetch('/api/admin/reset_logs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ table, from_date, to_date }) });
        const out = await res.json();
        if (!res.ok || !out.ok){ alert('Reset gagal: ' + (out.error || res.status)); }
        else { alert(`Reset berhasil. Events terhapus: ${out.deleted_events || 0}, Alert Logs terhapus: ${out.deleted_alert_logs || 0}`); }
      }catch(err){ alert('Error melakukan reset: ' + err); } finally { resetModal.classList.add('hidden'); }
    });
    return resetModal;
  }
  if (btnResetLogs){ btnResetLogs.addEventListener('click', ()=>{ const m = ensureResetModal(); m.classList.remove('hidden'); }); }

  // Defaults: set From/To to today on first load if empty
  function setDefaultDatesToToday(){
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    const iso = `${yyyy}-${mm}-${dd}`;
    if (elRepFrom && !elRepFrom.value) elRepFrom.value = iso;
    if (elRepTo && !elRepTo.value) elRepTo.value = iso;
  }

  // Real-time: auto-refresh when filters change and on interval
  const debouncedReload = App.debounce(()=>{ _attPage = 0; _alertPage = 0; updateExportLinks(); loadAttendance(); loadAlerts(); }, 250);
  if (elRepFrom) elRepFrom.addEventListener('change', debouncedReload);
  if (elRepTo) elRepTo.addEventListener('change', debouncedReload);
  if (elRepEmp) elRepEmp.addEventListener('change', debouncedReload);

  loadEmployeesForReport();
  setDefaultDatesToToday();
  attachSorting();
  // Initial load
  updateExportLinks();
  loadAttendance();
  loadAlerts();
  // Periodic refresh (real-time)
  setInterval(()=>{ updateExportLinks(); loadAttendance(); loadAlerts(); }, 5000);
})();
