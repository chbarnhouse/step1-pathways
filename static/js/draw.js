/* Rendering: flow diagrams (linear and cyclic SVG), the list view, and the single-step pair.
   Every function takes the model `m` and a status function key → shown|blank|target|peek|right|missed|start.
   States are never color-only: dashed = hidden, thick = current, check / cross icons, START label. */
'use strict';

const hidden = st => st === 'blank' || st === 'target';
// A blank says what goes there (on top of its shape: box = metabolite, pill = enzyme/transporter or cofactors, tag = compartment).
const blankWord = item => (item?.kind === 'trn' || item?.rxn?.transport ? 'transporter' : { met: 'metabolite', enz: 'enzyme', cof: 'cofactors', loc: 'compartment' }[item?.kind] || '?');
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
  const a1 = ang + Math.PI * 0.84, a2 = ang - Math.PI * 0.84;
  return `<path class="${cls}" d="M${x},${y}L${x + size * Math.cos(a1)},${y + size * Math.sin(a1)}L${x + size * Math.cos(a2)},${y + size * Math.sin(a2)}Z"/>`;
}
function arrow(x1, y1, x2, y2, rev, cls = 'ln') {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const back = (x, y, d) => [x - Math.cos(ang) * d, y - Math.sin(ang) * d];
  if (!rev) {
    const [ex, ey] = back(x2, y2, 6);
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"/>` + head(x2, y2, ang);
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

function metBox(cx, y, item, st, w = BW) {
  const cls = st === 'peek' ? 'shown' : st;
  if (st === 'target' && INLINE) return `<g class="mbox target"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${BH}" rx="9"/></g>` + inlineField(cx - w / 2 + 4, y + 4, w - 8, BH - 8);
  if (hidden(st)) return `<g class="mbox ${cls}"${item.key ? ` data-key="${item.key}"` : ''}><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${BH}" rx="9"/>${blankText(cx, y + BH / 2, 'metabolite')}</g>`;
  const label = item.name;
  const fs = label.length * 7.6 > w - 14 ? ` style="font-size:${Math.max(10.5, (w - 14) / label.length / 0.56).toFixed(1)}px"` : '';
  let s = `<g class="mbox ${cls}"${item.key ? ` data-key="${item.key}"` : ''}><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${BH}" rx="9"/><text x="${cx}" y="${y + BH / 2}"${fs}>${esc(label)}</text></g>`;
  if (st === 'right') s += svgIcon(cx - w / 2 - 16, y + BH / 2, 'ok');
  if (st === 'missed') s += svgIcon(cx - w / 2 - 16, y + BH / 2, 'no');
  if (st === 'start') s += `<text class="startt" x="${cx}" y="${y - 6}" text-anchor="middle">START</text>`;
  return s;
}
// anchor: start | middle | end. valign: center (lines centered on y) or bottom (last line sits on y).
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
  const tags = (item.rxn.tags || []).filter(t => t !== 'irreversible');
  const all = [...lines.map(l => ['', l]), ...tags.map(t => ['tag', t]), ...extra.map(t => ['cofl', t])];
  const lh = 15, y0 = valign === 'bottom' ? y - (all.length - 1) * lh - 6 : y - (all.length - 1) * lh / 2;
  let s = `<g class="elab ${cls}${item.rxn?.transport ? ' trn' : ''}" data-key="${item.key}">`;
  all.forEach(([c, l], i) => { s += `<text class="${c}" x="${x}" y="${y0 + i * lh}" text-anchor="${anchor}" dominant-baseline="central">${esc(l)}</text>`; });
  s += '</g>';
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
    if (isLive(p)) { const w = Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64); s += `<g class="elab target"><rect x="${x0}" y="${y - 14}" width="${w}" height="28" rx="14"/></g>` + inlineField(x0 + 4, y - 12, w - 8, 24); }
    else if (hidden(p.st)) { const w = pillW(cofWord(p, two)); s += `<g class="elab cofb ${p.st}"><rect x="${x0}" y="${y - 13}" width="${w}" height="26" rx="13"/>${blankText(x0 + w / 2, y, cofWord(p, two))}</g>`; }
    else s += `<text class="coft" x="${x0}" y="${y + 4}">${esc(p.text)}</text>` + cofMark(x0 + p.text.length * cw + 14, y, p.st);
  }
  return s;
}
// The same curved side arrow beside any straight step (sideways, slanted across a membrane): it sits on side n of the
// line p1→p2, inputs where it starts, outputs where it ends, and its middle bows in toward the step's arrow.
function cofArcLine(p1, p2, n, parts) {
  parts = parts.filter(p => p.st !== 'hide' && p.st !== 'none');
  if (parts.length === 1 && !parts[0].side) return cofRow((p1[0] + p2[0]) / 2 + n[0] * 30, (p1[1] + p2[1]) / 2 + n[1] * 30, Math.abs(n[0]) > 0.5 ? (n[0] > 0 ? 'start' : 'end') : 'middle', parts);
  const pin = parts.find(p => p.side === 'in'), pout = parts.find(p => p.side === 'out');
  if (!pin && !pout) return '';
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1, u = [dx / L, dy / L];
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
    const anchor = side || (two ? ((u[0] >= 0) === first ? 'end' : 'start') : n[0] >= 0 ? 'start' : 'end');
    const lx = P[0] + n[0] * 10, ly = P[1] + n[1] * 16;
    const live = isLive(p), w = live ? Math.max(190, (INLINE.along || INLINE.q?.answerText || '').length * 9 + 64) : hidden(p.st) ? pillW(cofWord(p, two)) : p.text.length * cw;
    const x0 = anchor === 'end' ? lx - w : anchor === 'middle' ? lx - w / 2 : lx;
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
function linkTags(m, statusOf, boxes, prefer = () => 'right') {
  const out = { s: '', maxX: 0 }, byAt = {}, all = Object.values(boxes), taken = [];
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
        r = (pref === 'left' ? [L, R] : [R, L]).find(c => c.x >= 0 && !hits(c)) || (R.x >= 0 ? R : L);
        const right = r === R, x1 = right ? b.x + b.w + 2 : b.x - 2, x2 = right ? r.x : r.x + r.w, mx = (x1 + x2) / 2;
        line = `M${x1},${yb} C${mx},${yb} ${mx},${cy} ${x2},${cy}`;
      }
      taken.push(r);
      const g = `<path class="xline" d="${line}"/><rect class="xtag" x="${r.x}" y="${r.y}" width="${w}" height="${h}" rx="11"/><text class="xtagt" x="${r.x + w / 2}" y="${r.y + h / 2}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`;
      out.s += LINK_NAV ? `<a class="xlink nav" href="#/pathways/${esc(l.to)}" aria-label="${esc(label)}">${g}</a>` : `<g class="xlink">${g}</g>`;
      out.maxX = Math.max(out.maxX, r.x + r.w);
    });
  }
  return out;
}
function flowSVG(m, statusOf, opts = {}) {
  ZONE_INLINE_DONE = false;
  if (m.p.layout === 'grid') return gridSVG(m, statusOf, opts);
  return m.p.circular ? cycleSVG(m, statusOf, opts) : linearSVG(m, statusOf, opts);
}
// Transport steps (a metabolite crossing a membrane) are dashed so they read differently from reactions.
const rxCls = r => (r.transport ? 'ln trn' : 'ln');

// Any connection between two boxes that isn't on the straight spine: side steps, grid steps.
function drawEdge(m, statusOf, r, a, b, wA = BW, wB = BW) {
  const p1 = edgePt(a, b.cx, b.cy, wA), p2 = edgePt(b, a.cx, a.cy, wB);
  let s = arrow(p1[0], p1[1], p2[0], p2[1], r.reversible, rxCls(r));
  const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
  const cs = cofSt(m, statusOf, r), ct = cofVisible(cs) ? cofText(m, r.cofactors) : '';
  const it = m.items['e:' + r.id], es = statusOf('e:' + r.id);
  if (Math.abs(p1[1] - p2[1]) < 4) {
    s += enzLabel(mx, my - 8, it, es, 'middle', 16, 'bottom');
    if (cs !== 'none' && cs !== 'hide') s += cofArcLine(p1, p2, [0, 1], cofParts(m, statusOf, r)); // beneath, bowing up to the arrow
  } else if (Math.abs(p1[0] - p2[0]) < 4) {
    s += enzLabel(mx - 14, my, it, es, 'end', 18, 'center');
    if (cs !== 'none' && cs !== 'hide') s += cofArcParts(mx, Math.min(p1[1], p2[1]), Math.max(p1[1], p2[1]), cofParts(m, statusOf, r), p2[1] < p1[1]);
  } else s += diagLabel(m, statusOf, r, p1, p2);
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
  // Cofactors curve along the other side of the line from the enzyme's name.
  if (cs !== 'none' && cs !== 'hide') s += cofArcLine(p1, p2, [-nx * side, -ny * side], cofParts(m, statusOf, r));
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
  const list = Object.values(lanes).sort((a, b) =>
    (multiT ? tissues.indexOf(a.tissue) - tissues.indexOf(b.tissue) : 0) || (LANE_ORDER[a.comp] ?? 1.5) - (LANE_ORDER[b.comp] ?? 1.5));
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
const SIDE_STEP = BW + 170; // box + the gap a sideways step's enzyme and cofactor text needs
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
      const cs = cofSt(m, statusOf, r), ym = (y1 + y2) / 2;
      if (hidden(cs) || cofVisible(cs)) s += cofArcParts(X, y1, y2, cofParts(m, statusOf, r));
    } else {
      // Crosses a membrane: slant from one lane to the other.
      const p1 = [xa + Math.sign(xb - xa) * 40, y1 + 4], p2 = [xb - Math.sign(xb - xa) * 40, y2 - 4];
      s += arrow(p1[0], p1[1], p2[0], p2[1], r.reversible, rxCls(r)) + diagLabel(m, statusOf, r, p1, p2, Object.values(pos).map(q => ({ x: q.x - BW / 2, y: q.y, w: BW, h: BH })));
    }
    // Extra products/reactants leave from the box's lower-right corner, clear of the cofactor text beside the arrow.
    for (const sd of r.also_to || []) { const sx = xa + BW / 2 - 12, e = edgePt(ctr(sd), sx, y1 + 2); s += arrow(sx, y1 + 2, e[0], e[1], r.reversible); }
    const many = (r.also_from || []).length >= 3;
    if (many) {
      // A stacked column of inputs joins one line that runs up beside them and enters the target from the side.
      const t = ctr(r.to), xr = xb + BW / 2 + 6, srcs = r.also_from.map(ctr), xl = Math.min(...srcs.map(c => c.cx)) - BW / 2 - 6, bus = (xr + xl) / 2;
      const ys = srcs.map(c => c.cy), top = Math.min(t.cy, ...ys), bot = Math.max(t.cy, ...ys);
      srcs.forEach(c => { s += `<path class="ln" d="M${xl},${c.cy}H${bus}"/>`; });
      s += `<path class="ln" d="M${bus},${top}V${bot}"/>` + arrow(bus, t.cy, xr, t.cy, r.reversible);
    } else for (const sd of r.also_from || []) { const sx = xb + BW / 2 - 12, e = edgePt(ctr(sd), sx, y2 - 2); s += arrow(e[0], e[1], sx, y2 - 2, r.reversible); }
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
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.x - BW / 2, y: q.y, w: BW, h: BH }])));
  s += lk.s; W = Math.max(W, lk.maxX + 12);
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} flow diagram">${bg}${s}${fg}</svg>`;
}

// Cycles: metabolites on an ellipse (clockwise from the top; wider than tall, like the boxes) joined by curved arrows.
// Enzymes sit outside with their cofactors beneath; the main compartment is written in the middle, exceptions per step.
function cycleSVG(m, statusOf, { zones = true } = {}) {
  const { p, items, spine, spineMets, branches } = m;
  const n = spineMets.length, w = 176;
  const RY = Math.max(170, n * 30), RX = Math.round(RY * 1.5);
  const cx = RX + w / 2 + 300, cy = RY + 190;
  const pt = (t, d = 0) => [cx + (RX + d) * Math.cos(t), cy + (RY + d) * Math.sin(t)];
  const pos = {};
  spineMets.forEach((id, i) => { const t = -Math.PI / 2 + 2 * Math.PI * i / n; const [x, y] = pt(t); pos[id] = { cx: x, cy: y, t }; });
  branches.forEach(b => {
    const [sp, sd] = pos[b.from] ? [b.from, b.to] : [b.to, b.from];
    if (pos[sp] && !pos[sd]) { const t = pos[sp].t; const [x, y] = pt(t, 170); pos[sd] = { cx: x, cy: y, t }; }
  });
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
  const ext = t => { const L = speed(t), ux = -RX * Math.sin(t) / L, uy = RY * Math.cos(t) / L; return (Math.abs(w / 2 * ux) + Math.abs(BH / 2 * uy) + 10) / L; };
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
    const cs = cofSt(m, statusOf, r);
    if (cs !== 'none' && cs !== 'hide') {
      const lines = es === 'hide' ? 0 : hidden(es) ? 1.8 : wrap(it.name, 20).length + (r.tags || []).filter(t => t !== 'irreversible').length + loc.length;
      const ly = ly0 + Math.max(lines * 7.5, 0) + 14;
      if (hidden(cs)) s += cofRow(lx, ly + 6, anchor, cofParts(m, statusOf, r));
      else {
        const ct = cofText(m, r.cofactors);
        s += `<text class="coft" x="${lx}" y="${ly + 4}" text-anchor="${anchor}">${esc(ct)}</text>`;
        s += cofMark(anchor === 'end' ? lx + 12 : anchor === 'start' ? lx - 12 : lx - ct.length * 3.3 - 12, ly, cs);
      }
    }
  });
  branches.forEach(r => { if (pos[r.from] && pos[r.to]) s += drawEdge(m, statusOf, r, pos[r.from], pos[r.to], w, w); });
  for (const [id, q] of Object.entries(pos)) s += metBox(q.cx, q.cy - BH / 2, items['m:' + id], statusOf('m:' + id), w);
  const xs = Object.values(pos).map(q => q.cx), ys = Object.values(pos).map(q => q.cy);
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.cx - w / 2, y: q.cy - BH / 2, w, h: BH }])), id => (Math.abs(Math.sin(pos[id].t)) > 0.9 ? (Math.sin(pos[id].t) < 0 ? 'up' : 'down') : pos[id].cx < cx ? 'left' : 'right'));
  s += lk.s;
  const W = Math.max(cx * 2, Math.max(...xs) + w / 2 + 20, lk.maxX + 12), H = Math.max(...ys) + BH / 2 + 180;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} cycle diagram">${s}</svg>`;
}

// Grids (steroidogenesis): every metabolite sets pos: [column, row]; optional grid_columns headers.
function gridSVG(m, statusOf, opts = {}) {
  const { p, items } = m, COLW = BW + 200, ROWH = BH + 96, X0 = 24 + BW / 2 + 130, Y0 = TOP + (p.grid_columns ? 34 : 0);
  const pos = {};
  for (const [id, x] of Object.entries(p.metabolites)) { const [c, r] = x.pos || [0, 0]; pos[id] = { cx: X0 + c * COLW, cy: Y0 + r * ROWH + BH / 2 }; }
  let s = '';
  (p.grid_columns || []).forEach((label, c) => { s += `<text class="zonet" x="${X0 + c * COLW}" y="${TOP + 8}" text-anchor="middle">${esc(label)}</text>`; });
  p.reactions.forEach(r => { s += drawEdge(m, statusOf, r, pos[r.from], pos[r.to]); });
  for (const [id, q] of Object.entries(pos)) s += metBox(q.cx, q.cy - BH / 2, items['m:' + id], statusOf('m:' + id));
  const lk = linkTags(m, statusOf, Object.fromEntries(Object.entries(pos).map(([id, q]) => [id, { x: q.cx - BW / 2, y: q.cy - BH / 2, w: BW, h: BH }])));
  s += lk.s;
  let H = Math.max(...Object.values(pos).map(q => q.cy)) + BH / 2 + 24;
  const W = Math.max(Math.max(...Object.values(pos).map(q => q.cx)) + BW / 2 + 24, lk.maxX + 12);
  if (opts.zones !== false) {
    // Grids don't split into lanes, so the compartments are listed underneath (and quizzable there).
    const zs = Object.values(items).filter(it => it.kind === 'loc');
    // In columns wide enough for the longest name, one per line, so long tissue names never run into each other.
    if (zs.length) {
      const colW = Math.max(...zs.map(z => z.name.length)) * 7.4 + 40, ncol = Math.max(1, Math.floor((W - 150) / colW)), rows = Math.ceil(zs.length / ncol);
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
  const extra = [ct, (r.also_to || []).length ? 'splits in two' : '', (r.also_from || []).length ? 'joins two' : '', r.branch ? 'side step' : '', r.transport ? 'transport' : '', ...tags].filter(Boolean).join(' · ');
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
