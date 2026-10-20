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
   circular:true → the last spine reaction returns to the first metabolite. pathway.tissue = where the pathway runs.
   groups[] {id, name, aliases, members[], notes}: named sets of metabolites (cells) drawn inside one dashed frame.
   effects:true → every step activates, or inhibits (tag "inhibits"); quizzable. */
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
    items['m:' + id] = { key: 'm:' + id, kind: 'met', id, name: m.name, short: m.short, aliases: m.aliases || [], nicknames: m.nicknames, notes: m.notes, term: m.term || p.terms?.met };
  const m0 = { cof };
  for (const r of rx) {
    const e = enzs[r.enzyme];
    items['e:' + r.id] = { key: 'e:' + r.id, kind: r.transport ? 'trn' : 'enz', id: r.enzyme, rxn: r, name: e.name, short: e.short, aliases: e.aliases || [], nicknames: e.nicknames, notes: e.notes, term: r.transport ? undefined : e.term || p.terms?.enz };
    // A step's cofactors are quizzable, one blank per side: 'c:<step>' is what goes in (or the only side there is),
    // 'o:<step>' what comes out when both sides exist. (Before 3.9 'c:' was the whole set; its history stays with the inputs.)
    const c = r.cofactors || {}, ci = c.in || [], co = c.out || [];
    const cofItem = (key, cofs) => ({ key, kind: 'cof', side: cofs.in ? 'in' : 'out', rxn: r, cofs, name: cofText(m0, cofs), aliases: [], notes: null });
    if (ci.length || co.length) items['c:' + r.id] = cofItem('c:' + r.id, ci.length ? { in: ci } : { out: co });
    if (ci.length && co.length) items['o:' + r.id] = cofItem('o:' + r.id, { out: co });
    // What the step needs (B6, biotin, TPP…): quizzed with the cofactors, any order, as 'n:<step>'.
    if ((r.requires || []).length) items['n:' + r.id] = { key: 'n:' + r.id, kind: 'cof', side: 'need', rxn: r, cofs: { in: needIds(cof, r) }, name: r.requires.join(', '), aliases: [], notes: null };
    // Its effect, in a pathway that marks them ("effects": true): it activates, or it inhibits (tag "inhibits"), as 'f:<step>'.
    if (p.effects || r.fx) {
      const inh = (r.tags || []).includes('inhibits');
      items['f:' + r.id] = { key: 'f:' + r.id, kind: 'eff', id: r.id, rxn: r, name: inh ? 'Inhibits' : 'Activates', short: '', notes: null,
        aliases: inh ? ['inhibits', 'inhibit', 'inhibition', 'blocks', 'downregulates', 'suppresses', 'inactivates'] : ['activates', 'activate', 'activation', 'induces', 'stimulates', 'upregulates', 'promotes'] };
    }
  }

  const spineMets = p.circular ? spine.map(r => r.from) : [spine[0].from, ...spine.map(r => r.to)];
  const onSpine = new Set(spineMets);
  const branches = rx.filter(r => r.branch);

  // Reading order for Full recall and the List view: metabolite, enzyme, metabolite…
  // Side products follow the enzyme that makes them; side inputs come just before the enzyme that uses them;
  // dead-end branches follow the metabolite they leave from.
  const seq = [], seen = new Set();
  const push = k => { if (!seen.has(k)) { seen.add(k); seq.push(k); } };
  const pushRx = r => { push('e:' + r.id); for (const k of ['f:', 'c:', 'o:', 'n:']) if (items[k + r.id]) push(k + r.id); };
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
  // Groupings ('g:<id>'): named sets of boxes drawn as a dashed frame (myeloid cells; the COX branch). Read last.
  for (const g of p.groups || []) {
    const members = (g.members || []).filter(id => mets[id]);
    if (!g.id || !g.name || !members.length) continue;
    items['g:' + g.id] = { key: 'g:' + g.id, kind: 'grp', id: g.id, name: g.name, short: g.short || '', aliases: g.aliases || [], notes: g.notes, members, term: 'group' };
    push('g:' + g.id);
  }
  const pairs = [];
  for (const r of rx) {
    pairs.push({ r, a: r.from, b: r.to });
    for (const s of r.also_to || []) pairs.push({ r, a: r.from, b: s });
    for (const s of r.also_from || []) pairs.push({ r, a: s, b: r.to });
  }
  return { p, cof, items, spine, spineMets, onSpine, branches, seq, pairs, multiTissue: m0z.multiTissue };
}

/* ---------- what a step needs (r.requires) ----------
   Read from its text: "B6 (pyridoxal phosphate)" answers to B6, vitamin B6, pyridoxal phosphate, PLP and pyridoxine.
   One that is already a cofactor (FAD, NAD⁺, BH₄, ascorbate) is that cofactor, with the vitamin's names added. */
const VITAMINS = { b1: ['thiamine', 'thiamin', 'TPP', 'thiamine pyrophosphate', 'thiamine diphosphate'], b2: ['riboflavin'], b3: ['niacin', 'nicotinic acid'],
  b5: ['pantothenic acid', 'pantothenate'], b6: ['pyridoxine', 'PLP', 'pyridoxal phosphate', 'pyridoxal 5-phosphate'], b7: ['biotin'], b9: ['folate', 'folic acid'], b12: ['cobalamin'] };
function needNames(text) {
  const t = String(text).trim(), mm = t.match(/^(.*?)\s*\(([^)]*)\)\s*$/), al = new Set([t, ...(mm ? [mm[1], mm[2]] : [])]);
  for (const a of [...al]) { const v = a.match(/^(?:vitamin\s+)?b\s?(\d{1,2})$/i); if (v) al.add('B' + v[1]); }
  for (const [b, names] of Object.entries(VITAMINS)) if ([...al].some(a => norm(a) === b || norm(a) === 'vitamin ' + b || names.some(n => norm(n) === norm(a)))) {
    al.add(b.toUpperCase()); al.add('Vitamin ' + b.toUpperCase()); names.forEach(n => al.add(n));
  }
  if (/copper/i.test(t)) al.add('Cu');
  return [...al].filter(Boolean);
}
function needIds(cof, r) {
  return (r.requires || []).map(text => {
    const lk = cofLookup(cof).map, names = needNames(text), hit = names.map(n => lk[norm(n)]).find(Boolean);
    if (hit) { cof[hit] = { ...cof[hit], aliases: uniq([...(cof[hit].aliases || []), ...names.filter(n => !lk[norm(n)])]) }; return hit; }
    const id = 'need:' + norm(text);
    cof[id] = { name: text, aliases: names };
    return id;
  });
}

/* ---------- cofactors ---------- */
const cofName = (m, id) => (m.cof[id] && m.cof[id].name) || id;
const cofItemsOf = (m, r) => ['c:', 'o:'].map(k => m.items[k + r.id]).filter(Boolean); // a step's cofactor blanks, inputs first
const cofSideText = (m, c) => [...(c.in || []), ...(c.out || [])].map(id => cofName(m, id)).join(' + ');
function cofText(m, c) {
  const i = (c.in || []).map(id => cofName(m, id)), o = (c.out || []).map(id => cofName(m, id));
  if (!i.length && !o.length) return 'None';
  // One side only: just the molecules, with the arrow saying which side ("ATP →" goes in, "→ H₂O" comes out).
  if (!i.length) return '→ ' + o.join(' + ');
  if (!o.length) return i.join(' + ') + ' →';
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
// Typing cofactors one at a time: the cofactor (still wanted) that this text names outright, or null. Never one that
// another wanted cofactor's name continues ("NAD" while NADH is also wanted), so a longer name can still be typed.
function cofLockable(m, raw, want) {
  const k = cofNorm(raw), { map, keys } = cofKeys(m), id = map[k];
  if (!k || !id || !want.includes(id)) return null;
  return keys.some(x => x.length > k.length && x.startsWith(k) && want.includes(map[x]) && map[x] !== id) ? null : id;
}
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
/* Three tiers for what an answer may be (the quiz's "Names" setting):
   0 full      spelled out: "δ-aminolevulinic acid synthase", "phosphofructokinase-1"
   1 common    the name the app shows, or a nickname with a real word in it: "ALA synthase", "HMG-CoA reductase", "PBG deaminase"
   2 any       bare abbreviations too: "ALAS", "HMGCR", "PFK-1", "G6P" */
const NAME_TIERS = { full: 0, common: 1, any: 2 };
const tierOf = t => (t === true ? 0 : NAME_TIERS[t] ?? 2); // older callers pass true for "full names"
const nameTierCfg = cfg => cfg?.names || (cfg?.fullNames ? 'full' : 'any'); // presets saved before 3.9 have fullNames
/* What each tier of name does in a quiz: 'auto' counts the moment it's typed, 'enter' counts when you press Enter,
   'off' doesn't count (you're asked for a fuller name, never marked wrong). Quizzes saved earlier carry
   names (full/common/any) and autoSubmit instead; they read as the closest match. */
const TIER_KEYS = ['full', 'common', 'any'];
const NAME_MODE_DEFAULTS = { full: 'auto', common: 'enter', any: 'enter' };
function nameModesCfg(cfg) {
  if (cfg?.nameModes) return { ...NAME_MODE_DEFAULTS, ...cfg.nameModes };
  const lim = tierOf(nameTierCfg(cfg)), on = cfg?.autoSubmit ? 'auto' : null;
  return Object.fromEntries(TIER_KEYS.map((k, i) => [k, i > lim ? 'off' : on || NAME_MODE_DEFAULTS[k]]));
}
const hasWord = v => (v.match(/[a-z]{4,}/g) || []).some(w => !/^(alpha|beta|gamma|delta)$/.test(w));
function nameTiers(x) {
  const { full, nick } = nameSets(x);
  return [...full.map(n => ({ n, tier: 0 })), ...nick.map(n => ({ n, tier: n === x.name || hasWord(n) ? 1 : 2 }))];
}
let SYNONYMS = null;
function synonymClasses() {
  if (SYNONYMS) return SYNONYMS;
  const seen = new Set();
  SYNONYMS = [];
  for (const p of Object.values(Library.builtin())) for (const met of Object.values(p.metabolites || {})) {
    const names = nameTiers(met).filter(x => x.n.trim().length >= 3);
    const key = names.map(x => norm(x.n)).sort().join('|');
    if (names.length > 1 && !seen.has(key)) { seen.add(key); SYNONYMS.push(names); }
  }
  return SYNONYMS;
}
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VARIANT_CACHE = new WeakMap();
// Every spelling of an element with its tier: a variant is as abbreviated as the most abbreviated name it's built from.
function variantsOf(item) {
  if (!item) return [];
  if (VARIANT_CACHE.has(item)) return VARIANT_CACHE.get(item);
  const out = new Map(); // spelling → tier
  const add = (v, t) => { v = v.replace(/\s+/g, ' ').trim(); if (!v) return; if (out.has(v)) out.set(v, Math.min(out.get(v), t)); else if (out.size < VARIANT_CAP) out.set(v, t); };
  (item.kind === 'loc' ? [item.name, ...(item.aliases || [])].map(n => ({ n, tier: 0 })) : nameTiers(item)).forEach(x => add(x.n, x.tier));
  const named = item.kind === 'enz' || item.kind === 'trn'; // a metabolite already lists its own names; compartment twins must stay apart
  if (item.kind !== 'loc') {
    // substitute any name of a metabolite that appears inside an enzyme's name (word-bounded, case-insensitive)
    if (named) for (const cls of synonymClasses()) for (const a of cls) {
      const re = new RegExp(`(^|[^A-Za-z0-9])${escRe(a.n)}(?=$|[^A-Za-z0-9])`, 'i');
      for (const [v, f] of [...out]) { if (!re.test(v)) continue; for (const b of cls) if (b.n !== a.n) { const w = v.replace(re, `$1${b.n}`), t = Math.max(f, b.tier); add(w, t === 2 && f <= 1 && hasWord(w) ? 1 : t); } } // "δ-ALA synthase" reads as common
    }
    for (const [v, f] of [...out]) {
      add(v.replace(/\b(\w+)ic acid\b/gi, '$1ate'), f);                 // pyruvic acid → pyruvate
      add(v.replace(/[αβγδ]-?/g, c => ({ α: 'alpha-', β: 'beta-', γ: 'gamma-', δ: 'delta-' })[c[0]]), f); // δ- → delta-
      add(v.replace(/\b(alpha|beta|gamma|delta)[-\s]?/gi, w => ({ alpha: 'α-', beta: 'β-', gamma: 'γ-', delta: 'δ-' })[w.replace(/[-\s]/, '').toLowerCase()]), f);
      if (named) add(v.replace(/\s*\([^)]*\)/g, ''), f);               // drop a parenthetical qualifier (enzymes only)
    }
  }
  const list = [...out].map(([v, tier]) => ({ v, tier }));
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
// Every accepted spelling of an element with its tier (0 full, 1 common, 2 any). An element with nothing spelled out
// (no full name at all) has its plainest names treated as full. Generated spellings another item also claims are dropped.
function spellingTiers(item, m) {
  const { full, nick } = item.kind === 'loc' ? { full: [item.name], nick: [] } : nameSets(item);
  const data = new Set([...full, ...nick].map(norm));
  const claims = m ? claimsOf(m) : null;
  const all = variantsOf(item), low = Math.min(...all.map(x => x.tier));
  return all.filter(({ v }) => { const n = norm(v); return data.has(n) || !claims || [...(claims.get(n) || [])].every(x => x === item.name); })
    .map(({ v, tier }) => ({ v, tier: tier === low ? 0 : tier }));
}
// Spellings up to a tier ('full' / 'common' / 'any').
const spellingsFor = (item, m, names = 'any') => spellingTiers(item, m).filter(x => x.tier <= tierOf(names)).map(x => x.v);
// The tier of a typed answer, or null when it isn't one of the element's names at all.
function answerTier(item, m, v) {
  const n = norm(v); let best = null;
  for (const x of spellingTiers(item, m)) if (norm(x.v) === n && (best === null || x.tier < best)) best = x.tier;
  return best;
}
const acceptedFor = (item, m, names = 'any') => uniq(spellingsFor(item, m, names).map(norm));
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
// Other proper names for a compartment, offered to letter checking and hints (grading already reads them via canonLoc).
const LOC_ALSO = { cytosol: ['cytoplasm'], mitochondria: ['mitochondrion', 'mitochondrial matrix'], er: ['endoplasmic reticulum'] };
function canonLoc(s) {
  const n = norm(s);
  if (/intermembrane/.test(n)) return 'intermembrane space';
  if (/mito|matrix|innermembrane/.test(n)) return 'mitochondria';
  if (/^er|^smoother|^rougher|endoplasmic|microsom/.test(n)) return 'er';
  if (/cyto(sol|plasm)|cytoplasm|^cyto$/.test(n)) return 'cytosol'; // "cyto" is a common abbreviation, like "mito"
  return [['lysosom', 'lysosome'], ['peroxisom', 'peroxisome'], ['nucle', 'nucleus'], ['vesic', 'vesicle'], ['brush', 'brush border'], ['plasmamembrane', 'plasma membrane'], ['blood', 'blood'], ['golgi', 'golgi']].find(([k]) => n.includes(k))?.[1] || n;
}
