/* Version + changelog. While working, add notes to the { v: 'next' } entry at the top of CHANGELOG (create it
   if it's missing). ./release.sh turns it into the next version number with today's date and publishes.
   Each browser remembers the last version it saw; the first visit after an update shows "What's new"
   with every entry since then. Brand-new visitors get the tour instead.
   A copy built with a 'next' entry is a preview: the server copy shows a Preview badge listing what's coming. */
'use strict';

const APP_VERSION = '3.7.0';
const PUBLIC_SITE = 'https://chbarnhouse.github.io/step1-pathways/'; // the copy classmates use
const CHANGELOG = [
  { v: 'next', items: [
    'The guided tour now runs straight through; the note about where your progress is saved comes right after it (or right away if you skip the tour).',
    'Take the tour and Report a problem moved from the top bar to Settings → Help and feedback.',
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
    'Renamed to STEP 1 Pathways.',
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
