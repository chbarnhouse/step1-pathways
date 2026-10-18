/* Pathway JSON → study model.
   reactions[] in pathway order. A reaction is on the spine unless branch:true.
     from / to          main substrate → main product
     also_to[]          side products (e.g. aldolase → DHAP)
     also_from[]        side inputs drawn as metabolites (e.g. gluconeogenic aldolase ← DHAP)
     branch:true        a side reaction between a spine metabolite and a side one, either direction
     cofactors {in,out} ids from the shared cofactor list or the pathway's own `cofactors`
       reversible, multiplier, requires[], tags[]
     loc        compartment (cytosol, mitochondrial matrix, ER lumen…); tissue: organ/cell type when it differs within a pathway
     transport  the step moves a metabolite between compartments; its "enzyme" is the transporter
   circular:true → the last spine reaction returns to the first metabolite. pathway.tissue = where the pathway runs. */
'use strict';

function buildModel(p, sharedCof = Library.sharedCof()) {
  const cof = Object.assign({}, sharedCof, p.cofactors || {});
  const mets = p.metabolites || {}, enzs = p.enzymes || {}, rx = p.reactions || [];
  const errs = [];
  rx.forEach((r, i) => {
    const n = `Step ${i + 1}`;
    if (!enzs[r.enzyme]) errs.push(`${n}: no enzyme chosen`);
    for (const k of ['from', 'to']) if (!mets[r[k]]) errs.push(`${n}: "${k}" metabolite missing`);
    for (const k of ['also_to', 'also_from']) for (const s of r[k] || []) if (!mets[s]) errs.push(`${n}: unknown metabolite "${s}" in ${k}`);
  });
  const spine = rx.filter(r => !r.branch);
  if (!spine.length) errs.push('Add at least one step that is not a branch.');
  if (errs.length) throw new Error(errs.join('\n'));

  const items = {};
  for (const [id, m] of Object.entries(mets))
    items['m:' + id] = { key: 'm:' + id, kind: 'met', id, name: m.name, short: m.short, aliases: m.aliases || [], nicknames: m.nicknames, notes: m.notes };
  const m0 = { cof };
  for (const r of rx) {
    const e = enzs[r.enzyme];
    items['e:' + r.id] = { key: 'e:' + r.id, kind: r.transport ? 'trn' : 'enz', id: r.enzyme, rxn: r, name: e.name, short: e.short, aliases: e.aliases || [], nicknames: e.nicknames, notes: e.notes };
    // A reaction's cofactor set is its own quizzable item (only when it has one).
    const c = r.cofactors || {};
    if ((c.in || []).length || (c.out || []).length)
      items['c:' + r.id] = { key: 'c:' + r.id, kind: 'cof', rxn: r, name: cofText(m0, c), aliases: [], notes: null };
  }

  const spineMets = p.circular ? spine.map(r => r.from) : [spine[0].from, ...spine.map(r => r.to)];
  const onSpine = new Set(spineMets);
  const branches = rx.filter(r => r.branch);

  // Reading order for Full recall and the List view: metabolite, enzyme, metabolite…
  // Side products follow the enzyme that makes them; side inputs come just before the enzyme that uses them;
  // dead-end branches follow the metabolite they leave from.
  const seq = [], seen = new Set();
  const push = k => { if (!seen.has(k)) { seen.add(k); seq.push(k); } };
  const pushRx = r => { push('e:' + r.id); if (items['c:' + r.id]) push('c:' + r.id); };
  const pushMet = id => {
    if (seen.has('m:' + id)) return;
    // Side metabolites that only feed into this one (glucose from the blood via GLUT) come just before it.
    for (const b of branches) if (b.to === id && !onSpine.has(b.from) && !seen.has('m:' + b.from) && !rx.some(r => (r.also_to || []).includes(b.from) || (r !== b && r.to === b.from))) { push('m:' + b.from); pushRx(b); }
    push('m:' + id);
    for (const b of branches) {
      if (b.from !== id || seen.has('e:' + b.id)) continue;
      if (onSpine.has(b.to)) { if (!onSpine.has(id)) pushRx(b); }
      else { pushRx(b); pushMet(b.to); }
    }
  };
  pushMet(spineMets[0]);
  for (const r of spine) {
    for (const s of r.also_from || []) {
      for (const b of branches) if (b.to === s && seen.has('m:' + b.from)) pushRx(b);
      pushMet(s);
    }
    pushRx(r);
    for (const s of r.also_to || []) pushMet(s);
    if (!(p.circular && r.to === spineMets[0])) pushMet(r.to);
    // Bypasses between two metabolites already read (a combined pathway's reverse steps) follow right away.
    for (const b of branches) if (onSpine.has(b.from) && onSpine.has(b.to) && seen.has('m:' + b.from) && seen.has('m:' + b.to)) pushRx(b);
  }
  for (const k of Object.keys(items)) push(k); // anything unreachable still gets studied

  // Compartments are items too ('z:<key>'): one per place the pathway runs, read just before its first step there.
  const m0z = { p, multiTissue: new Set(rx.map(r => r.tissue || '')).size > 1 };
  const zones = {};
  for (const r of rx) {
    if (!r.loc) continue;
    const key = zoneKey(m0z, r.loc, r.tissue);
    const z = zones[key] = zones[key] || { raw: {}, rs: [] };
    z.raw[r.loc] = (z.raw[r.loc] || 0) + 1; z.rs.push(r); z.tissue = r.tissue || p.tissue;
  }
  for (const [key, z] of Object.entries(zones)) {
    const loc = Object.entries(z.raw).sort((a, b) => b[1] - a[1])[0][0];
    const name = (m0z.multiTissue && z.tissue ? z.tissue + ' · ' : '') + loc;
    items['z:' + key] = { key: 'z:' + key, kind: 'loc', id: key, canon: canonLoc(loc), name, short: '', aliases: Object.keys(z.raw),
      notes: 'Steps here: ' + uniq(z.rs.map(r => enzs[r.enzyme]?.name)).join(', ') + '.' };
    const first = seq.findIndex(k => k[0] === 'e' && z.rs.includes(items[k].rxn));
    if (first >= 0) seq.splice(first, 0, 'z:' + key); else seq.push('z:' + key);
  }

  // Grids (steroidogenesis) have no single main line: read them in the order the steps are written.
  if (p.layout === 'grid') {
    seq.length = 0; seen.clear();
    for (const r of rx) { pushMet(r.from); pushRx(r); pushMet(r.to); }
    for (const k of Object.keys(items)) push(k);
  }
  const pairs = [];
  for (const r of rx) {
    pairs.push({ r, a: r.from, b: r.to });
    for (const s of r.also_to || []) pairs.push({ r, a: r.from, b: s });
    for (const s of r.also_from || []) pairs.push({ r, a: s, b: r.to });
  }
  return { p, cof, items, spine, spineMets, onSpine, branches, seq, pairs, multiTissue: m0z.multiTissue };
}

/* ---------- cofactors ---------- */
const cofName = (m, id) => (m.cof[id] && m.cof[id].name) || id;
function cofText(m, c) {
  const i = (c.in || []).map(id => cofName(m, id)), o = (c.out || []).map(id => cofName(m, id));
  if (!i.length && !o.length) return 'None';
  if (!i.length) return 'releases ' + o.join(' + ');
  if (!o.length) return 'uses ' + i.join(' + ');
  return i.join(' + ') + ' → ' + o.join(' + ');
}
function cofLookup(cofs) {
  const map = {}, phrases = [];
  for (const [id, c] of Object.entries(cofs)) for (const a of [id, c.name, ...(c.aliases || [])]) {
    map[norm(a)] = id;
    if (/[\s,]/.test(a.trim())) phrases.push([a.toLowerCase(), id]); // multi-word, or with a comma (N⁵,N¹⁰-methylene-THF)
  }
  phrases.sort((a, b) => b[0].length - a[0].length);
  return { map, phrases };
}
const IGNORE = new Set(['', '+', 'h+', 'h', 'mg2+', 'mg', 'and', 'uses', 'releases']); // "uses H₂O" / "releases CO₂" are how one-sided steps read
// Cofactors: what goes in comes before what comes out (ATP → ADP, never ADP, ATP), but within each side any order counts
// (ATP, NADH ≡ NADH, ATP). With an arrow, each side is checked on its own; as a plain list, every "in" must come first.
// Reads cofactors however they're separated (commas, spaces, plus signs) or not at all ("ATPADP", "NAD+PiNADH").
// Glued names can split more than one way ("NADPi" = NAD + Pi, not NADP + i), so every split into real cofactor names
// is considered; grading accepts the answer if any split fits. "+" is dropped everywhere, so NAD+ and NAD read alike.
const COF_KEYS = new WeakMap();
function cofKeys(m) {
  if (COF_KEYS.has(m.cof)) return COF_KEYS.get(m.cof);
  const map = {};
  for (const [k, id] of Object.entries(cofLookup(m.cof).map)) { const kk = k.replace(/\+/g, ''); if (kk) map[kk] = id; }
  const ign = [...IGNORE].map(w => w.replace(/\+/g, '')).filter(w => w && !map[w]);
  const out = { map, keys: Object.keys(map).sort((a, b) => b.length - a.length), ign };
  COF_KEYS.set(m.cof, out);
  return out;
}
const cofNorm = raw => norm(String(raw).replace(/[,;\/]/g, ' ')).replace(/\+/g, '');
function cofSplits(m, raw) {
  const { map, keys, ign } = cofKeys(m), s = cofNorm(raw), memo = new Map();
  const go = i => {
    if (i === s.length) return [[]];
    if (memo.has(i)) return memo.get(i);
    const res = [];
    for (const k of keys) if (s.startsWith(k, i)) for (const rest of go(i + k.length)) { if (res.length < 40) res.push([map[k], ...rest]); }
    for (const w of ign) if (s.startsWith(w, i)) for (const rest of go(i + w.length)) { if (res.length < 40) res.push(rest); }
    memo.set(i, res);
    return res;
  };
  return go(0);
}
// Best-effort reading while still typing (the last name may be unfinished): longest names first, stop at the first gap.
function cofIds(m, raw) {
  const { map, keys, ign } = cofKeys(m), s = cofNorm(raw), ids = [];
  let i = 0;
  while (i < s.length) {
    const k = keys.find(k => s.startsWith(k, i));
    if (k) { ids.push(map[k]); i += k.length; continue; }
    const w = ign.find(w => s.startsWith(w, i));
    if (w) { i += w.length; continue; }
    ids.push(null); break;
  }
  return ids;
}
const ARROW = /→|->|=>|⇌|>/;
function gradeCof(m, raw, c) {
  const ins = new Set(c.in || []), outs = new Set(c.out || []);
  const str = String(raw);
  if (!ins.size && !outs.size) return /^(none|nothing|no|n\/?a|-|—)?$/.test(str.toLowerCase().replace(/\s/g, ''));
  const same = (got, want) => got.length === want.size && new Set(got).size === got.length && got.every(x => want.has(x));
  const listOk = ids => { const cut = ids.findIndex(x => !ins.has(x)); const left = cut < 0 ? ids : ids.slice(0, cut), right = cut < 0 ? [] : ids.slice(cut); return same(left, ins) && same(right, outs); };
  if (ARROW.test(str)) { const [l, r = ''] = str.split(ARROW); return cofSplits(m, l).some(a => same(a, ins)) && cofSplits(m, r).some(b => same(b, outs)); }
  return cofSplits(m, str).some(listOk);
}
// How many of a reaction's cofactors are typed so far (for the optional "1/2" counter).
function cofProgress(m, raw, c) {
  const want = new Set([...(c.in || []), ...(c.out || [])]);
  const count = ids => new Set(ids.filter(x => x && want.has(x))).size, text = String(raw).replace(ARROW, ' ');
  return { got: Math.max(count(cofIds(m, text)), ...cofSplits(m, text).map(count)), total: want.size };
}

/* ---------- accepted spellings ----------
   Enzyme names usually contain a metabolite's name ("δ-aminolevulinic acid synthase"), so every name a metabolite
   goes by (full, abbreviation, aliases) can stand in for it: "ALA synthase", "δ-ALA synthase", "5-aminolevulinate
   synthase" all count. Plus "-ic acid" ≡ "-ate", and Greek letters written as letters or words. These display strings
   are also what letter-by-letter checking and hints follow, so whichever spelling you type is the one you're guided on. */
const VARIANT_CAP = 160;
/* Full names vs nicknames. Each element has full names (its name and "also called" aliases) and nicknames (its short
   form and "sometimes written as" nicknames: Gly, PFK-1, ALAS). An element whose nickname list hasn't been written yet
   (older or self-made pathways) is sorted by shape instead: one-word, short or capital-heavy spellings are nicknames. */
const looksAbbreviated = v => !/\s/.test(v.trim()) && !/[a-z]{3,}/.test(v) && /[A-Z0-9]/.test(v) && (norm(v).length <= 4 || (v.match(/[A-Z0-9]/g) || []).length >= 2);
function nameSets(x) {
  const short = x.short && norm(x.short) !== norm(x.name) ? [x.short] : [];
  const all = uniq([x.name, ...(x.aliases || [])].filter(Boolean));
  const sorted = (x.nicknames || []).length > 0;
  const listed = sorted ? x.nicknames.filter(Boolean) : all.filter(v => v !== x.name && looksAbbreviated(v));
  const nick = uniq([...short, ...listed]), nn = new Set(nick.map(norm));
  const full = all.filter(v => !nn.has(norm(v)));
  // The display name is a nickname only when it's listed as one (PRPP) or, unsorted, looks like one and a full name exists.
  if (!sorted && full.length > 1 && looksAbbreviated(x.name)) return { full: full.filter(v => v !== x.name), nick: [x.name, ...nick] };
  return { full, nick };
}
let SYNONYMS = null;
function synonymClasses() {
  if (SYNONYMS) return SYNONYMS;
  const seen = new Set();
  SYNONYMS = [];
  for (const p of Object.values(Library.builtin())) for (const met of Object.values(p.metabolites || {})) {
    const { full, nick } = nameSets(met);
    const names = [...full.map(n => ({ n, full: true })), ...nick.map(n => ({ n, full: false }))].filter(x => x.n.trim().length >= 3);
    const key = names.map(x => norm(x.n)).sort().join('|');
    if (names.length > 1 && !seen.has(key)) { seen.add(key); SYNONYMS.push(names); }
  }
  return SYNONYMS;
}
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VARIANT_CACHE = new WeakMap();
// Every spelling of an element, each marked full or not: a variant is full only if everything it's built from is.
function variantsOf(item) {
  if (!item) return [];
  if (VARIANT_CACHE.has(item)) return VARIANT_CACHE.get(item);
  const out = new Map(); // spelling → full?
  const add = (v, full) => { v = v.replace(/\s+/g, ' ').trim(); if (!v) return; if (out.has(v)) { if (full) out.set(v, true); } else if (out.size < VARIANT_CAP) out.set(v, full); };
  const { full, nick } = item.kind === 'loc' ? { full: [item.name, ...(item.aliases || [])], nick: [] } : nameSets(item);
  full.forEach(v => add(v, true)); nick.forEach(v => add(v, false));
  const named = item.kind === 'enz' || item.kind === 'trn'; // a metabolite already lists its own names; compartment twins must stay apart
  if (item.kind !== 'loc') {
    // substitute any name of a metabolite that appears inside an enzyme's name (word-bounded, case-insensitive)
    if (named) for (const cls of synonymClasses()) for (const a of cls) {
      const re = new RegExp(`(^|[^A-Za-z0-9])${escRe(a.n)}(?=$|[^A-Za-z0-9])`, 'i');
      for (const [v, f] of [...out]) { if (!re.test(v)) continue; for (const b of cls) if (b.n !== a.n) add(v.replace(re, `$1${b.n}`), f && b.full); }
    }
    for (const [v, f] of [...out]) {
      add(v.replace(/\b(\w+)ic acid\b/gi, '$1ate'), f);                 // pyruvic acid → pyruvate
      add(v.replace(/[αβγδ]-?/g, c => ({ α: 'alpha-', β: 'beta-', γ: 'gamma-', δ: 'delta-' })[c[0]]), f); // δ- → delta-
      add(v.replace(/\b(alpha|beta|gamma|delta)[-\s]?/gi, w => ({ alpha: 'α-', beta: 'β-', gamma: 'γ-', delta: 'δ-' })[w.replace(/[-\s]/, '').toLowerCase()]), f);
      if (named) add(v.replace(/\s*\([^)]*\)/g, ''), f);               // drop a parenthetical qualifier (enzymes only)
    }
  }
  const list = [...out].map(([v, f]) => ({ v, full: f }));
  VARIANT_CACHE.set(item, list);
  return list;
}
// Generated spellings never make an answer ambiguous: one that another item in the same pathway also claims is dropped.
// (The spellings written in the data always count, as before.)
const CLAIMS = new WeakMap();
function claimsOf(m) {
  if (CLAIMS.has(m)) return CLAIMS.get(m);
  const own = new Map();
  for (const it of Object.values(m.items)) if (['met', 'enz', 'trn'].includes(it.kind)) for (const { v } of variantsOf(it)) { const f = norm(v); (own.get(f) || own.set(f, new Set()).get(f)).add(it.name); }
  CLAIMS.set(m, own);
  return own;
}
// "Require full names": only full spellings count, unless an element has none at all (then its nicknames still do).
function spellingsFor(item, m, fullOnly = false) {
  const { full, nick } = item.kind === 'loc' ? { full: [item.name], nick: [] } : nameSets(item);
  const data = new Set([...full, ...nick].map(norm));
  const claims = m ? claimsOf(m) : null;
  const all = variantsOf(item), anyFull = all.some(x => x.full);
  return all.filter(({ v, full: f }) => {
    if (fullOnly && anyFull && !f) return false;
    const n = norm(v);
    return data.has(n) || !claims || [...(claims.get(n) || [])].every(x => x === item.name);
  }).map(x => x.v);
}
const acceptedFor = (item, m, full = false) => uniq(spellingsFor(item, m, full).map(norm));
// Every right way to write a reaction's cofactors: each side in any order, ins before outs ("A + B → C", "B, A, C").
function cofTargets(m, c) {
  const ins = (c.in || []).map(id => cofName(m, id)), outs = (c.out || []).map(id => cofName(m, id));
  if (!ins.length && !outs.length) return ['none'];
  const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
  const t = new Set([cofText(m, c)]);
  for (const a of perms(ins)) for (const b of perms(outs)) {
    if (a.length && b.length) t.add(`${a.join(' + ')} → ${b.join(' + ')}`);
    if (a.length && b.length) t.add(`${a.join(' + ')} -> ${b.join(' + ')}`);
    t.add([...a, ...b].join(', ')); t.add([...a, ...b].join(' + '));
  }
  return [...t];
}

/* ---------- across pathways ---------- */
const modelCache = new Map();
function modelFor(p) {
  const hit = modelCache.get(p.id);
  if (hit && hit.src === p) return hit.m;
  const m = buildModel(p);
  modelCache.set(p.id, { src: p, m });
  return m;
}
// Every pathway containing an enzyme that answers to any of this enzyme's names.
// Matches on full names and aliases, not abbreviations: "PGM" is both phosphoglycerate mutase and phosphoglucomutase.
function pathwaysWithEnzyme(item) {
  const names = e => [e.name, ...(e.aliases || [])].map(norm);
  const acc = new Set(names(item)), out = [];
  for (const p of Library.atomic())
    if (Object.values(p.enzymes || {}).some(e => names(e).some(a => acc.has(a)))) out.push(p);
  return out;
}
const pathwayAccepted = p => uniq([p.name, p.id, ...(p.aliases || [])].map(norm));

// Unordered set of metabolites typed as "G3P, DHAP" / "G3P + dihydroxyacetone phosphate".
// Names contain commas (fructose-1,6-bisphosphate), so tokens are re-joined greedily to the longest name that matches.
function parseMets(m, raw) {
  const map = {};
  for (const [id, x] of Object.entries(m.p.metabolites)) for (const a of [id, x.name, x.short, ...(x.aliases || []), ...(x.nicknames || [])]) if (a) map[norm(a)] = id;
  const toks = String(raw).split(/[,;+]|\band\b/i).map(t => t.trim()).filter(Boolean);
  const got = [];
  for (let i = 0; i < toks.length;) {
    let hit = 0;
    for (let j = toks.length; j > i; j--) if (map[norm(toks.slice(i, j).join(','))]) { hit = j; break; }
    if (!hit) return null;
    got.push(map[norm(toks.slice(i, hit).join(','))]); i = hit;
  }
  return got;
}
function sameSet(a, b) { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every(x => B.has(x)); }
const reactantsOf = r => [r.from, ...(r.also_from || [])];
const productsOf = r => [r.to, ...(r.also_to || [])];
const metNames = (m, ids) => ids.map(id => m.p.metabolites[id]?.name || id).join(' + ');

/* ---------- locations ---------- */
// Which compartment (and tissue, when a pathway spans tissues) a step or metabolite sits in.
const zoneKey = (m, loc, tissue) => (m.multiTissue ? (tissue || m.p.tissue || '') + '|' : '') + canonLoc(loc || '');
// Label for where a step happens: compartment, plus tissue when the pathway spans more than one.
function locLabel(m, r) {
  const tissues = new Set(m.p.reactions.map(x => x.tissue || '').filter(Boolean));
  return [tissues.size > 1 || (tissues.size === 1 && m.p.reactions.some(x => !x.tissue)) ? r.tissue || m.p.tissue : '', r.loc].filter(Boolean).join(' · ');
}
// Loose match for typed locations: "mito", "matrix" and "mitochondrion" all mean mitochondria; cytoplasm = cytosol.
function canonLoc(s) {
  const n = norm(s);
  if (/intermembrane/.test(n)) return 'intermembrane space';
  if (/mito|matrix|innermembrane/.test(n)) return 'mitochondria';
  if (/^er|^smoother|^rougher|endoplasmic|microsom/.test(n)) return 'er';
  if (/cyto(sol|plasm)|cytoplasm/.test(n)) return 'cytosol';
  return [['lysosom', 'lysosome'], ['peroxisom', 'peroxisome'], ['nucle', 'nucleus'], ['vesic', 'vesicle'], ['brush', 'brush border'], ['plasmamembrane', 'plasma membrane'], ['blood', 'blood'], ['golgi', 'golgi']].find(([k]) => n.includes(k))?.[1] || n;
}
