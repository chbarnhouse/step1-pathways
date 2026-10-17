/* Rendering: flow diagrams (linear and cyclic SVG), the list view, and the single-step pair.
   Every function takes the model `m` and a status function key → shown|blank|target|peek|right|missed|start.
   States are never color-only: dashed = hidden, thick = current, check / cross icons, START label. */
'use strict';

const hidden = st => st === 'blank' || st === 'target';
// When set ({draft, bad}), the current blank becomes a text field right on the diagram (Type answers, occlusion modes).
let INLINE = null;
const inlineInput = () => `<input class="ans inl-in${INLINE.bad ? ' bad' : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="?" aria-label="Your answer" value="${esc(INLINE.draft)}">`;
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
    const w = 190, rx = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2, ry = valign === 'bottom' ? y - 32 : y - 16;
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
  let s = `<g class="elab ${cls}">`;
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
  const live = st === 'target' && INLINE, w = live ? 170 : 48;
  const rx = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  if (live) return `<g class="elab target"><rect x="${rx}" y="${y - 16}" width="${w}" height="32" rx="16"/></g>` + inlineField(rx + 4, y - 13, w - 8, 26);
  return `<g class="elab ${st}"><rect x="${rx}" y="${y - 13}" width="${w}" height="26" rx="13"/><text x="${rx + w / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" style="font-style:normal;font-weight:700">?</text></g>`;
}
const cofMark = (x, y, st) => (st === 'right' ? svgIcon(x, y, 'ok') : st === 'missed' ? svgIcon(x, y, 'no') : '');

function flowSVG(m, statusOf, opts = {}) {
  return m.p.circular ? cycleSVG(m, statusOf, opts) : linearSVG(m, statusOf, opts);
}

function linearSVG(m, statusOf) {
  const { p, items, spine, spineMets, branches } = m;
  const pos = {}, perRow = {};
  spineMets.forEach((id, i) => { pos[id] = { x: CX, y: TOP + i * (BH + GAP) }; });
  const place = (id, y) => { if (pos[id]) return; const k = perRow[y] = (perRow[y] || 0) + 1; pos[id] = { x: SIDEX + (k - 1) * (BW + 60), y }; };
  spine.forEach(r => { (r.also_to || []).forEach(s => place(s, pos[r.to].y)); (r.also_from || []).forEach(s => place(s, pos[r.from].y)); });
  for (let pass = 0; pass < 3; pass++) branches.forEach(b => {
    if (pos[b.from] && !pos[b.to]) place(b.to, pos[b.from].y);
    else if (pos[b.to] && !pos[b.from]) place(b.from, pos[b.to].y);
  });
  const ctr = id => ({ cx: pos[id].x, cy: pos[id].y + BH / 2 });
  const xs = Object.values(pos).map(q => q.x);
  const W = Math.max(...xs) + BW / 2 + (Object.keys(perRow).length ? 12 : 190);
  const H = TOP + spineMets.length * (BH + GAP) - GAP + 14;
  let s = '';

  const mult = spine.map((r, i) => (r.multiplier > 1 ? i : -1)).filter(i => i >= 0);
  if (mult.length) {
    const y1 = pos[spine[mult[0]].from].y, y2 = pos[spine[mult[mult.length - 1]].to].y + BH;
    const label = `×${spine[mult[0]].multiplier}${p.multiplier_label ? ' ' + p.multiplier_label : ''}`;
    s += `<path class="mult" d="M18,${y1}H10V${y2}H18"/><text class="multt" transform="translate(6,${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle">${esc(label)}</text>`;
  }
  spine.forEach(r => {
    const y1 = pos[r.from].y + BH, y2 = pos[r.to].y;
    s += arrow(CX, y1 + 4, CX, y2 - 4, r.reversible);
    s += enzLabel(CX - 34, (y1 + y2) / 2, items['e:' + r.id], statusOf('e:' + r.id), 'end', 24);
    const cs = cofSt(m, statusOf, r), ym = (y1 + y2) / 2;
    if (hidden(cs)) s += cofBlank(CX + 16, ym, cs);
    else if (cofVisible(cs)) s += cofArc(m, CX, y1, y2, r.cofactors) + cofMark(CX + 30, ym, cs);
    for (const sd of r.also_to || []) { const e = edgePt(ctr(sd), CX + 40, y1 + 4); s += arrow(CX + 40, y1 + 4, e[0], e[1], r.reversible); }
    for (const sd of r.also_from || []) { const e = edgePt(ctr(sd), CX + 40, y2 - 4); s += arrow(e[0], e[1], CX + 40, y2 - 4, r.reversible); }
  });
  branches.forEach(r => {
    if (!pos[r.from] || !pos[r.to]) return;
    const a = ctr(r.from), b = ctr(r.to);
    const p1 = edgePt(a, b.cx, b.cy), p2 = edgePt(b, a.cx, a.cy);
    s += arrow(p1[0], p1[1], p2[0], p2[1], r.reversible);
    const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
    const cs = cofSt(m, statusOf, r), ct = cofVisible(cs) ? cofText(m, r.cofactors) : '';
    if (Math.abs(p1[1] - p2[1]) < 4) {
      s += enzLabel(mx, my - 8, items['e:' + r.id], statusOf('e:' + r.id), 'middle', 16, 'bottom');
      if (ct) s += `<text class="coft" x="${mx}" y="${my + 20}" text-anchor="middle">${esc(ct)}</text>` + cofMark(mx - 8 - ct.length * 3.4, my + 16, cs);
      if (hidden(cs)) s += cofBlank(mx, my + 22, cs, 'middle');
    } else {
      s += enzLabel(mx + 14, my, items['e:' + r.id], statusOf('e:' + r.id), 'start', 18, 'center', ct ? [ct] : []);
      if (hidden(cs)) s += cofBlank(mx + 14, my + 34, cs);
    }
  });
  for (const [id, pt] of Object.entries(pos)) s += metBox(pt.x, pt.y, items['m:' + id], statusOf('m:' + id));
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} flow diagram">${s}</svg>`;
}

// Cycles: metabolites on a ring (clockwise from the top), enzymes outside, cofactors inside.
function cycleSVG(m, statusOf) {
  const { p, items, spine, spineMets, branches } = m;
  const n = spineMets.length, w = 176;
  const R = Math.max(170, n * 34);
  const cx = R + w / 2 + 210, cy = R + 70;
  const pos = {};
  spineMets.forEach((id, i) => { const t = -Math.PI / 2 + 2 * Math.PI * i / n; pos[id] = { cx: cx + R * Math.cos(t), cy: cy + R * Math.sin(t), t }; });
  branches.forEach(b => {
    const [sp, sd] = pos[b.from] ? [b.from, b.to] : [b.to, b.from];
    if (pos[sp] && !pos[sd]) { const t = pos[sp].t; pos[sd] = { cx: cx + (R + 150) * Math.cos(t), cy: cy + (R + 150) * Math.sin(t), t }; }
  });
  let s = '';
  spine.forEach(r => {
    const a = pos[r.from], b = pos[r.to];
    const p1 = edgePt(a, b.cx, b.cy, w), p2 = edgePt(b, a.cx, a.cy, w);
    s += arrow(p1[0], p1[1], p2[0], p2[1], r.reversible);
    let tm = (a.t + b.t) / 2; if (b.t < a.t) tm += Math.PI;
    const co = Math.cos(tm), si = Math.sin(tm);
    const anchor = co > 0.25 ? 'start' : co < -0.25 ? 'end' : 'middle';
    const ro = R * Math.cos(Math.PI / n) + 34 + (anchor === 'middle' ? 18 : 0);
    s += enzLabel(cx + ro * co, cy + ro * si, items['e:' + r.id], statusOf('e:' + r.id), anchor, 20);
    // Cofactors sit just under the enzyme label, outside the ring (inside, they collide at the top and bottom).
    const cs = cofSt(m, statusOf, r);
    if (cs !== 'none' && cs !== 'hide') {
      const es = statusOf('e:' + r.id), it = items['e:' + r.id];
      const lines = es === 'hide' ? 0 : hidden(es) ? 1.8 : wrap(it.name, 20).length + (r.tags || []).filter(t => t !== 'irreversible').length;
      const lx = cx + ro * co, ly = cy + ro * si + Math.max(lines * 7.5, 0) + 14;
      if (hidden(cs)) s += cofBlank(lx, ly + 6, cs, anchor);
      else {
        const ct = cofText(m, r.cofactors);
        s += `<text class="coft" x="${lx}" y="${ly + 4}" text-anchor="${anchor}">${esc(ct)}</text>`;
        s += cofMark(anchor === 'end' ? lx + 12 : anchor === 'start' ? lx - 12 : lx - ct.length * 3.3 - 12, ly, cs);
      }
    }
  });
  branches.forEach(r => {
    if (!pos[r.from] || !pos[r.to]) return;
    const a = pos[r.from], b = pos[r.to];
    const p1 = edgePt(a, b.cx, b.cy, w), p2 = edgePt(b, a.cx, a.cy, w);
    s += arrow(p1[0], p1[1], p2[0], p2[1], r.reversible);
    s += enzLabel((p1[0] + p2[0]) / 2 + 12, (p1[1] + p2[1]) / 2, items['e:' + r.id], statusOf('e:' + r.id), 'start', 18);
  });
  for (const [id, q] of Object.entries(pos)) s += metBox(q.cx, q.cy - BH / 2, items['m:' + id], statusOf('m:' + id), w);
  const xs = Object.values(pos).map(q => q.cx), ys = Object.values(pos).map(q => q.cy);
  const W = Math.max(cx * 2, Math.max(...xs) + w / 2 + 20), H = Math.max(...ys) + BH / 2 + 60;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} cycle diagram">${s}</svg>`;
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
  const extra = [ct, (r.also_to || []).length ? 'splits in two' : '', (r.also_from || []).length ? 'joins two' : '', r.branch ? 'side step' : '', ...tags].filter(Boolean).join(' · ');
  return `<div class="conn"><span class="arr" aria-label="${r.reversible ? 'reversible' : 'one-way'}">${arr}</span><div class="meta"><span class="ename ${cls}">${badge}${name} ${ic}</span>${extra ? `<span class="cofs">${extra}</span>` : ''}</div></div>`;
}
function listHTML(m, statusOf, { horiz = false } = {}) {
  const parts = m.seq.map(k => {
    const it = m.items[k], st = statusOf(k);
    if (it.kind === 'cof') return '';
    if (it.kind === 'enz' && st === 'hide') return conn(m, { ...it, name: '' }, 'shown', horiz, statusOf);
    return it.kind === 'met' ? chip(it, st) : conn(m, it, st, horiz, statusOf);
  });
  if (m.p.circular) parts.push(`<div class="conn"><span class="arr">${horiz ? '↺' : '↺'}</span><div class="meta"><span class="cofs">back to the start</span></div></div>`);
  return `<div class="list ${horiz ? 'h' : 'v'}">${parts.join('')}</div>`;
}
