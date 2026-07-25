(function(){
  "use strict";

  /* ---------------- Field mapping ---------------- */
  const FIELD_MAP = [
    ['driver','driverRaw','raw'],
    ['vehicle type','vehicleType','raw'],
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

  const hasRealStorage = (typeof window.storage !== 'undefined') && window.storage
    && typeof window.storage.get === 'function' && typeof window.storage.set === 'function';

  const storage = hasRealStorage ? window.storage : {
    async get(key){
      const value = localStorage.getItem(key);
      return value===null ? null : {key, value};
    },
    async set(key,value){
      localStorage.setItem(key,value);
      return {key,value};
    },
    async delete(key){
      localStorage.removeItem(key);
      return {key, deleted:true};
    },
    async list(prefix=''){
      const keys=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(!prefix || k.startsWith(prefix)) keys.push(k);
      }
      return {keys};
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
  async function loadTheme(){
    try{
      const r = await storage.get('ui-theme', false);
      return r ? JSON.parse(r.value) : 'light';
    }catch(e){ return 'light'; }
  }
  async function saveTheme(mode){ try{ await storage.set('ui-theme', JSON.stringify(mode), false); }catch(e){} }
  function applyTheme(mode){
    document.body.classList.toggle('dark', mode==='dark');
    $('#themeIconSun').style.display = mode==='dark' ? 'none' : '';
    $('#themeIconMoon').style.display = mode==='dark' ? '' : 'none';
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
    trendChart: null,
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

  async function init(){
    if(!hasRealStorage){
      $('#storageBanner').innerHTML = `<div class="banner">
        <span>Running as a standalone dashboard. Uploaded manifests are now saved in your browser using localStorage and persist after refreshes.</span>
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
        opt.value = d; opt.textContent = fmtDate(d);
        dateSelect.appendChild(opt);
      });
      if(!state.currentDate || !dates.includes(state.currentDate)){
        state.currentDate = latestDate(dates);
      }
      dateSelect.value = state.currentDate;
    }

    $('#viewTitle').textContent = state.currentHub==='All' ? 'Both hubs' : state.currentHub;

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

    $('#viewSub').textContent = state.currentHub==='All'
      ? 'Combined snapshot — each hub shown as of its latest upload'
      : `Snapshot for ${fmtDate(state.currentDate)}`;

    renderContent();
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

  function renderContent(){
    const rows = state.rows;
    const active = rows.filter(r=>r.daysWorking>0);
    const avg = key => active.length ? active.reduce((a,r)=>a+r[key],0)/active.length : 0;
    const sum = key => rows.reduce((a,r)=>a+r[key],0);

    const kpis = [
      {label:'Riders on manifest', value: fmtNum(rows.length), sub:`${active.length} active`},
      {label:'Delivery success rate', value: fmtPct(avg('deliverySuccessRate')), cls: avg('deliverySuccessRate')>=90?'teal':(avg('deliverySuccessRate')<75?'brick':'' )},
      {label:'SLA achievement', value: fmtPct(avg('slaAchievementRate')), cls: avg('slaAchievementRate')>=90?'teal':(avg('slaAchievementRate')<75?'brick':'' )},
      {label:'Attendance rate', value: fmtPct(avg('attendanceRate'))},
      {label:'Parcels delivered', value: fmtNum(sum('parcelsDelivered')), sub:`${fmtNum(sum('parcelsAssigned'))} assigned`},
      {label:'Parcels on hold', value: fmtNum(sum('parcelsOnHold')), cls: sum('parcelsOnHold')>0?'brick':''},
    ];

    let html = '<div class="kpis">';
    kpis.forEach(k=>{
      html += `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value ${k.cls||''}">${k.value}</div>${k.sub?`<div class="kpi-sub">${k.sub}</div>`:''}</div>`;
    });
    html += '</div>';

    html += '<div class="panels">';
    html += `<div class="panel"><h3>Trend</h3><p class="hint">Delivery success, SLA and attendance over time</p><div id="trendWrap"></div></div>`;
    html += `<div class="panel"><h3>By driver group</h3><p class="hint">Avg. delivery success rate per group</p><canvas id="groupChart" height="180"></canvas></div>`;
    html += '</div>';

    html += '<div class="strip">';
    html += `<div class="panel"><h3>🟢 Top performers</h3><p class="hint">Highest delivery success (min. 1 active day)</p><div id="topList"></div></div>`;
    html += `<div class="panel"><h3>🔻 Needs attention</h3><p class="hint">Lowest delivery success (min. 1 active day)</p><div id="bottomList"></div></div>`;
    html += '</div>';

    html += `<div class="table-panel">
      <div class="table-controls">
        <input type="text" id="searchInput" placeholder="Search rider name or ID…">
        <select id="vehicleFilter"><option value="">All vehicle types</option></select>
        <select id="groupFilter"><option value="">All driver groups</option></select>
        <select id="gradeFilter"><option value="">All grades</option><option>A</option><option>B</option><option>C</option><option>D</option><option>Inactive</option></select>
      </div>
      <div class="table-scroll"><table><thead><tr id="theadRow"></tr></thead><tbody id="tbody"></tbody></table></div>
      <div class="row-count" id="rowCount"></div>
    </div>`;

    $('#content').innerHTML = html;

    renderTrend();
    renderGroupChart(rows);
    renderTopBottom(rows);
    setupTableControls(rows);
    renderTable();
  }

  function renderTrend(){
    const wrap = $('#trendWrap');
    if(state.currentHub==='All'){
      wrap.innerHTML = `<div class="trend-disabled">Pick Bauko or Buguias above to see its day-over-day trend.</div>`;
      return;
    }
    const summary = state.summaries[state.currentHub]||[];
    if(summary.length < 2){
      wrap.innerHTML = `<div class="trend-disabled">Upload at least one more day of data for ${state.currentHub} to see a trend line.</div>`;
      return;
    }
    wrap.innerHTML = `<canvas id="trendCanvas" height="180"></canvas>`;
    if(typeof Chart === 'undefined'){
      wrap.innerHTML = `<div class="trend-disabled">Chart library didn't load — check your connection and refresh to see the trend line.</div>`;
      return;
    }
    const ctx = $('#trendCanvas').getContext('2d');
    if(state.trendChart) state.trendChart.destroy();
    const cc = chartColors();
    state.trendChart = new Chart(ctx, {
      type:'line',
      data:{
        labels: summary.map(s=>fmtDate(s.date)),
        datasets:[
          {label:'Delivery success %', data:summary.map(s=>s.avgDeliverySuccess), borderColor:'#3F8F6D', backgroundColor:'transparent', tension:.25},
          {label:'SLA achievement %', data:summary.map(s=>s.avgSLA), borderColor:'#E8A33D', backgroundColor:'transparent', tension:.25},
          {label:'Attendance %', data:summary.map(s=>s.avgAttendance), borderColor:'#5B6472', backgroundColor:'transparent', tension:.25, borderDash:[4,3]},
        ]
      },
      options:{
        responsive:true,
        plugins:{legend:{position:'bottom',labels:{boxWidth:10,color:cc.text,font:{family:'IBM Plex Sans',size:11}}}},
        scales:{
          y:{beginAtZero:false,ticks:{color:cc.text,font:{size:10}},grid:{color:cc.grid}},
          x:{ticks:{color:cc.text,font:{size:10}},grid:{color:cc.grid}}
        }
      }
    });
  }

  let groupChartInstance = null;
  function renderGroupChart(rows){
    const groups = {};
    rows.forEach(r=>{
      if(r.daysWorking<=0) return;
      const g = r.driverGroup || 'Unspecified';
      if(!groups[g]) groups[g]={sum:0,n:0};
      groups[g].sum += r.deliverySuccessRate; groups[g].n++;
    });
    const labels = Object.keys(groups);
    const data = labels.map(g=>groups[g].sum/groups[g].n);
    const canvasEl = $('#groupChart');
    if(typeof Chart === 'undefined'){
      if(canvasEl) canvasEl.parentElement.innerHTML = '<div class="trend-disabled">Chart library didn\'t load — check your connection and refresh.</div>';
      return;
    }
    const ctx = canvasEl.getContext('2d');
    if(groupChartInstance) groupChartInstance.destroy();
    const cc = chartColors();
    groupChartInstance = new Chart(ctx,{
      type:'bar',
      data:{labels, datasets:[{data, backgroundColor:'#E8A33D', borderRadius:3, maxBarThickness:28}]},
      options:{
        indexAxis:'y',
        plugins:{legend:{display:false}},
        scales:{
          x:{max:100,ticks:{color:cc.text,font:{size:10}},grid:{color:cc.grid}},
          y:{ticks:{color:cc.text,font:{size:11}},grid:{color:cc.grid}}
        }
      }
    });
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
    {key:'driverGroup', label:'Group', type:'text'},
    {key:'attendDays', label:'Days', type:'num'},
    {key:'avgParcelsPerDay', label:'Parcels/Day', type:'num1'},
    {key:'deliverySuccessRate', label:'Delivery Success', type:'pct'},
    {key:'slaAchievementRate', label:'SLA', type:'pct'},
    {key:'attendanceRate', label:'Attendance', type:'pct'},
    {key:'parcelsOnHold', label:'On-hold', type:'num'},
    {key:'grade', label:'Grade', type:'grade'},
  ];

  function setupTableControls(rows){
    const vSel = $('#vehicleFilter'), gSel = $('#groupFilter');
    const vehicles = Array.from(new Set(rows.map(r=>r.vehicleType).filter(Boolean))).sort();
    const groups = Array.from(new Set(rows.map(r=>r.driverGroup).filter(Boolean))).sort();
    vehicles.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; vSel.appendChild(o); });
    groups.forEach(g=>{ const o=document.createElement('option'); o.value=g;o.textContent=g; gSel.appendChild(o); });
    vSel.value = state.filterVehicle; gSel.value = state.filterGroup; $('#gradeFilter').value = state.filterGrade;
    $('#searchInput').value = state.search;

    $('#searchInput').addEventListener('input', e=>{ state.search=e.target.value; renderTable(); });
    vSel.addEventListener('change', e=>{ state.filterVehicle=e.target.value; renderTable(); });
    gSel.addEventListener('change', e=>{ state.filterGroup=e.target.value; renderTable(); });
    $('#gradeFilter').addEventListener('change', e=>{ state.filterGrade=e.target.value; renderTable(); });

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

  function renderTable(){
    let rows = state.rows.slice();
    if(state.search){
      const q = state.search.toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || String(r.id).includes(q));
    }
    if(state.filterVehicle) rows = rows.filter(r=>r.vehicleType===state.filterVehicle);
    if(state.filterGroup) rows = rows.filter(r=>r.driverGroup===state.filterGroup);
    if(state.filterGrade) rows = rows.filter(r=>r.grade===state.filterGrade);

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
        if(c.type==='grade') return `<td><span class="badge" style="background:${GRADE_COLOR[r.grade]}">${r.grade}</span></td>`;
        if(c.type==='pct') return `<td class="num">${fmtPct(r[c.key])}</td>`;
        if(c.type==='num1') return `<td class="num">${(r[c.key]||0).toFixed(1)}</td>`;
        if(c.type==='num') return `<td class="num">${fmtNum(r[c.key])}</td>`;
        return `<td>${escapeHtml(r[c.key])}</td>`;
      }).join('') + '</tr>';
    }).join('');
    $('#rowCount').textContent = `Showing ${rows.length} of ${state.rows.length} riders`;
    if(rows.length===0){
      tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-dim);padding:24px;">No riders match these filters.</td></tr>`;
    }
  }

  let pendingFile = null, pendingParsedRows = null;

  function openModal(){
    $('#overlay').classList.add('show');
    $('#modalMsg').textContent = '';
    $('#dropText').innerHTML = '<b>Click to choose</b> or drag a .csv file here';
    pendingFile = null; pendingParsedRows = null;
    $('#confirmUpload').disabled = true;
    if(!$('#dateInput').value) $('#dateInput').valueAsDate = new Date();
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
    if(m) $('#dateInput').value = m[1];

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
    if(!date){ $('#modalMsg').textContent='Pick a report date.'; $('#modalMsg').className='modal-msg err'; return; }

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
      showToast(`Added <b>${hub}</b> — ${fmtDate(date)} (${pendingParsedRows.length} riders)`);

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

    $('#openUploadBtn').addEventListener('click', openModal);
    $('#cancelUpload').addEventListener('click', closeModal);
    $('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') closeModal(); });

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
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next);
      await saveTheme(next);
      if(state.rows.length) renderContent();
    });
  }

  init();
})();
