// CCTV page: live stream, AI status, camera buttons, tracking cards polling
(function(){
  const App = window.App || (window.App = {});
  const cameraButtonsEl = document.getElementById('camera-buttons');
  const videoImg = document.getElementById('video-stream');
  const placeholder = document.getElementById('video-placeholder');
  const aiDot = document.getElementById('ai-status-indicator');
  const aiText = document.getElementById('ai-status-text');
  const elEmpList = document.getElementById('employee-list');
  const elActiveCount = document.getElementById('active-count');
  const elPresent = document.getElementById('present-count');
  const elAlerts = document.getElementById('alert-count');
  const elTotal = document.getElementById('total-count');
  const areaFilter = document.getElementById('area-filter');
  // Frame capture elements
  const btnCapture = document.getElementById('btn-capture');
  const capNote = document.getElementById('cap-note');
  const capMsg = document.getElementById('capture-msg');
  const capList = document.getElementById('capture-list');
  const capView = document.getElementById('cap-view');
  const capViewPh = document.getElementById('cap-view-ph');
  const capCamSelect = document.getElementById('cap-cam-select');
  const capDelDate = document.getElementById('cap-del-date');
  const btnCapDel = document.getElementById('btn-cap-del');
  const capDelMsg = document.getElementById('cap-del-msg');
  // Adjustment bar controls
  const btnAdjToggleFeed = document.getElementById('btn-adj-toggle-feed');
  const btnAdjExpandEmp = document.getElementById('btn-adj-expand-emp');
  const btnAdjMinEmp = document.getElementById('btn-adj-min-emp');
  const btnAdjToggleCap = document.getElementById('btn-adj-toggle-cap');
  const feedSection = document.getElementById('cctv-feed');
  const trackSection = document.getElementById('employee-tracking');
  const captureSection = document.getElementById('frame-capture');
  // System info elements
  const sysLatency = document.getElementById('sys-latency');
  const sysWifiIcon = document.getElementById('sys-wifi-icon');
  const sysGpuVal = document.getElementById('sys-gpu-val');
  const sysMemVal = document.getElementById('sys-mem-val');
  const btnRefreshPage = document.getElementById('btn-refresh-page');
  const sysModeText = document.getElementById('sys-mode-text');
  const sysModeIcon = document.getElementById('sys-mode-icon');

  if (!cameraButtonsEl && !elEmpList) return; // not on CCTV page

  const socket = (App.socket = App.socket || io());
  App.CaptureSeen = App.CaptureSeen || new Set();
  App.CaptureCache = App.CaptureCache || {}; // { [camId]: { url, ts } }
  let currentCamId = null;
  let lastFrameAt = 0;
  let frameWatch = null;

  // Real-time alert logs -> on-time notifications (message-based only) with de-dup
  try{
    socket.on('alert_log', (log)=>{
      // Only accept canonical message forms. The server is the source of truth.
      const msg = (log && typeof log.message === 'string') ? log.message : '';
      const typ = String(log && log.alert_type || '').toUpperCase();
      const empId = String(log && log.employee_id || '');
      if (!msg) return; // require message from server (already correct text)
      const lower = msg.toLowerCase();
      if (lower.includes('back to area') || lower.includes('out of area since')) {
      try{
        const NC = (window.App && window.App.NotificationCenter) ? window.App.NotificationCenter : null;
        if (NC){ NC.pushKeyed(`alert:${empId}:${typ}:${log.timestamp||Date.now()}`, msg, 45000); }
      }catch(_){ }
      try{
        if (elAlerts){ const n = parseInt(elAlerts.textContent||'0',10); elAlerts.textContent = String((isFinite(n)?n:0)+1); }
      }catch(_){ }
      }
    });
  }catch(_e){ }

  function setAIStatus(active) {
    if (!aiDot || !aiText) return;
    if (active) {
      aiDot.classList.remove('bg-red-500');
      aiDot.classList.add('bg-green-500');
      aiText.textContent = 'AI Inference: Online';
    } else {
      aiDot.classList.remove('bg-green-500');
      aiDot.classList.add('bg-red-500');
      aiText.textContent = 'AI Inference: Offline';
    }
  }

  async function refreshScheduleMode(){
    if (!sysModeText && !sysModeIcon) return;
    try{
      const res = await fetch('/api/schedule/state', { cache: 'no-store' });
      const st = await res.json();
      const active = !!st.tracking_active;
      const lunch = !!st.suppress_alerts;
      let label = 'Off-Hours';
      let cls = 'text-gray-500';
      let icon = 'off';
      if (lunch){ label = 'Lunch Break'; cls = 'text-yellow-600'; }
      else if (active){ label = 'Work Hours'; cls = 'text-green-600'; }
      icon = lunch ? 'lunch' : (active ? 'work' : 'off');
      if (sysModeText){ sysModeText.textContent = label; sysModeText.classList.remove('text-gray-500','text-green-600','text-yellow-600','text-red-600'); sysModeText.classList.add(cls); }
      if (sysModeIcon){
        sysModeIcon.classList.remove('text-gray-500','text-green-600','text-yellow-600','text-red-600');
        sysModeIcon.classList.add(cls);
        // swap icon per mode
        if (icon === 'work'){
          sysModeIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11"/></svg>';
        } else if (icon === 'lunch'){
          // pause circle style
          sysModeIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="14" y1="9" x2="14" y2="15"/></svg>';
        } else {
          // moon icon for off-hours
          sysModeIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        }
      }
    }catch(_e){
      if (sysModeText){ sysModeText.textContent = 'Unknown'; sysModeText.classList.remove('text-green-600','text-yellow-600'); sysModeText.classList.add('text-gray-500'); }
      if (sysModeIcon){ sysModeIcon.classList.remove('text-green-600','text-yellow-600'); sysModeIcon.classList.add('text-gray-500'); sysModeIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'; }
    }
  }

  // --- System Information ---
  function fmtBytes(n){
    if (typeof n !== 'number' || !isFinite(n) || n<=0) return '—';
    const units = ['B','KB','MB','GB','TB'];
    let i=0, v=n;
    while (v>=1024 && i<units.length-1){ v/=1024; i++; }
    return `${v.toFixed(i>=2?1:0)} ${units[i]}`;
  }
  async function refreshSystemInfo(){
    try{
      const res = await fetch('/api/system/info', { cache:'no-store' });
      const j = await res.json();
      // Internet latency
      if (sysLatency){
        if (j && typeof j.internet_ms === 'number'){
          const ms = Math.round(j.internet_ms);
          sysLatency.textContent = `${ms} ms`;
          sysLatency.classList.remove('text-green-600','text-yellow-600','text-red-600','text-gray-400');
          if (sysWifiIcon){ sysWifiIcon.classList.remove('text-green-600','text-yellow-600','text-red-600','text-gray-400'); }
          if (ms <= 50) sysLatency.classList.add('text-green-600');
          else if (ms <= 150) sysLatency.classList.add('text-yellow-600');
          else sysLatency.classList.add('text-red-600');
          // mirror color to wifi icon
          if (sysWifiIcon){
            if (ms <= 50) sysWifiIcon.classList.add('text-green-600');
            else if (ms <= 150) sysWifiIcon.classList.add('text-yellow-600');
            else sysWifiIcon.classList.add('text-red-600');
          }
        } else {
          sysLatency.textContent = 'offline';
          sysLatency.classList.remove('text-green-600','text-yellow-600');
          sysLatency.classList.add('text-red-600');
          if (sysWifiIcon){ sysWifiIcon.classList.remove('text-green-600','text-yellow-600'); sysWifiIcon.classList.add('text-red-600'); }
        }
      }
      // GPU usage
      if (sysGpuVal){
        const v = (j && typeof j.gpu_usage_percent === 'number') ? j.gpu_usage_percent : null;
        sysGpuVal.textContent = (v!=null)? `${v}%` : '—';
        sysGpuVal.classList.remove('text-red-600');
        if (v!=null && v>=93) sysGpuVal.classList.add('text-red-600');
      }
      // Memory usage
      if (sysMemVal){
        const used = (j && typeof j.memory_used_bytes==='number') ? j.memory_used_bytes : null;
        const total = (j && typeof j.memory_total_bytes==='number') ? j.memory_total_bytes : null;
        if (used!=null && total!=null){
          sysMemVal.textContent = `${fmtBytes(used)} / ${fmtBytes(total)}`;
          sysMemVal.classList.remove('text-red-600');
          // if within 500MB of total, mark red
          if ((total - used) <= 500*1024*1024) sysMemVal.classList.add('text-red-600');
        } else {
          sysMemVal.textContent = '—';
        }
      }
    }catch(_e){
      if (sysLatency){ sysLatency.textContent = 'offline'; sysLatency.classList.add('text-red-600'); }
    }
  }
  // Bind refresh button
  if (btnRefreshPage){ btnRefreshPage.addEventListener('click', ()=>{ location.reload(); }); }
  // Refresh on load and every 10s
  if (sysLatency || sysGpuVal || sysMemVal){ refreshSystemInfo(); setInterval(refreshSystemInfo, 10000); }
  if (sysModeText || sysModeIcon){ refreshScheduleMode(); setInterval(refreshScheduleMode, 10000); }

  function showFrame(dataUrl) {
    if (!videoImg || !placeholder) return;
    videoImg.src = dataUrl;
    videoImg.classList.remove('hidden');
    placeholder.classList.add('hidden');
  }
  function showPlaceholder(msg) {
    if (!videoImg || !placeholder) return;
    videoImg.classList.add('hidden');
    placeholder.classList.remove('hidden');
    if (msg) placeholder.innerHTML = `<span>${msg}</span>`;
  }

  async function loadCameras() {
    if (!cameraButtonsEl) return;
    async function _fetchOnce(){
      const res = await fetch('/api/cameras', { cache: 'no-store' });
      if (!res.ok){ throw new Error(`HTTP ${res.status}`); }
      try{ return await res.json(); }catch(e){ throw new Error('Invalid JSON'); }
    }
    try {
      let cams = null;
      try{ cams = await _fetchOnce(); }
      catch(e1){
        // retry once shortly after
        await new Promise(r=>setTimeout(r, 1000));
        cams = await _fetchOnce();
      }
      // Build an index for use by tracking panel: id -> { name, area }
      App.CamIndex = {};
      (Array.isArray(cams) ? cams : []).forEach(c=>{ if (c && c.id != null){ App.CamIndex[c.id] = { name: c.name || `CAM ${c.id}`, area: c.area || '' }; } });
      // Deprecated: loadCaptureCams removed in new flow
      // Populate area filter options
      if (areaFilter){
        const areas = Array.from(new Set((Array.isArray(cams)?cams:[]).map(c=> (c && c.area) ? String(c.area) : '').filter(Boolean))).sort((a,b)=>a.localeCompare(b));
        // Prefer saved selection if exists
        const savedArea = (function(){ try{ return localStorage.getItem(LSK_AREA) || ''; }catch(_e){ return ''; } })();
        const current = savedArea || areaFilter.value;
        areaFilter.innerHTML = '<option value="">All Areas</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join('');
        // Try to keep previous selection if still valid
        if (current && areas.includes(current)) areaFilter.value = current; else areaFilter.value = '';
      }
      cameraButtonsEl.innerHTML = '';
      // Ensure grid container with fixed 4 columns
      cameraButtonsEl.classList.add('grid','gap-2');
      ['grid-cols-2','sm:grid-cols-3','md:grid-cols-4','lg:grid-cols-5','xl:grid-cols-6'].forEach(cls=>cameraButtonsEl.classList.remove(cls));
      cameraButtonsEl.classList.add('grid-cols-4');
      if (!Array.isArray(cams) || cams.length === 0) {
        cameraButtonsEl.innerHTML = '<div class="text-sm text-gray-500">No cameras found</div>';
        return;
      }
      cams.forEach(cam => {
        const btn = document.createElement('button');
        const disabled = cam.stream_enabled === false;
        btn.className = 'w-full px-3 py-2 rounded transition text-sm text-center break-words leading-tight ' + (disabled ? 'bg-gray-300 text-gray-700 cursor-not-allowed' : 'bg-primary text-white hover:bg-blue-700');
        const area = cam.area ? String(cam.area) : '';
        const name = cam.name || (cam.id != null ? `CAM ${cam.id}` : 'CAM');
        const label = area ? `${area} <br> ${name}` : name;
        // Always render consistent inner HTML so size doesn't jump
        btn.innerHTML = `
          <div>${label}</div>
          <div class="text-[11px] opacity-80 ${disabled ? '' : 'hidden'}">(Stream Off)</div>
        `;
        btn.title = label;
        btn.addEventListener('click', () => { if (!disabled) startStream(cam.id); });
        cameraButtonsEl.appendChild(btn);
      });
    // On any capture-related server signal, just refresh previews
    socket.on('captures_deleted', ()=>{ try{ refreshCapturePreviews(); }catch(_e){} });
    } catch (e) {
      const msg = (e && e.message) ? e.message : 'Unknown error';
      cameraButtonsEl.innerHTML = `<div class="text-sm text-danger">Failed to load cameras (${App.safe ? App.safe(msg) : msg})</div>`;
      console.error('Failed to load /api/cameras:', e);
    }
  }

  async function updateAIIndicatorFor(camId){
    try{
      const res = await fetch('/api/cameras/status');
      const data = await res.json();
      const items = (data && data.items) || [];
      const it = items.find(x=> Number(x.id) === Number(camId));
      if (it){ setAIStatus(!!it.ai_running); }
    }catch(e){ /* no-op */ }
  }

  function startStream(camId) {
    if (!socket) return;
    if (currentCamId !== null) {
      socket.emit('stop_stream', { cam_id: currentCamId });
    }
    currentCamId = camId;
    showPlaceholder('&lt;CONNECTING...&gt;');
    // Update AI indicator from toggle status, not from frames
    updateAIIndicatorFor(camId);
    lastFrameAt = 0;
    if (frameWatch) clearInterval(frameWatch);
    frameWatch = setInterval(() => {
      if (!currentCamId) return;
      if (lastFrameAt === 0) return;
      const gap = Date.now() - lastFrameAt;
      // Do not change AI indicator here; it reflects Toggle AI only
    }, 1000);
    socket.emit('start_stream', { cam_id: camId });
  }

  // --- Frame Capture helpers ---
  // Auto per-camera capture previews (latest frame per active camera)
  async function refreshCapturePreviews(){
    if (!capList) return;
    try{
      const res = await fetch('/api/captures/per_camera_latest', { cache: 'no-store' });
      const rows = await res.json();
      const items = Array.isArray(rows) ? rows : [];
      capList.innerHTML = '';
      if (!items.length){ capList.innerHTML = '<div class="text-xs text-gray-500">No captures</div>'; return; }
      items.forEach((it)=>{
        const url = it && it.url ? it.url : '';
        const area = (it && it.area) ? String(it.area) : '';
        const name = (it && it.name) ? String(it.name) : (`CAM ${it && it.cam_id != null ? it.cam_id : ''}`);
        const tsIso = (it && it.timestamp) ? String(it.timestamp) : null;
        const tsText = (window.App && typeof App.formatTs === 'function') && tsIso ? App.formatTs(tsIso) : (tsIso || '');
        const card = document.createElement('div');
        card.className = 'cursor-pointer border rounded overflow-hidden bg-white hover:shadow';
        card.innerHTML = `
          <div class="w-full h-28 bg-gray-100 flex items-center justify-center overflow-hidden">${url?`<img src="${url}" class="w-full h-full object-cover" />`:'<span class="text-xs text-gray-500">No snapshot</span>'}</div>
          <div class="p-2 text-[11px] text-gray-600 truncate">${area ? App.safe(area) + ' - ' : ''}${App.safe(name)}</div>
          <div class="px-2 pb-2 text-[10px] text-gray-400 truncate">${App.safe(tsText)}</div>
        `;
        card.addEventListener('click', ()=>{
          if (url && capView){ capView.src = url; capView.classList.remove('hidden'); }
          if (capViewPh){ capViewPh.classList.add('hidden'); }
        });
        capList.appendChild(card);
      });
    }catch(_e){ capList.innerHTML = '<div class="text-xs text-gray-500">Failed to load previews</div>'; }
  }
  function captureFromCurrentFrame(){
    if (!videoImg || !videoImg.src){ return null; }
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    return new Promise((resolve, reject)=>{
      img.onload = ()=>{
        try{
          canvas.width = img.naturalWidth || 1280;
          canvas.height = img.naturalHeight || 720;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          resolve(dataUrl);
        }catch(e){ reject(e); }
      };
      img.onerror = reject; img.src = videoImg.src;
    });
  }
  // Auto-mark ABSENT 5 minutes before work end (once per day)
  function parseWorkRange(str){
    try{ const [a,b] = String(str||'08:30-17:30').split('-'); const [ah,am]=a.split(':').map(n=>parseInt(n,10)); const [bh,bm]=b.split(':').map(n=>parseInt(n,10)); return { start:{h:ah||8,m:am||30}, end:{h:bh||17,m:bm||30} }; }catch(_){ return { start:{h:8,m:30}, end:{h:17,m:30} }; }
  }
  async function checkWorkEndMarkAbsent(){
    try{
      // Read schedule state (for authoritative work_hours) and current tracking snapshot
      const res = await fetch('/api/schedule/state');
      const st = await res.json(); if (!st) return;
      const wr = parseWorkRange(st.work_hours || (App.Params && App.Params.work_hours));
      const now = new Date();
      // Build today's end time and subtract 5 minutes
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), wr.end.h, wr.end.m, 0, 0);
      const offMin = (App.Params && typeof App.Params.mark_absent_offset_minutes_before_end === 'number') ? App.Params.mark_absent_offset_minutes_before_end : 5;
      const triggerFrom = new Date(end.getTime() - Math.max(0, offMin)*60*1000);
      const enabled = (App.Params && typeof App.Params.mark_absent_enabled !== 'undefined') ? !!App.Params.mark_absent_enabled : true;
      if (!enabled) return;
      // Only run if time window is within [end-5min, end] and only once per day
      if (!(now >= triggerFrom && now <= end)) return;
      if (!_lastTrackingState || !Array.isArray(_lastTrackingState.employees)) return;
      const ymd = now.getFullYear()+"-"+("0"+(now.getMonth()+1)).slice(-2)+"-"+("0"+now.getDate()).slice(-2);
      const LS_KEY = 'marked_absent_for_day_v1';
      try{ const last = localStorage.getItem(LS_KEY); if (last === ymd) return; }catch(_){ }
      const ids = _lastTrackingState.employees.filter(e => e && e.is_active !== false && !e.is_present).map(e => e.employee_id).filter(x => x != null);
      if (!ids.length) { try{ localStorage.setItem(LS_KEY, ymd); }catch(_e){} return; }
      await fetch('/api/admin/mark_absent', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ employee_ids: ids }) });
      try{ localStorage.setItem(LS_KEY, ymd); }catch(_e){}
    }catch(_e){ /* ignore */ }
  }
  // Run the check every 60 seconds so we hit the 17:25 window reliably
  setInterval(checkWorkEndMarkAbsent, 60000);
  async function blobToDataURL(blob){
    return new Promise((resolve)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.readAsDataURL(blob); });
  }
  async function doCapture(){
    if (!btnCapture) return;
    let orig = btnCapture.textContent;
    try{
      const selectedId = capCamSelect && capCamSelect.value ? Number(capCamSelect.value) : null;
      let targetCamId = selectedId != null ? selectedId : (typeof currentCamId === 'number' ? currentCamId : null);
      if (targetCamId == null){ capMsg && (capMsg.textContent = 'Select a camera first'); return; }
      // Try snapshot from background AI first (with annotation/bboxes)
      let dataUrl = null;
      try{
        const snapRes = await fetch(`/api/cameras/${targetCamId}/snapshot?annotate=1`, { cache: 'no-store' });
        if (snapRes.ok){ const blob = await snapRes.blob(); dataUrl = await blobToDataURL(blob); }
      }catch(_e){ /* ignore */ }
      // If snapshot not available, fallback to current live frame (if any)
      if (!dataUrl){ dataUrl = await captureFromCurrentFrame(); }
      if (!dataUrl){ capMsg && (capMsg.textContent = 'No frame available'); return; }
      const camId = targetCamId;
      const area = (camId && App.CamIndex && App.CamIndex[camId]) ? (App.CamIndex[camId].area || '') : '';
      const note = (capNote && capNote.value) ? capNote.value.trim() : '';
      btnCapture.disabled = true; capMsg && (capMsg.textContent = 'Saving...');
      const res = await fetch('/api/captures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl, cam_id: camId, area, note }) });
      const jr = await res.json().catch(()=>({}));
      if (!res.ok || !jr.ok){ capMsg && (capMsg.textContent = jr.error || 'Failed to save'); return; }
      capMsg && (capMsg.textContent = 'Captured'); if (capNote) capNote.value = '';
      if (capView){ capView.src = jr.item && jr.item.url ? jr.item.url : dataUrl; capView.classList.remove('hidden'); }
      if (capViewPh){ capViewPh.classList.add('hidden'); }
      // Optimistically prepend to capture list; server will also emit socket (we dedupe)
      try{
        if (capList && jr && jr.item){
          const it = jr.item;
          const key = (it.file || it.url || JSON.stringify(it));
          if (App.CaptureSeen && App.CaptureSeen.has(key)){
            // already shown
          } else {
          const card = document.createElement('div');
          card.className = 'cursor-pointer border rounded overflow-hidden bg-white hover:shadow';
          card.dataset.key = key;
          card.innerHTML = `
            <img src="${it.url||''}" class="w-full h-28 object-cover" />
            <div class="p-2 text-[11px] text-gray-600 truncate">${(it.area||'') + (it.cam_id!=null? ' · CAM '+it.cam_id:'')}</div>
            <div class="px-2 pb-2 text-[10px] text-gray-400 truncate">${it.timestamp||''}</div>
          `;
          card.addEventListener('click', ()=>{
            if (capView){ capView.src = it.url||''; capView.classList.remove('hidden'); }
            if (capViewPh){ capViewPh.classList.add('hidden'); }
          });
          capList.prepend(card);
          if (App.CaptureSeen) App.CaptureSeen.add(key);
          }
        }
      }catch(_e){ loadCaptures(); }
    }catch(e){ console.error(e); capMsg && (capMsg.textContent = 'Capture failed'); }
    finally { if (btnCapture){ btnCapture.disabled = false; btnCapture.textContent = orig || 'Capture'; } }
  }
  // Initialize auto previews and keep updating every 5s
  refreshCapturePreviews();
  setInterval(refreshCapturePreviews, 5000);
  if (capCamSelect){ capCamSelect.addEventListener('change', ()=>{ try{ localStorage.setItem(LSK_SEL_CAM, capCamSelect.value||''); }catch(_e){} }); }
  if (btnCapDel){
    btnCapDel.addEventListener('click', async ()=>{
      if (!capDelDate || !capDelDate.value){ if (capDelMsg) capDelMsg.textContent = 'Select a date'; return; }
      const d = capDelDate.value; // expect YYYY-MM-DD
      const ok = await (window.App && App.confirmDialog ? App.confirmDialog({
        title: 'Delete Captures',
        message: `Delete all frame captures for ${d}? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel'
      }) : Promise.resolve(window.confirm(`Delete all captures for ${d}? This cannot be undone.`)));
      if (!ok) return;
      try{
        btnCapDel.disabled = true; if (capDelMsg) capDelMsg.textContent = 'Deleting...';
        const res = await fetch(`/api/captures?date=${encodeURIComponent(d)}&confirm=1`, { method: 'DELETE' });
        const jr = await res.json().catch(()=>({}));
        if (!res.ok || !jr.ok){ if (capDelMsg) capDelMsg.textContent = jr.error || 'Delete failed'; return; }
        if (capDelMsg) capDelMsg.textContent = `Deleted ${jr.files_removed||0} files`;
        loadCaptures();
      }catch(e){ if (capDelMsg) capDelMsg.textContent = 'Delete failed'; }
      finally{ btnCapDel.disabled = false; }
    });
  }

  if (socket){
    socket.on('frame', payload => {
      if (!payload || !payload.image) return;
      lastFrameAt = Date.now();
      showFrame(`data:image/jpeg;base64,${payload.image}`);
    });
    socket.on('stream_error', payload => {
      const msg = payload && payload.message ? payload.message : 'Stream error';
      showPlaceholder(`&lt;${msg}&gt;`);
    });
    socket.on('stream_stopped', () => {
      showPlaceholder('&lt;LIVE CCTV CAM&gt;');
      if (frameWatch) { clearInterval(frameWatch); frameWatch = null; }
      lastFrameAt = 0;
    });
    // Realtime capture updates
    socket.on('capture_saved', ()=>{ try{ refreshCapturePreviews(); }catch(_e){} });
    // If Settings toggles stream off for current camera, stop showing it immediately
    socket.on('camera_status', payload => {
      if (!payload || currentCamId == null) return;
      if (payload.cam_id === currentCamId && payload.stream_enabled === false){
        socket.emit('stop_stream', { cam_id: currentCamId });
        currentCamId = null;
        showPlaceholder('&lt;STREAM DISABLED&gt;');
      }
      if (payload.cam_id === currentCamId && payload.ai_running != null){ setAIStatus(!!payload.ai_running); }
      // Refresh capture camera dropdown when ai_running changes for any camera
      if (payload.ai_running != null || payload.stream_enabled != null){ refreshCapturePreviews(); }
      // Always refresh camera buttons when stream_enabled changes for any camera
      if (payload.stream_enabled != null){
        loadCameras();
      }
    });
    window.addEventListener('beforeunload', () => { if (currentCamId !== null) socket.emit('stop_stream', { cam_id: currentCamId }); });
  }

  // Expose loader and run initially
  App.loadCameras = loadCameras;
  loadCameras();

  // Tracking poll and render
  let AWAY_MUTE_THRESHOLD_SEC = 15 * 3600; // default 15 hours, can be overridden by server params
  // Load params from server (away mute threshold, work/lunch hours for reference)
  (async function loadParams(){
    try{
      const res = await fetch('/api/config/params');
      const p = await res.json();
      const hrs = Number(p && p.away_mute_threshold_hours);
      if (!Number.isNaN(hrs) && hrs > 0 && hrs < 240){ AWAY_MUTE_THRESHOLD_SEC = Math.floor(hrs * 3600); }
      // Store for other modules if needed
      window.App = window.App || {}; App.Params = p;
    }catch(_e){ /* keep defaults */ }
  })();
  // Keep schedule state (for suppression during lunch/pause)
  window.App = window.App || {};
  App.ScheduleState = App.ScheduleState || null;
  async function pollScheduleState(){
    try{ const r = await fetch('/api/schedule/state'); const s = await r.json(); App.ScheduleState = s; }
    catch(_){ /* ignore */ }
  }
  pollScheduleState(); setInterval(pollScheduleState, 20000);
  function canAlert(){ const st = (window.App && App.ScheduleState) ? App.ScheduleState : null; return !(st && st.suppress_alerts); }
  // Cameras Online badge updater
  async function updateCamerasOnline(){
    try{
      const el = document.getElementById('sys-cam-online');
      const icon = document.querySelector('#sys-cam svg');
      if (!el) return;
      const res = await fetch('/api/cameras/status');
      const data = await res.json();
      const items = (data && Array.isArray(data.items)) ? data.items : [];
      const total = items.length;
      const online = items.reduce((acc, it)=> acc + ((it && (it.ai_running || it.stream_enabled)) ? 1 : 0), 0);
      el.textContent = `CAM Online(s): ${online}${total?`/${total}`:''}`;
      if (icon){
        // reset classes then apply color
        try{
          icon.classList.remove('text-gray-400','text-green-600');
          if (online > 0){ icon.classList.add('text-green-600'); }
          else { icon.classList.add('text-gray-400'); }
        }catch(_){ /* ignore */ }
      }
      try{
        el.classList.remove('text-gray-700','text-green-700');
        el.classList.add(online>0 ? 'text-green-700' : 'text-gray-700');
      }catch(_){ }
    }catch(_){ /* ignore */ }
  }
  updateCamerasOnline(); setInterval(updateCamerasOnline, 20000);
  const prevByEmp = new Map();
  // Per-employee last state persistence (per session & per day) to avoid duplicate EXIT on refresh
  const SS_KEY = 'alerts_last_exit_enter_v1';
  function ymd(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
  function loadPersist(){ try{ const raw=sessionStorage.getItem(SS_KEY); if(raw){ const obj=JSON.parse(raw); if(obj && obj.date===ymd()) return obj; } }catch(_){} return { date: ymd(), exit: {}, enter: {} }; }
  function savePersist(){ try{ sessionStorage.setItem(SS_KEY, JSON.stringify(_persist)); }catch(_){} }
  let _persist = loadPersist();
  function minIntervalSec(){ const v = App.Params && Number(App.Params.alert_min_interval_sec); return (!Number.isNaN(v) && v>0) ? Math.floor(v) : 30; }
  function nowSec(){ return Math.floor(Date.now()/1000); }
  function formatDuration(sec, suffix){
    if (sec == null) return '—';
    let base = '';
    if (sec < 60) base = `${sec}s`;
    else if (sec < 3600) base = `${Math.floor(sec/60)} min`;
    else if (sec < 86400) base = `${Math.floor(sec/3600)} h`;
    else base = `${Math.floor(sec/86400)} d`;
    if (!suffix) return base;
    if (suffix === 'ago') return `${base} ago`;
    if (suffix === 'after') return `${base}`; // used in phrasing 'after ${base}'
    return `${base} ${suffix}`;
  }
  function durationText(item){
    if (item && item.is_present) return 'Just now';
    const sec = (item && typeof item.seconds_since === 'number') ? item.seconds_since : null;
    return formatDuration(sec, 'ago');
  }
  let _lastTrackingState = null;
  function renderTracking(state){
    _lastTrackingState = state;
    if (!state) return;
    const present = state.present || 0;
    const alerts = state.alerts || 0;
    const total = state.total || 0;
    const activeTotal = state.active_total || 0;
    if (elActiveCount) elActiveCount.textContent = `${activeTotal} Active`;
    if (elPresent) elPresent.textContent = present;
    if (elAlerts) elAlerts.textContent = alerts;
    if (elTotal) elTotal.textContent = total;
    if (!elEmpList) return;
    const list = Array.isArray(state.employees) ? state.employees : [];
    const selectedArea = (areaFilter && areaFilter.value) ? String(areaFilter.value) : '';
    const NC = (window.App && window.App.NotificationCenter) ? window.App.NotificationCenter : null;
    // compute filtered list first for notifications and render
    const idx = (App.CamIndex || {});
    const filtered = list.filter(it=>{
      // Skip inactive employees entirely (no card and no notifications)
      if (it && it.is_active === false) return false;
      if (!selectedArea) return true;
      const camInfo = (it && it.camera_id != null) ? idx[it.camera_id] : null;
      const area = camInfo && camInfo.area ? camInfo.area : '';
      return area === selectedArea;
    });
    filtered.forEach(it => {
      const prev = prevByEmp.get(it.employee_id);
      if (NC){
        // Detect transition from ABSENT to PRESENT
        if (it.is_active !== false && prev && prev.is_present === false && it.is_present === true){
          const secAway = Math.max(0, Math.floor(prev.seconds_since || 0));
          const name = it.name || `Employee ${it.employee_id}`;
          // Persist ENTER alert (server will emit back a socket event for notification)
          try{ fetch('/api/alert_logs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ employee_id: it.employee_id, alert_type:'ENTER', camera_id: (it.camera_id!=null?it.camera_id:null), message: `${name} back to area after ${formatDuration(secAway, 'after')}` }) }); }catch(_){ }
        }
        // Detect transition from PRESENT to ABSENT
        if (it.is_active !== false && prev && prev.is_present === true && it.is_present === false){
          const name = it.name || `Employee ${it.employee_id}`;
          // Persist EXIT alert (server will emit back a socket event for notification)
          try{ fetch('/api/alert_logs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ employee_id: it.employee_id, alert_type:'EXIT', camera_id: (it.camera_id!=null?it.camera_id:null), message: `${name} out of area since ${durationText(it)}` }) }); }catch(_){ }
        }
      }
      prevByEmp.set(it.employee_id, { is_present: !!it.is_present, seconds_since: it.seconds_since });
    });
    if (elActiveCount) elActiveCount.textContent = `${filtered.length} Active`;
    if (filtered.length === 0){ elEmpList.innerHTML = '<div class="text-sm text-gray-500">No active employees</div>'; return; }
    elEmpList.innerHTML = '';
    filtered.forEach(item=>{
      const statusDot = item.is_present ? 'available' : 'off';
      let camName = '—';
      const idx = (App.CamIndex || {});
      const camInfo = item && item.camera_id != null ? idx[item.camera_id] : null;
      if (camInfo && camInfo.area){ camName = camInfo.area; }
      else if (item.camera_name){ camName = item.camera_name; }
      else if (item.camera_id){ camName = `CAM ${item.camera_id}`; }
      const card = document.createElement('div');
      card.className = 'border rounded-lg p-3 flex items-center justify-between mb-2';
      card.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="inline-block w-2.5 h-2.5 rounded-full status-dot ${statusDot}"></span>
          <div>
            <div class="font-medium">${item.name || 'Unknown'}</div>
            <div class="text-xs text-gray-500">${item.department || ''}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-sm">${camName}</div>
          <div class="text-xs text-gray-500">${durationText(item)}</div>
        </div>`;
      elEmpList.appendChild(card);
    });
  }
  let trackingTimer = null;
  async function pollTracking(){
    try{ const res = await fetch('/api/tracking/state'); const state = await res.json(); renderTracking(state); }catch(e){ console.warn('tracking/state error', e); }
  }
  function startTrackingPoll(){ if (trackingTimer) return; pollTracking(); trackingTimer = setInterval(pollTracking, 2000); }
  startTrackingPoll();

  // Area filter change -> rerender using last state
  if (areaFilter){ areaFilter.addEventListener('change', ()=>{ try{ localStorage.setItem(LSK_AREA, areaFilter.value||''); }catch(_e){} if (_lastTrackingState) renderTracking(_lastTrackingState); }); }

  // --- Adjustment Panel logic ---
  const LSK = 'cctv_layout_v1';
  const LSK_SEL_CAM = 'cap_cam_selected_v1';
  const LSK_AREA = 'area_filter_v1';
  function _loadLayout(){
    try{ const s = localStorage.getItem(LSK); if (!s) return null; const obj = JSON.parse(s); return (obj && typeof obj==='object') ? obj : null; }catch(_e){ return null; }
  }
  function _saveLayout(st){ try{ localStorage.setItem(LSK, JSON.stringify(st||{})); }catch(_e){}
  }
  let state = (function(){ const saved = _loadLayout(); return saved ? { feedHidden: !!saved.feedHidden, empExpanded: !!saved.empExpanded, capHidden: !!saved.capHidden } : { feedHidden: false, empExpanded: false, capHidden: false }; })();

  function applyLayout(animate=true){
    if (!feedSection || !trackSection) return;
    // Add transition classes
    if (animate){
      [feedSection, trackSection].forEach(el=>{ if (!el) return; el.classList.add('transition-all','duration-300'); });
    }
    // Capture panel visibility and placement
    if (captureSection){
      if (state.capHidden){ captureSection.classList.add('hidden'); }
      else { captureSection.classList.remove('hidden'); }
    }
    if (btnAdjToggleCap){ btnAdjToggleCap.textContent = state.capHidden ? 'Show Capture Panel' : 'Hide Capture Panel'; }

    // Reorder panels to keep Employee at top-right always
    try{
      if (feedSection && trackSection){
        const gridParent = feedSection.parentElement;
        if (!gridParent) throw new Error('no grid parent');
        // Helper: place node after a reference
        const placeAfter = (node, ref)=>{ if (ref.nextSibling !== node){ gridParent.insertBefore(node, ref.nextSibling); } };
        if (state.feedHidden){
          // desired order: [capture, employee]
          if (captureSection){
            if (captureSection.nextSibling !== trackSection){ gridParent.insertBefore(captureSection, trackSection); }
            captureSection.classList.add('lg:col-span-2');
          }
        } else {
          // desired order: [feed, employee, capture]
          // Ensure employee comes right after feed
          if (feedSection.nextSibling !== trackSection){ placeAfter(trackSection, feedSection); }
          // Then place capture after employee
          if (captureSection){ placeAfter(captureSection, trackSection); captureSection.classList.add('lg:col-span-2'); }
        }
      }
    }catch(e){ /* noop */ }

    // CCTV feed visibility (left area remains empty when hidden)
    if (state.feedHidden){
      feedSection.classList.add('hidden');
      if (btnAdjToggleFeed){ btnAdjToggleFeed.textContent = 'Show CCTV Panel'; }
    } else {
      feedSection.classList.remove('hidden');
      if (btnAdjToggleFeed){ btnAdjToggleFeed.textContent = 'Hide CCTV Panel'; }
    }
    // Employee layout rules
    // - Always keep employee at right (col-start-3) when NOT expanded, regardless of feed/capture visibility
    // - When expanded, span all 3 columns and normal list turns into 3-col grid
    if (!state.empExpanded){
      trackSection.classList.remove('lg:col-span-3');
      trackSection.classList.add('lg:col-start-3');
      if (elEmpList){ elEmpList.classList.remove('grid','grid-cols-3','gap-3'); }
    } else {
      trackSection.classList.add('lg:col-span-3');
      trackSection.classList.remove('lg:col-start-3');
      if (elEmpList){ elEmpList.classList.add('grid','grid-cols-3','gap-3'); }
    }
    // Buttons enable/disable
    if (btnAdjExpandEmp){
      // Expand allowed only when BOTH CCTV and Capture are hidden, and not already expanded
      const enable = !!state.feedHidden && !!state.capHidden && !state.empExpanded;
      btnAdjExpandEmp.disabled = !enable;
      btnAdjExpandEmp.classList.toggle('cursor-not-allowed', !enable);
      btnAdjExpandEmp.classList.toggle('bg-gray-300', !enable);
      btnAdjExpandEmp.classList.toggle('text-gray-700', !enable);
      btnAdjExpandEmp.classList.toggle('bg-white', enable);
      btnAdjExpandEmp.classList.toggle('border', enable);
      btnAdjExpandEmp.classList.toggle('border-gray-300', enable);
      btnAdjExpandEmp.classList.toggle('hover:bg-gray-50', enable);
    }
    if (btnAdjMinEmp){
      // Minimize allowed only when expanded
      const enableMin = !!state.empExpanded;
      btnAdjMinEmp.disabled = !enableMin;
      btnAdjMinEmp.classList.toggle('cursor-not-allowed', !enableMin);
      btnAdjMinEmp.classList.toggle('bg-gray-300', !enableMin);
      btnAdjMinEmp.classList.toggle('text-gray-700', !enableMin);
      btnAdjMinEmp.classList.toggle('bg-white', enableMin);
      btnAdjMinEmp.classList.toggle('border', enableMin);
      btnAdjMinEmp.classList.toggle('border-gray-300', enableMin);
      btnAdjMinEmp.classList.toggle('hover:bg-gray-50', enableMin);
      btnAdjMinEmp.textContent = 'Minimize Employee Panel';
    }
    // Persist layout after each apply
    _saveLayout(state);
    // Debounced refresh for camera UI if layout changes hide/show panels
    try{
      if (typeof applyLayout._t !== 'undefined') clearTimeout(applyLayout._t);
    }catch(_e){}
    applyLayout._t = setTimeout(()=>{ try{ loadCameras(); loadCaptureCams(); }catch(_e){} }, 150);
  }
  // Initial apply
  applyLayout(false);
  // Seed saved area filter on first load (in case loadCameras hasn't set it yet)
  try{ const savedArea = localStorage.getItem(LSK_AREA) || ''; if (areaFilter && savedArea) areaFilter.value = savedArea; }catch(_e){}
  // Handlers
  if (btnAdjToggleFeed){ btnAdjToggleFeed.addEventListener('click', ()=>{ state.feedHidden = !state.feedHidden; if (!state.feedHidden){ state.empExpanded = false; } applyLayout(true); }); }
  if (btnAdjExpandEmp){ btnAdjExpandEmp.addEventListener('click', ()=>{ if (state.feedHidden && !state.empExpanded){ state.empExpanded = true; applyLayout(true); } }); }
  if (btnAdjMinEmp){ btnAdjMinEmp.addEventListener('click', ()=>{ if (state.empExpanded){ state.empExpanded = false; applyLayout(true); } }); }
  if (btnAdjToggleCap){ btnAdjToggleCap.addEventListener('click', ()=>{ state.capHidden = !state.capHidden; applyLayout(true); }); }

  // Cross-tab sync via storage events
  window.addEventListener('storage', (e)=>{
    try{
      if (!e) return;
      if (e.key === LSK){
        const saved = _loadLayout();
        if (saved){ state.feedHidden = !!saved.feedHidden; state.empExpanded = !!saved.empExpanded; state.capHidden = !!saved.capHidden; applyLayout(false); }
      }
      if (e.key === LSK_AREA && areaFilter){
        const val = (e.newValue || '');
        areaFilter.value = val || '';
        if (_lastTrackingState) renderTracking(_lastTrackingState);
      }
      if (e.key === LSK_SEL_CAM && capCamSelect){
        const val = (e.newValue || '');
        if (Array.from(capCamSelect.options).some(o=>o.value===val)) capCamSelect.value = val;
      }
    }catch(_e){}
  });
})();
