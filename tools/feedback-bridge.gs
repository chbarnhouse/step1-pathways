/* Step 1 Pathways — feedback bridge (Google Apps Script).
   Lets YOUR server copy (step1-pathways.chbarnhouse.com) read the two form-response tabs and mark rows done.
   The public GitHub Pages copy never talks to it: it has no server.

   Setup (once): script.google.com → New project → paste this file → set TOKEN below to the token from Claude →
   Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → Deploy → authorize → copy the URL.
   Anyone without the token gets nothing back.

   GET  ?token=…                         → { ok, at, report: {total, open, recent[]}, share: {…} }
   POST {token, tab: 'report'|'share', row, done: true|false}  → the same, after setting (or clearing) that row's Done
   "Done" is a column the script adds to the right of each tab; it holds the date you marked the row done. */
const SHEET_ID = '1SAOQhz292xTqfYWBH2OWgPtDHTWEuoSWv0-L8tIwoOE'; // STEP 1 Pathways Issue Report (Responses)
const TOKEN = 'PASTE-TOKEN-HERE';
const TABS = { report: 'Issue Reporting', share: 'Pathway Shares' };
const RECENT = 25;

function doGet(e) {
  if (!allowed(e.parameter.token)) return json({ ok: false, error: 'denied' });
  return json(list());
}
function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json({ ok: false, error: 'bad json' }); }
  if (!allowed(b.token)) return json({ ok: false, error: 'denied' });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { mark(b.tab, Number(b.row), !!b.done); } finally { lock.releaseLock(); }
  return json(list());
}
const allowed = t => typeof t === 'string' && t.length > 10 && t === TOKEN;
const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const val = v => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v));

// The tab's header row, with a Done column added the first time it's needed.
function header(sh) {
  const w = Math.max(1, sh.getLastColumn()), head = sh.getRange(1, 1, 1, w).getValues()[0].map(String);
  let done = head.indexOf('Done');
  if (done < 0) { done = head.length; sh.getRange(1, done + 1).setValue('Done'); head.push('Done'); }
  return { head, done };
}
function list() {
  const ss = SpreadsheetApp.openById(SHEET_ID), out = { ok: true, at: new Date().toISOString() };
  for (const [k, name] of Object.entries(TABS)) {
    const sh = ss.getSheetByName(name);
    if (!sh) { out[k] = { total: 0, open: 0, recent: [], missing: true }; continue; }
    const { head, done } = header(sh), n = sh.getLastRow() - 1;
    const rows = n > 0 ? sh.getRange(2, 1, n, head.length).getValues() : [];
    const items = rows.map((r, i) => ({ row: i + 2, done: val(r[done]), fields: Object.fromEntries(head.map((h, j) => [h, val(r[j])]).filter(([h]) => h && h !== 'Done')) }))
      .filter(it => it.fields.Timestamp);
    out[k] = { total: items.length, open: items.filter(it => !it.done).length, recent: items.slice(-RECENT).reverse() };
  }
  return out;
}
function mark(tab, row, done) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TABS[tab]);
  if (!sh || !(row >= 2) || row > sh.getLastRow()) throw new Error('no such row');
  sh.getRange(row, header(sh).done + 1).setValue(done ? new Date() : '');
}
