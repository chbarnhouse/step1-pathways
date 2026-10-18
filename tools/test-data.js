#!/usr/bin/env node
/* Will this version keep everyone's saved data? Run before every release (release.sh does).
   node tools/test-data.js              → checks; non-zero exit on any problem
   node tools/test-data.js --write-ids  → after a release: record today's ids as released (release.sh does this)

   1. Every file in tests/fixtures (saved data as older versions wrote it) upgrades without losing anything,
      and every pathway in it still draws. Fixtures are frozen: when the saved format changes, ADD a new one.
   2. Data from a newer version is refused, never rewritten.
   3. Every built-in pathway / metabolite / reaction id that has been released still exists, or is recorded in
      data/renames.json (renamed or retired). History, tags and favorites hang on those ids. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
global.window = {}; global.localStorage = { getItem: () => null, setItem() {} }; global.document = { addEventListener() {} };
const pathways = {};
for (const f of fs.readdirSync(path.join(root, 'data/pathways')).filter(f => f.endsWith('.json'))) { const p = read('data/pathways/' + f); pathways[p.id] = p; }
const renames = fs.existsSync(path.join(root, 'data/renames.json')) ? read('data/renames.json') : {};
window.PATHWAYS_BUNDLE = { cofactors: read('data/cofactors.json'), pathways, renames };
vm.runInThisContext(['util.js', 'store.js', 'model.js'].map(f => fs.readFileSync(path.join(root, 'static/js', f), 'utf8')).join('\n'));

let failed = 0;
const ok = msg => console.log('✓ ' + msg);
const bad = msg => { console.error('✗ ' + msg); failed++; };
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));
const sumN = s => Object.values(s || {}).reduce((a, p) => a + Object.values(p || {}).reduce((b, e) => b + (typeof e?.n === 'number' ? e.n : 0), 0), 0);
const IDS = path.join(root, 'tools/released-ids.json');
const idsNow = () => Object.fromEntries(Object.values(pathways).filter(p => !p.compose).map(p => [p.id, { metabolites: Object.keys(p.metabolites || {}).sort(), reactions: (p.reactions || []).map(r => r.id).sort() }]));

if (process.argv.includes('--write-ids')) {
  fs.writeFileSync(IDS, JSON.stringify({ _about: 'Ids released to users. Written by release.sh; do not edit by hand. Removing or renaming any of these needs data/renames.json.', ids: idsNow() }, null, 1) + '\n');
  console.log('wrote ' + path.relative(root, IDS));
  process.exit(0);
}

// ---- the migration chain itself
check(MIGRATIONS.length === SCHEMA, `migrations: one step per schema version (SCHEMA ${SCHEMA}, ${MIGRATIONS.length} steps)`);

// ---- fixtures
for (const f of fs.readdirSync(path.join(root, 'tests/fixtures')).filter(f => f.endsWith('.json')).sort()) {
  const raw = read('tests/fixtures/' + f).data, name = f.replace(/\.json$/, '');
  let up;
  try { up = upgradeData(JSON.parse(JSON.stringify(raw)), renames); } catch (e) { bad(`${name}: loading crashed: ${e.message}`); continue; }
  if ((Number(raw.schema) || 0) > SCHEMA) { check(up.newer && !up.data, `${name}: data from a newer version is left alone (read-only)`); continue; }
  const d = up.data;
  check(d.schema === SCHEMA, `${name}: upgraded to schema ${SCHEMA}`);
  const again = upgradeData(JSON.parse(JSON.stringify(d)), renames).data;
  check(JSON.stringify(again) === JSON.stringify(d), `${name}: loading twice changes nothing`);
  check(Object.keys(DEFAULT_SETTINGS).every(k => k in d.settings), `${name}: every setting has a value`);
  if (raw.settings && typeof raw.settings === 'object') check(Object.entries(raw.settings).every(([k, v]) => JSON.stringify(d.settings[k]) === JSON.stringify(v)), `${name}: your own settings are kept`);
  const validN = s => sumN(Object.fromEntries(Object.entries(s && typeof s === 'object' ? s : {}).filter(([, v]) => v && typeof v === 'object')));
  check(sumN(d.stats) === validN(raw.stats), `${name}: answer history kept (${sumN(d.stats)} answers)`);
  for (const k of ['presets', 'favorites', 'log']) if (Array.isArray(raw[k])) check(d[k].length === raw[k].filter(x => x && typeof x === 'object' && (k !== 'favorites' || x.d)).length, `${name}: ${k} kept (${d[k].length})`);
  if (raw.tags && !Array.isArray(raw.tags)) check(JSON.stringify(Object.keys(d.tags).sort()) === JSON.stringify(Object.keys(raw.tags).sort()), `${name}: tags kept`);
  // Every pathway the data refers to still draws with this version's model.
  Store.data = d;
  const refs = new Set([...Object.keys(d.custom), ...d.favorites.map(x => x.d.pathway).filter(Boolean)]);
  for (const id of refs) {
    const p = Library.get(id);
    if (!p) { bad(`${name}: refers to pathway "${id}", which no longer exists (add it to data/renames.json)`); continue; }
    try { buildModel(p); ok(`${name}: "${id}" still draws`); } catch (e) { bad(`${name}: "${id}" no longer draws: ${e.message}`); }
  }
}

// ---- renames move history (a made-up rename, checked on a copy of the typical fixture)
{
  const t = JSON.parse(JSON.stringify(read('tests/fixtures/v0-typical.json').data));
  const d = applyRenames(normalizeData(t), { pathways: { glycolysis: 'glycolysis-x' }, metabolites: { 'glycolysis-x': { glucose: 'glc' } }, reactions: { 'glycolysis-x': { r0: 'r0b' } } });
  check(d.stats['glycolysis-x']?.['m:glc'] && d.stats['glycolysis-x']['e:r0b'] && !d.stats.glycolysis, 'renames: history follows a renamed pathway, metabolite and reaction');
  check(d.favorites[0].d.pathway === 'glycolysis-x' && d.tags['glycolysis-x'] && d.log[0].pathways[0] === 'glycolysis-x', 'renames: favorites, tags and the activity log follow too');
}

// ---- released ids are still there (or accounted for)
if (!fs.existsSync(IDS)) bad('tools/released-ids.json is missing: run node tools/test-data.js --write-ids once');
else {
  const released = read('tools/released-ids.json').ids, now = idsNow(), R = renames, ret = R.retired || {};
  const gone = [];
  for (const [pid, ids] of Object.entries(released)) {
    const to = (R.pathways || {})[pid];
    if (!now[pid] && !(to && now[to]) && !(ret.pathways || []).includes(pid)) { gone.push(`pathway "${pid}"`); continue; }
    const cur = now[pid] || now[to];
    for (const [kind, list] of [['metabolites', ids.metabolites], ['reactions', ids.reactions]]) for (const id of list) {
      const ren = ((R[kind] || {})[to || pid] || {})[id] || ((R[kind] || {})[pid] || {})[id];
      if (!cur[kind].includes(id) && !(ren && cur[kind].includes(ren)) && !(((ret[kind] || {})[pid]) || []).includes(id)) gone.push(`${kind.slice(0, -1)} "${id}" in ${pid}`);
    }
  }
  if (gone.length) bad(`released ids are gone: ${gone.join(', ')}.\n  Users' history, tags and favorites point at these. Put each back, or record it in data/renames.json\n  (under pathways / metabolites / reactions as {"old": "new"}, or under retired if it was removed on purpose).`);
  else ok(`released ids: all ${Object.values(released).reduce((a, x) => a + 1 + x.metabolites.length + x.reactions.length, 0)} still there or recorded in renames.json`);
}

console.log(failed ? `\n${failed} problem${failed > 1 ? 's' : ''}: this version could break saved data. Fix before releasing.` : '\nSaved data is safe with this version.');
process.exitCode = failed ? 1 : 0;
