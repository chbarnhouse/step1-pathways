/* Where user data lives.
   Self-hosted (served by server.py): /api/state on the server, so every device sees the same edits, presets and stats.
   Standalone (dist/pathways.html, GitHub Pages, any static host): this browser's localStorage — export to back up or share.
   Built-in pathways always come from window.PATHWAYS_BUNDLE (server-generated bundle.js, or inlined by build.py). */
'use strict';

const DEFAULT_SETTINGS = {
  answer: 'type',      // type | choice | self
  view: 'flow',        // flow | list
  dir: 'v',            // list direction: v | h
  zoom: 'width',       // width | fit | number
  follow: true,        // keep the current blank centered
  facts: true,         // show the facts card after each answer
  autoAdvance: true,   // Full recall moves on by itself after a right answer
};

const Store = {
  mode: 'local',
  data: { custom: {}, stats: {}, presets: [], settings: {} },
  async init() {
    let raw = null;
    if (!window.PATHWAYS_STANDALONE) {
      try {
        const r = await fetch('api/state', { cache: 'no-store' });
        if (r.ok) { raw = await r.json(); this.mode = 'server'; }
      } catch {}
    }
    if (!raw) { try { raw = JSON.parse(localStorage.getItem('pathways.data') || '{}'); } catch { raw = {}; } }
    this.data = Object.assign({ custom: {}, stats: {}, presets: [] }, raw);
    this.data.settings = Object.assign({}, DEFAULT_SETTINGS, raw.settings);
  },
  save() {
    clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 400);
    try { localStorage.setItem('pathways.changedAt', JSON.stringify(Date.now())); } catch {}
  },
  async flush() {
    const body = JSON.stringify(this.data);
    if (this.mode === 'server') {
      try { await fetch('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }); return; } catch {}
    }
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
const QUIZ_DEFAULTS = { mode: 'single', given: 'mets', start: 'random', ahead: 'show', weak: false, answer: null, view: null,
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
const DATA_NOTICE_HTML = `<p>STEP 1 Pathways has no accounts and no server, so nothing you do here is saved online. Your history, presets, favorites, tags and settings live in this browser’s storage.</p>
  <p>Browsers can erase that storage without warning: clearing history or site data, private windows, running low on space, or switching browsers or devices. If that happens, everything is lost and can’t be recovered.</p>
  <p><b>To keep your progress, download a backup often, and always at the end of a study session.</b> You can restore it in any browser from the dashboard or Settings.</p>`;
const DATA_ACK_LABEL = 'I understand my progress is saved only in this browser, and that I need to back it up.';
