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

/* ================= Dashboard (#/) =================
   Laid out to fit one screen: actions on top, then weak spots and progress side by side (each scrolls inside). */
function renderDashboard() {
  const last = local.get(LAST_QUIZ), worst = Stats.worst(8), mine = Store.data.presets;
  const lastD = last?.cfg && normalizeDraft(last.cfg), lastP = lastD && Library.get(lastD.combine && pairOf(lastD.pathway) ? pairOf(lastD.pathway).id : lastD.pathway);
  const atomic = Library.atomic().sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name));
  const studied = atomic.filter(p => Stats.accuracy(p.id)).length;
  $('#view').innerHTML = `<div class="page dash">
    <div class="dash-top">
      <a class="card hero-new" href="#/new"><span class="hero-ic">${mi('add')}</span><span><b>New quiz</b><span class="muted">Pick a pathway and how to study it.</span></span></a>
      ${lastP ? `<button class="card hero-resume" data-dash="resume">${tileArt(lastP)}<span><b>Resume: ${esc(lastP.name)}</b><span class="muted">${esc(quizSummary(normalizeQuiz(lastD)))}</span></span></button>` : ''}
      ${backupCardHTML()}
    </div>
    ${favorites().length ? `<div class="dash-favs" data-tour="favs">${favorites().map(f => { const p = Library.get(f.d.pathway); return `<div class="favtile">
      <button class="fav-go" data-dash="fav" data-id="${esc(f.id)}" title="Start this quiz">${p ? tileArt(p, 'sm') : ''}<span><b>${esc(f.name)}</b><span class="muted small">${esc(quizSummary(normalizeQuiz(f.d)))}</span></span>${mi('play_arrow', 'go')}</button>
      <button class="fav-x" data-dash="unfav" data-id="${esc(f.id)}" title="Remove from favorites" aria-label="Remove ${esc(f.name)} from favorites">${mi('close', 'sm')}</button></div>`; }).join('')}</div>`
      : `<p class="muted small dash-hint">${mi('star', 'sm')} Star a quiz on New quiz (or while you're in one) to pin it here.</p>`}
    ${mine.length ? `<div class="dash-presets"><span class="glabel">Your presets</span>${mine.map(p => `<a class="chip-link" href="#/new" data-dash="preset" data-id="${esc(p.id)}">${mi('play_arrow', 'sm')} ${esc(p.name)}</a>`).join('')}</div>` : ''}
    <div class="dash-cols">
      <section class="card pad dash-card">
        <div class="sec-h"><h2>${mi('trending_down', 'h-ic')} Weak spots</h2>${worst.length ? '<button class="btn small" data-dash="drill">Drill these</button>' : ''}</div>
        <div class="dash-scroll">${statsTableHTML(worst, { showPathway: true })}</div>
      </section>
      <section class="card pad dash-card">
        <div class="sec-h"><h2>${mi('history', 'h-ic')} Activity</h2><span class="muted">${(Store.data.log || []).length ? `${(Store.data.log || []).length} session${(Store.data.log || []).length > 1 ? 's' : ''}` : ''}</span></div>
        <div class="dash-scroll">${activityHTML()}</div>
      </section>
      <section class="card pad dash-card">
        <div class="sec-h"><h2>${mi('library_books', 'h-ic')} Progress</h2><span class="muted">${studied} of ${atomic.length} studied</span></div>
        <div class="dash-scroll"><ul class="pgrid">${atomic.map(p => { const a = Stats.accuracy(p.id); return `<li><a href="#/pathways/${esc(p.id)}">${tileArt(p, 'xs')}<span>${esc(p.name)}</span></a>${a ? `<span class="meter" role="img" aria-label="${a.pct} percent"><span style="width:${a.pct}%"></span></span><span class="pct">${a.pct}%</span>` : '<span class="muted small">—</span><span></span>'}</li>`; }).join('')}</ul></div>
      </section>
    </div>
  </div>`;
}
// What you studied, when, how, and how it went — newest first, grouped by day.
const MODE_NAMES = { single: 'Fill the blanks', total: 'Full recall', build: 'Building blocks', step: 'Single step' };
const ANSWER_NAMES = { type: 'typing', along: 'typing along', choice: 'choice', self: 'self-check' };
function activityHTML() {
  const log = Store.data.log || [];
  if (!log.length) return '<p class="muted">Nothing yet. Your quiz sessions will show up here.</p>';
  const dayKey = t => new Date(t).toDateString(), today = dayKey(Date.now()), yest = dayKey(Date.now() - 86400000);
  let out = '', cur = '';
  for (const e of log.slice(0, 80)) {
    const dk = dayKey(e.t);
    if (dk !== cur) { cur = dk; out += `<li class="act-day glabel">${dk === today ? 'Today' : dk === yest ? 'Yesterday' : new Date(e.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</li>`; }
    const p = Library.get(e.pathways?.[0]), pct = e.total ? Math.round(100 * e.right / e.total) : 0;
    const mins = Math.max(1, Math.round((e.last - e.t) / 60000));
    const what = e.pathways?.length > 1 ? `${e.pathways.length} pathways` : p?.name || e.name;
    const how = MODE_NAMES[e.mode] + (e.mode === 'step' ? (e.given === 'enz' ? ' (enzyme)' : ' (metabolites)') : '') + ' · ' + (ANSWER_NAMES[e.answer] || e.answer);
    out += `<li class="act">${p ? tileArt(p, 'xs') : `<span class="tile-art xs tone-slate">${mi('route')}</span>`}
      <span class="act-main"><b>${esc(what)}</b><span class="muted small">${esc(how)}${e.done ? ' · finished' : ''}</span></span>
      <span class="act-score"><b>${e.right}/${e.total}</b><span class="muted small">${pct}% · ${mins} min</span></span>
      <span class="act-time muted small">${new Date(e.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></li>`;
  }
  return `<ul class="actlist">${out}</ul>`;
}
// Your own copy links to the public one, the version classmates use.
function publicCardHTML() {
  return `<div class="card hero-data"><span class="hero-ic alt">${mi('public')}</span><span><b>Classmates’ version</b><span class="muted">${isPreview() ? 'You’re previewing changes they don’t have yet. ' : ''}Theirs saves progress in each browser.</span>
    <span class="btnrow tight"><a class="btn small" href="${PUBLIC_SITE}" target="_blank" rel="noopener">${mi('public', 'sm')} Open it</a><button class="btn small ghost" data-copy-public>${mi('content_copy', 'sm')} Copy link</button></span></span></div>`;
}
// Static builds keep everything in this browser, so the dashboard keeps the backup one click away.
function backupCardHTML() {
  if (Store.mode === 'server') return `<div class="card hero-data"><span class="hero-ic alt">${mi('download')}</span><span><b>Saved on your server</b><span class="muted">Every device sees the same progress.</span></span></div>${publicCardHTML()}`;
  if (AutoBackup.status === 'linked') return `<div class="card hero-data"><span class="hero-ic alt">${mi('download')}</span><span><b>Backing up automatically</b><span class="muted">Every change is saved to ${esc(AutoBackup.fileName)}.</span></span></div>`;
  if (AutoBackup.status === 'needs-permission' || AutoBackup.status === 'error') return `<div class="card hero-data due"><span class="hero-ic alt">${mi('download')}</span><span><b>Reconnect your backup file</b><span class="muted">After a restart your browser needs permission again to save to ${esc(AutoBackup.fileName)}.</span>
    <span class="btnrow tight"><button class="btn small primary" data-data="reconnect">Reconnect</button><button class="btn small ghost" data-data="download">${mi('download', 'sm')} Download instead</button></span></span></div>`;
  const lb = local.get('pathways.lastBackup'), ago = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
  const when = lb ? (ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`) : 'never';
  return `<div class="card hero-data${unsavedChanges() ? ' due' : ''}"><span class="hero-ic alt">${mi('download')}</span><span><b>Last backup: ${when}</b><span class="muted">${unsavedChanges() ? 'You have progress that isn’t in a backup yet.' : lb ? 'Your progress is backed up.' : 'Nothing to back up yet.'}</span>
    <span class="btnrow tight"><button class="btn small primary" data-data="download">${mi('download', 'sm')} Back up</button><button class="btn small ghost" data-data="import">${mi('upload', 'sm')} Restore</button></span></span>
    <input type="file" id="backupFile" accept=".json,application/json" hidden></div>`;
}
document.addEventListener('click', e => {
  if (!$('#view .dash')) return;
  const b = e.target.closest('[data-dash]');
  if (!b) return;
  if (b.dataset.dash === 'resume') { const last = local.get(LAST_QUIZ); if (last) { const d = normalizeDraft(last.cfg); launchQuiz(quizFromDraft(d), d); } }
  if (b.dataset.dash === 'fav') { const f = favorites().find(x => x.id === b.dataset.id); if (f) { const d = normalizeDraft(f.d); local.set(LAST_QUIZ, { cfg: d }); launchQuiz(quizFromDraft(d), d); } }
  if (b.dataset.dash === 'unfav') { const f = favorites().find(x => x.id === b.dataset.id); ask({ title: `Remove “${f.name}” from favorites?`, ok: 'Remove' }).then(y => { if (y) { Store.data.favorites = favorites().filter(x => x !== f); Store.save(); renderDashboard(); } }); }
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
  ['build', 'Building blocks', 'One blank, then the first two, then three… each round from the top, until you can type the whole pathway.'],
  ['step', 'Single step', 'One step on its own: name what connects two metabolites, or what an enzyme does.'],
];
/* ---------- pathway browser (New quiz + Pathways) ----------
   Icon tiles with search, composable filters (group, your tags, status) and sorting. Filters stack:
   any of the chosen groups AND any of the chosen tags AND the chosen status. Remembered per page. */
const GROUP_ORDER = ['Carbohydrates', 'Energy', 'Lipids', 'Nitrogen & amino acids', 'Nucleotides', 'Heme', 'Combined'];
const BROWSE_DEFAULT = { q: '', groups: [], tags: [], status: '', sort: 'group' };
const browse = page => Object.assign(clone(BROWSE_DEFAULT), local.get('pathways.browse.' + page) || {});
const tagsOf = id => (Store.data.tags && Store.data.tags[id]) || [];
const allTags = () => uniq(Object.values(Store.data.tags || {}).flat()).sort((a, b) => a.localeCompare(b));
function setTags(id, tags) { Store.data.tags = Store.data.tags || {}; Store.data.tags[id] = uniq(tags.map(t => t.trim()).filter(Boolean)); if (!Store.data.tags[id].length) delete Store.data.tags[id]; Store.save(); }
const lastStudied = id => Math.max(0, ...Object.values(Store.data.stats[id] || {}).map(e => e.last || 0));
const hasWeak = id => Object.values(Store.data.stats[id] || {}).some(e => e.miss > 0);
const groupRank = g => (GROUP_ORDER.indexOf(g) + 1) || 99;
function searchText(p) {
  return norm([p.name, p.group, ...(p.aliases || []), ...tagsOf(p.id), ...Object.values(p.enzymes || {}).flatMap(e => [e.name, e.short, ...(e.aliases || [])]),
    ...Object.values(p.metabolites || {}).flatMap(x => [x.name, x.short])].filter(Boolean).join(' '));
}
function filterPathways(list, st) {
  const q = norm(st.q || '');
  return list.filter(p => (!q || searchText(p).includes(q))
    && (!st.groups.length || st.groups.includes(p.group || 'Other'))
    && (!st.tags.length || st.tags.some(t => tagsOf(p.id).includes(t)))
    && (!st.status || (st.status === 'new' ? !Stats.accuracy(p.id) : st.status === 'studied' ? !!Stats.accuracy(p.id) : hasWeak(p.id))))
    .sort((a, b) => st.sort === 'name' ? a.name.localeCompare(b.name)
      : st.sort === 'weak' ? ((Stats.accuracy(a.id)?.pct ?? 101) - (Stats.accuracy(b.id)?.pct ?? 101)) || a.name.localeCompare(b.name)
      : st.sort === 'recent' ? lastStudied(b.id) - lastStudied(a.id) || a.name.localeCompare(b.name)
      : groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name));
}
function browseToolbar(page, st, list) {
  const groups = uniq(list.map(p => p.group || 'Other')).sort((a, b) => groupRank(a) - groupRank(b));
  const tags = allTags();
  const chip = (attr, v, on, label) => `<button class="chip-tg small" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const any = st.q || st.groups.length || st.tags.length || st.status;
  return `<div class="browsebar" data-bpage="${page}">
    <label class="search">${mi('search', 'sm')}<input type="search" data-bq placeholder="Search pathways, enzymes, metabolites, tags" value="${esc(st.q)}" aria-label="Search pathways"></label>
    <label class="sortsel">${mi('sort', 'sm')}<select data-bsort aria-label="Sort">${[['group', 'By group'], ['name', 'A–Z'], ['weak', 'Weakest first'], ['recent', 'Recently studied']].map(([v, l]) => `<option value="${v}"${st.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="filters">${mi('filter_list', 'sm filt-ic')}
      ${groups.map(g => chip('data-bgroup', g, st.groups.includes(g), g)).join('')}
      <span class="fsep"></span>${[['new', 'Not studied'], ['studied', 'Studied'], ['weak', 'Has weak spots']].map(([v, l]) => chip('data-bstatus', v, st.status === v, l)).join('')}
      ${tags.length ? `<span class="fsep"></span>${tags.map(t => `<button class="chip-tg small tag" data-btag="${esc(t)}" aria-pressed="${st.tags.includes(t)}">${mi('sell', 'sm')}${esc(t)}</button>`).join('')}` : ''}
      ${any ? '<button class="linkbtn" data-bclear>Clear</button>' : ''}
    </div>
  </div>`;
}
// Tile art: the pathway's Material Symbol on its color (falls back to a generic icon for your own pathways).
const TONES = ['blue', 'orange', 'pink', 'teal', 'gold', 'slate'];
const toneOf = p => (TONES.includes(p.color) ? p.color : TONES[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]);
const iconOf = p => (MI[p.icon] ? p.icon : p.compose ? 'sync_alt' : 'route');
function tileArt(p, size = '') { return `<span class="tile-art tone-${toneOf(p)} ${size}">${mi(iconOf(p))}</span>`; }
function tileHTML(p, page, selected) {
  const a = Stats.accuracy(p.id), pr = !p.compose && pairOf(p.id), tags = tagsOf(p.id), st = Library.status(p.id);
  const partner = pr && pr.compose.filter(x => x !== p.id).map(x => Library.get(x)?.name).filter(Boolean).join(', ');
  const meta = `${(p.reactions || []).length} steps${pr ? ` · combines with ${partner}` : ''}${st !== 'builtin' ? ` · ${st === 'edited' ? 'edited' : 'yours'}` : ''}`;
  const acc = a ? `<span class="tile-acc"><span class="meter" role="img" aria-label="${a.pct} percent"><span style="width:${a.pct}%"></span></span>${a.pct}%</span>` : '<span class="tile-acc muted">not studied</span>';
  const tagHTML = tags.length ? `<span class="tile-tags">${tags.map(t => `<span class="tagchip">${esc(t)}</span>`).join('')}</span>` : '';
  if (page === 'new') return `<button class="ptile${selected ? ' on' : ''}" data-cpick="${esc(p.id)}" aria-pressed="${selected}">
      ${tileArt(p)}<span class="tile-text"><span class="tile-name">${esc(p.name)}</span><span class="tile-meta">${meta}</span>${acc}${tagHTML}</span>${selected ? `<span class="tile-check">${mi('check')}</span>` : ''}</button>`;
  return `<article class="ptile lib">
      <a class="tile-link" href="#/pathways/${esc(p.id)}">${tileArt(p)}<span class="tile-text"><span class="tile-name">${esc(p.name)}</span><span class="tile-meta">${meta}</span>${acc}${tagHTML}</span></a>
      <div class="tile-actions"><button class="btn small" data-lib="study" data-id="${esc(p.id)}">${mi('play_arrow', 'sm')} Study</button><a class="btn small ghost" href="#/pathways/${esc(p.id)}/edit">${mi('edit', 'sm')} Edit</a><button class="btn small ghost" data-lib="tags" data-id="${esc(p.id)}">${mi('sell', 'sm')} Tags</button></div>
    </article>`;
}
function tilesHTML(page, selectedId) {
  const st = browse(page), base = page === 'new' ? Library.atomic() : Object.values(Library.all());
  const list = filterPathways(base, st);
  if (!list.length) return `<p class="muted">No pathways match. <button class="linkbtn" data-bclear>Clear filters</button></p>`;
  if (st.sort !== 'group') return `<div class="tiles-grid">${list.map(p => tileHTML(p, page, p.id === selectedId)).join('')}</div>`;
  const groups = {};
  for (const p of list) (groups[p.group || 'Other'] = groups[p.group || 'Other'] || []).push(p);
  return Object.entries(groups).map(([g, ps]) => `<div class="tgroup"><h2 class="glabel">${esc(g)}</h2><div class="tiles-grid">${ps.map(p => tileHTML(p, page, p.id === selectedId)).join('')}</div></div>`).join('');
}
function browserHTML(page, selectedId) {
  const base = page === 'new' ? Library.atomic() : Object.values(Library.all());
  return `${browseToolbar(page, browse(page), base)}<div class="tiles" id="tiles">${tilesHTML(page, selectedId)}</div>`;
}
function refreshTiles(page) { const t = $('#tiles'); if (t) t.innerHTML = tilesHTML(page, page === 'new' ? C.draft?.pathway : null); }
function rerenderBrowsePage(page) { page === 'new' ? renderCreate() : renderLibrary(); }
document.addEventListener('input', e => {
  const bar = e.target.closest('[data-bpage]');
  if (!bar || !e.target.hasAttribute('data-bq')) return;
  const page = bar.dataset.bpage, st = browse(page);
  st.q = e.target.value; local.set('pathways.browse.' + page, st);
  refreshTiles(page);
});
document.addEventListener('change', e => {
  const bar = e.target.closest('[data-bpage]');
  if (!bar || !e.target.hasAttribute('data-bsort')) return;
  const page = bar.dataset.bpage, st = browse(page);
  st.sort = e.target.value; local.set('pathways.browse.' + page, st); refreshTiles(page);
});
document.addEventListener('click', e => {
  const page = $('#view .create') ? 'new' : $('#view .library') ? 'library' : null;
  if (!page) return;
  const t = e.target.closest('[data-bgroup],[data-btag],[data-bstatus],[data-bclear]');
  if (!t) return;
  const st = browse(page);
  if (t.dataset.bgroup) st.groups = st.groups.includes(t.dataset.bgroup) ? st.groups.filter(x => x !== t.dataset.bgroup) : [...st.groups, t.dataset.bgroup];
  else if (t.dataset.btag) st.tags = st.tags.includes(t.dataset.btag) ? st.tags.filter(x => x !== t.dataset.btag) : [...st.tags, t.dataset.btag];
  else if (t.dataset.bstatus) st.status = st.status === t.dataset.bstatus ? '' : t.dataset.bstatus;
  else Object.assign(st, { q: '', groups: [], tags: [], status: '' });
  local.set('pathways.browse.' + page, st);
  rerenderBrowsePage(page);
});
function editTags(id) {
  const p = Library.get(id);
  ask({ title: `Tags for ${p.name}`, text: 'Comma-separated, e.g. "block 2, high yield, review". Tags are yours: they filter the pathway lists.', input: true, value: tagsOf(id).join(', '), ok: 'Save', allowEmpty: true })
    .then(v => { if (v === null) return; setTags(id, String(v).split(',')); router(); });
}

function renderCreate() {
  const d = homeDraft(), sel = Library.get(d.pathway), pair = pairOf(d.pathway);
  const partner = pair && pair.compose.filter(x => x !== d.pathway).map(x => Library.get(x)?.name).filter(Boolean).join(' and ');
  const allE = d.mode === 'step' && d.given === 'enz' && d.allPathways;
  let ans = d.answer || Store.settings.answer;
  if (d.mode === 'build' && !['type', 'along'].includes(ans)) ans = 'type';
  const hasQuiz = elSpecFor({ ...d }).some(([k]) => elOf(d, k) === 'quiz');
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
        ${browserHTML('new', d.pathway)}
      </section>
      <aside class="sidebar card">
        <div class="side-sel">${sel && !allE ? tileArt(sel, 'sm') : ''}<span><span class="glabel">Pathway</span><b>${esc(allE ? 'All pathways' : sel?.name || '')}</b></span></div>
        ${pair && !allE ? `<label class="pairbox${d.combine ? ' on' : ''}"><input type="checkbox" data-cflag="combine" ${d.combine ? 'checked' : ''}>
          <span><b>Study together with ${esc(partner)}</b><span class="muted">${esc(pair.name)}: shared steps once, each one's own steps alongside.</span></span></label>` : ''}
        ${Store.data.presets.length ? `<label class="field">Preset<select id="cPreset"><option value="">Current settings</option>${Store.data.presets.map(p => `<option value="${esc(p.id)}"${C.presetId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        <div class="field"><span>How</span><div class="modes">${MODES.map(([v, t, b]) => `<button class="mode${d.mode === v ? ' on' : ''}" data-cs="mode" data-v="${v}" aria-pressed="${d.mode === v}"><b>${d.mode === v ? mi('check', 'sm') : ''}${t}</b><span>${b}</span></button>`).join('')}</div></div>
        ${modeOpts}
        <div class="field" data-tour="answer"><span>Answer by</span>${seg('data-cs', 'answer', d.mode === 'build' ? [['type', 'Typing'], ['along', 'Typing along']] : [['type', 'Typing'], ['along', 'Typing along'], ['choice', 'Choice'], ['self', 'Self-check']], ans)}
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
          <span class="btnrow tight"><button class="btn ghost" data-c="fav" aria-pressed="${!!findFav(d)}">${mi(findFav(d) ? 'star_fill1' : 'star', 'sm')} ${findFav(d) ? 'Favorited' : 'Favorite'}</button>
          <button class="btn ghost" data-c="savepreset">${mi('bookmark_add', 'sm')} Save as preset</button></span>
        </div>
      </aside>
    </div>
  </div>`;
  const st = $('#cStart'); if (st) st.value = [...st.options].some(o => o.value === d.start) ? d.start : 'random';
}
/* ---------- favorites: a whole quiz (pathway + every setting), launched from the dashboard in one click ---------- */
const FAV_FIELDS = ['pathway', 'combine', 'mode', 'given', 'start', 'answer', 'weak', 'allPathways', 'letterCheck', 'hints', 'el'];
const favSig = d => JSON.stringify(FAV_FIELDS.map(k => d[k] ?? null));
const favorites = () => Store.data.favorites || [];
const findFav = d => d && favorites().find(f => favSig(normalizeDraft(f.d)) === favSig(normalizeDraft(d)));
function favName(d) {
  const p = Library.get(d.pathway), pair = d.combine && pairOf(d.pathway);
  return `${pair ? pair.name : p?.name || 'Quiz'} · ${MODE_NAMES[d.mode] || d.mode}`;
}
function toggleFav(d, then) {
  const hit = findFav(d);
  if (hit) { Store.data.favorites = favorites().filter(f => f !== hit); Store.save(); return then?.(); }
  ask({ title: 'Add to favorites', text: 'Favorites appear on the dashboard and start this exact quiz in one click.', input: true, value: favName(d), ok: 'Add' }).then(name => {
    if (!name) return;
    Store.data.favorites = [...favorites(), { id: 'f-' + Date.now().toString(36), name, d: clone(d) }];
    Store.save(); then?.();
  });
}
function launchQuiz(cfg, draft = null) {
  local.set(CURRENT_QUIZ, cfg);
  startQuiz(cfg);
  Q.draft = draft;
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
    launchQuiz(quizFromDraft(d), clone(d));
  }
  if (a.dataset.c === 'fav') toggleFav(d, renderCreate);
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
  $('#view').innerHTML = `<div class="page library">
    ${pageHead('Pathways', `${Library.list().length} pathways. Built-in ones can be edited; your edits are kept as a copy you can reset.`,
      `<a class="btn primary" href="#/pathways/new">${mi('add', 'sm')} New pathway</a><a class="btn" href="#/pathways/new-combined">${mi('sync_alt', 'sm')} Combine pathways</a><button class="btn" data-lib="import">${mi('upload', 'sm')} Import</button>`)}
    ${browserHTML('library')}
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
  if (b.dataset.lib === 'tags') editTags(b.dataset.id);
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
    ${pageHead(`${tileArt(p)} ${esc(p.name)}`, `${esc(p.group || 'Other')} · ${p.reactions.length} steps${st !== 'builtin' ? ` · ${st === 'edited' ? 'edited copy' : 'your pathway'}` : ''}${a ? ` · ${a.pct}% first try` : ''}`,
      `<button class="btn primary" data-pw="study">${mi('play_arrow', 'sm')} Study</button><a class="btn" href="#/pathways/${esc(id)}/edit">${mi('edit', 'sm')} Edit</a><button class="btn ghost" data-pw="export">${mi('download', 'sm')} Export</button>`)}
    <div class="tagrow">${mi('sell', 'sm')} ${tagsOf(id).length ? tagsOf(id).map(t => `<span class="tagchip">${esc(t)}</span>`).join('') : '<span class="muted">No tags</span>'} <button class="linkbtn" data-lib="tags" data-id="${esc(id)}">Edit tags</button></div>
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
      <p class="muted">${Store.mode === 'server' ? 'Saved on your STEP 1 Pathways server, so every device sees the same pathways, presets and history.' : 'Saved in this browser only. Export a backup to move it to another device.'}</p>
      ${Store.mode === 'local' ? `<div class="autobk"><h3>Automatic backups</h3>
        ${AutoBackup.supported ? (AutoBackup.status === 'linked'
          ? `<p>${icon('ok')} Saving every change to <b>${esc(AutoBackup.fileName)}</b>${AutoBackup.savedAt ? `, last at ${new Date(AutoBackup.savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}.</p><div class="btnrow"><button class="btn small ghost" data-data="unlink">Stop and unlink the file</button></div>`
          : AutoBackup.status === 'off'
            ? `<p class="muted">Pick a file once and every change is saved to it automatically. Choose a synced folder (iCloud Drive, Dropbox, OneDrive) and your backup follows you across devices.</p><div class="btnrow"><button class="btn small primary" data-data="link">${mi('download', 'sm')} Link a backup file</button></div>`
            : `<p class="muted">Your browser needs permission again to save to <b>${esc(AutoBackup.fileName)}</b>.</p><div class="btnrow"><button class="btn small primary" data-data="reconnect">Reconnect</button><button class="btn small ghost" data-data="unlink">Unlink</button></div>`)
          : `<p class="muted">This browser can’t save to a file automatically (only Chrome and Edge can). Use the automatic download below instead, or open STEP 1 Pathways in Chrome or Edge.</p>`}
        <label class="cb"><input type="checkbox" data-autodl ${autoDownloadOn() ? 'checked' : ''}> Download a backup automatically when I leave a quiz</label></div>` : ''}
      ${Store.mode === 'local' ? `<label class="cb"><input type="checkbox" data-remind ${local.get('pathways.remind') !== 'off' ? 'checked' : ''}> Remind me to back up when I open or leave Pathways</label>` : ''}
      <div class="btnrow"><button class="btn" data-data="export">${mi('download', 'sm')} Export backup</button><button class="btn" data-data="import">${mi('upload', 'sm')} Import backup</button><button class="btn ghost" data-data="resetstats">Clear all history</button></div>
      <input type="file" id="backupFile" accept=".json,application/json" hidden>
    </section>
    <section class="card pad"><h2>Guided tour</h2><p class="muted">A one-minute walk through the app.</p>
      <div class="btnrow"><button class="btn" data-tour-start>${mi('tour', 'sm')} Take the tour</button>
      <label class="cb"><input type="checkbox" id="tourNeverSetting" ${local.get('pathways.tourNever') ? '' : 'checked'}> Show it automatically when I open Pathways</label></div></section>
    <section class="card pad about"><h2>About</h2><p class="muted">STEP 1 Pathways version ${APP_VERSION}${Store.mode === 'server' && isPreview() ? ' + unreleased changes' : ''}${Store.mode === 'server' ? ` · <a href="${PUBLIC_SITE}" target="_blank" rel="noopener">classmates’ version</a>` : ''} · open source on <a href="https://github.com/chbarnhouse/step1-pathways" target="_blank" rel="noopener">GitHub</a>. Icons: Material Symbols.</p>
      <div class="btnrow"><button class="btn small" data-whatsnew>${mi('history', 'sm')} What’s new</button>${Store.mode === 'server' && isPreview() ? `<button class="btn small" data-preview>${mi('science', 'sm')} Not released yet</button>` : ''}${reportsEnabled() ? `<button class="btn small" data-report="open">${mi('flag', 'sm')} Report a problem</button>` : ''}</div></section>
  </div>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-whatsnew]')) showChangelog(RELEASED, 'All changes'); });
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
  if (e.target.hasAttribute('data-remind')) local.set('pathways.remind', e.target.checked ? 'on' : 'off');
  if (e.target.hasAttribute('data-autodl')) local.set('pathways.autoDownload', e.target.checked ? Date.now() : null);
  if (e.target.id === 'tourNeverSetting') local.set('pathways.tourNever', e.target.checked ? null : Date.now());
  if (e.target.dataset.sflag) { Store.settings[e.target.dataset.sflag] = e.target.checked; Store.save(); }
});

/* ---------- backups (Settings and the dashboard) ---------- */
// Only static copies (GitHub Pages, a downloaded file) keep data in the browser; the server copy never asks.
const remindersOn = () => Store.mode === 'local' && local.get('pathways.remind') !== 'off';
const unsavedChanges = () => (local.get('pathways.changedAt') || 0) > (local.get('pathways.lastBackup') || 0);
const isFresh = () => !Object.keys(Store.data.stats).length && !Object.keys(Store.data.custom).length && !Store.data.presets.length && !local.get('pathways.seen');
/* ---------- data notice: required once per browser in the static copy ----------
   Shown as a step of the tour, or on its own if the tour doesn't run. There is no way past it except
   ticking "I understand" and pressing Continue. */
function dataGate() {
  return new Promise(res => {
    let d = $('#gateDialog');
    if (!d) { d = document.createElement('dialog'); d.id = 'gateDialog'; document.body.append(d); }
    d.innerHTML = `<div class="dlg gate">
      <div class="dlg-h"><h2>${mi('download', 'h-ic')} ${DATA_NOTICE_TITLE}</h2></div>
      <div class="ask-text">${DATA_NOTICE_HTML}</div>
      <label class="cb ack"><input type="checkbox" id="gateAck"> ${DATA_ACK_LABEL}</label>
      <div class="actions"><button type="button" class="btn primary" id="gateGo" disabled>Continue</button></div></div>`;
    d.oncancel = e => e.preventDefault(); // Esc can't dismiss it
    d.querySelector('#gateAck').onchange = e => { d.querySelector('#gateGo').disabled = !e.target.checked; };
    d.querySelector('#gateGo').onclick = () => {
      if (!d.querySelector('#gateAck').checked) return;
      local.set('pathways.dataAck', Date.now());
      d.close(); res();
    };
    d.showModal();
  });
}
async function openingPrompt() {
  if (Store.mode !== 'local') return;
  if (isFresh()) {
    local.set('pathways.seen', Date.now());
    const v = await ask({ title: 'Welcome to STEP 1 Pathways', text: 'Everything you do here is saved in this browser. If you’ve used STEP 1 Pathways before and have a backup file, load it now to pick up where you left off.', ok: 'Start fresh', alt: 'Restore my backup', cancel: null });
    if (v === 'alt') $('#backupFile')?.click() || pickBackupFile();
    return;
  }
  local.set('pathways.seen', local.get('pathways.seen') || Date.now());
  if (!remindersOn() || !unsavedChanges() || sessionStorage.getItem('pathways.reminded')) return;
  try { sessionStorage.setItem('pathways.reminded', '1'); } catch {}
  const v = await ask({ title: 'Back up your progress?', text: 'Your progress is stored only in this browser. A backup file lets you restore it if the browser clears its data or you switch devices.', ok: 'Download backup', alt: 'Stop reminding me', cancel: 'Not now' });
  if (v === true) { downloadBackup(); route(); }
  if (v === 'alt') { local.set('pathways.remind', 'off'); say('Reminders off', 'You can still back up from the dashboard or Settings, and turn reminders back on in Settings.'); }
}
function pickBackupFile() {
  let f = $('#backupFile');
  if (!f) { f = document.createElement('input'); f.type = 'file'; f.id = 'backupFile'; f.accept = '.json,application/json'; f.hidden = true; document.body.append(f); }
  f.click();
}
// Leaving with progress that isn't in a backup: the browser shows its own "Leave site?" prompt.
window.addEventListener('beforeunload', e => { if (remindersOn() && unsavedChanges() && AutoBackup.status !== 'linked') { e.preventDefault(); e.returnValue = ''; } });
function backupText() { return JSON.stringify({ pathwaysBackup: 1, savedAt: new Date().toISOString(), ...Store.data }, null, 1); }
function downloadBackup() {
  if (download(`step1-pathways-backup-${new Date().toISOString().slice(0, 10)}.json`, backupText())) local.set('pathways.lastBackup', Date.now());
}
document.addEventListener('click', e => {
  const db = e.target.closest('[data-data]');
  if (!db) return;
  if (db.dataset.data === 'download') { downloadBackup(); route(); }
  if (db.dataset.data === 'link') AutoBackup.link().then(ok => { route(); if (ok) toast(`Backing up to ${AutoBackup.fileName} automatically.`); });
  if (db.dataset.data === 'reconnect') AutoBackup.reconnect().then(ok => { route(); toast(ok ? 'Backup file reconnected.' : 'Permission wasn’t granted.'); });
  if (db.dataset.data === 'unlink') AutoBackup.unlink().then(() => { route(); toast('Backup file unlinked. The file itself is kept.'); });
  if (db.dataset.data === 'export') {
    ask({ title: 'Export backup', text: 'Your pathways, presets, settings and history. Download it, or copy it somewhere safe.', input: 'area', value: backupText(), ok: 'Download file', cancel: 'Close', copy: true })
      .then(v => { if (v) { downloadBackup(); route(); } });
  }
  if (db.dataset.data === 'import') pickBackupFile();
  if (db.dataset.data === 'resetstats') ask({ title: 'Clear all answer history?', text: 'Weak spots and accuracy start over. Pathways and presets stay.', ok: 'Clear' }).then(y => { if (y) { Stats.reset(); route(); } });
});
document.addEventListener('change', e => {
  if (e.target.id !== 'backupFile') return;
  e.target.files[0]?.text().then(async t => {
    let b; try { b = JSON.parse(t); } catch (err) { return say('Can’t read that file', err.message); }
    if (!b.pathwaysBackup) return say('Not a STEP 1 Pathways backup', 'Use a file made with Download backup. To add a single pathway, use Import in the library.');
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
let lastPage = null;
// Leaving a quiz is the natural end of a session: offer a backup then (the browser itself won't allow a prompt on close).
async function endOfSessionPrompt() {
  if (Store.mode !== 'local' || !unsavedChanges()) return;
  if (AutoBackup.status === 'linked') return AutoBackup.write();
  if (autoDownloadOn()) { downloadBackup(); route(); return toast('Backup downloaded to your Downloads folder.'); }
  if (!remindersOn() || document.querySelector('dialog[open]')) return;
  const v = await ask({ title: 'Download a backup before you go?', text: 'This session’s progress is only in this browser. A backup keeps it safe if the browser’s storage is ever cleared.', ok: 'Download backup', alt: 'Stop reminding me', cancel: 'Not now' });
  if (v === true) { downloadBackup(); route(); }
  if (v === 'alt') { local.set('pathways.remind', 'off'); say('Reminders off', 'You can still back up from the dashboard or Settings, and turn reminders back on in Settings.'); }
}
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
  if (lastPage === 'quiz' && page !== 'quiz' && !Tour.active) setTimeout(endOfSessionPrompt, 150);
  lastPage = page;
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.nav === page ? 'page' : 'false'));
  if (page !== 'quiz') window.scrollTo(0, 0);
}
function closeOpenDialogs() { $$('dialog[open]').forEach(d => d.close()); }
window.addEventListener('hashchange', router);

(async function boot() {
  $('#brandIcon').innerHTML = mi('signpost');
  $$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', mi(el.dataset.icon, 'sm')));
  await Store.init();
  const hadData = !!(Object.keys(Store.data.stats).length || Store.data.presets.length || Object.keys(Store.data.custom).length || local.get('pathways.seen'));
  await AutoBackup.init();
  if (reportsEnabled()) $('#navReport').hidden = false;
  previewBadge();
  // Ask the browser not to evict this site's storage (no prompt in most browsers; best effort).
  if (Store.mode === 'local' && navigator.storage?.persist) { try { Store.persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch {} }
  router();
  await openingPrompt();
  if (!maybeAutoTour() && needsDataAck()) await dataGate();
  if (!Tour.active) await announceUpdate(hadData); else local.set('pathways.seenVersion', APP_VERSION);
})();
