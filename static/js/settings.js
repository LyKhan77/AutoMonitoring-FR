// Settings page: tabs, manage employees, face capture for add-employee, manage cameras, system controls, schedule system
(function(){
    const App = window.App || (window.App = {});

    const socket = (App.socket = App.socket || (typeof io !== 'undefined' ? io() : null));
    const showPage = App.showPage || function(id){};

    // Simple logger + toast for user-visible feedback
    function log(...args){ try{ console.log('[Settings]', ...args); }catch(_){} }
    function showToast(_msg, _type='info', _timeout=2000){ /* toast disabled by request */ }

    // Settings button opens settings page
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn){
      settingsBtn.addEventListener('click', ()=>{ log('Settings button clicked'); showPage('settings-page'); setActiveTab('employee'); loadEmployees(); showToast('Opened Settings > Manage Employee','info',1200); });
    }

    // Tabs elements
    const tabEmp = document.getElementById('tab-manage-employee');
    const tabCam = document.getElementById('tab-manage-camera');
    const tabSys = document.getElementById('tab-manage-system');
    const tabSch = document.getElementById('tab-schedule-system');
    const secEmp = document.getElementById('manage-employee');
    const secCam = document.getElementById('manage-camera');
    const secSys = document.getElementById('manage-system');
    const secSch = document.getElementById('schedule-system');

    function setActiveTab(which){
      [tabEmp, tabCam, tabSys, tabSch].forEach(t=>{ if (t) t.classList.remove('border-b-2','border-primary','text-primary'); });
      [secEmp, secCam, secSys, secSch].forEach(s=>{ if (s) s.classList.add('hidden'); });
      if (which === 'employee'){ if (tabEmp) tabEmp.classList.add('border-b-2','border-primary','text-primary'); if (secEmp) secEmp.classList.remove('hidden'); }
      else if (which === 'camera'){ if (tabCam) tabCam.classList.add('border-b-2','border-primary','text-primary'); if (secCam) secCam.classList.remove('hidden'); }
      else if (which === 'system'){ if (tabSys) tabSys.classList.add('border-b-2','border-primary','text-primary'); if (secSys) secSys.classList.remove('hidden'); }
      else if (which === 'schedule'){ if (tabSch) tabSch.classList.add('border-b-2','border-primary','text-primary'); if (secSch) secSch.classList.remove('hidden'); loadTrackingState(); }
    }
    if (tabEmp) tabEmp.addEventListener('click', ()=>{ setActiveTab('employee'); loadEmployees(); });
    if (tabCam) tabCam.addEventListener('click', ()=>{ setActiveTab('camera'); loadCameraStatus(); });
    if (tabSys) tabSys.addEventListener('click', ()=>{ setActiveTab('system'); });
    if (tabSch) tabSch.addEventListener('click', ()=>{ setActiveTab('schedule'); });
    if (secSch) { setActiveTab('schedule'); }

    // Manage System: Restart/Shutdown
    const btnResetSystem = document.getElementById('btn-reset-system');
    const sysResetMsg = document.getElementById('sys-reset-msg');
    if (btnResetSystem){
      btnResetSystem.addEventListener('click', async ()=>{
        const ok = await (window.App && App.confirmDialog ? App.confirmDialog({
          title: 'Restart System',
          message: 'The application will restart. This will temporarily disconnect the session.',
          confirmText: 'Restart',
          cancelText: 'Cancel'
        }) : Promise.resolve(confirm('Are you sure you want to restart the system now?')));
        if (!ok) return;
        btnResetSystem.disabled = true;
        if (sysResetMsg){ sysResetMsg.textContent = 'Restarting...'; sysResetMsg.className = 'text-sm ml-2 text-gray-600'; }
        try{
          const res = await fetch('/api/system/restart', { method:'POST' });
          const data = await res.json().catch(()=>({}));
          if (res.ok){ if (sysResetMsg){ sysResetMsg.textContent = 'System is restarting...'; sysResetMsg.className = 'text-sm ml-2 text-green-600'; } setTimeout(()=>{ btnResetSystem.disabled = false; }, 3000); }
          else { if (sysResetMsg){ sysResetMsg.textContent = data.error || 'Failed to restart'; sysResetMsg.className = 'text-sm ml-2 text-red-600'; } btnResetSystem.disabled = false; }
        }catch(err){ if (sysResetMsg){ sysResetMsg.textContent = 'Request failed'; sysResetMsg.className = 'text-sm ml-2 text-red-600'; } btnResetSystem.disabled = false; }
      });
    }
    const btnShutdownSystem = document.getElementById('btn-shutdown-system');
    const sysShutdownMsg = document.getElementById('sys-shutdown-msg');
    if (btnShutdownSystem){
      btnShutdownSystem.addEventListener('click', async ()=>{
        const ok = await (window.App && App.confirmDialog ? App.confirmDialog({
          title: 'Shutdown System',
          message: 'The server and all background workers will be stopped. Continue?',
          confirmText: 'Shutdown',
          cancelText: 'Cancel'
        }) : Promise.resolve(confirm('This will stop the server and all workers. Continue?')));
        if (!ok) return;
        btnShutdownSystem.disabled = true;
        if (sysShutdownMsg){ sysShutdownMsg.textContent = 'Shutting down...'; sysShutdownMsg.className = 'text-sm ml-2 text-gray-600'; }
        try{ const res = await fetch('/api/system/shutdown', { method:'POST' }); if (res.ok){ if (sysShutdownMsg){ sysShutdownMsg.textContent = 'Server is shutting down.'; sysShutdownMsg.className = 'text-sm ml-2 text-green-600'; } } else { const data = await res.json().catch(()=>({})); if (sysShutdownMsg){ sysShutdownMsg.textContent = data.error || 'Failed to shutdown'; sysShutdownMsg.className = 'text-sm ml-2 text-red-600'; } btnShutdownSystem.disabled = false; } }
        catch(err){ if (sysShutdownMsg){ sysShutdownMsg.textContent = 'Request failed'; sysShutdownMsg.className = 'text-sm text-red-600'; } btnShutdownSystem.disabled = false; }
      });
    }

    // Schedule System controls
    const schBanner = document.getElementById('schedule-banner');
    const schAuto = document.getElementById('sch-auto');
    const schWork = document.getElementById('sch-work');
    const schLunch = document.getElementById('sch-lunch');
    const schMsg = document.getElementById('sch-msg');
    const btnSchSave = document.getElementById('btn-sch-save');
    const btnSchResume = document.getElementById('btn-sch-resume');
    const btnSchPauseLunch = document.getElementById('btn-sch-pause-lunch');
    const btnSchPauseOff = document.getElementById('btn-sch-pause-offhours');
    const schPauseMin = document.getElementById('sch-pause-min');
    const btnSchPauseMin = document.getElementById('btn-sch-pause-min');
    const trackingState = { tracking_active:false, suppress_alerts:false, auto_schedule:true };

    async function loadTrackingState(){ try{ const res = await fetch('/api/schedule/state'); if (!res.ok) return; const st = await res.json(); trackingState.tracking_active = !!st.tracking_active; trackingState.suppress_alerts = !!st.suppress_alerts; trackingState.auto_schedule = !!st.auto_schedule; if (schAuto) schAuto.checked = trackingState.auto_schedule; if (schWork) schWork.value = st.work_hours || '08:30-17:30'; if (schLunch) schLunch.value = st.lunch_break || '12:00-13:00'; renderScheduleBanner(st); }catch(e){} }
    function renderScheduleBanner(st){ if (!schBanner) return; const active = !!st.tracking_active; const suppress = !!st.suppress_alerts; const auto = !!st.auto_schedule; let text = active ? 'Tracking: ACTIVE' : 'Tracking: INACTIVE'; if (suppress) text += ' • Alerts: SUPPRESSED'; text += auto ? ' • Mode: AUTO' : ' • Mode: MANUAL'; schBanner.textContent = text; schBanner.className = 'mb-3 p-3 rounded border text-sm ' + (active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-700'); }
    async function saveSchedule(){ if (!schAuto || !schWork || !schLunch) return; schMsg && (schMsg.textContent = ''); try{ const payload = { auto_schedule: schAuto.checked, work_hours: schWork.value.trim(), lunch_break: schLunch.value.trim(), clear_pause: true }; const res = await fetch('/api/schedule/mode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const data = await res.json().catch(()=>({})); if (res.ok){ schMsg && (schMsg.textContent = 'Saved'); schMsg && (schMsg.className='text-sm text-green-600'); renderScheduleBanner(data.state || {}); } else { schMsg && (schMsg.textContent = (data.error || 'Failed')); schMsg && (schMsg.className='text-sm text-red-600'); } }catch(e){ schMsg && (schMsg.textContent = 'Request failed'); schMsg && (schMsg.className='text-sm text-red-600'); } }
    async function resumeNow(){ if (!schAuto) return; schMsg && (schMsg.textContent = ''); try{ const isAuto = !!schAuto.checked; const payload = { auto_schedule: isAuto, clear_pause: true };
        // If manual mode, explicitly resume tracking and unsuppress alerts
        if (!isAuto){ payload.tracking_active = true; payload.suppress_alerts = false; }
        const res = await fetch('/api/schedule/mode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const data = await res.json().catch(()=>({})); if (res.ok){ schMsg && (schMsg.textContent = 'Resumed'); schMsg && (schMsg.className='text-sm text-green-600'); renderScheduleBanner(data.state || {}); } else { schMsg && (schMsg.textContent = (data.error || 'Failed')); schMsg && (schMsg.className='text-sm text-red-600'); } }catch(e){ schMsg && (schMsg.textContent = 'Request failed'); schMsg && (schMsg.className='text-sm text-red-600'); } }
    function nextWorkStartISO(){ const rng = (schWork && schWork.value ? schWork.value : '08:30-17:30').split('-')[0]; const [hh, mm] = rng.split(':').map(x=>parseInt(x,10)); const now = new Date(); let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh||8, mm||30, 0, 0); if (now >= target){ target.setDate(target.getDate()+1); } return target.toISOString().slice(0,19); }
    async function pauseLunch(){ schMsg && (schMsg.textContent = ''); try{ const res = await fetch('/api/schedule/pause', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ minutes: 60, kind: 'lunch' }) }); const data = await res.json().catch(()=>({})); if (res.ok){ schMsg && (schMsg.textContent = 'Paused for lunch'); schMsg && (schMsg.className='text-sm text-yellow-700'); renderScheduleBanner(data.state || {}); } else { schMsg && (schMsg.textContent = (data.error || 'Failed')); schMsg && (schMsg.className='text-sm text-red-600'); } }catch(e){ schMsg && (schMsg.textContent = 'Request failed'); schMsg && (schMsg.className='text-sm text-red-600'); } }
    async function pauseUntilNextWork(){ schMsg && (schMsg.textContent = ''); try{ const until = nextWorkStartISO(); const res = await fetch('/api/schedule/pause', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ until, kind: 'offhours' }) }); const data = await res.json().catch(()=>({})); if (res.ok){ schMsg && (schMsg.textContent = 'Paused until next work start'); schMsg && (schMsg.className='text-sm text-gray-700'); renderScheduleBanner(data.state || {}); } else { schMsg && (schMsg.textContent = (data.error || 'Failed')); schMsg && (schMsg.className='text-sm text-red-600'); } }catch(e){ schMsg && (schMsg.textContent = 'Request failed'); schMsg && (schMsg.className='text-sm text-red-600'); } }
    async function pauseByMinutes(){ schMsg && (schMsg.textContent = ''); const minutes = parseInt((schPauseMin && schPauseMin.value)||'0',10); if (!minutes || minutes < 1){ schMsg && (schMsg.textContent = 'Minutes required'); schMsg && (schMsg.className='text-sm text-red-600'); return; } try{ const res = await fetch('/api/schedule/pause', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ minutes }) }); const data = await res.json().catch(()=>({})); if (res.ok){ schMsg && (schMsg.textContent = `Paused for ${minutes} min`); schMsg && (schMsg.className='text-sm text-gray-700'); renderScheduleBanner(data.state || {}); } else { schMsg && (schMsg.textContent = (data.error || 'Failed')); schMsg && (schMsg.className='text-sm text-red-600'); } }catch(e){ schMsg && (schMsg.textContent = 'Request failed'); schMsg && (schMsg.className='text-sm text-red-600'); } }
    if (btnSchSave) btnSchSave.addEventListener('click', saveSchedule);
    if (btnSchResume) btnSchResume.addEventListener('click', resumeNow);
    if (btnSchPauseLunch) btnSchPauseLunch.addEventListener('click', pauseLunch);
    if (btnSchPauseOff) btnSchPauseOff.addEventListener('click', pauseUntilNextWork);
    if (btnSchPauseMin) btnSchPauseMin.addEventListener('click', pauseByMinutes);
    setInterval(loadTrackingState, 15000);

    // Manage Employee
    const empTable = document.getElementById('employee-table');
    const btnRefreshEmp = document.getElementById('btn-refresh-emp');
    const LSK_EMP_SORT = 'emp_sort_prefs_v1';
    function loadEmpSort(){ try{ const s = localStorage.getItem(LSK_EMP_SORT); if (!s) return { key: 'employee_code', dir: 'asc' }; const o = JSON.parse(s); if (!o || !o.key || !o.dir) return { key: 'employee_code', dir: 'asc' }; return { key: String(o.key), dir: (o.dir==='desc'?'desc':'asc') }; }catch(_){ return { key: 'employee_code', dir: 'asc' }; } }
    function saveEmpSort(sort){ try{ localStorage.setItem(LSK_EMP_SORT, JSON.stringify(sort||{})); }catch(_){}
    }
    let _empRows = []; let _empSort = loadEmpSort();
    if (btnRefreshEmp) btnRefreshEmp.addEventListener('click', ()=>{ log('Refresh employees clicked'); loadEmployees(); });

    function attachEmpSorting(){
      if (!empTable) return;
      const tableEl = empTable.closest('table');
      if (!tableEl) return;
      const headers = tableEl.querySelectorAll('thead th[data-sort-key]');
      headers.forEach(th=>{
        th.style.cursor = 'pointer';
        th.addEventListener('click', ()=>{
          const key = th.getAttribute('data-sort-key');
          if (!key) return;
          if (_empSort.key === key){ _empSort.dir = (_empSort.dir === 'asc') ? 'desc' : 'asc'; }
          else { _empSort.key = key; _empSort.dir = 'asc'; }
          saveEmpSort(_empSort);
          renderEmployees();
        });
      });
    }

    function renderEmployees(){
      if (!empTable) return;
      if (!Array.isArray(_empRows) || _empRows.length === 0){ empTable.innerHTML = '<tr><td class="px-3 py-2 text-gray-500" colspan="8">No employees</td></tr>'; return; }
      const rows = (window.App && App.sortRows) ? App.sortRows(_empRows, _empSort.key, _empSort.dir) : _empRows.slice();
      empTable.innerHTML = '';
      rows.forEach(e=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-3 py-2">${e.id}</td>
          <td class="px-3 py-2">${e.employee_code||''}</td>
          <td class="px-3 py-2">${e.name||''}</td>
          <td class="px-3 py-2">${e.department||''}</td>
          <td class="px-3 py-2">${e.position||''}</td>
          <td class="px-3 py-2">${e.phone_number||''}</td>
          <td class="px-3 py-2">${e.is_active? 'Yes':'No'}</td>
          <td class="px-3 py-2">
            <button class="text-blue-600 mr-2 underline" data-act="edit" data-id="${e.id}">Edit</button>
            <button class="text-red-600 underline" data-act="del" data-id="${e.id}">Delete</button>
          </td>`;
        empTable.appendChild(tr);
      });
      const tableEl = empTable.closest('table');
      if (window.App && App.updateSortIndicators && tableEl){ App.updateSortIndicators(tableEl, _empSort); }
    }

    async function loadEmployees(){
      if (!empTable) return;
      log('Loading employees...');
      empTable.innerHTML = '<tr><td class="px-3 py-2" colspan="8">Loading...</td></tr>';
      try{
        const res = await fetch('/api/employees');
        const rows = await res.json();
        _empRows = Array.isArray(rows) ? rows : [];
        log('Employees loaded:', _empRows.length);
        attachEmpSorting();
        renderEmployees();
      }catch(err){ console.error(err); empTable.innerHTML = '<tr><td class="px-3 py-2 text-danger" colspan="8">Failed to load</td></tr>'; }
    }

    if (empTable){ empTable.addEventListener('click', async (ev)=>{ const t = ev.target; if (!(t instanceof Element)) return; const id = t.getAttribute('data-id'); const act = t.getAttribute('data-act'); if (!id || !act) return; if (act === 'del'){ const row = t.closest('tr'); const code = row?.children?.[1]?.textContent?.trim() || ''; const name = row?.children?.[2]?.textContent?.trim() || ''; const title = name ? `${name} (ID ${id})` : `ID ${id}`; const ok = await (window.App && App.confirmDialog ? App.confirmDialog({ title: 'Delete Employee', message: `You are about to delete ${title}. This will also remove face templates and attendance records.`, confirmText: 'Delete', cancelText: 'Cancel', requireText: 'Type employee code to confirm', expectedText: code }) : Promise.resolve(confirm(`Delete ${title}?`))); if (!ok) return; try{ const resp = await fetch(`/api/employees/${id}`, { method:'DELETE' }); if (!resp.ok){ const err = await resp.json().catch(()=>({error:'Delete failed'})); alert(err.error || 'Delete failed'); return; } loadEmployees(); }catch(e){ console.error(e); alert('Delete error'); } } else if (act === 'edit'){ const row = t.closest('tr'); if (!row) return; const data = { id: Number(id), employee_code: row.children[1]?.textContent || '', name: row.children[2]?.textContent || '', department: row.children[3]?.textContent || '', position: row.children[4]?.textContent || '', phone_number: row.children[5]?.textContent || '', is_active: (row.children[6]?.textContent || '') === 'Yes', }; openEdit(data); } }); }

    // Edit modal handlers
    const editModal = document.getElementById('edit-employee-modal');

    const closeEditBtn = document.getElementById('close-edit-employee');
    const saveEditBtn = document.getElementById('save-edit-employee');
    const fId = document.getElementById('edit-id');
    const fCode = document.getElementById('edit-code');
    const fName = document.getElementById('edit-name');
    const fDept = document.getElementById('edit-dept');
    const fPos = document.getElementById('edit-pos');
    const fPhone = document.getElementById('edit-phone');
    const fActive = document.getElementById('edit-active');
    const editFaceList = document.getElementById('edit-face-templates');

    async function loadFaceTemplates(empId){ if (!editFaceList) return; editFaceList.innerHTML = '<div class="text-sm text-gray-500">Loading...</div>'; try{ const res = await fetch(`/api/employees/${empId}/face_templates`); if (!res.ok){ editFaceList.innerHTML = '<div class="text-sm text-danger">Failed to load</div>'; return; } const items = await res.json(); if (!Array.isArray(items) || items.length===0){ editFaceList.innerHTML = '<div class="text-sm text-gray-500">No templates</div>'; return; } function parseFloat32FromB64(b64){ try{ const binary = atob(b64); const len = binary.length; const bytes = new Uint8Array(len); for (let i=0; i<len; i++) bytes[i] = binary.charCodeAt(i); const f32 = new Float32Array(bytes.buffer); return Array.from(f32); }catch(_){ return null; } } editFaceList.innerHTML = ''; items.forEach(t=>{ const card = document.createElement('div'); card.className = 'border rounded p-2 bg-white flex items-start gap-2'; let left = ''; if (t.image_url){ left = `<img src="${t.image_url}" alt="face" class="w-16 h-16 object-cover rounded border"/>`; } else { const dims = parseFloat32FromB64(t.embedding_b64); const dimText = (dims && dims.length) ? `${dims.length}D` : 'unknown'; left = `<div class="w-16 h-16 rounded bg-gray-100 border flex items-center justify-center text-[10px] text-gray-500">${dimText}</div>`; } const created = t.created_at || ''; const embedPreview = (!t.image_url ? (function(){ const dims = parseFloat32FromB64(t.embedding_b64); const firsts = (dims && dims.length) ? dims.slice(0,8).map(v=>v.toFixed(3)).join(', ') : 'n/a'; return `<div class="text-xs mt-1"><span class="text-gray-500">[0..7]:</span> ${firsts}</div>`; })() : ''); card.innerHTML = `
          ${left}
          <div>
            <div class="text-sm"><span class="font-medium">Template #${t.id}</span></div>
            <div class="text-xs text-gray-500">${created}</div>
            <div class="text-xs">Pose: <span class="font-medium">${t.pose_label||'-'}</span> · Quality: <span class="font-medium">${t.quality_score!=null? t.quality_score.toFixed(2) : '-'}</span></div>
            ${embedPreview}
          </div>`; editFaceList.appendChild(card); }); }catch(err){ console.error(err); editFaceList.innerHTML = '<div class="text-sm text-danger">Error</div>'; } }
    function forceShow(el){ if (!el) return; el.classList.remove('hidden'); el.style.display = 'flex'; el.style.visibility = 'visible'; el.style.opacity = '1'; el.style.position = 'fixed'; el.style.inset = '0'; el.style.zIndex = '1000'; }
    function forceHide(el){ if (!el) return; el.classList.add('hidden'); el.style.display = 'none'; }
    function openEdit(emp){
      if (!editModal){ log('Edit modal element not found'); return; }
      log('Opening Edit modal for', emp);
      try{ if (editModal.parentElement !== document.body){ document.body.appendChild(editModal); log('Reparented edit modal to <body>'); } }catch(_){ }
      fId.value = emp.id; fCode.value = emp.employee_code||''; fName.value = emp.name||''; fDept.value = emp.department||''; fPos.value = emp.position||''; fPhone.value = emp.phone_number||''; fActive.checked = !!emp.is_active;
      forceShow(editModal);
      try{ const cs = getComputedStyle(editModal); const r = editModal.getBoundingClientRect(); log('Edit modal styles:', { display: cs.display, position: cs.position, zIndex: cs.zIndex, visibility: cs.visibility, opacity: cs.opacity, rect: { x:r.x, y:r.y, w:r.width, h:r.height } }); }catch(_){ }
      showToast(`Edit: ${emp.name||emp.employee_code||emp.id}`,'info',1200);
      if (emp && emp.id){ loadFaceTemplates(emp.id); }
    }
    function closeEdit(){ if (!editModal) return; log('Closing Edit modal'); forceHide(editModal); }

    // Backdrop click-to-close and ESC key
    if (editModal){ editModal.addEventListener('click', (e)=>{ if (e.target === editModal) closeEdit(); }); }

    if (closeEditBtn) closeEditBtn.addEventListener('click', closeEdit);
    if (saveEditBtn){ saveEditBtn.addEventListener('click', async ()=>{ const id = Number(fId.value); const payload = { employee_code: fCode.value.trim(), name: fName.value.trim(), department: fDept.value.trim()||null, position: fPos.value.trim()||null, phone_number: fPhone.value.trim()||null, is_active: !!fActive.checked }; await fetch(`/api/employees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); closeEdit(); loadEmployees(); }); }

    // Edit: Face capture elements
    const editFaceStatus = document.getElementById('edit-face-status');
    const editVideo = document.getElementById('edit-video');
    const editCanvas = document.getElementById('edit-canvas');
    const btnEditStartCam = document.getElementById('btn-edit-startcam');
    const btnEditCapture = document.getElementById('btn-edit-capture');
    const btnEditRetake = document.getElementById('btn-edit-retake');
    const editSnapshot = document.getElementById('edit-snapshot');
    const btnEditUseCam = document.getElementById('btn-edit-usecam');
    const btnEditUseFile = document.getElementById('btn-edit-usefile');
    const paneEditCam = document.getElementById('pane-edit-camera');
    const paneEditFile = document.getElementById('pane-edit-file');
    const editFileInput = document.getElementById('edit-file');
    const btnEditApplyFile = document.getElementById('btn-edit-applyfile');
    const editFilePreview = document.getElementById('edit-file-preview');
    const btnEditRegister = document.getElementById('btn-edit-register-faces');
    const btnEditClear = document.getElementById('btn-edit-clear-templates');
    let editStream = null; let editFileDataUrl = null;

    function setEditMode(mode){ if (mode === 'cam'){ if (paneEditCam) paneEditCam.classList.remove('hidden'); if (paneEditFile) paneEditFile.classList.add('hidden'); if (btnEditUseCam) btnEditUseCam.classList.add('bg-white'); if (btnEditUseFile) btnEditUseFile.classList.remove('bg-white'); editFaceStatus && (editFaceStatus.textContent = 'Camera mode'); } else { if (paneEditFile) paneEditFile.classList.remove('hidden'); if (paneEditCam) paneEditCam.classList.add('hidden'); if (btnEditUseFile) btnEditUseFile.classList.add('bg-white'); if (btnEditUseCam) btnEditUseCam.classList.remove('bg-white'); editFaceStatus && (editFaceStatus.textContent = 'JPG mode'); stopEditCam(); } }
    async function startEditCam(){ try{ if (editStream){ return; } editStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }); if (editVideo) editVideo.srcObject = editStream; editFaceStatus && (editFaceStatus.textContent = 'Camera ready'); }catch(e){ console.error(e); editFaceStatus && (editFaceStatus.textContent = 'Camera error'); alert('Cannot access camera'); } }
    function stopEditCam(){ try{ if (editStream){ editStream.getTracks().forEach(t=>t.stop()); } }catch(_){ } editStream = null; if (editVideo) editVideo.srcObject = null; }
    function resetEditFace(){ editSnapshot && editSnapshot.classList.add('hidden'); btnEditRetake && btnEditRetake.classList.add('hidden'); if (editFaceStatus) editFaceStatus.textContent = ''; const btns = Array.from(document.querySelectorAll('.pose-btn-edit')); btns.forEach(b=>b.classList.remove('bg-primary','text-white')); const first = btns.find(b=>b.getAttribute('data-pose')==='front'); if (first){ first.classList.add('bg-primary','text-white'); } const poseActive = document.getElementById('pose-active-edit'); if (poseActive) poseActive.textContent = 'front'; ['thumb-front-edit','thumb-left-edit','thumb-right-edit'].forEach(id=>{ const t = document.getElementById(id); if (t){ t.classList.add('hidden'); t.removeAttribute('src'); } }); ['q-front-edit','q-left-edit','q-right-edit'].forEach(id=>{ const q = document.getElementById(id); if (q) q.textContent=''; }); editFileDataUrl = null; if (editFilePreview){ editFilePreview.classList.add('hidden'); editFilePreview.removeAttribute('src'); } }
    function getCurrentEditPose(){ return (document.querySelector('.pose-btn-edit.bg-primary')?.getAttribute('data-pose')) || 'front'; }
    function captureEditFrame(){ if (!editVideo || !editVideo.videoWidth){ alert('Camera not ready'); return; } editCanvas.width = editVideo.videoWidth; editCanvas.height = editVideo.videoHeight; const ctx = editCanvas.getContext('2d'); ctx.drawImage(editVideo, 0, 0); const dataUrl = editCanvas.toDataURL('image/jpeg'); editSnapshot.src = dataUrl; editSnapshot.classList.remove('hidden'); btnEditRetake.classList.remove('hidden'); const pose = getCurrentEditPose(); const map = { front: document.getElementById('thumb-front-edit'), left: document.getElementById('thumb-left-edit'), right: document.getElementById('thumb-right-edit') }; const th = map[pose]; if (th){ th.src = dataUrl; th.classList.remove('hidden'); } editFaceStatus && (editFaceStatus.textContent = `Captured pose: ${pose}`); }
    function applyEditFileToPose(){ if (!editFileDataUrl){ alert('Please select an image first'); return; } const pose = getCurrentEditPose(); const map = { front: document.getElementById('thumb-front-edit'), left: document.getElementById('thumb-left-edit'), right: document.getElementById('thumb-right-edit') }; const th = map[pose]; if (th){ th.src = editFileDataUrl; th.classList.remove('hidden'); } editSnapshot.src = editFileDataUrl; editSnapshot.classList.remove('hidden'); btnEditRetake.classList.remove('hidden'); editFaceStatus && (editFaceStatus.textContent = `Selected JPG for pose: ${pose}`); }
    function attachPoseButtonsEdit(){ const btns = Array.from(document.querySelectorAll('.pose-btn-edit')); if (!btns.length) return; btns.forEach(btn=>{ btn.addEventListener('click', ()=>{ btns.forEach(b=>b.classList.remove('bg-primary','text-white')); btn.classList.add('bg-primary','text-white'); const poseActive = document.getElementById('pose-active-edit'); if (poseActive) poseActive.textContent = btn.getAttribute('data-pose') || 'front'; }); }); const first = btns.find(b=>b.getAttribute('data-pose')==='front'); if (first){ first.classList.add('bg-primary','text-white'); const poseActive = document.getElementById('pose-active-edit'); if (poseActive) poseActive.textContent = 'front'; } }

    // Wire edit face capture events
    if (btnEditUseCam) btnEditUseCam.addEventListener('click', ()=> setEditMode('cam'));
    if (btnEditUseFile) btnEditUseFile.addEventListener('click', ()=> setEditMode('file'));
    if (btnEditStartCam) btnEditStartCam.addEventListener('click', startEditCam);
    if (btnEditCapture) btnEditCapture.addEventListener('click', captureEditFrame);
    if (btnEditRetake) btnEditRetake.addEventListener('click', ()=>{ resetEditFace(); startEditCam(); });
    if (editFileInput){ editFileInput.addEventListener('change', (e)=>{ const f = e.target.files && e.target.files[0]; if (!f){ editFileDataUrl = null; if (editFilePreview){ editFilePreview.classList.add('hidden'); } return; } const reader = new FileReader(); reader.onload = ()=>{ editFileDataUrl = String(reader.result || ''); if (editFilePreview){ editFilePreview.src = editFileDataUrl; editFilePreview.classList.remove('hidden'); } }; reader.readAsDataURL(f); }); }
    if (btnEditApplyFile) btnEditApplyFile.addEventListener('click', applyEditFileToPose);

    // Register and clear templates
    async function registerEditFaces(){ const empId = Number(fId.value); if (!empId){ alert('Invalid employee'); return; } const entries = Object.entries({ front: document.getElementById('thumb-front-edit'), left: document.getElementById('thumb-left-edit'), right: document.getElementById('thumb-right-edit') }).filter(([pose, img])=> img && img.src); if (!entries.length){ alert('No captured/selected images'); return; } try{ for (const [pose, img] of entries){ const r = await fetch(`/api/employees/${empId}/face_templates`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ image: img.src, pose_label: pose }) }); const jr = await r.json().catch(()=>({})); if (!r.ok){ console.warn('Edit register failed', jr); alert(`Register ${pose} failed: ${jr.error||r.status}`); } } editFaceStatus && (editFaceStatus.textContent = 'Registration completed'); resetEditFace(); loadFaceTemplates(empId); }catch(e){ console.error(e); alert('Error registering faces'); } }
    async function clearEditTemplates(){ const empId = Number(fId.value); if (!empId){ alert('Invalid employee'); return; } if (!confirm('Clear all face templates for this employee?')) return; try{ const r = await fetch(`/api/employees/${empId}/face_templates`, { method:'DELETE' }); const jr = await r.json().catch(()=>({})); if (!r.ok || !jr.ok){ alert(jr.error || 'Failed to clear'); return; } editFaceStatus && (editFaceStatus.textContent = 'Templates cleared'); resetEditFace(); loadFaceTemplates(empId); }catch(e){ console.error(e); alert('Error clearing templates'); } }
    if (btnEditRegister) btnEditRegister.addEventListener('click', registerEditFaces);
    if (btnEditClear) btnEditClear.addEventListener('click', clearEditTemplates);

    // Enhance open/close to manage edit capture lifecycle
    const _openEditOrig = openEdit;
    openEdit = function(emp){ _openEditOrig(emp); setEditMode('cam'); resetEditFace(); attachPoseButtonsEdit(); };
    const _closeEditOrig = closeEdit;
    closeEdit = function(){ _closeEditOrig(); stopEditCam(); };

    // Add employee modal + face capture
    const addModal = document.getElementById('add-employee-modal');

    const btnAddEmp = document.getElementById('btn-add-emp');
    const closeAddEmp = document.getElementById('close-add-employee');
    const saveAddEmp = document.getElementById('save-add-employee');
    const aCode = document.getElementById('add-code');
    const aName = document.getElementById('add-name');
    const aDept = document.getElementById('add-dept');
    const aPos = document.getElementById('add-pos');
    const aPhone = document.getElementById('add-phone');
    const aActive = document.getElementById('add-active');
    const addVideo = document.getElementById('add-video');
    const addCanvas = document.getElementById('add-canvas');
    const addStartCam = document.getElementById('btn-add-startcam');
    const addCapture = document.getElementById('btn-add-capture');
    const addRetake = document.getElementById('btn-add-retake');
    const addSnapshot = document.getElementById('add-snapshot');
    const addFaceStatus = document.getElementById('add-face-status');
    const btnAddUseCam = document.getElementById('btn-add-usecam');
    const btnAddUseFile = document.getElementById('btn-add-usefile');
    const paneAddCam = document.getElementById('pane-add-camera');
    const paneAddFile = document.getElementById('pane-add-file');
    const addFileInput = document.getElementById('add-file');
    const btnAddApplyFile = document.getElementById('btn-add-applyfile');
    const addFilePreview = document.getElementById('add-file-preview');
    let addStream = null; let addFileDataUrl = null; let addCreatedEmployeeId = null;

    async function startAddCam(){ try{ if (addStream){ return; } addStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }); addVideo.srcObject = addStream; addFaceStatus && (addFaceStatus.textContent = 'Camera ready'); }catch(e){ console.error(e); addFaceStatus && (addFaceStatus.textContent = 'Camera error'); alert('Cannot access camera'); } }
    function stopAddCam(){ try{ if (addStream){ addStream.getTracks().forEach(t=>t.stop()); } }catch(_){ } addStream = null; if (addVideo) addVideo.srcObject = null; }
    function setAddMode(mode){ if (mode === 'cam'){ if (paneAddCam) paneAddCam.classList.remove('hidden'); if (paneAddFile) paneAddFile.classList.add('hidden'); if (btnAddUseCam) btnAddUseCam.classList.add('bg-white'); if (btnAddUseFile) btnAddUseFile.classList.remove('bg-white'); if (addFaceStatus) addFaceStatus.textContent = 'Camera mode'; } else { if (paneAddFile) paneAddFile.classList.remove('hidden'); if (paneAddCam) paneAddCam.classList.add('hidden'); if (btnAddUseFile) btnAddUseFile.classList.add('bg-white'); if (btnAddUseCam) btnAddUseCam.classList.remove('bg-white'); if (addFaceStatus) addFaceStatus.textContent = 'JPG mode'; stopAddCam(); } }
    function captureAddFrame(){ if (!addVideo || !addVideo.videoWidth){ alert('Camera not ready'); return; } addCanvas.width = addVideo.videoWidth; addCanvas.height = addVideo.videoHeight; const ctx = addCanvas.getContext('2d'); ctx.drawImage(addVideo, 0, 0); const dataUrl = addCanvas.toDataURL('image/jpeg'); const currentPose = (document.querySelector('.pose-btn.bg-primary')?.getAttribute('data-pose')) || 'front'; addSnapshot.src = dataUrl; addSnapshot.classList.remove('hidden'); addRetake.classList.remove('hidden'); const thumbMap = { front: document.getElementById('thumb-front'), left: document.getElementById('thumb-left'), right: document.getElementById('thumb-right') }; const th = thumbMap[currentPose]; if (th){ th.src = dataUrl; th.classList.remove('hidden'); } if (addFaceStatus) addFaceStatus.textContent = `Captured pose: ${currentPose}`; }
    function applyFileToPose(){ if (!addFileDataUrl){ alert('Please select an image first'); return; } const currentPose = (document.querySelector('.pose-btn.bg-primary')?.getAttribute('data-pose')) || 'front'; addSnapshot.src = addFileDataUrl; addSnapshot.classList.remove('hidden'); addRetake.classList.remove('hidden'); const thumbMap = { front: document.getElementById('thumb-front'), left: document.getElementById('thumb-left'), right: document.getElementById('thumb-right') }; const th = thumbMap[currentPose]; if (th){ th.src = addFileDataUrl; th.classList.remove('hidden'); } if (addFaceStatus) addFaceStatus.textContent = `Selected JPG for pose: ${currentPose}`; }
    function resetAddFace(){ addSnapshot.classList.add('hidden'); addRetake.classList.add('hidden'); if (addFaceStatus) addFaceStatus.textContent = ''; const poseButtons = Array.from(document.querySelectorAll('.pose-btn')); poseButtons.forEach(b=>b.classList.remove('bg-primary','text-white')); const first = poseButtons.find(b=>b.getAttribute('data-pose')==='front'); if (first){ first.classList.add('bg-primary','text-white'); } const poseActive = document.getElementById('pose-active'); if (poseActive) poseActive.textContent = 'front'; ['thumb-front','thumb-left','thumb-right'].forEach(id=>{ const t = document.getElementById(id); if (t){ t.classList.add('hidden'); t.removeAttribute('src'); } }); ['q-front','q-left','q-right'].forEach(id=>{ const q = document.getElementById(id); if (q) q.textContent=''; }); }
    function openAdd(){ if (!addModal){ log('Add modal element not found'); return; } log('Opening Add modal'); try{ if (addModal.parentElement !== document.body){ document.body.appendChild(addModal); log('Reparented add modal to <body>'); } }catch(_){ } forceShow(addModal); try{ const cs = getComputedStyle(addModal); const r = addModal.getBoundingClientRect(); log('Add modal styles:', { display: cs.display, position: cs.position, zIndex: cs.zIndex, visibility: cs.visibility, opacity: cs.opacity, rect: { x:r.x, y:r.y, w:r.width, h:r.height } }); }catch(_){ } showToast('Add Employee','info',1000); resetAddFace(); stopAddCam(); addCreatedEmployeeId = null; addFileDataUrl = null; if (addFilePreview){ addFilePreview.classList.add('hidden'); addFilePreview.removeAttribute('src'); } setAddMode('cam'); }
    function closeAdd(){ if (!addModal) return; log('Closing Add modal'); forceHide(addModal); stopAddCam(); addCreatedEmployeeId = null; }
    if (btnAddEmp) btnAddEmp.addEventListener('click', openAdd);
    if (closeAddEmp) closeAddEmp.addEventListener('click', closeAdd);
    if (addStartCam) addStartCam.addEventListener('click', startAddCam);
    if (addCapture) addCapture.addEventListener('click', captureAddFrame);
    if (addRetake) addRetake.addEventListener('click', ()=>{ resetAddFace(); startAddCam(); });
    if (btnAddUseCam) btnAddUseCam.addEventListener('click', ()=>{ log('Add: switch to camera mode'); setAddMode('cam'); });
    if (btnAddUseFile) btnAddUseFile.addEventListener('click', ()=>{ log('Add: switch to JPG mode'); setAddMode('file'); });

    if (addFileInput){ addFileInput.addEventListener('change', (e)=>{ const f = e.target.files && e.target.files[0]; if (!f){ addFileDataUrl = null; if(addFilePreview){ addFilePreview.classList.add('hidden'); } return; } const reader = new FileReader(); reader.onload = ()=>{ addFileDataUrl = String(reader.result || ''); if (addFilePreview){ addFilePreview.src = addFileDataUrl; addFilePreview.classList.remove('hidden'); } }; reader.readAsDataURL(f); }); }
    if (btnAddApplyFile) btnAddApplyFile.addEventListener('click', applyFileToPose);
    if (addModal){ addModal.addEventListener('click', (e)=>{ if (e.target === addModal) closeAdd(); }); }

    // Global ESC handler to close any open modal
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape'){ if (editModal && editModal.style.display === 'flex') closeEdit(); if (addModal && addModal.style.display === 'flex') closeAdd(); } });
    const poseButtons = Array.from(document.querySelectorAll('.pose-btn'));
    if (poseButtons && poseButtons.length){ poseButtons.forEach(btn=>{ btn.addEventListener('click', ()=>{ poseButtons.forEach(b=>b.classList.remove('bg-primary','text-white')); btn.classList.add('bg-primary','text-white'); const poseActive = document.getElementById('pose-active'); if (poseActive) poseActive.textContent = btn.getAttribute('data-pose') || 'front'; }); }); }
    if (saveAddEmp){ saveAddEmp.addEventListener('click', async ()=>{ saveAddEmp.disabled = true; const originalText = saveAddEmp.textContent; saveAddEmp.textContent = 'Saving...'; try{ if (!addCreatedEmployeeId){ const payload = { employee_code: aCode.value.trim(), name: aName.value.trim(), department: aDept.value.trim()||null, position: aPos.value.trim()||null, phone_number: aPhone.value.trim()||null, is_active: (aActive ? !!aActive.checked : true) }; if (!payload.employee_code || !payload.name){ alert('Employee code and name are required'); return; } const res = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!res.ok){ const err = await res.json().catch(()=>({error:'Failed'})); alert(err.error || 'Failed to create'); return; } const created = await res.json(); addCreatedEmployeeId = created && created.id; if (addFaceStatus) addFaceStatus.textContent = 'Employee created. You can capture/retake and click Register to upload face.'; }
      if (addCreatedEmployeeId){ const entries = Object.entries({ front: document.getElementById('thumb-front'), left: document.getElementById('thumb-left'), right: document.getElementById('thumb-right') }).filter(([pose, data])=>!!data.src); if (entries.length){ for (const [pose, data] of entries){ try{ const r2 = await fetch(`/api/employees/${addCreatedEmployeeId}/face_templates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: data.src, pose_label: pose }) }); const jr = await r2.json().catch(()=>({})); if (!r2.ok){ console.warn('Face registration failed:', jr); if (addFaceStatus) addFaceStatus.textContent = `Face(${pose}) not registered: ${jr.error||'Unknown'}`; alert(`Face(${pose}) not registered: ${jr.error||''}`); continue; } const qval = (jr && typeof jr.quality_score === 'number') ? jr.quality_score : null; const qElMap = { front: document.getElementById('q-front'), left: document.getElementById('q-left'), right: document.getElementById('q-right') }; const qEl = qElMap[pose]; if (qEl){ qEl.textContent = `Quality: ${qval!=null? qval.toFixed(2) : '-'}`; } }catch(err){ console.error(err); if (addFaceStatus) addFaceStatus.textContent = `Face(${pose}) upload failed`; alert(`Face(${pose}) upload failed`); } } if (addFaceStatus) addFaceStatus.textContent = 'Registration completed'; closeAdd(); loadEmployees(); return; } } }
      finally { saveAddEmp.disabled = false; saveAddEmp.textContent = originalText; } }); }
  
    // Manage Cameras
    const camList = document.getElementById('camera-status-list');
    const btnRefreshCam = document.getElementById('btn-refresh-cam');
    if (btnRefreshCam) btnRefreshCam.addEventListener('click', loadCameraStatus);
    function loadCameraStatus(){ if (!camList) return; camList.innerHTML = '<div class="text-sm text-gray-500">Loading...</div>'; if (socket) socket.emit('get_camera_statuses'); }
    async function renderCameraCards(items){
      if (!camList) return;
      // Merge area info from /api/cameras
      let areaById = {};
      try{
        const res = await fetch('/api/cameras');
        const cams = await res.json();
        (Array.isArray(cams) ? cams : []).forEach(c=>{ if (c && c.id != null){ areaById[c.id] = c.area || ''; } });
      }catch(e){ /* ignore; area will be blank */ }
      if (!Array.isArray(items) || items.length === 0){ camList.innerHTML = '<div class="text-sm text-gray-500">No cameras</div>'; return; }
      camList.innerHTML = '';
      items.forEach(c=>{
        const card = document.createElement('div');
        card.className = 'border rounded p-3 flex items-center justify-between';
        const name = c.name || ('CAM '+c.cam_id) || ('CAM '+c.id);
        const area = (c.area != null ? c.area : areaById[(c.cam_id != null) ? c.cam_id : c.id]) || '';
        const id = (c.cam_id != null) ? c.cam_id : c.id;
        const aiRunning = !!c.ai_running;
        const streamEnabled = (c.stream_enabled !== undefined) ? !!c.stream_enabled : true;
        card.innerHTML = `
        <div>
          <div class="font-semibold text-primary">${area}</div>
          <div class="text-xs text-gray-600">${name}</div>
          <div class="text-xs text-gray-500">ID: ${id}</div>
        </div>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <span class="inline-block w-2.5 h-2.5 rounded-full ${aiRunning ? 'bg-green-500' : 'bg-red-500'}" data-dot-ai="${id}"></span>
            <span class="text-xs" data-status-ai="${id}">${aiRunning ? 'AI: ON' : 'AI: OFF'}</span>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-xs">Stream</span>
              <label class="switch">
                <input type="checkbox" data-toggle-stream="${id}" ${streamEnabled ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs">AI</span>
              <label class="switch">
                <input type="checkbox" data-toggle-ai="${id}" ${aiRunning ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>`;
        camList.appendChild(card);
      });
      // Wire events
      function updateKnob(_chk){ /* no-op: handled by CSS (.switch .slider) */ }
      camList.querySelectorAll('input[data-toggle-stream]').forEach(chk=>{
        // initial
        updateKnob(chk);
        chk.addEventListener('change', (e)=>{
          const el = e.target; const camId = Number(el.getAttribute('data-toggle-stream')); const enable = !!el.checked;
          updateKnob(el);
          el.disabled = true; if (socket) socket.emit('toggle_stream', { cam_id: camId, enable }); setTimeout(()=>{ el.disabled = false; }, 500);
        });
      });
      camList.querySelectorAll('input[data-toggle-ai]').forEach(chk=>{
        // initial
        updateKnob(chk);
        chk.addEventListener('change', (e)=>{
          const el = e.target; const camId = Number(el.getAttribute('data-toggle-ai')); const enable = !!el.checked;
          updateKnob(el);
          el.disabled = true; if (socket) socket.emit('toggle_ai', { cam_id: camId, enable }); setTimeout(()=>{ el.disabled = false; }, 500);
        });
      });
    }
    if (socket){
      socket.on('camera_statuses', ({items})=>{ renderCameraCards(items||[]); });
      socket.on('camera_status', (payload)=>{
        if (!camList || !payload) return;
        const camId = payload.cam_id;
        if (payload.ai_running != null){
          const dot = camList.querySelector(`[data-dot-ai="${camId}"]`);
          const txt = camList.querySelector(`[data-status-ai="${camId}"]`);
          if (dot){ dot.classList.remove('bg-green-500','bg-red-500'); dot.classList.add(payload.ai_running ? 'bg-green-500' : 'bg-red-500'); }
          if (txt){ txt.textContent = payload.ai_running ? 'AI: ON' : 'AI: OFF'; }
          const chkAI = camList.querySelector(`input[data-toggle-ai="${camId}"]`);
          if (chkAI){ chkAI.checked = !!payload.ai_running; chkAI.disabled = false; }
        }
        if (payload.stream_enabled != null){
          const chkStream = camList.querySelector(`input[data-toggle-stream="${camId}"]`);
          if (chkStream){ chkStream.checked = !!payload.stream_enabled; chkStream.disabled = false; }
        }
      });
    }
  
    // Add Camera form
    const camAddName = document.getElementById('cam-add-name');
    const camAddUrl = document.getElementById('cam-add-url');
    const camAddId = document.getElementById('cam-add-id');
    const camAddArea = document.getElementById('cam-add-area');
    const camAddMsg = document.getElementById('cam-add-msg');
    const btnAddCamera = document.getElementById('btn-add-camera');
    if (btnAddCamera){ btnAddCamera.addEventListener('click', async ()=>{ if (!camAddName || !camAddUrl) return; const name = camAddName.value.trim(); const rtsp_url = camAddUrl.value.trim(); const idVal = camAddId && camAddId.value ? Number(camAddId.value) : null; const area = camAddArea ? camAddArea.value.trim() : ''; camAddMsg.textContent = ''; if (!name || !rtsp_url){ camAddMsg.className = 'text-sm text-red-600'; camAddMsg.textContent = 'Name and RTSP/Source are required'; return; } btnAddCamera.disabled = true; const original = btnAddCamera.textContent; btnAddCamera.textContent = 'Adding...'; try{ const res = await fetch('/api/cameras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, rtsp_url, id: idVal, area }) }); const data = await res.json().catch(() => ({})); if (!res.ok){ const msg = data && data.error ? data.error : `HTTP ${res.status}`; camAddMsg.className = 'text-sm text-red-600'; camAddMsg.textContent = msg; return; } camAddMsg.className = 'text-sm text-green-600'; camAddMsg.textContent = 'Camera added'; camAddName.value = ''; camAddUrl.value = ''; if (camAddArea) camAddArea.value = ''; if (camAddId) camAddId.value = ''; loadCameraStatus(); if (App.loadCameras) App.loadCameras(); } catch (e) { console.error(e); camAddMsg.className = 'text-sm text-red-600'; camAddMsg.textContent = 'Failed to add camera'; } finally { btnAddCamera.disabled = false; btnAddCamera.textContent = original; } }); }
  })();
  