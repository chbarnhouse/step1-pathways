/* Visual pathway editor: metabolites are boxes you drag, steps are arrows between them.
   Drawn at the same scale as the Grid diagram (draw.js gridSVG), so a box's place on the canvas is its `pos`.
   Line and cycle pathways arrange themselves: the canvas shows them as drawn, and moving a box offers to switch to Grid.
   Select a box or an arrow to edit it in the side panel; every change goes through pushUndo (editor.js). */
'use strict';

const VX = { COLW: BW + 200, ROWH: BH + 96, X0: 24 + BW / 2 + 130 };
const vxY0 = () => TOP + (E.draft.grid_columns ? 34 : 0);
const gridPx = ([c, r]) => ({ cx: VX.X0 + c * VX.COLW, cy: vxY0() + r * VX.ROWH + BH / 2 });
const pxGrid = (cx, cy) => [(cx - VX.X0) / VX.COLW, (cy - BH / 2 - vxY0()) / VX.ROWH];
const r2 = v => Math.round(v * 100) / 100;
const isGrid = () => E.draft.layout === 'grid';

/* ---------- positions ---------- */
// Where the quiz diagram draws each box for a line or cycle pathway (read back out of flowSVG's own output).
function flowPositions() {
  let svg = '';
  try { svg = flowSVG(buildModel({ ...E.draft, reactions: E.draft.reactions.filter(edOk) }), () => 'shown'); } catch { return {}; }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), P = {};
  for (const g of doc.querySelectorAll('g.mbox[data-key]')) {
    const r = g.querySelector('rect'), id = g.getAttribute('data-key').slice(2);
    if (r) P[id] = { cx: +r.getAttribute('x') + +r.getAttribute('width') / 2, cy: +r.getAttribute('y') + BH / 2 };
  }
  return P;
}
// Every metabolite gets a spot; ones the diagram doesn't draw yet (unconnected, or no pos) wait in a row underneath.
function vxPositions() {
  const P = {};
  if (isGrid()) { for (const [id, m] of Object.entries(E.draft.metabolites)) if (m.pos) P[id] = gridPx(m.pos); }
  else Object.assign(P, flowPositions());
  const ys = Object.values(P).map(q => q.cy);
  const y0 = (ys.length ? Math.max(...ys) + VX.ROWH : vxY0() + BH / 2);
  let k = 0;
  for (const id of Object.keys(E.draft.metabolites)) if (!P[id]) { P[id] = { cx: VX.X0 + (k % 3) * VX.COLW, cy: y0 + Math.floor(k / 3) * VX.ROWH * 0.7, parked: true }; k++; }
  return P;
}
// Grid positions that reproduce the current picture exactly (used when a line or cycle becomes a grid).
function gridFromPicture() {
  const P = vxPositions(), out = {};
  for (const [id, q] of Object.entries(P)) out[id] = pxGrid(q.cx, q.cy);
  const minC = Math.min(0, ...Object.values(out).map(v => v[0])), minR = Math.min(0, ...Object.values(out).map(v => v[1]));
  for (const id of Object.keys(out)) out[id] = [r2(out[id][0] - minC), r2(out[id][1] - minR)];
  return out;
}
function vxToGrid() {
  pushUndo();
  const at = gridFromPicture();
  delete E.draft.circular; E.draft.layout = 'grid';
  for (const [id, m] of Object.entries(E.draft.metabolites)) m.pos = at[id] || m.pos || [0, 0];
  renderEditor();
}
function askToGrid() {
  ask({ title: 'Place the boxes yourself?', ok: 'Switch to Grid', cancel: 'Keep it automatic',
    text: `This pathway uses the ${layoutOf(E.draft)} layout, which arranges the boxes by itself. Moving a box switches it to the Grid layout: the diagram is then drawn exactly as you place things.\n\nGrid diagrams don’t draw compartment lanes or a cycle ring, and quizzes read the steps in the order they’re listed. Undo or the Layout menu switches back.` })
    .then(y => y && vxToGrid());
}

/* ---------- markup ---------- */
const tb = (act, ic, label, extra = '') => `<button type="button" class="btn small ghost" data-vx="${act}" ${extra}>${mi(ic, 'sm')}<span>${label}</span></button>`;
function vxHTML() {
  return `<div class="vx">
    <div class="vx-main card">
      <div class="vx-tools" role="toolbar" aria-label="Canvas">
        ${tb('add-met', 'add', 'Metabolite')}
        ${tb('frame', 'category', 'Group', `aria-pressed="${!!E.frameMode}" title="Drag a frame around boxes to make a group"`)}
        ${tb('delete', 'delete', 'Delete', E.sel ? '' : 'disabled')}
        <span class="vx-sep"></span>
        ${tb('undo', 'undo', 'Undo', E.undo.length ? '' : 'disabled')}
        ${tb('redo', 'redo', 'Redo', E.redo.length ? '' : 'disabled')}
        <span class="vx-sep"></span>
        <button type="button" class="btn small ghost iconbtn" data-vx="zoom-out" aria-label="Zoom out" title="Zoom out">${mi('zoom_out', 'sm')}</button>
        <button type="button" class="btn small ghost iconbtn" data-vx="zoom-in" aria-label="Zoom in" title="Zoom in">${mi('zoom_in', 'sm')}</button>
        ${tb('fit', 'fit_screen', 'Fit')}
        ${isGrid() ? tb('snap', 'grid_on', 'Snap', `aria-pressed="${E.snap}" title="Line boxes up on quarter columns and half rows"`) : ''}
      </div>
      ${isGrid() ? '' : `<div class="vx-note">${mi('route', 'sm')}<span>${layoutOf(E.draft) === 'cycle' ? 'Cycle' : 'Line'} layout: the boxes are placed automatically, as quizzes draw them.</span><button type="button" class="btn small" data-vx="to-grid">Place them myself</button></div>`}
      <div class="vx-stage"><svg id="vxSvg" class="flow vx-svg" role="application" aria-label="Pathway canvas. Drag boxes to move them; drag a selected box’s arrow handle to another box to add a step."></svg></div>
      <p class="vx-help muted">${E.frameMode ? '<b>Group:</b> drag a frame around the boxes to group, or press Esc. ' : ''}Drag a box to move it, or empty space to pan. Select a box, then drag its ${mi('arrow_forward', 'sm')} handle onto another box to add a step (drop on empty space for a new metabolite). Double-click empty space to add a metabolite. ⌘Z undoes.</p>
    </div>
    <aside class="vx-insp card" id="vxInsp" aria-label="Selected item"></aside>
  </div>`;
}

/* ---------- drawing ---------- */
const vxBadge = (x, y, c) => (!c ? '' : `<g class="vx-badge ${c}" transform="translate(${x - 10},${y - 10})"><title>${c === 'added' ? 'Added — not in the built-in' : 'Edited — differs from the built-in'}</title><circle cx="10" cy="10" r="10"/><svg x="3" y="3" width="14" height="14" viewBox="0 -960 960 960"><path d="${MI[c === 'added' ? 'add' : 'edit_note']}"/></svg></g>`);
function vxHead(x, y, ang, size = 9) {
  const a1 = ang + Math.PI * 0.84, a2 = ang - Math.PI * 0.84;
  return `<path class="vx-ah" d="M${x},${y}L${x + size * Math.cos(a1)},${y + size * Math.sin(a1)}L${x + size * Math.cos(a2)},${y + size * Math.sin(a2)}Z"/>`;
}
// One step: a straight arrow, bowed when two steps join the same pair of boxes. Returns markup + where its label sits.
function vxStep(r, P, off, selId, cofM) {
  const a = P[r.from], b = P[r.to];
  if (!a || !b || r.from === r.to) return '';
  const dx = b.cx - a.cx, dy = b.cy - a.cy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const ctl = { cx: (a.cx + b.cx) / 2 + nx * off * 2, cy: (a.cy + b.cy) / 2 + ny * off * 2 };
  const p1 = edgePt(a, ctl.cx, ctl.cy), p2 = edgePt(b, ctl.cx, ctl.cy);
  const d = off ? `M${p1[0]},${p1[1]} Q${ctl.cx},${ctl.cy} ${p2[0]},${p2[1]}` : `M${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`;
  const mid = off ? [0.25 * p1[0] + 0.5 * ctl.cx + 0.25 * p2[0], 0.25 * p1[1] + 0.5 * ctl.cy + 0.25 * p2[1]] : [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const angEnd = Math.atan2(p2[1] - (off ? ctl.cy : p1[1]), p2[0] - (off ? ctl.cx : p1[0]));
  const angStart = Math.atan2(p1[1] - (off ? ctl.cy : p2[1]), p1[0] - (off ? ctl.cx : p2[0]));
  const sel = selId === r.id, enz = E.draft.enzymes[r.enzyme];
  let s = `<g class="vx-step${sel ? ' sel' : ''}${r.transport ? ' trn' : ''}" data-rxn="${esc(r.id)}">`;
  if (sel) s += `<path class="vx-glow" d="${d}"/>`;
  s += `<path class="vx-hit" d="${d}"/><path class="vx-ln" d="${d}"/>` + vxHead(p2[0], p2[1], angEnd) + (r.reversible ? vxHead(p1[0], p1[1], angStart) : '');
  // Label beside the line, never on it: above a shallow arrow, left of a steep one (as the diagram does).
  const steep = Math.abs(dy) > Math.abs(dx);
  let lx = nx, ly = ny;
  if (steep ? lx > 0 : ly > 0) { lx = -lx; ly = -ly; }
  const x = mid[0] + lx * 14, y = mid[1] + ly * 14, anchor = steep ? 'end' : 'middle';
  const lines = enz ? wrap(enz.name || r.enzyme, 22).slice(0, 3) : [];
  const ct = (r.cofactors?.in || []).length || (r.cofactors?.out || []).length ? cofText(cofM, r.cofactors) : '';
  const all = [...lines.map(t => ['vx-enz', t]), ...(ct ? [['vx-cof', ct]] : [])];
  if (!enz) {
    const w = 128, rx = anchor === 'end' ? x - w : x - w / 2, ry = steep ? y - 13 : y - 26;
    s += `<g class="vx-pick"><rect x="${rx}" y="${ry}" width="${w}" height="26" rx="13"/><text x="${rx + w / 2}" y="${ry + 13}">Choose enzyme</text></g>`;
  } else {
    const lh = 15, y0 = steep ? y - (all.length - 1) * lh / 2 : y - (all.length - 1) * lh - 6;
    all.forEach(([c, t], i) => { s += `<text class="${c}" x="${x}" y="${y0 + i * lh}" text-anchor="${anchor}">${esc(t)}</text>`; });
  }
  s += vxBadge(anchor === 'end' ? x + 14 : x - 8 - Math.max(...all.map(l => l[1].length), 8) * 3.6, steep ? y : y - 6 - (all.length - 1) * 15, itemChange('rxn', r.id));
  // Side products leave from the middle of the arrow; side inputs join it there.
  for (const [ids, out] of [[r.also_to || [], true], [r.also_from || [], false]]) for (const sid of ids) {
    const q = P[sid];
    if (!q) continue;
    const e = edgePt(q, mid[0], mid[1]);
    const [fx, fy, tx, ty] = out ? [mid[0], mid[1], e[0], e[1]] : [e[0], e[1], mid[0], mid[1]];
    s += `<path class="vx-hit" d="M${fx},${fy}L${tx},${ty}"/><path class="vx-side" d="M${fx},${fy}L${tx},${ty}"/>` + vxHead(tx, ty, Math.atan2(ty - fy, tx - fx), 7);
  }
  return s + '</g>';
}
function vxNode(id, q, sel) {
  const m = E.draft.metabolites[id], label = m.name || id, w = BW;
  const fs = label.length * 7.6 > w - 14 ? ` style="font-size:${Math.max(10.5, (w - 14) / label.length / 0.56).toFixed(1)}px"` : '';
  const x = q.cx - w / 2, y = q.cy - BH / 2;
  let s = `<g class="vx-node${sel ? ' sel' : ''}${q.parked ? ' parked' : ''}" data-node="${esc(id)}">`;
  if (sel) s += `<rect class="vx-ring" x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${BH + 12}" rx="13"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${BH}" rx="9"/><text x="${q.cx}" y="${q.cy}"${fs}>${esc(label)}</text></g>`;
  s += vxBadge(x + w - 4, y + 2, itemChange('met', id));
  if (sel) s += `<g class="vx-handle" data-handle="${esc(id)}"><title>Drag onto another box to add a step</title><circle class="vx-hit-c" cx="${x + w + 24}" cy="${q.cy}" r="20"/><circle cx="${x + w + 24}" cy="${q.cy}" r="12"/><svg x="${x + w + 16}" y="${q.cy - 8}" width="16" height="16" viewBox="0 -960 960 960"><path d="${MI.arrow_forward}"/></svg></g>`;
  return s;
}
function renderCanvas() {
  const svg = $('#vxSvg');
  if (!svg || !E.draft) return;
  const P = E.vxPos = vxPositions(), d = E.draft, selM = E.sel?.kind === 'met' ? E.sel.id : null, selR = E.sel?.kind === 'rxn' ? E.sel.id : null;
  let s = '';
  if (isGrid()) {
    // Faint guides through column and row centers: where boxes line up.
    const cs = Object.values(P).map(q => pxGrid(q.cx, q.cy)), maxC = Math.ceil(Math.max(3, ...cs.map(c => c[0]))) + 1, maxR = Math.ceil(Math.max(4, ...cs.map(c => c[1]))) + 1;
    for (let c = 0; c <= maxC; c++) { const x = gridPx([c, 0]).cx; s += `<line class="vx-guide" x1="${x}" x2="${x}" y1="${vxY0() - 20}" y2="${gridPx([0, maxR]).cy}"/>`; }
    for (let r = 0; r <= maxR; r++) { const y = gridPx([0, r]).cy; s += `<line class="vx-guide" x1="${VX.X0 - BW / 2 - 40}" x2="${gridPx([maxC, 0]).cx}" y1="${y}" y2="${y}"/>`; }
    (d.grid_columns || []).forEach((label, c) => { s += `<text class="zonet" x="${gridPx([c, 0]).cx}" y="${TOP + 8}" text-anchor="middle">${esc(label)}</text>`; });
  }
  // Groups: dashed frames behind everything, as quizzes draw them; click a frame or its name to edit the group.
  const selG = E.sel?.kind === 'grp' ? E.sel.id : null, rects = Object.fromEntries(Object.entries(P).map(([id, q]) => ['m:' + id, { x: q.cx - BW / 2, y: q.cy - BH / 2, w: BW, h: BH }]));
  const gs = edGroups().map(g => ({ ...g, members: (g.members || []).filter(id => P[id]) }));
  gs.forEach((g, i) => {
    const r = g.members.length && groupRect(g, rects, gs.filter(x => x.members.length));
    if (!r) return;
    const tone = g.tone || GROUP_TONES[i % GROUP_TONES.length];
    s += `<g class="vx-grp${g.id === selG ? ' sel' : ''}" data-grp="${esc(g.id)}"><rect class="vx-grp-hit" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14"/><rect class="gframe tone-${tone}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14"/><text class="gname tone-${tone}" x="${r.x + 2}" y="${r.y - 8}">${esc(g.name || 'Group')}</text></g>`;
  });
  if (E.drag?.type === 'frame' && E.drag.b) { const a = E.drag.a, b = E.drag.b; s += `<rect class="gdraft" x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" rx="14"/>`; }
  // Connectors, as straight dashed lines (quizzes route them at right angles): box → the step it carries out, box ⊣ box.
  for (const r of d.reactions) for (const id of r.by || []) {
    const a = P[id], f = P[r.from], t = P[r.to];
    if (a && f && t) s += `<path class="ln conn fx-act" d="M${a.cx},${a.cy}L${(f.cx + t.cx) / 2},${(f.cy + t.cy) / 2}"/>`;
  }
  for (const x of d.inhibits || []) { const a = P[x.from], b = P[x.to]; if (a && b) s += `<path class="ln conn fx-inh" d="M${a.cx},${a.cy}L${b.cx},${b.cy}"/>`; }
  // Steps joining the same two boxes bow apart so each stays clickable.
  const pairN = {}, pairI = {};
  for (const r of d.reactions) { const k = [r.from, r.to].sort().join('|'); pairN[k] = (pairN[k] || 0) + 1; }
  const cofM = { cof: edCof() };
  for (const r of d.reactions) {
    const k = [r.from, r.to].sort().join('|'), i = pairI[k] = (pairI[k] ?? -1) + 1, n = pairN[k];
    const sign = r.from < r.to ? 1 : -1;
    s += vxStep(r, P, n > 1 ? (i - (n - 1) / 2) * 34 * sign : 0, selR, cofM);
  }
  for (const [id, q] of Object.entries(P)) if (id !== selM) s += vxNode(id, q, false);
  if (selM && P[selM]) s += vxNode(selM, P[selM], true);
  if (E.drag?.type === 'connect' && E.drag.to) {
    const a = P[E.drag.from], t = E.drag.to;
    s += `<path class="vx-rubber" d="M${a.cx},${a.cy}L${t.x},${t.y}"/>` + vxHead(t.x, t.y, Math.atan2(t.y - a.cy, t.x - a.cx));
  }
  svg.innerHTML = s;
  vxApplyView();
  const n = Object.keys(d.metabolites).length;
  svg.setAttribute('aria-label', `Pathway canvas: ${n} metabolites, ${d.reactions.length} steps. Drag boxes to move them; drag a selected box’s arrow handle to another box to add a step.`);
}

/* ---------- view: pan + zoom ---------- */
function vxBounds() {
  const qs = Object.values(E.vxPos || vxPositions());
  if (!qs.length) return { x: 0, y: 0, w: 800, h: 500 };
  const x0 = Math.min(...qs.map(q => q.cx)) - BW / 2 - 150, x1 = Math.max(...qs.map(q => q.cx)) + BW / 2 + 60;
  const y0 = Math.min(...qs.map(q => q.cy)) - BH / 2 - 50, y1 = Math.max(...qs.map(q => q.cy)) + BH / 2 + 50;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function vxFit() {
  const st = $('.vx-stage');
  if (!st) return;
  const b = vxBounds(), cw = st.clientWidth || 600, ch = st.clientHeight || 400;
  const k = Math.min(cw / b.w, ch / b.h, 1.1);
  E.view = { k, x: b.x - (cw / k - b.w) / 2, y: b.y - (ch / k - b.h) / 2 };
  E.viewAuto = true; E.autoCenter = null;
  vxApplyView();
}
// Until you pan or zoom, the view keeps refitting as the window changes size (and stays centered on a deep-linked item).
function vxAutoView() {
  const c = E.autoCenter;
  vxFit();
  if (c) { vxCenterOn(c); E.viewAuto = true; E.autoCenter = c; }
}
function vxApplyView() {
  const svg = $('#vxSvg'), st = $('.vx-stage');
  if (!svg || !st) return;
  if (!E.view) return vxFit();
  const cw = st.clientWidth || 600, ch = st.clientHeight || 400, v = E.view;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${cw / v.k} ${ch / v.k}`);
}
function vxZoom(f, cx, cy) {
  const st = $('.vx-stage'), v = E.view;
  if (!st || !v) return;
  const r = st.getBoundingClientRect();
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  E.viewAuto = false;
  const k = Math.min(3, Math.max(0.12, v.k * f)), wx = v.x + (cx - r.left) / v.k, wy = v.y + (cy - r.top) / v.k;
  E.view = { k, x: wx - (cx - r.left) / k, y: wy - (cy - r.top) / k };
  vxApplyView();
}
function vxCenterOn(q) {
  const st = $('.vx-stage');
  if (!st || !E.view || !q) return;
  const k = Math.max(E.view.k, 0.7);
  E.view = { k, x: q.cx - st.clientWidth / 2 / k, y: q.cy - st.clientHeight / 2 / k };
  E.viewAuto = false;
  vxApplyView();
}
const vxWorld = e => { const r = $('.vx-stage').getBoundingClientRect(), v = E.view; return { x: v.x + (e.clientX - r.left) / v.k, y: v.y + (e.clientY - r.top) / v.k }; };

/* ---------- edits from the canvas ---------- */
function vxSelect(kind, id, opts = {}) {
  E.sel = kind ? { kind, id, ...opts } : null;
  renderCanvas();
  vxRefreshPanel(true);
}
function vxFreeSpot(c, r) {
  const taken = new Set(Object.values(E.draft.metabolites).filter(m => m.pos).map(m => `${Math.round(m.pos[0] * 4)},${Math.round(m.pos[1] * 2)}`));
  while (taken.has(`${Math.round(c * 4)},${Math.round(r * 2)}`)) r += 0.5;
  return [r2(c), r2(r)];
}
function vxSnap(c, r) { return E.snap ? [Math.round(c * 4) / 4, Math.round(r * 2) / 2] : [r2(c), r2(r)]; }
function vxAddMet(at) {
  return ask({ title: 'New metabolite', input: true, ok: 'Add' }).then(nm => {
    if (!nm) return null;
    pushUndo();
    const id = newItem('met', nm);
    if (isGrid()) {
      const v = E.view, st = $('.vx-stage');
      const w = at || (v && st ? { x: v.x + st.clientWidth / 2 / v.k, y: v.y + st.clientHeight / 2 / v.k } : { x: VX.X0, y: vxY0() });
      const [c, r] = vxSnap(...pxGrid(w.x, w.y));
      E.draft.metabolites[id].pos = vxFreeSpot(Math.max(0, c), Math.max(0, r));
    }
    E.sel = { kind: 'met', id, focus: true };
    renderEditor();
    return id;
  });
}
// joined: the new box was just added as part of this same action, so one Undo takes back both.
function vxAddStep(from, to, joined = false) {
  if (!joined) pushUndo();
  const R = E.draft.reactions, last = R.filter(r => !r.branch).slice(-1)[0];
  const r = { id: newReactionId(), enzyme: '', from, to, reversible: false, cofactors: { in: [], out: [] } };
  // On a line or cycle, a step that doesn't continue from the end of the main line is drawn as a side step.
  if (!isGrid() && last && last.to !== from) r.branch = true;
  R.push(r);
  E.sel = { kind: 'rxn', id: r.id, focus: 'pick' };
  renderEditor();
}
function vxDelete() {
  const s = E.sel, d = E.draft;
  if (!s) return;
  pushUndo();
  if (s.kind === 'grp') {
    d.groups = d.groups.filter(g => g.id !== s.id); if (!d.groups.length) delete d.groups;
    toast('Group deleted. Undo brings it back.');
  } else if (s.kind === 'rxn') {
    d.reactions = d.reactions.filter(r => r.id !== s.id);
    toast('Step deleted. Undo brings it back.');
  } else {
    const n0 = d.reactions.length, name = d.metabolites[s.id]?.name || s.id;
    d.reactions = d.reactions.filter(r => r.from !== s.id && r.to !== s.id);
    for (const r of d.reactions) for (const k of ['also_to', 'also_from']) if (r[k]) { r[k] = r[k].filter(x => x !== s.id); if (!r[k].length) delete r[k]; }
    delete d.metabolites[s.id];
    pruneGroups(d);
    const gone = n0 - d.reactions.length;
    toast(`${name} deleted${gone ? ` with ${gone} step${gone > 1 ? 's' : ''}` : ''}. Undo brings it back.`);
  }
  pruneCof(d);
  E.sel = null;
  renderEditor();
}

/* ---------- side panel ---------- */
const ri = id => E.draft.reactions.findIndex(r => r.id === id);
function panelHead(kind, id, title) {
  const c = itemChange(kind, id);
  return `<div id="vxHead"><div class="vx-ph"><h3>${title}</h3><button type="button" class="btn small ghost iconbtn" data-vx="deselect" aria-label="Close" title="Back to the pathway">${mi('close', 'sm')}</button></div>
    ${c ? `<div class="vx-chg">${changeBadge(c)}${c === 'edited' ? `<button type="button" class="ed-revert" data-revert-item="${kind}" data-id="${esc(id)}">${mi('undo', 'sm')}Revert all</button>` : '<span class="muted">Not in the built-in.</span>'}</div>` : ''}</div>`;
}
function metPanel(id) {
  const m = E.draft.metabolites[id], base = `metabolites.${esc(id)}`;
  const uses = E.draft.reactions.filter(r => [r.from, r.to, ...(r.also_to || []), ...(r.also_from || [])].includes(id));
  return `${panelHead('met', id, 'Metabolite')}
    <div class="vx-fields">
      <label>Name<input data-path="${base}.name" value="${esc(m.name)}"></label>
      <label>Abbreviation<input data-path="${base}.short" value="${esc(m.short)}"></label>
      <label title="Spelled-out names. Always accepted.">Also called (full names, comma-separated)<input data-path="${base}.aliases" data-list value="${esc(listStr(m.aliases))}" placeholder="e.g. δ-aminolevulinate synthase"></label>
      <label title="Abbreviations and short forms. Not accepted when Require full names is on.">Sometimes written as (nicknames, comma-separated)<input data-path="${base}.nicknames" data-list value="${esc(listStr(m.nicknames))}" placeholder="e.g. ALAS, ALA synthase"></label>
      <label>Facts shown after answering<textarea rows="3" data-path="${base}.notes">${esc(m.notes)}</textarea></label>
      ${isGrid() ? `<div class="vx-two" data-revwrap><label>Column<input type="number" min="0" step="any" data-gridpos="${esc(id)}" data-axis="0" value="${esc(m.pos?.[0] ?? 0)}"></label><label>Row<input type="number" min="0" step="any" data-gridpos="${esc(id)}" data-axis="1" value="${esc(m.pos?.[1] ?? 0)}"></label></div>` : ''}
      <label>Compartment (if not its steps’)<input data-path="${base}.loc" list="locList" value="${esc(m.loc || '')}" placeholder="from its steps"></label>
    </div>
    <h4>Steps</h4>
    ${uses.length ? `<ul class="vx-list">${uses.map(r => `<li><button type="button" class="linkish" data-vx="pick" data-kind="rxn" data-id="${esc(r.id)}">${esc(itemName('rxn', r.id))}</button></li>`).join('')}</ul>` : '<p class="muted">Not in any step yet.</p>'}
    <div class="side" title="A red flat-ended dashed connector from this box to each of these, on grid diagrams"><span class="muted">Inhibits:</span> ${inhChips(id)}</div>
    ${edGroups().length ? `<h4>Groups</h4><div class="ed-members">${edGroups().map((g, i) => `<label class="cb small"><input type="checkbox" data-gmem="${i}" value="${esc(id)}" ${g.members.includes(id) ? 'checked' : ''}> ${esc(g.name)}</label>`).join('')}</div>` : ''}
    <label class="vx-connect">Add a step from here to<select data-vx-connect="${esc(id)}">${metOpts('', '— choose —').replace(`<option value="${esc(id)}">${esc(m.name || id)}</option>`, '')}</select></label>
    <div class="actions"><button type="button" class="btn small ghost" data-vx="delete">${mi('delete', 'sm')} Delete metabolite</button></div>`;
}
function grpPanel(id) {
  const i = edGroups().findIndex(g => g.id === id), g = edGroups()[i];
  return `<div id="vxHead"><div class="vx-ph"><h3>Group</h3><button type="button" class="btn small ghost iconbtn" data-vx="deselect" aria-label="Close" title="Back to the pathway">${mi('close', 'sm')}</button></div></div>
    <div class="vx-fields">${groupFields(g, i)}</div>
    <h4>In this group (${g.members.length})</h4>
    <div class="ed-members">${memberBoxes(i)}</div>
    <p class="muted small">Its frame goes around these boxes. On a grid, keep other boxes out of that space, or the frame will look like it holds them too.</p>
    <div class="actions"><button type="button" class="btn small ghost" data-vx="delete">${mi('delete', 'sm')} Delete group</button></div>`;
}
function rxnPanel(id) {
  const i = ri(id), r = E.draft.reactions[i], e = E.draft.enzymes[r.enzyme], eb = `enzymes.${esc(r.enzyme)}`;
  const shared = e ? E.draft.reactions.filter(x => x.enzyme === r.enzyme).length : 0;
  return `${panelHead('rxn', id, `Step ${i + 1} of ${E.draft.reactions.length}`)}
    <div class="vx-fields">
      <div class="vx-two"><label>From<select data-path="reactions.${i}.from">${metOpts(r.from)}</select></label><label>To<select data-path="reactions.${i}.to">${metOpts(r.to)}</select></label></div>
      <button type="button" class="btn small ghost" data-vx="swap">${mi('swap_horiz', 'sm')} Swap direction</button>
      <label>${r.transport ? 'Transporter' : 'Enzyme'}<select data-path="reactions.${i}.enzyme" data-focus="pick">${enzOpts(r.enzyme)}</select></label>
      ${e ? `<fieldset class="vx-enzf"><legend>${esc(e.name || r.enzyme)}${shared > 1 ? ` <span class="muted">· used by ${shared} steps</span>` : ''}</legend>
        <label>Name<input data-path="${eb}.name" value="${esc(e.name)}" data-focus="enz"></label>
        <label>Abbreviation<input data-path="${eb}.short" value="${esc(e.short)}"></label>
        <label title="Spelled-out names. Always accepted.">Also called (full names, comma-separated)<input data-path="${eb}.aliases" data-list value="${esc(listStr(e.aliases))}" placeholder="e.g. δ-aminolevulinate synthase"></label>
      <label title="Abbreviations and short forms. Not accepted when Require full names is on.">Sometimes written as (nicknames, comma-separated)<input data-path="${eb}.nicknames" data-list value="${esc(listStr(e.nicknames))}" placeholder="e.g. ALAS, ALA synthase"></label>
        <label>Facts shown after answering<textarea rows="3" data-path="${eb}.notes">${esc(e.notes)}</textarea></label>
        ${itemChange('enz', r.enzyme) === 'edited' ? `<div class="vx-chg">${changeBadge('edited')}<button type="button" class="ed-revert" data-revert-item="enz" data-id="${esc(r.enzyme)}">${mi('undo', 'sm')}Revert enzyme</button></div>` : ''}
      </fieldset>` : ''}
      <label class="cb"><input type="checkbox" data-path="reactions.${i}.reversible" ${r.reversible ? 'checked' : ''}> Reversible</label>
      <label class="cb"><input type="checkbox" data-path="reactions.${i}.transport" ${r.transport ? 'checked' : ''}> Transport (crosses a membrane)</label>
      ${isGrid() ? '' : `<label class="cb"><input type="checkbox" data-path="reactions.${i}.branch" ${r.branch ? 'checked' : ''}> Side step (off the main line)</label>`}
      <label>Cofactors in<input data-cof="in" data-i="${i}" value="${esc(cofStr(r.cofactors?.in))}" placeholder="e.g. ATP" data-focus="cof"></label>
      <label>Cofactors out<input data-cof="out" data-i="${i}" value="${esc(cofStr(r.cofactors?.out))}" placeholder="e.g. ADP"></label>
      <label>Compartment<input data-path="reactions.${i}.loc" list="locList" value="${esc(r.loc || '')}" placeholder="e.g. mitochondria"></label>
      <label>Tissue (if not the pathway’s)<input data-path="reactions.${i}.tissue" value="${esc(r.tissue || '')}" placeholder="e.g. small intestine"></label>
      <div class="vx-two"><label>Runs ×<input type="number" min="1" max="9" data-path="reactions.${i}.multiplier" value="${esc(r.multiplier || 1)}"></label>
        <label>Tags<input data-path="reactions.${i}.tags" data-list value="${esc(listStr(r.tags))}" placeholder="rate-limiting"></label></div>
      <label>Requires<input data-path="reactions.${i}.requires" data-list value="${esc(listStr(r.requires))}" placeholder="e.g. B6 (PLP)"></label>
      <div class="side" data-rev="reactions.${i}.also_to"><span class="muted">Side products:</span> ${sideChips(r, i, 'also_to')}</div>
      <div class="side" data-rev="reactions.${i}.also_from"><span class="muted">Side inputs:</span> ${sideChips(r, i, 'also_from')}</div>
      ${byRow(r, i)}
    </div>
    <div class="actions">
      <button type="button" class="btn small ghost" data-ed="up" data-i="${i}" ${i ? '' : 'disabled'}>Earlier in the list</button>
      <button type="button" class="btn small ghost" data-ed="down" data-i="${i}" ${i < E.draft.reactions.length - 1 ? '' : 'disabled'}>Later</button>
      <button type="button" class="btn small ghost" data-vx="delete">${mi('delete', 'sm')} Delete step</button>
    </div>`;
}
function pathwayPanel() {
  const d = E.draft, off = d.reactions.filter(r => !E.vxPos?.[r.from] || !E.vxPos?.[r.to] || r.from === r.to);
  return `<div class="vx-ph"><h3>Pathway</h3></div>
    ${E.err ? `<div class="ed-err">${esc(E.err).replace(/\n/g, '<br>')}</div>` : ''}
    ${off.length ? `<p class="muted">Not on the canvas until both ends are chosen: ${off.map(r => `<button type="button" class="linkish" data-vx="pick" data-kind="rxn" data-id="${esc(r.id)}">Step ${ri(r.id) + 1}</button>`).join(', ')}.</p>` : ''}
    ${edBase() ? `<h4>Changes from the built-in</h4>${changesHTML()}` : ''}
    <h4>Basics</h4>${basicsHTML(d)}
    <h4>Extra wrong answers for multiple choice</h4>${distractorsHTML(d)}
    <h4>Groups</h4>${edGroups().length ? `<ul class="vx-list">${edGroups().map(g => `<li><button type="button" class="linkish" data-vx="pick" data-kind="grp" data-id="${esc(g.id)}">${esc(g.name)}</button> <span class="muted small">${g.members.length} boxes</span></li>`).join('')}</ul>` : ''}
    <p class="muted small">Use the ${mi('category', 'sm')} Group tool and drag a frame around boxes to make a group.</p>
    <h4>Everything</h4>
    <details class="vx-all"><summary>${Object.keys(d.metabolites).length} metabolites · ${d.reactions.length} steps</summary>
      <ul class="vx-list">${Object.keys(d.metabolites).map(id => `<li><button type="button" class="linkish" data-vx="pick" data-kind="met" data-id="${esc(id)}">${esc(itemName('met', id))}</button></li>`).join('')}</ul>
      <ul class="vx-list">${d.reactions.map((r, i) => `<li><button type="button" class="linkish" data-vx="pick" data-kind="rxn" data-id="${esc(r.id)}">${i + 1}. ${esc(itemName('rxn', r.id))}</button></li>`).join('')}</ul>
    </details>`;
}
// After a field is committed: toolbar state, and the panel's Edited / Revert all line.
function vxTools() {
  const head = $('#vxHead'), s = E.sel;
  if (head && s && s.kind !== 'grp') head.outerHTML = panelHead(s.kind, s.id, $('h3', head).textContent);
  const tools = $('.vx-tools');
  if (!tools) return;
  $('[data-vx="delete"]', tools).disabled = !E.sel;
  $('[data-vx="undo"]', tools).disabled = !E.undo.length;
  $('[data-vx="redo"]', tools).disabled = !E.redo.length;
}
// Redraw the panel (and toolbar state) without touching the canvas view. fresh = a new selection: scroll to the top.
function vxRefreshPanel(fresh) {
  const box = $('#vxInsp');
  if (!box || !E.draft) return;
  const s = E.sel, keep = fresh ? 0 : box.scrollTop;
  const has = s && (s.kind === 'met' ? E.draft.metabolites[s.id] : s.kind === 'grp' ? edGroups().some(g => g.id === s.id) : ri(s.id) >= 0);
  if (!has) E.sel = null;
  box.innerHTML = !E.sel ? pathwayPanel() : E.sel.kind === 'met' ? metPanel(E.sel.id) : E.sel.kind === 'grp' ? grpPanel(E.sel.id) : rxnPanel(E.sel.id);
  decorateEdits(box);
  box.scrollTop = keep;
  vxTools();
  // Deep links and new items: put the cursor where the work is.
  if (E.sel?.focus) {
    const f = E.sel.focus, el = f === true ? $('[data-path$=".name"]', box) : $(`[data-focus="${f}"]`, box) || $('[data-focus="pick"]', box);
    E.sel.focus = null;
    if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus({ preventScroll: true }); el.closest('label')?.classList.add('vx-flash'); }
  }
}
function vxMount(scroll) {
  const svg = $('#vxSvg');
  if (!svg) return;
  renderCanvas();
  const focusSel = E.sel?.focus;
  vxRefreshPanel(!!focusSel);
  if (!focusSel) $('#vxInsp').scrollTop = scroll || 0;
  if (focusSel && E.vxPos) {
    const q = E.sel ? (E.sel.kind === 'met' ? E.vxPos[E.sel.id] : (r => r && E.vxPos[r.from] && E.vxPos[r.to] && { cx: (E.vxPos[r.from].cx + E.vxPos[r.to].cx) / 2, cy: (E.vxPos[r.from].cy + E.vxPos[r.to].cy) / 2 })(E.draft.reactions[ri(E.sel.id)])) : null;
    if (q && !E.viewSet) { E.autoCenter = q; vxAutoView(); }
  }
  E.viewSet = true;
  new ResizeObserver(() => (E.viewAuto ? vxAutoView() : vxApplyView())).observe($('.vx-stage'));
  svg.addEventListener('pointerdown', vxDown);
  svg.addEventListener('pointermove', vxMove);
  svg.addEventListener('pointerup', vxUp);
  svg.addEventListener('pointercancel', vxUp);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) vxZoom(Math.exp(-e.deltaY / 200), e.clientX, e.clientY);
    else { E.viewAuto = false; E.view.x += e.deltaX / E.view.k; E.view.y += e.deltaY / E.view.k; vxApplyView(); }
  }, { passive: false });
}

/* ---------- pointer: select, move, pan, connect, pinch ---------- */
const PTR = new Map();
let lastTap = { t: 0, x: 0, y: 0 };
function vxDown(e) {
  const svg = e.currentTarget;
  svg.setPointerCapture(e.pointerId);
  PTR.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (PTR.size === 2) {
    const [a, b] = [...PTR.values()];
    E.drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), k0: E.view.k, v0: { ...E.view } };
    return;
  }
  if (PTR.size > 2) return;
  const t = e.target, w = vxWorld(e);
  const h = t.closest('[data-handle]'), n = t.closest('[data-node]'), r = t.closest('[data-rxn]'), gr = t.closest('[data-grp]');
  if (E.frameMode && !h) { E.drag = { type: 'frame', a: w, b: null }; return; }
  if (gr && !n && !r) { vxSelect('grp', gr.dataset.grp); E.drag = { type: 'none' }; return; }
  if (h) E.drag = { type: 'connect', from: h.dataset.handle, to: null };
  else if (n) {
    const id = n.dataset.node, q = E.vxPos[id];
    if (E.sel?.kind !== 'met' || E.sel.id !== id) vxSelect('met', id);
    E.drag = { type: 'move', id, sx: e.clientX, sy: e.clientY, w0: w, q0: { ...q }, moved: false };
  } else if (r) { if (E.sel?.id !== r.dataset.rxn) vxSelect('rxn', r.dataset.rxn); E.drag = { type: 'none' }; }
  else E.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...E.view }, moved: false };
}
function vxMove(e) {
  if (!PTR.has(e.pointerId)) return;
  PTR.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const g = E.drag;
  if (!g) return;
  if (g.type === 'pinch' && PTR.size === 2) {
    const [a, b] = [...PTR.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    E.view = { ...g.v0 }; vxZoom(d / g.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }
  if (g.type === 'pan') {
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 4) g.moved = true;
    if (!g.moved) return;
    E.viewAuto = false;
    E.view = { k: g.v0.k, x: g.v0.x - (e.clientX - g.sx) / g.v0.k, y: g.v0.y - (e.clientY - g.sy) / g.v0.k };
    vxApplyView();
  }
  if (g.type === 'connect') { g.to = vxWorld(e); renderCanvas(); }
  if (g.type === 'frame') { g.b = vxWorld(e); renderCanvas(); }
  if (g.type === 'move') {
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 5) return;
    if (!isGrid()) { E.drag = null; askToGrid(); return; }
    if (!g.moved) { g.moved = true; pushUndo(); }
    const w = vxWorld(e), [c, r] = vxSnap(...pxGrid(g.q0.cx + w.x - g.w0.x, g.q0.cy + w.y - g.w0.y));
    E.draft.metabolites[g.id].pos = [Math.max(0, c), Math.max(0, r)];
    renderCanvas();
  }
}
function vxUp(e) {
  PTR.delete(e.pointerId);
  const g = E.drag;
  if (g?.type === 'pinch') { if (!PTR.size) E.drag = null; return; }
  E.drag = null;
  if (!g) return;
  if (g.type === 'move' && g.moved) { renderPreview(); vxRefreshPanel(); return; }
  if (g.type === 'frame') {
    // Every box whose middle is inside the frame joins a new group.
    const b = g.b || g.a, x0 = Math.min(g.a.x, b.x), x1 = Math.max(g.a.x, b.x), y0 = Math.min(g.a.y, b.y), y1 = Math.max(g.a.y, b.y);
    const inside = Object.entries(E.vxPos).filter(([, q]) => q.cx >= x0 && q.cx <= x1 && q.cy >= y0 && q.cy <= y1).map(([id]) => id);
    if (!inside.length) { renderCanvas(); return toast('No boxes inside that frame. Drag around the boxes to group.'); }
    pushUndo();
    const id = newGroup(inside);
    E.frameMode = false; E.sel = { kind: 'grp', id, focus: true };
    return renderEditor();
  }
  if (g.type === 'connect') {
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-node]');
    if (hit && hit.dataset.node !== g.from) return vxAddStep(g.from, hit.dataset.node);
    if (!hit && g.to) {
      const at = g.to;
      renderCanvas();
      return vxAddMet(at).then(id => { if (id) vxAddStep(g.from, id, true); });
    }
    return renderCanvas();
  }
  if (g.type === 'pan' && !g.moved) {
    const now = Date.now(), dbl = now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 20;
    lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    if (dbl) return vxAddMet(vxWorld(e));
    if (E.sel) vxSelect(null);
  }
  if (g.type === 'move' && !g.moved) {
    const now = Date.now(), dbl = now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 20;
    lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    if (dbl) { const el = $('#vxInsp [data-path$=".name"]'); el?.focus(); el?.select(); }
  }
}

/* ---------- buttons + keys ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('#editor [data-vx]');
  if (!b || b.disabled) return;
  switch (b.dataset.vx) {
    case 'add-met': return vxAddMet();
    case 'frame': E.frameMode = !E.frameMode; return renderEditor();
    case 'delete': return vxDelete();
    case 'undo': return stepHistory(true);
    case 'redo': return stepHistory(false);
    case 'zoom-in': return vxZoom(1.25);
    case 'zoom-out': return vxZoom(0.8);
    case 'fit': return vxFit();
    case 'snap': E.snap = !E.snap; b.setAttribute('aria-pressed', E.snap); return;
    case 'to-grid': return vxToGrid();
    case 'deselect': return vxSelect(null);
    case 'pick': {
      const kind = b.dataset.kind, id = b.dataset.id;
      vxSelect(kind, id);
      const P = E.vxPos, r = kind === 'rxn' && E.draft.reactions[ri(id)];
      const q = kind === 'met' ? P[id] : r && P[r.from] && P[r.to] ? { cx: (P[r.from].cx + P[r.to].cx) / 2, cy: (P[r.from].cy + P[r.to].cy) / 2 } : null;
      if (q) vxCenterOn(q);
      return;
    }
    case 'swap': {
      const r = E.draft.reactions[ri(E.sel.id)];
      pushUndo();
      [r.from, r.to] = [r.to, r.from];
      if (r.also_to || r.also_from) [r.also_to, r.also_from] = [r.also_from, r.also_to];
      for (const k of ['also_to', 'also_from']) if (!r[k]) delete r[k];
      if (r.cofactors) r.cofactors = { in: r.cofactors.out || [], out: r.cofactors.in || [] };
      return renderEditor();
    }
  }
});
document.addEventListener('change', e => {
  const sel = e.target.closest?.('#editor [data-vx-connect]');
  if (!sel || !sel.value) return;
  const from = sel.dataset.vxConnect;
  if (sel.value === '__new') return vxAddMet().then(id => { if (id) vxAddStep(from, id, true); });
  vxAddStep(from, sel.value);
});
document.addEventListener('keydown', e => {
  if (!E.draft || !$('#editor') || document.querySelector('dialog[open]')) return;
  const typing = e.target.matches?.('input, textarea, select, [contenteditable]');
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !typing && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) { e.preventDefault(); return stepHistory(e.key === 'z' && !e.shiftKey); }
  if (typing || E.mode !== 'visual' || !$('#vxSvg')) return;
  if (e.key === 'Escape' && E.frameMode) { E.frameMode = false; return renderEditor(); }
  if (e.key === 'Escape' && E.sel) return vxSelect(null);
  if ((e.key === 'Delete' || e.key === 'Backspace') && E.sel) { e.preventDefault(); return vxDelete(); }
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (dir && E.sel?.kind === 'met' && isGrid()) {
    e.preventDefault();
    const m = E.draft.metabolites[E.sel.id], [c, r] = m.pos || [0, 0], step = E.snap ? [0.25, 0.5] : [0.05, 0.05];
    pushUndo();
    m.pos = [Math.max(0, r2(c + dir[0] * step[0])), Math.max(0, r2(r + dir[1] * step[1]))];
    renderCanvas(); vxRefreshPanel();
  }
});
