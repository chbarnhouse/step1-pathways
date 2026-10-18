/* Version + changelog. While working, add notes to the { v: 'next' } entry at the top of CHANGELOG (create it
   if it's missing). ./release.sh turns it into the next version number with today's date and publishes.
   Each browser remembers the last version it saw; the first visit after an update shows "What's new"
   with every entry since then. Brand-new visitors get the tour instead.
   A copy built with a 'next' entry is a preview: the server copy shows a Preview badge listing what's coming. */
'use strict';

const APP_VERSION = '3.8.1';
const PUBLIC_SITE = 'https://chbarnhouse.github.io/step1-pathways/'; // the copy classmates use
const CHANGELOG = [
  { v: 'next', items: [
    'Cofactors can be typed in any order, with letter checking and hints following the order you chose.',
    'More spellings count: an enzyme named after a metabolite accepts any of that metabolite’s names (ALA synthase, δ-ALA synthase, δ-aminolevulinic acid synthase, 5-aminolevulinate synthase), “-ic acid” or “-ate”, and Greek letters as symbols or words.',
  ] },
  { v: '3.8.1', date: '2026-10-18', items: [
    'Clear all history (Settings) now really starts over: everything saved here is erased, after an offer to download a backup first, and the app opens as on your first visit.',
  ] },
  { v: '3.8.0', date: '2026-10-18', items: [
    'Diagrams are now a canvas: drag to move around, pinch (or Ctrl/⌘ and scroll) to zoom. The typing box stays on its spot at any zoom, in every browser.',
    'Clearer compartments: each has its own tint with its name on a tab, membranes are dashed, and a step that happens somewhere else (glucose in the blood, pyruvate carboxylase in the mitochondria) gets its own labeled box.',
    'Blanks say what goes there: metabolite, enzyme, transporter, cofactors or compartment.',
    '“Give me a letter”: also press → at the end of your answer. The letter is filled in for you and never marked right or wrong. Check each letter now highlights right letters in green and wrong ones in red.',
    'In a quiz: step through the facts with Back and Next (or ← →), a progress bar, and the favorite star and edit pencil next to the title.',
    'New quiz: each mode explains how it works and what it’s best for, what to show, quiz or hide comes first, and answering options are under Advanced. Building blocks hides blanks you haven’t reached yet.',
    'Library and New quiz show each group as a row you can scroll sideways. Glycolysis and gluconeogenesis each have a “Study with…” button instead of a third, combined pathway.',
    'Share a pathway you built or edited: Share with classmates on its page. Approved pathways appear for everyone under Shared by classmates, with your name on them.',
    'A visual pathway editor: drag boxes, drag between boxes to add a step, and undo. Edited fields on a built-in pathway can each be reverted.',
    'Appearance in Settings: Auto, Light or Dark, with a choice of Default (blue) or Light, and Dark or Black.',
    'Your progress is protected across updates, and the first-visit notice walks you through setting up a backup file.',
    'Simpler top bar, with Settings and Help (tour, what’s new, report a problem) on the right, one typeface throughout, and every diagram checked so no labels overlap.',
  ] },
  { v: '3.7.0', date: '2026-10-17', items: [
    'Report a problem: describe a bug, a fact that looks wrong, or a suggestion from the Report button at the top. It opens a Google Form with your report filled in; sign in with Google and press Submit. Reports are private.',
  ] },
  { v: '3.6.0', date: '2026-10-17', items: [
    'Automatic backups. In Chrome or Edge, link a backup file in Settings and every change is saved to it. In any browser, turn on a backup download each time you leave a quiz.',
    'What’s new: after an update, this window shows what changed.',
  ] },
  { v: '3.5.0', date: '2026-10-17', items: [
    'A clear notice that progress is saved only in your browser, with an offer to back up when you leave a quiz.',
    'Pathways that can be studied together now say “combines with…”.',
  ] },
  { v: '3.4.0', date: '2026-10-17', items: [
    'Favorites: star any quiz to start it from the dashboard in one click.',
    'Renamed to Step 1 Pathways.',
  ] },
  { v: '3.3.0', date: '2026-10-17', items: [
    'Guided tour for first-time visitors (the Tour button brings it back).',
    'Activity log on the dashboard: what you studied, when, how, and how it went.',
    'The urea cycle shows which step happens in the mitochondria.',
  ] },
  { v: '3.2.0', date: '2026-10-17', items: [
    'Building blocks mode: one blank, then two, then three… from the top, until you can type the whole pathway.',
    'Compartments can be quizzed in every mode.',
    'Search, filter, sort and tag pathways.',
  ] },
];
const PENDING = CHANGELOG.filter(e => e.v === 'next'), RELEASED = CHANGELOG.filter(e => e.v !== 'next');
const isPreview = () => PENDING.some(e => e.items.length);
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function changelogHTML(entries) {
  return entries.map(e => `<div class="cl-entry"><div class="cl-h"><b>${e.v === 'next' ? 'Not released yet' : 'Version ' + esc(e.v)}</b><span class="muted small">${e.v === 'next' ? 'only on your copy' : new Date(e.date + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
    <ul>${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
}
function showChangelog(entries = RELEASED, title = 'What’s new') {
  return ask({ title, html: `<div class="changelog">${changelogHTML(entries)}</div>`, ok: 'Got it', cancel: null });
}
// Called once on boot (after the tour / data notice). hadData = this browser was used before versions existed.
async function announceUpdate(hadData) {
  const seen = local.get('pathways.seenVersion');
  local.set('pathways.seenVersion', APP_VERSION);
  if (!seen) { if (hadData) await showChangelog(RELEASED.slice(0, 1)); return; }
  const fresh = RELEASED.filter(e => cmpVer(e.v, seen) > 0);
  if (fresh.length) await showChangelog(fresh);
}
// The self-hosted copy runs whatever is on the dev branch; when that includes unreleased changes, say so.
function previewBadge() {
  const b = $('#previewBadge');
  if (!b) return;
  b.hidden = !(Store.mode === 'server' && isPreview());
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-preview]')) showChangelog(PENDING, 'Preview: not released yet');
  const c = e.target.closest('[data-copy-public]');
  if (c) navigator.clipboard.writeText(PUBLIC_SITE).then(() => toast('Link copied'), () => toast(PUBLIC_SITE));
});
