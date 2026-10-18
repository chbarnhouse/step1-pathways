/* The quiz page (#/quiz): one focused screen per quiz.
   Occlusion modes (single blank, full recall) show the diagram full-width with a slim answer dock at the bottom —
   with Type answers you type straight into the diagram and the dock only carries feedback and Reveal.
   Step modes show the small step diagram above a grid of questions.
   Quiz config comes from Home (or a preset): {name, pathways[], mode, given, el, start, weak, answer, view}. */
'use strict';

const Q = { cfg: null, m: null, round: null, score: { right: 0, total: 0 }, fact: null, models: [] };
const KIND = { met: 'metabolite', enz: 'enzyme', trn: 'transporter', cof: 'cofactor set' };
const TRANSPORTER_DISTRACTORS = ['GLUT1', 'GLUT2', 'GLUT4', 'SGLT1', 'Carnitine–acylcarnitine translocase', 'Citrate transporter', 'Malate–α-ketoglutarate antiporter', 'ADP/ATP translocase', 'StAR protein', 'Mitochondrial pyruvate carrier'];

/* ---------- elements: show / quiz / hide ---------- */
function modeKeyOf(cfg) { return cfg.mode === 'step' ? (cfg.given === 'enz' ? 'stepE' : 'stepM') : 'occ'; }
function elSpecFor(cfg) {
  return {
    occ: [['met', 'Metabolites', ['show', 'quiz']], ['enz', 'Enzymes', ['show', 'quiz', 'hide']], ['trn', 'Transporters', ['show', 'quiz', 'hide']], ['cof', 'Cofactors', ['show', 'quiz', 'hide']], ['loc', 'Locations', ['show', 'hide']]],
    stepM: [['enz', 'Enzyme or transporter', ['show', 'quiz', 'hide']], ['cof', 'Cofactors', ['show', 'quiz', 'hide']], ['dir', 'Direction', ['show', 'quiz']], ['loc', 'Location', ['show', 'quiz', 'hide']]],
    stepE: [['met', 'Reactants & products', ['show', 'quiz']], ['cof', 'Cofactors', ['show', 'quiz', 'hide']], ['loc', 'Location', ['show', 'quiz', 'hide']], ['path', 'Pathway', ['show', 'quiz', 'hide']]],
  }[modeKeyOf(cfg)];
}
function elOf(cfg, k) {
  const spec = elSpecFor(cfg).find(x => x[0] === k);
  if (!spec) return 'hide';
  return spec[2].includes(cfg.el[k]) ? cfg.el[k] : spec[2][0];
}
const el = k => elOf(Q.cfg, k);
// Enzyme slots ('e:<reaction>') are transporters when the step moves something across a membrane.
const kindOf = (key, m = Q.m) => (key[0] === 'e' ? m?.items[key]?.kind || 'enz' : { m: 'met', c: 'cof' }[key[0]]);
const answerStyle = () => Q.cfg.answer || Store.settings.answer;
const viewStyle = () => Q.cfg.view || Store.settings.view;
function quizSummary(cfg) {
  const by = { quiz: [], show: [], hide: [] };
  elSpecFor(cfg).forEach(([k, label]) => by[elOf(cfg, k)].push(label.toLowerCase()));
  const mode = cfg.mode === 'single' ? 'Single blank' : cfg.mode === 'total' ? (cfg.start === 'begin' ? 'Full recall from the top' : 'Full recall') : cfg.given === 'enz' ? 'Single step, given the enzyme' : 'Single step, given two metabolites';
  return [mode, by.quiz.length && 'quiz ' + by.quiz.join(', '), by.hide.length && 'hide ' + by.hide.join(', ')].filter(Boolean).join(' · ');
}

/* ---------- questions ---------- */
function mcOptions(item, m) {
  const p = m.p;
  const trnIds = new Set(p.reactions.filter(r => r.transport).map(r => r.enzyme));
  const inPath = item.kind === 'met' ? Object.values(p.metabolites).map(x => x.name)
    : Object.entries(p.enzymes).filter(([id]) => trnIds.has(id) === (item.kind === 'trn')).map(([, e]) => e.name);
  const extra = item.kind === 'met' ? (p.distractors?.metabolites || []) : item.kind === 'trn' ? TRANSPORTER_DISTRACTORS : (p.distractors?.enzymes || []);
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

/* ---------- Type along: the answer is shown faintly and fills in solid as you type it ----------
   Punctuation and spaces in the answer are skipped for you; Greek letters take their Latin initial (α ← a).
   A wrong character shows as a mistake until you backspace over it; any mistake means it wasn't right first try. */
const ALONG_SEP = /[\s\-,()\/.'’+:;]/;
const foldChar = c => (foldGreek(c.toLowerCase()).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')[0] || c);
function alongState(target, typed) {
  const st = []; let i = 0, extra = 0;
  for (const c of typed) {
    while (i < target.length && ALONG_SEP.test(target[i]) && foldChar(c) !== foldChar(target[i])) st[i++] = 'skip';
    if (i >= target.length) { extra++; continue; }
    st[i] = foldChar(c) === foldChar(target[i]) ? 'ok' : 'err'; i++;
  }
  let j = i; while (j < target.length && ALONG_SEP.test(target[j])) j++;
  const errs = st.filter(x => x === 'err').length + extra;
  return { st, pos: i, errs, done: j >= target.length && !errs };
}
function alongGhost(target, typed) {
  const { st, pos } = alongState(target, typed);
  let h = '';
  [...target].forEach((c, k) => {
    if (k === pos) h += '<span class="caret" aria-hidden="true"></span>';
    h += `<span class="${k < pos ? (st[k] === 'err' ? 'a-err' : 'a-ok') : 'a-rest'}">${esc(c)}</span>`;
  });
  if (pos >= target.length) h += '<span class="caret" aria-hidden="true"></span>';
  return h;
}
function alongWidget(target, typed) {
  return `<span class="along"><span class="ghost">${alongGhost(target, typed)}</span><input class="ans along-in" data-along="${esc(target)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type: ${esc(target)}" value="${esc(typed)}"></span>`;
}
function alongTextFor(q, m, r) {
  if (q.kind === 'cof') return [...(r.cofactors?.in || []), ...(r.cofactors?.out || [])].map(id => cofName(m, id)).join(', ') || 'none';
  if (q.kind === 'mets') return metNames(m, q.side === 'r' ? reactantsOf(r) : productsOf(r));
  if (q.kind === 'path') return m.p.name;
  if (q.kind === 'loc') return r.loc;
  return q.item ? q.item.name : q.answerText;
}
function itemQ(item, m) {
  if (item.kind === 'cof') return cofQ(item.rxn, m, item);
  const acc = acceptedFor(item);
  return baseQ({
    kind: item.kind, label: { met: 'Metabolite', enz: 'Enzyme', trn: 'Transporter' }[item.kind], item, statKey: item.key, pid: m.p.id,
    answerText: item.name, correct: item.name,
    options: answerStyle() === 'choice' ? mcOptions(item, m) : null,
    check: v => v === item.name || acc.includes(norm(v)),
  });
}
function cofQ(r, m, item = null) {
  const t = cofText(m, r.cofactors || {});
  return baseQ({
    kind: 'cof', label: 'Cofactors', item, factItem: m.items['e:' + r.id], answerText: t, correct: t, statKey: 'c:' + r.id, pid: m.p.id,
    placeholder: 'e.g. ATP, ADP — or "none"',
    options: answerStyle() === 'choice' ? cofOptions(r, m) : null,
    check: v => v === t || gradeCof(m, v, r.cofactors || {}),
  });
}
function dirQ(r, top, bottom, m) {
  const nm = id => m.p.metabolites[id].short || m.p.metabolites[id].name;
  const A = nm(top), B = nm(bottom);
  const opts = [
    { v: 'down', label: `${A} → ${B}`, sub: 'one-way, top to bottom' },
    { v: 'up', label: `${B} → ${A}`, sub: 'one-way, bottom to top' },
    { v: 'rev', label: `${A} ⇌ ${B}`, sub: 'reversible' },
  ];
  const fromSide = reactantsOf(r).includes(top);
  const correct = r.reversible ? 'rev' : (fromSide ? 'down' : 'up');
  const o = opts.find(x => x.v === correct);
  return baseQ({ kind: 'dir', label: 'Direction', answerText: `${o.label} (${o.sub})`, correct, statKey: 'd:' + r.id, pid: m.p.id, dirOptions: opts, check: v => v === correct });
}
function metSetQ(r, m, side) {
  const want = side === 'r' ? reactantsOf(r) : productsOf(r), other = side === 'r' ? productsOf(r) : reactantsOf(r);
  const t = metNames(m, want);
  const pool = [...m.p.reactions.flatMap(x => [metNames(m, reactantsOf(x)), metNames(m, productsOf(x))]), ...(m.p.distractors?.metabolites || [])];
  return baseQ({
    kind: 'mets', side, label: side === 'r' ? 'Reactants' : 'Products', answerText: t + (r.reversible ? ' (reversible: either side counts)' : ''), correct: t,
    statKey: (side === 'r' ? 'r:' : 'p:') + r.id, pid: m.p.id, placeholder: 'e.g. G3P, DHAP',
    options: answerStyle() === 'choice' ? pickOthers(t, pool) : null,
    check: v => {
      if (v === t || (r.reversible && v === metNames(m, other))) return true;
      const ids = parseMets(m, v);
      return !!ids && (sameSet(ids, want) || (r.reversible && sameSet(ids, other)));
    },
  });
}
function locQ(r, m) {
  const all = uniq(Object.values(Library.all()).flatMap(p => p.reactions.map(x => x.loc)).filter(Boolean));
  return baseQ({
    kind: 'loc', label: 'Location', answerText: locLabel(m, r) || r.loc, correct: r.loc, statKey: 'l:' + r.id, pid: m.p.id,
    placeholder: 'e.g. mitochondria',
    options: answerStyle() === 'choice' ? pickOthers(r.loc, all.filter(l => canonLoc(l) !== canonLoc(r.loc))) : null,
    check: v => v === r.loc || canonLoc(v) === canonLoc(r.loc),
  });
}
function pathQ(r, m) {
  const homes = pathwaysWithEnzyme(m.items['e:' + r.id]);
  const acc = new Set(homes.flatMap(pathwayAccepted));
  const others = Library.atomic().filter(p => !homes.includes(p)).map(p => p.name);
  return baseQ({
    kind: 'path', label: 'Pathway', answerText: homes.map(p => p.name).join(' · '), correct: m.p.name, statKey: 'w:' + r.id, pid: m.p.id,
    placeholder: 'e.g. Glycolysis',
    options: answerStyle() === 'choice' ? pickOthers(m.p.name, others) : null,
    check: v => homes.some(p => p.name === v) || acc.has(norm(v)),
  });
}

/* ---------- rounds ---------- */
const eligibleIn = m => m.seq.filter(k => el(kindOf(k, m)) === 'quiz');
const visibleIn = m => m.seq.filter(k => el(kindOf(k, m)) !== 'hide');
function quizPathways() {
  if (Q.cfg.mode === 'step' && Q.cfg.given === 'enz' && Q.cfg.allPathways) return Object.keys(Library.all());
  return Q.cfg.pathways.length ? Q.cfg.pathways : [Library.list()[0].id];
}

function startQuiz(cfg) {
  Q.cfg = normalizeQuiz(cfg);
  Q.cfg.name = cfg.name || 'Quiz';
  Q.cfg.allPathways = !!cfg.allPathways;
  Q.models = quizPathways().map(id => { try { return modelFor(Library.get(id)); } catch { return null; } }).filter(Boolean);
  Q.m = Q.models[0];
  newRound();
}
function newRound() {
  Q.score = { right: 0, total: 0 };
  Q.fact = null;
  if (!elSpecFor(Q.cfg).some(([k]) => el(k) === 'quiz')) Q.round = { type: 'none' };
  else if (Q.cfg.mode === 'single') { Q.round = { type: 'single', deck: [], target: null, q: null }; nextSingle(); }
  else if (Q.cfg.mode === 'total') { Q.round = { type: 'total', queue: Q.models.slice(1) }; Q.m = Q.models[0]; startTotal(); }
  else if (Q.cfg.given === 'enz') { Q.round = { type: 'stepE', deck: [], qs: [] }; nextStepE(); }
  else { Q.round = { type: 'step', deck: [], pair: null, qs: [] }; nextStep(); }
}
function weightedDeck(list, rateOf) {
  return Q.cfg.weak
    ? list.map(x => ({ x, r: Math.pow(Math.random(), 1 / (0.15 + 4 * rateOf(x))) })).sort((a, b) => a.r - b.r).map(o => o.x)
    : shuffle(list);
}
function nextSingle() {
  const R = Q.round;
  if (!R.deck.length) {
    const all = Q.models.flatMap(m => eligibleIn(m).map(k => ({ m, k })));
    R.deck = weightedDeck(all, x => Stats.rate(x.m.p.id, x.k));
    if (R.deck.length > 1 && R.deck[R.deck.length - 1].k === R.target && R.deck[R.deck.length - 1].m === Q.m) R.deck.unshift(R.deck.pop());
  }
  const { m, k } = R.deck.pop();
  Q.m = m; R.target = k;
  R.q = withAlong(itemQ(m.items[k], m), m);
  Q.fact = null;
}
function startTotal() {
  // start: 'random', 'begin' (nothing shown, recall from the first item), or an item key.
  const m = Q.m, seq = m.seq, n = seq.length, sel = Q.cfg.start, vis = visibleIn(m);
  const start = sel === 'begin' ? -1 : vis.includes(sel) ? seq.indexOf(sel) : seq.indexOf(vis[Math.floor(Math.random() * vis.length)]);
  const inc = i => el(kindOf(seq[i], m)) === 'quiz';
  let fwd = [], back = [];
  if (start === -1) { for (let i = 0; i < n; i++) fwd.push(i); }
  else if (m.p.circular) { for (let i = 1; i < n; i++) fwd.push((start + i) % n); }
  else { for (let i = start + 1; i < n; i++) fwd.push(i); for (let i = start - 1; i >= 0; i--) back.push(i); }
  fwd = fwd.filter(inc); back = back.filter(inc);
  Object.assign(Q.round, { start, order: [...fwd, ...back], turn: fwd.length, pos: 0, st: {}, q: null, done: false });
  loadTotalQ();
}
function loadTotalQ() {
  const R = Q.round;
  if (R.pos >= R.order.length) { R.done = true; R.q = null; return; }
  R.q = withAlong(itemQ(Q.m.items[Q.m.seq[R.order[R.pos]]], Q.m), Q.m);
}
function advanceTotal() { Q.round.pos++; loadTotalQ(); renderQuiz(); }
function nextTotalPathway() { Q.m = Q.round.queue.shift(); startTotal(); Q.fact = null; }
function nextStep() {
  const R = Q.round;
  if (!R.deck.length) {
    const all = Q.models.flatMap(m => m.pairs.map(pr => ({ m, pr })));
    R.deck = weightedDeck(all, x => Math.max(...['e:', 'c:', 'd:'].map(t => Stats.rate(x.m.p.id, t + x.pr.r.id))));
  }
  const { m, pr } = R.deck.pop();
  Q.m = m;
  const flip = Math.random() < 0.5;
  const top = flip ? pr.b : pr.a, bottom = flip ? pr.a : pr.b;
  R.pair = { ...pr, top, bottom };
  R.qs = [];
  if (el('enz') === 'quiz') R.qs.push(itemQ(m.items['e:' + pr.r.id], m));
  if (el('cof') === 'quiz') R.qs.push(cofQ(pr.r, m));
  if (el('dir') === 'quiz') R.qs.push(dirQ(pr.r, top, bottom, m));
  if (el('loc') === 'quiz' && pr.r.loc) R.qs.push(locQ(pr.r, m));
  R.qs.forEach(x => withAlong(x, m, pr.r));
  Q.fact = null;
}
function nextStepE() {
  const R = Q.round;
  if (!R.deck.length) {
    const all = Q.models.flatMap(m => m.p.reactions.map(r => ({ m, r })));
    R.deck = weightedDeck(all, x => Math.max(...['r:', 'p:', 'c:', 'w:'].map(t => Stats.rate(x.m.p.id, t + x.r.id))));
  }
  const { m, r } = R.deck.pop();
  Q.m = m; R.r = r;
  R.qs = [];
  if (el('met') === 'quiz') R.qs.push(metSetQ(r, m, 'r'), metSetQ(r, m, 'p'));
  if (el('cof') === 'quiz') R.qs.push(cofQ(r, m));
  if (el('loc') === 'quiz' && r.loc) R.qs.push(locQ(r, m));
  if (el('path') === 'quiz') R.qs.push(pathQ(r, m));
  R.qs.forEach(x => withAlong(x, m, r));
  Q.fact = null;
}
function withAlong(q, m, r = q.item?.rxn) {
  if (answerStyle() === 'along' && q.kind !== 'dir') q.along = alongTextFor(q, m, r);
  return q;
}
function nextQuestion() {
  const R = Q.round;
  if (R.type === 'single') nextSingle(); else if (R.type === 'stepE') nextStepE(); else nextStep();
  renderQuiz();
}

/* ---------- grading ---------- */
function submit(q, v) {
  if (q.status !== 'open') return;
  if (!['dir', 'cof'].includes(q.kind) && !String(v).trim()) return;
  if (q.check(v)) { q.status = 'right'; q.given = v; tally(q, q.tries === 0); resolved(q); }
  else { q.tries++; q.wrong.push(v); q.draft = v; q.justWrong = true; renderQuiz(); }
}
function reveal(q) { if (q.status !== 'open') return; q.status = 'missed'; tally(q, false); resolved(q); }
function peek(q) { q.status = 'peek'; renderQuiz(); }
function selfGrade(q, ok) { q.status = ok ? 'right' : 'missed'; q.self = true; tally(q, ok); resolved(q); }
function tally(q, firstTry) { Q.score.total++; if (firstTry) Q.score.right++; Stats.record(q.pid, q.statKey, firstTry); }
function resolved(q) {
  const R = Q.round;
  Q.fact = R.type === 'stepE' ? Q.m.items['e:' + R.r.id] : q.factItem || q.item || Q.m.items['e:' + R.pair.r.id];
  if (R.type === 'total') {
    R.st[q.item.key] = q.status;
    if ((q.status === 'right' && Store.settings.autoAdvance) || q.self) {
      const pos = R.pos;
      renderQuiz();
      setTimeout(() => { if (Q.round === R && R.pos === pos && location.hash.startsWith('#/quiz')) advanceTotal(); }, q.self ? 0 : 450);
      return;
    }
  }
  renderQuiz();
}

/* ---------- diagram status ---------- */
function statusOf(key) {
  const R = Q.round, mode = el(kindOf(key));
  if (mode === 'hide') return 'hide';
  if (R.type === 'single') {
    if (key !== R.target) return 'shown';
    return R.q.status === 'open' ? 'target' : R.q.status;
  }
  if (R.type === 'total') {
    if (R.start >= 0 && key === Q.m.seq[R.start]) return 'start';
    if (mode !== 'quiz') return 'shown';
    if (R.q && R.q.item.key === key) return R.q.status === 'open' ? 'target' : R.q.status;
    return R.st[key] || 'blank';
  }
  return 'shown';
}

/* ---------- step diagrams ---------- */
const qOf = kind => Q.round.qs.find(q => q.kind === kind);
const qState = q => (q ? (q.status === 'open' ? 'target' : q.status) : 'shown');
function stepFlow() {
  const R = Q.round, m = Q.m, { items } = m, r = R.pair.r;
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
  if (el('loc') === 'show' && locLabel(m, r)) s += `<text class="zonet" x="8" y="12">${esc(locLabel(m, r))}</text>`;
  return `<svg class="flow" viewBox="0 0 470 ${y2 + BH + 16}" role="img" aria-label="Single step">${s}</svg>`;
}
function stepList() {
  const R = Q.round, m = Q.m, { items } = m, r = R.pair.r;
  const qe = qOf('enz'), qc = qOf('cof'), qd = qOf('dir');
  const horiz = Store.settings.dir === 'h', down = r.reversible || reactantsOf(r).includes(R.pair.top);
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
  const R = Q.round, m = Q.m, r = R.r, w = 380, cx = 330, y1 = TOP + 18, y2 = y1 + BH + 130;
  const qr = R.qs.find(q => q.side === 'r'), qp = R.qs.find(q => q.side === 'p'), qc = qOf('cof');
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
  if (el('loc') === 'show' && locLabel(m, r)) s += `<text class="zonet" x="8" y="12">${esc(locLabel(m, r))}</text>`;
  return `<svg class="flow" viewBox="0 0 ${cx + w / 2 + 20} ${y2 + BH + 16}" role="img" aria-label="Enzyme step">${s}</svg>`;
}
function stepEList() {
  const R = Q.round, m = Q.m, r = R.r, horiz = Store.settings.dir === 'h';
  const qr = R.qs.find(q => q.side === 'r'), qp = R.qs.find(q => q.side === 'p'), qc = qOf('cof');
  const ch = (ids, q) => chip({ name: metNames(m, ids) }, qState(q));
  const cs = qState(qc), ic = st => (st === 'right' ? icon('ok') : st === 'missed' ? icon('no') : '');
  const cof = el('cof') === 'hide' ? '' : hidden(cs) ? `<span class="ename ${cs}">?</span>` : esc(cofText(m, r.cofactors || {})) + ' ' + ic(cs);
  const arr = horiz ? (r.reversible ? '⇌' : '→') : (r.reversible ? '⇅' : '↓');
  return `<div class="list ${horiz ? 'h' : 'v'}">${ch(reactantsOf(r), qr)}
    <div class="conn"><span class="arr">${arr}</span><div class="meta"><span class="ename given">${esc(m.items['e:' + r.id].name)}</span><span class="cofs">${cof}</span></div></div>
    ${ch(productsOf(r), qp)}</div>`;
}

/* ---------- answer widgets ---------- */
const labelFor = (q, v) => (q.kind === 'dir' ? q.dirOptions.find(o => o.v === v)?.label || v : v);
function answerHTML(q, idx, compact) {
  const style = answerStyle();
  const optsFor = q.kind === 'dir' ? q.dirOptions : q.options ? q.options.map(o => ({ v: o, label: o })) : null;
  if (q.status === 'right' || q.status === 'missed') {
    const was = q.status === 'right' && q.tries ? `<span class="was">after ${q.tries} miss${q.tries > 1 ? 'es' : ''}</span>`
      : q.status === 'missed' && q.wrong.length ? `<span class="was">you tried ${esc(q.wrong.map(w => labelFor(q, w)).join(', '))}</span>` : '';
    return `<div class="result ${q.status}">${icon(q.status === 'right' ? 'ok' : 'no')}<span><b>${esc(q.answerText)}</b>${was}</span></div>`;
  }
  if (q.status === 'peek') return `<div class="result"><span><b>${esc(q.answerText)}</b></span></div>
    <div class="btnrow"><button class="btn good" data-act="got" data-q="${idx}">${icon('ok')} Got it <kbd>1</kbd></button><button class="btn" data-act="miss" data-q="${idx}">${icon('no')} Missed <kbd>2</kbd></button></div>`;
  if (style === 'self') return `<button class="btn primary" data-act="peek" data-q="${idx}">${mi('visibility')} Show answer</button>`;
  if (q.inline && q.along) return `<div class="hint-line">Type what you see in the highlighted box${q.alongErrs ? ` <span class="bad-note">${q.alongErrs} slip${q.alongErrs > 1 ? 's' : ''}</span>` : ''}</div>`;
  if (q.along) return `<form class="ansform" data-q="${idx}">${alongWidget(q.along, q.draft)}</form>`;
  if (q.inline) return `<div class="hint-line">${q.justWrong ? `<span class="bad-note">${icon('no')} Not quite. Try again or reveal.</span>` : `Type in the highlighted box ${mi('keyboard_return', 'sm')} to check`}</div>`;
  if (optsFor) return `<div class="opts${compact ? ' row' : ''}">${optsFor.map((o, i) => {
    const bad = q.wrong.includes(o.v);
    return `<button class="opt${bad ? ' wrong' : ''}" data-act="pick" data-q="${idx}" data-v="${esc(o.v)}" ${bad ? 'disabled' : ''}><kbd>${i + 1}</kbd><span>${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${bad ? icon('no') : ''}</button>`;
  }).join('')}</div>`;
  return `<form class="ansform" data-q="${idx}"><input class="ans${q.justWrong ? ' bad' : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(q.placeholder || 'Type the name')}" value="${esc(q.draft)}" aria-label="${q.label}"><button class="btn">Check</button></form>
    ${q.justWrong ? `<div class="bad-note">${icon('no')} Not quite. Try again or reveal.</div>` : ''}`;
}
function factsHTML(item, m) {
  if (!item || !Store.settings.facts) return '';
  let tags = '', extra = '';
  if (item.kind === 'enz') {
    const r = item.rxn;
    tags = [r.only ? r.only + ' only' : '', r.transport ? 'transport' : '', r.reversible ? 'reversible' : 'irreversible', ...(r.tags || []).filter(t => t !== 'irreversible'), r.tissue || m.p.tissue, r.loc].filter(Boolean).join(' · ');
    extra = `<p class="rx">${esc(metNames(m, reactantsOf(r)))} ${r.reversible ? '⇌' : '→'} ${esc(metNames(m, productsOf(r)))}</p><p>Cofactors: ${esc(cofText(m, r.cofactors || {}))}${(r.requires || []).length ? ` · Requires ${esc(r.requires.join(', '))}` : ''}</p>`;
    if (Q.round.type === 'stepE') extra += `<p>Pathway: ${esc(pathwaysWithEnzyme(item).map(p => p.name).join(' · '))}</p>`;
  }
  if (item.kind === 'trn') {
    const r = item.rxn;
    tags = ['transport', r.reversible ? 'both directions' : 'one direction', r.tissue || m.p.tissue, r.loc].filter(Boolean).join(' · ');
    extra = `<p class="rx">${esc(metNames(m, reactantsOf(r)))} ${r.reversible ? '⇌' : '→'} ${esc(metNames(m, productsOf(r)))}</p>`;
  }
  return `<div class="facts">${mi('lightbulb', 'facts-ic')}<div><h3>${esc(item.name)}${item.short && item.short !== item.name ? ` <span class="muted">(${esc(item.short)})</span>` : ''}</h3>${tags ? `<div class="tags">${esc(tags)}</div>` : ''}${extra}${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</div></div>`;
}

/* ---------- page ---------- */
function zoomBarHTML() {
  return `<div class="zoombar" role="group" aria-label="Diagram zoom">
    <button class="iconbtn" data-zoom="out" title="Zoom out" aria-label="Zoom out">${mi('zoom_out')}</button>
    <span class="zpct" id="zoomPct">100%</span>
    <button class="iconbtn" data-zoom="in" title="Zoom in" aria-label="Zoom in">${mi('zoom_in')}</button>
    <button class="iconbtn" data-zoom="width" title="Fit width" aria-label="Fit width">${mi('fit_width')}</button>
    <button class="iconbtn" data-zoom="fit" title="Fit to frame" aria-label="Fit to frame">${mi('fit_screen')}</button>
    <button class="iconbtn" data-flag="follow" title="Follow the current blank" aria-label="Follow the current blank">${mi('center_focus_strong')}</button>
  </div>`;
}
function optionsHTML() {
  const s = Store.settings, ans = answerStyle(), view = viewStyle();
  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button data-qopt="${key}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  return `<details class="qopts"><summary class="iconbtn" title="Options" aria-label="Options">${mi('tune')}</summary>
    <div class="pop">
      <label>Answer</label>${seg('answer', [['type', 'Type'], ['along', 'Type along'], ['choice', 'Choice'], ['self', 'Self-check']], ans)}
      <label>View</label>${seg('view', [['flow', 'Flow'], ['list', 'List']], view)}
      ${view === 'list' ? `<label>List</label>${seg('dir', [['v', 'Top–bottom'], ['h', 'Left–right']], s.dir)}` : ''}
      <label class="cb"><input type="checkbox" data-qflag="facts" ${s.facts ? 'checked' : ''}> Facts after each answer</label>
      ${Q.cfg.mode === 'total' ? `<label class="cb"><input type="checkbox" data-qflag="autoAdvance" ${s.autoAdvance ? 'checked' : ''}> Move on after a right answer</label>` : ''}
      ${Q.cfg.mode !== 'total' ? `<label class="cb"><input type="checkbox" data-qflag="weak" ${Q.cfg.weak ? 'checked' : ''}> Weak spots first</label>` : ''}
    </div></details>`;
}

function renderQuiz() {
  const V = $('#view');
  if (!Q.cfg) { location.hash = '#/'; return; }
  const R = Q.round;
  const occ = R.type === 'single' || R.type === 'total';
  const cq = occ && R.q;
  INLINE = cq && ['type', 'along'].includes(answerStyle()) && cq.status === 'open' ? { draft: cq.draft, bad: cq.justWrong, along: cq.along } : null;
  if (cq) cq.inline = !!INLINE;
  const flow = viewStyle() === 'flow', horiz = Store.settings.dir === 'h';
  const sub = R.type === 'stepE' && el('path') !== 'show' && Q.models.length > 1 ? `${Q.models.length} pathways` : esc(Q.m.p.name) + (Q.models.length > 1 && R.type !== 'stepE' ? ` <span class="muted">· ${Q.models.length} in this quiz</span>` : '');
  const progress = R.type === 'total' && !R.done ? `<span class="prog">${R.pos + 1} / ${R.order.length}</span>` : '';

  let stage = '', dock = '', below = '';
  if (R.type === 'none') {
    stage = `<div class="empty">${mi('tune')}<p>Nothing is set to <b>Quiz</b>. Go back and pick at least one element to quiz.</p><a class="btn primary" href="#/">Back to setup</a></div>`;
  } else if (occ) {
    const zones = el('loc') !== 'hide';
    stage = flow ? flowSVG(Q.m, statusOf, { zones }) : listHTML(Q.m, statusOf, { horiz, zones });
    dock = occDock();
  } else {
    stage = R.type === 'step' ? (flow ? stepFlow() : stepList()) : (flow ? stepEFlow() : stepEList());
    below = stepPanel();
  }
  V.innerHTML = `<div class="quiz ${occ ? 'occ' : 'steps'}">
    <header class="qbar">
      <a class="iconbtn" href="#/" title="Back to home" aria-label="Back to home">${mi('arrow_back')}</a>
      <div class="qtitle"><div class="qname">${esc(Q.cfg.name)}</div><div class="qsub">${sub}</div></div>
      ${progress}
      <span class="qscore" title="Right on the first try">${mi('check', 'sm')} ${Q.score.right}<span class="muted"> / ${Q.score.total}</span></span>
      <div class="qtools">${R.type !== 'none' && flow ? zoomBarHTML() : ''}${optionsHTML()}</div>
    </header>
    <div class="stage" id="stage">${stage}</div>
    ${below}${dock}
  </div>`;
  if (INLINE && cq.justWrong) $('#stage form.inl input')?.classList.add('shake');
  applyZoom();
  followTarget();
  const inp = $('#stage input.ans') || $('#view .ansform input');
  if (inp && (!matchMedia('(hover: none)').matches || inp.closest('#stage'))) { inp.focus({ preventScroll: true }); inp.select(); }
  for (const q of R.qs || (R.q ? [R.q] : [])) q.justWrong = false;
}
function occDock() {
  const R = Q.round, q = R.q;
  if (R.type === 'total' && R.done) {
    const more = R.queue.length;
    return `<div class="dock done-dock"><div class="dock-row">
      <div class="dock-text"><div class="big">${Q.score.right} / ${Q.score.total}</div><div class="muted">right on the first try in ${esc(Q.m.p.name)}</div></div>
      <div class="dock-actions">${more ? `<button class="btn primary" data-act="nextpath">${mi('skip_next')} Next: ${esc(R.queue[0].p.name)}</button>` : ''}
        <button class="btn${more ? '' : ' primary'}" data-act="restart">${mi('restart_alt')} Go again</button><a class="btn ghost" href="#/">Done</a></div>
    </div></div>`;
  }
  const open = q.status === 'open' || q.status === 'peek';
  let where = '';
  if (R.type === 'total') {
    const s = R.start >= 0 ? Q.m.items[Q.m.seq[R.start]] : null;
    where = !s ? 'from the beginning' : Q.m.p.circular ? `around the cycle from ${esc(s.name)}` : R.pos >= R.turn ? `backward from ${esc(s.name)}` : `forward from ${esc(s.name)}`;
  }
  const next = R.type === 'single'
    ? (open ? '' : `<button class="btn primary" data-act="next">Next ${mi('skip_next', 'sm')} <kbd>↵</kbd></button>`)
    : (q.status === 'missed' || (q.status === 'right' && !Store.settings.autoAdvance) ? `<button class="btn primary" data-act="continue">Continue <kbd>↵</kbd></button>` : '');
  return `<div class="dock"><div class="dock-row">
    <div class="dock-text"><span class="kind kind-${q.kind}">${KIND[q.kind]}</span>${where ? `<span class="muted"> ${where}</span>` : ''}</div>
    <div class="dock-answer">${answerHTML(q, 0, true)}</div>
    <div class="dock-actions">${open && answerStyle() !== 'self' ? `<button class="btn ghost" data-act="reveal">${mi('visibility', 'sm')} Reveal</button>` : ''}
      ${R.type === 'single' && open ? `<button class="btn ghost" data-act="skip">Skip</button>` : ''}${next}</div>
  </div>${q.status === 'right' || q.status === 'missed' ? factsHTML(Q.fact, Q.m) : ''}</div>`;
}
function stepPanel() {
  const R = Q.round;
  const done = R.qs.every(q => q.status === 'right' || q.status === 'missed');
  const open = R.qs.some(q => q.status === 'open');
  const style = answerStyle();
  const head = R.type === 'stepE'
    ? (el('path') === 'show' ? `From <b>${esc(Q.m.p.name)}</b>. What does this enzyme do?` : 'What does this enzyme do?')
    : 'What connects these two?';
  return `<section class="qgrid-wrap">
    <p class="qhead">${head}</p>
    <div class="qgrid">${R.qs.map((q, i) => `<div class="qcard ${q.status}"><div class="q-label">${q.label}</div>${answerHTML(q, i, false)}${q.status === 'open' && style !== 'self' ? `<button class="linkbtn" data-act="reveal" data-q="${i}">Reveal</button>` : ''}</div>`).join('')}</div>
    <div class="btnrow">${done ? `<button class="btn primary" data-act="next">Next ${mi('skip_next', 'sm')} <kbd>↵</kbd></button>` : ''}
      ${open && style !== 'self' ? '<button class="btn ghost" data-act="revealall">Reveal all</button>' : ''}
      ${open && style === 'self' ? '<button class="btn ghost" data-act="peekall">Show all</button>' : ''}
      ${!done ? '<button class="btn ghost" data-act="next">Skip</button>' : ''}</div>
    ${done ? factsHTML(Q.fact, Q.m) : ''}
  </section>`;
}

/* ---------- zoom + follow (the diagram only, never the rest of the UI) ---------- */
// zoom: 'width' = fit the frame's width (never above natural size), 'fit' = whole diagram in the frame, number = scale.
function fitScale(svg, frame) {
  const vb = svg.viewBox.baseVal;
  const availH = (parseFloat(getComputedStyle(frame).maxHeight) || window.innerHeight * 0.7) - 8;
  return Math.max(0.15, Math.min((frame.clientWidth - 8) / vb.width, availH / vb.height, 1.6));
}
function applyZoom(scope = document) {
  const frame = scope.querySelector('.stage'), svg = frame && frame.querySelector('svg.flow'), list = frame && frame.querySelector('.list');
  const z = Store.settings.zoom;
  let pct = 1;
  if (svg) {
    const vb = svg.viewBox.baseVal;
    if (z === 'width') { svg.style.width = '100%'; svg.style.maxWidth = vb.width + 'px'; pct = Math.min(1, (frame.clientWidth - 8) / vb.width); }
    else { const k = z === 'fit' ? fitScale(svg, frame) : z; svg.style.maxWidth = 'none'; svg.style.width = vb.width * k + 'px'; pct = k; }
  } else if (list) { pct = typeof z === 'number' ? z : 1; list.style.zoom = pct; }
  const zp = scope.querySelector('#zoomPct'); if (zp) zp.textContent = Math.round(pct * 100) + '%';
  scope.querySelectorAll('[data-zoom]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.zoom === String(z))));
  scope.querySelectorAll('[data-flag="follow"]').forEach(b => b.setAttribute('aria-pressed', String(!!Store.settings.follow)));
}
function zoomBy(d) {
  const frame = $('.stage'), svg = frame && frame.querySelector('svg.flow');
  const z = Store.settings.zoom;
  const cur = typeof z === 'number' ? z : svg ? (z === 'fit' ? fitScale(svg, frame) : Math.min(1, (frame.clientWidth - 8) / svg.viewBox.baseVal.width)) : 1;
  Store.settings.zoom = Math.round(Math.min(2.5, Math.max(0.3, cur + d)) * 10) / 10;
  Store.save(); applyZoom();
}
function followTarget() {
  if (!Store.settings.follow) return;
  const frame = $('.stage'), t = frame && frame.querySelector('form.inl, .target, .chip.target, .ename.target');
  if (!t) return;
  const fr = frame.getBoundingClientRect(), tr = t.getBoundingClientRect();
  frame.scrollTo({
    left: frame.scrollLeft + (tr.left + tr.width / 2) - (fr.left + fr.width / 2),
    top: frame.scrollTop + (tr.top + tr.height / 2) - (fr.top + fr.height / 2),
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}
window.addEventListener('resize', () => { if ($('.stage') && typeof Store.settings.zoom !== 'number') applyZoom(); });

/* ---------- events ---------- */
const inQuiz = () => !!$('#view .quiz');
document.addEventListener('click', e => {
  const zb = e.target.closest('[data-zoom]');
  if (zb) {
    const v = zb.dataset.zoom;
    if (v === 'in') zoomBy(0.1); else if (v === 'out') zoomBy(-0.1); else { Store.settings.zoom = v; Store.save(); applyZoom(); }
    followTarget(); return;
  }
  if (e.target.closest('[data-flag="follow"]')) { Store.settings.follow = !Store.settings.follow; Store.save(); applyZoom(); followTarget(); return; }
  if (!inQuiz()) return;
  const qo = e.target.closest('[data-qopt]');
  if (qo) {
    const k = qo.dataset.qopt, v = qo.dataset.v;
    if (k === 'dir') { Store.settings.dir = v; Store.save(); renderQuiz(); }
    else { Q.cfg[k] = v; if (k === 'answer') newRound(); renderQuiz(); }
    $('.qopts') && ($('.qopts').open = true);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const R = Q.round, qs = R.qs || [R.q];
  const q = qs[+b.dataset.q || 0];
  switch (b.dataset.act) {
    case 'pick': submit(q, b.dataset.v); break;
    case 'reveal': reveal(q); break;
    case 'peek': peek(q); break;
    case 'got': selfGrade(q, true); break;
    case 'miss': selfGrade(q, false); break;
    case 'revealall': R.qs.filter(x => x.status === 'open').forEach(reveal); break;
    case 'peekall': R.qs.filter(x => x.status === 'open').forEach(x => (x.status = 'peek')); renderQuiz(); break;
    case 'next': case 'skip': nextQuestion(); break;
    case 'continue': advanceTotal(); break;
    case 'nextpath': nextTotalPathway(); renderQuiz(); break;
    case 'restart': Q.round.queue = Q.models.slice(1); Q.m = Q.models[0]; Q.score = { right: 0, total: 0 }; startTotal(); renderQuiz(); break;
  }
});
document.addEventListener('change', e => {
  if (!inQuiz()) return;
  const f = e.target.dataset.qflag;
  if (!f) return;
  if (f === 'weak') { Q.cfg.weak = e.target.checked; newRound(); } else { Store.settings[f] = e.target.checked; Store.save(); }
  renderQuiz();
  $('.qopts') && ($('.qopts').open = true);
});
const formQ = f => { const R = Q.round; return R.qs ? R.qs[+f.dataset.q] : R.q; };
document.addEventListener('submit', e => {
  const f = e.target.closest('#view .quiz form.ansform, #view .quiz form.inl');
  if (!f) return;
  e.preventDefault();
  const q = formQ(f), v = f.querySelector('input').value;
  q.draft = v;
  submit(q, v);
});
document.addEventListener('input', e => {
  const f = e.target.closest('#view .quiz form.ansform, #view .quiz form.inl');
  if (!f) return;
  const q = formQ(f), v = e.target.value;
  const grew = v.length > q.draft.length;
  q.draft = v;
  if (!q.along || q.status !== 'open') return;
  const s = alongState(q.along, v);
  if (grew && s.errs > (q.lastErrs || 0)) { q.alongErrs = (q.alongErrs || 0) + 1; e.target.closest('.along').classList.remove('shake'); void e.target.offsetWidth; e.target.closest('.along').classList.add('shake'); }
  q.lastErrs = s.errs;
  f.querySelector('.ghost').innerHTML = alongGhost(q.along, v);
  if (s.done) { if (q.alongErrs) q.tries = 1; submit(q, q.check(q.correct) ? q.correct : q.along); }
});
document.addEventListener('keydown', e => {
  if (!inQuiz() || document.querySelector('dialog[open]')) return;
  if (['SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const inInput = e.target.tagName === 'INPUT';
  const V = $('#view');
  if (e.key === 'Escape' && inInput && Q.round.q) { reveal(Q.round.q); return; }
  if (e.key === 'Enter' && !inInput) {
    const btn = V.querySelector('[data-act="next"].primary,[data-act="continue"],[data-act="nextpath"],[data-act="peek"],[data-act="got"]');
    if (btn) { e.preventDefault(); btn.click(); }
    return;
  }
  if (!inInput && /^[1-4]$/.test(e.key)) {
    if (answerStyle() === 'self') { const btn = V.querySelector(e.key === '1' ? '[data-act="got"]' : e.key === '2' ? '[data-act="miss"]' : '_'); if (btn) btn.click(); return; }
    const opts = V.querySelector('.opts');
    const btn = opts && opts.querySelectorAll('button')[+e.key - 1];
    if (btn && !btn.disabled) btn.click();
  }
});
