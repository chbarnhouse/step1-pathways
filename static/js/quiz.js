/* The quiz page (#/quiz): one focused screen per quiz.
   Occlusion modes (single blank, full recall) show the diagram full-width with a slim answer dock at the bottom —
   with Type answers you type straight into the diagram and the dock only carries feedback and Reveal.
   Step modes show the small step diagram above a grid of questions.
   Quiz config comes from Home (or a preset): {name, pathways[], mode, given, el, start, weak, answer, view}. */
'use strict';

const Q = { cfg: null, m: null, round: null, score: { right: 0, total: 0 }, fact: null, models: [] };
const KIND = { met: 'metabolite', enz: 'enzyme', trn: 'transporter', cof: 'cofactor set', loc: 'compartment' };
const TRANSPORTER_DISTRACTORS = ['GLUT1', 'GLUT2', 'GLUT4', 'SGLT1', 'Carnitine–acylcarnitine translocase', 'Citrate transporter', 'Malate–α-ketoglutarate antiporter', 'ADP/ATP translocase', 'StAR protein', 'Mitochondrial pyruvate carrier'];

/* ---------- elements: show / quiz / hide ---------- */
function modeKeyOf(cfg) { return cfg.mode === 'step' ? (cfg.given === 'enz' ? 'stepE' : 'stepM') : 'occ'; }
function elSpecFor(cfg) {
  return {
    occ: [['met', 'Metabolites', ['show', 'quiz']], ['enz', 'Enzymes', ['show', 'quiz', 'hide']], ['trn', 'Transporters', ['show', 'quiz', 'hide']], ['cof', 'Cofactors', ['show', 'quiz', 'hide']], ['loc', 'Compartments', ['show', 'quiz', 'hide']]],
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
const kindOf = (key, m = Q.m) => (key[0] === 'e' ? m?.items[key]?.kind || 'enz' : { m: 'met', c: 'cof', z: 'loc' }[key[0]]);
// Building blocks is typed only (typing or typing along).
const answerStyle = () => { const a = Q.cfg.answer || Store.settings.answer; return Q.cfg.mode === 'build' && !['type', 'along'].includes(a) ? 'type' : a; };
const viewStyle = () => Q.cfg.view || Store.settings.view;
function quizSummary(cfg) {
  const by = { quiz: [], show: [], hide: [] };
  elSpecFor(cfg).forEach(([k, label]) => by[elOf(cfg, k)].push(label.toLowerCase()));
  const mode = cfg.mode === 'build' ? 'Building blocks' : cfg.mode === 'single' ? 'Fill the blanks' : cfg.mode === 'total' ? (cfg.start === 'begin' ? 'Full recall from the top' : 'Full recall') : cfg.given === 'enz' ? 'Single step, given the enzyme' : 'Single step, given two metabolites';
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
function alongGhost(target, typed, hinted = 0) {
  const { st, pos } = alongState(target, typed);
  let h = '';
  [...target].forEach((c, k) => {
    if (k === pos) h += '<span class="caret" aria-hidden="true"></span>';
    h += `<span class="${k < pos ? (k < hinted ? 'a-hint' : st[k] === 'err' ? 'a-err' : 'a-ok') : 'a-rest'}">${esc(c)}</span>`;
  });
  if (pos >= target.length) h += '<span class="caret" aria-hidden="true"></span>';
  return h;
}
function alongWidget(target, typed, hinted = 0) {
  return `<span class="along"><span class="ghost">${alongGhost(target, typed, hinted)}</span><input class="ans along-in" data-along="${esc(target)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type: ${esc(target)}" value="${esc(typed)}"></span>`;
}
function alongTextFor(q, m, r) {
  if (q.kind === 'cof') return [...(r.cofactors?.in || []), ...(r.cofactors?.out || [])].map(id => cofName(m, id)).join(', ') || 'none';
  if (q.kind === 'mets') return metNames(m, q.side === 'r' ? reactantsOf(r) : productsOf(r));
  if (q.kind === 'path') return m.p.name;
  if (q.kind === 'loc') return q.item ? q.item.name : r.loc;
  return q.item ? q.item.name : q.answerText;
}
function itemQ(item, m) {
  if (item.kind === 'cof') return cofQ(item.rxn, m, item);
  if (item.kind === 'loc') {
    const all = uniq(Library.atomic().flatMap(p => p.reactions.map(r => r.loc)).filter(Boolean)).filter(l => canonLoc(l) !== item.canon);
    return baseQ({ kind: 'loc', label: 'Compartment', item, statKey: item.key, pid: m.p.id, answerText: item.name, correct: item.name, placeholder: 'e.g. mitochondria',
      options: answerStyle() === 'choice' ? pickOthers(item.name, uniq(all.map(l => l[0].toUpperCase() + l.slice(1)))) : null,
      check: v => v === item.name || canonLoc(v) === item.canon || item.aliases.some(a => norm(a) === norm(v)) });
  }
  return baseQ({
    kind: item.kind, label: { met: 'Metabolite', enz: 'Enzyme', trn: 'Transporter' }[item.kind], item, statKey: item.key, pid: m.p.id,
    answerText: item.name, correct: item.name,
    options: answerStyle() === 'choice' ? mcOptions(item, m) : null,
    check: v => v === item.name || acceptedFor(item, m, !!Q.cfg.fullNames).includes(norm(v)), // reads “Require full names” live
  });
}
function cofQ(r, m, item = null) {
  const t = cofText(m, r.cofactors || {});
  return baseQ({
    kind: 'cof', label: 'Cofactors', item, factItem: m.items['e:' + r.id], answerText: t, correct: t, statKey: 'c:' + r.id, pid: m.p.id, cofs: r.cofactors || {}, model: m,
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
  Q.history = []; Q.fact = null; Q.drawer = false; Q.focus = null;
  // Activity log entry: written on the first answer, updated as you go (sessions with no answers aren't logged).
  Q.log = { id: Date.now().toString(36), t: Date.now(), last: Date.now(), pathways: Q.models.map(m => m.p.id), name: Q.cfg.name,
    mode: Q.cfg.mode, given: Q.cfg.given, answer: answerStyle(), right: 0, total: 0, done: false };
  Q.m = Q.models[0];
  newRound();
}
function newRound() {
  Q.score = { right: 0, total: 0 };
  Q.fact = null;
  if (!elSpecFor(Q.cfg).some(([k]) => el(k) === 'quiz')) Q.round = { type: 'none' };
  else if (Q.cfg.mode === 'single') { Q.round = { type: 'single', deck: [], target: null, q: null }; nextSingle(); }
  else if (Q.cfg.mode === 'total') { Q.round = { type: 'total', queue: Q.models.slice(1) }; Q.m = Q.models[0]; startTotal(); }
  else if (Q.cfg.mode === 'build') startBuild();
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
  if (R.pos >= R.order.length) { R.done = true; R.q = null; if (!R.queue?.length) logAnswer(true); return; }
  R.q = withAlong(itemQ(Q.m.items[Q.m.seq[R.order[R.pos]]], Q.m), Q.m);
}
/* ---------- Building blocks ----------
   Round k: the first k blanks (in reading order) from the top; the ones after them are shown, or empty
   boxes when "Later blanks: Hide them" is set (cfg.ahead).
   A blank only counts when its answer is typed cleanly — a wrong answer, a hint or a reveal clears just that blank. */
function startBuild() {
  Q.m = Q.models[0];
  const order = Q.m.seq.map((k, i) => i).filter(i => el(kindOf(Q.m.seq[i])) === 'quiz');
  Q.round = { type: 'build', order, k: 1, pos: 0, done: !order.length, intro: new Set() };
  loadBuildQ();
}
function loadBuildQ() {
  const R = Q.round;
  if (R.done) { R.q = null; return; }
  R.q = withAlong(itemQ(Q.m.items[Q.m.seq[R.order[R.pos]]], Q.m), Q.m);
}
function buildResolved(q) {
  const R = Q.round;
  const clean = q.status === 'right' && !q.hints && !q.tries;
  const key = q.item.key, first = !R.intro.has(key);
  if (first && (clean || q.status === 'right')) { R.intro.add(key); Stats.record(q.pid, q.statKey, clean); Q.score.total++; if (clean) Q.score.right++; logAnswer(); }
  Q.fact = factItemOf(q.item, Q.m); Q.factM = Q.m;
  Q.history = (Q.history || []).filter(h => h.item !== Q.fact); Q.history.unshift({ item: Q.fact, m: Q.m, status: clean ? 'right' : 'missed' });
  if (!clean) {
    // Typed with help: wipe this blank and ask for it again, unaided.
    R.q = withAlong(itemQ(q.item, Q.m), Q.m);
    R.q.note = q.hints ? 'You used a hint. Now type it on your own.' : 'Now type it without a slip.';
    return renderQuiz();
  }
  R.pos++;
  if (R.pos >= R.k) {
    R.k++; R.pos = 0;
    if (R.k > R.order.length) { R.done = true; R.q = null; logAnswer(true); return renderQuiz(); }
    R.roundMsg = `Round ${R.k}: from the top, one more blank.`;
  } else R.roundMsg = '';
  loadBuildQ();
  renderQuiz();
}

function advanceTotal() { Q.round.pos++; loadTotalQ(); renderQuiz(); }
function nextTotalPathway() { Q.m = Q.round.queue.shift(); startTotal(); }
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
}
function withAlong(q, m, r = q.item?.rxn) {
  if (answerStyle() === 'along' && q.kind !== 'dir') q.along = alongTextFor(q, m, r);
  // Every accepted spelling, for letter-by-letter checking and hints (whichever one you're typing wins).
  if (q.kind !== 'dir') q.targets = uniq(q.kind === 'cof' ? cofTargets(m, r?.cofactors || {})
    : q.item ? [...spellingsFor(q.item, m, !!Q.cfg.fullNames && q.kind !== 'loc'), ...(q.kind === 'loc' ? [q.item.canon] : [])].filter(Boolean)
    : q.kind === 'path' ? [m.p.name, ...(m.p.aliases || [])] : [alongTextFor(q, m, r)]);
  return q;
}
// The accepted spelling that best matches what's typed so far.
function bestTarget(q, typed) {
  let best = q.targets?.[0] || q.answerText, bestPos = -Infinity;
  for (const t of q.targets || []) { const s = alongState(t, typed); const ok = s.st.filter(x => x === 'ok').length - s.errs * 2; if (ok > bestPos) { bestPos = ok; best = t; } }
  return best;
}
// Per typed character: right (ok) or wrong (err) against that spelling; punctuation you skip is fine.
function checkState(target, typed) {
  const out = []; let i = 0;
  for (const c of typed) {
    if (ALONG_SEP.test(c) && !(i < target.length && foldChar(c) === foldChar(target[i]))) { out.push('sep'); continue; }
    while (i < target.length && ALONG_SEP.test(target[i]) && foldChar(c) !== foldChar(target[i])) i++;
    out.push(i < target.length && foldChar(c) === foldChar(target[i]) ? 'ok' : 'err'); i++;
  }
  return out;
}
/* Letter-by-letter checking for cofactors, judged the way grading judges: against every name each cofactor goes by
   (NAD, NAD+, NAD⁺; Pi, phosphate…), inputs before outputs, any order within a side, and any separators or none
   ("ATPADP"). The longest stretch you've typed that reads as cofactors in an allowed order is green, along with a name
   you're partway through that can still become one that fits; what's left is red. Separators stay neutral. */
const COF_SEP = /[\s,;\/+]/;
function cofCheckState(m, c, typed) {
  const ins = new Set(c.in || []), outs = new Set(c.out || []);
  const { map, keys } = cofKeys(m);
  const namesOf = id => keys.filter(k => map[k] === id);
  // phase: given the ids so far, are they in an allowed order, and which cofactors may come next?
  const listPhase = ids => { const done = new Set(); for (const id of ids) { const insLeft = [...ins].some(x => !done.has(x)); if (done.has(id) || !(ins.has(id) || (outs.has(id) && !insLeft))) return null; done.add(id); }
    const insLeft = [...ins].filter(x => !done.has(x)); return insLeft.length ? insLeft : [...outs].filter(x => !done.has(x)); };
  const sidePhase = want => ids => { const done = new Set(); for (const id of ids) { if (done.has(id) || !want.has(id)) return null; done.add(id); } return [...want].filter(x => !done.has(x)); };
  const judge = (text, phase) => {
    const mark = (k, okTail) => [...text].map((ch, j) => (COF_SEP.test(ch) ? 'sep' : j < k || okTail ? 'ok' : 'err'));
    for (let k = text.length; k >= 0; k--) {
      const tail = cofNorm(text.slice(k));
      for (const split of cofSplits(m, text.slice(0, k))) { const next = phase(split); if (!next) continue; if (!tail || next.some(id => namesOf(id).some(n => n.startsWith(tail)))) return mark(k, true); }
    }
    for (let k = text.length; k >= 0; k--) if (cofSplits(m, text.slice(0, k)).some(sp => phase(sp))) return mark(k, false);
    return mark(0, false);
  };
  const arrow = typed.match(/→|⇌|->/);
  if (!arrow) return judge(typed, listPhase);
  const left = typed.slice(0, arrow.index), right = typed.slice(arrow.index + arrow[0].length);
  return [...judge(left, sidePhase(ins)), ...[...arrow[0]].map(() => 'sep'), ...judge(right, sidePhase(outs))];
}
// hinted: how many leading letters came from "Give me a letter" (shown plain, neither right nor wrong).
function checkGhost(targets, typed, hinted = 0, q = null) {
  if (q?.kind === 'cof' && q.model) {
    const st = cofCheckState(q.model, q.cofs, typed);
    return [...typed].map((c, k) => `<span class="${k < hinted ? 'c-hint' : st[k] === 'err' ? 'c-err' : st[k] === 'ok' ? 'c-ok' : 'c-sep'}">${esc(c)}</span>`).join('') + '<span class="caret" aria-hidden="true"></span>';
  }
  const t = bestTarget({ targets }, typed), st = checkState(t, typed);
  return [...typed].map((c, k) => `<span class="${k < hinted ? 'c-hint' : st[k] === 'err' ? 'c-err' : st[k] === 'ok' ? 'c-ok' : 'c-sep'}">${esc(c)}</span>`).join('') + '<span class="caret" aria-hidden="true"></span>';
}

function checkWidget(targets, typed, hinted = 0, q = null) {
  return `<span class="along check"><span class="ghost">${checkGhost(targets, typed, hinted, q)}</span><input class="ans along-in" data-check="1" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer" value="${esc(typed)}"></span>`;
}
// "Give me a letter": keep what's right so far and add the next letter of the closest spelling.
function hintLetter(q) {
  const t = q.along || bestTarget(q, q.draft), s = alongState(t, q.draft);
  let pos = 0; while (pos < s.st.length && s.st[pos] !== 'err') pos++;
  pos = Math.min(pos, s.pos);
  let next = pos; while (next < t.length && ALONG_SEP.test(t[next])) next++;
  q.draft = t.slice(0, Math.min(t.length, next + 1));
  q.hintLen = q.draft.length; // these letters were given, not typed: counted as typed, never tinted right/wrong
  q.hints = (q.hints || 0) + 1;
  if (q.along ? alongState(t, q.draft).done : q.draft === t) { submit(q, q.correct); return; }
  renderQuiz();
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
  if (Q.round.type === 'build') {
    // Building blocks: right → next blank; wrong → this blank is cleared and asked again.
    if (q.check(v)) { q.status = 'right'; noteInlineRight(q); return buildResolved(q); }
    q.tries++; q.wrong.push(v); q.draft = ''; q.justWrong = true; q.alongErrs = 0; q.lastErrs = 0; return renderQuiz();
  }
  if (q.check(v)) { q.status = 'right'; q.given = v; noteInlineRight(q); tally(q, q.tries === 0); resolved(q); }
  else { q.tries++; q.wrong.push(v); q.draft = v; q.justWrong = true; renderQuiz(); }
}
function reveal(q) {
  if (q.status !== 'open') return;
  if (Q.round.type === 'build') { q.hints = (q.hints || 0) + 1; q.peek = q.answerText; return renderQuiz(); }
  q.status = 'missed'; tally(q, false); resolved(q);
}
function peek(q) { q.status = 'peek'; renderQuiz(); }
function selfGrade(q, ok) { q.status = ok ? 'right' : 'missed'; q.self = true; tally(q, ok); resolved(q); }
function tally(q, firstTry) {
  firstTry = firstTry && !q.hints;
  Q.score.total++; if (firstTry) Q.score.right++; Stats.record(q.pid, q.statKey, firstTry);
  logAnswer();
}
function logAnswer(done = false) {
  const L = Q.log; if (!L) return;
  Object.assign(L, { right: Q.score.right, total: Q.score.total, last: Date.now(), answer: answerStyle(), done: L.done || done });
  const log = Store.data.log = Store.data.log || [];
  const i = log.findIndex(x => x.id === L.id);
  if (i >= 0) log[i] = { ...L }; else if (L.total) log.unshift({ ...L });
  if (log.length > 300) log.length = 300;
  Store.save();
}
function resolved(q) {
  const R = Q.round;
  Q.fact = R.type === 'stepE' ? Q.m.items['e:' + R.r.id] : q.factItem || q.item || Q.m.items['e:' + R.pair.r.id];
  Q.factM = Q.m;
  Q.history = (Q.history || []).filter(h => !(h.item === Q.fact && h.m === Q.m));
  Q.history.unshift({ item: Q.fact, m: Q.m, status: q.status });
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
  if (R.type === 'build') {
    const j = R.order.indexOf(Q.m.seq.indexOf(key));
    if (j < 0 || R.done) return 'shown';
    if (j >= R.k) return Q.cfg.ahead === 'show' ? 'shown' : 'blank'; // not reached this round (hidden unless chosen)
    if (j < R.pos) return 'right';
    if (j === R.pos) return R.q && R.q.status === 'open' ? 'target' : 'right';
    return 'blank';
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
      : q.status === 'right' && q.hints ? `<span class="was">with ${q.hints} hint${q.hints > 1 ? 's' : ''}</span>`
      : q.status === 'missed' && q.wrong.length ? `<span class="was">you tried ${esc(q.wrong.map(w => labelFor(q, w)).join(', '))}</span>` : '';
    return `<div class="result ${q.status}">${icon(q.status === 'right' ? 'ok' : 'no')}<span><b>${esc(q.answerText)}</b>${was}</span></div>`;
  }
  if (q.status === 'peek') return `<div class="result"><span><b>${esc(q.answerText)}</b></span></div>
    <div class="btnrow"><button class="btn good" data-act="got" data-q="${idx}">${icon('ok')} Got it <kbd>1</kbd></button><button class="btn" data-act="miss" data-q="${idx}">${icon('no')} Missed <kbd>2</kbd></button></div>`;
  if (style === 'self') return `<button class="btn primary" data-act="peek" data-q="${idx}">${mi('visibility')} Show answer</button>`;
  const hintBtn = Q.cfg.hints && q.targets ? `<button class="btn small ghost" data-act="hint" data-q="${idx}" title="Give me a letter (→ at the end of your answer)">${mi('lightbulb', 'sm')} Give me a letter <kbd>→</kbd></button>` : '';
  if (q.inline && q.along) return `<div class="hint-line">Type what you see in the highlighted box${q.alongErrs ? ` <span class="bad-note">${q.alongErrs} slip${q.alongErrs > 1 ? 's' : ''}</span>` : ''}${hintBtn}</div>`;
  if (q.along) return `<form class="ansform" data-q="${idx}">${alongWidget(q.along, q.draft)}</form>${hintBtn}`;
  if (!q.inline && Q.cfg.letterCheck && style === 'type' && q.targets) return `<form class="ansform" data-q="${idx}">${checkWidget(q.targets, q.draft, q.hintLen || 0, q)}<button class="btn">Check</button></form>${q.justWrong ? `<div class="bad-note">${icon('no')} Not quite. Try again or reveal.</div>` : ''}${hintBtn}`;
  if (q.inline) return `<div class="hint-line">${q.justWrong ? `<span class="bad-note">${icon('no')} Not quite. Try again or reveal.</span>` : inlineHintShown() ? `Type in the highlighted box, then ${mi('keyboard_return', 'sm')} Enter` : ''}${hintBtn}</div>`;
  if (optsFor) return `<div class="opts${compact ? ' row' : ''}">${optsFor.map((o, i) => {
    const bad = q.wrong.includes(o.v);
    return `<button class="opt${bad ? ' wrong' : ''}" data-act="pick" data-q="${idx}" data-v="${esc(o.v)}" ${bad ? 'disabled' : ''}><kbd>${i + 1}</kbd><span>${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${bad ? icon('no') : ''}</button>`;
  }).join('')}</div>`;
  return `<form class="ansform" data-q="${idx}"><input class="ans${q.justWrong ? ' bad' : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(q.placeholder || 'Type the name')}" value="${esc(q.draft)}" aria-label="${q.label}"><button class="btn">Check</button></form>
    ${q.justWrong ? `<div class="bad-note">${icon('no')} Not quite. Try again or reveal.</div>` : ''}`;
}
/* ---------- page ---------- */
// Toolbar buttons carry a text label (hidden on narrow screens) as well as the icon.
const tbtn = (attrs, icon, label, title = label) => `<button class="tbtn" ${attrs} title="${esc(title)}" aria-label="${esc(title)}">${mi(icon)}<span>${label}</span></button>`;
// After a few answers typed straight into the diagram, the how-to line stops repeating itself.
const INLINE_KNOWN = 3;
const inlineHintShown = () => (local.get('pathways.inlineRight') || 0) < INLINE_KNOWN;
function noteInlineRight(q) { if (q.inline) local.set('pathways.inlineRight', (local.get('pathways.inlineRight') || 0) + 1); }
// How far through the quiz you are, for the thin bar under the toolbar (null: open-ended modes).
function progressFrac() {
  const R = Q.round;
  if (R.type === 'total') return R.done ? 1 : R.pos / Math.max(1, R.order.length);
  if (R.type === 'build') return R.done ? 1 : ((R.k - 1) + R.pos / R.k) / Math.max(1, R.order.length);
  return null;
}
/* ---------- facts: step through the diagram ----------
   Back / Next walk every item that's showing, in reading order; blanks are skipped so nothing is given away. */
function visibleKeys() {
  const st = k => (['single', 'total', 'build'].includes(Q.round.type) ? statusOf(k) : 'shown');
  return Q.m.seq.filter(k => Q.m.items[k] && !['blank', 'target', 'hide'].includes(st(k)) && !(k[0] === 'e' && el(kindOf(k)) === 'hide'));
}
function focusStep(dir) {
  const keys = visibleKeys();
  if (!keys.length) return;
  const i = Q.focus ? keys.indexOf(Q.focus.item.key) : -1;
  const j = i < 0 ? (dir > 0 ? 0 : keys.length - 1) : (i + dir + keys.length) % keys.length;
  Q.focus = { item: Q.m.items[keys[j]], m: Q.m }; Q.drawer = true;
  renderQuiz();
  centerOn($('#stage .focused'));
}
// Items the editor can open directly (metabolites, enzymes/transporters, cofactor sets).
const editHref = (item, m) => (/^[mec]:/.test(item?.key || '') ? `#/pathways/${encodeURIComponent(m.p.id)}/edit/${encodeURIComponent(item.key)}` : '');
// The optional "1/2" in a cofactor field: how many of the step's cofactors you've typed so far, out of how many.
function updateCofCounts() {
  if (Q.cfg.cofCount === false) return;
  document.querySelectorAll('#view .quiz form.ansform, #view .quiz form.inl').forEach(f => {
    const q = formQ(f);
    if (!q || q.kind !== 'cof' || q.status !== 'open' || !q.model) return;
    const { got, total } = cofProgress(q.model, f.querySelector('input')?.value || '', q.cofs);
    if (!total) return;
    let c = f.querySelector('.cofcount');
    if (!c) { c = document.createElement('span'); c.className = 'cofcount'; c.setAttribute('aria-live', 'polite'); f.append(c); }
    c.textContent = `${got}/${total}`;
    c.setAttribute('aria-label', `${got} of ${total} cofactors entered`);
  });
}
function zoomBarHTML() {
  return `<div class="zoombar" role="group" aria-label="Diagram zoom">
    <span class="zgroup"><button class="tbtn icon" data-zoom="out" title="Zoom out" aria-label="Zoom out">${mi('zoom_out')}</button><span class="zpct" id="zoomPct">100%</span><button class="tbtn icon" data-zoom="in" title="Zoom in" aria-label="Zoom in">${mi('zoom_in')}</button></span>
    ${tbtn('data-zoom="width"', 'fit_width', 'Fit width')}
    ${tbtn('data-zoom="fit"', 'fit_screen', 'Fit all', 'Fit the whole diagram')}
    ${tbtn('data-flag="follow"', 'center_focus_strong', 'Follow', 'Keep the current blank centered')}
  </div>`;
}
function optionsHTML() {
  const s = Store.settings, ans = answerStyle(), view = viewStyle();
  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button data-qopt="${key}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  return `<details class="qopts"><summary class="tbtn icon" title="Options" aria-label="Options">${mi('tune')}</summary>
    <div class="pop">
      <label>Answer by</label>${seg('answer', Q.cfg.mode === 'build' ? [['type', 'Typing'], ['along', 'Typing along']] : [['type', 'Typing'], ['along', 'Typing along'], ['choice', 'Choice'], ['self', 'Self-check']], ans)}
      ${Q.cfg.mode === 'build' ? `<label>Later blanks</label>${seg('ahead', [['hide', 'Hide'], ['show', 'Show']], Q.cfg.ahead === 'show' ? 'show' : 'hide')}` : ''}
      ${ans === 'type' ? `<label class="cb"><input type="checkbox" data-qflag="letterCheck" ${Q.cfg.letterCheck ? 'checked' : ''}> Check each letter as I type</label>` : ''}
      ${['type', 'along'].includes(ans) ? `<label class="cb"><input type="checkbox" data-qflag="hints" ${Q.cfg.hints ? 'checked' : ''}> “Give me a letter” button</label>` : ''}
      ${ans === 'type' ? `<label class="cb"><input type="checkbox" data-qflag="autoSubmit" ${Q.cfg.autoSubmit ? 'checked' : ''}> Submit right answers automatically</label>` : ''}
      ${['type', 'along'].includes(ans) ? `<label class="cb"><input type="checkbox" data-qflag="fullNames" ${Q.cfg.fullNames ? 'checked' : ''}> Require full names</label>` : ''}
      ${el('cof') === 'quiz' ? `<label class="cb"><input type="checkbox" data-qflag="cofCount" ${Q.cfg.cofCount !== false ? 'checked' : ''}> Show how many cofactors there are</label>` : ''}
      <label>View</label>${seg('view', [['flow', 'Flow'], ['list', 'List']], view)}
      ${view === 'list' ? `<label>List</label>${seg('dir', [['v', 'Top–bottom'], ['h', 'Left–right']], s.dir)}` : ''}
      <label class="cb"><input type="checkbox" data-qflag="facts" ${s.facts ? 'checked' : ''}> Show facts after each answer</label>
      ${Q.cfg.mode === 'total' ? `<label class="cb"><input type="checkbox" data-qflag="autoAdvance" ${s.autoAdvance ? 'checked' : ''}> Move on after a right answer</label>` : ''}
      ${Q.cfg.mode !== 'total' ? `<label class="cb"><input type="checkbox" data-qflag="weak" ${Q.cfg.weak ? 'checked' : ''}> Weak spots first</label>` : ''}
    </div></details>`;
}
// A cofactor slot's facts are its reaction's.
const factItemOf = (item, m) => (item?.kind === 'cof' ? m.items['e:' + item.rxn.id] : item);

function renderQuiz() {
  const V = $('#view');
  if (!Q.cfg) { location.hash = '#/'; return; }
  const R = Q.round;
  const occ = R.type === 'single' || R.type === 'total' || R.type === 'build';
  const cq = occ && R.q;
  INLINE = cq && ['type', 'along'].includes(answerStyle()) && cq.status === 'open'
    ? { draft: cq.draft, bad: cq.justWrong, along: cq.along, check: answerStyle() === 'type' && Q.cfg.letterCheck ? cq.targets : null, hinted: cq.hintLen || 0, kind: KIND[cq.kind] || '', q: cq } : null;
  if (cq) cq.inline = !!INLINE;
  const flow = viewStyle() === 'flow', horiz = Store.settings.dir === 'h';
  const sub = R.type === 'stepE' && el('path') !== 'show' && Q.models.length > 1 ? `${Q.models.length} pathways` : esc(Q.m.p.name) + (Q.models.length > 1 && R.type !== 'stepE' ? ` <span class="muted">· ${Q.models.length} in this quiz</span>` : '');
  const progress = R.type === 'total' && !R.done ? `<span class="prog">${R.pos + 1} / ${R.order.length}</span>`
    : R.type === 'build' && !R.done ? `<span class="prog" title="Round ${R.k} of ${R.order.length}">Round ${R.k} / ${R.order.length}</span>` : '';

  let stage = '', dock = '', below = '';
  INLINE_FORM = '';
  if (R.type === 'none') {
    stage = `<div class="empty">${mi('tune')}<p>Nothing is set to <b>Quiz</b>. Go back and pick at least one thing to quiz.</p><a class="btn primary" href="#/new">Back to the quiz setup</a></div>`;
  } else if (occ) {
    const zones = el('loc') !== 'hide';
    stage = flow ? flowSVG(Q.m, statusOf, { zones }) : listHTML(Q.m, statusOf, { horiz, zones });
    dock = occDock();
  } else {
    stage = R.type === 'step' ? (flow ? stepFlow() : stepList()) : (flow ? stepEFlow() : stepEList());
    below = stepPanel();
  }
  const nFacts = (Q.history || []).length;
  V.innerHTML = `<div class="quiz ${occ ? 'occ' : 'steps'}${Q.drawer ? ' with-drawer' : ''}">
    <header class="qbar">
      <a class="tbtn icon" href="#/" title="Dashboard" aria-label="Dashboard">${mi('home')}</a>
      <div class="qtitle"><div class="qname-row"><span class="qname">${esc(Q.cfg.name)}</span>${Q.draft ? `<button class="tbtn icon mini" data-act="fav" aria-pressed="${!!findFav(Q.draft)}" title="${findFav(Q.draft) ? 'Remove from favorites' : 'Add this quiz to your favorites'}" aria-label="${findFav(Q.draft) ? 'Remove from favorites' : 'Add to favorites'}">${mi(findFav(Q.draft) ? 'star_fill1' : 'star')}</button>` : ''}<a class="tbtn icon mini" href="#/pathways/${encodeURIComponent(Q.m.p.compose ? Q.m.p.compose[0] : Q.m.p.id)}/edit" title="Edit this pathway" aria-label="Edit this pathway">${mi('edit')}</a></div>${Q.cfg.name !== Q.m.p.name || Q.models.length > 1 ? `<div class="qsub">${sub}</div>` : `<div class="qsub">${esc(quizSummary(Q.cfg))}</div>`}</div>
      ${progress}
      <span class="qscore" title="Right on the first try">${mi('check', 'sm')} ${Q.score.right}<span class="muted"> / ${Q.score.total}</span></span>
      <div class="qtools">${R.type !== 'none' && flow && !occ ? zoomBarHTML() : ''}
        <button class="tbtn icon" data-act="facts" aria-pressed="${!!Q.drawer}" title="Facts for everything answered (or click any shown item)" aria-label="Facts">${mi('lightbulb')}${nFacts ? `<b class="count">${nFacts}</b>` : ''}</button>
        ${optionsHTML()}</div>
      ${progressFrac() !== null ? `<div class="qprog" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progressFrac() * 100)}"><span style="width:${(progressFrac() * 100).toFixed(1)}%"></span></div>` : ''}
    </header>
    <div class="qbody">
      <div class="qmain">${occ && flow && R.type !== 'none' ? `<div class="stage canvas" id="stage" data-view="quiz:${esc(Q.m.p.id)}">${canvasHTML(stage, INLINE_FORM)}</div>` : `<div class="stage" id="stage">${stage}${INLINE_FORM}</div>`}${occ && flow && R.type !== 'none' ? `<div class="zoomfloat">${zoomBarHTML()}</div>` : ''}${below}</div>
      ${Q.drawer ? drawerHTML() : ''}
    </div>
    ${dock}
  </div>`;
  if (INLINE && cq.justWrong) $('#stage form.inl input')?.classList.add('shake');
  if (Q.focus && Q.drawer) $(`#stage [data-key="${CSS.escape(Q.focus.item.key)}"]`)?.classList.add('focused');
  const fk = Q.fact?.key;
  if (fk && fk !== Q.pulsed) { Q.pulsed = fk; $(`#stage [data-key="${CSS.escape(fk)}"]`)?.classList.add('just'); }
  updateCofCounts();
  fitToolbar();
  applyZoom();
  followTarget();
  const inp = $('#stage input.ans') || $('#view .ansform input');
  if (inp && (!matchMedia('(hover: none)').matches || inp.closest('#stage'))) { inp.focus({ preventScroll: true }); if (inp.value) inp.setSelectionRange(inp.value.length, inp.value.length); else inp.select(); }
  for (const q of R.qs || (R.q ? [R.q] : [])) q.justWrong = false;
}
// Facts drawer: the item you clicked (if any), then everything answered this quiz, newest first.
function drawerHTML() {
  const entries = [];
  if (Q.focus) entries.push({ ...Q.focus, head: 'Selected' });
  (Q.history || []).forEach((h, i) => { if (!Q.focus || h.item !== Q.focus.item) entries.push({ ...h, head: i === 0 ? 'Last answer' : '' }); });
  return `<aside class="drawer" aria-label="Facts">
    <div class="drawer-h"><h2>${mi('lightbulb', 'h-ic')} Facts</h2><button class="tbtn icon" data-act="closefacts" title="Close" aria-label="Close facts">${mi('close')}</button></div>
    <p class="muted small">Click anything showing on the diagram, or step through it.</p>
    <div class="btnrow tight fnav"><button class="btn small" data-act="fprev" title="Previous item (←)">${mi('arrow_back', 'sm')} Back</button><button class="btn small" data-act="fnext" title="Next item (→)">Next ${mi('arrow_forward', 'sm')}</button></div>
    ${entries.length ? entries.map(e => { const href = editHref(factItemOf(e.item, e.m), e.m);
      return `${e.head ? `<div class="glabel">${e.head}</div>` : ''}<div class="drawer-item${e.status ? ' ' + e.status : ''}">${e.status ? icon(e.status === 'right' ? 'ok' : 'no') : ''}${factsCard(factItemOf(e.item, e.m), e.m)}${href ? `<a class="btn small ghost fedit" href="${href}" title="Change this in the pathway editor">${mi('edit', 'sm')} Edit</a>` : ''}</div>`; }).join('')
      : '<p class="muted">Nothing answered yet.</p>'}
  </aside>`;
}
function factsCard(item, m) {
  if (!item) return '';
  let tags = '', extra = '';
  if (item.kind === 'enz' || item.kind === 'trn') {
    const r = item.rxn;
    tags = [r.only ? r.only + ' only' : '', r.transport ? 'transport' : '', r.reversible ? 'reversible' : 'irreversible', ...(r.tags || []).filter(t => t !== 'irreversible'), r.tissue || m.p.tissue, r.loc].filter(Boolean).join(' · ');
    extra = `<p class="rx">${esc(metNames(m, reactantsOf(r)))} ${r.reversible ? '⇌' : '→'} ${esc(metNames(m, productsOf(r)))}</p>`;
    if (item.kind === 'enz') extra += `<p>Cofactors: ${esc(cofText(m, r.cofactors || {}))}${(r.requires || []).length ? ` · Requires ${esc(r.requires.join(', '))}` : ''}</p>`;
    if (Q.round?.type === 'stepE') extra += `<p>Pathway: ${esc(pathwaysWithEnzyme(item).map(p => p.name).join(' · '))}</p>`;
  }
  return `<div class="fact-body"><h3>${esc(item.name)}${item.short && item.short !== item.name ? ` <span class="muted">(${esc(item.short)})</span>` : ''}</h3>${tags ? `<div class="tags">${esc(tags)}</div>` : ''}${extra}${item.notes ? `<p>${esc(item.notes)}</p>` : item.kind === 'met' && !extra ? '<p class="muted">No notes for this one yet.</p>' : ''}</div>`;
}
// The dock keeps the last answer's facts until the next answer, so moving on doesn't take them away.
function lastFactsHTML() {
  if (!Q.fact || !Store.settings.facts) return '';
  const open = Store.settings.factsOpen !== false;
  return `<details class="facts"${open ? ' open' : ''}><summary>${mi('lightbulb', 'facts-ic')}<span><span class="muted">Last answer:</span> <b>${esc(factItemOf(Q.fact, Q.factM || Q.m).name)}</b></span>${mi('expand_more', 'chev')}</summary>${factsCard(factItemOf(Q.fact, Q.factM || Q.m), Q.factM || Q.m)}</details>`;
}
function occDock() {
  const R = Q.round, q = R.q;
  if (R.type === 'build') {
    if (R.done) return `<div class="dock done-dock"><div class="dock-row">
      <div class="dock-text"><div class="big">${mi('check')} Built</div><div class="muted">You typed all ${R.order.length} blanks in a row, cleanly.</div></div>
      <div class="dock-actions"><button class="btn primary" data-act="restart">${mi('restart_alt')} Go again</button><button class="btn" data-act="facts">${mi('lightbulb', 'sm')} Review facts</button>${Store.mode === 'local' ? `<button class="btn" data-data="download">${mi('download', 'sm')} Back up</button>` : ''}<a class="btn ghost" href="#/">Done</a></div>
    </div>${lastFactsHTML()}</div>`;
    return `<div class="dock"><div class="dock-row">
      <div class="dock-text"><span class="kind kind-${q.kind}">${KIND[q.kind]}</span><span class="muted"> blank ${R.pos + 1} of ${R.k}</span>${R.roundMsg && R.pos === 0 ? `<div class="round-note">${esc(R.roundMsg)}</div>` : ''}</div>
      <div class="dock-answer">${q.peek ? `<div class="hint-line"><span>Answer: <b>${esc(q.peek)}</b>. Now type it.</span></div>` : ''}${q.note ? `<div class="hint-line"><span class="bad-note">${esc(q.note)}</span></div>` : ''}${q.justWrong ? `<div class="hint-line"><span class="bad-note">${icon('no')} Not quite. That blank is cleared; try it again.</span></div>` : ''}${answerHTML(q, 0, true)}</div>
      <div class="dock-actions"><button class="btn ghost" data-act="reveal" title="Show the answer (you'll still type it)">${mi('visibility', 'sm')} Show answer</button></div>
    </div>${lastFactsHTML()}</div>`;
  }
  if (R.type === 'total' && R.done) {
    const more = R.queue.length;
    return `<div class="dock done-dock"><div class="dock-row">
      <div class="dock-text"><div class="big">${Q.score.right} / ${Q.score.total}</div><div class="muted">right on the first try in ${esc(Q.m.p.name)}</div></div>
      <div class="dock-actions">${more ? `<button class="btn primary" data-act="nextpath">${mi('skip_next')} Next: ${esc(R.queue[0].p.name)}</button>` : ''}
        <button class="btn${more ? '' : ' primary'}" data-act="restart">${mi('restart_alt')} Go again</button><button class="btn" data-act="facts">${mi('lightbulb', 'sm')} Review facts</button>${Store.mode === 'local' ? `<button class="btn" data-data="download">${mi('download', 'sm')} Back up</button>` : ''}<a class="btn ghost" href="#/">Done</a></div>
    </div>${lastFactsHTML()}</div>`;
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
    <div class="dock-actions">${open && answerStyle() !== 'self' ? `<button class="btn ghost" data-act="reveal" title="Reveal (Esc)">${mi('visibility', 'sm')} Reveal</button>` : ''}
      ${R.type === 'single' && open ? `<button class="btn ghost" data-act="skip">Skip</button>` : ''}${next}</div>
  </div>${lastFactsHTML()}</div>`;
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
    ${lastFactsHTML()}
  </section>`;
}

/* ---------- zoom + follow (the diagram only, never the rest of the UI) ---------- */
// zoom: 'width' = fit the frame's width (never above natural size), 'fit' = whole diagram in the frame, number = scale.
// The quiz toolbar never pushes the page sideways: if it doesn't fit, drop button labels, then the less-used zoom controls.
function fitToolbar() {
  const bar = $('.qbar');
  if (!bar) return;
  bar.classList.remove('compact', 'tight');
  if (window.innerWidth <= 600) return; // phones: the tools wrap under the title instead
  for (const c of ['compact', 'tight']) { if (bar.scrollWidth <= bar.clientWidth) return; bar.classList.add(c); }
}
window.addEventListener('resize', () => { if ($('.quiz')) fitToolbar(); });
/* ---------- events ---------- */
const inQuiz = () => !!$('#view .quiz');
document.addEventListener('click', e => {
  const zb = e.target.closest('[data-zoom]');
  if (zb) {
    const v = zb.dataset.zoom;
    if (v === 'in') zoomBy(0.1); else if (v === 'out') zoomBy(-0.1); else { Store.settings.zoom = v; Store.save(); CANVAS_VIEW = null; applyZoom(); } // Fit width / Fit all always re-fit
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
  // Click anything showing on the diagram to read its facts (never a blank: that would give it away).
  const k = e.target.closest('#stage [data-key]');
  if (k && !e.target.closest('form')) {
    const st = ['single', 'total', 'build'].includes(Q.round.type) ? statusOf(k.dataset.key) : 'shown';
    if (!['blank', 'target', 'hide'].includes(st) && Q.m.items[k.dataset.key]) { Q.focus = { item: Q.m.items[k.dataset.key], m: Q.m }; Q.drawer = true; renderQuiz(); }
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const R = Q.round, qs = R.qs || [R.q];
  const q = qs[+b.dataset.q || 0];
  switch (b.dataset.act) {
    case 'pick': submit(q, b.dataset.v); break;
    case 'hint': hintLetter(q); break;
    case 'fav': toggleFav(Q.draft, renderQuiz); break;
    case 'facts': Q.drawer = !Q.drawer; Q.focus = null; renderQuiz(); break;
    case 'closefacts': Q.drawer = false; Q.focus = null; renderQuiz(); break;
    case 'fprev': focusStep(-1); break;
    case 'fnext': focusStep(1); break;
    case 'reveal': reveal(q); break;
    case 'peek': peek(q); break;
    case 'got': selfGrade(q, true); break;
    case 'miss': selfGrade(q, false); break;
    case 'revealall': R.qs.filter(x => x.status === 'open').forEach(reveal); break;
    case 'peekall': R.qs.filter(x => x.status === 'open').forEach(x => (x.status = 'peek')); renderQuiz(); break;
    case 'next': case 'skip': nextQuestion(); break;
    case 'continue': advanceTotal(); break;
    case 'nextpath': nextTotalPathway(); renderQuiz(); break;
    case 'restart':
      Q.score = { right: 0, total: 0 };
      if (Q.round.type === 'build') startBuild(); else { Q.round.queue = Q.models.slice(1); Q.m = Q.models[0]; startTotal(); }
      renderQuiz(); break;
  }
});
document.addEventListener('change', e => {
  if (!inQuiz()) return;
  const f = e.target.dataset.qflag;
  if (!f) return;
  if (f === 'weak') { Q.cfg.weak = e.target.checked; newRound(); }
  else if (['letterCheck', 'hints', 'autoSubmit', 'cofCount', 'fullNames'].includes(f)) { Q.cfg[f] = e.target.checked; if (f === 'fullNames') (Q.round.qs || [Q.round.q]).filter(Boolean).forEach(x => withAlong(x, Q.m)); /* refresh letter-check / hint spellings */ if (['cofCount', 'fullNames'].includes(f)) renderQuiz(); }
  else { Store.settings[f] = e.target.checked; Store.save(); }
  renderQuiz();
  $('.qopts') && ($('.qopts').open = true);
});
document.addEventListener('toggle', e => { if (e.target.matches?.('.quiz details.facts')) { Store.settings.factsOpen = e.target.open; Store.save(); } }, true);
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
  if (q.hintLen && v.length < q.hintLen) q.hintLen = v.length; // backspacing into given letters
  updateCofCounts();
  // Submit automatically, when that option is on, the moment the answer is right (never when it's wrong).
  if (Q.cfg.autoSubmit && q.status === 'open' && answerStyle() === 'type' && v.trim() && q.check(v)) { submit(q, v); return; }
  if (e.target.dataset.check) { f.querySelector('.ghost').innerHTML = checkGhost(q.targets, v, q.hintLen || 0, q); return; }
  if (!q.along || q.status !== 'open') return;
  if (v && q.targets?.length > 1) { const bt = bestTarget(q, v); if (bt !== q.along && alongState(bt, v).errs < alongState(q.along, v).errs) q.along = bt; } // follow the spelling or order being typed
  const s = alongState(q.along, v);
  if (grew && s.errs > (q.lastErrs || 0)) { q.alongErrs = (q.alongErrs || 0) + 1; e.target.closest('.along').classList.remove('shake'); void e.target.offsetWidth; e.target.closest('.along').classList.add('shake'); }
  q.lastErrs = s.errs;
  f.querySelector('.ghost').innerHTML = alongGhost(q.along, v, q.hintLen || 0);
  if (s.done) { if (q.alongErrs) q.tries = 1; submit(q, q.check(q.correct) ? q.correct : q.along); }
});
document.addEventListener('keydown', e => {
  if (!inQuiz() || document.querySelector('dialog[open]')) return;
  if (['SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const inInput = e.target.tagName === 'INPUT';
  const V = $('#view');
  if (e.key === 'Escape' && inInput && Q.round.q) { reveal(Q.round.q); return; }
  if (Q.round.type === 'build') return;
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
// ← / → step through the facts while the panel is open (not while typing an answer).
document.addEventListener('keydown', e => {
  if (!inQuiz() || !Q.drawer || e.altKey || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); focusStep(e.key === 'ArrowLeft' ? -1 : 1); }
});
// → at the end of an answer = "Give me a letter" (when hints are on). Mid-word it still just moves the cursor.
document.addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || !inQuiz() || !Q.cfg.hints) return;
  const inp = e.target.closest?.('#view .quiz input.ans'), f = inp?.closest('form.ansform, form.inl');
  if (!f || inp.selectionStart !== inp.value.length || inp.selectionEnd !== inp.value.length) return;
  const q = formQ(f);
  if (!q || !q.targets || q.status !== 'open') return;
  e.preventDefault();
  hintLetter(q);
});
