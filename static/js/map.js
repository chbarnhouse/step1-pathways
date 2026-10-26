/* Whole-metabolism map (#/map): every metabolic pathway as a card, laid out like a textbook chart, joined through the
   molecules they hand each other (glucose-6-phosphate, pyruvate, acetyl-CoA…). An arrow shows which way a molecule
   goes: out of the pathway that makes it, into the one that uses it. Hover or focus a pathway to light up what it
   connects to; click it to open it. A molecule opens its Library page. Group chips narrow it down (they stack). */
'use strict';

// Card centers on a 1800 × 1260 chart: sugars and glycogen on top, glycolysis down the middle into the TCA cycle,
// nucleotides and one-carbon on the left, lipids on the right, the urea cycle, VOMIT and heme around the TCA cycle.
const MAP_CARDS = {
  'glycogen-synthesis': [470, 110], glycogenolysis: [910, 110], galactose: [1180, 190], eicosanoids: [1590, 90], sphingolipids: [1590, 170],
  ppp: [430, 330], polyol: [1420, 280], fructose: [1420, 460],
  glycolysis: [580, 440], gluconeogenesis: [900, 440],
  'purine-synthesis': [190, 450], 'purine-salvage': [190, 650], 'pyrimidine-synthesis': [190, 800], folate: [190, 960],
  'beta-oxidation': [1240, 610], 'fatty-acid-synthesis': [1240, 880], ketogenesis: [1560, 640], 'cholesterol-synthesis': [1560, 860], steroidogenesis: [1560, 1060],
  tca: [740, 850], urea: [430, 950], methionine: [330, 1140], 'propionyl-coa': [640, 1140],
  heme: [960, 1060], bilirubin: [1250, 1060], catecholamines: [1590, 1200],
};
// The molecules drawn as hand-offs, by name (as baseMetName reads it), and where.
const MAP_HUBS = {
  Glycogen: [690, 40], 'Glucose-1-phosphate': [690, 180], 'Glucose-6-phosphate': [690, 270], Glucose: [1000, 270],
  'Ribose-5-phosphate': [190, 330], 'Inosine monophosphate': [190, 550], Fructose: [1420, 370],
  'Dihydroxyacetone phosphate': [1180, 430], 'Glyceraldehyde-3-phosphate': [1180, 480],
  Pyruvate: [740, 570], Oxaloacetate: [940, 640], 'Acetyl-CoA': [1000, 730], Citrate: [1000, 860],
  'HMG-CoA': [1560, 750], Cholesterol: [1560, 960], Fumarate: [560, 870], 'Succinyl-CoA': [760, 1000],
  'N⁵-Methyl-THF': [190, 1060], Methionine: [480, 1060], 'α-Ketobutyrate': [480, 1200], Heme: [1110, 1120],
};
const MAP_GROUP_TONE = { Carbohydrates: 'blue', Energy: 'orange', Lipids: 'gold', 'Nitrogen & amino acids': 'teal', Nucleotides: 'pink', Heme: 'slate' };
const MAP = { groups: new Set(), focus: null };

// Who connects to what: a pathway touches a hand-off molecule when it has it as a box (made: arrow out; used: arrow in;
// both: a plain line), or when one of its links to another pathway names it ("succinyl-CoA, for ALA synthase").
function mapModel() {
  const cards = Object.keys(MAP_CARDS).map(id => Library.get(id)).filter(Boolean);
  const hubKey = Object.fromEntries(Object.keys(MAP_HUBS).map(n => [baseMetName(n), n]));
  const edges = [], seen = new Set(), direct = [];
  const hubOf = (a, b) => edges.some(e => e.pid === a && edges.some(f => f.pid === b && f.hub === e.hub));
  const add = (pid, hub, dir) => { const k = pid + '|' + hub; if (seen.has(k)) return; seen.add(k); edges.push({ pid, hub, dir }); };
  for (const p of cards) {
    for (const [mid, mt] of Object.entries(p.metabolites || {})) {
      const hub = hubKey[baseMetName(mt.name)]; if (!hub) continue;
      const made = p.reactions.some(r => r.to === mid || (r.also_to || []).includes(mid)), used = p.reactions.some(r => r.from === mid || (r.also_from || []).includes(mid));
      add(p.id, hub, made && !used ? 'out' : used && !made ? 'in' : 'both');
    }
    for (const l of p.links || []) {
      if (!MAP_CARDS[l.to]) continue;
      // The molecule a link names ("5-methyl-THF" finds N⁵-methyl-THF): out of one pathway, into the other.
      const loose = n => baseMetName(n).replace(/^n\d+/, ''), hub = Object.keys(MAP_HUBS).find(n => l.via && norm(l.via).includes(loose(n)));
      if (hub) { add(p.id, hub, l.dir === 'in' ? 'in' : 'out'); add(l.to, hub, l.dir === 'in' ? 'out' : 'in'); }
      else if (!hubOf(p.id, l.to)) direct.push({ a: p.id, b: l.to, via: l.via || '' });
    }
  }
  // Links through no drawn molecule (folate's dUMP → dTMP into pyrimidines): a dashed line between the two cards.
  const pairs = new Set(), lines = direct.filter(d => { const k = [d.a, d.b].sort().join('|'); if (pairs.has(k) || edges.some(e => e.pid === d.a && edges.some(f => f.pid === d.b && f.hub === e.hub))) return false; pairs.add(k); return true; });
  return { cards, edges, lines };
}
const mapGroupOn = p => !MAP.groups.size || MAP.groups.has(p.group);
function mapSVG() {
  const { cards, edges, lines } = mapModel(), CW = 214, CH = 52;
  const near = id => new Set([id, ...edges.filter(e => e.pid === id).map(e => 'h:' + e.hub), ...edges.filter(e => edges.some(f => f.pid === id && f.hub === e.hub)).map(e => e.pid), ...lines.flatMap(d => (d.a === id ? [d.b] : d.b === id ? [d.a] : []))]);
  const lit = MAP.focus ? near(MAP.focus) : null;
  const dim = key => (lit ? !lit.has(key) : false);
  // An edge: from the card's side nearest the molecule to the molecule's, an arrowhead on the end things flow into.
  const sideOf = (x, y, w, h, tx, ty) => { const dx = tx - x, dy = ty - y, s = Math.min(w / 2 / Math.abs(dx || 1e-6), h / 2 / Math.abs(dy || 1e-6)); return [x + dx * s, y + dy * s]; };
  let e = '';
  for (const ed of edges) {
    const p = Library.get(ed.pid), [cx, cy] = MAP_CARDS[ed.pid], [hx, hy] = MAP_HUBS[ed.hub], hw = ed.hub.length * 7 + 22;
    const a = sideOf(cx, cy, CW + 8, CH + 8, hx, hy), b = sideOf(hx, hy, hw + 8, 34, cx, cy);
    const [s0, s1] = ed.dir === 'in' ? [b, a] : [a, b], ang = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
    const off = !mapGroupOn(p) || dim(ed.pid) && dim('h:' + ed.hub) || (lit && !(lit.has(ed.pid) && lit.has('h:' + ed.hub)));
    e += `<g class="map-edge${off ? ' off' : ''}${lit && !off ? ' on' : ''}"><path d="M${s0[0]},${s0[1]}L${s1[0] - Math.cos(ang) * (ed.dir === 'both' ? 0 : 5)},${s1[1] - Math.sin(ang) * (ed.dir === 'both' ? 0 : 5)}"/>${ed.dir === 'both' ? '' : head(s1[0], s1[1], ang, 8, 'map-ah')}</g>`;
  }
  for (const d of lines) {
    const [ax, ay] = MAP_CARDS[d.a], [bx, by] = MAP_CARDS[d.b], a = sideOf(ax, ay, CW + 8, CH + 8, bx, by), b = sideOf(bx, by, CW + 8, CH + 8, ax, ay), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const off = !mapGroupOn(Library.get(d.a)) || !mapGroupOn(Library.get(d.b)) || (lit && !(lit.has(d.a) && lit.has(d.b))), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, w = d.via.length * 6.4 + 18;
    e += `<g class="map-edge dashed${off ? ' off' : ''}${lit && !off ? ' on' : ''}"><path d="M${a[0]},${a[1]}L${b[0] - Math.cos(ang) * 5},${b[1] - Math.sin(ang) * 5}"/>${head(b[0], b[1], ang, 8, 'map-ah')}${d.via ? `<rect class="map-via" x="${mx - w / 2}" y="${my - 10}" width="${w}" height="20" rx="10"/><text class="map-viat" x="${mx}" y="${my}">${esc(d.via)}</text>` : ''}</g>`;
  }
  let n = '';
  for (const [name, [x, y]] of Object.entries(MAP_HUBS)) {
    if (!edges.some(ed => ed.hub === name)) continue;
    const w = name.length * 7 + 22, off = lit ? !lit.has('h:' + name) : !edges.some(ed => ed.hub === name && mapGroupOn(Library.get(ed.pid)));
    n += `<a class="map-hub${off ? ' off' : ''}" href="${esc(catHref(tabOf('met'), catKey(name)))}" aria-label="${esc(name)}: open its page"><rect x="${x - w / 2}" y="${y - 13}" width="${w}" height="26" rx="13"/><text x="${x}" y="${y}">${esc(name)}</text></a>`;
  }
  for (const p of cards) {
    const [x, y] = MAP_CARDS[p.id], tone = MAP_GROUP_TONE[p.group] || 'slate', off = !mapGroupOn(p) || dim(p.id);
    n += `<a class="map-card t-${tone}${off ? ' off' : ''}${MAP.focus === p.id ? ' focus' : ''}" href="#/pathways/${esc(p.id)}" data-map="${esc(p.id)}" aria-label="${esc(p.name)}, ${esc(p.group)}: open it">
      <rect x="${x - CW / 2}" y="${y - CH / 2}" width="${CW}" height="${CH}" rx="12"/><text class="map-name${p.name.length > 24 ? ' long' : ''}" x="${x}" y="${y - 6}">${esc(p.name.replace(/\s*\(.*\)$/, ''))}</text><text class="map-grp" x="${x}" y="${y + 12}">${esc(p.group.toUpperCase())}</text></a>`;
  }
  return `<svg class="mapsvg" viewBox="0 0 1800 1260" role="img" aria-label="Metabolism map: pathways joined by the molecules they hand each other"><defs></defs>${e}${n}</svg>`;
}
function renderMap() {
  const groups = [...new Set(Object.keys(MAP_CARDS).map(id => Library.get(id)?.group).filter(Boolean))];
  $('#view').innerHTML = `<div class="page library mappage">
    ${pageHead('Library', 'How the metabolic pathways connect: each card is a pathway, each small box a molecule two of them share. Arrows show which way it goes. Hover a pathway to see its connections; click to open it.', '')}
    ${libTabs('map')}
    <div class="map-chips" role="group" aria-label="Show groups">${groups.map(g => `<button type="button" class="fchip${MAP.groups.has(g) ? ' on' : ''}" data-mapgrp="${esc(g)}" aria-pressed="${MAP.groups.has(g)}"><span class="map-dot t-${MAP_GROUP_TONE[g] || 'slate'}" aria-hidden="true"></span>${esc(g)}</button>`).join('')}
      ${MAP.groups.size ? '<button type="button" class="btn small ghost" data-mapgrp="">Show all</button>' : ''}</div>
    <div class="map-wrap card" id="mapWrap">${mapSVG()}</div>
  </div>`;
}
const mapRedraw = () => { const w = $('#mapWrap'); if (w) w.innerHTML = mapSVG(); };
document.addEventListener('click', e => {
  const g = e.target.closest('[data-mapgrp]'); if (!g) return;
  const k = g.dataset.mapgrp; if (!k) MAP.groups.clear(); else MAP.groups.has(k) ? MAP.groups.delete(k) : MAP.groups.add(k);
  renderMap();
});
// Hover (mouse) or keyboard focus lights a pathway's connections; leaving clears it.
const mapFocus = id => { if (MAP.focus === id) return; MAP.focus = id; mapRedraw(); };
document.addEventListener('pointerover', e => { if (!$('#mapWrap') || e.pointerType !== 'mouse') return; const c = e.target.closest?.('#mapWrap [data-map]'); mapFocus(c ? c.dataset.map : null); });
document.addEventListener('focusin', e => { const c = e.target.closest?.('#mapWrap [data-map]'); if (c && MAP.focus !== c.dataset.map) { MAP.focus = c.dataset.map; const id = c.dataset.map; mapRedraw(); $(`#mapWrap [data-map="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); } });
