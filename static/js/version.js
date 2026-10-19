/* Version + changelog. While working, add notes to the { v: 'next' } entry at the top of CHANGELOG (create it
   if it's missing). ./release.sh turns it into the next version number with today's date and publishes.
   Each browser remembers the last version it saw; the first visit after an update shows "What's new"
   with every entry since then. Brand-new visitors get the tour instead.
   A copy built with a 'next' entry is a preview: the server copy shows a Preview badge listing what's coming. */
'use strict';

const APP_VERSION = '3.10.1';
const PUBLIC_SITE = 'https://chbarnhouse.github.io/step1-pathways/'; // the copy classmates use
const CHANGELOG = [
  { v: 'next', items: [
    'Two new pathways in a new group, Blood & immunity. Coagulation cascade: intrinsic (XII → XI → IX), extrinsic (tissue factor + VII) and common (X → thrombin → fibrin → cross-linked fibrin) pathways, with thrombin’s feedback on V, VIII and XIII; what needs Ca²⁺ and phospholipid; notes on PT/PTT, hemophilias, factor V Leiden, vitamin K and the anticoagulants. Complement cascade: classical, lectin and alternative pathways to the C3 and C5 convertases and the membrane attack complex, with C3a/C5a and the deficiencies (C1 inhibitor, C3, C5–C9, DAF/CD59).',
    'New way to study: Review. Every answer is shown on the diagram (connected pathways together, on one drawing) and nothing is asked; click anything for its facts. Show/Hide still works per kind. “Quiz me on this” switches to Fill the blanks on the same pathways, and reviews appear in Activity.',
    'Each metabolite, enzyme and cofactor page now shows it in its pathways: every pathway it’s in is drawn zoomed to its steps, with it outlined heavy and its name bold and underlined while the rest fades back (Study and Open pathway beside each). Above: At a glance (other names, where, rate-limiting, what it needs, cofactors, made by / used by, connected pathways, your answers) and notes. The full table of steps is one click away.',
    'Breadcrumbs: the Library pages and pathway pages show the way you came (Library › Enzymes › ALA synthase › …), each a link; going back trims it.',
    'The Metabolites, Enzymes and Cofactors tabs work like Pathways: rows by section (enzymes by kind, e.g. kinases, dehydrogenases, synthases; metabolites by pathway group; cofactors by what they do, e.g. vitamins, electron carriers, group carriers), a sort menu (in most pathways, weakest first, recently studied), and Kind, System, Pathway, Status and Tags filters. Tiles show your accuracy and body systems.',
    'Library tabs: Metabolites, Enzymes and Cofactors beside Pathways. Search any of them (other names count), and open one for a page of its own: its names, notes from each pathway, and every step it’s part of, with links to the pathway and to each enzyme, metabolite and cofactor. Metabolites show what makes them and what uses them; cofactors show where they go in, come out, or are needed (vitamins, one page per B-number).',
    'New quiz from the top bar (or the dashboard card) starts with no pathway picked, and says to select one; Clear all empties the picks. How you study stays as you left it. Every picked pathway’s tile is marked in the grid.',
    'New quiz: every pathway in the quiz is an equal pill (× takes it out). Below, Add a connected pathway suggests what links to all of them, most closely related first; gluconeogenesis appears there for glycolysis and turns on the combined view.',
    'The first-visit notice adds one more box to tick: the pathways were largely written with an AI model, so occasional errors are possible. If you already accepted the notice, you’ll see just this part once.',
    'Quiz connected pathways together on one diagram. In New quiz, under the pathway you picked, Connected pathways offers what links to it: pick Glycolysis, add TCA cycle, and β-oxidation, heme synthesis, the urea cycle and more become available. Each keeps its own layout; a molecule they share is one box; compartments are drawn once for the whole picture; the same molecule in two compartments (cytosolic and mitochondrial pyruvate) is joined by a transport arrow. Answers count toward each pathway on its own.',
    'Connected quizzes draw a molecule once even when it sits mid-pathway in both: in Glycolysis + gluconeogenesis with the TCA cycle, oxaloacetate is one box, with pyruvate carboxylase and PEP carboxykinase pointing into the TCA ring’s. Arrows between pathways no longer run along each other.',
    'Cycle arrows reach their boxes (the folate cycle’s left a gap), and a step’s full label (name, RATE-LIMITING, what it needs) is kept clear of the steps around it (glycolysis + gluconeogenesis: PEP carboxykinase’s GDP + CO₂ no longer sits on pyruvate carboxylase).',
    'Six new pathways: Methionine cycle (with transsulfuration to cysteine), Folate cycle (SHMT, thymidylate synthase, DHFR, MTHFR), Heme degradation (bilirubin, from macrophage to gut and urine), Purine salvage and degradation (HGPRT, APRT, ADA, xanthine oxidase), Sphingolipid degradation (the lysosomal storage diseases), and Eicosanoids (COX and 5-LOX).',
    'TCA cycle starts at pyruvate: pyruvate dehydrogenase (NAD⁺ + CoA → NADH + CO₂; needs TPP, lipoic acid and FAD) makes the acetyl-CoA that enters at citrate synthase.',
    'What a step needs is quizzed with the cofactors: with Cofactors set to Quiz, a “needs” blank sits under the enzyme. Any usual name counts (B6, vitamin B6, PLP, pyridoxal phosphate, pyridoxine; TPP or thiamine for B1), and several lock in one at a time in any order.',
    'Vitamins and other helpers a step needs show under its enzyme: “needs B6 (pyridoxal phosphate)” for ALA synthase, “needs Biotin (B7)” for the carboxylases, TPP, lipoic acid and FAD for pyruvate and α-ketoglutarate dehydrogenase (24 steps in 14 pathways).',
    'Cleaner cycle diagrams: side branches sit beside the ring instead of on top of it, and connectors route around boxes rather than through them.',
  ] },
  { v: '3.10.1', date: '2026-10-19', items: [
    'Steroidogenesis: cortisol ⇄ cortisone. 11β-HSD2 (kidney, colon, salivary glands, placenta; NAD⁺ → NADH) inactivates cortisol; 11β-HSD1 (liver, adipose, brain; NADPH → NADP⁺) reactivates it. Notes cover licorice and apparent mineralocorticoid excess.',
  ] },
  { v: '3.10.0', date: '2026-10-18', items: [
    'Diagrams use right-angle connectors instead of slanted lines: steps that cross a membrane go down, across and down; side steps and extra products turn at right angles into their boxes.',
    'Activity: every session (older ones too) has ▶ to run that quiz again and a star to add it to favorites.',
    'Library: applied filters are solid chips the same size as the filter menus; the sort menu matches the search bar; “combines with …” is now a link icon with the details on hover.',
    'Cleaner diagrams: glycogenolysis shows the debranching enzyme’s glucose in the cytosol (separate from the glucose glucose-6-phosphatase makes in the ER), gluconeogenesis runs mitochondria → cytosol → ER left to right, cholesterol synthesis no longer zigzags (mevalonate is cytosolic), side branches run down their own column (pyrimidines, purines, fatty acid synthesis), and labels keep clear of boxes, compartment regions and each other.',
    'Every pathway is tagged by body system (Fundamentals, Skin, MSK, Neuro, Cardio, Renal, Endo/Repro, Heme, GI) plus a few study tags (Fed state, Fasting, Energy, Storage, Amino acids, Drug targets, Vitamins). Filter the Library and New quiz by them; your own tags still work alongside.',
    'Library and New quiz filters are tidier: one menu each for Group, System, Status and Tags; what’s on shows as chips you can remove with ×.',
    'Pathways show where they connect to others: a dotted line to a tag like “→ TCA cycle” or “from Glycolysis”. On a pathway page, click the tag to open that pathway. In a quiz a tag appears once its box is answered.',
    'Activity on the dashboard: each session has ▶ to run that quiz again and a star to add it to your favorites.',
    'When a quiz is done, a summary pops up: your score, time, and anything to look at again, with Go again, Change settings (opens New quiz with this quiz loaded), Review facts, and the same quiz on any connected pathway.',
    'New pathway: VOMIT (propionyl-CoA → succinyl-CoA). Valine, Odd-chain fatty acids, Methionine, Isoleucine and Threonine feed propionyl-CoA; then propionyl-CoA carboxylase (biotin), methylmalonyl-CoA epimerase and methylmalonyl-CoA mutase (B12).',
  ] },
  { v: '3.9.0', date: '2026-10-18', items: [
    'New quiz: hover over Show, Quiz, Place or Hide to see what each one does.',
    'Compartments have a fourth choice, Place: no compartment colors or names; you click between steps wherever the pathway crosses a membrane, check, then name each part (“mito” counts as your name settings allow). In Fill the blanks it comes first; in Full recall and Building blocks, after you’ve rebuilt the pathway; on its own it’s the whole quiz. Steps that carry something across a membrane are marked as crossings for you.',
    'Cofactors: what goes in comes before what comes out (ATP, then ADP), but within each side any order counts (ATP and NADH, or NADH and ATP). Letter checking and hints follow the order you chose.',
    'New options under Advanced: submit right answers automatically (no Return needed, cofactors included), and show how many cofactors a step has (“1/2” while you type).',
    'Letter checking highlights runs of letters as one smooth band.',
    'Check each letter understands cofactors: any of a cofactor’s names counts (NAD or NAD⁺, Pi or phosphate), in any order within a side; it turns red only for a cofactor that doesn’t belong or comes too early.',
    'New option under Advanced: Require full names, so abbreviations like “Gly”, “PFK-1” or “mito” don’t count.',
    'On the diagram canvas, compartment colors and membranes reach the edges of the canvas, and the typing box blends into the shape you’re filling in.',
    'Cofactors can be separated any way you like, or not at all: “ATP, ADP”, “ATP ADP”, “ATP + ADP” and “ATPADP” all count.',
    'Dashboard: Favorites and Presets side by side. Clicking either opens New quiz with it loaded so you can adjust it first; ▶ on a favorite starts it right away.',
    'More spellings count: an enzyme named after a metabolite accepts any of that metabolite’s names (ALA synthase, δ-ALA synthase, δ-aminolevulinic acid synthase, 5-aminolevulinate synthase), “-ic acid” or “-ate”, and Greek letters as symbols or words.',
    'Every element now has full names and nicknames. The answer panel lists both (“Also called” and “Sometimes written as”), whatever your settings, and the editor has a field for each.',
    'New setting, Which names count: for full names (“δ-aminolevulinic acid synthase”), common abbreviations (“ALA synthase”, “mito”) and any abbreviation (“ALAS”, “PFK-1”), choose Auto-accept (counts as soon as it’s typed), On Enter, or Don’t accept. By default full names auto-accept and abbreviations count on Enter. A name that isn’t accepted isn’t a miss: you’re asked for a fuller one, with a button to enable abbreviations. This replaces Require full names and Submit automatically.',
    'Check each letter shows which kind of name you’re typing: green with a solid underline (counts by itself), gold with a dotted underline (counts on Enter), red with a wavy underline (not accepted, or a typo).',
    'Cofactors lock in one at a time: type “CoA” and it turns green (1/2) while you type the next; the blank is done when the last one is in. Backspace in an empty field takes the last one back.',
    'Cofactor blanks sit on the same curved arrow as the answers (in at the top, out at the bottom), and check marks no longer crowd compartment names or the arrow.',
    'A small “Right” or “Not quite” badge appears beside the blank you just answered, and in Building blocks a notice says when a round is done and the quiz goes back to the top.',
    'Show facts / Hide facts button in the bottom bar.',
    'Cofactors on sideways steps and steps across a membrane also get the curved arrow, bowing in toward the step.',
    '“Cytoplasm” checks letter by letter as a full name for the cytosol (it was already accepted), and “cyto” counts as a common abbreviation, like “mito”.',
    'Cofactors on one side of a step read as just the molecules: “→ H₂O” instead of “releases H₂O”, “ATP →” instead of “uses ATP”.',
    'With “Show how many cofactors there are” off, a step’s cofactors show as one blank until you say which arrow it has (in and out, in only, out only; keys 1–3). A wrong pick costs the first try.',
    'With Follow on, a button above it (eye icon) shows the whole pathway while you hold it; let go and you’re back where you were.',
    'Building blocks starts with the first two blanks (1, 2 · 1, 2, 3 · …), so the first one isn’t typed twice in a row.',
    'Cofactors that go in and cofactors that come out are now two separate blanks (“cofactors in → out”), each answered in any order.',
    'The answer panel no longer gives away what you haven’t answered yet (including cofactors and compartments mentioned in the notes): those parts are covered until you click them.',
    'Quiz top bar: Step back (undo the last answer, which is asked again and not counted twice) and Restart.',
    'Blank shapes on the diagram are filled white.',
    'Dashboard: Favorites fills its space beside Presets, and favorites can be renamed (pencil button).',
    'Canvas controls: labels appear when you hover over them; new Fit height; Fit all turns off Follow (so the whole diagram stays in view); clicking the zoom percentage returns to 100%.',
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
