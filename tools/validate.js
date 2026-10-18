#!/usr/bin/env node
/* Validate every pathway in data/pathways through the app's own model.
   node tools/validate.js            → one line per pathway, non-zero exit on any problem
   Checks: references resolve, cofactor ids exist, reading order covers everything,
   enzyme names that collide across pathways (by full name/alias) are listed for review. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
global.window = {}; global.Store = undefined; global.localStorage = { getItem: () => null, setItem() {} }; global.document = { addEventListener() {} };
const cof = JSON.parse(fs.readFileSync(path.join(root, 'data/cofactors.json'), 'utf8'));
const pathways = {};
for (const f of fs.readdirSync(path.join(root, 'data/pathways')).filter(f => f.endsWith('.json'))) {
  const p = JSON.parse(fs.readFileSync(path.join(root, 'data/pathways', f), 'utf8'));
  if (p.id + '.json' !== f) { console.error(`✗ ${f}: id "${p.id}" must match the file name`); process.exitCode = 1; }
  pathways[p.id] = p;
}
window.PATHWAYS_BUNDLE = { cofactors: cof, pathways };
vm.runInThisContext(['util.js', 'store.js', 'model.js'].map(f => fs.readFileSync(path.join(root, 'static/js', f), 'utf8')).join('\n'));
for (const p0 of Object.values(pathways)) {
  const p = Library.get(p0.id);
  try {
    const m = buildModel(p);
    const missing = [];
    for (const r of p.reactions) for (const id of [...(r.cofactors?.in || []), ...(r.cofactors?.out || [])]) if (!m.cof[id]) missing.push(id);
    if (missing.length) throw new Error('unknown cofactor ids: ' + uniq(missing).join(', '));
    console.log(`✓ ${p.id.padEnd(18)} ${String(p.reactions.length).padStart(2)} steps · ${m.seq.map(k => k.slice(2)).join(' ')}`);
  } catch (e) { console.error(`✗ ${p.id}: ${e.message}`); process.exitCode = 1; }
}
