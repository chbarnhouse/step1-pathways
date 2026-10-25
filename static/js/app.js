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
/* ---------- appearance: Auto / Light / Dark, plus which light and which dark theme (this device only) ---------- */
const APPEARANCE_DEFAULT = { mode: 'auto', light: 'default', dark: 'dark' };
const appearance = () => Object.assign({}, APPEARANCE_DEFAULT, local.get('pathways.appearance') || {});
const darkScheme = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const a = appearance(), dark = a.mode === 'dark' || (a.mode === 'auto' && !!darkScheme?.matches);
  document.documentElement.setAttribute('data-theme', dark ? a.dark : a.light);
}
darkScheme?.addEventListener?.('change', () => { if (appearance().mode === 'auto') applyTheme(); });
const THEME_SWATCH = { light: ['#f6f7f9', '#ffffff', '#1d5fa8'], default: ['#1d5fa8', '#ffffff', '#1d5fa8'], dark: ['#0f1217', '#181d25', '#7fb2ea'], black: ['#000000', '#0e0f12', '#7fb2ea'] };
// A theme choice drawn as a tiny page: background, a card, an accent bar — plus its name, so it never rests on color alone.
const themeChoice = (group, v, label, cur) => { const [bg, card, acc] = THEME_SWATCH[v];
  return `<button class="theme-pick" data-theme-set="${group}" data-v="${v}" role="radio" aria-checked="${cur === v}"><span class="theme-sw" style="background:${bg}"><span style="background:${card}"><i style="background:${acc}"></i></span></span><span>${label}${cur === v ? ` ${mi('check', 'sm')}` : ''}</span></button>`; };
function appearanceHTML() {
  const a = appearance();
  return `<section class="card pad"><h2>Appearance</h2><p class="muted">Applies to this device.</p>
    <div class="set-row"><span class="glabel">Mode</span>${seg('data-theme-set', 'mode', [['auto', 'Auto (match system)'], ['light', 'Light'], ['dark', 'Dark']], a.mode)}</div>
    <div class="set-row"><span class="glabel">Light theme</span><div class="theme-row" role="radiogroup">${themeChoice('light', 'default', 'Default', a.light)}${themeChoice('light', 'light', 'Light', a.light)}</div></div>
    <div class="set-row"><span class="glabel">Dark theme</span><div class="theme-row" role="radiogroup">${themeChoice('dark', 'dark', 'Dark', a.dark)}${themeChoice('dark', 'black', 'Black', a.dark)}</div></div>
  </section>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-theme-set]');
  if (!b) return;
  const a = appearance(), key = b.getAttribute('data-theme-set'), v = b.dataset.v;
  if (key === 'mode') a.mode = v;
  else { a[key] = v; if (a.mode !== 'auto') a.mode = key; } // picking a light theme while in Dark shows it
  local.set('pathways.appearance', a); applyTheme();
  if ($('#view .settings')) renderSettings();
});

const pageHead = (title, sub = '', actions = '') => `<div class="page-h"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>${actions ? `<div class="btnrow">${actions}</div>` : ''}</div>`;
/* Name modes: for each kind of name, whether it counts the moment it's typed, on Enter, or not at all.
   attr: data-cname (New quiz) or data-qname (in-quiz options). */
const NAME_ROWS = [['full', 'Full names', 'δ-aminolevulinic acid synthase'], ['common', 'Common abbreviations', 'ALA synthase, mito'], ['any', 'Any abbreviation', 'ALAS, PFK-1, G6P']];
const NAME_MODES = [['auto', 'Auto-accept'], ['enter', 'On Enter'], ['off', 'Don’t accept']];
const nameModesHTML = (attr, modes) => `<div class="namemodes" role="group" aria-label="Which names count"><span class="glabel">Which names count</span>
  ${NAME_ROWS.map(([k, l, ex]) => `<div class="nm-row"><span class="nm-l"><b>${l}</b><span class="muted small">${esc(ex)}</span></span>${seg(attr, k, NAME_MODES, modes[k])}</div>`).join('')}
  <p class="muted small">Auto-accept counts the moment it’s typed; On Enter waits for you to press Enter; Don’t accept asks for a fuller name (not a miss).</p></div>`;
// opts: [value, label, tooltip?]
const seg = (attr, key, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(([v, l, tip]) => `<button ${attr}="${key}" data-v="${v}" role="radio" aria-checked="${String(cur) === String(v)}"${tip ? ` data-tip="${esc(tip)}" aria-description="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;

/* ================= Dashboard (#/) =================
   Laid out to fit one screen: actions on top, then weak spots and progress side by side (each scrolls inside). */
/* Quick start: favorites (a saved quiz: pathway + settings) and presets (settings to use with any pathway).
   Clicking either opens New quiz with it loaded, so it can be adjusted before starting; ▶ on a favorite starts it at once. */
function favoritesCardHTML() {
  const favs = favorites();
  return `<section class="card pad quick-card" data-tour="favs"><div class="sec-h"><h2>${mi('star', 'h-ic')} Favorites</h2><span class="muted">${favs.length || ''}</span></div>
    ${favs.length ? `<ul class="quick-list">${favs.map(f => { const d = normalizeDraft(f.d), pid = draftPathway(d), p = Library.get(pid);
      return `<li><button class="quick-go" data-dash="fav" data-id="${esc(f.id)}" title="Open in New quiz to check the settings, then start">${p ? tileArt(p, 'sm') : ''}<span class="quick-text"><b>${esc(f.name)}</b><span class="muted small">${esc(p ? p.name : '')} · ${esc(quizSummary(normalizeQuiz(d)))}</span></span></button>
        <span class="quick-actions"><button class="iconbtn" data-dash="favstart" data-id="${esc(f.id)}" data-tip="Start right away" aria-label="Start ${esc(f.name)} right away">${mi('play_arrow')}</button><button class="iconbtn" data-dash="favrename" data-id="${esc(f.id)}" data-tip="Rename" aria-label="Rename ${esc(f.name)}">${mi('edit', 'sm')}</button><button class="iconbtn" data-dash="unfav" data-id="${esc(f.id)}" data-tip="Remove from favorites" aria-label="Remove ${esc(f.name)} from favorites">${mi('close', 'sm')}</button></span></li>`; }).join('')}</ul>`
      : `<p class="muted small">${mi('star', 'sm')} Star a quiz on New quiz, or while you're in one, to keep it here.</p>`}
  </section>`;
}
function presetsCardHTML() {
  const all = Presets.all();
  return `<section class="card pad quick-card"><div class="sec-h"><h2>${mi('tune', 'h-ic')} Presets</h2><a class="linkbtn" href="#/settings">Manage</a></div>
    <ul class="quick-list">${all.map(pr => `<li><button class="quick-go" data-dash="preset" data-id="${esc(pr.id)}" title="New quiz from this preset">${mi(pr.builtin ? 'tune' : 'bookmark_add', 'quick-ic')}<span class="quick-text"><b>${esc(pr.name)}${pr.builtin ? '' : ' <span class="pill">yours</span>'}</b><span class="muted small">${esc(pr.blurb || quizSummary(normalizeQuiz(pr)))}</span></span><span class="quick-cta muted small">New quiz ${mi('arrow_forward', 'sm')}</span></button></li>`).join('')}</ul>
  </section>`;
}
function renderDashboard() {
  const last = local.get(LAST_QUIZ), worst = Stats.worst(8), mine = Store.data.presets;
  const lastD = last?.cfg && normalizeDraft(last.cfg), lastP = lastD && Library.get(draftPathway(lastD));
  const atomic = Library.atomic().sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name));
  const studied = atomic.filter(p => Stats.accuracy(p.id)).length;
  $('#view').innerHTML = `<div class="page dash">
    <div class="dash-top">
      <a class="card hero-new" href="#/new"><span class="hero-ic">${mi('add')}</span><span><b>New quiz</b><span class="muted">Pick a pathway and how to study it.</span></span></a>
      ${lastP ? `<button class="card hero-resume" data-dash="resume">${tileArt(lastP)}<span><b>Resume: ${esc(lastP.name)}</b><span class="muted">${esc(quizSummary(normalizeQuiz(lastD)))}</span></span></button>` : ''}
      ${backupCardHTML()}
    </div>
    <div class="dash-quick">${favoritesCardHTML()}${presetsCardHTML()}</div>
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
const MODE_NAMES = { single: 'Fill the blanks', total: 'Full recall', build: 'Building blocks', step: 'Single step', review: 'Review' };
const ANSWER_NAMES = { type: 'typing', along: 'typing along', choice: 'choice', self: 'self-check' };
// Every session can be run again (▶) or kept as a favorite (☆) right from your history. Newer sessions remember their
// exact quiz; older ones (and weak-spot drills) are rebuilt from what the log kept: pathway, mode, how you answered.
function actDraft(e) {
  if (e.d) return normalizeDraft(e.d);
  const p = e.pathways?.length === 1 && Library.get(e.pathways[0]);
  if (!p) return null;
  const [first, ...rest] = p.stitch ? p.stitch.parts : [p.id], fp = Library.get(first);
  const pathway = fp?.compose ? fp.compose[0] : first;
  return normalizeDraft({ pathway, combine: !!fp?.compose, extra: rest, mode: e.mode, given: e.given, answer: e.answer, weak: e.name === 'Weak spots', start: e.mode === 'total' ? 'begin' : 'random' });
}
function actFavBtn(e) {
  const d = actDraft(e);
  if (!d) return '<span class="act-btns"></span>';
  const on = !!findFav(d);
  return `<span class="act-btns"><button class="iconbtn act-fav" data-dash="actstart" data-id="${esc(e.id)}" data-tip="Run this quiz again" aria-label="Run this quiz again">${mi('play_arrow', 'sm')}</button><button class="iconbtn act-fav" data-dash="actfav" data-id="${esc(e.id)}" aria-pressed="${on}" data-tip="${on ? 'Remove from favorites' : 'Add this quiz to favorites'}" aria-label="${on ? 'Remove from favorites' : 'Add this quiz to favorites'}">${mi(on ? 'star_fill1' : 'star', 'sm')}</button></span>`;
}
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
    const how = MODE_NAMES[e.mode] + (e.mode === 'step' ? (e.given === 'enz' ? ' (enzyme)' : ' (metabolites)') : '') + (e.mode === 'review' ? '' : ' · ' + (ANSWER_NAMES[e.answer] || e.answer));
    out += `<li class="act">${p ? tileArt(p, 'xs') : `<span class="tile-art xs tone-slate">${mi('route')}</span>`}
      <span class="act-main"><b>${esc(what)}</b><span class="muted small">${esc(how)}${e.done ? ' · finished' : ''}</span></span>
      <span class="act-score">${e.mode === 'review' ? `<b>Reviewed</b><span class="muted small">no questions</span>` : `<b>${e.right}/${e.total}</b><span class="muted small">${pct}% · ${mins} min</span>`}</span>
      <span class="act-time muted small">${new Date(e.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>${actFavBtn(e)}</li>`;
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
  if (b.dataset.dash === 'actstart') { const e = (Store.data.log || []).find(x => x.id === b.dataset.id), d = e && actDraft(e); if (d) { local.set(LAST_QUIZ, { cfg: d }); launchQuiz(quizFromDraft(d), clone(d)); } return; }
  if (b.dataset.dash === 'actfav') { const e = (Store.data.log || []).find(x => x.id === b.dataset.id), d = e && actDraft(e); if (d) toggleFav(d, renderDashboard); return; }
  if (b.dataset.dash === 'fav') { const f = favorites().find(x => x.id === b.dataset.id); if (f) { C.draft = normalizeDraft(f.d); C.presetId = ''; location.hash = '#/new'; } }
  if (b.dataset.dash === 'favstart') { const f = favorites().find(x => x.id === b.dataset.id); if (f) { const d = normalizeDraft(f.d); local.set(LAST_QUIZ, { cfg: d }); launchQuiz(quizFromDraft(d), d); } }
  if (b.dataset.dash === 'favrename') { const f = favorites().find(x => x.id === b.dataset.id); ask({ title: 'Rename favorite', input: true, value: f.name, ok: 'Rename' }).then(name => { if (name && name.trim()) { f.name = name.trim(); Store.save(); renderDashboard(); } }); }
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
const DRAFT_DEFAULTS = { pathway: 'glycolysis', combine: false, extra: [], mode: 'single', given: 'mets', start: 'random', answer: null, weak: false, allPathways: false, letterCheck: false, hints: false,
  el: { met: 'quiz', enz: 'quiz', trn: 'quiz', cof: 'show', loc: 'show', dir: 'quiz', path: 'quiz' } };
function normalizeDraft(d) {
  const out = Object.assign(clone(DRAFT_DEFAULTS), clone(d || {}));
  out.el = Object.assign(clone(DRAFT_DEFAULTS.el), (d && d.el) || {});
  if (!out.pathway && d?.pathways?.length) out.pathway = d.pathways[0];
  // '' = nothing picked yet (New quiz from the top bar, or Clear all); anything else must be a real, single pathway.
  if (out.pathway && (!Library.get(out.pathway) || Library.get(out.pathway).compose)) out.pathway = Library.atomic()[0]?.id;
  out.extra = uniq((Array.isArray(out.extra) ? out.extra : []).filter(id => id !== out.pathway && Library.get(id) && !Library.get(id).compose));
  if (out.mode === 'zones') { out.mode = 'single'; out.el.loc = 'place'; } // the short-lived Compartments mode is now Compartments: Place
  if (!out.aheadChosen) out.ahead = 'hide'; // Building blocks hides later blanks unless "Show them" was picked
  return out;
}
function homeDraft() {
  if (!C.draft) C.draft = normalizeDraft(local.get(LAST_QUIZ)?.cfg);
  return C.draft;
}
// The combined pathway that contains this one, if any (e.g. glycolysis → glycolysis + gluconeogenesis).
function pairOf(id) { return Object.values(Library.all()).find(p => p.compose && p.compose.includes(id)); }
const pairsOf = id => Object.values(Library.all()).filter(p => p.compose && p.compose.includes(id));
/* Connected pathways: what links to what's picked (its links, or theirs to it), so a quiz can grow one connection at a time:
   glycolysis → + TCA cycle → + β-oxidation, heme synthesis… (a pair partner turns its combined pathway on; see addPathway). */
function linkedTo(id) {
  const out = new Set((Library.get(id)?.links || []).map(l => l.to));
  for (const p of Library.atomic()) if ((p.links || []).some(l => l.to === id)) out.add(p.id);
  out.delete(id);
  return [...out].filter(x => Library.get(x) && !Library.get(x).compose);
}
function draftParts(d) { if (!d.pathway) return []; const pair = d.combine && pairOf(d.pathway); return [...(pair ? pair.compose : [d.pathway]), ...(d.extra || [])]; }
// Dropping one can strand others that only connected through it: keep what's still reachable from the first pick.
function pruneExtra(d) {
  const reach = new Set(draftParts({ ...d, extra: [] })), left = [...(d.extra || [])];
  for (let grew = true; grew;) { grew = false; for (const id of left.slice()) if ([...reach].some(r => linkedTo(r).includes(id))) { reach.add(id); left.splice(left.indexOf(id), 1); grew = true; } }
  d.extra = (d.extra || []).filter(id => reach.has(id));
}
const draftPathway = d => { const pair = d.combine && pairOf(d.pathway), base = pair ? pair.id : d.pathway; return (d.extra || []).length ? linkId([base, ...d.extra]) : base; };
function quizFromDraft(d) {
  const pid = draftPathway(d);
  const allE = d.mode === 'step' && d.given === 'enz' && d.allPathways;
  return { ...clone(d), pathways: [pid], allPathways: allE, name: allE ? 'All pathways' : Library.get(pid)?.name || 'Quiz' };
}
function loadPresetInto(id) {
  const p = Presets.all().find(x => x.id === id);
  if (!p) return;
  const keep = C.draft.pathway, combine = C.draft.combine;
  C.draft = normalizeDraft({ ...p, pathway: keep, combine });
  C.presetId = id;
}
// [value, name, how it works, what it's best for]
const MODES = [
  ['single', 'Fill the blanks', 'The whole pathway is shown with one piece hidden. Answer it and another goes missing, weakest first if you like.', 'First passes, and patching weak spots with the rest of the pathway as context.'],
  ['total', 'Full recall', 'Everything starts hidden (or with one anchor shown) and you fill it in, in order, step by step.', 'Proving you can rebuild a pathway end to end before an exam.'],
  ['build', 'Building blocks', 'Round 1 asks the first blank, round 2 the first two, and so on, always from the top. A slip clears that blank and asks again.', 'Learning a new pathway’s order from scratch.'],
  ['step', 'Single step', 'One reaction at a time: given two metabolites, name the enzyme, cofactors and direction; or given an enzyme, say what it does.', 'Fast drilling of enzymes and cofactors, across pathways too.'],
  ['review', 'Review', 'Every answer is shown on the diagram, connected pathways together; nothing is asked. Click anything for its facts.', 'Reading a pathway, or several connected ones, before you quiz yourself.'],
];
/* ---------- pathway browser (New quiz + Pathways) ----------
   Icon tiles with search, composable filters (group, your tags, status) and sorting. Filters stack:
   any of the chosen groups AND any of the chosen tags AND the chosen status. Remembered per page. */
const GROUP_ORDER = ['Carbohydrates', 'Energy', 'Lipids', 'Nitrogen & amino acids', 'Nucleotides', 'Heme', 'Blood & immunity', 'Renal', 'Combined'];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const BROWSE_DEFAULT = { q: '', groups: [], systems: [], tags: [], status: '', source: '', sort: 'group' };
// Where a pathway came from: built in, shared by a classmate (reviewed and approved), or your own / your edit.
const sourceOf = p => (Library.status(p.id) !== 'builtin' ? 'mine' : p.shared ? 'shared' : 'builtin');
const browse = page => Object.assign(clone(BROWSE_DEFAULT), local.get('pathways.browse.' + page) || {});
/* Tags: each built-in pathway comes with body systems (Fundamentals, Heme, GI…) and a few study tags (Fed state,
   Fasting, Drug targets…); your own tags sit alongside them. Only your own are editable. */
const SYSTEM_ORDER = ['Fundamentals', 'Skin', 'MSK', 'Neuro', 'Cardio', 'Respiratory', 'Renal', 'Endo/Repro', 'Heme', 'GI'];
const systemsOf = id => Library.get(id)?.systems || [];
const myTagsOf = id => (Store.data.tags && Store.data.tags[id]) || [];
const tagsOf = id => uniq([...(Library.get(id)?.tags || []), ...myTagsOf(id)]);
const allTags = () => uniq([...Object.values(Store.data.tags || {}).flat(), ...Object.values(Library.all()).flatMap(p => p.tags || [])]).sort((a, b) => a.localeCompare(b));
const allSystems = () => uniq(Object.values(Library.all()).flatMap(p => p.systems || [])).sort((a, b) => ((SYSTEM_ORDER.indexOf(a) + 1) || 99) - ((SYSTEM_ORDER.indexOf(b) + 1) || 99) || a.localeCompare(b));
const sysChips = id => systemsOf(id).map(t => `<span class="tagchip sys">${esc(t)}</span>`).join('');
function setTags(id, tags) { Store.data.tags = Store.data.tags || {}; Store.data.tags[id] = uniq(tags.map(t => t.trim()).filter(Boolean)); if (!Store.data.tags[id].length) delete Store.data.tags[id]; Store.save(); }
const lastStudied = id => Math.max(0, ...Object.values(Store.data.stats[id] || {}).map(e => e.last || 0));
const hasWeak = id => Object.values(Store.data.stats[id] || {}).some(e => e.miss > 0);
const groupRank = g => (GROUP_ORDER.indexOf(g) + 1) || 99;
function searchText(p) {
  return norm([p.name, p.group, p.shared?.by, ...(p.aliases || []), ...tagsOf(p.id), ...(p.systems || []), ...Object.values(p.enzymes || {}).flatMap(e => [e.name, e.short, ...(e.aliases || []), ...(e.nicknames || [])]),
    ...Object.values(p.metabolites || {}).flatMap(x => [x.name, x.short])].filter(Boolean).join(' '));
}
function filterPathways(list, st) {
  const q = norm(st.q || '');
  return list.filter(p => (!q || searchText(p).includes(q))
    && (!st.groups.length || st.groups.includes(p.group || 'Other'))
    && (!(st.systems || []).length || st.systems.some(t => systemsOf(p.id).includes(t)))
    && (!st.tags.length || st.tags.some(t => tagsOf(p.id).includes(t)))
    && (!st.source || sourceOf(p) === st.source)
    && (!st.status || (st.status === 'new' ? !Stats.accuracy(p.id) : st.status === 'studied' ? !!Stats.accuracy(p.id) : hasWeak(p.id))))
    .sort((a, b) => st.sort === 'name' ? a.name.localeCompare(b.name)
      : st.sort === 'weak' ? ((Stats.accuracy(a.id)?.pct ?? 101) - (Stats.accuracy(b.id)?.pct ?? 101)) || a.name.localeCompare(b.name)
      : st.sort === 'recent' ? lastStudied(b.id) - lastStudied(a.id) || a.name.localeCompare(b.name)
      : groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name));
}
/* Filters: one menu per kind (Group, System, Status, Tags), each a checklist; what's on shows as removable chips
   ("System: Heme ×"). Every chip and menu item uses the same data-b* attribute, so one click handler toggles both. */
const STATUS_LABELS = { new: 'Not studied', studied: 'Studied', weak: 'Has weak spots' };
const SOURCE_LABELS = { shared: 'Shared by classmates', mine: 'Yours' };
function filterMenus(st, groups, systems, tags, sources) {
  const item = (attr, v, on, label) => `<button type="button" class="chip-tg small fitem" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const menu = (key, label, n, body) => `<details class="fdd" data-f="${key}"><summary class="fdd-btn${n ? ' on' : ''}" aria-label="${label}${n ? `, ${n} on` : ''}">${label}${n ? `<span class="fdd-n">${n}</span>` : ''}${mi('expand_more', 'sm')}</summary><div class="pop fmenu">${body}</div></details>`;
  const status = Object.entries(STATUS_LABELS).map(([v, l]) => item('data-bstatus', v, st.status === v, l)).join('')
    + (sources.length ? `<span class="fmenu-h">Source</span>${sources.map(([v, l]) => item('data-bsource', v, st.source === v, l)).join('')}` : '');
  return menu('group', 'Group', st.groups.length, groups.map(g => item('data-bgroup', g, st.groups.includes(g), g)).join(''))
    + (systems.length ? menu('system', 'System', st.systems.length, systems.map(t => item('data-bsys', t, st.systems.includes(t), t)).join('')) : '')
    + menu('status', 'Status', (st.status ? 1 : 0) + (st.source ? 1 : 0), status)
    + (tags.length ? menu('tags', 'Tags', st.tags.length, tags.map(t => item('data-btag', t, st.tags.includes(t), t)).join('')) : '');
}
function activeChips(st) {
  const on = [...st.groups.map(g => ['data-bgroup', g, 'Group', g]), ...(st.systems || []).map(t => ['data-bsys', t, 'System', t]),
    ...(st.status ? [['data-bstatus', st.status, 'Status', STATUS_LABELS[st.status]]] : []), ...(st.source ? [['data-bsource', st.source, 'Source', SOURCE_LABELS[st.source]]] : []),
    ...st.tags.map(t => ['data-btag', t, 'Tag', t])];
  return on.map(([attr, v, k, l]) => `<button type="button" class="fchip" ${attr}="${esc(v)}" aria-label="Remove filter ${esc(k)}: ${esc(l)}"><span class="muted">${k}:</span> ${esc(l)}${mi('close', 'sm')}</button>`).join('');
}
function browseToolbar(page, st, list) {
  const groups = uniq(list.map(p => p.group || 'Other')).sort((a, b) => groupRank(a) - groupRank(b));
  const tags = allTags();
  const chip = (attr, v, on, label) => `<button class="chip-tg small" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const systems = allSystems(); st.systems = st.systems || [];
  const any = st.q || st.groups.length || st.systems.length || st.tags.length || st.status || st.source;
  const sources = [['shared', 'Shared by classmates'], ['mine', 'Yours']].filter(([v]) => list.some(p => sourceOf(p) === v));
  return `<div class="browsebar" data-bpage="${page}">
    <label class="search">${mi('search', 'sm')}<input type="search" data-bq placeholder="Search pathways, enzymes, metabolites, tags" value="${esc(st.q)}" aria-label="Search pathways"></label>
    <label class="sortsel">${mi('sort', 'sm')}<select data-bsort aria-label="Sort">${[['group', 'By group'], ['name', 'A–Z'], ['weak', 'Weakest first'], ['recent', 'Recently studied']].map(([v, l]) => `<option value="${v}"${st.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="filters">${filterMenus(st, groups, systems, tags, sources)}${activeChips(st)}${any ? '<button class="linkbtn" data-bclear>Clear</button>' : ''}</div>
  </div>`;
}
// Tile art: the pathway's Material Symbol on its color (falls back to a generic icon for your own pathways).
const TONES = ['blue', 'orange', 'pink', 'teal', 'gold', 'slate'];
const toneOf = p => (TONES.includes(p.color) ? p.color : TONES[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]);
const iconOf = p => (MI[p.icon] ? p.icon : p.compose ? 'sync_alt' : 'route');
function tileArt(p, size = '') { return `<span class="tile-art tone-${toneOf(p)} ${size}">${mi(iconOf(p))}</span>`; }
// A pathway's other names worth showing on its tile: ones that say something new (not "beta oxidation" for β-Oxidation).
function otherNames(p, max = 3) {
  const n = norm(p.name), seen = [n];
  return (p.aliases || []).filter(a => { const k = norm(a); if (!k || seen.some(x => x.includes(k) || k.includes(x))) return false; seen.push(k); return true; }).slice(0, max);
}
function tileHTML(p, page, selected) {
  const a = Stats.accuracy(p.id), pr = !p.compose && pairOf(p.id), tags = tagsOf(p.id), st = Library.status(p.id);
  const partner = pr && pr.compose.filter(x => x !== p.id).map(x => Library.get(x)?.name).filter(Boolean).join(', ');
  const meta = `${plural((p.reactions || []).length, 'step')}${p.shared?.by ? ` · by ${esc(p.shared.by)}` : ''}${pr ? ` <span class="tile-combo" data-tip="Combines with ${esc(partner)}" aria-label="Combines with ${esc(partner)}">${mi('link', 'sm')}</span>` : ''}${st !== 'builtin' ? ` · ${st === 'edited' ? 'edited' : 'yours'}` : ''}`;
  const acc = a ? `<span class="tile-acc"><span class="meter" role="img" aria-label="${a.pct} percent"><span style="width:${a.pct}%"></span></span>${a.pct}%</span>` : '<span class="tile-acc muted">not studied</span>';
  const tagHTML = tags.length || systemsOf(p.id).length ? `<span class="tile-tags">${sysChips(p.id)}${tags.map(t => `<span class="tagchip">${esc(t)}</span>`).join('')}</span>` : '';
  const aka = otherNames(p), akaHTML = aka.length ? `<span class="tile-aka">Also: ${esc(aka.join(' · '))}</span>` : '';
  if (page === 'new') return `<button class="ptile${selected ? ' on' : ''}" data-cpick="${esc(p.id)}" aria-pressed="${selected}">
      ${tileArt(p)}<span class="tile-text"><span class="tile-name">${esc(p.name)}</span>${akaHTML}<span class="tile-meta">${meta}</span>${acc}${tagHTML}</span>${selected ? `<span class="tile-check">${mi('check')}</span>` : ''}</button>`;
  return `<article class="ptile lib">
      <a class="tile-link" href="#/pathways/${esc(p.id)}">${tileArt(p)}<span class="tile-text"><span class="tile-name">${esc(p.name)}</span>${akaHTML}<span class="tile-meta">${meta}</span>${acc}${tagHTML}</span></a>
      <div class="tile-actions"><button class="btn small" data-lib="study" data-id="${esc(p.id)}">${mi('play_arrow', 'sm')} Study</button><a class="btn small ghost" href="#/pathways/${esc(p.id)}/edit">${mi('edit', 'sm')} Edit</a><button class="btn small ghost" data-lib="tags" data-id="${esc(p.id)}">${mi('sell', 'sm')} Tags</button>
        ${pairsOf(p.id).map(pp => `<button class="btn small ghost" data-lib="study" data-id="${esc(pp.id)}" title="${esc(pp.name)}: both on one diagram">${mi('sync_alt', 'sm')} Study with ${esc(pp.compose.filter(x => x !== p.id).map(x => Library.get(x)?.name).filter(Boolean).join(' + '))}</button>`).join('')}</div>
    </article>`;
}
function tilesHTML(page, selectedId) {
  const st = browse(page), base = Library.atomic(); // pairs (compose) are studied from their parts, never listed
  const list = filterPathways(base, st);
  if (!list.length) return `<p class="muted">No pathways match. <button class="linkbtn" data-bclear>Clear filters</button></p>`;
  const isSel = id => (Array.isArray(selectedId) ? selectedId.includes(id) : id === selectedId); // New quiz: every pathway in the quiz
  if (st.sort !== 'group') return `<div class="tiles-grid">${list.map(p => tileHTML(p, page, isSel(p.id))).join('')}</div>`;
  const groups = {};
  for (const p of list) (groups[p.group || 'Other'] = groups[p.group || 'Other'] || []).push(p);
  // Each group is one row that scrolls sideways: the next tile peeks in, the edge fades, and arrows appear where there's more.
  return Object.entries(groups).map(([g, ps]) => `<div class="tgroup"><h2 class="glabel">${esc(g)} <span class="muted small">${ps.length}</span></h2>
    <div class="rowwrap"><button class="rowbtn prev" data-rowscroll="-1" aria-label="Scroll ${esc(g)} left" tabindex="-1">${mi('chevron_left')}</button>
      <div class="tiles-row">${ps.map(p => tileHTML(p, page, isSel(p.id))).join('')}</div>
      <button class="rowbtn next" data-rowscroll="1" aria-label="Scroll ${esc(g)} right" tabindex="-1">${mi('chevron_right')}</button></div></div>`).join('');
}
// Which ends of each row have more to see (drives the fade and the arrow buttons).
function updateRows(scope = document) {
  scope.querySelectorAll('.rowwrap').forEach(w => {
    const r = w.querySelector('.tiles-row'); if (!r) return;
    w.classList.toggle('more-left', r.scrollLeft > 4);
    w.classList.toggle('more-right', r.scrollLeft + r.clientWidth < r.scrollWidth - 4);
  });
}
document.addEventListener('scroll', e => { if (e.target.classList?.contains('tiles-row')) updateRows(e.target.parentElement.parentElement); }, true);
window.addEventListener('resize', () => updateRows());
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rowscroll]');
  if (!b) return;
  const r = b.parentElement.querySelector('.tiles-row');
  r.scrollBy({ left: Number(b.dataset.rowscroll) * r.clientWidth * 0.8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
function browserHTML(page, selectedId) {
  const base = Library.atomic();
  return `${browseToolbar(page, browse(page), base)}<div class="tiles" id="tiles">${tilesHTML(page, selectedId)}</div>`;
}
function refreshTiles(page) { const t = $('#tiles'); if (t) t.innerHTML = tilesHTML(page, page === 'new' ? C.draft?.pathway : null); updateRows(); }
// One filter menu open at a time; a click anywhere else closes it.
document.addEventListener('toggle', e => { if (e.target.matches?.('details.fdd') && e.target.open) document.querySelectorAll('details.fdd[open]').forEach(d => { if (d !== e.target) d.open = false; }); }, true);
document.addEventListener('click', e => { if (!e.target.closest('details.fdd')) document.querySelectorAll('details.fdd[open]').forEach(d => { d.open = false; }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('details.fdd[open]').forEach(d => { d.open = false; d.querySelector('summary')?.focus(); }); });
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
  const t = e.target.closest('[data-bgroup],[data-bsys],[data-btag],[data-bstatus],[data-bsource],[data-bclear]');
  if (!t) return;
  const st = browse(page);
  if (t.dataset.bgroup) st.groups = st.groups.includes(t.dataset.bgroup) ? st.groups.filter(x => x !== t.dataset.bgroup) : [...st.groups, t.dataset.bgroup];
  else if (t.dataset.bsys) st.systems = (st.systems || []).includes(t.dataset.bsys) ? st.systems.filter(x => x !== t.dataset.bsys) : [...(st.systems || []), t.dataset.bsys];
  else if (t.dataset.btag) st.tags = st.tags.includes(t.dataset.btag) ? st.tags.filter(x => x !== t.dataset.btag) : [...st.tags, t.dataset.btag];
  else if (t.dataset.bstatus) st.status = st.status === t.dataset.bstatus ? '' : t.dataset.bstatus;
  else if (t.dataset.bsource) st.source = st.source === t.dataset.bsource ? '' : t.dataset.bsource;
  else Object.assign(st, { q: '', groups: [], systems: [], tags: [], status: '', source: '' });
  local.set('pathways.browse.' + page, st);
  const open = t.closest('details.fdd')?.dataset.f; // keep that menu open while you tick several
  rerenderBrowsePage(page);
  if (open) { const d = document.querySelector(`details.fdd[data-f="${open}"]`); if (d) d.open = true; }
});
// The pathway page's diagram: its links to other pathways are clickable there (and only there).
function pageFlowSVG(m) { LINK_NAV = true; try { return flowSVG(m, () => 'shown'); } finally { LINK_NAV = false; } }
function editTags(id) {
  const p = Library.get(id);
  const fixed = [...(p.systems || []), ...(p.tags || [])];
  ask({ title: `Tags for ${p.name}`, text: `Comma-separated, e.g. "block 2, high yield, review". Tags are yours: they filter the pathway lists.${fixed.length ? ` Built in (always there): ${fixed.join(', ')}.` : ''}`, input: true, value: myTagsOf(id).join(', '), ok: 'Save', allowEmpty: true })
    .then(v => { if (v === null) return; setTags(id, String(v).split(',')); router(); });
}

// What each Show / Quiz / Place / Hide choice does (tooltips on New quiz).
const elTip = (v, mode, k) => ({
  show: 'Shown with names the whole time',
  quiz: mode === 'step' ? 'Asked as a question for each step' : 'Hidden as blanks for you to fill in',
  place: k === 'grp' ? 'Drawn without them: you drag a frame around each group, then name it' : 'Drawn without them: you mark where the pathway crosses a membrane, then name each part',
  hide: 'Left out: not shown and not asked',
}[v]);
function renderCreate() {
  const d = homeDraft(), sel = Library.get(d.pathway), pair = pairOf(d.pathway);
  const allE = d.mode === 'step' && d.given === 'enz' && d.allPathways;
  let ans = d.answer || Store.settings.answer;
  if (d.mode === 'build' && !['type', 'along'].includes(ans)) ans = 'type';
  const hasQuiz = d.mode === 'review' || elSpecFor({ ...d }).some(([k]) => elOf(d, k) === 'quiz' || elOf(d, k) === 'place'), picked = allE || !!d.pathway;
  // Compartments: none recorded → no row; all in one place → say it's asked once.
  let zonesHere = null;
  // Effects (activates / inhibits): a row only when a chosen pathway marks them.
  let effectsHere = false, groupsHere = [], stitched = false;
  try { const qp = Library.get(draftPathway(d)); if (qp && !allE) { const its = Object.values(modelFor(qp).items); zonesHere = its.filter(it => it.kind === 'loc'); effectsHere = its.some(it => it.kind === 'eff'); groupsHere = its.filter(it => it.kind === 'grp'); stitched = !!qp.stitch; } } catch {}
  const placeNote = () => {
    const qp = Library.get(draftPathway(d));
    if (qp?.stitch) return `<span class="el-note muted small">${mi('help', 'sm')} Place works on one pathway at a time; with connected pathways, compartments just show.</span>`;
    const grid = qp?.layout === 'grid';
    const when = d.mode === 'single' ? 'First, before the blanks' : d.mode === 'total' || d.mode === 'build' ? 'After you’ve rebuilt the pathway' : '';
    return `<span class="el-note muted small">${mi('help', 'sm')} ${grid ? 'This pathway branches out, so there’s no list to place compartments in; they’ll just show.' : `No compartment colors or names. ${when ? when + ', y' : 'Y'}ou mark where the pathway crosses a membrane, then name each part (in list view).`}</span>`;
  };
  const groupNote = () => `<span class="el-note muted small">${mi('help', 'sm')} ${stitched ? 'Draw yourself works on one pathway at a time; with connected pathways, groups just show.' : `No frames at first: you drag a frame around the boxes of each group (${groupsHere.length}), then name it. ${d.mode === 'review' ? '' : 'Before the rest of the quiz.'}`}</span>`;
  const elNote = k => (k === 'grp' && elOf(d, 'grp') === 'place' ? groupNote() : k === 'loc' && elOf(d, 'loc') === 'place' ? placeNote() : k === 'loc' && zonesHere?.length === 1 ? `<span class="el-note muted small">${mi('help', 'sm')} All of it happens in one place (${esc(zonesHere[0].name)})${d.mode === 'step' ? ', so every step has the same answer.' : ', so Quiz asks it once.'}</span>` : '');
  const els = elSpecFor(d).filter(([k]) => !(k === 'loc' && zonesHere && !zonesHere.length) && (k !== 'eff' || effectsHere) && (k !== 'grp' || groupsHere.length))
    .map(([k, label, allowed]) => {
      // Show / Quiz / Hide; where it can also be drawn (compartments), Quiz then asks how: fill in the blanks, or draw it yourself.
      const v = elOf(d, k), draw = allowed.includes('place'), top = v === 'place' ? 'quiz' : v;
      const how = draw && top === 'quiz' ? `<div class="el-sub"><span class="muted small">How</span>${seg('data-celhow', k, [['quiz', 'Fill in the blank', elTip('quiz', d.mode)], ['place', 'Draw yourself', elTip('place', d.mode, k)]], v)}</div>` : '';
      return `<div class="el-row"><span class="el-name">${label}</span>${seg('data-cel', k, allowed.filter(x => x !== 'place').map(x => [x, { show: 'Show', quiz: 'Quiz', hide: 'Hide' }[x], elTip(x, d.mode)]), top)}${how}${elNote(k)}</div>`;
    }).join('');
  let modeOpts = '';
  if (d.mode === 'total') {
    const m = d.pathway && modelFor(Library.get(draftPathway(d)));
    modeOpts = `<label class="field">Start<select id="cStart"><option value="random">A random point</option><option value="begin">The beginning, nothing shown</option>${m ? `<optgroup label="Start at">${visibleFor(m, d).map(k => `<option value="${esc(k)}">${esc(m.items[k].name)}${kindOf(k, m) !== 'met' ? ` (${KIND[kindOf(k, m)]})` : ''}</option>`).join('')}</optgroup>` : ''}</select></label>`;
  }
  const laterBlanks = d.mode === 'build' ? `<div class="field"><span>Later blanks</span>${seg('data-cs', 'ahead', [['hide', 'Hide them'], ['show', 'Show them']], d.ahead === 'show' ? 'show' : 'hide')}<p class="muted small">${d.ahead === 'show' ? 'Blanks you haven’t reached yet show their answers.' : 'Blanks you haven’t reached yet stay empty, so you recall the whole pathway.'}</p></div>` : '';
  if (d.mode === 'step') modeOpts = `<div class="field"><span>You're given</span>${seg('data-cs', 'given', [['mets', 'Two metabolites'], ['enz', 'An enzyme']], d.given)}</div>
    ${d.given === 'enz' ? `<label class="cb"><input type="checkbox" data-cflag="allPathways" ${d.allPathways ? 'checked' : ''}> Draw enzymes from every pathway</label>` : ''}`;
  $('#view').innerHTML = `<div class="page create">
    <div class="create-grid">
      <section class="picker">
        <div class="page-h"><div><h1>New quiz</h1><p class="muted">Choose a pathway${allE ? ' (enzymes will come from every pathway)' : ''}.</p></div></div>
        ${browserHTML('new', draftParts(d))}
      </section>
      <aside class="sidebar card">
        ${allE ? `<div class="side-sel"><span><span class="glabel">Pathway</span><b>All pathways</b></span></div>` : pickedHTML(d)}
        ${Store.data.presets.length ? `<label class="field">Preset<select id="cPreset"><option value="">Current settings</option>${Store.data.presets.map(p => `<option value="${esc(p.id)}"${C.presetId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        <div class="field"><span>How</span><div class="modes">${MODES.map(([v, t, how, best]) => `<button class="mode${d.mode === v ? ' on' : ''}" data-cs="mode" data-v="${v}" aria-pressed="${d.mode === v}"><b>${d.mode === v ? mi('check', 'sm') : ''}${t}</b><span>${how}</span><span class="best"><b>Best for</b> ${best}</span></button>`).join('')}</div></div>
        ${modeOpts}
        <div class="field"><span>${d.mode === 'review' ? 'What to show or hide' : 'What to show, quiz or hide'}</span><div class="el-grid">${els}</div>
          ${hasQuiz ? '' : `<p class="bad-note">${icon('no')} Set at least one to Quiz.</p>`}</div>
        ${d.mode === 'review' ? '' : `<details class="adv"${C.advOpen ? ' open' : ''}><summary>${mi('tune', 'sm')} Advanced: answering, hints and more${mi('expand_more', 'chev')}</summary>
        <div class="field" data-tour="answer"><span>Answer by</span>${seg('data-cs', 'answer', d.mode === 'build' ? [['type', 'Typing'], ['along', 'Typing along']] : [['type', 'Typing'], ['along', 'Typing along'], ['choice', 'Choice'], ['self', 'Self-check']], ans)}
          <p class="muted small">${{ type: 'Type the name; abbreviations count, and a/alpha work for α.', along: 'The answer is shown faintly; type it to fill it in.', choice: 'Pick from four options of the same kind.', self: 'Reveal it and mark yourself right or wrong.' }[ans]}</p>
          ${ans === 'type' ? `<label class="cb"><input type="checkbox" data-cflag="letterCheck" ${d.letterCheck ? 'checked' : ''}> Check each letter as I type</label>` : ''}
          ${['type', 'along'].includes(ans) ? `<label class="cb"><input type="checkbox" data-cflag="hints" ${d.hints ? 'checked' : ''}> “Give me a letter” hints (button, or → at the end of your answer)</label>` : ''}
          ${ans === 'type' ? nameModesHTML('data-cname', nameModesCfg(d)) : ''}
          ${elOf(d, 'cof') === 'quiz' ? `<label class="cb"><input type="checkbox" data-cflag="cofCount" ${d.cofCount !== false ? 'checked' : ''}> Show how many cofactors there are (as “1/2” while you type). Off: each step first asks which arrow its cofactors have (in and out, in only, out only)</label>` : ''}</div>
          ${laterBlanks}
          ${d.mode !== 'total' ? `<label class="cb"><input type="checkbox" data-cflag="weak" ${d.weak ? 'checked' : ''}> Weak spots first</label>` : ''}
        </details>`}
        <div class="side-foot">
          <button class="btn primary big" data-c="start" ${hasQuiz && picked ? '' : 'disabled'}>${mi('play_arrow')} Start quiz</button>
          <span class="btnrow tight"><button class="btn ghost" data-c="fav" aria-pressed="${!!findFav(d)}" ${picked ? '' : 'disabled'}>${mi(findFav(d) ? 'star_fill1' : 'star', 'sm')} ${findFav(d) ? 'Favorited' : 'Favorite'}</button>
          <button class="btn ghost" data-c="savepreset">${mi('bookmark_add', 'sm')} Save as preset</button></span>
        </div>
      </aside>
    </div>
  </div>`;
  const st = $('#cStart'); if (st) st.value = [...st.options].some(o => o.value === d.start) ? d.start : 'random';
  // Keep the chosen pathway visible in its row, then mark which row ends have more.
  const on = $('#tiles .ptile.on'), row = on?.closest('.tiles-row');
  if (on && row) { const o = on.offsetLeft - row.offsetLeft; if (o < row.scrollLeft || o + on.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = o - 24; }
  updateRows();
}
/* The pathways in this quiz, all alike as pills (× takes one out; the last one stays), then what to add, most related
   first: a pair partner (gluconeogenesis for glycolysis), then by links to everything picked, then by shared molecules. */
const metNamesOf = id => new Set(Object.values(Library.get(id)?.metabolites || {}).map(m => baseMetName(m.name)));
function suggestions(d) {
  const have = draftParts(d), set = new Set(have), names = new Set(have.flatMap(id => [...metNamesOf(id)]));
  const partners = new Set(have.flatMap(id => pairsOf(id).flatMap(p => p.compose)));
  return Library.atomic().map(p => p.id).filter(id => !set.has(id)).map(id => {
    const links = have.filter(h => linkedTo(h).includes(id)).length, shared = [...metNamesOf(id)].filter(n => names.has(n)).length;
    return { id, score: (partners.has(id) ? 1000 : 0) + links * 10 + shared, ok: partners.has(id) || links > 0 };
  }).filter(x => x.ok).sort((a, b) => b.score - a.score || Library.get(a.id).name.localeCompare(Library.get(b.id).name)).map(x => x.id);
}
function pickedHTML(d) {
  const have = draftParts(d);
  if (!have.length) return `<div class="picked"><span class="glabel">Pathway</span>
    <p class="pick-prompt">${mi('arrow_back', 'sm')}<span><b>Select a pathway to study</b><span class="muted small">Click a pathway's tile. Pathways that connect to it are suggested here, to quiz together.</span></span></p></div>`;
  const more = suggestions(d), shown = C.allSugg ? more : more.slice(0, 8);
  const pill = id => `<button type="button" class="fchip" data-cpill="${esc(id)}" aria-label="Take ${esc(Library.get(id).name)} out of this quiz">${esc(Library.get(id).name)}${mi('close', 'sm')}</button>`;
  return `<div class="picked"><div class="picked-h"><span class="glabel">${have.length > 1 ? `Pathways · ${have.length}, on one diagram` : 'Pathway'}</span><button type="button" class="btn ghost small" data-cclear>${mi('close', 'sm')} Clear all</button></div>
    <div class="chips">${have.map(pill).join('')}</div>
    ${more.length ? `<span class="glabel">${mi('link', 'sm')} Add a connected pathway</span><p class="muted small">Most closely related first.</p>
      <div class="chips">${shown.map(id => `<button type="button" class="addchip" data-cadd="${esc(id)}" aria-label="Add ${esc(Library.get(id).name)}">${mi('add', 'sm')}${esc(Library.get(id).name)}</button>`).join('')}
      ${more.length > 8 ? `<button type="button" class="btn ghost small" data-cmore>${C.allSugg ? 'Fewer' : `${more.length - 8} more`}</button>` : ''}</div>` : ''}
  </div>`;
}
// Nothing picked: what New quiz in the top bar opens with, and what Clear all leaves. How to study stays as it was.
function clearPathways(d) { d.pathway = ''; d.combine = false; d.extra = []; d.allPathways = false; C.allSugg = false; if (d.start !== 'random' && d.start !== 'begin') d.start = 'random'; }
// Adding: a pair partner turns that pair on (glycolysis + gluconeogenesis are one combined pathway); anything else joins.
function addPathway(d, id) {
  const holder = draftParts(d).find(h => pairsOf(h).some(p => p.compose.includes(id)));
  if (holder) { const others = draftParts(d).filter(x => x !== holder && !(pairOf(holder)?.compose || []).includes(x)); d.pathway = holder; d.combine = true; d.extra = others.filter(x => x !== id); }
  else d.extra = [...(d.extra || []), id];
}
function removePathway(d, id) {
  const pair = d.combine && pairOf(d.pathway);
  if (pair && pair.compose.includes(id)) { d.combine = false; if (id === d.pathway) d.pathway = pair.compose.find(x => x !== id); }
  else if (id === d.pathway) { if (!(d.extra || []).length) return clearPathways(d); d.pathway = d.extra[0]; d.extra = d.extra.slice(1); }
  else d.extra = (d.extra || []).filter(x => x !== id);
  pruneExtra(d);
}
/* ---------- favorites: a whole quiz (pathway + every setting), launched from the dashboard in one click ---------- */
const FAV_FIELDS = ['pathway', 'combine', 'extra', 'mode', 'given', 'start', 'ahead', 'aheadChosen', 'autoSubmit', 'cofCount', 'nameModes', 'names', 'fullNames', 'answer', 'weak', 'allPathways', 'letterCheck', 'hints', 'el'];
const favSig = d => JSON.stringify(FAV_FIELDS.map(k => d[k] ?? null));
const favorites = () => Store.data.favorites || [];
const findFav = d => d && favorites().find(f => favSig(normalizeDraft(f.d)) === favSig(normalizeDraft(d)));
function favName(d) {
  return `${Library.get(draftPathway(normalizeDraft(d)))?.name || 'Quiz'} · ${MODE_NAMES[d.mode] || d.mode}`;
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
  if (draft && Q.log) Q.log.d = clone(draft); // so Activity can run it again or star it
  if (location.hash === '#/quiz') renderQuiz(); else location.hash = '#/quiz';
}
// New quiz from the top bar or the dashboard card: a fresh pick (how to study is kept). Already there: clear in place.
document.addEventListener('click', e => {
  if (!e.target.closest('[data-nav="new"], a.hero-new')) return;
  clearPathways(homeDraft()); C.presetId = '';
  if (location.hash === '#/new') renderCreate();
});
document.addEventListener('click', e => {
  if (!$('#view .create')) return;
  const d = C.draft;
  const pick = e.target.closest('[data-cpick]');
  if (pick) {
    const id = pick.dataset.cpick;
    if (d.pathway !== id) { d.combine = false; d.extra = []; if (d.start !== 'random' && d.start !== 'begin') d.start = 'random'; }
    d.pathway = id; d.allPathways = false;
    return renderCreate();
  }
  const add = e.target.closest('[data-cadd]'), pill = e.target.closest('[data-cpill]');
  if (add) { addPathway(d, add.dataset.cadd); return renderCreate(); }
  if (pill) { removePathway(d, pill.dataset.cpill); return renderCreate(); }
  if (e.target.closest('[data-cclear]')) { clearPathways(d); return renderCreate(); }
  if (e.target.closest('[data-cmore]')) { C.allSugg = !C.allSugg; return renderCreate(); }
  const sb = e.target.closest('[data-cs]');
  if (sb) { d[sb.dataset.cs] = sb.dataset.v; if (sb.dataset.cs === 'ahead') d.aheadChosen = true; if (sb.dataset.cs === 'names') delete d.fullNames; C.presetId = ''; return renderCreate(); }
  const nb = e.target.closest('[data-cname]');
  if (nb) { d.nameModes = { ...nameModesCfg(d), [nb.dataset.cname]: nb.dataset.v }; delete d.names; delete d.fullNames; delete d.autoSubmit; C.presetId = ''; return renderCreate(); }
  const eb = e.target.closest('[data-cel]');
  if (eb) { const k = eb.dataset.cel; if (!(eb.dataset.v === 'quiz' && d.el[k] === 'place')) d.el[k] = eb.dataset.v; C.presetId = ''; return renderCreate(); }
  const hb = e.target.closest('[data-celhow]');
  if (hb) { d.el[hb.dataset.celhow] = hb.dataset.v; C.presetId = ''; return renderCreate(); }
  const a = e.target.closest('[data-c]');
  if (!a) return;
  if (a.dataset.c === 'start') {
    if (!d.pathway && !(d.mode === 'step' && d.given === 'enz' && d.allPathways)) return;
    local.set(LAST_QUIZ, { cfg: d });
    launchQuiz(quizFromDraft(d), clone(d));
  }
  if (a.dataset.c === 'fav' && d.pathway) toggleFav(d, renderCreate);
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
  else if (t.dataset.cflag) { d[t.dataset.cflag] = t.checked; if (t.dataset.cflag === 'combine') { pruneExtra(d); d.extra = d.extra.filter(id => !(pairOf(d.pathway)?.compose || []).includes(id)); } if (t.dataset.cflag === 'combine') d.start = ['random', 'begin'].includes(d.start) ? d.start : 'random'; }
  else return;
  renderCreate();
});
// Advanced starts collapsed on every visit to New quiz, and stays as you left it while you set the quiz up.
document.addEventListener('toggle', e => { if (e.target.matches?.('details.adv')) C.advOpen = e.target.open; }, true);

const visibleFor = (m, d) => m.seq.filter(k => !['hide', 'place'].includes(elOf(d, kindOf(k, m))));

/* ================= Library ================= */
function renderLibrary() {
  $('#view').innerHTML = `<div class="page library">
    ${pageHead('Library', `${Library.atomic().length} pathways. Built-in ones can be edited; your edits are kept as a copy you can reset.`,
      `<a class="btn primary" href="#/pathways/new">${mi('add', 'sm')} New pathway</a><a class="btn" href="#/pathways/new-combined">${mi('sync_alt', 'sm')} Combine pathways</a><button class="btn" data-lib="import">${mi('upload', 'sm')} Import</button>`)}
    ${libTabs('pathways')}
    ${browserHTML('library')}
    <input type="file" id="libFile" accept=".json,application/json" hidden>
  </div>`;
  updateRows();
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
    ${crumbsHTML([])}
    ${pageHead(`${tileArt(p)} ${esc(p.name)}`, `${esc(p.group || 'Other')} · ${plural(p.reactions.length, 'step')}${p.shared?.by ? ` · shared by ${esc(p.shared.by)}` : ''}${st !== 'builtin' ? ` · ${st === 'edited' ? 'edited copy' : 'your pathway'}` : ''}${a ? ` · ${a.pct}% first try` : ''}`,
      `<button class="btn primary" data-pw="study">${mi('play_arrow', 'sm')} Study</button><a class="btn" href="#/pathways/${esc(id)}/edit">${mi('edit', 'sm')} Edit</a><button class="btn ghost" data-pw="export">${mi('download', 'sm')} Export</button>${sharingEnabled() && st !== 'builtin' ? `<button class="btn ghost" data-pw="share">${mi('public', 'sm')} Share with classmates</button>` : ''}`)}
    <div class="tagrow">${mi('sell', 'sm')} ${sysChips(id)}${tagsOf(id).length ? tagsOf(id).map(t => `<span class="tagchip">${esc(t)}</span>`).join('') : systemsOf(id).length ? '' : '<span class="muted">No tags</span>'} <button class="linkbtn" data-lib="tags" data-id="${esc(id)}">Edit tags</button></div>
    ${p.summary ? `<p class="lede">${esc(p.summary)}</p>` : ''}${p.tissue ? `<p class="muted"><b>Where:</b> ${esc(p.tissue)}</p>` : ''}
    <section class="card diagram-card">
      <div class="sec-h"><div class="seg">${['flow', 'list'].map(v => `<button data-pwview="${v}" aria-pressed="${Store.settings.view === v}">${v === 'flow' ? 'Flow' : 'List'}</button>`).join('')}</div>${flow ? zoomBarHTML() : ''}</div>
      ${flow ? `<div class="stage canvas" data-view="page:${esc(id)}">${canvasHTML(pageFlowSVG(m))}</div>` : `<div class="stage">${listHTML(m, () => 'shown', { horiz: Store.settings.dir === 'h' })}</div>`}
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
  if (b.dataset.pw === 'share') openShare(id);
  if (b.dataset.pw === 'resetstats') ask({ title: 'Clear the history for this pathway?', ok: 'Clear' }).then(y => { if (y) { Stats.reset(id); renderPathway(id); } });
});

/* ================= Settings ================= */
function renderSettings() {
  const s = Store.settings, mine = Store.data.presets;
  const opt = (key, opts) => seg('data-set', key, opts, s[key]);
  $('#view').innerHTML = `<div class="page settings">
    ${pageHead('Settings')}
    ${appearanceHTML()}
    <section class="card pad"><h2>Quiz defaults</h2><p class="muted">Used whenever a quiz doesn't set its own.</p>
      <div class="setup">
        <div class="set-row"><span class="glabel">Answer</span><div class="set-ctl">${opt('answer', [['type', 'Type'], ['along', 'Type along'], ['choice', 'Choice'], ['self', 'Self-check']])}</div></div>
        <div class="set-row"><span class="glabel">View</span><div class="set-ctl">${opt('view', [['flow', 'Flow'], ['list', 'List']])}${opt('dir', [['v', 'List top–bottom'], ['h', 'List left–right']])}</div></div>
        <div class="set-row"><span class="glabel">Zoom</span><div class="set-ctl">${opt('zoom', [['width', 'Fit width'], ['height', 'Fit height'], ['fit', 'Fit to frame']])}<label class="cb"><input type="checkbox" data-sflag="follow" ${s.follow ? 'checked' : ''}> Follow the current blank</label></div></div>
        <div class="set-row"><span class="glabel">During a quiz</span><div class="set-ctl"><label class="cb"><input type="checkbox" data-sflag="facts" ${s.facts ? 'checked' : ''}> Show facts after each answer</label><label class="cb"><input type="checkbox" data-sflag="autoAdvance" ${s.autoAdvance ? 'checked' : ''}> Full recall moves on after a right answer</label></div></div>
      </div></section>
    <section class="card pad"><h2>Your presets</h2>
      ${mine.length ? `<ul class="presetlist">${mine.map(p => `<li><div><b>${esc(p.name)}</b><span class="muted">${esc(quizSummary(normalizeQuiz(p)))}${p.pathways?.length ? ` · ${p.pathways.length} pathway${p.pathways.length > 1 ? 's' : ''}` : ''}</span></div>
        <div class="btnrow tight"><button class="btn small ghost" data-preset="rename" data-id="${esc(p.id)}">Rename</button><button class="btn small ghost" data-preset="delete" data-id="${esc(p.id)}">${mi('delete', 'sm')} Delete</button></div></li>`).join('')}</ul>`
        : '<p class="muted">None yet. On Home, set up a quiz and press Save as preset.</p>'}
    </section>
    <section class="card pad"><h2>Your data</h2>
      <p class="muted">${Store.mode === 'server' ? 'Saved on your Step 1 Pathways server, so every device sees the same pathways, presets and history.' : 'Saved in this browser only. Export a backup to move it to another device.'}</p>
      ${Store.mode === 'local' ? `<div class="autobk"><h3>Automatic backups</h3>
        ${AutoBackup.supported ? (AutoBackup.status === 'linked'
          ? `<p>${icon('ok')} Saving every change to <b>${esc(AutoBackup.fileName)}</b>${AutoBackup.savedAt ? `, last at ${new Date(AutoBackup.savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}.</p><div class="btnrow"><button class="btn small ghost" data-data="unlink">Stop and unlink the file</button></div>`
          : AutoBackup.status === 'off'
            ? `<p class="muted">Pick a file once and every change is saved to it automatically. Choose a synced folder (iCloud Drive, Dropbox, OneDrive) and your backup follows you across devices.</p><div class="btnrow"><button class="btn small primary" data-data="link">${mi('download', 'sm')} Link a backup file</button></div>`
            : `<p class="muted">Your browser needs permission again to save to <b>${esc(AutoBackup.fileName)}</b>.</p><div class="btnrow"><button class="btn small primary" data-data="reconnect">Reconnect</button><button class="btn small ghost" data-data="unlink">Unlink</button></div>`)
          : `<p class="muted">This browser can’t save to a file automatically (only Chrome and Edge can). Use the automatic download below instead, or open Step 1 Pathways in Chrome or Edge.</p>`}
        <label class="cb"><input type="checkbox" data-autodl ${autoDownloadOn() ? 'checked' : ''}> Download a backup automatically when I leave a quiz</label></div>` : ''}
      ${Store.mode === 'local' ? `<label class="cb"><input type="checkbox" data-remind ${local.get('pathways.remind') !== 'off' ? 'checked' : ''}> Remind me to back up when I open or leave Pathways</label>` : ''}
      <div class="btnrow"><button class="btn" data-data="export">${mi('download', 'sm')} Export backup</button><button class="btn" data-data="import">${mi('upload', 'sm')} Import backup</button><button class="btn ghost" data-data="resetstats">Clear all history…</button></div>
      <input type="file" id="backupFile" accept=".json,application/json" hidden>
    </section>
    <section class="card pad help"><h2>Help and feedback</h2>
      <p class="muted">A one-minute guided tour of the app. Spotted something wrong, confusing, or a fact that looks off? Report it.</p>
      <div class="btnrow"><button class="btn" data-tour-start>${mi('tour', 'sm')} Take the tour</button>${reportsEnabled() ? `<button class="btn" data-report="open">${mi('flag', 'sm')} Report a problem</button>` : ''}</div>
      <label class="cb"><input type="checkbox" id="tourNeverSetting" ${local.get('pathways.tourNever') ? '' : 'checked'}> Show the tour automatically when I open Pathways</label></section>
    <section class="card pad about"><h2>About</h2><p class="muted">Step 1 Pathways version ${APP_VERSION}${Store.mode === 'server' && isPreview() ? ' + unreleased changes' : ''}${Store.mode === 'server' ? ` · <a href="${PUBLIC_SITE}" target="_blank" rel="noopener">classmates’ version</a>` : ''}. Icons: Material Symbols.</p>
      <div class="btnrow"><button class="btn small" data-whatsnew>${mi('history', 'sm')} What’s new</button>${Store.mode === 'server' && isPreview() ? `<button class="btn small" data-preview>${mi('science', 'sm')} Not released yet</button>` : ''}</div></section>
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
   Shown when the tour ends (finished or skipped), or at boot if the tour doesn't run. There is no way past it except
   ticking "I understand" and pressing Continue. */
function dataGate() {
  return new Promise(res => {
    let d = $('#gateDialog');
    if (!d) { d = document.createElement('dialog'); d.id = 'gateDialog'; document.body.append(d); }
    const needData = !local.get('pathways.dataAck');
    const acks = [['gateAckAI', AI_ACK_LABEL, 'pathways.aiAck'], ['gateAckRisk', RISK_ACK_LABEL, 'pathways.riskAck']];
    const boxes = list => list.map(([id, label]) => `<label class="cb ack"><input type="checkbox" class="gate-req" id="${id}"> ${label}</label>`).join('');
    const aboutAI = `<section class="gate-ai" aria-labelledby="gaiH"><h3 id="gaiH">${mi('science', 'sm')} ${AI_NOTICE_TITLE}</h3>${AI_NOTICE_HTML}${boxes(acks)}</section>`;
    if (!needData) {
      // Accepted the storage notice before the content notices existed: just the boxes not ticked yet.
      const left = acks.filter(([, , key]) => !local.get(key));
      d.innerHTML = `<div class="dlg gate"><div class="dlg-h"><h2>${mi('science', 'h-ic')} ${AI_NOTICE_TITLE}</h2></div>
        <div class="ask-text">${AI_NOTICE_HTML}</div>
        ${boxes(left)}
        <div class="actions"><button type="button" class="btn primary" id="gateGo" disabled>Continue</button></div></div>`;
      d.oncancel = e => e.preventDefault();
      const reqs = [...d.querySelectorAll('.gate-req')], all = () => reqs.every(x => x.checked);
      reqs.forEach(x => { x.onchange = () => { d.querySelector('#gateGo').disabled = !all(); }; });
      d.querySelector('#gateGo').onclick = () => { if (!all()) return; left.forEach(([, , key]) => local.set(key, Date.now())); d.close(); res(); };
      return d.showModal();
    }
    d.innerHTML = `<div class="dlg gate">
      <div class="dlg-h"><h2>${mi('download', 'h-ic')} ${DATA_NOTICE_TITLE}</h2></div>
      <div class="ask-text">${DATA_NOTICE_HTML}</div>
      <section class="gate-backup" aria-labelledby="gbH"><h3 id="gbH">${mi('download', 'sm')} Set up your backup file now <span class="muted small">(recommended)</span></h3><div id="gateBackup"></div></section>
      <label class="cb ack"><input type="checkbox" class="gate-req" id="gateAck"> ${DATA_ACK_LABEL}</label>
      ${AutoBackup.supported ? '' : `<label class="cb ack"><input type="checkbox" class="gate-req" id="gateAckBrowser"> I understand that this browser can’t keep a backup file up to date for me, so I need to download backups myself (Chrome and Edge can do it automatically).</label>`}
      ${aboutAI}
      <div class="actions"><button type="button" class="btn primary" id="gateGo" disabled>Continue</button></div></div>`;
    // The backup step, written out click by click; it redraws itself after linking.
    const drawBackup = () => {
      const box = d.querySelector('#gateBackup');
      if (AutoBackup.supported) {
        box.innerHTML = AutoBackup.status === 'linked'
          ? `<p class="gate-ok">${icon('ok')} <span><b>Done.</b> Every change is saved to <b>${esc(AutoBackup.fileName)}</b>, in the folder you picked. To restore it on another computer or browser: Settings → Import backup → choose that file.</span></p>`
          : `<ol class="gate-steps"><li>Press <b>Choose backup file</b>.</li><li>In the window that opens, pick a folder you won’t clear out: <b>Documents</b>, <b>iCloud Drive</b> or <b>Dropbox</b>. Not Downloads.</li><li>Press <b>Save</b>. From then on, every change is saved to that file automatically.</li></ol>
            <div class="btnrow"><button type="button" class="btn" id="gateLink">${mi('download', 'sm')} Choose backup file</button><button type="button" class="btn ghost" id="gateDl">${mi('download', 'sm')} Just download a copy</button></div>`;
      } else {
        box.innerHTML = `<p>This browser can’t keep a file up to date by itself, so Step 1 Pathways downloads a fresh copy instead.</p>
          <label class="cb"><input type="checkbox" id="gateAutoDl" ${autoDownloadOn() ? 'checked' : ''}> Download a backup each time I leave a quiz</label>
          <ol class="gate-steps"><li>Backups arrive in your <b>Downloads</b> folder, named <b>step1-pathways-backup-</b> and the date.</li><li>Move them to a folder you won’t clear out: <b>Documents</b>, <b>iCloud Drive</b> or <b>Dropbox</b>.</li><li>To restore: Settings → Import backup → choose the newest file.</li></ol>
          <div class="btnrow"><button type="button" class="btn" id="gateDl">${mi('download', 'sm')} Download a backup now</button></div>`;
      }
      const link = box.querySelector('#gateLink'), dl = box.querySelector('#gateDl'), auto = box.querySelector('#gateAutoDl');
      if (link) link.onclick = () => AutoBackup.link().then(drawBackup);
      if (dl) dl.onclick = () => { downloadBackup(); toast('Saved to Downloads. Move it to a folder you keep.'); };
      if (auto) auto.onchange = () => local.set('pathways.autoDownload', auto.checked ? Date.now() : null);
    };
    drawBackup();
    d.oncancel = e => e.preventDefault(); // Esc can't dismiss it
    // Continue needs every box ticked: the notice, plus the browser limit where it applies.
    const allTicked = () => [...d.querySelectorAll('.gate-req')].every(x => x.checked);
    d.querySelectorAll('.gate-req').forEach(x => { x.onchange = () => { d.querySelector('#gateGo').disabled = !allTicked(); }; });
    d.querySelector('#gateGo').onclick = () => {
      if (!allTicked()) return;
      local.set('pathways.dataAck', Date.now()); local.set('pathways.aiAck', Date.now()); local.set('pathways.riskAck', Date.now());
      d.close(); res();
    };
    d.showModal();
  });
}
async function openingPrompt() {
  if (Store.mode !== 'local') return;
  if (isFresh()) {
    local.set('pathways.seen', Date.now());
    const v = await ask({ title: 'Welcome to Step 1 Pathways', text: 'Everything you do here is saved in this browser. If you’ve used Step 1 Pathways before and have a backup file, load it now to pick up where you left off.', ok: 'Start fresh', alt: 'Restore my backup', cancel: null });
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
  if (db.dataset.data === 'resetstats') startOver();
});
document.addEventListener('change', e => {
  if (e.target.id !== 'backupFile') return;
  e.target.files[0]?.text().then(async t => {
    let b; try { b = JSON.parse(t); } catch (err) { return say('Can’t read that file', err.message); }
    if (!b.pathwaysBackup) return say('Not a Step 1 Pathways backup', 'Use a file made with Download backup. To add a single pathway, use Import in the library.');
    if (!(await ask({ title: 'Replace your data with this backup?', text: `Saved ${b.savedAt ? new Date(b.savedAt).toLocaleString() : 'earlier'}. Your current pathways, presets, settings and history will be replaced.`, ok: 'Replace' }))) return;
    delete b.pathwaysBackup; delete b.savedAt;
    // Old backups are upgraded like saved data; one from a newer version can't be read safely by this one.
    const up = upgradeData(b, window.PATHWAYS_BUNDLE && window.PATHWAYS_BUNDLE.renames);
    if (up.newer) return say('Made by a newer version', 'This backup was saved by a newer version of Step 1 Pathways. Reload the page to update, then import it again.');
    Store.data = up.data;
    Store.save(); C.draft = null; route();
    say('Backup restored', 'Your pathways, presets and history are back.');
  });
});

// Data saved by a newer version (another tab or device updated first): nothing is written until the page reloads.
function onReadOnly() {
  if ($('#roBanner')) return;
  const b = document.createElement('div');
  b.id = 'roBanner'; b.className = 'ro-banner'; b.setAttribute('role', 'alert');
  b.innerHTML = `${mi('history', 'sm')}<span><b>A newer version saved your data.</b> To keep it safe, this page won’t save anything until you reload.</span><button class="btn small primary" onclick="location.reload()">Reload</button>`;
  document.body.prepend(b);
}

// Help (the ? in the bar): a small menu with the tour, what's new and the report form.
function setHelp(open) {
  const b = $('#helpBtn'), pop = $('#helpPop');
  if (!b || !pop) return;
  pop.hidden = !open; b.setAttribute('aria-expanded', String(open));
  if (open) pop.querySelector('button:not([hidden])')?.focus();
}
document.addEventListener('click', e => {
  if (e.target.closest('#helpBtn')) return setHelp($('#helpPop').hidden);
  if (!$('#helpPop')?.hidden && (!e.target.closest('#helpPop') || e.target.closest('#helpPop button'))) setHelp(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#helpPop')?.hidden) { setHelp(false); $('#helpBtn').focus(); } });

/* Clear all history: a true fresh start, as on a first visit (welcome, tour, the progress notice).
   Erases everything saved for this app here, except the Appearance choice. A linked backup file is disconnected
   first and left untouched, so the empty data never overwrites it. */
async function startOver() {
  const where = Store.mode === 'server' ? 'on your server' : 'in this browser';
  const v = await ask({ title: 'Clear all history and start over?', ok: 'Erase everything', alt: 'Download a backup first', cancel: 'Cancel',
    text: `This erases everything saved ${where}: answer history, activity, favorites, presets, tags, settings, and pathways you made or edited. Then Step 1 Pathways starts again as on your first visit, with the welcome and the tour.\n\nIt can’t be undone, except from a backup.` });
  if (v === 'alt') { downloadBackup(); return startOver(); }
  if (v !== true) return;
  await AutoBackup.unlink().catch(() => {});
  clearTimeout(Store.t);
  Store.readOnly = false;
  Store.data = upgradeData({}, window.PATHWAYS_BUNDLE && window.PATHWAYS_BUNDLE.renames).data;
  await Store.flush();
  try {
    const keep = new Set(['pathways.appearance', 'pathways.data']);
    Object.keys(localStorage).filter(k => k.startsWith('pathways.') && !keep.has(k)).forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {}
  location.hash = '#/';
  location.reload();
}

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
/* Breadcrumbs: the way you came through the Library (a tab, then things and pathways you clicked into). Opening a tab
   starts a new trail; going back to a page on it cuts the trail there. Kept for this browser tab. */
const TRAIL_KEY = 'pathways.trail';
const trail = () => { try { return JSON.parse(sessionStorage.getItem(TRAIL_KEY)) || []; } catch { return []; } };
const saveTrail = t => { try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(t)); } catch {} };
function trailVisit(h) {
  const tab = h === '#/pathways' || /^#\/library\/[a-z]+$/.test(h), page = /^#\/library\/[a-z]+\/.+/.test(h) || /^#\/pathways\/[^/]+$/.test(h);
  if (!tab && !page) return;
  if (tab) return saveTrail([{ h }]);
  const t = trail(), i = t.findIndex(x => x.h === h);
  saveTrail(i >= 0 ? t.slice(0, i + 1) : [...t, { h }].slice(-8));
}
function trailLabel(h) {
  const t = trail(), last = t[t.length - 1];
  if (!last || last.h !== h) return;
  const tab = CAT_TABS.find(x => h === '#/library/' + x[0]);
  last.t = h === '#/pathways' ? 'Library' : tab ? tab[1] : ($('#view h1')?.textContent || '').trim();
  saveTrail(t);
}
// Where you came from, ending just before this page; with no trail (a link from elsewhere), the usual way in.
function crumbsHTML(fallback) {
  const t = trail(), prev = t.slice(0, -1);
  let items = prev.length && t[t.length - 1]?.h === location.hash ? prev : fallback;
  if (items[0]?.h !== '#/pathways') items = [{ h: '#/pathways', t: 'Library' }, ...items];
  return `<nav class="crumbs" aria-label="Breadcrumbs">${items.map((x, i) => `${i ? '<span class="sep" aria-hidden="true">›</span>' : ''}<a href="${esc(x.h)}">${i ? '' : mi('arrow_back', 'sm')}${esc(x.t || '…')}</a>`).join('')}</nav>`;
}
function router() {
  const h = location.hash || '#/';
  trailVisit(h);
  let page = 'home', m;
  closeOpenDialogs();
  if (h === '#/' || h === '#' || h === '') renderDashboard();
  else if (h === '#/new') { page = 'new'; if (lastPage !== 'new') C.advOpen = false; renderCreate(); }
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
  else if ((m = h.match(/^#\/pathways\/([^/]+)\/edit\/(.+)$/))) { page = 'pathways'; openEditor(decodeURIComponent(m[1]), null, decodeURIComponent(m[2])); }
  else if ((m = h.match(/^#\/pathways\/([^/]+)$/))) { page = 'pathways'; renderPathway(decodeURIComponent(m[1])); }
  else if ((m = h.match(/^#\/library\/([a-z]+)$/))) { page = 'pathways'; renderCatalog(m[1]); }
  else if ((m = h.match(/^#\/library\/([a-z]+)\/(.+)$/))) { page = 'pathways'; renderCatItem(m[1], decodeURIComponent(m[2])); }
  else if (h === '#/settings') { page = 'settings'; renderSettings(); }
  else { location.replace('#/'); return; }
  document.body.dataset.page = page;
  trailLabel(h);
  if (lastPage === 'quiz' && page !== 'quiz' && !Tour.active) setTimeout(endOfSessionPrompt, 150);
  lastPage = page;
  $$('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === page ? 'page' : 'false'));
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
  previewBadge();
  $$('.nav a').forEach(a => { a.title = a.title || a.textContent.trim(); a.setAttribute('aria-label', a.textContent.trim()); }); // names survive icon-only widths
  if (reportsEnabled()) $('#helpReport').hidden = false;
  if (Store.readOnly) onReadOnly();
  // Ask the browser not to evict this site's storage (no prompt in most browsers; best effort).
  if (Store.mode === 'local' && navigator.storage?.persist) { try { Store.persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch {} }
  router();
  await openingPrompt();
  if (!maybeAutoTour() && needsDataAck()) await dataGate();
  if (!Tour.active) await announceUpdate(hadData); else local.set('pathways.seenVersion', APP_VERSION);
})();
