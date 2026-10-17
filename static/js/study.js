/* Study screen: quiz setup, rounds, grading, the answer panel, zoom, keyboard, boot.
   Modes:  single  — one blank at a time
           total   — recall everything from a chosen / random / hidden start
           step    — given two metabolites → enzyme, cofactors, direction   (given: 'mets')
                     given the enzyme → reactants, products, cofactors, pathway (given: 'enz')
   Every element is set to show / quiz / hide in the setup panel; which elements apply depends on the mode. */
'use strict';

const DEFAULTS = {
  pathway: null, mode: 'single', given: 'mets', scope: 'all', view: 'flow', answer: 'type', dir: 'v',
  weak: false, start: 'random', zoom: 'width', follow: true,
  el: { met: 'quiz', enz: 'quiz', cof: 'show', dir: 'quiz', path: 'quiz' },
};
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('pathways.settings') || '{}');
    const s = Object.assign(clone(DEFAULTS), raw);
    s.el = Object.assign(clone(DEFAULTS.el), raw.el);
    return s;
  } catch { return clone(DEFAULTS); }
}
function saveSettings() { try { localStorage.setItem('pathways.settings', JSON.stringify(S.set)); } catch {} }

const S = { m: null, set: loadSettings(), round: null, score: { right: 0, total: 0 }, fact: null };

/* ---------- elements: show / quiz / hide ---------- */
const MODE_LABEL = { single: 'Single blank', total: 'Full recall', step: 'Single step' };
function modeKey() { return S.set.mode === 'step' ? (S.set.given === 'enz' ? 'stepE' : 'stepM') : 'occ'; }
function elSpec() {
  return {
    occ: [['met', 'Metabolites', ['show', 'quiz']], ['enz', 'Enzymes', ['show', 'quiz', 'hide']], ['cof', 'Cofactors', ['show', 'quiz', 'hide']]],
    stepM: [['enz', 'Enzyme', ['show', 'quiz', 'hide']], ['cof', 'Cofactors', ['show', 'quiz', 'hide']], ['dir', 'Direction', ['show', 'quiz']]],
    stepE: [['met', 'Reactants & products', ['show', 'quiz']], ['cof', 'Cofactors', ['show', 'quiz', 'hide']], ['path', 'Pathway', ['show', 'quiz', 'hide']]],
  }[modeKey()];
}
function el(k) {
  const spec = elSpec().find(x => x[0] === k);
  if (!spec) return 'hide';
  return spec[2].includes(S.set.el[k]) ? S.set.el[k] : spec[2][0];
}
const anyQuiz = () => elSpec().some(([k]) => el(k) === 'quiz');
const kindOf = key => ({ m: 'met', e: 'enz', c: 'cof' })[key[0]];

/* ---------- questions ---------- */
function mcOptions(item, m) {
  const p = m.p;
  const inPath = item.kind === 'met' ? Object.values(p.metabolites).map(x => x.name) : Object.values(p.enzymes).map(e => e.name);
  const extra = item.kind === 'met' ? (p.distractors?.metabolites || []) : (p.distractors?.enzymes || []);
  const inside = shuffle(uniq(inPath).filter(n => n !== item.name));
  const outside = shuffle(uniq(extra).filter(n => n !== item.name && !inside.includes(n)));
  const picks = [...inside.slice(0, 2), ...outside.slice(0, 1)];
  for (const n of [...inside, ...outside]) if (picks.length < 3 && !picks.includes(n)) picks.push(n);
  return shuffle([item.name, ...picks]);
}
function pickOthers(right, pool, n = 3) { return shuffle([right, ...shuffle(uniq(pool).filter(x => x && x !== right)).slice(0, n)]); }
function cofOptions(r, m) {
  const all = m.p.reactions;
  const pool = [...all.map(x => cofText(m, x.cofactors || {})), ...all.map(x => cofText(m, { in: x.cofactors?.out || [], out: x.cofactors?.in || [] })), 'None'];
  return pickOthers(cofText(m, r.cofactors || {}), pool);
}
function baseQ(extra) { return Object.assign({ status: 'open', tries: 0, wrong: [], draft: '' }, extra); }
function itemQ(item, m = S.m) {
  if (item.kind === 'cof') return cofQ(item.rxn, m, item);
  const acc = acceptedFor(item);
  return baseQ({
    kind: item.kind, label: item.kind === 'met' ? 'Metabolite' : 'Enzyme', item, statKey: item.key, pid: m.p.id,
    answerText: item.name, correct: item.name,
    options: S.set.answer === 'choice' ? mcOptions(item, m) : null,
    check: v => v === item.name || acc.includes(norm(v)),
  });
}
function cofQ(r, m = S.m, item = null) {
  const t = cofText(m, r.cofactors || {});
  return baseQ({
    kind: 'cof', label: 'Cofactors', item, factItem: m.items['e:' + r.id], answerText: t, correct: t, statKey: 'c:' + r.id, pid: m.p.id,
    placeholder: 'e.g. ATP, ADP — or "none"',
    options: S.set.answer === 'choice' ? cofOptions(r, m) : null,
    check: v => v === t || gradeCof(m, v, r.cofactors || {}),
  });
}
function dirQ(r, top, bottom, m = S.m) {
  const nm = id => m.p.metabolites[id].short || m.p.metabolites[id].name;
  const A = nm(top), B = nm(bottom);
  const opts = [
    { v: 'down', label: `${A} → ${B}  (one-way, top to bottom)` },
    { v: 'up', label: `${B} → ${A}  (one-way, bottom to top)` },
    { v: 'rev', label: `${A} ⇌ ${B}  (reversible)` },
  ];
  const fromSide = top === r.from || (r.also_from || []).includes(top);
  const correct = r.reversible ? 'rev' : (fromSide ? 'down' : 'up');
  return baseQ({ kind: 'dir', label: 'Direction', answerText: opts.find(o => o.v === correct).label, correct, statKey: 'd:' + r.id, pid: m.p.id, dirOptions: opts, check: v => v === correct });
}
// Enzyme-given step: reactant / product sets. Reversible steps accept either side.
function metSetQ(r, m, side) {
  const want = side === 'r' ? reactantsOf(r) : productsOf(r), other = side === 'r' ? productsOf(r) : reactantsOf(r);
  const t = metNames(m, want);
  const pool = [...m.p.reactions.flatMap(x => [metNames(m, reactantsOf(x)), metNames(m, productsOf(x))]), ...(m.p.distractors?.metabolites || [])];
  return baseQ({
    kind: 'mets', label: side === 'r' ? 'Reactants' : 'Products', answerText: t + (r.reversible ? '  (reversible — either direction counts)' : ''), correct: t,
    statKey: (side === 'r' ? 'r:' : 'p:') + r.id, pid: m.p.id, placeholder: 'e.g. G3P, DHAP',
    options: S.set.answer === 'choice' ? pickOthers(t, pool) : null,
    check: v => {
      if (v === t || (r.reversible && v === metNames(m, other))) return true;
      const ids = parseMets(m, v);
      return !!ids && (sameSet(ids, want) || (r.reversible && sameSet(ids, other)));
    },
  });
}
function pathQ(r, m) {
  const homes = pathwaysWithEnzyme(m.items['e:' + r.id]);
  const acc = new Set(homes.flatMap(pathwayAccepted));
  const others = Object.values(Library.all()).filter(p => !homes.includes(p)).map(p => p.name);
  return baseQ({
    kind: 'path', label: 'Pathway', answerText: homes.map(p => p.name).join(' · '), correct: m.p.name, statKey: 'w:' + r.id, pid: m.p.id,
    placeholder: 'e.g. Glycolysis',
    options: S.set.answer === 'choice' ? pickOthers(m.p.name, others) : null,
    check: v => homes.some(p => p.name === v) || acc.has(norm(v)),
  });
}

/* ---------- rounds ---------- */
const eligible = () => S.m.seq.filter(k => el(kindOf(k)) === 'quiz');
const visibleSeq = () => S.m.seq.filter(k => el(kindOf(k)) !== 'hide');

function newRound() {
  S.score = { right: 0, total: 0 };
  S.fact = null;
  if (!anyQuiz()) S.round = { type: 'none' };
  else if (S.set.mode === 'single') { S.round = { type: 'single', deck: [], target: null, q: null }; nextSingle(); }
  else if (S.set.mode === 'total') startTotal();
  else if (S.set.given === 'enz') { S.round = { type: 'stepE', deck: [], qs: [] }; nextStepE(); }
  else { S.round = { type: 'step', deck: [], pair: null, qs: [] }; nextStep(); }
  render();
}
function nextSingle() {
  const R = S.round;
  if (!R.deck.length) {
    R.deck = Stats.order(S.m.p.id, eligible(), S.set.weak).reverse(); // pop() takes from the end
    if (R.deck.length > 1 && R.deck[R.deck.length - 1] === R.target) R.deck.unshift(R.deck.pop());
  }
  R.target = R.deck.pop();
  R.q = itemQ(S.m.items[R.target]);
  S.fact = null;
}
function startTotal() {
  // start: 'random', 'begin' (nothing shown, recall from the first item), or an item key.
  const seq = S.m.seq, n = seq.length, sel = S.set.start, vis = visibleSeq();
  const start = sel === 'begin' ? -1 : vis.includes(sel) ? seq.indexOf(sel) : seq.indexOf(vis[Math.floor(Math.random() * vis.length)]);
  const inc = i => el(kindOf(seq[i])) === 'quiz';
  let fwd = [], back = [];
  if (start === -1) { for (let i = 0; i < n; i++) fwd.push(i); }
  else if (S.m.p.circular) { for (let i = 1; i < n; i++) fwd.push((start + i) % n); }
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

function weightedDeck(list, rateOf) {
  return S.set.weak
    ? list.map(x => ({ x, r: Math.pow(Math.random(), 1 / (0.15 + 4 * rateOf(x))) })).sort((a, b) => a.r - b.r).map(o => o.x)
    : shuffle(list);
}
function nextStep() {
  const R = S.round, pid = S.m.p.id;
  if (!R.deck.length) R.deck = weightedDeck(S.m.pairs.map((_, i) => i), i => Math.max(...['e:', 'c:', 'd:'].map(t => Stats.rate(pid, t + S.m.pairs[i].r.id))));
  const pair = S.m.pairs[R.deck.pop()];
  const flip = Math.random() < 0.5;
  const top = flip ? pair.b : pair.a, bottom = flip ? pair.a : pair.b;
  R.pair = { ...pair, top, bottom };
  R.qs = [];
  if (el('enz') === 'quiz') R.qs.push(itemQ(S.m.items['e:' + pair.r.id]));
  if (el('cof') === 'quiz') R.qs.push(cofQ(pair.r));
  if (el('dir') === 'quiz') R.qs.push(dirQ(pair.r, top, bottom));
  S.fact = null;
}
function nextStepE() {
  const R = S.round;
  if (!R.deck.length) {
    const ps = S.set.scope === 'all' ? Object.values(Library.all()) : [S.m.p];
    const list = [];
    for (const p of ps) { let m; try { m = modelFor(p); } catch { continue; } for (const r of p.reactions) list.push({ pid: p.id, rid: r.id }); }
    R.deck = weightedDeck(list, x => Math.max(...['r:', 'p:', 'c:', 'w:'].map(t => Stats.rate(x.pid, t + x.rid))));
  }
  const pick = R.deck.pop(), m = modelFor(Library.get(pick.pid)), r = m.p.reactions.find(x => x.id === pick.rid);
  R.m = m; R.r = r;
  R.qs = [];
  if (el('met') === 'quiz') R.qs.push(metSetQ(r, m, 'r'), metSetQ(r, m, 'p'));
  if (el('cof') === 'quiz') R.qs.push(cofQ(r, m));
  if (el('path') === 'quiz') R.qs.push(pathQ(r, m));
  S.fact = null;
}

/* ---------- grading ---------- */
function submit(q, v) {
  if (q.status !== 'open') return;
  if (!['dir', 'cof'].includes(q.kind) && !String(v).trim()) return;
  if (q.check(v)) { q.status = 'right'; q.given = v; tally(q, q.tries === 0); resolved(q); }
  else { q.tries++; q.wrong.push(v); q.draft = v; q.justWrong = true; render(); }
}
function reveal(q) { if (q.status !== 'open') return; q.status = 'missed'; tally(q, false); resolved(q); }
function peek(q) { q.status = 'peek'; render(); }
function selfGrade(q, ok) { q.status = ok ? 'right' : 'missed'; q.self = true; tally(q, ok); resolved(q); }
function tally(q, firstTry) { S.score.total++; if (firstTry) S.score.right++; Stats.record(q.pid, q.statKey, firstTry); }

function resolved(q) {
  const R = S.round;
  S.fact = R.type === 'stepE' ? R.m.items['e:' + R.r.id] : q.factItem || q.item || S.m.items['e:' + R.pair.r.id];
  if (R.type === 'total') {
    R.st[q.item.key] = q.status;
    if (q.status === 'right' || q.self) {
      const pos = R.pos;
      render();
      setTimeout(() => { if (S.round === R && R.pos === pos) advanceTotal(); }, q.self ? 0 : 420);
      return;
    }
  }
  render();
}

/* ---------- diagram status ---------- */
function statusOf(key) {
  const R = S.round, mode = el(kindOf(key));
  if (mode === 'hide') return 'hide';
  if (R.type === 'single') {
    if (key !== R.target) return 'shown';
    return R.q.status === 'open' ? 'target' : R.q.status;
  }
  if (R.type === 'total') {
    if (R.start >= 0 && key === S.m.seq[R.start]) return 'start';
    if (mode !== 'quiz') return 'shown';
    if (R.q && R.q.item.key === key) return R.q.status === 'open' ? 'target' : R.q.status;
    return R.st[key] || 'blank';
  }
  return 'shown';
}

/* ---------- single-step diagrams ---------- */
const qOf = kind => S.round.qs.find(q => q.kind === kind);
const qState = q => (q ? (q.status === 'open' ? 'target' : q.status) : 'shown');

function stepFlow() {
  const R = S.round, m = S.m, { items } = m, r = R.pair.r;
  const qe = qOf('enz'), qc = qOf('cof'), qd = qOf('dir');
  const dirKnown = !qd || qd.status !== 'open';
  const down = r.reversible || reactantsOf(r).includes(R.pair.top);
  const cx = 230, y1 = TOP, y2 = TOP + BH + 130;
  let s = metBox(cx, y1, items['m:' + R.pair.top], 'shown') + metBox(cx, y2, items['m:' + R.pair.bottom], 'shown');
  const a = y1 + BH + 4, b = y2 - 4, mid = (a + b) / 2;
  if (!dirKnown) s += `<line class="ln unk" x1="${cx}" y1="${a}" x2="${cx}" y2="${b}"/><circle class="qcirc" cx="${cx}" cy="${mid}" r="13"/><text class="qcirc-t" x="${cx}" y="${mid}">?</text>`;
  else s += r.reversible ? arrow(cx, a, cx, b, true) : down ? arrow(cx, a, cx, b, false) : arrow(cx, b, cx, a, false);
  if (el('enz') !== 'hide') s += enzLabel(cx - 34, mid, items['e:' + r.id], qState(qe), 'end', 24);
  if (el('cof') !== 'hide') {
    const cs = qState(qc), ct = cofText(m, r.cofactors || {});
    if (hidden(cs)) s += cofBlank(cx + 22, mid, cs);
    else if (ct === 'None') s += `<text class="coft" x="${cx + 22}" y="${mid + 4}">no cofactors</text>` + cofMark(cx + 12, mid - 14, cs);
    // Until direction is answered, cofactors are plain text: the arc's arrowhead would give the direction away.
    else if (!dirKnown) s += `<text class="coft" x="${cx + 22}" y="${mid + 4}">${esc(ct)}</text>` + cofMark(cx + 12, mid - 14, cs);
    else s += cofArc(m, cx, y1 + BH, y2, r.cofactors, !down) + cofMark(cx + 30, mid, cs);
  }
  return `<svg class="flow" viewBox="0 0 470 ${y2 + BH + 16}" role="img" aria-label="Single step">${s}</svg>`;
}
function stepList() {
  const R = S.round, m = S.m, { items } = m, r = R.pair.r;
  const qe = qOf('enz'), qc = qOf('cof'), qd = qOf('dir');
  const horiz = S.set.dir === 'h', down = r.reversible || reactantsOf(r).includes(R.pair.top);
  let arr = '?';
  if (!qd || qd.status !== 'open') arr = r.reversible ? (horiz ? '⇌' : '⇅') : down ? (horiz ? '→' : '↓') : (horiz ? '←' : '↑');
  const ic = st => (st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '');
  const es = qState(qe), cs = qState(qc);
  const ename = el('enz') === 'hide' ? '' : `<span class="ename ${es === 'peek' ? 'shown' : es}">${hidden(es) ? '?' : esc(items['e:' + r.id].name)} ${ic(es)}</span>`;
  const cof = el('cof') === 'hide' ? '' : hidden(cs) ? `<span class="ename ${cs}">?</span>` : esc(cofText(m, r.cofactors || {})) + ' ' + ic(cs);
  return `<div class="list ${horiz ? 'h' : 'v'}">${chip(items['m:' + R.pair.top], 'shown')}
    <div class="conn"><span class="arr">${arr}</span><div class="meta">${ename}<span class="cofs">${cof}</span></div></div>
    ${chip(items['m:' + R.pair.bottom], 'shown')}</div>`;
}
function stepEFlow() {
  const R = S.round, m = R.m, r = R.r, w = 380, cx = 330, y1 = TOP + 18, y2 = y1 + BH + 130;
  const qr = qOf('mets') && R.qs.find(q => q.label === 'Reactants'), qp = R.qs.find(q => q.label === 'Products'), qc = qOf('cof');
  const box = (y, ids, q) => metBox(cx, y, { name: metNames(m, ids) }, qState(q), w);
  const a = y1 + BH + 4, b = y2 - 4, mid = (a + b) / 2;
  let s = box(y1, reactantsOf(r), qr) + box(y2, productsOf(r), qp) + arrow(cx, a, cx, b, r.reversible);
  s += `<g class="elab given">${wrap(m.items['e:' + r.id].name, 24).map((l, i, all) => `<text x="${cx - 24}" y="${mid + (i - (all.length - 1) / 2) * 17}" text-anchor="end" dominant-baseline="central">${esc(l)}</text>`).join('')}</g>`;
  if (el('cof') !== 'hide') {
    const cs = qState(qc);
    if (hidden(cs)) s += cofBlank(cx + 22, mid, cs);
    else if (cofText(m, r.cofactors || {}) === 'None') s += `<text class="coft" x="${cx + 22}" y="${mid + 4}">no cofactors</text>` + cofMark(cx + 12, mid - 14, cs);
    else s += cofArc(m, cx, y1 + BH, y2, r.cofactors) + cofMark(cx + 30, mid, cs);
  }
  return `<svg class="flow" viewBox="0 0 ${cx + w / 2 + 20} ${y2 + BH + 16}" role="img" aria-label="Enzyme step">${s}</svg>`;
}
function stepEList() {
  const R = S.round, m = R.m, r = R.r, horiz = S.set.dir === 'h';
  const qr = R.qs.find(q => q.label === 'Reactants'), qp = R.qs.find(q => q.label === 'Products'), qc = qOf('cof');
  const ch = (ids, q) => chip({ name: metNames(m, ids) }, qState(q));
  const cs = qState(qc), ic = st => (st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '');
  const cof = el('cof') === 'hide' ? '' : hidden(cs) ? `<span class="ename ${cs}">?</span>` : esc(cofText(m, r.cofactors || {})) + ' ' + ic(cs);
  const arr = horiz ? (r.reversible ? '⇌' : '→') : (r.reversible ? '⇅' : '↓');
  return `<div class="list ${horiz ? 'h' : 'v'}">${ch(reactantsOf(r), qr)}
    <div class="conn"><span class="arr">${arr}</span><div class="meta"><span class="ename given">${esc(m.items['e:' + r.id].name)}</span><span class="cofs">${cof}</span></div></div>
    ${ch(productsOf(r), qp)}</div>`;
}

/* ---------- panel ---------- */
const labelFor = (q, v) => (q.kind === 'dir' ? q.dirOptions.find(o => o.v === v)?.label || v : v);
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
  } else if (q.inline) {
    html += `<div class="row"><p class="sub" style="margin:0;flex:1">Type in the orange box on the diagram.</p><button class="btn" data-act="checkinline">Check</button></div>`;
    if (q.justWrong) html += `<div class="hint">${icon('no')} Not quite — try again or reveal.</div>`;
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
  return box;
}

function factsHTML(item, m) {
  if (!item) return '';
  let tags = '', extra = '';
  if (item.kind === 'enz') {
    const r = item.rxn, mn = id => m.p.metabolites[id].name;
    tags = [r.reversible ? 'reversible' : 'irreversible', ...(r.tags || []).filter(t => t !== 'irreversible'), r.loc].filter(Boolean).join(' · ');
    extra = `<p><b>${esc(metNames(m, reactantsOf(r)))} ${r.reversible ? '⇌' : '→'} ${esc(metNames(m, productsOf(r)))}</b></p><p>Cofactors: ${esc(cofText(m, r.cofactors || {}))}</p>`;
    if ((r.requires || []).length) extra += `<p>Requires: ${esc(r.requires.join(', '))}</p>`;
    if (S.round.type === 'stepE') extra += `<p>Pathway: ${esc(pathwaysWithEnzyme(item).map(p => p.name).join(' · '))}</p>`;
  }
  return `<div class="facts"><h3>${esc(item.name)}${item.short && item.short !== item.name ? ` <span class="muted" style="font-weight:500">(${esc(item.short)})</span>` : ''}</h3>${tags ? `<div class="tags">${esc(tags)}</div>` : ''}${extra}${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</div>`;
}

function renderPanel() {
  const P = $('#panel'), R = S.round;
  P.innerHTML = '';
  const score = `<span class="score">First try <b>${S.score.right}</b> / ${S.score.total}</span>`;
  const head = (t, sub) => { const d = document.createElement('div'); d.innerHTML = `<div class="ph"><h2>${t}</h2>${score}</div>${sub ? `<p class="sub">${sub}</p>` : ''}`; P.append(d); };
  const actions = btns => { const d = document.createElement('div'); d.className = 'actions'; d.innerHTML = btns; P.append(d); };
  const KIND = { met: 'metabolite', enz: 'enzyme', cof: 'cofactor set' };

  if (R.type === 'none') {
    head('Nothing to quiz', 'In Quiz setup, set at least one element to <b>Quiz</b>.');
    return;
  }
  if (R.type === 'single') {
    head('Fill the blank', `Which ${KIND[R.q.kind]} goes in the orange box?`);
    P.append(qBlock(R.q, 0));
    if (R.q.status === 'right' || R.q.status === 'missed') actions('<button class="btn primary" data-act="next">Next blank</button>');
  } else if (R.type === 'total') {
    const startItem = R.start >= 0 ? S.m.items[S.m.seq[R.start]] : null;
    if (R.done) {
      head('Pathway complete', '');
      const d = document.createElement('div'); d.className = 'done';
      d.innerHTML = `<div class="big">${S.score.right} / ${S.score.total}</div><div class="sub">right on the first try</div>`;
      P.append(d);
      actions('<button class="btn primary" data-act="restart">Go again</button>');
    } else {
      const back = R.pos >= R.turn;
      const dirTxt = !startItem ? 'From the beginning — nothing given.' : S.m.p.circular ? `Going around the cycle from ${esc(startItem.name)}.` : back ? `Now working <b>backward</b> from ${esc(startItem.name)} toward the start.` : `Working <b>forward</b> from ${esc(startItem.name)}.`;
      head(`Full recall · ${R.pos + 1} of ${R.order.length}`, `${dirTxt} Next: the ${KIND[R.q.kind]}.`);
      P.append(qBlock(R.q, 0));
      if (R.q.status === 'missed') actions('<button class="btn primary" data-act="continue">Continue</button>');
      actions('<button class="btn ghost" data-act="restart">Restart</button>');
    }
  } else {
    if (R.type === 'stepE') head('Enzyme → reaction', el('path') === 'show' ? `From <b>${esc(R.m.p.name)}</b>.` : 'What does this enzyme do?');
    else head('Single step', 'What sits between these two?');
    R.qs.forEach((q, i) => P.append(qBlock(q, i)));
    const done = R.qs.every(q => q.status === 'right' || q.status === 'missed');
    const open = R.qs.some(q => q.status === 'open');
    actions((done ? '<button class="btn primary" data-act="next">Next</button>' : '') +
      (open && S.set.answer !== 'self' ? '<button class="btn ghost" data-act="revealall">Reveal all</button>' : '') +
      (open && S.set.answer === 'self' ? '<button class="btn ghost" data-act="peekall">Show all</button>' : '') +
      (!done ? '<button class="btn ghost" data-act="next">Skip</button>' : ''));
  }
  const f = document.createElement('div');
  f.innerHTML = factsHTML(S.fact, R.type === 'stepE' ? R.m : S.m);
  P.append(f);
  const k = document.createElement('div'); k.className = 'keys';
  k.textContent = S.set.answer === 'choice' ? 'Keys: 1–4 pick · Enter next' : S.set.answer === 'type' ? 'Enter checks · Enter again for next' : 'Enter shows · 1 got it · 2 missed';
  P.append(k);
  const inp = $('#stage input.ans') || P.querySelector('input.ans');
  if (inp) {
    if (inp.closest('#stage') && !S.set.follow) inp.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (!matchMedia('(hover: none)').matches || inp.closest('#stage')) { inp.focus({ preventScroll: true }); inp.select(); }
  }
}

function legendHTML() {
  if (S.set.view === 'list') return `<span><b style="font-size:16px">${S.set.dir === 'h' ? '→' : '↓'}</b> one-way</span><span><b style="font-size:16px">${S.set.dir === 'h' ? '⇌' : '⇅'}</b> reversible</span><span>${icon('ok')} correct</span><span>${icon('no')} missed</span>`;
  const one = `<svg width="34" height="12" class="flow" style="width:34px">${arrow(2, 6, 32, 6, false)}</svg>`;
  const rev = `<svg width="34" height="14" class="flow" style="width:34px">${arrow(2, 7, 32, 7, true)}</svg>`;
  return `<span>${one} one-way (irreversible)</span><span>${rev} reversible</span><span>${icon('ok')} correct</span><span>${icon('no')} missed</span><span>dashed = still hidden</span>`;
}

/* ---------- quiz setup ---------- */
const seg = (key, opts, cur, attr = 'data-set') => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
  `<button ${attr}="${key}" data-v="${v}" role="radio" aria-checked="${cur === v}">${l}</button>`).join('')}</div>`;
const ELV = { show: 'Show', quiz: 'Quiz', hide: 'Hide' };
function renderSetup() {
  const s = S.set, rows = [];
  rows.push(['Mode', seg('mode', [['single', 'Single blank'], ['total', 'Full recall'], ['step', 'Single step']], s.mode)]);
  if (s.mode === 'step') rows.push(['Given', seg('given', [['mets', 'Two metabolites'], ['enz', 'The enzyme']], s.given)]);
  if (s.mode === 'step' && s.given === 'enz') rows.push(['Draw from', seg('scope', [['one', 'This pathway'], ['all', 'All pathways']], s.scope)]);
  if (s.mode === 'total' && S.m) {
    const vis = visibleSeq(), cur = vis.includes(s.start) || ['random', 'begin'].includes(s.start) ? s.start : 'random';
    rows.push(['Start', `<select id="startSel"><option value="random"${cur === 'random' ? ' selected' : ''}>Random point</option><option value="begin"${cur === 'begin' ? ' selected' : ''}>Beginning, nothing shown</option><optgroup label="Start at">${vis.map(k =>
      `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(S.m.items[k].name)}${kindOf(k) !== 'met' ? ` (${kindOf(k) === 'enz' ? 'enzyme' : 'cofactors'})` : ''}</option>`).join('')}</optgroup></select>`]);
  }
  const elRows = elSpec().map(([k, label, allowed]) => `<div class="el-row"><span class="el-name">${label}</span>${seg(k, allowed.map(v => [v, ELV[v]]), el(k), 'data-el')}</div>`).join('');
  rows.push(['Elements', `<div class="el-grid">${elRows}</div>${anyQuiz() ? '' : `<p class="hint">${icon('no')} Set at least one element to Quiz.</p>`}`]);
  rows.push(['Answer', seg('answer', [['type', 'Type'], ['choice', 'Choice'], ['self', 'Self-check']], s.answer) +
    (s.mode !== 'total' ? `<button class="chipbtn" data-flag="weak" aria-pressed="${s.weak}">Weak spots first</button>` : '')]);
  rows.push(['View', seg('view', [['flow', 'Flow'], ['list', 'List']], s.view) + (s.view === 'list' ? seg('dir', [['v', 'Top–bottom'], ['h', 'Left–right']], s.dir) : '')]);
  $('#setupBody').innerHTML = rows.map(([l, h]) => `<div class="set-row"><span class="glabel">${l}</span><div class="set-ctl">${h}</div></div>`).join('');

  const by = { quiz: [], show: [], hide: [] };
  elSpec().forEach(([k, label]) => by[el(k)].push(label.toLowerCase()));
  const sub = s.mode === 'step' ? (s.given === 'enz' ? ' (given enzyme)' : ' (given metabolites)') : '';
  $('#setupSummary').textContent = [MODE_LABEL[s.mode] + sub, by.quiz.length && 'quiz ' + by.quiz.join(', '), by.show.length && 'show ' + by.show.join(', '), by.hide.length && 'hide ' + by.hide.join(', '),
    { type: 'Type', choice: 'Choice', self: 'Self-check' }[s.answer], s.view === 'flow' ? 'Flow' : 'List'].filter(Boolean).join(' · ');
}

function render() {
  renderSetup();
  const R = S.round;
  const cq = (R.type === 'single' || R.type === 'total') && R.q;
  INLINE = cq && S.set.answer === 'type' && cq.status === 'open' ? { draft: cq.draft, bad: cq.justWrong } : null;
  if (cq) cq.inline = !!INLINE;
  const flow = S.set.view === 'flow', opts = { horiz: S.set.dir === 'h' };
  $('#summary').hidden = R.type === 'stepE' && S.set.scope === 'all';
  $('#stage').innerHTML = R.type === 'none' ? '<p class="muted">Nothing to show.</p>'
    : R.type === 'step' ? (flow ? stepFlow() : stepList())
    : R.type === 'stepE' ? (flow ? stepEFlow() : stepEList())
    : (flow ? flowSVG(S.m, statusOf, opts) : listHTML(S.m, statusOf, opts));
  $('#legend').innerHTML = legendHTML();
  if (INLINE && cq.justWrong) $('#stage form.inl input')?.classList.add('shake');
  applyZoom();
  renderPanel();
  follow();
  for (const q of R.qs || (R.q ? [R.q] : [])) q.justWrong = false;
}

/* ---------- zoom (the diagram only, not the UI) ---------- */
// 'width' = fit the card's width (never above natural size), 'fit' = whole diagram on screen, number = scale.
// The diagram pane is a fixed-height frame (CSS --frame-h) that scrolls on its own.
function fitScale() {
  const svg = $('#stage svg.flow'), frame = $('#stage');
  if (!svg) return 1;
  const vb = svg.viewBox.baseVal, availW = frame.clientWidth - 8;
  const availH = parseFloat(getComputedStyle(frame).maxHeight) - 8 || window.innerHeight * 0.75;
  return Math.max(0.15, Math.min(availW / vb.width, availH / vb.height, 1.5));
}
// Follow: keep the current blank in the middle of the frame as you progress.
function follow() {
  if (!S.set.follow) return;
  const frame = $('#stage'), t = $('#stage form.inl, #stage .target, #stage .chip.target, #stage .ename.target');
  if (!t) return;
  const fr = frame.getBoundingClientRect(), tr = t.getBoundingClientRect();
  frame.scrollTo({
    left: frame.scrollLeft + (tr.left + tr.width / 2) - (fr.left + fr.width / 2),
    top: frame.scrollTop + (tr.top + tr.height / 2) - (fr.top + fr.height / 2),
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}
function applyZoom() {
  const z = S.set.zoom, svg = $('#stage svg.flow'), list = $('#stage .list');
  let pct = 1;
  if (svg) {
    const vb = svg.viewBox.baseVal;
    if (z === 'width') { svg.style.width = '100%'; svg.style.maxWidth = vb.width + 'px'; pct = Math.min(1, ($('#stage').clientWidth - 4) / vb.width); }
    else { const k = z === 'fit' ? fitScale() : z; svg.style.maxWidth = 'none'; svg.style.width = vb.width * k + 'px'; pct = k; }
  } else if (list) { pct = typeof z === 'number' ? z : 1; list.style.zoom = pct; }
  $('#zoomPct').textContent = Math.round(pct * 100) + '%';
  $$('[data-zoom]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.zoom === String(z))));
  $('[data-flag="follow"]').setAttribute('aria-pressed', String(!!S.set.follow));
}
function zoomBy(d) {
  const svg = $('#stage svg.flow');
  const cur = typeof S.set.zoom === 'number' ? S.set.zoom : S.set.zoom === 'fit' ? fitScale() : svg ? Math.min(1, ($('#stage').clientWidth - 4) / svg.viewBox.baseVal.width) : 1;
  S.set.zoom = Math.round(Math.min(2.5, Math.max(0.3, cur + d)) * 10) / 10;
  saveSettings(); applyZoom();
}
window.addEventListener('resize', () => { if (S.round && typeof S.set.zoom !== 'number') applyZoom(); });

/* ---------- library select ---------- */
function renderPicker() {
  const groups = {};
  for (const p of Library.list()) (groups[p.group] = groups[p.group] || []).push(p);
  $('#pathway').innerHTML = Object.entries(groups).map(([g, ps]) => `<optgroup label="${esc(g)}">${ps.map(p =>
    `<option value="${esc(p.id)}">${esc(p.name)}${p.status === 'edited' ? ' (edited)' : p.status === 'custom' ? ' (yours)' : ''}</option>`).join('')}</optgroup>`).join('');
  if (S.m) $('#pathway').value = S.m.p.id;
  $('#saveMode').textContent = Store.mode === 'server' ? 'Saved on server' : 'Saved in this browser';
  $('#saveMode').title = Store.mode === 'server'
    ? 'Your edits and history are stored on the Pathways server, so every device sees them.'
    : 'Your edits and history live in this browser only. Use Edit → Export to back up or share a pathway.';
}
function loadPathway(id) {
  const p = Library.get(id) || Library.get(Library.list()[0].id);
  S.set.pathway = p.id; saveSettings();
  S.m = modelFor(p);
  $('#summary').textContent = p.summary || '';
  document.title = p.name + ' · Pathways';
  $('#pathway').value = p.id;
  newRound();
}

/* ---------- events ---------- */
const RESTART = new Set(['mode', 'given', 'scope', 'answer']);
document.addEventListener('click', e => {
  if (e.target.closest('#editor')) return;
  const sb = e.target.closest('[data-set]');
  if (sb) {
    const key = sb.dataset.set, v = sb.dataset.v;
    if (S.set[key] === v) return;
    S.set[key] = v; saveSettings();
    RESTART.has(key) ? newRound() : render();
    return;
  }
  const eb = e.target.closest('[data-el]');
  if (eb) { S.set.el[eb.dataset.el] = eb.dataset.v; saveSettings(); newRound(); return; }
  const fl = e.target.closest('[data-flag]');
  if (fl) {
    const k = fl.dataset.flag;
    S.set[k] = !S.set[k]; saveSettings();
    if (k === 'follow') { applyZoom(); follow(); } else newRound();
    return;
  }
  const zb = e.target.closest('[data-zoom]');
  if (zb) { const v = zb.dataset.zoom; if (v === 'in') zoomBy(0.1); else if (v === 'out') zoomBy(-0.1); else { S.set.zoom = v; saveSettings(); applyZoom(); } follow(); return; }
  const top = e.target.closest('[data-top]');
  if (top) {
    if (top.dataset.top === 'stats') openStats();
    if (top.dataset.top === 'edit') openEditor(S.m.p.id);
    if (top.dataset.top === 'new') openEditor(null);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const R = S.round, qs = R.qs || [R.q];
  const q = qs[+b.dataset.q || 0];
  switch (b.dataset.act) {
    case 'pick': submit(q, b.dataset.v); break;
    case 'checkinline': { const i = $('#stage form.inl input'); if (i) submit(q, i.value); break; }
    case 'reveal': reveal(q); break;
    case 'peek': peek(q); break;
    case 'got': selfGrade(q, true); break;
    case 'miss': selfGrade(q, false); break;
    case 'revealall': R.qs.filter(x => x.status === 'open').forEach(reveal); break;
    case 'peekall': R.qs.filter(x => x.status === 'open').forEach(x => (x.status = 'peek')); render(); break;
    case 'next': R.type === 'single' ? nextSingle() : R.type === 'stepE' ? nextStepE() : nextStep(); render(); break;
    case 'continue': advanceTotal(); break;
    case 'restart': newRound(); break;
  }
});
const formQ = f => { const R = S.round; return R.qs ? R.qs[+f.dataset.q] : R.q; };
document.addEventListener('submit', e => {
  const f = e.target.closest('#panel form[data-q], #stage form.inl');
  if (!f) return;
  e.preventDefault();
  const q = formQ(f), v = f.querySelector('input').value;
  q.draft = v;
  submit(q, v);
});
document.addEventListener('input', e => {
  const f = e.target.closest('#panel form[data-q], #stage form.inl');
  if (f) formQ(f).draft = e.target.value;
});
document.addEventListener('change', e => {
  if (e.target.id === 'startSel') { S.set.start = e.target.value; saveSettings(); newRound(); }
  if (e.target.id === 'pathway') loadPathway(e.target.value);
});
document.addEventListener('keydown', e => {
  if (!$('#editor').hidden || $('#statsDialog').open) return;
  if (['SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
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

$('#setup').addEventListener('toggle', e => { S.set.setupOpen = e.target.open; saveSettings(); });

/* ---------- boot ---------- */
(async function boot() {
  if (S.set.setupOpen === false) $('#setup').open = false;
  await Store.init();
  renderPicker();
  loadPathway(S.set.pathway || 'glycolysis');
  renderPicker();
})();
