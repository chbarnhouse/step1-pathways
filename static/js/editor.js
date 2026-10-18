/* Pathway editor: build or change a pathway with a live diagram preview.
   Built-in pathways are never overwritten — saving one stores an edited copy under the same id ("Reset" removes it).
   Export / Import move a pathway between people as a .json file. */
'use strict';

const LOCS = ['cytosol', 'mitochondria', 'mitochondrial matrix', 'ER', 'peroxisome', 'lysosome', 'nucleus'];
const E = { draft: null, origId: null, json: false, err: '' };

function blankPathway() {
  return { id: '', name: 'New pathway', group: 'Mine', summary: '', circular: false, multiplier_label: '',
    metabolites: {}, enzymes: {}, reactions: [], cofactors: {}, distractors: { metabolites: [], enzymes: [] } };
}
function openEditor(id, draft) {
  E.draft = draft || (id ? clone(Library.get(id)) : blankPathway());
  E.draft.cofactors = E.draft.cofactors || {};
  E.draft.distractors = Object.assign({ metabolites: [], enzymes: [] }, E.draft.distractors);
  E.origId = draft ? null : id;
  E.json = false;
  $('#studyView').hidden = true;
  $('#editor').hidden = false;
  renderEditor();
  window.scrollTo(0, 0);
}
function closeEditor() {
  $('#editor').hidden = true;
  $('#studyView').hidden = false;
  E.draft = null;
  render();
}

/* ---------- helpers ---------- */
const edCof = () => Object.assign({}, Library.sharedCof(), E.draft.cofactors);
const metOpts = (sel, blank = '— choose —') => `<option value="">${blank}</option>` + Object.entries(E.draft.metabolites).map(([id, m]) =>
  `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(m.name || id)}</option>`).join('') + '<option value="__new">+ New metabolite…</option>';
const enzOpts = sel => '<option value="">— choose —</option>' + Object.entries(E.draft.enzymes).map(([id, e]) =>
  `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(e.name || id)}</option>`).join('') + '<option value="__new">+ New enzyme…</option>';
const listStr = a => (a || []).join(', ');
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
function newReactionId() { return uniqueId('r' + (E.draft.reactions.length + 1), new Set(E.draft.reactions.map(r => r.id))); }

/* ---------- render ---------- */
function itemRows(kind) {
  const coll = kind === 'met' ? E.draft.metabolites : E.draft.enzymes, base = kind === 'met' ? 'metabolites' : 'enzymes';
  const rows = Object.entries(coll).map(([id, it]) => `
    <div class="ed-item">
      <label>Name<input data-path="${base}.${esc(id)}.name" value="${esc(it.name)}"></label>
      <label>Abbreviation<input data-path="${base}.${esc(id)}.short" value="${esc(it.short)}"></label>
      <label class="wide">Also accept (comma-separated)<input data-path="${base}.${esc(id)}.aliases" data-list value="${esc(listStr(it.aliases))}"></label>
      <label class="full">Facts shown after answering<textarea rows="2" data-path="${base}.${esc(id)}.notes">${esc(it.notes)}</textarea></label>
      <button class="btn ghost small" data-ed="del-${kind}" data-id="${esc(id)}">Remove</button>
    </div>`).join('');
  return rows || `<p class="muted">None yet — add one here or from a step's menus.</p>`;
}
function sideChips(r, i, key) {
  const chips = (r[key] || []).map(s => `<span class="pill">${esc(E.draft.metabolites[s]?.name || s)}<button data-ed="unside" data-i="${i}" data-key="${key}" data-id="${esc(s)}" aria-label="Remove">×</button></span>`).join('');
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
        <label>Enzyme<select data-path="reactions.${i}.enzyme">${enzOpts(r.enzyme)}</select></label>
        <label>To<select data-path="reactions.${i}.to">${metOpts(r.to)}</select></label>
        <label class="cb"><input type="checkbox" data-path="reactions.${i}.reversible" ${r.reversible ? 'checked' : ''}> Reversible</label>
        <label class="cb"><input type="checkbox" data-path="reactions.${i}.branch" ${r.branch ? 'checked' : ''}> Side step (off the main line)</label>
        <label>Cofactors in<input data-cof="in" data-i="${i}" value="${esc(cofStr(r.cofactors?.in))}" placeholder="e.g. ATP"></label>
        <label>Cofactors out<input data-cof="out" data-i="${i}" value="${esc(cofStr(r.cofactors?.out))}" placeholder="e.g. ADP"></label>
        <label>Location<input data-path="reactions.${i}.loc" list="locList" value="${esc(r.loc || '')}"></label>
        <label>Runs ×<input type="number" min="1" max="9" data-path="reactions.${i}.multiplier" value="${esc(r.multiplier || 1)}"></label>
        <label>Tags<input data-path="reactions.${i}.tags" data-list value="${esc(listStr(r.tags))}" placeholder="rate-limiting, irreversible"></label>
        <label>Requires<input data-path="reactions.${i}.requires" data-list value="${esc(listStr(r.requires))}" placeholder="e.g. B6 (PLP)"></label>
        <div class="full side"><span class="muted">Side products:</span> ${sideChips(r, i, 'also_to')}</div>
        <div class="full side"><span class="muted">Side inputs:</span> ${sideChips(r, i, 'also_from')}</div>
      </div>
    </div>`).join('') || '<p class="muted">No steps yet.</p>';
}
function renderEditor() {
  const p = E.draft, st = E.origId ? Library.status(E.origId) : 'new';
  const focus = document.activeElement && $('#editor').contains(document.activeElement)
    ? { path: document.activeElement.dataset.path, cof: document.activeElement.dataset.cof, i: document.activeElement.dataset.i, pos: document.activeElement.selectionStart } : null;
  $('#editor').innerHTML = `
  <div class="ed-bar">
    <h2>${st === 'new' ? 'New pathway' : 'Edit · ' + esc(p.name)}</h2>
    <div class="actions" style="margin:0">
      <button class="btn primary" data-ed="save">Save</button>
      <button class="btn" data-ed="cancel">Cancel</button>
      <button class="btn ghost" data-ed="export">Export</button>
      <button class="btn ghost" data-ed="import">Import</button>
      <button class="btn ghost" data-ed="json" aria-pressed="${E.json}">JSON</button>
      ${st === 'edited' ? '<button class="btn ghost" data-ed="reset">Reset to built-in</button>' : ''}
      ${st === 'custom' ? '<button class="btn ghost" data-ed="delete">Delete</button>' : ''}
    </div>
  </div>
  <p class="muted">${Store.mode === 'server' ? 'Saves to the Pathways server.' : 'Saves in this browser. Export to keep a copy or send it to someone — they Import it.'} ${st === 'builtin' ? 'This is a built-in pathway: saving keeps your copy alongside it, and Reset brings the original back.' : ''}</p>
  <div class="ed-cols">
    <div class="ed-form">
      ${E.json ? `<section class="card ed-sec"><h3>Pathway JSON</h3><textarea id="edJson" rows="30" spellcheck="false">${esc(JSON.stringify(p, null, 2))}</textarea>
        <div class="actions"><button class="btn primary" data-ed="apply-json">Apply</button></div></section>` : `
      <section class="card ed-sec"><h3>Basics</h3>
        <div class="ed-grid">
          <label class="wide">Name<input data-path="name" value="${esc(p.name)}"></label>
          <label>Group<input data-path="group" value="${esc(p.group || '')}" list="groupList"></label>
          <label class="full">Summary (shown above the diagram)<textarea rows="2" data-path="summary">${esc(p.summary)}</textarea></label>
          <label class="cb"><input type="checkbox" data-path="circular" ${p.circular ? 'checked' : ''}> Cycle (last step returns to the first metabolite)</label>
          <label>“Runs ×” label<input data-path="multiplier_label" value="${esc(p.multiplier_label || '')}" placeholder="per glucose"></label>
        </div></section>
      <section class="card ed-sec"><div class="ed-sec-h"><h3>Steps, in order</h3><button class="btn small" data-ed="add-step">+ Add step</button></div>${stepCards()}
        ${E.draft.reactions.length ? '<div class="actions"><button class="btn small" data-ed="add-step">+ Add step</button></div>' : ''}</section>
      <section class="card ed-sec"><div class="ed-sec-h"><h3>Metabolites</h3><button class="btn small" data-ed="add-met">+ Add</button></div>${itemRows('met')}</section>
      <section class="card ed-sec"><div class="ed-sec-h"><h3>Enzymes</h3><button class="btn small" data-ed="add-enz">+ Add</button></div>${itemRows('enz')}</section>
      <section class="card ed-sec"><h3>Extra wrong answers for multiple choice</h3>
        <div class="ed-grid">
          <label class="full">Metabolites (comma-separated)<textarea rows="2" data-path="distractors.metabolites" data-list>${esc(listStr(p.distractors.metabolites))}</textarea></label>
          <label class="full">Enzymes (comma-separated)<textarea rows="2" data-path="distractors.enzymes" data-list>${esc(listStr(p.distractors.enzymes))}</textarea></label>
        </div></section>`}
    </div>
    <div class="ed-preview card"><h3>Preview</h3><div id="edPreview"></div></div>
  </div>
  <datalist id="locList">${LOCS.map(l => `<option value="${l}">`).join('')}</datalist>
  <datalist id="groupList">${uniq(Library.list().map(x => x.group)).map(g => `<option value="${esc(g)}">`).join('')}</datalist>
  <input type="file" id="edFile" accept=".json,application/json" hidden>`;
  renderPreview();
  if (focus) {
    const sel = focus.path ? `[data-path="${CSS.escape(focus.path)}"]` : focus.cof ? `[data-cof="${focus.cof}"][data-i="${focus.i}"]` : null;
    const el = sel && $('#editor ' + sel);
    if (el) { el.focus(); try { if (focus.pos != null) el.setSelectionRange(focus.pos, focus.pos); } catch {} }
  }
}
function renderPreview() {
  const box = $('#edPreview');
  if (!box) return;
  // Unfinished steps are listed as problems but left out of the drawing, so the rest stays visible while you type.
  const d = E.draft, ok = r => d.enzymes[r.enzyme] && d.metabolites[r.from] && d.metabolites[r.to] && [...(r.also_to || []), ...(r.also_from || [])].every(x => d.metabolites[x]);
  let msg = '';
  try { buildModel(d); E.err = ''; } catch (err) { E.err = msg = err.message; }
  let svg = '';
  try { svg = flowSVG(buildModel({ ...d, reactions: d.reactions.filter(ok) }), () => 'shown'); } catch {}
  box.innerHTML = (msg ? `<div class="ed-err">${esc(msg).replace(/\n/g, '<br>')}</div>` : '') + svg;
}

/* ---------- edits ---------- */
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { const k = /^\d+$/.test(ks[i]) ? +ks[i] : ks[i]; o = o[k] = o[k] ?? {}; }
  const last = ks[ks.length - 1];
  if (val === '' || val === false || (Array.isArray(val) && !val.length)) { if (['loc', 'multiplier_label', 'branch', 'reversible', 'tags', 'requires'].includes(last)) { delete o[last]; return; } }
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
  if (!E.draft || !$('#editor').contains(el)) return;
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
  onEdit(e, true);
});

function importFile(f) {
  if (!f) return;
  f.text().then(async t => {
    let p;
    try { p = JSON.parse(t); buildModel(p); }
    catch (err) { return say('Can’t import that file', 'It isn’t a pathway this app can read:\n' + err.message); }
    if (!p.name) p.name = 'Imported pathway';
    if (p.id && Library.get(p.id) && !(await ask({ title: 'Replace your copy?', text: `You already have “${Library.get(p.id).name}”. Saving the import will replace it.`, ok: 'Replace on save', cancel: 'Keep both' }))) p.id = '';
    openEditor(null, p);
    E.origId = p.id && Library.get(p.id) ? p.id : null;
    renderEditor();
  });
}

function savePathway() {
  const p = clone(E.draft);
  pruneCof(p);
  try { buildModel(p); } catch (err) { return say('Fix these before saving', err.message); }
  if (!p.id) p.id = uniqueId(slug(p.name), new Set(Object.keys(Library.all())));
  Store.data.custom[p.id] = p;
  Store.save();
  closeEditor();
  renderPicker();
  loadPathway(p.id);
}

document.addEventListener('click', e => {
  const b = e.target.closest('#editor [data-ed]');
  if (!b) return;
  const p = E.draft, i = +b.dataset.i, act = b.dataset.ed;
  const R = p.reactions;
  switch (act) {
    case 'save': return savePathway();
    case 'cancel': ask({ title: 'Discard changes?', ok: 'Discard', cancel: 'Keep editing' }).then(y => y && closeEditor()); return;
    case 'export': {
      // Downloads are blocked inside shared artifacts, so Export shows the JSON to copy, with a file download as the extra.
      const name = (p.id || slug(p.name)) + '.json', text = JSON.stringify(p, null, 2);
      const canSave = !window.PATHWAYS_ARTIFACT; // the shared artifact's frame blocks file downloads
      ask({ title: `Export ${p.name}`, text: `Copy this and send it${canSave ? ` (or save it as ${name})` : ''}. The other person opens Edit → JSON, pastes it and presses Apply, then Save.`, input: 'area', value: text, ok: canSave ? 'Download file' : 'Done', cancel: canSave ? 'Close' : null, copy: true })
        .then(v => v && canSave && download(name, text));
      return;
    }
    case 'import': return $('#edFile').click();
    case 'json': E.json = !E.json; return renderEditor();
    case 'apply-json':
      try { E.draft = JSON.parse($('#edJson').value); E.draft.cofactors = E.draft.cofactors || {}; E.draft.distractors = Object.assign({ metabolites: [], enzymes: [] }, E.draft.distractors); E.json = false; renderEditor(); }
      catch (err) { say('That JSON has an error', err.message); }
      return;
    case 'reset':
      ask({ title: 'Restore the built-in version?', text: 'Your edits to this pathway will be thrown away.', ok: 'Restore' }).then(y => {
        if (!y) return;
        delete Store.data.custom[E.origId]; Store.save(); const id = E.origId; closeEditor(); renderPicker(); loadPathway(id);
      });
      return;
    case 'delete':
      ask({ title: `Delete ${p.name}?`, text: 'This can’t be undone. Export it first if you might want it back.', ok: 'Delete' }).then(y => {
        if (!y) return;
        delete Store.data.custom[E.origId]; Store.save(); closeEditor(); renderPicker(); loadPathway(Library.list()[0].id);
      });
      return;
    case 'add-step': {
      const last = R.filter(r => !r.branch).slice(-1)[0];
      R.push({ id: newReactionId(), enzyme: '', from: last ? last.to : '', to: '', reversible: false, cofactors: { in: [], out: [] } });
      return renderEditor();
    }
    case 'add-met': case 'add-enz':
      ask({ title: act === 'add-met' ? 'New metabolite' : 'New enzyme', input: true, ok: 'Add' }).then(nm => { if (nm) { newItem(act === 'add-met' ? 'met' : 'enz', nm); renderEditor(); } });
      return;
    case 'del-met': case 'del-enz': {
      const id = b.dataset.id, isMet = act === 'del-met';
      const users = R.map((r, k) => (isMet ? [r.from, r.to, ...(r.also_to || []), ...(r.also_from || [])].includes(id) : r.enzyme === id) ? k + 1 : 0).filter(Boolean);
      if (users.length) return say('Still in use', `Step ${users.join(', ')} uses it. Change those steps first.`);
      delete (isMet ? p.metabolites : p.enzymes)[id];
      return renderEditor();
    }
    case 'up': if (i > 0) [R[i - 1], R[i]] = [R[i], R[i - 1]]; return renderEditor();
    case 'down': if (i < R.length - 1) [R[i + 1], R[i]] = [R[i], R[i + 1]]; return renderEditor();
    case 'del-step': ask({ title: `Remove step ${i + 1}?`, ok: 'Remove' }).then(y => { if (y) { R.splice(i, 1); pruneCof(p); renderEditor(); } }); return;
    case 'unside': { const r = R[i]; r[b.dataset.key] = (r[b.dataset.key] || []).filter(x => x !== b.dataset.id); if (!r[b.dataset.key].length) delete r[b.dataset.key]; return renderEditor(); }
  }
});
