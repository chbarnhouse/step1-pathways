/* Rendering: flow diagrams (linear and cyclic SVG), the list view, and the single-step pair.
   Every function takes the model `m` and a status function key → shown|blank|target|peek|right|missed|start.
   States are never color-only: dashed = hidden, thick = current, check / cross icons, START label. */
'use strict';

const hidden = st => st === 'blank' || st === 'target';
// A blank says what goes there (on top of its shape: box = metabolite, pill = enzyme/transporter or cofactors, tag = compartment).
// p.terms (immunology: cells and cytokines) rename what a blank asks for.
const blankWord = item => item?.term || (item?.kind === 'trn' || item?.rxn?.transport ? 'transporter' : { met: 'metabolite', enz: 'enzyme', cof: 'cofactors', loc: 'compartment' }[item?.kind] || '?');
const blankText = (x, y, word) => `<text class="bk" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${esc(word)}</text>`;
const pillW = word => Math.max(48, word.length * 7.2 + 26);
// When set ({draft, bad}), the current blank becomes a text field right on the diagram (Type answers, occlusion modes).
let INLINE = null;
const inlineInput = () => INLINE.along ? alongWidget(INLINE.along, INLINE.draft, INLINE.hinted)
  : withLocked(INLINE.q, INLINE.check ? checkWidget(INLINE.check, INLINE.draft, INLINE.hinted, INLINE.q)
  : `<input class="ans inl-in${INLINE.bad ? ' bad' : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(INLINE.q?.locked?.length ? '' : INLINE.kind || '?')}" aria-label="Your answer${INLINE.kind ? ': ' + esc(INLINE.kind) : ''}" value="${esc(INLINE.draft)}">`);
// The answer field is real HTML floating over an empty slot in the diagram (placeInline in quiz.js keeps it there).
// Not a <foreignObject>: Safari misplaces those once the diagram is zoomed.
let INLINE_FORM = '';
function inlineField(x, y, w, h) {
  INLINE_FORM = `<form class="inl inl-float" data-q="0">${inlineInput()}</form>`;
  return `<rect class="inl-slot" x="${x}" y="${y}" width="${w}" height="${h}" fill="none"/>`;
}
const BW = 212, BH = 40, GAP = 72, CX = 222, SIDEX = 556, TOP = 18;
const TAB_ROOM = 64; // extra gap where a joined drawing's main line enters another compartment (linearSVG tabRoom)
const TAB_BAND = 70; // ...where that step's name and cofactors stop short of the box: its compartment's name tab goes there

function head(x, y, ang, size = 9, cls = 'ah') {
  // An inhibiting step (tag "inhibits") ends in a flat bar, ⊣, so inhibition reads by shape, not just its color or label.
  // An effect still to answer ends in an open circle: no arrowhead or bar to give it away.
  if (cls.includes('effq')) return `<circle class="effq-dot" cx="${x - Math.cos(ang) * 5}" cy="${y - Math.sin(ang) * 5}" r="5"/>`;
  if (cls.includes('inh')) { const px = -Math.sin(ang) * 7, py = Math.cos(ang) * 7, bx = x - Math.cos(ang) * 4, by = y - Math.sin(ang) * 4; return `<path class="ln inh-bar${cls.includes('fx-inh') ? ' fx-inh' : ''}" d="M${bx + px},${by + py}L${bx - px},${by - py}"/>`; }
  const a1 = ang + Math.PI * 0.84, a2 = ang - Math.PI * 0.84;
  return `<path class="${cls}" d="M${x},${y}L${x + size * Math.cos(a1)},${y + size * Math.sin(a1)}L${x + size * Math.cos(a2)},${y + size * Math.sin(a2)}Z"/>`;
}
/* Right-angle connectors, tidier than slanted lines: a polyline [[x, y], …] with rounded corners. The arrowhead sits on
   the last point; a reversible step gets one on the first too. */
function elbow(pts, rev, cls = 'ln') {
  const dirOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]), n = pts.length;
  const endAng = dirOf(pts[n - 2], pts[n - 1]), startAng = dirOf(pts[1], pts[0]);
  const P = pts.map(q => [...q]);
  P[n - 1] = [P[n - 1][0] - Math.cos(endAng) * 6, P[n - 1][1] - Math.sin(endAng) * 6];
  if (rev) P[0] = [P[0][0] - Math.cos(startAng) * 6, P[0][1] - Math.sin(startAng) * 6];
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 1; i < n - 1; i++) {
    const [px, py] = P[i - 1], [x, y] = P[i], [nx, ny] = P[i + 1];
    const r = Math.min(12, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    d += ` L${x - Math.sign(x - px) * r},${y - Math.sign(y - py) * r} Q${x},${y} ${x + Math.sign(nx - x) * r},${y + Math.sign(ny - y) * r}`;
  }
  d += ` L${P[n - 1][0]},${P[n - 1][1]}`;
  return `<path class="${cls}" d="${d}"/>` + head(pts[n - 1][0], pts[n - 1][1], endAng, 9, headCls(cls)) + (rev ? head(pts[0][0], pts[0][1], startAng) : '');
}
// A step's enzyme and cofactors along a right-angle connector: on its horizontal run if that's long enough (name above,
// cofactors below), else beside its vertical run (name left, cofactors right).
function elbowLabels(m, statusOf, r, h, v) {
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id), cs = cofSt(m, statusOf, r), cof = cs !== 'none' && cs !== 'hide';
  let s = '';
  if (h && Math.abs(h[1][0] - h[0][0]) >= 150) {
    const y = h[0][1], dir = Math.sign(h[1][0] - h[0][0]), len = Math.abs(h[1][0] - h[0][0]);
    // The spot along the run with nothing just above it (a blank is a tall pill), the middle if it's free.
    const xAt = f => h[0][0] + (h[1][0] - h[0][0]) * f;
    const f = (r.via ? [0.68, 0.78, 0.6, 0.85] : [0.5, 0.65, 0.75, 0.85, 0.35, 0.25, 0.15]).find(f => !DRAW_BOXES.some(bx => overlaps({ x: xAt(f) - 90, y: y - 46, w: 180, h: 40 }, bx))) ?? 0.5, mx = xAt(f);
    const half = Math.min(len / 2 - 14, 130), a0 = Math.max(Math.min(h[0][0], h[1][0]) + 14, mx - half), a1 = Math.min(Math.max(h[0][0], h[1][0]) - 14, mx + half);
    // Cofactors go under the run unless something is already there; then they go above it, with the name above them.
    const up = cof && hitsBox({ x: a0, y: y + 8, w: a1 - a0, h: 52 }) && !hitsBox({ x: a0, y: y - 60, w: a1 - a0, h: 52 });
    const ly = up ? y - 62 : y - 8;
    s += enzLabel(mx, ly, it, es, 'middle', 22, 'bottom'); DRAW_LABELS.push(enzRect(mx, ly, 'middle', it, 22, 'bottom'));
    if (cof) s += cofArcLine(dir > 0 ? [a0, y] : [a1, y], dir > 0 ? [a1, y] : [a0, y], [0, up ? -1 : 1], cofParts(m, statusOf, r));
  } else if (v) {
    let x = v[0][0], y0 = Math.min(v[0][1], v[1][1]), y1 = Math.max(v[0][1], v[1][1]);
    // Something already sitting on the run (a carrier pill) is skipped: the labels use the stretch past it.
    for (const l of DRAW_LABELS) if (l.x < x && l.x + l.w > x && l.y < y1 && l.y + l.h > y0) { if (l.y + l.h / 2 < (y0 + y1) / 2) y0 = Math.max(y0, l.y + l.h + 4); else y1 = Math.min(y1, l.y - 4); }
    if (y1 - y0 < 40) { y0 = Math.min(v[0][1], v[1][1]); y1 = Math.max(v[0][1], v[1][1]); }
    const ym = (y0 + y1) / 2;
    // Name left of the run and cofactors right, unless the left is taken (a box beside the run) and the right isn't.
    // Three ways to lay it out: name left, cofactors right (usual); both right, the name beyond the cofactors; both left,
    // mirrored. The first that lands on nothing, else the one that lands on least.
    const cw = cof ? Math.max(0, ...cofParts(m, statusOf, r).map(q => (hidden(q.st) ? 110 : q.text.length * 7))) + 64 : 14;
    const count = rs => rs.filter(q => q && hitsBox(q)).length;
    // A long run: its labels take a 110-px stretch of it, the middle if that's clear, else wherever along it is.
    const stretches = y1 - y0 > 150 ? [0.5, 0.35, 0.65, 0.22, 0.78].map(f => { const c = y0 + (y1 - y0) * f; return [Math.max(y0, c - 55), Math.min(y1, c + 55)]; }) : [[y0, y1]];
    let o = null;
    for (const [a0, a1] of stretches) {
      const cofBox = sx => ({ x: sx > 0 ? x + 40 : x - cw, y: a0, w: cw - 30, h: a1 - a0 }), c = (a0 + a1) / 2;
      const opts = [[-14, 'end', 1], [cw, 'start', 1], [-cw, 'end', -1]].map(([dx, an, sx]) => ({ dx, an, sx, a0, a1, c, n: count([enzRect(x + dx, c, an, it, 18), cof && cofBox(sx)]) }));
      const best = opts.find(q => !q.n) || opts.slice().sort((p, q) => p.n - q.n)[0];
      if (!o || best.n < o.n) o = best;
      if (!o.n) break;
    }
    s += enzLabel(x + o.dx, o.c, it, es, o.an, 18, 'center'); DRAW_LABELS.push(enzRect(x + o.dx, o.c, o.an, it, 18));
    if (cof) s += cofArcParts(x, o.a0, o.a1, cofParts(m, statusOf, r), v[1][1] < v[0][1], o.sx < 0);
  }
  return s;
}
/* A step drawn between the parts of a joined drawing can put its name and cofactors on any leg of its route. Every
   layout on every long-enough leg is scored by what it would cover (boxes and labels alike); the first that covers
   nothing wins (longest legs first), else the one that covers least. */
const NONAME = { x: -1e7, y: -1e7, w: 0, h: 0 }; // (no name to place)
function routeStepLabels(m, statusOf, r, P, lineHit = () => false) { // lineHit(rect): it would sit on a line already drawn
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id), cs = cofSt(m, statusOf, r), cof = cs !== 'none' && cs !== 'hide';
  // (Its own route counts too: text on the very line it names.)
  const own = q => P.slice(1).some((v, i) => { const u = P[i]; return Math.max(u[0], v[0]) > q.x + 1 && Math.min(u[0], v[0]) < q.x + q.w - 1 && Math.max(u[1], v[1]) > q.y + 2 && Math.min(u[1], v[1]) < q.y + q.h - 2; });
  // In compartment bands: never across a membrane, and better in the band where the enzyme works.
  const zr = (ROUTE_BANDS || ROUTE_FLOOR) && r.loc ? (k => (ROUTE_BANDS || ROUTE_FLOOR).alias?.[k] || k)(zoneKey(m, r.loc, r.tissue)) : '', bandCost = q => { if (ROUTE_FLOOR && q?.w) return floorCost(q); if (!ROUTE_BANDS || !q?.w) return 0;
    if (ROUTE_BANDS.some((b, i) => i && q.x < b.x0 - 2 && q.x + q.w > b.x0 + 2)) return 10;
    const at = ROUTE_BANDS.find(b => q.x + q.w / 2 >= b.x0 && q.x + q.w / 2 < b.x1); return zr && at && ROUTE_BANDS.some(b => b.z === zr) && at.z !== zr ? 2 : 0; };
  // (The Map's floorplan: the same, with its membranes as edges between regions.)
  const floorCost = q => { const F = ROUTE_FLOOR; if (F.segs.some(([a, b, c, d]) => (a === c ? a > q.x + 2 && a < q.x + q.w - 2 && Math.max(b, d) > q.y && Math.min(b, d) < q.y + q.h : b > q.y + 2 && b < q.y + q.h - 2 && Math.max(a, c) > q.x && Math.min(a, c) < q.x + q.w))) return 10;
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2, at = F.rects.filter(r => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h).pop(); return zr && at && F.rects.some(r => r.zs.includes(zr)) && !at.zs.includes(zr) ? 2 : 0; };
  const parts = cof ? cofParts(m, statusOf, r) : [], count = rs => rs.reduce((n, q) => n + bandCost(q) + (!q ? 0 : q.hit || DRAW_BOXES.some(b => overlaps(q, b)) ? 10 : DRAW_LABELS.some(l => overlaps(q, l)) ? 3 : lineHit(q) || (q.w && own(q)) || TAB_SPOTS.some(l => overlaps(q, l)) ? 1 : 0), 0); // (when nothing is clean: over a line or a compartment's name spot beats over a name, over a name beats over a box)
  const self = rs => { const t = rs.filter(q => q && q.w); let n = 0; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (overlaps(t[i], t[j])) n += 3; return n; }; // its own texts on each other
  // What a layout's cofactor text actually is, where it lands, tried without keeping anything.
  // (Drawn as the real thing is: its name already there, which the curl steers around; and curls record their labels.)
  // Its curl too, sampled every 8 px (a 4-px square each): a curl through a label is as bad as text on one.
  // (The curl is checked only for the layouts in the running, best first: sampling every one is what made the Map slow.)
  let CURL = null;
  const drawn = (f, name) => { if (!cof) { CURL = () => false; return []; } const keep = COF_SPOTS.length, kl = DRAW_LABELS.length; DRAW_LABELS.push(name); const svg = f(); COF_SPOTS.length = keep; DRAW_LABELS.length = kl;
    CURL = () => { const probe = pathProbe();
      for (const pm of svg.matchAll(/<path class="([^"]*)" d="([^"]+)"/g)) { if (/\bah\b/.test(pm[1])) continue; probe.setAttribute('d', pm[2]); const L = probe.getTotalLength(); for (let l = 8; l < L - 8; l += 8) { const q = probe.getPointAtLength(l); if (hitsBox({ x: q.x - 2, y: q.y - 2, w: 4, h: 4 })) return true; } }
      return false; };
    return textRects(svg); };
  const legs = P.slice(1).map((q, i) => [P[i], q]).map(([p, q]) => ({ p, q, h: Math.abs(p[1] - q[1]) < 1, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }))
    .filter(l => l.len >= (l.h ? 110 : 60)).sort((a, b) => b.len - a.len); // short legs too, as a last resort (tried last)
  const plans = [];
  for (const { p, q, h, len } of legs) {
    if (h) {
      const y = p[1], dir = Math.sign(q[0] - p[0]);
      for (const wm of [22, 34]) for (const lift of wm > 22 ? [0] : [0, 24, 48]) for (const f of [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85]) for (const up of cof ? [false, true] : [false]) { // (wm 34: on one line, to fit a tight gap)
        // (lift: the name a little further above its line, when right against it there's no room)
        const mx = p[0] + (q[0] - p[0]) * f, half = Math.min(len / 2 - 14, 130), a0 = Math.max(Math.min(p[0], q[0]) + 14, mx - half), a1 = Math.min(Math.max(p[0], q[0]) - 14, mx + half), ly = (up ? y - 62 : y - 8) - lift;
        const name = ROUTE_NONAME ? NONAME : enzRect(mx, ly, 'middle', it, wm, 'bottom'), cb = drawn(() => cofArcLine(dir > 0 ? [a0, y] : [a1, y], dir > 0 ? [a1, y] : [a0, y], [0, up ? -1 : 1], parts), name);
        plans.push({ n: count([name, ...cb]) + self([name, ...cb]), curl: CURL, go: () => { if (name !== NONAME) DRAW_LABELS.push(name); const c = cof ? cofArcLine(dir > 0 ? [a0, y] : [a1, y], dir > 0 ? [a1, y] : [a0, y], [0, up ? -1 : 1], parts) : ''; DRAW_LABELS.push(...textRects(c)); return (ROUTE_NONAME ? '' : enzLabel(mx, ly, it, es, 'middle', wm, 'bottom')) + c; } });
      }
    } else {
      const x = p[0], y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]), cw = cof ? Math.max(0, ...parts.map(t => (hidden(t.st) ? 110 : t.text.length * 7))) + 64 : 14;
      const stretches = y1 - y0 > 150 ? [0.5, 0.35, 0.65, 0.22, 0.78].map(f => { const c = y0 + (y1 - y0) * f; return [Math.max(y0, c - 55), Math.min(y1, c + 55)]; }) : [[y0, y1]];
      for (const [a0, a1] of stretches) for (const [dx, an, sx] of [[-14, 'end', 1], [cw, 'start', 1], [-cw, 'end', -1], [14, 'start', -1], [-44, 'end', 1], [cw + 30, 'start', 1], [-cw - 30, 'end', -1], [-74, 'end', 1], [cw + 60, 'start', 1], [-cw - 60, 'end', -1]]) {
        if (dx === 14 && cof) continue; // name right with cofactors left is the mirrored layout above
        const c = (a0 + a1) / 2, name = ROUTE_NONAME ? NONAME : enzRect(x + dx, c, an, it, 18), cb = drawn(() => cofArcParts(x, a0, a1, parts, q[1] < p[1], sx < 0), name);
        plans.push({ n: count([name, ...cb]) + self([name, ...cb]), curl: CURL, go: () => { if (name !== NONAME) DRAW_LABELS.push(name); const cc = cof ? cofArcParts(x, a0, a1, parts, q[1] < p[1], sx < 0) : ''; DRAW_LABELS.push(...textRects(cc)); return (ROUTE_NONAME ? '' : enzLabel(x + dx, c, it, es, an, 18, 'center')) + cc; } });
      }
    }
  }
  if (!plans.length) { ROUTE_LABEL_MISS += 5; return ''; }
  // Best first (in the order tried when tied); a curl through a box costs as much as text on one.
  let best = null;
  for (const pl of plans.map((pl, i) => [pl, i]).sort((a, b) => a[0].n - b[0].n || a[1] - b[1]).map(x => x[0])) {
    if (best && pl.n >= best.n) break;
    const n = pl.n + (pl.curl() ? 10 : 0); if (!best || n < best.n) best = { ...pl, n }; if (!n) break;
  }
  ROUTE_LABEL_MISS += best.n;
  return best.go();
}
let TAB_SPOTS = []; // where a joined drawing's compartment names will go: a step's name avoids them (stitchSVG)
let ROUTE_LABEL_MISS = 0; // what routeStepLabels' names cover where it put them (0: clean), for a joined drawing to try another route
function arrow(x1, y1, x2, y2, rev, cls = 'ln') {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const back = (x, y, d) => [x - Math.cos(ang) * d, y - Math.sin(ang) * d];
  if (!rev) {
    const [ex, ey] = back(x2, y2, 6);
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"/>` + head(x2, y2, ang, 9, headCls(cls));
  }
  const ox = -Math.sin(ang) * 4, oy = Math.cos(ang) * 4;
  const [ex, ey] = back(x2 + ox, y2 + oy, 5);
  const sx = x1 - ox + Math.cos(ang) * 5, sy = y1 - oy + Math.sin(ang) * 5;
  return `<line class="${cls}" x1="${x1 + ox}" y1="${y1 + oy}" x2="${ex}" y2="${ey}"/>` + head(x2 + ox, y2 + oy, ang, 8) +
    `<line class="${cls}" x1="${sx}" y1="${sy}" x2="${x2 - ox}" y2="${y2 - oy}"/>` + head(x1 - ox, y1 - oy, ang + Math.PI, 8);
}
function wrap(s, max) {
  const toks = [];
  for (const w of String(s).split(' ')) { if (w.length <= max) toks.push(w); else toks.push(...w.split(/(?<=-)/)); }
  const lines = []; let cur = '';
  for (const t of toks) {
    const j = cur && !cur.endsWith('-') ? ' ' : '';
    if (cur && (cur + j + t).length > max) { lines.push(cur); cur = t; } else cur += j + t;
  }
  if (cur) lines.push(cur);
  return lines;
}
const svgIcon = (x, y, k) => `<g class="ico ico-${k}" transform="translate(${x - 8},${y - 8})">${ICON[k]}</g>`;
// Point where the ray from a box's center toward (tx, ty) leaves the box (plus padding).
function edgePt(c, tx, ty, w = BW) {
  const dx = tx - c.cx, dy = ty - c.cy, hw = w / 2 + 6, hh = BH / 2 + 6;
  const t = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity);
  return [c.cx + dx * t, c.cy + dy * t];
}

// Where each box went, while a connected drawing is lining its parts up (see stitchSVG).
let DRAW_POS = null;
// "Megakaryocyte–erythroid progenitor" → ["Megakaryocyte–erythroid", "progenitor"]: the space nearest the middle.
function splitTwo(label) {
  const sp = [...label.matchAll(/ /g)].map(m => m.index);
  if (!sp.length) return null;
  const i = sp.reduce((a, b) => (Math.abs(b - label.length / 2) < Math.abs(a - label.length / 2) ? b : a));
  return [label.slice(0, i), label.slice(i + 1)];
}
function metBox(cx, y, item, st, w = BW) {
  if (DRAW_POS && item?.key) DRAW_POS[item.key] = { x: cx - w / 2, y, w, h: BH };
  const cls = st === 'peek' ? 'shown' : st;
  if (st === 'target' && INLINE) return `<g class="mbox target"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${BH}" rx="9"/></g>` + inlineField(cx - w / 2 + 4, y + 4, w - 8, BH - 8);
  if (hidden(st)) return `<g class="mbox ${cls}"${item.key ? ` data-key="${item.key}"` : ''}><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${BH}" rx="9"/>${blankText(cx, y + BH / 2, item.term || 'metabolite')}</g>`;
  const label = item.name;
  // Too long for one line: a slightly smaller font; if that would go below 11.2px, two lines split at the space
  // nearest the middle (when they fit), else as small as 10.5px.
  const small = (w - 14) / label.length / 0.56, two = label.length * 7.6 > w - 14 && small < 11.2 && splitTwo(label), fits2 = two && Math.max(...two.map(l => l.length)) * 6.7 <= w - 14;
  const fs = fits2 ? ' style="font-size:12px"' : label.length * 7.6 > w - 14 ? ` style="font-size:${Math.max(10.5, small).toFixed(1)}px"` : '';
  const txt = fits2 ? `<tspan x="${cx}" dy="-0.6em">${esc(two[0])}</tspan><tspan x="${cx}" dy="1.2em">${esc(two[1])}</tspan>` : esc(label);
  let s = `<g class="mbox ${cls}"${item.key ? ` data-key="${item.key}"` : ''}><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${BH}" rx="9"/><text x="${cx}" y="${y + BH / 2}"${fs}>${txt}</text></g>`;
  if (st === 'right') s += svgIcon(cx - w / 2 - 16, y + BH / 2, 'ok');
  if (st === 'missed') s += svgIcon(cx - w / 2 - 16, y + BH / 2, 'no');
  if (st === 'start') s += `<text class="startt" x="${cx}" y="${y - 6}" text-anchor="middle">START</text>`;
  return s;
}
// anchor: start | middle | end. valign: center (lines centered on y) or bottom (last line sits on y).
// Vitamins and other helpers a step can't run without (r.requires), shown with the enzyme: "needs B6 (pyridoxal phosphate)".
const needsText = r => ((r && r.requires) || []).length ? 'needs ' + r.requires.join(', ') : '';
// A path element the browser can measure (lengths, points along it), kept in a hidden SVG.
let PATH_PROBE = null;
function pathProbe() {
  if (PATH_PROBE?.isConnected) return PATH_PROBE;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  PATH_PROBE = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.append(PATH_PROBE); document.body.append(svg);
  return PATH_PROBE;
}
// Where each step's enzyme name went (or would have gone, when hidden): beside its arrow. Reset with each drawing.
let STEP_AT = {};
function enzLabel(x, y, item, st, anchor, max, valign = 'center', extra = []) {
  if (item?.rxn && !item.via) STEP_AT[item.rxn.id] = [x, y];
  if (st === 'hide') return '';
  const cls = st === 'peek' ? 'shown' : st;
  if (st === 'target' && INLINE) {
    const w = Math.max(190, INLINE.along ? INLINE.along.length * 8 + 28 : 0), rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2, ry = valign === 'bottom' ? y - 32 : y - 16;
    return `<g class="elab target"><rect x="${rx}" y="${ry}" width="${w}" height="32" rx="16"/></g>` + inlineField(rx + 4, ry + 3, w - 8, 26);
  }
  if (hidden(st)) {
    const word = blankWord(item), w = pillW(word), rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
    const ry = valign === 'bottom' ? y - 26 : y - 13;
    return `<g class="elab ${cls}" data-key="${item.key}"><rect x="${rx}" y="${ry}" width="${w}" height="26" rx="13"/>${blankText(rx + w / 2, ry + 13, word)}</g>`;
  }
  const lines = wrap(item.name, max);
  const tags = item.kind === 'rl' ? [] : item.via ? viaTags(item.rxn) : shownTags(item.rxn);
  // Fed vs fasting, when shown: "▲ ON" (filled, up) or "▽ OFF" (hollow, down) under the name, or a blank to fill.
  const regs = regLines(item), drugs = drugLines(item);
  const all = [...lines.map(l => ['', l]), ...tags.map(t => ['tag', t]), ...extra.map(t => ['cofl', t]), ...regs.map(([it, st]) => (hidden(st) ? ['regblank', it, st] : ['reg', `${it.state === 'fed' ? 'FED' : 'FASTING'}: ${it.name === 'On' ? '▲ ON' : '▽ OFF'}`])),
    ...drugs.map(([it, st]) => (hidden(st) ? ['regblank', it, st] : ['drug', `${it.drug.effect === 'activates' ? '⊕' : '⊣'} ${it.name}${it.drug.kind === 'toxin' ? ' (toxin)' : ''}`]))];
  // A carrier's pill sits centered on a crossing (its arrow one way, the membrane the other): its drugs and fed/fasting
  // lines go under the pill, right-aligned just left of center, clear of both lines.
  const besidePill = item.kind === 'trn' && anchor === 'middle' && all.length > lines.length + tags.length;
  const side = besidePill ? all.slice(lines.length + tags.length) : [];
  if (besidePill) all.length = lines.length + tags.length;
  const lh = 15, y0 = valign === 'bottom' ? y - (all.length - 1) * lh - 6 : y - (all.length - 1) * lh / 2;
  let s = `<g class="elab ${cls}${item.kind === 'trn' ? ' trn' : ''}" data-key="${item.key}">`;
  // A transporter's name sits in a pill, so it never reads as an enzyme.
  if (item.kind === 'trn') {
    const own = all.slice(0, lines.length + tags.length); // its name and tags, not the drugs listed under it
    const pw = Math.max(...own.map(([, l]) => l.length)) * 6.9 + 18, px = anchor === 'end' ? x - pw + 8 : anchor === 'start' ? x - 8 : x - pw / 2;
    s += `<rect class="trnpill" x="${px}" y="${y0 - 11}" width="${pw}" height="${(own.length - 1) * lh + 22}" rx="11"/>`;
    if (side.length) { const sx = x - 8, sy = y0 + (own.length - 1) * lh + 11 + 12; side.forEach(([c, l, st], i) => { if (c !== 'regblank') s += `<text class="${c}" x="${sx}" y="${sy + i * lh}" text-anchor="end" dominant-baseline="central">${esc(l)}</text>`; else all.push([c, l, st, sx - pillW(l.kind === 'drug' ? l.term + '?' : 'fasting: on/off?'), sy + i * lh]); }); }
  }
  let pill = '';
  all.forEach(([c, l, st, ax, ay], i) => {
    const ly = ay ?? y0 + i * lh + (c === 'regblank' ? 4 : 0); // a pill needs a little more room than a line of text
    if (c !== 'regblank') { s += `<text class="${c}" x="${x}" y="${ly}" text-anchor="${anchor}" dominant-baseline="central">${esc(l)}</text>`; return; }
    const word = l.kind === 'drug' ? l.term + '?' : l.state === 'fed' ? 'fed: on/off?' : 'fasting: on/off?', live = st === 'target' && INLINE, w = live ? 170 : pillW(word), rx = ax !== undefined ? ax : anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
    pill += live ? `<g class="elab target"><rect x="${rx}" y="${ly - 12}" width="${w}" height="24" rx="12"/></g>` + inlineField(rx + 4, ly - 10, w - 8, 20)
      : `<g class="elab regq ${st}" data-key="${l.key}"><rect x="${rx}" y="${ly - 11}" width="${w}" height="22" rx="11"/>${blankText(rx + w / 2, ly, word)}</g>`;
  });
  s += '</g>' + pill;
  const ix = anchor === 'end' ? x + 14 : anchor === 'start' ? x - 14 : x;
  const iy = anchor === 'middle' ? y0 - 18 : y0;
  if (st === 'right') s += svgIcon(ix, iy, 'ok');
  if (st === 'missed') s += svgIcon(ix, iy, 'no');
  if (st === 'start') s += `<text class="startt" x="${x}" y="${y0 - 16}" text-anchor="${anchor}">START</text>`;
  return s;
}
// The curved side arrow with each side shown, blank or being typed: inputs at the top, outputs at the bottom,
// a side's mark just after its text (never on the curve). parts: from cofParts (or the step quiz's questions).
// left: the mirror image, the curve and its labels on the step's left (when the right is crowded).
function cofArcParts(x, y1, y2, parts, up = false, left = false) {
  parts = parts.filter(p => p.st !== 'hide' && p.st !== 'none');
  const sx = left ? -1 : 1, X = dx => x + sx * dx;
  if (parts.length === 1 && !parts[0].side) return cofRow(X(22), (y1 + y2) / 2, left ? 'end' : 'start', parts); // arrow not chosen yet: no arc
  const pin = parts.find(p => p.side === 'in'), pout = parts.find(p => p.side === 'out');
  if (!pin && !pout) return '';
  const d = up ? -1 : 1, yF = up ? y2 : y1, yT = up ? y1 : y2, mid = (y1 + y2) / 2;
  // A blank (a pill) needs more room than a line of text: keep it inside the gap between the two boxes.
  const off = p => (p && hidden(p.st) ? 15 : 12);
  const a = [X(44), yF + off(pin) * d], b = [X(44), yT - off(pout) * d];
  // A label that would land on another (a side step's, beside a short arrow) slides along the step, its curl end with it.
  const lw = p => (hidden(p.st) ? 160 : p.text.length * 7 + 24), rect = (p, y) => ({ x: left ? X(50) - lw(p) : X(50), y: y - 14, w: lw(p), h: 28 }), free = (p, y) => !hitsBox(rect(p, y));
  if (pin && !free(pin, a[1])) for (let k = 1; k < 8; k++) { const y = a[1] + d * k * 8; if (Math.abs(y - b[1]) < 26) break; if (free(pin, y)) { a[1] = y; break; } }
  if (pout && !free(pout, b[1])) for (let k = 1; k < 8; k++) { const y = b[1] - d * k * 8; if (Math.abs(y - a[1]) < 26) break; if (free(pout, y)) { b[1] = y; break; } }
  const start = pin ? a : [X(3), mid], end = pout ? b : [X(3), mid];
  // (Both sides: the control point across the line, so the bow's middle touches the arrow it belongs to.)
  const ctrl = pin && pout ? [X(-38), mid] : pin ? [X(12), yF + 20 * d] : [X(12), yT - 20 * d];
  const ang = Math.atan2(end[1] - ctrl[1], end[0] - ctrl[0]);
  let s = `<path class="cof" d="M${start[0]},${start[1]}Q${ctrl[0]},${ctrl[1]} ${end[0] - Math.cos(ang) * 4},${end[1] - Math.sin(ang) * 4}"/>` + head(end[0], end[1], ang, 7, 'cofh');
  const two = !!(pin && pout), cw = 7;
  for (const [p, y] of [[pin, a[1]], [pout, b[1]]]) {
    if (!p) continue;
    const live = isLive(p), w = (live ? Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64) : hidden(p.st) ? pillW(cofWord(p, two)) : p.text.length * cw) + (live || hidden(p.st) ? cofPreW(p) : 0);
    const x0 = left ? X(50) - w : X(50); // where the label starts (its left edge)
    DRAW_LABELS.push({ x: left ? X(50) - w - 24 : x0, y: y - 14, w: w + 24, h: 28 });
    if (live || hidden(p.st)) s += cofSlot(p, x0, y, w, two);
    else s += cofSpot(p, x0, y, w) + `<text class="coft" x="${x0}" y="${y + 4}">${esc(p.text)}</text>` + cofMark(left ? x0 - 14 : x0 + w + 14, y, p.st);
  }
  return s;
}
// The same curved side arrow beside any straight step (sideways, slanted across a membrane): it sits on side n of the
// line p1→p2, inputs where it starts, outputs where it ends, and its middle bows in toward the step's arrow.
// The metabolite boxes of the diagram being drawn (top-left x, y, w, h): side labels steer around them.
// DRAW_LABELS: enzyme and cofactor labels already placed, so later labels and link tags keep clear of them too.
let DRAW_BOXES = [], DRAW_LABELS = [];
let DRAW_PAIR_LINES = false; // the dotted tie between a coupled step's two arrows (the Map's view setting); badges always
const overlaps = (r, b) => r.x < b.x + b.w + 4 && r.x + r.w > b.x - 4 && r.y < b.y + b.h + 2 && r.y + r.h > b.y - 2;
const hitsBox = r => DRAW_BOXES.some(b => overlaps(r, b)) || DRAW_LABELS.some(b => overlaps(r, b));
// An enzyme's whole label: its name, tags (RATE-LIMITING) and what it needs, as enzLabel stacks them.
const enzRect = (x, y, anchor, item, max = 18, valign = 'center') => {
  const r = item?.rxn, lines = [...wrap(item?.name || '', max), ...(r ? (item.via ? viaTags(r) : shownTags(r)) : []), ...regLines(item).map(() => 'FASTING: ▽ OFF'), ...drugLines(item).map(([it]) => '⊣ ' + it.name + (it.drug?.kind === 'toxin' ? ' (toxin)' : ''))];
  const pill = item?.kind === 'trn', w = pill ? Math.max(1, ...lines.map(l => l.length)) * 6.9 + 18 : Math.min(Math.max(1, ...lines.map(l => l.length)), max + 2) * 6.6, h = Math.max(1, lines.length) * 15 + (pill ? 8 : 0); // a transporter's pill
  // A centered carrier pill with drugs or fed/fasting lines under it, left of center (enzLabel).
  const own = r ? wrap(item?.name || '', max).length + (item.via ? viaTags(r) : shownTags(r)).length : 1, extra = lines.slice(own);
  if (pill && anchor === 'middle' && extra.length) { const pw = Math.max(1, ...lines.slice(0, own).map(l => l.length)) * 6.9 + 18, ew = Math.max(...extra.map(l => l.length)) * 6.6, ph = own * 15 + 8, eh = extra.length * 15;
    const top = valign === 'bottom' ? y - ph : y - ph / 2, x0 = Math.min(x - pw / 2, x - 8 - ew);
    return { x: x0, y: top, w: x + pw / 2 - x0, h: ph + 6 + eh, rid: r?.id }; }
  return { x: anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x, y: valign === 'bottom' ? y - h : y - h / 2, w, h, rid: r?.id };
};
const labelRect = (x, y, anchor, text, max = 18, valign = 'center') => {
  const lines = Math.max(1, Math.ceil(text.length / max)), w = Math.min(text.length, max) * 6.6, h = lines * 15;
  return { x: anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x, y: valign === 'bottom' ? y - h : y - h / 2, w, h };
};
function cofArcLine(p1, p2, n, parts, flip = false) {
  parts = parts.filter(p => p.st !== 'hide' && p.st !== 'none');
  if (parts.length === 1 && !parts[0].side) return cofRow((p1[0] + p2[0]) / 2 + n[0] * 30, (p1[1] + p2[1]) / 2 + n[1] * 30, Math.abs(n[0]) > 0.5 ? (n[0] > 0 ? 'start' : 'end') : 'middle', parts);
  const pin = parts.find(p => p.side === 'in'), pout = parts.find(p => p.side === 'out');
  if (!pin && !pout) return '';
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1, u = [dx / L, dy / L];
  if (flip) {
    // A slanted step: put the curve on whichever side of the arrow is less crowded (boxes, labels already drawn).
    const crowd = nn => { const pts = [0.3, 0.5, 0.7].map(t => [p1[0] + dx * t + nn[0] * 44, p1[1] + dy * t + nn[1] * 44]);
      return pts.filter(([x, y]) => hitsBox({ x: x - 50, y: y - 14, w: 100, h: 28 })).length; };
    if (crowd(n) > crowd([-n[0], -n[1]])) n = [-n[0], -n[1]];
  }
  const at = (t, off) => [p1[0] + u[0] * L * t + n[0] * off, p1[1] + u[1] * L * t + n[1] * off];
  // A compact curve around the middle of the step (long slanted steps would otherwise stretch it box to box).
  const h = Math.min(0.3, 55 / L), tS = 0.5 - h, tE = 0.5 + h;
  // Both sides: a bow from one end to the other. One side: a hook that leaves (or joins) the arrow and turns out to its label.
  const S = pin ? at(tS, 30) : at(0.5 - h / 2, 4), E = pout ? at(tE, 30) : at(0.5 + h / 2, 4);
  const C = pin && pout ? at(0.5, -26) : pin ? at(tS + h * 0.5, 6) : at(tE - h * 0.5, 6); // (the bow's middle touches the arrow)
  const ang = Math.atan2(E[1] - C[1], E[0] - C[0]);
  let s = `<path class="cof" d="M${S[0]},${S[1]}Q${C[0]},${C[1]} ${E[0] - Math.cos(ang) * 4},${E[1] - Math.sin(ang) * 4}"/>` + head(E[0], E[1], ang, 7, 'cofh');
  const two = !!(pin && pout), cw = 7;
  // Labels sit just beyond each end, spreading outward along the line (inputs before, outputs after).
  const side = Math.abs(n[0]) > 0.5 ? (n[0] > 0 ? 'start' : 'end') : null;
  for (const [p, P, first] of [[pin, S, true], [pout, E, false]]) {
    if (!p) continue;
    // Two sides spread apart along the line; a lone side leans away from the line, clear of the boxes at its ends.
    // Level steps (grids, side steps) center each label under its end, clear of the columns' labels on either side.
    const level = Math.abs(u[1]) < 0.1 && two;
    let anchor = side || (level ? 'middle' : two ? ((u[0] >= 0) === first ? 'end' : 'start') : n[0] >= 0 ? 'start' : 'end');
    let lx = P[0] + n[0] * 10, ly = P[1] + n[1] * (level ? 20 : 16);
    const live = isLive(p), w = (live ? Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64) : hidden(p.st) ? pillW(cofWord(p, two)) : p.text.length * cw) + (live || hidden(p.st) ? cofPreW(p) : 0);
    const xAt = a => (a === 'end' ? lx - w : a === 'middle' ? lx - w / 2 : lx);
    // A label that would run under a box goes the other way instead (Dehydroascorbate beside norepinephrine).
    if (hitsBox({ x: xAt(anchor), y: ly - 13, w, h: 26 })) anchor = ['start', 'end', 'middle'].filter(a => a !== anchor).find(a => !hitsBox({ x: xAt(a), y: ly - 13, w, h: 26 })) || anchor;
    let x0 = xAt(anchor);
    for (let k = 1; k < 5 && hitsBox({ x: x0, y: ly - 13, w, h: 26 }); k++) { lx += n[0] * 16; ly += n[1] * 16; x0 = xAt(anchor); }
    DRAW_LABELS.push({ x: x0, y: ly - 13, w, h: 26 });
    if (live || hidden(p.st)) s += cofSlot(p, x0, ly, w, two);
    else s += cofSpot(p, x0, ly, w) + `<text class="coft" x="${x0}" y="${ly + 4}">${esc(p.text)}</text>` + cofMark(anchor === 'end' ? x0 - 12 : x0 + w + 12, ly, p.st);
  }
  return s;
}
/* A cycle's cofactors: a tight curl at the middle M of the step's arrow, on the ring's inside (n), with the inputs
   before it and the outputs after it in the direction of travel (u), both held clear of the boxes at the arrow's ends. */
let CURL_AVOID = []; // points along the ring's arrows, which a cycle's cofactor labels keep clear of too
const blocked = r => hitsBox(r) || CURL_AVOID.some(([x, y]) => x > r.x - 3 && x < r.x + r.w + 3 && y > r.y - 3 && y < r.y + r.h + 3);
function cofCurl(M, u, n, parts, cx0 = M[0]) { // cx0: the ring's middle
  parts = parts.filter(p => p.st !== 'hide' && p.st !== 'none');
  const pin = parts.find(p => p.side === 'in'), pout = parts.find(p => p.side === 'out'), two = !!(pin && pout);
  if (!pin && !pout) return parts.length ? cofRow(M[0] + n[0] * 40, M[1] + n[1] * 40, Math.abs(n[0]) > 0.5 ? (n[0] > 0 ? 'start' : 'end') : 'middle', parts) : '';
  const at = (a, b) => [M[0] + n[0] * a + u[0] * b, M[1] + n[1] * a + u[1] * b];
  const side = Math.abs(n[0]) > 0.3; // the ring's sides and diagonals: labels beside the curl, inputs above outputs
  const wOf = p => (!p ? 0 : isLive(p) ? Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64) + cofPreW(p) : hidden(p.st) ? pillW(cofWord(p, two)) + cofPreW(p) : p.text.length * 7);
  // Top or bottom of the ring, where the arrows are short: both labels at one depth inward (inputs before, outputs after,
  // in the direction of travel), as deep as it takes to clear the boxes.
  const fw = u[0] >= 0 ? 1 : -1, rectAt = (q, w, a) => ({ x: a === 'end' ? q[0] - w : q[0], y: q[1] - 11, w, h: 22 });
  let k = 34;
  if (!side) for (; k < 160; k += 8) {
    const iq = at(k, -6), oq = at(k, 6);
    if ((!pin || !blocked(rectAt(iq, wOf(pin), fw > 0 ? 'end' : 'start'))) && (!pout || !blocked(rectAt(oq, wOf(pout), fw > 0 ? 'start' : 'end')))) break;
  }
  // Beside the curl: as far in as it takes to clear the boxes, the arrows and the labels already drawn (a carrier pill).
  let ds = 30;
  if (side) for (; ds < 110; ds += 8) {
    const a = n[0] > 0 ? 'start' : 'end', ok = [[pin, -16], [pout, 16]].every(([p, o]) => !p || !blocked(rectAt(at(ds + 8, o), wOf(p), a)));
    if (ok) break;
  }
  let inAt = side ? null : at(k, -6), outAt = side ? null : at(k, 6);
  let S = pin ? (side ? at(ds, -16) : at(k - 14, -12)) : at(3, -10), E = pout ? (side ? at(ds, 16) : at(k - 14, 12)) : at(3, 10);
  let C = pin && pout ? at(4, 0) : pin ? at(10, -4) : at(10, 4), stack = 0;
  // Side by side would still run into a box or a label (a long input beside a short arrow): stack them instead, inputs
  // first, both running toward the ring's middle, the curl hooking round from the arrow to their near ends.
  if (!side && pin && pout && (k > 46 || blocked(rectAt(inAt, wOf(pin), fw > 0 ? 'end' : 'start')) || blocked(rectAt(outAt, wOf(pout), fw > 0 ? 'start' : 'end')))) {
    stack = cx0 - M[0] >= 0 ? 1 : -1;
    let dk = 34;
    for (; dk < 140; dk += 8) if (!blocked(rectAt(at(dk, 0), wOf(pin), stack > 0 ? 'start' : 'end')) && !blocked(rectAt(at(dk + 22, 0), wOf(pout), stack > 0 ? 'start' : 'end'))) break;
    inAt = at(dk, 0); outAt = at(dk + 22, 0);
    S = [inAt[0] - stack * 8, inAt[1]]; E = [outAt[0] - stack * 8, outAt[1]]; C = [M[0] - stack * 30 + n[0] * 30, M[1] + n[1] * 30];
  }
  const ang = Math.atan2(E[1] - C[1], E[0] - C[0]);
  let s = `<path class="cof" d="M${S[0]},${S[1]}Q${C[0]},${C[1]} ${E[0] - Math.cos(ang) * 4},${E[1] - Math.sin(ang) * 4}"/>` + head(E[0], E[1], ang, 7, 'cofh');
  // Beside the curl, inputs and outputs stay at least a line apart (a diagonal step would put them nearly level).
  const besideAt = (P, first) => { const q = [P[0] + n[0] * 8, P[1] + n[1] * 8];
    if (pin && pout) { const a = [S[0] + n[0] * 8, S[1] + n[1] * 8], b = [E[0] + n[0] * 8, E[1] + n[1] * 8], mid = (a[1] + b[1]) / 2, sg = b[1] >= a[1] ? 1 : -1;
      if (Math.abs(b[1] - a[1]) < 22) q[1] = mid + (first ? -11 : 11) * sg; }
    return q; };
  for (const [p, P, first] of [[pin, S, true], [pout, E, false]]) {
    if (!p) continue;
    const live = isLive(p), w = wOf(p);
    // Beside the curl's end, away from the arrow; on the top and bottom, centered in their stack.
    const Q = side && !stack ? besideAt(P, first) : first ? inAt : outAt, lx = Q[0], ly = Q[1];
    const anchor = stack ? (stack > 0 ? 'start' : 'end') : side ? (n[0] > 0 ? 'start' : 'end') : (first === (fw > 0) ? 'end' : 'start');
    const x0 = anchor === 'end' ? lx - w : anchor === 'middle' ? lx - w / 2 : lx;
    DRAW_LABELS.push({ x: x0, y: ly - 13, w, h: 26 });
    if (live || hidden(p.st)) s += cofSlot(p, x0, ly, w, two);
    else s += cofSpot(p, x0, ly, w) + `<text class="coft" x="${x0}" y="${ly + 4}">${esc(p.text)}</text>` + cofMark(anchor === 'end' ? x0 - 12 : x0 + w + 12, ly, p.st);
  }
  return s;
}
// A step's cofactors are items too, one per side ('c:' in, 'o:' out): shown, hidden altogether ('hide'), or blanks.
// parts: [{key, side, st, text}]; cofSt sums them up (any blank → blank, the current one → target).
// cofShapeHidden(r): the quiz hasn't revealed which arrow this step has (in and out, in only, out only), so while any
// of its cofactors is still a blank they show as one plain "cofactors" pill. The quiz sets it; elsewhere it's never hidden.
let cofShapeHidden = () => false;
const cofParts = (m, statusOf, r) => {
  let ps = cofItemsOf(m, r).map(it => ({ key: it.key, side: it.side, st: statusOf(it.key), text: cofSideText(m, it.cofs) }));
  // What the step needs (B6, biotin…) goes in with the inputs: one label ("Succinyl-CoA + B6"), or one blank while either is.
  // Shown short ("B6", not "B6 (pyridoxal phosphate)"), and only what the inputs don't already name (BH₄, ascorbate).
  const nd = m.items['n:' + r.id], cin = r.cofactors?.in || [], ntext = (r.requires || []).filter((t, i) => !cin.includes(nd?.cofs.in[i])).map(t => t.replace(/\s*\([^)]*\)\s*$/, '')).join(', ');
  const np = nd && { key: nd.key, side: 'in', st: statusOf(nd.key), text: ntext };
  if (np && !ntext && !hidden(np.st)) np.st = 'hide';
  if (np && np.st !== 'hide') {
    const i = ps.findIndex(p => p.side === 'in');
    if (i < 0 || ps[i].st === 'hide') ps = [np, ...ps.filter(p => p.side !== 'in')];
    else if (!hidden(ps[i].st) && hidden(np.st)) ps[i] = { ...np, pre: ps[i].text + ' +' }; // the inputs are in: they stay, the needs blank follows them
    else { const pin = ps[i], both = [pin, np]; ps[i] = { key: pin.key, keys: [pin.key, np.key], side: 'in', st: cofCombined(both), text: both.some(p => hidden(p.st)) ? '' : pin.text + ' + ' + np.text }; }
  }
  return ps.length && cofShapeHidden(r) && ps.some(p => hidden(p.st)) ? [{ key: ps[0].key, side: null, st: cofCombined(ps), text: '' }] : ps;
};
function cofCombined(parts) {
  const sts = parts.map(p => p.st);
  if (!sts.length) return 'none';
  if (sts.includes('target')) return 'target';
  if (sts.some(hidden)) return 'blank';
  if (sts.every(x => x === 'hide')) return 'hide';
  return sts.includes('missed') ? 'missed' : sts.includes('right') ? 'right' : sts[0];
}
const cofSt = (m, statusOf, r) => cofCombined(cofParts(m, statusOf, r));
const cofLine = (m, statusOf, r) => { const ps = cofParts(m, statusOf, r).filter(p => cofVisible(p.st)), i = ps.find(p => p.side === 'in')?.text, o = ps.find(p => p.side === 'out')?.text;
  return i && o ? i + ' → ' + o : i ? i + ' →' : o ? '→ ' + o : ''; };
const cofVisible = st => !hidden(st) && st !== 'none' && st !== 'hide';
// With a blank on either side, the cofactors are laid out in a row: "cofactors in → out", "ATP → out", "cofactors in → ADP".
const cofWord = (p, two) => p.word || (!two ? 'cofactors' : p.side === 'in' ? 'cofactors in' : 'out');
// A cofactor blank or answer field. p.pre: what's already answered on that side, written in front ("Succinyl-CoA +").
const cofPreW = p => (p.pre ? p.pre.length * 7 + 6 : 0);
function cofSlot(p, x0, y, w, two, lh = 28, ins = 2) {
  const pw = cofPreW(p), pre = pw ? `<text class="coft" x="${x0}" y="${y + 4}">${esc(p.pre)}</text>` : '', x = x0 + pw, ww = w - pw;
  if (isLive(p)) return pre + `<g class="elab target"><rect x="${x}" y="${y - lh / 2}" width="${ww}" height="${lh}" rx="${lh / 2}"/></g>` + inlineField(x + 4, y - lh / 2 + ins, ww - 8, lh - 2 * ins);
  return pre + `<g class="elab cofb ${p.st}"><rect x="${x}" y="${y - 13}" width="${ww}" height="26" rx="13"/>${blankText(x + ww / 2, y, cofWord(p, two))}</g>`;
}
const isLive = p => p.st === 'target' && INLINE && (!INLINE.q?.statKey || INLINE.q.statKey === p.key || !!p.keys?.includes(INLINE.q.statKey));
function cofRow(x, y, anchor, parts) {
  parts = parts.filter(p => p.st !== 'hide' && p.st !== 'none');
  const two = parts.length > 1, gap = 6, aw = 14, cw = 7;
  const ps = parts.map(p => ({ ...p, live: isLive(p),
    w: isLive(p) ? Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64) + cofPreW(p) : hidden(p.st) ? pillW(cofWord(p, two)) + (p.st === 'target' ? 16 : 0) + cofPreW(p) : p.text.length * cw + (['right', 'missed'].includes(p.st) ? 20 : 0) }));
  const total = ps.reduce((a, p) => a + p.w, 0) + (ps.length - 1) * (aw + 2 * gap);
  let cx = anchor === 'end' ? x - total : anchor === 'middle' ? x - total / 2 : x, s = '';
  ps.forEach((p, i) => {
    if (i) { s += `<text class="coft" x="${cx + gap + aw / 2}" y="${y + 4}" text-anchor="middle">→</text>`; cx += aw + 2 * gap; }
    if (p.live || hidden(p.st)) s += cofSlot(p, cx, y, p.w, two, 32, 3);
    else s += cofSpot(p, cx, y, p.text.length * cw) + `<text class="coft" x="${cx}" y="${y + 4}">${esc(p.text)}</text>` + cofMark(cx + p.text.length * cw + 10, y, p.st);
    cx += p.w;
  });
  return s;
}
// Where each shown cofactor label went (its text and box), so a link to another pathway can start at it (fumarate leaving
// argininosuccinate lyase, on to the TCA cycle). Reset with each drawing.
let COF_SPOTS = [];
const cofSpot = (p, x, y, w) => { COF_SPOTS.push({ text: p.text, side: p.side === 'out' ? 'out' : 'in', names: p.text.split(/\s*\+\s*|,\s*/).map(t => t.trim().toLowerCase()).filter(Boolean), x: x - 2, y: y - 10, w: w + 4, h: 20 }); return ''; };
const cofMark = (x, y, st) => (st === 'right' ? svgIcon(x, y, 'ok') : st === 'missed' ? svgIcon(x, y, 'no') : '');

/* Connections to other pathways (p.links): a dotted line from a box to a small tag naming where it leads ("→ TCA cycle")
   or comes from ("from Glycolysis"). On a pathway page the tag opens that pathway (LINK_NAV); in a quiz it's only a
   label, and it waits until its box is answered so it never hints at a blank.
   boxes: metabolite id → { x, y, w, h } (top-left); prefer(id): 'right' (default), 'left', 'up' or 'down'. */
let LINK_NAV = false;
const tagLabel = l => (l.dir === 'in' ? 'from ' : '→ ') + (Library.get(l.to)?.name || l.to) + (l.via ? ` (${l.via})` : '');
const tagLabelW = l => tagLabel(l).length * 6.3 + 24;
function linkTags(m, statusOf, boxes, prefer = () => 'right', obstacles = []) {
  const out = { s: '', maxX: 0 }, byAt = {}, all = [...Object.values(boxes), ...obstacles, ...DRAW_LABELS], taken = []; // obstacles: compartment regions
  for (const l of m.p.links || []) (byAt[l.at] = byAt[l.at] || []).push(l);
  const hits = r => [...all, ...taken].some(b => r.x < b.x + b.w + 6 && r.x + r.w > b.x - 6 && r.y < b.y + b.h + 4 && r.y + r.h > b.y - 4);
  for (const [at, ls] of Object.entries(byAt)) {
    const b = boxes[at];
    if (!b || hidden(statusOf('m:' + at)) || statusOf('m:' + at) === 'hide') continue;
    ls.forEach((l, i) => {
      const to = Library.get(l.to);
      if (!to) return;
      const label = tagLabel(l), w = tagLabelW(l), h = 22;
      const pref = prefer(at), bx = b.x + b.w / 2, yb = b.y + b.h / 2;
      let r, line;
      if (pref === 'up' || pref === 'down') {
        // Above or below the box (cycles: the top and bottom boxes have enzyme labels on both sides). Several tags sit
        // side by side, each with its own line, so no line ever runs through another tag.
        const ws = ls.map(x => tagLabelW(x)), gap = 10, total = ws.reduce((a, c) => a + c, 0) + gap * (ls.length - 1);
        const x0 = bx - total / 2 + ws.slice(0, i).reduce((a, c) => a + c + gap, 0), d = pref === 'up' ? -1 : 1;
        const y = d < 0 ? b.y - 30 - h : b.y + b.h + 30, lx = Math.min(b.x + b.w - 14, Math.max(b.x + 14, x0 + w / 2));
        r = { x: x0, y, w, h };
        line = `M${lx},${d < 0 ? b.y - 2 : b.y + b.h + 2}C${lx},${(d < 0 ? b.y : b.y + b.h) + d * 16} ${x0 + w / 2},${(d < 0 ? y + h : y) - d * 14} ${x0 + w / 2},${d < 0 ? y + h : y}`;
      } else {
        const cy = yb + (i - (ls.length - 1) / 2) * (h + 6);
        const R = { x: b.x + b.w + 36, y: cy - h / 2, w, h }, L = { x: b.x - 36 - w, y: cy - h / 2, w, h };
        const step = (c, k) => ({ ...c, y: c.y + k * (h + 6) }); // both sides taken (a region, another tag): step down or up beside the box
        // Still nothing free (a box close beside it, labels on the other side): straight above or below the box.
        const U = { x: bx - w / 2, y: b.y - 30 - h, w, h, d: -1 }, D = { x: bx - w / 2, y: b.y + b.h + 30, w, h, d: 1 };
        const [A, B] = pref === 'left' ? [L, R] : [R, L];
        r = [A, B, step(A, 1), step(A, -1), step(A, 2), step(A, -2), step(B, 1), step(B, -1), D, U, step(A, 3)].find(c => c.x >= 0 && !hits(c)) || (R.x >= 0 ? R : L);
        if (r.d) {
          const ex = r.d < 0 ? b.y - 2 : b.y + b.h + 2, ey = r.d < 0 ? r.y + h : r.y;
          line = `M${bx},${ex} L${bx},${ey}`;
        } else {
          const right = r.x > b.x, x1 = right ? b.x + b.w + 2 : b.x - 2, x2 = right ? r.x : r.x + r.w, mx = (x1 + x2) / 2, ty = r.y + h / 2;
          line = `M${x1},${yb} C${mx},${yb} ${mx},${ty} ${x2},${ty}`;
        }
      }
      taken.push(r);
      const g = `<path class="xline" d="${line}"/><rect class="xtag" x="${r.x}" y="${r.y}" width="${w}" height="${h}" rx="11"/><text class="xtagt" x="${r.x + w / 2}" y="${r.y + h / 2}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`;
      out.s += LINK_NAV ? `<a class="xlink nav" href="#/pathways/${esc(l.to)}" aria-label="${esc(label)}">${g}</a>` : `<g class="xlink">${g}</g>`;
      out.maxX = Math.max(out.maxX, r.x + r.w);
    });
  }
  return out;
}
// The status function of the drawing in progress, for a blank that lives inside another label (what a step needs).
let DRAW_STATUS = null, DRAW_MODEL = null;
const HOVER_MODELS = new Map(); // pathway id → its model, for hover help on its drawing (data-pid on the drawing)
// Every drawing names its pathway (data-pid), so hovering it can look its boxes and lines up (HOVER_MODELS).
function flowSVG(m, statusOf, opts = {}) {
  // (Each step's line also gets a wide invisible twin underneath, so it's easy to point at.)
  const svg = flowSVG0(m, statusOf, opts).replace('<svg ', `<svg data-pid="${esc(m.p.id)}" `);
  return svg.replace(/<path class="([^"]*\brx-[^"\s]+[^"]*)" d="([^"]+)"\/>/g, (t, c, d) => (c.startsWith('hit') ? t : `<path class="hit ${(c.match(/\brx-\S+/) || [''])[0]}" d="${d}"/>` + t))
    .replace(/<line class="([^"]*\brx-[^"\s]+[^"]*)"( x1="[^"]+" y1="[^"]+" x2="[^"]+" y2="[^"]+")\/>/g, (t, c, xy) => (c.startsWith('hit') ? t : `<line class="hit ${(c.match(/\brx-\S+/) || [''])[0]}"${xy}/>` + t));
}
function flowSVG0(m, statusOf, opts = {}) {
  // The second arrow of a coupled step names its enzyme too, once the first one's is showing (it's asked there, once).
  if (m.p.reactions.some(r => r.coupled)) { const own = statusOf, twin = new Map(m.p.reactions.filter(r => r.coupled).map(r => ['e:' + r.id, 'e:' + r.coupled]));
    statusOf = k => { if (!twin.has(k)) return own(k); const s = own(twin.get(k)); return s === 'shown' || s === 'peek' || s === 'dim' || s === 'focus' ? s : 'hide'; }; }
  HOVER_MODELS.set(m.p.id, m); // (hovering a drawing's boxes and lines looks their names up here)
  DRAW_STATUS = statusOf; DRAW_MODEL = m; COF_SPOTS = []; STEP_AT = {}; CONN_STEPS = new Map(); GRID_MEMBRANES = []; GRID_MEMBRANES_Y = []; VIA_X = []; VIA_Y = []; TAB_ENTERS = new Set(); TAB_ENTER_TO = new Set();
  if (m.p.stitch) return rlStrip(m.p.stitch.tiles.length > 1 && m.p.stitch.tiles.every(T => T.p.nephron) ? nephronSVG(m, statusOf) : stitchSVG(m, statusOf, opts), m, statusOf);
  ZONE_INLINE_DONE = false;
  const grps = Object.values(m.items).filter(it => it.kind === 'grp'), outer = DRAW_POS;
  if (grps.length && !outer) DRAW_POS = {};
  const svg = m.p.layout === 'grid' ? gridSVG(m, statusOf, opts) : m.p.circular ? cycleSVG(m, statusOf, opts) : linearSVG(m, statusOf, opts);
  if (!grps.length) return rlStrip(svg, m, statusOf);
  const pos = DRAW_POS; if (!outer) DRAW_POS = null;
  return rlStrip(withGroups(svg, m, statusOf, grps, pos), m, statusOf);
}
/* Rate-limiting, while it's being quizzed: the steps lose their RATE-LIMITING tag and a strip above the drawing asks
   for the enzyme ('k:<step>', one blank per rate-limiting step). Shown or hidden, there's no strip. */
function rlStrip(svg, m, statusOf) {
  const ks = Object.values(m.items).filter(it => it.kind === 'rl').map(it => [it, statusOf(it.key) || 'shown']);
  if (!ks.length || ks.every(([, st]) => st === 'shown' || st === 'hide')) return svg;
  const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
  if (!vb) return svg;
  // The drawing moves down to make room (the canvas reads diagram units from the top-left, so no negative viewBox),
  // and so does any answer slot in it.
  const [x0, y0, w, h] = vb.slice(1).map(Number), D = 52, y = y0 + 26;
  let g = `<text class="zonet" x="${x0 + 16}" y="${y + 4}">RATE-LIMITING</text>`, x = x0 + 136;
  for (const [it, st] of ks) {
    const live = st === 'target' && INLINE, wd = live ? 210 : hidden(st) ? pillW(it.term) : it.name.length * 7.4 + 34;
    g += enzLabel(x, y, it, st, 'start', 60, 'center'); x += wd + 18;
  }
  const open = svg.match(/<svg[^>]*>/)[0], inner = svg.slice(open.length, svg.lastIndexOf('</svg>')), slots = [];
  const body = inner.replace(/<rect class="inl-slot" x="([-\d.]+)" y="([-\d.]+)"([^>]*)\/>/g, (_, sx, sy, rest) => { slots.push(`<rect class="inl-slot" x="${sx}" y="${+sy + D}"${rest}/>`); return ''; });
  return open.replace(vb[0], `viewBox="${x0} ${y0} ${Math.max(w, x - x0 + 12)} ${h + D}"`) + `<g transform="translate(0,${D})">${body}</g><g class="rlstrip">${g}</g>${slots.join('')}</svg>`;
}
/* Groupings: a dashed frame around a group's boxes with its name above the top-left corner. A group inside another
   (granulocytes inside myeloid cells) gets the tighter frame, so the two never share a line. Frames sit behind the
   drawing; names on top. While the name is a blank it's a "group" pill (or the answer field). */
const GROUP_TONES = ['pink', 'teal', 'gold', 'blue', 'orange', 'slate'];
let GROUP_RECTS = {}; // where each group's frame went (for drawing groups yourself)
function groupRect(g, pos, all, labels = []) {
  // Its boxes, and the labels of steps that run between two of them (so the frame never cuts through a name).
  const inner = new Set((DRAW_MODEL?.p.reactions || []).filter(r => g.members.includes(r.from) && g.members.includes(r.to)).map(r => r.id));
  const rs = [...g.members.map(id => pos['m:' + id]).filter(Boolean), ...labels.filter(l => inner.has(l.rid)).map(l => ({ x: l.x - 14, y: l.y, w: l.w + 28, h: l.h }))];
  if (!rs.length) return null;
  const inside = all.filter(o => o !== g && o.members.length < g.members.length && o.members.every(id => g.members.includes(id))).length;
  const pad = 16 + 22 * inside, x0 = Math.min(...rs.map(r => r.x)) - pad, y0 = Math.min(...rs.map(r => r.y)) - pad;
  return { x: x0, y: y0, w: Math.max(...rs.map(r => r.x + r.w)) + pad - x0, h: Math.max(...rs.map(r => r.y + r.h)) + pad - y0 };
}
let GROUP_INLINE_DONE = false;
function withGroups(svg, m, statusOf, grps, pos) {
  let back = '', front = '', minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  GROUP_RECTS = {}; GROUP_INLINE_DONE = false;
  grps.forEach((g, i) => {
    const st = statusOf(g.key), r = groupRect(g, pos, grps, DRAW_LABELS);
    if (!r) return;
    GROUP_RECTS[g.id] = r;
    if (st === 'hide') return;
    // Its name above the top-left corner, or the top-right one when a step crosses the top edge where the name would be.
    const crossX = (m.p.reactions || []).flatMap(x => [[x.from, x.to], [x.to, x.from]]).filter(([o, i2]) => g.members.includes(i2) && !g.members.includes(o) && pos['m:' + o] && pos['m:' + i2] && pos['m:' + o].y + pos['m:' + o].h < r.y)
      .map(([, i2]) => pos['m:' + i2].x + pos['m:' + i2].w / 2);
    // ...and clear of labels and of the other groups' frames.
    const tw = g.name.length * 8.2 + 8, ty = r.y - 24, frames = grps.filter(o => o !== g).map(o => groupRect(o, pos, grps, DRAW_LABELS)).filter(Boolean);
    const clear = x0 => !crossX.some(cx => cx > x0 - 10 && cx < x0 + tw + 10) && !DRAW_LABELS.some(l => overlaps(l, { x: x0, y: ty, w: tw, h: 20 }))
      && !frames.some(f => ty + 20 > f.y && ty < f.y + f.h && ((f.x > x0 - 6 && f.x < x0 + tw + 6) || (f.x + f.w > x0 - 6 && f.x + f.w < x0 + tw + 6)));
    const tone = g.tone || GROUP_TONES[i % GROUP_TONES.length], lx = [r.x + 2, r.x + r.w - 2 - tw, ...crossX.flatMap(cx => [cx + 12, cx - 12 - tw])].find(clear) ?? r.x + 2, ly = r.y - 8; // (beside the step when neither end is clear)
    back += `<rect class="gframe tone-${tone}${st === 'target' ? ' target' : ''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14"/>`;
    let label;
    if (st === 'target' && INLINE && !GROUP_INLINE_DONE) {
      GROUP_INLINE_DONE = true;
      const w = Math.max(220, INLINE.along ? INLINE.along.length * 8 + 28 : 0);
      label = `<g class="elab target"><rect x="${lx}" y="${ly - 22}" width="${w}" height="30" rx="15"/></g>` + inlineField(lx + 4, ly - 19, w - 8, 24);
    } else if (hidden(st)) {
      const w = pillW('group');
      label = `<g class="elab gblank ${st}" data-key="${g.key}"><rect x="${lx}" y="${ly - 18}" width="${w}" height="24" rx="12"/>${blankText(lx + w / 2, ly - 6, 'group')}</g>`;
    } else {
      const mark = st === 'right' ? svgIcon(lx + g.name.length * 8.2 + 16, ly - 5, 'ok') : st === 'missed' ? svgIcon(lx + g.name.length * 8.2 + 16, ly - 5, 'no') : '';
      label = `<text class="gname tone-${tone}" data-key="${g.key}" x="${lx}" y="${ly}">${esc(g.name)}</text>${mark}`;
    }
    front += label;
    minX = Math.min(minX, r.x - 4); minY = Math.min(minY, ly - 26); maxX = Math.max(maxX, r.x + r.w + 4, lx + g.name.length * 8.2 + 30); maxY = Math.max(maxY, r.y + r.h + 4);
  });
  // Grow the drawing to hold frames that reach past its edges.
  const vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
  const X0 = Math.min(vb[0], minX), Y0 = Math.min(vb[1], minY), X1 = Math.max(vb[0] + vb[2], maxX), Y1 = Math.max(vb[1] + vb[3], maxY);
  const at = svg.lastIndexOf('</svg>');
  return (svg.slice(0, at) + front + svg.slice(at)).replace(/viewBox="[^"]+"/, `viewBox="${X0} ${Y0} ${X1 - X0} ${Y1 - Y0}"`).replace(/^(<svg[^>]*>)/, `$1${back}`);
}
// Transport steps (a metabolite crossing a membrane) are dashed so they read differently from reactions.
/* Effects, in pathways that mark them: green with an arrowhead activates, red with a flat bar inhibits (and the label
   says so). While the effect is a blank the line is plain with an open circle at its end; hidden, a plain arrow. */
const effSt = r => (DRAW_MODEL?.items['f:' + r.id] ? (DRAW_STATUS ? DRAW_STATUS('f:' + r.id) || 'shown' : 'shown') : null);
const effShown = r => { const st = effSt(r); return st === null || !(hidden(st) || st === 'hide'); };
function rxCls(r) {
  // (rx-<step>: which step a line draws, for its hover summary)
  const base = (r.transport ? 'ln trn' : 'ln') + (regOff(r) ? ' regoff' : '') + (r.id ? ' rx-' + r.id : ''), inh = (r.tags || []).some(t => t === 'inhibits' || t === 'blocked'), st = effSt(r);
  if (st === null) return base + (inh ? ' inh' : '');
  if (st === 'hide') return base;
  if (hidden(st)) return base + ' effq' + (st === 'target' ? ' eff-target' : '');
  return base + (inh ? ' inh fx-inh' : ' fx-act');
}
const headCls = cls => (cls.includes('effq') ? 'ah effq' : cls.includes('inh') ? 'ah inh' + (cls.includes('fx-inh') ? ' fx-inh' : '') : cls.includes('fx-act') ? 'ah fx-act' : 'ah') + (cls.includes('regoff') ? ' regoff' : '');
// A step's tags as its label shows them: never "irreversible" (the arrow says it), and "inhibits" only while its effect shows.
const rlShown = (r, k = 'k:' + r.id) => { if (!DRAW_MODEL?.items[k] || !DRAW_STATUS) return true; const st = DRAW_STATUS(k) || 'shown'; return !hidden(st) && st !== 'hide'; };
const shownTags = r => (r.tags || []).filter(t => t !== 'irreversible' && (t !== 'inhibits' || effShown(r)) && (t !== 'rate-limiting' || rlShown(r)));
// The drugs and toxins on a step that are in view (shown, or blanks).
const drugLines = item => { const it = (item?.kind === 'enz' || item?.kind === 'trn') && !item.via && DRAW_MODEL?.items['q:' + item.rxn?.id], st = it && (DRAW_STATUS ? DRAW_STATUS(it.key) || 'shown' : 'shown');
  return !it || st === 'hide' ? [] : hidden(st) ? [[it, st]] : (it.groups || it.drugs).map(d => [{ ...it, name: d.name, drug: d }, st]); };
// Only when one state is in view (a quiz's choice, a page's Fed/Fasting): with both or neither, no badges at all.
const regLines = item => { if (item?.kind !== 'enz' || !item.rxn?.reg || !DRAW_MODEL) return [];
  const v = ['y:', 'x:'].map(p => DRAW_MODEL.items[p + item.rxn.id]).filter(Boolean).map(it => [it, DRAW_STATUS ? DRAW_STATUS(it.key) || 'shown' : 'shown']).filter(([, st]) => st !== 'hide');
  return v.length === 1 ? v : []; };
// A step that is OFF in the state being shown fades (never while that's still a blank: it would give the answer away).
const regOff = r => { const v = r?.reg && DRAW_MODEL ? regLines(DRAW_MODEL.items['e:' + r.id]) : []; return v.length === 1 && !hidden(v[0][1]) && v[0][0].name === 'Off'; };
const viaTags = r => (r.via_tags || []).filter(t => t !== 'rate-limiting' || rlShown(r));
/* A step whose substrate first crosses a membrane (r.via): its carrier is a pill on that membrane, the enzyme's name on
   the far side. VIA_X / VIA_Y: the membranes of the drawing being made (lane walls, a grid's bands). */
let VIA_X = [], VIA_Y = [];
// A pill on a vertical line, slid sideways (its line still well inside it) to the nearest spot where it covers nothing.
function slide(q, it) {
  const half = enzRect(0, 0, 'middle', it, 22).w / 2 - 22;
  for (let d = 8; d <= half; d += 8) for (const sx of [-d, d]) if (!hitsBox(enzRect(q[0] + sx, q[1], 'middle', it, 22))) return [q[0] + sx, q[1]];
  return null;
}
function viaAt(pts, it = null) { // it: the carrier's item, to find a spot where its pill lands on nothing
  const segs = pts.slice(1).map((q, i) => [pts[i], q]);
  // The Map's floorplan: the membranes are real edges between regions, not lines across the whole drawing.
  if (MEMBRANE_SEGS) for (let i = segs.length - 1; i >= 0; i--) {
    const [[x0, y0], [x1, y1]] = segs[i], hits = [];
    for (const [a, b, c, d] of MEMBRANE_SEGS) {
      if (a === c && Math.abs(y0 - y1) < 1 && a > Math.min(x0, x1) + 2 && a < Math.max(x0, x1) - 2 && y0 > Math.min(b, d) && y0 < Math.max(b, d)) hits.push([a, y0]);
      if (b === d && Math.abs(x0 - x1) < 1 && b > Math.min(y0, y1) + 2 && b < Math.max(y0, y1) - 2 && x0 > Math.min(a, c) && x0 < Math.max(a, c)) hits.push([x0, b]);
    }
    if (hits.length) return hits.sort((p, q) => Math.hypot(p[0] - x1, p[1] - y1) - Math.hypot(q[0] - x1, q[1] - y1))[0];
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const [[x0, y0], [x1, y1]] = segs[i];
    const xm = [...VIA_X, ...GRID_MEMBRANES].filter(x => x > Math.min(x0, x1) + 2 && x < Math.max(x0, x1) - 2).sort((a, b) => Math.abs(a - x1) - Math.abs(b - x1))[0];
    if (xm !== undefined) return [xm, y0 + (y1 - y0) * (xm - x0) / (x1 - x0 || 1)];
    const ym = [...VIA_Y, ...GRID_MEMBRANES_Y].filter(y => y > Math.min(y0, y1) + 2 && y < Math.max(y0, y1) - 2).sort((a, b) => Math.abs(a - y1) - Math.abs(b - y1))[0];
    if (ym !== undefined) { const q = [x0 + (x1 - x0) * (ym - y0) / (y1 - y0 || 1), ym]; return (it && slide(q, it)) || q; } // can't move along the line
  }
  // No membrane drawn across it: along its legs (longest first), the first spot where the pill covers no box or label.
  if (it) for (const [[x0, y0], [x1, y1]] of segs.slice().sort((p, q) => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) - Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1])))
    for (const f of [0.3, 0.5, 0.7, 0.2, 0.8, 0.4, 0.6]) { const q = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]; if (!hitsBox(enzRect(q[0], q[1], 'middle', it, 22))) return q; }
  // Nowhere fully clear (a short climb between labels): the spot along it that covers least, boxes counting most.
  if (it) {
    const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const cost = q => { const r = enzRect(q[0], q[1], 'middle', it, 22); return DRAW_BOXES.reduce((c, b) => c + 4 * area(r, b), 0) + DRAW_LABELS.reduce((c, b) => c + area(r, b), 0); };
    let best = null, bc = Infinity;
    for (const [[x0, y0], [x1, y1]] of segs) if (Math.hypot(x1 - x0, y1 - y0) > 30) for (let f = 0.15; f <= 0.851; f += 0.05) { const q = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], c = cost(q); if (c < bc) { bc = c; best = q; } }
    if (best) return best;
  }
  // Else on its longest leg (never a trunk it shares), near where that leg starts.
  const [[x0, y0], [x1, y1]] = segs.reduce((a, b) => (Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) > Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]) ? b : a));
  // A straight step: clear of the box it leaves and of its name, which moves toward the far end.
  const L = Math.hypot(x1 - x0, y1 - y0), f = segs.length === 1 ? Math.min(0.4, Math.max(0.22, (Math.abs(x1 - x0) > Math.abs(y1 - y0) ? 96 : 56) / (L || 1))) : 0.3; // clear of the box and its compartment's edge
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
}
function viaPill(m, statusOf, r, at) {
  const it = m.items['t:' + r.id];
  if (!it || !at) return '';
  DRAW_LABELS.push(enzRect(at[0], at[1], 'middle', it, 22));
  return enzLabel(at[0], at[1], it, statusOf('t:' + r.id), 'middle', 22, 'center');
}

// Steps that a connector lands on (grid): their name moves two-thirds along, clear of where the connector arrives.
let CONN_STEPS = new Map();
// Membrane lines of a grid with column bands (x positions): a transport step across one draws its carrier on it.
let GRID_MEMBRANES = [], GRID_MEMBRANES_Y = []; // step id → how far along its line connectors land (0–1)
// w: how wide the label is along the line; with it, a label on a step a connector lands on keeps clear of the landing.
const labAt = (r, a, b, w = 0) => {
  if (!CONN_STEPS.has(r.id)) return r.via ? a + (b - a) * 0.72 : (a + b) / 2;
  const f = CONN_STEPS.get(r.id), def = a + (b - a) * (f < 0.5 ? 0.72 : 0.28); if (!w) return def;
  const land = a + (b - a) * f, lo = Math.min(a, b), hi = Math.max(a, b), ok = c => c - w / 2 >= lo - 20 && c + w / 2 <= hi + 20;
  const cs = [land - w / 2 - 14, land + w / 2 + 14].filter(ok).sort((p, q) => Math.abs(p - def) - Math.abs(q - def));
  return cs[0] ?? def;
};
// Any connection between two boxes that isn't on the straight spine: side steps, grid steps.
function drawEdge(m, statusOf, r, a, b, wA = BW, wB = BW) {
  VIA_PTS = null;
  const p1 = edgePt(a, b.cx, b.cy, wA), p2 = edgePt(b, a.cx, a.cy, wB), ti = r.via && m.items['t:' + r.id];
  // The carrier's pill is reserved first (where a straight step puts it), so the step's own labels keep clear of it.
  const hold = ti && enzRect(...viaAt([p1, p2]), 'middle', ti, 22);
  if (hold) DRAW_LABELS.push(hold);
  const out = drawEdge1(m, statusOf, r, a, b, wA, wB);
  if (!r.via) return out;
  if (hold) DRAW_LABELS.splice(DRAW_LABELS.indexOf(hold), 1);
  return out + viaPill(m, statusOf, r, VIA_PTS ? viaAt(VIA_PTS, ti) : viaAt([p1, p2]));
}
let VIA_PTS = null; // the route drawEdge1 took, when it bent
let TAB_ENTER_TO = new Set(); // ...and the boxes they drop into (a pair of arrows there, twinEdge, stops short too)
let TAB_ENTERS = new Set(); // grid steps dropping into another compartment in a joined drawing: their name sits higher (gridSVG)
function drawEdge1(m, statusOf, r, a, b, wA = BW, wB = BW) {
  const p1 = edgePt(a, b.cx, b.cy, wA), p2 = edgePt(b, a.cx, a.cy, wB);
  const isEnd = bx => [a, b].some(q => Math.abs(bx.x + bx.w / 2 - q.cx) < 4 && Math.abs(bx.y + bx.h / 2 - q.cy) < 4);
  const crosses = (x, y0, y1) => DRAW_BOXES.some(bx => x > bx.x && x < bx.x + bx.w && Math.min(y0, y1) < bx.y + bx.h - 2 && Math.max(y0, y1) > bx.y + 2 && !isEnd(bx));
  const crossesH = (y, x0, x1) => DRAW_BOXES.some(bx => y > bx.y && y < bx.y + bx.h && Math.min(x0, x1) < bx.x + bx.w - 2 && Math.max(x0, x1) > bx.x + 2 && !isEnd(bx));
  // Straight up or down past another box (glucose in the ER up to glucose in the blood): swing out beside the column.
  if (Math.abs(p1[0] - p2[0]) < 4 && crosses(a.cx, a.cy, b.cy)) {
    const gx = a.cx + wA / 2 + 46, pts = [[a.cx + wA / 2 + 4, a.cy], [gx, a.cy], [gx, b.cy], [b.cx + wB / 2 + 4, b.cy]];
    const it = m.items['e:' + r.id], es = statusOf('e:' + r.id), mid = labAt(r, a.cy, b.cy); VIA_PTS = pts;
    DRAW_LABELS.push(enzRect(gx + 12, mid, 'start', it, 18));
    return elbow(pts, r.reversible, rxCls(r)) + enzLabel(gx + 12, mid, it, es, 'start', 18, 'center');
  }
  let s = arrow(p1[0], p1[1], p2[0], p2[1], r.reversible, rxCls(r));
  const lw = enzRect(0, 0, 'middle', m.items['e:' + r.id], 16, 'bottom').w, mx = labAt(r, p1[0], p2[0], lw), my = TAB_ENTERS.has(r.id) ? (p1[1] + b.cy - BH / 2 - TAB_BAND) / 2 : labAt(r, p1[1], p2[1]);
  const cs = cofSt(m, statusOf, r), ct = cofVisible(cs) ? cofText(m, r.cofactors) : '';
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id);
  const xm = r.transport && !r.paracellular && Math.abs(p1[1] - p2[1]) < 4 ? GRID_MEMBRANES.find(x => x > Math.min(p1[0], p2[0]) && x < Math.max(p1[0], p2[0])) : undefined;
  if (xm !== undefined) {
    // A carrier in a membrane (a tubular cell): a small circle on the membrane, its name beside it, toward where the solute goes.
    const right = p2[0] > p1[0], lx = xm + (right ? 16 : -16), anchor = right ? 'start' : 'end';
    s += `<circle class="carrier" cx="${xm}" cy="${my}" r="9"/>`;
    s += enzLabel(lx, my - 16, it, es, anchor, 16, 'bottom'); DRAW_LABELS.push(enzRect(lx, my - 16, anchor, it, 16, 'bottom')); // its pill clear of the arrow
    if (cs !== 'none' && cs !== 'hide') s += cofArcLine(p1, p2, [0, 1], cofParts(m, statusOf, r));
  } else if (Math.abs(p1[1] - p2[1]) < 4) {
    // A carrier on the way: the name goes between the pill and the far box if it fits there, else just above the pill.
    let lx = mx, ly = my - 8, c1 = p1;
    if (r.via && m.items['t:' + r.id]) {
      const pv = viaAt([p1, p2]), pr = enzRect(pv[0], pv[1], 'middle', m.items['t:' + r.id], 22), er = enzRect(0, 0, 'middle', it, 16, 'bottom');
      const far = p2[0] > p1[0] ? pr.x + pr.w : pr.x, room = Math.abs(p2[0] - far) - 16;
      if (room >= er.w) lx = (far + p2[0]) / 2; else { lx = pv[0]; ly = pr.y - 4; }
      // Its carrier in a membrane (compartment bands): the enzyme works past it, so its cofactors stay that side too.
      if (GRID_MEMBRANES.includes(pv[0])) c1 = [far + Math.sign(p2[0] - p1[0]) * 8, p1[1]];
    }
    s += enzLabel(lx, ly, it, es, 'middle', 16, 'bottom'); DRAW_LABELS.push(enzRect(lx, ly, 'middle', it, 16, 'bottom'));
    if (cs !== 'none' && cs !== 'hide') s += cofArcLine(c1, p2, [0, 1], cofParts(m, statusOf, r)); // beneath, bowing up to the arrow
  } else if (Math.abs(p1[0] - p2[0]) < 4 && r.transport && !r.paracellular && GRID_MEMBRANES_Y.some(y => y > Math.min(p1[1], p2[1]) && y < Math.max(p1[1], p2[1]))) {
    // Across a horizontal membrane (a cell on its side): the carrier on the line, its name beside it toward where the solute goes.
    const ym = GRID_MEMBRANES_Y.find(y => y > Math.min(p1[1], p2[1]) && y < Math.max(p1[1], p2[1])), dn = p2[1] > p1[1], ly = ym + (dn ? 26 : -26);
    s += `<circle class="carrier" cx="${p1[0]}" cy="${ym}" r="9"/>` + enzLabel(p1[0] - 16, ly, it, es, 'end', 18, 'center'); DRAW_LABELS.push(enzRect(p1[0] - 16, ly, 'end', it, 18));
    if (cs !== 'none' && cs !== 'hide') s += cofArcParts(p1[0], Math.min(p1[1], p2[1]), Math.max(p1[1], p2[1]), cofParts(m, statusOf, r), p2[1] < p1[1]);
  } else if (Math.abs(p1[0] - p2[0]) < 4) {
    // Past a carrier pill (its far edge, plus a little), so the cofactors never start under it.
    const ti = r.via && m.items['t:' + r.id], pv = ti && viaAt([p1, p2]), pr = ti && enzRect(pv[0], pv[1], 'middle', ti, 22);
    const q1 = ti ? (p2[1] > p1[1] ? Math.max(p1[1], pr.y + pr.h + 4) : Math.min(p1[1], pr.y - 4)) : p1[1];
    const parts = cofParts(m, statusOf, r).filter(p => p.st !== 'hide' && p.st !== 'none'), cofOn = cs !== 'none' && cs !== 'hide';
    // Cofactors go right of the arrow and the name left, unless the right is crowded (another step's labels) and the left is free.
    const span = side => parts.some(p => { const w = hidden(p.st) ? 160 : p.text.length * 7 + 24, y0 = Math.min(q1, p2[1]), y1 = Math.max(q1, p2[1]);
      return hitsBox({ x: side > 0 ? mx + 50 : mx - 50 - w, y: y0, w, h: y1 - y0 }); });
    const flip = cofOn && span(1) && !span(-1) && !hitsBox(enzRect(mx + 14, my, 'start', it, 18));
    s += enzLabel(mx + (flip ? 14 : -14), my, it, es, flip ? 'start' : 'end', 18, 'center'); DRAW_LABELS.push(enzRect(mx + (flip ? 14 : -14), my, flip ? 'start' : 'end', it, 18));
    const e2 = TAB_ENTERS.has(r.id) ? b.cy - BH / 2 - TAB_BAND - 8 : p2[1]; // (into another compartment: the curl stays above its name tab)
    if (cofOn) s += cofArcParts(mx, Math.min(q1, e2), Math.max(q1, e2), cofParts(m, statusOf, r), p2[1] < p1[1], flip);
  } else {
    // Off-line: an L. Leave a box on the main line from its side (its bottom carries the main arrow), then turn into the
    // other box; otherwise drop straight down (or up) first, then turn into the other box's side.
    s = '';
    const down = b.cy > a.cy;
    // Which corner: leave a main-line box from its side; otherwise drop first, unless that drop would run through a box.
    let fromSpine = (m.onSpine?.has(r.from) && !m.onSpine?.has(r.to)) || crosses(a.cx, a.cy + (down ? BH / 2 : -BH / 2), b.cy);
    // Whichever corner it takes, neither leg may run through a box; if only the other corner is clear, take that one.
    const hClear = !crossesH(a.cy, a.cx, b.cx) && !crosses(b.cx, a.cy, b.cy), vClear = !crosses(a.cx, a.cy, b.cy) && !crossesH(b.cy, a.cx, b.cx);
    if (fromSpine && !hClear && vClear) fromSpine = false; else if (!fromSpine && !vClear && hClear) fromSpine = true;
    // Neither corner is clear: across to the gutter beside the target, along it, then into the target's side.
    const gx = b.cx + Math.sign(a.cx - b.cx) * (wB / 2 + 54);
    if (!hClear && !vClear && !crossesH(a.cy, a.cx, gx) && !crosses(gx, a.cy, b.cy)) {
      const pts = [[a.cx - Math.sign(a.cx - b.cx) * (wA / 2 + 4), a.cy], [gx, a.cy], [gx, b.cy], [b.cx + Math.sign(a.cx - b.cx) * (wB / 2 + 4), b.cy]];
      VIA_PTS = pts;
      return elbow(pts, r.reversible, rxCls(r)) + elbowLabels(m, statusOf, r, [pts[0], pts[1]], null);
    }
    if (fromSpine) {
      const x0 = a.cx + Math.sign(b.cx - a.cx) * (wA / 2 + 4), yb = down ? b.cy - BH / 2 - 4 : b.cy + BH / 2 + 4;
      const pts = [[x0, a.cy], [b.cx, a.cy], [b.cx, yb]]; VIA_PTS = pts;
      s += elbow(pts, r.reversible, rxCls(r)) + elbowLabels(m, statusOf, r, [pts[0], pts[1]], [pts[1], pts[2]]);
    } else {
      const ya = down ? a.cy + BH / 2 + 4 : a.cy - BH / 2 - 4, x1 = b.cx - Math.sign(b.cx - a.cx) * (wB / 2 + 4);
      const pts = [[a.cx, ya], [a.cx, b.cy], [x1, b.cy]]; VIA_PTS = pts;
      s += elbow(pts, r.reversible, rxCls(r)) + elbowLabels(m, statusOf, r, [pts[1], pts[2]], [pts[0], pts[1]]);
    }
  }
  return s;
}
/* A connector's route: right angles only, never through a box. Tried in order: straight; down (or up) then across;
   across then down; across, down, across (through the gap between columns); down, across, down (between rows).
   to: { pt, axis } lands on a step's line, arriving across it ('h': arrives level, onto an upright line), or { box }.
   Leaves a box off-center, toward its target, so it never runs along the box's own arrows. */
let CONN_LINES = [];
function connector(S, to, near, cls) {
  const sg = v => (v > 0 ? 1 : -1), clearOf = [S, to.box, ...near].filter(Boolean);
  const blocked = (x0, y0, x1, y1) => DRAW_BOXES.some(bx => !clearOf.some(q => Math.abs(bx.x + bx.w / 2 - q.cx) < 4 && Math.abs(bx.y + bx.h / 2 - q.cy) < 4)
    && Math.max(x0, x1) > bx.x - 6 && Math.min(x0, x1) < bx.x + bx.w + 6 && Math.max(y0, y1) > bx.y - 6 && Math.min(y0, y1) < bx.y + bx.h + 6);
  // Where it ends: on the step's line, or on the side of the target box it arrives at.
  const end = axis => to.pt ? (to.axis === 'any' || to.axis === axis ? to.pt : null)
    : axis === 'h' ? [to.box.cx - sg(to.box.cx - S.cx) * (BW / 2 + 4), to.box.cy] : [to.box.cx, to.box.cy - sg(to.box.cy - S.cy) * (BH / 2 + 4)];
  const tx = to.pt ? to.pt[0] : to.box.cx, ty = to.pt ? to.pt[1] : to.box.cy;
  const outV = y => [S.cx + sg(tx - S.cx) * Math.min(BW / 2 - 26, Math.abs(tx - S.cx)), S.cy + sg(y - S.cy) * (BH / 2 + 4)];
  const outH = () => [S.cx + sg(tx - S.cx) * (BW / 2 + 4), S.cy];
  const cands = [];
  { const e = end('h'); if (e && Math.abs(e[1] - S.cy) < 4 && Math.abs(e[0] - S.cx) > BW / 2) cands.push([outH(), e]); }
  { const e = end('v'); if (e && Math.abs(e[0] - S.cx) < BW / 2 - 20 && Math.abs(e[1] - S.cy) > BH) cands.push([[e[0], S.cy + sg(e[1] - S.cy) * (BH / 2 + 4)], e]); }
  { const e = end('h'); if (e && Math.abs(e[1] - S.cy) > BH / 2 + 8) { const o = outV(e[1]); cands.push([o, [o[0], e[1]], e]); } }
  { const e = end('v'); if (e && Math.abs(e[0] - S.cx) > BW / 2 + 8) { const o = outH(); cands.push([o, [e[0], o[1]], e]); } }
  for (const off of [160, 110, 210]) { const e = end('h'); if (e) { const o = outH(), xm = S.cx + sg(tx - S.cx) * (BW / 2 + off); cands.push([o, [xm, o[1]], [xm, e[1]], e]); } }
  for (const off of [58, 34, 84]) { const e = end('v'); if (e) { const o = outV(ty), ym = S.cy + sg(ty - S.cy) * (BH / 2 + off); cands.push([o, [o[0], ym], [e[0], ym], e]); } }
  // Out the far side and back around (when the near side is crowded): down, across, then up to a target above.
  for (const off of [34, 58]) { const e = end('v'); if (e && Math.abs(e[0] - S.cx) > BW / 2) { const o = outV(2 * S.cy - ty), ym = S.cy - sg(ty - S.cy) * (BH / 2 + off); cands.push([o, [o[0], ym], [e[0], ym], e]); } }
  // Best route: never through a box; then never running alongside another source's connector (they'd read as one line);
  // then the fewest crossings; then the fewest turns. Connectors from the same box may share a trunk.
  const segs = pts => pts.slice(1).map((q, i) => [pts[i], q]);
  const along = (a, b) => { const h = Math.abs(a[0][1] - a[1][1]) < 1, hb = Math.abs(b[0][1] - b[1][1]) < 1, k = h ? 1 : 0, j = h ? 0 : 1;
    return h === hb && Math.abs(a[0][k] - b[0][k]) < 8 && Math.min(Math.max(a[0][j], a[1][j]), Math.max(b[0][j], b[1][j])) - Math.max(Math.min(a[0][j], a[1][j]), Math.min(b[0][j], b[1][j])) > 4; };
  const cross = (a, b) => { const h = Math.abs(a[0][1] - a[1][1]) < 1, hb = Math.abs(b[0][1] - b[1][1]) < 1; if (h === hb) return false;
    const [H, V] = h ? [a, b] : [b, a], y = H[0][1], x = V[0][0];
    return x > Math.min(H[0][0], H[1][0]) + 2 && x < Math.max(H[0][0], H[1][0]) - 2 && y > Math.min(V[0][1], V[1][1]) + 2 && y < Math.max(V[0][1], V[1][1]) - 2; };
  const score = pts => {
    if (pts.some((q, i) => i && blocked(pts[i - 1][0], pts[i - 1][1], q[0], q[1]))) return 1e6;
    let sc = pts.length;
    // Through a step's name: avoid if there's another way.
    for (const [a, b] of segs(pts)) if (DRAW_LABELS.some(l => Math.max(a[0], b[0]) > l.x - 4 && Math.min(a[0], b[0]) < l.x + l.w + 4 && Math.max(a[1], b[1]) > l.y - 3 && Math.min(a[1], b[1]) < l.y + l.h + 3)) sc += 40;
    for (const L of CONN_LINES) for (const a of segs(pts)) for (const b of segs(L.pts)) { if (L.src !== S && along(a, b)) sc += 100; if (cross(a, b)) sc += 3; }
    return sc;
  };
  const pts = cands.map(c => [score(c), c]).sort((a, b) => a[0] - b[0])[0]?.[1];
  if (!pts) return '';
  CONN_LINES.push({ src: S, pts });
  return pts.length === 2 ? arrow(pts[0][0], pts[0][1], pts[1][0], pts[1][1], false, cls) : elbow(pts, false, cls);
}
// A side input's arrow on a grid: straight when the boxes line up, else down (or up) first, then into the product's side;
// across first instead when the first way would run through a box.
function joinEdge(a, b, r) {
  const cls = rxCls(r) + ' join', dx = Math.sign(b.cx - a.cx), down = b.cy > a.cy;
  if (Math.abs(a.cx - b.cx) < 4) return arrow(a.cx, a.cy + (down ? 1 : -1) * (BH / 2 + 4), b.cx, b.cy - (down ? 1 : -1) * (BH / 2 + 4), false, cls);
  if (Math.abs(a.cy - b.cy) < 4) return arrow(a.cx + dx * (BW / 2 + 4), a.cy, b.cx - dx * (BW / 2 + 4), b.cy, false, cls);
  const through = (x0, y0, x1, y1) => DRAW_BOXES.some(bx => Math.max(x0, x1) > bx.x + 2 && Math.min(x0, x1) < bx.x + bx.w - 2 && Math.max(y0, y1) > bx.y + 2 && Math.min(y0, y1) < bx.y + bx.h - 2
    && ![a, b].some(q => Math.abs(bx.x + bx.w / 2 - q.cx) < 4 && Math.abs(bx.y + bx.h / 2 - q.cy) < 4));
  const ya = a.cy + (down ? 1 : -1) * (BH / 2 + 4), xb = b.cx - dx * (BW / 2 + 4);
  if (!through(a.cx, ya, a.cx, b.cy) && !through(a.cx, b.cy, xb, b.cy)) return elbow([[a.cx, ya], [a.cx, b.cy], [xb, b.cy]], false, cls);
  const xa = a.cx + dx * (BW / 2 + 4), yb = b.cy - (down ? 1 : -1) * (BH / 2 + 4);
  return elbow([[xa, a.cy], [b.cx, a.cy], [b.cx, yb]], false, cls);
}
// One of a vertical pair of opposite steps: the downward one runs on the left with its labels further left, the upward
// one on the right with its labels further right, so neither crosses the other.
function twinEdge(m, statusOf, r, a, b, forceSide = 0) {
  const down = b.cy > a.cy, side = forceSide || (down ? -1 : 1), x = a.cx + side * 14;
  const y1 = down ? a.cy + BH / 2 + 4 : a.cy - BH / 2 - 4, y2 = down ? b.cy - BH / 2 - 4 : b.cy + BH / 2 + 4;
  // (Into another compartment's box in a joined drawing: its name and cofactors stop short of that box's name tab.)
  const low = down ? r.to : r.from, [c1, c2] = TAB_ENTER_TO.has(low) ? (down ? [y1, y2 - TAB_BAND + 4] : [y1 - TAB_BAND + 4, y2]) : [y1, y2];
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id), cs = cofSt(m, statusOf, r), mid = labAt(r, c1, c2), anchor = side < 0 ? 'end' : 'start';
  // The name sits outside the cofactor text (which hugs the arrow), so the two never overlap.
  const cw = Math.max(0, ...cofParts(m, statusOf, r).map(q => (hidden(q.st) ? 110 : q.text.length * 7))), lx = x + side * (54 + cw + 14);
  let s = arrow(x, y1, x, y2, r.reversible, rxCls(r)) + enzLabel(lx, mid, it, es, anchor, 22, 'center');
  DRAW_LABELS.push(enzRect(lx, mid, anchor, it, 22));
  if (cs !== 'none' && cs !== 'hide') s += cofArcLine([x, c1], [x, c2], [side, 0], cofParts(m, statusOf, r));
  if (r.via) s += viaPill(m, statusOf, r, viaAt([[x, c1], [x, c2]]));
  return s;
}
// One of two level steps between the same boxes: the first runs just above center with its label above it, the
// second just below with its label (and cofactors) below.
function pairEdge(m, statusOf, r, a, b, i) {
  if (!r.via) return pairEdge1(m, statusOf, r, a, b, i);
  const dir = Math.sign(b.cx - a.cx) || 1, y = a.cy + (i ? 10 : -10);
  return pairEdge1(m, statusOf, r, a, b, i) + viaPill(m, statusOf, r, viaAt([[a.cx + dir * (BW / 2 + 4), y], [b.cx - dir * (BW / 2 + 4), y]]));
}
function pairEdge1(m, statusOf, r, a, b, i) {
  const dir = Math.sign(b.cx - a.cx) || 1, x1 = a.cx + dir * (BW / 2 + 4), x2 = b.cx - dir * (BW / 2 + 4), y = a.cy + (i ? 10 : -10);
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id), cs = cofSt(m, statusOf, r);
  // Across a membrane: the carrier sits on it, named on the side the solute heads to (above for the first, below for the second).
  const xm = r.transport && !r.paracellular ? GRID_MEMBRANES.find(x => x > Math.min(x1, x2) && x < Math.max(x1, x2)) : undefined;
  const mx = xm !== undefined ? xm + dir * 16 + (dir > 0 ? 0 : 0) : labAt(r, x1, x2), anchor = xm !== undefined ? (dir > 0 ? 'start' : 'end') : 'middle';
  let s = arrow(x1, y, x2, y, r.reversible, rxCls(r)) + (xm !== undefined ? `<circle class="carrier" cx="${xm}" cy="${y}" r="8"/>` : '');
  if (anchor !== 'middle') {
    const ly = i ? y + 20 + enzRect(mx, 0, anchor, it, 16).h / 2 : y - 16; // the pill clear of the arrow
    s += enzLabel(mx, ly, it, es, anchor, 16, i ? 'center' : 'bottom'); DRAW_LABELS.push(enzRect(mx, ly, anchor, it, 16, i ? 'center' : 'bottom'));
    if (cs !== 'none' && cs !== 'hide') s += cofArcLine([x1, y], [x2, y], [0, i ? 1 : -1], cofParts(m, statusOf, r));
    return s;
  }
  if (!i) { s += enzLabel(mx, y - 8, it, es, 'middle', 22, 'bottom'); DRAW_LABELS.push(enzRect(mx, y - 8, 'middle', it, 22, 'bottom')); return s; }
  const h = enzRect(mx, 0, 'middle', it, 22).h, ly = y + 12 + h / 2;
  s += enzLabel(mx, ly, it, es, 'middle', 22, 'center'); DRAW_LABELS.push(enzRect(mx, ly, 'middle', it, 22));
  if (cs !== 'none' && cs !== 'hide') s += cofRow(mx, ly + h / 2 + 16, 'middle', cofParts(m, statusOf, r));
  return s;
}
// Labels for slanted arrows sit beside the line, never on it: above a shallow line, left of a steep one.
// boxes: metabolite boxes {x, y, w, h} to keep clear of; the label flips to the other side of the line if it would hit one.
function diagLabel(m, statusOf, r, p1, p2, boxes = []) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1, steep = Math.abs(dy) > Math.abs(dx);
  let nx = -dy / L, ny = dx / L;
  if (steep ? nx > 0 : ny > 0) { nx = -nx; ny = -ny; }
  const at = (sx, sy) => [p1[0] + dx * 0.42 + sx * 14, p1[1] + dy * 0.42 + sy * 14]; // a little before the middle
  const area = (x, y) => (steep ? { x: x - 130, y: y - 20, w: 130, h: 60 } : { x: x - 60, y: y - 34, w: 120, h: 34 });
  const hits = ([x, y]) => { const a = area(x, y); return boxes.some(b => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0); };
  let [x, y] = at(nx, ny);
  if (hits([x, y]) && !hits(at(-nx, -ny))) [x, y] = at(-nx, -ny);
  const cs = cofSt(m, statusOf, r), side = (x - (p1[0] + dx * 0.42)) * nx + (y - (p1[1] + dy * 0.42)) * ny >= 0 ? 1 : -1;
  const anchor = steep ? 'end' : 'middle';
  let s = enzLabel(x, y, m.items['e:' + r.id], statusOf('e:' + r.id), anchor, 18, steep ? 'center' : 'bottom');
  DRAW_LABELS.push(enzRect(x, y, anchor, m.items['e:' + r.id], 18, steep ? 'center' : 'bottom'));
  // Cofactors curve along the other side of the line from the enzyme's name (or back across it if that side is crowded).
  if (cs !== 'none' && cs !== 'hide') s += cofArcLine(p1, p2, [-nx * side, -ny * side], cofParts(m, statusOf, r), true);
  return s;
}

/* ---------- compartment lanes ----------
   When a pathway moves between compartments, flow view gives each compartment a vertical lane
   (outside → cytosol → ER → intermembrane space → mitochondria, left to right) with a dashed membrane between.
   A metabolite sits where it is made (else where it is used); transport steps never place anything. */
const LANE_ORDER = { blood: 0, lumen: 0, 'brush border': 0, 'plasma membrane': 0.5, cytosol: 1, er: 2, golgi: 2.2, vesicle: 2.4, peroxisome: 2.6, nucleus: 2.8, 'intermembrane space': 3, mitochondria: 4 };
function computeLanes(m) {
  const { p, spine, spineMets } = m;
  const multiT = m.multiTissue;
  const keyOf = (loc, tissue) => zoneKey(m, loc, tissue);
  const where = {};
  spineMets.forEach(id => {
    const own = p.metabolites[id]?.loc;
    if (own) { where[id] = { loc: own, tissue: p.metabolites[id].tissue }; return; }
    const made = spine.find(r => r.to === id && !r.transport), used = spine.find(r => r.from === id && !r.transport && !r.via); // a via step acts elsewhere
    const r = made || used;
    if (r) where[id] = { loc: r.loc, tissue: r.tissue };
  });
  // Anything still unplaced inherits from its neighbor on the line.
  spineMets.forEach((id, i) => { if (!where[id]) where[id] = where[spineMets[i - 1]] || where[spineMets[i + 1]] || { loc: '' }; });
  // Tissues left to right in the order the molecules travel through them (macrophage → blood → liver → gut).
  const tissues = uniq(spineMets.map(id => where[id].tissue || p.tissue || '').filter(Boolean));
  const lanes = {};
  for (const id of spineMets) {
    const w = where[id], k = keyOf(w.loc, w.tissue);
    (lanes[k] = lanes[k] || { key: k, labels: {}, tissue: w.tissue || p.tissue || '', comp: canonLoc(w.loc || '') }).labels[w.loc || ''] = ((lanes[k].labels[w.loc || ''] || 0) + 1);
  }
  // A pathway can set its own left-to-right order (p.lanes: compartments) when the usual one would make it zigzag.
  const own = (p.lanes || []).map(canonLoc), ownAt = c => (own.includes(c) ? own.indexOf(c) : own.length);
  const list = Object.values(lanes).sort((a, b) => (own.length ? ownAt(a.comp) - ownAt(b.comp) : 0)
    || (multiT ? tissues.indexOf(a.tissue) - tissues.indexOf(b.tissue) : 0) || (LANE_ORDER[a.comp] ?? 1.5) - (LANE_ORDER[b.comp] ?? 1.5));
  list.forEach((l, i) => {
    l.i = i;
    const loc = Object.entries(l.labels).sort((a, b) => b[1] - a[1])[0][0];
    l.label = [multiT && norm(l.tissue) !== norm(loc) ? l.tissue : '', loc].filter(Boolean).join(' · ');
  });
  const laneOf = {};
  for (const id of spineMets) laneOf[id] = lanes[keyOf(where[id].loc, where[id].tissue)].i;
  return { list, laneOf };
}

const LANE_W = 470;
// On the canvas, compartment tints and membranes run past the drawing to the canvas edges (the SVG may paint outside
// its box there); anywhere else the browser clips them to the drawing as before.
const BLEED = 20000;
const VIA_ROOM = 56; // a via step's extra height: its carrier pill above the enzyme
const SIDE_STEP = BW + 250; // box + the gap a sideways step's enzyme and cofactor text needs
// Each kind of compartment has its own tint (always with its name written on it, never color alone).
const ZONE_TONES = { blood: 'slate', lumen: 'slate', tubularlumen: 'gold', 'brush border': 'slate', 'plasma membrane': 'slate', cytosol: 'blue', er: 'teal', golgi: 'teal', vesicle: 'teal',
  mitochondria: 'orange', 'intermembrane space': 'gold', nucleus: 'gold', peroxisome: 'pink', lysosome: 'pink' };
const zoneTone = key => { const k = String(key).split('|').pop(); return ZONE_TONES[k] || (k.startsWith('tubularlumen') ? 'gold' : 'slate'); };
const zoneTissue = key => (String(key).includes('|') ? String(key).split('|')[0] : '');
// Boxes that are close together in one compartment share one dashed region.
/* A set of overlapping rectangles as one shape: its outline, every corner rounded (inside corners too), so pieces of a
   compartment that fit around another read as one smooth puzzle piece instead of stepped boxes. */
const REGION_R = 18, REGION_GAP = 22; // a compartment's corner radius; the space kept around another one it fits around
function unionPath(rects, R = REGION_R, Rin = REGION_R + REGION_GAP) { // Rin: inside corners, concentric with the shape they wrap
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b), ys = [...new Set(rects.flatMap(r => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  const on = (i, j) => i >= 0 && j >= 0 && i < xs.length - 1 && j < ys.length - 1 && rects.some(r => { const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2; return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h; });
  const edges = new Map(), key = p => p[0] + ',' + p[1], add = (a, b) => edges.set(key(a), [...(edges.get(key(a)) || []), b]);
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    if (!on(i, j)) continue;
    const [a, b, c, d] = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]]; // clockwise
    if (!on(i, j - 1)) add(a, b); if (!on(i + 1, j)) add(b, c); if (!on(i, j + 1)) add(c, d); if (!on(i - 1, j)) add(d, a);
  }
  let d = '';
  while (edges.size) {
    const [k0] = edges.keys(); let p = k0.split(',').map(Number); const loop = [p];
    for (let n = 0; n < 4000; n++) { const out = edges.get(key(p)); if (!out?.length) break; const q = out.shift(); if (!out.length) edges.delete(key(p)); if (key(q) === k0) break; loop.push(q); p = q; }
    edges.delete(k0);
    // Keep the corners only (drop points in the middle of a straight run), then round each one.
    const pts = loop.filter((v, i) => { const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length]; return !((a[0] === v[0] && v[0] === b[0]) || (a[1] === v[1] && v[1] === b[1])); });
    if (pts.length < 3) continue;
    pts.forEach((v, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length], la = Math.hypot(v[0] - a[0], v[1] - a[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
      const inner = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]) < 0, r = Math.min(inner ? Rin : R, la / 2, lb / 2); // clockwise: a left turn is an inside corner
      const p1 = [v[0] - (v[0] - a[0]) / la * r, v[1] - (v[1] - a[1]) / la * r], p2 = [v[0] + (b[0] - v[0]) / lb * r, v[1] + (b[1] - v[1]) / lb * r];
      d += `${i ? 'L' : 'M'}${p1[0]},${p1[1]} Q${v[0]},${v[1]} ${p2[0]},${p2[1]} `;
    });
    d += 'Z ';
  }
  return d;
}
/* Compartments of a joined drawing as one partition of the plane, so neighbors fit like puzzle pieces with every corner
   concentric. areas: [{ z, r }] each piece's candidate area (its bounding box); boxes: [{ z, r }] each compartment's own
   (padded) boxes. A cell goes to the compartment whose own box is in it, else to the compartment whose own box is nearest
   among the areas that cover it. Edges on one side within 40 px snap outward to one line
   and grid lines closer than two corners need (2R + gap) merge, so no slivers or ledges survive. Each piece is traced, pulled in by half the
   gap on every side (so two neighbors keep the gap between them) and rounded: outside corners R, inside corners R + gap,
   which makes an inside corner concentric with the outside corner it wraps. Where a short edge forces a smaller radius,
   the corner it faces is matched (radius less the gap), so the two stay concentric. Returns
   { z: [{ d, runs, bbox }] }: the outline (evenodd) and the piece's area as row runs (for placing its name). */
function zonePartition(areas, boxes, R = REGION_R, GAP = REGION_GAP, keepOut = []) { // keepOut: things in no compartment, never swallowed
  const h = GAP / 2, MINC = 2 * R + GAP, out = {}; if (!areas.length) return out; // MINC: no step shorter than two corners need
  const snapSide = (vals, low) => { const s = [...new Set(vals)].sort((a, b) => a - b), map = new Map(); let g = [];
    const flush = () => { const v = low ? g[0] : g[g.length - 1]; g.forEach(x => map.set(x, v)); g = []; };
    for (const v of s) { if (g.length && v - g[0] > 40) flush(); g.push(v); } if (g.length) flush(); return map; };
  const L = snapSide(areas.map(a => a.r.x), true), Rr = snapSide(areas.map(a => a.r.x + a.r.w), false), T = snapSide(areas.map(a => a.r.y), true), Bm = snapSide(areas.map(a => a.r.y + a.r.h), false);
  const ar = areas.map(a => ({ z: a.z, prio: a.prio, lab: a.lab, x0: L.get(a.r.x), x1: Rr.get(a.r.x + a.r.w), y0: T.get(a.r.y), y1: Bm.get(a.r.y + a.r.h) })).map(a => ({ ...a, area: (a.x1 - a.x0) * (a.y1 - a.y0) }));
  const lines = vs => { const s = [...new Set(vs)].sort((a, b) => a - b), o = []; for (const v of s) if (!o.length || v - o[o.length - 1] >= MINC) o.push(v); else o[o.length - 1] = Math.max(o[o.length - 1], v); return o; };
  // A box's own edges (with their margin) always stay grid lines, so no cell holds part of a box and part of its neighbor;
  // the area edges merge into them like into each other.
  // A cluster of close lines becomes its lowest when it holds a low edge (an area's left or top), else its highest:
  // an area may grow by the merge, never shrink, so a merge never cuts into the boxes at its edge.
  // cap: a cluster spans less than MINC (no chain, so a top edge never creeps far up).
  // keep: lows that may not move down (a label's top).
  const lines2 = (lo, hi, cap = false, keep = new Set()) => { const all = [...lo.map(v => [v, 1]), ...hi.map(v => [v, 0])].sort((a, b) => a[0] - b[0]), o = [];
    for (let i = 0; i < all.length;) { let j = i; while (j + 1 < all.length && all[j + 1][0] - all[j][0] < MINC && (!cap || all[j + 1][0] - all[i][0] < cap)) j++;
      const g = all.slice(i, j + 1), lows = g.filter(t => t[1]);
      // (cap: tops meet a little under the highest, up to 12 px, so that none creeps far up and a name tab still fits above each box)
      o.push(lows.length ? (cap ? Math.min(lows[lows.length - 1][0], lows[0][0] + 12, ...lows.filter(t => keep.has(t[0])).map(t => t[0])) : g[0][0]) : g[g.length - 1][0]); i = j + 1; }
    return [...new Set(o)]; };
  const xs = lines2(ar.map(a => a.x0), ar.map(a => a.x1)), ys = lines2(ar.map(a => a.y0), ar.map(a => a.y1), MINC, new Set(ar.filter(a => a.lab).map(a => a.y0)));
  // Two boxes of different compartments side by side (or one above the other) with no line between them would share a
  // cell: a line goes in the middle of the gap between them.
  const bb = boxes.map(b => ({ z: b.z, r: b.box || b.r }));
  for (const [A, B] of bb.flatMap((a, i) => bb.slice(i + 1).map(b => [a, b]))) { if (A.z === B.z) continue;
    const [p, q] = A.r.x <= B.r.x ? [A.r, B.r] : [B.r, A.r], [u, v] = A.r.y <= B.r.y ? [A.r, B.r] : [B.r, A.r];
    const rowsMeet = p.y < q.y + q.h && q.y < p.y + p.h, colsMeet = u.x < v.x + v.w && v.x < u.x + u.w;
    if (rowsMeet && q.x >= p.x + p.w && !xs.some(x => x >= p.x + p.w && x <= q.x)) xs.push((p.x + p.w + q.x) / 2);
    if (colsMeet && v.y >= u.y + u.h && !ys.some(y => y >= u.y + u.h && y <= v.y)) ys.push((u.y + u.h + v.y) / 2);
  }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b); const W = xs.length - 1, H = ys.length - 1;
  const near = (v, arr) => arr.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), arr[0]); // an edge merged away goes to the line that kept it
  ar.forEach(a => { a.x0 = near(a.x0, xs); a.x1 = near(a.x1, xs); a.y0 = near(a.y0, ys); a.y1 = near(a.y1, ys); });
  const zs = [...new Set(ar.map(a => a.z))], own = new Int16Array(W * H).fill(-1), held = new Uint8Array(W * H), best = new Float64Array(W * H).fill(Infinity);
  // Of the areas covering a cell, the compartment with a box nearest it (between pathways, each keeps the space around
  // its own boxes; a small compartment inside a big one keeps its middle)...
  const cover = Array.from({ length: W * H }, () => null), zb = zs.map(z => boxes.filter(b => b.z === z).map(b => b.r));
  const prio = new Int16Array(W * H).fill(-1); // (a priority area, a label that must stay in its compartment, takes its cells outright)
  for (const a of ar) { const zi = zs.indexOf(a.z), i0 = xs.indexOf(a.x0), i1 = xs.indexOf(a.x1), j0 = ys.indexOf(a.y0), j1 = ys.indexOf(a.y1);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const n = j * W + i; (cover[n] = cover[n] || new Set()).add(zi); if (a.prio) prio[n] = zi; } }
  const dist = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
  for (let n = 0; n < W * H; n++) { const c = cover[n]; if (!c) continue; if (prio[n] >= 0) { own[n] = prio[n]; continue; } if (c.size === 1) { own[n] = [...c][0]; continue; }
    const i = n % W, j = (n - i) / W, cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    for (const zi of c) { const d = Math.min(...zb[zi].map(r => dist(cx, cy, r))); if (d < best[n]) { best[n] = d; own[n] = zi; } } }
  // ...unless a compartment's own box is there: every cell the box (with a margin) reaches into is its compartment's,
  // even one no area covers (merged grid lines can leave a box's edge outside its own area).
  for (const b of boxes) { const zi = zs.indexOf(b.z); if (zi < 0) continue; const r = b.box || b.r;
    for (let j = 0; j < H; j++) { if (ys[j + 1] <= r.y || ys[j] >= r.y + r.h) continue;
      for (let i = 0; i < W; i++) if (xs[i + 1] > r.x && xs[i] < r.x + r.w) { own[j * W + i] = zi; held[j * W + i] = 1; } } }
  // A ledge: a strip of a compartment thinner than a corner needs (a row or column under MINC) that sticks out past the
  // rest of its edge, so the outline steps by too little to round. It goes, unless a box holds it.
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : own[j * W + i]);
  for (let pass = 0; pass < 3; pass++) for (const [n, L, step] of [[H, ys, (i, j) => [i, j]], [W, xs, (j, i) => [i, j]]]) {
    const m = n === H ? W : H;
    for (let j = 0; j < n; j++) { if (L[j + 1] - L[j] >= MINC) continue;
      for (let i = 0; i < m; i++) { const [x, y] = step(i, j), z = at(x, y); if (z < 0 || held[y * W + x]) continue;
        const [xa, ya] = step(i, j - 1), [xb, yb] = step(i, j + 1), up = at(xa, ya), dn = at(xb, yb);
        if ((up === z) === (dn === z)) continue; // inside the piece, or a thin piece of its own
        const side = k => { const [xs1, ys1] = step(i + k, j), [xn, yn] = up === z ? step(i + k, j - 1) : step(i + k, j + 1); return at(xs1, ys1) !== z && at(xn, yn) === z; };
        if (side(-1) || side(1)) own[y * W + x] = -1; } } }
  // Holes: empty cells shut in on all sides (a ring's middle, a gap pieces close around) go to the compartment around
  // most of their rim (at least 60% of it, by length), unless something in no compartment sits there.
  const hseen = new Uint8Array(W * H);
  for (let n0 = 0; n0 < W * H; n0++) { if (own[n0] >= 0 || hseen[n0]) continue;
    const cells = [], stack = [n0], rim = new Map(); let open = false; hseen[n0] = 1;
    while (stack.length) { const n = stack.pop(), i = n % W, j = (n - i) / W; cells.push(n);
      if (keepOut.some(r => xs[i + 1] > r.x && xs[i] < r.x + r.w && ys[j + 1] > r.y && ys[j] < r.y + r.h)) open = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) { open = true; continue; }
        const m = b * W + a; if (own[m] >= 0) { const L = di ? ys[j + 1] - ys[j] : xs[i + 1] - xs[i]; rim.set(own[m], (rim.get(own[m]) || 0) + L); } else if (!hseen[m]) { hseen[m] = 1; stack.push(m); } } }
    const tot = [...rim.values()].reduce((a, b) => a + b, 0), [z, L] = [...rim].sort((a, b) => b[1] - a[1])[0] || [];
    if (!open && tot && L >= 0.6 * tot) cells.forEach(n => { own[n] = z; }); }
  // Pieces: connected cells of one compartment; their outlines, traced with the piece on the right (y down).
  const seen = new Uint8Array(W * H), corners = [], pieces = [];
  for (let n0 = 0; n0 < W * H; n0++) {
    if (own[n0] < 0 || seen[n0]) continue;
    const zi = own[n0], cells = [], stack = [n0]; seen[n0] = 1;
    while (stack.length) { const n = stack.pop(), i = n % W, j = (n - i) / W; cells.push(n);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj, m = b * W + a; if (a >= 0 && b >= 0 && a < W && b < H && !seen[m] && own[m] === zi) { seen[m] = 1; stack.push(m); } } }
    const inP = new Set(cells), edges = new Map(), key = (x, y) => x + ',' + y, add = (p, q) => edges.set(key(...p), [...(edges.get(key(...p)) || []), q]);
    for (const n of cells) { const i = n % W, j = (n - i) / W, a = [xs[i], ys[j]], b = [xs[i + 1], ys[j]], c = [xs[i + 1], ys[j + 1]], d = [xs[i], ys[j + 1]];
      if (!(j > 0 && inP.has(n - W))) add(a, b); if (!(i < W - 1 && inP.has(n + 1))) add(b, c); if (!(j < H - 1 && inP.has(n + W))) add(c, d); if (!(i > 0 && inP.has(n - 1))) add(d, a); }
    const loops = [];
    while (edges.size) { const [k0] = edges.keys(); let p = k0.split(',').map(Number); const loop = [p];
      for (let s = 0; s < 100000; s++) { const o = edges.get(key(...p)); if (!o?.length) break; const q = o.shift(); if (!o.length) edges.delete(key(...p)); if (key(...q) === k0) break; loop.push(q); p = q; }
      edges.delete(k0);
      const pts = loop.filter((v, i) => { const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length]; return !((a[0] === v[0] && v[0] === b[0]) || (a[1] === v[1] && v[1] === b[1])); });
      if (pts.length < 4) continue;
      // Pulled in by h: each vertex moves along both of its edges' inward normals (right of travel, y down).
      const unit = (p, q) => { const dx = Math.sign(q[0] - p[0]), dy = Math.sign(q[1] - p[1]); return [dx, dy]; };
      const vs = pts.map((v, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length], [ax, ay] = unit(a, v), [bx, by] = unit(v, b);
        return [v[0] + h * (-ay) + h * (-by), v[1] + h * ax + h * bx]; });
      const li = loops.length; loops.push(vs);
      vs.forEach((v, i) => { const a = vs[(i - 1 + vs.length) % vs.length], b = vs[(i + 1) % vs.length], la = Math.hypot(v[0] - a[0], v[1] - a[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
        const inner = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]) < 0, u = [Math.sign(a[0] - v[0]) + Math.sign(b[0] - v[0]), Math.sign(a[1] - v[1]) + Math.sign(b[1] - v[1])];
        corners.push({ piece: pieces.length, loop: li, i, v, inner, u, cap: Math.min(la, lb) / 2, r: Math.min(inner ? R + GAP : R, la / 2, lb / 2) }); });
    }
    const runs = []; // each row's stretches of the piece, pulled in like the outline
    for (let j = 0; j < H; j++) { let i = 0; while (i < W) { if (!inP.has(j * W + i)) { i++; continue; } let e = i; while (e + 1 < W && inP.has(j * W + e + 1)) e++; runs.push({ x: xs[i] + h, y: ys[j] + h, w: xs[e + 1] - xs[i] - 2 * h, h: ys[j + 1] - ys[j] - 2 * h }); i = e + 1; } }
    const bx = runs.reduce((b, r) => ({ x: Math.min(b.x, r.x), y: Math.min(b.y, r.y), X: Math.max(b.X, r.x + r.w), Y: Math.max(b.Y, r.y + r.h) }), { x: Infinity, y: Infinity, X: -Infinity, Y: -Infinity });
    pieces.push({ z: zs[zi], loops, runs, bbox: { x: bx.x, y: bx.y, w: bx.X - bx.x, h: bx.Y - bx.y } });
  }
  // Concentric pairs: an inside corner and the outside corner of another piece it wraps (that one's corner sits the gap
  // away along the diagonal). Radii agree: inside = outside + gap, within what each one's edges allow.
  const byV = new Map(corners.filter(c => !c.inner).map(c => [Math.round(c.v[0]) + ',' + Math.round(c.v[1]), c]));
  for (const c of corners) { if (!c.inner) continue;
    const o = byV.get(Math.round(c.v[0] + GAP * Math.sign(c.u[0])) + ',' + Math.round(c.v[1] + GAP * Math.sign(c.u[1]))); if (!o || o.piece === c.piece) continue;
    const r = Math.min(c.cap, o.cap + GAP, R + GAP); c.r = r; o.r = Math.max(0, r - GAP); }
  for (const P of pieces) {
    let d = '';
    P.loops.forEach((vs, li) => { const cs = corners.filter(c => c.piece === pieces.indexOf(P) && c.loop === li);
      cs.forEach(({ v, r }, i) => { const a = vs[(i - 1 + vs.length) % vs.length], b = vs[(i + 1) % vs.length], la = Math.hypot(v[0] - a[0], v[1] - a[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
        const p1 = [v[0] - (v[0] - a[0]) / la * r, v[1] - (v[1] - a[1]) / la * r], p2 = [v[0] + (b[0] - v[0]) / lb * r, v[1] + (b[1] - v[1]) / lb * r];
        d += `${i ? 'L' : 'M'}${+p1[0].toFixed(2)},${+p1[1].toFixed(2)} Q${+v[0].toFixed(2)},${+v[1].toFixed(2)} ${+p2[0].toFixed(2)},${+p2[1].toFixed(2)} `; });
      d += 'Z '; });
    (out[P.z] = out[P.z] || []).push({ d, runs: P.runs, bbox: P.bbox });
  }
  return out;
}
// A compartment's bounding box with the other compartments cut out (each with a margin), never its own boxes: the
// cells left over, for unionPath to outline as one puzzle piece.
function boxMinus(b, own, obs, gap = REGION_GAP) {
  let cut = obs.map(o => ({ x: o.x - gap, y: o.y - gap, w: o.w + 2 * gap, h: o.h + 2 * gap }));
  // Cut-outs that touch become one (their bounding box), so the notch is one clean step, not a staircase of ledges.
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < cut.length && !merged; i++) for (let j = i + 1; j < cut.length && !merged; j++) {
      const a = cut[i], c = cut[j];
      if (a.x < c.x + c.w + 8 && c.x < a.x + a.w + 8 && a.y < c.y + c.h + 8 && c.y < a.y + a.h + 8) {
        const x = Math.min(a.x, c.x), y = Math.min(a.y, c.y);
        cut[i] = { x, y, w: Math.max(a.x + a.w, c.x + c.w) - x, h: Math.max(a.y + a.h, c.y + c.h) - y }; cut.splice(j, 1); merged = true;
      }
    }
  }
  const xs = [...new Set([b.x, b.x + b.w, ...cut.flatMap(o => [o.x, o.x + o.w]), ...own.flatMap(o => [o.x, o.x + o.w])].filter(x => x >= b.x && x <= b.x + b.w))].sort((p, q) => p - q);
  const ys = [...new Set([b.y, b.y + b.h, ...cut.flatMap(o => [o.y, o.y + o.h]), ...own.flatMap(o => [o.y, o.y + o.h])].filter(y => y >= b.y && y <= b.y + b.h))].sort((p, q) => p - q);
  // A cut-out that reaches into the region's own pieces is trimmed back on the side that loses least, so the notch stays
  // one clean rectangle instead of leaving a ledge where the two overlap.
  for (const c of cut) for (const o of own) {
    if (!(c.x < o.x + o.w && o.x < c.x + c.w && c.y < o.y + o.h && o.y < c.y + c.h)) continue;
    const opts = [{ ...c, h: o.y - c.y }, { ...c, y: o.y + o.h, h: c.y + c.h - o.y - o.h }, { ...c, w: o.x - c.x }, { ...c, x: o.x + o.w, w: c.x + c.w - o.x - o.w }].filter(t => t.w > 0 && t.h > 0);
    const best = opts.sort((p, q) => q.w * q.h - p.w * p.h)[0] || { ...c, w: 0, h: 0 };
    Object.assign(c, best);
  }
  cut = cut.filter(c => c.w > 0 && c.h > 0);
  const inside = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h, cells = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (own.some(r => inside(r, cx, cy)) || !cut.some(r => inside(r, cx, cy))) cells.push({ x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] });
  }
  return cells;
}
function clusterRects(rects) {
  const out = [];
  rects.slice().sort((a, b) => a.y - b.y).forEach(r => {
    const c = out.find(o => r.y <= o.y + o.h + 30 && r.x < o.x + o.w + 30 && o.x < r.x + r.w + 30);
    if (!c) return out.push({ ...r });
    const x1 = Math.max(c.x + c.w, r.x + r.w), y1 = Math.max(c.y + c.h, r.y + r.h);
    c.x = Math.min(c.x, r.x); c.y = Math.min(c.y, r.y); c.w = x1 - c.x; c.h = y1 - c.y;
  });
  return out;
}
// A compartment's label: plain text, a blank to fill, or the answer field itself (only once per drawing).
let ZONE_INLINE_DONE = false;
function zoneLabel(m, statusOf, key, x, y, anchor = 'middle', fallback = '') {
  const item = m.items['z:' + key];
  if (!item) return fallback ? `<text class="zonet" x="${x}" y="${y}" text-anchor="${anchor}">${esc(fallback)}</text>` : '';
  const st = statusOf(item.key);
  if (st === 'hide') return '';
  if (hidden(st)) {
    if (st === 'target' && INLINE && !ZONE_INLINE_DONE) {
      ZONE_INLINE_DONE = true;
      const w = Math.max(200, INLINE.along ? INLINE.along.length * 8 + 28 : 0), rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
      return `<g class="elab target"><rect x="${rx}" y="${y - 20}" width="${w}" height="30" rx="15"/></g>` + inlineField(rx + 4, y - 17, w - 8, 24);
    }
    const w = pillW('compartment'), rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
    return `<g class="elab zone-blank ${st}" data-key="${item.key}"><rect x="${rx}" y="${y - 17}" width="${w}" height="24" rx="4"/>${blankText(rx + w / 2, y - 5, 'compartment')}</g>`;
  }
  // The mark sits clear of the label: uppercase, letter-spaced text runs about 9 px a letter.
  const mx = anchor === 'end' ? x + 14 : x - 14 - (anchor === 'middle' ? item.name.length * 4.6 : 0);
  const mark = st === 'right' ? svgIcon(mx, y - 4, 'ok') : st === 'missed' ? svgIcon(mx, y - 4, 'no') : '';
  return `<text class="zonet" data-key="${item.key}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(item.name)}</text>${mark}`;
}
function linearSVG(m, statusOf, { zones = true, tabRoom = false } = {}) {
  const { p, items, spine, spineMets, branches, onSpine } = m;
  // Side steps between two main-line metabolites (gluconeogenic bypasses in a combined view) curve out to the right.
  const bypass = branches.filter(b => onSpine.has(b.from) && onSpine.has(b.to));
  const L = zones ? computeLanes(m) : { list: [], laneOf: {} };
  const lanesOn = L.list.length > 1, oneZone = !lanesOn && L.list.length === 1 && !!m.items['z:' + L.list[0].key];
  // Which lane a side metabolite belongs in: the compartment of the step that makes or uses it.
  const zoneOfR = r => (r && r.loc ? zoneKey(m, r.loc, r.tissue) : '');
  const stepOf = id => spine.find(x => (x.also_to || []).includes(id) || (x.also_from || []).includes(id)) || branches.find(b => b.to === id || b.from === id);
  const last = Math.max(0, L.list.length - 1);
  const sideLane = id => { const r = stepOf(id); if (!lanesOn || !r || r.transport) return -1; const i = L.list.findIndex(l => l.key === zoneOfR(r)); return i < last ? i : -1; };
  // Side boxes stack in columns beside their own lane; a lane is widened by the columns it holds, so nothing spills over.
  const laneXs = [CX], cols = {};
  const laneX = i => (lanesOn ? laneXs[i] : CX);
  const laneLeft = i => (i === 0 ? 0 : laneX(i) - LANE_W / 2 + 20);
  const top = TOP + (lanesOn || oneZone ? 26 : 0);
  let pos, perRow, sideX;
  const enters = new Set(); // boxes the main line enters another compartment at (tabRoom)
  const layout = () => {
    for (let i = 1; i <= last; i++) laneXs[i] = laneXs[i - 1] + LANE_W + (cols[i - 1] || 0) * SIDE_STEP;
    sideX = laneX(lanesOn ? last : 0) + SIDE_STEP + (bypass.length ? 190 : 0);
    pos = {}; perRow = {}; const forks = {};
    let yy = top;
    // A step drawn straight down (both boxes in one lane) whose label is taller than the gap (a carrier's pill with its
    // drugs under it) gets the extra room it needs.
    const tall = r => { const it = r && items['e:' + r.id]; if (!it || (lanesOn && (L.laneOf[r.from] || 0) !== (L.laneOf[r.to] || 0))) return 0; return Math.max(0, enzRect(0, 0, 'end', it, 24).h + 16 - GAP); };
    // Drawn as part of a joined drawing (tabRoom): where the main line steps into another compartment, the gap grows so
    // the step's name sits clear above that compartment's top edge, which is where its name tab goes.
    const zw = tabRoom ? { ...tileWhere(p), ...STITCH_WHERE } : {}, zk = id => (zw[id]?.loc ? zw[id].loc + '|' + (zw[id].tissue || '') : '');
    const entering = i => { const e = tabRoom && zk(spineMets[i]) && zk(spineMets[i]) !== zk(spineMets[i - 1]); if (!e) return 0; enters.add(spineMets[i]);
      const it = items['e:' + spine[i - 1]?.id], h = it ? enzRect(0, 0, 'end', it, 24).h : 0; return Math.max(TAB_ROOM, h + TAB_BAND - GAP - tall(spine[i - 1])); }; // (a tall name: as much as it needs)
    spineMets.forEach((id, i) => { if (i) yy += BH + GAP + (spine[i - 1]?.via ? VIA_ROOM : 0) + tall(spine[i - 1]) + entering(i); pos[id] = { x: laneX(L.laneOf[id] || 0), y: yy }; });
    const place = (id, y, stack = 0) => {
      if (pos[id]) return;
      // Many extra inputs into one step (VOMIT → propionyl-CoA) stack in a column beside the line, not a long row.
      if (stack) { pos[id] = { x: sideX, y: y + (stack - 1) * (BH + GAP) }; return; }
      const li = sideLane(id), row = (li >= 0 ? li : 'side') + '|' + y, k = perRow[row] = (perRow[row] || 0) + 1;
      const vx = stepOf(id)?.via ? 170 : 0; // room for a carrier pill as well as the enzyme's name
      // In a lane left of the box it's joined to (acetone in the blood, beside the mitochondria): the lane's own middle.
      const r0 = stepOf(id), mate = r0 && (r0.from === id ? r0.to : r0.from);
      if (li >= 0 && mate in L.laneOf && li < L.laneOf[mate] && !Object.values(pos).some(q => Math.abs(q.y - y) < BH + 8 && Math.abs(q.x - laneX(li)) < BW + 40)) { pos[id] = { x: laneX(li), y }; return; }
      if (li >= 0) { cols[li] = Math.max(cols[li] || 0, k); pos[id] = { x: laneX(li) + k * SIDE_STEP + vx, y }; return; }
      pos[id] = { x: sideX + (k - 1) * SIDE_STEP + vx, y };
    };
    spine.forEach(r => { (r.also_to || []).forEach(x => place(x, pos[r.to].y)); (r.also_from || []).forEach((x, i, all) => place(x, pos[r.from].y, all.length >= 3 ? i + 1 : 0)); });
    // A second branch out of the same box (IMP → AMP and IMP → GMP) starts a row lower, so the two arms never cross.
    const fork = (anchor, id) => {
      if (pos[id]) return;
      const n = forks[anchor] = (forks[anchor] || 0) + 1, y = pos[anchor].y + (n - 1) * (BH + GAP);
      // Off the last box of the main line, the second arm simply continues straight down.
      if (n > 1 && anchor === spineMets[spineMets.length - 1]) { pos[id] = { x: pos[anchor].x, y }; return; }
      // A chain of side steps (UDP → dUDP → dUTP → dUMP → dTMP) runs down its own column, not off sideways in a row.
      if (n === 1 && !onSpine.has(anchor)) {
        const below = { x: pos[anchor].x, y: pos[anchor].y + BH + GAP };
        if (!Object.values(pos).some(q => q.x === below.x && Math.abs(q.y - below.y) < BH + GAP)) { pos[id] = below; return; }
      }
      place(id, y);
    };
    for (let pass = 0; pass < 3; pass++) branches.forEach(b => {
      if (pos[b.from] && !pos[b.to]) fork(b.from, b.to);
      else if (pos[b.to] && !pos[b.from]) fork(b.to, b.from);
    });
  };
  layout(); // counts the columns each lane needs
  if (Object.keys(cols).length) layout(); // then lays out again with the lanes widened
  const ctr = id => ({ cx: pos[id].x, cy: pos[id].y + BH / 2 });
  if (lanesOn) for (let i = 1; i <= last; i++) VIA_X.push(laneLeft(i));
  DRAW_BOXES = Object.values(pos).map(q => ({ x: q.x - BW / 2, y: q.y, w: BW, h: BH })); DRAW_LABELS = [];
  const xs = Object.values(pos).map(q => q.x);
  let W = Math.max(Math.max(...xs) + BW / 2 + (Object.keys(perRow).some(k => k.startsWith('side|')) ? 12 : 190), bypass.length ? Math.max(...xs) + BW / 2 + 330 : 0);
  const bottom = Math.max(top + spineMets.length * (BH + GAP) - GAP, ...Object.values(pos).map(q => q.y + BH));
  // A sideways step on the last row writes its cofactors underneath: leave room for two lines.
  let H = bottom + 14 + (Object.entries(pos).some(([id, q]) => !onSpine.has(id) && q.y + BH === bottom) ? 34 : 0);
  let s = '', bg = '', fg = ''; // fg: region name tabs, drawn over the arrows
  // Side steps in another compartment (e.g. pyruvate carboxylase in the mitochondria) get a dashed, labeled region.
  const sideRects = {}, zoneNames = {};
  const zoneName = k => m.items['z:' + k]?.name || zoneNames[k] || '';
  const laneKeyAt = x => { if (!lanesOn) return L.list[0]?.key; let i = 0; while (i < last && x >= laneLeft(i + 1)) i++; return L.list[i].key; };
  const addRect = (k, rect) => { if (zones && k && zoneName(k) && k !== laneKeyAt(rect.x + rect.w / 2)) (sideRects[k] = sideRects[k] || []).push(rect); };
  // A side box with its own location (acetoacetate in the blood) sits in that compartment, whatever step made it.
  const ownZone = (id, r) => { const x = p.metabolites[id]; if (!x?.loc) return zoneOfR(r); const k = zoneKey(m, x.loc, x.tissue || r?.tissue); zoneNames[k] = zoneNames[k] || x.loc; return k; };
  const onLine = new Set(spineMets), membranes = [];
  for (const [id, pt] of Object.entries(pos)) {
    if (onLine.has(id)) continue;
    const r = stepOf(id);
    if (r?.transport) {
      // Across a membrane: the metabolite on the far side sits in its own dashed box, named for its compartment.
      addRect(ownZone(id, r), { x: pt.x - BW / 2 - 16, y: pt.y - 16, w: BW + 32, h: BH + 30 });
      continue;
    }
    addRect(ownZone(id, r), { x: pt.x - BW / 2 - 12, y: pt.y - 22, w: BW + 24, h: BH + 42 });
    // The step's own label (its enzyme) is in that compartment too.
    const other = r && pos[r.from === id ? r.to : r.from];
    // With lanes on, a step out to a box in its own compartment's lane needs no patch: the lane already says where.
    if (lanesOn && r && laneKeyAt(pt.x) === zoneOfR(r)) continue;
    if (other && Math.abs(other.y - pt.y) < 4) { const g0 = Math.min(pt.x, other.x) + BW / 2, g1 = Math.max(pt.x, other.x) - BW / 2; addRect(zoneOfR(r), { x: g0 + 40, y: pt.y - 22, w: g1 - g0 - 40, h: BH + 42 }); }
  }
  bypass.forEach((r, k) => {
    const a = ctr(r.from), b = ctr(r.to), x0 = Math.max(a.cx, b.cx) + BW / 2 + 6, xc = x0 + 120 + (k % 2) * 10, my = (a.cy + b.cy) / 2;
    addRect(zoneOfR(r), { x: xc - 4, y: my - 38, w: 200, h: 84 });
  });
  // A transport straight down the main line (citrate leaving the mitochondria): box the end only this step touches.
  const uses = id => p.reactions.filter(x => x.from === id || x.to === id || (x.also_to || []).includes(id) || (x.also_from || []).includes(id)).length;
  spine.forEach(r => {
    const a = pos[r.from], b = pos[r.to];
    if (!r.transport || !a || !b || a.x !== b.x) return;
    const far = uses(r.from) === 1 ? a : uses(r.to) === 1 ? b : null;
    if (far) addRect(zoneOfR(r), { x: far.x - BW / 2 - 16, y: far.y - 16, w: BW + 32, h: BH + 30, end: true });
  });
  // A main-line step that happens somewhere other than the boxes around it (DHODH on the inner mitochondrial
  // membrane, between two cytosolic metabolites) names its compartment under the enzyme, as cycles do.
  const stepLoc = {};
  spine.forEach(r => {
    const a = pos[r.from], b = pos[r.to], k = zoneOfR(r);
    if (!zones || !a || !b || a.x !== b.x || r.transport || !k || !m.items['z:' + k] || k === laneKeyAt(a.x)) return;
    const zst = statusOf('z:' + k);
    if (zst !== 'hide') { stepLoc[r.id] = [hidden(zst) ? '(compartment?)' : m.items['z:' + k].name]; sideRects[k] = sideRects[k] || []; }
  });
  const clusters = {};
  for (const [k, rects] of Object.entries(sideRects)) clusters[k] = clusterRects(rects);
  // Each region is at least as wide as its name: it grows to the right, or to the left if that would run into another.
  const hits = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
  const all = Object.values(clusters).flat();
  for (const [k, cs] of Object.entries(clusters)) {
    const lw = zoneName(k).length * 8.1 + 44;
    clusters[k] = cs.map(c => {
      if (c.w >= lw) return c;
      const right = { ...c, w: lw }, left = { ...c, x: Math.max(4, c.x + c.w - lw), w: lw }, others = all.filter(o => o !== c);
      return others.some(o => hits(right, o)) && !others.some(o => hits(left, o)) ? left : right;
    });
    for (const c of clusters[k]) { H = Math.max(H, c.y + c.h + 8); W = Math.max(W, c.x + c.w + 8); } // the drawing grows to hold its regions
  }
  const drawn = new Set();
  if (lanesOn) {
    L.list.forEach((l, i) => {
      const x0 = i === 0 ? -BLEED : laneLeft(i), x1 = i === last ? W + BLEED : laneLeft(i + 1);
      bg += `<rect class="zone t-${zoneTone(l.key)}" x="${x0}" y="${-BLEED}" width="${x1 - x0}" height="${H + 2 * BLEED}"/>`;
      // A new tissue is a different cell: solid wall. Same cell, new compartment: dashed membrane.
      if (i > 0) bg += `<line class="${zoneTissue(l.key) !== zoneTissue(L.list[i - 1].key) ? 'cellwall' : 'membrane'}" x1="${x0}" x2="${x0}" y1="${-BLEED}" y2="${H + BLEED}"/>`;
      bg += zoneLabel(m, statusOf, l.key, laneX(i), 18, 'middle', l.label);
      drawn.add(l.key);
    });
  } else if (oneZone) {
    // The whole main line is in one compartment: tint the drawing and name it once, at the top.
    const k = L.list[0].key;
    bg += `<rect class="zone t-${zoneTone(k)}" x="${-BLEED}" y="${-BLEED}" width="${W + 2 * BLEED}" height="${H + 2 * BLEED}"/>` + zoneLabel(m, statusOf, k, 16, 18, 'start');
    drawn.add(k);
  }
  // A region's name sits on its top border, on a small tab at the right end, so the dashed line never runs through it.
  // Placed once everything else is drawn (see the end): on the region's border, at the first corner that covers no label.
  const legendJobs = [], legend = (c, k) => { legendJobs.push([c, k]); return ''; };
  const placeLegends = extra => legendJobs.map(([c, k]) => {
    const name = zoneName(k), tw = name.length * 8.1 + 16, taken = [...DRAW_LABELS, ...DRAW_BOXES, ...extra];
    const spots = [[c.x + c.w - 14 - tw, c.y - 9], [c.x + 14, c.y - 9], [c.x + c.w - 14 - tw, c.y + c.h - 9], [c.x + 14, c.y + c.h - 9], [c.x + (c.w - tw) / 2, c.y - 9]]; // right end first: arrows crowd the left
    const [x0, y0] = spots.find(([x, y]) => !taken.some(o => overlaps({ x, y, w: tw, h: 18 }, o))) || spots[0];
    DRAW_LABELS.push({ x: x0, y: y0, w: tw, h: 18 });
    return `<rect class="legend" x="${x0}" y="${y0}" width="${tw}" height="18" rx="5"/>` + zoneLabel(m, statusOf, k, x0 + 7, y0 + 13, 'start', name);
  }).join('');
  if (zones) {
    for (const [k, cs] of Object.entries(clusters)) {
      cs.forEach(c => { bg += `<rect class="region t-${zoneTone(k)}" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14"/>`; fg += legend(c, k); });
      drawn.add(k);
    }
    // A transport on the main line that crosses into the next lane is named where it crosses.
    spine.forEach(r => {
      const k = zoneOfR(r), a = pos[r.from], b = pos[r.to];
      if (!r.transport || !k || drawn.has(k) || !m.items['z:' + k] || !a || !b || a.x === b.x) return;
      // Same endpoints as the slanted arrow; the name goes just under the arrow, left of the wall.
      const i = Math.max(L.laneOf[r.from] || 0, L.laneOf[r.to] || 0), xm = laneLeft(i), dir = Math.sign(b.x - a.x);
      const p1 = [a.x + dir * 40, a.y + BH + 4], p2 = [b.x - dir * 40, b.y - 4], t = (xm - p1[0]) / (p2[0] - p1[0] || 1);
      bg += zoneLabel(m, statusOf, k, xm - 10 * dir, p1[1] + t * (p2[1] - p1[1]) + 24, dir > 0 ? 'end' : 'start');
      drawn.add(k);
    });
    membranes.forEach(mb => {
      // Crosses the transport arrow next to the outside box; named above that box, clear of the transporter's name.
      bg += `<line class="membrane" x1="${mb.x}" x2="${mb.x}" y1="${mb.top - 16}" y2="${mb.cy + 14}"/>` + zoneLabel(m, statusOf, mb.k, mb.x + 8, mb.top - 6, 'start');
      drawn.add(mb.k);
    });
    // Anything left (a compartment with nothing of its own to draw around) is listed in the top-right corner.
    Object.values(items).filter(it => it.kind === 'loc' && !drawn.has(it.id)).forEach((it, i) => { bg += zoneLabel(m, statusOf, it.id, W - 8, (lanesOn ? 42 : 18) + i * 30, 'end'); }); // below the lane names
  }
  const mult = spine.map((r, i) => (r.multiplier > 1 ? i : -1)).filter(i => i >= 0);
  if (mult.length) {
    const y1 = pos[spine[mult[0]].from].y, y2 = pos[spine[mult[mult.length - 1]].to].y + BH;
    const label = `×${spine[mult[0]].multiplier}${p.multiplier_label ? ' ' + p.multiplier_label : ''}`;
    s += `<path class="mult" d="M30,${y1}H22V${y2}H30"/><text class="multt" transform="translate(16,${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle">${esc(label)}</text>`;
  }
  spine.forEach(r => {
    const y1 = pos[r.from].y + BH, y2 = pos[r.to].y, xa = pos[r.from].x, xb = pos[r.to].x;
    if (xa === xb) {
      const X = xa;
      // A via step: its carrier just below the box it leaves, the enzyme (and cofactors) below that.
      const ya = r.via ? y1 + VIA_ROOM : y1;
      s += arrow(X, y1 + 4, X, y2 - 4, r.reversible, rxCls(r)) + (r.via ? viaPill(m, statusOf, r, [X, y1 + 28]) : '');
      // (Into another compartment, in a joined drawing: centered in the gap above its name tab's band.)
      const yl = enters.has(r.to) ? (ya + y2 - TAB_BAND) / 2 : (ya + y2) / 2;
      s += enzLabel(X - 34, yl, items['e:' + r.id], statusOf('e:' + r.id), 'end', 24, 'center', stepLoc[r.id] || []);
      DRAW_LABELS.push(enzRect(X - 34, yl, 'end', items['e:' + r.id], 24));
      const cs = cofSt(m, statusOf, r);
      if (hidden(cs) || cofVisible(cs)) s += cofArcParts(X, ya, enters.has(r.to) ? y2 - TAB_BAND - 8 : y2, cofParts(m, statusOf, r)); // (its curl stays above the tab band too)
    } else {
      // Crosses a membrane: down, across into the other lane, down (a right angle, not a slant).
      // With a carrier (r.via): across just below the first box, the carrier on the membrane, then the enzyme
      // beside the drop into the other compartment, where it acts.
      const ym = r.via ? y1 + 30 : (y1 + y2) / 2, pts = [[xa, y1 + 4], [xa, ym], [xb, ym], [xb, y2 - 4]];
      // A transport: its carrier pill on the membrane it crosses.
      if (r.transport && !r.via) { const at = viaAt(pts), it = items['e:' + r.id]; DRAW_LABELS.push(enzRect(at[0], at[1], 'middle', it, 22)); s += elbow(pts, r.reversible, rxCls(r)) + enzLabel(at[0], at[1], it, statusOf('e:' + r.id), 'middle', 22, 'center'); }
      else s += elbow(pts, r.reversible, rxCls(r)) + (r.via ? elbowLabels(m, statusOf, r, null, [[xb, ym + 22], [xb, y2 - 4]]) + viaPill(m, statusOf, r, viaAt(pts)) : elbowLabels(m, statusOf, r, [pts[1], pts[2]], null));
    }
    // Extra products/reactants leave from the box's lower-right corner, clear of the cofactor text beside the arrow.
    // Extra products leave the box's side and turn down into theirs (glycogen → limit dextrin).
    for (const sd of r.also_to || []) {
      const t = ctr(sd), a = ctr(r.from), dir = Math.sign(t.cx - a.cx) || 1;
      if (Math.abs(t.cy - a.cy) < 4) s += arrow(a.cx + dir * (BW / 2 + 4), a.cy, t.cx - dir * (BW / 2 + 4), t.cy, r.reversible);
      else s += elbow([[a.cx + dir * (BW / 2 + 4), a.cy], [t.cx, a.cy], [t.cx, t.cy - Math.sign(t.cy - a.cy) * (BH / 2 + 4)]], r.reversible);
    }
    const many = (r.also_from || []).length >= 3;
    if (many) {
      // A stacked column of inputs joins one line that runs up beside them and enters the target from the side.
      const t = ctr(r.to), xr = xb + BW / 2 + 6, srcs = r.also_from.map(ctr), xl = Math.min(...srcs.map(c => c.cx)) - BW / 2 - 6, bus = (xr + xl) / 2;
      const ys = srcs.map(c => c.cy), top = Math.min(t.cy, ...ys), bot = Math.max(t.cy, ...ys);
      srcs.forEach(c => { s += `<path class="ln" d="M${xl},${c.cy}H${bus}"/>`; });
      s += `<path class="ln" d="M${bus},${top}V${bot}"/>` + arrow(bus, t.cy, xr, t.cy, r.reversible);
    } else for (const sd of r.also_from || []) {
      // An extra input drops from its box and turns into the target's side (DMAPP joining IPP → GPP).
      const c = ctr(sd), t = ctr(r.to), dir = Math.sign(c.cx - t.cx) || 1, xe = t.cx + dir * (BW / 2 + 4);
      if (Math.abs(c.cy - t.cy) < 4) s += arrow(c.cx - dir * (BW / 2 + 4), c.cy, xe, t.cy, r.reversible);
      else s += elbow([[c.cx, c.cy + Math.sign(t.cy - c.cy) * (BH / 2 + 4)], [c.cx, t.cy], [xe, t.cy]], r.reversible);
    }
  });
  bypass.forEach((r, k) => {
    const a = ctr(r.from), b = ctr(r.to), x0 = Math.max(a.cx, b.cx) + BW / 2 + 6, xc = x0 + 120 + (k % 2) * 10;
    const curve = (dx, y0, y1) => `M${x0},${y0} C${xc + dx},${y0} ${xc + dx},${y1} ${x0 + 6},${y1}`;
    s += `<path class="${rxCls(r)}" d="${curve(0, a.cy - 6, b.cy + (b.cy > a.cy ? -6 : 6))}"/>` + head(x0, b.cy + (b.cy > a.cy ? -6 : 6), Math.PI);
    if (r.reversible) s += `<path class="${rxCls(r)}" d="${curve(10, a.cy + 6, b.cy)}"/>` + head(x0, a.cy + 6, Math.PI, 8);
    const my = (a.cy + b.cy) / 2, cs = cofSt(m, statusOf, r), ct = cofVisible(cs) ? cofLine(m, statusOf, r) : '';
    s += enzLabel(xc + 12, my, items['e:' + r.id], statusOf('e:' + r.id), 'start', 20, 'center', ct ? [ct] : []);
    if (hidden(cs)) s += cofRow(xc + 12, my + 36, 'start', cofParts(m, statusOf, r));
  });
  branches.filter(b => !bypass.includes(b)).forEach(r => { if (pos[r.from] && pos[r.to]) s += drawEdge(m, statusOf, r, ctr(r.from), ctr(r.to)); });
  for (const [id, pt] of Object.entries(pos)) s += metBox(pt.x, pt.y, items['m:' + id], statusOf('m:' + id));
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.x - BW / 2, y: q.y, w: BW, h: BH }])), undefined, Object.values(clusters).flat());
  fg += placeLegends([...lk.s.matchAll(/<rect class="xtag" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(t => ({ x: +t[1], y: +t[2], w: +t[3], h: +t[4] })));
  DRAW_BOXES = [];
  s += lk.s; W = Math.max(W, lk.maxX + 12, ...DRAW_LABELS.map(l => l.x + l.w + 12));
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} flow diagram">${bg}${s}${fg}</svg>`;
}

// Cycles: metabolites on an ellipse (clockwise from the top; wider than tall, like the boxes) joined by curved arrows.
// Enzymes sit outside with their cofactors beneath; the main compartment is written in the middle, exceptions per step.
function cycleSVG(m, statusOf, { zones = true, rot = 0 } = {}) { // rot: turn the ring (a connected drawing lines a box up with another part)
  const { p, items, spine, spineMets, branches } = m;
  const n = spineMets.length, w = 176;
  // With cofactors to curl off its steps, a ring gets wider, so its short top and bottom arrows have room.
  const cofs = spine.some(r => (r.cofactors?.in || []).length || (r.cofactors?.out || []).length || (r.requires || []).length);
  const RY = Math.max(170, n * (cofs ? 34 : 30)), RX = Math.round(RY * (cofs ? 1.85 : 1.5));
  // An extra input outside the ring (acetyl-CoA into citrate synthase) and whatever feeds it need room above.
  const extraIn = spine.some(r => (r.also_from || []).length), sideCof = branches.some(b => (b.cofactors?.in || []).length + (b.cofactors?.out || []).length + (b.requires || []).length), cx = RX + w / 2 + 300 + (sideCof ? 110 : 0), cy = RY + 190 + (extraIn ? 150 : 0);
  const pt = (t, d = 0) => [cx + (RX + d) * Math.cos(t), cy + (RY + d) * Math.sin(t)];
  const pos = {};
  spineMets.forEach((id, i) => { const t = -Math.PI / 2 + rot + 2 * Math.PI * i / n; const [x, y] = pt(t); pos[id] = { cx: x, cy: y, t }; });
  // A step's extra input sits just outside its arc.
  spine.forEach(r => (r.also_from || []).forEach(id => {
    if (pos[id] || !pos[r.from] || !pos[r.to]) return;
    // Beside the target when it sits on the side of the ring (acetyl-CoA next to citrate); otherwise just outside the arc.
    const tt = pos[r.to].t, c = Math.cos(tt);
    if (Math.abs(c) > 0.5) { pos[id] = { cx: pos[r.to].cx + Math.sign(c) * (w + 110), cy: pos[r.to].cy, t: tt, side: true }; return; }
    let a = pos[r.from].t, b = tt; if (b <= a) b += 2 * Math.PI;
    const tm = (a + b) / 2, [x, y] = pt(tm, 150); pos[id] = { cx: x, cy: y, t: tm, side: true };
  }));
  // Side boxes stand straight out from the ring; a chain beyond them runs down (or up, for what feeds them) in a column.
  for (let pass = 0; pass < 3; pass++) branches.forEach(b => {
    const [sp, sd] = pos[b.from] ? [b.from, b.to] : [b.to, b.from];
    if (!pos[sp] || pos[sd]) return;
    if (!pos[sp].side) {
      // Off a box at the side of the ring: straight sideways, a full box-width clear. Off the top or bottom: straight out.
      const t = pos[sp].t, c = Math.cos(t);
      if (Math.abs(c) > 0.7) { const cof = (b.cofactors?.in || []).length + (b.cofactors?.out || []).length + (b.requires || []).length; pos[sd] = { cx: pos[sp].cx + Math.sign(c) * (w + 110 + (cof ? 90 : 0)), cy: pos[sp].cy, t, side: true }; return; } // cofactors need the room under the arrow
      const [x, y] = pt(t, 170); pos[sd] = { cx: x, cy: y, t, side: true }; return;
    }
    const up = b.to === sp; // sd feeds sp: it goes above
    // Room for the step's label between them: name, tags and what it needs.
    const lines = wrap(items['e:' + b.id]?.name || '', 18).length + (b.tags || []).filter(t => t !== 'irreversible').length;
    pos[sd] = { cx: pos[sp].cx, cy: pos[sp].cy + (up ? -1 : 1) * (BH + Math.max(70, lines * 15 + 24) + (b.via ? VIA_ROOM + 60 : 0) + ((b.cofactors?.in || []).length + (b.cofactors?.out || []).length + (b.requires || []).length ? 36 : 0)), t: pos[sp].t, side: true };
  });
  // A box left without a place (its step to the ring went to another part of a joined drawing), or two that landed on
  // each other: moved along, below the ring, to the first spot that's clear of every other box.
  const clearOf = (id, q) => !Object.entries(pos).some(([k, o]) => k !== id && Math.abs(o.cx - q.cx) < w + 40 && Math.abs(o.cy - q.cy) < BH + 50);
  for (const id of Object.keys(p.metabolites)) {
    if (pos[id] && clearOf(id, pos[id])) continue;
    const at = pos[id] || { cx, cy: cy + RY + BH + 90, t: Math.PI / 2, side: true };
    for (let k = 0; k < 40; k++) { const q = { ...at, cy: at.cy + Math.floor(k / 4) * (BH + 70), cx: at.cx + [0, 1, -1, 2][k % 4] * (w + 60) }; if (clearOf(id, q)) { pos[id] = q; break; } }
  }
  DRAW_BOXES = Object.values(pos).map(q => ({ x: q.cx - w / 2, y: q.cy - BH / 2, w, h: BH })); DRAW_LABELS = [];
  // Parameter-space half-width of a box along the ellipse, so arcs start and stop at the box edge.
  const speed = t => Math.hypot(RX * Math.sin(t), RY * Math.cos(t));
  // Along the ring's direction there, the box edge is as far as the nearer of its side and its top/bottom.
  const ext = t => { const L = speed(t), ux = Math.abs(RX * Math.sin(t) / L), uy = Math.abs(RY * Math.cos(t) / L); return (Math.min(ux > 1e-6 ? w / 2 / ux : Infinity, uy > 1e-6 ? BH / 2 / uy : Infinity) + 10) / L; };
  const tangent = t => Math.atan2(RY * Math.cos(t), -RX * Math.sin(t));
  // Where a via step's carrier sits: a third of the way along its arrow from the box it leaves (the membrane crosses there).
  const viaT = r => { const a = pos[r.from].t; let b = pos[r.to].t; if (b <= a) b += 2 * Math.PI; const s1 = a + ext(a), s2 = b - ext(b); return s1 + (s2 - s1) * 0.34; };
  const counts = {};
  spine.forEach(r => { const l = locLabel(m, r); if (l) counts[l] = (counts[l] || 0) + 1; });
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  let s = '';
  const keyOfR = r => zoneKey(m, r.loc, r.tissue);
  const keyCount = {};
  spine.forEach(r => { if (r.loc) keyCount[keyOfR(r)] = (keyCount[keyOfR(r)] || 0) + 1; });
  const mainKey = Object.entries(keyCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (zones && mainKey) s += `<rect class="zone t-${zoneTone(mainKey)}" x="${-BLEED}" y="${-BLEED}" width="${2 * BLEED}" height="${2 * BLEED}"/>` + zoneLabel(m, statusOf, mainKey, cx, cy + 4, 'middle', main);
  // Steps in another compartment get a shaded wedge of the ring, dashed membranes at its edges, and its own label.
  const inRegion = new Set();
  if (zones && mainKey) {
    const runs = [];
    spine.forEach((r, i) => { const k = r.loc ? keyOfR(r) : mainKey; if (k === mainKey) return; const last = runs[runs.length - 1]; if (last && last.k === k && last.end === i - 1) { last.end = i; last.rs.push(r); } else runs.push({ k, start: i, end: i, rs: [r] }); });
    const wedgePt = (t, f, d = 0) => [cx + (RX * f + d) * Math.cos(t), cy + (RY * f + d) * Math.sin(t)];
    runs.forEach(run => {
      run.rs.forEach(r => inRegion.add(r));
      // A run entered or left through a carrier starts or ends at it, not at the box beyond.
      const nx = spine[(run.end + 1) % spine.length], lastTo = run.rs[run.rs.length - 1].to;
      let t1 = run.rs[0].via ? viaT(run.rs[0]) : pos[run.rs[0].from].t, t2 = nx?.via && nx.from === lastTo ? viaT(nx) : pos[lastTo].t; if (t2 <= t1) t2 += 2 * Math.PI;
      const OUT = 150, f = 0.42, large = t2 - t1 > Math.PI ? 1 : 0;
      const [ax, ay] = wedgePt(t1, 1, OUT), [bx, by] = wedgePt(t2, 1, OUT), [cx2, cy2] = wedgePt(t2, f), [dx, dy] = wedgePt(t1, f);
      s += `<path class="zone t-${zoneTone(run.k)}" d="M${ax},${ay} A${RX + OUT},${RY + OUT} 0 ${large} 1 ${bx},${by} L${cx2},${cy2} A${RX * f},${RY * f} 0 ${large} 0 ${dx},${dy} Z"/>`;
      s += `<line class="membrane" x1="${dx}" y1="${dy}" x2="${ax}" y2="${ay}"/><line class="membrane" x1="${cx2}" y1="${cy2}" x2="${bx}" y2="${by}"/>`;
      const tm = (t1 + t2) / 2, co = Math.cos(tm), [lx, ly] = wedgePt(tm, 1, OUT + 18);
      s += zoneLabel(m, statusOf, run.k, lx, ly + 4, co > 0.3 ? 'start' : co < -0.3 ? 'end' : 'middle');
    });
  }
  // A side box in another compartment than the ring's (cytosolic pyruvate beside the TCA cycle): its own patch.
  if (zones && mainKey) for (const [id, q] of Object.entries(pos)) {
    const own = p.metabolites[id]?.loc, k = own && zoneKey(m, own, p.metabolites[id].tissue);
    if (!q.side || !k || k === mainKey) continue;
    s += `<rect class="zone t-${zoneTone(k)}" x="${q.cx - w / 2 - 26}" y="${q.cy - BH / 2 - 38}" width="${w + 52}" height="${BH + 64}" rx="${REGION_R}"/>`
      + `<text class="zonet" x="${q.cx}" y="${q.cy - BH / 2 - 14}" text-anchor="middle">${esc(own)}</text>`;
  }
  let vias = ''; // carrier pills go over the arrows
  CURL_AVOID = spine.filter(r => pos[r.from] && pos[r.to]).flatMap(r => { let a = pos[r.from].t, b = pos[r.to].t; if (b <= a) b += 2 * Math.PI; return Array.from({ length: 25 }, (_, i) => pt(a + (b - a) * i / 24)); });
  const arc = (d, t1, t2, cls) => { const [x1, y1] = pt(t1, d), [x2, y2] = pt(t2, d); return `<path class="${cls}" d="M${x1},${y1} A${RX + d},${RY + d} 0 ${t2 - t1 > Math.PI ? 1 : 0} 1 ${x2},${y2}"/>`; };
  spine.forEach(r => {
    const a = pos[r.from], b = pos[r.to];
    if (!a || !b) return; // an end handed to another part of a connected drawing: that part draws the step
    let t1 = a.t, t2 = b.t; if (t2 <= t1) t2 += 2 * Math.PI;
    const s1 = t1 + ext(t1), s2 = t2 - ext(t2), h2 = 7 / speed(s2), h1 = 7 / speed(s1);
    if (!r.reversible) {
      s += arc(0, s1, s2 - h2, rxCls(r)) + head(...pt(s2), tangent(s2));
    } else {
      s += arc(-4, s1, s2 - h2, rxCls(r)) + head(...pt(s2, -4), tangent(s2), 8);
      s += arc(4, s1 + h1, s2, rxCls(r)) + head(...pt(s1, 4), tangent(s1) + Math.PI, 8);
    }
    const tv = r.via ? viaT(r) : s1, tm = (tv + s2) / 2, co = Math.cos(tm);
    const anchor = co > 0.3 ? 'start' : co < -0.3 ? 'end' : 'middle';
    if (r.via) vias += viaPill(m, statusOf, r, pt(tv));
    // Outside the ring, far enough out that the whole label (a drug list makes it tall) clears the arc.
    const inRing = q => [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h], [q.x + q.w / 2, q.y], [q.x + q.w / 2, q.y + q.h]].some(([x, y]) => ((x - cx) / (RX + 10)) ** 2 + ((y - cy) / (RY + 10)) ** 2 < 1);
    let off = 28 + (anchor === 'middle' ? 16 : 0), [lx, ly0] = pt(tm, off);
    while (off < 240 && inRing(enzRect(lx, ly0, anchor, items['e:' + r.id], 20))) { off += 8; [lx, ly0] = pt(tm, off); }
    const here = locLabel(m, r), zst = m.items['z:' + keyOfR(r)] ? statusOf('z:' + keyOfR(r)) : 'shown';
    const loc = zones && here && here !== main && zst !== 'hide' && !inRegion.has(r) ? [hidden(zst) ? '(compartment?)' : here] : [];
    const es = statusOf('e:' + r.id), it = items['e:' + r.id];
    s += enzLabel(lx, ly0, it, es, anchor, 20, 'center', loc);
    DRAW_LABELS.push(enzRect(lx, ly0, anchor, it, 20));
    // Cofactors curl off the step on the ring's inside, the enzyme's name being outside: inputs join, outputs leave.
    const cs = cofSt(m, statusOf, r);
    if (cs !== 'none' && cs !== 'hide') {
      const tc = r.via ? tv + (s2 - tv) * 0.62 : tm; // past the carrier pill
      const M = pt(tc), d = 0.02, A = pt(tc - d), B = pt(tc + d), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
      let n = [-u[1], u[0]];
      if ((cx - M[0]) * n[0] + (cy - M[1]) * n[1] < 0) n = [-n[0], -n[1]];
      s += cofCurl(M, u, n, cofParts(m, statusOf, r), cx);
    }
  });
  s += vias; CURL_AVOID = [];
  branches.forEach(r => { if (pos[r.from] && pos[r.to]) s += drawEdge(m, statusOf, r, pos[r.from], pos[r.to], w, w); });
  spine.forEach(r => (r.also_from || []).forEach(id => { if (pos[id] && pos[r.to]) { const a = edgePt(pos[id], pos[r.to].cx, pos[r.to].cy, w), b = edgePt(pos[r.to], pos[id].cx, pos[id].cy, w); s += arrow(a[0], a[1], b[0], b[1], false); } }));
  for (const [id, q] of Object.entries(pos)) s += metBox(q.cx, q.cy - BH / 2, items['m:' + id], statusOf('m:' + id), w);
  const xs = Object.values(pos).map(q => q.cx), ys = Object.values(pos).map(q => q.cy);
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.cx - w / 2, y: q.cy - BH / 2, w, h: BH }])), id => (!pos[id].side && Math.abs(Math.sin(pos[id].t)) > 0.9 ? (Math.sin(pos[id].t) < 0 ? 'up' : 'down') : pos[id].cx < cx ? 'left' : 'right'));
  s += lk.s; DRAW_BOXES = [];
  const W = Math.max(cx * 2, Math.max(...xs) + w / 2 + 20, lk.maxX + 12, ...DRAW_LABELS.map(l => l.x + l.w + 12)), H = Math.max(...ys) + BH / 2 + 180;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} cycle diagram">${s}</svg>`;
}

// Grids (steroidogenesis): every metabolite sets pos: [column, row]; optional grid_columns headers.
function gridSVG(m, statusOf, opts = {}) {
  const { p, items } = m, rowBands = p.column_zones?.axis === 'y';
  // Carrier names sit above their arrows and grow upward with the drugs or fed/fasting lines under them: room for those under the band names.
  const pillOn = r => r.transport && items['e:' + r.id] && statusOf('e:' + r.id) !== 'hide'; // a carrier whose pill is drawn (hidden transporters draw none)
  const extra = p.column_zones && !rowBands ? 15 * Math.max(0, ...p.reactions.filter(pillOn).map(r => regLines(items['e:' + r.id]).length + drugLines(items['e:' + r.id]).length)) : 0;
  const COLW = p.grid_colw || (p.column_zones && !rowBands && !p.reactions.some(pillOn) ? BW + 200 : BW + 320), ROWH = BH + 116, X0 = 24 + BW / 2 + (rowBands ? 190 : 130), Y0 = TOP + extra + (rowBands ? 30 : p.column_zones ? 78 : p.grid_columns ? 34 : 0);
  const pos = {};
  // Drawn as part of a joined drawing (opts.tabRoom): a row that a step drops into from another compartment sits lower,
  // so the step's name clears that compartment's top edge, where its name tab goes (as linearSVG does).
  const at0 = id => p.metabolites[id]?.pos || [0, 0], zw = opts.tabRoom ? { ...tileWhere(p), ...STITCH_WHERE } : {}, zk = id => (zw[id]?.loc ? zw[id].loc + '|' + (zw[id].tissue || '') : '');
  TAB_ENTERS = new Set(); TAB_ENTER_TO = new Set();
  const enterRows = new Set(p.reactions.filter(r => opts.tabRoom && p.metabolites[r.from] && p.metabolites[r.to] && at0(r.from)[0] === at0(r.to)[0] && at0(r.to)[1] > at0(r.from)[1] && zk(r.to) && zk(r.to) !== zk(r.from))
    .map(r => (r.via || TAB_ENTERS.add(r.id), TAB_ENTER_TO.add(r.to), at0(r.to)[1]))); // (a carrier's pill holds the middle: its step's name stays put)
  const lower = r => [...enterRows].filter(e => e <= r).length * TAB_ROOM;
  // Compartment columns (a tubular cell): a row only needs the full height above it for a carrier pill on its arrows or a
  // step down into it (name and cofactors beside the run); with neither, as when transporters are hidden, rows close up.
  const rowOf = id => at0(id)[1], tall = new Set();
  if (p.column_zones && !rowBands) for (const r of p.reactions) {
    if (!p.metabolites[r.from] || !p.metabolites[r.to]) continue;
    const a = rowOf(r.from), b = rowOf(r.to);
    if (r.transport ? pillOn(r) : a !== b) for (let k = Math.min(a, b) + (r.transport ? 0 : 1); k <= Math.max(a, b); k++) tall.add(k);
  }
  const rowTop = []; for (let k = 0, y = 0; k <= Math.max(0, ...Object.keys(p.metabolites).map(rowOf)); k++) { rowTop[k] = y; y += !p.column_zones || rowBands || tall.has(k + 1) ? ROWH : BH + 44; }
  const rowY = r => (rowTop[r] ?? r * ROWH);
  // Columns are evenly spaced unless the pathway gives each its own x (p.col_x: a compartment-first joined drawing).
  const colX = c => (p.col_x ? (Number.isInteger(c) ? p.col_x[c] : (p.col_x[Math.floor(c)] + p.col_x[Math.ceil(c)]) / 2) : c * COLW);
  for (const [id, x] of Object.entries(p.metabolites)) { const [c, r] = x.pos || [0, 0]; pos[id] = { cx: X0 + colX(c), cy: Y0 + rowY(r) + lower(r) + BH / 2 }; }
  DRAW_BOXES = Object.values(pos).map(q => ({ x: q.cx - BW / 2, y: q.cy - BH / 2, w: BW, h: BH })); DRAW_LABELS = [];
  let s = '';
  // Column bands (p.column_zones): when each column is one compartment (a tubular cell: lumen | cell | blood), shade
  // the columns, name each band at the top (quizzable like any compartment), and draw the membranes between them.
  // Bands run down columns, or (axis 'y': a cell turned on its side, lumen at the bottom) across rows.
  const bands = [], ax = rowBands ? 1 : 0, at = v => (rowBands ? Y0 + v * ROWH + BH / 2 : X0 + colX(v));
  if (p.column_zones && opts.zones !== false) {
    const byLine = new Map();
    for (const x of Object.values(p.metabolites)) { const c = (x.pos || [0, 0])[ax]; if (x.loc && !byLine.has(c)) byLine.set(c, { k: zoneKey(m, x.loc, x.tissue), loc: x.loc }); }
    for (const c of [...byLine.keys()].sort((a, b) => a - b)) { const z = byLine.get(c), last = bands[bands.length - 1]; if (last && last.k === z.k) last.c1 = c; else bands.push({ ...z, c0: c, c1: c }); }
  }
  bands.forEach((b, i) => {
    const lo = i ? (at(bands[i - 1].c1) + at(b.c0)) / 2 : -BLEED, hi = i < bands.length - 1 ? (at(b.c1) + at(bands[i + 1].c0)) / 2 : BLEED;
    b.x0 = lo; b.x1 = hi;
    s += rowBands ? `<rect class="zone t-${zoneTone(b.k)}" x="${-BLEED}" y="${lo}" width="${2 * BLEED}" height="${hi - lo}"/>` : `<rect class="zone t-${zoneTone(b.k)}" x="${lo}" y="${-BLEED}" width="${hi - lo}" height="${2 * BLEED}"/>`;
    if (i) {
      s += rowBands ? `<line class="cellwall" x1="${-BLEED}" x2="${BLEED}" y1="${lo}" y2="${lo}"/>` : `<line class="cellwall" x1="${lo}" x2="${lo}" y1="${-BLEED}" y2="${BLEED}"/>`;
      (rowBands ? GRID_MEMBRANES_Y : GRID_MEMBRANES).push(lo);
    }
  });
  const membranes = (p.column_zones && p.column_zones.membranes) || [];
  bands.forEach((b, i) => {
    if (rowBands) {
      // Names at the left end of each band; membrane names on their line.
      s += zoneLabel(m, statusOf, b.k, 16, Math.max(b.x0, 0) + 22, 'start', b.loc);
      if (i && membranes[i - 1]) { const t = membranes[i - 1], w = t.length * 7.2 + 14; s += `<rect class="legend" x="12" y="${b.x0 - 9}" width="${w}" height="17" rx="5"/><text class="zonet" x="19" y="${b.x0 + 3}">${esc(t)}</text>`; }
      return;
    }
    s += zoneLabel(m, statusOf, b.k, X0 + (colX(b.c0) + colX(b.c1)) / 2, TOP + 8, 'middle', b.loc);
    if (i && membranes[i - 1]) { const t = membranes[i - 1], w = t.length * 7.2 + 14; s += `<rect class="legend" x="${b.x0 - w / 2}" y="${TOP + 17}" width="${w}" height="17" rx="5"/><text class="zonet" x="${b.x0}" y="${TOP + 29}" text-anchor="middle">${esc(t)}</text>`; }
  });
  (p.grid_columns || []).forEach((label, c) => { s += `<text class="zonet" x="${X0 + c * COLW}" y="${TOP + 8}" text-anchor="middle">${esc(label)}</text>`; });
  // Two one-way steps between the same boxes, in opposite directions (cortisol ⇄ cortisone, two enzymes): side by side.
  const twin = r => p.reactions.find(o => o !== r && o.from === r.to && o.to === r.from);
  // Two enzymes doing the same step (factor X: intrinsic and extrinsic tenase): side by side, or one above the other.
  const pair = r => { const ps = p.reactions.filter(o => o.from === r.from && o.to === r.to); return ps.length === 2 ? ps.indexOf(r) : -1; };
  // Connectors: a box that carries out a step (r.by: thrombin → fibrinogen → fibrin), or inhibits another box
  // (p.inhibits: antithrombin ⊣ thrombin). Hidden while that step's enzyme is a blank.
  const connOn = r => (r.by || []).some(id => pos[id]) && !hidden(statusOf('e:' + r.id)) && statusOf('e:' + r.id) !== 'hide';
  // The line each connected step is drawn as (as its edge function draws it), and where a connector lands: a third along.
  const stepLine = r => {
    const a = pos[r.from], b = pos[r.to], i = pair(r), down = b.cy > a.cy, dx = Math.sign(b.cx - a.cx) || 1;
    if (Math.abs(a.cx - b.cx) < 4) {
      const side = i >= 0 ? (i ? 1 : -1) : twin(r) ? (down ? -1 : 1) : 0, x = a.cx + side * 14;
      return { v: true, p1: [x, a.cy + (down ? 1 : -1) * (BH / 2 + 4)], p2: [x, b.cy - (down ? 1 : -1) * (BH / 2 + 4)] };
    }
    if (Math.abs(a.cy - b.cy) < 4) { const y = a.cy + (i >= 0 ? (i ? 8 : -8) : 0); return { v: false, p1: [a.cx + dx * (BW / 2 + 4), y], p2: [b.cx - dx * (BW / 2 + 4), y] }; }
    return null;
  };
  // Where connectors land: right under (or beside) the acting box when it sits over the step's line, else a third along.
  const landing = r => {
    const L = stepLine(r); if (!L) return null;
    const k = L.v ? 1 : 0, len = L.p2[k] - L.p1[k], at = (r.by || []).map(id => pos[id]).filter(Boolean).map(q => ((L.v ? q.cy : q.cx) - L.p1[k]) / len).find(f => f > 0.15 && f < 0.85);
    return { L, f: at ?? 0.3 };
  };
  const lands = new Map(p.reactions.filter(connOn).map(r => [r.id, landing(r)]).filter(([, x]) => x));
  CONN_STEPS = new Map([...lands].map(([id, x]) => [id, x.f]));
  p.reactions.forEach(r => {
    const a = pos[r.from], b = pos[r.to], i = pair(r);
    if (i >= 0 && Math.abs(a.cx - b.cx) < 4) s += twinEdge(m, statusOf, r, a, b, i ? 1 : -1);
    else if (i >= 0 && Math.abs(a.cy - b.cy) < 4) s += pairEdge(m, statusOf, r, a, b, i);
    else if (twin(r) && Math.abs(a.cy - b.cy) < 4) s += pairEdge(m, statusOf, r, a, b, p.reactions.indexOf(r) < p.reactions.indexOf(twin(r)) ? 0 : 1);
    else s += twin(r) && Math.abs(a.cx - b.cx) < 4 ? twinEdge(m, statusOf, r, a, b) : drawEdge(m, statusOf, r, a, b);
  });
  CONN_LINES = [];
  (p.inhibits || []).forEach(x => { if (pos[x.from] && pos[x.to]) s += connector(pos[x.from], { box: pos[x.to] }, [], 'ln conn inh fx-inh'); });
  p.reactions.filter(r => lands.has(r.id)).forEach(r => {
    const { L, f } = lands.get(r.id), t = [L.p1[0] + (L.p2[0] - L.p1[0]) * f, L.p1[1] + (L.p2[1] - L.p1[1]) * f];
    (r.by || []).forEach(id => { if (pos[id]) s += connector(pos[id], { pt: t, axis: L.v ? 'h' : 'v' }, [r.from, r.to].map(k => pos[k]), 'ln conn fx-act'); });
  });
  // A second input that joins a step (C2b joining C4b): a plain arrow from its box into the product.
  p.reactions.forEach(r => (r.also_from || []).forEach(id => { if (pos[id] && pos[r.to]) s += joinEdge(pos[id], pos[r.to], r); }));
  for (const [id, q] of Object.entries(pos)) s += metBox(q.cx, q.cy - BH / 2, items['m:' + id], statusOf('m:' + id));
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.cx - BW / 2, y: q.cy - BH / 2, w: BW, h: BH }])));
  s += lk.s; DRAW_BOXES = [];
  // Room under the boxes for group frames (up to two deep) before the compartment list.
  // (and for the cofactors under a level step on the bottom row)
  const yMax = Math.max(...Object.values(pos).map(q => q.cy)), lowCof = p.reactions.some(r => pos[r.from]?.cy === yMax && pos[r.to]?.cy === yMax && cofSt(m, statusOf, r) !== 'none' && cofSt(m, statusOf, r) !== 'hide');
  let H = yMax + BH / 2 + 24 + ((p.groups || []).length ? 48 : 0) + (lowCof ? 50 : 0);
  const W = Math.max(Math.max(...Object.values(pos).map(q => q.cx)) + BW / 2 + 24, lk.maxX + 12);
  if (opts.zones !== false && !bands.length) {
    // Grids don't split into lanes, so the compartments are listed underneath (and quizzable there).
    const zs = Object.values(items).filter(it => it.kind === 'loc');
    // In columns wide enough for the longest name, one per line, so long tissue names never run into each other.
    if (zs.length) {
      const colW = Math.max(...zs.map(z => z.name.length)) * 8.6 + 48, ncol = Math.max(1, Math.floor((W - 150) / colW)), rows = Math.ceil(zs.length / ncol);
      s += `<text class="zonet" x="24" y="${H + 6}">Compartments:</text>`;
      zs.forEach((z, i) => { s += zoneLabel(m, statusOf, z.id, 150 + Math.floor(i / rows) * colW, H + 6 + (i % rows) * 28, 'start'); });
      H += rows * 28 + 4;
    }
  }
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} diagram">${s}</svg>`;
}

/* ---------- list view ---------- */
function chip(item, st) {
  const cls = st === 'peek' ? 'shown' : st;
  const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
  const badge = st === 'start' ? '<span class="badge">START</span>' : '';
  if (st === 'target' && INLINE) return `<form class="chip target inl" data-q="0">${inlineInput()}</form>`;
  return `<div class="chip ${cls}">${badge}${hidden(st) ? `<span class="bk">${blankWord(item)}</span>` : esc(item.name)}${ic}</div>`;
}
// What a step needs, in the list: the text, a "needs" blank, or the answer field while it's the one being asked.
function needsPart(r, st, statusOf) {
  if (!(r.requires || []).length || hidden(st)) return '';
  const n = statusOf('n:' + r.id) || 'shown';
  if (n === 'hide') return '';
  if (n === 'target' && INLINE) return `<form class="inl" data-q="0">${inlineInput()}</form>`;
  if (hidden(n)) return `<span class="ename ${n}"><span class="bk">needs</span></span>`;
  return esc(needsText(r));
}
function conn(m, item, st, horiz, statusOf) {
  const r = item.rxn;
  const arr = horiz ? (r.reversible ? '⇌' : '→') : (r.reversible ? '⇅' : '↓');
  const cls = st === 'peek' ? 'shown' : st;
  const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
  const badge = st === 'start' ? '<span class="badge">START</span> ' : '';
  const name = st === 'target' && INLINE ? `<form class="inl" data-q="0">${inlineInput()}</form>` : hidden(st) ? `<span class="bk">${blankWord(item)}</span>` : esc(item.name);
  const rlOk = !m.items['k:' + r.id] || cofVisible(statusOf('k:' + r.id) || 'shown');
  const tags = hidden(st) ? [] : (r.tags || []).filter(t => t !== 'irreversible' && (t !== 'rate-limiting' || rlOk));
  const cs = cofSt(m, statusOf, r), parts = cofParts(m, statusOf, r).filter(p => p.st !== 'hide');
  const mk = st => (st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '');
  // A carrier first (r.via): "across: SLC25A38", a blank, or the answer field.
  const tv = m.items['t:' + r.id], tst = tv && (statusOf(tv.key) || 'shown');
  const across = !tv || tst === 'hide' ? '' : tst === 'target' && INLINE ? `across: <form class="inl" data-q="0">${inlineInput()}</form>`
    : hidden(tst) ? `across: <span class="ename ${tst}"><span class="bk">transporter</span></span>` : 'across: ' + esc(tv.name) + mk(tst);
  const ct = cofVisible(cs) ? esc(cofText(m, r.cofactors)) + mk(cs)
    : hidden(cs) ? parts.map(p => (p.pre && hidden(p.st) ? esc(p.pre) + ' ' : '') + (isLive(p) ? `<form class="inl" data-q="0">${inlineInput()}</form>` : hidden(p.st) ? `<span class="ename ${p.st}"><span class="bk">${cofWord(p, parts.length > 1)}</span></span>` : esc(p.text) + mk(p.st))).join(' → ') : '';
  // Fed vs fasting and drugs, as the drawing shows them under the name: text, a blank, or the answer field.
  const eIt = m.items['e:' + r.id] || item, live = it => `<form class="inl" data-q="0">${inlineInput()}</form>`;
  const extraPart = ([it, s], text, word) => (s === 'target' && INLINE ? live(it) : hidden(s) ? `<span class="ename ${s}" data-key="${it.key}"><span class="bk">${esc(word)}</span></span>` : `<b class="${it.kind === 'drug' ? 'drug' : 'reg'}">${esc(text)}</b>` + mk(s));
  const regs = regLines(eIt).map(([it, s]) => extraPart([it, s], `${it.state === 'fed' ? 'FED' : 'FASTING'}: ${it.name === 'On' ? '▲ ON' : '▽ OFF'}`, it.state === 'fed' ? 'fed: on/off?' : 'fasting: on/off?'));
  const drugs = drugLines(eIt).map(([it, s]) => extraPart([it, s], `${it.drug?.effect === 'activates' ? '⊕' : '⊣'} ${it.name}${it.drug?.kind === 'toxin' ? ' (toxin)' : ''}`, (it.term || 'drug') + '?'));
  const extra = [across, ct, (r.also_to || []).length ? 'splits in two' : '', (r.also_from || []).length ? 'joins two' : '', r.branch ? 'side step' : '', r.transport ? 'transport' : '', ...tags, needsPart(r, st, statusOf), ...regs, ...drugs].filter(Boolean).join(' · ');
  return `<div class="conn${regOff(r) ? ' regoff' : ''}"><span class="arr" aria-label="${r.reversible ? 'reversible' : 'one-way'}">${arr}</span><div class="meta"><span class="ename ${cls}"${/^[et]:/.test(item.key || '') ? ` data-key="${item.key}"` : ''}>${badge}${name} ${ic}</span>${extra ? `<span class="cofs">${extra}</span>` : ''}</div></div>`;
}
function listHTML(m, statusOf, { horiz = false, zones = true, links = false } = {}) {
  DRAW_STATUS = statusOf; DRAW_MODEL = m; // the step extras (fed vs fasting, drugs) read these, as in a drawing
  const parts = m.seq.map(k => {
    const it = m.items[k], st = statusOf(k);
    // Carriers, fed vs fasting and drugs ride on their step; rate-limiting goes on top; a disease is a step to click.
    if (['cof', 'rl', 'regfed', 'regfast', 'drug', 'dis'].includes(it.kind) || it.via) return '';
    if (it.kind === 'twin') return conn(m, it, 'shown', horiz, statusOf);
    let row = '';
    if (it.kind === 'loc') {
      const st = statusOf(k);
      if (!zones || st === 'hide') return '';
      if (st === 'target' && INLINE) return `<form class="locrow inl" data-q="0">${inlineInput()}</form>`;
      const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
      return `<div class="locrow${hidden(st) ? ' blank' : ''}" data-key="${k}">${hidden(st) ? '<span class="bk">compartment</span>' : esc(it.name)} ${ic}</div>`;
    }
    // On a pathway page, a box's links to other pathways follow it, as the drawing's tags do.
    const out = links && it.kind === 'met' && !hidden(st) ? (m.p.links || []).filter(l => l.at === it.id && Library.get(l.to)).map(l => `<a class="xchip" href="#/pathways/${esc(l.to)}">${esc(tagLabel(l))}</a>`).join('') : '';
    return row + listPart(m, it, st, horiz, statusOf) + (out ? `<div class="xchips">${out}</div>` : '');
  });
  // Rate-limiting, while quizzed: a row of its own at the top, as the drawing's strip.
  const rl = Object.values(m.items).filter(it => it.kind === 'rl').map(it => [it, statusOf(it.key) || 'shown']);
  if (rl.length && !rl.every(([, st]) => st === 'shown' || st === 'hide')) parts.unshift(`<div class="locrow">RATE-LIMITING ${rl.map(([it, st]) => chip(it, st)).join(' ')}</div>`);
  if (m.p.circular) parts.push(`<div class="conn"><span class="arr">↺</span><div class="meta"><span class="cofs">back to the start</span></div></div>`);
  return `<div class="list ${horiz ? 'h' : 'v'}">${parts.join('')}</div>`;
}
function listPart(m, it, st, horiz, statusOf) {
  {
    if (it.kind !== 'met' && st === 'hide') return conn(m, { ...it, name: '' }, 'shown', horiz, statusOf);
    return it.kind === 'met' ? chip(it, st) : conn(m, it, st, horiz, statusOf);
  }
}

/* ---------- connected pathways (stitchPathway in store.js) ----------
   Each part is drawn with its own layout (a tile), compartments off. Then:
   - a box the part shares with one already placed (pyruvate) is snapped onto it and drawn once;
   - if snapping would land on the other drawing, the part moves somewhere free and the step into the shared box
     is drawn as an ordinary arrow between the two (β-oxidation's thiolase into the TCA cycle's acetyl-CoA);
   - parts that share no box but name each other (folate's N⁵-methyl-THF → the methionine cycle) are joined by a dotted line;
   - compartments are drawn once for the whole picture: one tinted region per cluster of boxes in the same place. */
function tileWhere(p) {
  const where = {}, rx = p.reactions, has = (r, id) => r.from === id || r.to === id || (r.also_to || []).includes(id) || (r.also_from || []).includes(id);
  for (const id of Object.keys(p.metabolites)) {
    const own = p.metabolites[id].loc;
    if (own) { where[id] = { loc: own, tissue: p.metabolites[id].tissue }; continue; }
    // The main line decides (glucose: hexokinase's cytosol, not glucose-6-phosphatase's ER), then side steps.
    const r = [false, true].map(br => rx.find(r => !!r.branch === br && r.to === id && !r.transport && r.loc) || rx.find(r => !!r.branch === br && r.from === id && !r.transport && !r.via && r.loc)).find(Boolean) || rx.find(r => has(r, id) && !r.transport && !(r.via && r.from === id) && r.loc);
    if (r) where[id] = { loc: r.loc, tissue: r.tissue };
  }
  for (let pass = 0; pass < 4; pass++) for (const r of rx) if (!r.transport && !r.via) {
    if (where[r.from] && !where[r.to]) where[r.to] = where[r.from];
    if (where[r.to] && !where[r.from]) where[r.from] = where[r.to];
  }
  return where;
}
/* Every line of text a drawing put down (compartment and group names, column headers, notes), as rough rectangles, so a
   connected drawing keeps its other parts, tags and name tabs off them, not just off boxes and step labels. */
const SMALL_TEXT = /\b(zonet|tag|startt|multt|xtagt|cofl|bk)\b/;
function textRects(svg) {
  const out = [];
  for (const t of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    if (/<tspan/.test(t[2])) continue; // a box's two-line name: the box is already there
    const a = t[1], num = k => +((a.match(new RegExp(`\\b${k}="([-\\d.]+)"`)) || [])[1]), x = num('x'), y = num('y');
    const txt = t[2].replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, 'x').trim();
    // Turned on its side (a "×2 per glucose" bracket): translate(x,y) rotate(-90), centered on that point.
    const rot = a.match(/translate\(([-\d.]+),([-\d.]+)\) rotate\(-90\)/);
    if (rot && txt) { const L = txt.length * 7.4; out.push({ x: +rot[1] - 11, y: +rot[2] - L / 2, w: 14, h: L }); continue; }
    if (!txt || Number.isNaN(x) || Number.isNaN(y)) continue;
    const small = SMALL_TEXT.test(a), w = txt.length * (small ? 7.4 : 7.2), h = small ? 13 : 16;
    const anchor = (a.match(/text-anchor="(\w+)"/) || [])[1] || 'start', central = /dominant-baseline="central"/.test(a);
    out.push({ x: anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x, y: central ? y - h / 2 : y - h + 3, w, h });
  }
  return out;
}
function renderTile(T, statusOf, drop, keep, rot = 0, chain = false) { // chain: a ring missing some of its boxes is drawn as a chain
  const vkey = [...drop].sort().join(',') + (chain ? '~chain' : '');
  const p = (T.variants = T.variants || {})[vkey] = T.variants[vkey] || (drop.size ? { ...T.p, id: T.p.id + '~' + vkey, ...(chain && T.p.circular && T.p.reactions.some(r => !r.branch && drop.has(r.from)) ? { circular: false } : {}),
    metabolites: Object.fromEntries(Object.entries(T.p.metabolites).filter(([k]) => !drop.has(k))),
    reactions: T.p.reactions.filter(r => !drop.has(r.from) && !drop.has(r.to)).map(r => (r.also_to || r.also_from || []).some(x => drop.has(x))
      ? { ...r, also_to: (r.also_to || []).filter(x => !drop.has(x)), also_from: (r.also_from || []).filter(x => !drop.has(x)) } : r), links: (T.p.links || []).filter(l => !drop.has(l.at)) } : T.p);
  // Letting go of a box can take the main line's steps with it: then its first side step leads (or, with nothing left,
  // the part is drawn whole).
  if (p !== T.p && !p.reactions.some(r => !r.branch)) T.variants[vkey] = p.reactions.length ? { ...p, reactions: p.reactions.map((r, i) => (i ? r : { ...r, branch: false })) } : T.p;
  const sm = modelFor(T.variants[vkey] || p);
  DRAW_POS = {};
  let svg = flowSVG(sm, k => (keep && k === 'm:' + keep ? 'shown' : statusOf(k)), { zones: false, rot, tabRoom: true });
  const pos = DRAW_POS, labels = DRAW_LABELS.slice(), cofs = COF_SPOTS.slice(), steps = { ...STEP_AT }; DRAW_POS = null;
  // Its tags to other pathways ("from β-Oxidation") take room too.
  for (const t of svg.matchAll(/<rect class="xtag" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) labels.push({ x: +t[1], y: +t[2], w: +t[3], h: +t[4] });
  labels.push(...textRects(svg));
  for (const t of svg.matchAll(/<rect class="trnpill" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) labels.push({ x: +t[1], y: +t[2], w: +t[3], h: +t[4] }); // carrier pills, outline and all
  if (keep) { const at = svg.indexOf(`data-key="m:${keep}"`), g0 = svg.lastIndexOf('<g', at), g1 = svg.indexOf('</g>', at); if (at > 0) svg = svg.slice(0, g0) + svg.slice(g1 + 4); }
  const vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
  const keptAt = keep && pos['m:' + keep]; if (keep) delete pos['m:' + keep];
  // Where its lines actually run (arrows, elbows, curls), sampled every 12 px: a joined drawing keeps other parts off them.
  const pts = [], probe = pathProbe();
  for (const pm of svg.matchAll(/<path class="([^"]*)" d="([^"]+)"/g)) { if (/\b(ah|region|xline)\b/.test(pm[1])) continue; probe.setAttribute('d', pm[2]); const L = probe.getTotalLength(); for (let l = 0; l <= L; l += 12) { const q = probe.getPointAtLength(l); pts.push([q.x, q.y]); } }
  for (const lm of svg.matchAll(/<line class="ln[^"]*" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)) { const [x1, y1, x2, y2] = lm.slice(1).map(Number), L = Math.hypot(x2 - x1, y2 - y1); for (let l = 0; l <= L; l += 12) pts.push([x1 + (x2 - x1) * l / (L || 1), y1 + (y2 - y1) * l / (L || 1)]); }
  // Whether it draws cleanly by itself: no line through its own text (bar what sits in a filled pill, a carrier's name
  // or a tag to another pathway, or a box's name, which the box paints over) and no two lines of text on each other. A ring turned to suit a joined drawing
  // is only used when it is.
  const boxes = Object.values(pos), pills = [...svg.matchAll(/<rect class="(?:trnpill|xtag)" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(t => ({ x: +t[1], y: +t[2], w: +t[3], h: +t[4] }));
  const within = (q, r) => { const cx = q.x + q.w / 2, cy = q.y + q.h / 2; return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h; }; // (estimates run wide: its middle is enough)
  const texts = textRects(svg).filter(q => !boxes.some(r => within(q, r)) && !pills.some(r => within(q, r))).map(q => ({ x: q.x + 1, y: q.y + 2, w: q.w - 2, h: q.h - 4 }));
  const dirty = texts.some((q, i) => texts.some((o, j) => j > i && q.x < o.x + o.w && o.x < q.x + q.w && q.y < o.y + o.h && o.y < q.y + q.h)) || pts.some(([x, y]) => texts.some(q => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h));
  return { T, sm, pos, keptAt, drop, keep, rot, labels, cofs, steps, pts, dirty, vb, body: svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')), where: tileWhere(p) };
}
/* ---------- the nephron ----------
   Nephron segments studied together draw as a textbook nephron: one continuous tube (the tubular lumen) from the
   glomerulus along the top (PCT), down into the medulla and back up (loop of Henle), across the top (DCT) and down the
   right (collecting duct). Each segment's own cell diagram sits beside its stretch of tube, turned so its lumen faces
   the tube: on its side above the horizontal stretches, mirrored on the left of the descending limb. */
const NEPHRON_ORIENT = { glomerulus: 'mirror', pct: 'transpose', 'thin-descending': 'mirror', 'thin-ascending': 'normal', tal: 'normal', dct: 'transpose', 'cd-principal': 'normal', 'cd-intercalated': 'normal' };
const NEPHRON_NAMES = { glomerulus: 'Glomerulus', pct: 'Proximal convoluted tubule', 'thin-descending': 'Thin descending limb', 'thin-ascending': 'Thin ascending limb', tal: 'Thick ascending limb', dct: 'Distal convoluted tubule', 'cd-principal': 'Collecting duct: principal cell', 'cd-intercalated': 'Collecting duct: α-intercalated cell' };
function orientTile(p, how) {
  if (how === 'normal') return p;
  const maxC = Math.max(...Object.values(p.metabolites).map(x => (x.pos || [0])[0]));
  const metabolites = Object.fromEntries(Object.entries(p.metabolites).map(([k, x]) => { const [c, r] = x.pos || [0, 0]; return [k, { ...x, pos: how === 'mirror' ? [maxC - c, r] : [r, maxC - c] }]; }));
  const cz = { ...(p.column_zones || {}), membranes: [...((p.column_zones || {}).membranes || [])].reverse(), ...(how === 'transpose' ? { axis: 'y' } : {}) };
  return { ...p, id: p.id + '~' + how, metabolites, column_zones: cz, ...(how === 'transpose' ? { grid_colw: BW + 170 } : {}) };
}
function nephronSVG(m, statusOf) {
  const R = {};
  for (const T of m.p.stitch.tiles) {
    const seg = T.p.nephron.segment;
    T.oriented = T.oriented || orientTile(T.p, NEPHRON_ORIENT[seg] || 'normal');
    const svg = flowSVG(modelFor(T.oriented), statusOf, { zones: true });
    const vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
    R[seg] = { seg, vb, w: vb[2], h: vb[3], body: svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')) };
  }
  DRAW_STATUS = statusOf; DRAW_MODEL = m;
  const sz = k => R[k] || { w: 520, h: 300, missing: true }, TUBE = 76, GAP = 46;
  const G = sz('glomerulus'), P = sz('pct'), D = sz('thin-descending'), A = sz('thin-ascending'), T = sz('tal'), Dc = sz('dct'), Pc = sz('cd-principal'), I = sz('cd-intercalated');
  // Along the top: glomerulus, then the PCT above the tube.
  G.x = 0; P.x = G.w + GAP; P.y = 0;
  const yT = P.h + GAP + TUBE / 2;
  G.y = yT + TUBE / 2 - G.h;
  const xD = P.x + P.w + GAP + TUBE / 2;
  D.x = xD - TUBE / 2 - GAP - D.w; D.y = yT + TUBE / 2 + 2 * GAP;
  const xA = xD + TUBE + 180;
  T.x = A.x = Dc.x = xA + TUBE / 2 + GAP; T.y = yT + TUBE / 2 + 2 * GAP; A.y = T.y + T.h + 2 * GAP;
  Dc.y = yT - TUBE / 2 - GAP - Dc.h;
  const yB = Math.max(D.y + D.h, A.y + A.h) + 2 * GAP + TUBE / 2;
  const xC = Math.max(Dc.x + Dc.w, T.x + T.w, A.x + A.w) + GAP + TUBE / 2;
  Pc.x = I.x = xC + TUBE / 2 + GAP; Pc.y = yT + TUBE / 2 + 2 * GAP; I.y = Pc.y + Pc.h + 2 * GAP;
  const yE = Math.max(I.y + I.h, yB) + 2 * GAP;
  const all = [G, P, D, A, T, Dc, Pc, I];
  const x0 = Math.min(...all.map(r => r.x)) - 140, y0 = Math.min(...all.map(r => r.y), yT - TUBE) - 60;
  const x1 = Math.max(...all.map(r => r.x + r.w), xC + TUBE) + 60, y1 = Math.max(...all.map(r => r.y + r.h), yE) + 60;
  const rr = 60, yCM = yT + TUBE / 2 + GAP; // cortex above, medulla below
  const tube = `M${G.x + G.w},${yT} H${xD - rr} Q${xD},${yT} ${xD},${yT + rr} V${yB - (xA - xD) / 2} A${(xA - xD) / 2},${(xA - xD) / 2} 0 0 0 ${xA},${yB - (xA - xD) / 2} V${yT + rr} Q${xA},${yT} ${xA + rr},${yT} H${xC - rr} Q${xC},${yT} ${xC},${yT + rr} V${yE}`;
  let s = `<defs><linearGradient id="nephMed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="neph-med0"/><stop offset="1" class="neph-med1"/></linearGradient></defs>`;
  s += `<rect class="neph-cortex" x="${x0}" y="${y0}" width="${x1 - x0}" height="${yCM - y0}"/><rect x="${x0}" y="${yCM}" width="${x1 - x0}" height="${y1 - yCM}" fill="url(#nephMed)"/>`;
  s += `<line class="neph-cm" x1="${x0}" x2="${x1}" y1="${yCM}" y2="${yCM}"/><text class="zonet" x="${x0 + 16}" y="${yCM - 10}">Cortex</text><text class="zonet" x="${x0 + 16}" y="${yCM + 22}">Medulla · 300 mOsm</text><text class="zonet" x="${x0 + 16}" y="${y1 - 16}">1200 mOsm</text>`;
  s += `<path class="neph-wall" d="${tube}"/><path class="neph-tube" d="${tube}"/>`;
  s += `<text class="neph-flow" x="${G.x + G.w + 12}" y="${yT + 5}">filtrate →</text><text class="neph-flow" x="${xC + 8}" y="${yE - 12}">urine ↓</text>`;
  // Each segment's cell, framed and named; a segment not in this quiz is just named on its stretch of tube.
  const slots = [];
  for (const r of all) {
    const name = NEPHRON_NAMES[r === G ? 'glomerulus' : r === P ? 'pct' : r === D ? 'thin-descending' : r === A ? 'thin-ascending' : r === T ? 'tal' : r === Dc ? 'dct' : r === Pc ? 'cd-principal' : 'cd-intercalated'];
    if (r.missing) { s += `<text class="neph-missing" x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" text-anchor="middle">${esc(name)}</text>`; continue; }
    const body = r.body.replace(/<rect class="inl-slot" x="([-\d.]+)" y="([-\d.]+)"([^>]*)\/>/g, (_, x, y, rest) => { slots.push(`<rect class="inl-slot" x="${+x - r.vb[0] + r.x - x0}" y="${+y - r.vb[1] + r.y - y0}"${rest} data-moved="1"/>`); return ''; });
    s += `<svg x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" viewBox="${r.vb.join(' ')}" overflow="hidden">${body}</svg>`;
    s += `<rect class="neph-frame" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10"/>`;
    const tw = name.length * 8.6 + 22;
    s += `<rect class="legend" x="${r.x + 12}" y="${r.y - 13}" width="${tw}" height="26" rx="7"/><text class="neph-name" x="${r.x + 23}" y="${r.y + 5}">${esc(name)}</text>`;
  }
  return `<svg class="flow stitched nephron" viewBox="0 0 ${x1 - x0} ${y1 - y0}" role="img" aria-label="${esc(m.p.name)}: nephron diagram"><g transform="translate(${-x0},${-y0})">${s}</g>${slots.join('')}</svg>`;
}
/* Routing on a grid, for the steps and joins between the parts of a joined drawing: the cheapest right-angled path on
   a 20 px grid around the two ends (widening if it must). Boxes are walls; a label can be crossed but costs as much as
   thousands of pixels of detour, so only when there's no other way; each bend costs a little; running along a line already drawn costs
   more (crossing one is fine). The grid starts on a's center, so the path leaves a straight out of its middle.
   Returns center-to-center points (the last inside b), or null. */
function gridRoute(a, b, boxes, labels, drawnSegs = [], linePts = []) { // linePts: the parts' own lines, sampled
  const S = 20, BEND = 3, LABEL = 400, ALONG = 6, ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, same = (r, q) => Math.abs(r.x - q.x) < 1 && Math.abs(r.y - q.y) < 1;
  let best = null; // a path that still crosses a label tries the next, wider window too; the cheaper one wins
  for (const pad of [300, 900, 2400]) {
    const X0 = Math.min(a.x, b.x) - pad, Y0 = Math.min(a.y, b.y) - pad, X1 = Math.max(a.x + a.w, b.x + b.w) + pad, Y1 = Math.max(a.y + a.h, b.y + b.h) + pad;
    const ox = ac.x - Math.ceil((ac.x - X0) / S) * S, oy = ac.y - Math.ceil((ac.y - Y0) / S) * S, W = Math.ceil((X1 - ox) / S) + 1, H = Math.ceil((Y1 - oy) / S) + 1;
    if (W * H > 600000) break; // too big a window: the best found so far
    const cost = new Float32Array(W * H).fill(1), lineH = new Uint8Array(W * H), lineV = new Uint8Array(W * H);
    const cells = (r, infl, f) => { const i0 = Math.max(0, Math.ceil((r.x - infl - ox) / S)), i1 = Math.min(W - 1, Math.floor((r.x + r.w + infl - ox) / S)), j0 = Math.max(0, Math.ceil((r.y - infl - oy) / S)), j1 = Math.min(H - 1, Math.floor((r.y + r.h + infl - oy) / S));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * W + i); };
    for (const r of labels) cells(r, 4, n => { cost[n] += LABEL; }); // even beside its ends (a carrier's pill by its box)
    for (const r of boxes) if (!same(r, a) && !same(r, b)) cells(r, 10, n => { cost[n] = Infinity; });
    const inA = new Uint8Array(W * H); cells(a, 0, n => { cost[n] = 1; inA[n] = 1; }); const goal = new Uint8Array(W * H); cells(b, Math.min(b.w, b.h) < 2 * S ? S / 2 : -2, n => { cost[n] = 1; goal[n] = 1; }); // (a dot smaller than a cell: the cells around it)
    for (const [x, y] of linePts) if (x > X0 && x < X1 && y > Y0 && y < Y1) cells({ x, y, w: 0, h: 0 }, 4, n => { lineH[n] = 1; lineV[n] = 1; }); // along or across one costs a little
    for (const [p, q] of drawnSegs) { const h = Math.abs(p[1] - q[1]) < 1; cells({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) }, 6, n => { (h ? lineH : lineV)[n] = 1; }); }
    const start = Math.round((ac.y - oy) / S) * W + Math.round((ac.x - ox) / S), bc = { i: (b.x + b.w / 2 - ox) / S, j: (b.y + b.h / 2 - oy) / S };
    // A* over (cell, direction); a small binary heap.
    const N = W * H * 4, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), heap = [], hp = [];
    const push = (s, f) => { heap.push(s); hp.push(f); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (hp[p] <= hp[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hp[p], hp[i]] = [hp[i], hp[p]]; i = p; } };
    const pop = () => { const s = heap[0], ls = heap.pop(), lf = hp.pop(); if (heap.length) { heap[0] = ls; hp[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hp[l] < hp[m]) m = l; if (r < heap.length && hp[r] < hp[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } } return s; };
    const hf = n => Math.abs(n % W - bc.i) + Math.abs(Math.floor(n / W) - bc.j);
    for (let d = 0; d < 4; d++) { g[start * 4 + d] = 0; push(start * 4 + d, hf(start)); }
    const DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
    let end = -1, guard = 0;
    while (heap.length && guard++ < 2e6) {
      const s = pop(), n = s >> 2, d = s & 3, gs = g[s];
      if (goal[n] && n !== start) { end = s; break; }
      const i = n % W, j = (n - i) / W;
      for (let e = 0; e < 4; e++) {
        if ((d ^ 1) === e && d >> 1 === e >> 1) continue; // no turning back
        if (inA[n] && n !== start && e !== d) continue; // straight out of its own box (no turning under its name)
        const ni = i + DI[e], nj = j + DJ[e]; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nn = nj * W + ni, c = cost[nn]; if (c === Infinity || (inA[nn] && !inA[n])) continue; // once out of its own box, never back through it
        const ng = gs + c + (e === d ? 0 : BEND) + ((e < 2 ? lineH : lineV)[nn] ? ALONG : 0), t = nn * 4 + e;
        if (ng < g[t]) { g[t] = ng; from[t] = s; push(t, ng + hf(nn)); }
      }
    }
    if (end < 0) continue;
    const path = []; for (let s = end; s >= 0; s = from[s]) path.push(s >> 2); path.reverse();
    const crossed = path.some(n => cost[n] > 1 && cost[n] !== Infinity);
    const pt = n => [ox + (n % W) * S, oy + Math.floor(n / W) * S], pts = [pt(path[0])];
    for (let k = 1; k < path.length; k++) { const p = pts[pts.length - 1], q = pt(path[k]), r = pts.length > 1 ? pts[pts.length - 2] : null;
      if (r && ((r[0] === p[0] && p[0] === q[0]) || (r[1] === p[1] && p[1] === q[1]))) pts[pts.length - 1] = q; else pts.push(q); }
    pts[0] = [ac.x, ac.y];
    if (pts.length < 2) continue;
    if (!best || g[end] < best.cost) best = { pts, cost: g[end] };
    if (!crossed) break;
  }
  return best ? best.pts : null;
}
let STITCH_WHERE = null; // set while a joined drawing is drawn (stitchSVG)
// Compartment-first joined drawings: every compartment is one band across the drawing (stitchSVG). The other way packs
// whole parts and fits a shape around each compartment's boxes afterwards.
let STITCH_BANDS = true, ROUTE_BANDS = null, ROUTE_FLOOR = null, MEMBRANE_SEGS = null, ROUTE_NONAME = false, STITCH_PROF = null; // ROUTE_NONAME: the step's name is drawn elsewhere (a transporter's pill on its membrane) // STITCH_PROF = {}: how long each phase took (ms), for tuning // (the bands while steps between their pieces are labeled)
function stitchSVG(m, statusOf) {
  const st = m.p.stitch, tiles = st.tiles.map(t => ({ ...t, ids: Object.keys(t.p.metabolites) }));
  let pt = performance.now(); const PROF = k => { if (!STITCH_PROF) return; const t = performance.now(); STITCH_PROF[k] = (STITCH_PROF[k] || 0) + Math.round(t - pt); pt = t; };
  const owner = {}; tiles.forEach((t, i) => t.ids.forEach(id => { if (!(id in owner)) owner[id] = i; }));
  // Where each molecule is, as the joined drawing places it (by the first part that has it): a part drawn by itself
  // finds where its line enters another compartment from this, a molecule shared with an earlier part included.
  STITCH_WHERE = {}; tiles.forEach(t => { const w = tileWhere(t.p); for (const id of t.ids) if (!(id in STITCH_WHERE) && w[id]) STITCH_WHERE[id] = w[id]; });
  const G = {}, occ = [], placed = [], bridges = [], dots = [];
  const M = 18, ctr = r => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 });
  const shift = (r, dx, dy) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
  // Boxes keep a wide berth from everything; two labels only need not to touch.
  const rectsOf = (R, dx, dy) => [...Object.values(R.pos).map(r => ({ ...r, box: true })), ...R.labels].map(r => ({ ...shift(r, dx, dy), box: r.box }));
  // (Through the bucket index below: only the things near each rectangle are compared.)
  const clash = (rs, skip) => { index(); return rs.some(r => { for (let i = Math.floor((r.x - M) / B); i <= Math.floor((r.x + r.w + M) / B); i++) for (let j = Math.floor((r.y - M) / B); j <= Math.floor((r.y + r.h + M) / B); j++) {
    const os = XI.rects.get(bucketKey(i, j)); if (os && os.some(o => { if (skip && o.x === skip.x && o.y === skip.y && o.box) return false; const g = r.box || o.box ? M : 3; return r.x < o.x + o.w + g && r.x + r.w > o.x - g && r.y < o.y + o.h + g && r.y + r.h > o.y - g; })) return true; } return false; }); };
  /* Lines against things, both ways, with the drawn geometry: a new part's lines may not run through anything placed,
     and the placed parts' lines may not run through the new part's boxes and labels. A 64-px bucket grid keeps it quick. */
  const B = 64, bucketKey = (i, j) => i * 100003 + j, XI = { rects: new Map(), pts: new Map(), n: -1 };
  const addRect = r => { for (let i = Math.floor(r.x / B); i <= Math.floor((r.x + r.w) / B); i++) for (let j = Math.floor(r.y / B); j <= Math.floor((r.y + r.h) / B); j++) { const k = bucketKey(i, j); (XI.rects.get(k) || XI.rects.set(k, []).get(k)).push(r); } };
  const index = () => { const sig = occ.length * 1000 + placed.length + (occ[0]?.x || 0) + (occ[occ.length - 1]?.y || 0); if (XI.n === sig) return; XI.rects.clear(); XI.pts.clear(); occ.forEach(addRect);
    for (const P of placed) for (const [x, y] of P.pts || []) { const k = bucketKey(Math.floor((x + P.dx) / B), Math.floor((y + P.dy) / B)); (XI.pts.get(k) || XI.pts.set(k, []).get(k)).push([x + P.dx, y + P.dy]); }
    XI.n = sig; };
  const inside = (x, y, r, g) => x > r.x - g && x < r.x + r.w + g && y > r.y - g && y < r.y + r.h + g;
  const crosses = (R, dx, dy, skip) => { index();
    for (const [x0, y0] of R.pts || []) { const x = x0 + dx, y = y0 + dy, rs = XI.rects.get(bucketKey(Math.floor(x / B), Math.floor(y / B))); if (rs && rs.some(r => !(skip && r.box && same(r, skip)) && inside(x, y, r, r.box ? 6 : 2))) return true; }
    for (const r of rectsOf(R, dx, dy)) for (let i = Math.floor(r.x / B); i <= Math.floor((r.x + r.w) / B); i++) for (let j = Math.floor(r.y / B); j <= Math.floor((r.y + r.h) / B); j++) { const ps = XI.pts.get(bucketKey(i, j)); if (ps && ps.some(([x, y]) => inside(x, y, r, r.box ? 6 : 2))) return true; }
    return false; };
  const allPts = () => placed.flatMap(P => (P.pts || []).map(([x, y]) => [x + P.dx, y + P.dy]));
  // A rectangle on a line: the parts' own lines (sampled) or a line drawn between them.
  const onAnyLine = r => { index(); for (let i = Math.floor((r.x - 3) / B); i <= Math.floor((r.x + r.w + 3) / B); i++) for (let j = Math.floor((r.y - 3) / B); j <= Math.floor((r.y + r.h + 3) / B); j++) { const ps = XI.pts.get(bucketKey(i, j)); if (ps && ps.some(([x, y]) => inside(x, y, r, 3))) return true; }
    return drawn.some(([p, q]) => Math.max(p[0], q[0]) > r.x - 3 && Math.min(p[0], q[0]) < r.x + r.w + 3 && Math.max(p[1], q[1]) > r.y - 3 && Math.min(p[1], q[1]) < r.y + r.h + 3); };
  const place = (R, dx, dy) => {
    R.dx = dx; R.dy = dy; placed.push(R); occ.push(...rectsOf(R, dx, dy));
    for (const [k, r] of Object.entries(R.pos)) if (!G[k]) G[k] = { ...shift(r, dx, dy), R, id: k.slice(2) };
  };
  // The parts placed so far take room with their steps too: nothing of a new part may sit on one of their arrows.
  const onStepsNow = () => {
    const steps = placed.flatMap(P => P.sm.p.reactions.map(r => [P.pos['m:' + r.from], P.pos['m:' + r.to], P]).filter(([f, t]) => f && t)
      .map(([f, t, P]) => { const x = Math.min(f.x, t.x) + P.dx, y = Math.min(f.y, t.y) + P.dy; return { x: x - 8, y: y - 8, w: Math.max(f.x + f.w, t.x + t.w) + P.dx - x + 16, h: Math.max(f.y + f.h, t.y + t.h) + P.dy - y + 16 }; }));
    return rs => rs.some(r => steps.some(o => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h));
  };
  // The other way round: none of a new part's own arrows may run over a box or label already placed (the span between a step's
  // two boxes, which is where its line goes, give or take a curve).
  const overBoxes = (R, dx, dy) => R.sm.p.reactions.some(r => { const f = R.pos['m:' + r.from], t = R.pos['m:' + r.to]; if (!f || !t) return false;
    const x0 = Math.min(f.x + f.w / 2, t.x + t.w / 2) + dx, x1 = Math.max(f.x + f.w / 2, t.x + t.w / 2) + dx, y0 = Math.min(f.y + f.h / 2, t.y + t.h / 2) + dy, y1 = Math.max(f.y + f.h / 2, t.y + t.h / 2) + dy;
    return occ.some(o => { const g = o.box ? M : 6; return o.x - g < x1 && o.x + o.w + g > x0 && o.y - g < y1 && o.y + o.h + g > y0; }); }); // its tags and labels too
  // Somewhere free for a part, with its box `key` as close as it can get to `target` (but leaving room for an arrow).
  const nearby = (R, key, target, room = [200, 200]) => { // room: the least distance across and down
    const b = R.pos[key] || Object.values(R.pos)[0], t = ctr(target), c = ctr(b), cands = [];
    for (let gx = -40; gx <= 40; gx++) for (let gy = -40; gy <= 40; gy++) {
      const vx = gx * 80, vy = gy * 80, d = Math.hypot(vx, vy);
      if (d < 200 || (Math.abs(vx) < room[0] && Math.abs(vy) < room[1])) continue;
      cands.push([d + (vx && vy ? 160 : 0), t.cx + vx - c.cx, t.cy + vy - c.cy]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const onSteps = onStepsNow();
    // The arrow that will join them needs a clear right-angled path (either way round) past every other box.
    for (const [, dx, dy] of cands) {
      const rs = rectsOf(R, dx, dy); if (clash(rs) || onSteps(rs) || overBoxes(R, dx, dy) || crosses(R, dx, dy)) continue;
      if (route(shift(b, dx, dy), target, [...occ, ...rs].filter(r => r.box))) return [dx, dy];
    }
    for (const [, dx, dy] of cands) if (!clash(rectsOf(R, dx, dy))) return [dx, dy];
    const maxX = Math.max(...occ.map(o => o.x + o.w)); return [maxX + 200 - R.vb[0], 0];
  };
  const touching = (T, id) => T.p.reactions.filter(r => r.from === id || r.to === id);
  // After a part is re-drawn: everything placed so far, from scratch.
  const reserved = []; // where the labels of steps moved between parts used to be: kept free for them
  const rebuild = () => {
    occ.length = 0; occ.push(...reserved); for (const k of Object.keys(G)) delete G[k];
    for (const P of placed) { occ.push(...rectsOf(P, P.dx, P.dy)); for (const [k, r] of Object.entries(P.pos)) if (!G[k]) G[k] = { ...shift(r, P.dx, P.dy), R: P, id: k.slice(2) }; }
  };
  // Right-angled routes between two boxes, simplest first: straight, an L (either corner), then three legs (in the gap
  // between them, or around both). Returns center-to-center points clear of every other box, or null.
  const segHits = (p, q, r) => Math.max(p[0], q[0]) > r.x - 6 && Math.min(p[0], q[0]) < r.x + r.w + 6 && Math.max(p[1], q[1]) > r.y - 6 && Math.min(p[1], q[1]) < r.y + r.h + 6;
  const same = (r, q) => Math.abs(r.x - q.x) < 1 && Math.abs(r.y - q.y) < 1;
  const drawn = []; // segments of the arrows already drawn between parts: a new one may cross them, never run along them
  const routed = {}; // reaction id → the points of its arrow, when it was drawn between parts
  const ALL_ROUTES = []; // every arrow drawn between parts, as points
  const routeLab = {}; // reaction id → the labels put down along that arrow
  const alongside = (p, q) => drawn.some(([u, v]) => {
    const h1 = Math.abs(p[1] - q[1]) < 1, h2 = Math.abs(u[1] - v[1]) < 1;
    if (h1 !== h2) return false;
    const [c, d, lo1, hi1, lo2, hi2] = h1 ? [p[1], u[1], Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(u[0], v[0]), Math.max(u[0], v[0])] : [p[0], u[0], Math.min(p[1], q[1]), Math.max(p[1], q[1]), Math.min(u[1], v[1]), Math.max(u[1], v[1])];
    return Math.abs(c - d) < 10 && Math.min(hi1, hi2) - Math.max(lo1, lo2) > 4;
  });
  // An end moved along its box's side (a vertical end leg sideways, a horizontal one up or down), with the leg after it.
  const nudge = (pts, end, o) => { const P = pts.map(q => [...q]), i = end ? P.length - 1 : 0, j = end ? P.length - 2 : 1, vert = Math.abs(P[i][0] - P[j][0]) < 1;
    if (P.length === 2) { if (vert) { P[0][0] += o; P[1][0] += o; } else { P[0][1] += o / 4; P[1][1] += o / 4; } return P; }
    if (vert) { P[i][0] += o; P[j][0] += o; } else { P[i][1] += o / 4; P[j][1] += o / 4; } return P; };
  // soft: things a route may cross at a cost (labels): a short route that grazes one beats a long way round.
  const route = (a, b, boxes, spread = false, soft = [], every = false) => { // every: all acceptable routes, best first
    const A = ctr(a), B = ctr(b), others = boxes.filter(r => !same(r, a) && !same(r, b)), cands = [];
    const near = q => soft.filter(l => !(l.x < q.x + q.w + 6 && q.x < l.x + l.w + 6 && l.y < q.y + q.h + 6 && q.y < l.y + l.h + 6)); // not its own ends' labels
    const softs = [...near(a)].filter(l => near(b).includes(l));
    if (Math.abs(A.cx - B.cx) < 4 || Math.abs(A.cy - B.cy) < 4) cands.push([[A.cx, A.cy], [B.cx, B.cy]]);
    cands.push([[A.cx, A.cy], [B.cx, A.cy], [B.cx, B.cy]], [[A.cx, A.cy], [A.cx, B.cy], [B.cx, B.cy]]);
    const lo = Math.min(a.x, b.x) - 50, hi = Math.max(a.x + a.w, b.x + b.w) + 50, top = Math.min(a.y, b.y) - 50, bot = Math.max(a.y + a.h, b.y + b.h) + 50;
    // The gap between them at a few points, and around both, further out each time (a big joined drawing needs room).
    const midX = [0.25, 0.5, 0.75].map(f => A.cx + (B.cx - A.cx) * f), midY = [0.25, 0.5, 0.75].map(f => A.cy + (B.cy - A.cy) * f), out = [0, 120, 300, 500, 800];
    for (const xm of [...midX, ...out.flatMap(o => [lo - o, hi + o])]) cands.push([[A.cx, A.cy], [xm, A.cy], [xm, B.cy], [B.cx, B.cy]]);
    for (const ym of [...midY, ...out.flatMap(o => [top - o, bot + o])]) cands.push([[A.cx, A.cy], [A.cx, ym], [B.cx, ym], [B.cx, B.cy]]);
    const len = pts => pts.slice(1).reduce((n, q, i) => n + Math.abs(q[0] - pts[i][0]) + Math.abs(q[1] - pts[i][1]), 0) + 80 * (pts.length - 2);
    // When drawing (not while placing parts), each route may also enter or leave its boxes off-center.
    const all = spread ? cands.flatMap(c => [0, 50, -50].flatMap(o1 => [0, 50, -50].map(o2 => nudge(nudge(c, false, o1), true, o2)))) : cands;
    const cost = pts => len(pts) + 260 * pts.slice(1).reduce((n, q, i) => n + softs.filter(l => segHits(pts[i], q, l)).length, 0);
    const ok = all.filter(pts => {
      for (let i = 1; i < pts.length; i++) if (others.some(r => segHits(pts[i - 1], pts[i], r)) || alongside(pts[i - 1], pts[i])) return false;
      return true;
    }).sort((x, y) => cost(x) - cost(y));
    // A route that crosses no label at all wins, however much longer; only when there's none does it graze the fewest.
    const clean = ok.filter(pts => !pts.slice(1).some((q, i) => softs.some(l => segHits(pts[i], q, l))));
    if (every) return [...clean, ...ok.filter(pts => !clean.includes(pts))];
    return clean[0] || ok[0] || null;
  };
  // An end that would arrive as a short stub (a level run just above a box, then a drop of a few pixels into it near its
  // corner): the level run moves to the box's middle instead, so the arrow meets its side head-on. Only when that run is
  // clear of other boxes, and the leg before it can stretch to meet it.
  const squareEnds = (P, a, b) => {
    const clear = (p, q) => ![...DRAW_BOXES, ...DRAW_LABELS].some(r => !same(r, a) && !same(r, b) && segHits(p, q, r)) && !alongside(p, q);
    const fix = (P, box, tail) => { const n = P.length; if (n < 3) return P;
      const [e, c, d] = tail ? [n - 1, n - 2, n - 3] : [0, 1, 2], E = P[e], C = P[c], D = P[d];
      if (Math.hypot(E[0] - C[0], E[1] - C[1]) >= 30 || Math.abs(C[1] - D[1]) > 1 || Math.abs(E[0] - C[0]) > 1) return P; // (a short vertical end after a level run)
      const far = tail ? a : b, endD = tail ? d === 0 : d === n - 1, nx = endD ? null : P[tail ? d - 1 : d + 1]; // (the other end's box; the leg before D)
      const upright = endD || Math.abs(nx[0] - D[0]) < 1;
      // Into its side, head-on, at its middle height: when the level run can drop (or rise) to it.
      const cy = box.y + box.h / 2, fromRight = D[0] > box.x + box.w, fromLeft = D[0] < box.x;
      if ((fromRight || fromLeft) && upright && (!endD || (cy > far.y + 6 && cy < far.y + far.h - 6))) {
        const x = fromRight ? box.x + box.w + 4 : box.x - 4;
        if (clear([D[0], cy], [x, cy])) { const Q = P.map(q => [...q]); Q[d][1] = cy; Q[c] = [x, cy]; Q.splice(e, 1); return Q; }
      }
      // Else the level run moves further out, so the end is a clear 30-px drop into the box, not a sliver beside it.
      if (!upright || endD) return P;
      const dir = Math.sign(C[1] - E[1]) || 1, y = E[1] + dir * 30;
      const ok = Math.sign(nx[1] - D[1]) !== dir || Math.sign(nx[1] - y) === dir; // (moving out must not run past the leg before it)
      if (ok && clear([C[0], y], [D[0], y])) { const Q = P.map(q => [...q]); Q[c][1] = y; Q[d][1] = y; return Q; }
      return P; };
    return fix(fix(P, b, true), a, false); };
  // A route's ends moved out to the box edges.
  const trim = (pts, a, b) => {
    const P = pts.map(q => [...q]), n = P.length;
    const out = (q, n2, r) => { const dx = Math.sign(n2[0] - q[0]), dy = Math.sign(n2[1] - q[1]); return dx ? [dx > 0 ? r.x + r.w + 4 : r.x - 4, q[1]] : [q[0], dy > 0 ? r.y + r.h + 4 : r.y - 4]; };
    P[0] = out(P[0], P[1], a); P[n - 1] = out(P[n - 1], P[n - 2], b);
    return P;
  };
  const PILL_FORK = {}; // box|carrier → the point just past that carrier's pill
  const drawRoute = (r, a, b, cls, labels = true, given = null) => {
    // Two boxes (nearly) level with nothing between them: one straight line, never a jog into the far box.
    const A = ctr(a), Bc = ctr(b), ym = (A.cy + Bc.cy) / 2, flat = !given && Math.abs(A.cy - Bc.cy) < 24 && Math.abs(ym - A.cy) < a.h / 2 - 4 && Math.abs(ym - Bc.cy) < b.h / 2 - 4
      && ![...DRAW_BOXES, ...DRAW_LABELS].some(r => !same(r, a) && !same(r, b) && segHits([Math.min(A.cx, Bc.cx) + a.w / 2 + 2, ym], [Math.max(A.cx, Bc.cx) - b.w / 2 - 2, ym], r)) && !alongside([A.cx, ym], [Bc.cx, ym]) ? [[A.cx, ym], [Bc.cx, ym]] : null; // (nor through a label: a tag beside the far box)
    const pts = given || flat || gridRoute(a, b, DRAW_BOXES, DRAW_LABELS, drawn, allPts()) || route(a, b, DRAW_BOXES, true, DRAW_LABELS) || [[ctr(a).cx, ctr(a).cy], [ctr(b).cx, ctr(a).cy], [ctr(b).cx, ctr(b).cy]], P = squareEnds(trim(pts, a, b), a, b);
    const segs = P.slice(1).map((q, i) => [P[i], q]); drawn.push(...pts.slice(1).map((q, i) => [pts[i], q]));
    if (r && labels) routed[r.id] = P;
    ALL_ROUTES.push(P); P.ab = [a, b]; // (for counting crossings, when timing)
    const longest = f => segs.filter(f).sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]))[0];
    const h = longest(([p, q]) => Math.abs(p[1] - q[1]) < 1), v0 = longest(([p, q]) => Math.abs(p[0] - q[0]) < 1);
    // A long vertical run keeps its labels to a short stretch in the middle, as on any other step.
    const v = v0; // elbowLabels keeps the labels to a short, clear stretch of a long run
    // A step between parts that brings its substrate across first shows its carrier too (GLUT into glycolysis).
    const ti = r?.via && m.items['t:' + r.id], at = ti && viaAt(P, ti), hold = ti && enzRect(at[0], at[1], 'middle', ti, 22);
    // A transport step (the transporter is its name: SGLT1, GLUT2) sits on the membrane its line crosses, like a carrier.
    const onMem = q => !!q && (MEMBRANE_SEGS ? MEMBRANE_SEGS.some(([a, b, c, d]) => (a === c ? Math.abs(q[0] - a) < 1 && q[1] >= Math.min(b, d) && q[1] <= Math.max(b, d) : Math.abs(q[1] - b) < 1 && q[0] >= Math.min(a, c) && q[0] <= Math.max(a, c))) : VIA_X.some(x => Math.abs(q[0] - x) < 1));
    const tt = (ROUTE_BANDS || ROUTE_FLOOR) && r?.transport && !r.via && m.items['e:' + r.id], atT = tt && viaAt(P, tt), memT = tt && onMem(atT);
    if (hold && DRAW_LABELS.some(l => overlaps(hold, l))) ROUTE_LABEL_MISS += 3; // its pill on another label: another route may do better
    // Where the line goes on past the pill (a second step through the same carrier forks off there: PDH and pyruvate carboxylase).
    if (hold && r) { const i = P.findIndex((q, j) => j && Math.min(P[j - 1][0], q[0]) <= at[0] && Math.max(P[j - 1][0], q[0]) >= at[0] && Math.abs(P[j - 1][1] - at[1]) < 1), dir = i > 0 ? Math.sign(P[i][0] - P[i - 1][0]) : 0;
      if (dir) PILL_FORK[r.from + '|' + m.p.enzymes[r.via]?.name] = [at[0] + dir * (hold.w / 2 + 12), at[1]]; }
    const routeLabels = (hh, vv) => {
      const n0 = DRAW_LABELS.length;
      if (hold) DRAW_LABELS.push(hold);
      const mine = P.slice(1); // this route's own segments are the last ones drawn
      const lineHit = q => { const was = drawn.splice(drawn.length - mine.length, mine.length); const hit = onAnyLine(q); drawn.push(...was); return hit; }; // (not its own route)
      const pill = memT ? enzRect(atT[0], atT[1], 'middle', tt, 22) : null; if (pill) DRAW_LABELS.push(pill);
      ROUTE_NONAME = !!memT; const lab = (hh || vv) ? routeStepLabels(m, statusOf, r, P, lineHit) || (memT ? '' : elbowLabels(m, statusOf, r, hh, vv)) : ''; ROUTE_NONAME = false;
      if (hold) DRAW_LABELS.splice(DRAW_LABELS.indexOf(hold), 1);
      const out = lab + (ti ? viaPill(m, statusOf, r, at) : '') + (memT ? enzLabel(atT[0], atT[1], tt, statusOf('e:' + r.id), 'middle', 22, 'center') : '');
      if (r) (routeLab[r.id] = routeLab[r.id] || []).push(...DRAW_LABELS.slice(n0)); // (its labels, for the compartment they belong to)
      return out;
    };
    // The labels go on the longer kind of run: a long climb beats a short sideways stub out of a box.
    const hl = h ? Math.abs(h[1][0] - h[0][0]) : 0, vl = v ? Math.abs(v[1][1] - v[0][1]) : 0;
    if (h && v && vl > hl * 1.5 && hl < 260) return elbow(P, r?.reversible, cls || rxCls(r || {})) + (labels && r && m.items['e:' + r.id] ? routeLabels(null, v) : '');
    return elbow(P, r?.reversible, cls || rxCls(r || {})) + (labels && r && m.items['e:' + r.id] ? routeLabels(h, v) : routeLabels(null, null));
  };
  const sideOf = (T, id) => T.p.reactions.filter(r => (r.also_to || []).includes(id) || (r.also_from || []).includes(id));
  const sides = []; // [from box id, to box id, reaction]: a side product or input that lives in another part
  const BANDED = STITCH_BANDS && !tiles.every(T => T.p.nephron);
  const BANDS = []; // [{ z, x0, x1 }] in order, when BANDED
  const FLOOR = BANDED && tiles.length > 4 ? {} : null; // more than four parts (the Map's merged chart): compartments as a cell's floorplan ({ rects, segs }), not bands
  if (BANDED) {
    /* Each part splits into one piece per compartment (drawn by its own renderer: a ring stays a ring); a box shared with
       an earlier part stays that part's. Every step between two pieces is drawn between parts (bridges), so a carrier
       sits on the membrane it crosses. */
    const zOf = (T, id) => { const w = STITCH_WHERE[id] || tileWhere(T.p)[id]; return w?.loc ? zoneKey(m, w.loc, w.tissue) : '?'; };
    const pieces = [];
    // Whose box a shared molecule is: the first part's, except that a ring keeps every box of its ring (the TCA cycle
    // keeps oxaloacetate and malate, and gluconeogenesis's steps are drawn to them).
    const own = { ...owner }; tiles.forEach((T, ti) => { if (T.p.circular) for (const id of modelFor(T.p).spineMets) if (!tiles[own[id]]?.p.circular) own[id] = ti; });
    const boxPiece = (T, id) => { const it = m.items['m:' + id];
      return { T, sm: { p: { reactions: [], circular: false }, spineMets: [] }, pos: { ['m:' + id]: { x: 0, y: 0, w: BW, h: BH } }, labels: [], cofs: [], steps: {}, pts: [], dirty: false,
        vb: [-12, -12, BW + 24, BH + 24], body: metBox(BW / 2, 0, it, statusOf('m:' + id)), where: { [id]: STITCH_WHERE[id] || tileWhere(T.p)[id] }, drop: new Set(T.ids.filter(x => x !== id)), rot: 0 }; };
    tiles.forEach((T, ti) => {
      const mine = T.ids.filter(id => own[id] === ti), zs = uniq(mine.map(id => zOf(T, id)));
      // One piece per connected run of boxes in a compartment (the fatty acid line, and its OAA → malate → pyruvate shuttle).
      const comps = [];
      for (const z of zs) {
        const ids = mine.filter(id => zOf(T, id) === z), up = Object.fromEntries(ids.map(id => [id, id])), root = id => (up[id] === id ? id : (up[id] = root(up[id])));
        for (const r of T.p.reactions) for (const [a, b] of [[r.from, r.to], ...(r.also_to || []).map(x => [r.from, x]), ...(r.also_from || []).map(x => [x, r.to])]) if (a in up && b in up) up[root(a)] = root(b);
        for (const g of uniq(ids.map(root))) comps.push([z, ids.filter(id => root(id) === g)]);
      }
      for (const [z, ids] of comps) {
        const set = new Set(ids);
        const inner = T.p.reactions.filter(r => set.has(r.from) && set.has(r.to));
        if (!inner.length) { ids.forEach(id => pieces.push({ z, R: boxPiece(T, id), ti })); continue; }
        const drop = new Set(T.ids.filter(id => !set.has(id)));
        // A ring turns so that the boxes with steps across a membrane face it (scored once the bands are in order).
        const Rs = T.p.circular && !T.p.reactions.some(r => !r.branch && drop.has(r.from)) ? [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(rot => renderTile(T, statusOf, drop, undefined, rot)).filter((R, k) => !k || !R.dirty) : [renderTile(T, statusOf, drop, undefined, 0, true)];
        const R = Rs[0];
        pieces.push({ z, R, ti, Rs });
        ids.filter(id => !R.pos['m:' + id]).forEach(id => pieces.push({ z, R: boxPiece(T, id), ti })); // left out by its renderer (no step to it here)
      }
    });
    // Steps whose two boxes ended up in different pieces (across a membrane, or one its piece's renderer left out) are
    // drawn between them, and so are the side products and inputs of such a step, or of any step in another piece.
    const pieceOf = id => pieces.find(q => q.R.pos['m:' + id]);
    for (const T of tiles) for (const r of T.p.reactions) {
      const cross = pieceOf(r.from) !== pieceOf(r.to); if (cross) bridges.push(r);
      for (const id of r.also_to || []) if (cross || pieceOf(id) !== pieceOf(r.from)) sides.push([r.from, id, r]);
      for (const id of r.also_from || []) if (cross || pieceOf(id) !== pieceOf(r.to)) sides.push([id, r.to, r]);
    }
    // One band per compartment, not per tissue, where tissue doesn't tell them apart: blood is blood, and a compartment
    // with no tissue given joins its tissue's when only one is named (glycolysis's cytosol is galactose's liver cytosol).
    const alias = {}, byC = {};
    for (const z of uniq(pieces.map(q => q.z))) { const [t, c] = z.includes('|') ? z.split('|') : ['', z]; (byC[c] = byC[c] || []).push({ z, t }); }
    // (A big merged chart, the Map, is a chart of compartments, not of the body: every tissue's cytosol is one band.)
    const many = tiles.length > 4;
    for (const [c, zl] of Object.entries(byC)) { const ts = uniq(zl.map(x => x.t).filter(Boolean)), outside = many || /blood|plasma|extracell|interstit/.test(c);
      if (!outside && ts.length > 1) {
        // Several tissues: the one with none given joins whichever of them its steps run into most, if any.
        const plain = zl.find(x => !x.t); if (!plain) continue;
        const into = {}; for (const T of tiles) for (const r of T.p.reactions) { const a = pieces.find(q => q.R.pos['m:' + r.from])?.z, b = pieces.find(q => q.R.pos['m:' + r.to])?.z;
          for (const [u, v] of [[a, b], [b, a]]) if (u === plain.z && v && v !== u && zl.some(x => x.z === v)) into[v] = (into[v] || 0) + 1; }
        const best = Object.entries(into).sort((x, y) => y[1] - x[1])[0]; if (best) alias[plain.z] = best[0];
        continue;
      }
      const rep = (ts.length === 1 && !outside ? zl.find(x => x.t) : zl.find(x => m.items['z:' + x.z]) || zl[0]).z;
      for (const x of zl) alias[x.z] = rep; }
    for (const q of pieces) q.z = alias[q.z] || q.z;
    BANDS.alias = alias;
    // The compartments in the order that keeps steps between them short: outside (blood, lumen) · cytosol · organelles.
    const zs = uniq(pieces.map(q => q.z)), wt = {};
    const zOfId = id => pieces.find(q => q.R.pos['m:' + id])?.z;
    // How much room a step across a membrane needs either side of it, as it's shown now: half its carrier's pill, then its
    // name past the pill (a hidden name or carrier takes none). Bands and the Map's regions keep that much inside each edge.
    const need = r => { const ti = r.via && m.items['t:' + r.id], it = m.items['e:' + r.id], on = k => statusOf(k) !== 'hide';
      const cof = cofParts(m, statusOf, r).filter(p => p.st !== 'hide' && p.st !== 'none').reduce((n, p) => n + (hidden(p.st) ? 120 : p.text.length * 7) + 30, 0); // (its cofactors run along the line under its name)
      return (ti && on('t:' + r.id) ? enzRect(0, 0, 'middle', ti, 22).w / 2 + 10 : 10) + Math.max(it && on('e:' + r.id) ? enzRect(0, 0, 'middle', it, 16, 'bottom').w + 30 : 0, cof) + 40; };
    const CLEAR = Math.round(Math.min(260, Math.max(80, ...bridges.filter(r => zOfId(r.from) !== zOfId(r.to)).map(need))));
    for (const r of [...bridges, ...st.joins.map(([a, b]) => ({ from: a, to: b }))]) { const a = zOfId(r.from), b = zOfId(r.to); if (a && b && a !== b) { wt[a + '>' + b] = (wt[a + '>' + b] || 0) + 1; wt[b + '>' + a] = (wt[b + '>' + a] || 0) + 1; } }
    const rank = z => (/blood|plasma|extracell|lumen|gut|urine|interstit|brush|bonemarrow|tissue/.test(z) ? 0 : /cytosol|cytoplasm/.test(z) ? 1 : /intermembrane/.test(z) ? 2 : /mito|matrix/.test(z) ? 3 : 2);
    const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
    const cost = o => o.reduce((n, a, i) => n + o.reduce((t, b, j) => t + (wt[a + '>' + b] || 0) * Math.abs(i - j), 0), 0) * 10 + o.reduce((n, z, i) => n + Math.abs(rank(z) - i * 3 / Math.max(1, o.length - 1)), 0);
    const order = zs.length <= 7 ? perms(zs).sort((a, b) => cost(a) - cost(b))[0] : zs.slice().sort((a, b) => rank(a) - rank(b));
    if (FLOOR) {
    /* The Map: a cell. Blood across the top (gut lumen and urine at its left), the cytosol a U below it, the ER and the
       mitochondrial matrix side by side inside the U (each touching the blood above, the cytosol around and each other),
       the intermembrane space a strip under the matrix, and the small organelles (lysosome, vesicles) islands in the
       bottom of the cytosol. Every pair of compartments with steps between them shares an edge. */
    const roleOf = z => { const c = z.split('|').pop(); return /blood|plasma|extracell|interstit/.test(c) ? 'blood' : /lumen|brush|urine|gut/.test(c) ? 'lumen' : /cytosol|cytoplasm/.test(c) ? 'cyto'
      : /intermembrane/.test(c) ? 'ims' : /mito|matrix/.test(c) ? 'mito' : c === 'er' || /reticulum/.test(c) ? 'er' : 'isle'; };
    const M = Math.min(200, Math.max(120, CLEAR)), room = q => (q.R.vb[2] + 80) * (q.R.vb[3] + 80); // (M: clear inside each edge, for a carrier's pill and its step's name)
    const of = r => pieces.filter(q => roleOf(q.z) === r), A = r => of(r).reduce((n, q) => n + room(q), 0) * 1.25;
    const MW = r => Math.max(0, ...of(r).map(q => q.R.vb[2])), MH = r => Math.max(0, ...of(r).map(q => q.R.vb[3]));
    const fit = (r, w) => (of(r).length ? Math.max(MH(r) + 2 * M, A(r) / Math.max(1, w - 2 * M) + 2 * M) : 0);
    // An island just big enough for its pieces, about square (pieces side by side as well as stacked).
    const isles = uniq(of('isle').map(q => q.z)).map(z => { const ps = pieces.filter(q => q.z === z), ar = ps.reduce((n, q) => n + room(q), 0) * 1.4;
      const w = Math.max(Math.max(...ps.map(q => q.R.vb[2])) + 160, Math.sqrt(ar) + 160); return { z, w, h: Math.max(Math.max(...ps.map(q => q.R.vb[3])) + 120, ar / (w - 160) + 120) }; });
    const hIms = of('ims').length ? MH('ims') + 2 * 120 : 0;
    // The ER and the matrix share one height; the cytosol's arms and bottom take what's left, shaped so the whole chart
    // comes out about 1.6 times as wide as it is tall.
    const lumStack = of('lumen').reduce((n, q) => n + q.R.vb[3] + 60, 0), lumCols = Math.max(1, Math.ceil(lumStack / 1600)), lumH = lumStack / lumCols;
    let bestLay = null;
    for (const wer of [0, 0.15, 0.3].map(f => Math.max(MW('er') + 2 * M, f * 6000))) for (const wmi of [0, 0.2, 0.4].map(f => Math.max(MW('mito') + 2 * M, f * 8000))) {
      const we = of('er').length ? wer : 0, wm = of('mito').length || hIms ? wmi : 0;
      const Hm = Math.max(fit('er', we || 1), fit('mito', wm || 1) + hIms, 600);
      for (const Wa of [1, 1.5, 2, 3, 4].map(k => MW('cyto') * k / 2 + 2 * M)) {
        const W = 2 * Wa + we + wm, Ht = Math.max(MH('blood'), lumH) + 2 * 140; // (the lumen's pieces stack in its corner, in columns when there are many)
        // The islands in rows along the bottom of the cytosol, as many to a row as fit between its arms.
        const room = Math.max(800, W - 2 * Wa - 160), rows = []; for (const i of isles) { const row = rows[rows.length - 1]; if (row && row.w + i.w + 80 <= room) { row.w += i.w + 80; row.h = Math.max(row.h, i.h); row.is.push(i); } else rows.push({ w: i.w + 80, h: i.h, is: [i] }); }
        const isleW = rows.length ? Math.max(...rows.map(r => r.w)) : 0, isleH = rows.reduce((n, r) => n + r.h + 80, 0); isles.rows = rows;
        const left = A('cyto') - 2 * (Wa - 2 * M) * (Hm - M), Hb = Math.max(MH('cyto') + 2 * M, isleH + 2 * M, left > 0 ? left / Math.max(1, W - 2 * Wa) + isleH + 2 * M : 0, 400);
        const H = Ht + Hm + Hb, score = Math.abs(Math.log(W / H / 1.6)) + W * H / 4e8;
        if (!bestLay || score < bestLay.score) bestLay = { score, W, H, Ht, Hm, Hb, Wa, we, wm, rows };
      }
    }
    const { W, Ht, Hm, Hb, Wa, we, wm, rows } = bestLay, wl = of('lumen').length ? lumCols * (MW('lumen') + 80) + 2 * M : 0;
    const R0 = (x, y, w, h) => ({ x, y, w, h });
    FLOOR.rects = [];
    const add = (role, r, bleed) => { const z = role === 'isle' ? r.z : uniq(of(role).map(q => q.z))[0] || role; FLOOR.rects.push({ role, z, ...r, bleed }); };
    if (wl) add('lumen', R0(0, 0, wl, Ht), 'tl');
    add('blood', R0(wl, 0, W - wl, Ht), wl ? 'tr' : 'tlr');
    add('cyto', R0(0, Ht, Wa, Hm + Hb), 'lb'); add('cyto', R0(Wa, Ht + Hm, W - 2 * Wa, Hb), 'b'); add('cyto', R0(W - Wa, Ht, Wa, Hm + Hb), 'rb');
    if (we) add('er', R0(Wa, Ht, we, Hm));
    if (wm) { add('mito', R0(Wa + we, Ht, wm, Hm - hIms)); if (hIms) add('ims', R0(Wa + we, Ht + Hm - hIms, wm, hIms)); }
    let iy = Ht + Hm + Hb - 80; for (const row of rows) { iy -= row.h; let ix = W - Wa - 80; for (const i of row.is) { ix -= i.w; add('isle', { z: i.z, x: ix, y: iy + (row.h - i.h) / 2, w: i.w, h: i.h }); ix -= 80; } iy -= 80; } // (rows from the bottom, right to left)
    const cytoZ = uniq(of('cyto').map(q => q.z))[0]; FLOOR.rects.forEach(r => { if (r.role === 'cyto') r.z = cytoZ || r.z; });
    const rectsFor = z => FLOOR.rects.filter(r => r.role === roleOf(z) && (r.role !== 'isle' || r.z === z)), holes = FLOOR.rects.filter(r => r.role === 'isle'); // (a region takes every compartment of its kind: brush border, gut lumen and urine share one)
    FLOOR.rects.forEach(r => { r.zs = r.role === 'isle' ? [r.z] : uniq(of(r.role).map(q => q.z)); });
    // Membranes: every edge between two regions (not the outer ones, which run on to the canvas edge).
    FLOOR.segs = [];
    for (const r of FLOOR.rects) if (r.role !== 'cyto') for (const [x1, y1, x2, y2, e] of [[r.x, r.y, r.x + r.w, r.y, 't'], [r.x, r.y + r.h, r.x + r.w, r.y + r.h, 'b'], [r.x, r.y, r.x, r.y + r.h, 'l'], [r.x + r.w, r.y, r.x + r.w, r.y + r.h, 'r']]) if (!(r.bleed || '').includes(e)) FLOOR.segs.push([x1, y1, x2, y2]);
    const centerOf = z => { const r = rectsFor(z)[0]; return r ? { cx: r.x + r.w / 2, cy: r.y + r.h / 2 } : { cx: 0, cy: 0 }; };
    // Each ring's turn: the one whose boxes with steps out of its region face the region they go to.
    const linksOf = id => [...bridges, ...st.joins.map(([a, b]) => ({ from: a, to: b }))].filter(r => r.from === id || r.to === id).map(r => zOfId(r.from === id ? r.to : r.from)).filter(Boolean);
    for (const q of pieces) if ((q.Rs || []).length > 1) {
      const me = centerOf(q.z), score = R => Object.entries(R.pos).reduce((n, [k, r]) => n + linksOf(k.slice(2)).filter(z => z !== q.z).reduce((t, z) => { const o = centerOf(z), dx = o.cx - me.cx, dy = o.cy - me.cy, L = Math.hypot(dx, dy) || 1;
        return t + ((r.x + r.w / 2 - R.vb[0]) / R.vb[2] - 0.5) * dx / L + ((r.y + r.h / 2 - R.vb[1]) / R.vb[3] - 0.5) * dy / L; }, 0), 0);
      q.R = q.Rs.slice().sort((a, b) => score(b) - score(a))[0];
    }
    // Pieces in drawing order; each goes to the spot in its region nearest the box it's joined to (level with it or
    // straight above or below when it can), else the first free spot from the region's top-left.
    const firstAt = q => { const sp = modelFor(q.R.T.p).seq, i = Math.min(...Object.keys(q.R.pos).map(k => sp.indexOf(k)).filter(i => i >= 0)); return q.ti * 1000 + (Number.isFinite(i) ? i : 999); };
    PROF('pieces');
    pieces.sort((a, b) => firstAt(a) - firstAt(b));
    const all = [...bridges, ...st.joins.map(([a, b]) => ({ from: a, to: b }))];
    /* Where a piece goes: among the free spots of its region nearest the boxes it's joined to, the one whose links
       (as right-angled lines, either corner) are shortest and cross least: each crossing with a link already laid, and
       each other piece a link would run through, costs as much as a long detour. */
    const cen = r => [r.x + r.w / 2, r.y + r.h / 2], segsHit = ([a, b], [c, d]) => { const ha = Math.abs(a[1] - b[1]) < 1, hc = Math.abs(c[1] - d[1]) < 1; if (ha === hc) return false;
      const [h, v] = ha ? [[a, b], [c, d]] : [[c, d], [a, b]], y = h[0][1], x = v[0][0];
      return x > Math.min(h[0][0], h[1][0]) + 1 && x < Math.max(h[0][0], h[1][0]) - 1 && y > Math.min(v[0][1], v[1][1]) + 1 && y < Math.max(v[0][1], v[1][1]) - 1; };
    const ell = (a, b, hFirst) => (hFirst ? [[a, [b[0], a[1]]], [[b[0], a[1]], b]] : [[a, [a[0], b[1]]], [[a[0], b[1]], b]]);
    const through = (sg, boxes) => boxes.reduce((n, B) => n + (Math.max(sg[0][0], sg[1][0]) > B.x && Math.min(sg[0][0], sg[1][0]) < B.x + B.w && Math.max(sg[0][1], sg[1][1]) > B.y && Math.min(sg[0][1], sg[1][1]) < B.y + B.h ? 1 : 0), 0);
    let ROOMY = false;
    const placeFloor = q => {
      const R = q.R, mine = rectsFor(q.z).filter(r => r.role !== 'isle' || r.z === q.z);
      // Its links to boxes already down, and every other link already laid (as its cheaper corner).
      const ends = all.flatMap(r => R.pos['m:' + r.from] && G['m:' + r.to] && !R.pos['m:' + r.to] ? [[R.pos['m:' + r.from], G['m:' + r.to], r]] : R.pos['m:' + r.to] && G['m:' + r.from] && !R.pos['m:' + r.from] ? [[R.pos['m:' + r.to], G['m:' + r.from], r]] : []);
      const laid = all.filter(r => G['m:' + r.from] && G['m:' + r.to] && !R.pos['m:' + r.from] && !R.pos['m:' + r.to]).map(r => ell(cen(G['m:' + r.from]), cen(G['m:' + r.to]), true));
      const others = placed.filter(P => P !== R).map(P => ({ x: P.vb[0] + P.dx, y: P.vb[1] + P.dy, w: P.vb[2], h: P.vb[3] }));
      const cands = [];
      for (const r of mine) { const mm = r.role === 'isle' ? 40 : M, m0 = Math.min(mm, Math.max(40, (r.w - R.vb[2]) / 2)), m1 = Math.min(mm, Math.max(40, (r.h - R.vb[3]) / 2)); // (an island is just big enough: a small margin)
        for (let x = r.x + m0; x <= Math.max(r.x + m0, r.x + r.w - m0 - R.vb[2]); x += 40) for (let y = r.y + m1; y <= Math.max(r.y + m1, r.y + r.h - m1 - R.vb[3]); y += 40) {
          const dx = x - R.vb[0], dy = y - R.vb[1], box = { x, y, w: R.vb[2], h: R.vb[3] };
          if (r.role === 'cyto' && holes.some(h => overlaps(box, { x: h.x - 60, y: h.y - 60, w: h.w + 120, h: h.h + 120 }))) continue; // (not on an island)
          const cost = ends.length ? ends.reduce((n, [a, b]) => { const ex = Math.abs(a.x + a.w / 2 + dx - b.x - b.w / 2), ey = Math.abs(a.y + a.h / 2 + dy - b.y - b.h / 2); return n + ex + ey + 0.6 * Math.min(ex, ey); }, 0) : (y - r.y) * 2 + (x - r.x);
          cands.push([cost, dx, dy]); } }
      cands.sort((a, b) => a[0] - b[0]);
      // The nearest free spots (up to 40), scored with their crossings; the best wins.
      // (A step through a carrier between two boxes of one region, like the kidney's urobilin and the gut's urobilinogen: the
      // boxes far enough apart for its pill.)
      const tight = ends.filter(([, , r]) => r.via && roleOf(zOfId(R.pos['m:' + r.from] ? r.to : r.from) || '') === roleOf(q.z));
      const roomy = ([, dx, dy]) => tight.every(([a, b]) => Math.max(Math.abs(a.x + a.w / 2 + dx - b.x - b.w / 2) - (a.w + b.w) / 2, Math.abs(a.y + a.h / 2 + dy - b.y - b.h / 2) - (a.h + b.h) / 2) >= 220);
      const free = []; for (const c of ROOMY ? cands.filter(roomy) : cands) { if (free.length >= 80 || (free.length && c[0] > free[0][0] + 5000)) break; if (!clash(rectsOf(R, c[1], c[2])) && !crosses(R, c[1], c[2])) free.push(c); }
      const score = ([d, dx, dy]) => d + ends.reduce((n, [a, b]) => { const A = [a.x + a.w / 2 + dx, a.y + a.h / 2 + dy], B = cen(b);
        return n + Math.min(...[true, false].map(hf => ell(A, B, hf).reduce((t, sg) => t + 900 * laid.filter(l => l.some(ls => segsHit(sg, ls))).length + 3000 * through(sg, others.filter(o => !(B[0] > o.x && B[0] < o.x + o.w && B[1] > o.y && B[1] < o.y + o.h))), 0))); }, 0);
      let got = free.length ? free.map(c => [score(c), c]).sort((a, b) => a[0] - b[0])[0][1] : cands.find(([, dx, dy]) => !clash(rectsOf(R, dx, dy)));
      if (!got) { const r = mine[0]; got = [0, r.x + 40 - R.vb[0], Math.max(...placed.map(P => P.vb[1] + P.vb[3] + P.dy), r.y) + 60 - R.vb[1]]; }
      place(R, got[1], got[2]);
    };
    placeFloor.cramped = q => all.some(r => { const mine = q.R.pos['m:' + r.from] ? r.from : q.R.pos['m:' + r.to] ? r.to : null, o = mine && (mine === r.from ? r.to : r.from); if (!mine || !r.via || q.R.pos['m:' + o] || !G['m:' + o]) return false;
      if (roleOf(zOfId(o) || '') !== roleOf(q.z)) return false; const a = G['m:' + mine], b = G['m:' + o];
      return Math.max(Math.abs(a.x + a.w / 2 - b.x - b.w / 2) - (a.w + b.w) / 2, Math.abs(a.y + a.h / 2 - b.y - b.h / 2) - (a.h + b.h) / 2) < 220; });
    for (const q of pieces) placeFloor(q);
    // Then three times over: each piece out and back in, now that everything it's joined to is down.
    const snap = () => pieces.map(q => [q.R.dx, q.R.dy]), restore = S => { pieces.forEach((q, i) => { q.R.dx = S[i][0]; q.R.dy = S[i][1]; }); rebuild(); };
    const improve = order => { for (let pass = 0; pass < 3; pass++) for (const q of order) { placed.splice(placed.indexOf(q.R), 1); rebuild(); placeFloor(q); } };
    // (How good the whole layout is, by the same measure each piece was placed by: for comparing layouts.)
    const layoutCost = () => { const L = all.filter(r => G['m:' + r.from] && G['m:' + r.to]).map(r => [cen(G['m:' + r.from]), cen(G['m:' + r.to])]), boxes = placed.map(P => ({ x: P.vb[0] + P.dx, y: P.vb[1] + P.dy, w: P.vb[2], h: P.vb[3], P }));
      const laidL = L.map(([A, B]) => ell(A, B, true));
      return L.reduce((n, [A, B], i) => n + Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.min(...[true, false].map(hf => ell(A, B, hf).reduce((t, sg) => t + 900 * laidL.filter((l, j) => j !== i && l.some(ls => segsHit(sg, ls))).length
        + 3000 * boxes.filter(o => !(A[0] > o.x && A[0] < o.x + o.w && A[1] > o.y && A[1] < o.y + o.h) && !(B[0] > o.x && B[0] < o.x + o.w && B[1] > o.y && B[1] < o.y + o.h)).filter(o => through(sg, [o])).length, 0))), 0); };
    // The passes in order and in reverse, from the same start; the better layout stays (small changes early on can tip
    // the whole chart, so one order alone is luck).
    improve(pieces);
    // Last, and only then (an early move tips the whole chart): a piece too close to the box its carrier's step joins in the
    // same region (the kidney's urobilin under the gut's urobilinogen) moves to the nearest spot with room for the pill.
    ROOMY = true; for (const q of pieces) if (placeFloor.cramped(q)) { placed.splice(placed.indexOf(q.R), 1); rebuild(); placeFloor(q); } ROOMY = false;
    if (STITCH_PROF) STITCH_PROF.est = Math.round(layoutCost() / 1000);
    } else {
    // Each band as wide as its widest piece, plus room either side for what crosses its membranes (a carrier's pill and
    // the step's name beside it).
    // Each ring's turn: the one whose boxes with steps into another band sit furthest toward that band.
    const side = (z, id) => { const o = [...bridges, ...st.joins.map(([a, b]) => ({ from: a, to: b }))].filter(r => r.from === id || r.to === id).map(r => zOfId(r.from === id ? r.to : r.from)).filter(x => x && x !== z);
      return o.reduce((n, x) => n + Math.sign(order.indexOf(x) - order.indexOf(z)), 0); };
    for (const q of pieces) if ((q.Rs || []).length > 1) {
      const score = R => Object.entries(R.pos).reduce((n, [k, r]) => n + side(q.z, k.slice(2)) * ((r.x + r.w / 2 - R.vb[0]) / R.vb[2] - 0.5), 0);
      q.R = q.Rs.slice().sort((a, b) => score(b) - score(a))[0];
    }
    let bx = 0;
    // (Two parts in one band: room for their widest pieces side by side. A big chart: as many columns as a band needs to
    // stay about as tall as the whole chart is meant to be, about 1.6 times as wide as tall.)
    const area = pieces.reduce((n, q) => n + (q.R.vb[2] + 60) * (q.R.vb[3] + 60), 0), tall = Math.sqrt(area / 1.6) * 1.2;
    for (const z of order) { const ps = pieces.filter(q => q.z === z).sort((a, b) => b.R.vb[2] - a.R.vb[2]), other = ps.find(q => q.ti !== ps[0].ti);
      const cols = many ? Math.max(1, Math.min(ps.length, Math.ceil(ps.reduce((n, q) => n + q.R.vb[3] + 60, 0) / tall))) : other ? 2 : 1;
      const cw = ps[0].R.vb[2] + 60, w = cols > 2 || many ? cols * cw : ps[0].R.vb[2] + (other ? other.R.vb[2] + 60 : 0);
      BANDS.push({ z, x0: bx, x1: bx + w + 2 * CLEAR, cols, cw }); bx += w + 2 * CLEAR; } // (CLEAR each side: a carrier's pill on the membrane and the step's name past it)
    // Pieces in drawing order: each part's pieces in the order its main line reaches them.
    const firstAt = q => { const T = q.R.T, sp = modelFor(T.p).seq; const i = Math.min(...Object.keys(q.R.pos).map(k => sp.indexOf(k)).filter(i => i >= 0)); return q.ti * 1000 + (Number.isFinite(i) ? i : 999); };
  PROF('pieces');
    pieces.sort((a, b) => firstAt(a) - firstAt(b));
    // Every step across a membrane as [its box key, the other end's key] (both ways), and the rows they run along.
    const links = [...bridges, ...st.joins.map(([a, b]) => ({ from: a, to: b }))].flatMap(r => zOfId(r.from) && zOfId(r.to) && zOfId(r.from) !== zOfId(r.to) ? [['m:' + r.from, 'm:' + r.to], ['m:' + r.to, 'm:' + r.from]] : []), LANES = [];
    for (const q of pieces) {
      // Against the membrane its steps cross, when they all cross the same one; else in the middle of its band.
      const R = q.R, band = BANDS.find(b => b.z === q.z), leanOf = p => Object.keys(p.R.pos).reduce((n, k) => n + side(p.z, k.slice(2)), 0);
      // In a band shared by parts, its widest piece goes to the side away from where the others cross (they take the membrane).
      const mates = pieces.filter(o => o.z === q.z && o.ti !== q.ti), widest = mates.length && pieces.filter(o => o.z === q.z).every(o => o.R.vb[2] <= R.vb[2]);
      const lean = widest ? -Math.sign(mates.reduce((n, o) => n + leanOf(o), 0)) : leanOf(q);
      const L = band.x0 + CLEAR - R.vb[0], Rt = band.x1 - CLEAR - R.vb[0] - R.vb[2], C = (band.x0 + band.x1) / 2 - (R.vb[0] + R.vb[2] / 2);
      // (In a band of several columns, the middle of each column too, the ones nearer the membrane it leans to first.)
      const colXs = band.cols > 2 || (many && band.cols > 1) ? Array.from({ length: band.cols }, (_, c) => band.x0 + CLEAR + c * band.cw + band.cw / 2 - (R.vb[0] + R.vb[2] / 2)) : [];
      const dxs = uniq([...(lean < 0 ? [L, C, Rt] : lean > 0 ? [Rt, C, L] : [C, L, Rt]), ...(lean > 0 ? colXs.reverse() : colXs)]);
      // Level with the box it's joined to across a membrane (a straight step), else just below what's in its band.
      const link = [...bridges, ...st.joins.map(([a, b]) => ({ from: a, to: b }))].map(r => R.pos['m:' + r.from] && G['m:' + r.to] ? [R.pos['m:' + r.from], G['m:' + r.to]] : R.pos['m:' + r.to] && G['m:' + r.from] ? [R.pos['m:' + r.to], G['m:' + r.from]] : null).find(Boolean);
      const inBand = placed.filter(P => P.band === band), below = inBand.length ? Math.max(...inBand.map(P => P.vb[1] + P.vb[3] + P.dy)) + 40 - R.vb[1] : -R.vb[1];
      const top = placed.length ? Math.min(...placed.map(P => P.vb[1] + P.dy)) - R.vb[1] : 0; // (a big chart fills its columns from the top)
      const dy0 = link ? ctr(link[1]).cy - ctr(link[0]).cy : many && placed.length ? top : placed.length ? below : 0;
      // Its steps across a membrane each run along a row of their own: none within 110 px of one already crossing
      // (its carrier pill, name and cofactors need that much), its own step's row aside.
      const xs = links.filter(([k]) => R.pos[k]), clearRows = d => xs.every(([k, o]) => { const y = ctr(R.pos[k]).cy + d; return LANES.every(l => l.pair === [k, o].sort().join() || l.pair.split(',').includes(k) || Math.abs(l.y - y) >= 110); }); // (its own other crossings leave it the other way)
      // Each place across its band (against the membrane it leans to first), the nearest clear row; the straightest wins.
      let dx = dxs[0], dy = dy0, best = Infinity;
      for (const strict of [true, false]) {
        for (const x of dxs) for (let k = 0; k < 160 && k * 20 < best; k++) { const d = dy0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 40;
          if (!clash(rectsOf(R, x, d)) && !crosses(R, x, d) && (!strict || clearRows(d))) { if (Math.abs(d - dy0) < best) { best = Math.abs(d - dy0); dx = x; dy = d; } break; } }
        if (best < Infinity) break; }
      R.band = band; place(R, dx, dy);
      for (const [k, o] of xs) { const pair = [k, o].sort().join(); LANES.push({ y: ctr(R.pos[k]).cy + dy, pair }); if (G[o]) LANES.push({ y: ctr(G[o]).cy, pair }); }
    }
    }
    // Links between the parts (the TCA cycle's succinyl-CoA into ALA synthase): drawn as ties, as when parts are packed whole.
    tiles.forEach((T, ti) => tiles.slice(0, ti).forEach(P => {
      const l = T.rawLinks.find(l => l.to === P.id), back = P.rawLinks.find(l => l.to === T.id);
      if (!l && !back) return;
      const mine = (l && T.mid[l.at]) || T.ids.find(id => G['m:' + id]), theirs = back ? P.mid[back.at] : P.ids.find(id => G['m:' + id]);
      const inT = id => T.p.reactions.some(r => r.id === id), inP = id => P.p.reactions.some(r => r.id === id);
      if ((st.couples || []).some(([a, b]) => (inT(a) && inP(b)) || (inT(b) && inP(a)))) return; // a coupled step: its badges say so
      if (mine && theirs && mine !== theirs && G['m:' + mine] && G['m:' + theirs]) dots.push({ a: 'm:' + theirs, b: 'm:' + mine, R: G['m:' + mine].R, label: l?.via || back?.via || '' });
    }));
  } else tiles.forEach((T, i) => {
    if (!i) return place(renderTile(T, statusOf, new Set()), 0, 0);
    const deg = id => T.p.reactions.reduce((n, r) => n + (r.from === id) + (r.to === id) + ((r.also_from || []).includes(id)) + ((r.also_to || []).includes(id)), 0);
    const leaf = id => deg(id) === 1, shared = T.ids.filter(id => owner[id] < i);
    const anchor = shared.find(leaf) || shared[0], others = new Set(shared.filter(id => id !== anchor && leaf(id)));
    const bridgeAll = ids => ids.forEach(id => { touching(T, id).forEach(r => bridges.push(r)); sideOf(T, id).forEach(r => sides.push((r.also_to || []).includes(id) ? [r.from, id, r] : [id, r.to, r])); });
    if (anchor) {
      // Snap on a shared box. Try each (ends first); a ring may also turn so that box faces right, left, down or up.
      // Keep the snap that leaves the fewest molecules drawn twice (gluconeogenesis + TCA: the ring beside the column,
      // touching it at oxaloacetate, rather than hung from pyruvate with a second oxaloacetate).
      // (This part's labels were laid out around its own copy of the shared box, so that box doesn't count.)
      let best = null;
      const ring = T.p.circular ? modelFor(T.p).spineMets : []; let wd; const wholeDirty = () => (wd ??= renderTile(T, statusOf, new Set()).dirty);
      for (const sh of shared.slice().sort((x, y) => leaf(y) - leaf(x))) {
        const oth = new Set(shared.filter(id => id !== sh && leaf(id))), dups = shared.filter(id => id !== sh && !leaf(id)).length, i0 = ring.indexOf(sh);
        if (best && dups >= best.dups) continue;
        const rots = i0 < 0 ? [0] : uniq([0, ...[0, Math.PI, Math.PI / 2, -Math.PI / 2].map(t => t + Math.PI / 2 - 2 * Math.PI * i0 / ring.length)]);
        for (const rot of rots) {
          const Rc = renderTile(T, statusOf, oth, sh, rot), a = G['m:' + sh], b = Rc.keptAt;
          if (!b || (rot && Rc.dirty && !wholeDirty())) continue; // turned only where it draws as cleanly as unturned
          const dx = ctr(a).cx - ctr(b).cx, dy = ctr(a).cy - ctr(b).cy;
          if (!clash(rectsOf(Rc, dx, dy), a) && !crosses(Rc, dx, dy, a)) { best = { R: Rc, dx, dy, oth, dups }; break; }
        }
        if (best && !best.dups) break;
      }
      if (best) { place(best.R, best.dx, best.dy); bridgeAll([...best.oth]); return; }
      let R;
      const a = G['m:' + anchor];
      if (leaf(anchor)) {
        const drop = new Set([...others, anchor]), r = touching(T, anchor)[0] || sideOf(T, anchor)[0], e = r.from === anchor ? r.to : r.from;
        // The step drawn between them needs room for its labels: its name, its cofactors' curl, a carrier's pill.
        // (Across, the cofactors and the carrier sit along the line; down, beside it.)
        const cof = r.cofactors?.in?.length || r.cofactors?.out?.length || r.requires?.length, room = [200 + (cof ? 260 : 0) + (r.via ? 160 : 0), 200 + (cof ? 100 : 0) + (r.via ? 60 : 0)];
        R = renderTile(T, statusOf, drop); place(R, ...nearby(R, 'm:' + e, a, room)); bridgeAll([...drop]); return;
      }
      // Neither copy is an end (oxaloacetate: between PC and PEPCK in one part, on the TCA ring in the other). Take it out
      // of the earlier part, whose steps into it are then drawn to this part's box, and let this part have the freed spot.
      const O = placed.find(P => P.T === tiles[owner[anchor]]);
      const O2 = O && renderTile(O.T, statusOf, new Set([...O.drop, anchor]), O.keep, O.rot);
      if (O2 && Object.entries(O2.pos).every(([k, r]) => O.pos[k] && Math.abs(O.pos[k].x - r.x) < 1 && Math.abs(O.pos[k].y - r.y) < 1)) {
        const was = new Set(O2.labels.map(l => `${l.x},${l.y}`));
        reserved.push(...O.labels.filter(l => !was.has(`${l.x},${l.y}`)).map(l => shift(l, O.dx, O.dy)));
        placed[placed.indexOf(O)] = Object.assign(O2, { dx: O.dx, dy: O.dy }); rebuild();
        R = renderTile(T, statusOf, others);
        const at = R.pos['m:' + anchor], sx = ctr(a).cx - ctr(at).cx, sy = ctr(a).cy - ctr(at).cy;
        place(R, ...(clash(rectsOf(R, sx, sy)) ? nearby(R, 'm:' + anchor, a) : [sx, sy]));
        touching(O.T, anchor).forEach(r => bridges.push(r));
        sideOf(O.T, anchor).forEach(r => sides.push((r.also_to || []).includes(anchor) ? [r.from, anchor, r] : [anchor, r.to, r]));
        bridgeAll([...others]); return;
      }
      R = renderTile(T, statusOf, others); place(R, ...nearby(R, 'm:' + anchor, a)); bridgeAll([...others]);
      dots.push({ a: 'm:' + anchor, R, label: 'same molecule' }); return;
    }
    // A step this part shares with one already placed, seen from the other side (methionine synthase): this part's arrow
    // runs beside its twin, the same way, a box-height or so apart, so the two read as one step. A ring may turn for it.
    const cp = (st.couples || []).map(([a, b]) => { const mine = T.p.reactions.find(r => r.id === a || r.id === b), other = mine && (mine.id === a ? b : a), P = mine && placed.find(P => P.sm.p.reactions.some(r => r.id === other));
      return P && { mine, theirs: P.sm.p.reactions.find(r => r.id === other), P }; }).find(Boolean);
    const X = cp && G['m:' + cp.theirs.from], Y = cp && G['m:' + cp.theirs.to];
    if (X && Y) {
      const cX = ctr(X), cY = ctr(Y), L = Math.hypot(cY.cx - cX.cx, cY.cy - cX.cy) || 1, ux = (cY.cx - cX.cx) / L, uy = (cY.cy - cX.cy) / L, mx = (cX.cx + cY.cx) / 2, my = (cX.cy + cY.cy) / 2;
      // Out from the other part's middle first (never into its ring).
      const pc = Object.values(cp.P.pos).map(ctr), ox = pc.reduce((n, c) => n + c.cx, 0) / pc.length + cp.P.dx, oy = pc.reduce((n, c) => n + c.cy, 0) / pc.length + cp.P.dy;
      const side = Math.sign(-uy * (mx - ox) + ux * (my - oy)) || 1, nx = -uy * side, ny = ux * side, onSteps = onStepsNow();
      // A ring may turn a quarter at a time (its side chains and labels are laid out for those, not for a diagonal).
      const rots = T.p.circular ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : [0];
      let got = null;
      for (const strict of [true, false]) {
        if (got) break;
        let best = Infinity;
        for (const rot of rots) {
          const R = renderTile(T, statusOf, new Set(), undefined, rot), U = R.pos['m:' + cp.mine.from], V = R.pos['m:' + cp.mine.to];
          if (!U || !V || (rot && R.dirty)) continue; // turned only where it still draws cleanly
          const cU = ctr(U), cV = ctr(V), W = Math.hypot(cV.cx - cU.cx, cV.cy - cU.cy) || 1;
          if (strict && Math.abs(((cV.cx - cU.cx) * ux + (cV.cy - cU.cy) * uy) / W) < 0.9) continue;
          const qx = (cU.cx + cV.cx) / 2, qy = (cU.cy + cV.cy) / 2;
          for (const d of [150, 200, 260, 330, 420, 520, 640, 780]) for (const sl of [0, 60, -60, 130, -130, 260, -260, 400, -400, 550, -550]) {
            const cost = d + 0.6 * Math.abs(sl); if (cost >= best) continue;
            const dx = mx + nx * d + ux * sl - qx, dy = my + ny * d + uy * sl - qy, rs = rectsOf(R, dx, dy);
            if (!clash(rs) && !onSteps(rs) && !overBoxes(R, dx, dy) && !crosses(R, dx, dy)) { got = [R, dx, dy]; best = cost; }
          }
        }
      }
      if (got) { place(...got); return; }
    }
    // No shared box, but the same molecule in another compartment: place it near, a transport arrow joins them.
    const jn = st.joins.find(([a, b]) => T.ids.includes(b) && G['m:' + a]);
    if (jn) { const R = renderTile(T, statusOf, new Set()); place(R, ...nearby(R, 'm:' + jn[1], G['m:' + jn[0]])); return; }
    // No shared box: follow a link between them, from either side.
    const prev = placed.map(P => P.T);
    let mine, theirs, via = '', paired = false;
    for (const P of prev) {
      const l = T.rawLinks.find(l => l.to === P.id), back = P.rawLinks.find(l => l.to === T.id);
      if (!l && !back) continue;
      mine = l ? T.mid[l.at] : T.ids[0]; theirs = back ? P.mid[back.at] : P.ids.find(id => G['m:' + id]); via = l?.via || back?.via || ''; // either side may name what passes between them
      // What passes between them is a coupled step's other half: its badges say so; no line as well.
      const inT = id => T.p.reactions.some(r => r.id === id), inP = id => P.p.reactions.some(r => r.id === id);
      paired = (st.couples || []).some(([a, b]) => (inT(a) && inP(b)) || (inT(b) && inP(a))); break;
    }
    const R = renderTile(T, statusOf, new Set()), tgt = G['m:' + theirs] || Object.values(G)[0];
    place(R, ...nearby(R, 'm:' + mine, tgt));
    if (mine && theirs && !paired) dots.push({ a: 'm:' + theirs, b: 'm:' + mine, R, label: via });
  });
  // A molecule still drawn by two parts (mid-pathway in both, like oxaloacetate in gluconeogenesis and on the TCA ring):
  // the earlier part lets go of it if that leaves the rest of its drawing where it was, and its steps go to the later
  // part's box. Otherwise the two copies are joined by a dotted "same molecule" line.
  for (let j = 1; j < placed.length; j++) for (const k of Object.keys(placed[j].pos)) {
    const i0 = placed.findIndex((P, x) => x < j && P.pos[k]); if (i0 < 0) continue;
    const O = placed[i0], id = k.slice(2), O2 = renderTile(O.T, statusOf, new Set([...O.drop, id]), O.keep, O.rot);
    if (Object.entries(O2.pos).every(([q, r]) => O.pos[q] && Math.abs(O.pos[q].x - r.x) < 1 && Math.abs(O.pos[q].y - r.y) < 1)) {
      const was = new Set(O2.labels.map(l => `${l.x},${l.y}`));
      reserved.push(...O.labels.filter(l => !was.has(`${l.x},${l.y}`)).map(l => shift(l, O.dx, O.dy)));
      placed[i0] = Object.assign(O2, { dx: O.dx, dy: O.dy });
      touching(O.T, id).forEach(r => bridges.push(r));
      sideOf(O.T, id).forEach(r => sides.push((r.also_to || []).includes(id) ? [r.from, id, r] : [id, r.to, r]));
    } else dots.push({ a: k, R: placed[j], label: 'same molecule' });
  }
  PROF('placed');
  rebuild();
  // Steps between parts, drawn like any other step (enzyme, cofactors) now that every box has its place.
  // Every box drawn, a molecule's second copy too (joined to the first by a dotted line), is a wall for what's routed now.
  DRAW_BOXES = uniq([...Object.values(G), ...placed.flatMap(P => Object.values(P.pos).map(r => shift(r, P.dx, P.dy)))].map(r => JSON.stringify({ x: r.x, y: r.y, w: r.w, h: r.h }))).map(t => JSON.parse(t));
  DRAW_LABELS = occ.filter(o => !o.box); TAB_SPOTS = [];
  // Where each compartment's name tab will go (above the top-left of the first box in its column): the names of the
  // steps between parts keep off it when they can (routeStepLabels).
  const zoneAt = g => { const w = g.R?.where?.[g.id], z = w && zoneKey(m, w.loc, w.tissue); return z && m.items['z:' + z] ? z : null; };
  for (const g of Object.values(G)) { const z = zoneAt(g); if (!z) continue;
    if (Object.values(G).some(o => o !== g && zoneAt(o) === z && Math.abs(o.x - g.x) < 10 && o.y < g.y && o.y > g.y - 300)) continue;
    TAB_SPOTS.push({ x: g.x - 2, y: g.y - 54, w: Math.min(220, (m.items['z:' + z].name || '').length * 8.1 + 16), h: 32 }); }
  let between = '';
  // A step between parts that one part already draws between the same two boxes (malate dehydrogenase: oxaloacetate to
  // malate in gluconeogenesis, malate to oxaloacetate on the TCA ring) is left to that arrow, unless it's being asked.
  const baseEnz = q => norm((m.p.enzymes[q.enzyme]?.name || q.enzyme || '').replace(/\s*\([^)]*\)\s*$/, ''));
  const quiet = r => statusOf('e:' + r.id) === 'shown' && cofParts(m, statusOf, r).every(p => p.st === 'shown' || p.st === 'hide');
  const drawnBy = (r, a, b) => a.R && a.R === b.R && a.R.sm.p.reactions.some(q => q.id !== r.id && ((q.from === r.from && q.to === r.to) || (q.from === r.to && q.to === r.from)) && baseEnz(q) === baseEnz(r));
  if (FLOOR) { VIA_X = []; MEMBRANE_SEGS = FLOOR.segs; ROUTE_FLOOR = FLOOR; FLOOR.alias = BANDS.alias; }
  else if (BANDED) { VIA_X = BANDS.slice(1).map(b => b.x0); ROUTE_BANDS = BANDS; } // the membranes: a carrier's pill sits on the one its step crosses
  for (const r0 of uniq(bridges)) {
    // Through a carrier already drawn from the same box: one pill, the line forking past it.
    const fork = BANDED && r0.via && PILL_FORK[r0.from + '|' + m.p.enzymes[r0.via]?.name], r = fork ? { ...r0, via: undefined } : r0;
    const a = fork ? { x: fork[0] - 1, y: fork[1] - 1, w: 2, h: 2 } : G['m:' + r.from], b = G['m:' + r.to];
    if (!a || !b || (quiet(r) && drawnBy(r, a, b))) continue;
    // When its names find no clean spot along the route it takes, another route wins if its names cover less (the first
    // clean one, shortest first; else the one that covers least).
    const keep = [drawn.length, DRAW_LABELS.length, COF_SPOTS.length, ALL_ROUTES.length], undo = () => { drawn.length = keep[0]; DRAW_LABELS.length = keep[1]; COF_SPOTS.length = keep[2]; ALL_ROUTES.length = keep[3]; };
    ROUTE_LABEL_MISS = 0; const tR = performance.now(); let svg = drawRoute(r, a, b); if (STITCH_PROF) { STITCH_PROF.n1 = (STITCH_PROF.n1 || 0) + 1; STITCH_PROF.first = (STITCH_PROF.first || 0) + performance.now() - tR; }
    if (ROUTE_LABEL_MISS) { if (STITCH_PROF) STITCH_PROF.retries = (STITCH_PROF.retries || 0) + 1; let best = [ROUTE_LABEL_MISS, null]; undo();
      const across = pts => 3 * DRAW_LABELS.filter(l => pts.slice(1).some((q, i) => segHits(pts[i], q, l))).length; // (the route itself through a name counts too)
      const noJog = pts => pts.slice(1).every((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) >= 24); // (never a little step into a box)
      // (The Map has many of these: fewer tries each.)
      for (const pts of (route(a, b, DRAW_BOXES, true, DRAW_LABELS, true) || []).filter(noJog).slice(0, FLOOR ? 6 : 24)) { const x = across(pts); if (x >= best[0]) continue; ROUTE_LABEL_MISS = 0; drawRoute(r, a, b, undefined, true, pts); undo(); if (ROUTE_LABEL_MISS + x < best[0]) best = [ROUTE_LABEL_MISS + x, pts]; if (!best[0]) break; }
      svg = drawRoute(r, a, b, undefined, true, best[1]); }
    between += svg;
  }
  // Same molecule, two compartments: a dashed transport arrow, from where it's made to where it's used.
  const madeOnly = id => m.p.reactions.some(r => r.to === id || (r.also_to || []).includes(id)) && !m.p.reactions.some(r => r.from === id || (r.also_from || []).includes(id));
  PROF('bridges');
  for (const [x, y] of st.joins) {
    if (m.p.reactions.some(r => (r.from === x && r.to === y) || (r.from === y && r.to === x))) continue; // a real step already joins them
    const [f, t] = madeOnly(y) && !madeOnly(x) ? [y, x] : [x, y], a = G['m:' + f], b = G['m:' + t];
    if (!a || !b) continue;
    between += drawRoute(null, a, b, 'ln trn');
  }
  for (const [f, t, r] of sides) {
    const a = G['m:' + f], b = G['m:' + t]; if (!a || !b) continue;
    between += drawRoute(null, a, b, rxCls(r)); // its enzyme (and any carrier) is already on the step's main arrow
  }
  for (const d of dots) {
    let a = G[d.a], b = d.b ? G[d.b] : (() => { const r = d.R.pos[d.a]; return r && shift(r, d.R.dx, d.R.dy); })();
    if (!a || !b) continue;
    // A link that names a molecule another step gives off ("fumarate", from argininosuccinate lyase): start the line at
    // that cofactor's label, beside its own step, and end at the other part's box of that name; both ends are named, so no tag.
    let fromCof = '';
    if (d.label && d.b) {
      const word = new RegExp(`(^|[^a-z])${d.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`);
      for (const [end, other] of [['a', 'b'], ['b', 'a']]) {
        const box = end === 'a' ? a : b, R = box.R, sp = (R?.cofs || []).find(c => word.test(c.text.toLowerCase()));
        if (!sp) continue;
        const at = shift(sp, R.dx, R.dy);
        d.sib = (R.cofs || []).filter(c => c !== sp && Math.abs(c.y - sp.y) < 16).map(c => shift(c, R.dx, R.dy)); // its neighbor on the same line ("Homocysteine + B12")
        if (end === 'a') a = { ...at, R }; else b = { ...at, R };
        d.label = ''; fromCof = end; break;
      }
    }
    // A box in one part that is a cofactor in the other (the TCA cycle's succinyl-CoA going into ALA synthase with B6):
    // join the box to that cofactor label, an arrow into it if it goes in, out of it if it comes out. No tag needed.
    let intoCof = '';
    if (!fromCof && d.b) for (const [end, other] of [['a', 'b'], ['b', 'a']]) {
      const box = end === 'a' ? a : b, far = other === 'a' ? a : b, name = baseMetName(m.p.metabolites[box.id]?.name || '');
      // (In its part's own drawing, or on a step drawn between parts, already in place: the one nearest that box.)
      const own = name && (far.R?.cofs || []).find(c => c.names.some(n => norm(n) === name)), dist = c => Math.hypot(c.x - far.x, c.y - far.y);
      const loose = !own && name && COF_SPOTS.filter(c => c.names.some(n => norm(n) === name)).sort((p, q) => dist(p) - dist(q))[0];
      const sp = own || loose;
      if (!sp) continue;
      const at = own ? { ...shift(sp, far.R.dx, far.R.dy), R: far.R } : { ...sp, R: far.R };
      d.sib = own ? (far.R.cofs || []).filter(c => c !== sp && Math.abs(c.y - sp.y) < 16).map(c => shift(c, far.R.dx, far.R.dy)) : COF_SPOTS.filter(c => c !== sp && Math.abs(c.y - sp.y) < 16 && Math.abs(c.x - sp.x) < 200);
      if (other === 'a') a = at; else b = at;
      d.label = ''; if (sp.side === 'out') fromCof = other; else intoCof = other;
      break;
    }
    // From a cofactor's label: straight out of the middle of its label (not off to one side), rounded corners, and an
    // arrowhead into the box it becomes, with a dot where it leaves, so the two read as one hand-off.
    if (intoCof) {
      // Box → the cofactor label it becomes an input to: an arrowhead into the label.
      const dst = intoCof === 'a' ? a : b, near = l => !(l.x < dst.x + dst.w + 6 && dst.x < l.x + l.w + 6 && l.y < dst.y + dst.h + 6 && dst.y < l.y + l.h + 6);
      const pts = gridRoute(a, b, [...DRAW_BOXES, ...(d.sib || [])], DRAW_LABELS.filter(near), drawn, allPts()) || route(a, b, [...DRAW_BOXES, ...(d.sib || [])], false, DRAW_LABELS.filter(near)) || route(a, b, DRAW_BOXES, false, DRAW_LABELS.filter(near)) || [[ctr(a).cx, ctr(a).cy], [ctr(a).cx, ctr(b).cy], [ctr(b).cx, ctr(b).cy]];
      let P = trim(pts, a, b); if (intoCof === 'a') P = P.reverse();
      drawn.push(...pts.slice(1).map((q, i) => [pts[i], q]));
      between += elbow(P, false, 'xline xhand');
      continue;
    }
    if (fromCof) {
      const src = fromCof === 'a' ? a : b, near = l => !(l.x < src.x + src.w + 6 && src.x < l.x + l.w + 6 && l.y < src.y + src.h + 6 && src.y < l.y + l.h + 6);
      const pts = gridRoute(a, b, [...DRAW_BOXES, ...(d.sib || [])], DRAW_LABELS.filter(near), drawn, allPts()) || route(a, b, [...DRAW_BOXES, ...(d.sib || [])], false, DRAW_LABELS.filter(near)) || route(a, b, DRAW_BOXES, false, DRAW_LABELS.filter(near)) || [[ctr(a).cx, ctr(a).cy], [ctr(a).cx, ctr(b).cy], [ctr(b).cx, ctr(b).cy]];
      let P = trim(pts, a, b); if (fromCof === 'b') P = P.reverse();
      drawn.push(...pts.slice(1).map((q, i) => [pts[i], q]));
      between += `<circle class="xdot" cx="${P[0][0]}" cy="${P[0][1]}" r="3"/>` + elbow(P, false, 'xline xhand');
      continue;
    }
    // Routed like the arrows (clear of boxes and labels, never along another line), its name on the longest leg.
    const pts = gridRoute(a, b, DRAW_BOXES, DRAW_LABELS, drawn, allPts()) || route(a, b, DRAW_BOXES, true, DRAW_LABELS) || [[ctr(a).cx, ctr(a).cy], [ctr(b).cx, ctr(a).cy], [ctr(b).cx, ctr(b).cy]];
    const P = trim(pts, a, b); drawn.push(...pts.slice(1).map((q, i) => [pts[i], q]));
    between += elbow(P, false, 'xline').replace(/<path class="ah"[^>]*\/>/, ''); // rounded corners, no arrowhead
    if (d.label) {
      // On a stretch of the line where it covers nothing; the middle of the longest leg if there's none.
      const w = d.label.length * 6.4 + 20, segs = P.slice(1).map((q, i) => [P[i], q]).sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]));
      const spots = segs.flatMap(([u, v]) => [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.12, 0.88].map(f => [u[0] + (v[0] - u[0]) * f, u[1] + (v[1] - u[1]) * f]));
      const area = (x, y) => [...DRAW_BOXES, ...DRAW_LABELS].reduce((n, r) => n + Math.max(0, Math.min(x + w / 2, r.x + r.w) - Math.max(x - w / 2, r.x)) * Math.max(0, Math.min(y + 11, r.y + r.h) - Math.max(y - 11, r.y)), 0);
      const [tx, ty] = spots.find(([x, y]) => !hitsBox({ x: x - w / 2, y: y - 11, w, h: 22 }) && !onAnyLine({ x: x - w / 2 + 6, y: y - 9, w: w - 12, h: 18 })) || spots.find(([x, y]) => !hitsBox({ x: x - w / 2, y: y - 11, w, h: 22 })) || spots.slice().sort((p, q) => area(...p) - area(...q))[0];
      DRAW_LABELS.push({ x: tx - w / 2, y: ty - 11, w, h: 22 });
      between += `<rect class="xtag" x="${tx - w / 2}" y="${ty - 11}" width="${w}" height="22" rx="11"/><text class="xtagt" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${esc(d.label)}</text>`;
    }
  }
  // Coupled steps: a matching lettered badge on each of the two arrows of one step (hover shows the pair, click goes to
  // the other one); with DRAW_PAIR_LINES (a view setting), also a dotted tie between them, named when they ended up apart.
  let pairBadges = '';
  for (const [pi, [a, b]] of (st.couples || []).entries()) {
    // Points along each arrow (the middle 70% of the part's own path that leaves one box and ends at the other, a curve
    // or an elbow), so the tie can join the two where they come closest.
    const ra = m.p.reactions.find(r => r.id === a), rb = m.p.reactions.find(r => r.id === b), along = r => {
      const f = G['m:' + r.from], t = G['m:' + r.to]; if (!f || !t) return null;
      if (routed[r.id]) { const Q = routed[r.id], seg = Q.slice(1).map((q, i) => [Q[i], q, Math.hypot(q[0] - Q[i][0], q[1] - Q[i][1])]), L = seg.reduce((n, s) => n + s[2], 0);
        const at = l => { for (const [u, v, d] of seg) { if (l <= d) return [u[0] + (v[0] - u[0]) * l / d, u[1] + (v[1] - u[1]) * l / d]; l -= d; } return Q[Q.length - 1]; };
        return Array.from({ length: 29 }, (_, i) => at(L * (0.15 + 0.7 * i / 28))); } // (an arrow drawn between parts: along its route)
      const P = placed.find(P => P.sm.p.reactions.includes(r)) || f.R, near = (x, y, b) => x > b.x - 24 && x < b.x + b.w + 24 && y > b.y - 24 && y < b.y + b.h + 24;
      const probe = pathProbe(), cands = []; // the longest that fits (a cofactor's curl can start and end near both boxes too)
      for (const pm of (P.body || '').matchAll(/<path class="(?:ln|xline)[^"]*" d="([^"]+)"/g)) { // arrows only (not curls or heads)
        probe.setAttribute('d', pm[1]); const L = probe.getTotalLength(), at = l => { const q = probe.getPointAtLength(l); return [q.x + P.dx, q.y + P.dy]; };
        if (L < 20 || !near(...at(0), f) || !near(...at(L), t)) continue;
        cands.push([L, Array.from({ length: 29 }, (_, i) => at(L * (0.15 + 0.7 * i / 28)))]);
      }
      for (const lm of (P.body || '').matchAll(/<line class="[^"]*" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)) { // a straight arrow
        const [x1, y1, x2, y2] = lm.slice(1).map(Number), u = [x1 + P.dx, y1 + P.dy], v = [x2 + P.dx, y2 + P.dy];
        if (!(near(...u, f) && near(...v, t)) && !(near(...u, t) && near(...v, f))) continue;
        cands.push([Math.hypot(v[0] - u[0], v[1] - u[1]), Array.from({ length: 29 }, (_, i) => { const k = 0.15 + 0.7 * i / 28; return [u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k]; })]);
      }
      if (cands.length) return cands.sort((a, b) => b[0] - a[0])[0][1];
      return [[(ctr(f).cx + ctr(t).cx) / 2, (ctr(f).cy + ctr(t).cy) / 2]]; };
    const A = ra && along(ra), B = rb && along(rb); if (!A || !B) continue;
    const letter = String.fromCharCode(65 + pi % 26), nm = id => (hidden(statusOf('m:' + id)) ? '?' : m.items['m:' + id]?.name || id), es = statusOf('e:' + a);
    const enz = es === 'shown' || es === 'peek' || es === 'dim' || es === 'focus' ? m.items['e:' + a]?.name || '' : '';
    for (const [r, o, pts] of [[ra, rb, A], [rb, ra, B]]) {
      const n = pts.length - 1, order = pts.map((q, i) => [Math.min(Math.abs(i - n * 0.2), Math.abs(i - n * 0.8) + 0.5), q]).sort((x, y) => x[0] - y[0]).map(t => t[1]); // near an end: the cofactor curl takes the middle
      const [x, y] = order.find(([x, y]) => !hitsBox({ x: x - 12, y: y - 12, w: 24, h: 24 })) || order[0]; DRAW_LABELS.push({ x: x - 12, y: y - 12, w: 24, h: 24 });
      const me = `${nm(r.from)} → ${nm(r.to)}`, other = `${nm(o.from)} → ${nm(o.to)}`;
      pairBadges += `<g class="pairbadge" data-pair="${letter}" data-me="${esc(r.id)}" data-other="${esc(o.id)}" data-enz="${esc(enz)}" data-here="${esc(me)}" data-there="${esc(other)}" role="button" tabindex="0" aria-label="${esc(`Paired step ${letter}: ${enz || 'one enzyme'} does ${me} and ${other} at once. Go to the other half.`)}"><circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${letter}</text></g>`;
    }
    if (!DRAW_PAIR_LINES) continue;
    // The closest pair whose straight line covers no box or label (the closest of all if none is clear).
    const clear = (u, v) => ![...DRAW_BOXES, ...DRAW_LABELS].some(r => { for (let f = 0.08; f < 0.93; f += 0.04) { const x = u[0] + (v[0] - u[0]) * f, y = u[1] + (v[1] - u[1]) * f; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true; } return false; });
    const pairs = A.flatMap(u => B.map(v => [Math.hypot(u[0] - v[0], u[1] - v[1]), u, v])).sort((x, y) => x[0] - y[0]);
    const [, p, q] = pairs.slice(0, 200).find(([d, u, v]) => d < 320 && clear(u, v)) || pairs[0];
    // Side by side: a straight tie. Apart: routed like the other joins, clear of boxes, and named.
    const far = Math.hypot(q[0] - p[0], q[1] - p[1]) > 320, dot = c => ({ x: c[0] - 4, y: c[1] - 4, w: 8, h: 8 });
    const blocked = [...DRAW_BOXES, ...DRAW_LABELS].some(r => { for (let f = 0.08; f < 0.93; f += 0.04) { const x = p[0] + (q[0] - p[0]) * f, y = p[1] + (q[1] - p[1]) * f; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true; } return false; });
    const pts = (far || blocked) && (gridRoute(dot(p), dot(q), DRAW_BOXES, DRAW_LABELS, drawn, allPts()) || route(dot(p), dot(q), [...DRAW_BOXES, ...DRAW_LABELS]) || route(dot(p), dot(q), DRAW_BOXES, false, DRAW_LABELS)), P = pts || [p, q];
    between += elbow(P, false, 'xline xhand couple').replace(/<path class="ah"[^>]*\/>/, '') + `<circle class="xdot" cx="${p[0]}" cy="${p[1]}" r="3"/><circle class="xdot" cx="${q[0]}" cy="${q[1]}" r="3"/>`;
    if (far) {
      const segs = P.slice(1).map((v, i) => [P[i], v]).sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]));
      const label = 'same step', w = label.length * 6.4 + 20, spots = segs.flatMap(([[u0, u1], [v0, v1]]) => [0.5, 0.3, 0.7, 0.2, 0.8].map(f => [u0 + (v0 - u0) * f, u1 + (v1 - u1) * f]));
      const [tx, ty] = spots.find(([x, y]) => !hitsBox({ x: x - w / 2, y: y - 11, w, h: 22 })) || spots[0]; DRAW_LABELS.push({ x: tx - w / 2, y: ty - 11, w, h: 22 });
      between += `<rect class="xtag" x="${tx - w / 2}" y="${ty - 11}" width="${w}" height="22" rx="11"/><text class="xtagt" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${label}</text>`;
    }
  }
  DRAW_BOXES = []; TAB_SPOTS = [];
  // (Timing: also how often lines cross — two arrows between parts, or one through a part's own lines.)
  if (STITCH_PROF) {
    const segsOf = P => P.slice(1).map((q, i) => [P[i], q]), hv = ([p, q]) => Math.abs(p[1] - q[1]) < 1;
    const cross = ([a, b], [c, d]) => { const [h, v] = hv([a, b]) ? [[a, b], [c, d]] : [[c, d], [a, b]]; if (hv(v) || !hv(h)) return false;
      const y = h[0][1], x = v[0][0]; return x > Math.min(h[0][0], h[1][0]) + 2 && x < Math.max(h[0][0], h[1][0]) - 2 && y > Math.min(v[0][1], v[1][1]) + 2 && y < Math.max(v[0][1], v[1][1]) - 2; };
    let rr = 0, rp = 0; const S = ALL_ROUTES.map(segsOf);
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) for (const s1 of S[i]) for (const s2 of S[j]) if (cross(s1, s2)) rr++;
    // (A part's lines are sampled every 12 px: a line crosses an arrow where two neighboring samples fall either side of it.)
    const pairs = placed.flatMap(P => (P.pts || []).slice(1).map((q, i) => [[P.pts[i][0] + P.dx, P.pts[i][1] + P.dy], [q[0] + P.dx, q[1] + P.dy]]).filter(([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 16));
    for (const segs of S) for (const [[x0, y0], [x1, y1]] of segs) { const lo = [Math.min(x0, x1), Math.min(y0, y1)], hi = [Math.max(x0, x1), Math.max(y0, y1)], h = Math.abs(y0 - y1) < 1;
      for (const [a, b] of pairs) if (h ? (a[1] - y0) * (b[1] - y0) < 0 && a[0] > lo[0] + 20 && a[0] < hi[0] - 20 : (a[0] - x0) * (b[0] - x0) < 0 && a[1] > lo[1] + 20 && a[1] < hi[1] - 20) rp++; }
    STITCH_PROF.crossArrows = rr; STITCH_PROF.crossLines = rp;
    STITCH_PROF.stubList = ALL_ROUTES.filter(P => P.length > 2 && [[P[0], P[1]], [P[P.length - 2], P[P.length - 1]]].some(([u, v]) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 30)).map(P => ({ P: P.map(q => q.map(Math.round)), ab: P.ab.map(r => [r.x, r.y, r.w, r.h].map(Math.round)) }));
    STITCH_PROF.stubs = ALL_ROUTES.filter(P => P.length > 2 && [[P[0], P[1]], [P[P.length - 2], P[P.length - 1]]].some(([u, v]) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 30)).length; // (ends that arrive as a short stub)
  }
  PROF('dots+badges');
  let bg = '', fg = '';
  const regions = [], tabs = [];
  if (BANDED) {
    // Bands: each compartment one tinted column from the top of the drawing to the bottom, a membrane line between
    // neighbors, its name at its top-left.
    let ya = Infinity, yb = -Infinity;
    for (const R of placed) { ya = Math.min(ya, R.vb[1] + R.dy); yb = Math.max(yb, R.vb[1] + R.vb[3] + R.dy); }
    for (const l of DRAW_LABELS) { ya = Math.min(ya, l.y); yb = Math.max(yb, l.y + l.h); }
    for (const [p, q] of drawn) { ya = Math.min(ya, p[1], q[1]); yb = Math.max(yb, p[1], q[1]); }
    ya -= 56; yb += 24;
    ZONE_INLINE_DONE = false;
    // The Map's floorplan: each region tinted (the outer ones running on to the canvas edges), membranes on the edges
    // between regions, each compartment named once at the top-left of its first region.
    if (FLOOR && FLOOR.rects.some(r => m.items['z:' + r.z] && statusOf('z:' + r.z) !== 'hide')) {
      const named = new Set();
      for (const r of FLOOR.rects) {
        const b = r.bleed || '', x0 = b.includes('l') ? r.x - BLEED : r.x, x1 = b.includes('r') ? r.x + r.w + BLEED : r.x + r.w, y0 = b.includes('t') ? r.y - BLEED : r.y, y1 = b.includes('b') ? r.y + r.h + BLEED : r.y + r.h;
        bg += `<g class="blob"><path class="t-${zoneTone(r.z)}" d="M${x0},${y0}H${x1}V${y1}H${x0}Z"/></g>`; regions.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      }
      for (const [x1, y1, x2, y2] of FLOOR.segs) bg += `<line class="cellwall" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      ZONE_INLINE_DONE = false;
      for (const r of FLOOR.rects) { let ty = r.y + 10;
        for (const z of r.zs || [r.z]) { if (named.has(z)) continue; named.add(z);
          const zi = m.items['z:' + z]; if (!zi) continue;
          const tw = Math.min(260, (zi.name || '').length * 8.1 + 16), T0 = { x: r.x + 12, y: ty, w: tw, h: 22 }; tabs.push(T0); ty += 28; // (several in one region: one under another)
          fg += `<rect class="legend" x="${T0.x}" y="${T0.y}" width="${T0.w}" height="${T0.h}" rx="5" data-at="corner-top"/>` + zoneLabel(m, statusOf, z, T0.x + 7, T0.y + 15, 'start'); } }
    } else if (!FLOOR && BANDS.some(b => m.items['z:' + b.z] && statusOf('z:' + b.z) !== 'hide')) BANDS.forEach((b, i) => {
      const r = { x: b.x0, y: ya, w: b.x1 - b.x0, h: yb - ya }; regions.push(r);
      // The tint runs on past the drawing to the edges of the canvas (as a grid's columns do); the outer bands sideways too.
      const bx0 = i ? b.x0 : b.x0 - BLEED, bx1 = i < BANDS.length - 1 ? b.x1 : b.x1 + BLEED;
      bg += `<g class="blob"><path class="t-${zoneTone(b.z)}" d="M${bx0},${ya - BLEED}H${bx1}V${yb + BLEED}H${bx0}Z"/></g>`;
      if (i) bg += `<line class="cellwall" x1="${b.x0}" x2="${b.x0}" y1="${ya - BLEED}" y2="${yb + BLEED}"/>`;
      const zi = m.items['z:' + b.z], name = zi?.name || b.z.split('|')[0], tw = Math.min(260, name.length * 8.1 + 16), R0 = { x: b.x0 + 12, y: ya + 10, w: tw, h: 22 };
      if (!zi) return;
      tabs.push(R0);
      fg += `<rect class="legend" x="${R0.x}" y="${R0.y}" width="${R0.w}" height="${R0.h}" rx="5" data-at="corner-top"/>` + zoneLabel(m, statusOf, b.z, R0.x + 7, R0.y + 15, 'start');
    });
  } else {
  // Compartments, once for the whole picture: each one is a tinted shape that follows its own boxes and the steps
  // between them (one flat tint, however the pieces overlap), named once per connected piece.
  const zoneOf = {}, pad = b => ({ x: b.x - 37, y: b.y - 49, w: b.w + 74, h: b.h + 86 }); // (the outline is pulled in 11 px from these)
  // Every box drawn, a molecule's second copy too (TCA's oxaloacetate beside gluconeogenesis's): each one is held.
  const GB = { ...G }; placed.forEach((P, pi) => Object.entries(P.pos).forEach(([k, r]) => { const q = shift(r, P.dx, P.dy); if (G[k] && !same(G[k], q)) GB[k + '#' + pi] = { ...q, R: P, id: k.slice(2) }; }));
  for (const [k, g] of Object.entries(GB)) { const w = g.R.where[g.id], z = w && zoneKey(m, w.loc, w.tissue); if (z && m.items['z:' + z]) zoneOf[k] = z; }
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const bbox = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
  const shapes = {};
  for (const [k, z] of Object.entries(zoneOf)) (shapes[z] = shapes[z] || []).push(pad(GB[k]));
  const foreign = z => Object.entries(zoneOf).filter(([, z2]) => z2 !== z).map(([k]) => pad(GB[k]));
  const join = (pairs, z0) => { for (const [f, t] of pairs) {
    const z = z0 || zoneOf['m:' + f]; if (!z || zoneOf['m:' + t] !== z || !G['m:' + f] || !G['m:' + t]) continue;
    const u = bbox(pad(G['m:' + f]), pad(G['m:' + t]));
    if (!foreign(z).some(o => hit(u, o))) shapes[z].push(u);
  } };
  // Along every step, along the dotted joins between parts, and across the middle of a ring that's all in one place.
  join(m.p.reactions.flatMap(r => [[r.from, r.to], ...(r.also_to || []).map(x => [r.from, x]), ...(r.also_from || []).map(x => [x, r.to])]));
  join(dots.filter(d => d.b).map(d => [d.a.slice(2), d.b.slice(2)]));
  for (const R of placed) if (R.sm.p.circular) {
    const ring = R.sm.spineMets.filter(id => R.pos['m:' + id]), zr = id => R.where[id] && zoneKey(m, R.where[id].loc, R.where[id].tissue), z = zr(ring[0]);
    if (!z || !shapes[z] || ring.some(id => zr(id) !== z)) continue;
    const cs = ring.map(id => ctr(shift(R.pos['m:' + id], R.dx, R.dy))), xs = cs.map(c => c.cx), ys = cs.map(c => c.cy); // between the box centers: the ring's middle
    const u = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (!foreign(z).some(o => hit(u, o))) shapes[z].push(u);
  }
  ZONE_INLINE_DONE = false;
  // The lines drawn between parts, as thin rectangles: a name tab never sits on one.
  // ...nor on any part's own lines (their sampled points, in the bucket index).
  const onLine = r => { index(); for (let i = Math.floor((r.x - 3) / B); i <= Math.floor((r.x + r.w + 3) / B); i++) for (let j = Math.floor((r.y - 3) / B); j <= Math.floor((r.y + r.h + 3) / B); j++) { const ps = XI.pts.get(bucketKey(i, j)); if (ps && ps.some(([x, y]) => inside(x, y, r, 3))) return true; } return false; };
  const onBox = r => Object.values(GB).some(b => hit(r, { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }));
  const lineRects = drawn.map(([p, q]) => ({ x: Math.min(p[0], q[0]) - 2, y: Math.min(p[1], q[1]) - 2, w: Math.abs(q[0] - p[0]) + 4, h: Math.abs(q[1] - p[1]) + 4 }));
  // Every label (a step's name and cofactors, a carrier's pill, a tag) stays wholly inside one compartment: only arrows
  // cross an edge. Each belongs to the compartment of the box nearest it, which keeps it with a margin, the edge bending
  // around it where a step between compartments puts its name in the gap.
  const zoned = Object.entries(GB).map(([k, r]) => ({ z: zoneOf[k], r })), LM = 16; // (a label nearest a box with no compartment has none either)
  // A step from one compartment into another has its name in the gap between them: it goes with the compartment its
  // enzyme works in (hexokinase: the cytosol, not the blood its glucose comes from), else the one it starts in.
  const tagged = new Map(); // a label drawn along a step between parts → its compartment
  const crossing = m.p.reactions.flatMap(r => { const a = G['m:' + r.from], b = G['m:' + r.to], za = zoneOf['m:' + r.from], zb = zoneOf['m:' + r.to];
    if (!a || !b || !za || !zb || za === zb) return [];
    const P = routed[r.id], cs = P ? P : [[a.x + a.w / 2, a.y + a.h / 2], [b.x + b.w / 2, b.y + b.h / 2]];
    const x0 = Math.min(...cs.map(c => c[0])), x1 = Math.max(...cs.map(c => c[0])), y0 = Math.min(...cs.map(c => c[1])), y1 = Math.max(...cs.map(c => c[1]));
    const zr = r.loc && zoneKey(m, r.loc, r.tissue || (zoneTissue(za) === zoneTissue(zb) ? zoneTissue(za) : undefined)), z = zr === zb ? zb : za, far = z === za ? b : a; // (where its enzyme works, when that's one of the two)
    (routeLab[r.id] || []).forEach(l => tagged.set(l, z));
    return [{ z, a, b: far, r: { x: x0 - 250, y: y0 - 30, w: x1 - x0 + 500, h: y1 - y0 + 60 } }]; });
  const labelHolds = [...placed.flatMap(P => P.labels.map(l => shift(l, P.dx, P.dy))), ...DRAW_LABELS].flatMap(l => {
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2; if (!l.w || !l.h || Object.values(GB).some(b => cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h)) return [];
    const own = { x: l.x - LM, y: l.y - LM, w: l.w + 2 * LM, h: l.h + 2 * LM };
    // (never over a box of another compartment, or of none: holding the label would swallow it)
    const alien = (z, q) => Object.entries(GB).some(([k, b]) => zoneOf[k] !== z && hit(q, { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 }));
    if (tagged.has(l)) return alien(tagged.get(l), own) ? [] : [{ z: tagged.get(l), r: own, hold: true }];
    const cr = crossing.find(c => cx > c.r.x && cx < c.r.x + c.r.w && cy > c.r.y && cy < c.r.y + c.r.h && !hit(own, { x: c.b.x - 8, y: c.b.y - 8, w: c.b.w + 16, h: c.b.h + 16 }));
    if (cr) return alien(cr.z, own) ? [] : [{ z: cr.z, r: own, hold: true }];
    const d = r => Math.hypot(Math.max(r.x - cx, 0, cx - r.x - r.w), Math.max(r.y - cy, 0, cy - r.y - r.h)), nb = zoned.reduce((b, o) => (!b || d(o.r) < d(b.r) ? o : b), null);
    if (!nb?.z) return []; const joined = bbox(own, pad(nb.r)); // (with its box when that's clear: one smooth bulge, not a notch per label)
    return alien(nb.z, own) ? [] : [{ z: nb.z, r: foreign(nb.z).some(o => hit(joined, o)) || alien(nb.z, joined) ? own : joined }]; });
  for (const { z, r } of labelHolds) shapes[z].push(r);
  // Each connected piece is one shape: a plain rounded rectangle when the corner it would leave out is empty anyway,
  // else its own outline, fitting around the other compartment like a puzzle piece.
  const pieces = {}, boxOf = g => g.reduce(bbox);
  const group = rs => { const comp = rs.map((_, i) => i), find = i => (comp[i] === i ? i : (comp[i] = find(comp[i])));
    rs.forEach((a, i) => rs.forEach((b, j) => { if (j > i && hit(a, b)) comp[find(i)] = find(j); }));
    const groups = {}; rs.forEach((r, i) => (groups[find(i)] = groups[find(i)] || []).push(r)); return Object.values(groups); };
  for (const [z, rs] of Object.entries(shapes)) {
    let gs = group(rs);
    // Two pieces of one compartment close together, with nothing of another compartment (or of none) between them,
    // become one: a strip joins them across the gap (the nearest facing sides, at least 120 px of them face to face).
    const obst = [...Object.entries(GB).filter(([k]) => zoneOf[k] !== z).map(([, b]) => ({ x: b.x - 30, y: b.y - 30, w: b.w + 60, h: b.h + 60 })), ...labelHolds.filter(h => h.z !== z).map(h => h.r)];
    for (let pass = 0; pass < 4 && gs.length > 1; pass++) {
      let best = null;
      gs.forEach((A, i) => gs.forEach((B, j) => { if (j <= i) return; for (const a of A) for (const b of B) {
        const ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w), oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.h, b.y + b.h);
        let br = null, gap = Infinity;
        if (ox1 - ox0 >= 120) { const [t, u] = a.y < b.y ? [a, b] : [b, a]; gap = u.y - t.y - t.h; br = { x: ox0, y: t.y + t.h - 1, w: ox1 - ox0, h: gap + 2 }; }
        else if (oy1 - oy0 >= 120) { const [l, q] = a.x < b.x ? [a, b] : [b, a]; gap = q.x - l.x - l.w; br = { x: l.x + l.w - 1, y: oy0, w: gap + 2, h: oy1 - oy0 }; }
        if (br && gap > 0 && gap <= 320 && (!best || gap < best.gap) && !obst.some(o => hit(br, o))) best = { br, gap }; } }));
      if (!best) break;
      rs.push(best.br); gs = group(rs);
    }
    pieces[z] = gs;
  }
  // A piece too narrow for its name tab (one box in "kidney, colon, salivary glands, placenta · smooth ER") widens along
  // its top to fit it, when that runs into no other compartment; else the tab goes just outside it.
  for (const [z, gs] of Object.entries(pieces)) {
    const tw = (m.items['z:' + z]?.name || '').length * 8.1 + 16, need = tw + 32;
    for (const g of gs) {
      const b = boxOf(g); if (Math.max(...g.map(r => r.w)) >= need) continue;
      const wide = { x: b.x + b.w / 2 - need / 2, y: b.y, w: need, h: Math.min(b.h, 64) };
      const others = [...foreign(z), ...Object.entries(pieces).filter(([z2]) => z2 !== z).flatMap(([, g2]) => g2.flat())];
      if (!others.some(o => hit(wide, o)) && !Object.entries(GB).some(([k, r]) => zoneOf[k] !== z && hit(wide, r))) g.push(wide);
    }
  }
  // Its own boxes (padded) are never cut; the filler between them (joins, a ring's middle) may be.
  const ownBoxes = z => Object.entries(zoneOf).filter(([, z2]) => z2 === z).map(([k]) => pad(GB[k]));
  // One partition for all of them (zonePartition): every corner concentric with the one it wraps.
  // A piece's area is its bounding box when that holds no other compartment's box; else just its own rectangles (its
  // boxes and the joins between them), so it never claims the space around another pathway's boxes.
  // (lab: its top is a label's, which the merging of edges must not cut into)
  const labelRects = new Set(labelHolds.map(h => h.r));
  const part = zonePartition(Object.entries(pieces).flatMap(([z, gs]) => gs.flatMap(g => { const b = boxOf(g); return foreign(z).some(o => hit(b, o)) ? g.map(r => ({ z, r, lab: labelRects.has(r) })) : [{ z, r: b, lab: g.some(r => labelRects.has(r) && Math.abs(r.y - b.y) < 1) }]; })),
    [...Object.entries(zoneOf).map(([k, z]) => ({ z, r: pad(GB[k]), box: { x: GB[k].x - 14, y: GB[k].y - 14, w: GB[k].w + 28, h: GB[k].h + 28 } }))], REGION_R, REGION_GAP,
    Object.entries(GB).filter(([k]) => !zoneOf[k]).map(([, b]) => ({ x: b.x - 14, y: b.y - 14, w: b.w + 28, h: b.h + 28 })));
  for (const [z, ps] of Object.entries(part)) bg += `<g class="blob">${ps.map(P => `<path class="t-${zoneTone(z)}" fill-rule="evenodd" d="${P.d}"/>`).join('')}</g>`;
  // (Not the spots kept free for labels while parts were placed: those are empty now.)
  const seen = occ.filter(o => !reserved.includes(o));
  // A fully free spot for a w × h tab inside a piece's rows, or null.
  const tabFree = (g, w, h) => { for (const r of g) for (let y = r.y + 4; y <= r.y + r.h - h - 4; y += 16) for (let x = r.x + 12; x <= r.x + r.w - 12 - w; x += 24) { const t = { x, y, w, h };
    if (![...seen, ...DRAW_LABELS, ...lineRects].some(o => hit(t, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 })) && !tabs.some(o => hit(t, o)) && !onLine(t)) return t; } return null; };
  for (const [z, ps] of Object.entries(part)) {
    // Named once per neighborhood, as a wall chart does: the biggest piece first; a piece within 600 px of one already
    // named (the cytosol either side of a vesicle) goes without.
    const named = [], near = (a, b) => a.x - 600 < b.x + b.w && b.x - 600 < a.x + a.w && a.y - 600 < b.y + b.h && b.y - 600 < a.y + a.h;
    const others = Object.entries(part).filter(([z2]) => z2 !== z).flatMap(([, p2]) => p2.flatMap(P => P.runs));
    for (const P of ps.slice().sort((p, q) => q.bbox.w * q.bbox.h - p.bbox.w * p.bbox.h)) {
      const b0 = P.bbox;
      // Every piece is named (one close by of the same compartment has been joined to it already), bar a sliver too
      // narrow for its name with a named piece of the same compartment near it.
      const zw = ((m.items['z:' + z]?.name || '').split(' · ').reduce((a, t) => Math.max(a, t.length), 0)) * 8.1 + 48;
      if (Math.max(...P.runs.map(r => r.w)) < zw && named.some(n => near(n, b0))) { regions.push(b0); continue; }
      named.push(b0);
      const g = P.runs; // where its name can go: along the piece's own rows
      // On a top edge, left or right end, wherever it doesn't cover a label or box (topmost edge first).
      // A name wider than the piece (one box in "testes (Leydig cells) · smooth ER") goes on two lines: place, then compartment.
      const zi = m.items['z:' + z], name = zi?.name || '', room = Math.max(...g.map(r => r.w)), zst = zi ? statusOf(zi.key) : 'shown';
      // (Also when one line finds no free spot: two lines are narrower.)
      // Wrapped: at the "·" first (place, then compartment), then at spaces, to the piece's width.
      const wrapTo = w => { const max = Math.max(8, Math.floor((w - 16) / 8.1)), out = [];
        for (const part of name.split(' · ')) { let line = ''; for (const word of part.split(' ')) { if (line && (line + ' ' + word).length > max) { out.push(line); line = word; } else line = line ? line + ' ' + word : word; } out.push(line); } return out; };
      const canTwo = name.includes(' ') && !hidden(zst) && zst !== 'hide';
      let two = canTwo && (name.length * 8.1 + 16 > room - 16 || tabFree(g, name.length * 8.1 + 16, 18) === null) ? (name.includes(' · ') && Math.max(...name.split(' · ').map(t => t.length)) * 8.1 + 16 <= room - 16 ? name.split(' · ') : wrapTo(room - 24)) : null;
      let tw = two ? Math.max(...two.map(t => t.length)) * 8.1 + 16 : name.length * 8.1 + 16, TH = two ? 4 + 14 * two.length : 18;
      const free = r => ![...seen, ...DRAW_LABELS, ...lineRects].some(o => hit(r, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 })) && !tabs.some(o => hit(r, o)) && !onLine(r);
      // Always the same place first, like a folder tab: on the shape's top edge, at its left end, sliding right along
      // that edge (then along any lower top edge) only when something is in the way.
      const topSegs = g.flatMap(r => { let segs = [[r.x, r.x + r.w]];
        for (const o of g) if (o !== r && o.y + o.h <= r.y + 1 && o.y + o.h >= r.y - REGION_GAP - 2) segs = segs.flatMap(([a, b]) => [[a, Math.min(b, o.x)], [Math.max(a, o.x + o.w), b]]).filter(([a, b]) => b - a > 1);
        return segs.map(([a, b]) => ({ y: r.y, a, b })); }).sort((p, q) => p.y - q.y || p.a - q.a);
      // (The bottom edge, the same way, when no top edge has room: the one other place a name goes.)
      const botSegs = g.flatMap(r => { let segs = [[r.x, r.x + r.w]];
        for (const o of g) if (o !== r && o.y >= r.y + r.h - 1 && o.y <= r.y + r.h + REGION_GAP + 2) segs = segs.flatMap(([a, b]) => [[a, Math.min(b, o.x)], [Math.max(a, o.x + o.w), b]]).filter(([a, b]) => b - a > 1);
        return segs.map(([a, b]) => ({ y: r.y + r.h, a, b })); }).sort((p, q) => q.y - p.y || p.a - q.a);
      const along = (es, dy) => es.flatMap(e => { const o = []; for (let x = e.a + 24; x <= e.b - 14 - tw; x += 16) o.push({ x, y: e.y + dy, edge: true }); return o; });
      // No room on the top edge for it as it is: narrower, on more lines (up to four), when that fits there.
      const fits = () => along(topSegs, -Math.min(TH / 2, 16)).some(q => { const t = { ...q, w: tw, h: TH };
        return ![...seen, ...DRAW_LABELS].some(o => hit(t, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 })) && !tabs.some(o => hit(t, o)) && !others.some(o => hit(t, o)); });
      if (canTwo && !fits()) { const was = [two, tw, TH];
        for (let w = tw - 16; w >= 90; w -= 16) { const L = wrapTo(w); if (L.length > 4) break;
          [two, tw, TH] = [L, Math.max(...L.map(t => t.length)) * 8.1 + 16, 4 + 14 * L.length]; if (fits()) break; [two, tw, TH] = was; } }
      // (A tab of three or four lines hangs down into its own compartment rather than across the gap above.)
      const top = along(topSegs, -Math.min(TH / 2, 16)), edge = [...top, ...along(botSegs, -TH / 2)];
      // Turned on its side down the left edge, reading upward: the corner's other arm, for when the top edge is busy.
      const leftSegs = g.flatMap(r => { let segs = [[r.y, r.y + r.h]];
        for (const o of g) if (o !== r && o.x + o.w <= r.x + 1 && o.x + o.w >= r.x - REGION_GAP - 2) segs = segs.flatMap(([a, b]) => [[a, Math.min(b, o.y)], [Math.max(a, o.y + o.h), b]]).filter(([a, b]) => b - a > 1);
        return segs.map(([a, b]) => ({ x: r.x, a, b })); }).sort((p, q) => p.a - q.a || p.x - q.x);
      const side = leftSegs.flatMap(e => { const o = []; for (let y = e.a + 24; y <= e.b - 14 - tw; y += 16) o.push({ x: e.x - Math.min(TH / 2, 16), y, edge: true, vert: true }); return o; });
      const rectOf = q => (q.vert ? { x: q.x, y: q.y, w: TH, h: tw } : { x: q.x, y: q.y, w: tw, h: TH });
      // The corner first, either way round: the top edge's left end, then the left edge's top end (each may slide a little).
      const t0 = top.filter(q => q.y === top[0]?.y && q.x - top[0].x <= 96), s0 = side.filter(q => q.x === side[0]?.x && q.y - side[0].y <= 96);
      const spots = [...edge, ...g.slice().sort((a, b) => a.y - b.y || a.x - b.x).flatMap(r => [{ x: r.x + 12, y: r.y + 4 }, { x: r.x + r.w - 12 - tw, y: r.y + 4 }, { x: r.x + r.w / 2 - tw / 2, y: r.y + 4 }, { x: r.x + 12, y: r.y + r.h - TH - 4 }, { x: r.x + r.w - 12 - tw, y: r.y + r.h - TH - 4 },
        { x: r.x + r.w / 2 - tw / 2, y: r.y + r.h - TH - 4 }, { x: r.x + 12, y: r.y - TH / 2 }, { x: r.x + r.w - 12 - tw, y: r.y - TH / 2 }, { x: r.x + 12, y: r.y + r.h - TH / 2 }])]; // then inside it
      // Then anywhere along each edge, a step at a time, inside the shape or on its border.
      g.forEach(r => { for (const y of [r.y + 4, r.y + r.h - TH - 4, r.y - TH / 2, r.y + r.h - TH / 2]) for (let x = r.x + 12; x <= r.x + r.w - 12 - tw; x += 20) spots.push({ x, y }); });
      // Anywhere inside the piece, a step at a time.
      g.forEach(r => { for (let y = r.y + 4; y <= r.y + r.h - TH - 4; y += 16) for (let x = r.x + 12; x <= r.x + r.w - 12 - tw; x += 24) spots.push({ x, y }); });
      // Nowhere fully free: the spot it covers least of (labels count most), just outside the shape too.
      // (Just outside it, touching its edge: only when nothing on or inside it is clear. Never further away.)
      g.forEach(r => spots.push({ x: r.x + 12, y: r.y + r.h + 3, out: true }, { x: r.x + 12, y: r.y - TH - 4, out: true }, { x: r.x + r.w - 4 - tw, y: r.y + r.h / 2 - TH / 2 }, { x: r.x + r.w + 6, y: r.y + r.h / 2 - TH / 2, out: true }, { x: r.x - tw - 6, y: r.y + r.h / 2 - TH / 2, out: true }, { x: r.x - tw - 6, y: r.y + 4, out: true }));
      const cost = q => { const t = rectOf(q); return (onLine(t) ? 4 : 0) + [...seen, ...DRAW_LABELS, ...lineRects].filter(o => hit(t, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 })).length * 2 + tabs.filter(o => hit(t, o)).length * 3 + others.filter(o => hit(t, o)).length; };
      // On the top edge a line may pass under the tab (it's opaque): the same place beats a clear one elsewhere.
      const under = q => { const t = rectOf(q); return ![...seen, ...DRAW_LABELS].some(o => hit(t, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 })) && !tabs.some(o => hit(t, o)) && !others.some(o => hit(t, o)); };
      const clear = q => free(rectOf(q)) && !others.some(o => hit(rectOf(q), o));
      // Never on a line or a label while any clear spot is left: the corner, either edge, its bottom edge, then inside it.
      // Only when nothing anywhere is clear does a line pass under it (it's opaque) or it cover the least it can.
      const inn = spots.filter(q => !q.out);
      const at = t0.find(clear) || s0.find(clear) || top.find(clear) || side.find(clear) || edge.find(clear) || inn.find(clear) ||
        top.find(under) || edge.find(under) || spots.find(q => q.out && clear(q)) || inn.filter(q => !onBox(rectOf(q))).sort((p, q) => cost(p) - cost(q))[0] || spots.slice().sort((p, q) => cost(p) - cost(q))[0];
      const R0 = rectOf(at); tabs.push(R0);
      fg += `<rect class="legend" x="${R0.x}" y="${R0.y}" width="${R0.w}" height="${R0.h}" rx="5" data-room="${Math.round(at.vert ? Infinity : room)}" data-at="${t0.includes(at) ? 'corner-top' : s0.includes(at) ? 'corner-left' : top.includes(at) ? 'top' : side.includes(at) ? 'left' : at.edge ? 'bottom' : 'other'}"/>` + // data-room: the widest stretch of its shape, for the layout audit
        (at.vert ? `<g transform="translate(${R0.x},${R0.y + R0.h}) rotate(-90)">` : '') + (two
        ? two.map((t, i) => `<text class="zonet"${i ? '' : ` data-key="${zi.key}"`} x="${at.vert ? 7 : at.x + 7}" y="${(at.vert ? 0 : at.y) + 13 + 14 * i}">${esc(t)}</text>`).join('')
        : zoneLabel(m, statusOf, z, at.vert ? 7 : at.x + 7, (at.vert ? 0 : at.y) + 13, 'start')) + (at.vert ? '</g>' : '');
      regions.push(...g);
    }
  }
  }
  PROF('compartments');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = r => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); };
  placed.forEach(R => grow({ x: R.vb[0] + R.dx, y: R.vb[1] + R.dy, w: R.vb[2], h: R.vb[3] }));
  regions.forEach(grow); tabs.forEach(grow); DRAW_LABELS.forEach(grow); // a name tab outside its shape still shows
  const P = 16, W = x1 - x0 + 2 * P, H = y1 - y0 + 2 * P;
  // The answer field floats over its slot in drawing units (placeInline), so the slot carries its part's offset itself.
  const slotAt = (R, b) => b.replace(/class="inl-slot" x="([-\d.]+)" y="([-\d.]+)"/, (_, x, y) => `class="inl-slot" x="${+x + R.dx + P - x0}" y="${+y + R.dy + P - y0}" data-moved="1"`);
  const body = placed.map(R => `<g transform="translate(${R.dx},${R.dy})">${slotAt(R, R.body)}</g>`).join('');
  const slots = [];
  const flat = body.replace(/<rect class="inl-slot"[^>]*data-moved="1"[^>]*\/>/g, t => { slots.push(t); return ''; });
  STITCH_WHERE = null; ROUTE_BANDS = null; ROUTE_FLOOR = null; MEMBRANE_SEGS = null;
  return `<svg class="flow stitched" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.p.name)} flow diagram"><g transform="translate(${P - x0},${P - y0})">${bg}${flat}<g class="between">${between}</g>${fg}${pairBadges}</g>${slots.join('')}</svg>`;
}



