(function(){
  "use strict";

  const hasFirebaseConfig = !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);

  /* ---------------- Field mapping ---------------- */
  const FIELD_MAP = [
    ['driver','driverRaw','raw'],
    ['vehicle type','vehicleType','raw'],
    ['area','area','raw'],
    ['contract type','contractType','raw'],
    ['driver group','driverGroup','raw'],
    ['grade','csvGrade','raw'],
    ['attend days','attendDays','num'],
    ['average number of parcel delivered /day(1 to as 1 parcel)','avgParcelsPerDay','num'],
    ['call customer before delivery rate(%)','callBeforeDeliveryRate','pct'],
    ['cod remittance rate(%)','codRemittanceRate','pct'],
    ['confirm delivery properly rate(%)','confirmDeliveryRate','pct'],
    ['delivery attempt rate(%)','deliveryAttemptRate','pct'],
    ['delivery success rate(%)','deliverySuccessRate','pct'],
    ['metric penalty','metricPenalty','num'],
    ['new attendance rate','attendanceRate','pct'],
    ['number of days working','daysWorking','num'],
    ['number of parcels assigned (1 to as 1 parcel)','parcelsAssigned','num'],
    ['number of parcels delivered to sp','parcelsDeliveredToSP','num'],
    ['number of parcels delivered(1 to as 1 parcel)','parcelsDelivered','num'],
    ['number of parcels delivered(individual count in order level)','parcelsDeliveredIndividual','num'],
    ['number of parcels on-hold (1 to as 1 parcel)','parcelsOnHold','num'],
    ['sla achievement rate(%)','slaAchievementRate','pct'],
    ['bonus','bonus','money'],
    ['depreciation','depreciation','num'],
    ['discipline','discipline','num'],
    ['lost rate','lostRate','num'],
  ];
  function norm(h){ return String(h||'').replace(/\uFEFF/g,'').trim().toLowerCase().replace(/\s+/g,' '); }
  function toPct(v){ if(v===undefined||v===null) return 0; const n=parseFloat(String(v).replace('%','').trim()); return isNaN(n)?0:n; }
  function toNum(v){ if(v===undefined||v===null) return 0; const n=parseFloat(String(v).replace(/[^\d.\-]/g,'')); return isNaN(n)?0:n; }
  function toMoney(v){ return toNum(v); }

  function parseCSVLine(line){
    const result = [];
    let cur = '', inQuotes = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(inQuotes){
        if(ch === '"'){
          if(line[i+1] === '"'){ cur += '"'; i++; }
          else { inQuotes = false; }
        } else { cur += ch; }
      } else {
        if(ch === '"'){ inQuotes = true; }
        else if(ch === ','){ result.push(cur); cur = ''; }
        else { cur += ch; }
      }
    }
    result.push(cur);
    return result;
  }
  function parseCSVText(text){
    text = String(text||'').replace(/^\uFEFF/, '');
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim() !== '');
    if(lines.length === 0) return {data:[], meta:{fields:[]}};
    const fields = parseCSVLine(lines[0]).map(f=>f.trim());
    const data = [];
    for(let i=1;i<lines.length;i++){
      const vals = parseCSVLine(lines[i]);
      const row = {};
      fields.forEach((f,idx)=>{ row[f] = vals[idx] !== undefined ? vals[idx] : ''; });
      data.push(row);
    }
    return {data, meta:{fields}};
  }

  function parseDriverField(raw){
    const m = String(raw||'').match(/^\s*\[(\d+)\]\s*(.*)$/);
    if(m) return {id:m[1], name:m[2].trim()};
    return {id:'', name:String(raw||'').trim()};
  }

  function computeGrade(row){
    if(row.daysWorking<=0) return 'Inactive';
    const s = row.deliverySuccessRate;
    if(s>=95) return 'A';
    if(s>=85) return 'B';
    if(s>=70) return 'C';
    return 'D';
  }
  const GRADE_COLOR = {A:'var(--teal)',B:'var(--olive)',C:'var(--amber-deep)',D:'var(--brick)',Inactive:'#9AA1AC'};

  function mapRows(parsed){
    const headerLookup = {};
    (parsed.meta.fields||[]).forEach(f=>{ headerLookup[norm(f)] = f; });
    return parsed.data.filter(r=>{
      const anyVal = Object.values(r).some(v=>String(v||'').trim()!== '');
      return anyVal;
    }).map(r=>{
      const out = {};
      FIELD_MAP.forEach(([key,prop,type])=>{
        const actualHeader = headerLookup[key];
        const raw = actualHeader!==undefined ? r[actualHeader] : undefined;
        if(type==='pct') out[prop]=toPct(raw);
        else if(type==='num') out[prop]=toNum(raw);
        else if(type==='money') out[prop]=toMoney(raw);
        else out[prop]=raw===undefined?'':String(raw).trim();
      });
      const d = parseDriverField(out.driverRaw);
      out.id = d.id; out.name = d.name || out.driverRaw || 'Unknown rider';
      out.grade = computeGrade(out);
      return out;
    });
  }

  /* ---------------- Storage helpers ---------------- */
  const HUBS = ['Bauko','Buguias'];

  const hasFirebaseStorage = !!(window.firebaseAPI && window.firebaseAPI.isEnabled && window.firebaseAPI.isEnabled());

  const storage = {
    async get(key){
      if(!hasFirebaseStorage) return null;
      try{ return await window.firebaseAPI.get(key); }
      catch(e){ return null; }
    },
    async set(key,value){
      if(!hasFirebaseStorage) return null;
      try{ return await window.firebaseAPI.set(key, value); }
      catch(e){ return null; }
    },
    async delete(key){
      if(!hasFirebaseStorage) return null;
      try{ return await window.firebaseAPI.delete(key); }
      catch(e){ return null; }
    },
    async list(prefix=''){
      if(!hasFirebaseStorage) return {keys:[]};
      try{ return await window.firebaseAPI.list(prefix); }
      catch(e){ return {keys:[]}; }
    },
  };

  async function getIndex(){
    try{ const r = await storage.get('hubs-index', false); return r? JSON.parse(r.value) : {Bauko:[],Buguias:[]}; }
    catch(e){ return {Bauko:[],Buguias:[]}; }
  }
  async function saveIndex(idx){ await storage.set('hubs-index', JSON.stringify(idx), false); }
  async function saveSnapshot(hub,date,rows){
    await storage.set(`snapshot:${hub}:${date}`, JSON.stringify({hub,date,uploadedAt:new Date().toISOString(),rows}), false);
  }
  async function loadSnapshot(hub,date){
    try{ const r = await storage.get(`snapshot:${hub}:${date}`, false); return r? JSON.parse(r.value): null; }
    catch(e){ return null; }
  }
  async function getSummary(hub){
    try{ const r = await storage.get(`summary:${hub}`, false); return r? JSON.parse(r.value): []; }
    catch(e){ return []; }
  }
  async function saveSummaryArr(hub,arr){ await storage.set(`summary:${hub}`, JSON.stringify(arr), false); }

  function csvEscape(value){
    const s = value===undefined || value===null ? '' : String(value);
    if(/["]|[\r\n]|,/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }

  function makeCsv(rows, headers){
    const lines = [headers.map(csvEscape).join(',')];
    rows.forEach(row => {
      lines.push(headers.map(h => csvEscape(row[h])).join(','));
    });
    return lines.join('\r\n');
  }

  function getExportDates(hub){
    if(hub === 'All'){
      return Array.from(new Set([...(state.hubIndex.Bauko||[]), ...(state.hubIndex.Buguias||[])])).sort();
    }
    return (state.hubIndex[hub]||[]).slice().sort();
  }

  function populateDownloadWeekOptions(){
    const hub = $('#downloadHubSelect').value;
    const weekSelect = $('#downloadWeekSelect');
    const dates = getExportDates(hub);
    weekSelect.innerHTML = '';
    if(dates.length === 0){
      weekSelect.disabled = true;
      $('#downloadModalMsg').textContent = 'No weeks available for the selected hub.';
      $('#confirmDownload').disabled = true;
      return;
    }
    weekSelect.disabled = false;
    $('#downloadModalMsg').textContent = '';
    dates.slice().reverse().forEach(date => {
      const opt = document.createElement('option');
      opt.value = date;
      opt.textContent = fmtWeekLabel(date);
      weekSelect.appendChild(opt);
    });
    $('#confirmDownload').disabled = false;
  }

  async function buildDownloadRows(hub, date){
    const exportRows = [];
    const hubs = hub === 'All' ? HUBS : [hub];
    for(const hubName of hubs){
      const snap = await loadSnapshot(hubName, date);
      if(!snap || !snap.rows) continue;
      snap.rows.forEach(r => {
        exportRows.push(Object.assign({hub: hubName, date}, r));
      });
    }
    return exportRows;
  }

  function openDownloadModal(){
    $('#downloadOverlay').classList.add('show');
    $('#downloadModalMsg').textContent = '';
    if(state.currentHub === 'All') $('#downloadHubSelect').value = 'All';
    else $('#downloadHubSelect').value = state.currentHub;
    populateDownloadWeekOptions();
  }

  function closeDownloadModal(){
    $('#downloadOverlay').classList.remove('show');
  }

  async function downloadRecords(){
    const hub = $('#downloadHubSelect').value;
    const date = $('#downloadWeekSelect').value;
    if(!date){
      $('#downloadModalMsg').textContent = 'Please select a week to download.';
      return;
    }
    const rows = await buildDownloadRows(hub, date);
    if(rows.length === 0){
      $('#downloadModalMsg').textContent = 'No records found for that selection.';
      return;
    }
    const headers = ['hub','date','id','name','driverGroup','vehicleType','contractType','area','grade','attendDays','avgParcelsPerDay','deliverySuccessRate','callBeforeDeliveryRate','codRemittanceRate','confirmDeliveryRate','deliveryAttemptRate','metricPenalty','attendanceRate','daysWorking','parcelsAssigned','parcelsDeliveredToSP','parcelsDelivered','parcelsDeliveredIndividual','parcelsOnHold','slaAchievementRate','bonus','depreciation','discipline','lostRate'];
    const csv = makeCsv(rows, headers);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const fileName = `${hub === 'All' ? 'Both-hubs' : hub}-${date}.csv`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    closeDownloadModal();
  }

  function daySummaryFromRows(date, rows){
    const active = rows.filter(r=>r.daysWorking>0);
    const avg = key => active.length ? active.reduce((a,r)=>a+r[key],0)/active.length : 0;
    const sum = key => rows.reduce((a,r)=>a+r[key],0);
    return {
      date,
      riderCount: rows.length,
      activeRiders: active.length,
      avgDeliverySuccess: avg('deliverySuccessRate'),
      avgSLA: avg('slaAchievementRate'),
      avgAttendance: avg('attendanceRate'),
      avgParcelsPerDay: avg('avgParcelsPerDay'),
      totalDelivered: sum('parcelsDelivered'),
      totalAssigned: sum('parcelsAssigned'),
      totalOnHold: sum('parcelsOnHold'),
    };
  }

/* ---------------- Theme ---------------- */
  const THEME_KEY = 'hub-theme';
  function loadTheme(){
    try{
      const saved = localStorage.getItem(THEME_KEY);
      return saved ? JSON.parse(saved) : 'light';
    }catch(e){ return 'light'; }
  }
  function saveTheme(mode){ try{ localStorage.setItem(THEME_KEY, JSON.stringify(mode)); }catch(e){} }
  function applyTheme(mode){
    document.body.classList.toggle('dark', mode==='dark');
    const themeState = $('#themeToggleState');
    if(themeState){ themeState.textContent = mode==='dark' ? 'On' : 'Off'; }
    const settingsToggle = $('#settingsToggle');
    if(settingsToggle){ settingsToggle.setAttribute('aria-label', mode==='dark' ? 'Open options (dark mode)' : 'Open options'); }
  }
  function chartColors(){
    const cs = getComputedStyle(document.body);
    return {
      text: cs.getPropertyValue('--text-dim').trim() || '#6B7280',
      grid: cs.getPropertyValue('--line-2').trim() || '#E9EAE4',
    };
  }

  const state = {
    hubIndex: {Bauko:[],Buguias:[]},
    currentHub: 'All',
    currentDate: null,
    rows: [],
    summaries: {Bauko:[],Buguias:[]},
    sortKey: 'deliverySuccessRate',
    sortDir: 'desc',
    search: '',
    filterVehicle: '',
    filterGroup: '',
    filterGrade: '',
    hideInactive: true,
    trendChart: null,
    weekPickerMonth: new Date(),
    weekPickerSelectedDate: null,
  };

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function fmtPct(n){ return (n||0).toFixed(1)+'%'; }
  function fmtNum(n){ return Math.round(n||0).toLocaleString(); }
  function fmtDate(d){
    if(!d) return '—';
    const dt = new Date(d+'T00:00:00');
    if(isNaN(dt)) return d;
    return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }

  function weekNumberSinceJanuary(d){
    const dt = new Date(d+'T00:00:00');
    if(isNaN(dt)) return null;
    const yearStart = new Date(dt.getFullYear(), 0, 1);
    const diffDays = Math.floor((dt - yearStart) / 86400000);
    return Math.floor(diffDays / 7) + 1;
  }

function fmtWeekLabel(d){
    if(!d) return '—';
    const dt = new Date(d+'T00:00:00');
    if(isNaN(dt)) return d;
    return dt.toLocaleDateString('en-US',{month:'short', day:'numeric', year:'numeric'});
  }

  async function init(){
    if(!hasFirebaseStorage){
      $('#storageBanner').innerHTML = `<div class="banner">
        <span>Firebase is not configured yet. Please add your Firebase config before uploading manifests.</span>
        <button id="dismissBanner">Dismiss</button>
      </div>`;
      const db = document.getElementById('dismissBanner');
      if(db) db.addEventListener('click', ()=>{ $('#storageBanner').innerHTML=''; });
    }
    window.addEventListener('error', function(e){
      showToast('Something went wrong: ' + (e.message || 'unknown error'));
    });
const theme = await loadTheme();
    applyTheme(theme);
    state.hubIndex = await getIndex();
    state.summaries.Bauko = await getSummary('Bauko');
    state.summaries.Buguias = await getSummary('Buguias');
    // Build rider name -> Area lookup from the Riders & Agency sheet
areaLookup = await buildAreaLookup();
    pnrLookup = await buildPnrLookup();
    setActiveTab('All');
    await refreshView();
    wireStaticEvents();
  }

  function setActiveTab(hub){
    state.currentHub = hub;
    $$('.route-stop').forEach(el=>el.classList.toggle('active', el.dataset.hub===hub));
  }

  function allDatesForCurrentHub(){
    if(state.currentHub==='All'){
      const set = new Set([...(state.hubIndex.Bauko||[]), ...(state.hubIndex.Buguias||[])]);
      return Array.from(set).sort();
    }
    return (state.hubIndex[state.currentHub]||[]).slice().sort();
  }

  function latestDate(list){ return list.length ? list[list.length-1] : null; }

  async function refreshView(){
    const dates = allDatesForCurrentHub();
    const dateSelect = $('#dateSelect');
    dateSelect.innerHTML = '';
    if(dates.length===0){
      dateSelect.style.display='none';
    } else {
      dateSelect.style.display='';
      dates.slice().reverse().forEach(d=>{
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = fmtWeekLabel(d);
        dateSelect.appendChild(opt);
      });
      if(!state.currentDate || !dates.includes(state.currentDate)){
        state.currentDate = latestDate(dates);
      }
      dateSelect.value = state.currentDate;
    }

    $('#viewTitle').textContent = state.currentHub==='All' ? 'Both hubs' : state.currentHub;
    $('#viewSub').textContent = state.currentDate ? `Snapshot for ${fmtWeekLabel(state.currentDate)}` : 'Snapshot for —';

    if(dates.length===0){
      renderEmpty();
      updateLastUpdatedNote();
      return;
    }

    let rows = [];
    if(state.currentHub==='All'){
      for(const hub of HUBS){
        const hd = state.hubIndex[hub]||[];
        const useDate = hd.includes(state.currentDate) ? state.currentDate : latestDate(hd);
        if(useDate){
          const snap = await loadSnapshot(hub, useDate);
          if(snap) rows = rows.concat(snap.rows.map(r=>Object.assign({},r,{hub, snapDate:useDate})));
        }
      }
    } else {
      const snap = await loadSnapshot(state.currentHub, state.currentDate);
      if(snap) rows = snap.rows.map(r=>Object.assign({},r,{hub:state.currentHub, snapDate:state.currentDate}));
    }
state.rows = rows;

    // Populate the Area from the Riders & Agency sheet by matching rider name
    if(areaLookup && areaLookup.size){
      rows.forEach(r => {
        const key = String(r.name || '').trim().toLowerCase();
        if(key && areaLookup.has(key)){
          r.area = areaLookup.get(key);
        }
      });
    }

// Populate the PNR count from the PNR Google Sheet by matching rider name + hub + week
    if(pnrLookup && pnrLookup.size){
      rows.forEach(r => {
        const weekKey = (r.snapDate || '');
        const key = (String(r.name || '').trim().toLowerCase() + '|' + normalizeHub(r.hub) + '|' + String(weekKey).trim()).trim();
        if(key && pnrLookup.has(key)){
          r.pnr = pnrLookup.get(key);
        }
        if(key && notSolvedPnrMap.has(key)){
          r.notSolvedPnr = notSolvedPnrMap.get(key);
        }
      });
    }

    $('#viewSub').textContent = state.currentHub==='All'
      ? 'Combined snapshot — each hub shown as of its latest upload'
      : `Snapshot for ${fmtDate(state.currentDate)}`;

    await renderContent();
    updateLastUpdatedNote();
  }

  function updateLastUpdatedNote(){
    const all = [...(state.hubIndex.Bauko||[]), ...(state.hubIndex.Buguias||[])];
    if(all.length===0){ $('#lastUpdatedNote').textContent = 'No manifests uploaded yet.'; return; }
    const latest = all.sort().slice(-1)[0];
    $('#lastUpdatedNote').textContent = `Latest manifest on file: ${fmtDate(latest)}`;
  }

  function renderEmpty(){
    const hubName = state.currentHub==='All' ? 'either hub' : state.currentHub;
    $('#content').innerHTML = `
      <div class="empty">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#9AA1AC" stroke-width="1.6"><path d="M12 3v13M6 10l6-6 6 6M4 21h16"/></svg>
        <h3>No manifest on file for ${hubName}</h3>
        <p>Upload the daily performance CSV to start tracking rider and hub performance.</p>
        <button class="btn-primary" id="emptyUploadBtn">Upload manifest</button>
      </div>`;
    $('#emptyUploadBtn').addEventListener('click', openModal);
  }

function animateCountUp(el, target, isPct){
    if(!el) return;
    const targetNum = parseFloat(String(target).replace(/[^\d.\-]/g,''))||0;
    const duration = 700;
    const start = performance.now();
    function frame(now){
      const p = Math.min((now-start)/duration, 1);
      const eased = 1 - Math.pow(1-p, 3);
      const val = targetNum * eased;
      el.textContent = isPct ? val.toFixed(1)+'%' : Math.round(val).toLocaleString();
      if(p < 1) requestAnimationFrame(frame);
      else el.textContent = target;
    }
    requestAnimationFrame(frame);
  }

  async function renderContent(){
    const rows = state.rows;
    const active = rows.filter(r=>r.daysWorking>0);
    const avg = key => active.length ? active.reduce((a,r)=>a+r[key],0)/active.length : 0;
    const sum = key => rows.reduce((a,r)=>a+r[key],0);

    const kpis = [
      {label:'Riders on manifest', value: fmtNum(rows.length), sub:`${active.length} active`, anim:'num'},
      {label:'Delivery success rate', value: fmtPct(avg('deliverySuccessRate')), cls: avg('deliverySuccessRate')>=90?'teal':(avg('deliverySuccessRate')<75?'brick':'' ), anim:'pct'},
      {label:'Attendance rate', value: fmtPct(avg('attendanceRate')), anim:'pct'},
      {label:'Parcels delivered', value: fmtNum(sum('parcelsDelivered')), sub:`${fmtNum(sum('parcelsAssigned'))} assigned`, anim:'num'},
      {label:'Parcels on hold', value: fmtNum(sum('parcelsOnHold')), cls: sum('parcelsOnHold')>0?'brick':'', anim:'num'},
    ];

    let html = '<div class="kpis">';
    kpis.forEach((k,idx)=>{
      html += `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value ${k.cls||''}" data-anim-target="${k.value}" data-anim-type="${k.anim}">${k.value}</div>${k.sub?`<div class="kpi-sub">${k.sub}</div>`:''}</div>`;
    });
    html += '</div>';

html += '<div class="panels">';
    html += `<div class="panel"><h3>Vehicle types</h3><p class="hint">Rider count by vehicle type</p><div id="trendWrap"></div></div>`;
    html += `<div class="panel clickable-panel" id="notSolvedPanel" role="link" tabindex="0" title="Open PNR of Riders"><h3>Not Solved PNR <span class="panel-arrow">→</span></h3><p class="hint">Riders with not-solved PNR across all hubs</p><div id="notSolvedWrap"></div></div>`;
    html += '</div>';

html += '<div class="strip">';
    html += `<div class="panel"><h3>🟢 Top performers</h3><p class="hint">Highest delivery success (min. 1 active day)</p><div id="topList"></div></div>`;
    html += `<div class="panel"><h3>🔻 Needs attention</h3><p class="hint">Lowest delivery success (min. 1 active day)</p><div id="bottomList"></div></div>`;
    html += '</div>';

    html += `<div class="table-panel">
      <div class="table-controls">
        <input type="text" id="searchInput" placeholder="Search rider name or ID…">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-dim);"><input type="checkbox" id="hideInactiveToggle" ${state.hideInactive ? 'checked' : ''}> Hide inactive riders</label>
        <select id="vehicleFilter"><option value="">All vehicle types</option></select>
        <select id="groupFilter"><option value="">All driver groups</option></select>
</div>
<div class="table-scroll" id="tableScroll"><div class="drag-fade" id="dashDragFade"></div><table><thead><tr id="theadRow"></tr></thead><tbody id="tbody"></tbody></table></div>
      <div class="row-count" id="rowCount"></div>
      <div class="drag-hint" id="dashDragHint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        Swipe to see more
      </div>
    </div>`;

    $('#content').innerHTML = html;

    // Animate KPI values with a count-up effect
    $$('.kpi-value').forEach(el=>{
      const target = el.getAttribute('data-anim-target');
      const type = el.getAttribute('data-anim-type');
      animateCountUp(el, target, type==='pct');
    });

await renderTrend();
    renderNotSolved();
    renderTopBottom(rows);
    setupTableControls(rows);
    renderTable();
    wireTableDrag();

    // Clicking the "Not Solved PNR" panel opens the PNR of Riders page.
    const nsPanel = $('#notSolvedPanel');
    if(nsPanel){
      const goToPnr = ()=> window.location.href = 'pnr.html';
      nsPanel.addEventListener('click', goToPnr);
      nsPanel.addEventListener('keydown', e=>{
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); goToPnr(); }
      });
    }
  }

  /* ---- Sideways drag-to-scroll control for the dashboard table ---- */
  let dashDragState = null;
  function wireTableDrag(){
    const scrollEl = $('#tableScroll');
    const fadeEl = $('#dashDragFade');
    const hintEl = $('#dashDragHint');
    if(!scrollEl) return;

    function overflows(){ return scrollEl.scrollWidth > scrollEl.clientWidth + 1; }
    function updateHint(){
      if(!hintEl || !fadeEl) return;
      const ov = overflows();
      const atEnd = scrollEl.scrollLeft + scrollEl.clientWidth >= scrollEl.scrollWidth - 4;
      hintEl.style.opacity = (ov && !atEnd) ? '1' : '0';
      fadeEl.style.opacity = (ov && !atEnd) ? '1' : '0';
    }
    function onStart(e){
      if(e.target.closest('th')) return;
      const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
      dashDragState = { startX: pt.clientX, startY: pt.clientY, startLeft: scrollEl.scrollLeft, moved:false };
      scrollEl.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
    }
    function onMove(e){
      if(!dashDragState) return;
      const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
      const dx = pt.clientX - dashDragState.startX;
      const dy = pt.clientY - dashDragState.startY;
      if(!dashDragState.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) dashDragState.moved = true;
      if(!dashDragState.moved) return;
      if(e.cancelable) e.preventDefault();
      scrollEl.scrollLeft = dashDragState.startLeft - dx;
      updateHint();
    }
    function onEnd(){
      if(!dashDragState) return;
      dashDragState = null;
      scrollEl.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      updateHint();
    }

    scrollEl.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    scrollEl.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    scrollEl.addEventListener('scroll', updateHint);
    window.addEventListener('resize', updateHint);
    setTimeout(updateHint, 0);
  }

  async function renderTrend(){
    const wrap = $('#trendWrap');
    const rows = state.rows || [];
    const active = rows.filter(r=>Number(r.daysWorking||0) > 0);
    if(active.length < 1){
      wrap.innerHTML = `<div class="trend-disabled">Upload a manifest with rider data to see vehicle type counts.</div>`;
      return;
    }

    const counts = {};
    active.forEach(r=>{
      const vehicle = String(r.vehicleType || 'Unspecified').trim() || 'Unspecified';
      counts[vehicle] = (counts[vehicle] || 0) + 1;
    });

    const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(entries.length < 1){
      wrap.innerHTML = `<div class="trend-disabled">No vehicle type data was found for the current manifest.</div>`;
      return;
    }

    const VT_COLORS = ['var(--teal)','var(--amber-deep)','var(--brick)','var(--olive)','var(--slate)','#6366f1','#8b5cf6','#ec4899'];
    wrap.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${entries.map(([vehicle, count], idx) => {
          const color = VT_COLORS[idx % VT_COLORS.length];
          return `
            <div class="vt-item" style="border-left-color:${color};animation-delay:${Math.min(idx*60,400)}ms">
              <span class="vt-name">${escapeHtml(vehicle)}</span>
              <span class="vt-count">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

async function renderNotSolved(){
    // Load not-solved PNR from the same Google Sheet used by the "PNR of Riders" page.
    const wrap = $('#notSolvedWrap');
    if(!wrap) return;
    wrap.innerHTML = '<div class="trend-disabled">Loading PNR data…</div>';
    try{
      const url = `https://docs.google.com/spreadsheets/d/${PNR_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(PNR_SHEET_NAME)}`;
      const response = await fetch(url);
      if(!response.ok) throw new Error('fetch');
      const text = await response.text();
      const parsedLines = text.split(/\r\n|\n|\r/).map(parseSheetCsvLine);
      const headerRowIndex = parsedLines.findIndex(values => {
        const normalized = values.map(v => String(v||'').trim().toLowerCase());
        return normalized.some(h=>['date'].includes(h))
          && normalized.some(h=>['hub'].includes(h))
          && normalized.some(h=>['rider','rider name','driver','name'].includes(h));
      });
      if(headerRowIndex < 0) throw new Error('no header');
      const normalizedHeaders = parsedLines[headerRowIndex].map(h => String(h||'').trim().toLowerCase());
      const nameIdx = findSheetHeaderIndex(normalizedHeaders, ['rider','rider name','driver','name']);
      const statusIdx = findSheetHeaderIndex(normalizedHeaders, ['status']);
      const countIdx = findSheetHeaderIndex(normalizedHeaders, ['count']);
      const counts = {};
      for(let i=headerRowIndex+1;i<parsedLines.length;i++){
        const values = parsedLines[i];
        if(!values.some(c => String(c||'').trim() !== '')) continue;
        const name = String(values[nameIdx]||'').trim();
        const st = statusIdx>=0 ? String(values[statusIdx]||'').trim().toUpperCase().replace(/[^A-Z]/g,'') : '';
        if(!name || st !== 'NOTSOLVED') continue;
        const cnt = countIdx>=0 ? (parseFloat(String(values[countIdx]||'').replace(/[^\d.\-]/g,''))||0) : 0;
        counts[name] = (counts[name]||0) + cnt;
      }
const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      if(entries.length === 0){
        wrap.innerHTML = '<div class="trend-disabled">No not-solved PNR for the selected snapshot.</div>';
        return;
      }
      const max = entries[0][1] || 1;
      wrap.innerHTML = entries.map(([name,cnt], idx) => `
        <div class="ns-row" style="animation-delay:${Math.min(idx*60,600)}ms">
          <span class="ns-name">${escapeHtml(name)}</span>
          <span class="ns-count mono" data-count="${cnt}">0</span>
        </div>
      `).join('');
      // Animate each count up to its final value for a fluid, lively feel.
      $$('#notSolvedWrap .ns-count').forEach(el=>{
        const target = el.getAttribute('data-count');
        animateCountUp(el, fmtNum(target), false);
      });
    }catch(e){
      wrap.innerHTML = '<div class="trend-disabled">Could not load PNR data — check the sheet link and try again.</div>';
    }
  }

  function renderTopBottom(rows){
    const active = rows.filter(r=>r.daysWorking>0);
    const sorted = active.slice().sort((a,b)=>b.deliverySuccessRate-a.deliverySuccessRate);
    const top = sorted.slice(0,5);
    const bottom = sorted.slice(-5).reverse();
    const rowHtml = r => `<div class="perf-row">
        <div class="perf-name"><b>${escapeHtml(r.name)}</b><span>${r.id?('#'+r.id+' · '):''}${escapeHtml(r.driverGroup||r.vehicleType)}</span></div>
        <div class="perf-val" style="color:${GRADE_COLOR[r.grade]}">${fmtPct(r.deliverySuccessRate)}</div>
      </div>`;
    $('#topList').innerHTML = top.length ? top.map(rowHtml).join('') : '<div class="perf-row">No active riders yet.</div>';
    $('#bottomList').innerHTML = bottom.length ? bottom.map(rowHtml).join('') : '<div class="perf-row">No active riders yet.</div>';
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  const COLUMNS = [
    {key:'name', label:'Rider', type:'name'},
    {key:'hub', label:'Hub', type:'text', showOnlyAll:true},
    {key:'vehicleType', label:'Vehicle', type:'text'},
    {key:'area', label:'Area', type:'text'},
    {key:'driverGroup', label:'Group', type:'text'},
    {key:'attendDays', label:'Days', type:'num'},
    {key:'avgParcelsPerDay', label:'Parcels/Day', type:'num1'},
    {key:'parcelsAssigned', label:'Parcels Assigned', type:'num'},
    {key:'parcelsOnHold', label:'On-hold', type:'num'},
    {key:'deliverySuccessRate', label:'Delivery Success', type:'pct'},
    {key:'attendanceRate', label:'Attendance', type:'pct'},
  ];

  function setupTableControls(rows){
    const vSel = $('#vehicleFilter'), gSel = $('#groupFilter');
    const visibleRows = state.hideInactive ? rows.filter(r=>Number(r.daysWorking||0)>0) : rows;
    const vehicles = Array.from(new Set(visibleRows.map(r=>r.vehicleType).filter(Boolean))).sort();
    const groups = Array.from(new Set(visibleRows.map(r=>r.driverGroup).filter(Boolean))).sort();
    vSel.innerHTML = '<option value="">All vehicle types</option>';
    gSel.innerHTML = '<option value="">All driver groups</option>';
    vehicles.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; vSel.appendChild(o); });
    groups.forEach(g=>{ const o=document.createElement('option'); o.value=g;o.textContent=g; gSel.appendChild(o); });
vSel.value = state.filterVehicle; gSel.value = state.filterGroup;
    $('#searchInput').value = state.search;
    $('#hideInactiveToggle').checked = state.hideInactive;

    $('#searchInput').addEventListener('input', e=>{ state.search=e.target.value; renderTable(); });
    vSel.addEventListener('change', e=>{ state.filterVehicle=e.target.value; renderTable(); });
gSel.addEventListener('change', e=>{ state.filterGroup=e.target.value; renderTable(); });
    $('#hideInactiveToggle').addEventListener('change', e=>{ state.hideInactive=e.target.checked; renderTable(); });

    const thead = $('#theadRow');
    thead.innerHTML = COLUMNS.filter(c=>!c.showOnlyAll || state.currentHub==='All').map(c=>
      `<th data-key="${c.key}">${c.label}<span class="arrow">${state.sortKey===c.key ? (state.sortDir==='asc'?'▲':'▼') : ''}</span></th>`
    ).join('');
    $$('#theadRow th').forEach(th=>{
      th.addEventListener('click', ()=>{
        const key = th.dataset.key;
        if(state.sortKey===key){ state.sortDir = state.sortDir==='asc'?'desc':'asc'; }
        else { state.sortKey = key; state.sortDir = 'desc'; }
        renderTable();
      });
    });
  }

// Color class for Delivery Success Rate based on thresholds
  function successRateColor(v){
    const n = Number(v) || 0;
    if(n >= 90) return 'rate-green';
    if(n >= 80) return 'rate-yellow';
    if(n >= 70) return 'rate-orange';
    if(n >= 60) return 'rate-bright-red';
    return 'rate-dark-red';
  }

  function renderTable(){
    let rows = state.rows.slice();
    if(state.hideInactive){
      rows = rows.filter(r=>Number(r.daysWorking||0) > 0);
    }
    if(state.search){
      const q = state.search.toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || String(r.id).includes(q));
    }
if(state.filterVehicle) rows = rows.filter(r=>r.vehicleType===state.filterVehicle);
if(state.filterGroup) rows = rows.filter(r=>r.driverGroup===state.filterGroup);

    rows.sort((a,b)=>{
      let av=a[state.sortKey], bv=b[state.sortKey];
      if(typeof av==='string'){ av=av.toLowerCase(); bv=(bv||'').toLowerCase(); }
      if(av<bv) return state.sortDir==='asc'?-1:1;
      if(av>bv) return state.sortDir==='asc'?1:-1;
      return 0;
    });

const cols = COLUMNS.filter(c=>!c.showOnlyAll || state.currentHub==='All');
    const tbody = $('#tbody');
    tbody.innerHTML = rows.map(r=>{
      return '<tr>' + cols.map(c=>{
if(c.type==='name') return `<td class="name-cell"><b>${escapeHtml(r.name)}</b>${r.id?`<span>#${r.id}</span>`:''}</td>`;
if(c.type==='pct') return `<td class="num ${(c.key==='deliverySuccessRate' || c.key==='attendanceRate') ? successRateColor(r[c.key]) : ''}">${fmtPct(r[c.key])}</td>`;
if(c.type==='num1') return `<td class="num">${(r[c.key]||0).toFixed(1)}</td>`;
        if(c.type==='num') return `<td class="num">${fmtNum(r[c.key])}</td>`;
        if(c.key==='pnr') return `<td class="num">${r[c.key] ? `<a class="pnr-link" href="pnr.html?rider=${encodeURIComponent(r.name)}&hub=${encodeURIComponent(r.hub)}&week=${encodeURIComponent(r.snapDate || '')}" title="Open PNR of Riders">${fmtNum(r[c.key])}</a>` : '<span class="muted">—</span>'}</td>`;
        return `<td>${escapeHtml(r[c.key])}</td>`;
      }).join('') + '</tr>';
    }).join('');
    const totalBaseRows = state.hideInactive ? state.rows.filter(r=>Number(r.daysWorking||0) > 0).length : state.rows.length;
    $('#rowCount').textContent = `Showing ${rows.length} of ${totalBaseRows} riders`;
    if(rows.length===0){
      tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-dim);padding:24px;">No riders match these filters.</td></tr>`;
    }
  }

  let pendingFile = null, pendingParsedRows = null;

  function startOfWeek(date){
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
  }

  function toISODate(date){
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatWeekRange(startDate){
    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);
    return `${fmtDate(toISODate(startDate))} – ${fmtDate(toISODate(end))}`;
  }

  function renderWeekPicker(){
    const input = $('#dateInput');
    const monthLabel = $('#weekPickerMonthLabel');
    const grid = $('#weekPickerGrid');
    const selectionText = $('#weekSelectionText');
    const selectedDate = state.weekPickerSelectedDate ? new Date(state.weekPickerSelectedDate + 'T00:00:00') : null;
    const shownMonth = new Date(state.weekPickerMonth);
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstColumn = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

const cells = [];
    for(let i=0;i<firstColumn;i++) cells.push('');
    for(let d=1;d<=totalDays;d++) cells.push(d);
    while(cells.length % 7 !== 0) cells.push('');

    monthLabel.textContent = firstDay.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    grid.innerHTML = '';
cells.forEach((day, index)=>{
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'week-picker-cell';
      if(!day){ cell.classList.add('muted'); cell.disabled = true; grid.appendChild(cell); return; }
      const date = new Date(year, month, day);
      const monday = startOfWeek(date); // week always starts on Monday
      const isMonday = date.getDay() === 1;
      const isSelectedDate = selectedDate && selectedDate.getFullYear() === date.getFullYear() && selectedDate.getMonth() === date.getMonth() && selectedDate.getDate() === date.getDate();
      if(isSelectedDate) cell.classList.add('selected');
      if(isMonday) cell.classList.add('monday');
      cell.textContent = day;
      cell.addEventListener('click', ()=>{
        input.value = toISODate(monday);
        state.weekPickerSelectedDate = toISODate(date);
        state.weekPickerMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        renderWeekPicker();
      });
      grid.appendChild(cell);
    });

    selectionText.textContent = input.value ? `Selected week: ${formatWeekRange(new Date(input.value + 'T00:00:00'))}` : 'Selected week: —';
  }

  function openModal(){
    $('#overlay').classList.add('show');
    $('#modalMsg').textContent = '';
    $('#dropText').innerHTML = '<b>Click to choose</b> or drag a .csv file here';
    pendingFile = null; pendingParsedRows = null;
    $('#confirmUpload').disabled = true;
    const today = new Date();
    const monday = startOfWeek(today);
    if(!$('#dateInput').value){ $('#dateInput').value = toISODate(monday); }
    state.weekPickerSelectedDate = state.weekPickerSelectedDate || toISODate(today);
    state.weekPickerMonth = new Date(monday.getFullYear(), monday.getMonth(), 1);
    renderWeekPicker();
    if(state.currentHub==='Bauko' || state.currentHub==='Buguias') $('#hubSelect').value = state.currentHub;
  }
  function closeModal(){ $('#overlay').classList.remove('show'); }

  function handleFile(file){
    pendingFile = file;
    pendingParsedRows = null;
    $('#confirmUpload').disabled = true;
    $('#dropText').innerHTML = `<b>${escapeHtml(file.name)}</b> selected`;
    $('#modalMsg').textContent = 'Reading file…';
    $('#modalMsg').className = 'modal-msg';
    const m = file.name.match(/(\d{4}-\d{2}-\d{2})/);
    if(m) {
      const picked = new Date(m[1] + 'T00:00:00');
      const monday = startOfWeek(picked);
      $('#dateInput').value = toISODate(monday);
      state.weekPickerSelectedDate = toISODate(picked);
      state.weekPickerMonth = new Date(monday.getFullYear(), monday.getMonth(), 1);
      renderWeekPicker();
    }

    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const res = parseCSVText(e.target.result);
        pendingParsedRows = mapRows(res);
        if(pendingParsedRows.length===0){
          $('#modalMsg').textContent = 'No rider rows were found in this file. Make sure it\'s the unedited performance report CSV.';
          $('#modalMsg').className = 'modal-msg err';
          $('#confirmUpload').disabled = true;
        } else {
          $('#modalMsg').textContent = `Parsed ${pendingParsedRows.length} rider rows.`;
          $('#modalMsg').className = 'modal-msg ok';
          $('#confirmUpload').disabled = false;
        }
      }catch(err){
        $('#modalMsg').textContent = 'Could not read that file — check it is the standard performance report CSV. (' + (err && err.message ? err.message : 'parse error') + ')';
        $('#modalMsg').className = 'modal-msg err';
        $('#confirmUpload').disabled = true;
      }
    };
    reader.onerror = function(){
      $('#modalMsg').textContent = 'Could not read that file from disk. Try selecting it again.';
      $('#modalMsg').className = 'modal-msg err';
      $('#confirmUpload').disabled = true;
    };
    try{
      reader.readAsText(file);
    }catch(err){
      $('#modalMsg').textContent = 'Could not open that file. (' + (err && err.message ? err.message : 'unknown error') + ')';
      $('#modalMsg').className = 'modal-msg err';
    }
  }

  async function confirmUpload(){
    if(!pendingParsedRows) return;
    const hub = $('#hubSelect').value;
    const date = $('#dateInput').value;
    if(!date){ $('#modalMsg').textContent='Pick a week start date.'; $('#modalMsg').className='modal-msg err'; return; }

    const btn = $('#confirmUpload');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    try{
      await saveSnapshot(hub, date, pendingParsedRows);

      if(!state.hubIndex[hub]) state.hubIndex[hub] = [];
      if(!state.hubIndex[hub].includes(date)){
        state.hubIndex[hub].push(date);
        state.hubIndex[hub].sort();
      }
      await saveIndex(state.hubIndex);

      const daySummary = daySummaryFromRows(date, pendingParsedRows);
      let summaryArr = state.summaries[hub]||[];
      summaryArr = summaryArr.filter(s=>s.date!==date);
      summaryArr.push(daySummary);
      summaryArr.sort((a,b)=>a.date<b.date?-1:1);
      state.summaries[hub] = summaryArr;
      await saveSummaryArr(hub, summaryArr);

      closeModal();
      showToast(`Added <b>${hub}</b> — week of ${fmtDate(date)} (${pendingParsedRows.length} riders)`);

      setActiveTab(hub);
      state.currentDate = date;
      await refreshView();
    }catch(err){
      $('#modalMsg').textContent = 'Could not save this upload: ' + (err && err.message ? err.message : 'unknown error');
      $('#modalMsg').className = 'modal-msg err';
    }finally{
      btn.disabled = false;
      btn.textContent = 'Add to dashboard';
    }
  }

  function showToast(html){
    const t = $('#toast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(()=>t.classList.remove('show'), 3200);
  }

  async function deleteSelectedDate(){
    if(!state.currentDate){
      showToast('Select a date to delete.');
      return;
    }

    const targetDate = state.currentDate;
    const hubsToDelete = state.currentHub === 'All'
      ? HUBS.filter(hub => (state.hubIndex[hub]||[]).includes(targetDate))
      : [state.currentHub];

    if(hubsToDelete.length === 0){
      showToast('That date is not stored for the current view.');
      return;
    }

    const summaryText = hubsToDelete.length > 1
      ? `Delete the manifest for ${fmtDate(targetDate)} from ${hubsToDelete.join(' and ')}?`
      : `Delete the manifest for ${fmtDate(targetDate)} from ${hubsToDelete[0]}?`;

    if(!confirm(`${summaryText} This cannot be undone.`)) return;

    try{
      for(const hub of hubsToDelete){
        await storage.delete(`snapshot:${hub}:${targetDate}`, false);

        const nextSummary = (state.summaries[hub]||[]).filter(item => item.date !== targetDate);
        state.summaries[hub] = nextSummary;
        await saveSummaryArr(hub, nextSummary);

        state.hubIndex[hub] = (state.hubIndex[hub]||[]).filter(date => date !== targetDate);
      }

      await saveIndex(state.hubIndex);
      state.currentDate = null;
      await refreshView();
      showToast('Selected manifest date removed.');
    }catch(err){
      showToast('Could not delete that manifest date.');
    }
  }

  async function resetAll(){
    if(!confirm('Clear all stored manifests for both hubs? This cannot be undone.')) return;
    for(const hub of HUBS){
      const dates = state.hubIndex[hub]||[];
      for(const d of dates){
        try{ await storage.delete(`snapshot:${hub}:${d}`, false); }catch(e){}
      }
      try{ await storage.delete(`summary:${hub}`, false); }catch(e){}
    }
    try{ await storage.delete('hubs-index', false); }catch(e){}
    state.hubIndex = {Bauko:[],Buguias:[]};
    state.summaries = {Bauko:[],Buguias:[]};
    state.currentDate = null;
    await refreshView();
    showToast('All stored data cleared.');
  }

/* ---------------- Riders & Agency modal (single page) ---------------- */
const RIDERS_SHEET_ID = '1aGJXuO3tz5oLJyL6piEljz4A6cg6l0cnKvmtIpLkqMI';
  const PNR_SHEET_ID = '1aGJXuO3tz5oLJyL6piEljz4A6cg6l0cnKvmtIpLkqMI';
  const PNR_SHEET_NAME = 'PNR';
  const RIDERS_HUB_SHEET = { Buguias:'Buguias', Bauko:'Bauko' };
const riders = {
    allRows: [],
    currentHub: 'Buguias',
    search: '',
    hasHubColumn: false,
  };

// Lookup of rider name -> Area, built from the Riders & Agency Google Sheet
  let areaLookup = new Map();

// Lookup of rider name+hub -> PNR count, built from the PNR Google Sheet
  let pnrLookup = new Map();

  // Lookup of rider name+hub+week -> not-solved PNR count, built from the PNR Google Sheet
  let notSolvedPnrMap = new Map();

  async function buildAreaLookup(){
    const map = new Map();
    for(const hub of HUBS){
      try{
        const sheetName = RIDERS_HUB_SHEET[hub] || hub;
        const url = `https://docs.google.com/spreadsheets/d/${RIDERS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
        const response = await fetch(url);
        if(!response.ok) continue;
        const text = await response.text();
        const rawLines = text.split(/\r\n|\n|\r/);
        if(rawLines.length < 2) continue;
        const parsedLines = rawLines.map(parseSheetCsvLine);
        const headerRowIndex = parsedLines.findIndex(values => {
          const normalized = values.map(v => String(v||'').trim().toLowerCase());
          return normalized.some(h=>['rider name','rider','driver name','driver','name'].includes(h))
            && normalized.some(h=>['area','location'].includes(h));
        });
        if(headerRowIndex < 0) continue;
        const headers = parsedLines[headerRowIndex];
        const normalizedHeaders = headers.map(h => String(h||'').trim().toLowerCase());
        const nameIdx = findSheetHeaderIndex(normalizedHeaders, ['rider name','rider','driver name','driver','name']);
        const areaIdx = findSheetHeaderIndex(normalizedHeaders, ['area','location']);
        if(nameIdx < 0 || areaIdx < 0) continue;
        for(let i=headerRowIndex+1;i<parsedLines.length;i++){
          const values = parsedLines[i];
          if(values.some(c => String(c||'').trim() !== '')){
            const name = String(values[nameIdx]||'').trim().toLowerCase();
            const area = String(values[areaIdx]||'').trim();
            if(name && area && !map.has(name)) map.set(name, area);
          }
        }
      }catch(e){ /* ignore sheet errors */ }
    }
return map;
  }

  // Build a lookup of rider name+hub -> total PNR count from the PNR Google Sheet
  async function buildPnrLookup(){
    const map = new Map();
    try{
      const url = `https://docs.google.com/spreadsheets/d/${PNR_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(PNR_SHEET_NAME)}`;
      const response = await fetch(url);
      if(!response.ok) return map;
      const text = await response.text();
      const rawLines = text.split(/\r\n|\n|\r/);
      if(rawLines.length < 2) return map;
      const parsedLines = rawLines.map(parseSheetCsvLine);
      const headerRowIndex = parsedLines.findIndex(values => {
        const normalized = values.map(v => String(v||'').trim().toLowerCase());
        return normalized.some(h=>['date'].includes(h))
          && normalized.some(h=>['hub'].includes(h))
          && normalized.some(h=>['rider','rider name','driver','name'].includes(h));
      });
      if(headerRowIndex < 0) return map;
      const headers = parsedLines[headerRowIndex];
      const normalizedHeaders = headers.map(h => String(h||'').trim().toLowerCase());
const dateIdx = findSheetHeaderIndex(normalizedHeaders, ['date']);
      const nameIdx = findSheetHeaderIndex(normalizedHeaders, ['rider','rider name','driver','name']);
      const hubIdx = findSheetHeaderIndex(normalizedHeaders, ['hub','branch']);
      const countIdx = findSheetHeaderIndex(normalizedHeaders, ['count']);
      const statusIdx = findSheetHeaderIndex(normalizedHeaders, ['status']);
      for(let i=headerRowIndex+1;i<parsedLines.length;i++){
        const values = parsedLines[i];
        if(values.some(c => String(c||'').trim() !== '')){
          const name = String(values[nameIdx]||'').trim();
          const hub = hubIdx>=0 ? String(values[hubIdx]||'').trim() : '';
          const cnt = countIdx>=0 ? (parseFloat(String(values[countIdx]||'').replace(/[^\d.\-]/g,''))||0) : 0;
          // Determine the Monday-start week that this PNR record belongs to,
          // so the dashboard can show only the PNRs for the selected week.
          let week = '';
          if(dateIdx>=0){
            const dv = String(values[dateIdx]||'').trim().slice(0,10);
            const dObj = new Date(dv + 'T00:00:00');
            if(!isNaN(dObj)){
              week = toISODate(startOfWeek(dv));
            }
          }
const st = statusIdx>=0 ? String(values[statusIdx]||'').trim().toUpperCase().replace(/[^A-Z]/g,'') : '';
          if(name){
            const key = (name.toLowerCase().trim() + '|' + normalizeHub(hub) + '|' + week).trim();
            map.set(key, (map.get(key)||0) + cnt);
            if(st === 'NOTSOLVED') notSolvedPnrMap.set(key, (notSolvedPnrMap.get(key)||0) + cnt);
          }
        }
      }
    }catch(e){ /* ignore PNR sheet errors */ }
    return map;
  }

function escapeHtml2(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    var amp='&';
    var map = {'&':amp+'amp;','<':amp+'lt;','>':amp+'gt;','"':amp+'quot;',"'":amp+'#39;'};
    return map[c];
  });
}

  function parseSheetCsvLine(line){
    const values = [];
    let current = '', inQuotes = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"'){
        if(inQuotes && line[i+1] === '"'){ current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if(ch === ',' && !inQuotes){ values.push(current); current=''; }
      else { current += ch; }
    }
    values.push(current);
    return values;
  }

  // Normalize a hub value from the Google Sheet (e.g. "Bauko Hub") to the
  // hub key used by the dashboard ("bauko").
  function normalizeHub(h){
    return String(h||'').toLowerCase().replace(/\s*hub\s*$/,'').trim();
  }

  function findSheetHeaderIndex(headers, candidates){
    for(const candidate of candidates){
      const idx = headers.findIndex(h => h === candidate || h.includes(candidate));
      if(idx >= 0) return idx;
    }
    return -1;
  }

  async function loadRidersSheet(){
    const statusEl = $('#ridersStatus');
    if(!statusEl) return;
    try{
      const sheetName = RIDERS_HUB_SHEET[riders.currentHub] || RIDERS_HUB_SHEET.Buguias;
      const url = `https://docs.google.com/spreadsheets/d/${RIDERS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
      const response = await fetch(url);
      if(!response.ok) throw new Error('Unable to fetch sheet');
      const text = await response.text();
      const rawLines = text.split(/\r\n|\n|\r/);
      if(rawLines.length < 2) throw new Error('No rows found in sheet');

      const parsedLines = rawLines.map(parseSheetCsvLine);
      const headerRowIndex = parsedLines.findIndex(values => {
        const normalized = values.map(v => String(v||'').trim().toLowerCase());
        return normalized.some(h=>['rider name','rider','driver name','driver','name'].includes(h))
          && normalized.some(h=>['area','location'].includes(h));
      });
      if(headerRowIndex < 0) throw new Error('Header row not found in sheet');

      const headers = parsedLines[headerRowIndex];
      const expectedColumns = headers.length;
      const normalizedHeaders = headers.map(h => String(h||'').trim().toLowerCase());

      function isHeaderRow(values){
        const normalized = values.map(v => String(v||'').trim().toLowerCase());
        return normalizedHeaders.every((header, idx) => normalized[idx] === header || normalized[idx] === '');
      }

      const dataRows = parsedLines.slice(headerRowIndex + 1)
        .filter(row => row.some(cell => String(cell||'').trim() !== ''))
        .filter(row => !isHeaderRow(row))
        .map(row => row.concat(Array(Math.max(0, expectedColumns - row.length)).fill('')));

      const index = {
        riderName: findSheetHeaderIndex(normalizedHeaders, ['rider name','rider','driver name','driver','name']),
        area: findSheetHeaderIndex(normalizedHeaders, ['area','location']),
        contact: findSheetHeaderIndex(normalizedHeaders, ['contact #','contact','contact number','phone','mobile']),
        accountId: findSheetHeaderIndex(normalizedHeaders, ['account id','accountid','account','acct id']),
        agency: findSheetHeaderIndex(normalizedHeaders, ['agency','agencies']),
        status: findSheetHeaderIndex(normalizedHeaders, ['status','state']),
        hub: findSheetHeaderIndex(normalizedHeaders, ['hub','hubs','branch','branch name'])
      };
      riders.hasHubColumn = index.hub >= 0;

      const getCell = (values, i) => i >= 0 && values[i] !== undefined ? values[i].trim() : '';

      riders.allRows = dataRows.map(values => ({
        riderName: getCell(values, index.riderName),
        area: getCell(values, index.area),
        contact: getCell(values, index.contact),
        accountId: getCell(values, index.accountId),
        agency: getCell(values, index.agency),
        status: getCell(values, index.status),
        hub: riders.hasHubColumn ? getCell(values, index.hub) : ''
      })).filter(row => row.riderName || row.area || row.accountId || row.agency || row.status || row.hub);

      statusEl.textContent = `Loaded ${riders.allRows.length} rider records`;
      renderRidersStats();
      renderRidersRows();
    }catch(err){
      console.error(err);
      statusEl.innerHTML = '<span class="error" style="color:var(--brick);">Could not load the Google Sheet.</span>';
      $('#ridersRows').innerHTML = '<tr><td colspan="6" class="muted">No data available.</td></tr>';
      $('#ridersStatsRow').innerHTML = '';
    }
  }

  function getFilteredRiders(){
    if(!riders.hasHubColumn) return riders.allRows;
    const target = riders.currentHub.toLowerCase();
    return riders.allRows.filter(row => {
      const hubValue = String(row.hub||'').toLowerCase();
      return hubValue.includes(target) || hubValue === target;
    });
  }

  function renderRidersStats(){
    const wrap = $('#ridersStatsRow');
    if(!wrap) return;
    const rows = getFilteredRiders();
    const active = rows.filter(r => String(r.status||'').trim().toLowerCase() === 'active').length;
    const suspended = rows.filter(r => String(r.status||'').trim().toLowerCase() === 'suspended').length;
    const agencies = new Set(rows.map(r=>String(r.agency||'').trim()).filter(Boolean)).size;
    const stats = [
      {label:'Riders', value: rows.length, cls:''},
      {label:'Active', value: active, cls:'teal'},
      {label:'Suspended', value: suspended, cls:'brick'},
      {label:'Agencies', value: agencies, cls:''},
    ];
    wrap.innerHTML = stats.map((s,idx)=>`
      <div class="stat-card animate-in delay-${idx+1}">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value ${s.cls}" data-count="${s.value}">0</div>
      </div>
    `).join('');
    $$('#ridersStatsRow .stat-value').forEach(el=>{
      const target = el.getAttribute('data-count');
      animateCountUp(el, target, false);
    });
  }

  function renderRidersRows(){
    const tbody = $('#ridersRows');
    if(!tbody) return;
    let rows = getFilteredRiders();
    if(riders.search){
      const q = riders.search.toLowerCase();
      rows = rows.filter(r =>
        String(r.riderName||'').toLowerCase().includes(q) ||
        String(r.area||'').toLowerCase().includes(q) ||
        String(r.agency||'').toLowerCase().includes(q) ||
        String(r.accountId||'').toLowerCase().includes(q) ||
        String(r.contact||'').toLowerCase().includes(q)
      );
    }
    if(rows.length === 0){
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No rider records found for this hub.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const statusRaw = escapeHtml2(r.status||'');
      const statusNorm = String(r.status||'').trim().toLowerCase();
      const chipClass = statusNorm === 'active' ? 'status-active' : (statusNorm === 'suspended' ? 'status-suspended' : '');
      return `
        <tr>
          <td class="rider-cell"><b>${escapeHtml2(r.riderName)}</b></td>
          <td>${escapeHtml2(r.area)}</td>
          <td>${escapeHtml2(r.contact)}</td>
          <td>${escapeHtml2(r.accountId)}</td>
          <td>${escapeHtml2(r.agency)}</td>
          <td><span class="status-chip ${chipClass}">${statusRaw}</span></td>
        </tr>
      `;
    }).join('');
  }

  function openRidersModal(){
    $('#ridersOverlay').classList.add('show');
    $('#ridersSearch').value = '';
    riders.search = '';
    const statusEl = $('#ridersStatus');
    statusEl.textContent = 'Loading sheet…';
    $('#ridersRows').innerHTML = '<tr><td colspan="6" class="muted">Loading...</td></tr>';
    loadRidersSheet();
  }

  function closeRidersModal(){
    $('#ridersOverlay').classList.remove('show');
  }

function closeSettingsMenu(){
    const drawer = $('#settingsDrawer');
    const backdrop = $('#drawerBackdrop');
    const wheel = $('#settingsToggle');
    if(drawer) drawer.classList.remove('open');
    if(drawer) drawer.setAttribute('aria-hidden','true');
    if(backdrop) backdrop.hidden = true;
    if(wheel) wheel.classList.remove('open');
  }

  function wireStaticEvents(){
    $$('.route-stop').forEach(el=>{
      el.addEventListener('click', async ()=>{
        setActiveTab(el.dataset.hub);
        state.currentDate = null;
        await refreshView();
      });
    });

    $('#dateSelect').addEventListener('change', async e=>{
      state.currentDate = e.target.value;
      await refreshView();
    });

function openSettingsMenu(){
      const drawer = $('#settingsDrawer');
      const backdrop = $('#drawerBackdrop');
      const wheel = $('#settingsToggle');
      if(drawer) drawer.classList.add('open');
      if(drawer) drawer.setAttribute('aria-hidden','false');
      if(backdrop) backdrop.hidden = false;
      if(wheel) wheel.classList.add('open');
    }

const wheelBtn = $('#settingsToggle');
    wheelBtn.addEventListener('click', e=>{
      e.stopPropagation();
      const drawer = $('#settingsDrawer');
      if(drawer && drawer.classList.contains('open')) closeSettingsMenu();
      else openSettingsMenu();
    });

    /* ---- Drag the wheel to pull the option drawer open (from the left) ---- */
    let dragState = null;
    const wheel = wheelBtn;
    const drawerEl = $('#settingsDrawer');
    const backdropEl = $('#drawerBackdrop');

    function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

    function onDragStart(e){
      if(drawerEl && drawerEl.classList.contains('open')) return; // already open
      const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
      dragState = { startX: pt.clientX, startY: pt.clientY, moved:false };
      wheel.classList.add('dragging');
      wheel.classList.remove('open');
      document.body.style.userSelect = 'none';
    }
    function onDragMove(e){
      if(!dragState) return;
      const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
      const dx = pt.clientX - dragState.startX;
      const dy = pt.clientY - dragState.startY;
      // Require a mostly-horizontal drag toward the right to pull the left drawer open
      if(!dragState.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)){
        dragState.moved = true;
      }
      if(!dragState.moved) return;
      e.preventDefault();
      const travel = clamp(dx, 0, 300);
      if(drawerEl){
        drawerEl.style.transition = 'none';
        drawerEl.style.transform = `translateX(${-300 + travel}px)`;
      }
      if(backdropEl){
        backdropEl.hidden = false;
        backdropEl.style.opacity = 0.45 * (travel / 300);
      }
    }
    function onDragEnd(e){
      if(!dragState) return;
      const pt = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
      const dx = pt ? pt.clientX - dragState.startX : 0;
      const shouldOpen = dragState.moved && dx > 120;
      dragState = null;
      wheel.classList.remove('dragging');
      document.body.style.userSelect = '';
      if(drawerEl){
        drawerEl.style.transition = '';
        drawerEl.style.transform = '';
      }
      if(backdropEl) backdropEl.style.opacity = '';
      if(shouldOpen) openSettingsMenu();
      else closeSettingsMenu();
    }

    wheel.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    wheel.addEventListener('touchstart', onDragStart, {passive:true});
    window.addEventListener('touchmove', onDragMove, {passive:false});
    window.addEventListener('touchend', onDragEnd);
    window.addEventListener('touchcancel', onDragEnd);

    $('#drawerClose').addEventListener('click', closeSettingsMenu);
    $('#drawerBackdrop').addEventListener('click', closeSettingsMenu);

    $('#openUploadBtn').addEventListener('click', ()=>{
      closeSettingsMenu();
      openModal();
    });
    $('#deleteDateMenuBtn').addEventListener('click', ()=>{
      closeSettingsMenu();
      deleteSelectedDate();
    });
    $('#downloadRecordsBtn').addEventListener('click', ()=>{
      closeSettingsMenu();
      openDownloadModal();
    });
$('#openRidersPageBtn').addEventListener('click', ()=>{
      closeSettingsMenu();
      window.location.href = 'riders-agency.html';
    });
$('#openLossReportBtn').addEventListener('click', ()=>{
      closeSettingsMenu();
      window.location.href = 'loss-report.html';
    });
    $('#openPnrPageBtn').addEventListener('click', ()=>{
      closeSettingsMenu();
      window.location.href = 'pnr.html';
    });
    $('#cancelUpload').addEventListener('click', closeModal);
    $('#weekPrevBtn').addEventListener('click', ()=>{
      state.weekPickerMonth = new Date(state.weekPickerMonth.getFullYear(), state.weekPickerMonth.getMonth() - 1, 1);
      renderWeekPicker();
    });
    $('#weekNextBtn').addEventListener('click', ()=>{
      state.weekPickerMonth = new Date(state.weekPickerMonth.getFullYear(), state.weekPickerMonth.getMonth() + 1, 1);
      renderWeekPicker();
    });
    $('#downloadOverlay').addEventListener('click', e=>{ if(e.target.id==='downloadOverlay') closeDownloadModal(); });
    $('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') closeModal(); });

$('#downloadHubSelect').addEventListener('change', populateDownloadWeekOptions);
    $('#cancelDownload').addEventListener('click', closeDownloadModal);
    $('#confirmDownload').addEventListener('click', downloadRecords);

// Riders & Agency modal events
    $('#closeRiders').addEventListener('click', closeRidersModal);
    $('#ridersOverlay').addEventListener('click', e=>{ if(e.target.id==='ridersOverlay') closeRidersModal(); });

    // Sideways drag-to-scroll for the Riders modal table
    (function wireRidersTableDrag(){
      const wrap = document.getElementById('ridersTableWrap');
      const fadeEl = document.getElementById('ridersDragFade');
      const hintEl = document.getElementById('ridersDragHint');
      if(!wrap) return;
      let ds = null;
      function flows(){ return wrap.scrollWidth > wrap.clientWidth + 1; }
      function update(){
        if(!hintEl || !fadeEl) return;
        const ov = flows();
        const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 4;
        hintEl.style.opacity = (ov && !atEnd) ? '1' : '0';
        fadeEl.style.opacity = (ov && !atEnd) ? '1' : '0';
      }
      function start(e){
        if(e.target.closest('th')) return;
        const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
        ds = { sx: pt.clientX, sy: pt.clientY, sl: wrap.scrollLeft, moved:false };
        wrap.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
      }
      function move(e){
        if(!ds) return;
        const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
        const dx = pt.clientX - ds.sx, dy = pt.clientY - ds.sy;
        if(!ds.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) ds.moved = true;
        if(!ds.moved) return;
        if(e.cancelable) e.preventDefault();
        wrap.scrollLeft = ds.sl - dx;
        update();
      }
      function end(){
        if(!ds) return;
        ds = null;
        wrap.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        update();
      }
      wrap.addEventListener('mousedown', start);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      wrap.addEventListener('touchstart', start, { passive:true });
      window.addEventListener('touchmove', move, { passive:false });
      window.addEventListener('touchend', end);
      window.addEventListener('touchcancel', end);
      wrap.addEventListener('scroll', update);
      window.addEventListener('resize', update);
      setTimeout(update, 0);
    })();
    $('#ridersSearch').addEventListener('input', e=>{
      riders.search = e.target.value;
      renderRidersRows();
    });
    $$('#ridersHubTabs .riders-tab-btn').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(btn.dataset.hub === riders.currentHub) return;
        riders.currentHub = btn.dataset.hub;
        $$('#ridersHubTabs .riders-tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
        $('#ridersStatus').textContent = 'Loading sheet…';
        $('#ridersRows').innerHTML = '<tr><td colspan="6" class="muted">Loading...</td></tr>';
        await loadRidersSheet();
      });
    });

    $('#fileInput').addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
    $('#dropZone').addEventListener('dragover', e=>{ e.preventDefault(); $('#dropZone').classList.add('drag'); });
    $('#dropZone').addEventListener('dragleave', ()=>$('#dropZone').classList.remove('drag'));
    $('#dropZone').addEventListener('drop', e=>{
      e.preventDefault(); $('#dropZone').classList.remove('drag');
      if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    $('#confirmUpload').addEventListener('click', confirmUpload);
    $('#resetBtn').addEventListener('click', resetAll);

    $('#themeToggle').addEventListener('click', async ()=>{
      closeSettingsMenu();
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next);
      await saveTheme(next);
      if(state.rows.length) renderContent();
    });
  }

  init();
})();
