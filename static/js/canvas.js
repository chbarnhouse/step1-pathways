/* The diagram canvas: flow diagrams sit on a surface you drag to pan and pinch (or Ctrl/⌘-scroll) to zoom.
   The SVG and the quiz's answer field live together in one "world" layer moved by a single CSS transform,
   so the field can never drift off its box (Safari misplaced it when the two were positioned separately).
   Zoom settings stay the same: 'width' (fit the width), 'fit' (whole diagram) or a number (the scale).
   List view isn't a canvas; it scrolls as before. */
'use strict';

const CANVAS = { min: 0.2, max: 3, pad: 16 };
const minK = st => +(st?.dataset.min || CANVAS.min); // the map is far bigger than any one diagram: it may zoom out further
let CANVAS_VIEW = null; // the last view, kept across re-renders of the same diagram: { key, mode, k, x, y }

const canvasStage = (scope = document) => scope.querySelector('.stage.canvas');
const worldOf = st => st && st.querySelector('.world');
const svgOf = st => st && st.querySelector('.world > svg.flow');

// Wraps a flow SVG (and anything that must move with it, like the answer field) for a canvas stage.
const canvasHTML = (svg, extra = '') => `<div class="world">${svg}${extra}</div>`;

function contentSize(st) { const vb = svgOf(st).viewBox.baseVal; return { w: vb.width, h: vb.height }; }
function fitK(st, mode) {
  const { w, h } = contentSize(st), W = st.clientWidth - 2 * CANVAS.pad, H = st.clientHeight - 2 * CANVAS.pad;
  if (mode === 'fit') return Math.max(minK(st), Math.min(W / w, H / h, 1.6));
  if (mode === 'height') return Math.max(minK(st), Math.min(H / h, 1.6));
  return Math.max(minK(st), Math.min(1, W / w));
}
// Keep some of the diagram on screen however far it is dragged.
function clampView(st, v) {
  const { w, h } = contentSize(st), keep = 80, W = st.clientWidth, H = st.clientHeight;
  v.k = Math.min(CANVAS.max, Math.max(minK(st), v.k));
  v.x = Math.min(W - keep, Math.max(keep - w * v.k, v.x));
  v.y = Math.min(H - keep, Math.max(keep - h * v.k, v.y));
  return v;
}
function setView(st, v, animate = false) {
  const world = worldOf(st);
  if (!world) return;
  v = clampView(st, { ...v });
  st._v = v;
  world.classList.toggle('glide', !!animate && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  const { w, h } = contentSize(st);
  CANVAS_VIEW = { key: st.dataset.view || '', mode: Store.settings.zoom, k: v.k, x: v.x, y: v.y, w, h };
  const zp = document.querySelector('#zoomPct'); if (zp) zp.textContent = Math.round(v.k * 100) + '%';
  edgeHintsSoon(st);
}
// Zoom about a point of the stage (cursor, pinch center, or the middle for the buttons).
function zoomAt(st, k, px, py, animate = false) {
  const v = st._v;
  const nk = Math.min(CANVAS.max, Math.max(minK(st), k));
  setView(st, { k: nk, x: px - (px - v.x) * nk / v.k, y: py - (py - v.y) * nk / v.k }, animate);
}

function applyZoom(scope = document) {
  const st = canvasStage(scope), list = scope.querySelector('.stage .list');
  // A drawing opens fitted as Settings says; a number left from before (a zoom once saved as the setting) means the whole drawing.
  const z = st && typeof Store.settings.zoom === 'number' ? 'fit' : Store.settings.zoom;
  scope.querySelectorAll('[data-zoom]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.zoom === String(z))));
  scope.querySelectorAll('[data-flag="follow"]').forEach(b => b.setAttribute('aria-pressed', String(!!Store.settings.follow)));
  scope.querySelectorAll('.peekbtn').forEach(b => { b.hidden = !Store.settings.follow; });
  if (!st || !svgOf(st)) {
    if (list) { const k = typeof z === 'number' ? z : 1; list.style.zoom = k; const zp = scope.querySelector('#zoomPct'); if (zp) zp.textContent = Math.round(k * 100) + '%'; }
    return;
  }
  wireCanvas(st);
  // Natural size: one diagram unit = one pixel; zoom is the world layer's scale.
  const svg = svgOf(st), vb0 = svg.viewBox.baseVal; svg.style.width = vb0.width + 'px'; svg.style.height = vb0.height + 'px';
  placeInline();
  // Same diagram, same zoom mode as a moment ago (e.g. the next question): keep the view where it was.
  // (Same size too: the Map keeps one key while its layout and pathways change what it draws.)
  const { w, h } = contentSize(st);
  if (CANVAS_VIEW && CANVAS_VIEW.key && CANVAS_VIEW.key === st.dataset.view && CANVAS_VIEW.mode === z && CANVAS_VIEW.w === w && CANVAS_VIEW.h === h) return setView(st, CANVAS_VIEW);
  let k = typeof z === 'number' ? z : fitK(st, z);
  // Quizzing with Follow on a drawing too big to fit legibly (the whole nephron): start readable and let Follow
  // keep the blank in view; holding Peek still shows all of it.
  if (typeof z !== 'number' && Store.settings.follow && st.closest('.quiz') && k < 0.45) k = 0.6;
  const x = Math.max(CANVAS.pad, (st.clientWidth - w * k) / 2);
  const y = z === 'fit' || z === 'height' ? Math.max(CANVAS.pad, (st.clientHeight - h * k) / 2) : CANVAS.pad;
  setView(st, { k, x, y });
}
function zoomBy(d) {
  const st = canvasStage();
  if (!st || !st._v) {
    const z = Store.settings.zoom; Store.settings.zoom = Math.round(Math.min(2.5, Math.max(0.3, (typeof z === 'number' ? z : 1) + d)) * 10) / 10;
    Store.save(); return applyZoom();
  }
  // (A drawing's own zoom: the setting, how every drawing opens, stays as it is.)
  const k = Math.round(Math.min(CANVAS.max, Math.max(minK(st), st._v.k + d)) * 10) / 10;
  zoomAt(st, k, st.clientWidth / 2, st.clientHeight / 2, true);
}
// Clicking the percentage: back to 100%, about the middle of the view.
function zoomTo(k) {
  const st = canvasStage();
  if (!st || !st._v) { Store.settings.zoom = k; Store.save(); return applyZoom(); }
  zoomAt(st, k, st.clientWidth / 2, st.clientHeight / 2, true);
}
const applyZoomButtons = () => document.querySelectorAll('[data-zoom]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.zoom === String(Store.settings.zoom))));
// Bring an element into the middle of the view (Follow, and stepping through facts).
function centerOn(el, animate = true) {
  const st = canvasStage();
  if (!st || !el || !st._v) return el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  const s = st.getBoundingClientRect(), r = el.getBoundingClientRect();
  setView(st, { ...st._v, x: st._v.x + (s.left + s.width / 2) - (r.left + r.width / 2), y: st._v.y + (s.top + s.height / 2) - (r.top + r.height / 2) }, animate);
}
function followTarget() {
  if (!Store.settings.follow) return;
  const st = canvasStage(), t = st ? st.querySelector('.inl-float, .target, .chip.target, .ename.target') : document.querySelector('.stage .chip.target, .stage form.inl');
  if (!t) return;
  if (st) return centerOn(t);
  t.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}
// The answer field sits in the world layer in diagram units, so it moves and scales with the diagram by itself.
function placeInline() {
  const st = canvasStage(), slot = st?.querySelector('.inl-slot'), f = st?.querySelector('.inl-float');
  if (!slot || !f) return;
  Object.assign(f.style, { left: slot.x.baseVal.value + 'px', top: slot.y.baseVal.value + 'px', width: slot.width.baseVal.value + 'px', height: slot.height.baseVal.value + 'px', transform: '' });
}

/* ---------- peek: hold to see the whole pathway ----------
   While Follow is on, pressing and holding the button above it shows the whole diagram; letting go goes back to the
   exact view you had. The zoom setting itself never changes. */
let PEEK = null;
function peekStart() {
  const st = canvasStage();
  if (!st || !st._v || PEEK) return;
  PEEK = { st, v: { ...st._v } };
  const { w, h } = contentSize(st), k = fitK(st, 'fit');
  setView(st, { k, x: Math.max(CANVAS.pad, (st.clientWidth - w * k) / 2), y: Math.max(CANVAS.pad, (st.clientHeight - h * k) / 2) }, true);
  document.querySelectorAll('.peekbtn').forEach(b => b.setAttribute('aria-pressed', 'true'));
}
function peekEnd() {
  if (!PEEK) return;
  const { st, v } = PEEK; PEEK = null;
  if (st.isConnected) setView(st, v, true);
  document.querySelectorAll('.peekbtn').forEach(b => b.setAttribute('aria-pressed', 'false'));
}
document.addEventListener('pointerdown', e => { if (e.button === 0 && e.target.closest?.('[data-peek]')) { e.preventDefault(); peekStart(); } });
for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, peekEnd);
document.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('[data-peek]')) { e.preventDefault(); if (!e.repeat) peekStart(); } });
document.addEventListener('keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('[data-peek]')) peekEnd(); });
document.addEventListener('contextmenu', e => { if (e.target.closest?.('[data-peek]')) e.preventDefault(); }); // a long press on a phone isn't a menu

/* ---------- dragging, scrolling, pinching ---------- */
function wireCanvas(st) {
  if (st._wired) return;
  st._wired = true;
  const pts = new Map(); let start = null, moved = false, pinch = null;
  const rel = e => { const r = st.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const interactive = t => t.closest('input, textarea, select, button, a, form, label');
  st.addEventListener('pointerdown', e => {
    if (e.button !== 0 || interactive(e.target)) return;
    pts.set(e.pointerId, rel(e));
    if (pts.size === 1) { start = { p: rel(e), v: { ...st._v } }; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: st._v.k }; }
  });
  st.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, rel(e));
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(st, pinch.k * d / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); moved = true; return;
    }
    if (!start) return;
    const [x, y] = rel(e), dx = x - start.p[0], dy = y - start.p[1];
    if (!moved && Math.hypot(dx, dy) < 4) return; // still a click
    if (!moved) { moved = true; st.setPointerCapture?.(e.pointerId); st.classList.add('dragging'); }
    setView(st, { ...start.v, x: start.v.x + dx, y: start.v.y + dy });
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) {
      st.classList.remove('dragging');
      if (moved) { st._dragged = Date.now(); keepManualZoom(st); }
      start = null;
    }
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  // A drag ends with a click on whatever was under the pointer: swallow it so dragging never opens facts.
  st.addEventListener('click', e => { if (st._dragged && Date.now() - st._dragged < 300) { e.stopPropagation(); e.preventDefault(); } }, true);
  st.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { const [x, y] = rel(e); zoomAt(st, st._v.k * Math.exp(-e.deltaY * 0.01), x, y); keepManualZoom(st); }
    else setView(st, { ...st._v, x: st._v.x - e.deltaX, y: st._v.y - e.deltaY });
  }, { passive: false });
}
// After pinching or Ctrl-scrolling, the chosen scale becomes the zoom setting (saved a moment later).
function keepManualZoom(st) {
  if (Store.settings.zoom === Math.round(st._v.k * 100) / 100) return;
  Store.settings.zoom = Math.round(st._v.k * 100) / 100;
  CANVAS_VIEW && (CANVAS_VIEW.mode = Store.settings.zoom);
  applyZoomButtons();
  clearTimeout(st._zt); st._zt = setTimeout(() => Store.save(), 500);
}
window.addEventListener('resize', () => {
  const st = canvasStage();
  if (!st) return;
  if (typeof Store.settings.zoom !== 'number') { CANVAS_VIEW = null; applyZoom(); } else if (st._v) setView(st, st._v);
});

/* ---------- coupled steps: the lettered badges ---------- */
// Hover or focus: the pair (here, and the other half) meeting at their enzyme. Click or Enter: go to the other badge.
(() => {
  let pop = null;
  const hide = () => { if (pop) pop.hidden = true; };
  // The two halves as one picture: each half's arrow bows in to touch the enzyme between them, then on to its product.
  const split = s => String(s).split(' → ').map(t => esc(t || ''));
  const show = g => {
    if (!pop) { pop = document.createElement('div'); pop.className = 'pairpop'; pop.setAttribute('role', 'tooltip'); document.body.append(pop); }
    const d = g.dataset, [a1, a2] = split(d.here), [b1, b2] = split(d.there);
    pop.innerHTML = `<div class="pp-grid"><span class="pp-h" style="grid-area:h1">Here</span><span class="pp-h" style="grid-area:h2">Also</span>
      <span class="pp-box" style="grid-area:a1">${a1}</span><span class="pp-box" style="grid-area:a2">${a2}</span>
      <span class="pp-mid" style="grid-area:e"><span class="pp-badge">${esc(d.pair)}</span><span class="pp-enz">${esc(d.enz || 'one enzyme')}</span></span>
      <span class="pp-box" style="grid-area:b1">${b1}</span><span class="pp-box" style="grid-area:b2">${b2}</span></div>
      <p>One step, two halves: each half’s molecules are the other’s cofactors. Click the badge to go to the other half.</p>`;
    pop.hidden = false;
    const G = pop.querySelector('.pp-grid'), o = G.getBoundingClientRect(), R = sel => pop.querySelector(sel).getBoundingClientRect();
    const [ra1, ra2, rb1, rb2] = [...pop.querySelectorAll('.pp-box')].map(e => e.getBoundingClientRect()), m = R('.pp-mid');
    const ym = m.top + m.height / 2 - o.top, curve = (top, bot, px) => { const x1 = top.left + top.width / 2 - o.left, y1 = top.bottom - o.top + 2, x2 = bot.left + bot.width / 2 - o.left, y2 = bot.top - o.top - 3;
      return `<path d="M${x1},${y1} C${x1},${y1 + 10} ${px},${ym - 26} ${px},${ym} C${px},${ym + 26} ${x2},${y2 - 10} ${x2},${y2}" marker-end="url(#pp-ah)"/>`; };
    G.insertAdjacentHTML('afterbegin', `<svg class="pp-lines" width="${o.width}" height="${o.height}" aria-hidden="true"><defs><marker id="pp-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
      ${curve(ra1, ra2, m.left - o.left - 3)}${curve(rb1, rb2, m.right - o.left + 3)}</svg>`);
    const r = g.getBoundingClientRect(), t = pop.getBoundingClientRect(), below = r.bottom + 8 + t.height <= innerHeight - 4;
    pop.style.top = (below ? r.bottom + 8 : r.top - 8 - t.height) + 'px';
    pop.style.left = Math.min(innerWidth - t.width - 6, Math.max(6, r.left + r.width / 2 - t.width / 2)) + 'px';
  };
  const jump = g => {
    const svg = g.closest('svg.flow'), to = svg && svg.querySelector(`.pairbadge[data-pair="${CSS.escape(g.dataset.pair)}"][data-me="${CSS.escape(g.dataset.other)}"]`); if (!to) return;
    hide(); centerOn(to); to.classList.remove('flash'); void to.getBBox(); to.classList.add('flash'); setTimeout(() => to.classList.remove('flash'), 1700); to.focus?.({ preventScroll: true });
  };
  document.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const g = e.target.closest?.('.pairbadge'); if (g) show(g); });
  document.addEventListener('pointerout', e => { const g = e.target.closest?.('.pairbadge'); if (g && !g.contains(e.relatedTarget)) hide(); });
  document.addEventListener('focusin', e => { const g = e.target.closest?.('.pairbadge'); if (g) show(g); });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', e => { const g = e.target.closest?.('.pairbadge'); if (!g) return; const st = g.closest('.stage.canvas'); e.stopPropagation(); if (st?._dragged && Date.now() - st._dragged < 300) return; jump(g); }, true); // (not at the end of a drag)
  document.addEventListener('keydown', e => { const g = e.target.closest?.('.pairbadge'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); jump(g); } });
  for (const ev of ['scroll', 'wheel']) document.addEventListener(ev, hide, true);
})();

/* ---------- hover help ----------
   On a drawing (a pathway page, a connected drawing, the Map, a quiz's Review), pointing at a molecule shows the names
   it also goes by; at an enzyme or carrier, its other names and the step it does; at an arrow, what the step is: from →
   to, by which enzyme, through which carrier, with which cofactors. Never during a quiz (it would give answers away). */
(() => {
  let tip = null, on = null;
  const quizzing = () => !!document.querySelector('#view .quiz') && typeof Q !== 'undefined' && Q.round?.type !== 'review';
  const modelOf = el => HOVER_MODELS.get(el.closest('svg[data-pid]')?.dataset.pid);
  const aka = it => { const seen = new Set([norm(it.name)]); return [it.short, ...(it.aliases || []), ...(it.nicknames || [])].filter(n => n && !seen.has(norm(n)) && seen.add(norm(n))).slice(0, 6); };
  const stepLine = (m, r) => `${esc(metNames(m, reactantsOf(r)))} ${r.reversible ? '⇌' : '→'} ${esc(metNames(m, productsOf(r)))}`;
  const html = (m, key) => {
    const it = m.items[key]; if (!it) return '';
    const also = aka(it), line = also.length ? `<div class="ht-aka">Also: ${also.map(esc).join(' · ')}</div>` : '';
    if (key.startsWith('m:')) return `<b>${esc(it.name)}</b>${line}`;
    const r = it.rxn; return `<b>${esc(it.name)}</b>${line}${r ? `<div class="ht-step">${stepLine(m, r)}${r.loc ? ` · ${esc(r.loc)}` : ''}</div>` : ''}`;
  };
  const lineHtml = (m, r) => {
    const e = m.items['e:' + r.id], t = m.items['t:' + r.id], c = cofText(m, r.cofactors || {});
    return `<b>${stepLine(m, r)}</b>${e ? `<div>${esc(e.name)}${t ? ` <span class="ht-dim">through ${esc(t.name)}</span>` : ''}</div>` : ''}${c && c !== 'None' ? `<div class="ht-dim">${esc(c)}</div>` : ''}`;
  };
  const hide = () => { on = null; if (tip) tip.hidden = true; };
  const place = e => { const t = tip.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - t.width - 8, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 18 + t.height > innerHeight - 6 ? e.clientY - t.height - 12 : e.clientY + 18) + 'px'; };
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || quizzing()) return hide();
    const el = e.target.closest?.('svg.flow g.mbox[data-key], svg.flow g.elab[data-key], svg.flow [class*="rx-"]');
    if (!el) return on && hide();
    const m = modelOf(el); if (!m) return hide();
    let h = '';
    const rx = [...el.classList].find(c => c.startsWith('rx-'));
    if (rx) { const r = m.p.reactions.find(x => x.id === rx.slice(3)); if (r) h = lineHtml(m, r); }
    else { const k = el.dataset.key; if (/^[mte]:/.test(k)) h = html(m, k); }
    if (!h) return hide();
    if (!tip) { tip = document.createElement('div'); tip.className = 'hovtip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
    if (on !== el) { on = el; tip.innerHTML = h; tip.hidden = false; }
    place(e);
  });
  document.addEventListener('pointerleave', hide);
  for (const ev of ['pointerdown', 'wheel', 'keydown']) document.addEventListener(ev, hide, true);
})();

/* ---------- where an arrow goes off screen ----------
   Zoomed in, an arrow that leaves the view gets a small pill where it crosses the edge, saying where it goes ("→ Acetyl-CoA
   (TCA cycle) via Mitochondrial pyruvate carrier") or comes from ("← from …"); clicking it flies there. Up to 12, nearest
   the middle first; none during a quiz (they'd give answers away). */
let EDGE_T = 0;
function edgeHintsSoon(st) { clearTimeout(EDGE_T); EDGE_T = setTimeout(() => edgeHints(st), 140); }
function edgeHints(st) {
  st.querySelectorAll('.edgehint').forEach(e => e.remove());
  if (!st.isConnected || (document.querySelector('#view .quiz') && typeof Q !== 'undefined' && Q.round?.type !== 'review')) return;
  const svg = svgOf(st); if (!svg) return;
  const m = HOVER_MODELS.get(svg.dataset.pid); if (!m) return;
  const S = st.getBoundingClientRect(), pad = 4, inView = q => q.x > S.left + pad && q.x < S.right - pad && q.y > S.top + pad && q.y < S.bottom - pad;
  // (A <line> is measured from its ends: Safari gives lines no length.)
  const isLine = p => p.tagName === 'line', ends = p => ['x1', 'y1', 'x2', 'y2'].map(k => +p.getAttribute(k));
  const lenOf = p => { if (!isLine(p)) return p.getTotalLength(); const [x1, y1, x2, y2] = ends(p); return Math.hypot(x2 - x1, y2 - y1); };
  const scr = (p, l) => { let q; if (isLine(p)) { const [x1, y1, x2, y2] = ends(p), L = Math.hypot(x2 - x1, y2 - y1) || 1; q = { x: x1 + (x2 - x1) * l / L, y: y1 + (y2 - y1) * l / L }; } else q = p.getPointAtLength(l);
    const M = p.getScreenCTM(); return { x: M.a * q.x + M.c * q.y + M.e, y: M.b * q.x + M.d * q.y + M.f }; };
  const partOf = id => { const o = m.p.stitch?.origin.m[id]; return o ? Library.get(o[0][0])?.name : ''; };
  const found = [];
  for (const p of svg.querySelectorAll('path[class*="rx-"]:not(.hit), line[class*="rx-"]:not(.hit)')) {
    const rid = [...p.classList].find(c => c.startsWith('rx-')).slice(3), r = m.p.reactions.find(x => x.id === rid); if (!r) continue;
    const L = lenOf(p); if (L < 40) continue;
    const a = scr(p, 0), b = scr(p, L), ia = inView(a), ib = inView(b); if (ia === ib) continue;
    // Where it crosses the edge: halve the stretch between the end inside and the end outside.
    let lo = ia ? 0 : L, hi = ia ? L : 0; for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (inView(scr(p, mid))) lo = mid; else hi = mid; }
    // Which molecule is off there: the step's end whose box is nearest the line's end outside (a reversible step draws a
    // line each way, so a line's start isn't always the step's input).
    const off = ia ? b : a, boxAt = id => [...svg.querySelectorAll(`g.mbox[data-key="${CSS.escape('m:' + id)}"]`)].map(g => { const R = g.getBoundingClientRect(); return Math.hypot(R.x + R.width / 2 - off.x, R.y + R.height / 2 - off.y); }).sort((x, y) => x - y)[0] ?? Infinity;
    const outId = boxAt(r.to) <= boxAt(r.from) ? r.to : r.from, near = outId === r.to ? r.from : r.to, goes = outId === r.to;
    const at = scr(p, lo), far = m.items['m:' + outId]; if (!far) continue;
    const via = m.items['t:' + r.id] || (r.transport ? m.items['e:' + r.id] : null), there = partOf(outId), here = partOf(near);
    const text = `${goes ? '→' : '← from'} ${far.name}${there && there !== here ? ` (${there})` : ''}${via ? ` via ${via.name}` : ''}`;
    found.push({ at, text, rid, key: 'm:' + outId, d: Math.hypot(at.x - (S.left + S.width / 2), at.y - (S.top + S.height / 2)) });
  }
  const seen = new Set(), placed = [];
  for (const h of found.sort((x, y) => x.d - y.d)) {
    if (placed.length >= 12 || seen.has(h.text)) continue; seen.add(h.text);
    const el = document.createElement('button'); el.type = 'button'; el.className = 'edgehint'; el.textContent = h.text; el.dataset.go = h.key; el.dataset.rx = h.rid; st.append(el);
    const w = el.offsetWidth, ht = el.offsetHeight;
    let x = Math.min(S.width - w - 6, Math.max(6, h.at.x - S.left - w / 2)), y = Math.min(S.height - ht - 6, Math.max(6, h.at.y - S.top - ht / 2));
    for (let k = 0; k < 8 && placed.some(o => Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < ht + 4); k++) y += ht + 6; // (never on one another)
    el.style.left = x + 'px'; el.style.top = y + 'px'; placed.push({ x: x + w / 2 - w / 2, y, w });
  }
}
document.addEventListener('click', e => {
  const h = e.target.closest?.('.edgehint'); if (!h) return;
  const st = h.closest('.stage.canvas'), box = st?.querySelector(`svg.flow g.mbox[data-key="${CSS.escape(h.dataset.go)}"]`);
  if (box) centerOn(box);
});
