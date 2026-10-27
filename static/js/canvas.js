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
}
// Zoom about a point of the stage (cursor, pinch center, or the middle for the buttons).
function zoomAt(st, k, px, py, animate = false) {
  const v = st._v;
  const nk = Math.min(CANVAS.max, Math.max(minK(st), k));
  setView(st, { k: nk, x: px - (px - v.x) * nk / v.k, y: py - (py - v.y) * nk / v.k }, animate);
}

function applyZoom(scope = document) {
  const st = canvasStage(scope), list = scope.querySelector('.stage .list'), z = Store.settings.zoom;
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
  const k = Math.round(Math.min(CANVAS.max, Math.max(minK(st), st._v.k + d)) * 10) / 10;
  Store.settings.zoom = k; Store.save();
  zoomAt(st, k, st.clientWidth / 2, st.clientHeight / 2, true);
  applyZoomButtons();
}
// Clicking the percentage: back to 100%, about the middle of the view.
function zoomTo(k) {
  const st = canvasStage();
  Store.settings.zoom = k; Store.save();
  if (!st || !st._v) return applyZoom();
  zoomAt(st, k, st.clientWidth / 2, st.clientHeight / 2, true);
  applyZoomButtons();
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
