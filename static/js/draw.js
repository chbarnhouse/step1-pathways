/* Rendering: flow diagrams (linear and cyclic SVG), the list view, and the single-step pair.
   Every function takes the model `m` and a status function key → shown|blank|target|peek|right|missed|start.
   States are never color-only: dashed = hidden, thick = current, check / cross icons, START label. */
'use strict';

const hidden = st => st === 'blank' || st === 'target';
// When set ({draft, bad}), the current blank becomes a text field right on the diagram (Type answers, occlusion modes).
let INLINE = null;
const inlineInput = () => INLINE.along ? alongWidget(INLINE.along, INLINE.draft)
  : `<input class="ans inl-in${INLINE.bad ? ' bad' : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="?" aria-label="Your answer" value="${esc(INLINE.draft)}">`;
function inlineField(x, y, w, h) {
  return `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"><form xmlns="http://www.w3.org/1999/xhtml" class="inl" data-q="0">${inlineInput()}</form></foreignObject>`;
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
  const label = hidden(st) ? '?' : item.name;
  const fs = !hidden(st) && label.length * 7.6 > w - 14 ? ` style="font-size:${Math.max(10.5, (w - 14) / label.length / 0.56).toFixed(1)}px"` : '';
  let s = `<g class="mbox ${cls}"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${BH}" rx="9"/><text x="${cx}" y="${y + BH / 2}"${fs}>${esc(label)}</text></g>`;
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
    const w = 48, rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
    const ry = valign === 'bottom' ? y - 26 : y - 13;
    return `<g class="elab ${cls}"><rect x="${rx}" y="${ry}" width="${w}" height="26" rx="13"/><text x="${rx + w / 2}" y="${ry + 13}" text-anchor="middle" dominant-baseline="central" style="font-style:normal;font-weight:700">?</text></g>`;
  }
  const lines = wrap(item.name, max);
  const tags = (item.rxn.tags || []).filter(t => t !== 'irreversible');
  const all = [...lines.map(l => ['', l]), ...tags.map(t => ['tag', t]), ...extra.map(t => ['cofl', t])];
  const lh = 15, y0 = valign === 'bottom' ? y - (all.length - 1) * lh - 6 : y - (all.length - 1) * lh / 2;
  let s = `<g class="elab ${cls}${item.rxn?.transport ? ' trn' : ''}">`;
  all.forEach(([c, l], i) => { s += `<text class="${c}" x="${x}" y="${y0 + i * lh}" text-anchor="${anchor}" dominant-baseline="central">${esc(l)}</text>`; });
  s += '</g>';
  const ix = anchor === 'end' ? x + 14 : anchor === 'start' ? x - 14 : x;
  const iy = anchor === 'middle' ? y0 - 18 : y0;
  if (st === 'right') s += svgIcon(ix, iy, 'ok');
  if (st === 'missed') s += svgIcon(ix, iy, 'no');
  if (st === 'start') s += `<text class="startt" x="${x}" y="${y0 - 16}" text-anchor="${anchor}">START</text>`;
  return s;
}
// Curved side arrow: inputs enter near the substrate, outputs leave near the product. up = drawn bottom-to-top.
function cofArc(m, x, y1, y2, c, up = false) {
  const ins = (c.in || []).map(id => cofName(m, id)).join(' + '), outs = (c.out || []).map(id => cofName(m, id)).join(' + ');
  if (!ins && !outs) return '';
  const d = up ? -1 : 1, yF = up ? y2 : y1, yT = up ? y1 : y2, mid = (y1 + y2) / 2;
  const a = [x + 44, yF + 12 * d], b = [x + 44, yT - 12 * d];
  const start = ins ? a : [x + 3, mid], end = outs ? b : [x + 3, mid];
  const ctrl = ins && outs ? [x + 2, mid] : ins ? [x + 12, yF + 20 * d] : [x + 12, yT - 20 * d];
  const ang = Math.atan2(end[1] - ctrl[1], end[0] - ctrl[0]);
  let s = `<path class="cof" d="M${start[0]},${start[1]}Q${ctrl[0]},${ctrl[1]} ${end[0] - Math.cos(ang) * 4},${end[1] - Math.sin(ang) * 4}"/>` + head(end[0], end[1], ang, 7, 'cofh');
  if (ins) s += `<text class="coft" x="${x + 50}" y="${a[1] + 4}">${esc(ins)}</text>`;
  if (outs) s += `<text class="coft" x="${x + 50}" y="${b[1] + 4}">${esc(outs)}</text>`;
  return s;
}

// Cofactor sets are items too ('c:<reaction>'): shown, hidden altogether ('hide'), or a blank to fill.
const cofSt = (m, statusOf, r) => (m.items['c:' + r.id] ? statusOf('c:' + r.id) : 'none');
const cofVisible = st => !hidden(st) && st !== 'none' && st !== 'hide';
function cofBlank(x, y, st, anchor = 'start') {
  const live = st === 'target' && INLINE, w = live ? Math.max(170, INLINE.along ? INLINE.along.length * 8 + 28 : 0) : 48;
  const rx = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  if (live) return `<g class="elab target"><rect x="${rx}" y="${y - 16}" width="${w}" height="32" rx="16"/></g>` + inlineField(rx + 4, y - 13, w - 8, 26);
  return `<g class="elab ${st}"><rect x="${rx}" y="${y - 13}" width="${w}" height="26" rx="13"/><text x="${rx + w / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" style="font-style:normal;font-weight:700">?</text></g>`;
}
const cofMark = (x, y, st) => (st === 'right' ? svgIcon(x, y, 'ok') : st === 'missed' ? svgIcon(x, y, 'no') : '');

function flowSVG(m, statusOf, opts = {}) {
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
    if (ct) s += `<text class="coft" x="${mx}" y="${my + 20}" text-anchor="middle">${esc(ct)}</text>` + cofMark(mx - 8 - ct.length * 3.4, my + 16, cs);
    if (hidden(cs)) s += cofBlank(mx, my + 22, cs, 'middle');
  } else if (Math.abs(p1[0] - p2[0]) < 4) {
    s += enzLabel(mx - 14, my, it, es, 'end', 18, 'center', ct ? [ct] : []);
    if (ct) s += cofMark(mx + 14, my, cs);
    if (hidden(cs)) s += cofBlank(mx + 12, my, cs);
  } else {
    s += enzLabel(mx + 14, my, it, es, 'start', 18, 'center', ct ? [ct] : []);
    if (hidden(cs)) s += cofBlank(mx + 14, my + 34, cs);
  }
  return s;
}

function linearSVG(m, statusOf, { zones = true } = {}) {
  const { p, items, spine, spineMets, branches, onSpine } = m;
  // Side steps between two main-line metabolites (gluconeogenic bypasses in a combined view) curve out to the right.
  const bypass = branches.filter(b => onSpine.has(b.from) && onSpine.has(b.to));
  const sideX = SIDEX + (bypass.length ? 190 : 0);
  const pos = {}, perRow = {};
  spineMets.forEach((id, i) => { pos[id] = { x: CX, y: TOP + i * (BH + GAP) }; });
  const place = (id, y) => { if (pos[id]) return; const k = perRow[y] = (perRow[y] || 0) + 1; pos[id] = { x: sideX + (k - 1) * (BW + 60), y }; };
  spine.forEach(r => { (r.also_to || []).forEach(x => place(x, pos[r.to].y)); (r.also_from || []).forEach(x => place(x, pos[r.from].y)); });
  for (let pass = 0; pass < 3; pass++) branches.forEach(b => {
    if (pos[b.from] && !pos[b.to]) place(b.to, pos[b.from].y);
    else if (pos[b.to] && !pos[b.from]) place(b.from, pos[b.to].y);
  });
  const ctr = id => ({ cx: pos[id].x, cy: pos[id].y + BH / 2 });
  const xs = Object.values(pos).map(q => q.x);
  const W = Math.max(Math.max(...xs) + BW / 2 + (Object.keys(perRow).length ? 12 : 190), bypass.length ? CX + BW / 2 + 330 : 0);
  const H = TOP + spineMets.length * (BH + GAP) - GAP + 14;
  let s = '';

  // Location bands: one per run of steps in the same place; a dashed membrane line where the place changes.
  if (zones) {
    const groups = [];
    spine.forEach(r => { const l = locLabel(m, r); if (!groups.length || groups[groups.length - 1].l !== l) groups.push({ l, rs: [r] }); else groups[groups.length - 1].rs.push(r); });
    if (groups.length > 1) groups.forEach((g, i) => {
      const yTop = i === 0 ? 0 : pos[g.rs[0].from].y + BH / 2;
      const yBot = i === groups.length - 1 ? H : pos[g.rs[g.rs.length - 1].to].y + BH / 2;
      s += `<rect class="zone${i % 2 ? ' alt' : ''}" x="0" y="${yTop}" width="${W}" height="${yBot - yTop}"/>`;
      if (i > 0) s += `<line class="membrane" x1="0" x2="${W}" y1="${yTop}" y2="${yTop}"/>`;
      if (g.l) s += `<text class="zonet" x="${W - 8}" y="${i === 0 ? 14 : yTop + BH / 2 + 16}" text-anchor="end">${esc(g.l)}</text>`;
    });
    else if (groups[0]?.l) s += `<text class="zonet" x="${W - 8}" y="14" text-anchor="end">${esc(groups[0].l)}</text>`;
  }
  const mult = spine.map((r, i) => (r.multiplier > 1 ? i : -1)).filter(i => i >= 0);
  if (mult.length) {
    const y1 = pos[spine[mult[0]].from].y, y2 = pos[spine[mult[mult.length - 1]].to].y + BH;
    const label = `×${spine[mult[0]].multiplier}${p.multiplier_label ? ' ' + p.multiplier_label : ''}`;
    s += `<path class="mult" d="M18,${y1}H10V${y2}H18"/><text class="multt" transform="translate(6,${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle">${esc(label)}</text>`;
  }
  spine.forEach(r => {
    const y1 = pos[r.from].y + BH, y2 = pos[r.to].y;
    s += arrow(CX, y1 + 4, CX, y2 - 4, r.reversible, rxCls(r));
    s += enzLabel(CX - 34, (y1 + y2) / 2, items['e:' + r.id], statusOf('e:' + r.id), 'end', 24);
    const cs = cofSt(m, statusOf, r), ym = (y1 + y2) / 2;
    if (hidden(cs)) s += cofBlank(CX + 16, ym, cs);
    else if (cofVisible(cs)) s += cofArc(m, CX, y1, y2, r.cofactors) + cofMark(CX + 30, ym, cs);
    for (const sd of r.also_to || []) { const e = edgePt(ctr(sd), CX + 40, y1 + 4); s += arrow(CX + 40, y1 + 4, e[0], e[1], r.reversible); }
    for (const sd of r.also_from || []) { const e = edgePt(ctr(sd), CX + 40, y2 - 4); s += arrow(e[0], e[1], CX + 40, y2 - 4, r.reversible); }
  });
  bypass.forEach((r, k) => {
    const a = ctr(r.from), b = ctr(r.to), x0 = CX + BW / 2 + 6, xc = x0 + 120 + (k % 2) * 10;
    const curve = (dx, y0, y1) => `M${x0},${y0} C${xc + dx},${y0} ${xc + dx},${y1} ${x0 + 6},${y1}`;
    s += `<path class="${rxCls(r)}" d="${curve(0, a.cy - 6, b.cy + (b.cy > a.cy ? -6 : 6))}"/>` + head(x0, b.cy + (b.cy > a.cy ? -6 : 6), Math.PI);
    if (r.reversible) s += `<path class="${rxCls(r)}" d="${curve(10, a.cy + 6, b.cy)}"/>` + head(x0, a.cy + 6, Math.PI, 8);
    const my = (a.cy + b.cy) / 2, cs = cofSt(m, statusOf, r), ct = cofVisible(cs) ? cofText(m, r.cofactors) : '';
    s += enzLabel(xc + 12, my, items['e:' + r.id], statusOf('e:' + r.id), 'start', 20, 'center', ct ? [ct] : []);
    if (hidden(cs)) s += cofBlank(xc + 12, my + 36, cs);
  });
  branches.filter(b => !bypass.includes(b)).forEach(r => { if (pos[r.from] && pos[r.to]) s += drawEdge(m, statusOf, r, ctr(r.from), ctr(r.to)); });
  for (const [id, pt] of Object.entries(pos)) s += metBox(pt.x, pt.y, items['m:' + id], statusOf('m:' + id));
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} flow diagram">${s}</svg>`;
}

// Cycles: metabolites on an ellipse (clockwise from the top; wider than tall, like the boxes) joined by curved arrows.
// Enzymes sit outside with their cofactors beneath; the main compartment is written in the middle, exceptions per step.
function cycleSVG(m, statusOf, { zones = true } = {}) {
  const { p, items, spine, spineMets, branches } = m;
  const n = spineMets.length, w = 176;
  const RY = Math.max(170, n * 30), RX = Math.round(RY * 1.5);
  const cx = RX + w / 2 + 220, cy = RY + 90;
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
  if (zones && main) s += `<text class="zonet" x="${cx}" y="${cy + 4}" text-anchor="middle">${esc(main)}</text>`;
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
    const here = locLabel(m, r), loc = zones && here && here !== main ? [here] : [];
    const es = statusOf('e:' + r.id), it = items['e:' + r.id];
    s += enzLabel(lx, ly0, it, es, anchor, 20, 'center', loc);
    const cs = cofSt(m, statusOf, r);
    if (cs !== 'none' && cs !== 'hide') {
      const lines = es === 'hide' ? 0 : hidden(es) ? 1.8 : wrap(it.name, 20).length + (r.tags || []).filter(t => t !== 'irreversible').length + loc.length;
      const ly = ly0 + Math.max(lines * 7.5, 0) + 14;
      if (hidden(cs)) s += cofBlank(lx, ly + 6, cs, anchor);
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
  const W = Math.max(cx * 2, Math.max(...xs) + w / 2 + 20), H = Math.max(...ys) + BH / 2 + 80;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} cycle diagram">${s}</svg>`;
}

// Grids (steroidogenesis): every metabolite sets pos: [column, row]; optional grid_columns headers.
function gridSVG(m, statusOf) {
  const { p, items } = m, COLW = BW + 200, ROWH = BH + 96, X0 = 24 + BW / 2 + 130, Y0 = TOP + (p.grid_columns ? 34 : 0);
  const pos = {};
  for (const [id, x] of Object.entries(p.metabolites)) { const [c, r] = x.pos || [0, 0]; pos[id] = { cx: X0 + c * COLW, cy: Y0 + r * ROWH + BH / 2 }; }
  let s = '';
  (p.grid_columns || []).forEach((label, c) => { s += `<text class="zonet" x="${X0 + c * COLW}" y="${TOP + 8}" text-anchor="middle">${esc(label)}</text>`; });
  p.reactions.forEach(r => { s += drawEdge(m, statusOf, r, pos[r.from], pos[r.to]); });
  for (const [id, q] of Object.entries(pos)) s += metBox(q.cx, q.cy - BH / 2, items['m:' + id], statusOf('m:' + id));
  const W = Math.max(...Object.values(pos).map(q => q.cx)) + BW / 2 + 24, H = Math.max(...Object.values(pos).map(q => q.cy)) + BH / 2 + 24;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} diagram">${s}</svg>`;
}

/* ---------- list view ---------- */
function chip(item, st) {
  const cls = st === 'peek' ? 'shown' : st;
  const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
  const badge = st === 'start' ? '<span class="badge">START</span>' : '';
  if (st === 'target' && INLINE) return `<form class="chip target inl" data-q="0">${inlineInput()}</form>`;
  return `<div class="chip ${cls}">${badge}${hidden(st) ? '?' : esc(item.name)}${ic}</div>`;
}
function conn(m, item, st, horiz, statusOf) {
  const r = item.rxn;
  const arr = horiz ? (r.reversible ? '⇌' : '→') : (r.reversible ? '⇅' : '↓');
  const cls = st === 'peek' ? 'shown' : st;
  const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
  const badge = st === 'start' ? '<span class="badge">START</span> ' : '';
  const name = st === 'target' && INLINE ? `<form class="inl" data-q="0">${inlineInput()}</form>` : hidden(st) ? '?' : esc(item.name);
  const tags = hidden(st) ? [] : (r.tags || []).filter(t => t !== 'irreversible');
  const cs = cofSt(m, statusOf, r);
  const cic = cs === 'right' ? icon('ok') : cs === 'missed' ? icon('no') : '';
  const ct = cofVisible(cs) ? esc(cofText(m, r.cofactors)) + cic
    : cs === 'target' && INLINE ? `<form class="inl" data-q="0">${inlineInput()}</form>`
    : hidden(cs) ? `<span class="ename ${cs}">?</span>` : '';
  const extra = [ct, (r.also_to || []).length ? 'splits in two' : '', (r.also_from || []).length ? 'joins two' : '', r.branch ? 'side step' : '', r.transport ? 'transport' : '', ...tags].filter(Boolean).join(' · ');
  return `<div class="conn"><span class="arr" aria-label="${r.reversible ? 'reversible' : 'one-way'}">${arr}</span><div class="meta"><span class="ename ${cls}">${badge}${name} ${ic}</span>${extra ? `<span class="cofs">${extra}</span>` : ''}</div></div>`;
}
function listHTML(m, statusOf, { horiz = false, zones = true } = {}) {
  let lastLoc = null;
  const parts = m.seq.map(k => {
    const it = m.items[k], st = statusOf(k);
    if (it.kind === 'cof') return '';
    let row = '';
    if (zones && it.rxn) { const l = locLabel(m, it.rxn); if (l && l !== lastLoc) row = `<div class="locrow">${esc(l)}</div>`; lastLoc = l || lastLoc; }
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
