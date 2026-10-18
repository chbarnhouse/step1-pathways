/* "Report a problem": a form for people who don't use GitHub. The app gathers the report plus technical details
   (version, browser, page, current quiz), then opens the report Google Form in a new tab with everything filled in.
   The form collects verified emails, so the reporter signs in with Google there and presses Submit — a page on
   another site can't submit a sign-in-required form for them. With no form set, the Report button (Settings → Help and feedback) stays hidden. */
'use strict';

// The report Google Form ("STEP 1 Pathways Issue Report"); responses stay private in Google Forms/Sheets.
const REPORT_FORM = {
  url: 'https://docs.google.com/forms/d/e/1FAIpQLSepiSeEgCt3DFbUpAcP1SDRFRemRIC-EW31ITNkiqWm6Qp1zQ/viewform',
  kind: 'entry.1795629836', what: 'entry.1978413845', expected: 'entry.1823269642', date: 'entry.669806587', details: 'entry.1658303553',
};
const KIND_LABELS = { bug: 'Something isn’t working', content: 'A fact or answer looks wrong', idea: 'Suggestion' };
const reportsEnabled = () => !!REPORT_FORM.url;

/* ---------- Share a pathway with classmates (curated) ----------
   The pathway file is too big for a link, so: the app downloads it and opens the sharing Google Form with the
   rest filled in; the classmate attaches the file and submits. Each submission is reviewed; approved pathways ship in the
   library under "Shared by classmates", credited by display name (no accounts). Hidden until the form is set. */
const SHARE_FORM = {
  url: '', // The sharing Google Form ("STEP 1 Pathways — share a pathway"), …/viewform
  name: '', pathway: '', kind: '', note: '', // entry.NNN ids from a pre-filled link
};
const sharingEnabled = () => !!SHARE_FORM.url;
function openShare(id) {
  const p = Library.get(id), edit = Library.status(id) === 'edited';
  let d = $('#shareDialog');
  if (!d) { d = document.createElement('dialog'); d.id = 'shareDialog'; document.body.append(d); }
  d.innerHTML = `<form class="dlg report" id="shareForm">
    <div class="dlg-h"><h2>${mi('public', 'h-ic')} ${edit ? 'Suggest your changes' : 'Share with classmates'}</h2></div>
    <p class="muted">${edit ? `Your edits to <b>${esc(p.name)}</b> are sent for review, and may be added for everyone.` : `<b>${esc(p.name)}</b> is sent for review. Once approved, it appears in everyone’s library under <b>Shared by classmates</b>, with your name on it.`}</p>
    <label class="field">Your name, as shown to classmates<input name="name" required maxlength="40" value="${esc(local.get('pathways.displayName') || '')}" placeholder="e.g. Sam K."></label>
    <label class="field">Anything the reviewer should know (optional)<textarea name="note" rows="2" placeholder="${edit ? 'e.g. Fixed the cofactors of step 3' : 'e.g. Based on First Aid 2026, p. 82'}"></textarea></label>
    <ol class="gate-steps"><li>Press <b>Download and open the form</b>. The pathway file lands in your Downloads, and a Google Form opens with your name filled in.</li><li>In the form, sign in with Google, press <b>Add file</b> and choose <b>${esc((p.id || 'pathway') + '.json')}</b> from Downloads.</li><li>Press <b>Submit</b>.</li></ol>
    <div class="actions"><button class="btn primary" type="submit">${mi('download', 'sm')} Download and open the form</button><button class="btn ghost" type="button" data-share="close">Cancel</button></div>
  </form>`;
  d.showModal();
  d.querySelector('input[name=name]').focus();
}
document.addEventListener('click', e => { if (e.target.closest('[data-share="close"]')) $('#shareDialog')?.close(); });
document.addEventListener('submit', e => {
  if (e.target.id !== 'shareForm') return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target)), id = location.hash.match(/^#\/pathways\/([^/]+)/)?.[1], p = id && Library.get(decodeURIComponent(id));
  if (!p) return;
  local.set('pathways.displayName', v.name.trim());
  download((p.id || 'pathway') + '.json', JSON.stringify(p, null, 2));
  const q = new URLSearchParams({ usp: 'pp_url', [SHARE_FORM.name]: v.name.trim(), [SHARE_FORM.pathway]: p.name, [SHARE_FORM.kind]: Library.status(p.id) === 'edited' ? 'Changes to a built-in pathway' : 'A new pathway', [SHARE_FORM.note]: v.note || '' });
  window.open(`${SHARE_FORM.url}?${q}`, '_blank', 'noopener');
  $('#shareDialog').close();
  toast('Now attach the downloaded file in the Google Form and press Submit.');
});

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
    <p class="muted">Something wrong, confusing, or a fact that looks off? Describe it here. Next, a Google Form opens with your report filled in: sign in with Google and press Submit. Reports are private.</p>
    <label class="field">What kind<select name="kind"><option value="bug">Something isn’t working</option><option value="content">A fact or answer looks wrong</option><option value="idea">Suggestion</option></select></label>
    <label class="field">What happened<textarea name="what" rows="4" required placeholder="e.g. Typing “PFK-1” wasn’t accepted for phosphofructokinase"></textarea></label>
    <label class="field">What you expected (optional)<textarea name="expected" rows="2"></textarea></label>
    <details class="diag"><summary>Technical details sent with the report</summary><pre>${esc(JSON.stringify(diag, null, 1))}</pre></details>
    <div class="actions"><button class="btn primary" type="submit">${mi('flag', 'sm')} Continue to Google Forms</button><button class="btn ghost" type="button" data-report="close">Cancel</button></div>
  </form>`;
  d.showModal();
  d.querySelector('textarea').focus();
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-report="open"]')) { e.preventDefault(); openReport(); }
  if (e.target.closest('[data-report="close"]')) $('#reportDialog')?.close();
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'reportForm') return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  // Open the prefilled form; the reporter signs in and submits there. (Opened from the click, so pop-up blockers allow it.)
  const today = new Date(), ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const q = new URLSearchParams({ usp: 'pp_url', [REPORT_FORM.kind]: KIND_LABELS[data.kind] || KIND_LABELS.bug, [REPORT_FORM.what]: data.what || '',
    [REPORT_FORM.expected]: data.expected || '', [REPORT_FORM.date]: ymd, [REPORT_FORM.details]: 'Technical details: ' + JSON.stringify(diagnostics()) });
  window.open(`${REPORT_FORM.url}?${q}`, '_blank', 'noopener');
  $('#reportDialog').close();
  toast('Finish in the Google Forms tab: sign in and press Submit.');
});
