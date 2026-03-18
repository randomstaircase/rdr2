// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let db = { playthroughs: {} };
let pt = null;

function D() { return pt ? (db.playthroughs[pt] || {}) : {}; }
function setD(id, val) {
  if (!pt) return;
  if (!db.playthroughs[pt]) db.playthroughs[pt] = {};
  if (val === null || val === false) delete db.playthroughs[pt][id];
  else db.playthroughs[pt][id] = val;
  saveLocal(); debouncedSync();
}

function getCfg() {
  return {
    repo:   localStorage.getItem('rdr2_repo')   || '',
    branch: localStorage.getItem('rdr2_branch') || 'main',
    token:  localStorage.getItem('rdr2_token')  || '',
  };
}
function saveCfg() {
  localStorage.setItem('rdr2_repo',   document.getElementById('cr').value);
  localStorage.setItem('rdr2_branch', document.getElementById('cb').value || 'main');
  localStorage.setItem('rdr2_token',  document.getElementById('ct').value);
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
async function init() {
  const cfg = getCfg();
  document.getElementById('cr').value = cfg.repo;
  document.getElementById('cb').value = cfg.branch;
  document.getElementById('ct').value = cfg.token;
  if (cfg.repo && cfg.token) await loadFromGH();
  else { const l = localStorage.getItem('rdr2_db'); if (l) try { db = JSON.parse(l); } catch(e){} }
  renderPTSel();
  buildAllTabs();
}

// ═══════════════════════════════════════════════════
// PLAYTHROUGH
// ═══════════════════════════════════════════════════
function renderPTSel() {
  const sel = document.getElementById('pts');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select Playthrough —</option>';
  Object.keys(db.playthroughs).forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n; sel.appendChild(o);
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

function confPT() {
  const name = document.getElementById('pti').value.trim();
  if (!name) return;
  if (db.playthroughs[name]) { alert('That name already exists.'); return; }
  db.playthroughs[name] = {};
  closeMo();
  renderPTSel();
  document.getElementById('pts').value = name;
  switchPT(name);
  saveLocal(); syncGH();
}

// ═══════════════════════════════════════════════════
// SLUG
// ═══════════════════════════════════════════════════
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

// ═══════════════════════════════════════════════════
// BUILD ALL TABS (run once on load)
// ═══════════════════════════════════════════════════
function buildAllTabs() {
  buildAnimals();
  buildPlants();
  buildFish();
  buildHorses();
  buildWeapons();
  buildEquip();
  buildTrapper();
  buildPearson();
  buildChallenges();
  buildStory();
  buildAchieve();
  buildCigs();
}

// ── helpers ──────────────────────────────────────

// Multi-check row (animals, plants, fish, horses)
function mcRow(prefix, i, label, cols, colLabels) {
  const cells = cols.map((active, j) => {
    if (!active) return `<div class="mc na"><div class="mcl">${colLabels[j]}</div><div class="mb"></div></div>`;
    return `<div class="mc" onclick="toggleMC('${prefix}${i}',${j})">
      <div class="mcl">${colLabels[j]}</div>
      <div class="mb" id="mb_${prefix}${i}_${j}"></div>
    </div>`;
  }).join('');
  return `<div class="mr" id="mr_${prefix}${i}">
    <div class="ml">${label}</div>
    <div class="mcc">${cells}</div>
  </div>`;
}

// Simple item row (weapons, equip, trapper, pearson, achievements)
function simRow(id, name, sub) {
  return `<div class="ir" id="ir_${id}" onclick="toggleSimple('${id}')">
    <div class="ick" id="ick_${id}"></div>
    <div><div class="in">${name}</div>${sub ? `<div class="isb">${sub}</div>` : ''}</div>
  </div>`;
}

// Section header
function secHdr(title, progId, count) {
  return `<div class="sh"><span class="st">${title}</span><span class="sp" id="${progId}">0/${count}</span></div>`;
}

// ── ANIMALS ──────────────────────────────────────
function buildAnimals() {
  const el = document.getElementById('tab-animals');
  const cols = AN_COLS; // ['TRACKED','KILLED','SKINNED','STUDIED']
  let html = '', curGrp = '';
  AN.forEach((a, i) => {
    const [grp, name, tr, ki, sk, st] = a;
    if (grp !== curGrp) {
      const items = AN.filter(x => x[0] === grp);
      html += secHdr(grp, `ap_${slug(grp)}`, `—`);
      curGrp = grp;
    }
    html += mcRow('an_', i, name, [tr, ki, sk, st], cols);
  });
  el.innerHTML = html;
}

// ── PLANTS ──────────────────────────────────────
function buildPlants() {
  const el = document.getElementById('tab-plants');
  const cols = PL_COLS; // ['PICKED','RECIPE','HERBALIST']
  let html = '', curCat = '';
  PL.forEach((p, i) => {
    const [cat, name, pi, re, he] = p;
    if (cat !== curCat) {
      html += secHdr(cat, `pp_${slug(cat)}`, `—`);
      curCat = cat;
    }
    html += mcRow('pl_', i, name, [pi, re, he], cols);
  });
  el.innerHTML = html;
}

// ── FISH ──────────────────────────────────────
function buildFish() {
  const el = document.getElementById('tab-fish');
  const cols = FI_COLS;
  const normal = FI.filter(f => !f[4]);
  const leg    = FI.filter(f => f[4]);
  let html = secHdr('Fish', 'fp_fish', normal.length);
  normal.forEach((f, i) => { html += mcRow('fi_', i, f[0], [f[1], f[2], f[3]], cols); });
  html += '<div class="orn">✦ ✦ ✦</div>';
  html += secHdr('Legendary Fish', 'fp_leg', leg.length);
  leg.forEach((f, i) => { html += mcRow('fl_', i, f[0], [f[1], f[2], f[3]], cols); });
  el.innerHTML = html;
}

// ── HORSES ──────────────────────────────────────
function buildHorses() {
  const el = document.getElementById('tab-horses');
  const cols = HO_COLS;
  let html = '', curBreed = '';
  HO.forEach((h, i) => {
    const [breed, coat, st, bo, ri, ho] = h;
    if (breed !== curBreed) {
      html += secHdr(breed, `hp_${slug(breed)}`, `—`);
      curBreed = breed;
    }
    html += mcRow('ho_', i, coat, [st, bo, ri, ho], cols);
  });
  el.innerHTML = html;
}

// ── WEAPONS ──────────────────────────────────────
function buildWeapons() {
  buildSimpleGrid('tab-weapons', WE, (item, i) => simRow(`we_${i}`, item[1], ''), item => item[0], 'wp_');
}

// ── EQUIPMENT ──────────────────────────────────────
function buildEquip() {
  buildSimpleGrid('tab-equip', EQ, (item, i) => simRow(`eq_${i}`, item[1], item[2]), item => item[0], 'eqp_');
}

// ── TRAPPER ──────────────────────────────────────
function buildTrapper() {
  buildSimpleGrid('tab-trapper', TR, (item, i) => simRow(`tr_${i}`, item[1], item[2]), item => item[0], 'trp_');
}

// ── PEARSON ──────────────────────────────────────
function buildPearson() {
  buildSimpleGrid('tab-pearson', PE, (item, i) => simRow(`pe_${i}`, item[1], item[2]), item => item[0], 'pep_');
}

// Generic helper for simple-grid sections
function buildSimpleGrid(tabId, data, rowFn, catFn, progPrefix) {
  const el = document.getElementById(tabId);
  let html = '', curCat = '';
  data.forEach((item, i) => {
    const cat = catFn(item);
    if (cat !== curCat) {
      if (curCat) html += '</div>';
      const count = data.filter(x => catFn(x) === cat).length;
      html += secHdr(cat, `${progPrefix}${slug(cat)}`, count);
      html += '<div class="ig">';
      curCat = cat;
    }
    html += rowFn(item, i);
    if (i === data.length - 1) html += '</div>';
  });
  el.innerHTML = html;
}

// ── CHALLENGES ──────────────────────────────────────
function buildChallenges() {
  const el = document.getElementById('tab-challenges');
  let html = '';
  Object.entries(CH).forEach(([set, tasks]) => {
    html += secHdr(set + ' Challenges', `chp_${slug(set)}`, tasks.length);
    tasks.forEach(([lvl, req, rew], i) => {
      const id = `ch_${slug(set)}_${i}`;
      html += `<div class="cr" id="ir_${id}" onclick="toggleSimple('${id}')">
        <div class="ick" id="ick_${id}"></div>
        <div class="clv">${lvl}</div>
        <div>
          <div class="crq" id="crq_${id}">${req}</div>
          <div class="crr">Reward: ${rew}</div>
        </div>
      </div>`;
    });
  });
  el.innerHTML = html;
}

// ── STORY ──────────────────────────────────────
function buildStory() {
  const el = document.getElementById('tab-story');
  let html = '';
  Object.entries(ST).forEach(([ch, missions]) => {
    html += secHdr(ch, `stp_${slug(ch)}`, missions.length);
    missions.forEach((m, i) => {
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
  });
  el.innerHTML = html;
}

// ── ACHIEVEMENTS ──────────────────────────────────────
function buildAchieve() {
  buildSimpleGrid('tab-achieve', AC, (item, i) => simRow(`ac_${i}`, item[0], ''), item => item[1], 'acp_');
}

// ── CIGARETTE CARDS ──────────────────────────────────────
function buildCigs() {
  const el = document.getElementById('tab-cigs');
  let html = '';
  Object.entries(CIG).forEach(([set, { reward, cards }]) => {
    html += secHdr(set, `cigp_${slug(set)}`, cards.length);
    html += `<div style="font-size:11px;color:var(--gold);margin-bottom:.5rem;font-family:var(--font-d)">Reward: ${reward}</div>`;
    html += `<table class="ct"><thead><tr>
      <th style="width:32px"></th><th>Card</th><th>State</th><th>Location</th><th>Description</th>
    </tr></thead><tbody>`;
    cards.forEach(([name, state, loc, desc], i) => {
      const id = `cig_${slug(set)}_${i}`;
      html += `<tr id="ctr_${id}">
        <td class="ccc" onclick="toggleCard('${id}')"><div class="mb" id="mb_${id}"></div></td>
        <td class="cn">${name}</td>
        <td class="cloc">${state}</td>
        <td class="cloc">${loc}</td>
        <td class="cloc">${desc}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  });
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// INTERACTIONS
// ═══════════════════════════════════════════════════

function toggleSimple(id) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const val = !D()[id];
  setD(id, val);
  const row = document.getElementById(`ir_${id}`);
  const ick = document.getElementById(`ick_${id}`);
  if (row) row.classList.toggle('on', val);
  if (ick) ick.classList.toggle('on', val);  // challenge rows reuse same ids
  updateOverview();
}

function toggleMC(prefix, j) {
  // prefix is like 'an_3', j is column index
  if (!pt) { alert('Select a playthrough first.'); return; }
  const key = `${prefix}_${j}`;
  const val = !D()[key];
  setD(key, val);
  const box = document.getElementById(`mb_${prefix}_${j}`);
  if (box) box.classList.toggle('on', val);
  // check if entire row is done
  const row = document.getElementById(`mr_${prefix}`);
  if (row) {
    const active = row.querySelectorAll('.mc:not(.na) .mb');
    const allOn = [...active].every(b => b.classList.contains('on'));
    row.classList.toggle('done', allOn && active.length > 0);
  }
  updateOverview();
}

function toggleCard(id) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const val = !D()[id];
  setD(id, val);
  const box = document.getElementById(`mb_${id}`);
  const row = document.getElementById(`ctr_${id}`);
  if (box) box.classList.toggle('on', val);
  if (row) row.classList.toggle('cdone', val);
  updateOverview();
}

function setMedal(id, medal) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const cur = D()[id];
  const val = (cur === medal) ? null : medal;
  setD(id, val);
  ['b', 's', 'g'].forEach(x => document.getElementById(`${id}_${x}`)?.classList.remove('on'));
  if (val) {
    const x = val === 'bronze' ? 'b' : val === 'silver' ? 's' : 'g';
    document.getElementById(`${id}_${x}`)?.classList.add('on');
  }
  // mark story row as having any medal
  const row = document.getElementById(`sor_${id}`);
  if (row) row.style.borderColor = val ? 'rgba(186,117,23,.4)' : '';
  updateOverview();
}

// ═══════════════════════════════════════════════════
// RENDER ALL on PT switch
// ═══════════════════════════════════════════════════
function renderAllChecks() {
  const d = D();

  // simple rows (weapons, equip, trapper, pearson, achievements, challenges)
  document.querySelectorAll('.ir').forEach(row => {
    const id = row.id.replace('ir_', '');
    const on = !!d[id];
    row.classList.toggle('on', on);
    const ick = document.getElementById(`ick_${id}`);
    if (ick) ick.classList.toggle('on', on);
  });

  // mc rows
  document.querySelectorAll('.mr').forEach(row => {
    const prefix = row.id.replace('mr_', '');
    const active = row.querySelectorAll('.mc:not(.na)');
    let allOn = active.length > 0;
    active.forEach(cell => {
      const onclick = cell.getAttribute('onclick') || '';
      const m = onclick.match(/toggleMC\('(.+)',(\d+)\)/);
      if (!m) return;
      const key = `${m[1]}_${m[2]}`;
      const on = !!d[key];
      const box = document.getElementById(`mb_${m[1]}_${m[2]}`);
      if (box) box.classList.toggle('on', on);
      if (!on) allOn = false;
    });
    row.classList.toggle('done', allOn);
  });

  // story medals
  Object.entries(ST).forEach(([ch, missions]) => {
    missions.forEach((_, i) => {
      const id = `st_${slug(ch)}_${i}`;
      const medal = d[id];
      ['b', 's', 'g'].forEach(x => document.getElementById(`${id}_${x}`)?.classList.remove('on'));
      if (medal) {
        const x = medal === 'bronze' ? 'b' : medal === 'silver' ? 's' : 'g';
        document.getElementById(`${id}_${x}`)?.classList.add('on');
        const row = document.getElementById(`sor_${id}`);
        if (row) row.style.borderColor = 'rgba(186,117,23,.4)';
      }
    });
  });

  // cigarette cards
  Object.entries(CIG).forEach(([set, { cards }]) => {
    cards.forEach((_, i) => {
      const id = `cig_${slug(set)}_${i}`;
      const on = !!d[id];
      document.getElementById(`mb_${id}`)?.classList.toggle('on', on);
      document.getElementById(`ctr_${id}`)?.classList.toggle('cdone', on);
    });
  });

  updateOverview();
}

// ═══════════════════════════════════════════════════
// OVERVIEW + SECTION PROGRESS
// ═══════════════════════════════════════════════════
function updateOverview() {
  const d = D();

  // — Achievements —
  const achDone = AC.filter((_, i) => d[`ac_${i}`]).length;
  setTxt('oa', `${achDone}/${AC.length}`);
  setBar('pba', achDone / AC.length * 100);

  // — Compendium (animals + plants + fish + horses + weapons) —
  let cTot = 0, cDon = 0;
  AN.forEach((a, i) => [a[2],a[3],a[4],a[5]].forEach((v,j) => { if (v) { cTot++; if (d[`an_${i}_${j}`]) cDon++; } }));
  PL.forEach((p, i) => [p[2],p[3],p[4]].forEach((v,j) => { if (v) { cTot++; if (d[`pl_${i}_${j}`]) cDon++; } }));
  FI.filter(f=>!f[4]).forEach((f, i) => [f[1],f[2],f[3]].forEach((v,j) => { if (v) { cTot++; if (d[`fi_${i}_${j}`]) cDon++; } }));
  FI.filter(f=>f[4]).forEach((f, i) => { if (f[1]) { cTot++; if (d[`fl_${i}_0`]) cDon++; } });
  HO.forEach((h, i) => [h[2],h[3],h[4],h[5]].forEach((v,j) => { if (v) { cTot++; if (d[`ho_${i}_${j}`]) cDon++; } }));
  WE.forEach((_, i) => { cTot++; if (d[`we_${i}`]) cDon++; });
  setTxt('oc', `${cDon}/${cTot}`);
  setBar('pbc', cTot ? cDon / cTot * 100 : 0);

  // — Challenges —
  const chAll = Object.entries(CH).flatMap(([s, t]) => t.map((_, i) => `ch_${slug(s)}_${i}`));
  const chDone = chAll.filter(id => d[id]).length;
  setTxt('och', `${chDone}/${chAll.length}`);
  setBar('pbch', chDone / chAll.length * 100);

  // — Story (count missions with any medal) —
  const stAll = Object.entries(ST).flatMap(([ch, ms]) => ms.map((_, i) => `st_${slug(ch)}_${i}`));
  const stDone = stAll.filter(id => d[id]).length;
  setTxt('os', `${stDone}/${stAll.length}`);
  setBar('pbs', stAll.length ? stDone / stAll.length * 100 : 0);

  // — Cigarette Cards —
  const cigAll = Object.entries(CIG).flatMap(([s, {cards}]) => cards.map((_, i) => `cig_${slug(s)}_${i}`));
  const cigDone = cigAll.filter(id => d[id]).length;
  setTxt('occ', `${cigDone}/${cigAll.length}`);
  setBar('pbcc', cigAll.length ? cigDone / cigAll.length * 100 : 0);

  // — Overall —
  const gt = AC.length + cTot + chAll.length + stAll.length + cigAll.length;
  const gd = achDone + cDon + chDone + stDone + cigDone;
  const pct = gt ? Math.round(gd / gt * 100) : 0;
  setTxt('ot', `${pct}%`);
  setBar('pbt', pct);

  updateSectionProgress(d);
}

function updateSectionProgress(d) {
  // Animals by group
  const aGroups = [...new Set(AN.map(a => a[0]))];
  aGroups.forEach(grp => {
    let tot = 0, don = 0;
    AN.forEach((a, i) => {
      if (a[0] !== grp) return;
      [a[2],a[3],a[4],a[5]].forEach((v,j) => { if (v) { tot++; if (d[`an_${i}_${j}`]) don++; } });
    });
    setTxt(`ap_${slug(grp)}`, `${don}/${tot}`);
  });

  // Plants by category
  const pCats = [...new Set(PL.map(p => p[0]))];
  pCats.forEach(cat => {
    let tot = 0, don = 0;
    PL.forEach((p, i) => {
      if (p[0] !== cat) return;
      [p[2],p[3],p[4]].forEach((v,j) => { if (v) { tot++; if (d[`pl_${i}_${j}`]) don++; } });
    });
    setTxt(`pp_${slug(cat)}`, `${don}/${tot}`);
  });

  // Fish
  { let tot=0,don=0; FI.filter(f=>!f[4]).forEach((f,i)=>[f[1],f[2],f[3]].forEach((v,j)=>{ if(v){tot++;if(d[`fi_${i}_${j}`])don++;} })); setTxt('fp_fish',`${don}/${tot}`); }
  { let tot=0,don=0; FI.filter(f=>f[4]).forEach((f,i)=>{ if(f[1]){tot++;if(d[`fl_${i}_0`])don++;} }); setTxt('fp_leg',`${don}/${tot}`); }

  // Horses by breed
  const hBreeds = [...new Set(HO.map(h => h[0]))];
  hBreeds.forEach(breed => {
    let tot = 0, don = 0;
    HO.forEach((h, i) => {
      if (h[0] !== breed) return;
      [h[2],h[3],h[4],h[5]].forEach((v,j) => { if (v) { tot++; if (d[`ho_${i}_${j}`]) don++; } });
    });
    setTxt(`hp_${slug(breed)}`, `${don}/${tot}`);
  });

  // Weapons by cat
  const wCats = [...new Set(WE.map(w => w[0]))];
  wCats.forEach(cat => {
    const items = WE.map((w,i)=>({w,i})).filter(({w})=>w[0]===cat);
    const don = items.filter(({i})=>d[`we_${i}`]).length;
    setTxt(`wp_${slug(cat)}`, `${don}/${items.length}`);
  });

  // Equipment by cat
  const eCats = [...new Set(EQ.map(e => e[0]))];
  eCats.forEach(cat => {
    const items = EQ.map((e,i)=>({e,i})).filter(({e})=>e[0]===cat);
    const don = items.filter(({i})=>d[`eq_${i}`]).length;
    setTxt(`eqp_${slug(cat)}`, `${don}/${items.length}`);
  });

  // Trapper by cat
  const tCats = [...new Set(TR.map(t => t[0]))];
  tCats.forEach(cat => {
    const items = TR.map((t,i)=>({t,i})).filter(({t})=>t[0]===cat);
    const don = items.filter(({i})=>d[`tr_${i}`]).length;
    setTxt(`trp_${slug(cat)}`, `${don}/${items.length}`);
  });

  // Pearson by cat
  const peCats = [...new Set(PE.map(p => p[0]))];
  peCats.forEach(cat => {
    const items = PE.map((p,i)=>({p,i})).filter(({p})=>p[0]===cat);
    const don = items.filter(({i})=>d[`pe_${i}`]).length;
    setTxt(`pep_${slug(cat)}`, `${don}/${items.length}`);
  });

  // Challenges by set
  Object.entries(CH).forEach(([set, tasks]) => {
    const don = tasks.filter((_,i) => d[`ch_${slug(set)}_${i}`]).length;
    setTxt(`chp_${slug(set)}`, `${don}/${tasks.length}`);
  });

  // Story by chapter
  Object.entries(ST).forEach(([ch, ms]) => {
    const don = ms.filter((_,i) => d[`st_${slug(ch)}_${i}`]).length;
    setTxt(`stp_${slug(ch)}`, `${don}/${ms.length}`);
  });

  // Achievements by cat
  const acCats = [...new Set(AC.map(a => a[1]))];
  acCats.forEach(cat => {
    const items = AC.map((a,i)=>({a,i})).filter(({a})=>a[1]===cat);
    const don = items.filter(({i})=>d[`ac_${i}`]).length;
    setTxt(`acp_${slug(cat)}`, `${don}/${items.length}`);
  });

  // Cigarette sets
  Object.entries(CIG).forEach(([set, {cards}]) => {
    const don = cards.filter((_,i) => d[`cig_${slug(set)}_${i}`]).length;
    setTxt(`cigp_${slug(set)}`, `${don}/${cards.length}`);
  });
}

function setTxt(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function setBar(id, p) { const e = document.getElementById(id); if (e) e.style.width = Math.min(100, Math.max(0, p)) + '%'; }

// ═══════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════
function showTab(name, btn) {
  document.querySelectorAll('.tp').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  btn.classList.add('active');
}

function toggleSet() { document.getElementById('settings-bar').classList.toggle('open'); }

// ═══════════════════════════════════════════════════
// PERSISTENCE — LOCAL
// ═══════════════════════════════════════════════════
function saveLocal() { localStorage.setItem('rdr2_db', JSON.stringify(db)); }

// ═══════════════════════════════════════════════════
// PERSISTENCE — GITHUB
// ═══════════════════════════════════════════════════
let syncTO = null;
function debouncedSync() { clearTimeout(syncTO); syncTO = setTimeout(syncGH, 3000); }

async function loadFromGH() {
  const cfg = getCfg(); if (!cfg.repo || !cfg.token) return;
  try {
    showSS('Loading from GitHub…', '');
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/data.json?ref=${cfg.branch}`,
      { headers: { Authorization: `token ${cfg.token}`, Accept: 'application/vnd.github.v3+json' } });
    if (res.status === 404) { showSS('data.json not found — will create on first save', 'ok'); return; }
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    db = JSON.parse(atob(json.content.replace(/\n/g, '')));
    localStorage.setItem('rdr2_sha', json.sha);
    saveLocal();
    showSS('Loaded ✓', 'ok');
    setTxt('ls', 'Last sync: ' + new Date().toLocaleTimeString());
  } catch (e) { showSS('Load failed: ' + e.message, 'err'); }
}

async function syncGH() {
  const cfg = getCfg(); if (!cfg.repo || !cfg.token) return;
  try {
    showSS('Syncing…', '');
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(db, null, 2))));
    const sha = localStorage.getItem('rdr2_sha');
    const body = { message: `Update – ${new Date().toISOString()}`, content, branch: cfg.branch };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/data.json`,
      { method: 'PUT', headers: { Authorization: `token ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    localStorage.setItem('rdr2_sha', json.content.sha);
    showSS('Synced ✓', 'ok');
    setTxt('ls', 'Last sync: ' + new Date().toLocaleTimeString());
  } catch (e) { showSS('Sync failed: ' + e.message, 'err'); }
}

let ssTO = null;
function showSS(msg, type) {
  const el = document.getElementById('ss');
  el.textContent = msg; el.className = 'vis ' + type;
  clearTimeout(ssTO); ssTO = setTimeout(() => el.classList.remove('vis'), 4000);
}

// ═══════════════════════════════════════════════════
// EXPORT / IMPORT CSV
// ═══════════════════════════════════════════════════
function exportCSV() {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const d = D();
  const rows = [['Playthrough', 'Section', 'Item', 'Field', 'Value']];

  AC.forEach(([name], i) => rows.push([pt, 'Achievement', name, 'obtained', d[`ac_${i}`] ? 'Yes' : 'No']));
  AN.forEach((a, i) => {
    ['TRACKED','KILLED','SKINNED','STUDIED'].forEach((f, j) => {
      if (a[j+2]) rows.push([pt, `Animal - ${a[0]}`, a[1], f, d[`an_${i}_${j}`] ? 'Yes' : 'No']);
    });
  });
  PL.forEach((p, i) => {
    ['PICKED','RECIPE','HERBALIST'].forEach((f, j) => {
      if (p[j+2]) rows.push([pt, `Plant - ${p[0]}`, p[1], f, d[`pl_${i}_${j}`] ? 'Yes' : 'No']);
    });
  });
  FI.filter(f=>!f[4]).forEach((f,i) => {
    ['CAUGHT','BAITED','SURVIVALIST'].forEach((lbl,j) => {
      if (f[j+1]) rows.push([pt, 'Fish', f[0], lbl, d[`fi_${i}_${j}`] ? 'Yes' : 'No']);
    });
  });
  FI.filter(f=>f[4]).forEach((f,i) => rows.push([pt, 'Legendary Fish', f[0], 'CAUGHT', d[`fl_${i}_0`] ? 'Yes' : 'No']));
  HO.forEach((h, i) => {
    ['STUDIED','BONDED','RIDDEN','HORSEMAN'].forEach((f, j) => {
      if (h[j+2]) rows.push([pt, `Horse - ${h[0]}`, h[1], f, d[`ho_${i}_${j}`] ? 'Yes' : 'No']);
    });
  });
  WE.forEach(([cat,name], i) => rows.push([pt, `Weapon - ${cat}`, name, 'obtained', d[`we_${i}`] ? 'Yes' : 'No']));
  EQ.forEach(([cat,name], i) => rows.push([pt, `Equipment - ${cat}`, name, 'obtained', d[`eq_${i}`] ? 'Yes' : 'No']));
  TR.forEach(([cat,name], i) => rows.push([pt, `Trapper - ${cat}`, name, 'crafted', d[`tr_${i}`] ? 'Yes' : 'No']));
  PE.forEach(([cat,name], i) => rows.push([pt, `Pearson - ${cat}`, name, 'crafted', d[`pe_${i}`] ? 'Yes' : 'No']));
  Object.entries(CH).forEach(([set,tasks]) => tasks.forEach(([lvl,req],i) =>
    rows.push([pt, `Challenge - ${set}`, req, lvl, d[`ch_${slug(set)}_${i}`] ? 'Yes' : 'No'])));
  Object.entries(ST).forEach(([ch,ms]) => ms.forEach((m,i) =>
    rows.push([pt, `Story - ${ch}`, m, 'medal', d[`st_${slug(ch)}_${i}`] || 'none'])));
  Object.entries(CIG).forEach(([set,{cards}]) => cards.forEach(([name,,loc],i) =>
    rows.push([pt, `Cigarette - ${set}`, name, loc, d[`cig_${slug(set)}_${i}`] ? 'Yes' : 'No'])));

  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `rdr2_${pt.replace(/\s+/g,'_')}.csv`;
  a.click();
}

function importCSV(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const lines = ev.target.result.split('\n').slice(1);
      let ptName = null;
      lines.forEach(line => {
        const cols = line.match(/("(?:[^"]|"")*"|[^,\r\n]+)/g);
        if (!cols || cols.length < 5) return;
        const clean = c => c.trim().replace(/^"|"$/g,'').replace(/""/g,'"');
        const [p, section, item, field, val] = cols.map(clean);
        if (!p) return;
        ptName = p;
        if (!db.playthroughs[p]) db.playthroughs[p] = {};
        const yes = val === 'Yes';
        if (section === 'Achievement') {
          const idx = AC.findIndex(a => a[0] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`ac_${idx}`] = true;
        } else if (section.startsWith('Animal - ')) {
          const flds = ['TRACKED','KILLED','SKINNED','STUDIED'];
          const j = flds.indexOf(field); if (j < 0) return;
          const idx = AN.findIndex(a => a[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`an_${idx}_${j}`] = true;
        } else if (section.startsWith('Plant - ')) {
          const flds = ['PICKED','RECIPE','HERBALIST'];
          const j = flds.indexOf(field); if (j < 0) return;
          const idx = PL.findIndex(a => a[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`pl_${idx}_${j}`] = true;
        } else if (section === 'Fish') {
          const flds = ['CAUGHT','BAITED','SURVIVALIST'];
          const j = flds.indexOf(field); if (j < 0) return;
          const idx = FI.filter(f=>!f[4]).findIndex(f => f[0] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`fi_${idx}_${j}`] = true;
        } else if (section === 'Legendary Fish') {
          const idx = FI.filter(f=>f[4]).findIndex(f => f[0] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`fl_${idx}_0`] = true;
        } else if (section.startsWith('Horse - ')) {
          const flds = ['STUDIED','BONDED','RIDDEN','HORSEMAN'];
          const j = flds.indexOf(field); if (j < 0) return;
          const idx = HO.findIndex(h => h[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`ho_${idx}_${j}`] = true;
        } else if (section.startsWith('Weapon - ')) {
          const idx = WE.findIndex(w => w[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`we_${idx}`] = true;
        } else if (section.startsWith('Equipment - ')) {
          const idx = EQ.findIndex(e => e[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`eq_${idx}`] = true;
        } else if (section.startsWith('Trapper - ')) {
          const idx = TR.findIndex(t => t[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`tr_${idx}`] = true;
        } else if (section.startsWith('Pearson - ')) {
          const idx = PE.findIndex(pe => pe[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`pe_${idx}`] = true;
        } else if (section.startsWith('Challenge - ')) {
          const set = section.replace('Challenge - ', '');
          const tasks = CH[set] || [];
          const idx = tasks.findIndex(t => t[1] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`ch_${slug(set)}_${idx}`] = true;
        } else if (section.startsWith('Story - ')) {
          const ch = section.replace('Story - ', '');
          const ms = ST[ch] || [];
          const idx = ms.indexOf(item);
          if (idx >= 0 && val !== 'none') db.playthroughs[p][`st_${slug(ch)}_${idx}`] = val;
        } else if (section.startsWith('Cigarette - ')) {
          const set = section.replace('Cigarette - ', '');
          const { cards } = CIG[set] || { cards: [] };
          const idx = cards.findIndex(c => c[0] === item);
          if (idx >= 0 && yes) db.playthroughs[p][`cig_${slug(set)}_${idx}`] = true;
        }
      });
      renderPTSel();
      if (ptName) { document.getElementById('pts').value = ptName; switchPT(ptName); }
      saveLocal(); syncGH();
      showSS('Import complete ✓', 'ok');
    } catch(err) { showSS('Import failed: ' + err.message, 'err'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════
init();
