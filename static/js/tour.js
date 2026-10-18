/* Guided tour: spotlights each part of the app in turn, across the dashboard, New quiz, a demo quiz, the library
   and Settings. Shown automatically on a visitor's first open of each session until they tick "Don't show the tour
   again" (on any step). Skip ends it for now. It can be retaken any time from Settings.
   In the static copy the required data notice comes after the tour ends, however it ends (finish, skip or Esc). */
'use strict';

const TOUR_NEVER = 'pathways.tourNever';
const Tour = { i: 0, active: false };
const TOUR_STEPS = [
  { route: '#/', title: 'Welcome to STEP 1 Pathways', text: 'A one-minute tour of where everything is. Skip it any time; you can take it again from Settings.' },
  { route: '#/', sel: '.hero-new', title: 'Start a quiz', text: 'New quiz is where you pick a pathway and how to study it.' },
  { route: '#/', sel: '.hero-resume', title: 'Pick up where you left off', text: 'Resume reopens your last quiz with the same settings.' },
  { route: '#/', sel: '.dash-cols .dash-card', title: 'Weak spots', text: 'Every answer you miss, reveal or need a hint for is tracked. “Drill these” runs a quiz on just those items.' },
  { route: '#/', sel: '.dash-cols .dash-card:last-child', title: 'Progress', text: 'How often you get each pathway right on the first try. Click a pathway to see its diagram, steps and weak spots.' },
  { route: '#/', sel: '.hero-data', title: 'Your data', text: () => Store.mode === 'server'
    ? 'This copy saves to your STEP 1 Pathways server, so every device sees the same progress.'
    : 'Everything is saved in this browser only. Back up now and then; restore the file in any browser to carry on.' },
  { route: '#/new', sel: '.browsebar', title: 'Find a pathway', text: 'Search by pathway, enzyme, metabolite or tag. Filters stack: pick groups, your tags and a status together. Sort by group, A–Z, weakest first or recently studied.' },
  { route: '#/new', sel: '#tiles', title: 'Pick one', text: 'Click a tile to choose it. A pathway that “combines with” another (glycolysis and gluconeogenesis) can be studied on its own or together with it.' },
  { route: '#/new', sel: '.modes', title: 'How to study', text: 'Fill the blanks hides one item at a time. Full recall rebuilds the pathway in order. Building blocks adds one blank per round, from the top, until you can type the whole thing. Single step drills one reaction from either side.' },
  { route: '#/new', sel: '[data-tour="answer"]', title: 'How to answer', text: 'Type the name (abbreviations count; a/alpha work for α), type along with a faint answer, pick from choices, or self-check. Typing can check each letter and offer “Give me a letter” hints.' },
  { route: '#/new', sel: '.adv', title: 'What to show, quiz or hide', text: 'Advanced lets you set metabolites, enzymes, transporters, cofactors and compartments to Show, Quiz or Hide.' },
  { route: '#/new', sel: '.side-foot', title: 'Start, or save a preset', text: 'Start the quiz. Save as preset keeps these settings to reuse with any pathway.' },
  { route: '#/quiz', before: () => { if (!$('#view .quiz')) { startQuiz({ ...QUIZ_DEFAULTS, name: 'Tour demo', pathways: ['glycolysis'], mode: 'single', answer: 'type' }); } },
    sel: '#stage', title: 'The diagram', text: 'Type straight into the orange box and press Enter. Click anything already showing to read about it. Compartments are shaded lanes with dashed membranes.' },
  { route: '#/quiz', sel: '.dock', title: 'The answer bar', text: 'Feedback, Reveal (or Esc) and Skip live here. The last answer’s facts stay open until your next answer.' },
  { route: '#/quiz', sel: '[data-act="facts"]', title: 'Facts', text: 'Opens a panel with the facts for everything you’ve answered in this quiz.' },
  { route: '#/quiz', sel: '.zoombar', title: 'Zoom and follow', text: 'Zoom in or out, fit the width or the whole diagram, and Follow keeps the current blank centered as you go.' },
  { route: '#/quiz', sel: '.qopts', title: 'Options', text: 'Change how you answer, the view (flow or list) and other settings without leaving the quiz.' },
  { route: '#/pathways', sel: '.library .page-h', title: 'Your library', text: 'Browse every pathway, add tags, edit any of them (built-ins keep a resettable copy), make your own, combine two, or import one someone shared.' },
  { route: '#/settings', sel: '.settings .card', title: 'Settings', text: 'Default answer style and view, your presets and backups. Take this tour again or report a problem from Help and feedback.' },
  { route: '#/', title: 'That’s it', text: 'Pick a pathway and start studying. Settings → Help and feedback brings this tour back, and has Report a problem for anything that looks wrong.' },
];

function tourEl() {
  let el = $('#tour');
  if (!el) { el = document.createElement('div'); el.id = 'tour'; document.body.append(el); }
  return el;
}
const waitMs = ms => new Promise(r => setTimeout(r, ms));
async function waitForSel(sel, tries = 20) { for (let i = 0; i < tries; i++) { const el = sel && $(sel); if (el) return el; await waitMs(60); } return null; }

async function showTourStep() {
  const step = TOUR_STEPS[Tour.i], n = TOUR_STEPS.length, last = Tour.i === n - 1;
  if (step.when && !step.when()) { Tour.i += Tour.dir || 1; return Tour.i >= 0 && Tour.i < n ? showTourStep() : endTour(); }
  step.before?.();
  if (step.route && location.hash !== step.route) { location.hash = step.route; await waitMs(220); }
  const target = await waitForSel(step.sel);
  if (step.sel && !target) { Tour.i += Tour.dir || 1; return Tour.i >= 0 && Tour.i < n ? showTourStep() : endTour(); } // e.g. no Resume card yet
  target?.scrollIntoView({ block: 'center', inline: 'nearest' });
  await waitMs(60);
  const never = !!local.get(TOUR_NEVER);
  const text = typeof step.text === 'function' ? step.text() : step.text;
  const el = tourEl();
  el.innerHTML = `<div class="tour-block"></div>${target ? '<div class="tour-spot"></div>' : '<div class="tour-dim"></div>'}
    <div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="tour-count">${Tour.i + 1} of ${n}</div>
      <h2 id="tourTitle">${esc(step.title)}</h2>
      <p>${esc(text)}</p>
      <div class="tour-foot">
        <label class="cb"><input type="checkbox" id="tourNever" ${never ? 'checked' : ''}> Don’t show the tour again</label>
        <span class="btnrow tight">
          ${last ? '' : '<button class="btn ghost small" data-tour-act="skip">Skip tour</button>'}
          ${Tour.i ? '<button class="btn small" data-tour-act="back">Back</button>' : ''}
          <button class="btn primary small" data-tour-act="next">${last ? 'Finish' : `Next ${mi('arrow_forward', 'sm')}`}</button>
        </span>
      </div>
    </div>`;
  placeTour(target);
  el.querySelector('[data-tour-act="next"]').focus({ preventScroll: true });
}
// Spotlight the target and put the card below it (or above, or centered when it's huge).
function placeTour(target) {
  const el = $('#tour'), pop = el?.querySelector('.tour-pop'), spot = el?.querySelector('.tour-spot');
  if (!pop) return;
  const vw = window.innerWidth, vh = window.innerHeight, pw = pop.offsetWidth, ph = pop.offsetHeight, pad = 8;
  if (!target || !spot) { pop.style.left = (vw - pw) / 2 + 'px'; pop.style.top = Math.max(16, (vh - ph) / 2) + 'px'; return; }
  const r = target.getBoundingClientRect();
  const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad), bottom = Math.min(vh - 4, r.bottom + pad), right = Math.min(vw - 4, r.right + pad);
  Object.assign(spot.style, { top: top + 'px', left: left + 'px', width: right - left + 'px', height: bottom - top + 'px' });
  let y = bottom + 12;
  if (y + ph > vh - 12) y = top - 12 - ph;
  if (y < 12) y = Math.max(12, vh - ph - 16); // huge target: sit at the bottom of the screen
  const x = Math.min(Math.max(12, left), vw - pw - 12);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
function startTour() {
  Tour.active = true; Tour.i = 0; Tour.dir = 1;
  try { sessionStorage.setItem('pathways.tourShown', '1'); } catch {}
  showTourStep();
}
function endTour() {
  const nv = $('#tourNever');
  if (nv) local.set(TOUR_NEVER, nv.checked ? Date.now() : null);
  Tour.active = false;
  $('#tour')?.remove();
  if (location.hash === '#/quiz' && Q.cfg?.name === 'Tour demo') location.hash = '#/';
  if (needsDataAck()) dataGate();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tour-act]');
  if (b) {
    const a = b.dataset.tourAct;
    if (a === 'skip' || (a === 'next' && Tour.i === TOUR_STEPS.length - 1)) return endTour();
    Tour.dir = a === 'back' ? -1 : 1;
    Tour.i += Tour.dir;
    return showTourStep();
  }
  if (e.target.closest('[data-tour-start]')) { e.preventDefault(); startTour(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'tourNever') local.set(TOUR_NEVER, e.target.checked ? Date.now() : null);
});
document.addEventListener('keydown', e => {
  if (!Tour.active || !$('#tour')) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endTour(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); const b = $('[data-tour-act="next"]'); if (b && !b.disabled) b.click(); }
  else if (e.key === 'ArrowLeft' && Tour.i) { e.preventDefault(); e.stopImmediatePropagation(); $('[data-tour-act="back"]')?.click(); }
}, true);
window.addEventListener('resize', () => { if (Tour.active) placeTour(TOUR_STEPS[Tour.i].sel && $(TOUR_STEPS[Tour.i].sel)); });
// First open of a session, unless they've opted out (and never mid-quiz or mid-edit).
// Returns true when the tour started (the data notice follows when it ends); otherwise boot shows the notice on its own.
function maybeAutoTour() {
  if (local.get(TOUR_NEVER)) return false;
  try { if (sessionStorage.getItem('pathways.tourShown')) return false; } catch {}
  if (!['', '#', '#/', '#/new'].includes(location.hash)) return false;
  startTour();
  return true;
}
