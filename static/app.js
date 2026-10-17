/* Pathways — study biochemical pathways three ways.
   Modes:   single (one blank) · total (recall everything from a random start) · step (two metabolites → enzyme, cofactors, direction)
   Views:   flow (SVG process diagram) · list (linear, top–bottom or left–right)
   Answers: type · choice (never mixes metabolites with enzymes) · self (reveal + self-grade) */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uniq = a => [...new Set(a)];

const ICON = {
  ok: '<path d="M3.5 8.5l3 3 6-7"/>',
  no: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
};
const icon = k => `<svg class="ic ${k}" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]}</svg>`;

/* ---------- settings ---------- */
const DEFAULTS = { pathway: null, mode: 'single', view: 'flow', answer: 'type', inc: { met: true, enz: true }, dir: 'v' };
function loadSettings() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('pathways.settings') || '{}')); }
  catch { return { ...DEFAULTS }; }
}
function saveSettings() { try { localStorage.setItem('pathways.settings', JSON.stringify(S.set)); } catch {} }

const S = { list: [], m: null, cof: {}, set: loadSettings(), round: null, score: { right: 0, total: 0 }, fact: null };

/* ---------- answer normalization ---------- */
// Case-, space- and punctuation-insensitive; "phosphate" ≡ "P", "bisphosphate"/"diphosphate" ≡ "BP".
function norm(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(bis|di)phosphate\b/g, 'bp').replace(/\bphosphate\b/g, 'p')
    .replace(/[\s\-_,.'’()\/]/g, '');
}
const acceptedFor = item => uniq([item.name, item.short, ...(item.aliases || [])].filter(Boolean).map(norm));

/* ---------- model ---------- */
function buildModel(p) {
  const items = {};
  for (const [id, m] of Object.entries(p.metabolites))
    items['m:' + id] = { key: 'm:' + id, kind: 'met', id, name: m.name, short: m.short, aliases: m.aliases, notes: m.notes };
  for (const r of p.reactions) {
    const e = p.enzymes[r.enzyme];
    items['e:' + r.id] = { key: 'e:' + r.id, kind: 'enz', id: r.enzyme, rxn: r, name: e.name, short: e.short, aliases: e.aliases, notes: e.notes };
  }
  const spine = p.reactions.filter(r => !r.branch);
  const branchesFrom = id => p.reactions.filter(b => b.branch && b.from === id);
  // The canonical reading order: metabolite, enzyme, metabolite… with side products
  // (and the branch reactions that consume them) slotted in after the enzyme that makes them.
  const seq = ['m:' + spine[0].from];
  for (const r of spine) {
    seq.push('e:' + r.id);
    for (const s of r.also_to || []) { seq.push('m:' + s); for (const b of branchesFrom(s)) seq.push('e:' + b.id); }
    if (!(p.circular && r.to === spine[0].from)) seq.push('m:' + r.to);
  }
  const pairs = [];
  for (const r of p.reactions) {
    pairs.push({ r, a: r.from, b: r.to });
    for (const s of r.also_to || []) pairs.push({ r, a: r.from, b: s });
  }
  return { p, items, spine, seq, pairs };
}

/* ---------- cofactors ---------- */
const cofName = id => (S.cof[id] && S.cof[id].name) || id;
function cofText(c) {
  const i = c.in.map(cofName), o = c.out.map(cofName);
  if (!i.length && !o.length) return 'None';
  if (!i.length) return 'releases ' + o.join(' + ');
  if (!o.length) return 'uses ' + i.join(' + ');
  return i.join(' + ') + ' → ' + o.join(' + ');
}
function cofLookup() {
  const map = {}, phrases = [];
  for (const [id, c] of Object.entries(S.cof)) for (const a of [id, c.name, ...(c.aliases || [])]) {
    map[norm(a)] = id;
    if (/\s/.test(a.trim())) phrases.push([a.toLowerCase(), id]);
  }
  return { map, phrases };
}
const IGNORE = new Set(['', '+', 'h+', 'h', 'mg2+', 'mg', 'and']);
function gradeCof(raw, c) {
  const want = new Set([...c.in, ...c.out]);
  let s = raw.toLowerCase().trim();
  if (!want.size) return /^(none|nothing|no|n\/?a|-|—)?$/.test(s.replace(/\s/g, ''));
  const { map, phrases } = cofLookup();
  for (const [ph, id] of phrases) s = s.split(ph).join(' ' + id + ' ');
  const toks = s.split(/[,;\/\s]+|→|->|=>|⇌/).map(norm).filter(t => !IGNORE.has(t));
  const got = new Set();
  for (const t of toks) { if (!map[t]) return false; got.add(map[t]); }
  return got.size === want.size && [...want].every(x => got.has(x));
}
function cofOptions(r) {
  const all = S.m.p.reactions;
  const pool = uniq([...all.map(x => cofText(x.cofactors)), ...all.map(x => cofText({ in: x.cofactors.out, out: x.cofactors.in })), 'None']);
  const right = cofText(r.cofactors);
  return shuffle([right, ...shuffle(pool.filter(x => x !== right)).slice(0, 3)]);
}

/* ---------- questions ---------- */
function mcOptions(item) {
  const p = S.m.p;
  const pool = item.kind === 'met'
    ? [...Object.values(p.metabolites).map(m => m.name), ...(p.distractors?.metabolites || [])]
    : [...Object.values(p.enzymes).map(e => e.name), ...(p.distractors?.enzymes || [])];
  // Prefer in-pathway confusers, top up with outside distractors.
  const inside = shuffle(uniq(pool.slice(0, item.kind === 'met' ? Object.keys(p.metabolites).length : Object.keys(p.enzymes).length)).filter(n => n !== item.name));
  const outside = shuffle(uniq(pool).filter(n => n !== item.name && !inside.includes(n)));
  const picks = [...inside.slice(0, 2), ...outside.slice(0, 1)];
  for (const n of [...inside, ...outside]) if (picks.length < 3 && !picks.includes(n)) picks.push(n);
  return shuffle([item.name, ...picks]);
}
function baseQ(extra) { return Object.assign({ status: 'open', tries: 0, wrong: [], draft: '' }, extra); }
function itemQ(item) {
  const acc = acceptedFor(item);
  return baseQ({
    kind: item.kind, label: item.kind === 'met' ? 'Metabolite' : 'Enzyme', item,
    answerText: item.name, correct: item.name,
    options: S.set.answer === 'choice' ? mcOptions(item) : null,
    check: v => v === item.name || acc.includes(norm(v)),
  });
}
function cofQ(r) {
  const t = cofText(r.cofactors);
  return baseQ({
    kind: 'cof', label: 'Cofactors', answerText: t, correct: t,
    placeholder: 'e.g. ATP, ADP — or "none"',
    options: S.set.answer === 'choice' ? cofOptions(r) : null,
    check: v => v === t || gradeCof(v, r.cofactors),
  });
}
function dirQ(r, top, bottom) {
  const A = S.m.p.metabolites[top].short || S.m.p.metabolites[top].name;
  const B = S.m.p.metabolites[bottom].short || S.m.p.metabolites[bottom].name;
  const opts = [
    { v: 'down', label: `${A} → ${B}  (one-way, top to bottom)` },
    { v: 'up', label: `${B} → ${A}  (one-way, bottom to top)` },
    { v: 'rev', label: `${A} ⇌ ${B}  (reversible)` },
  ];
  const correct = r.reversible ? 'rev' : (r.from === top ? 'down' : 'up');
  return baseQ({
    kind: 'dir', label: 'Direction', answerText: opts.find(o => o.v === correct).label, correct,
    dirOptions: opts, check: v => v === correct,
  });
}

/* ---------- rounds ---------- */
const eligible = () => S.m.seq.filter(k => S.set.inc[S.m.items[k].kind]);

function newRound() {
  S.score = { right: 0, total: 0 };
  S.fact = null;
  const mode = S.set.mode;
  if (mode === 'single') { S.round = { type: 'single', deck: [], target: null, q: null }; nextSingle(); }
  else if (mode === 'total') startTotal();
  else { S.round = { type: 'step', deck: [], pair: null, qs: [] }; nextStep(); }
  render();
}

function nextSingle() {
  const R = S.round;
  if (!R.deck.length) {
    R.deck = shuffle(eligible());
    if (R.deck.length > 1 && R.deck[R.deck.length - 1] === R.target) R.deck.unshift(R.deck.pop());
  }
  R.target = R.deck.pop();
  R.q = itemQ(S.m.items[R.target]);
  S.fact = null;
}

function startTotal() {
  const seq = S.m.seq, n = seq.length, start = Math.floor(Math.random() * n);
  const inc = i => S.set.inc[S.m.items[seq[i]].kind];
  let fwd = [], back = [];
  if (S.m.p.circular) { for (let i = 1; i < n; i++) fwd.push((start + i) % n); }
  else { for (let i = start + 1; i < n; i++) fwd.push(i); for (let i = start - 1; i >= 0; i--) back.push(i); }
  fwd = fwd.filter(inc); back = back.filter(inc);
  S.round = { type: 'total', start, order: [...fwd, ...back], turn: fwd.length, pos: 0, st: {}, q: null, done: false };
  loadTotalQ();
}
function loadTotalQ() {
  const R = S.round;
  if (R.pos >= R.order.length) { R.done = true; R.q = null; return; }
  R.q = itemQ(S.m.items[S.m.seq[R.order[R.pos]]]);
}
function advanceTotal() { S.round.pos++; loadTotalQ(); render(); }

function nextStep() {
  const R = S.round;
  if (!R.deck.length) R.deck = shuffle(S.m.pairs.map((_, i) => i));
  const pair = S.m.pairs[R.deck.pop()];
  const flip = Math.random() < 0.5;
  const top = flip ? pair.b : pair.a, bottom = flip ? pair.a : pair.b;
  R.pair = { ...pair, top, bottom };
  R.qs = [itemQ(S.m.items['e:' + pair.r.id]), cofQ(pair.r), dirQ(pair.r, top, bottom)];
  S.fact = null;
}

/* ---------- grading ---------- */
function submit(q, v) {
  if (q.status !== 'open') return;
  if (q.kind !== 'dir' && q.kind !== 'cof' && !String(v).trim()) return;
  if (q.check(v)) { q.status = 'right'; q.given = v; tally(q, q.tries === 0); resolved(q); }
  else { q.tries++; q.wrong.push(v); q.draft = v; q.justWrong = true; render(); }
}
function reveal(q) { if (q.status !== 'open') return; q.status = 'missed'; tally(q, false); resolved(q); }
function peek(q) { q.status = 'peek'; render(); }
function selfGrade(q, ok) { q.status = ok ? 'right' : 'missed'; q.self = true; tally(q, ok); resolved(q); }
function tally(q, firstTry) { S.score.total++; if (firstTry) S.score.right++; }

function resolved(q) {
  const R = S.round;
  if (q.item) S.fact = q.item;
  else if (R.type === 'step') S.fact = S.m.items['e:' + R.pair.r.id];
  if (R.type === 'total') {
    R.st[q.item.key] = q.status;
    if (q.status === 'right' || q.self) {
      const pos = R.pos;
      render();
      setTimeout(() => { if (S.round === R && R.pos === pos) advanceTotal(); }, q.self ? 0 : 420);
      return;
    }
  }
  if (R.type === 'step' && q.item) S.fact = q.item;
  render();
}

/* ---------- diagram status ---------- */
// shown · blank · target · peek · right · missed · start
function statusOf(key) {
  const R = S.round;
  if (R.type === 'single') {
    if (key !== R.target) return 'shown';
    return R.q.status === 'open' ? 'target' : R.q.status;
  }
  if (R.type === 'total') {
    if (key === S.m.seq[R.start]) return 'start';
    if (!S.set.inc[S.m.items[key].kind]) return 'shown';
    if (R.q && R.q.item.key === key) return R.q.status === 'open' ? 'target' : R.q.status;
    return R.st[key] || 'blank';
  }
  return 'shown';
}
const hidden = st => st === 'blank' || st === 'target';

/* ---------- SVG helpers ---------- */
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
  for (const w of s.split(' ')) { if (w.length <= max) toks.push(w); else toks.push(...w.split(/(?<=-)/)); }
  const lines = []; let cur = '';
  for (const t of toks) {
    const j = cur && !cur.endsWith('-') ? ' ' : '';
    if (cur && (cur + j + t).length > max) { lines.push(cur); cur = t; } else cur += j + t;
  }
  if (cur) lines.push(cur);
  return lines;
}
const svgIcon = (x, y, k) => `<g class="ico ico-${k}" transform="translate(${x - 8},${y - 8})">${ICON[k]}</g>`;

const BW = 212, BH = 40, GAP = 72, CX = 222, SIDEX = 556, TOP = 18;

function metBox(cx, y, item, st) {
  const cls = st === 'peek' ? 'shown' : st;
  const label = hidden(st) ? '?' : item.name;
  let s = `<g class="mbox ${cls}"><rect x="${cx - BW / 2}" y="${y}" width="${BW}" height="${BH}" rx="9"/><text x="${cx}" y="${y + BH / 2}">${esc(label)}</text></g>`;
  if (st === 'right') s += svgIcon(cx - BW / 2 - 16, y + BH / 2, 'ok');
  if (st === 'missed') s += svgIcon(cx - BW / 2 - 16, y + BH / 2, 'no');
  if (st === 'start') s += `<text class="startt" x="${cx - BW / 2 - 10}" y="${y + BH / 2 + 4}" text-anchor="end">START</text>`;
  return s;
}
// anchor: 'end' (label left of a vertical arrow) or 'middle' (label above a horizontal arrow)
function enzLabel(x, y, item, st, anchor, max) {
  const cls = st === 'peek' ? 'shown' : st;
  if (hidden(st)) {
    const w = 48, rx = anchor === 'end' ? x - w : x - w / 2;
    return `<g class="elab ${cls}"><rect x="${rx}" y="${y - 13}" width="${w}" height="26" rx="13"/><text x="${rx + w / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" style="font-style:normal;font-weight:700">?</text></g>`;
  }
  const lines = wrap(item.name, max);
  const tags = (item.rxn.tags || []).filter(t => t !== 'irreversible');
  const all = [...lines.map(l => ['', l]), ...tags.map(t => ['tag', t])];
  const lh = 15, y0 = anchor === 'middle' ? y - (all.length - 1) * lh : y - (all.length - 1) * lh / 2;
  let s = `<g class="elab ${cls}">`;
  all.forEach(([c, l], i) => { s += `<text class="${c}" x="${x}" y="${y0 + i * lh}" text-anchor="${anchor}" dominant-baseline="central">${esc(l)}</text>`; });
  s += '</g>';
  const ix = anchor === 'end' ? x + 14 : x;
  const iy = anchor === 'end' ? y : y0 - 16;
  if (st === 'right') s += svgIcon(ix, iy, 'ok');
  if (st === 'missed') s += svgIcon(ix, iy, 'no');
  if (st === 'start') s += `<text class="startt" x="${x}" y="${y0 - 16}" text-anchor="${anchor}">START</text>`;
  return s;
}
// Curved side arrow for cofactors: inputs enter near the substrate, outputs leave near the product.
// up = the reaction runs bottom-to-top in this drawing.
function cofArc(x, y1, y2, c, up = false) {
  const ins = c.in.map(cofName).join(' + '), outs = c.out.map(cofName).join(' + ');
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

function flowSVG() {
  const { p, items, spine } = S.m;
  const mets = [spine[0].from, ...spine.map(r => r.to)];
  const pos = {};
  mets.forEach((id, i) => { pos[id] = { x: CX, y: TOP + i * (BH + GAP) }; });
  let hasSide = false;
  spine.forEach(r => (r.also_to || []).forEach(s => { pos[s] = { x: SIDEX, y: pos[r.to].y }; hasSide = true; }));
  const H = TOP + mets.length * (BH + GAP) - GAP + 14;
  const W = hasSide ? SIDEX + BW / 2 + 12 : CX + 190;
  let s = '';

  // ×2 bracket
  const mult = spine.map((r, i) => (r.multiplier > 1 ? i : -1)).filter(i => i >= 0);
  if (mult.length) {
    const y1 = pos[spine[mult[0]].from].y, y2 = pos[spine[mult[mult.length - 1]].to].y + BH;
    const k = spine[mult[0]].multiplier;
    s += `<path class="mult" d="M18,${y1}H10V${y2}H18"/><text class="multt" transform="translate(6,${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle">×${k} per glucose</text>`;
  }
  // spine reactions
  spine.forEach(r => {
    const y1 = pos[r.from].y + BH, y2 = pos[r.to].y;
    s += arrow(CX, y1 + 4, CX, y2 - 4, r.reversible);
    s += enzLabel(CX - 34, (y1 + y2) / 2, items['e:' + r.id], statusOf('e:' + r.id), 'end', 24);
    s += cofArc(CX, y1, y2, r.cofactors);
    for (const sd of r.also_to || []) s += arrow(CX + 40, y1 + 4, pos[sd].x - 40, pos[sd].y - 4, r.reversible);
  });
  // branch reactions (horizontal, into the spine)
  p.reactions.filter(r => r.branch).forEach(r => {
    const a = pos[r.from], b = pos[r.to];
    const y = b.y + BH / 2, x1 = a.x - BW / 2 - 6, x2 = b.x + BW / 2 + 6;
    s += arrow(x1, y, x2, y, r.reversible);
    s += enzLabel((x1 + x2) / 2, y - 14, items['e:' + r.id], statusOf('e:' + r.id), 'middle', 16);
    s += cofArc((x1 + x2) / 2, y + 6, y + 60, r.cofactors);
  });
  // metabolites last so they sit on top
  for (const [id, pt] of Object.entries(pos)) s += metBox(pt.x, pt.y, items['m:' + id], statusOf('m:' + id));
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" style="max-width:${W}px;min-width:${Math.min(W, 520)}px" role="img" aria-label="${esc(p.name)} flow diagram">${s}</svg>`;
}

/* ---------- list view ---------- */
function chip(item, st) {
  const cls = st === 'peek' ? 'shown' : st;
  const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
  const badge = st === 'start' ? '<span class="badge">START</span>' : '';
  return `<div class="chip ${cls}">${badge}${hidden(st) ? '?' : esc(item.name)}${ic}</div>`;
}
function conn(item, st, horiz) {
  const r = item.rxn;
  const arr = horiz ? (r.reversible ? '⇌' : '→') : (r.reversible ? '⇅' : '↓');
  const cls = st === 'peek' ? 'shown' : st;
  const ic = st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '';
  const name = hidden(st) ? '?' : esc(item.name);
  const tags = hidden(st) ? [] : (r.tags || []).filter(t => t !== 'irreversible');
  const cof = cofText(r.cofactors);
  const extra = [cof !== 'None' ? esc(cof) : '', (r.also_to || []).length ? 'splits in two' : '', ...tags].filter(Boolean).join(' · ');
  return `<div class="conn"><span class="arr" aria-label="${r.reversible ? 'reversible' : 'one-way'}">${arr}</span><div class="meta"><span class="ename ${cls}">${name} ${ic}</span>${extra ? `<span class="cofs">${extra}</span>` : ''}</div></div>`;
}
function listHTML() {
  const horiz = S.set.dir === 'h';
  const parts = S.m.seq.map(k => {
    const it = S.m.items[k], st = statusOf(k);
    return it.kind === 'met' ? chip(it, st) : conn(it, st, horiz);
  });
  return `<div class="list ${horiz ? 'h' : 'v'}">${parts.join('')}</div>`;
}

/* ---------- single-step diagram ---------- */
function stepFlow() {
  const R = S.round, { p, items } = S.m, r = R.pair.r;
  const [qe, qc, qd] = R.qs;
  const cx = 230, y1 = TOP, y2 = TOP + BH + 130;
  let s = metBox(cx, y1, items['m:' + R.pair.top], 'shown') + metBox(cx, y2, items['m:' + R.pair.bottom], 'shown');
  const a = y1 + BH + 4, b = y2 - 4, mid = (a + b) / 2;
  if (qd.status === 'open') {
    s += `<line class="ln unk" x1="${cx}" y1="${a}" x2="${cx}" y2="${b}"/><circle class="qcirc" cx="${cx}" cy="${mid}" r="13"/><text class="qcirc-t" x="${cx}" y="${mid}">?</text>`;
  } else {
    s += r.reversible ? arrow(cx, a, cx, b, true) : (qd.correct === 'down' ? arrow(cx, a, cx, b, false) : arrow(cx, b, cx, a, false));
  }
  const est = qe.status === 'open' ? 'target' : qe.status;
  s += enzLabel(cx - 34, mid, items['e:' + r.id], est, 'end', 24);
  if (qc.status === 'open') {
    s += `<g class="elab target"><rect x="${cx + 22}" y="${mid - 13}" width="48" height="26" rx="13"/><text x="${cx + 46}" y="${mid}" text-anchor="middle" dominant-baseline="central" style="font-style:normal;font-weight:700">?</text></g>`;
  } else {
    // Until direction is answered, show cofactors as text: the arc's arrowhead would give the direction away.
    if (cofText(r.cofactors) === 'None') s += `<text class="coft" x="${cx + 22}" y="${mid + 4}">no cofactors</text>`;
    else if (qd.status === 'open') s += `<text class="coft" x="${cx + 22}" y="${mid + 4}">${esc(cofText(r.cofactors))}</text>`;
    else s += cofArc(cx, y1 + BH, y2, r.cofactors, R.pair.bottom === r.from);
  }
  return `<svg class="flow" viewBox="0 0 470 ${y2 + BH + 16}" style="max-width:470px" role="img" aria-label="Single step">${s}</svg>`;
}
function stepList() {
  const R = S.round, { items } = S.m, r = R.pair.r;
  const [qe, qc, qd] = R.qs;
  const horiz = S.set.dir === 'h';
  let arr = '?';
  if (qd.status !== 'open') arr = r.reversible ? (horiz ? '⇌' : '⇅') : (qd.correct === 'down' ? (horiz ? '→' : '↓') : (horiz ? '←' : '↑'));
  const est = qe.status === 'open' ? 'target' : qe.status;
  const ic = st => (st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '');
  const ename = hidden(est) ? '?' : esc(items['e:' + r.id].name);
  const cof = qc.status === 'open' ? '<span class="ename target">?</span>' : esc(cofText(r.cofactors)) + ' ' + ic(qc.status);
  return `<div class="list ${horiz ? 'h' : 'v'}">${chip(items['m:' + R.pair.top], 'shown')}
    <div class="conn"><span class="arr">${arr}</span><div class="meta"><span class="ename ${est === 'peek' ? 'shown' : est}">${ename} ${ic(qe.status)}</span><span class="cofs">${cof}</span></div></div>
    ${chip(items['m:' + R.pair.bottom], 'shown')}</div>`;
}

/* ---------- panel ---------- */
function qBlock(q, idx) {
  const box = document.createElement('div');
  box.className = 'q';
  const optsFor = q.kind === 'dir' ? q.dirOptions : q.options ? q.options.map(o => ({ v: o, label: o })) : null;
  let html = `<div class="q-label">${q.label}</div>`;
  if (q.status === 'right' || q.status === 'missed') {
    const was = q.status === 'right' && q.tries ? `<span class="was">after ${q.tries} miss${q.tries > 1 ? 'es' : ''}</span>`
      : q.status === 'missed' && q.wrong.length ? `<span class="was">you tried: ${esc(q.wrong.map(w => labelFor(q, w)).join(', '))}</span>` : '';
    html += `<div class="result">${icon(q.status === 'right' ? 'ok' : 'no')}<div>${esc(q.answerText)}${was}</div></div>`;
  } else if (q.status === 'peek') {
    html += `<div class="result"><div>${esc(q.answerText)}</div></div>
      <div class="actions"><button class="btn primary" data-act="got" data-q="${idx}">${icon('ok')} Got it</button><button class="btn" data-act="miss" data-q="${idx}">${icon('no')} Missed</button></div>`;
  } else if (S.set.answer === 'self') {
    html += `<button class="btn primary" data-act="peek" data-q="${idx}">Show answer</button>`;
  } else if (optsFor) {
    html += `<div class="opts">${optsFor.map((o, i) => {
      const bad = q.wrong.includes(o.v);
      return `<button class="btn opt${bad ? ' wrong' : ''}" data-act="pick" data-q="${idx}" data-v="${esc(o.v)}" ${bad ? 'disabled' : ''}><kbd>${i + 1}</kbd>${bad ? icon('no') : ''}<span>${esc(o.label)}</span></button>`;
    }).join('')}</div>`;
  } else {
    html += `<form class="row" data-q="${idx}"><input class="ans${q.justWrong ? ' bad' : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(q.placeholder || 'Type the name')}" value="${esc(q.draft)}" aria-label="${q.label}"><button class="btn">Check</button></form>`;
    if (q.justWrong) html += `<div class="hint">${icon('no')} Not quite — try again or reveal.</div>`;
  }
  if (q.status === 'open' && S.set.answer !== 'self') html += `<div class="actions"><button class="btn ghost" data-act="reveal" data-q="${idx}">Reveal answer</button></div>`;
  box.innerHTML = html;
  if (q.justWrong) box.querySelector('input,.opts')?.classList.add('shake');
  q.justWrong = false;
  return box;
}
const labelFor = (q, v) => (q.kind === 'dir' ? q.dirOptions.find(o => o.v === v)?.label || v : v);

function factsHTML(item) {
  if (!item) return '';
  let tags = '', extra = '';
  if (item.kind === 'enz') {
    const r = item.rxn;
    tags = [r.reversible ? 'reversible' : 'irreversible', ...(r.tags || []).filter(t => t !== 'irreversible')].join(' · ');
    extra = `<p><b>${esc(S.m.p.metabolites[r.from].name)}${(r.also_to || []).length ? '' : ''} ${r.reversible ? '⇌' : '→'} ${esc([r.to, ...(r.also_to || [])].map(id => S.m.p.metabolites[id].name).join(' + '))}</b></p><p>Cofactors: ${esc(cofText(r.cofactors))}</p>`;
  }
  return `<div class="facts"><h3>${esc(item.name)}${item.short && item.short !== item.name ? ` <span style="font-weight:500;color:var(--muted)">(${esc(item.short)})</span>` : ''}</h3>${tags ? `<div class="tags">${tags}</div>` : ''}${extra}${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</div>`;
}

function renderPanel() {
  const P = $('#panel'), R = S.round;
  P.innerHTML = '';
  const score = `<span class="score">First try <b>${S.score.right}</b> / ${S.score.total}</span>`;
  const head = (t, sub) => { const d = document.createElement('div'); d.innerHTML = `<div class="ph"><h2>${t}</h2>${score}</div>${sub ? `<p class="sub">${sub}</p>` : ''}`; P.append(d); };
  const actions = btns => { const d = document.createElement('div'); d.className = 'actions'; d.innerHTML = btns; P.append(d); };

  if (R.type === 'single') {
    head('Fill the blank', `Which ${R.q.kind === 'met' ? 'metabolite' : 'enzyme'} goes in the orange box?`);
    P.append(qBlock(R.q, 0));
    if (R.q.status === 'right' || R.q.status === 'missed') actions('<button class="btn primary" data-act="next">Next blank</button>');
  } else if (R.type === 'total') {
    const startItem = S.m.items[S.m.seq[R.start]];
    if (R.done) {
      head('Pathway complete', '');
      const d = document.createElement('div'); d.className = 'done';
      d.innerHTML = `<div class="big">${S.score.right} / ${S.score.total}</div><div class="sub">right on the first try</div>`;
      P.append(d);
      actions('<button class="btn primary" data-act="restart">New random start</button>');
    } else {
      const back = R.pos >= R.turn;
      const dirTxt = S.m.p.circular ? 'Going around the cycle.' : back ? `Now working <b>backward</b> from ${esc(startItem.name)} toward the start.` : `Working <b>forward</b> from ${esc(startItem.name)}.`;
      head(`Full recall · ${R.pos + 1} of ${R.order.length}`, dirTxt);
      P.append(qBlock(R.q, 0));
      if (R.q.status === 'missed') actions('<button class="btn primary" data-act="continue">Continue</button>');
      actions('<button class="btn ghost" data-act="restart">Restart from a new point</button>');
    }
  } else {
    head('Single step', 'What sits between these two — and which way does it run?');
    R.qs.forEach((q, i) => P.append(qBlock(q, i)));
    const done = R.qs.every(q => q.status === 'right' || q.status === 'missed');
    const open = R.qs.some(q => q.status === 'open');
    actions((done ? '<button class="btn primary" data-act="next">Next pair</button>' : '') +
      (open && S.set.answer !== 'self' ? '<button class="btn ghost" data-act="revealall">Reveal all</button>' : '') +
      (open && S.set.answer === 'self' ? '<button class="btn ghost" data-act="peekall">Show all</button>' : '') +
      (!done ? '<button class="btn ghost" data-act="next">Skip</button>' : ''));
  }
  const f = document.createElement('div');
  f.innerHTML = factsHTML(S.fact);
  P.append(f);
  const k = document.createElement('div'); k.className = 'keys';
  k.textContent = S.set.answer === 'choice' ? 'Keys: 1–4 pick · Enter next' : S.set.answer === 'type' ? 'Enter checks · Enter again for next' : 'Enter shows · 1 got it · 2 missed';
  P.append(k);

  const inp = P.querySelector('input.ans');
  if (inp) { inp.focus(); inp.select(); }
}

function legendHTML() {
  if (S.set.view === 'list') return `<span><b style="font-size:16px">${S.set.dir === 'h' ? '→' : '↓'}</b> one-way</span><span><b style="font-size:16px">${S.set.dir === 'h' ? '⇌' : '⇅'}</b> reversible</span><span>${icon('ok')} correct</span><span>${icon('no')} missed</span>`;
  const one = `<svg width="34" height="12" class="flow" style="width:34px">${arrow(2, 6, 32, 6, false)}</svg>`;
  const rev = `<svg width="34" height="14" class="flow" style="width:34px">${arrow(2, 7, 32, 7, true)}</svg>`;
  return `<span>${one} one-way (irreversible)</span><span>${rev} reversible</span><span>${icon('ok')} correct</span><span>${icon('no')} missed</span><span>dashed = still hidden</span>`;
}

function renderControls() {
  document.querySelectorAll('.group[data-key]').forEach(g => {
    g.querySelectorAll('button').forEach(b => { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(S.set[g.dataset.key] === b.dataset.v)); });
  });
  document.querySelectorAll('[data-inc]').forEach(b => b.setAttribute('aria-pressed', String(!!S.set.inc[b.dataset.inc])));
  $('#incGroup').hidden = S.set.mode === 'step';
  $('#dirGroup').hidden = S.set.view !== 'list';
}

function render() {
  renderControls();
  const R = S.round;
  $('#stage').innerHTML = R.type === 'step'
    ? (S.set.view === 'flow' ? stepFlow() : stepList())
    : (S.set.view === 'flow' ? flowSVG() : listHTML());
  $('#legend').innerHTML = legendHTML();
  renderPanel();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const g = e.target.closest('.group[data-key] button');
  if (g) {
    const key = g.closest('.group').dataset.key, v = g.dataset.v;
    if (S.set[key] === v) return;
    S.set[key] = v; saveSettings();
    if (key === 'mode' || key === 'answer') newRound(); else render();
    return;
  }
  const c = e.target.closest('[data-inc]');
  if (c) {
    const k = c.dataset.inc, other = k === 'met' ? 'enz' : 'met';
    if (S.set.inc[k] && !S.set.inc[other]) return; // keep at least one on
    S.set.inc[k] = !S.set.inc[k]; saveSettings(); newRound();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const R = S.round, qs = R.type === 'step' ? R.qs : [R.q];
  const q = qs[+b.dataset.q || 0];
  switch (b.dataset.act) {
    case 'pick': submit(q, b.dataset.v); break;
    case 'reveal': reveal(q); break;
    case 'peek': peek(q); break;
    case 'got': selfGrade(q, true); break;
    case 'miss': selfGrade(q, false); break;
    case 'revealall': R.qs.filter(x => x.status === 'open').forEach(reveal); break;
    case 'peekall': R.qs.filter(x => x.status === 'open').forEach(x => (x.status = 'peek')); render(); break;
    case 'next': R.type === 'single' ? nextSingle() : nextStep(); render(); break;
    case 'continue': advanceTotal(); break;
    case 'restart': newRound(); break;
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, R = S.round;
  const q = R.type === 'step' ? R.qs[+f.dataset.q] : R.q;
  const v = f.querySelector('input').value;
  q.draft = v;
  submit(q, v);
});
document.addEventListener('input', e => {
  const f = e.target.closest('form[data-q]');
  if (!f) return;
  const R = S.round, q = R.type === 'step' ? R.qs[+f.dataset.q] : R.q;
  q.draft = e.target.value;
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
  const inInput = e.target.tagName === 'INPUT';
  const P = $('#panel');
  if (e.key === 'Enter' && !inInput) {
    const btn = P.querySelector('[data-act="next"].primary,[data-act="continue"],[data-act="restart"].primary,[data-act="peek"],[data-act="got"]');
    if (btn) { e.preventDefault(); btn.click(); }
    return;
  }
  if (!inInput && /^[1-4]$/.test(e.key)) {
    if (S.set.answer === 'self') {
      const btn = P.querySelector(e.key === '1' ? '[data-act="got"]' : e.key === '2' ? '[data-act="miss"]' : '_');
      if (btn) btn.click();
      return;
    }
    const opts = P.querySelector('.opts');
    const btn = opts && opts.querySelectorAll('button')[+e.key - 1];
    if (btn && !btn.disabled) btn.click();
  }
});
$('#pathway').addEventListener('change', e => loadPathway(e.target.value));

/* ---------- boot ---------- */
async function loadPathway(id) {
  const p = await fetch('/api/pathways/' + encodeURIComponent(id)).then(r => r.json());
  S.set.pathway = id; saveSettings();
  S.m = buildModel(p);
  $('#summary').textContent = p.summary || '';
  document.title = p.name + ' · Pathways';
  newRound();
}
(async function boot() {
  const [list, cof] = await Promise.all([fetch('/api/pathways').then(r => r.json()), fetch('/api/cofactors').then(r => r.json())]);
  S.list = list; S.cof = cof;
  $('#pathway').innerHTML = list.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  const id = list.some(p => p.id === S.set.pathway) ? S.set.pathway : list[0].id;
  $('#pathway').value = id;
  await loadPathway(id);
})();
