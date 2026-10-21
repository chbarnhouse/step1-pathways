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
    const f = [0.5, 0.65, 0.75, 0.85, 0.35, 0.25, 0.15].find(f => !DRAW_BOXES.some(bx => overlaps({ x: xAt(f) - 90, y: y - 46, w: 180, h: 40 }, bx))) ?? 0.5, mx = xAt(f);
    const half = Math.min(len / 2 - 14, 130), a0 = Math.max(Math.min(h[0][0], h[1][0]) + 14, mx - half), a1 = Math.min(Math.max(h[0][0], h[1][0]) - 14, mx + half);
    // Cofactors go under the run unless something is already there; then they go above it, with the name above them.
    const up = cof && hitsBox({ x: a0, y: y + 8, w: a1 - a0, h: 52 }) && !hitsBox({ x: a0, y: y - 60, w: a1 - a0, h: 52 });
    const ly = up ? y - 62 : y - 8;
    s += enzLabel(mx, ly, it, es, 'middle', 22, 'bottom'); DRAW_LABELS.push(enzRect(mx, ly, 'middle', it, 22, 'bottom'));
    if (cof) s += cofArcLine(dir > 0 ? [a0, y] : [a1, y], dir > 0 ? [a1, y] : [a0, y], [0, up ? -1 : 1], cofParts(m, statusOf, r));
  } else if (v) {
    const x = v[0][0], y0 = Math.min(v[0][1], v[1][1]), y1 = Math.max(v[0][1], v[1][1]);
    s += enzLabel(x - 14, (y0 + y1) / 2, it, es, 'end', 18, 'center'); DRAW_LABELS.push(enzRect(x - 14, (y0 + y1) / 2, 'end', it, 18));
    if (cof) s += cofArcParts(x, y0, y1, cofParts(m, statusOf, r), v[1][1] < v[0][1]);
  }
  return s;
}
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
function enzLabel(x, y, item, st, anchor, max, valign = 'center', extra = []) {
  if (st === 'hide') return '';
  const cls = st === 'peek' ? 'shown' : st;
  if (st === 'target' && INLINE) {
    const w = Math.max(190, INLINE.along ? INLINE.along.length * 8 + 28 : 0), rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2, ry = valign === 'bottom' ? y - 32 : y - 16;
    return `<g class="elab target"><rect x="${rx}" y="${ry}" width="${w}" height="32" rx="16"/></g>` + inlineField(rx + 4, ry + 3, w - 8, 26);
  }
  if (hidden(st)) {
    const word = blankWord(item), w = pillW(word), rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
    const ry = valign === 'bottom' ? y - 26 : y - 13;
    return `<g class="elab ${cls}"><rect x="${rx}" y="${ry}" width="${w}" height="26" rx="13"/>${blankText(rx + w / 2, ry + 13, word)}</g>`;
  }
  const lines = wrap(item.name, max);
  const tags = shownTags(item.rxn);
  // What it needs is its own blank (quizzed with the cofactors): hidden, it's a "needs" pill under the rest of the label.
  const nst = (item.rxn?.requires || []).length && DRAW_STATUS ? DRAW_STATUS('n:' + item.rxn.id) || 'shown' : 'shown';
  const needs = nst === 'hide' ? [] : hidden(nst) ? [['needblank', '']] : wrap(needsText(item.rxn), max).map(t => ['req', t]);
  const all = [...lines.map(l => ['', l]), ...tags.map(t => ['tag', t]), ...extra.map(t => ['cofl', t]), ...needs];
  const lh = 15, y0 = valign === 'bottom' ? y - (all.length - 1) * lh - 6 : y - (all.length - 1) * lh / 2;
  let s = `<g class="elab ${cls}${item.rxn?.transport ? ' trn' : ''}" data-key="${item.key}">`;
  let pill = '';
  all.forEach(([c, l], i) => {
    const ly = y0 + i * lh + (c === 'needblank' ? 8 : 0);
    if (c !== 'needblank') { s += `<text class="${c}" x="${x}" y="${ly}" text-anchor="${anchor}" dominant-baseline="central">${esc(l)}</text>`; return; }
    const live = nst === 'target' && INLINE, w = live ? Math.max(170, INLINE.along ? INLINE.along.length * 8 + 28 : 0) : pillW('needs'), rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
    pill = live ? `<g class="elab target"><rect x="${rx}" y="${ly - 15}" width="${w}" height="30" rx="15"/></g>` + inlineField(rx + 4, ly - 12, w - 8, 24)
      : `<g class="elab ${nst}"><rect x="${rx}" y="${ly - 12}" width="${w}" height="24" rx="12"/>${blankText(rx + w / 2, ly, 'needs')}</g>`;
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
function cofArcParts(x, y1, y2, parts, up = false) {
  parts = parts.filter(p => p.st !== 'hide' && p.st !== 'none');
  if (parts.length === 1 && !parts[0].side) return cofRow(x + 22, (y1 + y2) / 2, 'start', parts); // arrow not chosen yet: no arc
  const pin = parts.find(p => p.side === 'in'), pout = parts.find(p => p.side === 'out');
  if (!pin && !pout) return '';
  const d = up ? -1 : 1, yF = up ? y2 : y1, yT = up ? y1 : y2, mid = (y1 + y2) / 2;
  // A blank (a pill) needs more room than a line of text: keep it inside the gap between the two boxes.
  const off = p => (p && hidden(p.st) ? 15 : 12);
  const a = [x + 44, yF + off(pin) * d], b = [x + 44, yT - off(pout) * d];
  const start = pin ? a : [x + 3, mid], end = pout ? b : [x + 3, mid];
  const ctrl = pin && pout ? [x + 2, mid] : pin ? [x + 12, yF + 20 * d] : [x + 12, yT - 20 * d];
  const ang = Math.atan2(end[1] - ctrl[1], end[0] - ctrl[0]);
  let s = `<path class="cof" d="M${start[0]},${start[1]}Q${ctrl[0]},${ctrl[1]} ${end[0] - Math.cos(ang) * 4},${end[1] - Math.sin(ang) * 4}"/>` + head(end[0], end[1], ang, 7, 'cofh');
  const two = !!(pin && pout), cw = 7;
  for (const [p, y] of [[pin, a[1]], [pout, b[1]]]) {
    if (!p) continue;
    const x0 = x + 50;
    DRAW_LABELS.push({ x: x0, y: y - 14, w: hidden(p.st) ? 160 : p.text.length * cw + 24, h: 28 });
    if (isLive(p)) { const w = Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64); s += `<g class="elab target"><rect x="${x0}" y="${y - 14}" width="${w}" height="28" rx="14"/></g>` + inlineField(x0 + 4, y - 12, w - 8, 24); }
    else if (hidden(p.st)) { const w = pillW(cofWord(p, two)); s += `<g class="elab cofb ${p.st}"><rect x="${x0}" y="${y - 13}" width="${w}" height="26" rx="13"/>${blankText(x0 + w / 2, y, cofWord(p, two))}</g>`; }
    else s += `<text class="coft" x="${x0}" y="${y + 4}">${esc(p.text)}</text>` + cofMark(x0 + p.text.length * cw + 14, y, p.st);
  }
  return s;
}
// The same curved side arrow beside any straight step (sideways, slanted across a membrane): it sits on side n of the
// line p1→p2, inputs where it starts, outputs where it ends, and its middle bows in toward the step's arrow.
// The metabolite boxes of the diagram being drawn (top-left x, y, w, h): side labels steer around them.
// DRAW_LABELS: enzyme and cofactor labels already placed, so later labels and link tags keep clear of them too.
let DRAW_BOXES = [], DRAW_LABELS = [];
const overlaps = (r, b) => r.x < b.x + b.w + 4 && r.x + r.w > b.x - 4 && r.y < b.y + b.h + 2 && r.y + r.h > b.y - 2;
const hitsBox = r => DRAW_BOXES.some(b => overlaps(r, b)) || DRAW_LABELS.some(b => overlaps(r, b));
// An enzyme's whole label: its name, tags (RATE-LIMITING) and what it needs, as enzLabel stacks them.
const enzRect = (x, y, anchor, item, max = 18, valign = 'center') => {
  const r = item?.rxn, lines = [...wrap(item?.name || '', max), ...(r ? shownTags(r) : []), ...wrap(needsText(r), max)];
  const w = Math.min(Math.max(1, ...lines.map(l => l.length)), max + 2) * 6.6, h = Math.max(1, lines.length) * 15;
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
  const C = pin && pout ? at(0.5, 2) : pin ? at(tS + h * 0.5, 6) : at(tE - h * 0.5, 6);
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
    const lx = P[0] + n[0] * 10, ly = P[1] + n[1] * (level ? 20 : 16);
    const live = isLive(p), w = live ? Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64) : hidden(p.st) ? pillW(cofWord(p, two)) : p.text.length * cw;
    const xAt = a => (a === 'end' ? lx - w : a === 'middle' ? lx - w / 2 : lx);
    // A label that would run under a box goes the other way instead (Dehydroascorbate beside norepinephrine).
    if (hitsBox({ x: xAt(anchor), y: ly - 13, w, h: 26 })) anchor = ['start', 'end', 'middle'].filter(a => a !== anchor).find(a => !hitsBox({ x: xAt(a), y: ly - 13, w, h: 26 })) || anchor;
    const x0 = xAt(anchor);
    DRAW_LABELS.push({ x: x0, y: ly - 13, w, h: 26 });
    if (live) s += `<g class="elab target"><rect x="${x0}" y="${ly - 14}" width="${w}" height="28" rx="14"/></g>` + inlineField(x0 + 4, ly - 12, w - 8, 24);
    else if (hidden(p.st)) s += `<g class="elab cofb ${p.st}"><rect x="${x0}" y="${ly - 13}" width="${w}" height="26" rx="13"/>${blankText(x0 + w / 2, ly, cofWord(p, two))}</g>`;
    else s += `<text class="coft" x="${x0}" y="${ly + 4}">${esc(p.text)}</text>` + cofMark(anchor === 'end' ? x0 - 12 : x0 + w + 12, ly, p.st);
  }
  return s;
}
// A step's cofactors are items too, one per side ('c:' in, 'o:' out): shown, hidden altogether ('hide'), or blanks.
// parts: [{key, side, st, text}]; cofSt sums them up (any blank → blank, the current one → target).
// cofShapeHidden(r): the quiz hasn't revealed which arrow this step has (in and out, in only, out only), so while any
// of its cofactors is still a blank they show as one plain "cofactors" pill. The quiz sets it; elsewhere it's never hidden.
let cofShapeHidden = () => false;
const cofParts = (m, statusOf, r) => {
  const ps = cofItemsOf(m, r).map(it => ({ key: it.key, side: it.side, st: statusOf(it.key), text: cofSideText(m, it.cofs) }));
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
const cofVisible = st => !hidden(st) && st !== 'none' && st !== 'hide';
// With a blank on either side, the cofactors are laid out in a row: "cofactors in → out", "ATP → out", "cofactors in → ADP".
const cofWord = (p, two) => (!two ? 'cofactors' : p.side === 'in' ? 'cofactors in' : 'out');
const isLive = p => p.st === 'target' && INLINE && (!INLINE.q?.statKey || INLINE.q.statKey === p.key);
function cofRow(x, y, anchor, parts) {
  parts = parts.filter(p => p.st !== 'hide' && p.st !== 'none');
  const two = parts.length > 1, gap = 6, aw = 14, cw = 7;
  const ps = parts.map(p => ({ ...p, live: isLive(p),
    w: isLive(p) ? Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64) : hidden(p.st) ? pillW(cofWord(p, two)) + (p.st === 'target' ? 16 : 0) : p.text.length * cw + (['right', 'missed'].includes(p.st) ? 20 : 0) }));
  const total = ps.reduce((a, p) => a + p.w, 0) + (ps.length - 1) * (aw + 2 * gap);
  let cx = anchor === 'end' ? x - total : anchor === 'middle' ? x - total / 2 : x, s = '';
  ps.forEach((p, i) => {
    if (i) { s += `<text class="coft" x="${cx + gap + aw / 2}" y="${y + 4}" text-anchor="middle">→</text>`; cx += aw + 2 * gap; }
    if (p.live) s += `<g class="elab target"><rect x="${cx}" y="${y - 16}" width="${p.w}" height="32" rx="16"/></g>` + inlineField(cx + 4, y - 13, p.w - 8, 26);
    else if (hidden(p.st)) s += `<g class="elab cofb ${p.st}"><rect x="${cx}" y="${y - 13}" width="${p.w}" height="26" rx="13"/>${blankText(cx + p.w / 2, y, cofWord(p, two))}</g>`;
    else s += `<text class="coft" x="${cx}" y="${y + 4}">${esc(p.text)}</text>` + cofMark(cx + p.text.length * cw + 10, y, p.st);
    cx += p.w;
  });
  return s;
}
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
        const down = k => ({ ...R, y: R.y + k * (h + 6) }); // both sides taken (a region, another tag): step down beside the box
        r = [...(pref === 'left' ? [L, R] : [R, L]), down(1), down(2), down(3)].find(c => c.x >= 0 && !hits(c)) || (R.x >= 0 ? R : L);
        const right = r !== L, x1 = right ? b.x + b.w + 2 : b.x - 2, x2 = right ? r.x : r.x + r.w, mx = (x1 + x2) / 2, ty = r.y + h / 2;
        line = `M${x1},${yb} C${mx},${yb} ${mx},${ty} ${x2},${ty}`;
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
function flowSVG(m, statusOf, opts = {}) {
  DRAW_STATUS = statusOf; DRAW_MODEL = m; CONN_STEPS = new Map();
  if (m.p.stitch) return stitchSVG(m, statusOf, opts);
  ZONE_INLINE_DONE = false;
  const grps = Object.values(m.items).filter(it => it.kind === 'grp'), outer = DRAW_POS;
  if (grps.length && !outer) DRAW_POS = {};
  const svg = m.p.layout === 'grid' ? gridSVG(m, statusOf, opts) : m.p.circular ? cycleSVG(m, statusOf, opts) : linearSVG(m, statusOf, opts);
  if (!grps.length) return svg;
  const pos = DRAW_POS; if (!outer) DRAW_POS = null;
  return withGroups(svg, m, statusOf, grps, pos);
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
    const tone = g.tone || GROUP_TONES[i % GROUP_TONES.length], lx = r.x + 2, ly = r.y - 8;
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
  const base = r.transport ? 'ln trn' : 'ln', inh = (r.tags || []).includes('inhibits'), st = effSt(r);
  if (st === null) return base + (inh ? ' inh' : '');
  if (st === 'hide') return base;
  if (hidden(st)) return base + ' effq' + (st === 'target' ? ' eff-target' : '');
  return base + (inh ? ' inh fx-inh' : ' fx-act');
}
const headCls = cls => (cls.includes('effq') ? 'ah effq' : cls.includes('inh') ? 'ah inh' + (cls.includes('fx-inh') ? ' fx-inh' : '') : cls.includes('fx-act') ? 'ah fx-act' : 'ah');
// A step's tags as its label shows them: never "irreversible" (the arrow says it), and "inhibits" only while its effect shows.
const shownTags = r => (r.tags || []).filter(t => t !== 'irreversible' && (t !== 'inhibits' || effShown(r)));

// Steps that a connector lands on (grid): their name moves two-thirds along, clear of where the connector arrives.
let CONN_STEPS = new Map(); // step id → how far along its line connectors land (0–1)
const labAt = (r, a, b) => (CONN_STEPS.has(r.id) ? a + (b - a) * (CONN_STEPS.get(r.id) < 0.5 ? 0.72 : 0.28) : (a + b) / 2);
// Any connection between two boxes that isn't on the straight spine: side steps, grid steps.
function drawEdge(m, statusOf, r, a, b, wA = BW, wB = BW) {
  const p1 = edgePt(a, b.cx, b.cy, wA), p2 = edgePt(b, a.cx, a.cy, wB);
  let s = arrow(p1[0], p1[1], p2[0], p2[1], r.reversible, rxCls(r));
  const mx = labAt(r, p1[0], p2[0]), my = labAt(r, p1[1], p2[1]);
  const cs = cofSt(m, statusOf, r), ct = cofVisible(cs) ? cofText(m, r.cofactors) : '';
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id);
  if (Math.abs(p1[1] - p2[1]) < 4) {
    s += enzLabel(mx, my - 8, it, es, 'middle', 16, 'bottom'); DRAW_LABELS.push(enzRect(mx, my - 8, 'middle', it, 16, 'bottom'));
    if (cs !== 'none' && cs !== 'hide') s += cofArcLine(p1, p2, [0, 1], cofParts(m, statusOf, r)); // beneath, bowing up to the arrow
  } else if (Math.abs(p1[0] - p2[0]) < 4) {
    s += enzLabel(mx - 14, my, it, es, 'end', 18, 'center'); DRAW_LABELS.push(enzRect(mx - 14, my, 'end', it, 18));
    if (cs !== 'none' && cs !== 'hide') s += cofArcParts(mx, Math.min(p1[1], p2[1]), Math.max(p1[1], p2[1]), cofParts(m, statusOf, r), p2[1] < p1[1]);
  } else {
    // Off-line: an L. Leave a box on the main line from its side (its bottom carries the main arrow), then turn into the
    // other box; otherwise drop straight down (or up) first, then turn into the other box's side.
    s = '';
    const down = b.cy > a.cy;
    // Which corner: leave a main-line box from its side; otherwise drop first, unless that drop would run through a box.
    const crosses = (x, y0, y1) => DRAW_BOXES.some(bx => x > bx.x && x < bx.x + bx.w && Math.min(y0, y1) < bx.y + bx.h - 2 && Math.max(y0, y1) > bx.y + 2 && ![a, b].some(q => Math.abs(bx.x + bx.w / 2 - q.cx) < 4 && Math.abs(bx.y + bx.h / 2 - q.cy) < 4));
    const crossesH = (y, x0, x1) => DRAW_BOXES.some(bx => y > bx.y && y < bx.y + bx.h && Math.min(x0, x1) < bx.x + bx.w - 2 && Math.max(x0, x1) > bx.x + 2 && ![a, b].some(q => Math.abs(bx.x + bx.w / 2 - q.cx) < 4 && Math.abs(bx.y + bx.h / 2 - q.cy) < 4));
    let fromSpine = (m.onSpine?.has(r.from) && !m.onSpine?.has(r.to)) || crosses(a.cx, a.cy + (down ? BH / 2 : -BH / 2), b.cy);
    // Whichever corner it takes, neither leg may run through a box; if only the other corner is clear, take that one.
    const hClear = !crossesH(a.cy, a.cx, b.cx) && !crosses(b.cx, a.cy, b.cy), vClear = !crosses(a.cx, a.cy, b.cy) && !crossesH(b.cy, a.cx, b.cx);
    if (fromSpine && !hClear && vClear) fromSpine = false; else if (!fromSpine && !vClear && hClear) fromSpine = true;
    if (fromSpine) {
      const x0 = a.cx + Math.sign(b.cx - a.cx) * (wA / 2 + 4), yb = down ? b.cy - BH / 2 - 4 : b.cy + BH / 2 + 4;
      const pts = [[x0, a.cy], [b.cx, a.cy], [b.cx, yb]];
      s += elbow(pts, r.reversible, rxCls(r)) + elbowLabels(m, statusOf, r, [pts[0], pts[1]], [pts[1], pts[2]]);
    } else {
      const ya = down ? a.cy + BH / 2 + 4 : a.cy - BH / 2 - 4, x1 = b.cx - Math.sign(b.cx - a.cx) * (wB / 2 + 4);
      const pts = [[a.cx, ya], [a.cx, b.cy], [x1, b.cy]];
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
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id), cs = cofSt(m, statusOf, r), mid = labAt(r, y1, y2), anchor = side < 0 ? 'end' : 'start';
  // The name sits outside the cofactor text (which hugs the arrow), so the two never overlap.
  const cw = Math.max(0, ...cofParts(m, statusOf, r).map(q => (hidden(q.st) ? 110 : q.text.length * 7))), lx = x + side * (54 + cw + 14);
  let s = arrow(x, y1, x, y2, r.reversible, rxCls(r)) + enzLabel(lx, mid, it, es, anchor, 22, 'center');
  DRAW_LABELS.push(enzRect(lx, mid, anchor, it, 22));
  if (cs !== 'none' && cs !== 'hide') s += cofArcLine([x, y1], [x, y2], [side, 0], cofParts(m, statusOf, r));
  return s;
}
// One of two level steps between the same boxes: the first runs just above center with its label above it, the
// second just below with its label (and cofactors) below.
function pairEdge(m, statusOf, r, a, b, i) {
  const dir = Math.sign(b.cx - a.cx) || 1, x1 = a.cx + dir * (BW / 2 + 4), x2 = b.cx - dir * (BW / 2 + 4), y = a.cy + (i ? 8 : -8), mx = labAt(r, x1, x2);
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id), cs = cofSt(m, statusOf, r);
  let s = arrow(x1, y, x2, y, r.reversible, rxCls(r));
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
  const tissues = uniq(spine.map(r => r.tissue || p.tissue || '').filter(Boolean));
  const multiT = m.multiTissue;
  const keyOf = (loc, tissue) => zoneKey(m, loc, tissue);
  const where = {};
  spineMets.forEach(id => {
    const own = p.metabolites[id]?.loc;
    if (own) { where[id] = { loc: own, tissue: p.metabolites[id].tissue }; return; }
    const made = spine.find(r => r.to === id && !r.transport), used = spine.find(r => r.from === id && !r.transport);
    const r = made || used;
    if (r) where[id] = { loc: r.loc, tissue: r.tissue };
  });
  // Anything still unplaced inherits from its neighbor on the line.
  spineMets.forEach((id, i) => { if (!where[id]) where[id] = where[spineMets[i - 1]] || where[spineMets[i + 1]] || { loc: '' }; });
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
    l.label = [multiT ? l.tissue : '', loc].filter(Boolean).join(' · ');
  });
  const laneOf = {};
  for (const id of spineMets) laneOf[id] = lanes[keyOf(where[id].loc, where[id].tissue)].i;
  return { list, laneOf };
}

const LANE_W = 470;
// On the canvas, compartment tints and membranes run past the drawing to the canvas edges (the SVG may paint outside
// its box there); anywhere else the browser clips them to the drawing as before.
const BLEED = 20000;
const SIDE_STEP = BW + 250; // box + the gap a sideways step's enzyme and cofactor text needs
// Each kind of compartment has its own tint (always with its name written on it, never color alone).
const ZONE_TONES = { blood: 'slate', lumen: 'slate', 'brush border': 'slate', 'plasma membrane': 'slate', cytosol: 'blue', er: 'teal', golgi: 'teal', vesicle: 'teal',
  mitochondria: 'orange', 'intermembrane space': 'gold', nucleus: 'gold', peroxisome: 'pink', lysosome: 'pink' };
const zoneTone = key => ZONE_TONES[String(key).split('|').pop()] || 'slate';
const zoneTissue = key => (String(key).includes('|') ? String(key).split('|')[0] : '');
// Boxes that are close together in one compartment share one dashed region.
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
function linearSVG(m, statusOf, { zones = true } = {}) {
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
  const layout = () => {
    for (let i = 1; i <= last; i++) laneXs[i] = laneXs[i - 1] + LANE_W + (cols[i - 1] || 0) * SIDE_STEP;
    sideX = laneX(lanesOn ? last : 0) + SIDE_STEP + (bypass.length ? 190 : 0);
    pos = {}; perRow = {}; const forks = {};
    spineMets.forEach((id, i) => { pos[id] = { x: laneX(L.laneOf[id] || 0), y: top + i * (BH + GAP) }; });
    const place = (id, y, stack = 0) => {
      if (pos[id]) return;
      // Many extra inputs into one step (VOMIT → propionyl-CoA) stack in a column beside the line, not a long row.
      if (stack) { pos[id] = { x: sideX, y: y + (stack - 1) * (BH + GAP) }; return; }
      const li = sideLane(id), row = (li >= 0 ? li : 'side') + '|' + y, k = perRow[row] = (perRow[row] || 0) + 1;
      if (li >= 0) { cols[li] = Math.max(cols[li] || 0, k); pos[id] = { x: laneX(li) + k * SIDE_STEP, y }; return; }
      pos[id] = { x: sideX + (k - 1) * SIDE_STEP, y };
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
  DRAW_BOXES = Object.values(pos).map(q => ({ x: q.x - BW / 2, y: q.y, w: BW, h: BH })); DRAW_LABELS = [];
  const xs = Object.values(pos).map(q => q.x);
  let W = Math.max(Math.max(...xs) + BW / 2 + (Object.keys(perRow).some(k => k.startsWith('side|')) ? 12 : 190), bypass.length ? Math.max(...xs) + BW / 2 + 330 : 0);
  const bottom = Math.max(top + spineMets.length * (BH + GAP) - GAP, ...Object.values(pos).map(q => q.y + BH));
  // A sideways step on the last row writes its cofactors underneath: leave room for two lines.
  let H = bottom + 14 + (Object.entries(pos).some(([id, q]) => !onSpine.has(id) && q.y + BH === bottom) ? 34 : 0);
  let s = '', bg = '', fg = ''; // fg: region name tabs, drawn over the arrows
  // Side steps in another compartment (e.g. pyruvate carboxylase in the mitochondria) get a dashed, labeled region.
  const sideRects = {};
  const laneKeyAt = x => { if (!lanesOn) return L.list[0]?.key; let i = 0; while (i < last && x >= laneLeft(i + 1)) i++; return L.list[i].key; };
  const addRect = (k, rect) => { if (zones && k && m.items['z:' + k] && k !== laneKeyAt(rect.x + rect.w / 2)) (sideRects[k] = sideRects[k] || []).push(rect); };
  const onLine = new Set(spineMets), membranes = [];
  for (const [id, pt] of Object.entries(pos)) {
    if (onLine.has(id)) continue;
    const r = stepOf(id);
    if (r?.transport) {
      // Across a membrane: the metabolite on the far side sits in its own dashed box, named for that membrane.
      addRect(zoneOfR(r), { x: pt.x - BW / 2 - 16, y: pt.y - 16, w: BW + 32, h: BH + 30 });
      continue;
    }
    addRect(zoneOfR(r), { x: pt.x - BW / 2 - 12, y: pt.y - 22, w: BW + 24, h: BH + 42 });
    // The step's own label (its enzyme) is in that compartment too.
    const other = r && pos[r.from === id ? r.to : r.from];
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
    const lw = (m.items['z:' + k]?.name.length || 0) * 8.1 + 44;
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
  const legend = (c, k) => {
    const name = m.items['z:' + k]?.name || '', tw = name.length * 8.1 + 16;
    const x0 = c.x + c.w - 14 - tw; // right end: arrows and enzyme names crowd the left
    return `<rect class="legend" x="${x0}" y="${c.y - 9}" width="${tw}" height="18" rx="5"/>` + zoneLabel(m, statusOf, k, x0 + 7, c.y + 4, 'start');
  };
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
    Object.values(items).filter(it => it.kind === 'loc' && !drawn.has(it.id)).forEach((it, i) => { bg += zoneLabel(m, statusOf, it.id, W - 8, 18 + i * 30, 'end'); });
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
      s += arrow(X, y1 + 4, X, y2 - 4, r.reversible, rxCls(r));
      s += enzLabel(X - 34, (y1 + y2) / 2, items['e:' + r.id], statusOf('e:' + r.id), 'end', 24, 'center', stepLoc[r.id] || []);
      DRAW_LABELS.push(enzRect(X - 34, (y1 + y2) / 2, 'end', items['e:' + r.id], 24));
      const cs = cofSt(m, statusOf, r), ym = (y1 + y2) / 2;
      if (hidden(cs) || cofVisible(cs)) s += cofArcParts(X, y1, y2, cofParts(m, statusOf, r));
    } else {
      // Crosses a membrane: down, across into the other lane, down (a right angle, not a slant).
      const ym = (y1 + y2) / 2, pts = [[xa, y1 + 4], [xa, ym], [xb, ym], [xb, y2 - 4]];
      s += elbow(pts, r.reversible, rxCls(r)) + elbowLabels(m, statusOf, r, [pts[1], pts[2]], null);
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
    const my = (a.cy + b.cy) / 2, cs = cofSt(m, statusOf, r), ct = cofVisible(cs) ? cofText(m, r.cofactors) : '';
    s += enzLabel(xc + 12, my, items['e:' + r.id], statusOf('e:' + r.id), 'start', 20, 'center', ct ? [ct] : []);
    if (hidden(cs)) s += cofRow(xc + 12, my + 36, 'start', cofParts(m, statusOf, r));
  });
  branches.filter(b => !bypass.includes(b)).forEach(r => { if (pos[r.from] && pos[r.to]) s += drawEdge(m, statusOf, r, ctr(r.from), ctr(r.to)); });
  for (const [id, pt] of Object.entries(pos)) s += metBox(pt.x, pt.y, items['m:' + id], statusOf('m:' + id));
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.x - BW / 2, y: q.y, w: BW, h: BH }])), undefined, Object.values(clusters).flat());
  DRAW_BOXES = [];
  s += lk.s; W = Math.max(W, lk.maxX + 12);
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} flow diagram">${bg}${s}${fg}</svg>`;
}

// Cycles: metabolites on an ellipse (clockwise from the top; wider than tall, like the boxes) joined by curved arrows.
// Enzymes sit outside with their cofactors beneath; the main compartment is written in the middle, exceptions per step.
function cycleSVG(m, statusOf, { zones = true, rot = 0 } = {}) { // rot: turn the ring (a connected drawing lines a box up with another part)
  const { p, items, spine, spineMets, branches } = m;
  const n = spineMets.length, w = 176;
  const RY = Math.max(170, n * 30), RX = Math.round(RY * 1.5);
  // An extra input outside the ring (acetyl-CoA into citrate synthase) and whatever feeds it need room above.
  const extraIn = spine.some(r => (r.also_from || []).length), cx = RX + w / 2 + 300, cy = RY + 190 + (extraIn ? 150 : 0);
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
      if (Math.abs(c) > 0.7) { pos[sd] = { cx: pos[sp].cx + Math.sign(c) * (w + 110), cy: pos[sp].cy, t, side: true }; return; }
      const [x, y] = pt(t, 170); pos[sd] = { cx: x, cy: y, t, side: true }; return;
    }
    const up = b.to === sp; // sd feeds sp: it goes above
    // Room for the step's label between them: name, tags and what it needs.
    const lines = wrap(items['e:' + b.id]?.name || '', 18).length + (b.tags || []).filter(t => t !== 'irreversible').length + wrap(needsText(b), 18).length;
    pos[sd] = { cx: pos[sp].cx, cy: pos[sp].cy + (up ? -1 : 1) * (BH + Math.max(70, lines * 15 + 24)), t: pos[sp].t, side: true };
  });
  DRAW_BOXES = Object.values(pos).map(q => ({ x: q.cx - w / 2, y: q.cy - BH / 2, w, h: BH })); DRAW_LABELS = [];
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
      let t1 = pos[run.rs[0].from].t, t2 = pos[run.rs[run.rs.length - 1].to].t; if (t2 <= t1) t2 += 2 * Math.PI;
      const OUT = 150, f = 0.42, large = t2 - t1 > Math.PI ? 1 : 0;
      const [ax, ay] = wedgePt(t1, 1, OUT), [bx, by] = wedgePt(t2, 1, OUT), [cx2, cy2] = wedgePt(t2, f), [dx, dy] = wedgePt(t1, f);
      s += `<path class="zone t-${zoneTone(run.k)}" d="M${ax},${ay} A${RX + OUT},${RY + OUT} 0 ${large} 1 ${bx},${by} L${cx2},${cy2} A${RX * f},${RY * f} 0 ${large} 0 ${dx},${dy} Z"/>`;
      s += `<line class="membrane" x1="${dx}" y1="${dy}" x2="${ax}" y2="${ay}"/><line class="membrane" x1="${cx2}" y1="${cy2}" x2="${bx}" y2="${by}"/>`;
      const tm = (t1 + t2) / 2, co = Math.cos(tm), [lx, ly] = wedgePt(tm, 1, OUT + 18);
      s += zoneLabel(m, statusOf, run.k, lx, ly + 4, co > 0.3 ? 'start' : co < -0.3 ? 'end' : 'middle');
    });
  }
  // Parameter-space half-width of a box along the ellipse, so arcs start and stop at the box edge.
  const speed = t => Math.hypot(RX * Math.sin(t), RY * Math.cos(t));
  // Along the ring's direction there, the box edge is as far as the nearer of its side and its top/bottom.
  const ext = t => { const L = speed(t), ux = Math.abs(RX * Math.sin(t) / L), uy = Math.abs(RY * Math.cos(t) / L); return (Math.min(ux > 1e-6 ? w / 2 / ux : Infinity, uy > 1e-6 ? BH / 2 / uy : Infinity) + 10) / L; };
  const tangent = t => Math.atan2(RY * Math.cos(t), -RX * Math.sin(t));
  const arc = (d, t1, t2, cls) => { const [x1, y1] = pt(t1, d), [x2, y2] = pt(t2, d); return `<path class="${cls}" d="M${x1},${y1} A${RX + d},${RY + d} 0 ${t2 - t1 > Math.PI ? 1 : 0} 1 ${x2},${y2}"/>`; };
  spine.forEach(r => {
    const a = pos[r.from], b = pos[r.to];
    let t1 = a.t, t2 = b.t; if (t2 <= t1) t2 += 2 * Math.PI;
    const s1 = t1 + ext(t1), s2 = t2 - ext(t2), h2 = 7 / speed(s2), h1 = 7 / speed(s1);
    if (!r.reversible) {
      s += arc(0, s1, s2 - h2, rxCls(r)) + head(...pt(s2), tangent(s2));
    } else {
      s += arc(-4, s1, s2 - h2, rxCls(r)) + head(...pt(s2, -4), tangent(s2), 8);
      s += arc(4, s1 + h1, s2, rxCls(r)) + head(...pt(s1, 4), tangent(s1) + Math.PI, 8);
    }
    const tm = (s1 + s2) / 2, co = Math.cos(tm);
    const anchor = co > 0.3 ? 'start' : co < -0.3 ? 'end' : 'middle';
    const [lx, ly0] = pt(tm, 28 + (anchor === 'middle' ? 16 : 0));
    const here = locLabel(m, r), zst = m.items['z:' + keyOfR(r)] ? statusOf('z:' + keyOfR(r)) : 'shown';
    const loc = zones && here && here !== main && zst !== 'hide' && !inRegion.has(r) ? [hidden(zst) ? '(compartment?)' : here] : [];
    const es = statusOf('e:' + r.id), it = items['e:' + r.id];
    s += enzLabel(lx, ly0, it, es, anchor, 20, 'center', loc);
    DRAW_LABELS.push(enzRect(lx, ly0, anchor, it, 20));
    const cs = cofSt(m, statusOf, r);
    if (cs !== 'none' && cs !== 'hide') {
      const lines = es === 'hide' ? 0 : hidden(es) ? 1.8 : wrap(it.name, 20).length + (r.tags || []).filter(t => t !== 'irreversible').length + wrap(needsText(r), 20).filter(Boolean).length + loc.length;
      const ly = ly0 + Math.max(lines * 7.5, 0) + 14;
      if (hidden(cs)) s += cofRow(lx, ly + 6, anchor, cofParts(m, statusOf, r));
      else {
        const ct = cofText(m, r.cofactors);
        s += `<text class="coft" x="${lx}" y="${ly + 4}" text-anchor="${anchor}">${esc(ct)}</text>`;
        DRAW_LABELS.push(labelRect(lx, ly, anchor, ct, 99));
        s += cofMark(anchor === 'end' ? lx + 12 : anchor === 'start' ? lx - 12 : lx - ct.length * 3.3 - 12, ly, cs);
      }
    }
  });
  branches.forEach(r => { if (pos[r.from] && pos[r.to]) s += drawEdge(m, statusOf, r, pos[r.from], pos[r.to], w, w); });
  spine.forEach(r => (r.also_from || []).forEach(id => { if (pos[id] && pos[r.to]) { const a = edgePt(pos[id], pos[r.to].cx, pos[r.to].cy, w), b = edgePt(pos[r.to], pos[id].cx, pos[id].cy, w); s += arrow(a[0], a[1], b[0], b[1], false); } }));
  for (const [id, q] of Object.entries(pos)) s += metBox(q.cx, q.cy - BH / 2, items['m:' + id], statusOf('m:' + id), w);
  const xs = Object.values(pos).map(q => q.cx), ys = Object.values(pos).map(q => q.cy);
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.cx - w / 2, y: q.cy - BH / 2, w, h: BH }])), id => (!pos[id].side && Math.abs(Math.sin(pos[id].t)) > 0.9 ? (Math.sin(pos[id].t) < 0 ? 'up' : 'down') : pos[id].cx < cx ? 'left' : 'right'));
  s += lk.s; DRAW_BOXES = [];
  const W = Math.max(cx * 2, Math.max(...xs) + w / 2 + 20, lk.maxX + 12), H = Math.max(...ys) + BH / 2 + 180;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} cycle diagram">${s}</svg>`;
}

// Grids (steroidogenesis): every metabolite sets pos: [column, row]; optional grid_columns headers.
function gridSVG(m, statusOf, opts = {}) {
  const { p, items } = m, COLW = BW + 320, ROWH = BH + 116, X0 = 24 + BW / 2 + 130, Y0 = TOP + (p.grid_columns ? 34 : 0);
  const pos = {};
  for (const [id, x] of Object.entries(p.metabolites)) { const [c, r] = x.pos || [0, 0]; pos[id] = { cx: X0 + c * COLW, cy: Y0 + r * ROWH + BH / 2 }; }
  DRAW_BOXES = Object.values(pos).map(q => ({ x: q.cx - BW / 2, y: q.cy - BH / 2, w: BW, h: BH })); DRAW_LABELS = [];
  let s = '';
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
  let H = Math.max(...Object.values(pos).map(q => q.cy)) + BH / 2 + 24 + ((p.groups || []).length ? 48 : 0);
  const W = Math.max(Math.max(...Object.values(pos).map(q => q.cx)) + BW / 2 + 24, lk.maxX + 12);
  if (opts.zones !== false) {
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
  const tags = hidden(st) ? [] : (r.tags || []).filter(t => t !== 'irreversible');
  const cs = cofSt(m, statusOf, r), parts = cofParts(m, statusOf, r).filter(p => p.st !== 'hide');
  const mk = st => (st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '');
  const ct = cofVisible(cs) ? esc(cofText(m, r.cofactors)) + mk(cs)
    : hidden(cs) ? parts.map(p => isLive(p) ? `<form class="inl" data-q="0">${inlineInput()}</form>` : hidden(p.st) ? `<span class="ename ${p.st}"><span class="bk">${cofWord(p, parts.length > 1)}</span></span>` : esc(p.text) + mk(p.st)).join(' → ') : '';
  const extra = [ct, (r.also_to || []).length ? 'splits in two' : '', (r.also_from || []).length ? 'joins two' : '', r.branch ? 'side step' : '', r.transport ? 'transport' : '', ...tags, needsPart(r, st, statusOf)].filter(Boolean).join(' · ');
  return `<div class="conn"><span class="arr" aria-label="${r.reversible ? 'reversible' : 'one-way'}">${arr}</span><div class="meta"><span class="ename ${cls}">${badge}${name} ${ic}</span>${extra ? `<span class="cofs">${extra}</span>` : ''}</div></div>`;
}
function listHTML(m, statusOf, { horiz = false, zones = true } = {}) {
  let lastLoc = null;
  const parts = m.seq.map(k => {
    const it = m.items[k], st = statusOf(k);
    if (it.kind === 'cof') return '';
    let row = '';
    if (it.kind === 'loc') {
      const st = statusOf(k);
      if (!zones || st === 'hide') return '';
      if (st === 'target' && INLINE) return `<form class="locrow inl" data-q="0">${inlineInput()}</form>`;
      const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
      return `<div class="locrow${hidden(st) ? ' blank' : ''}" data-key="${k}">${hidden(st) ? '<span class="bk">compartment</span>' : esc(it.name)} ${ic}</div>`;
    }
    return row + listPart(m, it, st, horiz, statusOf);
  });
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
    const r = [false, true].map(br => rx.find(r => !!r.branch === br && r.to === id && !r.transport && r.loc) || rx.find(r => !!r.branch === br && r.from === id && !r.transport && r.loc)).find(Boolean) || rx.find(r => has(r, id) && !r.transport && r.loc);
    if (r) where[id] = { loc: r.loc, tissue: r.tissue };
  }
  for (let pass = 0; pass < 4; pass++) for (const r of rx) if (!r.transport) {
    if (where[r.from] && !where[r.to]) where[r.to] = where[r.from];
    if (where[r.to] && !where[r.from]) where[r.from] = where[r.to];
  }
  return where;
}
function renderTile(T, statusOf, drop, keep, rot = 0) {
  const vkey = [...drop].sort().join(',');
  const p = (T.variants = T.variants || {})[vkey] = T.variants[vkey] || (drop.size ? { ...T.p, id: T.p.id + '~' + vkey,
    metabolites: Object.fromEntries(Object.entries(T.p.metabolites).filter(([k]) => !drop.has(k))),
    reactions: T.p.reactions.filter(r => !drop.has(r.from) && !drop.has(r.to)).map(r => (r.also_to || r.also_from || []).some(x => drop.has(x))
      ? { ...r, also_to: (r.also_to || []).filter(x => !drop.has(x)), also_from: (r.also_from || []).filter(x => !drop.has(x)) } : r), links: (T.p.links || []).filter(l => !drop.has(l.at)) } : T.p);
  const sm = modelFor(p);
  DRAW_POS = {};
  let svg = flowSVG(sm, k => (keep && k === 'm:' + keep ? 'shown' : statusOf(k)), { zones: false, rot });
  const pos = DRAW_POS, labels = DRAW_LABELS.slice(); DRAW_POS = null;
  // Its tags to other pathways ("from β-Oxidation") take room too.
  for (const t of svg.matchAll(/<rect class="xtag" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) labels.push({ x: +t[1], y: +t[2], w: +t[3], h: +t[4] });
  if (keep) { const at = svg.indexOf(`data-key="m:${keep}"`), g0 = svg.lastIndexOf('<g', at), g1 = svg.indexOf('</g>', at); if (at > 0) svg = svg.slice(0, g0) + svg.slice(g1 + 4); }
  const vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
  const keptAt = keep && pos['m:' + keep]; if (keep) delete pos['m:' + keep];
  return { T, sm, pos, keptAt, drop, keep, rot, labels, vb, body: svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')), where: tileWhere(p) };
}
function stitchSVG(m, statusOf) {
  const st = m.p.stitch, tiles = st.tiles.map(t => ({ ...t, ids: Object.keys(t.p.metabolites) }));
  const owner = {}; tiles.forEach((t, i) => t.ids.forEach(id => { if (!(id in owner)) owner[id] = i; }));
  const G = {}, occ = [], placed = [], bridges = [], dots = [];
  const M = 18, ctr = r => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 });
  const shift = (r, dx, dy) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
  // Boxes keep a wide berth from everything; two labels only need not to touch.
  const rectsOf = (R, dx, dy) => [...Object.values(R.pos).map(r => ({ ...r, box: true })), ...R.labels].map(r => ({ ...shift(r, dx, dy), box: r.box }));
  const clash = (rs, skip) => rs.some(r => occ.some(o => { if (skip && o.x === skip.x && o.y === skip.y && o.box) return false; const g = r.box || o.box ? M : 3; return r.x < o.x + o.w + g && r.x + r.w > o.x - g && r.y < o.y + o.h + g && r.y + r.h > o.y - g; }));
  const place = (R, dx, dy) => {
    R.dx = dx; R.dy = dy; placed.push(R); occ.push(...rectsOf(R, dx, dy));
    for (const [k, r] of Object.entries(R.pos)) if (!G[k]) G[k] = { ...shift(r, dx, dy), R, id: k.slice(2) };
  };
  // Somewhere free for a part, with its box `key` as close as it can get to `target` (but leaving room for an arrow).
  const nearby = (R, key, target) => {
    const b = R.pos[key] || Object.values(R.pos)[0], t = ctr(target), c = ctr(b), cands = [];
    for (let gx = -40; gx <= 40; gx++) for (let gy = -40; gy <= 40; gy++) {
      const vx = gx * 80, vy = gy * 80, d = Math.hypot(vx, vy);
      if (d < 200) continue;
      cands.push([d + (vx && vy ? 160 : 0), t.cx + vx - c.cx, t.cy + vy - c.cy]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    // The other parts' own steps take room too: nothing of this part may sit on one of their arrows.
    const steps = placed.flatMap(P => P.sm.p.reactions.map(r => [P.pos['m:' + r.from], P.pos['m:' + r.to], P]).filter(([f, t]) => f && t)
      .map(([f, t, P]) => { const x = Math.min(f.x, t.x) + P.dx, y = Math.min(f.y, t.y) + P.dy; return { x: x - 8, y: y - 8, w: Math.max(f.x + f.w, t.x + t.w) + P.dx - x + 16, h: Math.max(f.y + f.h, t.y + t.h) + P.dy - y + 16 }; }));
    const onSteps = rs => rs.some(r => steps.some(o => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h));
    // The arrow that will join them needs a clear right-angled path (either way round) past every other box.
    for (const [, dx, dy] of cands) {
      const rs = rectsOf(R, dx, dy); if (clash(rs) || onSteps(rs)) continue;
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
  const route = (a, b, boxes, spread = false) => {
    const A = ctr(a), B = ctr(b), others = boxes.filter(r => !same(r, a) && !same(r, b)), cands = [];
    if (Math.abs(A.cx - B.cx) < 4 || Math.abs(A.cy - B.cy) < 4) cands.push([[A.cx, A.cy], [B.cx, B.cy]]);
    cands.push([[A.cx, A.cy], [B.cx, A.cy], [B.cx, B.cy]], [[A.cx, A.cy], [A.cx, B.cy], [B.cx, B.cy]]);
    const lo = Math.min(a.x, b.x) - 50, hi = Math.max(a.x + a.w, b.x + b.w) + 50, top = Math.min(a.y, b.y) - 50, bot = Math.max(a.y + a.h, b.y + b.h) + 50;
    for (const xm of [(A.cx + B.cx) / 2, lo, hi, lo - 120, hi + 120, lo - 300, hi + 300]) cands.push([[A.cx, A.cy], [xm, A.cy], [xm, B.cy], [B.cx, B.cy]]);
    for (const ym of [(A.cy + B.cy) / 2, top, bot, top - 120, bot + 120, top - 300, bot + 300]) cands.push([[A.cx, A.cy], [A.cx, ym], [B.cx, ym], [B.cx, B.cy]]);
    const len = pts => pts.slice(1).reduce((n, q, i) => n + Math.abs(q[0] - pts[i][0]) + Math.abs(q[1] - pts[i][1]), 0) + 80 * (pts.length - 2);
    // When drawing (not while placing parts), each route may also enter or leave its boxes off-center.
    const all = spread ? cands.flatMap(c => [0, 50, -50].flatMap(o1 => [0, 50, -50].map(o2 => nudge(nudge(c, false, o1), true, o2)))) : cands;
    const ok = all.filter(pts => {
      for (let i = 1; i < pts.length; i++) if (others.some(r => segHits(pts[i - 1], pts[i], r)) || alongside(pts[i - 1], pts[i])) return false;
      return true;
    }).sort((x, y) => len(x) - len(y));
    return ok[0] || null;
  };
  // A route's ends moved out to the box edges.
  const trim = (pts, a, b) => {
    const P = pts.map(q => [...q]), n = P.length;
    const out = (q, n2, r) => { const dx = Math.sign(n2[0] - q[0]), dy = Math.sign(n2[1] - q[1]); return dx ? [dx > 0 ? r.x + r.w + 4 : r.x - 4, q[1]] : [q[0], dy > 0 ? r.y + r.h + 4 : r.y - 4]; };
    P[0] = out(P[0], P[1], a); P[n - 1] = out(P[n - 1], P[n - 2], b);
    return P;
  };
  const drawRoute = (r, a, b, cls, labels = true) => {
    const pts = route(a, b, [...DRAW_BOXES, ...DRAW_LABELS], true) || route(a, b, DRAW_BOXES, true) || [[ctr(a).cx, ctr(a).cy], [ctr(b).cx, ctr(a).cy], [ctr(b).cx, ctr(b).cy]], P = trim(pts, a, b);
    const segs = P.slice(1).map((q, i) => [P[i], q]); drawn.push(...pts.slice(1).map((q, i) => [pts[i], q]));
    const longest = f => segs.filter(f).sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]))[0];
    const h = longest(([p, q]) => Math.abs(p[1] - q[1]) < 1), v0 = longest(([p, q]) => Math.abs(p[0] - q[0]) < 1);
    // A long vertical run keeps its labels to a short stretch in the middle, as on any other step.
    const v = v0 && Math.abs(v0[1][1] - v0[0][1]) > 130 ? (() => { const mid = (v0[0][1] + v0[1][1]) / 2, d = Math.sign(v0[1][1] - v0[0][1]); return [[v0[0][0], mid - d * 55], [v0[0][0], mid + d * 55]]; })() : v0;
    return elbow(P, r?.reversible, cls || rxCls(r || {})) + (labels && r && m.items['e:' + r.id] ? elbowLabels(m, statusOf, r, h, v) : '');
  };
  const sideOf = (T, id) => T.p.reactions.filter(r => (r.also_to || []).includes(id) || (r.also_from || []).includes(id));
  const sides = []; // [from box id, to box id, reaction]: a side product or input that lives in another part
  tiles.forEach((T, i) => {
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
      const ring = T.p.circular ? modelFor(T.p).spineMets : [];
      for (const sh of shared.slice().sort((x, y) => leaf(y) - leaf(x))) {
        const oth = new Set(shared.filter(id => id !== sh && leaf(id))), dups = shared.filter(id => id !== sh && !leaf(id)).length, i0 = ring.indexOf(sh);
        if (best && dups >= best.dups) continue;
        const rots = i0 < 0 ? [0] : uniq([0, ...[0, Math.PI, Math.PI / 2, -Math.PI / 2].map(t => t + Math.PI / 2 - 2 * Math.PI * i0 / ring.length)]);
        for (const rot of rots) {
          const Rc = renderTile(T, statusOf, oth, sh, rot), a = G['m:' + sh], b = Rc.keptAt;
          if (!b) continue;
          const dx = ctr(a).cx - ctr(b).cx, dy = ctr(a).cy - ctr(b).cy;
          if (!clash(rectsOf(Rc, dx, dy), a)) { best = { R: Rc, dx, dy, oth, dups }; break; }
        }
        if (best && !best.dups) break;
      }
      if (best) { place(best.R, best.dx, best.dy); bridgeAll([...best.oth]); return; }
      let R;
      const a = G['m:' + anchor];
      if (leaf(anchor)) {
        const drop = new Set([...others, anchor]), r = touching(T, anchor)[0] || sideOf(T, anchor)[0], e = r.from === anchor ? r.to : r.from;
        R = renderTile(T, statusOf, drop); place(R, ...nearby(R, 'm:' + e, a)); bridgeAll([...drop]); return;
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
    // No shared box, but the same molecule in another compartment: place it near, a transport arrow joins them.
    const jn = st.joins.find(([a, b]) => T.ids.includes(b) && G['m:' + a]);
    if (jn) { const R = renderTile(T, statusOf, new Set()); place(R, ...nearby(R, 'm:' + jn[1], G['m:' + jn[0]])); return; }
    // No shared box: follow a link between them, from either side.
    const prev = placed.map(P => P.T);
    let mine, theirs, via = '';
    for (const P of prev) {
      const l = T.rawLinks.find(l => l.to === P.id), back = P.rawLinks.find(l => l.to === T.id);
      if (!l && !back) continue;
      mine = l ? T.mid[l.at] : T.ids[0]; theirs = back ? P.mid[back.at] : P.ids.find(id => G['m:' + id]); via = (l || back).via || ''; break;
    }
    const R = renderTile(T, statusOf, new Set()), tgt = G['m:' + theirs] || Object.values(G)[0];
    place(R, ...nearby(R, 'm:' + mine, tgt));
    if (mine && theirs) dots.push({ a: 'm:' + theirs, b: 'm:' + mine, R, label: via });
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
  rebuild();
  // Steps between parts, drawn like any other step (enzyme, cofactors) now that every box has its place.
  DRAW_BOXES = Object.values(G).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })); DRAW_LABELS = occ.filter(o => !DRAW_BOXES.some(b => b.x === o.x && b.y === o.y));
  let between = '';
  for (const r of uniq(bridges)) {
    const a = G['m:' + r.from], b = G['m:' + r.to];
    if (a && b) between += drawRoute(r, a, b);
  }
  // Same molecule, two compartments: a dashed transport arrow, from where it's made to where it's used.
  const madeOnly = id => m.p.reactions.some(r => r.to === id || (r.also_to || []).includes(id)) && !m.p.reactions.some(r => r.from === id || (r.also_from || []).includes(id));
  for (const [x, y] of st.joins) {
    if (m.p.reactions.some(r => (r.from === x && r.to === y) || (r.from === y && r.to === x))) continue; // a real step already joins them
    const [f, t] = madeOnly(y) && !madeOnly(x) ? [y, x] : [x, y], a = G['m:' + f], b = G['m:' + t];
    if (!a || !b) continue;
    between += drawRoute(null, a, b, 'ln trn');
  }
  for (const [f, t, r] of sides) {
    const a = G['m:' + f], b = G['m:' + t]; if (!a || !b) continue;
    between += drawRoute(r, a, b, undefined, false); // its enzyme is already named on the step's main arrow
  }
  for (const d of dots) {
    const a = G[d.a], b = d.b ? G[d.b] : (() => { const r = d.R.pos[d.a]; return r && shift(r, d.R.dx, d.R.dy); })();
    if (!a || !b) continue;
    // Routed like the arrows (clear of boxes and labels, never along another line), its name on the longest leg.
    const pts = route(a, b, [...DRAW_BOXES, ...DRAW_LABELS], true) || route(a, b, DRAW_BOXES, true) || [[ctr(a).cx, ctr(a).cy], [ctr(b).cx, ctr(a).cy], [ctr(b).cx, ctr(b).cy]];
    const P = trim(pts, a, b); drawn.push(...pts.slice(1).map((q, i) => [pts[i], q]));
    between += `<path class="xline" d="M${P.map(q => q.join(',')).join('L')}"/>`;
    if (d.label) {
      // On a stretch of the line where it covers nothing; the middle of the longest leg if there's none.
      const w = d.label.length * 6.4 + 20, segs = P.slice(1).map((q, i) => [P[i], q]).sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]));
      const spots = segs.flatMap(([u, v]) => [0.5, 0.3, 0.7, 0.15, 0.85].map(f => [u[0] + (v[0] - u[0]) * f, u[1] + (v[1] - u[1]) * f]));
      const [tx, ty] = spots.find(([x, y]) => !hitsBox({ x: x - w / 2, y: y - 11, w, h: 22 })) || spots[0];
      DRAW_LABELS.push({ x: tx - w / 2, y: ty - 11, w, h: 22 });
      between += `<rect class="xtag" x="${tx - w / 2}" y="${ty - 11}" width="${w}" height="22" rx="11"/><text class="xtagt" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${esc(d.label)}</text>`;
    }
  }
  DRAW_BOXES = [];
  // Compartments, once for the whole picture: each one is a tinted shape that follows its own boxes and the steps
  // between them (one flat tint, however the pieces overlap), named once per connected piece.
  const zoneOf = {}, pad = b => ({ x: b.x - 20, y: b.y - 32, w: b.w + 40, h: b.h + 52 });
  for (const [k, g] of Object.entries(G)) { const w = g.R.where[g.id], z = w && zoneKey(m, w.loc, w.tissue); if (z && m.items['z:' + z]) zoneOf[k] = z; }
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const bbox = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
  const shapes = {};
  for (const [k, z] of Object.entries(zoneOf)) (shapes[z] = shapes[z] || []).push(pad(G[k]));
  const foreign = z => Object.entries(zoneOf).filter(([, z2]) => z2 !== z).map(([k]) => pad(G[k]));
  const join = (pairs, z0) => { for (const [f, t] of pairs) {
    const z = z0 || zoneOf['m:' + f]; if (!z || zoneOf['m:' + t] !== z || !G['m:' + f] || !G['m:' + t]) continue;
    const u = bbox(pad(G['m:' + f]), pad(G['m:' + t]));
    if (!foreign(z).some(o => hit(u, o))) shapes[z].push(u);
  } };
  // Along every step, along the dotted joins between parts, and across the middle of a ring that's all in one place.
  join(m.p.reactions.flatMap(r => [[r.from, r.to], ...(r.also_to || []).map(x => [r.from, x]), ...(r.also_from || []).map(x => [x, r.to])]));
  join(dots.filter(d => d.b).map(d => [d.a.slice(2), d.b.slice(2)]));
  for (const R of placed) if (R.sm.p.circular) {
    const ring = R.sm.spineMets.filter(id => G['m:' + id]), z = zoneOf['m:' + ring[0]];
    if (!z || ring.some(id => zoneOf['m:' + id] !== z)) continue;
    const cs = ring.map(id => ctr(G['m:' + id])), xs = cs.map(c => c.cx), ys = cs.map(c => c.cy); // between the box centers: the ring's middle
    const u = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (!foreign(z).some(o => hit(u, o))) shapes[z].push(u);
  }
  let bg = '', fg = '';
  ZONE_INLINE_DONE = false;
  const regions = [], tabs = [];
  for (const [z, rs] of Object.entries(shapes)) {
    bg += `<g class="blob">${rs.map(r => `<rect class="t-${zoneTone(z)}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="16"/>`).join('')}</g>`;
    // Connected pieces: each gets the name once, on its topmost edge.
    const comp = rs.map((_, i) => i), find = i => (comp[i] === i ? i : (comp[i] = find(comp[i])));
    rs.forEach((a, i) => rs.forEach((b, j) => { if (j > i && hit(a, b)) comp[find(i)] = find(j); }));
    const groups = {}; rs.forEach((r, i) => (groups[find(i)] = groups[find(i)] || []).push(r));
    for (const g of Object.values(groups)) {
      // On a top edge, left or right end, wherever it doesn't cover a label or box (topmost edge first).
      const name = m.items['z:' + z]?.name || '', tw = name.length * 8.1 + 16, free = r => !occ.some(o => hit(r, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 })) && !tabs.some(o => hit(r, o));
      const spots = g.slice().sort((a, b) => a.y - b.y || a.x - b.x).flatMap(r => [{ x: r.x + 12, y: r.y + 4 }, { x: r.x + r.w - 12 - tw, y: r.y + 4 }, { x: r.x + 12, y: r.y + r.h - 22 }, { x: r.x + r.w - 12 - tw, y: r.y + r.h - 22 }]);
      const at = spots.find(q => free({ ...q, w: tw, h: 18 })) || spots[0];
      tabs.push({ ...at, w: tw, h: 18 });
      fg += `<rect class="legend" x="${at.x}" y="${at.y}" width="${tw}" height="18" rx="5"/>` + zoneLabel(m, statusOf, z, at.x + 7, at.y + 13, 'start');
      regions.push(...g);
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = r => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); };
  placed.forEach(R => grow({ x: R.vb[0] + R.dx, y: R.vb[1] + R.dy, w: R.vb[2], h: R.vb[3] }));
  regions.forEach(grow);
  const P = 16, W = x1 - x0 + 2 * P, H = y1 - y0 + 2 * P;
  // The answer field floats over its slot in drawing units (placeInline), so the slot carries its part's offset itself.
  const slotAt = (R, b) => b.replace(/class="inl-slot" x="([-\d.]+)" y="([-\d.]+)"/, (_, x, y) => `class="inl-slot" x="${+x + R.dx + P - x0}" y="${+y + R.dy + P - y0}" data-moved="1"`);
  const body = placed.map(R => `<g transform="translate(${R.dx},${R.dy})">${slotAt(R, R.body)}</g>`).join('');
  const slots = [];
  const flat = body.replace(/<rect class="inl-slot"[^>]*data-moved="1"[^>]*\/>/g, t => { slots.push(t); return ''; });
  return `<svg class="flow stitched" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.p.name)} flow diagram"><g transform="translate(${P - x0},${P - y0})">${bg}${flat}${between}${fg}</g>${slots.join('')}</svg>`;
}

