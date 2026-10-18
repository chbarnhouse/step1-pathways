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

/* ================= Dashboard (#/) ================= */
function renderDashboard() {
  const last = local.get(LAST_QUIZ), worst = Stats.worst(6), mine = Store.data.presets;
  const lastP = last?.cfg && Library.get(last.cfg.combine && pairOf(last.cfg.pathway) ? pairOf(last.cfg.pathway).id : last.cfg.pathway);
  const studied = Library.list().filter(p => Stats.accuracy(p.id)).length;
  $('#view').innerHTML = `<div class="page dash">
    <div class="dash-top">
      <a class="card hero-new" href="#/new"><span class="hero-ic">${mi('add')}</span><span><b>New quiz</b><span class="muted">Pick a pathway and how to study it.</span></span></a>
      ${lastP ? `<button class="card hero-resume" data-dash="resume"><span class="hero-ic alt">${mi('play_arrow')}</span><span><b>Resume: ${esc(lastP.name)}</b><span class="muted">${esc(quizSummary(normalizeQuiz(last.cfg)))}</span></span></button>` : ''}
    </div>
    <div class="dash-cols">
      <section class="card pad">
        <div class="sec-h"><h2>${mi('trending_down', 'h-ic')} Weak spots</h2>${worst.length ? '<button class="btn small" data-dash="drill">Drill these</button>' : ''}</div>
        ${statsTableHTML(worst, { showPathway: true })}
      </section>
      <section class="card pad">
        <div class="sec-h"><h2>${mi('library_books', 'h-ic')} Progress</h2><span class="muted">${studied} of ${Library.atomic().length} studied</span></div>
        <ul class="plist">${Library.list().filter(p => !Library.get(p.id).compose).map(p => { const a = Stats.accuracy(p.id); return `<li><a href="#/pathways/${esc(p.id)}">${esc(p.name)}</a><span class="muted">${a ? `${a.pct}% first try` : 'not studied'}</span>${a ? `<span class="meter" role="img" aria-label="${a.pct} percent"><span style="width:${a.pct}%"></span></span>` : '<span class="meter blankmeter"></span>'}</li>`; }).join('')}</ul>
      </section>
    </div>
    <div class="dash-cols">
      ${mine.length ? `<section class="card pad"><h2>Your presets</h2><div class="chips">${mine.map(p => `<a class="chip-link" href="#/new" data-dash="preset" data-id="${esc(p.id)}">${mi('play_arrow', 'sm')} ${esc(p.name)}</a>`).join('')}</div></section>` : ''}
      ${backupCardHTML()}
    </div>
  </div>`;
}
// Static builds keep everything in this browser, so the dashboard keeps the backup one click away.
function backupCardHTML() {
  if (Store.mode === 'server') return `<section class="card pad"><h2>${mi('download', 'h-ic')} Your data</h2><p class="muted">Saved on your Pathways server, so every device sees the same progress. You can still export a copy from Settings.</p></section>`;
  const lb = local.get('pathways.lastBackup');
  const ago = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
  return `<section class="card pad backup${!lb || ago > 7 ? ' due' : ''}"><h2>${mi('download', 'h-ic')} Back up your progress</h2>
    <p class="muted">Your progress, presets and pathways are stored in this browser only. Clearing site data or switching browsers loses them, so save a backup file now and then and restore it anywhere.</p>
    <p><b>Last backup:</b> ${lb ? (ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`) : 'never'}${Store.persisted ? ' · this browser has agreed to keep your data' : ''}</p>
    <div class="btnrow"><button class="btn primary" data-data="download">${mi('download', 'sm')} Download backup</button><button class="btn" data-data="import">${mi('upload', 'sm')} Restore from file</button></div>
    <input type="file" id="backupFile" accept=".json,application/json" hidden>
  </section>`;
}
document.addEventListener('click', e => {
  if (!$('#view .dash')) return;
  const b = e.target.closest('[data-dash]');
  if (!b) return;
  if (b.dataset.dash === 'resume') { const last = local.get(LAST_QUIZ); if (last) launchQuiz(quizFromDraft(normalizeDraft(last.cfg))); }
  if (b.dataset.dash === 'drill') {
    const pids = uniq(Stats.worst(50).map(r => r.pid));
    launchQuiz({ ...QUIZ_DEFAULTS, name: 'Weak spots', pathways: pids, mode: 'single', weak: true, el: { met: 'quiz', enz: 'quiz', trn: 'quiz', cof: 'quiz', loc: 'show' } });
  }
  if (b.dataset.dash === 'preset') { e.preventDefault(); C.draft = null; homeDraft(); loadPresetInto(b.dataset.id); location.hash = '#/new'; }
});

/* ================= New quiz (#/new) =================
   Left: one thumbnail per pathway. Right: how to study it. One pathway at a time; pathways that come as a pair
   (a combined pathway lists them) offer "study together" once you pick one of them. */
const C = { draft: null, presetId: '' };
const DRAFT_DEFAULTS = { pathway: 'glycolysis', combine: false, mode: 'single', given: 'mets', start: 'random', answer: null, weak: false, allPathways: false, letterCheck: false, hints: false,
  el: { met: 'quiz', enz: 'quiz', trn: 'quiz', cof: 'show', loc: 'show', dir: 'quiz', path: 'quiz' } };
function normalizeDraft(d) {
  const out = Object.assign(clone(DRAFT_DEFAULTS), clone(d || {}));
  out.el = Object.assign(clone(DRAFT_DEFAULTS.el), (d && d.el) || {});
  if (!out.pathway && d?.pathways?.length) out.pathway = d.pathways[0];
  if (!Library.get(out.pathway) || Library.get(out.pathway).compose) out.pathway = Library.atomic()[0]?.id;
  return out;
}
function homeDraft() {
  if (!C.draft) C.draft = normalizeDraft(local.get(LAST_QUIZ)?.cfg);
  return C.draft;
}
// The combined pathway that contains this one, if any (e.g. glycolysis → glycolysis + gluconeogenesis).
function pairOf(id) { return Object.values(Library.all()).find(p => p.compose && p.compose.includes(id)); }
function quizFromDraft(d) {
  const pair = d.combine && pairOf(d.pathway);
  const pid = pair ? pair.id : d.pathway;
  const allE = d.mode === 'step' && d.given === 'enz' && d.allPathways;
  return { ...clone(d), pathways: [pid], allPathways: allE, name: allE ? 'All pathways' : Library.get(pid)?.name || 'Quiz' };
}
function loadPresetInto(id) {
  const p = Store.data.presets.find(x => x.id === id);
  if (!p) return;
  const keep = C.draft.pathway, combine = C.draft.combine;
  C.draft = normalizeDraft({ ...p, pathway: keep, combine });
  C.presetId = id;
}
const MODES = [
  ['single', 'Fill the blanks', 'The whole pathway, one piece missing at a time.'],
  ['total', 'Full recall', 'Rebuild the pathway in order, step by step.'],
  ['step', 'Single step', 'One step on its own: name what connects two metabolites, or what an enzyme does.'],
];
const thumbCache = new Map();
function thumbSVG(p) {
  const hit = thumbCache.get(p.id);
  if (hit && hit.src === p) return hit.svg;
  let svg = '';
  try { svg = flowSVG(modelFor(p), () => 'shown', { zones: true }); } catch {}
  thumbCache.set(p.id, { src: p, svg });
  return svg;
}
function renderCreate() {
  const d = homeDraft(), sel = Library.get(d.pathway), pair = pairOf(d.pathway);
  const partner = pair && pair.compose.filter(x => x !== d.pathway).map(x => Library.get(x)?.name).filter(Boolean).join(' and ');
  const allE = d.mode === 'step' && d.given === 'enz' && d.allPathways;
  const ans = d.answer || Store.settings.answer;
  const hasQuiz = elSpecFor({ ...d }).some(([k]) => elOf(d, k) === 'quiz');
  const groups = {};
  const order = ['Carbohydrates', 'Energy', 'Lipids', 'Nitrogen & amino acids', 'Nucleotides', 'Heme'];
  for (const p of Library.atomic().sort((a, b) => ((order.indexOf(a.group) + 1) || 99) - ((order.indexOf(b.group) + 1) || 99) || a.name.localeCompare(b.name)))
    (groups[p.group || 'Other'] = groups[p.group || 'Other'] || []).push(p);
  const els = elSpecFor(d).map(([k, label, allowed]) => `<div class="el-row"><span class="el-name">${label}</span>${seg('data-cel', k, allowed.map(v => [v, { show: 'Show', quiz: 'Quiz', hide: 'Hide' }[v]]), elOf(d, k))}</div>`).join('');
  let modeOpts = '';
  if (d.mode === 'total') {
    const m = modelFor(Library.get(d.combine && pair ? pair.id : d.pathway));
    modeOpts = `<label class="field">Start<select id="cStart"><option value="random">A random point</option><option value="begin">The beginning, nothing shown</option><optgroup label="Start at">${visibleFor(m, d).map(k => `<option value="${esc(k)}">${esc(m.items[k].name)}${kindOf(k, m) !== 'met' ? ` (${KIND[kindOf(k, m)]})` : ''}</option>`).join('')}</optgroup></select></label>`;
  }
  if (d.mode === 'step') modeOpts = `<div class="field"><span>You're given</span>${seg('data-cs', 'given', [['mets', 'Two metabolites'], ['enz', 'An enzyme']], d.given)}</div>
    ${d.given === 'enz' ? `<label class="cb"><input type="checkbox" data-cflag="allPathways" ${d.allPathways ? 'checked' : ''}> Draw enzymes from every pathway</label>` : ''}`;
  $('#view').innerHTML = `<div class="page create">
    <div class="create-grid">
      <section class="picker">
        <div class="page-h"><div><h1>New quiz</h1><p class="muted">Choose a pathway${allE ? ' (enzymes will come from every pathway)' : ''}.</p></div></div>
        ${Object.entries(groups).map(([g, ps]) => `<div class="tgroup"><h2 class="glabel">${esc(g)}</h2><div class="thumbs">${ps.map(p => {
          const on = p.id === d.pathway, a = Stats.accuracy(p.id), pr = pairOf(p.id);
          return `<button class="thumb${on ? ' on' : ''}" data-cpick="${esc(p.id)}" aria-pressed="${on}">
            <span class="thumb-img">${thumbSVG(p)}</span>
            <span class="thumb-name">${on ? mi('check', 'sm') : ''}${esc(p.name)}</span>
            <span class="thumb-meta muted">${(p.reactions || []).length} steps${a ? ` · ${a.pct}%` : ''}${pr ? ' · pairs up' : ''}</span>
          </button>`; }).join('')}</div></div>`).join('')}
      </section>
      <aside class="sidebar card">
        <div class="side-sel"><span class="glabel">Pathway</span><b>${esc(allE ? 'All pathways' : sel?.name || '')}</b></div>
        ${pair && !allE ? `<label class="pairbox${d.combine ? ' on' : ''}"><input type="checkbox" data-cflag="combine" ${d.combine ? 'checked' : ''}>
          <span><b>Study together with ${esc(partner)}</b><span class="muted">${esc(pair.name)}: shared steps once, each one's own steps alongside.</span></span></label>` : ''}
        ${Store.data.presets.length ? `<label class="field">Preset<select id="cPreset"><option value="">Current settings</option>${Store.data.presets.map(p => `<option value="${esc(p.id)}"${C.presetId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        <div class="field"><span>How</span><div class="modes">${MODES.map(([v, t, b]) => `<button class="mode${d.mode === v ? ' on' : ''}" data-cs="mode" data-v="${v}" aria-pressed="${d.mode === v}"><b>${d.mode === v ? mi('check', 'sm') : ''}${t}</b><span>${b}</span></button>`).join('')}</div></div>
        ${modeOpts}
        <div class="field"><span>Answer by</span>${seg('data-cs', 'answer', [['type', 'Typing'], ['along', 'Typing along'], ['choice', 'Choice'], ['self', 'Self-check']], ans)}
          ${ans === 'type' ? `<label class="cb"><input type="checkbox" data-cflag="letterCheck" ${d.letterCheck ? 'checked' : ''}> Check each letter as I type</label>` : ''}
          ${['type', 'along'].includes(ans) ? `<label class="cb"><input type="checkbox" data-cflag="hints" ${d.hints ? 'checked' : ''}> “Give me a letter” button</label>` : ''}
          <p class="muted small">${{ type: 'Type the name; abbreviations count, and a/alpha work for α.', along: 'The answer is shown faintly; type it to fill it in.', choice: 'Pick from four options of the same kind.', self: 'Reveal it and mark yourself right or wrong.' }[ans]}</p></div>
        <details class="adv"${local.get('pathways.advOpen') ? ' open' : ''}><summary>${mi('tune', 'sm')} Advanced: what to show, quiz or hide${mi('expand_more', 'chev')}</summary>
          <div class="el-grid">${els}</div>
          ${hasQuiz ? '' : `<p class="bad-note">${icon('no')} Set at least one to Quiz.</p>`}
          ${d.mode !== 'total' ? `<label class="cb"><input type="checkbox" data-cflag="weak" ${d.weak ? 'checked' : ''}> Weak spots first</label>` : ''}
        </details>
        <div class="side-foot">
          <button class="btn primary big" data-c="start" ${hasQuiz ? '' : 'disabled'}>${mi('play_arrow')} Start quiz</button>
          <button class="btn ghost" data-c="savepreset">${mi('bookmark_add', 'sm')} Save as preset</button>
        </div>
      </aside>
    </div>
  </div>`;
  const st = $('#cStart'); if (st) st.value = [...st.options].some(o => o.value === d.start) ? d.start : 'random';
}
function launchQuiz(cfg) {
  local.set(CURRENT_QUIZ, cfg);
  startQuiz(cfg);
  if (location.hash === '#/quiz') renderQuiz(); else location.hash = '#/quiz';
}
document.addEventListener('click', e => {
  if (!$('#view .create')) return;
  const d = C.draft;
  const pick = e.target.closest('[data-cpick]');
  if (pick) {
    const id = pick.dataset.cpick;
    if (d.pathway !== id) { d.combine = false; if (d.start !== 'random' && d.start !== 'begin') d.start = 'random'; }
    d.pathway = id; d.allPathways = false;
    return renderCreate();
  }
  const sb = e.target.closest('[data-cs]');
  if (sb) { d[sb.dataset.cs] = sb.dataset.v; C.presetId = ''; return renderCreate(); }
  const eb = e.target.closest('[data-cel]');
  if (eb) { d.el[eb.dataset.cel] = eb.dataset.v; C.presetId = ''; return renderCreate(); }
  const a = e.target.closest('[data-c]');
  if (!a) return;
  if (a.dataset.c === 'start') {
    local.set(LAST_QUIZ, { cfg: d });
    launchQuiz(quizFromDraft(d));
  }
  if (a.dataset.c === 'savepreset') ask({ title: 'Save as preset', text: 'A preset keeps how you study (mode, answers, what to show or quiz) and works with any pathway.', input: true, ok: 'Save' }).then(name => {
    if (!name) return;
    const { pathway, combine, ...style } = clone(d);
    const id = 'u-' + Date.now().toString(36);
    Presets.save({ ...style, id, name, blurb: quizSummary(normalizeQuiz(style)) });
    C.presetId = id; renderCreate();
  });
});
document.addEventListener('change', e => {
  if (!$('#view .create')) return;
  const d = C.draft, t = e.target;
  if (t.id === 'cStart') d.start = t.value;
  else if (t.id === 'cPreset') { if (t.value) loadPresetInto(t.value); else C.presetId = ''; }
  else if (t.dataset.cflag) { d[t.dataset.cflag] = t.checked; if (t.dataset.cflag === 'combine') d.start = ['random', 'begin'].includes(d.start) ? d.start : 'random'; }
  else return;
  renderCreate();
});
document.addEventListener('toggle', e => { if (e.target.matches?.('details.adv')) local.set('pathways.advOpen', e.target.open); }, true);

const visibleFor = (m, d) => m.seq.filter(k => elOf(d, kindOf(k, m)) !== 'hide');

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
  const p = Library.get(id);
  if (p?.compose) { C.draft.pathway = p.compose[0]; C.draft.combine = true; }
  else { C.draft.pathway = id; C.draft.combine = false; }
  C.draft.allPathways = false;
  location.hash = '#/new';
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
    if (pb.dataset.preset === 'delete') ask({ title: `Delete “${p.name}”?`, ok: 'Delete' }).then(y => { if (y) { Presets.remove(p.id); if (C.presetId === p.id) C.presetId = ''; renderSettings(); } });
    return;
  }
});
document.addEventListener('change', e => {
  if (!$('#view .settings')) return;
  if (e.target.dataset.sflag) { Store.settings[e.target.dataset.sflag] = e.target.checked; Store.save(); }
});

/* ---------- backups (Settings and the dashboard) ---------- */
function backupText() { return JSON.stringify({ pathwaysBackup: 1, savedAt: new Date().toISOString(), ...Store.data }, null, 1); }
function downloadBackup() {
  if (download(`pathways-backup-${new Date().toISOString().slice(0, 10)}.json`, backupText())) local.set('pathways.lastBackup', Date.now());
}
document.addEventListener('click', e => {
  const db = e.target.closest('[data-data]');
  if (!db) return;
  if (db.dataset.data === 'download') { downloadBackup(); route(); }
  if (db.dataset.data === 'export') {
    ask({ title: 'Export backup', text: 'Your pathways, presets, settings and history. Download it, or copy it somewhere safe.', input: 'area', value: backupText(), ok: 'Download file', cancel: 'Close', copy: true })
      .then(v => { if (v) { downloadBackup(); route(); } });
  }
  if (db.dataset.data === 'import') $('#backupFile').click();
  if (db.dataset.data === 'resetstats') ask({ title: 'Clear all answer history?', text: 'Weak spots and accuracy start over. Pathways and presets stay.', ok: 'Clear' }).then(y => { if (y) { Stats.reset(); route(); } });
});
document.addEventListener('change', e => {
  if (e.target.id !== 'backupFile') return;
  e.target.files[0]?.text().then(async t => {
    let b; try { b = JSON.parse(t); } catch (err) { return say('Can’t read that file', err.message); }
    if (!b.pathwaysBackup) return say('Not a Pathways backup', 'Use a file made with Download backup. To add a single pathway, use Import in the library.');
    if (!(await ask({ title: 'Replace your data with this backup?', text: `Saved ${b.savedAt ? new Date(b.savedAt).toLocaleString() : 'earlier'}. Your current pathways, presets, settings and history will be replaced.`, ok: 'Replace' }))) return;
    delete b.pathwaysBackup; delete b.savedAt;
    Store.data = Object.assign({ custom: {}, stats: {}, presets: [] }, b);
    Store.data.settings = Object.assign({}, DEFAULT_SETTINGS, b.settings);
    Store.save(); C.draft = null; route();
    say('Backup restored', 'Your pathways, presets and history are back.');
  });
});

/* ================= Router ================= */
const route = () => router();
function router() {
  const h = location.hash || '#/';
  let page = 'home', m;
  closeOpenDialogs();
  if (h === '#/' || h === '#' || h === '') renderDashboard();
  else if (h === '#/new') { page = 'new'; renderCreate(); }
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
  // Ask the browser not to evict this site's storage (no prompt in most browsers; best effort).
  if (Store.mode === 'local' && navigator.storage?.persist) { try { Store.persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch {} }
  router();
})();
