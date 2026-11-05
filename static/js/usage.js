/* Anonymous usage counts for the public copy, sent to Umami Cloud (no cookies, no accounts, no Umami script).
   Only the page visited and a few named events go out: never answers, scores, typed text or anything from a
   custom pathway. Nothing is sent until the visitor presses Accept, on any other host, or when the browser asks not to be tracked. */
'use strict';
const USAGE_SITE = '56616b77-2796-43d6-bce3-022db6f45a99'; // the Umami website ID
const USAGE_URL = 'https://gateway.umami.is/api/send';
const USAGE_HOST = 'chbarnhouse.github.io';

const usageApplies = () => !!USAGE_SITE && location.hostname === USAGE_HOST && Store.mode === 'local' && !navigator.globalPrivacyControl && navigator.doNotTrack !== '1';
const usageOn = () => usageApplies() && local.get('pathways.usage') === 'on';
const usagePathway = id => Library.status(id) === 'builtin' ? id : 'custom'; // a custom pathway's id can be its name

// Only these shapes leave the browser; anything else in the address is reported as /other.
function usagePath(h = location.hash || '#/') {
  let m;
  if (h === '#/' || h === '#' || h === '') return '/';
  if (['#/new', '#/quiz', '#/pathways', '#/map', '#/settings'].includes(h)) return h.slice(1);
  if ((m = h.match(/^#\/library\/([a-z]+)/))) return `/library/${m[1]}`;
  if (/^#\/pathways\/(new|new-combined|import)$/.test(h) || /^#\/pathways\/[^/]+\/edit/.test(h)) return '/pathways/edit';
  if ((m = h.match(/^#\/pathways\/([^/]+)$/))) return `/pathways/${usagePathway(decodeURIComponent(m[1]))}`;
  return '/other';
}
let usageLast = null;
function usageSend(name, data) {
  if (!usageOn()) return;
  const payload = { website: USAGE_SITE, hostname: USAGE_HOST, url: usagePath(), title: 'Step 1 Pathways', language: navigator.language, screen: `${screen.width}x${screen.height}` };
  if (name) Object.assign(payload, { name, data });
  else if (usageLast === null && document.referrer) { try { payload.referrer = new URL(document.referrer).origin; } catch {} }
  fetch(USAGE_URL, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'event', payload }) }).catch(() => {});
}
function usagePage() {
  const path = usagePath();
  if (!usageOn() || path === usageLast) return;
  usageSend();
  usageLast = path;
}
function usageChoose(on) {
  local.set('pathways.usage', on ? 'on' : 'off');
  $('#usageBanner')?.remove();
  usagePage();
}
// Accept and Reject carry equal weight, and the page stays usable until one is pressed.
function usageBanner() {
  if (!usageApplies() || local.get('pathways.usage') || $('#usageBanner')) return;
  const b = document.createElement('aside');
  b.id = 'usageBanner'; b.className = 'usagebar'; b.setAttribute('aria-label', 'Analytics choice');
  b.innerHTML = `<div class="usagebar-text"><b>Anonymous analytics</b>
    <p>Accept to send anonymous counts of the pages and quiz styles used here to Umami. No cookies, and never your answers, scores or typing. Change this any time in Settings → Your data.</p></div>
    <div class="btnrow"><button type="button" class="btn small" data-usagechoice="off">Reject</button><button type="button" class="btn small" data-usagechoice="on">Accept</button></div>`;
  document.body.append(b);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-usagechoice]');
  if (b) usageChoose(b.dataset.usagechoice === 'on');
});
