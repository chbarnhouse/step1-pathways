/* Anonymous usage counts for the public copy, sent to Umami Cloud (no cookies, no accounts, no Umami script).
   Only the page visited and a few named events go out: never answers, scores, typed text or anything from a
   custom pathway. Nothing is sent on any other host, before the opening windows are dismissed, when switched off in
   Settings, or when the browser asks not to be tracked. */
'use strict';
const USAGE_SITE = '56616b77-2796-43d6-bce3-022db6f45a99'; // the Umami website ID
const USAGE_URL = 'https://gateway.umami.is/api/send';
const USAGE_HOST = 'chbarnhouse.github.io';
const USAGE_NOTICE = 'This site uses anonymous analytics. You can turn them off in Settings → Your data.';

const usageApplies = () => !!USAGE_SITE && location.hostname === USAGE_HOST && Store.mode === 'local' && !navigator.globalPrivacyControl && navigator.doNotTrack !== '1';
const usageAllowed = () => local.get('pathways.usage') !== 'off';
let usageReady = false;
const usageOn = () => usageReady && usageApplies() && usageAllowed();
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
  usagePage();
}
// Called once the opening windows are out of the way, so the statement in them is seen before anything is sent.
function usageStart() {
  usageReady = true;
  usagePage();
}
