// Notifications center: history, badge, dropdown, and sounds
(function(){
  const elNotifBadge = document.getElementById('notification-badge');
  const elNotifBtn = document.getElementById('notification-btn');
  const elNotifDropdown = document.getElementById('notification-dropdown');
  const elNotifList = document.getElementById('notification-list');
  const btnClearNotifs = document.getElementById('btn-clear-notifs');
  if (!elNotifList) return; // not on this page

  let notifOpen = false;
  let _lastSoundTs = 0;
  function playNotifSound(){
    try{
      const now = Date.now();
      if (now - _lastSoundTs < 1500) return; // throttle 1.5s
      _lastSoundTs = now;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch(e) { /* ignore */ }
  }

  const App = window.App || (window.App = {});
  const NotificationCenter = (function(){
    const state = { history: [], unread: 0, lastKeys: new Map(), recentMsgs: new Set(), shownCount: 10 };
    const STORAGE_KEY = 'notif_history_v1';
    const STORAGE_LAST_KEYS = 'notif_last_keys_v1';
    function loadHistory(){
      try{
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw){ const arr = JSON.parse(raw); if (Array.isArray(arr)) state.history = arr.filter(x=>x && x.msg); }
        // Seed recent messages from top N history to avoid immediate duplicates on startup
        const N = Math.min(30, state.history.length);
        for (let i=0;i<N;i++){ const m = state.history[i] && state.history[i].msg; if (m) state.recentMsgs.add(m); }
      } catch(e){}
    }
    function saveHistory(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(0,100))); } catch(e){} }
    function loadLastKeys(){
      try{
        const raw = localStorage.getItem(STORAGE_LAST_KEYS);
        if (!raw) return; const obj = JSON.parse(raw); if (obj && typeof obj === 'object'){
          Object.entries(obj).forEach(([k,v])=>{ const ts = Number(v); if (k && !Number.isNaN(ts)) state.lastKeys.set(k, ts); });
        }
      }catch(e){}
    }
    function saveLastKeys(){
      try{
        // store limited recent keys only to keep storage small
        const now = Date.now(); const out = {}; let count = 0;
        state.lastKeys.forEach((ts, k)=>{ if (count<200 && (now-ts) < 24*3600*1000){ out[k] = ts; count++; } });
        localStorage.setItem(STORAGE_LAST_KEYS, JSON.stringify(out));
      }catch(e){}
    }
    function formatHistoryRow(h){ const when = App.formatTs ? App.formatTs(h.ts) : new Date(h.ts).toLocaleString(); return `<div class="px-4 py-3 text-sm text-blue-700 border-b last:border-b-0 border-gray-100">${h.msg} <span class="block text-[10px] text-gray-400">${when}</span></div>`; }
    function render(){
      if (!elNotifList) return;
      const limit = (App.Params && App.Params.notification_limit) ? Number(App.Params.notification_limit) : 10;
      state.shownCount = Math.max(limit, state.shownCount);
      const toShow = state.history.slice(0, state.shownCount);
      const parts = toShow.map(formatHistoryRow);
      if (parts.length === 0){
        elNotifList.innerHTML = '<div class="px-4 py-3 text-sm text-gray-500">No notifications</div>';
      } else {
        elNotifList.innerHTML = parts.join('');
        if (state.history.length > state.shownCount){
          const loadMoreBtn = document.createElement('button');
          loadMoreBtn.className = 'w-full text-center px-4 py-2 text-xs text-blue-600 hover:bg-gray-50';
          loadMoreBtn.textContent = 'Load More';
          loadMoreBtn.onclick = ()=>{ state.shownCount += limit; render(); };
          elNotifList.appendChild(loadMoreBtn);
        }
      }
      if (elNotifBadge){ const c=state.unread; if (c>0){ elNotifBadge.textContent = '!'; elNotifBadge.classList.remove('hidden'); } else { elNotifBadge.classList.add('hidden'); } } }
    function pushRaw(msg){
      // Guard against immediate duplicate messages
      if (state.recentMsgs.has(msg)) return;
      state.recentMsgs.add(msg);
      if (state.recentMsgs.size > 100){ // trim set
        state.recentMsgs = new Set(Array.from(state.recentMsgs).slice(-80));
      }
      state.history.unshift({msg, ts: Date.now()});
      if (state.history.length > 200) state.history.length = 200;
      state.unread+=1; saveHistory(); playNotifSound(); render();
    }
    function pushKeyed(key,msg,ttlMs){
      // TTL check is removed to ensure every alert from server is shown. Key uniqueness is handled by caller.
      pushRaw(msg);
    }
    loadHistory(); loadLastKeys(); setTimeout(render,0);
    return { render, push: pushRaw, pushKeyed, clear(){
      state.shownCount = (App.Params && App.Params.notification_limit) ? Number(App.Params.notification_limit) : 10;
      state.history.length = 0;
      state.unread = 0;
      try{ localStorage.removeItem(STORAGE_KEY); }catch(_e){}
      render();
    }, resetUnread(){ state.unread=0; render(); } };
  })();
  App.NotificationCenter = NotificationCenter;

  if (elNotifBtn && elNotifDropdown){
    elNotifBtn.addEventListener('click', (e)=>{ e.stopPropagation(); notifOpen = !notifOpen; elNotifBtn.setAttribute('aria-expanded', notifOpen ? 'true' : 'false'); if (notifOpen){ elNotifDropdown.classList.remove('hidden'); NotificationCenter.resetUnread(); } else { elNotifDropdown.classList.add('hidden'); } });
    elNotifDropdown.addEventListener('click', (e)=> e.stopPropagation());
    document.addEventListener('click', ()=>{ if (!notifOpen) return; notifOpen=false; elNotifBtn.setAttribute('aria-expanded','false'); elNotifDropdown.classList.add('hidden'); });
    if (btnClearNotifs){ btnClearNotifs.addEventListener('click', ()=> NotificationCenter.clear()); }
  }
})();
