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
    items['m:' + id] = { key: 'm:' + id, kind: 'met', id, name: m.name, short: m.short, aliases: m.aliases || [], notes: m.notes };
  const m0 = { cof };
  for (const r of rx) {
    const e = enzs[r.enzyme];
    items['e:' + r.id] = { key: 'e:' + r.id, kind: r.transport ? 'trn' : 'enz', id: r.enzyme, rxn: r, name: e.name, short: e.short, aliases: e.aliases || [], notes: e.notes };
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

/* ---------- accepted spellings ----------
   Enzyme names usually contain a metabolite's name ("δ-aminolevulinic acid synthase"), so every name a metabolite
   goes by (full, abbreviation, aliases) can stand in for it: "ALA synthase", "δ-ALA synthase", "5-aminolevulinate
   synthase" all count. Plus "-ic acid" ≡ "-ate", and Greek letters written as letters or words. These display strings
   are also what letter-by-letter checking and hints follow, so whichever spelling you type is the one you're guided on. */
const VARIANT_CAP = 160;
let SYNONYMS = null;
function synonymClasses() {
  if (SYNONYMS) return SYNONYMS;
  const seen = new Set();
  SYNONYMS = [];
  for (const p of Object.values(Library.builtin())) for (const met of Object.values(p.metabolites || {})) {
    const names = uniq([met.name, met.short, ...(met.aliases || [])].filter(n => n && n.trim().length >= 3));
    const key = names.map(norm).sort().join('|');
    if (names.length > 1 && !seen.has(key)) { seen.add(key); SYNONYMS.push(names); }
  }
  return SYNONYMS;
}
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VARIANT_CACHE = new WeakMap();
function variantsOf(item) {
  if (!item) return [];
  if (VARIANT_CACHE.has(item)) return VARIANT_CACHE.get(item);
  const out = new Set([item.name, item.short, ...(item.aliases || [])].filter(Boolean));
  const add = v => { if (out.size < VARIANT_CAP) out.add(v.replace(/\s+/g, ' ').trim()); };
  const named = item.kind === 'enz' || item.kind === 'trn'; // a metabolite already lists its own names; compartment twins must stay apart
  if (item.kind !== 'loc') {
    // substitute any name of a metabolite that appears inside an enzyme's name (word-bounded, case-insensitive)
    if (named) for (const cls of synonymClasses()) for (const a of cls) {
      const re = new RegExp(`(^|[^A-Za-z0-9])${escRe(a)}(?=$|[^A-Za-z0-9])`, 'i');
      for (const v of [...out]) { const hit = v.match(re); if (!hit) continue; for (const b of cls) if (b !== a) add(v.replace(re, `$1${b}`)); }
    }
    for (const v of [...out]) {
      add(v.replace(/\b(\w+)ic acid\b/gi, '$1ate'));                 // pyruvic acid → pyruvate
      add(v.replace(/[αβγδ]-?/g, c => ({ α: 'alpha-', β: 'beta-', γ: 'gamma-', δ: 'delta-' })[c[0]])); // δ- → delta-
      add(v.replace(/\b(alpha|beta|gamma|delta)[-\s]?/gi, w => ({ alpha: 'α-', beta: 'β-', gamma: 'γ-', delta: 'δ-' })[w.replace(/[-\s]/, '').toLowerCase()]));
      if (named) add(v.replace(/\s*\([^)]*\)/g, ''));                // drop a parenthetical qualifier (enzymes only)
    }
  }
  const list = [...out];
  VARIANT_CACHE.set(item, list);
  return list;
}
// Generated spellings never make an answer ambiguous: one that another item in the same pathway also claims is dropped.
// (The spellings written in the data always count, as before.)
const CLAIMS = new WeakMap();
function claimsOf(m) {
  if (CLAIMS.has(m)) return CLAIMS.get(m);
  const own = new Map();
  for (const it of Object.values(m.items)) if (['met', 'enz', 'trn'].includes(it.kind)) for (const f of variantsOf(it).map(norm)) (own.get(f) || own.set(f, new Set()).get(f)).add(it.name);
  CLAIMS.set(m, own);
  return own;
}
function spellingsFor(item, m) {
  const data = new Set([item.name, item.short, ...(item.aliases || [])].filter(Boolean).map(norm));
  const claims = m ? claimsOf(m) : null;
  return variantsOf(item).filter(v => { const n = norm(v); return data.has(n) || !claims || [...(claims.get(n) || [])].every(x => x === item.name); });
}
const acceptedFor = (item, m) => uniq(spellingsFor(item, m).map(norm));
// Every order of a reaction's cofactors, written as "A + B → C + D" or simply listed: all of them are right.
function cofTargets(m, c) {
  const ins = (c.in || []).map(id => cofName(m, id)), outs = (c.out || []).map(id => cofName(m, id));
  if (!ins.length && !outs.length) return ['none'];
  const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
  const t = new Set([cofText(m, c)]);
  for (const a of perms(ins)) for (const b of perms(outs)) t.add(outs.length ? `${a.join(' + ')} → ${b.join(' + ')}` : a.join(' + '));
  const all = [...ins, ...outs];
  if (all.length <= 6) for (const a of perms(all)) { t.add(a.join(', ')); t.add(a.join(' + ')); }
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
