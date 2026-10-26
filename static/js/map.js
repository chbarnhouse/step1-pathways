/* The map (#/map): every pathway drawn in full on one canvas, like a wall chart of metabolism. Each pathway keeps
   its own layout and sits in its group's tinted band (sugars, energy, lipids, nitrogen, nucleotides, heme…); a
   pathway's tags to others ("→ TCA cycle") fly the view there. The sidebar shows or hides any kind of label and any
   pathway (as New quiz's settings do), and searches: matches stand out, everything else fades back.
   Hover a molecule to light up every copy of it on the map. */
'use strict';

// Where each pathway sits in its group's band, in reading order (others in a group follow by name).
const MAP_ORDER = {
  Carbohydrates: ['glycolysis', 'gluconeogenesis', 'glycogen-synthesis', 'glycogenolysis', 'ppp', 'galactose', 'fructose', 'polyol'],
  Energy: ['tca'],
  Lipids: ['fatty-acid-synthesis', 'beta-oxidation', 'ketogenesis', 'cholesterol-synthesis', 'steroidogenesis', 'sphingolipids', 'eicosanoids'],
  'Nitrogen & amino acids': ['urea', 'methionine', 'propionyl-coa', 'catecholamines'],
  Nucleotides: ['purine-synthesis', 'purine-salvage', 'pyrimidine-synthesis', 'folate'],
  Heme: ['heme', 'bilirubin'],
  'Blood & immunity': [], Nephron: [],
};
const MAP_GROUP_TONE = { Carbohydrates: 'blue', Energy: 'orange', Lipids: 'gold', 'Nitrogen & amino acids': 'teal', Nucleotides: 'pink', Heme: 'slate', 'Blood & immunity': 'pink', Nephron: 'teal' };
const MAP_OFF_GROUPS = ['Blood & immunity', 'Nephron']; // not metabolism: off until you turn them on
// What the sidebar can show or hide. Each is a set of item-key prefixes (as the quiz names them).
const MAP_LAYERS = [
  ['enz', 'Enzymes', ['e:', 'f:']], ['trn', 'Transporters', ['t:']], ['cof', 'Cofactors', ['c:', 'o:']], ['need', 'What steps need (vitamins)', ['n:']],
  ['rl', 'Rate-limiting', ['k:']], ['loc', 'Compartments', ['z:']], ['drug', 'Drugs & toxins', ['q:']], ['links', 'Tags to other pathways', []], ['bands', 'Group bands', []],
];
const MAP_DEFAULT = { layers: { enz: true, trn: true, cof: true, need: true, rl: true, loc: true, drug: false, links: true, bands: true }, reg: '', off: null, q: '', side: true };
const mapCfg = () => { const c = local.get('pathways.map') || {}; return { ...MAP_DEFAULT, ...c, layers: { ...MAP_DEFAULT.layers, ...(c.layers || {}) }, off: c.off || null }; };
const mapSave = c => local.set('pathways.map', c);
const MAPV = { tiles: [], hits: [] };
const MAP_SHAPE = [1.5, 2.2]; // how wide a group block and the whole map run, against the square root of their area

const mapPathways = () => Library.atomic().filter(p => (p.reactions || []).length && !p.stitch);
function mapGroups() {
  const g = {};
  for (const p of mapPathways()) (g[p.group || 'Other'] = g[p.group || 'Other'] || []).push(p);
  const order = [...Object.keys(MAP_ORDER), ...Object.keys(g).filter(k => !MAP_ORDER[k]).sort()];
  return order.filter(k => g[k]).map(k => [k, g[k].sort((a, b) => { const o = MAP_ORDER[k] || [], i = o.indexOf(a.id), j = o.indexOf(b.id); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.name.localeCompare(b.name); })]);
}
// Off pathways: by default, the groups that aren't metabolism.
const mapOff = c => new Set(c.off || mapPathways().filter(p => MAP_OFF_GROUPS.includes(p.group)).map(p => p.id));

/* Search: a pathway's name lights up the whole pathway; a molecule, enzyme, carrier, cofactor or drug lights up
   itself (and the steps it's on), and fades the rest. Returns { pid: { all, keys: Set, names: [...] } } or null. */
function mapSearch(q) {
  q = norm(q || ''); if (q.length < 2) return null;
  const out = {}, hit = n => n && norm(n).includes(q);
  for (const p of mapPathways()) {
    if ([p.name, ...(p.aliases || [])].some(hit)) { out[p.id] = { all: true, keys: new Set(), names: [] }; continue; }
    let m; try { m = modelFor(p); } catch { continue; }
    const keys = new Set(), names = [];
    for (const it of Object.values(m.items)) {
      const ns = [it.name, it.short, ...(it.aliases || []), ...(it.drugs || []).flatMap(d => [d.name, d.cls, ...(d.aliases || [])])];
      const n = ns.find(hit); if (!n) continue;
      keys.add(it.key); names.push(it.kind === 'drug' ? n : it.name);
      const r = it.rxn; if (r) { keys.add('e:' + r.id); [r.from, r.to].forEach(id => keys.add('m:' + id)); }
      if (it.kind === 'met') for (const r of p.reactions) if (r.from === it.id || r.to === it.id) keys.add('e:' + r.id);
    }
    if (keys.size) out[p.id] = { all: false, keys, names: uniq(names) };
  }
  return out;
}
function mapStatus(c, found) {
  const hide = new Set(MAP_LAYERS.filter(([k]) => !c.layers[k]).flatMap(([, , pre]) => pre));
  return pid => k => {
    const pre = k.slice(0, 2);
    const f = found?.[pid];
    if (f && !f.all && f.keys.has(k) && !/^[me]:/.test(k)) return 'shown'; // what you searched for shows even when its layer is off
    if (pre === 'y:' || pre === 'x:') return (pre === 'y:' ? 'fed' : 'fasting') === c.reg ? 'shown' : 'hide';
    if (hide.has(pre)) return 'hide';
    if (!f || f.all) return 'shown';
    return f.keys.has(k) ? (/^[me]:/.test(k) ? 'focus' : 'shown') : /^[em]:/.test(k) ? 'dim' : 'shown';
  };
}

// Every pathway that's on, drawn and packed into its group's band: rows left to right, wrapping at the map's width.
function mapSVG(c) {
  const off = mapOff(c), found = mapSearch(c.q), st = mapStatus(c, found), GAP = 90, TITLE = 54;
  const drawn = mapGroups().map(([g, ps]) => [g, ps.filter(p => !off.has(p.id)).map(p => {
    let svg; DRAW_POS = {};
    try { LINK_NAV = true; svg = flowSVG(modelFor(p), st(p.id), { zones: !!c.layers.loc }); } catch { DRAW_POS = null; return null; } finally { LINK_NAV = false; }
    const pos = DRAW_POS || {}, steps = { ...STEP_AT }; DRAW_POS = null;
    return { p, svg, pos, steps, vb: svg.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number) };
  }).filter(Boolean)]).filter(([, ts]) => ts.length);
  // Each group packs into its own block (rows of pathways, about square), then the blocks fill the map's rows the
  // same way: a group of one (the TCA cycle) sits beside the others instead of taking a row of its own.
  const pack = (items, W) => { let x = 0, y = 0, rowH = 0; const at = items.map(it => { if (x > 0 && x + it.w > W) { x = 0; y += rowH + GAP; rowH = 0; } const p = [x, y]; x += it.w + GAP; rowH = Math.max(rowH, it.h); return p; });
    return { at, w: Math.max(...items.map((it, i) => at[i][0] + it.w)), h: y + rowH }; };
  const blocks = drawn.map(([g, ts]) => {
    const items = ts.map(t => ({ w: t.vb[2], h: t.vb[3] + TITLE })), area = items.reduce((n, it) => n + (it.w + GAP) * (it.h + GAP), 0);
    const P = pack(items, Math.max(...items.map(it => it.w), Math.sqrt(area) * MAP_SHAPE[0]));
    return { g, ts, P, w: P.w + 80, h: P.h + 110 };
  });
  const total = blocks.reduce((n, b) => n + (b.w + GAP) * (b.h + GAP), 0), M = pack(blocks, Math.max(...blocks.map(b => b.w), Math.sqrt(total * MAP_SHAPE[1])));
  let s = '', bands = '';
  MAPV.tiles = [];
  blocks.forEach((b, bi) => {
    const bx = 40 + M.at[bi][0], by = 50 + M.at[bi][1];
    if (c.layers.bands) bands += `<g class="map-band t-${MAP_GROUP_TONE[b.g] || 'slate'}"><rect x="${bx}" y="${by}" width="${b.w}" height="${b.h}" rx="28"/><text x="${bx + 28}" y="${by + 40}">${esc(b.g)}</text></g>`;
    b.ts.forEach(({ p, svg, pos, steps, vb }, i) => {
      const x = bx + 40 + b.P.at[i][0], y = by + 70 + b.P.at[i][1], w = vb[2], h = vb[3];
      const faded = found && !found[p.id];
      let body = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
      if (!c.layers.links) body = body.replace(/<(a|g) class="xlink[\s\S]*?<\/\1>/g, '');
      s += `<g class="map-tile${faded ? ' faded' : ''}" data-mappid="${esc(p.id)}">
        <a class="map-title" href="#/pathways/${esc(p.id)}"><text x="${x}" y="${y + 26}">${esc(p.name)}</text></a>
        <svg x="${x}" y="${y + TITLE}" width="${w}" height="${h}" viewBox="${vb.join(' ')}" overflow="hidden">${body}</svg></g>`;
      MAPV.tiles.push({ id: p.id, name: p.name, x, y: y + TITLE, w, h, vb, pos, steps });
    });
  });
  if (!MAPV.tiles.length) return '';
  const maxX = M.w + 120, H = M.h + 120;
  // Find-your-way grid: a letter per 800 px across, a number per 800 px down (as wall charts have).
  let grid = '';
  for (let i = 0, gx = 0; gx < maxX; i++, gx += 800) grid += `<text class="map-grid" x="${gx + 400}" y="18">${String.fromCharCode(65 + (i % 26))}</text>`;
  for (let i = 1, gy = 0; gy < H; i++, gy += 800) grid += `<text class="map-grid" x="8" y="${gy + 400}">${i}</text>`;
  return `<svg class="flow mapfull" viewBox="0 0 ${maxX} ${H}" role="img" aria-label="Map of the pathways">${bands}${grid}${s}</svg>`;
}

function mapSidebarHTML(c) {
  const off = mapOff(c), found = mapSearch(c.q), sw = (attr, v, on, label) => `<button type="button" class="chip-tg small" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const hits = found ? Object.entries(found) : [];
  MAPV.hits = hits.map(([pid, f]) => ({ pid, keys: [...f.keys], all: f.all }));
  const results = !found ? '' : hits.length ? `<ul class="map-results">${hits.map(([pid, f], i) => `<li><button type="button" class="linkbtn" data-mapgo="${i}">${esc(Library.get(pid)?.name || pid)}</button>
      <span class="muted small">${esc(f.all ? 'the whole pathway' : f.names.slice(0, 3).join(', '))}${off.has(pid) ? ' · hidden: turned on when you go' : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">Nothing by that name.</p>';
  return `<div class="map-side-in">
    <label class="search">${mi('search', 'sm')}<input type="search" data-mapq placeholder="Find a pathway, molecule, enzyme, drug" value="${esc(c.q)}" aria-label="Find on the map"></label>
    ${results}
    <h3 class="glabel">Show</h3>
    <div class="map-sw">${MAP_LAYERS.map(([k, l]) => sw('data-maplayer', k, !!c.layers[k], l)).join('')}</div>
    <h3 class="glabel">Fed or fasting</h3>
    <div class="seg" role="group" aria-label="Fed or fasting">${[['', 'Off'], ['fed', 'Fed'], ['fasting', 'Fasting']].map(([v, l]) => `<button type="button" data-mapreg="${v}" aria-pressed="${c.reg === v}">${l}</button>`).join('')}</div>
    <div class="sec-h"><h3 class="glabel">Pathways</h3><span class="btnrow"><button type="button" class="linkbtn" data-mapall="1">All</button><button type="button" class="linkbtn" data-mapall="0">None</button></span></div>
    ${mapGroups().map(([g, ps]) => { const n = ps.filter(p => !off.has(p.id)).length;
      return `<div class="map-grp"><button type="button" class="map-grp-h" data-mapgrp="${esc(g)}" aria-pressed="${n === ps.length}" aria-label="${esc(g)}: ${n} of ${ps.length} on; turn all ${n === ps.length ? 'off' : 'on'}"><span class="map-dot t-${MAP_GROUP_TONE[g] || 'slate'}"></span>${esc(g)} <span class="muted small">${n}/${ps.length}</span></button>
        <div class="map-sw">${ps.map(p => sw('data-mappath', p.id, !off.has(p.id), p.name)).join('')}</div></div>`; }).join('')}
  </div>`;
}
const MAP_EMPTY = '<svg class="flow" viewBox="0 0 10 10"></svg>';
function renderMap() {
  const c = mapCfg();
  $('#view').innerHTML = `<div class="page mappage${c.side ? '' : ' noside'}">
    <aside class="map-side card" id="mapSide" aria-label="Map settings"${c.side ? '' : ' hidden'}>${mapSidebarHTML(c)}</aside>
    <section class="map-main card">
      <div class="map-bar"><button type="button" class="btn small ghost" data-mapside aria-expanded="${c.side}">${mi(c.side ? 'chevron_left' : 'tune', 'sm')} ${c.side ? 'Hide settings' : 'Settings'}</button><h1 class="map-h">Map</h1>${zoomBarHTML()}</div>
      <div class="stage canvas map-stage" data-view="map" data-min="0.04" id="mapStage">${canvasHTML(mapSVG(c) || MAP_EMPTY)}</div>
    </section>
  </div>`;
  applyZoom($('#view'));
}
// Redraws the canvas (keeping the view where it is) and, unless told not to, the sidebar.
function mapRefresh(side = true) {
  const c = mapCfg(), st = $('#mapStage'); if (!st) return renderMap();
  const v = st._v, world = st.querySelector('.world');
  world.innerHTML = mapSVG(c) || MAP_EMPTY;
  if (v) setView(st, v); else applyZoom($('#view'));
  if (side) $('#mapSide').innerHTML = mapSidebarHTML(c);
}
// Fly to a pathway (and its found item): centered, zoomed so the pathway fits (closer for one item).
function mapGo(pid, keys = []) {
  const st = $('#mapStage'), t = MAPV.tiles.find(x => x.id === pid); if (!st || !t) return;
  let px = t.x + t.w / 2, py = t.y + t.h / 2, k = Math.min(1.1, Math.max(0.3, Math.min((st.clientWidth - 60) / t.w, (st.clientHeight - 60) / t.h)));
  const at = keys.map(key => (key[0] === 'm' ? t.pos[key] && [t.pos[key].x + t.pos[key].w / 2, t.pos[key].y + t.pos[key].h / 2] : key[0] === 'e' ? t.steps[key.slice(2)] : null)).find(Boolean);
  if (at) { px = t.x + at[0] - t.vb[0]; py = t.y + at[1] - t.vb[1]; k = Math.max(k, 0.8); }
  setView(st, { k, x: st.clientWidth / 2 - px * k, y: st.clientHeight / 2 - py * k }, true);
}
document.addEventListener('click', e => {
  if (!$('#view .mappage')) return;
  const c = mapCfg(), t = e.target, off = mapOff(c);
  const lay = t.closest('[data-maplayer]'), reg = t.closest('[data-mapreg]'), path = t.closest('[data-mappath]'), grp = t.closest('[data-mapgrp]'), all = t.closest('[data-mapall]'), go = t.closest('[data-mapgo]'), side = t.closest('[data-mapside]');
  if (lay) { c.layers[lay.dataset.maplayer] = !c.layers[lay.dataset.maplayer]; mapSave(c); return mapRefresh(); }
  if (reg) { c.reg = reg.dataset.mapreg; mapSave(c); return mapRefresh(); }
  if (path) { const id = path.dataset.mappath; off.has(id) ? off.delete(id) : off.add(id); c.off = [...off]; mapSave(c); return mapRefresh(); }
  if (grp) { const ps = mapGroups().find(([g]) => g === grp.dataset.mapgrp)?.[1] || [], allOn = ps.every(p => !off.has(p.id)); ps.forEach(p => (allOn ? off.add(p.id) : off.delete(p.id))); c.off = [...off]; mapSave(c); return mapRefresh(); }
  if (all) { c.off = all.dataset.mapall === '1' ? [] : mapPathways().map(p => p.id); mapSave(c); return mapRefresh(); }
  if (side) { c.side = !c.side; mapSave(c); return renderMap(); }
  if (go) { const h = MAPV.hits[+go.dataset.mapgo]; if (!h) return; if (off.has(h.pid)) { off.delete(h.pid); c.off = [...off]; mapSave(c); mapRefresh(); } return mapGo(h.pid, h.keys); }
  // A tag to another pathway flies there when it's on the map.
  const x = t.closest('#mapStage a[href^="#/pathways/"]');
  if (x && !x.classList.contains('map-title')) { const id = decodeURIComponent(x.getAttribute('href').split('/')[2]); if (MAPV.tiles.some(tt => tt.id === id)) { e.preventDefault(); e.stopPropagation(); mapGo(id); } }
}, true);
let mapTimer = 0;
document.addEventListener('input', e => {
  const q = e.target.closest?.('[data-mapq]'); if (!q) return;
  clearTimeout(mapTimer);
  mapTimer = setTimeout(() => { const c = mapCfg(); c.q = q.value; mapSave(c); mapRefresh(false);
    const sd = $('#mapSide'), pos = q.selectionStart; sd.innerHTML = mapSidebarHTML(c); const nq = sd.querySelector('[data-mapq]'); nq.focus(); nq.setSelectionRange(pos, pos); }, 250);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest?.('[data-mapq]') && MAPV.hits[0]) { e.preventDefault(); mapGo(MAPV.hits[0].pid, MAPV.hits[0].keys); } });
// Hover a molecule: every box of that name on the map lights up.
document.addEventListener('pointerover', e => {
  const st = e.target.closest?.('#mapStage'); if (!st) return;
  const b = e.target.closest('g.mbox'), name = b?.querySelector('text')?.textContent.trim();
  st.querySelectorAll('g.mbox.same').forEach(x => x.classList.remove('same'));
  if (name) st.querySelectorAll('g.mbox').forEach(x => { if (x.querySelector('text')?.textContent.trim() === name) x.classList.add('same'); });
});
