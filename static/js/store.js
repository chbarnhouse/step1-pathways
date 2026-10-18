/* Where user data lives.
   Self-hosted (served by server.py): /api/state on the server, so every device sees the same edits, presets and stats.
   Standalone (dist/pathways.html, GitHub Pages, any static host): this browser's localStorage — export to back up or share.
   Built-in pathways always come from window.PATHWAYS_BUNDLE (server-generated bundle.js, or inlined by build.py). */
'use strict';

const DEFAULT_SETTINGS = {
  answer: 'type',      // type | choice | self
  view: 'flow',        // flow | list
  dir: 'v',            // list direction: v | h
  zoom: 'width',       // width | height | fit | number
  follow: true,        // keep the current blank centered
  facts: true,         // show the facts card after each answer
  autoAdvance: true,   // Full recall moves on by itself after a right answer
};

/* ---------- keeping saved data safe across updates ----------
   The rules (tools/test-data.js enforces them before every release):
   1. Saved data carries `schema`. Changing what gets saved means bumping SCHEMA and adding one step to MIGRATIONS
      (schema n → n+1). A step that has shipped is never edited; old data runs every step in order.
   2. Before upgrading, the old data is kept as a safety copy (this browser, or the server's daily backups).
   3. Data saved by a newer version is never overwritten by an older one: the app goes read-only and says why.
   4. Ids of built-in pathways, metabolites and reactions are what history, tags and favorites hang on. Renaming or
      removing one needs an entry in data/renames.json; the renames are applied to saved data here, on every load. */
const SCHEMA = 1;
const MIGRATIONS = [
  // 0 → 1: the first versioned format. Nothing changes but the stamp.
  d => d,
];
// Repair shapes instead of crashing on them: wrong types become empty, unknown fields are kept.
function normalizeData(raw) {
  const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {}), arr = x => (Array.isArray(x) ? x : []);
  const d = Object.assign({}, obj(raw));
  d.custom = obj(d.custom); d.stats = obj(d.stats); d.tags = obj(d.tags);
  d.presets = arr(d.presets).filter(x => x && typeof x === 'object');
  d.favorites = arr(d.favorites).filter(x => x && typeof x === 'object' && x.d);
  d.log = arr(d.log).filter(x => x && typeof x === 'object');
  for (const [pid, s] of Object.entries(d.stats)) {
    d.stats[pid] = obj(s);
    for (const [k, e] of Object.entries(d.stats[pid])) if (!e || typeof e.n !== 'number') delete d.stats[pid][k];
  }
  d.settings = Object.assign({}, DEFAULT_SETTINGS, obj(d.settings));
  return d;
}
// Built-in ids that were renamed: move everything saved under the old id to the new one. Safe to run any number of times.
function applyRenames(d, R) {
  if (!R) return d;
  const move = (o, from, to) => { if (o && from in o) { if (to in o && typeof o[to] === 'object' && typeof o[from] === 'object' && !Array.isArray(o[to])) o[to] = Object.assign({}, o[from], o[to]); else if (!(to in o)) o[to] = o[from]; delete o[from]; } };
  for (const [from, to] of Object.entries(R.pathways || {})) {
    for (const k of ['stats', 'tags', 'custom']) move(d[k], from, to);
    d.favorites.forEach(f => { if (f.d.pathway === from) f.d.pathway = to; });
    d.log.forEach(l => { if (Array.isArray(l.pathways)) l.pathways = l.pathways.map(x => (x === from ? to : x)); });
  }
  const itemRen = (pid, map, prefixes) => { const s = d.stats[pid]; if (!s) return; for (const [from, to] of Object.entries(map)) for (const pre of prefixes) move(s, pre + from, pre + to); };
  for (const [pid, map] of Object.entries(R.metabolites || {})) itemRen(pid, map, ['m:']);
  for (const [pid, map] of Object.entries(R.reactions || {})) itemRen(pid, map, ['e:', 'c:', 'o:', 'd:', 'r:', 'p:', 'w:']);
  return d;
}
// Everything a load does to saved data, in one pure function (also used for imported backups and by the tests).
function upgradeData(raw, renames) {
  const from = Number(raw && raw.schema) || 0;
  if (from > SCHEMA) return { data: null, from, newer: true };
  let d = Object.assign({}, raw || {});
  for (let v = from; v < SCHEMA; v++) d = MIGRATIONS[v](d) || d;
  d = applyRenames(normalizeData(d), renames);
  d.schema = SCHEMA;
  return { data: d, from, newer: false };
}
const isEmptyData = raw => !raw || !Object.keys(raw).some(k => k !== 'settings' && k !== 'schema');

const Store = {
  mode: 'local',
  readOnly: false, // data was saved by a newer version of the app
  data: normalizeData({}),
  async init() {
    let raw = null;
    if (!window.PATHWAYS_STANDALONE) {
      try {
        const r = await fetch('api/state', { cache: 'no-store' });
        if (r.ok) { raw = await r.json(); this.mode = 'server'; }
      } catch {}
    }
    if (!raw) { try { raw = JSON.parse(localStorage.getItem('pathways.data') || '{}'); } catch { raw = {}; } }
    const up = upgradeData(raw, window.PATHWAYS_BUNDLE && window.PATHWAYS_BUNDLE.renames);
    if (up.newer) { this.readOnly = true; this.data = normalizeData(raw); return; }
    if (up.from < SCHEMA && !isEmptyData(raw)) {
      // Keep the data exactly as it was before upgrading (the server also keeps daily copies of its own).
      try { localStorage.setItem(`pathways.safety.v${up.from}`, JSON.stringify({ savedAt: new Date().toISOString(), data: raw })); } catch {}
    }
    this.data = up.data;
    if (JSON.stringify(up.data) !== JSON.stringify(raw)) this.save();
  },
  save() {
    if (this.readOnly) return;
    clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 400);
    try { localStorage.setItem('pathways.changedAt', JSON.stringify(Date.now())); } catch {}
  },
  // Another tab or device moved the data to a newer format: stop writing and say so.
  goReadOnly() { this.readOnly = true; clearTimeout(this.t); if (typeof onReadOnly === 'function') onReadOnly(); },
  async flush() {
    if (this.readOnly) return;
    const body = JSON.stringify(this.data);
    if (this.mode === 'server') {
      try {
        const r = await fetch('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        if (r.status === 409) return this.goReadOnly();
        return;
      } catch {}
    }
    try { if ((Number(JSON.parse(localStorage.getItem('pathways.data') || '{}').schema) || 0) > SCHEMA) return this.goReadOnly(); } catch {}
    try { localStorage.setItem('pathways.data', body); } catch {}
    if (typeof AutoBackup !== 'undefined') AutoBackup.schedule(); // linked backup file (Chrome/Edge)
  },
  get settings() { return this.data.settings; },
};

const Library = {
  builtin: () => (window.PATHWAYS_BUNDLE && window.PATHWAYS_BUNDLE.pathways) || {},
  sharedCof: () => (window.PATHWAYS_BUNDLE && window.PATHWAYS_BUNDLE.cofactors) || {},
  raw(id) { return Store.data.custom[id] || this.builtin()[id]; },
  // Combined pathways ({compose: [ids]}) are merged on the fly, so edits to their parts flow through.
  all() {
    const out = {};
    for (const id of new Set([...Object.keys(this.builtin()), ...Object.keys(Store.data.custom)])) { const p = this.get(id); if (p) out[id] = p; }
    return out;
  },
  get(id) { const p = this.raw(id); return p && p.compose ? composePathway(p) : p; },
  atomic() { return Object.values(this.all()).filter(p => !p.compose); },
  status(id) { return Store.data.custom[id] ? (this.builtin()[id] ? 'edited' : 'custom') : 'builtin'; },
  list() {
    return Object.values(this.all()).map(p => ({ id: p.id, name: p.name, status: this.status(p.id), group: p.group || 'Other', steps: (p.reactions || []).length }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  },
  groups() {
    const g = {};
    for (const p of this.list()) (g[p.group] = g[p.group] || []).push(p);
    return g;
  },
};

/* ---------- quizzes ----------
   A quiz = which pathways + how to study them. Presets are saved quizzes; built-ins can't be edited, only copied.
   pathways: [] means "whatever is picked when you start it". */
const BUILTIN_PRESETS = [
  { id: 'b-blanks', name: 'Fill the blanks', blurb: 'One metabolite or enzyme hidden at a time.',
    mode: 'single', el: { met: 'quiz', enz: 'quiz', cof: 'show' } },
  { id: 'b-top', name: 'Recall from the top', blurb: 'Nothing shown. Rebuild the whole pathway in order.',
    mode: 'total', start: 'begin', el: { met: 'quiz', enz: 'quiz', cof: 'show' } },
  { id: 'b-random', name: 'Recall from anywhere', blurb: 'Random starting point; forward, then backward.',
    mode: 'total', start: 'random', el: { met: 'quiz', enz: 'quiz', cof: 'show' } },
  { id: 'b-enzyme', name: 'Name the enzyme', blurb: 'Two metabolites; which enzyme, which cofactors, which way.',
    mode: 'step', given: 'mets', el: { enz: 'quiz', cof: 'quiz', dir: 'quiz' } },
  { id: 'b-reaction', name: 'What does it do?', blurb: 'Given an enzyme: reactants, products, cofactors and pathway.',
    mode: 'step', given: 'enz', el: { met: 'quiz', cof: 'quiz', path: 'quiz' }, allPathways: true },
  { id: 'b-cofactors', name: 'Cofactor drill', blurb: 'Every cofactor hidden; everything else shown.',
    mode: 'single', el: { met: 'show', enz: 'show', cof: 'quiz' } },
  { id: 'b-direction', name: 'Which way?', blurb: 'Reversible or one-way, and in which direction.',
    mode: 'step', given: 'mets', el: { enz: 'show', cof: 'show', dir: 'quiz' } },
];
const QUIZ_DEFAULTS = { mode: 'single', given: 'mets', start: 'random', ahead: 'hide', autoSubmit: false, cofCount: true, weak: false, answer: null, view: null,
  el: { met: 'quiz', enz: 'quiz', trn: 'quiz', cof: 'show', loc: 'show', dir: 'quiz', path: 'quiz' } };
function normalizeQuiz(q) {
  const out = Object.assign(clone(QUIZ_DEFAULTS), clone(q || {}));
  out.el = Object.assign(clone(QUIZ_DEFAULTS.el), (q && q.el) || {});
  out.pathways = (out.pathways || []).filter(id => Library.get(id));
  return out;
}
/* ---------- combined pathways ----------
   The first part is the main line. Every other part's metabolites and enzymes are matched to it by name;
   a step that does the same thing (same enzyme, same metabolites, either direction) is shared and drawn once,
   anything else is added as a side step tagged with the pathway it belongs to ("only"). */
const composeCache = new Map();
function composePathway(def) {
  const parts = def.compose.map(id => Library.raw(id)).filter(p => p && !p.compose);
  const sig = JSON.stringify([def, parts]);
  const hit = composeCache.get(def.id);
  if (hit && hit.sig === sig) return hit.p;
  if (!parts.length) return { ...def, metabolites: {}, enzymes: {}, reactions: [] };
  const base = clone(parts[0]);
  const out = { ...base, ...def, compose: def.compose, metabolites: base.metabolites, enzymes: base.enzymes, reactions: base.reactions,
    cofactors: { ...(base.cofactors || {}) }, distractors: { metabolites: [...(base.distractors?.metabolites || [])], enzymes: [...(base.distractors?.enzymes || [])] } };
  delete out.circular; delete out.layout;
  const nameKey = x => norm(x.name);
  const metByName = new Map(Object.entries(out.metabolites).map(([id, m]) => [nameKey(m), id]));
  const enzByName = new Map(Object.entries(out.enzymes).map(([id, e]) => [nameKey(e), id]));
  const sameStep = (a, b) => a.enzyme === b.enzyme && sameSet([...reactantsOf(a), ...productsOf(a)], [...reactantsOf(b), ...productsOf(b)]);
  const matched = new Set();
  for (const q of parts.slice(1)) {
    const mid = {}, eid = {};
    for (const [id, m] of Object.entries(q.metabolites)) {
      const hitId = metByName.get(nameKey(m));
      if (hitId) mid[id] = hitId; else { const nid = `${q.id}.${id}`; out.metabolites[nid] = clone(m); metByName.set(nameKey(m), nid); mid[id] = nid; }
    }
    for (const [id, e] of Object.entries(q.enzymes)) {
      const hitId = enzByName.get(nameKey(e));
      if (hitId) eid[id] = hitId; else { const nid = `${q.id}.${id}`; out.enzymes[nid] = clone(e); enzByName.set(nameKey(e), nid); eid[id] = nid; }
    }
    Object.assign(out.cofactors, q.cofactors || {});
    out.distractors.metabolites.push(...(q.distractors?.metabolites || []));
    out.distractors.enzymes.push(...(q.distractors?.enzymes || []));
    for (const r of q.reactions) {
      const mr = { ...clone(r), id: `${q.id}.${r.id}`, enzyme: eid[r.enzyme], from: mid[r.from], to: mid[r.to] };
      if (r.also_to) mr.also_to = r.also_to.map(x => mid[x]);
      if (r.also_from) mr.also_from = r.also_from.map(x => mid[x]);
      const twin = out.reactions.find(b => sameStep(b, mr));
      if (twin) { matched.add(twin.id); continue; }
      mr.branch = true; mr.only = q.name;
      out.reactions.push(mr);
    }
  }
  for (const r of out.reactions) if (!r.only && !matched.has(r.id) && parts.length > 1) r.only = parts[0].name;
  out.distractors.metabolites = uniq(out.distractors.metabolites);
  out.distractors.enzymes = uniq(out.distractors.enzymes);
  composeCache.set(def.id, { sig, p: out });
  return out;
}

const Presets = {
  all() { return [...BUILTIN_PRESETS.map(p => ({ ...p, builtin: true })), ...Store.data.presets]; },
  get(id) { return this.all().find(p => p.id === id); },
  save(p) {
    const i = Store.data.presets.findIndex(x => x.id === p.id);
    if (i >= 0) Store.data.presets[i] = p; else Store.data.presets.push(p);
    Store.save();
  },
  remove(id) { Store.data.presets = Store.data.presets.filter(p => p.id !== id); Store.save(); },
};

/* ---------- data notice text (used by the tour and the standalone gate in app.js) ---------- */
const needsDataAck = () => Store.mode === 'local' && !local.get('pathways.dataAck');
const DATA_NOTICE_TITLE = 'Your progress is saved only in this browser';
const DATA_NOTICE_HTML = `<p>Step 1 Pathways has no accounts and no server, so nothing you do here is saved online. Your history, presets, favorites, tags and settings live in this browser’s storage.</p>
  <p>Browsers can erase that storage without warning: clearing history or site data, private windows, running low on space, or switching browsers or devices. If that happens, everything is lost and can’t be recovered.</p>
  <p><b>To keep your progress, download a backup often, and always at the end of a study session.</b> You can restore it in any browser from the dashboard or Settings.</p>`;
const DATA_ACK_LABEL = 'I understand my progress is saved only in this browser, and that I need to back it up.';
