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
  ['rl', 'Rate-limiting', ['k:']], ['loc', 'Compartments', ['z:']], ['drug', 'Drugs & toxins', ['q:']], ['links', 'Tags to other pathways', []], ['pairs', 'Lines between paired steps', []], ['bands', 'Group bands', []],
];
const MAP_DEFAULT = { tab: 'show', btab: 'path', bq: '', sel: [], merge: true, layers: { enz: true, trn: true, cof: true, need: true, rl: true, loc: true, drug: false, links: true, pairs: false, bands: true }, reg: '', off: null, q: '', side: true, hover: true }; // hover: Browse lights a row up while the pointer is on it
// (Once: settings saved before the merged chart became the cell, and the default, open on it; a choice made since stays.)
const mapCfg = () => { const c = local.get('pathways.map') || {}; if (!c.cellV) { c.merge = true; c.cellV = 1; local.set('pathways.map', c); } return { ...MAP_DEFAULT, ...c, layers: { ...MAP_DEFAULT.layers, ...(c.layers || {}) }, off: c.off || null, sel: c.sel || [] }; };
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

/* Merged: the pathways that are on joined into one drawing, each shared molecule drawn once with every pathway
   meeting at it (the same engine that joins pathways for a quiz). A search hit's keys, which name each pathway's own
   ids, become the joined drawing's ids. */
const MAP_MERGED = { sig: '', svg: '' };
function mapMergedKey(P, pid, k) {
  let T = P.stitch.tiles.find(t => t.id === pid), i = k.indexOf(':'), pre = k.slice(0, i + 1), id = k.slice(i + 1);
  // A pathway drawn inside a combined one (glycolysis in glycolysis + gluconeogenesis): its ids, by name, in the combined one.
  if (!T) {
    T = P.stitch.tiles.find(t => (Library.get(t.id)?.compose || []).includes(pid)); const C = T && Library.get(T.id), o = Library.get(pid); if (!C || !o) return null;
    const byName = (obj, n) => Object.keys(obj).find(x => norm(obj[x].name) === norm(n || ''));
    if (pre === 'm:') id = byName(C.metabolites, o.metabolites[id]?.name);
    else { const r = o.reactions.find(x => x.id === id); if (!r) return null;
      const en = o.enzymes[r.enzyme]?.name, names = [r.from, r.to].map(x => norm(o.metabolites[x]?.name || '')).sort().join('|');
      id = (C.compose[0] === pid && C.reactions.some(x => x.id === id) ? id : null) || C.reactions.find(x => x.id === `${pid}.${id}`)?.id
        || C.reactions.find(x => norm(C.enzymes[x.enzyme]?.name || '') === norm(en || '') && [x.from, x.to].map(y => norm(C.metabolites[y]?.name || '')).sort().join('|') === names)?.id; }
    if (!id) return null; pid = T.id;
  }
  return pre === 'm:' ? T && T.mid[id] && 'm:' + T.mid[id] : pre + pid + '.' + id;
}
// Everything of one pathway in the joined drawing: its steps and every box it has (shared ones too).
// (A pathway inside a combined one: its own steps and boxes, found by name.)
const mapMergedPathKeys = (P, pid) => { if (!P.stitch.tiles.some(t => t.id === pid)) { const o = Library.get(pid); return o ? uniq([...Object.keys(o.metabolites).map(id => 'm:' + id), ...o.reactions.map(r => 'e:' + r.id)].map(k => mapMergedKey(P, pid, k)).filter(Boolean)) : []; }
  return Object.keys(modelFor(P).items).filter(k => { const r = modelFor(P).items[k].rxn; return (r && r.id.startsWith(pid + '.')) || (k.startsWith('m:') && (P.stitch.origin.m[k.slice(2)] || []).some(([q]) => q === pid)); }); };
function mapMergedSVG(c) {
  const off = mapOff(c), ids = mapPathways().filter(p => !off.has(p.id)).map(p => p.id);
  MAPV.tiles = []; MAPV.merged = true;
  if (!ids.length) return '';
  const sig = JSON.stringify([ids, c.layers, c.reg, c.q, Store.data.custom && Object.keys(Store.data.custom).length]);
  if (MAP_MERGED.sig === sig) return MAP_MERGED.svg;
  // Built the way New quiz builds a set, so a pair that has its own combined drawing (glycolysis + gluconeogenesis) uses it.
  const d = { pathway: ids[0], extra: [], combine: false }; ids.slice(1).forEach(id => addPathway(d, id));
  const P = Library.get(draftPathway(d)); if (!P?.stitch && ids.length > 1) return '';
  const m = modelFor(P), found = mapSearch(c.q);
  // Lit: every key a search found (a whole pathway: its own steps and boxes).
  let lit = null;
  if (found) { lit = new Set();
    for (const [pid, f] of Object.entries(found)) {
      if (!ids.includes(pid)) continue;
      if (f.all) mapMergedPathKeys(P, pid).forEach(k => lit.add(k));
      else for (const k of f.keys) { const mk = mapMergedKey(P, pid, k); if (mk) lit.add(mk); }
    } }
  const hide = new Set(MAP_LAYERS.filter(([k]) => !c.layers[k]).flatMap(([, , pre]) => pre));
  const st = k => { const pre = k.slice(0, 2);
    if (lit && lit.has(k) && !/^[me]:/.test(k)) return 'shown';
    if (pre === 'y:' || pre === 'x:') return (pre === 'y:' ? 'fed' : 'fasting') === c.reg ? 'shown' : 'hide';
    if (hide.has(pre)) return 'hide';
    if (!lit) return 'shown';
    return lit.has(k) ? (/^[me]:/.test(k) ? 'focus' : 'shown') : /^[em]:/.test(k) ? 'dim' : 'shown'; };
  let svg;
  try { LINK_NAV = true; DRAW_PAIR_LINES = !!c.layers.pairs; svg = flowSVG(m, st, { zones: !!c.layers.loc }); } catch { return ''; } finally { LINK_NAV = false; DRAW_PAIR_LINES = false; }
  if (!c.layers.links) svg = svg.replace(/<(a|g) class="xlink[\s\S]*?<\/\1>/g, '');
  MAP_MERGED.sig = sig; MAP_MERGED.svg = svg.replace('class="flow', 'class="flow mapfull merged');
  MAP_MERGED.P = P;
  return MAP_MERGED.svg;
}
// Every pathway that's on, drawn and packed into its group's band: rows left to right, wrapping at the map's width.
function mapSVG(c) {
  if (c.merge) return mapMergedSVG(c);
  MAPV.merged = false;
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
  const tabs = `<div class="seg map-tabs" role="tablist" aria-label="Sidebar">${[['show', 'Show', 'tune'], ['browse', 'Browse', 'list']].map(([v, l, ic]) => `<button type="button" role="tab" data-maptab="${v}" aria-selected="${c.tab === v}" aria-pressed="${c.tab === v}">${mi(ic, 'sm')} ${l}${v === 'browse' && c.sel.length ? ` <span class="fdd-n">${c.sel.length}</span>` : ''}</button>`).join('')}</div>`;
  if (c.tab === 'browse') return `<div class="map-side-in">${tabs}${mapBrowseHTML(c)}</div>`;
  return `<div class="map-side-in">${tabs}
    <label class="search">${mi('search', 'sm')}<input type="search" data-mapq placeholder="Find a pathway, molecule, enzyme, drug" value="${esc(c.q)}" aria-label="Find on the map"></label>
    ${results}
    <h3 class="glabel">Layout</h3>
    <div class="seg" role="group" aria-label="Layout">${[[false, 'Each pathway whole'], [true, 'Merge shared molecules']].map(([v, l]) => `<button type="button" data-mapmerge="${v}" aria-pressed="${!!c.merge === v}" data-tip="${v ? 'One drawing: each molecule once, with every pathway that uses it meeting there' : 'Each pathway on its own, grouped in bands; hover a molecule to see its other copies'}">${l}</button>`).join('')}</div>
    <h3 class="glabel">Show</h3>
    <div class="map-sw">${MAP_LAYERS.map(([k, l]) => sw('data-maplayer', k, !!c.layers[k], l)).join('')}${sw('data-mapautohide', '1', Store.settings.autoHide !== false, 'Fade passing arrows')}</div>
    <h3 class="glabel">Fed or fasting</h3>
    <div class="seg" role="group" aria-label="Fed or fasting">${[['', 'Off'], ['fed', 'Fed'], ['fasting', 'Fasting']].map(([v, l]) => `<button type="button" data-mapreg="${v}" aria-pressed="${c.reg === v}">${l}</button>`).join('')}</div>
    <div class="sec-h"><h3 class="glabel">Pathways</h3><span class="btnrow"><button type="button" class="linkbtn" data-mapall="1">All</button><button type="button" class="linkbtn" data-mapall="0">None</button></span></div>
    ${mapGroups().map(([g, ps]) => { const n = ps.filter(p => !off.has(p.id)).length;
      return `<div class="map-grp"><button type="button" class="map-grp-h" data-mapgrp="${esc(g)}" aria-pressed="${n === ps.length}" aria-label="${esc(g)}: ${n} of ${ps.length} on; turn all ${n === ps.length ? 'off' : 'on'}"><span class="map-dot t-${MAP_GROUP_TONE[g] || 'slate'}"></span>${esc(g)} <span class="muted small">${n}/${ps.length}</span></button>
        <div class="map-sw">${ps.map(p => sw('data-mappath', p.id, !off.has(p.id), p.name)).join('')}</div></div>`; }).join('')}
  </div>`;
}
/* Browse: everything on the map as lists (pathways, molecules, enzymes, cofactors, drugs, toxins). Hover a row to
   light that thing up wherever it's drawn and fit the view to it; click to keep it lit (selected; saved). What's
   lit is the hovered row plus every selected one, and the view fits all of it. */
const MAP_BROWSE = [['path', 'Pathways'], ['met', 'Molecules'], ['enz', 'Enzymes'], ['cof', 'Cofactors'], ['drug', 'Drugs'], ['tox', 'Toxins']];
function mapBrowseEntries(kind) {
  if (kind === 'path') return mapPathways().map(p => ({ id: 'path|' + p.id, name: p.name, sub: p.group || 'Other', pids: [p.id], alt: p.aliases || [] }));
  return Object.values(catalog()[kind] || {}).map(e => ({ id: kind + '|' + e.key, name: e.name, sub: `${plural(e.pathways.size, 'pathway')}`, pids: [...e.pathways], alt: [...e.others, ...e.short] }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
function mapBrowseHTML(c) {
  const on = new Set(mapPathways().filter(p => !mapOff(c).has(p.id)).map(p => p.id)), q = norm(c.bq || '');
  // Every name it goes by counts (TCA, Krebs cycle, citric acid cycle): exact first, then starts-with, then contains.
  // A row found by another name says which, so the hit makes sense.
  const rank = x => { const ns = [x.name, ...x.alt].map(n => [n, norm(n)]), hit = f => ns.find(([, n]) => f(n));
    const m = hit(n => n === q) || hit(n => n.startsWith(q)) || hit(n => n.includes(q));
    if (!m) return [x, 9]; const r = norm(m[1]) === q ? 0 : norm(m[1]).startsWith(q) ? 1 : 2;
    return [m[0] === x.name ? x : { ...x, via: m[0] }, r]; };
  const rows = mapBrowseEntries(c.btab).map(x => q ? rank(x) : [x, 0]).filter(([, r]) => r < 9).sort((a, b) => a[1] - b[1]).map(([x]) => x);
  const sel = new Set(c.sel);
  return `<div class="seg map-btabs" role="group" aria-label="Browse">${MAP_BROWSE.map(([v, l]) => `<button type="button" data-mapbtab="${v}" aria-pressed="${c.btab === v}">${l}</button>`).join('')}</div>
    <label class="search">${mi('search', 'sm')}<input type="search" data-mapbq placeholder="Filter ${esc(MAP_BROWSE.find(b => b[0] === c.btab)[1].toLowerCase())}" value="${esc(c.bq)}" aria-label="Filter the list"></label>
    <div class="sec-h"><span class="muted small">${rows.length} · ${c.hover ? 'hover to light up, ' : ''}click to keep lit</span><button type="button" class="chip-tg small" data-maphover aria-pressed="${!!c.hover}" data-tip="Light up a row while the pointer is on it">${mi(c.hover ? 'check' : 'add', 'sm')} Light up on hover</button>${c.sel.length ? `<button type="button" class="linkbtn" data-mapclear>Clear selection (${c.sel.length})</button>` : ''}</div>
    <div class="map-list" role="list">${rows.map(x => { const vis = x.pids.some(id => on.has(id));
      return `<button type="button" role="listitem" class="map-row${vis ? '' : ' off'}" data-mapitem="${esc(x.id)}" aria-pressed="${sel.has(x.id)}">${mi(sel.has(x.id) ? 'check' : 'add', 'sm')}<span class="map-row-t"><span>${esc(x.name)}</span><span class="muted small">${x.via ? `as “${esc(x.via)}” · ` : ''}${esc(x.sub)}${vis ? '' : ' · not on the map'}</span></span></button>`; }).join('')}</div>`;
}
// The drawn elements for one browse entry: boxes and labels carrying its keys (a cofactor lights up its step's enzyme).
function mapEls(id) {
  const world = $('#mapStage .world'); if (!world) return [];
  const i = id.indexOf('|'), kind = id.slice(0, i), key = id.slice(i + 1), q = (root, k) => [...root.querySelectorAll(`[data-key="${CSS.escape(k)}"]`)];
  const withStep = (root, k) => { const els = q(root, k); return els.length || !/^[a-z]:/.test(k) ? els : q(root, 'e:' + k.slice(2)); };
  if (MAPV.merged) {
    const P = MAP_MERGED.P; if (!P) return [];
    if (kind === 'path') return mapMergedPathKeys(P, key).flatMap(k => q(world, k));
    return (catalog()[kind]?.[key]?.keys || []).flatMap(([pid, k]) => { const mk = mapMergedKey(P, pid, k); return mk ? withStep(world, mk) : []; });
  }
  const tile = pid => world.querySelector(`g.map-tile[data-mappid="${CSS.escape(pid)}"]`);
  if (kind === 'path') { const t = tile(key); return t ? [...t.querySelectorAll('g.mbox, g.elab, a.map-title')] : []; }
  return (catalog()[kind]?.[key]?.keys || []).flatMap(([pid, k]) => { const t = tile(pid); return t ? withStep(t, k) : []; });
}
// Light up the hovered and selected entries (everything else fades back); fit the view to them when asked.
function mapLight(fit) {
  const st = $('#mapStage'), svg = st?.querySelector('.world > svg'); if (!svg) return;
  svg.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
  const ids = uniq([...mapCfg().sel, ...(MAPV.hover ? [MAPV.hover] : [])]), els = ids.flatMap(mapEls);
  els.forEach(x => x.classList.add('hl'));
  svg.classList.toggle('hashl', els.length > 0);
  if (!fit || !els.length) return;
  const w = st.querySelector('.world'), wr = w.getBoundingClientRect(), k0 = st._v?.k || 1, rs = els.map(e => e.getBoundingClientRect()).filter(r => r.width || r.height);
  if (!rs.length) return;
  const x0 = (Math.min(...rs.map(r => r.left)) - wr.left) / k0, x1 = (Math.max(...rs.map(r => r.right)) - wr.left) / k0, y0 = (Math.min(...rs.map(r => r.top)) - wr.top) / k0, y1 = (Math.max(...rs.map(r => r.bottom)) - wr.top) / k0;
  const k = Math.min(1.2, Math.max(+st.dataset.min || 0.04, Math.min((st.clientWidth - 100) / (x1 - x0 || 1), (st.clientHeight - 100) / (y1 - y0 || 1))));
  setView(st, { k, x: st.clientWidth / 2 - (x0 + x1) / 2 * k, y: st.clientHeight / 2 - (y0 + y1) / 2 * k }, true);
}
let mapHoverTimer = 0;
// Hovering a row lights it up and fits the view to it; leaving it lets go of the light but keeps the view where it is.
// Only a click keeps something lit. (Off in the sidebar: rows only light up when clicked.)
const mapHover = id => { if (id && !mapCfg().hover) id = null; if (MAPV.hover === id) return; MAPV.hover = id; clearTimeout(mapHoverTimer); mapHoverTimer = setTimeout(() => mapLight(!!id), id ? 140 : 60); };
document.addEventListener('pointerover', e => { const r = e.target.closest?.('#mapSide [data-mapitem]'); if (r) mapHover(r.dataset.mapitem); else if (MAPV.hover) mapHover(null); });
document.addEventListener('pointerleave', e => { if (MAPV.hover && (e.target.id === 'mapSide' || e.target === document.documentElement)) mapHover(null); }, true);
window.addEventListener('blur', () => { if (MAPV.hover) mapHover(null); });
document.addEventListener('focusin', e => { const r = e.target.closest?.('#mapSide [data-mapitem]'); if (r) mapHover(r.dataset.mapitem); else if (MAPV.hover) mapHover(null); });
const MAP_EMPTY = '<svg class="flow" viewBox="0 0 10 10"></svg>';
function renderMap() {
  const c = mapCfg(), fresh = !$('#view .mappage'); // just opened (not a redraw on the page): fit it all on screen
  $('#view').innerHTML = `<div class="page mappage${c.side ? '' : ' noside'}">
    <aside class="map-side card" id="mapSide" aria-label="Map settings"${c.side ? '' : ' hidden'}>${mapSidebarHTML(c)}</aside>
    <section class="map-main card">
      <div class="map-bar"><button type="button" class="btn small ghost" data-mapside aria-expanded="${c.side}">${mi(c.side ? 'chevron_left' : 'tune', 'sm')} ${c.side ? 'Hide settings' : 'Settings'}</button><h1 class="map-h">Map</h1>${zoomBarHTML()}</div>
      <div class="stage canvas map-stage" data-view="map" data-min="0.04" id="mapStage">${canvasHTML(mapSVG(c) || MAP_EMPTY)}</div>
    </section>
  </div>`;
  applyZoom($('#view'));
  // (The stage settles its size over the first moments: fit again as it does, until the view is moved by hand.)
  if (fresh) { let last = null; const fit = () => { const st = $('#mapStage'); if (!st || !svgOf(st) || !st.clientWidth) return;
      if (last && st._v !== last) return; // moved since
      const { w, h } = contentSize(st), k = fitK(st, 'fit'); setView(st, { k, x: (st.clientWidth - w * k) / 2, y: Math.max(CANVAS.pad, (st.clientHeight - h * k) / 2) }); last = st._v; };
    requestAnimationFrame(fit); [150, 400, 900].forEach(t => setTimeout(fit, t)); }
  if (c.sel.length) requestAnimationFrame(() => mapLight(false));
}
// Redraws the canvas (keeping the view where it is) and, unless told not to, the sidebar.
function mapRefresh(side = true) {
  const c = mapCfg(), st = $('#mapStage'); if (!st) return renderMap();
  const v = st._v, world = st.querySelector('.world');
  world.innerHTML = mapSVG(c) || MAP_EMPTY;
  if (v) setView(st, v); else applyZoom($('#view'));
  if (side) $('#mapSide').innerHTML = mapSidebarHTML(c);
  mapLight(false);
}
// Fly to a pathway (and its found item): centered, zoomed so the pathway fits (closer for one item).
// On the merged drawing, where things are is read off the drawing itself: the found item's box or label, or else
// everything of that pathway.
function mapGoMerged(pid, keys) {
  const st = $('#mapStage'), w = st?.querySelector('.world'), P = MAP_MERGED.P; if (!w || !P) return;
  const want = keys.length ? keys.map(k => mapMergedKey(P, pid, k)).filter(Boolean) : Object.keys(modelFor(P).items).filter(k => modelFor(P).items[k].rxn?.id.startsWith(pid + '.'));
  const els = want.flatMap(k => [...w.querySelectorAll(`[data-key="${CSS.escape(k)}"]`)]); if (!els.length) return;
  const wr = w.getBoundingClientRect(), k0 = st._v?.k || 1, rs = els.map(e => e.getBoundingClientRect());
  const x0 = (Math.min(...rs.map(r => r.left)) - wr.left) / k0, x1 = (Math.max(...rs.map(r => r.right)) - wr.left) / k0, y0 = (Math.min(...rs.map(r => r.top)) - wr.top) / k0, y1 = (Math.max(...rs.map(r => r.bottom)) - wr.top) / k0;
  const k = Math.min(1.1, Math.max(0.3, Math.min((st.clientWidth - 80) / (x1 - x0 || 1), (st.clientHeight - 80) / (y1 - y0 || 1))));
  setView(st, { k, x: st.clientWidth / 2 - (x0 + x1) / 2 * k, y: st.clientHeight / 2 - (y0 + y1) / 2 * k }, true);
}
function mapGo(pid, keys = []) {
  if (MAPV.merged) return mapGoMerged(pid, keys);
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
  // (A view setting, not a layer: nothing is redrawn, the arrows just come back or go.)
  const ah = t.closest('[data-mapautohide]');
  if (ah) { Store.settings.autoHide = Store.settings.autoHide === false; Store.save(); ah.setAttribute('aria-pressed', String(Store.settings.autoHide)); const st = canvasStage(); if (st) { st._rt = null; autoHide(st); edgeHintsSoon(st); } return; }
  if (reg) { c.reg = reg.dataset.mapreg; mapSave(c); return mapRefresh(); }
  const tb = t.closest('[data-maptab]'), bt = t.closest('[data-mapbtab]'), item = t.closest('[data-mapitem]');
  if (tb) { c.tab = tb.dataset.maptab; mapSave(c); MAPV.hover = null; $('#mapSide').innerHTML = mapSidebarHTML(c); return; }
  if (bt) { c.btab = bt.dataset.mapbtab; c.bq = ''; mapSave(c); $('#mapSide').innerHTML = mapSidebarHTML(c); return; }
  if (t.closest('[data-maphover]')) { c.hover = !c.hover; mapSave(c); MAPV.hover = null; $('#mapSide').innerHTML = mapSidebarHTML(c); return mapLight(false); }
  if (t.closest('[data-mapclear]')) { c.sel = []; mapSave(c); $('#mapSide').innerHTML = mapSidebarHTML(c); return mapLight(false); }
  if (item) { const id = item.dataset.mapitem, on = c.sel.includes(id); c.sel = on ? c.sel.filter(x => x !== id) : [...c.sel, id]; mapSave(c);
    item.setAttribute('aria-pressed', String(!on)); item.querySelector('svg, .mi')?.replaceWith(document.createRange().createContextualFragment(mi(on ? 'add' : 'check', 'sm')));
    const n = $('#mapSide [data-maptab="browse"]'); if (n) n.innerHTML = `${mi('list', 'sm')} Browse${c.sel.length ? ` <span class="fdd-n">${c.sel.length}</span>` : ''}`;
    return mapLight(true); }
  const mg = t.closest('[data-mapmerge]');
  if (mg) { c.merge = mg.dataset.mapmerge === 'true'; mapSave(c); const st = $('#mapStage'); if (st) st._v = null; mapRefresh(); return applyZoom($('#view')); }
  if (path) { const id = path.dataset.mappath; off.has(id) ? off.delete(id) : off.add(id); c.off = [...off]; mapSave(c); return mapRefresh(); }
  if (grp) { const ps = mapGroups().find(([g]) => g === grp.dataset.mapgrp)?.[1] || [], allOn = ps.every(p => !off.has(p.id)); ps.forEach(p => (allOn ? off.add(p.id) : off.delete(p.id))); c.off = [...off]; mapSave(c); return mapRefresh(); }
  if (all) { c.off = all.dataset.mapall === '1' ? [] : mapPathways().map(p => p.id); mapSave(c); return mapRefresh(); }
  if (side) { c.side = !c.side; mapSave(c); return renderMap(); }
  if (go) { const h = MAPV.hits[+go.dataset.mapgo]; if (!h) return; if (off.has(h.pid)) { off.delete(h.pid); c.off = [...off]; mapSave(c); mapRefresh(); } return mapGo(h.pid, h.keys); }
  // A tag to another pathway flies there when it's on the map.
  const x = t.closest('#mapStage a[href^="#/pathways/"]');
  if (x && !x.classList.contains('map-title')) { const id = decodeURIComponent(x.getAttribute('href').split('/')[2]); if (MAPV.tiles.some(tt => tt.id === id)) { e.preventDefault(); e.stopPropagation(); mapGo(id); } }
}, true);
let mapBqTimer = 0;
document.addEventListener('input', e => {
  const q = e.target.closest?.('[data-mapbq]'); if (!q) return;
  clearTimeout(mapBqTimer);
  mapBqTimer = setTimeout(() => { const c = mapCfg(); c.bq = q.value; mapSave(c); const list = $('#mapSide .map-list'), tmp = document.createElement('div'); tmp.innerHTML = mapBrowseHTML(c);
    list.replaceWith(tmp.querySelector('.map-list')); $('#mapSide .sec-h .muted').textContent = tmp.querySelector('.sec-h .muted').textContent; }, 150);
});
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
