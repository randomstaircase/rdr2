// ═══════════════════ STATE ═══════════════════
let db = { playthroughs: {}, inventory: {} };
let pt = null;

function D() { return pt ? (db.playthroughs[pt] || {}) : {}; }
function setD(id, val) {
  if (!pt) return;
  if (!db.playthroughs[pt]) db.playthroughs[pt] = {};
  if (val === null || val === false || val === undefined) delete db.playthroughs[pt][id];
  else db.playthroughs[pt][id] = val;
  saveLocal(); debouncedSync();
}

// Inventory is global (not per-playthrough)
function getInv(mat) { return parseInt((pt ? D()['inv_'+mat] : db.inventory[mat]) || 0); }
function setInv(mat, val) {
  db.inventory[mat] = Math.max(0, parseInt(val) || 0);
  saveLocal(); debouncedSync();
  refreshTrapperCan();
}

function bumpInv(mat, delta) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const newVal = Math.max(0, getInv(mat) + delta);
  setD('inv_' + mat, newVal || null);
  const numEl = document.getElementById('inv-num-' + slug(mat));
  if (numEl) numEl.textContent = newVal;
  refreshTrapperCan();
}

function getCfg() {
  return { repo: localStorage.getItem('rdr2_repo')||'', branch: localStorage.getItem('rdr2_branch')||'main', token: localStorage.getItem('rdr2_token')||'' };
}
function saveCfg() {
  // GitHub fields kept as hidden stubs — no longer shown in UI
  const crEl = document.getElementById('cr'); if (crEl) localStorage.setItem('rdr2_repo', crEl.value);
  const cbEl = document.getElementById('cb'); if (cbEl) localStorage.setItem('rdr2_branch', cbEl.value || 'main');
  const ctEl = document.getElementById('ct'); if (ctEl) localStorage.setItem('rdr2_token', ctEl.value);
  const gasEl = document.getElementById('gas-url');
  if (gasEl && gasEl.value.trim()) localStorage.setItem('rdr2_gas_url', gasEl.value.trim());
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }


// ═══════════════════ SYNC CODE (no-account cross-device sync) ═══════════════════
// How it works: generates a 6-char code. User shares it. Other devices enter it.
// Data is stored in localStorage under that code key. To sync across devices,
// user exports from one device (copies the shareable link/data) and imports on another.
// For LIVE sync without a server: we use a free public JSONBin bin tied to the code.
// JSONBin free tier: 10k requests/month, perfect for personal use.
// If user doesn't want JSONBin, they can just share the code and use Export/Import.

let syncCode = localStorage.getItem('rdr2_synccode') || '';

function createSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
  syncCode = code;
  localStorage.setItem('rdr2_synccode', code);
  const el = document.getElementById('sync-code');
  if (el) el.value = code;
  setSyncStatus('Code created: ' + code + ' — share this with your other devices', 'ok');
  saveLocal();
}

function joinSyncCode() {
  const inp = document.getElementById('sync-code');
  const code = (inp ? inp.value : '').trim().toUpperCase();
  if (code.length !== 6) { setSyncStatus('Enter a 6-character code', 'err'); return; }
  syncCode = code;
  localStorage.setItem('rdr2_synccode', code);
  // Try to load data stored under this code
  const stored = localStorage.getItem('rdr2_data_' + code);
  if (stored) {
    try {
      db = JSON.parse(stored);
      if (!db.inventory) db.inventory = {};
          renderPTSel();
      buildAllTabs();
      if (pt) renderAllChecks();
      setSyncStatus('Joined code ' + code + ' — data loaded ✓', 'ok');
    } catch(e) { setSyncStatus('Code joined but no data found yet', ''); }
  } else {
    setSyncStatus('Joined code ' + code + ' — no data yet (save something to populate)', '');
  }
}

function setSyncStatus(msg, type) {
  const el = document.getElementById('sync-code-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type==='ok' ? 'var(--success)' : type==='err' ? 'var(--accent)' : 'var(--muted)';
}

// Override saveLocal to also save under sync code
const _origSaveLocal = typeof saveLocal !== 'undefined' ? null : null;

// ═══════════════════ THEME ═══════════════════
function selectTheme(name) {
  localStorage.setItem('rdr2_theme', name);
  applyTheme();
}
function applyTheme() {
  const t = localStorage.getItem('rdr2_theme') || '';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', (c.getAttribute('data-theme') || '') === t);
  });
}

// ═══════════════════ GOOGLE APPS SCRIPT SYNC ═══════════════════
function getGasUrl() {
  const url = localStorage.getItem('rdr2_gas_url') || '';
  if (!url) { setGasStatus('No Script URL saved — paste it above.', 'err'); return null; }
  return url;
}
function setGasStatus(msg, type) {
  const el = document.getElementById('gas-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type==='ok' ? '#7ecf70' : type==='err' ? '#f08080' : 'var(--muted)';
}
function gasGet(action, extraParams) {
  const baseUrl = getGasUrl();
  if (!baseUrl) throw new Error('No Script URL');
  const params = new URLSearchParams({ action, ...(extraParams||{}) });
  const fullUrl = baseUrl + '?' + params.toString();
  return new Promise((resolve, reject) => {
    const cbName = '_rdr2Cb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out — Apps Script may be slow to start.')); }, 90000);
    function cleanup() { clearTimeout(timer); delete window[cbName]; const el=document.getElementById(cbName); if(el)el.remove(); }
    window[cbName] = function(data) { cleanup(); if(data&&data.error) reject(new Error(data.error)); else resolve(data); };
    const script = document.createElement('script');
    script.id = cbName; script.src = fullUrl + '&callback=' + cbName;
    script.onerror = function() { cleanup(); reject(new Error('Script load failed — deploy Web App as "Anyone"')); };
    document.head.appendChild(script);
  });
}
async function gasPost(body) {
  const baseUrl = getGasUrl();
  if (!baseUrl) throw new Error('No Script URL');
  await fetch(baseUrl, { method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(body), mode:'no-cors', redirect:'follow' });
  return { status:'sent' };
}
// ── Label lookup helpers for readable Sheet rows ──
function getAnLabel(i, j) {
  const a = AN[i]; if (!a) return null;
  const cols = AN_COLS; // ['TRACKED','KILLED','SKINNED','STUDIED']
  if (!a[j+2]) return null; // col not active for this animal
  return { category: 'Animals - ' + a[0], item: a[1], action: cols[j] };
}
function getPlLabel(i, j) {
  const p = PL[i]; if (!p) return null;
  const cols = PL_COLS; // ['PICKED','RECIPE','HERBALIST']
  if (!p[j+2]) return null;
  return { category: 'Plants - ' + p[0], item: p[1], action: cols[j] };
}
function getFiLabel(i, j, isLeg) {
  const arr = isLeg ? FI.filter(f=>f[1]) : FI.filter(f=>!f[1]);
  const f = arr[i]; if (!f) return null;
  const cols = isLeg ? ['CAUGHT'] : FI_COLS_NORM;
  return { category: isLeg ? 'Fish - Legendary' : 'Fish', item: f[0], action: cols[j] };
}
function getHoLabel(i, j) {
  const h = HO[i]; if (!h) return null;
  return { category: 'Horses - ' + h[0], item: h[1] + ' (' + h[2] + ')', action: HO_COLS[j] };
}
function getWeLabel(i) {
  const w = WE[i]; if (!w) return null;
  return { category: 'Weapons - ' + w[0], item: w[1], action: 'OBTAINED' };
}
function getEqLabel(i) {
  const e = EQ[i]; if (!e) return null;
  return { category: 'Equipment - ' + e[0], item: e[1], action: 'OBTAINED' };
}
function getPeLabel(i) {
  const p = PE[i]; if (!p) return null;
  return { category: 'Camp - ' + p[0], item: p[1], action: 'COMPLETE' };
}
function getChLabel(set, lvl) {
  const tasks = CH[set]; if (!tasks || !tasks[lvl]) return null;
  return { category: 'Challenges - ' + set, item: tasks[lvl][0], action: tasks[lvl][1].slice(0,60) };
}
function getStLabel(chapter, idx) {
  const missions = ST[chapter]; if (!missions || !missions[idx]) return null;
  return { category: 'Story - ' + chapter, item: missions[idx], action: 'COMPLETE' };
}
function getAcLabel(i) {
  const a = AC[i]; if (!a) return null;
  return { category: 'Achievements - ' + a[1], item: a[0], action: 'UNLOCKED' };
}

// Decode a raw db key into a readable label object {category,item,action}
function decodeKey(rawKey) {
  // an_6_0  → animal index 6, col 0
  let m;
  if ((m = rawKey.match(/^an_(\d+)_(\d+)$/)))    return getAnLabel(+m[1],+m[2]);
  if ((m = rawKey.match(/^pl_(\d+)_?(\d+)?$/))) {
    const j = m[2] !== undefined ? +m[2] : 0;
    return getPlLabel(+m[1], j);
  }
  if ((m = rawKey.match(/^fi_(\d+)_(\d+)$/)))    return getFiLabel(+m[1],+m[2],false);
  if ((m = rawKey.match(/^fl_(\d+)_(\d+)$/)))    return getFiLabel(+m[1],+m[2],true);
  if ((m = rawKey.match(/^ho_(\d+)_(\d+)$/)))    return getHoLabel(+m[1],+m[2]);
  if ((m = rawKey.match(/^ho_hm_(.+)$/))) {
    const breed = m[1].replace(/_/g,' ').toUpperCase();
    return { category:'Horses - Horseman Challenge', item: breed, action:'COMPLETE' };
  }
  if ((m = rawKey.match(/^we_(\d+)$/)))           return getWeLabel(+m[1]);
  if ((m = rawKey.match(/^eq_(\d+)$/)))           return getEqLabel(+m[1]);
  if ((m = rawKey.match(/^pe_(\d+)_done$/)))      return getPeLabel(+m[1]);
  if ((m = rawKey.match(/^pe_(\d+)_r(\d+)$/))) {
    const p = PE[+m[1]]; if (!p) return null;
    const req = p[2][+m[2]]; if (!req) return null;
    return { category:'Camp - ' + p[0], item: p[1], action: req[0] + ' x' + req[1] };
  }
  if ((m = rawKey.match(/^ch_([^_]+(?:_[^_]+)*)_(\d+)$/))) {
    // ch set uses slug — reverse slug to find CH key
    const chKey = Object.keys(CH).find(k => slug(k) === m[1]);
    if (chKey) return getChLabel(chKey, +m[2]);
  }
  if ((m = rawKey.match(/^st_(.+)_(\d+)_([bsg])$/))) {
    const chapter = Object.keys(ST).find(k => slug(k) === m[1]);
    if (chapter) {
      const medal = m[3]==='b'?'Bronze':m[3]==='s'?'Silver':'Gold';
      const missions = ST[chapter]; if (!missions||!missions[+m[2]]) return null;
      return { category:'Story - ' + chapter, item: missions[+m[2]], action: medal + ' Medal' };
    }
  }
  if ((m = rawKey.match(/^st_(.+)_(\d+)$/))) {
    const chapter = Object.keys(ST).find(k => slug(k) === m[1]);
    if (chapter) return getStLabel(chapter, +m[2]);
  }
  if ((m = rawKey.match(/^ac_(\d+)$/)))           return getAcLabel(+m[1]);
  // Cigarette cards
  if ((m = rawKey.match(/^cig_(.+)_(\d+)$/))) {
    const setKey = Object.keys(CIG).find(k => slug(k) === m[1]);
    if (setKey) {
      const cards = CIG[setKey].cards; const card = cards[+m[2]];
      return { category: 'Cig Cards - ' + setKey, item: card ? card[0] : 'Card ' + m[2], action: 'COLLECTED' };
    }
  }
  // Collections
  if ((m = rawKey.match(/^dino_(\d+)$/)))  return { category:'Collections - Dinosaur Bones', item: DINO_BONES[+m[1]] ? DINO_BONES[+m[1]][0] : 'Bone '+m[1], action:'FOUND' };
  if ((m = rawKey.match(/^dc_(\d+)$/)))    return { category:'Collections - Dreamcatchers', item: DREAMCATCHERS[+m[1]] ? DREAMCATCHERS[+m[1]][0] : 'DC '+m[1], action:'FOUND' };
  if ((m = rawKey.match(/^rock_(\d+)$/)))  return { category:'Collections - Rock Carvings', item: ROCK_CARVINGS[+m[1]] ? ROCK_CARVINGS[+m[1]][0] : 'Carving '+m[1], action:'FOUND' };
  if ((m = rawKey.match(/^grave_(\d+)$/))) return { category:'Collections - Graves', item: GRAVES[+m[1]] ? GRAVES[+m[1]][0] : 'Grave '+m[1], action:'VISITED' };
  if ((m = rawKey.match(/^hunt_(\d+)_(\d+)$/))) {
    const req = HUNTING_REQUESTS[+m[1]]; if (!req) return null;
    const animal = req.animals[+m[2]]; if (!animal) return null;
    return { category:'Collections - Hunting Requests', item: req.list + ': ' + animal[0], action:'SENT' };
  }
  if ((m = rawKey.match(/^exotic_(\d+)_(\d+)$/))) {
    const req = EXOTICS[+m[1]]; if (!req) return null;
    const item = req.items[+m[2]]; if (!item) return null;
    return { category:'Collections - Exotic Requests', item: req.req + ': ' + item[0], action:'COLLECTED' };
  }
  if ((m = rawKey.match(/^treas_(\d+)_(\d+)$/))) {
    const t = TREASURES[+m[1]]; if (!t) return null;
    return { category:'Collections - Treasure Hunts', item: t.name, action: t.clues[+m[2]] ? t.clues[+m[2]].slice(0,60) : 'Clue '+m[2] };
  }
  // Trapper pieces
  if ((m = rawKey.match(/^trp_(\d+)_(\d+)$/))) {
    const outfit = TR_OUTFITS[+m[1]]; if (!outfit) return null;
    const piece  = outfit.pieces[+m[2]]; if (!piece) return null;
    return { category:'Trapper - ' + outfit.name, item: piece[0], action:'CRAFTED' };
  }
  if ((m = rawKey.match(/^tri_(\d+)$/))) {
    const item = TR_ITEMS[+m[1]]; if (!item) return null;
    return { category:'Trapper - ' + item[0], item: item[1], action:'CRAFTED' };
  }
  // Inventory (per-playthrough)
  if ((m = rawKey.match(/^inv_(.+)$/))) return { category:'Inventory', item: m[1], action:'QTY' };
  return null; // unknown key — skip
}

async function testGasConn() {
  setGasStatus('Testing connection…');
  try {
    const data = await gasGet('ping', {});
    setGasStatus('✓ ' + (data.msg || 'Connected') + ' — ' + (data.tabs||0) + ' playthrough tab(s) in Sheet.', 'ok');
  } catch(e) { setGasStatus('✗ ' + e.message, 'err'); }
}

// ── Build rows for one playthrough ──
function ptToRows(ptName, ptData) {
  const rows = [];
  Object.entries(ptData || {}).forEach(([rawKey, val]) => {
    if (!val && val !== 0) return;
    const label = decodeKey(rawKey);
    if (!label) return;
    rows.push({
      rawKey,
      category: label.category,
      item:     label.item,
      action:   label.action,
      val:      val === true ? '✓' : String(val),
    });
  });
  return rows;
}

function metaToRows() { return []; } // meta is empty — gold removed, inventory is per-pt

// ── Restore db from pull response ──
function pullToDb(data) {
  const newDb = { playthroughs:{}, inventory: {} };

  // Restore each playthrough tab
  Object.entries(data.playthroughs || {}).forEach(([ptName, rows]) => {
    const ptData = {};
    rows.forEach(r => {
      if (!r.rawKey) return;
      if      (r.val === '✓' || r.val === 'true')  ptData[r.rawKey] = true;
      else if (r.val === 'false' || r.val === '')   return; // skip falsy
      else if (!isNaN(r.val) && r.val !== '')       ptData[r.rawKey] = Number(r.val);
      else                                           ptData[r.rawKey] = r.val;
    });
    if (Object.keys(ptData).length > 0) newDb.playthroughs[ptName] = ptData;
  });

  // Restore meta (gold only — inventory restored via pt data naturally)
  (data.meta || []).forEach(r => {
    if (r.rawKey === 'gold') newDb.gold = parseFloat(r.val) || 0;
  });

  return newDb;
}

// ── Push: clear + rewrite each playthrough tab ──
async function runGasPush() {
  if (!getGasUrl()) return;
  setGasStatus('Pushing to Sheet…');
  try {
    const pts = Object.entries(db.playthroughs || {});
    let done = 0;
    for (const [ptName, ptData] of pts) {
      setGasStatus('Pushing "' + ptName + '" (' + (++done) + '/' + pts.length + ')…');
      const rows = ptToRows(ptName, ptData);
      await gasPost({ action:'pushPlaythrough', pt: ptName, rows });
    }
    // Push meta (gold, inventory)
    await gasPost({ action:'pushMeta', rows: metaToRows() });
    setGasStatus('✓ Pushed ' + pts.length + ' playthrough(s) to Sheet.', 'ok');
    showSS('Pushed to Sheet', 'ok');
  } catch(e) { setGasStatus('✗ Push failed: ' + e.message, 'err'); }
}

// ── Pull: load all tabs from Sheet into db ──
async function runGasPull() {
  if (!getGasUrl()) return;
  setGasStatus('Pulling from Sheet…');
  try {
    const data = await gasGet('pull', {});
    if (!data || !data.playthroughs) { setGasStatus('No data in Sheet yet — push first.', 'err'); return; }
    const ptCount = Object.keys(data.playthroughs).length;
    if (ptCount === 0) { setGasStatus('Sheet is empty — push your data first.', 'err'); return; }
    db = pullToDb(data);
    saveLocal(); renderPTSel(); buildAllTabs();
    if (pt && db.playthroughs[pt]) renderAllChecks();
    setGasStatus('✓ Pulled ' + ptCount + ' playthrough(s) from Sheet.', 'ok');
    showSS('Pulled from Sheet', 'ok');
  } catch(e) { setGasStatus('✗ Pull failed: ' + e.message, 'err'); }
}

// ── Sync: pull remote → merge → push everything back ──
async function runGasSync() {
  if (!getGasUrl()) return;
  setGasStatus('Step 1/2: Pulling from Sheet…');
  try {
    // Step 1: Pull remote
    const data = await gasGet('pull', {});
    const remotePts = data && data.playthroughs ? data.playthroughs : {};
    const remotePtCount = Object.keys(remotePts).length;

    if (remotePtCount > 0) {
      const remote = pullToDb(data);
      // Merge: local playthroughs take priority, but pull in any
      // playthroughs that exist remotely but not locally
      Object.entries(remote.playthroughs).forEach(([ptName, ptData]) => {
        if (!db.playthroughs[ptName]) {
          // New playthrough from remote — add it
          db.playthroughs[ptName] = ptData;
        } else {
          // Merge: combine keys, local wins on conflicts
          db.playthroughs[ptName] = Object.assign({}, ptData, db.playthroughs[ptName]);
        }
      });
      // Take remote gold if local has none
      saveLocal(); renderPTSel(); buildAllTabs();
      if (pt && db.playthroughs[pt]) renderAllChecks();
      setGasStatus('Step 2/2: Pushing merged data…');
    } else {
      setGasStatus('Step 2/2: Sheet empty — pushing local data…');
    }

    // Step 2: Push everything (clear + rewrite all tabs)
    await runGasPush();
    setGasStatus('✓ Sync complete! Sheet has one tab per playthrough.', 'ok');
    showSS('Sync complete', 'ok');
  } catch(e) { setGasStatus('✗ Sync failed: ' + e.message, 'err'); }
}

// ── Delete playthrough from Sheet when deleted locally ──
async function deletePlaythroughFromSheet(ptName) {
  if (!getGasUrl()) return;
  try {
    await gasPost({ action:'deletePlaythrough', pt: ptName });
  } catch(e) { /* silent — deletion is best-effort */ }
}

// ═══════════════════ JSON BACKUP ═══════════════════
function exportJSON() {
  const json = JSON.stringify(db, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
  a.download = 'rdr2-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  showSS('JSON backup downloaded', 'ok');
}
function importJSON(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.playthroughs) throw new Error('Invalid backup — missing playthroughs');
      if (!confirm('This will overwrite ALL current data. Continue?')) return;
      db = parsed;
      if (!db.inventory) db.inventory = {};
      saveLocal(); renderPTSel(); buildAllTabs();
      if (pt && db.playthroughs[pt]) renderAllChecks();
      showSS('JSON backup restored', 'ok');
    } catch(err) { showSS('Restore failed: ' + err.message, 'err'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ═══════════════════ GOLD ═══════════════════


// ═══════════════════ INIT ═══════════════════
async function init() {
  const cfg = getCfg();
  document.getElementById('cr').value = cfg.repo;
  document.getElementById('cb').value = cfg.branch;
  document.getElementById('ct').value = cfg.token;
  if (cfg.repo && cfg.token) await loadFromGH();
  else { const l = localStorage.getItem('rdr2_db'); if (l) try { db = JSON.parse(l); } catch(e){} }
  if (!db.inventory) db.inventory = {};
  applyTheme();
  const gasUrl=localStorage.getItem('rdr2_gas_url')||''; const gasEl=document.getElementById('gas-url'); if(gasEl&&gasUrl)gasEl.value=gasUrl;
  // Load sync code if previously set
  syncCode = localStorage.getItem('rdr2_synccode') || '';
  if (syncCode) {
    const el = document.getElementById('sync-code');
    if (el) el.value = syncCode;
  }
  renderPTSel();
  buildAllTabs();
  // Set sticky top for inventory panel based on actual bar height
  requestAnimationFrame(updateStickyTop);
  new ResizeObserver(updateStickyTop).observe(document.getElementById('sticky-bar'));
}

function updateStickyTop() {
  const bar = document.getElementById('sticky-bar');
  if (!bar) return;
  const h = bar.offsetHeight;
  document.documentElement.style.setProperty('--sticky-top', h + 'px');
}

// ═══════════════════ PLAYTHROUGH ═══════════════════
function renderPTSel() {
  const sel = document.getElementById('pts');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select Playthrough —</option>';
  Object.keys(db.playthroughs).forEach(n => {
    const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
  });
  if (prev && db.playthroughs[prev]) sel.value = prev;
}
function switchPT(name) {
  pt = name || null;
  document.getElementById('nopt').classList.toggle('vis', !pt);
  document.querySelectorAll('.tp').forEach(p => p.style.opacity = pt ? '1' : '0.35');
  if (pt) renderAllChecks();
  updateOverview();
}
function openMo()  { document.getElementById('mo').classList.add('open'); setTimeout(() => document.getElementById('pti').focus(), 50); }
function closeMo() { document.getElementById('mo').classList.remove('open'); }
function openRenamePT() {
  if (!pt) { alert('Select a playthrough to rename.'); return; }
  const mo = document.getElementById('mo-rename');
  const inp = document.getElementById('rename-input');
  if (inp) inp.value = pt;
  if (mo) mo.style.display = 'flex';
  setTimeout(() => { if(inp){inp.focus();inp.select();} }, 50);
}
function closeRenameMo() {
  const mo = document.getElementById('mo-rename');
  if (mo) mo.style.display = 'none';
}
function confirmRename() {
  const newName = (document.getElementById('rename-input').value || '').trim();
  if (!newName) return;
  if (newName === pt) { closeRenameMo(); return; }
  if (db.playthroughs[newName]) { alert('A playthrough with that name already exists.'); return; }
  db.playthroughs[newName] = db.playthroughs[pt];
  delete db.playthroughs[pt];
  pt = newName;
  closeRenameMo();
  renderPTSel();
  document.getElementById('pts').value = newName;
  saveLocal(); syncGH();
}
function deletePT() {
  if (!pt) { alert('Select a playthrough first.'); return; }
  if (!confirm('Delete "' + pt + '"? This cannot be undone.')) return;
  const deleted = pt;
  delete db.playthroughs[pt];
  pt = null;
  renderPTSel();
  document.getElementById('pts').value = '';
  switchPT('');
  saveLocal();
  // Remove the Sheet tab for this playthrough
  deletePlaythroughFromSheet(deleted);
}
function confPT() {
  const name = document.getElementById('pti').value.trim();
  if (!name) return;
  if (db.playthroughs[name]) { alert('Name already exists.'); return; }
  db.playthroughs[name] = {};
  closeMo(); renderPTSel();
  document.getElementById('pts').value = name;
  switchPT(name); saveLocal();
}

// ═══════════════════ BUILD TABS ═══════════════════
function buildAllTabs() {
  buildAnimals(); buildPlants(); buildFish(); buildHorses();
  buildWeapons(); buildEquip(); buildTrapper(); buildPearson();
  buildChallenges(); buildStory(); buildAchieve(); buildCollections();
}

// ── Section header helper — collapsible ──
// Returns header HTML; caller must wrap content in <div class="coll-body open" id="cb_PROGID">...</div>
function secHdr(title, progId, total) {
  const sid = progId;
  return `<div class="coll-hdr open" id="ch_${sid}" onclick="toggleSec('${sid}')">
    <span class="coll-arrow">▶</span>
    <span class="coll-title">${title}</span>
    <span class="coll-prog" id="${sid}">0/${total}</span>
  </div>`;
}
function secBody(progId) {
  return `<div class="coll-body open" id="cb_${progId}">`;
}
function secBodyEnd() { return '</div>'; }

// ── Multi-check row helper ──
function mcRow(prefix, i, label, cols, colLabels, extraClass, subtitle) {
  const cells = cols.map((active, j) => {
    if (!active) return `<div class="mc na"><div class="mcl">${colLabels[j]}</div><div class="mb"></div></div>`;
    return `<div class="mc" onclick="toggleMC('${prefix}${i}',${j})"><div class="mcl">${colLabels[j]}</div><div class="mb" id="mb_${prefix}${i}_${j}"></div></div>`;
  }).join('');
  const labelHtml = subtitle
    ? `<div>${label}<small style="display:block;font-size:10px;color:var(--muted);margin-top:1px;">${subtitle}</small></div>`
    : label;
  return `<div class="mr${extraClass?' '+extraClass:''}" id="mr_${prefix}${i}"><div class="ml">${labelHtml}</div><div class="mcc">${cells}</div></div>`;
}

// ── Simple item row ──
function simRow(id, name, sub) {
  return `<div class="ir" id="ir_${id}" onclick="toggleSimple('${id}')">
    <div class="ick" id="ick_${id}"></div>
    <div><div class="in">${name}</div>${sub?`<div class="isb">${sub}</div>`:''}</div>
  </div>`;
}

// ── ANIMALS ──
function buildAnimals() {
  const el = document.getElementById('tab-animals');
  const groups = [...new Set(AN.map(a=>a[0]))];
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-animals" onclick="toggleAllSec('tab-animals','btn-toggle-animals')">Collapse All</button></div>`;
  groups.forEach(grp => {
    const items = AN.filter(a=>a[0]===grp);
    const tot = items.reduce((s,a)=>[a[2],a[3],a[4],a[5]].reduce((ss,v)=>ss+(v?1:0),s),0);
    html += secHdr(grp, `ap_${slug(grp)}`, tot);
    html += secBody(`ap_${slug(grp)}`);
    AN.forEach((a,i) => { if (a[0]===grp) html += mcRow('an_',i,a[1],[a[2],a[3],a[4],a[5]],AN_COLS); });
    html += secBodyEnd();
  });
  el.innerHTML = html;
}

// ── PLANTS ──
function buildPlants() {
  const el = document.getElementById('tab-plants');
  const cats = [...new Set(PL.map(p=>p[0]))];
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-plants" onclick="toggleAllSec('tab-plants','btn-toggle-plants')">Collapse All</button></div>`;
  cats.forEach(cat => {
    const items = PL.filter(p=>p[0]===cat);
    // For orchids, no recipe col
    const isOrchid = cat === 'ORCHID';
    const tot = items.reduce((s,p)=>{
      const cols = isOrchid?[p[2],0,p[4]]:[p[2],p[3],p[4]];
      return s + cols.reduce((ss,v)=>ss+(v?1:0),0);
    },0);
    html += secHdr(cat, `pp_${slug(cat)}`, tot);
    html += secBody(`pp_${slug(cat)}`);
    PL.forEach((p,i) => {
      if (p[0]!==cat) return;
      const cols = isOrchid?[p[2],0,p[4]]:[p[2],p[3],p[4]];
      const labels = isOrchid?['PICKED','','HERBALIST']:PL_COLS;
      // custom build for orchid (skip recipe)
      if (isOrchid) {
        const cells = [[p[2],'PICKED',0],[0,'',1],[p[4],'HERBALIST',2]].map(([active,lbl,j]) => {
          if (!active && lbl==='') return '<div class="mc na" style="visibility:hidden"><div class="mcl">—</div><div class="mb"></div></div>';
          if (!active) return `<div class="mc na"><div class="mcl">${lbl}</div><div class="mb"></div></div>`;
          return `<div class="mc" onclick="toggleMC('pl_',${i},${j} )"><div class="mcl">${lbl}</div><div class="mb" id="mb_pl_${i}_${j}"></div></div>`;
        }).join('');
        // simpler: just show PICKED + HERBALIST for orchids
        const c2 = [
          `<div class="mc" onclick="toggleMC('pl_${i}',0)"><div class="mcl">PICKED</div><div class="mb" id="mb_pl_${i}_0"></div></div>`,
          `<div class="mc na" style="opacity:.1"><div class="mcl">RECIPE</div><div class="mb"></div></div>`,
          `<div class="mc" onclick="toggleMC('pl_${i}',2)"><div class="mcl">HERBALIST</div><div class="mb" id="mb_pl_${i}_2"></div></div>`,
        ].join('');
        html += `<div class="mr" id="mr_pl_${i}"><div class="ml">${p[1]}</div><div class="mcc">${c2}</div></div>`;
      } else {
        html += mcRow('pl_',i,p[1],[p[2],p[3],p[4]],PL_COLS);
      }
    });
    html += secBodyEnd();
  });
  el.innerHTML = html;
}

// ── FISH: Caught + Survivalist for regular; Caught-only for legendary ──
const FI_COLS_NORM = ['CAUGHT','SURVIVALIST'];

function buildFish() {
  const el = document.getElementById('tab-fish');
  const normal = FI.filter(f=>!f[1]);
  const leg    = FI.filter(f=>f[1]);

  // 2 checkboxes per normal fish (Caught + Survivalist)
  const normTot = normal.length * 2;
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-fish" onclick="toggleAllSec('tab-fish','btn-toggle-fish')">Collapse All</button></div>`;
  html += secHdr(`Fish (${normal.length} species)`, 'fp_fish', normTot);
  html += secBody('fp_fish');
  normal.forEach((f,i) => {
    const cells = FI_COLS_NORM.map((lbl,j) =>
      `<div class="mc" onclick="toggleMC('fi_${i}',${j})">
        <div class="mcl">${lbl}</div>
        <div class="mb" id="mb_fi_${i}_${j}"></div>
      </div>`
    ).join('');
    html += `<div class="mr" id="mr_fi_${i}">
      <div class="ml">${f[0]}</div>
      <div class="mcc">${cells}</div>
    </div>`;
  });

  html += secBodyEnd();
  html += '<div class="orn">✦ ✦ ✦</div>';
  html += secHdr(`Legendary Fish (${leg.length})`, 'fp_leg', leg.length);
  html += secBody('fp_leg');
  leg.forEach((f,i) => {
    html += `<div class="mr" id="mr_fl_${i}">
      <div class="ml">${f[0]}</div>
      <div class="mcc"><div class="mc" onclick="toggleMC('fl_${i}',0)"><div class="mcl">CAUGHT</div><div class="mb" id="mb_fl_${i}_0"></div></div></div>
    </div>`;
  });
  html += secBodyEnd();
  el.innerHTML = html;
}

// ── HORSES ── [breed, coat, type, location, hasHorseman]
function buildHorses() {
  const el = document.getElementById('tab-horses');
  const breeds = [...new Set(HO.map(h=>h[0]))];
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-horses" onclick="toggleAllSec('tab-horses','btn-toggle-horses')">Collapse All</button></div>`;
  breeds.forEach(breed => {
    const coats = HO.map((h,i)=>({h,i})).filter(({h})=>h[0]===breed);
    const hasHorseman = coats.some(({h})=>h[4]===1);
    const tot = coats.length * 3 + (hasHorseman ? 1 : 0);
    html += `<div class="coll-hdr open" id="ch_hp_${slug(breed)}" onclick="toggleSec('hp_${slug(breed)}')">
      <span class="coll-arrow">▶</span>
      <span class="coll-title">${breed}</span>
      <span class="coll-prog" id="hp_${slug(breed)}">0/${tot}</span>
    </div>`;
    html += secBody(`hp_${slug(breed)}`);
    // Horseman row — one per breed
    if (hasHorseman) {
      const hmId = `ho_hm_${slug(breed)}`;
      html += `<div class="mr" id="mr_${hmId}" style="background:rgba(40,96,128,.12);border-color:rgba(42,96,128,.3);margin-bottom:6px">
        <div class="ml" style="color:var(--straw);font-size:12px;font-family:var(--font-d);letter-spacing:.05em">HORSEMAN CHALLENGE</div>
        <div class="mcc"><div class="mc" onclick="toggleSimple('${hmId}')"><div class="mcl">COMPLETE</div><div class="mb" id="mb_${hmId}"></div></div></div>
      </div>`;
    }
    coats.forEach(({h,i}) => {
      html += mcRow('ho_',i,h[1],[1,1,1],HO_COLS,null,`${h[2]} · ${h[3]}`);
    });
    html += secBodyEnd();
  });
  el.innerHTML = html;
}

// ── WEAPONS ──
function buildWeapons() {
  const el = document.getElementById('tab-weapons');
  const cats = [...new Set(WE.map(w=>w[0]))];
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-weapons" onclick="toggleAllSec('tab-weapons','btn-toggle-weapons')">Collapse All</button></div>`;
  cats.forEach(cat => {
    const items = WE.map((w,i)=>({w,i})).filter(({w})=>w[0]===cat);
    html += secHdr(cat, `wp_${slug(cat)}`, items.length);
    html += secBody(`wp_${slug(cat)}`);
    html += '<div class="ig">';
    items.forEach(({w,i}) => html += simRow(`we_${i}`,w[1],''));
    html += '</div>';
    html += secBodyEnd();
  });
  el.innerHTML = html;
}

// ── EQUIPMENT ──
function buildEquip() {
  const el = document.getElementById('tab-equip');
  const cats = [...new Set(EQ.map(e=>e[0]))];
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-equip" onclick="toggleAllSec('tab-equip','btn-toggle-equip')">Collapse All</button></div>`;
  cats.forEach(cat => {
    const items = EQ.map((e,i)=>({e,i})).filter(({e})=>e[0]===cat);
    html += secHdr(cat, `eqp_${slug(cat)}`, items.length);
    html += secBody(`eqp_${slug(cat)}`);
    html += '<div class="ig">';
    items.forEach(({e,i}) => html += simRow(`eq_${i}`,e[1],e[2]));
    html += '</div>';
    html += secBodyEnd();
  });
  el.innerHTML = html;
}

// ── TRAPPER — 3-group collapsible inventory + 16 outfits + individual items ──
function buildTrapper() {
  const el = document.getElementById('tab-trapper');

  function invGroup(title, mats, gid, isLeg) {
    let h = '<div class="inv-group-hdr" onclick="var b=document.getElementById(\'ig_' + gid + '\');b.classList.toggle(\'open\');this.classList.toggle(\'open\')"><span class="coll-arrow">▶</span><span>' + title + '</span></div>';
    h += '<div class="coll-body" id="ig_' + gid + '">';
    mats.forEach(mat => {
      if (isLeg) {
        // Legendary: toggle (hunted or not)
        const have = getInv(mat) > 0;
        h += '<div class="inv-item" style="cursor:pointer;" onclick="toggleLegMat(\'' + mat + '\')">' +
          '<span class="inv-name' + (have ? ' inv-have' : '') + '" id="inv-name-' + slug(mat) + '">' + mat + '</span>' +
          '<div class="mb' + (have ? ' on' : '') + '" id="leg-mb-' + slug(mat) + '"></div>' +
          '</div>';
      } else {
        const v = getInv(mat);
        h += '<div class="inv-item"><span class="inv-name" id="inv-name-' + slug(mat) + '">' + mat + '</span>' +
          '<div class="inv-counter" id="inv-' + slug(mat) + '" onclick="bumpInv(\'' + mat + '\',1)" oncontextmenu="event.preventDefault();bumpInv(\'' + mat + '\',-1)" title="Click +1 · Right-click −1">' +
          '<span class="inv-minus" onclick="event.stopPropagation();bumpInv(\'' + mat + '\',-1)">−</span>' +
          '<span class="inv-num" id="inv-num-' + slug(mat) + '">' + v + '</span>' +
          '<span class="inv-plus">+</span></div></div>';
      }
    });
    return h + '</div>';
  }

  let invHtml = '<div class="inv-panel" id="inv-panel"><div class="inv-title">✦ INVENTORY</div>' +
    invGroup('Animals', TR_MATS_ANIMALS, 'animals', false) +
    invGroup('Feathers', TR_MATS_FEATHERS, 'feathers', false) +
    invGroup('Legendary', TR_MATS_LEGENDARY, 'legendary', true) + '</div>';

  let itemHtml = '<div id="tr-items"><div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;">' +
    '<button class="btn btn-ghost" id="btn-toggle-trapper" onclick="toggleAllSec(\'tab-trapper\',\'btn-toggle-trapper\')">Collapse All</button></div>';

  // Outfits
  itemHtml += secHdr('Garment Sets (16 Outfits)', 'trp_outfits', TR_OUTFITS.length);
  itemHtml += secBody('trp_outfits');
  TR_OUTFITS.forEach((outfit, oi) => {
    const d = {};  // empty at build time; renderAllChecks fills in real state
    const donePieces = 0;
    const allDone = false;
    itemHtml += '<div class="tr-outfit" id="tro_wrap_' + oi + '">' +
      '<div class="tr-outfit-hdr' + (allDone?' on':'') + '" onclick="toggleTrOutfit(' + oi + ')">' +
      '<div class="ick' + (allDone?' on':'') + '" id="ick_tro_' + oi + '"></div>' +
      '<span class="tr-outfit-name">' + outfit.name + '</span>' +
      '<span class="tr-outfit-prog" id="trop_' + oi + '">' + donePieces + '/' + outfit.pieces.length + '</span>' +
      '</div><div class="tr-outfit-body" id="trob_' + oi + '">';
    outfit.pieces.forEach(([pname, pmats], pi) => {
      const crafted = false;
      const can = false;
      const chips = pmats.map(([m,q]) => {
        const have = getInv(m);
        const leg = isLegendaryMat(m);
        const label = leg ? m+' ('+(have?'✓':'✗')+')' : m+' ('+have+'/'+q+')';
        return '<span class="mat-chip ' + (have>=q?'ok':'short') + '" id="chip_' + oi + '_' + pi + '_' + slug(m) + '">' + label + '</span>';
      }).join('');
      const badge = '<span class="can-badge" id="can_' + oi + '_' + pi + '" style="display:none"></span>';
      itemHtml += '<div class="tr-row" id="tr_' + oi + '_' + pi + '" onclick="toggleTrapperPiece(' + oi + ',' + pi + ')">' +
        '<div class="tr-top"><div class="ick" id="ick_trp_' + oi + '_' + pi + '"></div>' +
        '<div class="tr-name">' + pname + '</div>' + badge + '</div>' +
        '<div class="tr-mats">' + chips + '</div></div>';
    });
    itemHtml += '</div></div>';
  });
  itemHtml += secBodyEnd();

  // Individual items
  const itemCats = [...new Set(TR_ITEMS.map(t=>t[0]))];
  itemCats.forEach(cat => {
    const items = TR_ITEMS.map((t,i)=>({t,i})).filter(({t})=>t[0]===cat);
    itemHtml += secHdr(cat, 'trp_' + slug(cat), items.length);
    itemHtml += secBody('trp_' + slug(cat));
    items.forEach(({t,i}) => {
      const crafted = false;  // filled by renderAllChecks
      const can = false;      // filled by refreshTrapperCan
      const chips = t[2].map(([m,q]) => {
        const have = getInv(m);
        const leg = isLegendaryMat(m);
        const label = leg ? m+' ('+(have?'✓':'✗')+')' : m+' ('+have+'/'+q+')';
        return '<span class="mat-chip ' + (have>=q?'ok':'short') + '" id="chip_tri_' + i + '_' + slug(m) + '">' + label + '</span>';
      }).join('');
      const badge = '<span class="can-badge" id="can_tri_' + i + '" style="display:none"></span>';
      itemHtml += '<div class="tr-row" id="tri_row_' + i + '" onclick="toggleTrapperItem(' + i + ')">' +
        '<div class="tr-top"><div class="ick" id="ick_tri_' + i + '"></div><div class="tr-name">' + t[1] + '</div>' + badge + '</div>' +
        '<div class="tr-mats">' + chips + '</div></div>';
    });
    itemHtml += secBodyEnd();
  });
  itemHtml += '</div>';

  el.innerHTML = '<div class="trapper-layout" style="display:grid;grid-template-columns:260px 1fr;gap:1rem;align-items:start;">' + invHtml + itemHtml + '</div>';
}

function toggleTrOutfit(oi) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const outfit = TR_OUTFITS[oi];
  const allDone = outfit.pieces.every((_,pi) => D()['trp_' + oi + '_' + pi]);
  const nowOn = !allDone;
  outfit.pieces.forEach(([,pmats], pi) => {
    const wasCrafted = !!D()['trp_' + oi + '_' + pi];
    if (wasCrafted === nowOn) return; // no change
    setD('trp_' + oi + '_' + pi, nowOn ? true : null);
    document.getElementById('tr_' + oi + '_' + pi)?.classList.toggle('on', nowOn);
    document.getElementById('ick_trp_' + oi + '_' + pi)?.classList.toggle('on', nowOn);
    // Deduct inventory on craft only (no restore on uncraft)
    adjustInvForCraft(pmats, nowOn);
  });
  checkOutfitDone(oi);
  refreshTrapperCan();
  updateOverview();
}

function toggleTrapperPiece(oi, pi) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const pid = 'trp_' + oi + '_' + pi;
  const nowOn = !D()[pid];
  setD(pid, nowOn ? true : null);
  document.getElementById('tr_' + oi + '_' + pi)?.classList.toggle('on', nowOn);
  document.getElementById('ick_trp_' + oi + '_' + pi)?.classList.toggle('on', nowOn);
  const [,pmats] = TR_OUTFITS[oi].pieces[pi];
  adjustInvForCraft(pmats, nowOn); // deduct on craft only; no restore on uncraft
  checkOutfitDone(oi);
  refreshTrapperCan();
  updateOverview();
}

function checkOutfitDone(oi) {
  const outfit = TR_OUTFITS[oi];
  const done = outfit.pieces.filter((_,pi) => D()['trp_' + oi + '_' + pi]).length;
  const allDone = done === outfit.pieces.length;
  const hdr = document.querySelector('#tro_wrap_' + oi + ' .tr-outfit-hdr');
  const ick = document.getElementById('ick_tro_' + oi);
  if (hdr) hdr.classList.toggle('on', allDone);
  if (ick) ick.classList.toggle('on', allDone);
  const prog = document.getElementById('trop_' + oi);
  if (prog) prog.textContent = done + '/' + outfit.pieces.length;
}

function toggleTrapperItem(i) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const id = 'tri_' + i;
  const nowOn = !D()[id];
  setD(id, nowOn ? true : null);
  document.getElementById('tri_row_' + i)?.classList.toggle('on', nowOn);
  document.getElementById('ick_tri_' + i)?.classList.toggle('on', nowOn);
  adjustInvForCraft(TR_ITEMS[i][2], nowOn); // deduct on craft only
  refreshTrapperCan();
  updateOverview();
}


// Returns true if mat is a legendary toggle (not a consumable counter)
function isLegendaryMat(mat) {
  return TR_MATS_LEGENDARY.includes(mat);
}

// Adjust inventory for a craft action — legendary mats are never deducted
function adjustInvForCraft(mats, crafting) {
  if (!crafting) return; // never restore on uncraft — materials are spent
  mats.forEach(([m, q]) => {
    if (isLegendaryMat(m)) return; // legendary = toggle only, not consumed
    bumpInv(m, -q); // deduct on craft only
  });
}

function canCraft(i) {
  return TR_ITEMS[i] && TR_ITEMS[i][2].every(([m,q]) => getInv(m) >= q);
}

function toggleLegMat(mat) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const cur = getInv(mat);
  const nw = cur > 0 ? 0 : 1;
  setD('inv_' + mat, nw || null);
  const mb = document.getElementById('leg-mb-' + slug(mat));
  const nm = document.getElementById('inv-name-' + slug(mat));
  if (mb) mb.classList.toggle('on', nw > 0);
  if (nm) nm.classList.toggle('inv-have', nw > 0);
  refreshTrapperCan();
}

function refreshTrapperCan() {
  const d = D();
  TR_OUTFITS.forEach((outfit, oi) => {
    outfit.pieces.forEach(([,pmats], pi) => {
      const crafted = !!d['trp_' + oi + '_' + pi];
      const can = pmats.every(([m,q]) => getInv(m) >= q);
      const row = document.getElementById('tr_' + oi + '_' + pi);
      const badge = document.getElementById('can_' + oi + '_' + pi);
      if (row) row.classList.toggle('can', can && !crafted);
      if (badge) {
        if (crafted) {
          badge.textContent='CRAFTED'; badge.style.display='';
          badge.className='can-badge crafted';
        } else if (can) {
          badge.textContent='CAN CRAFT'; badge.style.display='';
          badge.className='can-badge can';
        } else {
          badge.style.display='none'; badge.className='can-badge';
        }
      }
      pmats.forEach(([m,q]) => {
        const chip = document.getElementById('chip_' + oi + '_' + pi + '_' + slug(m));
        if (chip) {
          if (crafted) {
            // Already crafted — show as satisfied regardless of current inventory
            const leg=isLegendaryMat(m);
            chip.className='mat-chip ok';
            chip.textContent=leg ? m+' (✓)' : m+' (crafted)';
          } else {
            const have=getInv(m);
            const leg=isLegendaryMat(m);
            chip.className='mat-chip '+(have>=q?'ok':'short');
            chip.textContent=leg ? m+' ('+(have?'✓':'✗')+')' : m+' ('+have+'/'+q+')';
          }
        }
      });
    });
  });
  TR_ITEMS.forEach((t,i) => {
    const crafted = !!d['tri_' + i];
    const can = t[2].every(([m,q]) => getInv(m) >= q);
    const row = document.getElementById('tri_row_' + i);
    const badge = document.getElementById('can_tri_' + i);
    if (row) row.classList.toggle('can', can && !crafted);
    if (badge) {
      if (crafted) {
        badge.textContent='CRAFTED'; badge.style.display='';
        badge.className='can-badge crafted';
      } else if (can) {
        badge.textContent='CAN CRAFT'; badge.style.display='';
        badge.className='can-badge can';
      } else {
        badge.style.display='none'; badge.className='can-badge';
      }
    }
    t[2].forEach(([m,q]) => {
      const chip = document.getElementById('chip_tri_'+i+'_'+slug(m));
      if (chip) {
        if (crafted) {
          const leg=isLegendaryMat(m);
          chip.className='mat-chip ok';
          chip.textContent=leg ? m+' (✓)' : m+' (crafted)';
        } else {
          const have=getInv(m);
          const leg=isLegendaryMat(m);
          chip.className='mat-chip '+(have>=q?'ok':'short');
          chip.textContent=leg ? m+' ('+(have?'✓':'✗')+')' : m+' ('+have+'/'+q+')';
        }
      }
    });
  });
  TR_MATS.forEach(mat => {
    const el = document.getElementById('inv-name-'+slug(mat)); if (!el) return;
    const anyShort = TR_ITEMS.some((t,i)=>!d['tri_'+i]&&t[2].some(([m,q])=>m===mat&&getInv(m)<q))
      || TR_OUTFITS.some((o,oi)=>o.pieces.some(([,pm],pi)=>!d['trp_'+oi+'_'+pi]&&pm.some(([m,q])=>m===mat&&getInv(m)<q)));
    el.classList.toggle('inv-low', anyShort);
  });
}


// ── PEARSON (individual pelt checkboxes per requirement) ──
function buildPearson() {
  const el = document.getElementById('tab-pearson');
  const cats = [...new Set(PE.map(p=>p[0]))];
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-pearson" onclick="toggleAllSec('tab-pearson','btn-toggle-pearson')">Collapse All</button></div>`;
  cats.forEach(cat => {
    const items = PE.map((p,i)=>({p,i})).filter(({p})=>p[0]===cat);
    html += secHdr(cat, `pep_${slug(cat)}`, items.length);
    html += secBody(`pep_${slug(cat)}`);
    items.forEach(({p,i}) => {
      const reqs = p[2]; // [[mat,qty],...]
      const reqBoxes = reqs.map(([m,q],ri) => {
        const reqId = `pe_${i}_r${ri}`;
        return `<div class="pe-req" onclick="event.stopPropagation();togglePeReq('${reqId}',${i})">
          <div class="mb" id="mb_${reqId}"></div>
          <span class="pe-req-name">${m}</span>
        </div>`;
      }).join('');
      // Simple items (no reqs = ledger) have one click handler on the header only
      const isSimple = reqs.length === 0;
      html += `<div class="pe-item" id="pe_${i}">
        <div class="pe-header" onclick="togglePeItem(${i})" style="${isSimple?'cursor:pointer;':''}">
          <div class="ick" id="ick_pe_${i}"></div>
          <div class="pe-name">${p[1]}</div>
        </div>
        ${reqBoxes ? `<div class="pe-reqs">${reqBoxes}</div>` : ''}
      </div>`;
    });
    html += secBodyEnd();
  });
  el.innerHTML = html;
}

function togglePeReq(reqId, itemIdx) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const val = !D()[reqId];
  setD(reqId, val);
  const box = document.getElementById(`mb_${reqId}`); if (box) box.classList.toggle('on', val);
  // check if all reqs for this item are done
  checkPeItemDone(itemIdx);
  updateOverview();
}

function togglePeItem(i) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const p = PE[i];
  if (p[2].length === 0) {
    // Ledger item — no materials, just a simple toggle
    const cur = !!D()[`pe_${i}_done`];
    setD(`pe_${i}_done`, !cur);
    checkPeItemDone(i);
    updateOverview();
    return;
  }
  const allDone = p[2].every((_,ri) => D()[`pe_${i}_r${ri}`]);
  const newVal = !allDone;
  p[2].forEach((_,ri) => {
    const reqId = `pe_${i}_r${ri}`;
    setD(reqId, newVal);
    const box = document.getElementById(`mb_${reqId}`); if (box) box.classList.toggle('on', newVal);
  });
  checkPeItemDone(i);
  updateOverview();
}

function checkPeItemDone(i) {
  const p = PE[i];
  // If no material requirements (e.g. ledger items), use explicit toggle key instead
  const allDone = p[2].length === 0
    ? !!D()[`pe_${i}_done`]
    : p[2].every((_,ri) => D()[`pe_${i}_r${ri}`]);
  const row = document.getElementById(`pe_${i}`);
  const ick = document.getElementById(`ick_pe_${i}`);
  if (row) row.classList.toggle('on', allDone);
  if (ick) ick.classList.toggle('on', allDone);
}

// ── CHALLENGES (collapsible, default expanded) ──
function buildChallenges() {
  const el = document.getElementById('tab-challenges');
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.75rem;">
    <button class="btn btn-ghost" id="chal-toggle-btn" onclick="toggleAllChal()">Collapse All</button>
  </div>`;
  Object.entries(CH).forEach(([set,tasks]) => {
    const sid = slug(set);
    html += `<div class="coll-hdr open" id="chh_${sid}" onclick="toggleColl('ch',\'${sid}\')">
      <span class="coll-arrow">▶</span>
      <span class="coll-title">${set}</span>
      <span class="coll-prog" id="chp_${sid}">0/${tasks.length}</span>
    </div>
    <div class="coll-body open" id="chb_${sid}">`;
    tasks.forEach(([lvl,req,rew],i) => {
      const id = `ch_${sid}_${i}`;
      html += `<div class="cr" id="ir_${id}" onclick="toggleSimple(\'${id}\')">
        <div class="ick" id="ick_${id}"></div>
        <div class="clv">${lvl}</div>
        <div><div class="crq">${req}</div><div class="crr">Reward: ${rew}</div></div>
      </div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

function toggleColl(prefix, sid) {
  document.getElementById(`${prefix}h_${sid}`)?.classList.toggle('open');
  document.getElementById(`${prefix}b_${sid}`)?.classList.toggle('open');
}

function toggleSec(sid) {
  document.getElementById(`ch_${sid}`)?.classList.toggle('open');
  document.getElementById(`cb_${sid}`)?.classList.toggle('open');
}

function toggleAllSec(tabId, btnId) {
  const tab = document.getElementById(tabId);
  const btn = document.getElementById(btnId);
  if (!tab) return;
  const headers = tab.querySelectorAll('.coll-hdr');
  const anyOpen = [...headers].some(h => h.classList.contains('open'));
  headers.forEach(h => {
    h.classList.toggle('open', !anyOpen);
    const raw = h.id;
    const sid = raw.replace(/^(ch_|chh_|cigh_)/,'');
    document.getElementById('cb_' + sid)?.classList.toggle('open', !anyOpen);
    document.getElementById('chb_' + sid)?.classList.toggle('open', !anyOpen);
    document.getElementById('cigb_' + sid)?.classList.toggle('open', !anyOpen);
  });
  if (btn) btn.textContent = anyOpen ? 'Expand All' : 'Collapse All';
}

function toggleAllChal() {
  const btn = document.getElementById('chal-toggle-btn');
  const anyOpen = Object.keys(CH).some(set => document.getElementById(`chh_${slug(set)}`)?.classList.contains('open'));
  Object.keys(CH).forEach(set => {
    const sid = slug(set);
    document.getElementById(`chh_${sid}`)?.classList.toggle('open', !anyOpen);
    document.getElementById(`chb_${sid}`)?.classList.toggle('open', !anyOpen);
  });
  if (btn) btn.textContent = anyOpen ? 'Expand All' : 'Collapse All';
}

// ── STORY ──
function buildStory() {
  const el = document.getElementById('tab-story');
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-story" onclick="toggleAllSec('tab-story','btn-toggle-story')">Collapse All</button></div>`;
  Object.entries(ST).forEach(([ch,missions]) => {
    html += secHdr(ch, `stp_${slug(ch)}`, missions.length);
    html += secBody(`stp_${slug(ch)}`);
    missions.forEach((m,i) => {
      const id = `st_${slug(ch)}_${i}`;
      html += `<div class="sor" id="sor_${id}">
        <span class="son">${m}</span>
        <div class="mbs">
          <button class="mbtn br" id="${id}_b" onclick="setMedal('${id}','bronze')">Bronze</button>
          <button class="mbtn si" id="${id}_s" onclick="setMedal('${id}','silver')">Silver</button>
          <button class="mbtn go" id="${id}_g" onclick="setMedal('${id}','gold')">Gold</button>
        </div>
      </div>`;
    });
    html += secBodyEnd();
  });
  el.innerHTML = html;
}

// ── ACHIEVEMENTS — PS5 trophy layout ──
function buildAchieve() {
  const el = document.getElementById('tab-achieve');
  const cats = [...new Set(AC.map(a=>a[1]))];
  const typeColor = {platinum:'#a67bd0',gold:'#E8B020',silver:'#aaa9ad',bronze:'#cd7f32'};
  const typeIcon  = {
    platinum:'<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#a67bd0"/><text x="7" y="11" text-anchor="middle" font-size="9" fill="#fff" font-family="serif">P</text></svg>',
    gold:    '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#E8B020"/><text x="7" y="11" text-anchor="middle" font-size="9" fill="#0a0a10" font-family="serif">G</text></svg>',
    silver:  '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#aaa9ad"/><text x="7" y="11" text-anchor="middle" font-size="9" fill="#0a0a10" font-family="serif">S</text></svg>',
    bronze:  '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#cd7f32"/><text x="7" y="11" text-anchor="middle" font-size="9" fill="#fff" font-family="serif">B</text></svg>',
  };
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-ghost" id="btn-toggle-achieve" onclick="toggleAllSec('tab-achieve','btn-toggle-achieve')">Collapse All</button></div>`;
  cats.forEach(cat => {
    const items = AC.map((a,i)=>({a,i})).filter(({a})=>a[1]===cat);
    html += secHdr(cat, `acp_${slug(cat)}`, items.length);
    html += secBody(`acp_${slug(cat)}`);
    items.forEach(({a,i}) => {
      const col = typeColor[a[2]] || typeColor.bronze;
      const icon = typeIcon[a[2]] || typeIcon.bronze;
      const desc = a[3] || '';
      const done = !!D()[`ac_${i}`];
      html += `<div class="ir${done?' on':''}" id="ir_ac_${i}" onclick="toggleSimple('ac_${i}')">
        <div class="ick${done?' on':''}" id="ick_ac_${i}"></div>
        <div style="flex:1;min-width:0;">
          <div class="in" style="display:flex;align-items:center;gap:6px;">
            ${icon}<span>${a[0]}</span>
          </div>
          ${desc ? `<div class="isb">${desc}</div>` : ''}
        </div>
        <span style="font-size:9px;font-family:var(--font-d);letter-spacing:.04em;padding:1px 7px;border-radius:10px;border:1px solid ${col};color:${col};flex-shrink:0;white-space:nowrap;">${a[2].toUpperCase()}</span>
      </div>`;
    });
    html += secBodyEnd();
  });
  el.innerHTML = html;
}


// ── COLLECTIONS TAB ──
const COLL_SECTIONS = [
  { id:'cigs',          label:'Cigarette Cards',  count:144 },
  { id:'dino',          label:'Dinosaur Bones',   count:30  },
  { id:'dreamcatchers', label:'Dreamcatchers',    count:20  },
  { id:'rock',          label:'Rock Carvings',    count:10  },
  { id:'graves',        label:'Graves',           count:9   },
  { id:'hunting',       label:'Hunting Requests', count:5   },
  { id:'exotics',       label:'Exotic Requests',  count:6   },
  { id:'treasures',     label:'Treasure Hunts',   count:5   },
];

function buildCollections() {
  const el = document.getElementById('tab-collections');
  if (!el) return;

  let navHtml = '<div class="coll-nav-panel">';
  COLL_SECTIONS.forEach(s => {
    navHtml += `<div class="coll-nav-item" id="cnav_${s.id}" onclick="showCollSection('${s.id}')">
      <span>${s.label}</span>
      <span class="coll-nav-count" id="cnavct_${s.id}">0/${s.count}</span>
    </div>`;
  });
  navHtml += '</div>';

  let contentHtml = '<div class="coll-content-panel">';

  // Cigarette Cards
  contentHtml += '<div class="coll-section active" id="cs_cigs">';
  contentHtml += `<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;">
    <button class="btn btn-ghost" id="cig-toggle-btn" onclick="toggleAllCigs()">Collapse All</button>
  </div>`;
  Object.entries(CIG).forEach(([set,{reward,cards}]) => {
    const sid = slug(set);
    contentHtml += `<div class="coll-hdr open" id="cigh_${sid}" onclick="toggleColl('cig','${sid}')">
      <span class="coll-arrow">▶</span>
      <span class="coll-title">${set}</span>
      <span class="coll-prog" id="cigp_${sid}">0/${cards.length}</span>
    </div><div class="coll-body open" id="cigb_${sid}">
      <div style="font-size:11px;color:var(--gold);margin-bottom:.5rem;font-family:var(--font-d)">Reward: ${reward}</div>
      <table class="ct"><thead><tr>
        <th style="width:32px"></th><th>Card</th><th>State</th><th>Location</th><th>Description</th>
      </tr></thead><tbody>`;
    cards.forEach(([name,state,loc,desc],i) => {
      const id = `cig_${sid}_${i}`;
      contentHtml += `<tr id="ctr_${id}">
        <td class="ccc" onclick="toggleCard('${id}')"><div class="mb" id="mb_${id}"></div></td>
        <td class="cn">${name}</td><td class="cloc">${state}</td>
        <td class="cloc">${loc}</td><td class="cloc">${desc}</td>
      </tr>`;
    });
    contentHtml += '</tbody></table></div>';
  });
  contentHtml += '</div>';

  // Simple list builder
  function simColl(secId, items, idFn, labelFn, note) {
    let h = `<div class="coll-section" id="cs_${secId}">`;
    if (note) h += `<div style="font-size:12px;color:var(--muted);margin-bottom:.75rem;">${note}</div>`;
    items.forEach((item,i) => {
      const id = idFn(i);
      h += `<div class="ir" id="ir_${id}" onclick="toggleSimple('${id}')">
        <div class="ick" id="ick_${id}"></div>
        <div class="in">${labelFn(item)}</div>
      </div>`;
    });
    return h + '</div>';
  }

  contentHtml += simColl('dino', DINO_BONES, i=>`dino_${i}`,
    item=>`<strong>${item[0]}</strong> — ${item[1]}: ${item[2]}`,
    'A Test of Faith — find all 30, mail findings to Deborah MacGuiness.');

  contentHtml += simColl('dreamcatchers', DREAMCATCHERS, i=>`dc_${i}`,
    item=>`<strong>${item[0]}</strong> — ${item[1]}: ${item[2]}`,
    'Find all 20 — completing them reveals the Ancient Arrowhead treasure.');

  contentHtml += simColl('rock', ROCK_CARVINGS, i=>`rock_${i}`,
    item=>`<strong>${item[0]}</strong> — ${item[1]}: ${item[2]}`,
    'Geology for Beginners — find all 10, mail to Francis Sinclair.');

  contentHtml += simColl('graves', GRAVES, i=>`grave_${i}`,
    item=>`<strong>${item[0]}</strong> — ${item[1]}`,
    'Visit all 9 graves of fallen companions. Only accessible after Epilogue begins.');

  // Hunting Requests
  contentHtml += '<div class="coll-section" id="cs_hunting">';
  contentHtml += '<div style="font-size:12px;color:var(--muted);margin-bottom:.75rem;">A Better World, A New Friend — 5 request lists. All require <em>perfect</em> carcasses.</div>';
  HUNTING_REQUESTS.forEach((req,ri) => {
    contentHtml += secHdr(req.list, `hunt_${ri}`, req.animals.length) + secBody(`hunt_${ri}`);
    req.animals.forEach(([animal,hint],ai) => {
      const id = `hunt_${ri}_${ai}`;
      contentHtml += `<div class="ir" id="ir_${id}" onclick="toggleSimple('${id}')">
        <div class="ick" id="ick_${id}"></div>
        <div><div class="in">${animal}</div><div class="isb">${hint}</div></div>
      </div>`;
    });
    contentHtml += secBodyEnd();
  });
  contentHtml += '</div>';

  // Exotics
  contentHtml += '<div class="coll-section" id="cs_exotics">';
  contentHtml += '<div style="font-size:12px;color:var(--muted);margin-bottom:.75rem;">Duchesses and Other Animals — 6 requests for Algernon Wasp in Saint Denis.</div>';
  EXOTICS.forEach((req,ri) => {
    contentHtml += secHdr(req.req, `exotic_${ri}`, req.items.length) + secBody(`exotic_${ri}`);
    req.items.forEach(([item,hint],ai) => {
      const id = `exotic_${ri}_${ai}`;
      contentHtml += `<div class="ir" id="ir_${id}" onclick="toggleSimple('${id}')">
        <div class="ick" id="ick_${id}"></div>
        <div><div class="in">${item}</div>${hint?`<div class="isb">${hint}</div>`:''}</div>
      </div>`;
    });
    contentHtml += secBodyEnd();
  });
  contentHtml += '</div>';

  // Treasure Hunts
  contentHtml += '<div class="coll-section" id="cs_treasures">';
  contentHtml += '<div style="font-size:12px;color:var(--muted);margin-bottom:.75rem;">Complete 1 treasure hunt for 100% — all 5 tracked here.</div>';
  TREASURES.forEach((t,ti) => {
    contentHtml += secHdr(t.name, `treas_${ti}`, t.clues.length) + secBody(`treas_${ti}`);
    t.clues.forEach((clue,ci) => {
      const id = `treas_${ti}_${ci}`;
      contentHtml += `<div class="ir" id="ir_${id}" onclick="toggleSimple('${id}')">
        <div class="ick" id="ick_${id}"></div>
        <div class="in">${clue}</div>
      </div>`;
    });
    contentHtml += secBodyEnd();
  });
  contentHtml += '</div>';

  contentHtml += '</div>'; // end coll-content-panel
  el.innerHTML = `<div class="coll-tab-layout">${navHtml}${contentHtml}</div>`;
  document.getElementById('cnav_cigs')?.classList.add('active');
  updateCollectionCounts();
}

function showCollSection(id) {
  document.querySelectorAll('.coll-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.coll-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('cs_' + id)?.classList.add('active');
  document.getElementById('cnav_' + id)?.classList.add('active');
}

function updateCollectionCounts() {
  const d = D();
  let cigDon=0, cigTot=0;
  Object.entries(CIG).forEach(([set,{cards}]) => {
    cards.forEach((_,i) => { cigTot++; if(d[`cig_${slug(set)}_${i}`]) cigDon++; });
  });
  setTxt('cnavct_cigs', cigDon+'/'+cigTot);
  const simple = [
    ['dino', DINO_BONES, i=>`dino_${i}`],
    ['dreamcatchers', DREAMCATCHERS, i=>`dc_${i}`],
    ['rock', ROCK_CARVINGS, i=>`rock_${i}`],
    ['graves', GRAVES, i=>`grave_${i}`],
  ];
  simple.forEach(([cid,items,idFn]) => {
    const done = items.filter((_,i)=>d[idFn(i)]).length;
    setTxt('cnavct_'+cid, done+'/'+items.length);
  });
  let hDon=0,hTot=0;
  HUNTING_REQUESTS.forEach((req,ri)=>req.animals.forEach((_,ai)=>{hTot++;if(d[`hunt_${ri}_${ai}`])hDon++;}));
  setTxt('cnavct_hunting', hDon+'/'+hTot);
  let eDon=0,eTot=0;
  EXOTICS.forEach((req,ri)=>req.items.forEach((_,ai)=>{eTot++;if(d[`exotic_${ri}_${ai}`])eDon++;}));
  setTxt('cnavct_exotics', eDon+'/'+eTot);
  let tDon=0,tTot=0;
  TREASURES.forEach((t,ti)=>t.clues.forEach((_,ci)=>{tTot++;if(d[`treas_${ti}_${ci}`])tDon++;}));
  setTxt('cnavct_treasures', tDon+'/'+tTot);
}

function toggleAllCigs() {
  const btn = document.getElementById('cig-toggle-btn');
  const anyOpen = Object.keys(CIG).some(set => document.getElementById(`cigh_${slug(set)}`)?.classList.contains('open'));
  Object.keys(CIG).forEach(set => {
    const sid = slug(set);
    document.getElementById(`cigh_${sid}`)?.classList.toggle('open', !anyOpen);
    document.getElementById(`cigb_${sid}`)?.classList.toggle('open', !anyOpen);
  });
  if (btn) btn.textContent = anyOpen ? 'Expand All' : 'Collapse All';
}

// ═══════════════════ INTERACTIONS ═══════════════════

function toggleSimple(id) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const val = !D()[id];
  setD(id, val);
  document.getElementById(`ir_${id}`)?.classList.toggle('on', val);
  document.getElementById(`ick_${id}`)?.classList.toggle('on', val);
  // also handle horseman breed-level checkboxes stored as simple
  document.getElementById(`mb_${id}`)?.classList.toggle('on', val);
  updateOverview();
}

function toggleMC(prefix, j) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const key = `${prefix}_${j}`;
  const val = !D()[key];
  setD(key, val);
  document.getElementById(`mb_${prefix}_${j}`)?.classList.toggle('on', val);
  const row = document.getElementById(`mr_${prefix}`);
  if (row) {
    const active = row.querySelectorAll('.mc:not(.na) .mb');
    const allOn = [...active].every(b=>b.classList.contains('on'));
    row.classList.toggle('done', allOn && active.length > 0);
  }
  updateOverview();
}

function toggleCard(id) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const val = !D()[id];
  setD(id, val);
  document.getElementById(`mb_${id}`)?.classList.toggle('on', val);
  document.getElementById(`ctr_${id}`)?.classList.toggle('cdone', val);
  updateOverview();
}

function setMedal(id, medal) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const cur = D()[id];
  const val = cur === medal ? null : medal;
  setD(id, val);
  ['b','s','g'].forEach(x => document.getElementById(`${id}_${x}`)?.classList.remove('on'));
  if (val) document.getElementById(`${id}_${val==='bronze'?'b':val==='silver'?'s':'g'}`)?.classList.add('on');
  const row = document.getElementById(`sor_${id}`);
  if (row) row.classList.toggle('med', !!val);
  updateOverview();
}

// ═══════════════════ RENDER ALL ═══════════════════
function renderAllChecks() {
  const d = D();

  // simple rows + challenge rows (both use id="ir_*" pattern with ick_* checkmark)
  document.querySelectorAll('.ir, .cr').forEach(row => {
    const id = row.id.replace('ir_','');
    const on = !!d[id];
    row.classList.toggle('on', on);
    document.getElementById(`ick_${id}`)?.classList.toggle('on', on);
  });

  // mc rows
  document.querySelectorAll('.mr').forEach(row => {
    const prefix = row.id.replace('mr_','');
    const active = row.querySelectorAll('.mc:not(.na)');
    let allOn = active.length > 0;
    active.forEach(cell => {
      const m = (cell.getAttribute('onclick')||'').match(/toggleMC\('(.+)',(\d+)\)/);
      if (!m) return;
      const key = `${m[1]}_${m[2]}`;
      const on = !!d[key];
      document.getElementById(`mb_${m[1]}_${m[2]}`)?.classList.toggle('on', on);
      if (!on) allOn = false;
    });
    row.classList.toggle('done', allOn);
  });

  // horseman breed checkboxes
  const hmBreeds = [...new Set(HO.map(h=>h[0]))];
  hmBreeds.forEach(breed => {
    if (!HO.filter(h=>h[0]===breed).some(h=>h[4]===1)) return;
    const hmId = `ho_hm_${slug(breed)}`;
    const on = !!d[hmId];
    document.getElementById(`mb_${hmId}`)?.classList.toggle('on', on);
    document.getElementById(`mr_${hmId}`)?.classList.toggle('done', on);
  });

  // trapper outfit pieces (trp_oi_pi) + individual items (tri_i)
  TR_OUTFITS.forEach((outfit, oi) => {
    outfit.pieces.forEach((_, pi) => {
      const on = !!d[`trp_${oi}_${pi}`];
      document.getElementById(`tr_${oi}_${pi}`)?.classList.toggle('on', on);
      document.getElementById(`ick_trp_${oi}_${pi}`)?.classList.toggle('on', on);
    });
    checkOutfitDone(oi);
  });
  TR_ITEMS.forEach((_, i) => {
    const on = !!d[`tri_${i}`];
    document.getElementById(`tri_row_${i}`)?.classList.toggle('on', on);
    document.getElementById(`ick_tri_${i}`)?.classList.toggle('on', on);
  });

  // legendary mat toggles — must restore here because buildTrapper runs before pt is set
  TR_MATS_LEGENDARY.forEach(mat => {
    const have = getInv(mat) > 0;
    const mb = document.getElementById('leg-mb-' + slug(mat));
    const nm = document.getElementById('inv-name-' + slug(mat));
    if (mb) mb.classList.toggle('on', have);
    if (nm) nm.classList.toggle('inv-have', have);
  });
  // normal mat counters
  TR_MATS_ANIMALS.concat(TR_MATS_FEATHERS).forEach(mat => {
    const el = document.getElementById('inv-num-' + slug(mat));
    if (el) el.textContent = getInv(mat);
  });
  refreshTrapperCan();

  // pearson
  PE.forEach((p,i) => {
    p[2].forEach((_,ri) => {
      const reqId = `pe_${i}_r${ri}`;
      const on = !!d[reqId];
      document.getElementById(`mb_${reqId}`)?.classList.toggle('on', on);
    });
    checkPeItemDone(i);
  });

  // story
  Object.entries(ST).forEach(([ch,ms]) => {
    ms.forEach((_,i) => {
      const id = `st_${slug(ch)}_${i}`;
      const medal = d[id];
      ['b','s','g'].forEach(x=>document.getElementById(`${id}_${x}`)?.classList.remove('on'));
      if (medal) {
        document.getElementById(`${id}_${medal==='bronze'?'b':medal==='silver'?'s':'g'}`)?.classList.add('on');
        document.getElementById(`sor_${id}`)?.classList.add('med');
      } else {
        document.getElementById(`sor_${id}`)?.classList.remove('med');
      }
    });
  });

  // cigarette cards
  Object.entries(CIG).forEach(([set,{cards}]) => {
    cards.forEach((_,i) => {
      const id = `cig_${slug(set)}_${i}`;
      const on = !!d[id];
      document.getElementById(`mb_${id}`)?.classList.toggle('on', on);
      document.getElementById(`ctr_${id}`)?.classList.toggle('cdone', on);
    });
  });

  // Collections — cigs already handled above; simple items handled by ir_ prefix
  // updateCollectionCounts called via updateOverview → updateSectionProgress
  updateOverview();
}

// ═══════════════════ OVERVIEW ═══════════════════
function updateOverview() {
  const d = D();

  // Animals
  let anTot=0,anDon=0;
  AN.forEach((a,i)=>[a[2],a[3],a[4],a[5]].forEach((v,j)=>{if(v){anTot++;if(d[`an_${i}_${j}`])anDon++;}}));
  setTxt('ov-an',`${anDon}/${anTot}`); setBar('pb-an',anTot?anDon/anTot*100:0);

  // Plants
  let plTot=0,plDon=0;
  PL.forEach((p,i)=>{
    const isOrchid=p[0]==='ORCHID';
    const cols=isOrchid?[p[2],0,p[4]]:[p[2],p[3],p[4]];
    cols.forEach((v,j)=>{if(v){plTot++;if(d[`pl_${i}_${j}`])plDon++;}});
  });
  setTxt('ov-pl',`${plDon}/${plTot}`); setBar('pb-pl',plTot?plDon/plTot*100:0);

  // Fish — 3 checkboxes per normal fish, 1 per legendary
  let fiTot=0,fiDon=0;
  FI.filter(f=>!f[1]).forEach((_,i)=>{
    [0,1].forEach(j=>{fiTot++;if(d[`fi_${i}_${j}`])fiDon++;});
  });
  FI.filter(f=>f[1]).forEach((_,i)=>{fiTot++;if(d[`fl_${i}_0`])fiDon++;});
  setTxt('ov-fi',`${fiDon}/${fiTot}`); setBar('pb-fi',fiTot?fiDon/fiTot*100:0);

  // Horses (studied/bonded/ridden per coat + 1 horseman per qualifying breed)
  let hoTot=0,hoDon=0;
  HO.forEach((h,i)=>{
    [0,1,2].forEach(j=>{hoTot++;if(d[`ho_${i}_${j}`])hoDon++;});
  });
  const hoBreeds=[...new Set(HO.map(h=>h[0]))];
  hoBreeds.forEach(breed=>{
    if(HO.filter(h=>h[0]===breed).some(h=>h[4]===1)){
      hoTot++; if(d[`ho_hm_${slug(breed)}`])hoDon++;
    }
  });
  setTxt('ov-ho',`${hoDon}/${hoTot}`); setBar('pb-ho',hoTot?hoDon/hoTot*100:0);

  // Challenges
  const chAll=Object.entries(CH).flatMap(([s,t])=>t.map((_,i)=>`ch_${slug(s)}_${i}`));
  const chDon=chAll.filter(id=>d[id]).length;
  setTxt('ov-ch',`${chDon}/${chAll.length}`); setBar('pb-ch',chDon/chAll.length*100);

  // Story
  const stAll=Object.entries(ST).flatMap(([ch,ms])=>ms.map((_,i)=>`st_${slug(ch)}_${i}`));
  const stDon=stAll.filter(id=>d[id]).length;
  setTxt('ov-st',`${stDon}/${stAll.length}`); setBar('pb-st',stAll.length?stDon/stAll.length*100:0);

  // Cigs
  const cigAll=Object.entries(CIG).flatMap(([s,{cards}])=>cards.map((_,i)=>`cig_${slug(s)}_${i}`));
  const cigDon=cigAll.filter(id=>d[id]).length;
  setTxt('ov-ci',`${cigDon}/${cigAll.length}`); setBar('pb-ci',cigAll.length?cigDon/cigAll.length*100:0);

  // Overall
  const gt=anTot+plTot+fiTot+hoTot+chAll.length+stAll.length+cigAll.length;
  const gd=anDon+plDon+fiDon+hoDon+chDon+stDon+cigDon;
  const pct=gt?Math.round(gd/gt*100):0;
  setTxt('ov-tot',`${pct}%`); setBar('pb-tot',pct);

  updateSectionProgress(d);
  // Update collection counts if tab exists
  if (document.getElementById('tab-collections')?.classList.contains('active')) {
    updateCollectionCounts();
  }
}

function updateSectionProgress(d) {
  // Animals by group
  [...new Set(AN.map(a=>a[0]))].forEach(grp=>{
    let tot=0,don=0;
    AN.forEach((a,i)=>{if(a[0]!==grp)return;[a[2],a[3],a[4],a[5]].forEach((v,j)=>{if(v){tot++;if(d[`an_${i}_${j}`])don++;}});});
    setTxt(`ap_${slug(grp)}`,`${don}/${tot}`);
  });
  // Plants by cat
  [...new Set(PL.map(p=>p[0]))].forEach(cat=>{
    let tot=0,don=0;
    PL.forEach((p,i)=>{
      if(p[0]!==cat)return;
      const isOrchid=cat==='ORCHID';
      const cols=isOrchid?[p[2],0,p[4]]:[p[2],p[3],p[4]];
      cols.forEach((v,j)=>{if(v){tot++;if(d[`pl_${i}_${j}`])don++;}});
    });
    setTxt(`pp_${slug(cat)}`,`${don}/${tot}`);
  });
  // Fish
  { let tot=0,don=0;
    FI.filter(f=>!f[1]).forEach((_,i)=>{ [0,1].forEach(j=>{ tot++; if(d[`fi_${i}_${j}`]) don++; }); });
    setTxt('fp_fish',`${don}/${tot}`); }
  { let tot=0,don=0;
    FI.filter(f=>f[1]).forEach((_,i)=>{ tot++; if(d[`fl_${i}_0`]) don++; });
    setTxt('fp_leg',`${don}/${tot}`); }
  // Horses by breed (coats + horseman per breed)
  [...new Set(HO.map(h=>h[0]))].forEach(breed=>{
    let tot=0,don=0;
    HO.forEach((h,i)=>{if(h[0]!==breed)return;[0,1,2].forEach(j=>{tot++;if(d[`ho_${i}_${j}`])don++;});});
    if(HO.filter(h=>h[0]===breed).some(h=>h[4]===1)){
      tot++; if(d[`ho_hm_${slug(breed)}`])don++;
    }
    setTxt(`hp_${slug(breed)}`,`${don}/${tot}`);
  });
  // Weapons
  [...new Set(WE.map(w=>w[0]))].forEach(cat=>{
    const items=WE.map((w,i)=>({w,i})).filter(({w})=>w[0]===cat);
    setTxt(`wp_${slug(cat)}`,`${items.filter(({i})=>d[`we_${i}`]).length}/${items.length}`);
  });
  // Equipment
  [...new Set(EQ.map(e=>e[0]))].forEach(cat=>{
    const items=EQ.map((e,i)=>({e,i})).filter(({e})=>e[0]===cat);
    setTxt(`eqp_${slug(cat)}`,`${items.filter(({i})=>d[`eq_${i}`]).length}/${items.length}`);
  });
  // Trapper — outfit pieces use trp_oi_pi, individual items use tri_i
  TR_OUTFITS.forEach((outfit, oi) => {
    const done = outfit.pieces.filter((_,pi) => d[`trp_${oi}_${pi}`]).length;
    setTxt(`trop_${oi}`, `${done}/${outfit.pieces.length}`);
  });
  [...new Set(TR_ITEMS.map(t=>t[0]))].forEach(cat => {
    const items = TR_ITEMS.map((t,i)=>({t,i})).filter(({t})=>t[0]===cat);
    const done  = items.filter(({i})=>d[`tri_${i}`]).length;
    setTxt(`trp_${slug(cat)}`, `${done}/${items.length}`);
  });
  // Pearson / Camp
  [...new Set(PE.map(p=>p[0]))].forEach(cat=>{
    const items=PE.map((p,i)=>({p,i})).filter(({p})=>p[0]===cat);
    const done=items.filter(({p,i})=>{
      if(p[2].length===0) return !!d[`pe_${i}_done`];
      return p[2].every((_,ri)=>d[`pe_${i}_r${ri}`]);
    }).length;
    setTxt(`pep_${slug(cat)}`,`${done}/${items.length}`);
  });
  // Challenges
  Object.entries(CH).forEach(([set,tasks])=>{
    const don=tasks.filter((_,i)=>d[`ch_${slug(set)}_${i}`]).length;
    setTxt(`chp_${slug(set)}`,`${don}/${tasks.length}`);
  });
  // Story
  Object.entries(ST).forEach(([ch,ms])=>{
    const don=ms.filter((_,i)=>d[`st_${slug(ch)}_${i}`]).length;
    setTxt(`stp_${slug(ch)}`,`${don}/${ms.length}`);
  });
  // Achievements
  [...new Set(AC.map(a=>a[1]))].forEach(cat=>{
    const items=AC.map((a,i)=>({a,i})).filter(({a})=>a[1]===cat);
    setTxt(`acp_${slug(cat)}`,`${items.filter(({i})=>d[`ac_${i}`]).length}/${items.length}`);
  });
  // Cigs
  Object.entries(CIG).forEach(([set,{cards}])=>{
    const don=cards.filter((_,i)=>d[`cig_${slug(set)}_${i}`]).length;
    setTxt(`cigp_${slug(set)}`,`${don}/${cards.length}`);
  });
}

function setTxt(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function setBar(id,p){const e=document.getElementById(id);if(e)e.style.width=Math.min(100,Math.max(0,p))+'%';}

// ═══════════════════ TABS ═══════════════════
function showTab(name, btn) {
  document.querySelectorAll('.tp').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  btn.classList.add('active');
}

function toggleSet() {
  const bar = document.getElementById('settings-bar');
  const btn = document.getElementById('gear-btn');
  bar.classList.toggle('open');
  if (btn) btn.classList.toggle('active', bar.classList.contains('open'));
}

// ═══════════════════ STORAGE ═══════════════════
function saveLocal(){
  const json = JSON.stringify(db);
  localStorage.setItem('rdr2_db', json);
  // Also save under sync code if one is set
  if (syncCode) localStorage.setItem('rdr2_data_' + syncCode, json);
}

async function loadFromGH(){
  const cfg=getCfg();if(!cfg.repo||!cfg.token)return;
  try{
    showSS('Loading…','');
    const res=await fetch(`https://api.github.com/repos/${cfg.repo}/contents/data.json?ref=${cfg.branch}`,
      {headers:{Authorization:`token ${cfg.token}`,Accept:'application/vnd.github.v3+json'}});
    if(res.status===404){showSS('data.json not found','ok');return;}
    if(!res.ok)throw new Error(await res.text());
    const json=await res.json();
    db=JSON.parse(atob(json.content.replace(/\n/g,'')));
    if(!db.inventory)db.inventory={};
    localStorage.setItem('rdr2_sha',json.sha);
    if (!db.inventory) db.inventory = {};
      saveLocal();
    showSS('Loaded ✓','ok');
    setTxt('ls','Last sync: '+new Date().toLocaleTimeString());
  }catch(e){showSS('Load failed: '+e.message,'err');}
}

let syncTO=null;
function debouncedSync(){clearTimeout(syncTO);syncTO=setTimeout(syncGH,3000);}

async function syncGH(){
  const cfg=getCfg();if(!cfg.repo||!cfg.token)return;
  try{
    showSS('Syncing…','');
    const content=btoa(unescape(encodeURIComponent(JSON.stringify(db,null,2))));
    const sha=localStorage.getItem('rdr2_sha');
    const body={message:`Update – ${new Date().toISOString()}`,content,branch:cfg.branch};
    if(sha)body.sha=sha;
    const res=await fetch(`https://api.github.com/repos/${cfg.repo}/contents/data.json`,
      {method:'PUT',headers:{Authorization:`token ${cfg.token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok)throw new Error(await res.text());
    const json=await res.json();
    localStorage.setItem('rdr2_sha',json.content.sha);
    showSS('Synced ✓','ok');setTxt('ls','Last sync: '+new Date().toLocaleTimeString());
  }catch(e){showSS('Sync failed: '+e.message,'err');}
}

let ssTO=null;
function showSS(msg,type){
  const el=document.getElementById('ss');
  el.textContent=msg;el.className='vis '+type;
  clearTimeout(ssTO);ssTO=setTimeout(()=>el.classList.remove('vis'),4000);
}

// ═══════════════════ EXPORT/IMPORT ═══════════════════
function exportCSV(){
  if(!pt){alert('Select a playthrough first.');return;}
  const d=D();
  const rows=[['Playthrough','Section','Item','Field','Value']];
  AC.forEach(([name],i)=>rows.push([pt,'Achievement',name,'obtained',d[`ac_${i}`]?'Yes':'No']));
  AN.forEach((a,i)=>['TRACKED','KILLED','SKINNED','STUDIED'].forEach((f,j)=>{if(a[j+2])rows.push([pt,`Animal-${a[0]}`,a[1],f,d[`an_${i}_${j}`]?'Yes':'No']);}));
  PL.forEach((p,i)=>['PICKED','RECIPE','HERBALIST'].forEach((f,j)=>{if(p[j+2])rows.push([pt,`Plant-${p[0]}`,p[1],f,d[`pl_${i}_${j}`]?'Yes':'No']);}));
  FI.filter(f=>!f[1]).forEach((f,i)=>rows.push([pt,'Fish',f[0],'CAUGHT',d[`fi_${i}_0`]?'Yes':'No']));
  FI.filter(f=>f[1]).forEach((f,i)=>rows.push([pt,'Legendary Fish',f[0],'CAUGHT',d[`fl_${i}_0`]?'Yes':'No']));
  HO.forEach((h,i)=>['STUDIED','BONDED','RIDDEN'].forEach((f,j)=>rows.push([pt,`Horse-${h[0]}`,h[1],f,d[`ho_${i}_${j}`]?'Yes':'No'])));
  WE.forEach(([cat,name],i)=>rows.push([pt,`Weapon-${cat}`,name,'obtained',d[`we_${i}`]?'Yes':'No']));
  EQ.forEach(([cat,name],i)=>rows.push([pt,`Equipment-${cat}`,name,'obtained',d[`eq_${i}`]?'Yes':'No']));
  TR_OUTFITS.forEach((outfit,oi)=>outfit.pieces.forEach(([pname],pi)=>rows.push([pt,`Trapper-${outfit.name}`,pname,'crafted',d[`trp_${oi}_${pi}`]?'Yes':'No'])));
  TR_ITEMS.forEach(([cat,name],i)=>rows.push([pt,`Trapper-${cat}`,name,'crafted',d[`tri_${i}`]?'Yes':'No']));
  PE.forEach(([cat,name,reqs],i)=>reqs.forEach(([m],ri)=>rows.push([pt,`Pearson-${cat}`,name,m,d[`pe_${i}_r${ri}`]?'Yes':'No'])));
  Object.entries(CH).forEach(([set,tasks])=>tasks.forEach(([lvl,req],i)=>rows.push([pt,`Challenge-${set}`,req,lvl,d[`ch_${slug(set)}_${i}`]?'Yes':'No'])));
  Object.entries(ST).forEach(([ch,ms])=>ms.forEach((m,i)=>rows.push([pt,`Story-${ch}`,m,'medal',d[`st_${slug(ch)}_${i}`]||'none'])));
  Object.entries(CIG).forEach(([set,{cards}])=>cards.forEach(([name,,loc],i)=>rows.push([pt,`Cig-${set}`,name,loc,d[`cig_${slug(set)}_${i}`]?'Yes':'No'])));
  // Inventory
  TR_MATS.forEach(mat=>{const v=getInv(mat);if(v)rows.push([pt,'Inventory',mat,'count',v]);});
  const csv=rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`rdr2_${pt.replace(/\s+/g,'_')}.csv`;a.click();
}

function importCSV(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const lines=ev.target.result.split('\n').slice(1);
      let ptName=null;
      lines.forEach(line=>{
        const cols=line.match(/("(?:[^"]|"")*"|[^,\r\n]+)/g);
        if(!cols||cols.length<5)return;
        const clean=c=>c.trim().replace(/^"|"$/g,'').replace(/""/g,'"');
        const [p,section,item,field,val]=cols.map(clean);
        if(section==='Inventory'&&item){setD('inv_'+item,(parseInt(val)||0)||null);return;}
        if(!p)return;
        ptName=p;
        if(!db.playthroughs[p])db.playthroughs[p]={};
        const yes=val==='Yes';
        if(section==='Achievement'){const idx=AC.findIndex(a=>a[0]===item);if(idx>=0&&yes)db.playthroughs[p][`ac_${idx}`]=true;}
        else if(section.startsWith('Animal-')){const flds=['TRACKED','KILLED','SKINNED','STUDIED'];const j=flds.indexOf(field);const idx=AN.findIndex(a=>a[1]===item);if(idx>=0&&j>=0&&yes)db.playthroughs[p][`an_${idx}_${j}`]=true;}
        else if(section==='Fish'){const idx=FI.filter(f=>!f[1]).findIndex(f=>f[0]===item);if(idx>=0&&yes)db.playthroughs[p][`fi_${idx}_0`]=true;}
        else if(section==='Legendary Fish'){const idx=FI.filter(f=>f[1]).findIndex(f=>f[0]===item);if(idx>=0&&yes)db.playthroughs[p][`fl_${idx}_0`]=true;}
        else if(section.startsWith('Story-')){const ch=section.replace('Story-','');const ms=ST[ch]||[];const idx=ms.indexOf(item);if(idx>=0&&val!=='none')db.playthroughs[p][`st_${slug(ch)}_${idx}`]=val;}
        else if(section.startsWith('Cig-')){const set=section.replace('Cig-','');const {cards}=CIG[set]||{cards:[]};const idx=cards.findIndex(c=>c[0]===item);if(idx>=0&&yes)db.playthroughs[p][`cig_${slug(set)}_${idx}`]=true;}
      });
      renderPTSel();
      if(ptName){document.getElementById('pts').value=ptName;switchPT(ptName);}
      saveLocal();syncGH();showSS('Import complete ✓','ok');
    }catch(err){showSS('Import failed: '+err.message,'err');}
  };
  reader.readAsText(file);e.target.value='';
}

init();
