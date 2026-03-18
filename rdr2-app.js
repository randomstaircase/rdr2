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
function getInv(mat) { return parseInt(db.inventory[mat] || 0); }
function setInv(mat, val) {
  db.inventory[mat] = Math.max(0, parseInt(val) || 0);
  saveLocal(); debouncedSync();
  refreshTrapperCan();
}

function getCfg() {
  return { repo: localStorage.getItem('rdr2_repo')||'', branch: localStorage.getItem('rdr2_branch')||'main', token: localStorage.getItem('rdr2_token')||'' };
}
function saveCfg() {
  localStorage.setItem('rdr2_repo',   document.getElementById('cr').value);
  localStorage.setItem('rdr2_branch', document.getElementById('cb').value || 'main');
  localStorage.setItem('rdr2_token',  document.getElementById('ct').value);
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }

// ═══════════════════ GOLD ═══════════════════
function saveGold(val) {
  db.gold = parseFloat(val) || 0;
  saveLocal(); debouncedSync();
}
function loadGold() {
  const el = document.getElementById('gold-val');
  if (el) el.value = (db.gold !== undefined) ? db.gold : '';
}

// ═══════════════════ INIT ═══════════════════
async function init() {
  const cfg = getCfg();
  document.getElementById('cr').value = cfg.repo;
  document.getElementById('cb').value = cfg.branch;
  document.getElementById('ct').value = cfg.token;
  if (cfg.repo && cfg.token) await loadFromGH();
  else { const l = localStorage.getItem('rdr2_db'); if (l) try { db = JSON.parse(l); } catch(e){} }
  if (!db.inventory) db.inventory = {};
  if (db.gold === undefined) db.gold = 0;
  loadGold();
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
function confPT() {
  const name = document.getElementById('pti').value.trim();
  if (!name) return;
  if (db.playthroughs[name]) { alert('Name already exists.'); return; }
  db.playthroughs[name] = {};
  closeMo(); renderPTSel();
  document.getElementById('pts').value = name;
  switchPT(name); saveLocal(); syncGH();
}

// ═══════════════════ BUILD TABS ═══════════════════
function buildAllTabs() {
  buildAnimals(); buildPlants(); buildFish(); buildHorses();
  buildWeapons(); buildEquip(); buildTrapper(); buildPearson();
  buildChallenges(); buildStory(); buildAchieve(); buildCigs();
}

// ── Section header helper ──
function secHdr(title, progId, total) {
  return `<div class="sh"><span class="st">${title}</span><span class="sp" id="${progId}">0/${total}</span></div>`;
}

// ── Multi-check row helper ──
function mcRow(prefix, i, label, cols, colLabels, extraClass) {
  const cells = cols.map((active, j) => {
    if (!active) return `<div class="mc na"><div class="mcl">${colLabels[j]}</div><div class="mb"></div></div>`;
    return `<div class="mc" onclick="toggleMC('${prefix}${i}',${j})"><div class="mcl">${colLabels[j]}</div><div class="mb" id="mb_${prefix}${i}_${j}"></div></div>`;
  }).join('');
  return `<div class="mr${extraClass?' '+extraClass:''}" id="mr_${prefix}${i}"><div class="ml">${label}</div><div class="mcc">${cells}</div></div>`;
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
  let html = '';
  groups.forEach(grp => {
    const items = AN.filter(a=>a[0]===grp);
    const tot = items.reduce((s,a)=>[a[2],a[3],a[4],a[5]].reduce((ss,v)=>ss+(v?1:0),s),0);
    html += secHdr(grp, `ap_${slug(grp)}`, tot);
    AN.forEach((a,i) => { if (a[0]===grp) html += mcRow('an_',i,a[1],[a[2],a[3],a[4],a[5]],AN_COLS); });
  });
  el.innerHTML = html;
}

// ── PLANTS ──
function buildPlants() {
  const el = document.getElementById('tab-plants');
  const cats = [...new Set(PL.map(p=>p[0]))];
  let html = '';
  cats.forEach(cat => {
    const items = PL.filter(p=>p[0]===cat);
    // For orchids, no recipe col
    const isOrchid = cat === 'ORCHID';
    const tot = items.reduce((s,p)=>{
      const cols = isOrchid?[p[2],0,p[4]]:[p[2],p[3],p[4]];
      return s + cols.reduce((ss,v)=>ss+(v?1:0),0);
    },0);
    html += secHdr(cat, `pp_${slug(cat)}`, tot);
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
  });
  el.innerHTML = html;
}

// ── FISH: Caught/Baited/Survivalist for regular; Caught-only for legendary ──
const FI_COLS_NORM = ['CAUGHT','BAITED','SURVIVALIST'];

function buildFish() {
  const el = document.getElementById('tab-fish');
  const normal = FI.filter(f=>!f[1]);
  const leg    = FI.filter(f=>f[1]);

  // calculate total checkboxes for regular fish (3 per fish)
  const normTot = normal.length * 3;
  let html = secHdr(`Fish (${normal.length} species)`, 'fp_fish', normTot);
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

  html += '<div class="orn">✦ ✦ ✦</div>';
  html += secHdr(`Legendary Fish (${leg.length})`, 'fp_leg', leg.length);
  leg.forEach((f,i) => {
    html += `<div class="mr" id="mr_fl_${i}">
      <div class="ml">${f[0]}</div>
      <div class="mcc"><div class="mc" onclick="toggleMC('fl_${i}',0)"><div class="mcl">CAUGHT</div><div class="mb" id="mb_fl_${i}_0"></div></div></div>
    </div>`;
  });
  el.innerHTML = html;
}

// ── HORSES (Horseman = one per breed) ──
function buildHorses() {
  const el = document.getElementById('tab-horses');
  const breeds = [...new Set(HO.map(h=>h[0]))];
  let html = '';
  breeds.forEach(breed => {
    const coats = HO.map((h,i)=>({h,i})).filter(({h})=>h[0]===breed);
    // hasHorseman: breed counts for Horseman challenge if any coat has flag set
    const hasHorseman = coats.some(({h})=>h[4]===1);
    const tot = coats.length * 3 + (hasHorseman ? 1 : 0);
    html += `<div class="sh"><span class="st">${breed}</span><span class="sp" id="hp_${slug(breed)}">0/${tot}</span></div>`;
    // Horseman row — one per breed
    if (hasHorseman) {
      const hmId = `ho_hm_${slug(breed)}`;
      html += `<div class="mr" id="mr_${hmId}" style="background:rgba(40,96,128,.12);border-color:rgba(42,96,128,.3);margin-bottom:6px">
        <div class="ml" style="color:var(--straw);font-size:12px;font-family:var(--font-d);letter-spacing:.05em">HORSEMAN CHALLENGE</div>
        <div class="mcc"><div class="mc" onclick="toggleSimple('${hmId}')"><div class="mcl">COMPLETE</div><div class="mb" id="mb_${hmId}"></div></div></div>
      </div>`;
    }
    coats.forEach(({h,i}) => {
      html += mcRow('ho_',i,h[1],[h[2],h[3],h[4]].slice(0,3),HO_COLS);
    });
  });
  el.innerHTML = html;
}

// ── WEAPONS ──
function buildWeapons() {
  const el = document.getElementById('tab-weapons');
  const cats = [...new Set(WE.map(w=>w[0]))];
  let html = '';
  cats.forEach(cat => {
    const items = WE.map((w,i)=>({w,i})).filter(({w})=>w[0]===cat);
    html += secHdr(cat, `wp_${slug(cat)}`, items.length);
    html += '<div class="ig">';
    items.forEach(({w,i}) => html += simRow(`we_${i}`,w[1],''));
    html += '</div>';
  });
  el.innerHTML = html;
}

// ── EQUIPMENT ──
function buildEquip() {
  const el = document.getElementById('tab-equip');
  const cats = [...new Set(EQ.map(e=>e[0]))];
  let html = '';
  cats.forEach(cat => {
    const items = EQ.map((e,i)=>({e,i})).filter(({e})=>e[0]===cat);
    html += secHdr(cat, `eqp_${slug(cat)}`, items.length);
    html += '<div class="ig">';
    items.forEach(({e,i}) => html += simRow(`eq_${i}`,e[1],e[2]));
    html += '</div>';
  });
  el.innerHTML = html;
}

// ── TRAPPER (inventory panel + craftable rows) ──
function buildTrapper() {
  const el = document.getElementById('tab-trapper');

  // Build inventory panel
  let invHtml = `<div class="inv-panel" id="inv-panel">
    <div class="inv-title">✦ INVENTORY</div>`;
  TR_MATS.forEach(mat => {
    invHtml += `<div class="inv-item">
      <span class="inv-name" id="inv-name-${slug(mat)}">${mat}</span>
      <input type="number" class="inv-input" min="0" max="99" value="${getInv(mat)}"
        id="inv-${slug(mat)}" oninput="setInv('${mat}',this.value)" onclick="this.select()"/>
    </div>`;
  });
  invHtml += '</div>';

  // Build craftable items
  const cats = [...new Set(TR.map(t=>t[0]))];
  let itemHtml = '<div id="tr-items">';
  cats.forEach(cat => {
    const items = TR.map((t,i)=>({t,i})).filter(({t})=>t[0]===cat);
    itemHtml += secHdr(cat, `trp_${slug(cat)}`, items.length);
    items.forEach(({t,i}) => {
      const mats = t[2]; // [[mat,qty],...]
      const chips = mats.map(([m,q]) => {
        const have = getInv(m);
        const ok = have >= q;
        return `<span class="mat-chip ${ok?'ok':'short'}" id="chip_tr_${i}_${slug(m)}">${m} (${have}/${q})</span>`;
      }).join('');
      itemHtml += `<div class="tr-row" id="tr_${i}" onclick="toggleTrapper(${i})">
        <div class="tr-top">
          <div class="ick" id="ick_tr_${i}"></div>
          <div class="tr-name">${t[1]}</div>
          <div class="can-badge" id="can_${i}" style="display:none">CAN CRAFT</div>
        </div>
        <div class="tr-mats">${chips}</div>
      </div>`;
    });
  });
  itemHtml += '</div>';

  el.innerHTML = `<div class="trapper-layout" style="display:grid;grid-template-columns:260px 1fr;gap:1rem;align-items:start;">${invHtml}${itemHtml}</div>`;
  refreshTrapperCan();
}

function canCraft(i) {
  const t = TR[i];
  return t[2].every(([m,q]) => getInv(m) >= q);
}

function refreshTrapperCan() {
  TR.forEach((t,i) => {
    const row = document.getElementById(`tr_${i}`); if (!row) return;
    const badge = document.getElementById(`can_${i}`);
    const d = D();
    const crafted = !!d[`tr_${i}`];
    const can = !crafted && canCraft(i);
    row.classList.toggle('can', can);
    if (badge) {
      if (crafted) {
        badge.textContent = 'CRAFTED';
        badge.style.background = 'var(--success)';
        badge.style.color = '#d0ffd8';
        badge.style.display = '';
      } else if (can) {
        badge.textContent = 'CAN CRAFT';
        badge.style.background = 'var(--can-craft-b)';
        badge.style.color = '#a0d8f0';
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
    // update chips
    t[2].forEach(([m,q]) => {
      const chip = document.getElementById(`chip_tr_${i}_${slug(m)}`);
      if (chip) {
        const have = getInv(m);
        chip.className = `mat-chip ${have>=q?'ok':'short'}`;
        chip.textContent = `${m} (${have}/${q})`;
      }
    });
    // update inv-name color
    TR_MATS.forEach(mat => {
      const el = document.getElementById(`inv-name-${slug(mat)}`); if (!el) return;
      // low if any uncrafted item needs more than we have
      const anyShort = TR.some((t,ti) => !d[`tr_${ti}`] && t[2].some(([m,q])=>m===mat && getInv(m)<q));
      el.classList.toggle('inv-low', anyShort);
    });
  });
}

function toggleTrapper(i) {
  if (!pt) { alert('Select a playthrough first.'); return; }
  const id = `tr_${i}`;
  const wasOn = !!D()[id];
  const nowOn = !wasOn;
  setD(id, nowOn);

  // adjust inventory
  const t = TR[i];
  t[2].forEach(([m,q]) => {
    const cur = getInv(m);
    if (nowOn) setInv(m, Math.max(0, cur - q));
    else       setInv(m, cur + q);
    // update input display
    const inp = document.getElementById(`inv-${slug(m)}`);
    if (inp) inp.value = getInv(m);
  });

  const row = document.getElementById(`tr_${i}`);
  const ick = document.getElementById(`ick_tr_${i}`);
  if (row) row.classList.toggle('on', nowOn);
  if (ick) ick.classList.toggle('on', nowOn);
  refreshTrapperCan();
  updateOverview();
}

// ── PEARSON (individual pelt checkboxes per requirement) ──
function buildPearson() {
  const el = document.getElementById('tab-pearson');
  const cats = [...new Set(PE.map(p=>p[0]))];
  let html = '';
  cats.forEach(cat => {
    const items = PE.map((p,i)=>({p,i})).filter(({p})=>p[0]===cat);
    html += secHdr(cat, `pep_${slug(cat)}`, items.length);
    items.forEach(({p,i}) => {
      const reqs = p[2]; // [[mat,qty],...]
      const reqBoxes = reqs.map(([m,q],ri) => {
        const reqId = `pe_${i}_r${ri}`;
        return `<div class="pe-req" onclick="event.stopPropagation();togglePeReq('${reqId}',${i})">
          <div class="mb" id="mb_${reqId}"></div>
          <span class="pe-req-name">${m}</span>
        </div>`;
      }).join('');
      html += `<div class="pe-item" id="pe_${i}">
        <div class="pe-header" onclick="togglePeItem(${i})">
          <div class="ick" id="ick_pe_${i}"></div>
          <div class="pe-name">${p[1]}</div>
        </div>
        <div class="pe-reqs">${reqBoxes}</div>
      </div>`;
    });
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
  // clicking the header toggles all reqs
  if (!pt) { alert('Select a playthrough first.'); return; }
  const p = PE[i];
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
  const allDone = p[2].every((_,ri) => D()[`pe_${i}_r${ri}`]);
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
  let html = '';
  Object.entries(ST).forEach(([ch,missions]) => {
    html += secHdr(ch, `stp_${slug(ch)}`, missions.length);
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
  });
  el.innerHTML = html;
}

// ── ACHIEVEMENTS ──
function buildAchieve() {
  const el = document.getElementById('tab-achieve');
  const cats = [...new Set(AC.map(a=>a[1]))];
  let html = '';
  cats.forEach(cat => {
    const items = AC.map((a,i)=>({a,i})).filter(({a})=>a[1]===cat);
    html += secHdr(cat, `acp_${slug(cat)}`, items.length);
    html += '<div class="ig">';
    items.forEach(({a,i}) => html += simRow(`ac_${i}`,a[0],''));
    html += '</div>';
  });
  el.innerHTML = html;
}

// ── CIGARETTE CARDS (collapsible, default expanded) ──
function buildCigs() {
  const el = document.getElementById('tab-cigs');
  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:.75rem;">
    <button class="btn btn-ghost" id="cig-toggle-btn" onclick="toggleAllCigs()">Collapse All</button>
  </div>`;
  Object.entries(CIG).forEach(([set,{reward,cards}]) => {
    const sid = slug(set);
    html += `<div class="coll-hdr open" id="cigh_${sid}" onclick="toggleColl(\'cig\',\'${sid}\')">
      <span class="coll-arrow">▶</span>
      <span class="coll-title">${set}</span>
      <span class="coll-prog" id="cigp_${sid}">0/${cards.length}</span>
    </div>
    <div class="coll-body open" id="cigb_${sid}">
      <div style="font-size:11px;color:var(--gold);margin-bottom:.5rem;font-family:var(--font-d)">Reward: ${reward}</div>
      <table class="ct"><thead><tr>
        <th style="width:32px"></th><th>Card</th><th>State</th><th>Location</th><th>Description</th>
      </tr></thead><tbody>`;
    cards.forEach(([name,state,loc,desc],i) => {
      const id = `cig_${sid}_${i}`;
      html += `<tr id="ctr_${id}">
        <td class="ccc" onclick="toggleCard(\'${id}\')"><div class="mb" id="mb_${id}"></div></td>
        <td class="cn">${name}</td>
        <td class="cloc">${state}</td>
        <td class="cloc">${loc}</td>
        <td class="cloc">${desc}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  });
  el.innerHTML = html;
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

  // simple rows
  document.querySelectorAll('.ir').forEach(row => {
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

  // trapper
  TR.forEach((t,i) => {
    const on = !!d[`tr_${i}`];
    document.getElementById(`tr_${i}`)?.classList.toggle('on', on);
    document.getElementById(`ick_tr_${i}`)?.classList.toggle('on', on);
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
    [0,1,2].forEach(j=>{fiTot++;if(d[`fi_${i}_${j}`])fiDon++;});
  });
  FI.filter(f=>f[1]).forEach((_,i)=>{fiTot++;if(d[`fl_${i}_0`])fiDon++;});
  setTxt('ov-fi',`${fiDon}/${fiTot}`); setBar('pb-fi',fiTot?fiDon/fiTot*100:0);

  // Horses (studied/bonded/ridden per coat + 1 horseman per qualifying breed)
  let hoTot=0,hoDon=0;
  HO.forEach((h,i)=>{
    [h[2],h[3],h[4]].forEach((v,j)=>{if(v){hoTot++;if(d[`ho_${i}_${j}`])hoDon++;}});
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
    FI.filter(f=>!f[1]).forEach((_,i)=>{ [0,1,2].forEach(j=>{ tot++; if(d[`fi_${i}_${j}`]) don++; }); });
    setTxt('fp_fish',`${don}/${tot}`); }
  { let tot=0,don=0;
    FI.filter(f=>f[1]).forEach((_,i)=>{ tot++; if(d[`fl_${i}_0`]) don++; });
    setTxt('fp_leg',`${don}/${tot}`); }
  // Horses by breed (coats + horseman per breed)
  [...new Set(HO.map(h=>h[0]))].forEach(breed=>{
    let tot=0,don=0;
    HO.forEach((h,i)=>{if(h[0]!==breed)return;[h[2],h[3],h[4]].forEach((v,j)=>{if(v){tot++;if(d[`ho_${i}_${j}`])don++;}});});
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
  // Trapper
  [...new Set(TR.map(t=>t[0]))].forEach(cat=>{
    const items=TR.map((t,i)=>({t,i})).filter(({t})=>t[0]===cat);
    setTxt(`trp_${slug(cat)}`,`${items.filter(({i})=>d[`tr_${i}`]).length}/${items.length}`);
  });
  // Pearson
  [...new Set(PE.map(p=>p[0]))].forEach(cat=>{
    const items=PE.map((p,i)=>({p,i})).filter(({p})=>p[0]===cat);
    const done=items.filter(({p,i})=>p[2].every((_,ri)=>d[`pe_${i}_r${ri}`])).length;
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
function showTab(name, btn, label) {
  document.querySelectorAll('.tp').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  btn.classList.add('active');
  // update active label and close dropdown
  const lbl = document.getElementById('tabs-active-label');
  if (lbl && label) lbl.textContent = '▸ ' + label;
  const dd = document.getElementById('tabs-dropdown');
  const mbtn = document.getElementById('tabs-menu-btn');
  if (dd) dd.classList.remove('open');
  if (mbtn) mbtn.classList.remove('open');
}

function toggleTabsMenu() {
  const dd = document.getElementById('tabs-dropdown');
  const btn = document.getElementById('tabs-menu-btn');
  if (!dd || !btn) return;
  const isOpen = dd.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  btn.textContent = isOpen ? '✕ Close' : '☰ Sections';
}

function toggleSet() { document.getElementById('settings-bar').classList.toggle('open'); }

// ═══════════════════ STORAGE ═══════════════════
function saveLocal(){localStorage.setItem('rdr2_db',JSON.stringify(db));}

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
    if (db.gold === undefined) db.gold = 0;
    saveLocal(); loadGold();
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
  TR.forEach(([cat,name],i)=>rows.push([pt,`Trapper-${cat}`,name,'crafted',d[`tr_${i}`]?'Yes':'No']));
  PE.forEach(([cat,name,reqs],i)=>reqs.forEach(([m],ri)=>rows.push([pt,`Pearson-${cat}`,name,m,d[`pe_${i}_r${ri}`]?'Yes':'No'])));
  Object.entries(CH).forEach(([set,tasks])=>tasks.forEach(([lvl,req],i)=>rows.push([pt,`Challenge-${set}`,req,lvl,d[`ch_${slug(set)}_${i}`]?'Yes':'No'])));
  Object.entries(ST).forEach(([ch,ms])=>ms.forEach((m,i)=>rows.push([pt,`Story-${ch}`,m,'medal',d[`st_${slug(ch)}_${i}`]||'none'])));
  Object.entries(CIG).forEach(([set,{cards}])=>cards.forEach(([name,,loc],i)=>rows.push([pt,`Cig-${set}`,name,loc,d[`cig_${slug(set)}_${i}`]?'Yes':'No'])));
  // Inventory
  TR_MATS.forEach(mat=>rows.push(['__inventory__','Inventory',mat,'count',getInv(mat)]));
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
        if(p==='__inventory__'&&section==='Inventory'){setInv(item,parseInt(val)||0);return;}
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
