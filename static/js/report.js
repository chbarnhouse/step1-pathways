/* "Report a problem": a form for people who don't use GitHub. Diagnostics (version, browser, page, current quiz)
   are attached so a report can be reproduced. Where reports go is set by REPORT_ENDPOINT; until one is set
   the form stays hidden, so nobody fills in a form that can't be sent. */
'use strict';

const REPORT_ENDPOINT = ''; // POST JSON {kind, what, expected, steps, email, diagnostics}; set when a destination is chosen
const reportsEnabled = () => !!REPORT_ENDPOINT;

function diagnostics() {
  return {
    version: APP_VERSION, copy: Store.mode === 'server' ? 'self-hosted' : 'browser', page: location.hash || '#/',
    browser: navigator.userAgent, screen: `${window.innerWidth}×${window.innerHeight}`, time: new Date().toISOString(),
    quiz: Q.cfg ? { name: Q.cfg.name, pathways: Q.cfg.pathways, mode: Q.cfg.mode, answer: Q.cfg.answer || Store.settings.answer } : null,
  };
}
function openReport() {
  let d = $('#reportDialog');
  if (!d) { d = document.createElement('dialog'); d.id = 'reportDialog'; document.body.append(d); }
  const diag = diagnostics();
  d.innerHTML = `<form class="dlg report" id="reportForm">
    <div class="dlg-h"><h2>${mi('flag', 'h-ic')} Report a problem</h2></div>
    <p class="muted">Something wrong, confusing, or a fact that looks off? Tell us here; no account needed.</p>
    <label class="field">What kind<select name="kind"><option value="bug">Something isn’t working</option><option value="content">A fact or answer looks wrong</option><option value="idea">Suggestion</option></select></label>
    <label class="field">What happened<textarea name="what" rows="4" required placeholder="e.g. Typing “PFK-1” wasn’t accepted for phosphofructokinase"></textarea></label>
    <label class="field">What you expected (optional)<textarea name="expected" rows="2"></textarea></label>
    <label class="field">Your email, if you’d like a reply (optional)<input name="email" type="email" autocomplete="email"></label>
    <details class="diag"><summary>Technical details sent with the report</summary><pre>${esc(JSON.stringify(diag, null, 1))}</pre></details>
    <p class="bad-note" id="reportErr" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${mi('flag', 'sm')} Send report</button><button class="btn ghost" type="button" data-report="close">Cancel</button></div>
  </form>`;
  d.showModal();
  d.querySelector('textarea').focus();
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-report="open"]')) { e.preventDefault(); openReport(); }
  if (e.target.closest('[data-report="close"]')) $('#reportDialog')?.close();
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'reportForm') return;
  e.preventDefault();
  const f = e.target, data = Object.fromEntries(new FormData(f)), btn = f.querySelector('[type=submit]'), err = f.querySelector('#reportErr');
  btn.disabled = true; err.hidden = true;
  try {
    const r = await fetch(REPORT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, diagnostics: diagnostics() }) });
    if (!r.ok) throw new Error(`The report service answered ${r.status}.`);
    $('#reportDialog').close();
    toast('Thanks! Your report was sent.');
  } catch (x) {
    btn.disabled = false; err.hidden = false;
    err.textContent = `Couldn’t send the report (${x.message}). Check your connection and try again.`;
  }
});
