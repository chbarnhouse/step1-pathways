/* App shell: hash router + the dashboard, library, pathway and settings pages.
   #/                     Home — start a quiz (pathways × style), weak spots, pathway overview
   #/quiz                 the quiz itself (quiz.js)
   #/pathways             library
   #/pathways/<id>        one pathway: diagram, steps, weak spots
   #/pathways/<id>/edit   editor (editor.js) · #/pathways/new · #/pathways/import
   #/settings             defaults, presets, your data */
'use strict';

const LAST_QUIZ = 'pathways.lastQuiz', CURRENT_QUIZ = 'pathways.currentQuiz';
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const pageHead = (title, sub = '', actions = '') => `<div class="page-h"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>${actions ? `<div class="btnrow">${actions}</div>` : ''}</div>`;
const seg = (attr, key, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button ${attr}="${key}" data-v="${v}" role="radio" aria-checked="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;

/* ================= Home ================= */
const H = { presetId: 'b-blanks', draft: null };
function homeDraft() {
  if (!H.draft) {
    const last = local.get(LAST_QUIZ);
    H.presetId = last?.presetId ?? 'b-blanks';
    H.draft = normalizeQuiz(last?.cfg || { ...Presets.get('b-blanks'), pathways: ['glycolysis'] });
    H.draft.allPathways = !!last?.cfg?.allPathways;
  }
  H.draft.pathways = H.draft.pathways.filter(id => Library.get(id));
  return H.draft;
}
function applyPreset(id) {
  const p = Presets.get(id);
  if (!p) return;
  const keep = H.draft.pathways;
  H.draft = normalizeQuiz({ ...p, pathways: p.pathways?.length ? p.pathways : keep });
  H.draft.allPathways = !!p.allPathways;
  H.presetId = id;
}
function presetTile(p) {
  const on = H.presetId === p.id;
  return `<button class="tile${on ? ' on' : ''}" data-h="preset" data-id="${esc(p.id)}" aria-pressed="${on}">
    <span class="tile-name">${on ? mi('check', 'sm') : ''}${esc(p.name)}</span>
    <span class="tile-blurb">${esc(p.blurb || quizSummary(normalizeQuiz(p)))}</span>
    ${p.builtin ? '' : '<span class="tile-tag">yours</span>'}
  </button>`;
}
function setupRows(d) {
  const rows = [];
  rows.push(['Mode', seg('data-hs', 'mode', [['single', 'Single blank'], ['total', 'Full recall'], ['step', 'Single step']], d.mode)]);
  if (d.mode === 'step') rows.push(['Given', seg('data-hs', 'given', [['mets', 'Two metabolites'], ['enz', 'The enzyme']], d.given)]);
  if (d.mode === 'step' && d.given === 'enz') rows.push(['Draw from', seg('data-hs', 'allPathways', [['false', 'Chosen pathways'], ['true', 'All pathways']], !!d.allPathways)]);
  if (d.mode === 'total') {
    let opts = '<option value="random">Random point</option><option value="begin">The beginning, nothing shown</option>';
    if (d.pathways.length === 1) {
      const m = modelFor(Library.get(d.pathways[0]));
      opts += `<optgroup label="Start at">${visibleFor(m, d).map(k => `<option value="${esc(k)}">${esc(m.items[k].name)}${kindOf(k, m) !== 'met' ? ` (${KIND[kindOf(k, m)]})` : ''}</option>`).join('')}</optgroup>`;
    }
    rows.push(['Start', `<select id="homeStart">${opts}</select>`]);
  }
  const els = elSpecFor(d).map(([k, label, allowed]) => `<div class="el-row"><span class="el-name">${label}</span>${seg('data-hel', k, allowed.map(v => [v, { show: 'Show', quiz: 'Quiz', hide: 'Hide' }[v]]), elOf(d, k))}</div>`).join('');
  rows.push(['Elements', `<div class="el-grid">${els}</div>${elSpecFor(d).some(([k]) => elOf(d, k) === 'quiz') ? '' : `<p class="bad-note">${icon('no')} Set at least one element to Quiz.</p>`}`]);
  rows.push(['Answer', seg('data-hs', 'answer', [['', 'Default'], ['type', 'Type'], ['along', 'Type along'], ['choice', 'Choice'], ['self', 'Self-check']], d.answer || '') +
    (d.mode !== 'total' ? `<label class="cb"><input type="checkbox" data-hflag="weak" ${d.weak ? 'checked' : ''}> Weak spots first</label>` : '')]);
  return rows.map(([l, h]) => `<div class="set-row"><span class="glabel">${l}</span><div class="set-ctl">${h}</div></div>`).join('');
}
const visibleFor = (m, d) => m.seq.filter(k => elOf(d, kindOf(k, m)) !== 'hide');

function renderHome() {
  const d = homeDraft(), groups = Library.groups();
  const preset = Presets.get(H.presetId);
  const custom = !preset;
  const pathChips = Object.entries(groups).map(([g, ps]) => `<div class="pgroup"><span class="glabel">${esc(g)}</span><div class="chips">${ps.map(p =>
    `<button class="chip-tg" data-h="path" data-id="${esc(p.id)}" aria-pressed="${d.pathways.includes(p.id)}">${esc(p.name)}</button>`).join('')}</div></div>`).join('');
  const usesAll = d.mode === 'step' && d.given === 'enz' && d.allPathways;
  const nPaths = usesAll ? Object.keys(Library.all()).length : d.pathways.length;
  const canStart = nPaths > 0 && elSpecFor(d).some(([k]) => elOf(d, k) === 'quiz');
  const worst = Stats.worst(6);
  const startHint = !nPaths ? 'Pick at least one pathway.' : `${nPaths} pathway${nPaths > 1 ? 's' : ''} · ${custom ? 'custom setup' : esc(preset.name)}`;

  $('#view').innerHTML = `<div class="page home">
    <section class="compose card">
      <h1 class="compose-title">Start a quiz</h1>
      <div class="step-sec">
        <div class="step-h"><span class="stepn">1</span><h2>Pathways</h2>
          <div class="btnrow tight"><button class="linkbtn" data-h="allpaths">Select all</button><button class="linkbtn" data-h="nopaths">Clear</button></div></div>
        ${usesAll ? '<p class="note">This quiz draws from all pathways.</p>' : ''}
        <div class="pgroups${usesAll ? ' dim' : ''}">${pathChips}</div>
      </div>
      <div class="step-sec">
        <div class="step-h"><span class="stepn">2</span><h2>Quiz style</h2></div>
        <div class="tiles">${Presets.all().map(presetTile).join('')}${custom ? `<button class="tile on" aria-pressed="true"><span class="tile-name">${mi('check', 'sm')}Custom</span><span class="tile-blurb">${esc(quizSummary(d))}</span></button>` : ''}</div>
      </div>
      <details class="step-sec fine"${local.get('pathways.fineOpen') ? ' open' : ''}>
        <summary class="step-h"><span class="stepn">3</span><h2>Fine-tune</h2><span class="muted sum">${esc(quizSummary(d))}</span>${mi('expand_more', 'chev')}</summary>
        <div class="setup">${setupRows(d)}</div>
      </details>
      <div class="compose-foot">
        <button class="btn primary big" data-h="start" ${canStart ? '' : 'disabled'}>${mi('play_arrow')} Start</button>
        <button class="btn" data-h="savepreset" ${canStart ? '' : 'disabled'}>${mi('bookmark_add', 'sm')} Save as preset</button>
        <span class="muted">${startHint}</span>
      </div>
    </section>
    <div class="home-cols">
      <section class="card pad">
        <div class="sec-h"><h2>${mi('trending_down', 'h-ic')} Weak spots</h2>${worst.length ? '<button class="btn small" data-h="drill">Drill these</button>' : ''}</div>
        ${statsTableHTML(worst, { showPathway: true })}
      </section>
      <section class="card pad">
        <div class="sec-h"><h2>${mi('library_books', 'h-ic')} Pathways</h2><a class="btn small" href="#/pathways">Library</a></div>
        <ul class="plist">${Library.list().map(p => { const a = Stats.accuracy(p.id); return `<li><a href="#/pathways/${esc(p.id)}">${esc(p.name)}</a><span class="muted">${a ? `${a.pct}% first try` : 'not studied'}</span>${a ? `<span class="meter" role="img" aria-label="${a.pct} percent"><span style="width:${a.pct}%"></span></span>` : '<span class="meter empty"></span>'}</li>`; }).join('')}</ul>
      </section>
    </div>
  </div>`;
  const st = $('#homeStart'); if (st) st.value = [...st.options].some(o => o.value === d.start) ? d.start : 'random';
}
function launchQuiz(cfg) {
  local.set(CURRENT_QUIZ, cfg);
  startQuiz(cfg);
  if (location.hash === '#/quiz') renderQuiz(); else location.hash = '#/quiz';
}
document.addEventListener('click', e => {
  if (!$('#view .home')) return;
  const t = e.target.closest('[data-h],[data-hs],[data-hel]');
  if (!t) return;
  const d = H.draft;
  const markCustom = () => { H.presetId = null; };
  if (t.dataset.hs) {
    let v = t.dataset.v; if (t.dataset.hs === 'allPathways') v = v === 'true'; if (t.dataset.hs === 'answer') v = v || null;
    d[t.dataset.hs] = v; markCustom();
  } else if (t.dataset.hel) { d.el[t.dataset.hel] = t.dataset.v; markCustom(); }
  else switch (t.dataset.h) {
    case 'path': { const id = t.dataset.id; d.pathways = d.pathways.includes(id) ? d.pathways.filter(x => x !== id) : [...d.pathways, id]; break; }
    case 'allpaths': d.pathways = Library.list().map(p => p.id); break;
    case 'nopaths': d.pathways = []; break;
    case 'preset': applyPreset(t.dataset.id); break;
    case 'start': {
      const p = Presets.get(H.presetId);
      const cfg = { ...clone(d), name: p ? p.name : 'Custom quiz' };
      local.set(LAST_QUIZ, { presetId: H.presetId, cfg: d });
      return launchQuiz(cfg);
    }
    case 'savepreset':
      return ask({ title: 'Save as preset', text: 'Saved presets appear as quiz styles on this page. The pathways you picked are saved with it.', input: true, value: '', ok: 'Save' }).then(name => {
        if (!name) return;
        const id = 'u-' + Date.now().toString(36);
        Presets.save({ ...clone(d), id, name, blurb: quizSummary(d) });
        H.presetId = id; renderHome();
      });
    case 'drill': {
      const pids = uniq(Stats.worst(50).map(r => r.pid));
      return launchQuiz({ ...QUIZ_DEFAULTS, name: 'Weak spots', pathways: pids, mode: 'single', weak: true, el: { met: 'quiz', enz: 'quiz', cof: 'quiz' } });
    }
    default: return;
  }
  renderHome();
});
document.addEventListener('change', e => {
  if (!$('#view .home')) return;
  if (e.target.id === 'homeStart') { H.draft.start = e.target.value; H.presetId = null; renderHome(); }
  if (e.target.dataset.hflag) { H.draft[e.target.dataset.hflag] = e.target.checked; H.presetId = null; renderHome(); }
});
document.addEventListener('toggle', e => { if (e.target.matches?.('details.fine')) local.set('pathways.fineOpen', e.target.open); }, true);

/* ================= Library ================= */
function renderLibrary() {
  $('#view').innerHTML = `<div class="page">
    ${pageHead('Pathways', `${Library.list().length} pathways. Built-in ones can be edited; your edits are kept as a copy you can reset.`,
      `<a class="btn primary" href="#/pathways/new">${mi('add', 'sm')} New pathway</a><a class="btn" href="#/pathways/new-combined">${mi('add', 'sm')} Combine pathways</a><button class="btn" data-lib="import">${mi('upload', 'sm')} Import</button>`)}
    ${Object.entries(Library.groups()).map(([g, ps]) => `<section class="libgroup"><h2 class="glabel">${esc(g)}</h2><div class="cards">${ps.map(p => {
      const a = Stats.accuracy(p.id);
      return `<article class="pcard card">
        <a class="pcard-main" href="#/pathways/${esc(p.id)}"><h3>${esc(p.name)}</h3>
          <p class="muted">${p.steps} steps${p.status !== 'builtin' ? ` · <span class="pill">${p.status === 'edited' ? 'edited' : 'yours'}</span>` : ''}</p>
          <div class="acc">${a ? `<span class="meter" role="img" aria-label="${a.pct} percent"><span style="width:${a.pct}%"></span></span><span>${a.pct}% first try · ${a.n} answers</span>` : '<span class="muted">Not studied yet</span>'}</div></a>
        <div class="pcard-actions"><button class="btn small" data-lib="study" data-id="${esc(p.id)}">${mi('play_arrow', 'sm')} Study</button><a class="btn small ghost" href="#/pathways/${esc(p.id)}/edit">${mi('edit', 'sm')} Edit</a></div>
      </article>`; }).join('')}</div></section>`).join('')}
    <input type="file" id="libFile" accept=".json,application/json" hidden>
  </div>`;
}
function studyPathway(id) {
  homeDraft();
  H.draft.pathways = [id];
  if (H.draft.allPathways) H.draft.allPathways = false;
  location.hash = '#/';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lib]');
  if (!b) return;
  if (b.dataset.lib === 'import') $('#libFile').click();
  if (b.dataset.lib === 'study') studyPathway(b.dataset.id);
});
document.addEventListener('change', e => { if (e.target.id === 'libFile') importFile(e.target.files[0]); });

/* ================= One pathway ================= */
function renderPathway(id) {
  const p = Library.get(id);
  if (!p) { $('#view').innerHTML = `<div class="page">${pageHead('Not found', 'That pathway doesn’t exist.')}<a class="btn" href="#/pathways">Back to the library</a></div>`; return; }
  let m;
  try { m = modelFor(p); } catch (err) { $('#view').innerHTML = `<div class="page">${pageHead(esc(p.name))}<div class="ed-err">${esc(err.message)}</div><a class="btn" href="#/pathways/${esc(id)}/edit">Fix it in the editor</a></div>`; return; }
  const st = Library.status(id), a = Stats.accuracy(id);
  const flow = Store.settings.view === 'flow';
  const steps = p.reactions.map((r, i) => {
    const tags = [r.only ? r.only + ' only' : '', r.branch && !r.only ? 'side step' : '', r.reversible ? 'reversible' : 'irreversible', ...(r.tags || []).filter(t => t !== 'irreversible'), ...(r.requires || []).map(x => 'needs ' + x)].filter(Boolean);
    return `<tr><td class="num muted">${i + 1}</td><td>${esc(metNames(m, reactantsOf(r)))} ${r.reversible ? '⇌' : '→'} ${esc(metNames(m, productsOf(r)))}</td><td><b>${esc(p.enzymes[r.enzyme].name)}</b>${r.transport ? ' <span class="pill">transport</span>' : ''}</td><td>${esc(cofText(m, r.cofactors || {}))}</td><td>${esc([r.tissue, r.loc].filter(Boolean).join(' · '))}</td><td class="muted">${esc(tags.join(' · '))}</td></tr>`;
  }).join('');
  $('#view').innerHTML = `<div class="page pathway">
    <a class="back" href="#/pathways">${mi('arrow_back', 'sm')} Library</a>
    ${pageHead(esc(p.name), `${esc(p.group || 'Other')} · ${p.reactions.length} steps${st !== 'builtin' ? ` · ${st === 'edited' ? 'edited copy' : 'your pathway'}` : ''}${a ? ` · ${a.pct}% first try` : ''}`,
      `<button class="btn primary" data-pw="study">${mi('play_arrow', 'sm')} Study</button><a class="btn" href="#/pathways/${esc(id)}/edit">${mi('edit', 'sm')} Edit</a><button class="btn ghost" data-pw="export">${mi('download', 'sm')} Export</button>`)}
    ${p.summary ? `<p class="lede">${esc(p.summary)}</p>` : ''}${p.tissue ? `<p class="muted"><b>Where:</b> ${esc(p.tissue)}</p>` : ''}
    <section class="card diagram-card">
      <div class="sec-h"><div class="seg">${['flow', 'list'].map(v => `<button data-pwview="${v}" aria-pressed="${Store.settings.view === v}">${v === 'flow' ? 'Flow' : 'List'}</button>`).join('')}</div>${flow ? zoomBarHTML() : ''}</div>
      <div class="stage">${flow ? flowSVG(m, () => 'shown') : listHTML(m, () => 'shown', { horiz: Store.settings.dir === 'h' })}</div>
    </section>
    <section class="card pad"><h2>Steps</h2><div class="tablewrap"><table class="steps"><thead><tr><th class="num">#</th><th>Reaction</th><th>Enzyme</th><th>Cofactors</th><th>Where</th><th>Notes</th></tr></thead><tbody>${steps}</tbody></table></div></section>
    <section class="card pad"><div class="sec-h"><h2>Weak spots</h2>${Store.data.stats[id] ? '<button class="btn small ghost" data-pw="resetstats">Clear history</button>' : ''}</div>${statsTableHTML(Stats.rows(p))}</section>
  </div>`;
  applyZoom($('#view'));
}
document.addEventListener('click', e => {
  if (!$('#view .pathway')) return;
  const id = location.hash.split('/')[2];
  const v = e.target.closest('[data-pwview]');
  if (v) { Store.settings.view = v.dataset.pwview; Store.save(); return renderPathway(id); }
  const b = e.target.closest('[data-pw]');
  if (!b) return;
  if (b.dataset.pw === 'study') studyPathway(id);
  if (b.dataset.pw === 'export') exportPathway(Library.get(id));
  if (b.dataset.pw === 'resetstats') ask({ title: 'Clear the history for this pathway?', ok: 'Clear' }).then(y => { if (y) { Stats.reset(id); renderPathway(id); } });
});

/* ================= Settings ================= */
function renderSettings() {
  const s = Store.settings, mine = Store.data.presets;
  const opt = (key, opts) => seg('data-set', key, opts, s[key]);
  $('#view').innerHTML = `<div class="page settings">
    ${pageHead('Settings')}
    <section class="card pad"><h2>Quiz defaults</h2><p class="muted">Used whenever a quiz doesn't set its own.</p>
      <div class="setup">
        <div class="set-row"><span class="glabel">Answer</span><div class="set-ctl">${opt('answer', [['type', 'Type'], ['along', 'Type along'], ['choice', 'Choice'], ['self', 'Self-check']])}</div></div>
        <div class="set-row"><span class="glabel">View</span><div class="set-ctl">${opt('view', [['flow', 'Flow'], ['list', 'List']])}${opt('dir', [['v', 'List top–bottom'], ['h', 'List left–right']])}</div></div>
        <div class="set-row"><span class="glabel">Zoom</span><div class="set-ctl">${opt('zoom', [['width', 'Fit width'], ['fit', 'Fit to frame']])}<label class="cb"><input type="checkbox" data-sflag="follow" ${s.follow ? 'checked' : ''}> Follow the current blank</label></div></div>
        <div class="set-row"><span class="glabel">During a quiz</span><div class="set-ctl"><label class="cb"><input type="checkbox" data-sflag="facts" ${s.facts ? 'checked' : ''}> Show facts after each answer</label><label class="cb"><input type="checkbox" data-sflag="autoAdvance" ${s.autoAdvance ? 'checked' : ''}> Full recall moves on after a right answer</label></div></div>
      </div></section>
    <section class="card pad"><h2>Your presets</h2>
      ${mine.length ? `<ul class="presetlist">${mine.map(p => `<li><div><b>${esc(p.name)}</b><span class="muted">${esc(quizSummary(normalizeQuiz(p)))}${p.pathways?.length ? ` · ${p.pathways.length} pathway${p.pathways.length > 1 ? 's' : ''}` : ''}</span></div>
        <div class="btnrow tight"><button class="btn small ghost" data-preset="rename" data-id="${esc(p.id)}">Rename</button><button class="btn small ghost" data-preset="delete" data-id="${esc(p.id)}">${mi('delete', 'sm')} Delete</button></div></li>`).join('')}</ul>`
        : '<p class="muted">None yet. On Home, set up a quiz and press Save as preset.</p>'}
    </section>
    <section class="card pad"><h2>Your data</h2>
      <p class="muted">${Store.mode === 'server' ? 'Saved on your Pathways server, so every device sees the same pathways, presets and history.' : 'Saved in this browser only. Export a backup to move it to another device.'}</p>
      <div class="btnrow"><button class="btn" data-data="export">${mi('download', 'sm')} Export backup</button><button class="btn" data-data="import">${mi('upload', 'sm')} Import backup</button><button class="btn ghost" data-data="resetstats">Clear all history</button></div>
      <input type="file" id="backupFile" accept=".json,application/json" hidden>
    </section>
    <section class="card pad about"><h2>About</h2><p class="muted">Pathways · open source on <a href="https://github.com/chbarnhouse/pathways" target="_blank" rel="noopener">GitHub</a>. Icons: Material Symbols.</p></section>
  </div>`;
}
document.addEventListener('click', e => {
  if (!$('#view .settings')) return;
  const sb = e.target.closest('[data-set]');
  if (sb) { Store.settings[sb.dataset.set] = sb.dataset.v; Store.save(); return renderSettings(); }
  const pb = e.target.closest('[data-preset]');
  if (pb) {
    const p = Store.data.presets.find(x => x.id === pb.dataset.id);
    if (pb.dataset.preset === 'rename') ask({ title: 'Rename preset', input: true, value: p.name, ok: 'Rename' }).then(n => { if (n) { p.name = n; Presets.save(p); renderSettings(); } });
    if (pb.dataset.preset === 'delete') ask({ title: `Delete “${p.name}”?`, ok: 'Delete' }).then(y => { if (y) { Presets.remove(p.id); if (H.presetId === p.id) H.presetId = null; renderSettings(); } });
    return;
  }
  const db = e.target.closest('[data-data]');
  if (!db) return;
  if (db.dataset.data === 'export') {
    const text = JSON.stringify({ pathwaysBackup: 1, ...Store.data }, null, 1);
    ask({ title: 'Export backup', text: 'Your edited pathways, presets, settings and history.', input: 'area', value: text, ok: window.PATHWAYS_ARTIFACT ? 'Done' : 'Download file', cancel: window.PATHWAYS_ARTIFACT ? null : 'Close', copy: true })
      .then(v => v && !window.PATHWAYS_ARTIFACT && download('pathways-backup.json', text));
  }
  if (db.dataset.data === 'import') $('#backupFile').click();
  if (db.dataset.data === 'resetstats') ask({ title: 'Clear all answer history?', text: 'Weak spots and accuracy start over. Pathways and presets stay.', ok: 'Clear' }).then(y => { if (y) { Stats.reset(); renderSettings(); } });
});
document.addEventListener('change', e => {
  if (!$('#view .settings')) return;
  if (e.target.dataset.sflag) { Store.settings[e.target.dataset.sflag] = e.target.checked; Store.save(); }
  if (e.target.id === 'backupFile') e.target.files[0]?.text().then(async t => {
    let b; try { b = JSON.parse(t); } catch (err) { return say('Can’t read that file', err.message); }
    if (!b.pathwaysBackup) return say('Not a Pathways backup', 'Use a file made with Export backup. To add a single pathway, use Import in the library.');
    if (!(await ask({ title: 'Replace your data with this backup?', text: 'Your current pathways, presets, settings and history will be replaced.', ok: 'Replace' }))) return;
    delete b.pathwaysBackup;
    Store.data = Object.assign({ custom: {}, stats: {}, presets: [] }, b);
    Store.data.settings = Object.assign({}, DEFAULT_SETTINGS, b.settings);
    Store.save(); H.draft = null; renderSettings();
  });
});

/* ================= Router ================= */
function router() {
  const h = location.hash || '#/';
  let page = 'home', m;
  closeOpenDialogs();
  if (h === '#/' || h === '#' || h === '') renderHome();
  else if (h === '#/quiz') {
    page = 'quiz';
    if (!Q.cfg) { const c = local.get(CURRENT_QUIZ); if (c) startQuiz(c); }
    if (Q.cfg) renderQuiz(); else { location.replace('#/'); return; }
  }
  else if (h === '#/pathways') { page = 'pathways'; renderLibrary(); }
  else if (h === '#/pathways/new') { page = 'pathways'; openEditor(null); }
  else if (h === '#/pathways/new-combined') { page = 'pathways'; openEditor(null, { id: '', name: 'Combined pathway', group: 'Combined', summary: '', compose: [] }); }
  else if (h === '#/pathways/import') { page = 'pathways'; if (E.pending) openEditor(null, E.pending); else location.replace('#/pathways'); }
  else if ((m = h.match(/^#\/pathways\/([^/]+)\/edit$/))) { page = 'pathways'; openEditor(decodeURIComponent(m[1])); }
  else if ((m = h.match(/^#\/pathways\/([^/]+)$/))) { page = 'pathways'; renderPathway(decodeURIComponent(m[1])); }
  else if (h === '#/settings') { page = 'settings'; renderSettings(); }
  else { location.replace('#/'); return; }
  document.body.dataset.page = page;
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.nav === page ? 'page' : 'false'));
  if (page !== 'quiz') window.scrollTo(0, 0);
}
function closeOpenDialogs() { $$('dialog[open]').forEach(d => d.close()); }
window.addEventListener('hashchange', router);

(async function boot() {
  $('#brandIcon').innerHTML = mi('signpost');
  $$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', mi(el.dataset.icon, 'sm')));
  await Store.init();
  router();
})();
