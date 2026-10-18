/* Pathway editor: build or change a pathway with a live diagram preview.
   Built-in pathways are never overwritten — saving one stores an edited copy under the same id ("Reset" removes it).
   Export / Import move a pathway between people as a .json file.
   Three views of the same draft: Visual (canvas-editor.js), Form and JSON. Every change can be undone,
   and on an edited built-in each field that differs from the original is marked with its own Revert. */
'use strict';

// Icons offered for pathways (all in icons.js).
const PATHWAY_ICONS = ['route', 'call_split', 'no_meals', 'cycle', 'wc', 'shield', 'bloodtype', 'monitor_heart', 'breastfeeding', 'nutrition', 'visibility', 'psychology',
  'inventory_2', 'fitness_center', 'opacity', 'local_fire_department', 'egg', 'stress_management', 'genetics', 'sync_alt', 'lightbulb', 'flag', 'bookmark_add'];
const LOCS = ['cytosol', 'mitochondria', 'mitochondrial matrix', 'ER', 'peroxisome', 'lysosome', 'nucleus'];
const E = { draft: null, origId: null, mode: 'visual', err: '', sel: null, undo: [], redo: [], view: null, snap: true };

function blankPathway() {
  return { id: '', name: 'New pathway', group: 'Mine', summary: '', circular: false, multiplier_label: '',
    metabolites: {}, enzymes: {}, reactions: [], cofactors: {}, distractors: { metabolites: [], enzymes: [] } };
}
// focusKey (deep links #/pathways/<id>/edit/<key>): a quiz item key — m:<metabolite>, e:<reaction>, c:<reaction> —
// opens the visual editor with that item selected.
function openEditor(id, draft, focusKey) {
  if (id && !Library.get(id)) { location.replace('#/pathways'); return; }
  const raw = id && Library.raw(id);
  if (focusKey && raw?.compose) {
    // Combined pathways only name their parts: edit the part the item came from (ids from later parts are "<part>.<id>").
    const [, ref = ''] = focusKey.split(':'), part = raw.compose.find(x => ref.startsWith(x + '.')) || raw.compose[0];
    const key = focusKey.replace(':' + part + '.', ':');
    location.replace(`#/pathways/${encodeURIComponent(part)}/edit/${encodeURIComponent(key)}`);
    return;
  }
  E.draft = draft || (id ? clone(Library.get(id)) : blankPathway());
  E.draft.cofactors = E.draft.cofactors || {};
  E.draft.distractors = Object.assign({ metabolites: [], enzymes: [] }, E.draft.distractors);
  E.origId = draft ? null : id;
  E.mode = (typeof local !== 'undefined' && local.get('pathways.edMode')) || 'visual';
  E.pending = null;
  E.undo = []; E.redo = []; E.view = null; E.viewSet = false; E.sel = null; E.pre = null;
  if (focusKey) {
    const [k, ref] = [focusKey[0], focusKey.slice(2)];
    if (k === 'm' && E.draft.metabolites[ref]) E.sel = { kind: 'met', id: ref, focus: true };
    if ((k === 'e' || k === 'c') && E.draft.reactions.some(r => r.id === ref)) E.sel = { kind: 'rxn', id: ref, focus: k === 'c' ? 'cof' : 'enz' };
    if (E.sel) E.mode = 'visual';
  }
  $('#view').innerHTML = '<section id="editor" class="editor page"></section>';
  renderEditor();
}
// Leave the editor for a page: the pathway itself, or the library when there is none.
function closeEditor(id = E.origId) {
  E.draft = null;
  location.hash = id && Library.get(id) ? `#/pathways/${encodeURIComponent(id)}` : '#/pathways';
}
function exportPathway(p) {
  // Downloads are blocked inside shared artifacts, so Export shows the JSON to copy, with a file download as the extra.
  const name = (p.id || slug(p.name)) + '.json', text = JSON.stringify(p, null, 2), canSave = !window.PATHWAYS_ARTIFACT;
  ask({ title: `Export ${p.name}`, text: `Copy this and send it${canSave ? ` (or save it as ${name})` : ''}. To add it, open Library → Import, or New pathway → JSON and paste.`, input: 'area', value: text, ok: canSave ? 'Download file' : 'Done', cancel: canSave ? 'Close' : null, copy: true })
    .then(v => v && canSave && download(name, text));
}

/* ---------- helpers ---------- */
const edCof = () => Object.assign({}, Library.sharedCof(), E.draft.cofactors);
const metOpts = (sel, blank = '— choose —') => `<option value="">${blank}</option>` + Object.entries(E.draft.metabolites).map(([id, m]) =>
  `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(m.name || id)}</option>`).join('') + '<option value="__new">+ New metabolite…</option>';
const enzOpts = sel => '<option value="">— choose —</option>' + Object.entries(E.draft.enzymes).map(([id, e]) =>
  `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(e.name || id)}</option>`).join('') + '<option value="__new">+ New enzyme…</option>';
const listStr = a => (a || []).join(', ');
const LAYOUTS = [['line', 'Line'], ['cycle', 'Cycle (last step returns to the start)'], ['grid', 'Grid (place each metabolite)']];
const layoutOf = p => (p.layout === 'grid' ? 'grid' : p.circular ? 'cycle' : 'line');
const parseList = v => v.split(',').map(x => x.trim()).filter(Boolean);
function cofStr(ids) { const c = edCof(); return (ids || []).map(id => c[id]?.name || id).join(', '); }
function parseCof(v) {
  const { map } = cofLookup(edCof()), out = [];
  for (const t of parseList(v)) {
    let id = map[norm(t)];
    if (!id) { id = uniqueId(slug(t), new Set(Object.keys(edCof()))); E.draft.cofactors[id] = { name: t, aliases: [] }; }
    out.push(id);
  }
  return out;
}
function pruneCof(p) {
  const used = new Set(p.reactions.flatMap(r => [...(r.cofactors?.in || []), ...(r.cofactors?.out || [])]));
  for (const id of Object.keys(p.cofactors || {})) if (!used.has(id)) delete p.cofactors[id];
}
function newItem(kind, name) {
  const coll = kind === 'met' ? E.draft.metabolites : E.draft.enzymes;
  const id = uniqueId(slug(name).slice(0, 24), new Set(Object.keys(coll)));
  coll[id] = { name, short: '', aliases: [], notes: '' };
  return id;
}
// A step the diagram can draw: its enzyme and every metabolite it names exist.
const edOk = r => { const d = E.draft; return d.enzymes[r.enzyme] && d.metabolites[r.from] && d.metabolites[r.to] && [...(r.also_to || []), ...(r.also_from || [])].every(x => d.metabolites[x]); };
function newReactionId() { return uniqueId('r' + (E.draft.reactions.length + 1), new Set(E.draft.reactions.map(r => r.id))); }

/* ---------- render ---------- */
function itemRows(kind) {
  const coll = kind === 'met' ? E.draft.metabolites : E.draft.enzymes, base = kind === 'met' ? 'metabolites' : 'enzymes';
  const rows = Object.entries(coll).map(([id, it]) => `
    <div class="ed-item">
      <label>Name<input data-path="${base}.${esc(id)}.name" value="${esc(it.name)}"></label>
      <label>Abbreviation<input data-path="${base}.${esc(id)}.short" value="${esc(it.short)}"></label>
      <label class="wide" title="Spelled-out names. Always accepted.">Also called (full names, comma-separated)<input data-path="${base}.${esc(id)}.aliases" data-list value="${esc(listStr(it.aliases))}" placeholder="e.g. δ-aminolevulinate synthase"></label>
      <label class="wide" title="Abbreviations and short forms. Not accepted when Require full names is on.">Sometimes written as (nicknames, comma-separated)<input data-path="${base}.${esc(id)}.nicknames" data-list value="${esc(listStr(it.nicknames))}" placeholder="e.g. ALAS, ALA synthase"></label>
      ${kind === 'met' && E.draft.layout === 'grid' ? `<label>Column<input type="number" min="0" step="any" data-gridpos="${esc(id)}" data-axis="0" value="${esc(it.pos?.[0] ?? 0)}"></label><label>Row<input type="number" min="0" step="any" data-gridpos="${esc(id)}" data-axis="1" value="${esc(it.pos?.[1] ?? 0)}"></label>` : ''}
      <label class="full">Facts shown after answering<textarea rows="2" data-path="${base}.${esc(id)}.notes">${esc(it.notes)}</textarea></label>
      <button class="btn ghost small" data-ed="del-${kind}" data-id="${esc(id)}">Remove</button>
    </div>`).join('');
  return rows || `<p class="muted">None yet — add one here or from a step's menus.</p>`;
}
function sideChips(r, i, key) {
  const chips = (r[key] || []).map(s => `<span class="pillx">${esc(E.draft.metabolites[s]?.name || s)}<button data-ed="unside" data-i="${i}" data-key="${key}" data-id="${esc(s)}" aria-label="Remove">×</button></span>`).join('');
  return `${chips}<select data-ed-add="${key}" data-i="${i}" class="small">${metOpts('', key === 'also_to' ? '+ side product' : '+ side input')}</select>`;
}
function stepCards() {
  const n = E.draft.reactions.length;
  return E.draft.reactions.map((r, i) => `
    <div class="ed-step${r.branch ? ' branch' : ''}">
      <div class="ed-step-h"><b>${r.branch ? 'Side step' : 'Step'} ${i + 1}</b>
        <span><button class="btn ghost small" data-ed="up" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn ghost small" data-ed="down" data-i="${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button class="btn ghost small" data-ed="del-step" data-i="${i}">Remove</button></span></div>
      <div class="ed-grid">
        <label>From<select data-path="reactions.${i}.from">${metOpts(r.from)}</select></label>
        <label>${r.transport ? 'Transporter' : 'Enzyme'}<select data-path="reactions.${i}.enzyme">${enzOpts(r.enzyme)}</select></label>
        <label>To<select data-path="reactions.${i}.to">${metOpts(r.to)}</select></label>
        <label class="cb"><input type="checkbox" data-path="reactions.${i}.reversible" ${r.reversible ? 'checked' : ''}> Reversible</label>
        <label class="cb"><input type="checkbox" data-path="reactions.${i}.branch" ${r.branch ? 'checked' : ''}> Side step (off the main line)</label>
        <label class="cb"><input type="checkbox" data-path="reactions.${i}.transport" ${r.transport ? 'checked' : ''}> Transport (crosses a membrane)</label>
        <label>Cofactors in<input data-cof="in" data-i="${i}" value="${esc(cofStr(r.cofactors?.in))}" placeholder="e.g. ATP"></label>
        <label>Cofactors out<input data-cof="out" data-i="${i}" value="${esc(cofStr(r.cofactors?.out))}" placeholder="e.g. ADP"></label>
        <label>Compartment<input data-path="reactions.${i}.loc" list="locList" value="${esc(r.loc || '')}" placeholder="e.g. mitochondria"></label>
        <label>Tissue (if not the pathway's)<input data-path="reactions.${i}.tissue" value="${esc(r.tissue || '')}" placeholder="e.g. small intestine"></label>
        <label>Runs ×<input type="number" min="1" max="9" data-path="reactions.${i}.multiplier" value="${esc(r.multiplier || 1)}"></label>
        <label>Tags<input data-path="reactions.${i}.tags" data-list value="${esc(listStr(r.tags))}" placeholder="rate-limiting, irreversible"></label>
        <label>Requires<input data-path="reactions.${i}.requires" data-list value="${esc(listStr(r.requires))}" placeholder="e.g. B6 (PLP)"></label>
        <div class="full side" data-rev="reactions.${i}.also_to"><span class="muted">Side products:</span> ${sideChips(r, i, 'also_to')}</div>
        <div class="full side" data-rev="reactions.${i}.also_from"><span class="muted">Side inputs:</span> ${sideChips(r, i, 'also_from')}</div>
      </div>
    </div>`).join('') || '<p class="muted">No steps yet.</p>';
}
// A combined pathway only names its parts; everything else is merged from them (see composePathway).
function composeForm(p) {
  const groups = {};
  for (const x of Library.atomic()) (groups[x.group || 'Other'] = groups[x.group || 'Other'] || []).push(x);
  return `<section class="card ed-sec"><h3>Basics</h3><div class="ed-grid">
      <label class="wide">Name<input data-path="name" value="${esc(p.name)}"></label>
      <label>Group<input data-path="group" value="${esc(p.group || '')}" list="groupList"></label>
      <label class="full">Summary<textarea rows="3" data-path="summary">${esc(p.summary || '')}</textarea></label></div></section>
    <section class="card ed-sec"><h3>Combine these pathways</h3>
      <p class="muted">The first one you tick is the main line; matching steps are drawn once, and the others' own steps are added alongside. Edits to the parts show up here automatically.</p>
      ${p.compose.length ? `<p><b>Order:</b> ${p.compose.map(id => esc(Library.get(id)?.name || id)).join(' → ')}</p>` : ''}
      ${Object.entries(groups).map(([g, ps]) => `<div class="pgroup"><span class="glabel">${esc(g)}</span><div class="chips">${ps.map(x =>
        `<label class="cb"><input type="checkbox" data-compose="${esc(x.id)}" ${p.compose.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}</div></div>`).join('')}
    </section>`;
}
// Shared by the Form view and the Visual view's pathway panel.
function basicsHTML(p) {
  return `<div class="ed-grid">
          <label class="wide">Name<input data-path="name" value="${esc(p.name)}"></label>
          <label>Group<input data-path="group" value="${esc(p.group || '')}" list="groupList"></label>
          <label class="full">Summary (shown above the diagram)<textarea rows="2" data-path="summary">${esc(p.summary)}</textarea></label>
          <label>Layout<select data-layout>${LAYOUTS.map(([v, l]) => `<option value="${v}"${layoutOf(p) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="wide">Where it runs<input data-path="tissue" value="${esc(p.tissue || '')}" placeholder="e.g. liver, kidney"></label>
          <label>Icon<select data-path="icon">${PATHWAY_ICONS.map(i => `<option value="${i}"${(p.icon || 'route') === i ? ' selected' : ''}>${i.replace(/_/g, ' ')}</option>`).join('')}</select></label>
          <label>Color<select data-path="color">${['blue', 'orange', 'pink', 'teal', 'gold', 'slate'].map(c => `<option value="${c}"${p.color === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
          <label>“Runs ×” label<input data-path="multiplier_label" value="${esc(p.multiplier_label || '')}" placeholder="per glucose"></label>
          ${p.layout === 'grid' ? `<label class="full">Column headings (comma-separated)<input data-path="grid_columns" data-list value="${esc(listStr(p.grid_columns))}"></label>` : ''}
        </div>`;
}
function distractorsHTML(p) {
  return `<div class="ed-grid">
          <label class="full">Metabolites (comma-separated)<textarea rows="2" data-path="distractors.metabolites" data-list>${esc(listStr(p.distractors.metabolites))}</textarea></label>
          <label class="full">Enzymes (comma-separated)<textarea rows="2" data-path="distractors.enzymes" data-list>${esc(listStr(p.distractors.enzymes))}</textarea></label>
        </div>`;
}
function renderEditor() {
  const p = E.draft, st = E.origId ? Library.status(E.origId) : 'new';
  if (!$('#editor')) return;
  const mode = p.compose ? 'form' : E.mode;
  const focus = document.activeElement && $('#editor').contains(document.activeElement)
    ? { path: document.activeElement.dataset.path, cof: document.activeElement.dataset.cof, i: document.activeElement.dataset.i, pos: document.activeElement.selectionStart } : null;
  const insp = $('#vxInsp'), scroll = insp ? insp.scrollTop : 0;
  $('#editor').innerHTML = `
  <div class="ed-bar">
    <h2>${st === 'new' ? 'New pathway' : 'Edit · ' + esc(p.name)}</h2>
    <div class="actions" style="margin:0">
      ${p.compose ? '' : `<div class="seg" role="group" aria-label="Editor view">${[['visual', 'Visual'], ['form', 'Form'], ['json', 'JSON']].map(([v, l]) =>
        `<button type="button" data-ed="mode" data-mode="${v}" aria-pressed="${mode === v}">${l}</button>`).join('')}</div>`}
      <button class="btn primary" data-ed="save">Save</button>
      <button class="btn" data-ed="cancel">Cancel</button>
      <button class="btn ghost" data-ed="export">Export</button>
      <button class="btn ghost" data-ed="import">Import</button>
      ${st === 'edited' ? '<button class="btn ghost" data-ed="reset">Reset to built-in</button>' : ''}
      ${st === 'custom' ? '<button class="btn ghost" data-ed="delete">Delete</button>' : ''}
    </div>
  </div>
  <p class="muted">${Store.mode === 'server' ? 'Saves to your Step 1 Pathways server.' : 'Saves in this browser. Export to keep a copy or send it to someone — they Import it.'} ${st === 'builtin' ? 'This is a built-in pathway: saving keeps your copy alongside it, and Reset brings the original back.' : ''}${edBase() ? ' Fields that differ from the built-in are marked Edited, each with its own Revert.' : ''}</p>
  ${mode === 'visual' ? `${vxHTML()}
    <details class="card ed-sec vx-prev"${E.prevOpen ? ' open' : ''}><summary>Diagram preview (as quizzes draw it)</summary><div id="edPreview"></div></details>` : `
  <div class="ed-cols">
    <div class="ed-form">
      ${p.compose ? composeForm(p) : mode === 'json' ? `<section class="card ed-sec"><h3>Pathway JSON</h3><textarea id="edJson" rows="30" spellcheck="false">${esc(JSON.stringify(p, null, 2))}</textarea>
        <div class="actions"><button class="btn primary" data-ed="apply-json">Apply</button></div></section>` : `
      ${edBase() ? `<section class="card ed-sec"><h3>Changes from the built-in</h3>${changesHTML()}</section>` : ''}
      <section class="card ed-sec"><h3>Basics</h3>
        ${basicsHTML(p)}</section>
      <section class="card ed-sec"><div class="ed-sec-h"><h3>Steps, in order</h3><button class="btn small" data-ed="add-step">+ Add step</button></div>${stepCards()}
        ${E.draft.reactions.length ? '<div class="actions"><button class="btn small" data-ed="add-step">+ Add step</button></div>' : ''}</section>
      <section class="card ed-sec"><div class="ed-sec-h"><h3>Metabolites</h3><button class="btn small" data-ed="add-met">+ Add</button></div>${itemRows('met')}</section>
      <section class="card ed-sec"><div class="ed-sec-h"><h3>Enzymes</h3><button class="btn small" data-ed="add-enz">+ Add</button></div>${itemRows('enz')}</section>
      <section class="card ed-sec"><h3>Extra wrong answers for multiple choice</h3>
        ${distractorsHTML(p)}</section>`}
    </div>
    <div class="ed-preview card"><h3>Preview</h3><div id="edPreview"></div></div>
  </div>`}
  <datalist id="locList">${LOCS.map(l => `<option value="${l}">`).join('')}</datalist>
  <datalist id="groupList">${uniq(Library.list().map(x => x.group)).map(g => `<option value="${esc(g)}">`).join('')}</datalist>
  <input type="file" id="edFile" accept=".json,application/json" hidden>`;
  renderPreview();
  if (mode === 'visual') vxMount(scroll);
  decorateEdits($('#editor'));
  if (focus) {
    const sel = focus.path ? `[data-path="${CSS.escape(focus.path)}"]` : focus.cof ? `[data-cof="${focus.cof}"][data-i="${focus.i}"]` : null;
    const el = sel && $('#editor ' + sel);
    if (el) { el.focus(); try { if (focus.pos != null) el.setSelectionRange(focus.pos, focus.pos); } catch {} }
  }
}
function renderPreview() {
  if (E.mode === 'visual' && !E.draft.compose) renderCanvas();
  const box = $('#edPreview');
  if (!box) return;
  // Unfinished steps are listed as problems but left out of the drawing, so the rest stays visible while you type.
  if (E.draft.compose) {
    let svg = '', msg = E.draft.compose.length < 2 ? 'Pick at least two pathways to combine.' : '';
    try { if (!msg) svg = flowSVG(buildModel(composePathway({ ...E.draft, id: E.draft.id || '__draft' })), () => 'shown'); } catch (err) { msg = err.message; }
    box.innerHTML = (msg ? `<div class="ed-err">${esc(msg)}</div>` : '') + svg;
    return;
  }
  const d = E.draft;
  let msg = '';
  try { buildModel(d); E.err = ''; } catch (err) { E.err = msg = err.message; }
  let svg = '';
  try { svg = flowSVG(buildModel({ ...d, reactions: d.reactions.filter(edOk) }), () => 'shown'); } catch {}
  box.innerHTML = (msg ? `<div class="ed-err">${esc(msg).replace(/\n/g, '<br>')}</div>` : '') + svg;
}

/* ---------- undo / redo ----------
   Snapshots of the whole draft (pathways are small). Canvas actions call pushUndo() before changing anything;
   form fields are committed on 'change', compared with the draft as it was when the field got focus. */
function pushUndo(snap = JSON.stringify(E.draft)) {
  E.undo.push(snap); if (E.undo.length > 200) E.undo.shift();
  E.redo = [];
}
function stepHistory(back) {
  const from = back ? E.undo : E.redo, to = back ? E.redo : E.undo;
  if (!from.length) return;
  to.push(JSON.stringify(E.draft));
  E.draft = JSON.parse(from.pop());
  E.pre = null;
  if (E.sel && !(E.sel.kind === 'met' ? E.draft.metabolites[E.sel.id] : E.draft.reactions.some(r => r.id === E.sel.id))) E.sel = null;
  renderEditor();
}
document.addEventListener('focusin', e => { if (E.draft && e.target.closest?.('#editor') && e.target.matches('input, select, textarea')) E.pre = JSON.stringify(E.draft); });

/* ---------- changes from the built-in ----------
   An edited built-in is a whole copy in Store.data.custom; here it is compared field by field with the original. */
const edBase = () => (E.draft && !E.draft.compose && E.origId ? Library.builtin()[E.origId] || null : null);
// Cleared and never-set are the same: '', false, [], multiplier 1 and an empty cofactor set all count as "not set".
function normVal(v, key) {
  if (v == null || v === '' || v === false) return undefined;
  if (Array.isArray(v)) return v.length ? v : undefined;
  if (key === 'multiplier' && +v === 1) return undefined;
  if (key === 'cofactors' && typeof v === 'object') return (v.in || []).length || (v.out || []).length ? { in: v.in || [], out: v.out || [] } : undefined;
  return v;
}
const sameVal = (a, b, key) => JSON.stringify(normVal(a, key)) === JSON.stringify(normVal(b, key));
const getIn = (o, ks) => ks.reduce((x, k) => (x == null ? undefined : x[k]), o);
// A field path as the form writes it (reactions.<index>.from, metabolites.<id>.name, distractors.enzymes…) → draft item + original item.
function edParts(path) {
  const ks = path.split('.'), b = edBase();
  if (ks[0] === 'reactions') { const r = E.draft.reactions[+ks[1]]; return { d: r, b: r && b?.reactions.find(x => x.id === r.id), ks: ks.slice(2) }; }
  if (ks[0] === 'metabolites' || ks[0] === 'enzymes') return { d: E.draft[ks[0]][ks[1]], b: b?.[ks[0]]?.[ks[1]], ks: ks.slice(2) };
  return { d: E.draft, b, ks };
}
function fieldChanged(path) {
  const b = edBase();
  if (!b) return false;
  if (path === '__layout') return layoutOf(E.draft) !== layoutOf(b);
  if (path === '__order') return orderChanged();
  const x = edParts(path);
  return !!(x.d && x.b) && !sameVal(getIn(x.d, x.ks), getIn(x.b, x.ks), x.ks[x.ks.length - 1]);
}
function orderChanged() {
  const b = edBase(), both = new Set(b.reactions.map(r => r.id));
  const mine = E.draft.reactions.map(r => r.id).filter(id => both.has(id)), have = new Set(mine);
  return mine.join() !== b.reactions.map(r => r.id).filter(id => have.has(id)).join();
}
// 'added' (not in the built-in), 'edited' (any field differs) or '' — for one metabolite, enzyme or reaction.
function itemChange(kind, id) {
  const b = edBase();
  if (!b) return '';
  const coll = kind === 'rxn' ? null : kind === 'met' ? 'metabolites' : 'enzymes';
  const d = coll ? E.draft[coll][id] : E.draft.reactions.find(r => r.id === id), o = coll ? b[coll][id] : b.reactions.find(r => r.id === id);
  if (!d) return '';
  if (!o) return 'added';
  return uniq([...Object.keys(d), ...Object.keys(o)]).some(k => k !== 'id' && !sameVal(d[k], o[k], k)) ? 'edited' : '';
}
// What the built-in had, readably: names instead of ids, lists joined.
function shownVal(v, key) {
  v = normVal(v, key);
  if (v === undefined) return '(blank)';
  if (v === true) return 'yes';
  const met = id => edBase()?.metabolites[id]?.name || E.draft.metabolites[id]?.name || id;
  if (key === 'from' || key === 'to') return met(v);
  if (key === 'also_to' || key === 'also_from') return v.map(met).join(', ');
  if (key === 'enzyme') return edBase()?.enzymes[v]?.name || v;
  if (key === 'in' || key === 'out') { const c = Object.assign({}, Library.sharedCof(), edBase()?.cofactors); return v.map(id => c[id]?.name || id).join(', '); }
  if (key === 'cofactors') return cofText({ cof: Object.assign({}, Library.sharedCof(), edBase()?.cofactors) }, v);
  if (key === 'pos') return `column ${v[0]}, row ${v[1]}`;
  const t = Array.isArray(v) ? v.join(', ') : String(v);
  return t.length > 90 ? t.slice(0, 88) + '…' : t;
}
function origShown(path) {
  const b = edBase();
  if (path === '__layout') return LAYOUTS.find(l => l[0] === layoutOf(b))[1];
  if (path === '__order') return b.reactions.map(r => b.enzymes[r.enzyme]?.name || r.id).join(' → ');
  const x = edParts(path);
  return x.b ? shownVal(getIn(x.b, x.ks), x.ks[x.ks.length - 1]) : '';
}
// Anything a restored field points at (a metabolite, enzyme or pathway cofactor that was since removed) comes back too.
function restoreRefs() {
  const b = edBase(), d = E.draft;
  if (!b) return;
  for (const r of d.reactions) {
    for (const x of [r.from, r.to, ...(r.also_to || []), ...(r.also_from || [])]) if (x && !d.metabolites[x] && b.metabolites[x]) d.metabolites[x] = clone(b.metabolites[x]);
    if (r.enzyme && !d.enzymes[r.enzyme] && b.enzymes[r.enzyme]) d.enzymes[r.enzyme] = clone(b.enzymes[r.enzyme]);
    for (const c of [...(r.cofactors?.in || []), ...(r.cofactors?.out || [])]) if (!edCof()[c] && b.cofactors?.[c]) d.cofactors[c] = clone(b.cofactors[c]);
  }
}
function revertPath(path) {
  const b = edBase();
  if (!b) return;
  pushUndo();
  if (path === '__layout') {
    delete E.draft.layout; delete E.draft.circular;
    if (b.layout) E.draft.layout = b.layout;
    if (b.circular) E.draft.circular = true;
  } else if (path === '__order') {
    const at = new Map(b.reactions.map((r, i) => [r.id, i])), R = E.draft.reactions;
    // Steps you added keep their place after the step before them.
    const key = R.map((r, i) => { let j = i; while (j >= 0 && !at.has(R[j].id)) j--; return j < 0 ? -1 + i / 1000 : at.get(R[j].id) + (j === i ? 0 : 0.001 * (i - j)); });
    E.draft.reactions = R.map((r, i) => [r, key[i]]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
  } else {
    const x = edParts(path), v = getIn(x.b, x.ks);
    if (!x.d || !x.b) return;
    let o = x.d;
    for (const k of x.ks.slice(0, -1)) o = o[k] = o[k] ?? {};
    const last = x.ks[x.ks.length - 1];
    if (v === undefined) delete o[last]; else o[last] = clone(v);
  }
  restoreRefs(); pruneCof(E.draft);
  renderEditor();
}
// Whole items: put one back the way the built-in has it, bring back a removed one, or drop one you added.
function revertItem(kind, id) {
  const b = edBase();
  if (!b) return;
  pushUndo();
  if (kind === 'rxn') {
    const R = E.draft.reactions, i = R.findIndex(r => r.id === id), o = b.reactions.find(r => r.id === id);
    if (o && i >= 0) R[i] = clone(o);
    else if (o) {
      const bi = b.reactions.indexOf(o), prev = b.reactions.slice(0, bi).reverse().find(r => R.some(x => x.id === r.id));
      R.splice(prev ? R.findIndex(x => x.id === prev.id) + 1 : 0, 0, clone(o));
    }
  } else {
    const coll = kind === 'met' ? 'metabolites' : 'enzymes';
    E.draft[coll][id] = clone(b[coll][id]);
  }
  restoreRefs(); pruneCof(E.draft);
  renderEditor();
}
const changeBadge = c => (c === 'added' ? `<span class="ed-mark added">${mi('add', 'sm')}Added</span>` : c === 'edited' ? `<span class="ed-mark">${mi('edit_note', 'sm')}Edited</span>` : '');
const itemName = (kind, id, p = E.draft) => {
  if (kind === 'met') return p.metabolites[id]?.name || id;
  if (kind === 'enz') return p.enzymes[id]?.name || id;
  const r = p.reactions.find(x => x.id === id);
  return r ? `${p.enzymes[r.enzyme]?.name || 'Step'} (${p.metabolites[r.from]?.name || '?'} → ${p.metabolites[r.to]?.name || '?'})` : id;
};
// The list of everything that differs, with a way to each: select it (Visual), revert it, restore what was removed.
function changesHTML() {
  const b = edBase(), d = E.draft;
  if (!b) return '';
  const rows = [];
  const top = ['name', 'group', 'summary', '__layout', 'tissue', 'icon', 'color', 'multiplier_label', 'grid_columns', 'distractors.metabolites', 'distractors.enzymes', '__order'];
  const label = { __layout: 'Layout', __order: 'Step order', multiplier_label: '“Runs ×” label', grid_columns: 'Column headings', 'distractors.metabolites': 'Extra wrong metabolites', 'distractors.enzymes': 'Extra wrong enzymes' };
  for (const f of top) if (fieldChanged(f)) rows.push(`<li><span>${changeBadge('edited')} ${esc(label[f] || f[0].toUpperCase() + f.slice(1))}</span><button type="button" class="btn ghost small ed-revert" data-revert="${f}" title="Built-in: ${esc(origShown(f))}">${mi('undo', 'sm')}Revert</button></li>`);
  const item = (kind, id, c) => {
    const pick = E.mode === 'visual' && kind !== 'enz' ? `<button type="button" class="linkish" data-vx="pick" data-kind="${kind}" data-id="${esc(id)}">${esc(itemName(kind, id))}</button>` : esc(itemName(kind, id));
    return `<li><span>${changeBadge(c)} ${{ met: 'Metabolite', enz: 'Enzyme', rxn: 'Step' }[kind]} · ${pick}</span>${c === 'edited'
      ? `<button type="button" class="btn ghost small ed-revert" data-revert-item="${kind}" data-id="${esc(id)}">${mi('undo', 'sm')}Revert all</button>` : ''}</li>`;
  };
  for (const id of Object.keys(d.metabolites)) { const c = itemChange('met', id); if (c) rows.push(item('met', id, c)); }
  for (const id of Object.keys(d.enzymes)) { const c = itemChange('enz', id); if (c) rows.push(item('enz', id, c)); }
  for (const r of d.reactions) { const c = itemChange('rxn', r.id); if (c) rows.push(item('rxn', r.id, c)); }
  const gone = [...Object.keys(b.metabolites).filter(id => !d.metabolites[id]).map(id => ['met', id]),
    ...Object.keys(b.enzymes).filter(id => !d.enzymes[id]).map(id => ['enz', id]),
    ...b.reactions.filter(r => !d.reactions.some(x => x.id === r.id)).map(r => ['rxn', r.id])];
  for (const [kind, id] of gone) rows.push(`<li><span><span class="ed-mark removed">${mi('delete', 'sm')}Removed</span> ${{ met: 'Metabolite', enz: 'Enzyme', rxn: 'Step' }[kind]} · ${esc(itemName(kind, id, b))}</span><button type="button" class="btn ghost small ed-revert" data-revert-item="${kind}" data-id="${esc(id)}">${mi('undo', 'sm')}Restore</button></li>`);
  return rows.length ? `<ul class="ed-changes">${rows.join('')}</ul>` : '<p class="muted">Same as the built-in.</p>';
}
// Marks every field on the page that differs from the built-in: "Edited" plus a Revert that restores just that field.
function decorateEdits(root) {
  $$('.ed-chg', root).forEach(x => x.remove());
  $$('.edited', root).forEach(x => x.classList.remove('edited'));
  if (!root || !edBase()) return;
  const done = new Set();
  for (const el of $$('[data-path], [data-cof], [data-gridpos], [data-layout], [data-rev]', root)) {
    const path = el.dataset.rev || (el.dataset.cof ? `reactions.${el.dataset.i}.cofactors.${el.dataset.cof}` : el.dataset.gridpos ? `metabolites.${el.dataset.gridpos}.pos` : el.hasAttribute('data-layout') ? '__layout' : el.dataset.path);
    if (!path || done.has(path) || el.closest('.ed-changes') || !fieldChanged(path)) continue;
    done.add(path);
    const host = el.dataset.rev ? el : el.closest('[data-revwrap]') || el.closest('label') || el.parentElement;
    host.classList.add('edited');
    const mark = document.createElement('span');
    mark.className = 'ed-chg';
    mark.innerHTML = `${changeBadge('edited')}<button type="button" class="ed-revert" data-revert="${esc(path)}" title="Built-in: ${esc(origShown(path))}" aria-label="Revert to the built-in: ${esc(origShown(path))}">${mi('undo', 'sm')}Revert</button>`;
    el.dataset.rev || host.hasAttribute('data-revwrap') ? host.prepend(mark) : el.before(mark);
  }
}

/* ---------- edits ---------- */
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { const k = /^\d+$/.test(ks[i]) ? +ks[i] : ks[i]; o = o[k] = o[k] ?? {}; }
  const last = ks[ks.length - 1];
  if (val === '' || val === false || (Array.isArray(val) && !val.length)) { if (['loc', 'tissue', 'multiplier_label', 'branch', 'transport', 'reversible', 'tags', 'requires', 'grid_columns'].includes(last)) { delete o[last]; return; } }
  o[last] = val;
}
function valueOf(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') return Math.max(1, +el.value || 1);
  if (el.hasAttribute('data-list')) return parseList(el.value);
  return el.value;
}
function onEdit(e, structural) {
  const el = e.target;
  if (!E.draft || !$('#editor') || !$('#editor').contains(el)) return;
  if (el.dataset.gridpos) {
    const mt = E.draft.metabolites[el.dataset.gridpos];
    mt.pos = mt.pos || [0, 0]; mt.pos[+el.dataset.axis] = Math.max(0, +el.value || 0);
    return renderPreview();
  }
  if (el.hasAttribute('data-layout')) {
    if (!structural) return;
    // Switching to Grid keeps the picture: each box starts where the line or cycle drew it.
    const at = el.value === 'grid' && E.draft.layout !== 'grid' ? gridFromPicture() : {};
    delete E.draft.circular; delete E.draft.layout;
    if (el.value === 'cycle') E.draft.circular = true;
    if (el.value === 'grid') { E.draft.layout = 'grid'; Object.entries(E.draft.metabolites).forEach(([id, mt], k) => { mt.pos = mt.pos || at[id] || [0, k]; }); }
    return renderEditor();
  }
  if (el.dataset.compose && structural) {
    const id = el.dataset.compose, c = E.draft.compose;
    E.draft.compose = el.checked ? uniq([...c, id]) : c.filter(x => x !== id);
    return renderEditor();
  }
  if (el.dataset.cof) {
    const r = E.draft.reactions[+el.dataset.i];
    r.cofactors = r.cofactors || { in: [], out: [] };
    r.cofactors[el.dataset.cof] = parseCof(el.value);
    pruneCof(E.draft);
    return renderPreview();
  }
  if (el.dataset.edAdd && structural) {
    const r = E.draft.reactions[+el.dataset.i];
    let id = el.value;
    const add = v => { if (v) r[el.dataset.edAdd] = uniq([...(r[el.dataset.edAdd] || []), v]); renderEditor(); };
    if (id === '__new') return ask({ title: 'New metabolite', input: true, ok: 'Add' }).then(nm => add(nm && newItem('met', nm)));
    return add(id);
  }
  if (!el.dataset.path) return;
  if (el.tagName === 'SELECT' && el.value === '__new') {
    if (!structural) return;
    const isEnz = el.dataset.path.endsWith('.enzyme');
    const path = el.dataset.path;
    return ask({ title: `New ${isEnz ? 'enzyme' : 'metabolite'}`, input: true, ok: 'Add' }).then(nm => {
      if (nm) setPath(E.draft, path, newItem(isEnz ? 'enz' : 'met', nm));
      renderEditor();
    });
  }
  setPath(E.draft, el.dataset.path, valueOf(el));
  // Names appear in other menus; checkboxes change card layout — redraw the form on commit.
  if (structural && (el.tagName === 'SELECT' || el.type === 'checkbox' || /\.name$|^name$/.test(el.dataset.path))) renderEditor();
  else renderPreview();
}
document.addEventListener('input', e => onEdit(e, false));
document.addEventListener('change', e => {
  if (e.target.id === 'edFile') return importFile(e.target.files[0]);
  if (!E.draft || !e.target.closest?.('#editor')) return;
  const before = E.pre;
  onEdit(e, true);
  const now = JSON.stringify(E.draft);
  if (before && before !== now) pushUndo(before);
  E.pre = now;
  decorateEdits($('#editor'));
  if (E.mode === 'visual') vxTools();
});

function importFile(f) {
  if (!f) return;
  f.text().then(async t => {
    let p;
    try { p = JSON.parse(t); buildModel(p); }
    catch (err) { return say('Can’t import that file', 'It isn’t a pathway this app can read:\n' + err.message); }
    if (!p.name) p.name = 'Imported pathway';
    if (p.id && Library.get(p.id) && !(await ask({ title: 'Replace your copy?', text: `You already have “${Library.get(p.id).name}”. Saving the import will replace it.`, ok: 'Replace on save', cancel: 'Keep both' }))) p.id = '';
    E.pending = p;
    location.hash = '#/pathways/import';
  });
}

function savePathway() {
  const p = clone(E.draft);
  pruneCof(p);
  if (p.compose && p.compose.length < 2) return say('Pick at least two pathways', 'A combined pathway merges two or more pathways.');
  try { buildModel(p.compose ? composePathway({ ...p, id: p.id || '__draft' }) : p); } catch (err) { return say('Fix these before saving', err.message); }
  if (!p.id) p.id = uniqueId(slug(p.name), new Set(Object.keys(Library.all())));
  Store.data.custom[p.id] = p;
  Store.save();
  modelCache.delete(p.id);
  closeEditor(p.id);
}

document.addEventListener('click', e => {
  const rv = e.target.closest('#editor [data-revert], #editor [data-revert-item]');
  if (rv) { e.preventDefault(); return rv.dataset.revert ? revertPath(rv.dataset.revert) : revertItem(rv.dataset.revertItem, rv.dataset.id); }
  const b = e.target.closest('#editor [data-ed]');
  if (!b) return;
  const p = E.draft, i = +b.dataset.i, act = b.dataset.ed;
  const R = p.reactions;
  switch (act) {
    case 'save': return savePathway();
    case 'cancel': ask({ title: 'Discard changes?', ok: 'Discard', cancel: 'Keep editing' }).then(y => y && closeEditor()); return;
    case 'export': return exportPathway(p);
    case 'import': return $('#edFile').click();
    case 'mode':
      E.mode = b.dataset.mode;
      try { local.set('pathways.edMode', E.mode); } catch {}
      return renderEditor();
    case 'apply-json':
      try { const next = JSON.parse($('#edJson').value); pushUndo(); E.draft = next; E.draft.cofactors = E.draft.cofactors || {}; E.draft.distractors = Object.assign({ metabolites: [], enzymes: [] }, E.draft.distractors); renderEditor(); }
      catch (err) { say('That JSON has an error', err.message); }
      return;
    case 'reset':
      ask({ title: 'Restore the built-in version?', text: 'Your edits to this pathway will be thrown away.', ok: 'Restore' }).then(y => {
        if (!y) return;
        delete Store.data.custom[E.origId]; Store.save(); modelCache.delete(E.origId); closeEditor(E.origId);
      });
      return;
    case 'delete':
      ask({ title: `Delete ${p.name}?`, text: 'This can’t be undone. Export it first if you might want it back.', ok: 'Delete' }).then(y => {
        if (!y) return;
        delete Store.data.custom[E.origId]; Store.save(); modelCache.delete(E.origId); closeEditor(null);
      });
      return;
    case 'add-step': {
      pushUndo();
      const last = R.filter(r => !r.branch).slice(-1)[0];
      R.push({ id: newReactionId(), enzyme: '', from: last ? last.to : '', to: '', reversible: false, cofactors: { in: [], out: [] } });
      return renderEditor();
    }
    case 'add-met': case 'add-enz':
      ask({ title: act === 'add-met' ? 'New metabolite' : 'New enzyme', input: true, ok: 'Add' }).then(nm => { if (nm) { pushUndo(); newItem(act === 'add-met' ? 'met' : 'enz', nm); renderEditor(); } });
      return;
    case 'del-met': case 'del-enz': {
      const id = b.dataset.id, isMet = act === 'del-met';
      const users = R.map((r, k) => (isMet ? [r.from, r.to, ...(r.also_to || []), ...(r.also_from || [])].includes(id) : r.enzyme === id) ? k + 1 : 0).filter(Boolean);
      if (users.length) return say('Still in use', `Step ${users.join(', ')} uses it. Change those steps first.`);
      pushUndo();
      delete (isMet ? p.metabolites : p.enzymes)[id];
      return renderEditor();
    }
    case 'up': pushUndo(); if (i > 0) [R[i - 1], R[i]] = [R[i], R[i - 1]]; return renderEditor();
    case 'down': pushUndo(); if (i < R.length - 1) [R[i + 1], R[i]] = [R[i], R[i + 1]]; return renderEditor();
    case 'del-step': ask({ title: `Remove step ${i + 1}?`, ok: 'Remove' }).then(y => { if (y) { pushUndo(); R.splice(i, 1); pruneCof(p); renderEditor(); } }); return;
    case 'unside': { pushUndo(); const r = R[i]; r[b.dataset.key] = (r[b.dataset.key] || []).filter(x => x !== b.dataset.id); if (!r[b.dataset.key].length) delete r[b.dataset.key]; return renderEditor(); }
  }
});
