/* Pathway JSON → study model.
   reactions[] in pathway order. A reaction is on the spine unless branch:true.
     from / to          main substrate → main product
     also_to[]          side products (e.g. aldolase → DHAP)
     also_from[]        side inputs drawn as metabolites (e.g. gluconeogenic aldolase ← DHAP)
     branch:true        a side reaction between a spine metabolite and a side one, either direction
     cofactors {in,out} ids from the shared cofactor list or the pathway's own `cofactors`
     reversible, multiplier, loc, requires[], tags[]
   circular:true → the last spine reaction returns to the first metabolite. */
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
    items['m:' + id] = { key: 'm:' + id, kind: 'met', id, name: m.name, short: m.short, aliases: m.aliases || [], notes: m.notes };
  const m0 = { cof };
  for (const r of rx) {
    const e = enzs[r.enzyme];
    items['e:' + r.id] = { key: 'e:' + r.id, kind: 'enz', id: r.enzyme, rxn: r, name: e.name, short: e.short, aliases: e.aliases || [], notes: e.notes };
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
  }
  for (const k of Object.keys(items)) push(k); // anything unreachable still gets studied

  const pairs = [];
  for (const r of rx) {
    pairs.push({ r, a: r.from, b: r.to });
    for (const s of r.also_to || []) pairs.push({ r, a: r.from, b: s });
    for (const s of r.also_from || []) pairs.push({ r, a: s, b: r.to });
  }
  return { p, cof, items, spine, spineMets, onSpine, branches, seq, pairs };
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
    if (/\s/.test(a.trim())) phrases.push([a.toLowerCase(), id]);
  }
  phrases.sort((a, b) => b[0].length - a[0].length);
  return { map, phrases };
}
const IGNORE = new Set(['', '+', 'h+', 'h', 'mg2+', 'mg', 'and']);
// Unordered set match: "NAD+, Pi, NADH" ≡ "nad+ + inorganic phosphate -> nadh".
function gradeCof(m, raw, c) {
  const want = new Set([...(c.in || []), ...(c.out || [])]);
  let s = String(raw).toLowerCase().trim();
  if (!want.size) return /^(none|nothing|no|n\/?a|-|—)?$/.test(s.replace(/\s/g, ''));
  const { map, phrases } = cofLookup(m.cof);
  for (const [ph, id] of phrases) s = s.split(ph).join(' ' + id + ' ');
  const toks = s.split(/[,;\/\s]+|→|->|=>|⇌/).map(norm).filter(t => !IGNORE.has(t));
  const got = new Set();
  for (const t of toks) { if (!map[t]) return false; got.add(map[t]); }
  return got.size === want.size && [...want].every(x => got.has(x));
}

const acceptedFor = item => uniq([item.name, item.short, ...(item.aliases || [])].filter(Boolean).map(norm));

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
  for (const p of Object.values(Library.all()))
    if (Object.values(p.enzymes || {}).some(e => names(e).some(a => acc.has(a)))) out.push(p);
  return out;
}
const pathwayAccepted = p => uniq([p.name, p.id, ...(p.aliases || [])].map(norm));

// Unordered set of metabolites typed as "G3P, DHAP" / "G3P + dihydroxyacetone phosphate".
// Names contain commas (fructose-1,6-bisphosphate), so tokens are re-joined greedily to the longest name that matches.
function parseMets(m, raw) {
  const map = {};
  for (const [id, x] of Object.entries(m.p.metabolites)) for (const a of [id, x.name, x.short, ...(x.aliases || [])]) if (a) map[norm(a)] = id;
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
